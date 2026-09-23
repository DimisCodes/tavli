import { handleJev, type ProxyEnv } from '../../../server/jev-proxy';

/** Cloudflare Pages function. Bind OPENROUTER_API_KEY as a secret on the Pages project. */
export function onRequest(context: { request: Request; env: ProxyEnv }): Promise<Response> {
  return handleJev(context.request, context.env);
}
