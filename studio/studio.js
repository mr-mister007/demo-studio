#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   DemoStudio (AI edition) — click-to-build demos for ANY web app.
   Proxies your app (no code changes), floats a Studio panel over
   it, click the real UI to add steps, preview live, save a
   demo-config.js. Also proxy-rebinds at runtime.

   Usage:
     node studio.js --url <target> [--port <n>] [--config <seed>] [--out <path>]

   Runtime control (no restart):
     POST /__tour/studio/target   {url} → rebind proxy target
     POST /__tour/studio/save     {config} → persist to --out
     GET  /__tour/studio/current        → current draft config
   ════════════════════════════════════════════════════════════════ */
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ── AI (OpenRouter) config — reads key from ~/.atlas/atlas.yaml ─
let AI_KEY = null;
// Verified working free models (live-tested against OpenRouter API, 2026-09-15):
//   - JSON mode support confirmed
//   - Rate-limit/404 models excluded (gemma-4*, llama-3.3*, qwen-72b, phi-4 all dead/limited)
const AI_MODELS = [
  'openrouter/free',                       // router picks best free model — most reliable
  'poolside/laguna-s-2.1:free',            // strong instruction following
  'nex-agi/nex-n2.5-pro:free',
  'cohere/north-mini-code:free',
  'liquid/lfm-2.5-2.6b:free',
  'dots-studio/dots-3-note-preview:free'   // long-context fallback
];
let AI_MODEL = AI_MODELS[0];
let AI_PROVIDER = 'openrouter';
try {
  const atlas = fs.readFileSync(path.join(process.env.HOME, '.atlas', 'atlas.yaml'), 'utf8');
  const k = atlas.match(/api_key:\s*["']?([^"'\s]+)/);
  if (k) AI_KEY = k[1].trim();
} catch (e) { /* no atlas.yaml — AI button will report missing key */ }

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; }

let TARGET_URL = arg('--url', null);
const PORT = parseInt(arg('--port', '8940'), 10);
const CONFIG_PATH = arg('--config', null);
const OUT_PATH = arg('--out', path.join(process.cwd(), 'built-demo-config.js'));

const ROUTE = '/__tour/';
const STUDIO_ROUTE = ROUTE + 'studio/';

const ENGINE_JS  = path.join(__dirname, '..', 'demo-engine.js');
const ENGINE_CSS = path.join(__dirname, '..', 'demo-engine.css');
const STUDIO_JS  = path.join(__dirname, 'studio-overlay.js');
const STUDIO_CSS = path.join(__dirname, 'studio-overlay.css');

// ── Target parsing + runtime rebind ────────────────────────────
function parseTarget(raw) {
  const u = new URL(raw);
  const protocol = u.protocol === 'https:' ? 'https' : 'http';
  const port = parseInt(u.port || (protocol === 'https' ? '443' : '80'), 10);
  return { protocol, host: u.hostname, port, url: protocol + '://' + u.hostname + ':' + port + '/' };
}
let UPSTREAM = null;
if (TARGET_URL) { try { UPSTREAM = parseTarget(TARGET_URL); } catch (e) { console.error('Bad --url: ' + e.message); process.exit(1); } }

// ── Welcome page (served when no target connected) ──────────
function welcomeHtml() {
  const assets =
    '<link rel="stylesheet" href="/__tour/demo-engine.css">' +
    '<link rel="stylesheet" href="/__tour/studio/studio-overlay.css">' +
    '<script src="/__tour/studio/studio-overlay.js" defer></script>';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DemoStudio — Connect to your app</title>
  ${assets}
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0a0a0a; color:#e5e5e5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; }
    .ds-welcome { text-align:center; max-width:560px; padding:40px; }
    .ds-welcome h1 { font-size:28px; font-weight:700; color:#fff; margin-bottom:12px; }
    .ds-welcome p { font-size:15px; color:#888; margin-bottom:28px; line-height:1.6; }
    .ds-welcome .ds-logo { font-size:42px; margin-bottom:18px; }
  </style>
</head>
<body>
  <div class="ds-welcome">
    <div class="ds-logo">▶</div>
    <h1>DemoStudio</h1>
    <p>Enter an app URL in the Connect field above to start building interactive demos.</p>
  </div>
</body>
</html>`;
}

// ── Seed config (the tour you're building) ────────────────────
function defaultCfg() {
  return { appName: 'DemoStudio', launchTitle: 'Take a 2-minute demo', launchBody: 'See how this app works.', startLabel: 'Start demo', dismissLabel: 'Explore on my own', accent: '#3b82f6', chapters: [] };
}
let seedCfg = defaultCfg();
let SAVED_CFG = null     // last saved config (draft / published)
let SAVED_CFG2 = null;

// Load seed from --config if provided
if (CONFIG_PATH && fs.existsSync(CONFIG_PATH)) {
  try {
    const src = fs.readFileSync(CONFIG_PATH, 'utf8');
    const m = src.match(/__TOUR_CONFIG\s*=\s*(\{[\s\S]*\})\s*;?\s*$/m) ||
              src.match(/module\.exports\s*=\s*(\{[\s\S]*\})\s*;?\s*$/m);
    if (m) {
      // Strip JS comments and use Function constructor for JS object literals
      const cleaned = m[1].replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      seedCfg = new Function('return (' + cleaned + ')')();
    }
  } catch (e) { console.warn('Could not parse seed config: ' + e.message); }
}

function sendJSON(res, obj, code) {
  const body = JSON.stringify(obj);
  res.writeHead(code || 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function serveFile(res, file) {
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end('missing'); return; }
  const type = path.extname(file) === '.css' ? 'text/css' : 'application/javascript';
  const data = fs.readFileSync(file);
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': data.length });
  res.end(data);
}
function decompress(buf, enc) {
  return new Promise((resolve, reject) => {
    if (!enc || enc === 'identity') return resolve(buf);
    let fn;
    if (enc.includes('gzip')) fn = zlib.gunzip;
    else if (enc.includes('br')) fn = zlib.brotliDecompress;
    else if (enc.includes('deflate')) fn = zlib.inflate;
    else return resolve(buf);
    fn(buf, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

const ROUTE2 = '/__tour/';
function injectAssets(html) {
  const assets =
    '<link rel="stylesheet" href="' + ROUTE2 + 'demo-engine.css">' +
    '<link rel="stylesheet" href="' + ROUTE2 + 'studio/studio-overlay.css">' +
    '<script src="' + ROUTE2 + 'demo-config.js" defer></script>' +
    '<script src="' + ROUTE2 + 'demo-engine.js" defer></script>' +
    '<script src="' + ROUTE2 + 'studio/studio-overlay.js" defer></script>';
  if (html.includes('</body>')) return html.replace('</body>', assets + '\n</body>');
  return html + assets;
}

// ── HTTP server: proxy + studio ───────────────────────────────
// ── JSON repair for LLM outputs ──────────────────────────────
function repairJson(s) {
  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');
  // Remove unescaped newlines inside string values
  s = s.replace(/"([^"]*)\n([^"]*)"/g, (m, a, b) => '"' + a.replace(/\n/g, ' ').replace(/\r/g, ' ') + b.replace(/\n/g, ' ').replace(/\r/g, ' ') + '"');
  // Stack-based tracking of open structures (preserves nesting order)
  const stack = [];
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && (i === 0 || s[i-1] !== '\\')) inStr = !inStr;
    if (inStr) continue;
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') {
      const expected = c === '}' ? '{' : '[';
      if (stack[stack.length-1] === expected) stack.pop();
    }
  }
  // Close unclosed strings
  if (inStr) s += '"';
  // Close unclosed structures in reverse nesting order
  while (stack.length) {
    const open = stack.pop();
    s += open === '{' ? '}' : ']';
  }
  return s;
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // Dynamic draft config shared by engine + studio
  if (url === ROUTE + 'demo-config.js') {
    const body = 'window.__TOUR_CONFIG = ' + JSON.stringify(SAVED_CFG || seedCfg, null, 2) + ';\n';
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }
  if (url === ROUTE + 'studio/current') { sendJSON(res, { config: SAVED_CFG || seedCfg, target: UPSTREAM ? UPSTREAM.url : null }); return; }
  if (url === ROUTE + 'studio/target' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        UPSTREAM = parseTarget(JSON.parse(body).url);
        // New target = new app = reset saved config so the old app's
        // tour isn't served/edited on the new site.
        SAVED_CFG = null;
        sendJSON(res, { ok: true, target: UPSTREAM.url });
      }
      catch (e) { sendJSON(res, { ok: false, error: e.message }, 400); }
    });
    return;
  }
  if (url === ROUTE + 'studio/save' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const cfg = JSON.parse(body);
        SAVED_CFG = cfg;
        fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
        fs.writeFileSync(OUT_PATH, 'window.__TOUR_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n');
        const steps = (cfg.chapters || []).reduce((a, c) => a + (c.steps || []).length, 0);
        sendJSON(res, { ok: true, path: OUT_PATH, steps });
      } catch (e) { sendJSON(res, { ok: false, error: e.message }, 400); }
    });
    return;
  }

  // ── AI tour generation ────────────────────────────────────────
  if (url === ROUTE + 'studio/ai-generate' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { dom, url: targetUrl, appName } = JSON.parse(body);
        if (!AI_KEY) return sendJSON(res, { ok: false, error: 'No OpenRouter key found in ~/.atlas/atlas.yaml' }, 400);

        const sample = (dom || []).slice(0, 120);
        const inventoryLines = sample.map(d => `- ${d.tag} | ${d.text || ''} | ${d.role || ''} | ${d.sel}`).join('\n');
        console.log('[AI] DOM inventory sent to LLM (' + sample.length + ' elements):');
        sample.slice(0, 10).forEach(d => console.log('[AI]  ', d.sel, '|', d.tag, '|', (d.text || '').slice(0, 40)));
        if (sample.length > 10) console.log('[AI]  ... and', sample.length - 10, 'more');
        
        // Build concrete examples from actual inventory
        const exampleSel = sample[0]?.sel || 'button.primary-btn';
        const exampleText = sample[0]?.text || 'Get Started';
        const exampleTag = sample[0]?.tag || 'BUTTON';
        const appTitle = sample.find(d => d.tag === 'H1' || d.tag === 'H2' || d.tag === 'H3')?.text || (appName || targetUrl || 'the app');
        
        const prompt = `You are a UX onboarding expert. Create an interactive DEMO for "${appName || targetUrl || 'the app'}" using the elements below.

🎯 GOAL: Create a COMPLETE demo that walks through the app's main screens and actions. Use AS MANY elements as possible — every major interactive element in the inventory should appear in at least one step. A 1-step demo is a FAILURE; aim for 5-15 steps covering the key journey.

⚠️ CRITICAL RULES — VIOLATION MEANS YOUR OUTPUT WILL BE REJECTED:
1. EVERY step's "sel" MUST BE AN EXACT COPY of a selector from the inventory below. NO exceptions, NO modifications, NO inventions.
2. If an element is NOT in the inventory, you CANNOT reference it — do not hallucinate selectors.
3. Chapter titles and step titles must describe the ACTUAL element text/role from the inventory.
4. Group steps into logical chapters (1-4 chapters). Each chapter should have 2-6 steps.
5. The FIRST step should introduce the app's main entry point (hero CTA, logo, or main nav). 
6. Output ONLY valid JSON (no markdown, no extra text, no explanations, no reasoning, no thinking process).

DOM INVENTORY (tag | text | role | css selector — copy sel EXACTLY):
${inventoryLines}

Output JSON shaped EXACTLY (use DEMO wording, not tour):
{
  "appName": "${appTitle}",
  "launchTitle": "Welcome to ${appTitle}",
  "launchBody": "Let me show you the key features.",
  "startLabel": "Start demo",
  "dismissLabel": "Explore on my own",
  "accent": "#3b82f6",
  "chapters": [
    {
      "title": "Getting Started",
      "steps": [
        {
          "title": "Click ${exampleText}",
          "body": "This ${exampleTag.toLowerCase()} ${exampleText.toLowerCase()} takes you to the main feature.",
          "sel": "${exampleSel}",
          "pos": "bottom",
          "action": false
        }
      ]
    }
  ]
}

IMPORTANT: 
- The example above uses "${exampleSel}" from the inventory. Use ONLY selectors from the inventory above — every "sel" value must be an EXACT match to one of the selectors listed.
- Expand the example into a full demo: multiple chapters and steps, each using a DIFFERENT element from the inventory.
- MINIMUM 5 steps total. Cover the key elements: buttons, links, nav, inputs, headings, images.
- If the inventory has few elements, still use every single one.`;

        let llmRes, data, msg, raw = null;
        for (let attempt = 0; attempt < AI_MODELS.length; attempt++) {
          const model = AI_MODELS[attempt];
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 45000); // 45s per model
            llmRes = await fetch(OPENROUTER_URL, {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + AI_KEY,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:8940',
                'X-Title': 'DemoStudio'
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: 'system', content: 'You generate interactive demo definitions as strict JSON. Never wrap in fences. Use DEMO terminology ("Start demo", "demo"), never "tour".' },
                  { role: 'user', content: prompt }
                ],
                temperature: 0.4,
                max_tokens: 4000,
                response_format: { type: 'json_object' }
              }),
              signal: ctrl.signal
            });
            clearTimeout(timer);
            if (!llmRes.ok) {
              const t = await llmRes.text();
              console.error('[AI] attempt ' + attempt + ' model ' + model + ' → ' + llmRes.status + ': ' + t.slice(0, 120));
              if (llmRes.status === 429 || llmRes.status >= 500 || llmRes.status === 404) continue; // rate-limited/unavailable → try next
              return sendJSON(res, { ok: false, error: 'LLM API ' + llmRes.status + ': ' + t.slice(0, 200) }, 502);
            }
            data = await llmRes.json();
            msg = data.choices && data.choices[0] && data.choices[0].message;
            raw = msg && msg.content;
            if (raw) { AI_MODEL = model; break; }
            console.error('[AI] attempt ' + attempt + ' model ' + model + ' empty content. finish:', data.choices && data.choices[0] && data.choices[0].finish_reason, '| reasoning:', msg && msg.reasoning ? (msg.reasoning.length + ' chars') : 'none');
          } catch (e) {
            console.error('[AI] attempt ' + attempt + ' model ' + model + ' threw: ' + e.message);
            if (e.name === 'AbortError') console.error('[AI]   (timed out after 45s, trying next model)');
          }
        }
        if (!raw) return sendJSON(res, { ok: false, error: 'All AI models returned empty responses (rate-limited or reasoning-only). Retry in a moment.' }, 502);

        console.log('[AI] Raw LLM response (first 500 chars):', raw.slice(0, 500));

        // Strip markdown fences if present
        const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        // Find first complete { ... } block - handle case where model outputs reasoning text first
        // Look for the outermost complete JSON object by tracking braces
        let start = -1;
        let end = -1;
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = 0; i < cleaned.length; i++) {
          const c = cleaned[i];
          if (inString) {
            if (escape) { escape = false; }
            else if (c === '\\') { escape = true; }
            else if (c === '"') { inString = false; }
            continue;
          }
          if (c === '"') { inString = true; continue; }
          if (c === '{') {
            if (depth === 0 && start === -1) start = i;
            depth++;
          } else if (c === '}') {
            if (depth > 0) {
              depth--;
              if (depth === 0) { end = i; break; }
            }
          }
        }
        if (start < 0 || end < 0) return sendJSON(res, { ok: false, error: 'LLM returned non-JSON: ' + cleaned.slice(0, 200) }, 502);
        let jsonStr = cleaned.slice(start, end + 1);

        // Attempt parse, with repair on failure
        let cfg;
        try {
          cfg = JSON.parse(jsonStr);
        } catch (firstErr) {
          // Repair common LLM JSON issues
          try {
            cfg = JSON.parse(repairJson(jsonStr));
          } catch (secondErr) {
            console.error('[AI] JSON parse failed after repair:', secondErr.message, 'at pos', secondErr.message.match(/position (\d+)/)?.[1]);
            console.error('[AI] raw tail (last 300 chars):', jsonStr.slice(-300));
            return sendJSON(res, { ok: false, error: 'AI returned invalid JSON (' + firstErr.message.slice(0, 60) + ')' }, 502);
          }
        }

        // NEW: Validate that all selectors in the response exist in the inventory
        const validSelectors = new Set((dom || []).map(d => d.sel));
        const validationErrors = [];
        function validateSelectors(obj, path = '') {
          if (!obj || typeof obj !== 'object') return;
          if (obj.sel && typeof obj.sel === 'string') {
            if (!validSelectors.has(obj.sel)) {
              validationErrors.push(path + '.sel: "' + obj.sel + '" NOT IN INVENTORY');
            }
          }
          for (const key of Object.keys(obj)) {
            validateSelectors(obj[key], path ? path + '.' + key : key);
          }
        }
        validateSelectors(cfg);
        if (validationErrors.length) {
          console.error('[AI] Selector validation failed:', validationErrors);
          return sendJSON(res, { ok: false, error: 'AI hallucinated selectors: ' + validationErrors.slice(0, 3).join('; '), invalidSelectors: validationErrors }, 502);
        }

        // Sanitize / validate shape
        if (!cfg.chapters || !Array.isArray(cfg.chapters)) return sendJSON(res, { ok: false, error: 'LLM config missing chapters' }, 502);
        cfg.chapters = cfg.chapters.slice(0, 8).map(ch => ({
          title: String(ch.title || 'Chapter').slice(0, 80),
          steps: (ch.steps || []).slice(0, 6).map(s => ({
            title: String(s.title || 'Step').slice(0, 50),
            body: String(s.body || '').slice(0, 200),
            sel: String(s.sel || '').slice(0, 300),
            pos: ['top', 'bottom', 'left', 'right', 'center'].includes(s.pos) ? s.pos : 'bottom',
            action: !!s.action
          }))
        }));
        if (!cfg.appName) cfg.appName = appName || 'My App';

        console.log('[AI] Generated config validated:', JSON.stringify(cfg).slice(0, 500));

        sendJSON(res, { ok: true, config: cfg, model: AI_MODEL });
      } catch (e) { sendJSON(res, { ok: false, error: e.message }, 500); }
    });
    return;
  }

  // Static assets
  if (url === ROUTE + 'demo-engine.js') return serveFile(res, ENGINE_JS);
  if (url === ROUTE + 'demo-engine.css') return serveFile(res, ENGINE_CSS);
  if (url === ROUTE + 'studio/studio-overlay.js') return serveFile(res, STUDIO_JS);
  if (url === ROUTE + 'studio/studio-overlay.css') return serveFile(res, STUDIO_CSS);
  if (url === ROUTE + 'welcome') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(welcomeHtml());
    return;
  }

  // ── Reverse proxy to the target app —───────────────────────
  if (!UPSTREAM) {
    // No target connected yet — serve welcome page with studio panel
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(welcomeHtml());
    return;
  }
  const transport = UPSTREAM.protocol === 'https' ? https : http;
  const proxyReq = transport.request({
    host: UPSTREAM.host,
    port: UPSTREAM.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: UPSTREAM.host + ':' + UPSTREAM.port, 'accept-encoding': 'gzip, br' },
  }, (proxyRes) => {
    const chunks = [];
    proxyRes.on('data', c => chunks.push(c));
    proxyRes.on('end', async () => {
      try {
        const buf = Buffer.concat(chunks);
        const ctype = proxyRes.headers['content-type'] || '';
        const enc = proxyRes.headers['content-encoding'] || '';
        let body = buf;
        const headers = { ...proxyRes.headers };
        if (ctype.includes('text/html')) {
          const plain = enc ? await decompress(buf, enc) : buf;
          body = Buffer.from(injectAssets(plain.toString('utf8')), 'utf8');
          delete headers['content-encoding'];
          delete headers['transfer-encoding'];
          delete headers['content-length'];
          headers['cache-control'] = 'no-store';
        }
        res.writeHead(proxyRes.statusCode || 200, headers);
        res.end(body);
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Proxy error: ' + e.message);
      }
    });
  });
  proxyReq.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Target app not reachable at ' + UPSTREAM.url + ' — ' + e.message + '\n\nStudio is up; start your app and refresh.');
  });
  req.pipe(proxyReq);
});

server.listen(PORT, '0.0.0.0', () => {
  const total = (seedCfg.chapters || []).reduce((a, c) => a + (c.steps || []).length, 0);
  console.log('');
  console.log('  DemoStudio (AI)');
  console.log('  ────────────────');
  console.log('  Target : ' + (UPSTREAM ? UPSTREAM.url : '(none — connect via Studio URL bar)'));
  console.log('  Studio : http://localhost:' + PORT);
  console.log('  Save   : ' + OUT_PATH);
  console.log('  Seed   : ' + total + ' steps');
  console.log('');
  console.log('  Open the Studio URL. Click 🎯 Pick element, then');
  console.log('  click the real app elements to build your tour.');
  console.log('');
  console.log('  Rebind target at runtime:');
  console.log("    curl -X POST " + ROUTE + "studio/target -d '{\"url\":\"http://other:9999\"}'");
  console.log('');
});
