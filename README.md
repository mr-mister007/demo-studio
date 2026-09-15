# 🎯 DemoStudio — Create Interactive Demos for Any Web App

**Like Reprise, but open-source.** Build clickable, guided product demos that run on top of your live application — no code changes required.

DemoStudio lets you capture your app's real UI, add guided steps with spotlights and tooltips, and share interactive demos with prospects, customers, or new users.

---

## ✨ What You Get

```
demo-studio/
├── demo-engine.js       ← ENGINE — reads window.__TOUR_CONFIG (never edit)
├── demo-engine.css      ← ENGINE styles (themeable via CSS vars)
├── demo-config.js        ← YOUR demo data — the ONLY file you edit per app
│
├── studio/               ← Visual Studio: click-to-build demos
│   ├── studio.js         ← Proxy server + AI generation API
│   ├── studio-overlay.js ← Studio UI (floating panel, pick mode, editor)
│   └── studio-overlay.css
│
├── proxy-8932/           ← Method 1: generated reverse proxy
├── bookmarklet.html      ← Method 3: drag-to-bookmark, works on any site
│
└── extension/            ← Method 2: Chrome/Firefox extension
    ├── manifest.json
    ├── demo-engine.js
    └── demo-engine.css
```

---

## 🚀 3 Ways to Inject (No App Code Changes)

### Method 1 — Visual Studio (Recommended)
**Click elements in your real app to build demos visually.**

```bash
cd studio
node studio.js --url http://localhost:3000 --port 8940
# Open http://localhost:8940
# 1. Click 🎯 Pick element → click real UI elements to add steps
# 2. Edit titles, descriptions, positions
# 3. Click ✨ AI Generate → auto-create a full demo from page analysis
# 4. Click 💾 Save → exports demo-config.js
```

### Method 2 — Reverse Proxy (For embedding in any HTTP app)
```bash
cd proxy-8932
node server.js
# open http://localhost:8932 — the demo overlay is injected into every HTML page
```

### Method 3 — Browser Extension (Works on any site, even remote)
1. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/`
2. Browse to your app — the demo appears automatically

### Method 4 — Bookmarklet (Zero install, 1 click)
1. Open `bookmarklet.html`, drag **Launch Demo** to your bookmarks bar
2. Click it on any page → demo launches instantly

---

## 🎯 Demo Config — The Only File You Touch

`demo-config.js` sets `window.__TOUR_CONFIG`:

```js
window.__TOUR_CONFIG = {
  appName: 'My App',
  accent: '#3b82f6',           // theme color (your brand)
  showOnce: true,              // remember dismissal in localStorage
  idleAutoStart: false,        // auto-start without click?

  chapters: [
    {
      title: 'Getting Started',
      steps: [
        { title: 'Welcome', body: 'Hello!', /* no sel = intro card */ },
        {
          title: 'Create a project',
          body: 'Click the New button to begin',
          sel: 'button:has-text("New Project")',   // target selector
          pos: 'bottom',                            // card position
          action: true                              // user must click the real element
        }
      ]
    }
  ]
};
```

### Step Fields

| Field | Description |
|---|---|
| `title` | Card title |
| `body` | Explanation text |
| `sel` | **Target selector.** CSS, `:has-text("...")` text-filter, `text=raw text`, or comma fallbacks: `'nav a:has-text("OKRs"), button:has-text("OKRs")'` |
| `pos` | Card position: `center / right / left / top / bottom` |
| `action` | `true` → user must **click the highlighted element** to advance (real interaction). `false` → click "Next →" |
| `advanceOn` | `click` (default), `select`, `hover`, `manual` |
| `waitFor` | Optional selector — poll until it appears (handles slow-rendering views) |
| `onEnter` / `onExit` | Optional lifecycle hooks (functions, advanced) |

---

## 🎨 Theming — Match Your Brand

No CSS edits needed — the engine uses CSS variables:

```js
window.__TOUR_CONFIG = {
  accent: '#10b981',        // your brand color
  cardBg: '#0f172a',        // card background
  cardText: '#f8fafc',      // card text
  cardMuted: '#94a3b8',     // muted text
  dimColor: 'rgba(0,0,0,.6)' // spotlight overlay
}
```

---

## 🤖 AI Demo Generation (Studio Mode Only)

Click **✨ AI Generate** in the Studio panel:
- Scans your page for interactive elements (buttons, links, inputs, nav, headings)
- Sends DOM inventory to OpenRouter (free models: Nemotron, Inkling, Cohere, etc.)
- Returns a structured demo with chapters & steps using **only real selectors from your page**
- Validates every selector exists before accepting

---

## 🧪 Try It Instantly (No Target App Needed)

```bash
node demo-app.js        # serves a mock app on :3200
# open http://localhost:3200 — demo loads automatically
```

---

## ⚠️ Caveats

- **WebSockets / SSE**: the HTTP proxy doesn't forward WebSockets yet. Extension & bookmarklet bypass this entirely.
- **CSP**: if the app has a strict Content-Security-Policy blocking injected scripts, use the extension method (MV3 content scripts bypass page CSP) or add a `nonce`/`unsafe-inline` where you control the app.
- **SPA routing**: works fine — the engine re-runs launch detection on path changes.
- **Auth**: the demo only highlights elements that exist on the page; login-gated UIs will show the welcome card first. Configure `disableOnPaths`/`onlyOnPaths` to control where it appears.

---

## 🔌 Programmatic Control

The engine exposes a global API:
```js
DemoStudio.start();   // launch from anywhere
DemoStudio.next();
DemoStudio.prev();
DemoStudio.end();
DemoStudio.reload(config);  // hot-reload new config
```

---

## License
MIT — free to use, fork, and repurpose.