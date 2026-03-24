import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

// ── Load OSP data files ───────────────────────────────────────────────────────

function loadScenarioFiles(scenarioDir) {
  const ospMd = [];
  const manifests = [];

  for (const file of fs.readdirSync(scenarioDir).sort()) {
    if (file.endsWith('.osp.md')) {
      const content = fs.readFileSync(path.join(scenarioDir, file), 'utf-8');
      ospMd.push(`### ${file.replace('.osp.md', '')}\n\n${content}`);
    }
  }

  const manifestDir = path.join(scenarioDir, 'manifests');
  if (fs.existsSync(manifestDir)) {
    for (const file of fs.readdirSync(manifestDir).sort()) {
      if (file.endsWith('.yaml')) {
        const content = fs.readFileSync(path.join(manifestDir, file), 'utf-8');
        manifests.push(`**${file}**\n\`\`\`yaml\n${content}\`\`\``);
      }
    }
  }

  return { ospMd, manifests };
}

function buildSystemPrompt() {
  const template = fs.readFileSync(
    path.join(ROOT, 'data/prompts/system-prompt.txt'),
    'utf-8'
  );

  const logistics = loadScenarioFiles(path.join(ROOT, 'data/scenario-logistics'));
  const consulting = loadScenarioFiles(path.join(ROOT, 'data/scenario-consulting'));
  const it = loadScenarioFiles(path.join(ROOT, 'data/scenario-it'));

  return template
    .replace('{LOGISTICS_OSP_MD_FILES}', logistics.ospMd.join('\n\n---\n\n'))
    .replace('{LOGISTICS_MANIFESTS}', logistics.manifests.join('\n\n'))
    .replace('{CONSULTING_OSP_MD_FILES}', consulting.ospMd.join('\n\n---\n\n'))
    .replace('{CONSULTING_MANIFESTS}', consulting.manifests.join('\n\n'))
    .replace('{IT_OSP_MD_FILES}', it.ospMd.join('\n\n---\n\n'))
    .replace('{IT_MANIFESTS}', it.manifests.join('\n\n'));
}

// ── Load fallback responses ───────────────────────────────────────────────────

function loadFallbacks() {
  const fallbacks = new Map();
  const fallbackDir = path.join(ROOT, 'data/fallback');

  for (const file of fs.readdirSync(fallbackDir)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(fallbackDir, file), 'utf-8'));
    if (data.prompt && data.response && !data.response.startsWith('PLACEHOLDER')) {
      fallbacks.set(data.prompt.toLowerCase().trim(), data.response);
    }
  }

  return fallbacks;
}

// ── Initialise ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = buildSystemPrompt();
const FALLBACKS = loadFallbacks();

console.log(`System prompt built (${SYSTEM_PROMPT.length} chars)`);
console.log(`Fallback responses loaded: ${FALLBACKS.size}`);

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();

app.use(cors());
app.use(express.json({ limit: '4mb' }));

// Serve built frontend in production
const FRONTEND_DIST = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'rate_limit',
      message:
        'The demo has a usage limit. For unlimited access, set up your own OSP agent — ' +
        'it takes 10 minutes with the open-source code in our GitHub repository.'
    });
  }
});

// ── Simple stats (no user tracking) ──────────────────────────────────────────

const stats = { conversations: 0, apiCalls: 0, fallbackHits: 0, startedAt: new Date().toISOString() };

// ── Chat endpoint ─────────────────────────────────────────────────────────────

app.post('/api/chat', apiLimiter, async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  stats.conversations++;

  // ── Fallback check ──────────────────────────────────────────────────────────
  const normalised = message.toLowerCase().trim();
  if (FALLBACKS.has(normalised)) {
    stats.fallbackHits++;
    return res.json({ response: FALLBACKS.get(normalised), source: 'fallback' });
  }

  // ── Live API call ───────────────────────────────────────────────────────────
  const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = process.env;

  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    return res.status(500).json({
      error: 'Cloudflare credentials not configured. Copy .env.example to .env and add your credentials.'
    });
  }

  stats.apiCalls++;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: message }
  ];

  let cfResponse;
  try {
    cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages, max_tokens: 2048, stream: true })
      }
    );
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach Cloudflare Workers AI', details: err.message });
  }

  if (!cfResponse.ok) {
    const text = await cfResponse.text().catch(() => '');
    return res.status(502).json({ error: `Cloudflare API error ${cfResponse.status}`, details: text });
  }

  // ── Stream SSE back to client ───────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const reader = cfResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.response) {
            res.write(`data: ${JSON.stringify({ token: parsed.response })}\n\n`);
          }
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }
  } catch (err) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  } finally {
    res.end();
  }
});

// ── Stats endpoint (no PII) ───────────────────────────────────────────────────

app.get('/api/stats', (_req, res) => res.json(stats));

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── Serve frontend SPA for all other routes ───────────────────────────────────

if (fs.existsSync(FRONTEND_DIST)) {
  app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));
}

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`OSP Demo Agent running on http://localhost:${PORT}`);
});
