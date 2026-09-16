# 🎯 DemoStudio — The Open-Source Reprise Alternative

**Build interactive product demos, sandbox digital twins, and guided tours for any web application — with zero code changes.**

DemoStudio combines **autonomous AI tour generation**, **DOM sandbox snapshotting**, **in-place content/PII editing**, and **standalone zero-server export** so you can deliver enterprise-grade product demos like Reprise, Navattic, or Storylane.

---

## ✨ What's Included

```
demo-studio/
├── studio/                   ← Reprise Visual Studio
│   ├── studio.js             ← Proxy server, AI orchestration & export engine
│   ├── studio-overlay.js     ← Floating toolbar, DOM scanner, in-place text editor
│   └── studio-overlay.css
│
├── lib/
│   └── snapshot-engine.js    ← Reprise DOM freeze & CSS inlining sandbox engine
│
├── player/                   ← Standalone Zero-Server Offline Demo Viewer
│   ├── index.html            ← Embeddable player with lead capture gate
│   ├── player.js             ← State machine, spotlights, and hotspots
│   └── player.css            ← Modern Reprise glassmorphism theme
│
├── demo-app.js               ← Built-in mock SaaS app for instant testing (:3200)
├── demo-engine.js            ← Live overlay runtime (for live app embedding)
├── demo-engine.css           ← Live overlay styles
├── demo-config.js            ← Declarative demo configuration
│
├── extension/                ← Browser extension for live production apps
└── proxy-8932/               ← Reverse proxy injection for local/staging apps
```

---

## 🚀 4 Core Reprise Capabilities Built-In

### 1. ✨ 1-Click Autonomous AI Demo Generation ("Zero Manual Effort")
- Analyzes page layout, navigation items, buttons, inputs, and headings.
- Synthesizes a multi-chapter executive walkthrough (Executive Overview, Core Interactive Workflow, Analytics/Insights).
- Generates 100% verified CSS selectors — zero hallucinations.
- Automatically captures sandbox DOM snapshots and configures interactive step actions.

### 2. 📸 DOM Sandbox Freeze (No Live Backend Needed)
- Inlines stylesheets, isolates SVGs/assets, and strips volatile third-party scripts.
- Freezes application screens into self-contained snapshots.
- Prospects experience the demo without connecting to your real database or staging servers.

### 3. ✏️ In-Place Content & Data Customizer (Reprise PII / Tailoring)
- Click **✏️ Edit Content** in the Studio toolbar.
- Click any headline, metric, or table value directly on the live page to customize it (e.g. replace "$10,000" with "$1.5M ARR" or insert your prospect's brand name).

### 4. 📦 Standalone Zero-Server Export & Lead Gating
- Click **📦 Export** to package the demo into `built-demo/`.
- Runs 100% offline or on any static CDN (Vercel, Netlify, S3, GitHub Pages).
- Embeddable in an `<iframe>` on your website or landing pages.
- Built-in lead capture gate ("Enter your work email to claim sandbox access").

---

## ⚡ Quickstart (Try it in 30 Seconds)

### Step 1: Start the Mock App
```bash
node demo-app.js
# Serves PulseMetrics cloud analytics on http://localhost:3200
```

### Step 2: Start DemoStudio
```bash
node studio/studio.js --url http://localhost:3200 --port 8940
# Open http://localhost:8940
```

### Step 3: Click "✨ Auto AI Demo"
- Watch the AI scan the app, freeze the DOM snapshot, craft the copy, and start the live interactive preview immediately!

### Step 4: Export Your Demo
- Click **📦 Export** in the toolbar.
- Your self-contained demo is generated in `built-demo/index.html`. Open it directly in your browser — zero backend required!

---

## 🔑 AI Configuration (Optional)
DemoStudio includes an **autonomous heuristic intelligence engine** that works immediately without any API key.

To use cloud LLMs (OpenRouter free models like poolside, nex-agi, cohere, liquid):
```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
node studio/studio.js --url http://localhost:3000
```
Or place your key in `~/.atlas/atlas.yaml`.

---

## 📜 License
MIT — free to use, modify, and deploy.