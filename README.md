# Heretic Test-Drive

A small public chat page for trying Heretic models through hosted inference. Visitors only need a browser; model weights and provider credentials stay on the server.

## How it works

- The browser asks this server for the models it has enabled.
- The server reads the live model catalog from a Hugging Face Inference Providers-compatible API.
- The server exposes only configured model IDs that the provider reports as available.
- Chat requests are streamed through the server. The Hugging Face token is never sent to the browser.
- There is no browser-side model download, WebGPU requirement, Dex Core identity, Sirius layer, account system, or persistent memory.

## Deploy on Render

Create a Render **Web Service** for this repository.

- Build command: \`npm install && npm run build\`
- Start command: \`npm run serve\`
- Runtime: Node 20 or newer

Add these environment variables in the Render service:

| Variable | Required | Description |
| --- | --- | --- |
| \`HF_TOKEN\` | Yes | Fine-grained Hugging Face token with **Make calls to Inference Providers** permission. Keep it server-side. |
| \`HERETIC_MODEL_IDS\` | Yes for a curated list | Comma-separated exact model IDs that are available through the configured inference provider. |
| \`HF_INFERENCE_BASE_URL\` | No | Defaults to \`https://router.huggingface.co/v1\`. Use another OpenAI-compatible \`/v1\` base URL only if you have deployed and tested it. |

The server checks the provider's \`/models\` catalog. A configured model is shown only when it appears in that catalog (and, when provider status is supplied, at least one provider reports it as live). If \`HERETIC_MODEL_IDS\` is omitted, the server lists only available model IDs containing the word \`heretic\`.

**Important:** Hugging Face Hub discovery is not the same as hosted inference availability. A model repository or GGUF file is not automatically runnable by Inference Providers. If the Heretic model you want is not in the provider catalog, deploy that model to an inference endpoint that exposes the compatible API, then configure this app to use that endpoint and its exact served model ID. Do not add a model ID just because it exists on the Hub.

## Local development

1. Install Node.js 20 or newer.
2. Set \`HF_TOKEN\` and optionally \`HERETIC_MODEL_IDS\` in your shell.
3. Run \`npm install\`, \`npm run build\`, then \`npm run serve\`.
4. Open \`http://localhost:3000\`.

The development-only webpack server is available with \`npm start\`; API requests are served by \`npm run serve\`, so use the production server when testing hosted chat.

## Basic safeguards

- Server-side provider token; never put it in frontend variables.
- Per-IP in-memory limit of 30 chat requests per 10 minutes.
- Maximum 20 messages and 16,000 total conversation characters per request.
- Maximum 700 generated tokens per response.
- Model IDs are checked against the server's live allowlist before inference.
