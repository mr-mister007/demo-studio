#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   DemoStudio (Reprise AI Edition)
   Proxies any web application, captures DOM snapshots, runs
   in-place visual editing, auto-generates enterprise demos via AI,
   and exports standalone interactive offline packages.

   Usage:
     node studio.js [--url <target>] [--port <n>] [--config <seed>] [--out <path>]
   ════════════════════════════════════════════════════════════════ */
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ── AI Configuration & Keys ──────────────────────────────────
let AI_KEY = process.env.OPENROUTER_API_KEY || null;
let GEMINI_KEY = process.env.GEMINI_API_KEY || null;
try {
  const atlas = fs.readFileSync(path.join(process.env.HOME, '.atlas', 'atlas.yaml'), 'utf8');
  const k = atlas.match(/api_key:\s*["']?([^"'\s]+)/);
  if (k && !AI_KEY) AI_KEY = k[1].trim();
} catch (e) { /* no atlas.yaml */ }

const AI_MODELS = [
  'openrouter/free',
  'poolside/laguna-s-2.1:free',
  'nex-agi/nex-n2.5-pro:free',
  'cohere/north-mini-code:free',
  'liquid/lfm-2.5-2.6b:free',
  'dots-studio/dots-3-note-preview:free'
];
let AI_MODEL = AI_MODELS[0];
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; }

let TARGET_URL = arg('--url', null);
const PORT = parseInt(arg('--port', '8940'), 10);
const CONFIG_PATH = arg('--config', null);
const OUT_PATH = arg('--out', path.join(process.cwd(), 'built-demo-config.js'));
const EXPORT_DIR = path.join(process.cwd(), 'built-demo');

const ROUTE = '/__tour/';
const ENGINE_JS   = path.join(__dirname, '..', 'demo-engine.js');
const ENGINE_CSS  = path.join(__dirname, '..', 'demo-engine.css');
const STUDIO_JS   = path.join(__dirname, 'studio-overlay.js');
const STUDIO_CSS  = path.join(__dirname, 'studio-overlay.css');
const SNAPSHOT_JS = path.join(__dirname, '..', 'lib', 'snapshot-engine.js');
const PLAYER_DIR  = path.join(__dirname, '..', 'player');
const DASHBOARD_HTML = path.join(__dirname, 'dashboard.html');

// ── Multi-Demo Persistent Storage & Active State ─────────────
const storage = require('./storage');
let ACTIVE_DEMO_ID = null;

// ── In-Memory Screen Snapshots ────────────────────────────────
const CAPTURED_SCREENS = {};

// ── Target parsing ───────────────────────────────────────────
function parseTarget(raw) {
  const u = new URL(raw);
  const protocol = u.protocol === 'https:' ? 'https' : 'http';
  const hostname = u.hostname === 'localhost' ? '127.0.0.1' : u.hostname;
  const port = parseInt(u.port || (protocol === 'https' ? '443' : '80'), 10);
  return { protocol, host: hostname, port, url: protocol + '://' + hostname + ':' + port + '/' };
}
let UPSTREAM = null;
if (TARGET_URL) {
  try { UPSTREAM = parseTarget(TARGET_URL); } catch (e) { console.error('Bad --url: ' + e.message); process.exit(1); }
}

// ── Welcome page (Material 3 Onboarding Screen) ──────────────
function welcomeHtml() {
  const assets =
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet">' +
    '<link rel="stylesheet" href="/__tour/demo-engine.css">' +
    '<link rel="stylesheet" href="/__tour/studio/studio-overlay.css">' +
    '<script src="/__tour/snapshot-engine.js" defer></script>' +
    '<script src="/__tour/studio/studio-overlay.js" defer></script>';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DemoStudio — Enter Target Application</title>
  ${assets}
  <style>
    :root {
      --md-sys-color-primary: #a8c7fa;
      --md-sys-color-on-primary: #062e6f;
      --md-sys-color-primary-container: #0842a0;
      --md-sys-color-on-primary-container: #d3e3fd;
      --md-sys-color-surface: #111318;
      --md-sys-color-surface-dim: #111318;
      --md-sys-color-surface-container: #1e1f25;
      --md-sys-color-surface-container-high: #282a30;
      --md-sys-color-surface-container-highest: #33353b;
      --md-sys-color-on-surface: #e2e2e9;
      --md-sys-color-on-surface-variant: #c4c6d0;
      --md-sys-color-outline: #8e9099;
      --md-sys-color-outline-variant: #44474f;
      --md-sys-color-secondary-container: #3d4758;
      --md-sys-color-on-secondary-container: #d9e3f8;
      --md-elevation-1: 0 1px 3px 1px rgba(0,0,0,0.15), 0 1px 2px 0 rgba(0,0,0,0.30);
      --md-elevation-2: 0 2px 6px 2px rgba(0,0,0,0.15), 0 1px 2px 0 rgba(0,0,0,0.30);
      --md-elevation-3: 0 4px 8px 3px rgba(0,0,0,0.15), 0 1px 3px 0 rgba(0,0,0,0.30);
      --md-shape-corner-full: 9999px;
      --md-shape-corner-extra-large: 28px;
      --md-shape-corner-large: 16px;
      --md-shape-corner-medium: 12px;
      --md-shape-corner-small: 8px;
    }

    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      background: #0b0d11;
      color: var(--md-sys-color-on-surface);
      font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background-image: radial-gradient(circle at 50% 20%, rgba(26, 115, 232, 0.12) 0%, transparent 60%);
    }

    .m3-card {
      background: var(--md-sys-color-surface-container);
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: var(--md-shape-corner-extra-large);
      padding: 40px 36px;
      max-width: 620px;
      width: 100%;
      box-shadow: var(--md-elevation-3);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      position: relative;
    }

    .m3-brand-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: var(--md-shape-corner-full);
      background: var(--md-sys-color-primary-container);
      color: var(--md-sys-color-on-primary-container);
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.02em;
      margin-bottom: 20px;
    }

    .m3-brand-badge .material-symbols-outlined {
      font-size: 16px;
    }

    .m3-card h1 {
      font-size: 28px;
      font-weight: 400;
      color: var(--md-sys-color-on-surface);
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }

    .m3-card p {
      font-size: 14px;
      line-height: 1.5;
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 32px;
      max-width: 480px;
    }

    .m3-input-wrapper {
      width: 100%;
      margin-bottom: 24px;
      text-align: left;
    }

    .m3-field-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--md-sys-color-primary);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .m3-field-label .material-symbols-outlined {
      font-size: 16px;
    }

    .m3-input-group {
      display: flex;
      gap: 10px;
      width: 100%;
    }

    .m3-input-container {
      position: relative;
      flex: 1;
      display: flex;
      align-items: center;
    }

    .m3-input-icon {
      position: absolute;
      left: 14px;
      color: var(--md-sys-color-outline);
      font-size: 20px;
      pointer-events: none;
    }

    .m3-text-field {
      width: 100%;
      height: 52px;
      padding: 0 16px 0 46px;
      border-radius: var(--md-shape-corner-large);
      border: 1.5px solid var(--md-sys-color-outline-variant);
      background: var(--md-sys-color-surface-container-high);
      color: var(--md-sys-color-on-surface);
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .m3-text-field:focus {
      border-color: var(--md-sys-color-primary);
      box-shadow: 0 0 0 2px rgba(168, 199, 250, 0.25);
    }

    .m3-text-field::placeholder {
      color: var(--md-sys-color-outline);
    }

    .m3-btn-filled {
      height: 52px;
      padding: 0 24px;
      border-radius: var(--md-shape-corner-full);
      background: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      border: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: background 0.15s, transform 0.1s;
      flex-shrink: 0;
    }

    .m3-btn-filled:hover {
      background: #c2e7ff;
    }

    .m3-btn-filled:active {
      transform: scale(0.98);
    }

    .m3-presets-section {
      width: 100%;
      text-align: left;
      border-top: 1px solid var(--md-sys-color-outline-variant);
      padding-top: 24px;
    }

    .m3-presets-title {
      font-size: 12px;
      font-weight: 500;
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .m3-presets-title .material-symbols-outlined {
      font-size: 16px;
    }

    .m3-preset-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .m3-preset-card {
      background: var(--md-sys-color-surface-container-high);
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: var(--md-shape-corner-medium);
      padding: 12px 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      text-align: left;
      transition: border-color 0.15s, background 0.15s;
    }

    .m3-preset-card:hover {
      border-color: var(--md-sys-color-primary);
      background: var(--md-sys-color-surface-container-highest);
    }

    .m3-preset-icon {
      width: 34px;
      height: 34px;
      border-radius: var(--md-shape-corner-small);
      background: var(--md-sys-color-secondary-container);
      color: var(--md-sys-color-on-secondary-container);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .m3-preset-icon .material-symbols-outlined {
      font-size: 18px;
    }

    .m3-preset-info {
      flex: 1;
      overflow: hidden;
    }

    .m3-preset-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--md-sys-color-on-surface);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .m3-preset-url {
      font-size: 11px;
      color: var(--md-sys-color-outline);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .m3-features-row {
      display: flex;
      justify-content: center;
      gap: 16px;
      margin-top: 24px;
      flex-wrap: wrap;
    }

    .m3-feature-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      color: var(--md-sys-color-on-surface-variant);
      background: var(--md-sys-color-surface-container-high);
      border: 1px solid var(--md-sys-color-outline-variant);
      padding: 4px 10px;
      border-radius: var(--md-shape-corner-small);
    }

    .m3-feature-chip .material-symbols-outlined {
      font-size: 14px;
      color: var(--md-sys-color-primary);
    }
  </style>
</head>
<body>
  <div class="m3-card">
    <div class="m3-brand-badge">
      <span class="material-symbols-outlined">auto_awesome</span>
      DemoStudio Digital Twin
    </div>
    <h1>Enter Target Website</h1>
    <p>Provide the URL of any web application or website to launch the interactive demo studio and capture DOM states.</p>

    <div class="m3-input-wrapper">
      <div class="m3-field-label">
        <span class="material-symbols-outlined">link</span>
        Website or Application URL
      </div>
      <div class="m3-input-group">
        <div class="m3-input-container">
          <span class="material-symbols-outlined m3-input-icon">public</span>
          <input type="url" id="welcome-target-input" class="m3-text-field" placeholder="https://example.com or http://localhost:3000" autofocus />
        </div>
        <button class="m3-btn-filled" onclick="connectTarget()">
          <span>Launch Studio</span>
          <span class="material-symbols-outlined">arrow_forward</span>
        </button>
      </div>
    </div>

    <div class="m3-presets-section">
      <div class="m3-presets-title">
        <span class="material-symbols-outlined">bookmark</span>
        Quick Start Presets
      </div>
      <div class="m3-preset-grid">
        <div class="m3-preset-card" onclick="selectPreset('http://127.0.0.1:3200')">
          <div class="m3-preset-icon">
            <span class="material-symbols-outlined">query_stats</span>
          </div>
          <div class="m3-preset-info">
            <div class="m3-preset-name">PulseMetrics SaaS</div>
            <div class="m3-preset-url">http://127.0.0.1:3200</div>
          </div>
        </div>

        <div class="m3-preset-card" onclick="selectPreset('https://linear.app')">
          <div class="m3-preset-icon">
            <span class="material-symbols-outlined">check_circle</span>
          </div>
          <div class="m3-preset-info">
            <div class="m3-preset-name">Linear App</div>
            <div class="m3-preset-url">https://linear.app</div>
          </div>
        </div>

        <div class="m3-preset-card" onclick="selectPreset('https://stripe.com')">
          <div class="m3-preset-icon">
            <span class="material-symbols-outlined">credit_card</span>
          </div>
          <div class="m3-preset-info">
            <div class="m3-preset-name">Stripe Payments</div>
            <div class="m3-preset-url">https://stripe.com</div>
          </div>
        </div>

        <div class="m3-preset-card" onclick="selectPreset('http://localhost:3000')">
          <div class="m3-preset-icon">
            <span class="material-symbols-outlined">terminal</span>
          </div>
          <div class="m3-preset-info">
            <div class="m3-preset-name">Local Dev Server</div>
            <div class="m3-preset-url">http://localhost:3000</div>
          </div>
        </div>
      </div>
    </div>

    <div class="m3-features-row">
      <div class="m3-feature-chip">
        <span class="material-symbols-outlined">psychology</span>
        Google Gemini 2.5
      </div>
      <div class="m3-feature-chip">
        <span class="material-symbols-outlined">camera</span>
        DOM State Sandbox
      </div>
      <div class="m3-feature-chip">
        <span class="material-symbols-outlined">download</span>
        Zero-Server Export
      </div>
    </div>
  </div>

  <script>
    function selectPreset(url) {
      document.getElementById('welcome-target-input').value = url;
      connectTarget();
    }

    function connectTarget() {
      let u = (document.getElementById('welcome-target-input').value || '').trim();
      if (!u) return alert('Please enter a target website URL');
      if (!/^https?:\\/\\//i.test(u)) {
        u = 'https://' + u;
      }
      const btn = document.querySelector('.m3-btn-filled');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined" style="animation:spin 1s infinite linear">sync</span> Connecting…';
      }
      fetch('/__tour/studio/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u })
      }).then(r => r.json()).then(data => {
        if (data.ok) location.href = '/';
        else {
          alert('Error: ' + data.error);
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Launch Studio</span><span class="material-symbols-outlined">arrow_forward</span>';
          }
        }
      }).catch(err => {
        alert('Network connection error: ' + err.message);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>Launch Studio</span><span class="material-symbols-outlined">arrow_forward</span>';
        }
      });
    }

    document.getElementById('welcome-target-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') connectTarget();
    });
  </script>
