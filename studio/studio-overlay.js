/* ═══════════════════════════════════════════════════════════════
   DemoStudio Studio (Reprise AI Edition)
   Injected into target app by studio proxy.
   Features:
     • 🚀 1-Click AI Auto-Demo (Scans DOM, captures snapshot, plans journey, outputs demo)
     • 📸 Reprise DOM Snapshot Freeze (Offline sandbox capture)
     • ✏️ In-Place Content Editor (Edit text & numbers live like Reprise)
     • 🎯 Visual Element Picker with robust selector resolution
     • 📦 Standalone Offline Zero-Server Demo Export
   ═══════════════════════════════════════════════════════════════ */
(() => {
  if (window.__tourStudioLoaded) return;
  window.__tourStudioLoaded = true;

  // ── State ────────────────────────────────────────────────────
  function getDraftKey() {
    const host = window.location.hostname || 'target';
    const app = (window.__TOUR_CONFIG && window.__TOUR_CONFIG.appName) || '';
    return 'demostudio_draft_' + host + (app ? '_' + app.replace(/\s+/g, '_') : '');
  }
  let cfg = null;
  let pickMode = false;
  let autoInspectMode = false;
  let autoCaptureMode = false;
  let editContentMode = false;
  let hoverEl = null;
  let activeChapterIdx = 0;
  let activeStepIdx = 0;
  let dirty = false;
  let capturedScreensList = [];
  let currentScreenId = null;
  let lastCapturedUrl = '';

  function loadDraft() {
    try { localStorage.removeItem('demostudio_studio_draft'); } catch (e) {}
    const key = getDraftKey();
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (!window.__TOUR_CONFIG || !window.__TOUR_CONFIG.appName || parsed.appName === window.__TOUR_CONFIG.appName)) {
          cfg = parsed;
          return;
        }
      }
    } catch (e) {}
    cfg = window.__TOUR_CONFIG ? JSON.parse(JSON.stringify(window.__TOUR_CONFIG)) : { appName: 'My App', chapters: [] };
  }
  loadDraft();
  if (!cfg.chapters) cfg.chapters = [];

  // ── DOM Construction ─────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.id = 'demostudio-studio';
  wrap.innerHTML = `
    <div id="studio-panel">
      <div class="studio-head">
        <span class="material-symbols-outlined studio-drag-grip">drag_indicator</span>
        <div class="studio-title">
          <span>DemoStudio</span>
          <span class="studio-badge">Editor</span>
        </div>
        <span id="studio-save-state" class="studio-save-state"></span>
        <button id="studio-dashboard-btn" class="studio-head-btn" title="Return to Demos Dashboard">
          <span class="material-symbols-outlined">dashboard</span>
        </button>
        <button id="studio-theme-toggle" class="studio-head-btn" title="Toggle Light / Dark Mode">
          <span class="material-symbols-outlined" id="studio-theme-icon">dark_mode</span>
        </button>
        <button id="studio-switch-target" class="studio-head-btn" title="Change target website">
          <span class="material-symbols-outlined">swap_horiz</span>
        </button>
        <button id="studio-min" class="studio-head-btn" title="Minimize">
          <span class="material-symbols-outlined">remove</span>
        </button>
        <button id="studio-close" class="studio-head-btn" title="Close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="studio-toolbar">
        <button id="studio-ai-auto" class="studio-btn studio-ai-auto" title="Generate interactive walkthrough automatically">
          <span class="material-symbols-outlined">auto_awesome</span>
          <span>Auto Demo</span>
        </button>
        <button id="studio-ai-settings" class="studio-btn" title="Configure AI model and keys">
          <span class="material-symbols-outlined">tune</span>
          <span>Settings</span>
        </button>
        <button id="studio-auto-inspect" class="studio-btn" title="Auto Inspect: perform manual demo, capture clicks, inputs & screens, then generate AI tour">
          <span class="material-symbols-outlined">smart_toy</span>
          <span>Auto Inspect</span>
        </button>
        <button id="studio-auto-capture" class="studio-btn" title="Auto Capture: automatically capture screen DOM snapshots on clicks and navigation changes">
          <span class="material-symbols-outlined">auto_videocam</span>
          <span>Auto Capture</span>
        </button>
        <button id="studio-pick" class="studio-btn studio-pick" title="Select single element on the screen">
          <span class="material-symbols-outlined">center_focus_strong</span>
          <span>Inspect</span>
        </button>
        <button id="studio-snapshot" class="studio-btn" title="Capture DOM sandbox snapshot">
          <span class="material-symbols-outlined">camera</span>
          <span>Snapshot</span>
        </button>
        <button id="studio-edit-content" class="studio-btn" title="Edit content in-place">
          <span class="material-symbols-outlined">edit_note</span>
          <span>Edit Text</span>
        </button>
        <button id="studio-preview" class="studio-btn" title="Test interactive demo">
          <span class="material-symbols-outlined">play_arrow</span>
          <span>Preview</span>
        </button>
        <button id="studio-save" class="studio-btn studio-primary" title="Save demo configuration">
          <span class="material-symbols-outlined">save</span>
          <span>Save</span>
        </button>
        <button id="studio-export-standalone" class="studio-btn" title="Export standalone bundle">
          <span class="material-symbols-outlined">download</span>
          <span>Export</span>
        </button>
      </div>
      <div class="studio-url-row">
        <span class="material-symbols-outlined studio-url-icon">public</span>
        <input id="studio-url" class="studio-url-input" type="url" placeholder="Change website URL..." spellcheck="false">
        <button id="studio-connect" class="studio-btn studio-connect-btn">
          <span>Connect</span>
        </button>
      </div>
      <div class="studio-hint" id="studio-hint">
        <span class="material-symbols-outlined" style="font-size:16px;">ads_click</span>
        <span>Inspect mode active: click any element to anchor a step. Esc to cancel.</span>
      </div>

      <div class="studio-tabs">
        <button class="studio-tab-btn active" data-tab="steps">
          <span class="material-symbols-outlined">format_list_numbered</span>
          <span>Steps & Flow</span>
        </button>
        <button class="studio-tab-btn" data-tab="screens">
          <span class="material-symbols-outlined">layers</span>
          <span>Screens (<span id="studio-screens-count">0</span>)</span>
        </button>
        <button class="studio-tab-btn" data-tab="agent">
          <span class="material-symbols-outlined">psychology</span>
          <span>AI Agent</span>
        </button>
      </div>

      <div id="studio-view-steps" class="studio-view">
        <div class="studio-split">
          <div class="studio-col">
            <div class="studio-col-head" style="display:flex;justify-content:space-between;align-items:center;">
              <span>Chapters & Steps</span>
              <button id="studio-add-chapter-btn" class="studio-mini" title="Add Chapter" style="padding:2px 8px;font-size:11px;display:inline-flex;align-items:center;gap:3px;cursor:pointer;border-radius:6px;background:var(--md-secondary-container);color:var(--md-on-secondary-container);border:none;">
                <span class="material-symbols-outlined" style="font-size:13px;">add</span>
                <span>Chapter</span>
              </button>
            </div>
            <div id="studio-chapters"></div>
          </div>
          <div class="studio-col">
            <div class="studio-col-head">Step Editor</div>
            <div id="studio-editor"><div class="studio-empty">Select a step to edit, or click <b>Auto Demo</b> to generate a walkthrough.</div></div>
          </div>
        </div>
      </div>

      <div id="studio-view-screens" class="studio-view" style="display:none;">
        <div class="studio-screens-toolbar">
          <h4>
            <span class="material-symbols-outlined" style="font-size:16px;color:var(--md-primary);">devices</span>
            <span>Captured Screen Graph</span>
          </h4>
          <button id="studio-add-screen" class="studio-btn studio-primary" style="padding:4px 10px;font-size:11.5px;">
            <span class="material-symbols-outlined" style="font-size:14px;">add_a_photo</span>
            <span>Capture Current</span>
          </button>
        </div>
        <div id="studio-screens-list" class="studio-screens-grid">
          <div class="studio-empty">No screens captured yet. Click <b>Capture Current</b> or run <b>Auto Demo</b>.</div>
        </div>
      </div>

      <div id="studio-view-agent" class="studio-view" style="display:none;">
        <div class="studio-chat-container">
          <div id="studio-chat-msgs" class="studio-chat-msgs">
            <div class="studio-chat-msg studio-chat-ai">
              <div class="studio-chat-avatar"><span class="material-symbols-outlined">psychology</span></div>
              <div class="studio-chat-bubble">
                Hello! I am your AI Product Demo Architect. Ask me to refine your tour, summarize screens, add steps, or rewrite titles.
              </div>
            </div>
          </div>
          <div class="studio-chat-chips">
            <button class="studio-chat-chip" data-prompt="Make all step titles punchy and concise">✨ Punchy titles</button>
            <button class="studio-chat-chip" data-prompt="Add a step highlighting key navigation actions">🧭 Nav steps</button>
            <button class="studio-chat-chip" data-prompt="Review this page and recommend a 3-step tour">💡 Recommend tour</button>
            <button class="studio-chat-chip" data-prompt="Change accent color to modern vibrant indigo">🎨 Indigo accent</button>
          </div>
          <div class="studio-chat-input-row">
            <input id="studio-agent-input" class="studio-chat-input" placeholder="Ask AI to edit tour, rewrite steps, or explain..." spellcheck="false" />
            <button id="studio-agent-send" class="studio-chat-send" title="Send message">
              <span class="material-symbols-outlined" style="font-size:18px;">arrow_upward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <div id="studio-hover" style="display:none;"></div>
  `;
  document.body.appendChild(wrap);

  const panel = wrap.querySelector('#studio-panel');
  const hint = wrap.querySelector('#studio-hint');
  const chaptersEl = wrap.querySelector('#studio-chapters');
  const editorEl = wrap.querySelector('#studio-editor');

  // Minimize / Restore Panel
  const minBtn = wrap.querySelector('#studio-min');
  const minIcon = minBtn.querySelector('.material-symbols-outlined');
  function toggleMinimize(force) {
    const isMin = typeof force === 'boolean' ? force : !panel.classList.contains('studio-minimized');
    panel.classList.toggle('studio-minimized', isMin);
    if (isMin) {
      minIcon.textContent = 'open_in_full';
      minBtn.title = 'Restore DemoStudio';
      minBtn.setAttribute('aria-label', 'Restore DemoStudio');
    } else {
      minIcon.textContent = 'remove';
      minBtn.title = 'Minimize';
      minBtn.setAttribute('aria-label', 'Minimize');
    }
  }

  // Draggable Header
  const head = wrap.querySelector('.studio-head');
  let isDragging = false, hasDragged = false, startX, startY, initialX, initialY;
  head.addEventListener('mousedown', e => {
    if (e.target.closest('button')) return;
    isDragging = true;
    hasDragged = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = wrap.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasDragged = true;
      wrap.classList.add('studio-dragging');
    }
    wrap.style.left = `${initialX + dx}px`;
    wrap.style.top = `${initialY + dy}px`;
    wrap.style.right = 'auto';
  });
  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      wrap.classList.remove('studio-dragging');
    }
  });
  head.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    if (hasDragged) return;
    // If minimized, clicking anywhere on the header restores it
    if (panel.classList.contains('studio-minimized')) {
      toggleMinimize(false);
    }
  });
  head.addEventListener('dblclick', e => {
    if (e.target.closest('button')) return;
    toggleMinimize();
  });

  // ── Selector Engine ──────────────────────────────────────────
  function selectorFor(el) {
    if (!el || el === document.body || el === document.documentElement) return null;

    // 1) Unique ID (excluding auto-generated dynamic ids like react :r0:, numeric-only, etc.)
    if (el.id && !/^\d/.test(el.id) && !/^[0-9a-f-]{25,}$/i.test(el.id)) {
      try {
        const s = '#' + CSS.escape(el.id);
        if (document.querySelectorAll(s).length === 1) return s;
      } catch (e) {}
    }

    // 2) Automation & Test attributes (data-testid, data-cy, data-test, data-qa)
    for (const attr of ['data-testid', 'data-cy', 'data-test', 'data-qa']) {
      const val = el.getAttribute(attr);
      if (val) {
        try {
          const s = `[${attr}="${CSS.escape(val)}"]`;
          if (document.querySelectorAll(s).length === 1) return s;
          const tagS = `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(val)}"]`;
          if (document.querySelectorAll(tagS).length === 1) return tagS;
        } catch (e) {}
      }
    }

    // 3) Unique aria-label or role
    const label = el.getAttribute('aria-label');
    if (label) {
      try {
        const s = `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(label)}"]`;
        if (document.querySelectorAll(s).length === 1) return s;
      } catch (e) {}
    }

    // 4) Unique Link href for navigation
    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      if (href && href !== '#' && href !== 'javascript:void(0)' && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        try {
          const s = `a[href="${CSS.escape(href)}"]`;
          if (document.querySelectorAll(s).length === 1) return s;
        } catch (e) {}
      }
    }

    // 5) Inputs: type, placeholder, name
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
      const ph = el.getAttribute('placeholder');
      if (ph) {
        try {
          const s = `${el.tagName.toLowerCase()}[placeholder="${CSS.escape(ph)}"]`;
          if (document.querySelectorAll(s).length === 1) return s;
        } catch (e) {}
      }
      const name = el.getAttribute('name');
      if (name) {
        try {
          const s = `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
          if (document.querySelectorAll(s).length === 1) return s;
        } catch (e) {}
      }
      if (el.type) {
        try {
          const s = `input[type="${CSS.escape(el.type)}"]`;
          if (document.querySelectorAll(s).length === 1) return s;
        } catch (e) {}
      }
    }

    // 6) Clean Class Selector (filter out CSS-in-JS hashes, emotion classes like css-123gyud, tailwind arbitrary, etc.)
    if (el.className && typeof el.className === 'string') {
      const isNoiseClass = c => {
        if (!c || c.length <= 2) return true;
        if (/^\d/.test(c) || c.startsWith('_') || c.includes(':')) return true;
        // Emotion / styled-components / CSS modules hashes (e.g. css-123gyud, jss123, sc-bdVaJa)
        if (/^css-[a-z0-9]{4,10}$/i.test(c)) return true;
        if (/^[a-z0-9_-]{18,}$/i.test(c)) return true;
        return false;
      };

      const classes = el.className.split(/\s+/).filter(c => !isNoiseClass(c));
      // Deduplicate class names (React/MUI often duplicates them)
      const uniqueClasses = Array.from(new Set(classes));

      if (uniqueClasses.length) {
        // Try top 1 or 2 most descriptive semantic classes
        for (const c of uniqueClasses) {
          try {
            const s = `${el.tagName.toLowerCase()}.${CSS.escape(c)}`;
            if (document.querySelectorAll(s).length === 1) return s;
          } catch (e) {}
        }
        try {
          const s = el.tagName.toLowerCase() + '.' + uniqueClasses.slice(0, 3).map(c => CSS.escape(c)).join('.');
          if (document.querySelectorAll(s).length === 1) return s;
        } catch (e) {}
      }
    }

    // 7) Robust hierarchical ascension (guaranteed strictly valid CSS matching exactly 1 element)
    let curr = el;
    const parts = [];
    while (curr && curr !== document.body && curr !== document.documentElement && parts.length < 5) {
      let seg = curr.tagName.toLowerCase();
      if (curr.id && !/^\d/.test(curr.id) && !/^[0-9a-f-]{25,}$/i.test(curr.id)) {
        try {
          const testId = '#' + CSS.escape(curr.id);
          if (document.querySelectorAll(testId).length === 1) {
            parts.unshift(testId);
            break;
          }
        } catch (e) {}
      }

      if (curr.className && typeof curr.className === 'string') {
        const cls = curr.className.split(/\s+/).find(c => c && !/^\d/.test(c) && !c.startsWith('_') && !c.includes(':') && !/^css-[a-z0-9]{4,10}$/i.test(c) && c.length > 2);
        if (cls) seg += '.' + CSS.escape(cls);
      }

      if (curr.parentElement) {
        const sibs = Array.from(curr.parentElement.children).filter(c => c.tagName === curr.tagName);
        if (sibs.length > 1) {
          const idx = sibs.indexOf(curr) + 1;
          seg += `:nth-of-type(${idx})`;
        }
      }

      parts.unshift(seg);
      const candidate = parts.join(' > ');
      try {
        if (document.querySelectorAll(candidate).length === 1) return candidate;
      } catch (e) {}

      curr = curr.parentElement;
    }

    const fallback = parts.join(' > ');
    return fallback || el.tagName.toLowerCase();
  }
  window.__studioSelectorFor = selectorFor;

  // ── Single Element Pick Mode ──────────────────────────────────
  const hoverBox = wrap.querySelector('#studio-hover');

  function setPick(on) {
    pickMode = on;
    document.body.classList.toggle('studio-picking', on);

    const pickBtn = wrap.querySelector('#studio-pick');
    if (pickBtn) pickBtn.classList.toggle('on', on);

    if (on) {
      hint.style.display = 'flex';
      hint.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">ads_click</span><span>Inspect active: click any element to anchor a step. Esc to cancel.</span>';
    } else {
      if (hoverBox) hoverBox.style.display = 'none';
      if (!isRecordingSession && !autoCaptureMode) hint.style.display = 'none';
    }
  }

  window.addEventListener('mousemove', e => {
    if (!pickMode) return;
    if (e.target.closest('#demostudio-studio, #demostudio-layer, #demostudio-launch, #studio-floating-toast, #studio-rec-bar')) {
      hoverBox.style.display = 'none';
      return;
    }
    hoverEl = e.target.closest('button, a, [role="button"], input, select, textarea, [tabindex]') || e.target;
    const r = hoverEl.getBoundingClientRect();
    hoverBox.style.display = 'block';
    hoverBox.style.top = `${r.top}px`;
    hoverBox.style.left = `${r.left}px`;
    hoverBox.style.width = `${r.width}px`;
    hoverBox.style.height = `${r.height}px`;
  });

  window.addEventListener('click', async e => {
    if (!pickMode || !hoverEl) return;
    if (e.target.closest('#demostudio-studio, #demostudio-layer, #demostudio-launch, #studio-floating-toast, #studio-rec-bar')) return;
    e.preventDefault();
    e.stopPropagation();

    const targetEl = hoverEl.closest('button, a, [role="button"], input, select, textarea, [tabindex]') || hoverEl;
    const sel = selectorFor(targetEl);
    if (!sel) { flash('Could not generate selector'); return; }

    const step = addStepForElement(targetEl, sel);
    setPick(false);
    showStudioToast(`Step added: "${step.title}"`, 'check');
  }, true);

  // ── Auto Inspect: Manual Demo Session Recorder & AI Tour Synthesis ──
  let isRecordingSession = false;
  let recordedSessionActions = [];
  let recBarEl = null;

  async function toggleAutoInspectSession() {
    if (isRecordingSession) {
      if (recordedSessionActions.length) {
        await finishSessionAndGenerateAiTour();
      } else {
        stopSessionRecording();
        showStudioToast('Demo recording canceled', 'close');
      }
    } else {
      await startSessionRecording();
    }
  }

  async function startSessionRecording() {
    isRecordingSession = true;
    recordedSessionActions = [];

    // Enable auto capture so view/screen changes snapshot automatically
    setAutoCapture(true);

    // Snapshot initial view if none captured yet
    if (!currentScreenId && window.__DemoStudioSnapshot) {
      const id = await snapshotCurrentScreen(document.title || 'Screen 1');
      if (id) {
        currentScreenId = id;
        lastCapturedUrl = window.location.pathname + window.location.search;
        await fetchScreens();
      }
    }

    // Minimize studio panel to avoid obstructing user's manual demo
    const panel = wrap.querySelector('#studio-panel');
    if (panel) panel.classList.add('studio-minimized');

    const autoInspectBtn = wrap.querySelector('#studio-auto-inspect');
    if (autoInspectBtn) {
      autoInspectBtn.classList.add('on');
      autoInspectBtn.innerHTML = '<span class="studio-rec-dot"></span><span>Recording Demo...</span>';
    }

    mountRecBar();
    showStudioToast('Auto Inspect Active: Perform your manual demo, then click "Generate AI Demo Tour"!', 'smart_toy');
    flash('Recording demo interactions in background');
  }

  function stopSessionRecording() {
    isRecordingSession = false;
    unmountRecBar();

    const autoInspectBtn = wrap.querySelector('#studio-auto-inspect');
    if (autoInspectBtn) {
      autoInspectBtn.classList.remove('on');
      autoInspectBtn.innerHTML = '<span class="material-symbols-outlined">smart_toy</span><span>Auto Inspect</span>';
    }

    const panel = wrap.querySelector('#studio-panel');
    if (panel) panel.classList.remove('studio-minimized');
  }

  function mountRecBar() {
    unmountRecBar();
    recBarEl = document.createElement('div');
    recBarEl.id = 'studio-rec-bar';
    recBarEl.innerHTML = `
      <div class="studio-rec-status">
        <span class="studio-rec-pulse"></span>
        <span class="studio-rec-label">RECORDING DEMO</span>
      </div>
      <div class="studio-rec-stats">
        <span id="studio-rec-actions-count">0 actions</span> · <span id="studio-rec-screens-count">${capturedScreensList.length || 1} screens</span>
      </div>
      <div id="studio-rec-ticker" class="studio-rec-ticker">Perform your manual demo — clicks, inputs & pages are captured</div>
      <div class="studio-rec-actions">
        <button id="studio-rec-finish" class="studio-btn studio-primary" title="Finish manual demo and generate interactive AI tour">
          <span class="material-symbols-outlined">auto_awesome</span>
          <span>Generate AI Demo Tour</span>
        </button>
        <button id="studio-rec-cancel" class="studio-btn" title="Discard recorded demo">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    `;
    document.body.appendChild(recBarEl);

    recBarEl.querySelector('#studio-rec-finish').addEventListener('click', (e) => {
      e.stopPropagation();
      finishSessionAndGenerateAiTour();
    });

    recBarEl.querySelector('#studio-rec-cancel').addEventListener('click', (e) => {
      e.stopPropagation();
      stopSessionRecording();
      showStudioToast('Demo recording canceled', 'close');
    });
  }

  function unmountRecBar() {
    if (recBarEl) {
      recBarEl.remove();
      recBarEl = null;
    }
  }

  function updateRecBarStats() {
    if (!recBarEl) return;
    const actEl = recBarEl.querySelector('#studio-rec-actions-count');
    const scrEl = recBarEl.querySelector('#studio-rec-screens-count');
    const tickEl = recBarEl.querySelector('#studio-rec-ticker');
    if (actEl) actEl.textContent = `${recordedSessionActions.length} action${recordedSessionActions.length === 1 ? '' : 's'}`;
    if (scrEl) scrEl.textContent = `${capturedScreensList.length || 1} screen${capturedScreensList.length === 1 ? '' : 's'}`;
    if (tickEl && recordedSessionActions.length) {
      const last = recordedSessionActions[recordedSessionActions.length - 1];
      if (last.type === 'input') {
        tickEl.textContent = `Input: "${last.value || last.placeholder || 'Field'}"`;
      } else {
        tickEl.textContent = `Clicked: "${last.text || last.tag}"`;
      }
    }
  }

  // Passive observation of clicks during manual demo session
  window.addEventListener('click', (e) => {
    if (!isRecordingSession) return;
    if (e.target.closest('#demostudio-studio, #studio-rec-bar, #studio-ai-modal, #studio-floating-toast')) return;

    const target = e.target.closest('button, a, [role="button"], input, select, textarea, [tabindex], [onclick]') || e.target;
    const sel = selectorFor(target);
    if (!sel) return;

    const text = (target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    const r = target.getBoundingClientRect();
    const vh = window.innerHeight, vw = window.innerWidth;
    const spaceBelow = vh - (r.top + r.height);
    const spaceAbove = r.top;
    let pos = 'bottom';
    if (spaceBelow < 220 && spaceAbove >= 200) pos = 'top';
    else if (r.left > vw * 0.72) pos = 'left';
    else if (r.left + r.width < vw * 0.28) pos = 'right';

    recordedSessionActions.push({
      type: 'click',
      tag: target.tagName,
      role: target.getAttribute('role') || undefined,
      text: text || undefined,
      sel: sel,
      pos: pos,
      screenId: currentScreenId || undefined,
      screenName: capturedScreensList.find(s => s.id === currentScreenId)?.name || document.title,
      timestamp: Date.now()
    });

    updateRecBarStats();
  }, true);

  // Passive observation of form inputs during manual demo session
  let sessionInputTimer = null;
  window.addEventListener('input', (e) => {
    if (!isRecordingSession) return;
    if (e.target.closest('#demostudio-studio, #studio-rec-bar, #studio-ai-modal, #studio-floating-toast')) return;

    const target = e.target;
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

    clearTimeout(sessionInputTimer);
    sessionInputTimer = setTimeout(() => {
      const sel = selectorFor(target);
      if (!sel) return;
      const val = target.value || '';
      const placeholder = target.getAttribute('placeholder') || '';
      const label = target.labels?.[0]?.textContent || target.name || placeholder;

      const last = recordedSessionActions[recordedSessionActions.length - 1];
      if (last && last.type === 'input' && last.sel === sel) {
        last.value = val;
        last.timestamp = Date.now();
      } else {
        recordedSessionActions.push({
          type: 'input',
          tag: target.tagName,
          placeholder: placeholder || undefined,
          label: label ? label.trim().slice(0, 40) : undefined,
          value: val.slice(0, 60),
          sel: sel,
          pos: 'bottom',
          screenId: currentScreenId || undefined,
          screenName: capturedScreensList.find(s => s.id === currentScreenId)?.name || document.title,
          timestamp: Date.now()
        });
      }
      updateRecBarStats();
    }, 350);
  }, true);

  async function finishSessionAndGenerateAiTour() {
    if (!recordedSessionActions.length) {
      flash('No demo actions recorded yet. Please click buttons, enter text, or navigate.');
      return;
    }

    showAiSynthesisModal();

    try {
      const key = localStorage.getItem('demostudio_ai_key') || '';
      const endpoint = localStorage.getItem('demostudio_ai_endpoint') || '';
      const model = localStorage.getItem('demostudio_ai_model') || '';

      const res = await fetch('/__tour/studio/ai-generate-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordedActions: recordedSessionActions,
          capturedScreens: capturedScreensList,
          appName: cfg.appName || document.title || 'Product Tour',
          url: window.location.href,
          apiKey: key,
          llmEndpoint: endpoint,
          llmModel: model
        })
      });

      const data = await res.json();
      hideAiSynthesisModal();

      if (data.ok && data.config) {
        stopSessionRecording();

        cfg.chapters = data.config.chapters || cfg.chapters;
        if (data.config.appName) cfg.appName = data.config.appName;
        if (data.config.launchTitle) cfg.launchTitle = data.config.launchTitle;
        if (data.config.launchBody) cfg.launchBody = data.config.launchBody;

        dirty = true;
        activeChapterIdx = 0;
        activeStepIdx = 0;
        renderChapters();
        renderEditor();
        await save();

        showStudioToast('AI Interactive Tour Synthesized Successfully!', 'auto_awesome');
        flash('Interactive guided tour created from your demo session!');

        // Immediately trigger interactive preview
        setTimeout(() => preview(), 400);
      } else {
        showStudioToast('AI Generation failed: ' + (data.error || 'Server error'), 'error');
        flash('AI error: ' + (data.error || 'Server error'));
      }
    } catch (err) {
      hideAiSynthesisModal();
      console.error('[Session AI Error]', err);
      flash('Error generating AI tour: ' + err.message);
    }
  }

  function showAiSynthesisModal() {
    hideAiSynthesisModal();
    const modal = document.createElement('div');
    modal.id = 'studio-ai-modal';
    modal.innerHTML = `
      <div class="studio-ai-modal-card">
        <div class="studio-ai-spinner"></div>
        <div class="studio-ai-modal-title">Crafting Interactive Tour</div>
        <div class="studio-ai-modal-sub">AI is analyzing your manual demo interactions, structuring narrative chapters, and generating professional product copy...</div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function hideAiSynthesisModal() {
    const modal = document.querySelector('#studio-ai-modal');
    if (modal) modal.remove();
  }

  function addStepForElement(el, sel) {
    if (!cfg.chapters.length) {
      cfg.chapters.push({ title: 'Chapter 1', steps: [] });
    }
    let ci = (activeChapterIdx >= 0 && activeChapterIdx < cfg.chapters.length)
      ? activeChapterIdx
      : (cfg.chapters.length - 1);
    const ch = cfg.chapters[ci];
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    const step = {
      title: text ? `Explore ${text}` : 'Action Step',
      body: `Click here to interact with this feature.`,
      sel: sel,
      pos: 'bottom',
      action: true
    };
    if (currentScreenId) {
      step.screenId = currentScreenId;
    }
    ch.steps.push(step);
    activeChapterIdx = ci;
    activeStepIdx = ch.steps.length - 1;
    dirty = true;
    renderChapters();
    renderEditor();
    flash(`Step added to Chapter ${ci + 1}: ${sel}`);
    return step;
  }

  // ── Auto-Capture Mode (Continuous Reprise Screen Recording) ──
  let autoCaptureTimer = null;
  let autoCaptureActive = false;
  let hasHookedHistory = false;
  let origPushState = null;
  let origReplaceState = null;

  function setAutoCapture(on) {
    autoCaptureMode = on;
    const btn = wrap.querySelector('#studio-auto-capture');
    if (btn) {
      btn.classList.toggle('on', on);
      btn.innerHTML = on
        ? '<span class="studio-rec-dot"></span><span>Auto Capturing</span>'
        : '<span class="material-symbols-outlined">auto_videocam</span><span>Auto Capture</span>';
    }

    if (on) {
      if (!pickMode) {
        hint.style.display = 'flex';
        hint.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">auto_videocam</span><span><b>Auto-Capture Active:</b> Navigating pages, tabs, or routes automatically captures screens.</span>';
      }
      showStudioToast('Auto-Capture Active: View changes will snapshot automatically', 'auto_videocam');
      flash('Auto Capture enabled');
      startAutoCaptureObserver();

      // Capture initial view if none captured yet
      if (!currentScreenId && window.__DemoStudioSnapshot) {
        snapshotCurrentScreen(document.title || 'Screen 1').then(id => {
          if (id) {
            currentScreenId = id;
            lastCapturedUrl = window.location.pathname + window.location.search;
            fetchScreens();
          }
        });
      }
    } else {
      if (!pickMode) hint.style.display = 'none';
      showStudioToast('Auto-Capture disabled', 'stop');
      flash('Auto Capture disabled');
      stopAutoCaptureObserver();
    }
  }

  // ── DOM State Fingerprinting & Deduplication ────────────────
  let lastFingerprint = '';

  function getDomFingerprint() {
    try {
      const url = window.location.pathname + window.location.search + window.location.hash;

      // 1. Detect open dialogs, modals, or slide-over drawers
      const modal = document.querySelector(
        '[role="dialog"]:not([aria-hidden="true"]), dialog[open], .MuiDialog-root, .modal.show, .MuiDrawer-root'
      );
      let modalSig = '';
      if (modal && modal.offsetParent !== null) {
        const mh = modal.querySelector('h1, h2, h3, .modal-title, .MuiDialogTitle-root, [class*="title" i]');
        modalSig = '[modal:' + (mh ? mh.textContent.trim().slice(0, 40) : modal.className) + ']';
      }

      // 2. Detect active tab
      const activeTab = document.querySelector(
        '[role="tab"][aria-selected="true"], .nav-link.active, .tab.active, button[aria-selected="true"]'
      );
      const tabSig = activeTab ? ('[tab:' + activeTab.textContent.trim().slice(0, 30) + ']') : '';

      // 3. Detect main page heading
      const mainEl = document.querySelector('main, [role="main"], #root, #app') || document.body;
      const h1 = mainEl.querySelector('h1, h2');
      const h1Sig = h1 ? ('[h1:' + h1.textContent.trim().slice(0, 40) + ']') : '';

      // 4. Structural text sample (first 80 chars, last 80 chars, total text length)
      const rawText = (mainEl.innerText || '').replace(/\s+/g, ' ').trim();
      const textSample = rawText.slice(0, 80) + '::' + rawText.slice(-80) + '::' + rawText.length;

      return `${url}__${modalSig}__${tabSig}__${h1Sig}__${textSample}`;
    } catch (e) {
      return window.location.href;
    }
  }

  function detectScreenTitle(defaultTitle) {
    try {
      // 1. Check for visible modal dialog
      const modal = document.querySelector(
        '[role="dialog"]:not([aria-hidden="true"]), dialog[open], .MuiDialog-root, .modal.show'
      );
      if (modal && modal.offsetParent !== null) {
        const mh = modal.querySelector('h1, h2, h3, .modal-title, .MuiDialogTitle-root, [class*="title" i]');
        if (mh && mh.textContent.trim()) {
          return mh.textContent.trim().slice(0, 40) + ' (Dialog)';
        }
        return 'Dialog View';
      }

      // 2. Check for active tab
      const activeTab = document.querySelector(
        '[role="tab"][aria-selected="true"], .nav-link.active, .tab.active, button[aria-selected="true"]'
      );
      if (activeTab && activeTab.textContent.trim()) {
        const tabName = activeTab.textContent.trim().slice(0, 30);
        const h1 = document.querySelector('h1');
        if (h1 && h1.textContent.trim() && !h1.textContent.includes(tabName)) {
          return `${h1.textContent.trim().slice(0, 25)} — ${tabName}`;
        }
        return `${tabName} View`;
      }

      // 3. Check for main page heading
      const h1 = document.querySelector('main h1, [role="main"] h1, h1');
      if (h1 && h1.textContent.trim()) {
        return h1.textContent.trim().slice(0, 45);
      }

      // 4. Fallback to URL path or document title
      const curPath = window.location.pathname;
      if (curPath && curPath !== '/' && curPath.length > 1) {
        const slug = curPath.split('/').filter(Boolean).pop();
        if (slug) {
          const clean = slug.replace(/[-_]/g, ' ');
          return clean.charAt(0).toUpperCase() + clean.slice(1);
        }
      }
    } catch (e) {}
    return defaultTitle || document.title || ('Screen ' + (capturedScreensList.length + 1));
  }

  function triggerAutoCapture(reason = 'Navigation') {
    if (!autoCaptureMode || !window.__DemoStudioSnapshot) return;
    clearTimeout(autoCaptureTimer);
    autoCaptureTimer = setTimeout(async () => {
      const currentFp = getDomFingerprint();
      // If the view/DOM state did not genuinely change, skip duplicate screen capture!
      if (lastFingerprint && currentFp === lastFingerprint) {
        return;
      }

      const curUrl = window.location.pathname + window.location.search;
      const title = detectScreenTitle();
      const prevScreenId = currentScreenId;

      const newId = await snapshotCurrentScreen(title);
      if (newId) {
        // If server or client matched existing duplicate screen, don't re-toast or link
        if (prevScreenId && newId === prevScreenId) {
          lastFingerprint = currentFp;
          return;
        }

        lastFingerprint = currentFp;
        currentScreenId = newId;
        lastCapturedUrl = curUrl;
        await fetchScreens();
        showStudioToast(`📸 Screen captured: "${title}"`, 'camera');

        // If last step in active chapter has no targetScreen and this is a new screen, link it!
        if (cfg.chapters?.length) {
          const ch = cfg.chapters[cfg.chapters.length - 1];
          if (ch.steps?.length) {
            const lastStep = ch.steps[ch.steps.length - 1];
            if (prevScreenId && prevScreenId !== newId && !lastStep.targetScreen) {
              lastStep.targetScreen = newId;
              dirty = true;
              renderEditor();
            }
          }
        }

        if (isRecordingSession) {
          if (recordedSessionActions.length) {
            const prev = recordedSessionActions[recordedSessionActions.length - 1];
            if (prevScreenId && prevScreenId !== newId) {
              prev.targetScreen = newId;
            }
          }
          updateRecBarStats();
        }
      }
    }, 300);
  }

  function startAutoCaptureObserver() {
    if (autoCaptureActive) return;
    autoCaptureActive = true;

    if (!hasHookedHistory) {
      hasHookedHistory = true;
      origPushState = window.history.pushState;
      origReplaceState = window.history.replaceState;

      window.history.pushState = function(...args) {
        const res = origPushState.apply(this, args);
        if (autoCaptureMode) triggerAutoCapture('pushState');
        return res;
      };
      window.history.replaceState = function(...args) {
        const res = origReplaceState.apply(this, args);
        if (autoCaptureMode) triggerAutoCapture('replaceState');
        return res;
      };
    }

    window.addEventListener('popstate', onPopStateAutoCapture);
    window.addEventListener('hashchange', onPopStateAutoCapture);
    document.addEventListener('click', onInteractiveNavClick, true);
  }

  function stopAutoCaptureObserver() {
    autoCaptureActive = false;
    clearTimeout(autoCaptureTimer);
    window.removeEventListener('popstate', onPopStateAutoCapture);
    window.removeEventListener('hashchange', onPopStateAutoCapture);
    document.removeEventListener('click', onInteractiveNavClick, true);
  }

  function onPopStateAutoCapture() {
    if (autoCaptureMode) triggerAutoCapture('popstate');
  }

  function onInteractiveNavClick(e) {
    if (!autoCaptureMode) return;
    if (pickMode) return; // In pick mode, handled by element click
    if (e.target.closest('#demostudio-studio, #demostudio-layer, #demostudio-launch, #studio-rec-bar, #studio-ai-modal, #studio-floating-toast')) return;

    // Filter out clicks on inputs, checkboxes, radios or options that don't transition screens
    const target = e.target;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(target.tagName)) return;
    if (target.type === 'checkbox' || target.type === 'radio') return;

    const navEl = target.closest('a, button, [role="button"], [role="tab"], [role="menuitem"], nav *');
    if (navEl) {
      triggerAutoCapture('userClick');
    }
  }

  function showStudioToast(msg, icon = 'check_circle') {
    let toast = document.getElementById('studio-floating-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'studio-floating-toast';
      document.body.appendChild(toast);
    }
    toast.className = '';
    toast.innerHTML = `
      <span class="material-symbols-outlined" style="color:var(--md-primary);font-size:18px;">${icon}</span>
      <span>${esc(msg)}</span>
    `;
    toast.style.display = 'flex';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => { toast.style.display = 'none'; }, 250);
    }, 2500);
  }

  // ── Reprise In-Place Content Editor ──────────────────────────
  function toggleContentEditing(force) {
    editContentMode = force !== undefined ? force : !editContentMode;
    document.body.classList.toggle('studio-content-editing', editContentMode);
    wrap.querySelector('#studio-edit-content').classList.toggle('on', editContentMode);

    let banner = document.getElementById('studio-content-edit-banner');
    if (editContentMode) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'studio-content-edit-banner';
        banner.innerHTML = `
          <span><span class="status-dot"></span> In-Place Content Editor Active — Click any text or metric on the page to customize.</span>
          <button onclick="window.__tourStudio.toggleContentEditing(false)">Done</button>
        `;
        document.body.appendChild(banner);
      }
      banner.style.display = 'flex';

      // Make text elements editable
      document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, td, th, label, button').forEach(el => {
        if (!el.closest('#demostudio-studio, #studio-content-edit-banner')) {
          el.setAttribute('contenteditable', 'true');
        }
      });
      flash('Content editing enabled. Click any text to modify.');
    } else {
      if (banner) banner.style.display = 'none';
      document.querySelectorAll('[contenteditable="true"]').forEach(el => {
        el.removeAttribute('contenteditable');
      });
      flash('Content editing turned off.');
    }
  }

  // ── Reprise Screen Snapshot Capture ──────────────────────────
  async function snapshotCurrentScreen(customName) {
    if (!window.__DemoStudioSnapshot) {
      flash('Snapshot engine not ready');
      return null;
    }
    flash('Capturing screen state…');
    const screenId = 'screen_' + Date.now();
    const screenName = customName || detectScreenTitle();
    const captured = window.__DemoStudioSnapshot.captureScreen(screenId, screenName);

    try {
      const res = await fetch('/__tour/studio/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenId,
          screenName,
          html: captured.html,
          meta: captured.meta
        })
      });
      const data = await res.json();
      if (data.ok) {
        if (data.duplicate) {
          console.log('[Snapshot] Reusing existing duplicate screen:', data.screenId);
          return data.screenId;
        }
        flash(`Snapshot saved (${data.totalScreens} screens in sandbox)`);
        return data.screenId || screenId;
      }
    } catch (e) {
      console.warn('Snapshot error:', e);
    }
    return screenId;
  }

  // ── AI Settings Modal ───────────────────────────────────────
  function showAiSettingsModal() {
    let modal = document.getElementById('studio-ai-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'studio-ai-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:2147483600;font-family:inherit;';
      document.body.appendChild(modal);
    }

    const savedProvider = localStorage.getItem('demostudio_ai_provider') || 'gemini';
    const savedKey = localStorage.getItem('demostudio_ai_key') || '';
    const savedEndpoint = localStorage.getItem('demostudio_ai_endpoint') || '';
    const savedModel = localStorage.getItem('demostudio_ai_model') || (savedProvider === 'gemini' ? 'gemini-2.5-flash' : '');
    const savedRoutes = localStorage.getItem('demostudio_custom_routes') || '';

    modal.innerHTML = `
      <div style="background:var(--md-sys-color-surface-container, #1e1f25);border:1px solid var(--md-sys-color-outline-variant, #44474f);border-radius:24px;padding:28px;width:480px;max-width:92%;color:#e2e2e9;box-shadow:0 8px 32px rgba(0,0,0,0.6);font-family:'Roboto', sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:10px;background:#0842a0;color:#d3e3fd;display:flex;align-items:center;justify-content:center;">
              <span class="material-symbols-outlined" style="font-size:20px;">psychology</span>
            </div>
            <div>
              <h3 style="font-size:16px;font-weight:500;color:#e2e2e9;margin:0;">Intelligence Settings</h3>
              <div style="font-size:11.5px;color:#8e9099;">Configure AI models for tour generation</div>
            </div>
          </div>
          <button id="ai-modal-close" style="background:none;border:none;color:#8e9099;font-size:20px;cursor:pointer;padding:4px;border-radius:50%;display:flex;align-items:center;justify-content:center;">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div style="margin-top:18px;margin-bottom:14px;">
          <label style="display:block;font-size:11px;font-weight:500;color:#a8c7fa;margin-bottom:6px;letter-spacing:0.02em;">PROVIDER</label>
          <select id="ai-modal-provider" style="width:100%;height:44px;padding:0 12px;border-radius:12px;background:#282a30;border:1px solid #44474f;color:#e2e2e9;font-size:13px;outline:none;font-family:inherit;">
            <option value="gemini" ${savedProvider === 'gemini' ? 'selected' : ''}>Google Gemini (Recommended)</option>
            <option value="openrouter" ${savedProvider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
            <option value="groq" ${savedProvider === 'groq' ? 'selected' : ''}>Groq</option>
            <option value="openai" ${savedProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
            <option value="local" ${savedProvider === 'local' ? 'selected' : ''}>Local LLM (LM Studio / Ollama)</option>
            <option value="heuristic" ${savedProvider === 'heuristic' ? 'selected' : ''}>Built-In Heuristics (No Key Needed)</option>
          </select>
        </div>

        <div id="ai-key-row" style="margin-bottom:14px;">
          <label id="ai-key-label" style="display:block;font-size:11px;font-weight:500;color:#a8c7fa;margin-bottom:6px;letter-spacing:0.02em;">
            ${savedProvider === 'gemini' ? 'GEMINI API KEY' : 'API KEY'}
          </label>
          <input id="ai-modal-key" type="password" placeholder="${savedProvider === 'gemini' ? 'AIzaSy... (from aistudio.google.com)' : 'sk-...'}" value="${escAttr(savedKey)}" style="width:100%;height:44px;padding:0 12px;border-radius:12px;background:#282a30;border:1px solid #44474f;color:#e2e2e9;font-size:13px;outline:none;font-family:inherit;" />
          <div id="ai-key-hint" style="font-size:11px;color:#a8c7fa;margin-top:6px;">
            ${savedProvider === 'gemini' ? 'Get a free key from <a href="https://aistudio.google.com" target="_blank" style="color:#a8c7fa;text-decoration:underline;">aistudio.google.com</a>' : ''}
          </div>
        </div>

        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:11px;font-weight:500;color:#a8c7fa;margin-bottom:6px;letter-spacing:0.02em;">MODEL IDENTIFIER</label>
          <input id="ai-modal-model" type="text" placeholder="gemini-2.5-flash" value="${escAttr(savedModel || 'gemini-2.5-flash')}" style="width:100%;height:44px;padding:0 12px;border-radius:12px;background:#282a30;border:1px solid #44474f;color:#e2e2e9;font-size:13px;outline:none;font-family:inherit;" />
        </div>

        <div id="ai-endpoint-row" style="margin-bottom:14px; ${savedProvider === 'local' ? '' : 'display:none;'}">
          <label style="display:block;font-size:11px;font-weight:500;color:#a8c7fa;margin-bottom:6px;letter-spacing:0.02em;">CUSTOM ENDPOINT</label>
          <input id="ai-modal-endpoint" type="text" placeholder="http://localhost:1234/v1/chat/completions" value="${escAttr(savedEndpoint)}" style="width:100%;height:44px;padding:0 12px;border-radius:12px;background:#282a30;border:1px solid #44474f;color:#e2e2e9;font-size:13px;outline:none;font-family:inherit;" />
        </div>

        <div style="margin-bottom:20px;">
          <label style="display:block;font-size:11px;font-weight:500;color:#a8c7fa;margin-bottom:6px;letter-spacing:0.02em;">TARGET ROUTES TO CRAWL (OPTIONAL)</label>
          <input id="ai-modal-routes" type="text" placeholder="/okr, /dashboard, /settings" value="${escAttr(savedRoutes)}" style="width:100%;height:44px;padding:0 12px;border-radius:12px;background:#282a30;border:1px solid #44474f;color:#e2e2e9;font-size:13px;outline:none;font-family:inherit;" />
          <div style="font-size:11px;color:#8e9099;margin-top:6px;">Comma-separated SPA routes to autonomously visit and capture.</div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
          <button id="ai-modal-cancel" style="height:40px;padding:0 18px;border-radius:9999px;background:#282a30;border:1px solid #44474f;color:#e2e2e9;font-size:13px;cursor:pointer;font-weight:500;">Cancel</button>
          <button id="ai-modal-save" style="height:40px;padding:0 22px;border-radius:9999px;background:#a8c7fa;border:none;color:#062e6f;font-weight:500;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
            <span class="material-symbols-outlined" style="font-size:18px;">check</span>
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    `;
    modal.style.display = 'flex';

    const provSelect = document.getElementById('ai-modal-provider');
    const keyLabel = document.getElementById('ai-key-label');
    const keyInput = document.getElementById('ai-modal-key');
    const keyHint = document.getElementById('ai-key-hint');
    const modelInput = document.getElementById('ai-modal-model');
    const endRow = document.getElementById('ai-endpoint-row');

    provSelect.onchange = () => {
      const p = provSelect.value;
      if (p === 'gemini') {
        keyLabel.textContent = 'Gemini API Key';
        keyInput.placeholder = 'AIzaSy... (from aistudio.google.com)';
        keyHint.innerHTML = 'Get a free Gemini key at <a href="https://aistudio.google.com" target="_blank" style="color:#60a5fa;">aistudio.google.com</a>';
        if (!modelInput.value || modelInput.value.includes('openrouter')) modelInput.value = 'gemini-2.5-flash';
        endRow.style.display = 'none';
      } else if (p === 'local') {
        keyLabel.textContent = 'API Key (Optional)';
        keyInput.placeholder = 'not-needed';
        keyHint.textContent = 'Connects to LM Studio or Ollama on your machine';
        endRow.style.display = 'block';
        if (!document.getElementById('ai-modal-endpoint').value) {
          document.getElementById('ai-modal-endpoint').value = 'http://localhost:1234/v1/chat/completions';
        }
      } else {
        keyLabel.textContent = 'API Key';
        keyInput.placeholder = 'sk-...';
        keyHint.textContent = '';
        endRow.style.display = 'none';
      }
    };

    document.getElementById('ai-modal-close').onclick = () => modal.style.display = 'none';
    document.getElementById('ai-modal-cancel').onclick = () => modal.style.display = 'none';
    document.getElementById('ai-modal-save').onclick = () => {
      const provider = provSelect.value;
      const key = (keyInput.value || '').trim();
      const endpoint = (document.getElementById('ai-modal-endpoint').value || '').trim();
      const model = (modelInput.value || '').trim();
      const routes = (document.getElementById('ai-modal-routes')?.value || '').trim();

      localStorage.setItem('demostudio_ai_provider', provider);
      localStorage.setItem('demostudio_ai_key', key);
      localStorage.setItem('demostudio_ai_endpoint', endpoint);
      localStorage.setItem('demostudio_ai_model', model);
      localStorage.setItem('demostudio_custom_routes', routes);

      modal.style.display = 'none';
      flash(`Connected: ${provider === 'gemini' ? 'Google Gemini' : provider}`);
    };
  }

  // ── DOM Inventory Collection for AI ──────────────────────────
  function collectDomInventory(max = 100) {
    const rawElements = [];
    const seen = new Set();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Primary query for rich semantic and interactive targets
    let all = [
      ...document.querySelectorAll(
        'button, a, nav, input, select, textarea, h1, h2, h3, h4, [role="button"], [role="navigation"], [role="search"], [role="tab"], [role="link"], [data-testid], [aria-label], table, [class*="card"], [class*="stat"], [class*="kpi"], [class*="item"], [class*="btn"], [class*="button"], [class*="menu"], [class*="nav"], header, section, main, [tabindex="0"]'
      )
    ];

    // Fallback: If SPA has custom div/span structures, query clickable or meaningful text blocks
    if (all.length < 5) {
      const fallbackNodes = document.querySelectorAll('#root *, #app *, main *, body > div *');
      for (const node of fallbackNodes) {
        if (node.children.length === 0 && (node.textContent || '').trim().length > 2) {
          all.push(node);
        }
      }
    }

    for (const el of all) {
      if (el.closest('#demostudio-studio, #demostudio-layer, #demostudio-launch, #studio-content-edit-banner, #studio-ai-modal')) continue;

      // Exclude script, style, noscript, svg paths
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'PATH', 'DEFS'].includes(el.tagName)) continue;

      // Exclude footers, copyright, and legal areas
      if (el.closest('footer, #footer, .footer, [role="contentinfo"], .legal, .copyright')) continue;

      // Exclude cookie consent and tracking banners
      if (el.closest('[class*="cookie" i], [id*="cookie" i], [aria-label*="cookie" i], [class*="consent" i], [id*="consent" i]')) continue;

      // Filter out invisible / hidden / zero-sized elements
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const comp = window.getComputedStyle(el);
      if (comp.display === 'none' || comp.visibility === 'hidden' || comp.opacity === '0') continue;

      const tag = el.tagName.toUpperCase();
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70);
      const aria = el.getAttribute('aria-label') || '';
      const ph = el.getAttribute('placeholder') || '';
      const desc = text || aria || ph || el.id || '';
      if (!desc && tag !== 'INPUT') continue;

      const sel = selectorFor(el);
      if (!sel || seen.has(sel)) continue;
      seen.add(sel);

      // Semantic Zone Classification
      let zone = 'content';
      const isAboveFold = r.top < vh;

      if (el.closest('nav, [role="navigation"], header, .navbar, .menu, #sidebar, aside') || (tag === 'A' && r.top < 120)) {
        zone = 'navigation';
      } else if (isAboveFold && (tag === 'H1' || tag === 'H2' || el.closest('.hero, [class*="hero" i], .banner, .jumbotron'))) {
        zone = 'hero';
      } else if (tag === 'BUTTON' || el.getAttribute('role') === 'button' || el.classList.contains('btn') || el.classList.contains('button')) {
        zone = 'action';
      } else if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.getAttribute('role') === 'search') {
        zone = 'input';
      } else if (el.closest('.stat, .kpi, .card, [class*="stat" i], [class*="kpi" i], [class*="metric" i]') || tag === 'TABLE') {
        zone = 'stat';
      }

      // Optimal Tooltip Position (Collision-free pre-calculation)
      let optimalPos = 'bottom';
      const spaceBelow = vh - (r.top + r.height);
      const spaceAbove = r.top;

      if (spaceBelow < 220 && spaceAbove >= 200) {
        optimalPos = 'top';
      } else if (spaceAbove < 220 && spaceBelow >= 200) {
        optimalPos = 'bottom';
      } else if (r.left > vw * 0.72) {
        optimalPos = 'left';
      } else if (r.left + r.width < vw * 0.28) {
        optimalPos = 'right';
      } else {
        optimalPos = spaceBelow >= spaceAbove ? 'bottom' : 'top';
      }

      // Prominence Scoring
      let score = 0;
      if (isAboveFold) score += 50;
      if (zone === 'hero') score += 100;
      else if (zone === 'action') score += 80;
      else if (zone === 'input') score += 75;
      else if (zone === 'navigation') score += 60;
      else if (zone === 'stat') score += 45;
      else score += 20;

      if (tag === 'H1') score += 60;
      else if (tag === 'H2') score += 40;
      else if (tag === 'BUTTON' || el.getAttribute('role') === 'button') score += 35;
      else if (tag === 'INPUT' && (ph.toLowerCase().includes('search') || el.type === 'search')) score += 35;

      const area = r.width * r.height;
      if (area > 3000) score += 15;
      if (area > 15000) score += 15;

      // Penalties for tiny or very deep elements
      if (r.top > vh * 2) score -= 50;
      const href = (tag === 'A' ? el.getAttribute('href') : null) || null;
      const isNav = zone === 'navigation' || !!href || tag === 'A' || el.getAttribute('role') === 'tab';

      rawElements.push({
        tag,
        text: desc,
        role: el.getAttribute('role') || '',
        sel,
        zone,
        optimalPos,
        score,
        href,
        isNav,
        top: Math.round(r.top),
        left: Math.round(r.left)
      });
    }

    // Sort by prominence score so AI gets the most impactful elements first
    rawElements.sort((a, b) => b.score - a.score);
    return rawElements.slice(0, max);
  }

  // Helper: Wait for SPA DOM hydration if needed
  async function waitForElements(maxWaitMs = 2500) {
    let elements = collectDomInventory();
    if (elements.length >= 3) return elements;

    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await new Promise(r => setTimeout(r, 300));
      elements = collectDomInventory();
      if (elements.length >= 3) return elements;
    }
    return elements;
  }

  // ── 1-Click Multi-Page Autonomous AI Demo Engine ─────────────
  async function aiAutoDemo() {
    const btn = document.querySelector('#studio-ai-auto');
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="studio-rec-dot"></span><span>Crawling Pages…</span>';

    try {
      showStudioToast('Starting Autonomous Multi-Page Demo Crawl...', 'auto_awesome');
      flash('Starting autonomous multi-page capture…');

      // 1. Snapshot Initial Primary View
      const primaryTitle = detectScreenTitle('Primary View');
      const primaryScreenId = await snapshotCurrentScreen(primaryTitle);
      const primaryDom = await waitForElements(1500);

      const visitedScreens = [{
        screenId: primaryScreenId,
        screenName: primaryTitle,
        url: window.location.pathname,
        dom: primaryDom
      }];

      // 2. Discover Navigation Routes & Targets
      // Check for user-defined custom routes first (from Settings)
      const customRoutesRaw = localStorage.getItem('demostudio_custom_routes') || '';
      const customRoutes = customRoutesRaw
        .split(/[,\n]/)
        .map(r => r.trim())
        .filter(r => r && r !== window.location.pathname);

      const navTargets = [];
      const seenNavKeys = new Set([primaryTitle.toLowerCase(), window.location.pathname]);

      // Synthetic Event Dispatcher for modern React / MUI / SPA event listeners
      function triggerSpaClick(targetEl) {
        if (!targetEl) return;
        const rect = targetEl.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const opts = { bubbles: true, cancelable: true, view: window, clientX, clientY };

        try { targetEl.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (e) {}
        try { targetEl.dispatchEvent(new MouseEvent('mousedown', opts)); } catch (e) {}
        try { targetEl.focus(); } catch (e) {}
        try { targetEl.dispatchEvent(new PointerEvent('pointerup', opts)); } catch (e) {}
        try { targetEl.dispatchEvent(new MouseEvent('mouseup', opts)); } catch (e) {}
        try { targetEl.click(); } catch (e) {}
      }

      // If custom routes provided, prioritize them
      if (customRoutes.length > 0) {
        for (const route of customRoutes.slice(0, 3)) {
          navTargets.push({
            type: 'route',
            path: route,
            text: route.replace(/^\//, '').toUpperCase() || 'Home',
            sel: 'body'
          });
        }
      } else {
        // Query rich SPA navigation elements:
        // Sidebar rails, MUI icon buttons, tabs, aria-label links, and standard nav links
        const navCandidates = Array.from(document.querySelectorAll(
          'nav a, nav button, aside a, aside button, ' +
          '[role="navigation"] a, [role="navigation"] button, [role="tab"], ' +
          '.MuiTab-root, .MuiIconButton-root, [class*="sidebar" i] button, [class*="sidebar" i] a, ' +
          '[class*="rail" i] button, [class*="drawer" i] button, [class*="nav" i] button, [class*="nav" i] a'
        )).filter(el => {
          if (el.closest('#demostudio-studio, #studio-rec-bar, #studio-ai-modal, #studio-floating-toast')) return false;
          if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;

          // Don't click studio controls or utility buttons
          const titleOrAria = (el.getAttribute('title') || el.getAttribute('aria-label') || '').toLowerCase();
          if (titleOrAria.includes('logout') || titleOrAria.includes('sign out') || titleOrAria.includes('delete') || titleOrAria.includes('theme') || titleOrAria.includes('mode')) return false;

          // Check if button is placed in sidebar rail (left edge) or top navigation bar
          const rect = el.getBoundingClientRect();
          const isInLeftRail = rect.left < 200 && rect.width <= 120;
          const isInTopNav = rect.top < 90 && rect.height <= 80;
          const isExplicitNav = !!el.closest('nav, aside, [role="navigation"], [role="tablist"]');

          if (!isInLeftRail && !isInTopNav && !isExplicitNav) return false;

          if (el.tagName === 'A') {
            const href = el.getAttribute('href');
            if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:')) return false;
            try {
              const urlObj = new URL(href, window.location.href);
              if (urlObj.origin !== window.location.origin) return false;
              if (urlObj.pathname === window.location.pathname && !urlObj.search) return false;
            } catch (e) {
              return false;
            }
          }
          return true;
        });

        // Filter and collect distinct navigation targets (up to 3 distinct destinations)
        for (const el of navCandidates) {
          const text = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
          const tag = el.tagName.toUpperCase();
          const href = el.getAttribute('href') || '';
          const key = (href || text || el.className).slice(0, 40).toLowerCase();

          if (seenNavKeys.has(key)) continue;
          seenNavKeys.add(key);

          const sel = selectorFor(el);
          if (!sel) continue;

          navTargets.push({
            type: 'dom',
            el,
            text: text || (href ? href.replace(/^\//, '') : 'View ' + (navTargets.length + 2)),
            sel,
            href
          });

          if (navTargets.length >= 3) break;
        }
      }

      // 3. Visit and Snapshot Navigation Views
      const initialPath = window.location.pathname;
      const initialDomHash = (primaryDom || []).slice(0, 10).map(d => d.text).join('|');

      for (let i = 0; i < navTargets.length; i++) {
        const nav = navTargets[i];
        flash(`Exploring ${nav.text}… (${i + 1}/${navTargets.length})`);
        btn.innerHTML = `<span class="studio-rec-dot"></span><span>Page ${i + 2}…</span>`;

        try {
          if (nav.type === 'route') {
            // Direct SPA route push
            if (window.history && window.history.pushState) {
              window.history.pushState({}, '', nav.path);
              window.dispatchEvent(new PopStateEvent('popstate'));
            } else {
              window.location.pathname = nav.path;
            }
            await new Promise(r => setTimeout(r, 1400));
          } else {
            // Trigger synthetic click on SPA element
            triggerSpaClick(nav.el);
            // Wait for potential client-side route change or view transition
            await new Promise(r => setTimeout(r, 1400));
          }

          // Check if view actually mutated
          const nextDom = await waitForElements(1800);
          const nextDomHash = (nextDom || []).slice(0, 10).map(d => d.text).join('|');

          // Only snapshot if the page or DOM structure actually changed
          if (window.location.pathname !== initialPath || nextDomHash !== initialDomHash) {
            const nextTitle = detectScreenTitle(nav.text);
            const nextScreenId = await snapshotCurrentScreen(nextTitle);

            if (nextScreenId) {
              visitedScreens.push({
                screenId: nextScreenId,
                screenName: nextTitle,
                url: window.location.pathname,
                dom: nextDom,
                triggerSel: nav.sel
              });
            }
          }
        } catch (navErr) {
          console.warn('[Auto-Demo Crawler] Navigation attempt error:', navErr);
        }
      }

      flash(`Synthesizing multi-page demo (${visitedScreens.length} pages captured)…`);
      btn.innerHTML = '<span>Synthesizing…</span>';

      // 4. Request Multi-Page AI Tour Synthesis
      const provider = localStorage.getItem('demostudio_ai_provider') || 'gemini';
      const apiKey = localStorage.getItem('demostudio_ai_key') || undefined;
      const llmEndpoint = localStorage.getItem('demostudio_ai_endpoint') || undefined;
      const llmModel = localStorage.getItem('demostudio_ai_model') || undefined;
      const metaDescription = document.querySelector('meta[name="description"]')?.content || '';

      const res = await fetch('/__tour/studio/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dom: visitedScreens[0].dom,
          screens: visitedScreens,
          url: location.href,
          appName: document.title || 'My Application',
          provider,
          apiKey,
          llmEndpoint,
          llmModel,
          metaDescription
        })
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'AI generation failed');
      if (!data.config || !data.config.chapters?.length) throw new Error('AI returned empty demo');

      // Link screen transitions across chapters
      if (visitedScreens.length > 1) {
        data.config.chapters.forEach((ch, cIdx) => {
          const sc = visitedScreens[cIdx] || visitedScreens[visitedScreens.length - 1];
          ch.steps.forEach(st => {
            if (!st.screenId) st.screenId = sc.screenId;
          });
          // Set transition on the last step of previous chapter to current chapter's screen
          if (cIdx > 0 && data.config.chapters[cIdx - 1]?.steps?.length) {
            const prevSteps = data.config.chapters[cIdx - 1].steps;
            prevSteps[prevSteps.length - 1].targetScreen = sc.screenId;
            prevSteps[prevSteps.length - 1].action = true;
          }
        });
      } else {
        data.config.chapters.forEach(ch => {
          ch.steps.forEach(st => {
            if (!st.screenId) st.screenId = primaryScreenId;
          });
        });
      }

      cfg = data.config;
      dirty = true;
      try { localStorage.setItem(getDraftKey(), JSON.stringify(cfg)); } catch (e) {}

      activeChapterIdx = 0;
      activeStepIdx = 0;
      await fetchScreens();
      renderChapters();
      renderEditor();

      // Auto-save to server
      await save();

      const totalSteps = cfg.chapters.reduce((a, c) => a + (c.steps || []).length, 0);
      showStudioToast(`Multi-page demo generated! (${cfg.chapters.length} chapters across ${visitedScreens.length} pages)`, 'auto_awesome');
      flash(`Multi-page demo generated (${cfg.chapters.length} chapters, ${totalSteps} steps)`);

      // Immediately launch live preview
      setTimeout(preview, 600);
    } catch (e) {
      console.error('[AI Auto-Demo]', e);
      flash('Error: ' + e.message, 3500);
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }

  // ── 1-Click Standalone Demo Export ───────────────────────────
  async function exportStandalone() {
    flash('Packaging standalone bundle…');
    // Ensure at least one screen snapshot exists
    await snapshotCurrentScreen('Primary View');

    try {
      const res = await fetch('/__tour/studio/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg })
      });
      const data = await res.json();
      if (data.ok) {
        alert(
          'Standalone demo successfully exported.\n\n' +
          'Directory: ' + data.exportDir + '\n' +
          'Entry File: ' + data.indexPath + '\n\n' +
          'You can now open index.html directly in any browser, embed it in an iframe, or host it statically with zero backend dependencies.'
        );
        flash('Exported to built-demo/');
      } else {
        flash('Export failed: ' + data.error);
      }
    } catch (e) {
      flash('Export failed: ' + e.message);
    }
  }

  // ── Render Steps & Chapters ──────────────────────────────────
  function renderChapters() {
    chaptersEl.innerHTML = '';
    if (!cfg.chapters.length) {
      chaptersEl.innerHTML = '<div class="studio-empty">No chapters created. Click <b>+ Chapter</b> above to get started.</div>';
      return;
    }
    cfg.chapters.forEach((ch, ci) => {
      const sec = document.createElement('div');
      sec.className = 'studio-chapter';
      const title = document.createElement('div');
      title.className = 'studio-chapter-title';
      title.innerHTML = `
        <span style="font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ch.title) || ('Chapter ' + (ci + 1))}</span>
        <span class="studio-chapter-count">${ch.steps.length}</span>
        <button class="studio-mini studio-step-add-btn" data-ci="${ci}" title="Add step to this chapter" style="margin-left:auto;margin-right:3px;">+ Step</button>
        <button class="studio-mini studio-ch-del" data-ci="${ci}" title="Delete chapter">✕</button>
      `;
      sec.appendChild(title);

      ch.steps.forEach((s, si) => {
        const row = document.createElement('div');
        const isActive = (activeChapterIdx === ci && activeStepIdx === si);
        row.className = 'studio-step' + (isActive ? ' on' : '');
        row.innerHTML = `
          <span class="studio-step-num">${ci + 1}.${si + 1}</span>
          <span class="studio-step-title">${esc(s.title)}</span>
          <span class="studio-step-sel">${esc(s.sel || '')}</span>
          <button class="studio-mini studio-step-del" data-ci="${ci}" data-si="${si}" title="Delete step">✕</button>
        `;
        row.addEventListener('click', () => {
          activeChapterIdx = ci;
          activeStepIdx = si;
          renderChapters();
          renderEditor();
        });
        sec.appendChild(row);
      });
      chaptersEl.appendChild(sec);
    });
  }

  function renderEditor() {
    if (!cfg.chapters.length) {
      editorEl.innerHTML = '<div class="studio-empty">No chapters or steps yet. Click <b>+ Chapter</b> or run <b>Auto Demo</b>.</div>';
      return;
    }
    if (activeChapterIdx < 0 || activeChapterIdx >= cfg.chapters.length) {
      activeChapterIdx = 0;
    }
    const ch = cfg.chapters[activeChapterIdx];
    if (!ch || !ch.steps || !ch.steps.length) {
      editorEl.innerHTML = `<div class="studio-empty">Chapter "${esc(ch?.title || 'Chapter ' + (activeChapterIdx + 1))}" has no steps.<br><br><button class="studio-btn studio-primary" id="ed-add-first-step" style="padding:4px 10px;font-size:11.5px;">+ Add Step</button></div>`;
      const btn = editorEl.querySelector('#ed-add-first-step');
      if (btn) {
        btn.addEventListener('click', () => {
          ch.steps.push({
            title: 'New Step',
            body: 'Click or inspect an element to proceed.',
            sel: 'body',
            pos: 'bottom',
            action: true
          });
          activeStepIdx = 0;
          dirty = true;
          renderChapters();
          renderEditor();
        });
      }
      return;
    }
    if (activeStepIdx < 0 || activeStepIdx >= ch.steps.length) {
      activeStepIdx = 0;
    }
    const s = ch.steps[activeStepIdx];
    if (!s) {
      editorEl.innerHTML = '<div class="studio-empty">Select a step to edit.</div>';
      return;
    }

    editorEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--md-outline-variant);">
        <span style="font-size:11px;font-weight:600;color:var(--md-primary);text-transform:uppercase;letter-spacing:0.04em;">
          Chapter ${activeChapterIdx + 1} &bull; Step ${activeStepIdx + 1}
        </span>
        <span style="font-size:11px;color:var(--md-outline);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${esc(ch.title || '')}
        </span>
      </div>
      <div class="studio-field">
        <label>
          <span class="material-symbols-outlined" style="font-size:14px;">title</span>
          <span>Step Title</span>
        </label>
        <input id="ed-title" value="${escAttr(s.title)}" placeholder="e.g. Explore Main Dashboard">
      </div>
      <div class="studio-field">
        <label>
          <span class="material-symbols-outlined" style="font-size:14px;">description</span>
          <span>Description Body</span>
        </label>
        <textarea id="ed-body" rows="3" placeholder="Explain the value or action to the prospect...">${esc(s.body)}</textarea>
      </div>
      <div class="studio-field">
        <label>
          <span class="material-symbols-outlined" style="font-size:14px;">code</span>
          <span>Target Selector</span>
        </label>
        <input id="ed-sel" value="${escAttr(s.sel)}" placeholder="e.g. #dashboard or button.btn-primary">
      </div>
      <div class="studio-field-row">
        <div class="studio-field">
          <label>
            <span class="material-symbols-outlined" style="font-size:14px;">my_location</span>
            <span>Position</span>
          </label>
          <select id="ed-pos">
            ${['bottom','top','left','right','center'].map(p => `<option ${s.pos === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="studio-field">
          <label>
            <span class="material-symbols-outlined" style="font-size:14px;">touch_app</span>
            <span>User Action</span>
          </label>
          <select id="ed-action">
            <option value="true" ${s.action ? 'selected' : ''}>Click element (Action required - no Next button)</option>
            <option value="false" ${!s.action ? 'selected' : ''}>Next button only</option>
          </select>
        </div>
      </div>
      <div class="studio-field-row">
        <div class="studio-field">
          <label>
            <span class="material-symbols-outlined" style="font-size:14px;">filter_none</span>
            <span>Screen Anchor</span>
          </label>
          <select id="ed-screen">
            <option value="">Default (Current View)</option>
            ${capturedScreensList.map(sc => `<option value="${escAttr(sc.id)}" ${s.screenId === sc.id ? 'selected' : ''}>${esc(sc.name)}</option>`).join('')}
          </select>
        </div>
        <div class="studio-field">
          <label>
            <span class="material-symbols-outlined" style="font-size:14px;">alt_route</span>
            <span>Screen Transition</span>
          </label>
          <select id="ed-target-screen">
            <option value="">Stay on Screen</option>
            ${capturedScreensList.map(sc => `<option value="${escAttr(sc.id)}" ${s.targetScreen === sc.id ? 'selected' : ''}>Transition to: ${esc(sc.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="studio-actions">
        <button id="ed-apply" class="studio-btn studio-primary">
          <span class="material-symbols-outlined" style="font-size:16px;">check</span>
          <span>Apply Changes</span>
        </button>
        <button id="ed-test" class="studio-btn">
          <span class="material-symbols-outlined" style="font-size:16px;">search</span>
          <span>Test Element</span>
        </button>
      </div>
    `;

    document.querySelector('#ed-apply').addEventListener('click', () => {
      s.title = document.querySelector('#ed-title').value;
      s.body = document.querySelector('#ed-body').value;
      s.sel = document.querySelector('#ed-sel').value;
      s.pos = document.querySelector('#ed-pos').value;
      s.action = document.querySelector('#ed-action').value === 'true';
      const screenVal = document.querySelector('#ed-screen').value;
      const targetVal = document.querySelector('#ed-target-screen').value;
      s.screenId = screenVal || undefined;
      s.targetScreen = targetVal || undefined;
      if (s.targetScreen) s.action = true; // Screen transition requires click
      dirty = true;
      renderChapters();
      flash('Step updated');
    });

    document.querySelector('#ed-test').addEventListener('click', () => {
      const sel = document.querySelector('#ed-sel').value;
      const el = window.DemoStudio && DemoStudio.find ? DemoStudio.find(sel) : document.querySelector(sel);
      if (el) {
        flash('Matched: ' + el.tagName.toLowerCase());
        const r = el.getBoundingClientRect();
        const hb = document.createElement('div');
        hb.id = 'studio-hover';
        hb.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border:1.5px solid #2563eb;z-index:999999;`;
        document.body.appendChild(hb);
        setTimeout(() => hb.remove(), 1500);
      } else {
        flash('Selector not found on page');
      }
    });
  }

  // ── Preview, Save, Connect ───────────────────────────────────
  function preview() {
    if (window.DemoStudio) {
      window.DemoStudio.reload(JSON.parse(JSON.stringify(cfg)));
      setTimeout(() => window.DemoStudio.start(), 300);
    }
  }

  async function save() {
    try {
      const res = await fetch('/__tour/studio/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (res.ok) {
        dirty = false;
        flash('Configuration saved');
      } else {
        flash('Save error');
      }
    } catch (e) {
      flash('Save failed: ' + e.message);
    }
  }

  async function connectTarget() {
    const input = document.querySelector('#studio-url');
    let url = (input.value || '').trim();
    if (!url) { flash('Please enter a valid URL'); return; }
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    flash('Connecting to ' + url + '…');
    try {
      const res = await fetch('/__tour/studio/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.ok) {
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('demostudio_draft') || k.startsWith('demostudio_studio'))) localStorage.removeItem(k);
          }
        } catch (e) {}
        flash('Connected: ' + data.target);
        setTimeout(() => {
          location.href = '/?mode=studio';
        }, 500);
      } else {
        flash(data.error || 'Connection failed');
      }
    } catch (e) {
      flash('Connection error: ' + e.message);
    }
  }

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
  function flash(msg, ms = 2200) {
    const el = document.querySelector('#studio-save-state');
    if (el) el.textContent = msg;
    clearTimeout(flash._t);
    flash._t = setTimeout(() => { if (el) el.textContent = dirty ? '● unsaved' : ''; }, ms);
  }

  // ── Screens Manager ──────────────────────────────────────────
  async function fetchScreens() {
    try {
      const res = await fetch('/__tour/studio/screens');
      const data = await res.json();
      if (data.ok && Array.isArray(data.screens)) {
        capturedScreensList = data.screens;
        const countEl = document.querySelector('#studio-screens-count');
        if (countEl) countEl.textContent = capturedScreensList.length;
        renderScreens();
      }
    } catch (e) {
      console.warn('Failed to fetch screens:', e);
    }
  }

  function renderScreens() {
    const listEl = document.querySelector('#studio-screens-list');
    if (!listEl) return;
    if (!capturedScreensList.length) {
      listEl.innerHTML = '<div class="studio-empty">No screens captured yet. Click <b>Capture Current</b> or run <b>Auto Demo</b>.</div>';
      return;
    }

    listEl.innerHTML = capturedScreensList.map((sc, idx) => {
      // Count steps anchored to this screen
      let stepCount = 0;
      (cfg.chapters || []).forEach(ch => {
        (ch.steps || []).forEach(st => {
          if (st.screenId === sc.id || (!st.screenId && idx === 0)) stepCount++;
        });
      });

      return `
        <div class="studio-screen-card" data-id="${escAttr(sc.id)}">
          <div class="studio-screen-icon">
            <span class="material-symbols-outlined" style="font-size:20px;">desktop_windows</span>
          </div>
          <div class="studio-screen-info">
            <div class="studio-screen-name" title="${escAttr(sc.name)}">${esc(sc.name)}</div>
            <div class="studio-screen-sub">
              <span>${esc(sc.id)}</span>
              <span>•</span>
              <span>${stepCount} step${stepCount === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div class="studio-screen-actions">
            <button class="studio-mini studio-screen-rename" data-id="${escAttr(sc.id)}" title="Rename screen">
              <span class="material-symbols-outlined" style="font-size:16px;">edit</span>
            </button>
            <button class="studio-mini studio-screen-del" data-id="${escAttr(sc.id)}" title="Delete screen">
              <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Wire rename and delete
    listEl.querySelectorAll('.studio-screen-rename').forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const current = capturedScreensList.find(s => s.id === id);
        const newName = prompt('Enter new screen name:', current?.name || '');
        if (!newName || !newName.trim() || newName === current?.name) return;
        try {
          const res = await fetch('/__tour/studio/screens/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ screenId: id, name: newName.trim() })
          });
          const data = await res.json();
          if (data.ok) {
            flash('Screen renamed');
            await fetchScreens();
            renderEditor();
          }
        } catch (err) {
          flash('Rename failed');
        }
      };
    });

    listEl.querySelectorAll('.studio-screen-del').forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (!confirm('Delete this captured screen snapshot?')) return;
        try {
          const res = await fetch('/__tour/studio/screens/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ screenId: id })
          });
          const data = await res.json();
          if (data.ok) {
            flash('Screen deleted');
            await fetchScreens();
            renderEditor();
          }
        } catch (err) {
          flash('Delete failed');
        }
      };
    });
  }

  // ── Tabs Navigation ──────────────────────────────────────────
  function initTabs() {
    const tabBtns = wrap.querySelectorAll('.studio-tab-btn');
    const views = {
      steps: wrap.querySelector('#studio-view-steps'),
      screens: wrap.querySelector('#studio-view-screens'),
      agent: wrap.querySelector('#studio-view-agent')
    };

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        Object.keys(views).forEach(k => {
          if (views[k]) views[k].style.display = k === tab ? 'block' : 'none';
        });
        if (tab === 'screens') fetchScreens();
      });
    });
  }

  // ── Material Light/Dark Theme ────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem('demostudio_theme') || 'light';
    const icon = document.querySelector('#studio-theme-icon');
    if (saved === 'dark') {
      wrap.classList.add('theme-dark');
      if (icon) icon.textContent = 'light_mode';
    } else {
      wrap.classList.remove('theme-dark');
      if (icon) icon.textContent = 'dark_mode';
    }

    const toggleBtn = document.querySelector('#studio-theme-toggle');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        const isDark = wrap.classList.toggle('theme-dark');
        localStorage.setItem('demostudio_theme', isDark ? 'dark' : 'light');
        if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
        flash(`Theme set to ${isDark ? 'Dark' : 'Light'}`);
      };
    }
  }

  // ── Conversational AI Agent Chat ─────────────────────────────
  function initAgentChat() {
    const input = document.querySelector('#studio-agent-input');
    const sendBtn = document.querySelector('#studio-agent-send');
    const msgsEl = document.querySelector('#studio-chat-msgs');
    if (!input || !sendBtn || !msgsEl) return;

    async function sendChat(text) {
      const msg = (text || input.value || '').trim();
      if (!msg) return;
      input.value = '';

      // Append user bubble
      const userDiv = document.createElement('div');
      userDiv.className = 'studio-chat-msg studio-chat-user';
      userDiv.innerHTML = `<div class="studio-chat-bubble">${esc(msg)}</div>`;
      msgsEl.appendChild(userDiv);

      // Append loading assistant bubble
      const aiDiv = document.createElement('div');
      aiDiv.className = 'studio-chat-msg studio-chat-ai';
      aiDiv.innerHTML = `
        <div class="studio-chat-avatar"><span class="material-symbols-outlined">psychology</span></div>
        <div class="studio-chat-bubble">Thinking…</div>
      `;
      msgsEl.appendChild(aiDiv);
      msgsEl.scrollTop = msgsEl.scrollHeight;

      sendBtn.disabled = true;

      try {
        const dom = collectDomInventory();
        const apiKey = localStorage.getItem('demostudio_ai_key') || undefined;
        const llmModel = localStorage.getItem('demostudio_ai_model') || undefined;
        const llmEndpoint = localStorage.getItem('demostudio_ai_endpoint') || undefined;

        const res = await fetch('/__tour/studio/ai-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: msg,
            config: cfg,
            dom,
            apiKey,
            llmModel,
            llmEndpoint
          })
        });

        const data = await res.json();
        const bubble = aiDiv.querySelector('.studio-chat-bubble');

        if (data.ok) {
          // Format text response
          let cleanReply = data.reply || '';
          cleanReply = cleanReply.replace(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g, '').trim();
          bubble.innerHTML = esc(cleanReply).replace(/\n/g, '<br>');

          if (data.updatedConfig && data.updatedConfig.chapters?.length) {
            const propCard = document.createElement('div');
            propCard.className = 'studio-chat-proposal';
            const chCount = data.updatedConfig.chapters.length;
            const stCount = data.updatedConfig.chapters.reduce((a, c) => a + (c.steps || []).length, 0);

            propCard.innerHTML = `
              <div class="studio-chat-proposal-title">
                <span class="material-symbols-outlined" style="font-size:16px;">auto_awesome</span>
                <span>Proposed Walkthrough Changes (${chCount} ch, ${stCount} steps)</span>
              </div>
              <button class="studio-btn studio-primary" style="width:100%;margin-top:6px;padding:6px 12px;font-size:12px;">
                <span class="material-symbols-outlined" style="font-size:14px;">check_circle</span>
                <span>Apply to Live Tour</span>
              </button>
            `;

            propCard.querySelector('button').onclick = async () => {
              cfg = data.updatedConfig;
              dirty = true;
              try { localStorage.setItem(getDraftKey(), JSON.stringify(cfg)); } catch (e) {}
              renderChapters();
              renderEditor();
              await save();
              flash('AI tour changes applied!');
              propCard.querySelector('button').textContent = 'Applied';
              propCard.querySelector('button').disabled = true;
            };

            bubble.appendChild(propCard);
          }
        } else {
          bubble.textContent = 'AI error: ' + (data.error || 'Request failed');
        }
      } catch (err) {
        aiDiv.querySelector('.studio-chat-bubble').textContent = 'Error: ' + err.message;
      } finally {
        sendBtn.disabled = false;
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }
    }

    sendBtn.onclick = () => sendChat();
    input.onkeydown = e => { if (e.key === 'Enter') sendChat(); };

    // Prompt chips
    wrap.querySelectorAll('.studio-chat-chip').forEach(chip => {
      chip.onclick = () => sendChat(chip.dataset.prompt);
    });
  }

  // ── Wire Buttons ─────────────────────────────────────────────
  document.querySelector('#studio-ai-auto').addEventListener('click', async () => {
    await aiAutoDemo();
    await fetchScreens();
  });
  document.querySelector('#studio-ai-settings').addEventListener('click', showAiSettingsModal);
  document.querySelector('#studio-auto-inspect').addEventListener('click', () => {
    toggleAutoInspectSession();
  });
  document.querySelector('#studio-auto-capture').addEventListener('click', () => {
    setAutoCapture(!autoCaptureMode);
  });
  document.querySelector('#studio-pick').addEventListener('click', () => {
    setPick(!pickMode);
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (pickMode) {
        setPick(false);
        showStudioToast('Inspect cancelled', 'close');
      } else if (isRecordingSession) {
        stopSessionRecording();
        showStudioToast('Demo recording canceled', 'close');
      }
    }
  });
  document.querySelector('#studio-snapshot').addEventListener('click', async () => {
    await snapshotCurrentScreen();
    await fetchScreens();
  });
  document.querySelector('#studio-add-screen').addEventListener('click', async () => {
    await snapshotCurrentScreen();
    await fetchScreens();
  });
  document.querySelector('#studio-edit-content').addEventListener('click', () => toggleContentEditing());
  document.querySelector('#studio-preview').addEventListener('click', preview);
  document.querySelector('#studio-save').addEventListener('click', save);
  document.querySelector('#studio-export-standalone').addEventListener('click', exportStandalone);
  document.querySelector('#studio-connect').addEventListener('click', connectTarget);
  document.querySelector('#studio-url').addEventListener('keydown', e => { if (e.key === 'Enter') connectTarget(); });

  document.querySelector('#studio-min').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMinimize();
  });
  document.querySelector('#studio-close').addEventListener('click', () => {
    if (dirty && !confirm('Unsaved changes. Close studio anyway?')) return;
    wrap.remove();
  });
  document.querySelector('#studio-dashboard-btn').addEventListener('click', () => {
    if (dirty && !confirm('You have unsaved changes. Return to Dashboard anyway?')) return;
    location.href = '/__tour/dashboard';
  });
  document.querySelector('#studio-switch-target').addEventListener('click', async () => {
    if (dirty && !confirm('You have unsaved changes. Switch website anyway?')) return;
    try {
      await fetch('/__tour/studio/disconnect');
      location.href = '/__tour/welcome';
    } catch (e) {
      location.href = '/__tour/welcome';
    }
  });

  // Add Chapter Button Handler
  const addChBtn = wrap.querySelector('#studio-add-chapter-btn');
  if (addChBtn) {
    addChBtn.addEventListener('click', () => {
      const newChIdx = cfg.chapters.length + 1;
      cfg.chapters.push({
        title: `Chapter ${newChIdx}`,
        steps: [{
          title: `Step 1`,
          body: `Describe this step or action.`,
          sel: 'body',
          pos: 'bottom',
          action: true
        }]
      });
      activeChapterIdx = cfg.chapters.length - 1;
      activeStepIdx = 0;
      dirty = true;
      renderChapters();
      renderEditor();
      flash(`Chapter ${newChIdx} created`);
    });
  }

  // Step/Chapter Deletion and Addition via Chapters List
  chaptersEl.addEventListener('click', e => {
    const addStepBtn = e.target.closest('.studio-step-add-btn');
    if (addStepBtn) {
      e.stopPropagation();
      const ci = +addStepBtn.dataset.ci;
      if (cfg.chapters[ci]) {
        cfg.chapters[ci].steps.push({
          title: `Step ${cfg.chapters[ci].steps.length + 1}`,
          body: 'Describe this step action.',
          sel: 'body',
          pos: 'bottom',
          action: true
        });
        activeChapterIdx = ci;
        activeStepIdx = cfg.chapters[ci].steps.length - 1;
        dirty = true;
        renderChapters();
        renderEditor();
        flash(`Added step to Chapter ${ci + 1}`);
      }
      return;
    }

    const delStep = e.target.closest('.studio-step-del');
    if (delStep) {
      e.stopPropagation();
      const ci = +delStep.dataset.ci, si = +delStep.dataset.si;
      if (cfg.chapters[ci] && cfg.chapters[ci].steps) {
        cfg.chapters[ci].steps.splice(si, 1);
        if (!cfg.chapters[ci].steps.length) {
          cfg.chapters.splice(ci, 1);
        }
      }
      activeChapterIdx = 0;
      activeStepIdx = 0;
      dirty = true;
      renderChapters();
      renderEditor();
      return;
    }

    const delCh = e.target.closest('.studio-ch-del');
    if (delCh) {
      e.stopPropagation();
      cfg.chapters.splice(+delCh.dataset.ci, 1);
      activeChapterIdx = 0;
      activeStepIdx = 0;
      dirty = true;
      renderChapters();
      renderEditor();
    }
  });

  // Load Current Target into input
  fetch('/__tour/studio/current').then(r => r.json()).then(d => {
    const inp = document.querySelector('#studio-url');
    if (d.target && inp) {
      inp.value = d.target;
      inp.placeholder = 'Current: ' + d.target;
    }
  }).catch(() => {});

  initTabs();
  initTheme();
  initAgentChat();
  fetchScreens();
  renderChapters();
  renderEditor();

  window.__tourStudio = {
    getConfig: () => cfg,
    setPick,
    toggleContentEditing,
    snapshotCurrentScreen,
    aiAutoDemo,
    exportStandalone
  };
})();