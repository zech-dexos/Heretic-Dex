const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const HF_TOKEN = process.env.HF_TOKEN;
const INFERENCE_BASE_URL = (process.env.HF_INFERENCE_BASE_URL || 'https://router.huggingface.co/v1').replace(/\/+$/, '');
const CONFIGURED_MODELS = (process.env.HERETIC_MODEL_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const MODEL_CACHE_MS = 30 * 1000;
let modelCache = { expiresAt: 0, models: [] };
const requestBuckets = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;

app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'dist')));

function getClientKey(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function allowRequest(req, res, next) {
  const now = Date.now();
  const key = getClientKey(req);
  const current = requestBuckets.get(key) || { startedAt: now, count: 0 };

  if (now - current.startedAt >= WINDOW_MS) {
    current.startedAt = now;
    current.count = 0;
  }

  current.count += 1;
  requestBuckets.set(key, current);

  if (current.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: 'Rate limit reached. Please wait a few minutes before trying again.'
    });
  }

  return next();
}

async function getAvailableModels(forceRefresh) {
  if (!HF_TOKEN) {
    const error = new Error('Hosted inference is not configured on the server.');
    error.status = 503;
    throw error;
  }

  if (!forceRefresh && modelCache.expiresAt > Date.now()) {
    return modelCache.models;
  }

  const response = await fetch(INFERENCE_BASE_URL + '/models', {
    headers: { Authorization: 'Bearer ' + HF_TOKEN }
  });

  if (!response.ok) {
    const error = new Error('The inference provider could not list its available models (HTTP ' + response.status + ').');
    error.status = 502;
    throw error;
  }

  const payload = await response.json();
  const catalog = Array.isArray(payload.data) ? payload.data : [];
  const configured = CONFIGURED_MODELS.length > 0
    ? new Set(CONFIGURED_MODELS)
    : null;

  const models = catalog
    .filter((model) => model && typeof model.id === 'string')
    .filter((model) => configured
      ? configured.has(model.id)
      : model.id.toLowerCase().includes('heretic'))
    .filter((model) => {
      if (!Array.isArray(model.providers) || model.providers.length === 0) return true;
      return model.providers.some((provider) => provider.status === 'live');
    })
    .map((model) => ({
      id: model.id,
      providers: Array.isArray(model.providers)
        ? model.providers.filter((provider) => provider.status === 'live').map((provider) => provider.provider)
        : []
    }));

  modelCache = { expiresAt: Date.now() + MODEL_CACHE_MS, models };
  return models;
}

app.get('/api/health', async (req, res) => {
  try {
    const models = await getAvailableModels(false);
    res.json({
      status: 'ready',
      modelCount: models.length,
      configured: true
    });
  } catch (error) {
    res.status(error.status || 503).json({
      status: 'unavailable',
      configured: Boolean(HF_TOKEN),
      message: error.message
    });
  }
});

app.get('/api/models', async (req, res) => {
  try {
    const models = await getAvailableModels(false);
    res.json({ models });
  } catch (error) {
    res.status(error.status || 503).json({ error: error.message });
  }
});

app.post('/api/chat', allowRequest, async (req, res) => {
  const body = req.body || {};
  const model = typeof body.model === 'string' ? body.model : '';
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (!model || messages.length === 0 || messages.length > 20) {
    return res.status(400).json({ error: 'Choose a model and provide between 1 and 20 messages.' });
  }

  const safeMessages = [];
  let totalCharacters = 0;

  for (const message of messages) {
    if (!message || !['system', 'user', 'assistant'].includes(message.role) ||
        typeof message.content !== 'string') {
      return res.status(400).json({ error: 'A message has an invalid role or content.' });
    }

    totalCharacters += message.content.length;
    safeMessages.push({ role: message.role, content: message.content });
  }

  if (totalCharacters > 16000) {
    return res.status(413).json({ error: 'This conversation is too long. Start a new chat or shorten the prompt.' });
  }

  let availableModels;
  try {
    availableModels = await getAvailableModels(false);
  } catch (error) {
    return res.status(error.status || 503).json({ error: error.message });
  }

  if (!availableModels.some((entry) => entry.id === model)) {
    return res.status(400).json({ error: 'That model is not currently enabled by this server.' });
  }

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  let upstream;
  try {
    upstream = await fetch(INFERENCE_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + HF_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: safeMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 700
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) return;
    return res.status(502).json({ error: 'Could not connect to the hosted inference provider.' });
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    const safeDetail = detail.slice(0, 500);
    return res.status(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502)
      .json({ error: 'The selected model could not answer this request. ' + safeDetail });
  }

  if (!upstream.body) {
    return res.status(502).json({ error: 'The inference provider returned an empty response stream.' });
  }

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();

  try {
    const reader = upstream.body.getReader();
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (!res.write(Buffer.from(result.value))) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
    res.end();
  } catch (error) {
    if (!controller.signal.aborted && !res.destroyed) {
      res.write('data: ' + JSON.stringify({ error: 'The response stream was interrupted.' }) + '\n\n');
      res.end();
    }
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Heretic Test-Drive server listening on port ' + PORT);
});