</body>
</html>`;
}

// ── Default Config ────────────────────────────────────────────
function defaultCfg() {
  return {
    appName: 'DemoStudio App',
    launchTitle: 'Take an Interactive Product Demo',
    launchBody: 'Explore this hands-on walkthrough with real interactions and state transitions.',
    startLabel: 'Start Demo',
    dismissLabel: 'Explore on my own',
    accent: '#3b82f6',
    chapters: []
  };
}
let seedCfg = defaultCfg();
let SAVED_CFG = null;

if (CONFIG_PATH && fs.existsSync(CONFIG_PATH)) {
  try {
    const src = fs.readFileSync(CONFIG_PATH, 'utf8');
    const m = src.match(/__TOUR_CONFIG\s*=\s*(\{[\s\S]*\})\s*;?\s*$/m) ||
              src.match(/module\.exports\s*=\s*(\{[\s\S]*\})\s*;?\s*$/m);
    if (m) {
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
  const ext = path.extname(file);
  const type = ext === '.css' ? 'text/css' : (ext === '.html' ? 'text/html' : 'application/javascript');
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

function injectAssets(html) {
  const assets =
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet">' +
    '<link rel="stylesheet" href="' + ROUTE + 'demo-engine.css">' +
    '<link rel="stylesheet" href="' + ROUTE + 'studio/studio-overlay.css">' +
    '<script src="' + ROUTE + 'snapshot-engine.js" defer></script>' +
    '<script src="' + ROUTE + 'demo-config.js" defer></script>' +
    '<script src="' + ROUTE + 'demo-engine.js" defer></script>' +
    '<script src="' + ROUTE + 'studio/studio-overlay.js" defer></script>';
  if (html.includes('</body>')) return html.replace('</body>', assets + '\n</body>');
  return html + assets;
}

// ── JSON Repair for LLM Outputs ──────────────────────────────
function repairJson(s) {
  s = s.replace(/,\s*([}\]])/g, '$1');
  s = s.replace(/"([^"]*)\n([^"]*)"/g, (m, a, b) => '"' + a.replace(/\n/g, ' ').replace(/\r/g, ' ') + b.replace(/\n/g, ' ').replace(/\r/g, ' ') + '"');
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
  if (inStr) s += '"';
  while (stack.length) {
    const open = stack.pop();
    s += open === '{' ? '}' : ']';
  }
  return s;
}

// ── Autonomous Context-Aware Heuristic Demo Generator ────────
function inferElementContext(el, appName) {
  const text = (el.text || '').trim();
  const lower = text.toLowerCase();
  const tag = el.tag || '';

  // 1. Search / Query
  if (lower.includes('search') || lower.includes('find') || lower.includes('lookup') || el.sel.includes('search')) {
    return {
      title: text ? `Search: ${text}` : 'Search & Explore',
      body: `Use this search bar to quickly locate items, documents, or content across ${appName}.`,
      action: false
    };
  }

  // 2. Authentication / Profile
  if (lower.includes('sign in') || lower.includes('log in') || lower.includes('login') || lower.includes('signin')) {
    return {
      title: text || 'Sign In',
      body: `Click here to log into your account and access personalized preferences.`,
      action: true
    };
  }
  if (lower.includes('sign up') || lower.includes('register') || lower.includes('get started') || lower.includes('join')) {
    return {
      title: text || 'Get Started',
      body: `Click here to sign up or create a new workspace.`,
      action: true
    };
  }

  // 3. E-commerce / Shopping
  if (lower.includes('cart') || lower.includes('bag') || lower.includes('basket')) {
    return {
      title: text ? `View ${text}` : 'Shopping Cart',
      body: `Review your selected items and proceed to the checkout screen.`,
      action: true
    };
  }
  if (lower.includes('add to cart') || lower.includes('buy') || lower.includes('purchase')) {
    return {
      title: text || 'Add to Cart',
      body: `Click to select and add this item to your order.`,
      action: true
    };
  }

  // 4. Creation / Actions
  if (lower.includes('create') || lower.includes('new') || lower.includes('add') || lower.includes('upload')) {
    return {
      title: text || 'Create New Item',
      body: `Click here to create or upload new content directly to ${appName}.`,
      action: true
    };
  }

  // 5. Documentation / Help
  if (lower.includes('doc') || lower.includes('guide') || lower.includes('help') || lower.includes('faq') || lower.includes('support')) {
    return {
      title: text || 'Documentation & Guides',
      body: `Access detailed guides, developer references, and support resources.`,
      action: false
    };
  }

  // 6. Settings / Account
  if (lower.includes('setting') || lower.includes('profile') || lower.includes('config') || lower.includes('preference')) {
    return {
      title: text || 'Preferences & Settings',
      body: `Manage your configurations, workspace preferences, and profile details.`,
      action: false
    };
  }

  // 7. Headings
  if (['H1', 'H2', 'H3'].includes(tag)) {
    return {
      title: text ? text.slice(0, 45) : `Welcome to ${appName}`,
      body: `Explore this section to discover key features and highlighted content on ${appName}.`,
      action: false
    };
  }

  // 8. Primary Buttons
  if (tag === 'BUTTON' || el.role === 'button') {
    return {
      title: text ? `Action: ${text.slice(0, 35)}` : 'Interactive Feature',
      body: `Click "${text || 'this button'}" to interact with this feature.`,
      action: true
    };
  }

  // 9. Navigation Links
  if (tag === 'A' || el.role === 'navigation') {
    return {
      title: text ? `Explore ${text.slice(0, 35)}` : 'Navigation Link',
      body: `Navigate to the ${text || 'page'} section to view related tools and resources.`,
      action: false
    };
  }

  // Fallback
  return {
    title: text ? text.slice(0, 40) : `Feature Highlight`,
    body: `Discover how this capability enhances your workflow on ${appName}.`,
    action: false
  };
}

function generateAutonomousHeuristicDemo(dom, appName, targetUrl, metaDescription) {
  const brand = (appName || 'This Application').replace(/[\r\n]+/g, ' ').trim().slice(0, 50);
  const chapters = [];

  const heroes = dom.filter(d => d.zone === 'hero' || ['H1', 'H2'].includes(d.tag));
  const navs = dom.filter(d => d.zone === 'navigation' || d.tag === 'A');
  const actions = dom.filter(d => d.zone === 'action' || d.tag === 'BUTTON' || d.role === 'button');
  const inputs = dom.filter(d => d.zone === 'input' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(d.tag));
  const stats = dom.filter(d => d.zone === 'stat' || ['TABLE', 'H3'].includes(d.tag));

  // Chapter 1: Overview & Navigation
  const ch1Steps = [];
  const hookEl = heroes[0] || dom[0];
  if (hookEl) {
    const ctx = inferElementContext(hookEl, brand);
    ch1Steps.push({
      title: ctx.title,
      body: metaDescription ? metaDescription.slice(0, 160) : ctx.body,
      sel: hookEl.sel,
      pos: hookEl.optimalPos || 'bottom',
      action: false
    });
  }
  const navEl = navs.find(n => n.sel !== hookEl?.sel);
  if (navEl) {
    const ctx = inferElementContext(navEl, brand);
    ch1Steps.push({
      title: ctx.title,
      body: ctx.body,
      sel: navEl.sel,
      pos: navEl.optimalPos || 'bottom',
      action: false
    });
  }
  if (ch1Steps.length) {
    chapters.push({ title: 'Overview & Navigation', steps: ch1Steps });
  }

  // Chapter 2: Interactive Workflows & Actions
  const ch2Steps = [];
  const inputEl = inputs[0];
  if (inputEl && inputEl.sel !== hookEl?.sel && inputEl.sel !== navEl?.sel) {
    const ctx = inferElementContext(inputEl, brand);
    ch2Steps.push({
      title: ctx.title,
      body: ctx.body,
      sel: inputEl.sel,
      pos: inputEl.optimalPos || 'bottom',
      action: false
    });
  }

  const primaryAction = actions.find(a => a.sel !== hookEl?.sel && a.sel !== navEl?.sel && a.sel !== inputEl?.sel);
  if (primaryAction) {
    const ctx = inferElementContext(primaryAction, brand);
    ch2Steps.push({
      title: ctx.title,
      body: `Click here to interact with this feature.`,
      sel: primaryAction.sel,
      pos: primaryAction.optimalPos || 'top',
      action: true
    });
  }

  const outcomeEl = stats[0] || actions.filter(a => a.sel !== primaryAction?.sel)[0] || dom.find(d => !ch1Steps.some(s => s.sel === d.sel) && !ch2Steps.some(s => s.sel === d.sel));
  if (outcomeEl) {
    const ctx = inferElementContext(outcomeEl, brand);
    ch2Steps.push({
      title: ctx.title,
      body: ctx.body,
      sel: outcomeEl.sel,
      pos: outcomeEl.optimalPos || 'top',
      action: false
    });
  }
  if (ch2Steps.length) {
    chapters.push({ title: 'Interactive Workflows', steps: ch2Steps });
  }

  return {
    appName: brand,
    launchTitle: `Welcome to ${brand}`,
    launchBody: metaDescription || `Take a quick guided interactive walkthrough of ${brand}.`,
    startLabel: 'Start Interactive Demo',
    dismissLabel: 'Explore on my own',
    accent: '#3b82f6',
    chapters
  };
}

function generateTourFromRecordedSession(actions = [], screens = [], appName = 'My App', targetUrl = '') {
  const filtered = [];
  let lastSel = null;
  let lastTime = 0;
  for (const a of actions) {
    const t = a.timestamp || 0;
    if (a.sel === lastSel && t - lastTime < 1000) continue;
    filtered.push(a);
    lastSel = a.sel;
    lastTime = t;
  }
  const cleanActions = filtered.length ? filtered : actions;

  const chapters = [];
  const screenGroups = new Map();
  cleanActions.forEach(act => {
    const scKey = act.screenId || 'default';
    if (!screenGroups.has(scKey)) screenGroups.set(scKey, []);
    screenGroups.get(scKey).push(act);
  });

  const screenNameMap = new Map((screens || []).map(s => [s.id, s.name]));

  if (screenGroups.size > 1) {
    let chIdx = 1;
    for (const [scId, acts] of screenGroups.entries()) {
      const scName = screenNameMap.get(scId) || `Screen ${chIdx}`;
      const chTitle = chIdx === 1 ? `Overview: ${scName}` : `Workflow: ${scName}`;
      chapters.push({
        title: chTitle,
        steps: acts.map(a => actionToStep(a, appName))
      });
      chIdx++;
    }
  } else {
    if (cleanActions.length <= 3) {
      chapters.push({
        title: 'Walkthrough & Key Actions',
        steps: cleanActions.map(a => actionToStep(a, appName))
      });
    } else {
      const mid = Math.ceil(cleanActions.length / 2);
      chapters.push({
        title: 'Exploration & Setup',
        steps: cleanActions.slice(0, mid).map(a => actionToStep(a, appName))
      });
      chapters.push({
        title: 'Core Actions & Workflow',
        steps: cleanActions.slice(mid).map(a => actionToStep(a, appName))
      });
    }
  }

  return {
    appName: appName || 'Interactive Demo',
    launchTitle: `Welcome to ${appName || 'Interactive Demo'}`,
    launchBody: `Explore this guided interactive walkthrough created from a real user demonstration.`,
    startLabel: 'Start Interactive Demo',
    dismissLabel: 'Explore on my own',
    accent: '#005ac1',
    chapters
  };
}

function actionToStep(act, appName) {
  const text = (act.text || '').trim().replace(/\s+/g, ' ');
  const val = (act.value || '').trim();
  const tag = (act.tag || '').toUpperCase();
  let title = 'Action Step';
  let body = 'Click the highlighted element to proceed.';

  if (act.type === 'input') {
    title = text ? `Enter ${text}` : (act.placeholder ? `Enter ${act.placeholder}` : 'Fill in Details');
    body = val ? `Type "${val}" into this field to configure your workflow.` : 'Enter your information into this input field.';
  } else if (tag === 'BUTTON' || act.role === 'button') {
    if (text) {
      title = text.length > 28 ? text.slice(0, 28) + '...' : text;
      body = `Click "${text}" to execute this action and advance through the workflow.`;
    } else {
      title = 'Click Button';
      body = 'Click this button to proceed to the next step.';
    }
  } else if (tag === 'A' || tag === 'NAV' || act.role === 'tab') {
    title = text ? `Navigate to ${text}` : 'Open Section';
    body = `Select this option to navigate to the corresponding section of ${appName}.`;
  } else if (text) {
    title = text.length > 28 ? text.slice(0, 28) + '...' : text;
    body = `Click here to interact with "${text}".`;
  }

  return {
    title,
    body,
    sel: act.sel,
    pos: act.pos || 'bottom',
    action: true,
    screenId: act.screenId || undefined,
    targetScreen: act.targetScreen || undefined
  };
}

// ── HTTP Server ───────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, 'http://localhost:' + PORT);
  const url = parsedUrl.pathname;
  const cookieHeader = req.headers.cookie || '';
  const isStudioParam = parsedUrl.searchParams.get('mode') === 'studio';
  const hasStudioCookie = cookieHeader.includes('demostudio_mode=studio');

  // ── Reprise Management Dashboard Application ───────────────
  if (url === '/dashboard' || url === ROUTE + 'dashboard') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': 'demostudio_mode=; Path=/; Max-Age=0; SameSite=Lax'
    });
    res.end(fs.readFileSync(DASHBOARD_HTML, 'utf8'));
    return;
  }

  // Root URL: Always serve Dashboard unless explicitly in studio mode
  if ((url === '/' || url === '') && !isStudioParam && (!hasStudioCookie || !UPSTREAM)) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': 'demostudio_mode=; Path=/; Max-Age=0; SameSite=Lax'
    });
    res.end(fs.readFileSync(DASHBOARD_HTML, 'utf8'));
    return;
  }

  // ── Standalone Demo Player Route ─────────────────────────────
  if (url === ROUTE + 'player') {
    const demoId = parsedUrl.searchParams.get('id');
    const demo = demoId ? storage.getDemo(demoId) : null;
    const playerHtml = fs.readFileSync(path.join(PLAYER_DIR, 'index.html'), 'utf8');
    const pkg = {
      config: (demo && demo.config) || SAVED_CFG || seedCfg,
      screens: (demo && demo.screens) || CAPTURED_SCREENS || {}
    };
    const injected = playerHtml
      .replace('<script src="demo-package.js"></script>', '<script>window.__DEMO_PACKAGE = ' + JSON.stringify(pkg) + ';</script>')
      .replace('<script src="player.js"></script>', '<script src="/__tour/player.js"></script>')
      .replace('href="player.css"', 'href="/__tour/player.css"');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(injected);
    return;
  }
  if (url === ROUTE + 'player.js') return serveFile(res, path.join(PLAYER_DIR, 'player.js'));
  if (url === ROUTE + 'player.css') return serveFile(res, path.join(PLAYER_DIR, 'player.css'));

  // ── Load Specific Demo into Studio Proxy ────────────────────
  if (url === ROUTE + 'studio/load') {
    const demoId = parsedUrl.searchParams.get('id');
    const demo = storage.getDemo(demoId);
    if (!demo) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Demo not found: ' + demoId);
      return;
    }
    ACTIVE_DEMO_ID = demo.id;
    try {
      UPSTREAM = parseTarget(demo.targetUrl);
    } catch (e) {
      console.error('Invalid demo targetUrl:', demo.targetUrl);
    }
    SAVED_CFG = demo.config || null;
    for (const k of Object.keys(CAPTURED_SCREENS)) delete CAPTURED_SCREENS[k];
    if (demo.screens) {
      Object.assign(CAPTURED_SCREENS, demo.screens);
    }
    res.writeHead(302, {
      Location: '/?mode=studio',
      'Set-Cookie': 'demostudio_mode=studio; Path=/; SameSite=Lax'
    });
    res.end();
    return;
  }

  // ── Multi-Demo Dashboard REST APIs ───────────────────────────
  if (url === ROUTE + 'api/demos' && req.method === 'GET') {
    sendJSON(res, { ok: true, demos: storage.listDemos() });
    return;
  }

  if (url === ROUTE + 'api/demos' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const demo = storage.createDemo(data);
        sendJSON(res, { ok: true, demo });
      } catch (e) { sendJSON(res, { ok: false, error: e.message }, 400); }
    });
    return;
  }

  if (url.startsWith(ROUTE + 'api/demos/')) {
    const sub = url.slice((ROUTE + 'api/demos/').length);
    const slashIdx = sub.indexOf('/');
    const demoId = decodeURIComponent(slashIdx === -1 ? sub : sub.slice(0, slashIdx));
    const action = slashIdx === -1 ? '' : sub.slice(slashIdx + 1);

    if (action === 'duplicate' && req.method === 'POST') {
      const cloned = storage.duplicateDemo(demoId);
      if (!cloned) return sendJSON(res, { ok: false, error: 'Demo not found' }, 404);
      return sendJSON(res, { ok: true, demo: cloned });
    }

    if (!action && req.method === 'GET') {
      const demo = storage.getDemo(demoId);
      if (!demo) return sendJSON(res, { ok: false, error: 'Demo not found' }, 404);
      return sendJSON(res, { ok: true, demo });
    }

    if (!action && req.method === 'PUT') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const updates = JSON.parse(body);
          const updated = storage.updateDemo(demoId, updates);
          sendJSON(res, { ok: true, demo: updated });
        } catch (e) { sendJSON(res, { ok: false, error: e.message }, 400); }
      });
      return;
    }

    if (!action && req.method === 'DELETE') {
      const success = storage.deleteDemo(demoId);
      return sendJSON(res, { ok: success });
    }
  }

  if (url === ROUTE + 'api/stats' && req.method === 'GET') {
    sendJSON(res, { ok: true, stats: storage.getStats() });
    return;
  }

  // Dynamic config endpoint
  if (url === ROUTE + 'demo-config.js') {
    const body = 'window.__TOUR_CONFIG = ' + JSON.stringify(SAVED_CFG || seedCfg, null, 2) + ';\n';
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }

  // Current config & target status
  if (url === ROUTE + 'studio/current') {
    sendJSON(res, {
      config: SAVED_CFG || seedCfg,
      target: UPSTREAM ? UPSTREAM.url : null,
      activeDemoId: ACTIVE_DEMO_ID,
      hasKey: !!AI_KEY,
      screenCount: Object.keys(CAPTURED_SCREENS).length
    });
    return;
  }

  // Rebind target URL
  if (url === ROUTE + 'studio/target' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        UPSTREAM = parseTarget(JSON.parse(body).url);
        SAVED_CFG = null;
        sendJSON(res, { ok: true, target: UPSTREAM.url });
      } catch (e) { sendJSON(res, { ok: false, error: e.message }, 400); }
    });
    return;
  }

  // Disconnect target and return to Enter Website screen
  if (url === ROUTE + 'studio/disconnect') {
    UPSTREAM = null;
    SAVED_CFG = null;
    ACTIVE_DEMO_ID = null;
    sendJSON(res, { ok: true });
    return;
  }

  // Save Config
  if (url === ROUTE + 'studio/save' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const cfg = JSON.parse(body);
        SAVED_CFG = cfg;
        fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
        fs.writeFileSync(OUT_PATH, 'window.__TOUR_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n');
        if (ACTIVE_DEMO_ID) {
          storage.updateDemo(ACTIVE_DEMO_ID, { config: cfg, screens: CAPTURED_SCREENS });
        }
        const steps = (cfg.chapters || []).reduce((a, c) => a + (c.steps || []).length, 0);
        sendJSON(res, { ok: true, path: OUT_PATH, steps });
      } catch (e) { sendJSON(res, { ok: false, error: e.message }, 400); }
    });
    return;
  }

  // ── Screen Snapshot Capture (Reprise DOM Freeze) ─────────────
  if (url === ROUTE + 'studio/snapshot' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { screenId, screenName, html, meta } = JSON.parse(body);
        const id = screenId || ('screen_' + Date.now());
        CAPTURED_SCREENS[id] = {
          id,
          name: screenName || 'Screen ' + (Object.keys(CAPTURED_SCREENS).length + 1),
          html,
          meta: meta || {}
        };
        console.log('[Snapshot] Stored screen:', id, '(' + (html.length / 1024).toFixed(1) + ' KB)');
        if (ACTIVE_DEMO_ID) {
          storage.updateDemo(ACTIVE_DEMO_ID, { screens: CAPTURED_SCREENS });
        }
        sendJSON(res, { ok: true, screenId: id, totalScreens: Object.keys(CAPTURED_SCREENS).length });
      } catch (e) { sendJSON(res, { ok: false, error: e.message }, 400); }
    });
    return;
  }

  if (url === ROUTE + 'studio/screens' && req.method === 'GET') {
    const list = Object.values(CAPTURED_SCREENS).map(s => ({ id: s.id, name: s.name, meta: s.meta }));
    sendJSON(res, { ok: true, screens: list });
    return;
  }

  if (url === ROUTE + 'studio/screens/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { screenId } = JSON.parse(body);
        if (CAPTURED_SCREENS[screenId]) {
          delete CAPTURED_SCREENS[screenId];
        }
        sendJSON(res, { ok: true, remaining: Object.keys(CAPTURED_SCREENS).length });
      } catch (e) { sendJSON(res, { ok: false, error: e.message }, 400); }
    });
    return;
  }

  if (url === ROUTE + 'studio/screens/rename' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { screenId, name } = JSON.parse(body);
        if (CAPTURED_SCREENS[screenId]) {
          CAPTURED_SCREENS[screenId].name = name;
        }
        sendJSON(res, { ok: true, screenId, name });
      } catch (e) { sendJSON(res, { ok: false, error: e.message }, 400); }
    });
    return;
  }

  // ── Standalone Demo Export (Zero-Server Reprise Package) ─────
  if (url === ROUTE + 'studio/export' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const reqData = body ? JSON.parse(body) : {};
        const cfg = reqData.config || SAVED_CFG || seedCfg;

        fs.mkdirSync(EXPORT_DIR, { recursive: true });

        // Copy player runtime files
        fs.copyFileSync(path.join(PLAYER_DIR, 'index.html'), path.join(EXPORT_DIR, 'index.html'));
        fs.copyFileSync(path.join(PLAYER_DIR, 'player.js'), path.join(EXPORT_DIR, 'player.js'));
        fs.copyFileSync(path.join(PLAYER_DIR, 'player.css'), path.join(EXPORT_DIR, 'player.css'));

        // Prepare screens map
        const screensMap = {};
        for (const [id, s] of Object.entries(CAPTURED_SCREENS)) {
          screensMap[id] = s.html;
        }

        // Write demo-package.js
        const pkgContent =
          '/* DemoStudio Standalone Export Package */\n' +
          'window.__DEMO_PACKAGE = ' +
          JSON.stringify({ config: cfg, screens: screensMap }, null, 2) +
          ';\n';
        fs.writeFileSync(path.join(EXPORT_DIR, 'demo-package.js'), pkgContent, 'utf8');

        console.log('[Export] Standalone demo successfully bundled to:', EXPORT_DIR);
        sendJSON(res, {
          ok: true,
          exportDir: EXPORT_DIR,
          indexPath: path.join(EXPORT_DIR, 'index.html'),
          screensCount: Object.keys(screensMap).length
        });
      } catch (e) {
        console.error('[Export Error]:', e);
        sendJSON(res, { ok: false, error: e.message }, 500);
      }
    });
    return;
  }

  // ── AI Agent Conversational Tour Chat & Refinement ───────────
  if (url === ROUTE + 'studio/ai-chat' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { message, config: currentConfig, dom, apiKey, llmModel, llmEndpoint } = JSON.parse(body);
        const effectiveKey = apiKey || AI_KEY;

        const systemInstruction =
          'You are an AI Product Demo Architect and Assistant for DemoStudio. ' +
          'Users chat with you to inspect their web application, request changes to their demo walkthrough, or re-write steps. ' +
          'If the user asks to modify the tour (e.g. "make it more concise", "add a step for search", "change accent color", "re-order chapters"), ' +
          'you must respond with helpful advice and provide an updated JSON demo configuration under a ```json ... ``` code block. ' +
          'If they ask general questions about the demo or product, answer informatively with actionable advice.';

        const chatPrompt =
          `USER MESSAGE: "${message}"\n\n` +
          `CURRENT DEMO CONFIGURATION:\n` + JSON.stringify(currentConfig || {}, null, 2) + `\n\n` +
          `AVAILABLE DOM ELEMENTS ON SCREEN (${(dom || []).length} items):\n` +
          (dom || []).slice(0, 40).map(d => `- [${d.tag}] "${d.text || ''}" | sel: ${d.sel}`).join('\n');

        let reply = '';
        let updatedConfig = null;

        const isGemini = (apiKey && apiKey.startsWith('AIzaSy')) || GEMINI_KEY || (llmEndpoint && llmEndpoint.includes('googleapis'));
        const geminiKey = (apiKey && apiKey.startsWith('AIzaSy')) ? apiKey : (GEMINI_KEY || apiKey);

        if (isGemini && geminiKey) {
          const modelName = llmModel || 'gemini-2.5-flash';
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;
          const gRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: systemInstruction + '\n\n' + chatPrompt }] }],
              generationConfig: { temperature: 0.4 }
            })
          });
          if (gRes.ok) {
            const gData = await gRes.json();
            reply = gData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          }
        }

        if (!reply && effectiveKey) {
          const endpoint = llmEndpoint || OPENROUTER_URL;
          const llmRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + effectiveKey,
              'HTTP-Referer': 'http://localhost:8940',
              'X-Title': 'DemoStudio'
            },
            body: JSON.stringify({
              model: llmModel || 'openrouter/free',
              messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: chatPrompt }
              ],
              temperature: 0.4
            })
          });
          if (llmRes.ok) {
            const data = await llmRes.json();
            reply = data.choices?.[0]?.message?.content || '';
          }
        }

        if (!reply) {
          reply = `I have received your request: "${message}". To unlock live conversational tour rewrites, please configure your Google Gemini API key in Intelligence Settings.`;
        }

        // Check if an updated configuration was returned in code block
        const jsonMatch = reply.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          try {
            updatedConfig = JSON.parse(jsonMatch[1]);
          } catch (e) {
            try { updatedConfig = JSON.parse(repairJson(jsonMatch[1])); } catch (err) {}
          }
        }

        sendJSON(res, { ok: true, reply, updatedConfig, config: updatedConfig });
      } catch (e) {
        console.error('[AI Chat Error]:', e);
        sendJSON(res, { ok: false, error: e.message }, 500);
      }
    });
    return;
  }

  // ── AI Autonomous Demo Generation ─────────────────────────────
  if (url === ROUTE + 'studio/ai-generate' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { dom, url: targetUrl, appName, apiKey, provider, llmEndpoint, llmModel, metaDescription } = JSON.parse(body);
        const effectiveKey = apiKey || AI_KEY;

        const sample = (dom || []).slice(0, 120);
        if (!sample.length) {
          return sendJSON(res, { ok: false, error: 'No interactive elements detected on page.' }, 400);
        }
        const endpoint = llmEndpoint || OPENROUTER_URL;
        const candidateModels = llmModel ? [llmModel] : (endpoint.includes('openrouter.ai') ? AI_MODELS : ['default']);

        // If no AI key configured and no local LLM endpoint, use context-aware autonomous heuristics
        if (!effectiveKey && !llmEndpoint) {
          console.log('[AI] No LLM API key provided; using context-aware autonomous heuristic engine.');
          const heuristicCfg = generateAutonomousHeuristicDemo(sample, appName, targetUrl, metaDescription);
          SAVED_CFG = heuristicCfg;
          return sendJSON(res, {
            ok: true,
            config: heuristicCfg,
            model: 'autonomous-heuristic-engine',
            note: 'Generated via DemoStudio Context-Aware Autonomous Engine'
          });
        }

        // Group inventory by semantic category for high-accuracy LLM prompting
        const heroItems = sample.filter(d => d.zone === 'hero');
        const navItems = sample.filter(d => d.zone === 'navigation');
        const actionItems = sample.filter(d => d.zone === 'action');
        const inputItems = sample.filter(d => d.zone === 'input');
        const statItems = sample.filter(d => d.zone === 'stat');
        const contentItems = sample.filter(d => d.zone === 'content');

        const formatSection = (title, items) => {
          if (!items.length) return '';
          return `[${title}]\n` + items.map(d => `- ${d.tag} | "${d.text || ''}" | sel: ${d.sel} | optimalPos: ${d.optimalPos || 'bottom'}`).join('\n') + '\n\n';
        };

        const structuredInventory =
          formatSection('HERO & VALUE PROPOSITION (Top priority for opening Hook)', heroItems) +
          formatSection('NAVIGATION & PRIMARY SECTION TABS (Priority for exploration)', navItems) +
          formatSection('CORE ACTIONS & INTERACTIVE BUTTONS (Priority for click steps)', actionItems) +
          formatSection('INPUTS & SEARCH CONTROLS (Priority for user workflow)', inputItems) +
          formatSection('METRICS & HIGHLIGHTED STATS (Priority for outcome/value proof)', statItems) +
          formatSection('ADDITIONAL INTERFACE ELEMENTS', contentItems.slice(0, 15));

        const prompt = `You are an elite product marketing and onboarding engineer designing an interactive demo for "${appName || targetUrl || 'the app'}".
