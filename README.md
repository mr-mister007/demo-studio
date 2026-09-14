# 🎯 TourPack — Reusable Interactive Tour Engine

Drop an interactive, coach-mark style guided tour onto **any web app without modifying a single line of the app's code**.

The overlay (spotlight square + tooltip card + click-to-advance) is a **self-contained engine** that reads all its content and behavior from a single config file. Point it at an app via one of three zero-code injection methods.

---

## ✨ What you get

```
tour-pack/
├── tour-overlay.js       ← ENGINE (never edit this) — reads window.__TOUR_CONFIG
├── tour-overlay.css      ← ENGINE styles (themeable via CSS vars)
├── tour-config.js        ← YOUR tour data — the ONLY file you edit per app
│
├── generate-proxy.sh     ← Method 1: generate an injection proxy for ANY app
├── server.js             ← (generated) ready-to-run proxy
│
├── demo-app.js           ← tiny mock app to test the tour instantly
├── bookmarklet.html      ← Method 3: drag-to-bookmark, works on any site
│
└── extension/            ← Method 2: Chrome/Firefox extension (load unpacked)
    ├── manifest.json
    ├── tour-overlay.js
    └── tour-overlay.css
```

---

## 🚀 3 ways to inject (no app code changes)

### Method 1 — Reverse proxy (recommended, works with any HTTP app)
```bash
./generate-proxy.sh <your-app-host> <your-app-port> <public-port>
./generate-proxy.sh localhost 3000 8931

cd proxy-8931 && node server.js
# open http://localhost:8931 — the tour overlay is injected into every HTML page
```
The proxy serves the REAL app and injects the tour assets into HTML responses (handles gzip/br decompression automatically).

### Method 2 — Browser extension (works on any site, even remote)
1. Copy `tour-overlay.js`, `tour-overlay.css`, `tour-config.js` into `extension/` (already there)
2. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/`
3. Browse to the app — the tour appears automatically

Edits to `tour-config.js` need a reload of the extension (or the page).

### Method 3 — Bookmarklet (zero install, 1 click)
1. Open `bookmarklet.html`, drag the **Launch Tour** button to your bookmarks bar
2. Click it on any page → tour launches. Works on sites you don't even control.

---

## 🛠 Config — the only file you touch

`tour-config.js` sets `window.__TOUR_CONFIG`:

```js
window.__TOUR_CONFIG = {
  appName: 'My App',
  accent: '#3b82f6',           // theme color
  showOnce: true,              // remember dismissal in localStorage
  idleAutoStart: false,        // auto-start without click?

  chapters: [
    {
      title: 'Getting Started',
      steps: [
        { title: 'Welcome', body: 'Hello!', /* no sel = intro card */ },
        {
          title: 'Create a project',
          body: 'Click the New button',
          sel: 'button:has-text("New Project")',   // ← target selector
          pos: 'bottom',                            // card position
          action: true                              // user must click the real element
        }
      ]
    }
  ]
};
```

### Step fields

| Field | Description |
|---|---|
| `title` | Card title |
| `body` | Explanation text |
| `sel`   | **Target selector.** CSS, `:has-text("...")` text-filter, `text=raw text`, or comma fallbacks: `'nav a:has-text("OKRs"), button:has-text("OKRs")'` |
| `pos`   | Card position: `center / right / left / top / bottom` |
| `action` | `true` → user must **click the highlighted element** to advance (real interaction). `false` → click "Next →" |
| `advanceOn` | `click` (default), `select`, `hover`, `manual` |
| `waitFor` | Optional selector — poll until it appears (handles slow-rendering views) |
| `onEnter` / `onExit` | Optional lifecycle hooks (functions, advanced) |

---

## 🎨 Theming

No CSS edits needed — the engine uses CSS variables which you can override from the config:

```js
window.__TOUR_CONFIG = {
  accent: '#10b981',        // green theme
  cardBg: '#0f172a',        // dark card
  cardText: '#f8fafc',
  cardMuted: '#94a3b8',
  dimColor: 'rgba(0,0,0,.6)'
}
```

---

## 🧪 Try it instantly (no target app needed)

```bash
node demo-app.js        # serves a mock OKiR-style app on :3200
# open http://localhost:3200 — tour loads automatically
```

---

## ⚠️ Caveats

- **WebSockets / SSE**: the HTTP proxy doesn't forward WebSockets yet (add `ws` handling if your app needs it). Extension & bookmarklet bypass this entirely.
- **CSP**: if the app has a strict Content-Security-Policy blocking injected scripts, use the extension method (MV3 content scripts bypass page CSP) or add a `nonce`/`unsafe-inline` where you control the app.
- **SPA routing**: works fine — the engine re-runs launch detection on path changes.
- **Auth**: the tour only highlights elements that exist on the page; login-gated UIs will show the welcome card first. Configure `disableOnPaths`/`onlyOnPaths` to control where it appears.

---

## 🔌 Programmatic control

The engine exposes a global API:
```js
TourPack.start();   // launch from anywhere
TourPack.next();
TourPack.prev();
TourPack.end();
```

---

## License
MIT — free to use, fork, and repurpose.