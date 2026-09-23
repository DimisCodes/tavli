import { handleJev } from '../../server/jev-proxy.ts';

/** Netlify edge function. Set OPENROUTER_API_KEY in the site's environment variables. */
export default function handler(request: Request): Promise<Response> {
  // Deno global on Netlify Edge; read through globalThis so this file still typechecks here.
  const deno = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  return handleJev(request, {
    OPENROUTER_API_KEY: deno?.env.get('OPENROUTER_API_KEY'),
    ALLOWED_ORIGINS: deno?.env.get('ALLOWED_ORIGINS'),
    SITE_URL: deno?.env.get('SITE_URL'),
  });
}

export const config = { path: '/api/jev/*' };
