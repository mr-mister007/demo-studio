/* ═══════════════════════════════════════════════════════════════
   DemoStudio CONFIG — the ONLY file you edit per app.
   Load this BEFORE demo-engine.js so window.__TOUR_CONFIG exists.

   ┌─ Step schema ────────────────────────────────────────────────
   {
     title:     'Short title shown in card',
     body:      'Explanation text',
     sel:       'CSS selector, OR key: value syntax, OR text=...',
                //   CSS examples:
                //     '#login-btn'
                //     '.sidebar a'
                //     'nav a:has-text("OKRs")'      ← text filter
                //     '.react-flow__node:has-text("Launch AI-powered")'
                //     'text=Launch AI-powered OKR workflows'  ← raw text
                //     'sel1, sel2'                    ← comma fallbacks
     pos:       'center' | 'right' | 'left' | 'top' | 'bottom'   (card position)
     action:    true  → user must CLICK the highlighted element to advance
                false → user clicks "Next →" button
     advanceOn: 'click' (default for action) | 'select' | 'hover' | 'manual'
     waitFor:   optional selector/function — poll until this appears before showing
                (handles slow-rendering views)
     before/after, onEnter/onExit: optional functions (advanced)
   }
   └───────────────────────────────────────────────────────────────
   CHAPTERS are groups shown as "CHAPTER N · TITLE" in the card.
   Inline scripts (onEnter etc.) are NOT allowed in a plain .js config
   loaded via <script src> unless you use the functions-as-config
   variant (see demo-config.functions.js).
   ════════════════════════════════════════════════════════════════ */
window.__TOUR_CONFIG = {
  // ── App-specific branding ────────────────────────────────────
  appName: 'My App',
  tourName: 'Demo',

  // ── Launch modal copy ────────────────────────────────────────
  launchTitle: 'Take a 2-minute demo',
  launchBody: 'See how this app works — step by step, with interactive highlights.',
  startLabel: 'Start demo',
  dismissLabel: 'Explore on my own',

  // ── Behaviour ────────────────────────────────────────────────
  accent: '#3b82f6',          // accent color (buttons, kicker, dots, marker ring)
  autoDelay: 1500,            // ms before launch modal appears after load
  idleAutoStart: false,       // true = auto-start demo without waiting for click
  showOnce: false,            // true = remember dismissal in localStorage
  storageKey: 'demostudio_seen',
  disableOnPaths: ['/login'], // don't show on these paths (substring match)
  onlyOnPaths: null,          // if set, ONLY show on these paths

  // ── The demo itself ──────────────────────────────────────────
  chapters: [
    {
      title: 'Welcome',
      steps: [
        {
          title: 'Welcome to My App',
          body: 'This demo walks you through the key features.',
          // no sel → pure intro card
        }
      ]
    }
  ]
};