${metaDescription ? `App Overview: "${metaDescription}"\n` : ''}

🎯 MISSION: Create a high-converting, professional, 5 to 7-step interactive demo across 2 chapters that tells a compelling story about this specific website.

STORYTELLING BLUEPRINT (Follow this exact progression):
Chapter 1: "Product Overview & Navigation"
  • Step 1 (The Hook): Select an element from [HERO & VALUE PROPOSITION] or a prominent headline. Introduce the application's core purpose in 1 punchy sentence. Set "action": false.
  • Step 2 (Explore): Select an element from [NAVIGATION & PRIMARY SECTION TABS]. Guide the user to a key section or tool. Set "action": false.
Chapter 2: "Core Interactive Experience"
  • Step 3 (Primary Action): Select an element from [CORE ACTIONS & INTERACTIVE BUTTONS] or [INPUTS & SEARCH CONTROLS]. Highlight a real feature and set "action": true so the user must click it! Body text MUST instruct: "Click here to [perform action]...".
  • Step 4 (The Outcome/Value): Select an element from [METRICS & HIGHLIGHTED STATS] or a key feature card to showcase the result. Set "action": false.
  • Step 5 (Call to Action / Finish): Select the primary conversion CTA button (e.g. "Get Started", "Sign Up", "Deploy", or "Export") to conclude the tour.

