import { handleJev } from '../../server/jev-proxy';

/** Vercel edge function. Set OPENROUTER_API_KEY in the project's environment variables. */
export const config = { runtime: 'edge' };

export default function handler(request: Request): Promise<Response> {
  return handleJev(request, {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    SITE_URL: process.env.SITE_URL,
  });
}
