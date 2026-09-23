import fs from 'node:fs';
import path from 'node:path';

/**
 * The app calls the relative path /api/jev/systemone, which the Vite dev server proxies to
 * OpenRouter with the key attached. In Node there is no proxy, so we patch fetch to do the
 * same rewrite. This lets the harness exercise the exact same decision code as the browser.
 */
export function installFetchProxy(): void {
  const keyFile = path.resolve(process.cwd(), 'openrouter.txt');
  const key = (process.env.OPENROUTER_API_KEY ?? fs.readFileSync(keyFile, 'utf8')).trim();
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    let url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('/api/jev')) {
      url = 'https://openrouter.ai/api/v1' + url.slice('/api/jev'.length);
      init = {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Tavli Harness',
        },
      };
    }
    return original(url, init);
  }) as typeof fetch;
}

export const roll = (): [number, number] => [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];

export function openingRoll(): [number, number] {
  let d = roll();
  while (d[0] === d[1]) d = roll();
  return d;
}

export function writeArtifact(name: string, data: unknown): string {
  const dir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}