CRITICAL PRECISION RULES:
1. SELECTOR INTEGRITY: Every step's "sel" property MUST BE AN EXACT, VERBATIM COPY of one of the "sel" strings provided below. NEVER invent, truncate, or alter selectors.
2. POSITIONING: Set each step's "pos" to the "optimalPos" specified for that element (e.g. "top", "bottom", "left", "right").
3. ACCURACY: Tailor all titles and descriptions to the specific text, buttons, and purpose of this website. Do not mention generic SaaS metrics if this is an e-commerce store, developer tool, or portfolio.
4. Output STRICT, VALID JSON only.

DOM INVENTORY (Grouped by Category & Prominence):
${structuredInventory}

JSON OUTPUT SCHEMA:
{
  "appName": "${appName || 'My App'}",
  "launchTitle": "Welcome to ${appName || 'Interactive Demo'}",
  "launchBody": "${metaDescription || 'Explore key features and workflows in this interactive walkthrough.'}",
  "startLabel": "Start Interactive Demo",
  "dismissLabel": "Explore on my own",
  "accent": "#3b82f6",
  "chapters": [
    {
      "title": "Overview & Navigation",
      "steps": [
        {
          "title": "Clear headline",
          "body": "Engaging, value-focused explanation.",
          "sel": "${sample[0]?.sel || 'button'}",
          "pos": "${sample[0]?.optimalPos || 'bottom'}",
          "action": false
        }
      ]
    },
    {
      "title": "Interactive Experience",
      "steps": [
        {
          "title": "Interactive Action",
          "body": "Click the highlighted button to proceed.",
          "sel": "${(actionItems[0] || sample[0])?.sel || 'button'}",
          "pos": "${(actionItems[0] || sample[0])?.optimalPos || 'top'}",
          "action": true
        }
      ]
    }
  ]
}`;

        let raw = null;
        let usedModel = candidateModels[0];

        // ── Google Gemini Integration ──────────────────────────────
        const isGemini = (apiKey && apiKey.startsWith('AIzaSy')) || GEMINI_KEY || (llmEndpoint && llmEndpoint.includes('googleapis'));
        const geminiKey = (apiKey && apiKey.startsWith('AIzaSy')) ? apiKey : (GEMINI_KEY || apiKey);

        if (isGemini && geminiKey) {
          const geminiModel = llmModel || 'gemini-2.5-flash';
          console.log('[AI] Calling Google Gemini API with model:', geminiModel);
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 45000);
            const gRes = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    role: 'user',
                    parts: [{ text: prompt }]
                  }
                ],
                generationConfig: {
                  responseMimeType: 'application/json',
                  temperature: 0.2
                }
              }),
              signal: ctrl.signal
            });
            clearTimeout(timer);
            if (gRes.ok) {
              const gData = await gRes.json();
              raw = gData.candidates?.[0]?.content?.parts?.[0]?.text;
              usedModel = 'gemini/' + geminiModel;
              console.log('[AI] Gemini response received (' + (raw ? raw.length : 0) + ' chars)');
            } else {
              const errTxt = await gRes.text();
              console.warn('[AI] Gemini API error:', gRes.status, errTxt.slice(0, 150));
            }
          } catch (e) {
            console.error('[AI] Gemini request threw:', e.message);
          }
        }

        // ── OpenRouter / Custom OpenAI-Compatible LLM Loop ─────────
        if (!raw) {
          for (let attempt = 0; attempt < candidateModels.length; attempt++) {
            const model = candidateModels[attempt];
            try {
              const ctrl = new AbortController();
              const timer = setTimeout(() => ctrl.abort(), 40000);
              const headers = { 'Content-Type': 'application/json' };
              if (effectiveKey) headers['Authorization'] = 'Bearer ' + effectiveKey;
              if (endpoint.includes('openrouter.ai')) {
                headers['HTTP-Referer'] = 'http://localhost:8940';
                headers['X-Title'] = 'DemoStudio';
              }
              const llmRes = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  model: model === 'default' ? undefined : model,
                  messages: [
                    { role: 'system', content: 'You generate interactive product demos as strict JSON. Never wrap in fences.' },
                    { role: 'user', content: prompt }
                  ],
                  temperature: 0.3,
                  max_tokens: 3500,
                  response_format: { type: 'json_object' }
                }),
                signal: ctrl.signal
              });
              clearTimeout(timer);
              if (!llmRes.ok) {
                console.warn('[AI] Model ' + model + ' error status: ' + llmRes.status);
                continue;
              }
              const data = await llmRes.json();
              const content = data.choices?.[0]?.message?.content;
              if (content) { raw = content; usedModel = model; break; }
            } catch (e) {
              console.warn('[AI] Attempt failed with model ' + model + ':', e.message);
            }
          }
        }

        // Fallback to heuristic engine if LLM API failed
        if (!raw) {
          console.warn('[AI] All LLM models failed; falling back to heuristic engine.');
          const heuristicCfg = generateAutonomousHeuristicDemo(sample, appName, targetUrl);
          SAVED_CFG = heuristicCfg;
          return sendJSON(res, { ok: true, config: heuristicCfg, model: 'fallback-heuristic-engine' });
        }

        // Parse and validate LLM output
        const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start < 0 || end < 0) {
          const heuristicCfg = generateAutonomousHeuristicDemo(sample, appName, targetUrl);
          return sendJSON(res, { ok: true, config: heuristicCfg, model: 'fallback-heuristic-engine' });
        }

        let cfg;
        try {
          cfg = JSON.parse(cleaned.slice(start, end + 1));
        } catch (e) {
          cfg = JSON.parse(repairJson(cleaned.slice(start, end + 1)));
        }

        // Validate and anchor selectors against verified DOM inventory
        const validSelectorMap = new Map(sample.map(d => [d.sel, d]));
        const usedSelectors = new Set();

        (cfg.chapters || []).forEach(ch => {
          (ch.steps || []).forEach(st => {
            if (validSelectorMap.has(st.sel)) {
              const matched = validSelectorMap.get(st.sel);
              if (!st.pos || !['top', 'bottom', 'left', 'right', 'center'].includes(st.pos)) {
                st.pos = matched.optimalPos || 'bottom';
              }
              usedSelectors.add(st.sel);
            } else {
              // Intelligent recovery for hallucinated or slightly altered selectors
              const targetContext = ((st.title || '') + ' ' + (st.body || '')).toLowerCase();
              let bestMatch = null;
              let bestScore = -1;

              for (const item of sample) {
                let score = 0;
                const itemText = (item.text || '').toLowerCase();

                // Bonus for text similarity
                if (itemText && targetContext.includes(itemText)) score += 15;
                if (itemText && itemText.includes(st.title?.toLowerCase() || '___')) score += 10;

                // Match interaction type
                if (st.action && (item.tag === 'BUTTON' || item.role === 'button' || item.zone === 'action')) score += 8;
                if (!st.action && item.zone === 'hero') score += 4;

                // Penalize already used selectors to ensure diverse steps
                if (usedSelectors.has(item.sel)) score -= 6;

                if (score > bestScore) {
                  bestScore = score;
                  bestMatch = item;
                }
              }

              const chosen = bestMatch || sample.find(s => !usedSelectors.has(s.sel)) || sample[0];
              if (chosen) {
                st.sel = chosen.sel;
                st.pos = chosen.optimalPos || 'bottom';
                usedSelectors.add(chosen.sel);
              }
            }
          });
        });

        SAVED_CFG = cfg;
        sendJSON(res, { ok: true, config: cfg, model: usedModel });
      } catch (e) {
        console.error('[AI Exception]:', e);
        sendJSON(res, { ok: false, error: e.message }, 500);
      }
    });
    return;
  }

  // ── AI Synthesis from Manual Recorded Session ───────────────
  if (url === ROUTE + 'studio/ai-generate-session' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { recordedActions = [], capturedScreens = [], appName, url: targetUrl, apiKey, llmEndpoint, llmModel } = JSON.parse(body);
        if (!recordedActions.length) {
          return sendJSON(res, { ok: false, error: 'No manual demo actions were recorded.' }, 400);
        }

        const effectiveKey = apiKey || AI_KEY;
        const endpoint = llmEndpoint || OPENROUTER_URL;
        const candidateModels = llmModel ? [llmModel] : (endpoint.includes('openrouter.ai') ? AI_MODELS : ['default']);

        // Check if LLM is configured
        const isGemini = (apiKey && apiKey.startsWith('AIzaSy')) || GEMINI_KEY || (llmEndpoint && llmEndpoint.includes('googleapis'));
        const geminiKey = (apiKey && apiKey.startsWith('AIzaSy')) ? apiKey : (GEMINI_KEY || apiKey);

        let raw = null;
        let usedModel = 'session-heuristic-engine';

        // Prepare structured session log for LLM
        const actionsSummary = recordedActions.map((a, idx) => {
          return `${idx + 1}. [${(a.type || 'click').toUpperCase()}] Tag: ${a.tag || 'EL'} | Text: "${(a.text || '').slice(0, 50)}" | Value: "${(a.value || '').slice(0, 40)}" | Selector: ${a.sel} | Position: ${a.pos || 'bottom'} | Screen: ${a.screenName || a.screenId || 'Current'} | TargetScreen: ${a.targetScreen || 'Same'}`;
        }).join('\n');

        const prompt = `You are an elite product marketing and interactive demo onboarding architect.
