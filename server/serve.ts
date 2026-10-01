import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { handleJev, type ProxyEnv } from './jev-proxy';

/**
 * Production server for container hosts such as Coolify, Fly or a plain VPS.
 *
 * It serves the static build and mounts the same proxy handler the serverless adapters use,
 * so the OpenRouter key is read from the environment here and never reaches the browser.
 * No dependencies beyond Node itself.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = path.resolve(process.cwd(), process.env.STATIC_DIR ?? 'dist');

const env: ProxyEnv = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  SITE_URL: process.env.SITE_URL,
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** Node gives a stream; the shared handler wants a web Request. */
async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(','));
  }
  const host = req.headers.host ?? `localhost:${PORT}`;
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
  return new Request(`${proto}://${host}${req.url ?? '/'}`, {
    method: req.method ?? 'GET',
    headers,
    body: body.length ? body : undefined,
  });
}

async function sendFile(res: ServerResponse, filePath: string, status = 200): Promise<boolean> {
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    // Hashed asset filenames are safe to cache hard; everything else must revalidate.
    const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(status, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

      if (url.pathname.startsWith('/api/jev')) {
        const response = await handleJev(await toRequest(req), env);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }

      if (url.pathname === '/healthz') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, jev: Boolean(env.OPENROUTER_API_KEY) }));
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end('Method not allowed');
        return;
      }

      // Resolve inside ROOT only, so an encoded ../ cannot escape the build directory.
      // The separator matters: a bare startsWith would let "dist" match "dist-server".
      const requested = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
      if (requested !== ROOT && !requested.startsWith(ROOT + path.sep)) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      const target = url.pathname.endsWith('/') ? path.join(requested, 'index.html') : requested;
      if (await sendFile(res, target)) return;
      // Single page app: unknown paths fall back to the entry document.
      if (await sendFile(res, path.join(ROOT, 'index.html'))) return;
      res.writeHead(404).end('Not found');
    } catch (error) {
      console.error('[tavli] request failed', error);
      if (!res.headersSent) res.writeHead(500);
      res.end('Internal server error');
    }
  })();
});

server.listen(PORT, () => {
  console.log(`[tavli] serving ${ROOT} on :${PORT}`);
  if (!env.OPENROUTER_API_KEY) {
    console.warn('[tavli] OPENROUTER_API_KEY is not set. Jev turns will use the offline fallback.');
  }
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
