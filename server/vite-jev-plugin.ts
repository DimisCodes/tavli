import fs from 'node:fs';
import path from 'node:path';
import type { Connect, Plugin, ViteDevServer, PreviewServer } from 'vite';
import { handleJev, type ProxyEnv } from './jev-proxy.ts';

/**
 * Mounts the production proxy handler on the dev and preview servers, so local development
 * exercises exactly the same validation, model pinning and rate limiting as a deployment.
 */
function readEnv(mode: string, loadEnv: (m: string, d: string, p: string) => Record<string, string>): ProxyEnv {
  const env = loadEnv(mode, process.cwd(), '');
  const file = path.resolve(process.cwd(), 'openrouter.txt');
  const key =
    env.OPENROUTER_API_KEY?.trim() ||
    (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '');
  return {
    OPENROUTER_API_KEY: key,
    ALLOWED_ORIGINS: env.ALLOWED_ORIGINS,
    SITE_URL: env.SITE_URL ?? 'http://localhost:5173',
  };
}

/** Node's IncomingMessage carries the body as a stream; the handler wants a web Request. */
async function toRequest(req: Connect.IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(','));
  }
  return new Request(`http://localhost${req.url ?? '/'}`, {
    method: req.method ?? 'GET',
    headers,
    body: body.length ? body : undefined,
  });
}

export function jevProxyPlugin(
  mode: string,
  loadEnv: (m: string, d: string, p: string) => Record<string, string>,
): Plugin {
  const env = readEnv(mode, loadEnv);
  if (!env.OPENROUTER_API_KEY) {
    console.warn('[jev] No OpenRouter key found. The game will run on its offline fallback.');
  }

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith('/api/jev')) return next();
    void (async () => {
      const response = await handleJev(await toRequest(req), env);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    })();
  };

  return {
    name: 'jev-proxy',
    configureServer: (server: ViteDevServer) => {
      server.middlewares.use(middleware);
    },
    configurePreviewServer: (server: PreviewServer) => {
      server.middlewares.use(middleware);
    },
  };
}
