#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   TourPack Studio — click-to-build tours for ANY web app.
   Proxies your app (no code changes), floats a Studio panel over
   it, click the real UI to add steps, preview live, save a
   tour-config.js. Also proxy-rebinds at runtime.

   Usage:
     node studio.js --url <target> [--port <n>] [--config <seed>] [--out <path>]

   Runtime control (no restart):
     POST /__tour/studio/target   {url} → rebind proxy target
     POST /__tour/studio/save     {config} → persist to --out
     GET  /__tour/studio/current        → current draft config
   ═══════════════════════════════════════════════════════════════ */
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; }

let TARGET_URL = arg('--url', 'http://localhost:3000');
const PORT = parseInt(arg('--port', '8940'), 10);
const CONFIG_PATH = arg('--config', null);
const OUT_PATH = arg('--out', path.join(process.cwd(), 'built-tour-config.js'));

const ROUTE = '/__tour/';
const STUDIO_ROUTE = ROUTE + 'studio/';

const ENGINE_JS  = path.join(__dirname, '..', 'tour-overlay.js');
const ENGINE_CSS = path.join(__dirname, '..', 'tour-overlay.css');
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
try { UPSTREAM = parseTarget(TARGET_URL); } catch (e) { console.error('Bad --url: ' + e.message); process.exit(1); }

// ── Seed config (the tour you're building) ────────────────────
function defaultCfg() {
  return { appName: 'TourPack', launchTitle: 'Take a 2-minute tour', launchBody: 'See how this app works.', startLabel: 'Start tour', dismissLabel: 'Explore on my own', accent: '#3b82f6', chapters: [] };
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
    '<link rel="stylesheet" href="' + ROUTE2 + 'tour-overlay.css">' +
    '<link rel="stylesheet" href="' + ROUTE2 + 'studio/studio-overlay.css">' +
    '<script src="' + ROUTE2 + 'tour-config.js" defer></script>' +
    '<script src="' + ROUTE2 + 'tour-overlay.js" defer></script>' +
    '<script src="' + ROUTE2 + 'studio/studio-overlay.js" defer></script>';
  if (html.includes('</body>')) return html.replace('</body>', assets + '\n</body>');
  return html + assets;
}

// ── HTTP server: proxy + studio ───────────────────────────────
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // Dynamic draft config shared by engine + studio
  if (url === ROUTE + 'tour-config.js') {
    const body = 'window.__TOUR_CONFIG = ' + JSON.stringify(SAVED_CFG || seedCfg, null, 2) + ';\n';
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }
  if (url === ROUTE + 'studio/current') { sendJSON(res, { config: SAVED_CFG || seedCfg, target: UPSTREAM.url }); return; }
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

  // Static assets
  if (url === ROUTE + 'tour-overlay.js') return serveFile(res, ENGINE_JS);
  if (url === ROUTE + 'tour-overlay.css') return serveFile(res, ENGINE_CSS);
  if (url === ROUTE + 'studio/studio-overlay.js') return serveFile(res, STUDIO_JS);
  if (url === ROUTE + 'studio/studio-overlay.css') return serveFile(res, STUDIO_CSS);

  // ── Reverse proxy to the target app ─────────────────────────
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
  console.log('  TourPack Studio');
  console.log('  ────────────────');
  console.log('  Target : ' + UPSTREAM.url);
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
