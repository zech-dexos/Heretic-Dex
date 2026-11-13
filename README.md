# Heretic Test-Drive

A small public chat page for trying Heretic models through hosted inference. Visitors only need a browser; model weights and provider credentials stay on the server.

## How it works

- The browser asks this server for the models it has enabled.
- The server reads the live model catalog from an OpenAI-compatible inference provider.
- The server exposes only configured model IDs that appear in the provider's catalog.
- Chat requests are streamed through the server. The provider API key is never sent to the browser.
- There is no browser-side model download, WebGPU requirement, Dex Core identity, Sirius layer, account system, or persistent memory.

## First provider: Featherless

The initial configuration targets Featherless because its catalog includes Heretic models and it provides an OpenAI-compatible API.

Suggested first model:

- `experimentalmachines/LFM2.5-1.2B-Instruct-heretic`

Featherless currently lists this model at $0.04 per million input tokens and $0.08 per million output tokens. **However, its Developer API plan starts at $50/month in credits**; this is not a free public-app host. The $25/month Chat plan is for personal interactive use and is not permitted for application/API traffic. Pricing and availability can change; verify the model's current details and your account plan before enabling public traffic.

Create a Featherless account, generate an API key, and add it to the server as `INFERENCE_API_KEY`. The API key must remain server-side.

- Provider base URL: `https://api.featherless.ai/v1`
- Model catalog: `GET /v1/models`
- Chat: `POST /v1/chat/completions`

## Deploy on Render

Create a Render **Web Service** for this repository.

- Build command: `npm install && npm run build`
- Start command: `npm run serve`
- Runtime: Node 20 or newer

Set these environment variables in the Render service:

| Variable | Required | Description |
| --- | --- | --- |
| `INFERENCE_API_KEY` | Yes | API key for the selected inference provider. Keep it server-side. |
| `INFERENCE_BASE_URL` | No | Defaults to Featherless `https://api.featherless.ai/v1`. |
| `HERETIC_MODEL_IDS` | Recommended | Comma-separated exact model IDs to expose. Defaults to model IDs containing `heretic`. |
| `INFERENCE_REFERER` | No | Public app URL sent as provider attribution. |
| `INFERENCE_APP_NAME` | No | App name sent as provider attribution. |
| `MAX_REQUESTS_PER_WINDOW` | No | Per-IP request limit per 10-minute window; defaults to 10. |
| `MAX_OUTPUT_TOKENS` | No | Response token cap; defaults to 500 and is hard-capped at 700. |

The server also accepts the older `HF_TOKEN` and `HF_INFERENCE_BASE_URL` names for backwards compatibility.

## Local development

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and add your provider API key. Do not commit `.env`.
3. Run `npm install`, `npm run build`, then `npm run serve`.
4. Open `http://localhost:3000`.

The development-only webpack server is available with `npm start`; API requests are served by `npm run serve`, so use the production server when testing hosted chat.

## Basic safeguards

- Provider API key stays server-side.
- Exact model allowlist prevents visitors from selecting arbitrary provider models.
- Per-IP in-memory rate limit defaults to 10 chat requests per 10 minutes.
- Maximum 20 messages and 16,000 total conversation characters per request.
- Maximum 500 generated tokens per response by default (hard cap: 700).
- A model must appear in the provider's live model catalog before the server will route requests to it.

The in-memory rate limit is a basic first-launch safeguard, not a complete abuse-prevention or spending-limit system. Before broad public promotion, add provider-side spending limits/alerts and consider a shared rate limiter.
