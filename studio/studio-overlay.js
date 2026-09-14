/* ═══════════════════════════════════════════════════════════════
   TourPack Studio — click-to-build tour overlay editor.
   Injected by the studio proxy into the target app. It:
     • shows a floating toolbar (pick / preview / save / export)
     • PICK mode: hover+click any real element → creates a step
       targeting it (computes a robust CSS selector automatically)
     • lets you edit title/body/position/action per step
     • previews the tour live, saves config JSON to the server
   ═══════════════════════════════════════════════════════════════ */
(() => {
  if (window.__tourStudioLoaded) return;
  window.__tourStudioLoaded = true;

  // ── State ────────────────────────────────────────────────────
  const LS_KEY = 'tourpack_studio_draft';
  let cfg = null;                    // current working config
  let pickMode = false;
  let hoverBox = null;               // highlight while picking
  let hoverEl = null;
  let activeStepIdx = -1;            // selected step in list
  let dirty = false;
  let previewOn = false;

  function loadDraft() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { cfg = JSON.parse(raw); return; }
    } catch (e) {}
    cfg = window.__TOUR_CONFIG ? JSON.parse(JSON.stringify(window.__TOUR_CONFIG)) : { appName: 'My App', chapters: [] };
  }
  loadDraft();
  if (!cfg.chapters) cfg.chapters = [];

  // ── DOM ──────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.id = 'tourpack-studio';
  wrap.innerHTML = `
    <div id="studio-panel">
      <div class="studio-head">
        <span class="studio-drag-grip">⠿</span>
        <div class="studio-title">🧭 TourPack Studio</div>
        <span id="studio-save-state" class="studio-save-state"></span>
        <button id="studio-min" title="Minimize studio">─</button>
        <button id="studio-close" title="Close studio">✕</button>
      </div>
      <div class="studio-toolbar">
        <button id="studio-pick" class="studio-btn studio-pick">🎯 Pick element</button>
        <button id="studio-preview" class="studio-btn">▶ Preview</button>
        <button id="studio-save" class="studio-btn studio-primary">💾 Save</button>
        <button id="studio-export" class="studio-btn">⤓ Config</button>
        <button id="studio-export-html" class="studio-btn">⤓ HTML</button>
        <button id="studio-export-player" class="studio-btn">⤓ Player</button>
      </div>
      <div class="studio-url-row">
        <input id="studio-url" class="studio-url-input" type="url" placeholder="Enter app URL — e.g. http://localhost:3000" spellcheck="false">
        <button id="studio-connect" class="studio-btn studio-connect-btn">⟳ Connect</button>
      </div>
      <div class="studio-hint" id="studio-hint">Pick mode: hover an element, click to add a step targeting it. Esc to cancel.</div>
      <div class="studio-split">
        <div class="studio-col">
          <div class="studio-col-head">Steps</div>
          <div id="studio-chapters"></div>
        </div>
        <div class="studio-col">
          <div class="studio-col-head">Step editor</div>
          <div id="studio-editor"><div class="studio-empty">Select a step to edit, or 🎯 Pick an element to create one.</div></div>
        </div>
      </div>
    </div>
    <div id="studio-hover"></div>
  `;
  document.body.appendChild(wrap);
  const panel = wrap.querySelector('#studio-panel');
  const hint = wrap.querySelector('#studio-hint');
  const chaptersEl = wrap.querySelector('#studio-chapters');
  const editorEl = wrap.querySelector('#studio-editor');

  // ── Draggable header ────────────────────────────────────────
  const head = wrap.querySelector('.studio-head');
  head.style.cursor = 'grab';
  let dragging = false, dragOffX = 0, dragOffY = 0;

  function onDragStart(e) {
    if (e.target.closest('button') || e.target.closest('input')) return;
    e.preventDefault();
    dragging = true;
    wrap.classList.add('studio-dragging');
    head.style.cursor = 'grabbing';
    const rect = wrap.getBoundingClientRect();
    if (wrap.style.left === '' || wrap.style.left === 'auto') {
      wrap.style.left = rect.left + 'px';
      wrap.style.right = 'auto';
    }
    dragOffX = e.clientX - rect.left;
    dragOffY = e.clientY - rect.top;
  }
  function onDragMove(e) {
    if (!dragging) return;
    let x = e.clientX - dragOffX;
    let y = e.clientY - dragOffY;
    x = Math.max(0, Math.min(x, window.innerWidth - 60));
    y = Math.max(0, Math.min(y, window.innerHeight - 40));
    wrap.style.left = x + 'px';
    wrap.style.top = y + 'px';
  }
  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove('studio-dragging');
    head.style.cursor = 'grab';
  }
  head.addEventListener('mousedown', onDragStart);
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);

  // ── Selector generation (robust CSS) ─────────────────────────
  function selectorFor(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    // 1) id
    if (el.id && /^[A-Za-z][\w:.-]*$/.test(el.id)) {
      const s = '#' + CSS.escape(el.id);
      if (document.querySelectorAll(s).length === 1) return s;
    }
    // 2) text-based for buttons/links/nav (human-readable)
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (txt && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'NAV' ||
                el.getAttribute('role') === 'button' || el.tagName === 'LI')) {
      const tag = el.tagName.toLowerCase();
      const base = tag + ':has-text("' + txt.replace(/"/g, '\\"') + '")';
      // prefer scoped: tag.class:has-text
      const cls = el.className && typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 1)[0] : '';
      const scoped = cls ? tag + '.' + CSS.escape(cls) + ':has-text("' + txt.replace(/"/g, '\\"') + '")' : base;
      // Only use text selector if it resolves uniquely
      try { if (document.querySelectorAll(base).length === 1) return base; } catch (e) {}
      try { if (document.querySelectorAll(scoped).length === 1) return scoped; } catch (e) {}
    }
    // 3) class chain
    const cls = el.className && typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2) : [];
    if (cls.length) {
      const s = el.tagName.toLowerCase() + cls.map(c => '.' + CSS.escape(c)).join('');
      try { if (document.querySelectorAll(s).length === 1) return s; } catch (e) {}
    }
    // 4) nth-child path (last resort)
    let parts = [];
    let node = el;
    while (node && node !== document.body && parts.length < 5) {
      const parent = node.parentElement;
      if (!parent) break;
      const idx = [...parent.children].indexOf(node) + 1;
      const tag = node.tagName.toLowerCase();
      parts.unshift(tag + ':nth-child(' + idx + ')');
      node = parent;
    }
    const fallback = parts.join(' > ');
    try { if (document.querySelectorAll(fallback).length === 1) return fallback; } catch (e) {}
    return fallback || null;
  }

  // ── Pick mode ────────────────────────────────────────────────
  function setPick(on) {
    pickMode = on;
    document.body.classList.toggle('studio-picking', on);
    hint.style.display = on ? 'block' : 'none';
    document.querySelector('#studio-pick').classList.toggle('on', on);
    // Auto-minimize panel during pick mode so user can see elements behind
    panel.classList.toggle('studio-minimized', on);
    if (!on) clearHover();
  }

  function clearHover() {
    if (hoverBox) { hoverBox.remove(); hoverBox = null; }
    hoverEl = null;
  }

  document.addEventListener('mousemove', (e) => {
    if (!pickMode) return;
    clearHover();
    const el = e.target;
    if (!el || el.closest('#tourpack-studio')) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    hoverBox = document.createElement('div');
    hoverBox.id = 'studio-hover';
    hoverBox.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
    document.body.appendChild(hoverBox);
    hoverEl = el;
  });

  document.addEventListener('click', (e) => {
    if (!pickMode) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    if (el.closest('#tourpack-studio')) return;
    clearHover();
    const sel = selectorFor(el);
    if (!sel) { flash('Could not generate a selector for that element'); return; }
    addStep(el, sel);
    setPick(false);
  }, true);

  // ── Step model ───────────────────────────────────────────────
  function addStep(el, sel) {
    // ensure a chapter exists
    if (!cfg.chapters.length) {
      cfg.chapters.push({ title: 'Chapter 1', steps: [] });
    }
    const ch = cfg.chapters[cfg.chapters.length - 1];
    const label = (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
    const step = {
      title: label ? 'Click "' + label + '"' : 'Interact with ' + el.tagName.toLowerCase(),
      body: 'This element is: ' + label + '. Edit this description.',
      sel,
      pos: 'bottom',
      action: true
    };
    ch.steps.push(step);
    activeStepIdx = ch.steps.length - 1;
    dirty = true;
    renderChapters();
    renderEditor();
    flash('Step added: ' + sel);
  }

  // ── Rendering ────────────────────────────────────────────────
  function renderChapters() {
    chaptersEl.innerHTML = '';
    cfg.chapters.forEach((ch, ci) => {
      const sec = document.createElement('div');
      sec.className = 'studio-chapter';
      const title = document.createElement('div');
      title.className = 'studio-chapter-title';
      title.innerHTML = `<span>${esc(ch.title) || ('Chapter ' + (ci + 1))}</span>
        <span class="studio-chapter-count">${ch.steps.length}</span>
        <button class="studio-mini studio-ch-del" data-ci="${ci}" title="Delete chapter">🗑</button>`;
      sec.appendChild(title);
      ch.steps.forEach((s, si) => {
        const row = document.createElement('div');
        row.className = 'studio-step' + (activeStepIdx === si && ci === cfg.chapters.length - 1 ? ' on' : '');
        row.innerHTML = `<span class="studio-step-num">${ci + 1}.${si + 1}</span>
          <span class="studio-step-title">${esc(s.title)}</span>
          <span class="studio-step-sel">${esc(s.sel || '')}</span>
          <button class="studio-mini studio-step-del" data-ci="${ci}" data-si="${si}" title="Delete step">✕</button>`;
        row.addEventListener('click', () => {
          activeStepIdx = si;
          // move active chapter to last for simplicity? keep in place — select directly
          renderChapters();
          renderEditor();
        });
        sec.appendChild(row);
      });
      chaptersEl.appendChild(sec);
    });
  }

  function renderEditor() {
    if (activeStepIdx < 0) {
      editorEl.innerHTML = '<div class="studio-empty">Select a step to edit, or 🎯 Pick an element to create one.</div>';
      return;
    }
    const ch = cfg.chapters[cfg.chapters.length - 1];
    const s = ch.steps[activeStepIdx];
    editorEl.innerHTML = `
      <div class="studio-field"><label>Title</label><input id="ed-title" value="${escAttr(s.title)}"></div>
      <div class="studio-field"><label>Body</label><textarea id="ed-body" rows="3">${esc(s.body)}</textarea></div>
      <div class="studio-field"><label>Selector</label><input id="ed-sel" value="${escAttr(s.sel)}"></div>
      <div class="studio-field-row">
        <div class="studio-field"><label>Position</label>
          <select id="ed-pos">
            ${['center','top','bottom','left','right'].map(p => `<option ${s.pos === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="studio-field"><label>Advance</label>
          <select id="ed-action">
            <option value="true" ${s.action ? 'selected' : ''}>Click element</option>
            <option value="false" ${!s.action ? 'selected' : ''}>Next button</option>
          </select>
        </div>
      </div>
      <div class="studio-actions">
        <button id="ed-apply" class="studio-btn studio-primary">Apply</button>
        <button id="ed-test" class="studio-btn">Test select</button>
      </div>
      <div id="ed-status" class="studio-ed-status"></div>
    `;
    document.querySelector('#ed-apply').addEventListener('click', () => {
      s.title = document.querySelector('#ed-title').value;
      s.body = document.querySelector('#ed-body').value;
      s.sel = document.querySelector('#ed-sel').value;
      s.pos = document.querySelector('#ed-pos').value;
      s.action = document.querySelector('#ed-action').value === 'true';
      dirty = true;
      renderChapters();
      flash('Step updated');
    });
    document.querySelector('#ed-test').addEventListener('click', () => {
      const sel = document.querySelector('#ed-sel').value;
      const el = window.TourPack && TourPack.find(sel);
      if (el) {
        flash('✅ Selector matches: ' + el.tagName.toLowerCase());
        // flash the element
        const r = el.getBoundingClientRect();
        const hb = document.createElement('div');
        hb.id = 'studio-hover';
        hb.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
        document.body.appendChild(hb);
        setTimeout(() => hb.remove(), 1500);
      } else {
        flash('❌ Selector not found on this page');
      }
    });
  }

  // ── Preview / Save / Export ──────────────────────────────────
  function preview() {
    // Reload engine with current config
    if (window.TourPack) window.TourPack.reload(JSON.parse(JSON.stringify(cfg)));
    // engine's launch modal may show; force start after slight delay
    setTimeout(() => {
      if (window.TourPack) window.TourPack.start();
    }, 400);
    previewOn = true;
  }

  async function save() {
    try {
      const res = await fetch('/__tour/studio/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (res.ok) {
        dirty = false;
        flash('💾 Saved to server');
      } else {
        flash('Save failed: ' + (await res.text()));
      }
    } catch (e) {
      flash('Save failed (server not reachable): ' + e.message);
    }
  }

  function exportCfg() {
    const blob = new Blob(['window.__TOUR_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';'], { type: 'application/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tour-config.js';
    a.click();
    URL.revokeObjectURL(a.href);
    flash('⤓ Exported tour-config.js');
  }

  function exportHtml() {
    const c = cfg;
    const totalSteps = (c.chapters || []).reduce((a, ch) => a + (ch.steps || []).length, 0);
    const escH = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const accent = c.accent || '#3b82f6';

    const chaptersHtml = (c.chapters || []).map((ch, ci) => `
      <section class="chapter">
        <header class="ch-head" onclick="toggleCh(this)">
          <span class="ch-num">${ci + 1}</span>
          <h2>${escH(ch.title || ('Chapter ' + (ci + 1)))}</h2>
          <span class="ch-count">${(ch.steps || []).length} step${(ch.steps || []).length === 1 ? '' : 's'}</span>
          <span class="ch-chev">▾</span>
        </header>
        <div class="ch-body">
          ${(ch.steps || []).map((s, si) => `
            <div class="step">
              <div class="step-head">
                <span class="step-num">${ci + 1}.${si + 1}</span>
                <strong>${escH(s.title || '(untitled step)')}</strong>
                <span class="step-pos">${escH(s.pos || 'bottom')}</span>
              </div>
              <p class="step-body">${escH(s.body || '')}</p>
              <code class="step-sel" title="CSS selector">${escH(s.sel || '')}</code>
              ${s.action ? '<span class="step-action">click</span>' : ''}
            </div>
          `).join('')}
        </div>
      </section>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escH(c.appName || 'Tour')} — Tour</title>
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, system-ui, -apple-system, sans-serif; background: #050505; color: #e6edf3; min-height: 100vh; padding: 48px 24px 80px; }
  .wrap { max-width: 860px; margin: 0 auto; }
  .hero { text-align: center; padding: 40px 0 48px; }
  .hero h1 { font-size: 40px; font-weight: 800; letter-spacing: -.02em; }
  .hero .sub { color: #8b949e; margin-top: 10px; font-size: 15px; }
  .hero .meta { display: inline-flex; gap: 12px; margin-top: 18px; }
  .pill { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 999px; padding: 6px 16px; font-size: 13px; color: #8b949e; }
  .pill b { color: #e6edf3; }
  .chapter { border: 1px solid #222; border-radius: 16px; overflow: hidden; margin-bottom: 18px; background: #0b0b0b; }
  .ch-head { display: flex; align-items: center; gap: 14px; padding: 18px 22px; cursor: pointer; user-select: none; }
  .ch-head:hover { background: rgba(255,255,255,.02); }
  .ch-num { width: 34px; height: 34px; border-radius: 10px; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; flex-shrink: 0; }
  .ch-head h2 { flex: 1; font-size: 19px; font-weight: 700; }
  .ch-count { color: #8b949e; font-size: 13px; }
  .ch-chev { color: #8b949e; transition: transform .2s; }
  .chapter.open .ch-chev { transform: rotate(180deg); }
  .ch-body { padding: 0 22px 22px; }
  .step { border: 1px solid #1c1c1c; border-radius: 12px; padding: 16px 18px; margin-top: 12px; background: #101010; }
  .step-head { display: flex; align-items: center; gap: 10px; }
  .step-num { font-size: 12px; font-weight: 800; color: var(--accent); font-family: ui-monospace, monospace; }
  .step-pos { margin-left: auto; font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: .06em; border: 1px solid #222; padding: 2px 8px; border-radius: 6px; }
  .step-action { font-size: 10px; color: #2ea043; border: 1px solid #2ea04333; background: #2ea04314; padding: 2px 8px; border-radius: 6px; }
  .step-body { color: #b0b8c1; font-size: 14px; line-height: 1.6; margin: 10px 0 8px; }
  .step-sel { display: block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #79b8ff; background: #0d1117; border: 1px solid #1c222c; border-radius: 8px; padding: 8px 10px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  .hint { text-align: center; color: #484f58; font-size: 13px; margin-top: 28px; }
  @media (max-width: 640px) { .hero h1 { font-size: 30px; } .ch-head { flex-wrap: wrap; } }
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <h1>${escH(c.appName || 'Tour')}</h1>
    <p class="sub">${escH(c.launchTitle || '')}${c.launchBody ? ' — ' + escH(c.launchBody) : ''}</p>
    <div class="meta">
      <span class="pill"><b>${(c.chapters || []).length}</b> chapters</span>
      <span class="pill"><b>${totalSteps}</b> steps</span>
      <span class="pill">🎯 click-to-build</span>
    </div>
  </header>
  ${chaptersHtml}
  <p class="hint">Generated by TourPack Studio — open this file in any browser to share the tour.</p>
</div>
<script>
function toggleCh(el){ el.closest('.chapter').classList.toggle('open'); }
document.querySelectorAll('.chapter').forEach(c => c.classList.add('open'));
</script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (c.appName || 'tour').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-tour.html';
    a.click();
    URL.revokeObjectURL(a.href);
    flash('⤓ Exported HTML tour');
  }

  function exportPlayer() {
    const c = cfg;
    const totalSteps = (c.chapters || []).reduce((a, ch) => a + (ch.steps || []).length, 0);
    const escH = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const accent = c.accent || '#3b82f6';

    // Build mock UI elements from step selectors so the highlight has something to attach to
    // Each step's sel becomes a mock chip with matching id/class
    const mockSections = (c.chapters || []).map((ch, ci) => {
      const steps = ch.steps || [];
      return `
      <div class="mock-chapter" id="mock-ch-${ci + 1}">
        <div class="mock-ch-title">${escH(ch.title || ('Chapter ' + (ci + 1)))}</div>
        <div class="mock-ch-steps">
          ${steps.map((s, si) => `
            <div class="mock-step" data-chapter="${ci}" data-step="${si}">
              <span class="mock-step-num">${ci + 1}.${si + 1}</span>
              <span class="mock-step-text">${escH(s.title || 'Step')}</span>
              ${s.sel ? `<code class="mock-step-sel">${escH(s.sel)}</code>` : ''}
            </div>
          `).join('')}
        </div>
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escH(c.appName || 'Tour')} — Interactive Tour</title>
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, system-ui, -apple-system, sans-serif; background: #050505; color: #e6edf3; min-height: 100vh; }
  .topbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 20px; padding: 14px 28px; background: rgba(5,5,5,.9); backdrop-filter: blur(8px); border-bottom: 1px solid #1c1c1c; }
  .topbar .logo { font-weight: 800; font-size: 16px; display: flex; align-items: center; gap: 10px; }
  .topbar .logo .dot { width: 10px; height: 10px; border-radius: 3px; background: var(--accent); }
  .topbar .nav { display: flex; gap: 18px; flex: 1; margin-left: 24px; }
  .topbar .nav a { color: #8b949e; font-size: 14px; text-decoration: none; cursor: pointer; }
  .topbar .nav a:hover { color: #e6edf3; }
  .topbar .user { display: flex; align-items: center; gap: 8px; color: #8b949e; font-size: 13px; }
  .topbar .avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 13px; font-weight: 700; }
  .layout { display: grid; grid-template-columns: 240px 1fr; min-height: calc(100vh - 60px); }
  .sidebar { border-right: 1px solid #1c1c1c; padding: 24px 14px; }
  .sidebar .item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; color: #8b949e; font-size: 14px; cursor: pointer; }
  .sidebar .item:hover, .sidebar .item.active { background: rgba(255,255,255,.06); color: #e6edf3; }
  .sidebar .item.active { color: var(--accent); }
  .main { padding: 32px; }
  .main h2 { font-size: 24px; margin-bottom: 18px; }
  .card { border: 1px solid #1c1c1c; border-radius: 14px; background: #0b0b0b; padding: 22px; margin-bottom: 16px; max-width: 640px; }
  .card h3 { font-size: 16px; margin-bottom: 8px; }
  .card p { color: #8b949e; font-size: 13px; line-height: 1.6; }
  .btn { display: inline-flex; align-items: center; gap: 8px; background: var(--accent); color: #fff; border: none; border-radius: 10px; padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer; }
  .btn.ghost { background: transparent; border: 1px solid #30363d; color: #e6edf3; }
  .mock-chapter { border: 1px solid #222; border-radius: 14px; overflow: hidden; margin-bottom: 18px; background: #0b0b0b; }
  .mock-ch-title { padding: 14px 18px; font-weight: 700; font-size: 15px; border-bottom: 1px solid #1c1c1c; }
  .mock-ch-steps { padding: 8px; }
  .mock-step { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; cursor: pointer; }
  .mock-step:hover { background: rgba(255,255,255,.04); }
  .mock-step-num { font-size: 12px; font-weight: 800; color: var(--accent); font-family: ui-monospace, monospace; }
  .mock-step-text { flex: 1; font-size: 14px; }
  .mock-step-sel { font-family: ui-monospace, monospace; font-size: 11px; color: #79b8ff; background: #0d1117; border: 1px solid #1c222c; border-radius: 6px; padding: 3px 8px; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .progress { position: fixed; bottom: 24px; right: 24px; display: flex; align-items: center; gap: 8px; background: rgba(5,5,5,.85); border: 1px solid #222; border-radius: 999px; padding: 8px 14px; font-size: 12px; color: #8b949e; z-index: 20; }
</style>
</head>
<body>
<div class="topbar">
  <div class="logo"><span class="dot"></span> ${escH(c.appName || 'Tour')}</div>
  <div class="nav">
    ${(c.chapters || []).map((ch, i) => `<a data-nav="${i}">${escH(ch.title || ('Ch ' + (i + 1)))}</a>`).join('')}
  </div>
  <div class="user"><span>Demo user</span><span class="avatar">A</span></div>
</div>
<div class="layout">
  <aside class="sidebar">
    ${(c.chapters || []).map((ch, i) => `<div class="item" data-nav="${i}">${escH(ch.title || ('Chapter ' + (i + 1)))}</div>`).join('')}
    <div class="item">Settings</div>
    <div class="item">Log out</div>
  </aside>
  <main class="main">
    <h2 id="page-title">${escH((c.chapters[0] && c.chapters[0].title) || 'Overview')}</h2>
    ${mockSections}
    <div style="margin-top:24px">
      <button class="btn" id="start-tour">▶ Start the tour</button>
      <button class="btn ghost" id="restart-tour">↺ Restart</button>
    </div>
  </main>
</div>
<div class="progress" id="progress">0 / ${totalSteps}</div>

<script>
// ── TourPack engine (embedded, self-contained) ───────────────
window.__TOUR_CONFIG = ${JSON.stringify(c, null, 2)};
(function(){
  if (window.__tourPackLoaded) return;
  window.__tourPackLoaded = true;
  var CONFIG = window.__TOUR_CONFIG || {};
  var overlay = null, stepIdx = -1, chapterIdx = 0, active = null, marker = null, progressEl = null, started = false, cur = null;

  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function buildOverlay(){
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'tourpack-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;';
    overlay.innerHTML = '<div id="tour-card"></div><div id="tour-marker"></div>';
    document.body.appendChild(overlay);
    marker = overlay.querySelector('#tour-marker');
    progressEl = document.getElementById('progress');
  }

  function stepPos(el, pos){
    var r = el.getBoundingClientRect();
    var cw = window.innerWidth, chh = window.innerHeight;
    if (pos === 'top') return { x: r.left + r.width/2, y: r.top - 12, anchor: 'bottom' };
    if (pos === 'bottom') return { x: r.left + r.width/2, y: r.bottom + 12, anchor: 'top' };
    if (pos === 'left') return { x: r.left - 12, y: r.top + r.height/2, anchor: 'right' };
    if (pos === 'right') return { x: r.right + 12, y: r.top + r.height/2, anchor: 'left' };
    return { x: r.left + r.width/2, y: r.bottom + 12, anchor: 'top' };
  }

  function ensureVisible(el){
    var r = el.getBoundingClientRect();
    if (r.top < 80) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function findStepTarget(step, ci, si){
    // 1) if a mock-step element exists for this step, use it
    var mock = document.querySelector('[data-chapter="' + ci + '"][data-step="' + si + '"]');
    if (mock) return mock;
    // 2) try the raw selector
    try {
      var els = document.querySelectorAll(step.sel);
      if (els.length) return els[0];
    } catch(e){}
    // 3) fallback: chapter section
    return document.getElementById('mock-ch-' + (ci + 1)) || document.querySelector('.main');
  }

  function showStep(){
    if (!started || !CONFIG.chapters || !CONFIG.chapters.length) return;
    if (chapterIdx >= CONFIG.chapters.length) { endTour(); return; }
    var ch = CONFIG.chapters[chapterIdx];
    if (!ch.steps || !ch.steps.length) { chapterIdx++; showStep(); return; }
    if (stepIdx >= ch.steps.length) { chapterIdx++; stepIdx = 0; showStep(); return; }
    var step = ch.steps[stepIdx];
    var el = findStepTarget(step, chapterIdx, stepIdx);
    if (!el) { stepIdx++; showStep(); return; }
    ensureVisible(el);

    buildOverlay();
    var pos = stepPos(el, step.pos || 'bottom');
    var card = overlay.querySelector('#tour-card');
    card.style.cssText = 'position:absolute;left:0;top:0;transform:translate(' + (pos.x - Math.min(pos.x, 340)) + 'px,' + pos.y + 'px);width:320px;background:#0d1117;border:1px solid #30363d;border-radius:14px;color:#e6edf3;font-family:Inter,system-ui,sans-serif;font-size:13px;box-shadow:0 24px 70px rgba(0,0,0,.6);pointer-events:auto;' + (pos.anchor === 'top' ? 'margin-top:12px' : 'margin-top:12px');
    // keep on-screen horizontally
    var cx = pos.x;
    if (cx > window.innerWidth - 340) cx = window.innerWidth - 340 - 12;
    if (cx < 12) cx = 12;
    card.style.left = '0'; card.style.transform = 'translate(' + cx + 'px,' + pos.y + 'px)';

    card.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #21262d">' +
        '<span style="font-weight:800">' + esc(ch.title || '') + '</span>' +
        '<span style="font-size:11px;color:#8b949e">' + (chapterIdx + 1) + '.' + (stepIdx + 1) + '</span>' +
      '</div>' +
      '<div style="padding:14px 16px">' +
        '<div style="font-weight:700;font-size:14px;margin-bottom:6px">' + esc(step.title || '') + '</div>' +
        '<div style="color:#b0b8c1;line-height:1.55">' + esc(step.body || '') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid #21262d;align-items:center">' +
        (stepIdx > 0 || chapterIdx > 0 ? '<button data-t="prev" style="background:transparent;border:1px solid #30363d;color:#e6edf3;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer">← Prev</button>' : '') +
        '<span style="flex:1"></span>' +
        (stepIdx < ch.steps.length - 1 || chapterIdx < CONFIG.chapters.length - 1
          ? '<button data-t="next" style="background:' + CONFIG.accent + ';border:none;color:#fff;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">Next →</button>'
          : '<button data-t="done" style="background:' + CONFIG.accent + ';border:none;color:#fff;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">Finish ✓</button>') +
      '</div>';
    card.querySelectorAll('[data-t]').forEach(function(b){
      b.addEventListener('click', function(){
        var t = b.getAttribute('data-t');
        if (t === 'next') { stepIdx++; showStep(); }
        else if (t === 'prev') { if (stepIdx > 0) stepIdx--; else { chapterIdx--; stepIdx = CONFIG.chapters[chapterIdx].steps.length - 1; } showStep(); }
        else if (t === 'done') endTour();
      });
    });

    // marker
    var mr = el.getBoundingClientRect();
    marker.style.cssText = 'position:fixed;left:' + mr.left + 'px;top:' + mr.top + 'px;width:' + mr.width + 'px;height:' + mr.height + 'px;border:3px solid ' + CONFIG.accent + ';border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.55), 0 0 24px rgba(0,0,0,.6);z-index:99990;pointer-events:none;transition:all .25s;';
    var total = CONFIG.chapters.reduce(function(a,cc){ return a + (cc.steps||[]).length; }, 0);
    var seen = 0;
    for (var i = 0; i < chapterIdx; i++) seen += (CONFIG.chapters[i].steps||[]).length;
    seen += stepIdx + 1;
    if (progressEl) progressEl.textContent = seen + ' / ' + total;
  }

  function startTour(){
    started = true; chapterIdx = 0; stepIdx = 0;
    buildOverlay();
    showStep();
  }
  function endTour(){
    started = false;
    if (overlay) overlay.remove(); overlay = null; marker = null;
    if (progressEl) progressEl.textContent = 'Done ✓';
  }
  function restartTour(){ endTour(); setTimeout(startTour, 100); }

  window.TourPack = {
    start: startTour, end: endTour, restart: restartTour,
    getConfig: function(){ return CONFIG; }
  };

  // Nav buttons scroll to chapter
  document.querySelectorAll('[data-nav]').forEach(function(a){
    a.addEventListener('click', function(){
      var i = +a.getAttribute('data-nav');
      var el = document.getElementById('mock-ch-' + (i + 1));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.getElementById('start-tour').addEventListener('click', startTour);
  document.getElementById('restart-tour').addEventListener('click', restartTour);
})();
</script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (c.appName || 'tour').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-player.html';
    a.click();
    URL.revokeObjectURL(a.href);
    flash('⤓ Exported interactive player');
  }

  // ── Helpers ──────────────────────────────────────────────────
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
  function flash(msg, ms = 1800) {
    document.querySelector('#studio-save-state').textContent = msg;
    clearTimeout(flash._t);
    flash._t = setTimeout(() => { document.querySelector('#studio-save-state').textContent = dirty ? '● unsaved' : ''; }, ms);
  }

  // ── Wire up ──────────────────────────────────────────────────
  document.querySelector('#studio-pick').addEventListener('click', () => setPick(!pickMode));
  document.querySelector('#studio-preview').addEventListener('click', preview);
  document.querySelector('#studio-save').addEventListener('click', save);
  document.querySelector('#studio-export').addEventListener('click', exportCfg);
  document.querySelector('#studio-export-html').addEventListener('click', exportHtml);
  document.querySelector('#studio-export-player').addEventListener('click', exportPlayer);

  // ── Target URL connect ──────────────────────────────────────
  async function connectTarget() {
    const input = document.querySelector('#studio-url');
    const url = (input.value || '').trim();
    if (!url) { flash('Enter an app URL first'); return; }
    if (!/^https?:\/\//i.test(url)) { flash('URL must start with http:// or https://'); return; }
    flash('Connecting to ' + url + '…');
    try {
      const res = await fetch('/__tour/studio/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.ok) {
        // Switching target = new app = fresh config. Drop stale draft.
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        flash('✓ Connected to ' + data.target);
        // Reload the page so the proxy now points at the new target app
        setTimeout(() => location.reload(), 800);
      } else {
        flash('✗ ' + (data.error || 'Failed to connect'));
      }
    } catch (e) {
      flash('✗ Connect failed: ' + e.message);
    }
  }

  async function loadCurrentTarget() {
    try {
      const res = await fetch('/__tour/studio/current');
      const data = await res.json();
      const input = document.querySelector('#studio-url');
      if (data.target && input) input.placeholder = 'Current: ' + data.target.replace(/\/$/, '');
      if (data.target && input && !input.value) input.value = '';
    } catch (e) { /* ignore */ }
  }
  loadCurrentTarget();
  document.querySelector('#studio-connect').addEventListener('click', connectTarget);
  document.querySelector('#studio-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') connectTarget(); });
  document.querySelector('#studio-min').addEventListener('click', () => {
    panel.classList.toggle('studio-minimized');
  });
  document.querySelector('#studio-close').addEventListener('click', () => {
    if (dirty && !confirm('Unsaved changes. Close studio anyway?')) return;
    wrap.remove();
    if (window.TourPack) window.TourPack.end();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pickMode) setPick(false);
  });

  // Delete step / chapter
  chaptersEl.addEventListener('click', (e) => {
    const delStep = e.target.closest('.studio-step-del');
    if (delStep) {
      e.stopPropagation();
      const ci = +delStep.dataset.ci, si = +delStep.dataset.si;
      cfg.chapters[ci].steps.splice(si, 1);
      if (!cfg.chapters[ci].steps.length) cfg.chapters.splice(ci, 1);
      activeStepIdx = -1;
      dirty = true;
      renderChapters(); renderEditor();
      return;
    }
    const delCh = e.target.closest('.studio-ch-del');
    if (delCh) {
      e.stopPropagation();
      cfg.chapters.splice(+delCh.dataset.ci, 1);
      activeStepIdx = -1;
      dirty = true;
      renderChapters(); renderEditor();
    }
  });

  // Button to add a new chapter
  const addChBtn = document.createElement('button');
  addChBtn.className = 'studio-btn studio-primary studio-add-chapter';
  addChBtn.textContent = '+ New chapter';
  addChBtn.addEventListener('click', () => {
    cfg.chapters.push({ title: 'Chapter ' + (cfg.chapters.length + 1), steps: [] });
    activeStepIdx = -1;
    dirty = true;
    renderChapters(); renderEditor();
  });
  chaptersEl.after(addChBtn);

  renderChapters();
  renderEditor();

  // Keep draft in localStorage as you work
  setInterval(() => { if (dirty) { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} } }, 1500);

  window.__tourStudio = { getConfig: () => cfg, setPick, preview, save, exportCfg };
})();