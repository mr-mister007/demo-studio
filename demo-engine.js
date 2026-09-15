/* ═══════════════════════════════════════════════════════════════
   DemoStudio Engine v2 — reusable zero-code-modification tour overlay
   Reads EVERYTHING from window.__TOUR_CONFIG (set by tour-config.js).
   v2 adds: DemoStudio.reload(cfg), DemoStudio.find(sel) — used by Studio.
   Drop into ANY app via: proxy injection / browser extension / bookmarklet.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  if (window.__tourPackLoaded) return;
  window.__tourPackLoaded = true;

  let C = (window.__TOUR_CONFIG || {});

  function buildCFG(src) {
    const c = src || {};
    return {
      accent: c.accent || '#3b82f6',
      appName: c.appName || 'This app',
      tourName: c.tourName || 'Tour',
      launchTitle: c.launchTitle || 'Take a 2-minute tour',
      launchBody: c.launchBody || 'See how this app works — step by step, with interactive highlights.',
      startLabel: c.startLabel || 'Start tour',
      dismissLabel: c.dismissLabel || 'Explore on my own',
      skipLabel: c.skipLabel || 'Skip tour',
      nextLabel: c.nextLabel || 'Next →',
      backLabel: c.backLabel || '← Back',
      finishLabel: c.finishLabel || 'Finish',
      clickHint: c.clickHint || 'Click the highlighted element above ↑',
      autoDelay: c.autoDelay ?? 1500,          // ms before launch modal shows
      idleAutoStart: c.idleAutoStart ?? false, // auto-start tour after delay?
      storageKey: c.storageKey || 'demostudio_seen',
      showOnce: c.showOnce ?? false,           // remember dismissal in localStorage?
      disableOnPaths: c.disableOnPaths || [],
      onlyOnPaths: c.onlyOnPaths || null,
      chapters: c.chapters || c.tour || []
    };
  }

  let CFG = buildCFG(C);

  // ── Chapter/step normalization ───────────────────────────────
  function normalizeChapters(cfg) {
    const src = (cfg.chapters || []);
    return src.map((ch, ci) => ({
      title: ch.title || ch.name || `Chapter ${ci + 1}`,
      steps: (ch.steps || []).map((s) => ({
        title: s.title || 'Step',
        body: s.body || s.text || '',
        sel: s.sel || s.selector || null,
        pos: s.pos || s.position || 'center',
        action: !!s.action,
        advanceOn: s.advanceOn || (s.action ? 'click' : 'manual'),
        waitFor: s.waitFor || null,
        hint: s.hint || null,
        before: s.before || null,
        after: s.after || null,
        onEnter: (typeof s.onEnter === 'function') ? s.onEnter : null,
        onExit: (typeof s.onExit === 'function') ? s.onExit : null,
      }))
    })).filter(ch => ch.steps.length);
  }

  let chapters = [];
  let flat = [];
  let TOTAL = 0;
  let cur = 0, running = false;

  function rebuild() {
    chapters = normalizeChapters(CFG);
    flat = [];
    chapters.forEach((ch, ci) => ch.steps.forEach((s, si) => flat.push({ ci, si })));
    TOTAL = flat.length;
    if (cur >= TOTAL) cur = Math.max(0, TOTAL - 1);
    const pl = $('demostudio-progress-label');
    if (pl) pl.textContent = TOTAL ? `1 / ${TOTAL}` : '';
  }

  function applyTheme() {
    const root = document.documentElement;
    root.style.setProperty('--demostudio-accent', CFG.accent);
    if (C.cardBg) root.style.setProperty('--demostudio-card-bg', C.cardBg);
    if (C.cardText) root.style.setProperty('--demostudio-card-text', C.cardText);
    if (C.cardMuted) root.style.setProperty('--demostudio-card-muted', C.cardMuted);
    if (C.dimColor) root.style.setProperty('--demostudio-dim', C.dimColor);
  }

  function applyLabels() {
    const set = (id, txt) => { const n = document.getElementById(id); if (n) n.textContent = txt; };
    set('demostudio-skip', CFG.skipLabel);
    set('demostudio-back', CFG.backLabel);
    set('demostudio-next', CFG.nextLabel);
    set('demostudio-start', CFG.startLabel);
    set('demostudio-dismiss', CFG.dismissLabel);
    const h2 = document.querySelector('#demostudio-launch-card h2'); if (h2) h2.textContent = CFG.launchTitle;
    const p = document.querySelector('#demostudio-launch-card p'); if (p) p.textContent = CFG.launchBody;
  }

  // ── DOM build ─────────────────────────────────────────────────
  const layer = document.createElement('div');
  layer.id = 'demostudio-layer';
  layer.innerHTML = `
    <div id="demostudio-marker"></div>
    <div id="demostudio-card">
      <button id="demostudio-skip">${CFG.skipLabel}</button>
      <div id="demostudio-kicker"></div>
      <div id="demostudio-title"></div>
      <div id="demostudio-body"></div>
      <div id="demostudio-hint"></div>
      <div id="demostudio-actions">
        <div id="demostudio-dots"></div>
        <div id="demostudio-btns">
          <button id="demostudio-back">${CFG.backLabel}</button>
          <button id="demostudio-next">${CFG.nextLabel}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(layer);

  const launch = document.createElement('div');
  launch.id = 'demostudio-launch';
  launch.innerHTML = `
    <div id="demostudio-launch-card">
      <h2>${CFG.launchTitle}</h2>
      <p>${CFG.launchBody}</p>
      <div id="demostudio-launch-btns">
        <button id="demostudio-start">${CFG.startLabel}</button>
        <button id="demostudio-dismiss">${CFG.dismissLabel}</button>
      </div>
    </div>
  `;
  document.body.appendChild(launch);

  const progress = document.createElement('div');
  progress.id = 'demostudio-progress';
  progress.innerHTML = `<span id="demostudio-progress-label">1 / ${TOTAL}</span><span class="bar"><i id="demostudio-progress-fill"></i></span>`;
  document.body.appendChild(progress);

  applyTheme();

  const $ = id => document.getElementById(id);
  const marker = $('demostudio-marker'), card = $('demostudio-card'), hint = $('demostudio-hint'), launcher = $('demostudio-launch');

  rebuild();

  // ── Selector engine ───────────────────────────────────────────
  // Supports: CSS, :has-text("..."), text=..., comma fallbacks
  function findTarget(sel) {
    if (!sel) return null;
    const parts = String(sel).split(',').map(s => s.trim()).filter(Boolean);
    for (let part of parts) {
      if (part.startsWith('text=')) {
        const t = part.slice(5).trim();
        const nodes = [...document.querySelectorAll('div, span, h1,h2,h3,h4, button, a, p, li')];
        const matches = nodes.filter(n => {
          const txt = n.textContent || '';
          return txt.includes(t) && txt.length < 200 && n.children.length < 5;
        });
        matches.sort((a, b) => a.textContent.length - b.textContent.length);
        if (matches.length) return matches[0];
        continue;
      }
      const htMatch = part.match(/^(.*?):has-text\(\s*"([^"]+)"\s*\)(.*)$/);
      const hasTextFilter = htMatch ? htMatch[2].trim() : null;
      let css = htMatch ? (htMatch[1] + (htMatch[3] || '')).trim() : part;
      if (!css) css = '*';
      try { document.createDocumentFragment().querySelector(css); } catch (e) { continue; }
      const all = [...document.querySelectorAll(css)];
      if (!hasTextFilter) { if (all.length) return all[0]; continue; }
      const clickable = all.filter(el => {
        const t = (el.textContent || '').trim();
        return t.includes(hasTextFilter) && el.offsetWidth > 0;
      });
      if (clickable.length) {
        clickable.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
        return clickable[0];
      }
    }
    return null;
  }

  function boxFor(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const pad = 6;
    return { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  // ── Rendering ────────────────────────────────────────────────
  let pollTimer = null;
  function render() {
    if (!TOTAL) return;
    const { ci, si } = flat[cur];
    const ch = chapters[ci], st = ch.steps[si];
    $('demostudio-kicker').textContent = `CHAPTER ${ci + 1} · ${ch.title.toUpperCase()}`;
    $('demostudio-title').textContent = st.title;
    $('demostudio-body').textContent = st.body;
    if (st.action) {
      hint.textContent = st.hint || CFG.clickHint;
      hint.style.display = 'block';
      $('demostudio-next').style.display = 'none';
    } else {
      hint.style.display = 'none';
      $('demostudio-next').style.display = '';
    }
    const dots = $('demostudio-dots'); dots.innerHTML = '';
    ch.steps.forEach((_, i) => {
      const d = document.createElement('span'); d.className = 'dot' + (i === si ? ' on' : ''); dots.appendChild(d);
    });
    $('demostudio-next').textContent = cur === TOTAL - 1 ? CFG.finishLabel : CFG.nextLabel;
    $('demostudio-back').style.visibility = cur === 0 ? 'hidden' : 'visible';
    $('demostudio-progress-label').textContent = `${cur + 1} / ${TOTAL}`;
    $('demostudio-progress-fill').style.width = ((cur + 1) / TOTAL * 100) + '%';
    position(); startPolling();
  }

  function startPolling() {
    clearInterval(pollTimer);
    const st = curStep().st;
    const need = st.waitFor || st.sel;
    if (!need) return;
    let tries = 0;
    pollTimer = setInterval(() => {
      tries++;
      const el = st.waitFor ? (findTarget(st.waitFor) || (typeof st.waitFor === 'function' ? st.waitFor() : null)) : findTarget(st.sel);
      const ready = el ? !!boxFor(el) : false;
      if (ready && st.waitFor) { position(); clearInterval(pollTimer); }
      else if (!st.waitFor && findTarget(st.sel)) { position(); clearInterval(pollTimer); }
      else if (tries > 60) clearInterval(pollTimer);
    }, 150);
  }

  function position() {
    const st = curStep().st;
    const target = findTarget(st.sel);
    const box = boxFor(target);
    const vw = window.innerWidth, vh = window.innerHeight;
    if (box) {
      marker.style.left = box.left + 'px'; marker.style.top = box.top + 'px';
      marker.style.width = box.width + 'px'; marker.style.height = box.height + 'px';
      marker.classList.add('on');
    } else marker.classList.remove('on');
    const cw = card.offsetWidth || 330, chh = card.offsetHeight || 200;
    let gx, gy;
    const pos = st.pos || 'center';
    if (!box) { gx = vw / 2 - cw / 2; gy = vh / 2 - chh / 2; }
    else {
      const cx = box.cx, cy = box.cy;
      if (pos === 'center') { gx = vw / 2 - cw / 2; gy = vh / 2 - chh / 2; }
      else if (pos === 'right') { gx = box.left + box.width + 14; gy = box.cy - chh / 2; }
      else if (pos === 'left') { gx = box.left - cw - 14; gy = box.cy - chh / 2; }
      else if (pos === 'top') { gx = box.cx - cw / 2; gy = box.top - chh - 14; }
      else if (pos === 'bottom') { gx = box.cx - cw / 2; gy = box.top + box.height + 14; }
      else { gx = vw / 2 - cw / 2; gy = vh / 2 - chh / 2; }
    }
    gx = Math.max(10, Math.min(gx, vw - cw - 10));
    gy = Math.max(10, Math.min(gy, vh - chh - 10));
    card.style.left = gx + 'px'; card.style.top = gy + 'px';
  }

  function curStep() { if (!TOTAL) return { ci: 0, si: 0, ch: null, st: {} }; const f = flat[cur]; return { ci: f.ci, si: f.si, ch: chapters[f.ci], st: chapters[f.ci].steps[f.si] }; }

  // ── Click-to-advance (survives re-renders) ───────────────────
  let actionHandler = null;
  function attachAction() {
    detachAction();
    const st = curStep().st;
    if (!st.action) return;
    actionHandler = (e) => {
      const target = findTarget(st.sel);
      if (!target) return;
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      let hit = false;
      const x = e.clientX, y = e.clientY;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = true;
      if (!hit && e.composedPath) {
        const path = e.composedPath();
        if (path.some(el => el === target || (el instanceof Element && target.contains(el)))) hit = true;
      }
      if (hit) { detachAction(); setTimeout(() => next(), 800); }
    };
    document.addEventListener('click', actionHandler, true);
  }
  function detachAction() { if (actionHandler) { document.removeEventListener('click', actionHandler, true); actionHandler = null; } }

  // ── Lifecycle ────────────────────────────────────────────────
  function start() {
    if (!TOTAL) return;
    running = true; cur = 0;
    launcher.classList.remove('on');
    layer.classList.add('on'); progress.classList.add('on');
    render(); attachAction();
  }
  function end() {
    running = false; detachAction();
    layer.classList.remove('on'); progress.classList.remove('on');
    marker.classList.remove('on'); hint.style.display = 'none';
  }
  function next() {
    if (!running) return;
    const st = curStep().st;
    if (typeof st.onExit === 'function') { try { st.onExit(); } catch (e) {} }
    detachAction();
    if (cur < TOTAL - 1) { cur++; const ns = curStep().st; if (typeof ns.onEnter === 'function') { try { ns.onEnter(); } catch (e) {} } render(); attachAction(); }
    else end();
  }
  function prev() {
    if (!running) return;
    detachAction();
    if (cur > 0) { cur--; render(); attachAction(); }
  }

  // ── Reload with a new config (used by DemoStudio Studio) ───────
  function reload(cfg) {
    try {
      C = cfg || {};
      CFG = buildCFG(C);
      applyTheme();
      applyLabels();
      rebuild();
      if (running && TOTAL) { render(); attachAction(); }
      else if (running) end();
    } catch (e) { console.warn('DemoStudio reload failed', e); }
  }

  $('demostudio-start').addEventListener('click', start);
  $('demostudio-dismiss').addEventListener('click', () => { launcher.classList.remove('on'); if (CFG.showOnce) { try { localStorage.setItem(CFG.storageKey, '1'); } catch (e) {} } });
  $('demostudio-next').addEventListener('click', next);
  $('demostudio-back').addEventListener('click', prev);
  $('demostudio-skip').addEventListener('click', end);
  marker.addEventListener('click', next);
  document.addEventListener('keydown', (e) => {
    if (!running) return;
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'Escape') end();
  });
  window.addEventListener('resize', () => running && position());
  window.addEventListener('scroll', () => running && position(), true);

  // ── Launch logic ────────────────────────────────────────────
  let lastPath = window.location.pathname;
  setInterval(() => { if (window.location.pathname !== lastPath) { lastPath = window.location.pathname; tryLaunch(); } }, 700);
  setTimeout(tryLaunch, CFG.autoDelay);

  function tryLaunch() {
    if (CFG.showOnce) { try { if (localStorage.getItem(CFG.storageKey)) return; } catch (e) {} }
    if (CFG.disableOnPaths && CFG.disableOnPaths.some(p => window.location.pathname.includes(p))) return;
    if (CFG.onlyOnPaths && !CFG.onlyOnPaths.some(p => window.location.pathname.includes(p))) return;
    if (!window.__demostudioShown) {
      window.__demostudioShown = true;
      setTimeout(() => {
        launcher.classList.add('on');
        if (CFG.idleAutoStart) setTimeout(() => { if (launcher.classList.contains('on')) start(); }, 700);
      }, 1200);
    }
  }

  // Public API for programmatic control (console / Studio / other scripts)
  window.DemoStudio = {
    start, end, next, prev, reload,
    find: (sel) => findTarget(sel),
    getConfig: () => CFG,
    get running() { return running; },
    get step() { return cur; },
    get total() { return TOTAL; }
  };
})();