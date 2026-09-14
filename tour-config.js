/* ═══════════════════════════════════════════════════════════════
   TourPack CONFIG — the ONLY file you edit per app.
   Load this BEFORE tour-overlay.js so window.__TOUR_CONFIG exists.

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
   variant (see tour-config.functions.js).
   ═══════════════════════════════════════════════════════════════ */
window.__TOUR_CONFIG = {
  // ── App-specific branding ────────────────────────────────────
  appName: 'OKiR Hybrid',
  tourName: 'OKiR Tour',

  // ── Launch modal copy ────────────────────────────────────────
  launchTitle: 'Take a 2-minute tour',
  launchBody: 'See how OKiR Hybrid turns strategy into executed work — with agents doing the heavy lifting.',
  startLabel: 'Start tour',
  dismissLabel: 'Explore on my own',

  // ── Behaviour ────────────────────────────────────────────────
  accent: '#3b82f6',          // accent color (buttons, kicker, dots, marker ring)
  autoDelay: 1500,            // ms before launch modal appears after load
  idleAutoStart: false,       // true = auto-start tour without waiting for click
  showOnce: false,            // true = remember dismissal in localStorage
  storageKey: 'okir_tour_seen',
  disableOnPaths: ['/login'], // don't show on these paths (substring match)
  onlyOnPaths: null,          // if set, ONLY show on these paths

  // ── The tour itself ──────────────────────────────────────────
  chapters: [
    {
      title: 'Welcome',
      steps: [
        {
          title: 'Welcome to OKiR Hybrid',
          body: 'The agentic OKR platform for enterprise strategy. This tour walks you through planning, execution and verification — agents doing the heavy lifting.',
          // no sel → pure intro card
        },
        {
          title: 'Navigate to OKRs',
          body: 'Click "OKRs" in the sidebar to open the strategy tree.',
          sel: 'nav a:has-text("OKRs"), nav button:has-text("OKRs")',
          pos: 'right',
          action: true
        }
      ]
    },
    {
      title: 'OKR Tree',
      steps: [
        {
          title: 'Filter: On Track',
          body: 'Click the "On Track" filter tab to see only healthy objectives and key results.',
          sel: 'button:has-text("On Track")',
          pos: 'bottom',
          action: true
        },
        {
          title: 'Filter: At Risk',
          body: 'Click "At Risk" to surface what needs attention — the AI insight panel flags suggestions.',
          sel: 'button:has-text("At Risk")',
          pos: 'bottom',
          action: true
        },
        {
          title: 'Filter: All',
          body: 'Back to "All" — the full strategy tree. Every node is clickable.',
          sel: 'button:has-text("All")',
          pos: 'bottom',
          action: true
        },
        {
          title: 'View: Tree',
          body: 'This is the Tree view — objectives, key results and initiatives as an interactive graph. Click the "Tree" toggle to confirm.',
          sel: 'button:has-text("Tree")',
          pos: 'bottom',
          action: true
        },
        {
          title: 'Select the objective node',
          body: 'Click the objective node — "Launch AI-powered OKR workflows" — to select it in the tree.',
          sel: '.react-flow__node:has-text("Launch AI-powered"), text=Launch AI-powered OKR workflows',
          pos: 'top',
          action: true,
          advanceOn: 'select'
        },
        {
          title: 'Select a key result',
          body: 'Click a key result node — "Ship agentic planning to 100% of teams" — to select it.',
          sel: '.react-flow__node:has-text("Ship agentic planning"), text=Ship agentic planning to 100% of teams',
          pos: 'right',
          action: true,
          advanceOn: 'select'
        },
        {
          title: 'Select an at-risk KR',
          body: 'Click "Achieve 95% agent success rate" — it is at risk and the AI flags it.',
          sel: '.react-flow__node:has-text("Achieve 95%"), text=Achieve 95% agent success rate',
          pos: 'left',
          action: true,
          advanceOn: 'select'
        }
      ]
    },
    {
      title: 'AI Planning',
      steps: [
        {
          title: 'Open AI Planning',
          body: 'Click the "AI Planning" button to launch the planner agent studio.',
          sel: 'button:has-text("AI Planning")',
          pos: 'bottom',
          action: true
        },
        {
          title: 'AI Planning Studio',
          body: 'The planner decomposes selected initiatives into executable steps. Press Next to continue.',
          pos: 'bottom'
        }
      ]
    },
    {
      title: 'Projects & Knowledge',
      steps: [
        {
          title: 'Open Projects',
          body: 'Click "Projects" in the sidebar. Initiatives and documents live under projects.',
          sel: 'nav a:has-text("Projects"), nav button:has-text("Projects")',
          pos: 'right',
          action: true
        },
        {
          title: 'Open Knowledge Base',
          body: 'Click "Knowledge Base" in the sidebar. Playbooks and references ground agent planning.',
          sel: 'nav a:has-text("Knowledge"), nav button:has-text("Knowledge")',
          pos: 'right',
          action: true
        }
      ]
    },
    {
      title: 'Teams & Admin',
      steps: [
        {
          title: 'Open Teams',
          body: 'Click "Teams" in the sidebar. People, roles and assignments power accountability.',
          sel: 'nav a:has-text("Teams"), nav button:has-text("Teams")',
          pos: 'right',
          action: true
        },
        {
          title: 'Open Settings',
          body: 'Click "Settings" in the sidebar. Roles, organisations and audit logs — full governance.',
          sel: 'nav a:has-text("Settings"), nav button:has-text("Settings")',
          pos: 'right',
          action: true
        }
      ]
    },
    {
      title: 'Wrap-up',
      steps: [
        {
          title: 'That is OKiR Hybrid',
          body: 'Strategy → plan → execution → verification, orchestrated end-to-end. Explore freely now — every button is clickable.'
        }
      ]
    }
  ]
};