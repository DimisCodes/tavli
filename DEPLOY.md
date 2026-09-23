# Publishing this without exposing the key

Short answer: yes. The browser never sees the OpenRouter key. It calls a relative path on your
own origin, and a small server-side function attaches the key and forwards the request.

The important caveat, stated plainly: hiding the key stops people **stealing** it. It does not
stop people **using** your deployed endpoint and spending your credits. The only hard limit is a
spending cap on the key itself. Do step 1.

## 1. Make a throwaway key with a spending cap

Do not deploy your personal key. In the OpenRouter dashboard create a new key used only by this
site, and set a credit limit with a daily reset. Once the cap is reached OpenRouter rejects
further requests on that key before they cost anything upstream, and it resets at midnight UTC.

The same thing through the management API:

```bash
curl -X POST https://openrouter.ai/api/v1/keys \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"tavli-public","limit":5,"limitReset":"daily"}'
```

The plaintext key comes back once and cannot be retrieved later. A game costs roughly $0.004, so
a $5 daily cap is about 1,200 games per day.

## 2. Deploy

The build output is static. The proxy is one function, and there is an adapter for each host that
shares the same handler in `server/jev-proxy.ts`.

**Coolify, or any Docker host.** This is what [tavli.dimi.diy](https://tavli.dimi.diy) runs on.
Create a new Application from the Git repository, set the build pack to **Dockerfile**, and set the
port to **3000**. Add `OPENROUTER_API_KEY` as an environment variable, set the domain, and deploy.
The `Dockerfile` builds both the static site and a small zero-dependency Node server
(`server/serve.ts`) that serves it and mounts the same proxy handler. There is a health endpoint at
`/healthz` that reports whether a key is configured.

Optionally set `ALLOWED_ORIGINS=https://tavli.dimi.diy` and `SITE_URL=https://tavli.dimi.diy`.

**Vercel.** `api/jev/[...path].ts` is picked up automatically. Import the repository, then add
`OPENROUTER_API_KEY` under Settings, Environment Variables.

**Cloudflare Pages.** `functions/api/jev/[[path]].ts` is picked up automatically. Build command
`yarn build`, output directory `dist`, then add `OPENROUTER_API_KEY` as an encrypted variable.

**Netlify.** `netlify.toml` and `netlify/edge-functions/jev.ts` are already set up. Add
`OPENROUTER_API_KEY` under Site configuration, Environment variables.

Anywhere else that runs Node, `yarn build && yarn preview` serves the built site with the same
proxy mounted, reading `OPENROUTER_API_KEY` from the environment.

## 3. Optionally lock it to your origin

Set `ALLOWED_ORIGINS` to your deployed URL, comma separated if there is more than one:

```
ALLOWED_ORIGINS=https://your-site.example
```

This stops the endpoint being used from another page. It does not stop `curl`, which can send any
`Origin` header it likes.

## What protects you, and how much

| Control | Where | Stops |
|---|---|---|
| Key held server-side | proxy | The key being read out of the bundle. Complete. |
| Model pinned to Jev | proxy | Your key being pointed at an expensive model. Complete. |
| Request shape and size validated | proxy | Padded prompts and token burning. Complete. |
| Per-IP rate limit | proxy | Casual hammering. Partial: serverless instances do not share state. |
| Origin allowlist | proxy | Use from other web pages. Partial: trivially forged outside a browser. |
| Key spending cap | OpenRouter | Your bill. **This is the one that actually bounds the damage.** |

The proxy never forwards client headers, so a caller cannot smuggle their own `Authorization`
through, and upstream error bodies are replaced with a status-only message so account state is
never echoed back.

## Local development

`openrouter.txt` at the project root still works and is gitignored. `OPENROUTER_API_KEY` in the
environment takes precedence. The dev and preview servers mount the same handler as production,
so validation, the model pin and rate limiting behave identically.

Confirm nothing leaked before you publish:

```bash
yarn build
grep -r "sk-or-v1" dist/ && echo "LEAK" || echo "clean"
```

## With no key configured

The proxy answers 503 and the game keeps working. Jev's turns fall back to the deterministic
evaluation in `src/engine/features.ts` and the interface labels those moves as a fallback, so a
deployment without credits is still playable rather than broken.
