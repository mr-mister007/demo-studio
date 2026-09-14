/* ═══════════════════════════════════════════════════════════════
   TourPack Engine — reusable zero-code-modification tour overlay
   Reads EVERYTHING from window.__TOUR_CONFIG (set by tour-config.js).
   Drop into ANY app via: proxy injection / browser extension / bookmarklet.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  if (window.__tourPackLoaded) return;
  window.__tourPackLoaded = true;

  const C = (window.__TOUR_CONFIG || {});
  const CFG = {
    accent: C.accent || '#3b82f6',
    appName: C.appName || 'This app',
    tourName: C.tourName || 'Tour',
    launchTitle: C.launchTitle || 'Take a 2-minute tour',
    launchBody: C.launchBody || 'See how this app works — step by step, with interactive highlights.',
    startLabel: C.startLabel || 'Start tour',
    dismissLabel: C.dismissLabel || 'Explore on my own',
    skipLabel: C.skipLabel || 'Skip tour',
    nextLabel: C.nextLabel || 'Next →',
    backLabel: C.backLabel || '← Back',
    finishLabel: C.finishLabel || 'Finish',
    clickHint: C.clickHint || 'Click the highlighted element above ↑',
    autoDelay: C.autoDelay ?? 1500,          // ms before launch modal shows
    idleAutoStart: C.idleAutoStart ?? false, // auto-start tour after delay?
    storageKey: C.storageKey || 'tourpack_seen',
    showOnce: C.showOnce ?? false,           // remember dismissal in localStorage?
    chapters: C.chapters || C.tour || []
  };

  // ── Chapter/step normalization ───────────────────────────────
  const chapters = CFG.chapters.map((ch, ci) => ({
    title: ch.title || ch.name || `Chapter ${ci + 1}`,
    steps: (ch.steps || []).map((s) => ({
      title: s.title || 'Step',
      body: s.body || s.text || '',
      sel: s.sel || s.selector || null,
      pos: s.pos || s.position || 'center',
      action: !!s.action,
      advanceOn: s.advanceOn || (s.action ? 'click' : 'manual'),
      waitFor: s.waitFor || null,            // CSS/text selector to wait for before showing
      before: s.before || null,              // function to run on entering step
      after: s.after || null,                // function to run on leaving step
      onEnter: (typeof s.onEnter === 'function') ? s.onEnter : null,
      onExit: (typeof s.onExit === 'function') ? s.onExit : null,
    }))
  })).filter(ch => ch.steps.length);

  let flat = [];
  chapters.forEach((ch, ci) => ch.steps.forEach((s, si) => flat.push({ ci, si })));
  const TOTAL = flat.length;
  let cur = 0, running = false;

  // ── DOM build ─────────────────────────────────────────────────
  const layer = document.createElement('div');
  layer.id = 'tourpack-layer';
  layer.innerHTML = `
    <div id="tourpack-marker"></div>
    <div id="tourpack-card">
      <button id="tourpack-skip">${CFG.skipLabel}</button>
      <div id="tourpack-kicker"></div>
      <div id="tourpack-title"></div>
      <div id="tourpack-body"></div>
      <div id="tourpack-hint"></div>
      <div id="tourpack-actions">
        <div id="tourpack-dots"></div>
        <div id="tourpack-btns">
          <button id="tourpack-back">${CFG.backLabel}</button>
          <button id="tourpack-next">${CFG.nextLabel}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(layer);

  const launch = document.createElement('div');
  launch.id = 'tourpack-launch';
  launch.innerHTML = `
    <div id="tourpack-launch-card">
      <h2>${CFG.launchTitle}</h2>
      <p>${CFG.launchBody}</p>
      <div id="tourpack-launch-btns">
        <button id="tourpack-start">${CFG.startLabel}</button>
        <button id="tourpack-dismiss">${CFG.dismissLabel}</button>
      </div>
    </div>
  `;
  document.body.appendChild(launch);

  const progress = document.createElement('div');
  progress.id = 'tourpack-progress';
  progress.innerHTML = `<span id="tourpack-progress-label">1 / ${TOTAL}</span><span class="bar"><i id="tourpack-progress-fill"></i></span>`;
  document.body.appendChild(progress);

  // Theme
  const root = document.documentElement;
  root.style.setProperty('--tourpack-accent', CFG.accent);
  if (C.cardBg) root.style.setProperty('--tourpack-card-bg', C.cardBg);
  if (C.cardText) root.style.setProperty('--tourpack-card-text', C.cardText);
  if (C.cardMuted) root.style.setProperty('--tourpack-card-muted', C.cardMuted);
  if (C.dimColor) root.style.setProperty('--tourpack-dim', C.dimColor);

  const $ = id => document.getElementById(id);
  const marker = $('tourpack-marker'), card = $('tourpack-card'), hint = $('tourpack-hint'), launcher = $('tourpack-launch');

  // ── Selector engine (same as OKiR tour, config-driven) ───────
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
    const { ci, si } = flat[cur];
    const ch = chapters[ci], st = ch.steps[si];
    $('tourpack-kicker').textContent = `CHAPTER ${ci + 1} · ${ch.title.toUpperCase()}`;
    $('tourpack-title').textContent = st.title;
    $('tourpack-body').textContent = st.body;
    if (st.action) {
      hint.textContent = st.hint || CFG.clickHint;
      hint.style.display = 'block';
      $('tourpack-next').style.display = 'none';
    } else {
      hint.style.display = 'none';
      $('tourpack-next').style.display = '';
    }
    const dots = $('tourpack-dots'); dots.innerHTML = '';
    ch.steps.forEach((_, i) => {
      const d = document.createElement('span'); d.className = 'dot' + (i === si ? ' on' : ''); dots.appendChild(d);
    });
    $('tourpack-next').textContent = cur === TOTAL - 1 ? CFG.finishLabel : CFG.nextLabel;
    $('tourpack-back').style.visibility = cur === 0 ? 'hidden' : 'visible';
    $('tourpack-progress-label').textContent = `${cur + 1} / ${TOTAL}`;
    $('tourpack-progress-fill').style.width = ((cur + 1) / TOTAL * 100) + '%';
    position(); startPolling();
  }

  function startPolling() {
    clearInterval(pollTimer);
    const { st } = curStep();
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

  function curStep() { const f = flat[cur]; return { ci: f.ci, si: f.si, ch: chapters[f.ci], st: chapters[f.ci].steps[f.si] }; }

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

  $('tourpack-start').addEventListener('click', start);
  $('tourpack-dismiss').addEventListener('click', () => { launcher.classList.remove('on'); if (CFG.showOnce) { try { localStorage.setItem(CFG.storageKey, '1'); } catch (e) {} } });
  $('tourpack-next').addEventListener('click', next);
  $('tourpack-back').addEventListener('click', prev);
  $('tourpack-skip').addEventListener('click', end);
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
    if (C.disableOnPaths && C.disableOnPaths.some(p => window.location.pathname.includes(p))) return;
    if (C.onlyOnPaths && !C.onlyOnPaths.some(p => window.location.pathname.includes(p))) return;
    if (!window.__tourpackShown) {
      window.__tourpackShown = true;
      setTimeout(() => {
        launcher.classList.add('on');
        if (CFG.idleAutoStart) setTimeout(() => { if (launcher.classList.contains('on')) start(); }, 700);
      }, 1200);
    }
  }

  // Public API for programmatic control (console / other scripts)
  window.TourPack = { start, end, next, prev, config: CFG, chapters, get running() { return running; }, get step() { return cur; } };
})();