The user just performed a real manual demonstration of the web application "${appName || targetUrl || 'the app'}".
Below is the exact chronological stream of user interactions, inputs, and screens recorded during their live session:

RECORDED USER DEMO ACTIONS:
${actionsSummary}

🎯 YOUR MISSION:
Transform this user demonstration into a high-converting, professional, multi-chapter interactive guided tour!
1. Organize the recorded actions into 1 to 3 logical narrative Chapters (e.g. "Chapter 1: Discovery & Navigation", "Chapter 2: Configuration & Workflow").
2. For EVERY step, maintain the EXACT verbatim "sel", "pos", "screenId", and "targetScreen" from the recorded action.
3. Write compelling, professional, human-crafted "title" and "body" copy:
   - Explain what the feature is and why the user interacted with it.
   - For clicks, explain what clicking that element does.
   - For inputs, explain what data is being configured.
   - Always set "action": true so the viewer is prompted to click or continue.
4. Return STRICT, VALID JSON only conforming to the schema below.

JSON OUTPUT SCHEMA:
{
  "appName": "${appName || 'Application'}",
  "launchTitle": "Interactive Walkthrough: ${appName || 'Overview'}",
  "launchBody": "Experience this guided interactive walkthrough created from a live product demonstration.",
  "startLabel": "Start Interactive Tour",
  "dismissLabel": "Explore on my own",
  "accent": "#005ac1",
  "chapters": [
    {
      "title": "Chapter Name",
      "steps": [
        {
          "title": "Clear action-oriented title",
          "body": "Value-focused explanation of this step.",
          "sel": "exact_selector_from_actions",
          "pos": "bottom",
          "action": true,
          "screenId": "screen_id_if_present",
          "targetScreen": "target_screen_if_present"
        }
      ]
    }
  ]
}`;

        // Attempt Gemini if available
        if (isGemini && geminiKey) {
          const geminiModel = llmModel || 'gemini-2.5-flash';
          console.log('[AI Session] Calling Google Gemini API with model:', geminiModel);
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 45000);
            const gRes = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
              }),
              signal: ctrl.signal
            });
            clearTimeout(timer);
            if (gRes.ok) {
              const gData = await gRes.json();
              raw = gData.candidates?.[0]?.content?.parts?.[0]?.text;
              usedModel = 'gemini/' + geminiModel;
            }
          } catch (e) {
            console.warn('[AI Session] Gemini request threw:', e.message);
          }
        }

        // Attempt OpenRouter / OpenAI compatible LLMs
        if (!raw && effectiveKey) {
          for (let attempt = 0; attempt < candidateModels.length; attempt++) {
            const model = candidateModels[attempt];
            try {
              const ctrl = new AbortController();
              const timer = setTimeout(() => ctrl.abort(), 40000);
              const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + effectiveKey };
              if (endpoint.includes('openrouter.ai')) {
                headers['HTTP-Referer'] = 'http://localhost:8940';
                headers['X-Title'] = 'DemoStudio';
              }
              const llmRes = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  model: model === 'default' ? undefined : model,
                  messages: [
                    { role: 'system', content: 'You generate interactive product demos as strict JSON. Never wrap in fences.' },
                    { role: 'user', content: prompt }
                  ],
                  temperature: 0.2,
                  response_format: { type: 'json_object' }
                }),
                signal: ctrl.signal
              });
              clearTimeout(timer);
              if (llmRes.ok) {
                const data = await llmRes.json();
                const content = data.choices?.[0]?.message?.content;
                if (content) { raw = content; usedModel = model; break; }
              }
            } catch (e) {
              console.warn('[AI Session] Attempt failed with model ' + model + ':', e.message);
            }
          }
        }

        // Parse or fallback to autonomous session heuristic generator
        let cfg = null;
        if (raw) {
          try {
            const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            const sIdx = cleaned.indexOf('{');
            const eIdx = cleaned.lastIndexOf('}');
            if (sIdx >= 0 && eIdx >= 0) {
              cfg = JSON.parse(cleaned.slice(sIdx, eIdx + 1));
            }
          } catch (e) {
            console.warn('[AI Session] JSON parse failed; using heuristic engine.');
          }
        }

        if (!cfg || !cfg.chapters || !cfg.chapters.length) {
          console.log('[AI Session] Using autonomous session synthesis engine.');
          cfg = generateTourFromRecordedSession(recordedActions, capturedScreens, appName, targetUrl);
          usedModel = 'autonomous-session-engine';
        }

        // Validate and ensure all selectors match recorded actions
        const actionMap = new Map(recordedActions.map(a => [a.sel, a]));
        (cfg.chapters || []).forEach(ch => {
          (ch.steps || []).forEach(st => {
            const matched = actionMap.get(st.sel);
            if (matched) {
              if (!st.pos) st.pos = matched.pos || 'bottom';
              if (matched.screenId && !st.screenId) st.screenId = matched.screenId;
              if (matched.targetScreen && !st.targetScreen) st.targetScreen = matched.targetScreen;
            }
            if (st.action === undefined) st.action = true;
          });
        });

        SAVED_CFG = cfg;
        sendJSON(res, { ok: true, config: cfg, model: usedModel });
      } catch (e) {
        console.error('[AI Session Error]:', e);
        sendJSON(res, { ok: false, error: e.message }, 500);
      }
    });
    return;
  }

  // Static Assets
  if (url === ROUTE + 'demo-engine.js') return serveFile(res, ENGINE_JS);
  if (url === ROUTE + 'demo-engine.css') return serveFile(res, ENGINE_CSS);
  if (url === ROUTE + 'snapshot-engine.js') return serveFile(res, SNAPSHOT_JS);
  if (url === ROUTE + 'studio/studio-overlay.js') return serveFile(res, STUDIO_JS);
  if (url === ROUTE + 'studio/studio-overlay.css') return serveFile(res, STUDIO_CSS);
  if (url === ROUTE + 'welcome' || !UPSTREAM) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(DASHBOARD_HTML, 'utf8'));
    return;
  }

  const transport = UPSTREAM.protocol === 'https' ? https : http;
  const reqHeaders = { ...req.headers };
  reqHeaders.host = UPSTREAM.host + (UPSTREAM.port !== 80 && UPSTREAM.port !== 443 ? ':' + UPSTREAM.port : '');
  delete reqHeaders.origin;
  delete reqHeaders.referer;

  const proxyReq = transport.request({
    host: UPSTREAM.host,
    port: UPSTREAM.port,
    servername: UPSTREAM.protocol === 'https' ? UPSTREAM.host : undefined,
    rejectUnauthorized: false,
    method: req.method,
    path: req.url,
    headers: {
      ...reqHeaders,
      'accept-encoding': 'gzip, deflate, br'
    }
  }, async proxyRes => {
    // Rewrite redirects to keep user on proxy port
    if (proxyRes.headers.location) {
      try {
        const locUrl = new URL(proxyRes.headers.location, UPSTREAM.url);
        if (locUrl.hostname === UPSTREAM.host) {
          proxyRes.headers.location = locUrl.pathname + locUrl.search + locUrl.hash;
        }
      } catch (e) {}
    }

    const isHtml = (proxyRes.headers['content-type'] || '').includes('text/html');
    if (!isHtml) {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
      return;
    }

    const chunks = [];
    proxyRes.on('data', c => chunks.push(c));
    proxyRes.on('end', async () => {
      try {
        const rawBuf = Buffer.concat(chunks);
        const decBuf = await decompress(rawBuf, proxyRes.headers['content-encoding'] || '');
        const modified = injectAssets(decBuf.toString('utf8'));
        const outBuf = Buffer.from(modified, 'utf8');

        const h = { ...proxyRes.headers };
        delete h['content-encoding'];
        delete h['content-length'];
        delete h['transfer-encoding'];
        delete h['content-security-policy'];
        delete h['content-security-policy-report-only'];
        delete h['x-frame-options'];
        delete h['strict-transport-security'];
        h['content-type'] = 'text/html; charset=utf-8';
        h['content-length'] = outBuf.length;

        res.writeHead(proxyRes.statusCode, h);
        res.end(outBuf);
      } catch (err) {
        console.error('Proxy injection error:', err);
        res.writeHead(502); res.end('Proxy injection failed: ' + err.message);
      }
    });
  });

  proxyReq.on('error', err => {
    console.error('Proxy target connection failed:', err.code, err.message);
    res.writeHead(502, { 'Content-Type': 'text/html' });
    res.end('<h1>502 Bad Gateway</h1><p>Cannot reach target app at ' + UPSTREAM.url + ' (' + (err.code || err.message) + ')</p>');
  });

  req.pipe(proxyReq);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  DemoStudio — Interactive Walkthrough Platform');
  console.log('  ─────────────────────────────────────────────');
  console.log('  Target : ' + (UPSTREAM ? UPSTREAM.url : '(none — connect via Welcome page)'));
  console.log('  Studio : http://localhost:' + PORT);
  console.log('  Output : ' + OUT_PATH);
  console.log('  Export : ' + EXPORT_DIR);
  console.log('');
  console.log('  Capabilities:');
  console.log('   • Automated Interactive Demo Discovery');
  console.log('   • DOM Screen Snapshot Sandbox Freeze');
  console.log('   • In-Place Content & Data Customizer');
  console.log('   • Standalone Offline Zero-Server Export');
  console.log('');
});
