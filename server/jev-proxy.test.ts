import { describe, expect, it, vi } from 'vitest';
import { handleJev, JEV_MODEL, MAX_BODY_BYTES, validateBody } from './jev-proxy';

const env = { OPENROUTER_API_KEY: 'sk-or-test-key' };

const goodBody = () => ({
  model: JEV_MODEL,
  state: { position: 'whatever' },
  questions: {
    best_play: { type: 'choice', instructions: 'pick', criteria: { A: null, B: null } },
    risk: { type: 'score', instructions: 'how risky', criteria: ['low', 'high'] },
    double: { type: 'noul', instructions: 'double?' },
  },
});

const post = (body: unknown, init: RequestInit = {}) =>
  new Request('https://example.com/api/jev/systemone', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });

/** Records what was sent upstream so the pinned model and headers can be asserted. */
function spyFetch(response: unknown = { answers: {}, usage: {} }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(response), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('jev proxy', () => {
  it('forwards a valid request and returns the upstream body', async () => {
    const { impl, calls } = spyFetch({ answers: { best_play: { choice: 'A' } }, usage: { cost: 1 } });
    const res = await handleJev(post(goodBody()), env, { fetchImpl: impl });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ answers: { best_play: { choice: 'A' } } });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('openrouter.ai');
  });

  it('never lets the client choose the model', async () => {
    const { impl, calls } = spyFetch();
    await handleJev(post({ ...goodBody(), model: 'openai/gpt-5-ultra-expensive' }), env, { fetchImpl: impl });
    expect(JSON.parse(String(calls[0].init.body)).model).toBe(JEV_MODEL);
  });

  it('sends the key from the environment and forwards no client headers', async () => {
    const { impl, calls } = spyFetch();
    const req = post(goodBody(), { headers: { 'content-type': 'application/json', authorization: 'Bearer stolen', cookie: 'a=b' } });
    await handleJev(req, env, { fetchImpl: impl });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-or-test-key');
    expect(headers.cookie).toBeUndefined();
  });

  it('reports itself unconfigured instead of calling upstream when no key is set', async () => {
    const { impl, calls } = spyFetch();
    const res = await handleJev(post(goodBody()), {}, { fetchImpl: impl });
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('rejects non-POST and unknown paths', async () => {
    const { impl } = spyFetch();
    const get = new Request('https://example.com/api/jev/systemone', { method: 'GET' });
    expect((await handleJev(get, env, { fetchImpl: impl })).status).toBe(405);
    const wrong = new Request('https://example.com/api/jev/chat', { method: 'POST', body: '{}' });
    expect((await handleJev(wrong, env, { fetchImpl: impl })).status).toBe(404);
  });

  it('rejects oversized bodies before calling upstream', async () => {
    const { impl, calls } = spyFetch();
    const huge = JSON.stringify({ ...goodBody(), pad: 'x'.repeat(MAX_BODY_BYTES) });
    const res = await handleJev(post(huge), env, { fetchImpl: impl });
    expect(res.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it('enforces the origin allowlist when one is configured', async () => {
    const { impl } = spyFetch();
    const locked = { ...env, ALLOWED_ORIGINS: 'https://mysite.example' };
    const bad = post(goodBody(), { headers: { 'content-type': 'application/json', origin: 'https://evil.example' } });
    expect((await handleJev(bad, locked, { fetchImpl: impl })).status).toBe(403);
    const ok = post(goodBody(), { headers: { 'content-type': 'application/json', origin: 'https://mysite.example' } });
    expect((await handleJev(ok, locked, { fetchImpl: impl })).status).toBe(200);
  });

  it('rate limits a single caller', async () => {
    const { impl } = spyFetch();
    const ip = { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9' };
    let last = 200;
    for (let i = 0; i < 60; i++) {
      last = (await handleJev(post(goodBody(), { headers: ip }), env, { fetchImpl: impl, now: () => 1_000 })).status;
    }
    expect(last).toBe(429);
  });

  it('retries a transient upstream failure and succeeds', async () => {
    // Production hit a one-off 520 from the edge in front of OpenRouter.
    let calls = 0;
    const impl = vi.fn(async () => {
      calls++;
      return calls === 1
        ? new Response('bad gateway', { status: 520 })
        : new Response(JSON.stringify({ answers: { q: { noul: 0.5 } }, usage: {} }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await handleJev(post(goodBody()), env, { fetchImpl: impl, sleep: async () => {} });
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  it('retries a network failure', async () => {
    let calls = 0;
    const impl = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error('ECONNRESET');
      return new Response(JSON.stringify({ answers: {}, usage: {} }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await handleJev(post(goodBody()), env, { fetchImpl: impl, sleep: async () => {} });
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
  });

  it('gives up after the attempt limit and reports the last status', async () => {
    let calls = 0;
    const impl = vi.fn(async () => {
      calls++;
      return new Response('overloaded', { status: 529 });
    }) as unknown as typeof fetch;
    const res = await handleJev(post(goodBody()), env, { fetchImpl: impl, sleep: async () => {} });
    expect(res.status).toBe(502);
    expect(calls).toBe(3);
  });

  it('does not retry a non-transient upstream error', async () => {
    let calls = 0;
    const impl = vi.fn(async () => {
      calls++;
      return new Response('unauthorized', { status: 401 });
    }) as unknown as typeof fetch;
    await handleJev(post(goodBody()), env, { fetchImpl: impl, sleep: async () => {} });
    expect(calls).toBe(1);
  });

  it('does not leak upstream error detail', async () => {
    const impl = vi.fn(async () => new Response('account suspended, balance -5.00', { status: 402 })) as unknown as typeof fetch;
    const res = await handleJev(post(goodBody()), env, { fetchImpl: impl });
    const body = await res.text();
    expect(body).not.toContain('balance');
    expect(body).not.toContain('suspended');
  });
});

describe('request validation', () => {
  it('accepts the shape the app sends', () => {
    expect(validateBody(goodBody()).ok).toBe(true);
  });

  it.each([
    ['not an object', 'nope'],
    ['missing state', { questions: { a: { type: 'noul', instructions: 'x' } } }],
    ['missing questions', { state: {} }],
    ['empty questions', { state: {}, questions: {} }],
    ['unsupported question type', { state: {}, questions: { a: { type: 'essay', instructions: 'x' } } }],
    ['choice without criteria', { state: {}, questions: { a: { type: 'choice', instructions: 'x' } } }],
    ['score with one level', { state: {}, questions: { a: { type: 'score', instructions: 'x', criteria: ['only'] } } }],
  ])('rejects %s', (_label, body) => {
    expect(validateBody(body).ok).toBe(false);
  });

  it('rejects too many questions and oversized option lists', () => {
    const many = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`q${i}`, { type: 'noul', instructions: 'x' }]),
    );
    expect(validateBody({ state: {}, questions: many }).ok).toBe(false);

    const wide = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`o${i}`, null]));
    expect(
      validateBody({ state: {}, questions: { a: { type: 'choice', instructions: 'x', criteria: wide } } }).ok,
    ).toBe(false);
  });
});
