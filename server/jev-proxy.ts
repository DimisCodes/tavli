/**
 * Server-side proxy for the Jev System One API.
 *
 * The browser bundle only ever calls the relative path /api/jev/systemone. The OpenRouter
 * key is read from the environment here and never leaves the server, so nothing secret is
 * shipped to the client.
 *
 * Hiding the key is only half the job. Once this endpoint is public anyone can call it and
 * spend your credits, so the handler also pins the model, caps the request size and shape,
 * and applies a best-effort per-IP rate limit. None of that is a hard guarantee. The hard
 * guarantee is a spending cap on the OpenRouter key itself; see DEPLOY.md.
 */

export const JEV_MODEL = '~typesafe/jev-latest';
export const UPSTREAM = 'https://openrouter.ai/api/v1/systemone';

/** Generous next to the ~4 KB the app actually sends, tight enough to stop token burning. */
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_QUESTIONS = 8;
export const MAX_CHOICE_OPTIONS = 40;
export const MAX_SCORE_LEVELS = 10;

export const RATE_LIMIT_REQUESTS = 40;
export const RATE_LIMIT_WINDOW_MS = 60_000;

export interface ProxyEnv {
  /** OpenRouter key. Absent means the endpoint reports itself unconfigured. */
  OPENROUTER_API_KEY?: string;
  /** Optional comma-separated origin allowlist, e.g. "https://tavli.dimi.diy". */
  ALLOWED_ORIGINS?: string;
  /** Sent to OpenRouter for attribution in its dashboards. */
  SITE_URL?: string;
}

export interface HandlerOptions {
  /** Injected in tests so the hardening can be checked without network access. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const fail = (status: number, message: string) => json(status, { error: { message, code: status } });

/**
 * Best-effort rate limit. Serverless instances are recycled and requests may land on
 * different ones, so this thins out casual abuse rather than preventing it.
 */
const hits = new Map<string, number[]>();

export function rateLimited(ip: string, now: number): boolean {
  const window = hits.get(ip)?.filter((t) => now - t < RATE_LIMIT_WINDOW_MS) ?? [];
  window.push(now);
  hits.set(ip, window);
  if (hits.size > 5000) hits.clear();
  return window.length > RATE_LIMIT_REQUESTS;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-real-ip') ?? 'unknown';
}

function originAllowed(request: Request, env: ProxyEnv): boolean {
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  const origin = request.headers.get('origin');
  // Same-origin browser requests may omit Origin; curl can forge it. This stops embedding,
  // not a determined caller.
  if (!origin) return true;
  return allowed.includes(origin);
}

type Unknown = Record<string, unknown>;

/** Reject anything that is not the small, fixed request shape this app sends. */
export function validateBody(body: unknown): { ok: true; value: Unknown } | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, message: 'Body must be a JSON object' };
  }
  const b = body as Unknown;
  if (b.state === undefined) return { ok: false, message: 'Missing "state"' };

  const questions = b.questions;
  if (typeof questions !== 'object' || questions === null || Array.isArray(questions)) {
    return { ok: false, message: 'Missing "questions" object' };
  }
  const entries = Object.entries(questions as Unknown);
  if (entries.length === 0) return { ok: false, message: 'At least one question is required' };
  if (entries.length > MAX_QUESTIONS) return { ok: false, message: `At most ${MAX_QUESTIONS} questions` };

  for (const [id, raw] of entries) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { ok: false, message: `Question "${id}" must be an object` };
    }
    const q = raw as Unknown;
    if (q.type !== 'choice' && q.type !== 'score' && q.type !== 'noul') {
      return { ok: false, message: `Question "${id}" has an unsupported type` };
    }
    if (q.instructions === undefined) return { ok: false, message: `Question "${id}" needs instructions` };
    if (q.type === 'choice') {
      const c = q.criteria;
      if (typeof c !== 'object' || c === null || Array.isArray(c)) {
        return { ok: false, message: `Choice "${id}" needs a criteria object` };
      }
      if (Object.keys(c as Unknown).length > MAX_CHOICE_OPTIONS) {
        return { ok: false, message: `Choice "${id}" exceeds ${MAX_CHOICE_OPTIONS} options` };
      }
    }
    if (q.type === 'score') {
      if (!Array.isArray(q.criteria) || q.criteria.length < 2) {
        return { ok: false, message: `Score "${id}" needs an array of at least 2 levels` };
      }
      if (q.criteria.length > MAX_SCORE_LEVELS) {
        return { ok: false, message: `Score "${id}" exceeds ${MAX_SCORE_LEVELS} levels` };
      }
    }
  }
  // The model is pinned server-side, so a caller cannot redirect this key at an expensive one.
  return { ok: true, value: { ...b, model: JEV_MODEL } };
}

export async function handleJev(request: Request, env: ProxyEnv, opts: HandlerOptions = {}): Promise<Response> {
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;

  if (request.method !== 'POST') return fail(405, 'Method not allowed');

  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  if (!path.endsWith('/systemone')) return fail(404, 'Not found');

  if (!originAllowed(request, env)) return fail(403, 'Origin not allowed');

  const key = env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    // The app treats this as Jev being unavailable and falls back to its own evaluation.
    return fail(503, 'Jev is not configured on this deployment');
  }

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return fail(413, 'Request too large');

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return fail(413, 'Request too large');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail(400, 'Body must be valid JSON');
  }

  const checked = validateBody(parsed);
  if (!checked.ok) return fail(400, checked.message);

  if (rateLimited(clientIp(request), now())) {
    return new Response(
      JSON.stringify({ error: { message: 'Too many requests, slow down', code: 429 } }),
      { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '30' } },
    );
  }

  let upstream: Response;
  try {
    upstream = await doFetch(UPSTREAM, {
      method: 'POST',
      headers: {
        // Only headers we control are forwarded; nothing from the client is passed through.
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'HTTP-Referer': env.SITE_URL ?? 'https://github.com',
        'X-Title': 'Tavli',
      },
      body: JSON.stringify(checked.value),
    });
  } catch {
    return fail(502, 'Could not reach Jev');
  }

  const payload = await upstream.text();
  if (!upstream.ok) {
    // Upstream errors can mention account state, so only the status is surfaced.
    return fail(upstream.status === 429 ? 429 : 502, `Jev request failed (${upstream.status})`);
  }
  return new Response(payload, {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
