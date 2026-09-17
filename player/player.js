/* ═══════════════════════════════════════════════════════════════
   DemoStudio Standalone Player Engine — Interactive & Responsive
   ════════════════════════════════════════════════════════════════ */

(() => {
  const PKG = window.__DEMO_PACKAGE || {
    config: window.__TOUR_CONFIG || {},
    screens: window.__DEMO_SCREENS || {}
  };

  const CFG = PKG.config || {};
  const SCREENS = PKG.screens || {};
  const screenKeys = Object.keys(SCREENS);

  let chapters = CFG.chapters || [];
  let flatSteps = [];
  chapters.forEach((ch, chIdx) => {
    (ch.steps || []).forEach((st, stIdx) => {
      flatSteps.push({
        ...st,
        chapterTitle: ch.title,
        chapterIdx: chIdx,
        stepIdx: stIdx
      });
    });
  });

  let currentStepIdx = -1;
  let currentScreenId = null;

  const frame = document.getElementById('player-frame');
  const spotlight = document.getElementById('player-spotlight');
  const card = document.getElementById('player-card');
  const modalBackdrop = document.getElementById('player-modal');
  const progressFill = document.getElementById('player-progress-fill');
  const progressLabel = document.getElementById('player-progress-label');
  const appNameEl = document.getElementById('player-app-name');
  const hotspot = document.getElementById('player-hotspot');

  if (appNameEl) appNameEl.textContent = CFG.appName || 'Interactive Demo';

  function applyAccent() {
    if (CFG.accent) {
      document.documentElement.style.setProperty('--ds-accent', CFG.accent);
    }
  }
  applyAccent();

  // ── Load a screen snapshot into the iframe ──────────────────
  function loadScreen(screenId, callback) {
    // If exact screenId is found, use it; otherwise use the first available captured screen
    const resolvedId = (screenId && SCREENS[screenId]) ? screenId : screenKeys[0];

    if (currentScreenId === resolvedId && frame.contentDocument && frame.contentDocument.body) {
      if (callback) callback();
      return;
    }
    currentScreenId = resolvedId;
    const html = SCREENS[resolvedId] || Object.values(SCREENS)[0] || '';
    if (!html) {
      console.warn('[Player] Screen snapshot not found for ID:', screenId);
      if (callback) callback();
      return;
    }

    frame.srcdoc = html;
    frame.onload = () => {
      // Prevent link navigation inside iframe and restore scroll positions
      try {
        const doc = frame.contentDocument;
        if (doc) {
          doc.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', e => e.preventDefault());
          });
          // Also prevent form submissions
          doc.querySelectorAll('form').forEach(f => {
            f.addEventListener('submit', e => e.preventDefault());
          });
          // Restore saved scroll positions
          doc.querySelectorAll('[data-demostudio-scroll-top]').forEach(el => {
            const st = parseInt(el.getAttribute('data-demostudio-scroll-top'), 10);
            const sl = parseInt(el.getAttribute('data-demostudio-scroll-left') || '0', 10);
            if (!isNaN(st)) el.scrollTop = st;
            if (!isNaN(sl)) el.scrollLeft = sl;
          });
        }
      } catch (e) {}
      if (callback) setTimeout(callback, 80);
    };
  }

  // ── Modal (Launch & Lead Gate) ──────────────────────────────
  function showModal(title, body, primaryBtnText, onPrimary, secondaryBtnText, onSecondary, isLeadGate) {
    modalBackdrop.style.display = 'flex';
    modalBackdrop.innerHTML = `
      <div class="player-modal-card">
        <h2>${title}</h2>
        <p>${body}</p>
        ${isLeadGate ? `
          <div class="player-input-group">
            <input type="email" id="player-lead-email" class="player-input" placeholder="name@company.com" required />
          </div>
        ` : ''}
        <div class="player-modal-actions">
          ${secondaryBtnText ? `<button id="modal-sec-btn" class="player-btn player-btn-secondary">${secondaryBtnText}</button>` : ''}
          <button id="modal-prim-btn" class="player-btn player-btn-primary">${primaryBtnText}</button>
        </div>
      </div>
    `;

    document.getElementById('modal-prim-btn').onclick = () => {
      if (isLeadGate) {
        const email = (document.getElementById('player-lead-email')?.value || '').trim();
        if (!email || !email.includes('@')) {
          alert('Please enter a valid work email address');
          return;
        }
        console.log('[Lead Capture] Captured email:', email);
      }
      modalBackdrop.style.display = 'none';
      if (onPrimary) onPrimary();
    };

    const secBtn = document.getElementById('modal-sec-btn');
    if (secBtn) {
      secBtn.onclick = () => {
        modalBackdrop.style.display = 'none';
        if (onSecondary) onSecondary();
      };
    }
  }

  // ── Robust Selector Engine (mirrors demo-engine.js) ─────────
  // Supports: CSS selectors, text=..., :has-text("..."), comma-separated fallbacks
  function findElementInIframe(sel) {
    if (!sel || !frame.contentDocument) return null;
    const doc = frame.contentDocument;

    try {
      const parts = String(sel).split(',').map(s => s.trim()).filter(Boolean);

      for (let part of parts) {
        // text=... shorthand
        if (part.startsWith('text=')) {
          const t = part.slice(5).trim();
          const nodes = [...doc.querySelectorAll('div, span, h1, h2, h3, h4, h5, h6, button, a, p, li, label, td, th')];
          const matches = nodes.filter(n => {
            const txt = (n.textContent || '').trim();
            return txt.includes(t) && txt.length < 200 && n.children.length < 5;
          });
          matches.sort((a, b) => a.textContent.length - b.textContent.length);
          if (matches.length) return matches[0];
          continue;
        }

        // :has-text("...") pseudo-selector
        const htMatch = part.match(/^(.*?):has-text\(\s*"([^"]+)"\s*\)(.*)$/);
        const hasTextFilter = htMatch ? htMatch[2].trim() : null;
        let css = htMatch ? (htMatch[1] + (htMatch[3] || '')).trim() : part;
        if (!css) css = '*';

        // Strip unstable Emotion / styled-components / CSS modules hashes (e.g. .css-123gyud, .css-a4796)
        const strippedCss = css.replace(/\.css-[a-z0-9]{4,10}\b/gi, '').replace(/\s+/g, ' ').trim();
        const candidateCssList = [css];
        if (strippedCss && strippedCss !== css) candidateCssList.push(strippedCss);

        for (const candidate of candidateCssList) {
          try {
            const all = [...doc.querySelectorAll(candidate)];
            if (!hasTextFilter) {
              const visible = all.find(el => el.offsetWidth > 0 || el.offsetHeight > 0);
              if (visible) return visible;
              if (all.length) return all[0];
            } else {
              const clickable = all.filter(el => {
                const t = (el.textContent || '').trim();
                return t.includes(hasTextFilter) && (el.offsetWidth > 0 || el.offsetHeight > 0);
              });
              if (clickable.length) {
                clickable.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
                return clickable[0];
              }
            }
          } catch (e) {
            // If selector failed syntax, try simplified
            const simplified = candidate
              .replace(/:nth-of-type\([^)]*\)/g, '')
              .replace(/:nth-child\([^)]*\)/g, '')
              .replace(/\.[a-zA-Z0-9_-]{18,}/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            if (simplified && simplified !== candidate) {
              try {
                const found = doc.querySelector(simplified);
                if (found) return found;
              } catch (e2) {}
            }
          }
        }
      }

      // Fallback 1: Extract ID selectors (e.g. #_r_1a_)
      const idMatch = sel.match(/#([a-zA-Z0-9_-]+)/);
      if (idMatch) {
        const el = doc.getElementById(idMatch[1]);
        if (el) return el;
      }

      // Fallback 2: Deepest CSS selector segment without hash classes
      if (sel.includes('>')) {
        const segments = sel.split('>').map(s => s.trim()).filter(Boolean);
        const lastPart = segments.pop();
        if (lastPart) {
          const cleanLast = lastPart.replace(/\.css-[a-z0-9]{4,10}\b/gi, '').trim();
          try {
            const fallback = doc.querySelector(cleanLast || lastPart);
            if (fallback) return fallback;
          } catch (e) {}
        }
      }

      // Fallback 3: Try primary semantic tag or role
      if (sel.includes('button')) {
        const btns = [...doc.querySelectorAll('button, [role="button"]')].filter(b => b.offsetWidth > 0);
        if (btns.length === 1) return btns[0];
      }
      if (sel.includes('input') || sel.includes('textarea')) {
        const inputs = [...doc.querySelectorAll('input:not([type="hidden"]), textarea')].filter(i => i.offsetWidth > 0);
        if (inputs.length === 1) return inputs[0];
      }
    } catch (e) {
      console.warn('[Player] Error querying selector in iframe:', sel, e);
    }
    return null;
  }

  // ── Render Step ─────────────────────────────────────────────
  function renderStep(idx) {
    if (idx < 0 || idx >= flatSteps.length) {
      // Completed tour -> Show Completion & Lead Gate
      spotlight.style.display = 'none';
      card.style.display = 'none';
      hotspot.style.display = 'none';
      showModal(
        'Walkthrough Complete',
        'You have completed the interactive product walkthrough. Enter your work email to request sandbox access or speak with our team.',
        'Request Access',
        () => { alert('Thank you. We will be in touch shortly.'); },
        'Restart',
        () => { renderStep(0); },
        true
      );
      return;
    }

    currentStepIdx = idx;
    const step = flatSteps[idx];
    // Use step's screenId, or fall back to the first screen
    const screenId = step.screenId || screenKeys[0];

    loadScreen(screenId, () => {
      // Update Progress
      if (progressFill) progressFill.style.width = `${((idx + 1) / flatSteps.length) * 100}%`;
      if (progressLabel) progressLabel.textContent = `${idx + 1} / ${flatSteps.length}`;

      const el = findElementInIframe(step.sel);
      if (!el) {
        // Selector didn't match — show centered card with Continue button regardless of step.action
        positionCenter(step, true /* force continue button */);
        return;
      }

      positionSpotlightAndCard(el, step);
    });
  }

  function advanceStep() {
    const step = flatSteps[currentStepIdx];
    if (step && step.targetScreen) {
      loadScreen(step.targetScreen, () => renderStep(currentStepIdx + 1));
    } else {
      renderStep(currentStepIdx + 1);
    }
  }

  // ── Position spotlight & card around found element ──────────
  function positionSpotlightAndCard(el, step) {
    const rect = el.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();

    const top = rect.top + frameRect.top;
    const left = rect.left + frameRect.left;
    const pad = 6;

    // Spotlight
    spotlight.style.display = 'block';
    spotlight.style.top = `${top - pad}px`;
    spotlight.style.left = `${left - pad}px`;
    spotlight.style.width = `${rect.width + pad * 2}px`;
    spotlight.style.height = `${rect.height + pad * 2}px`;

    // Hotspot Click Target — always show when element found so the user can click to advance
    hotspot.style.display = 'block';
    hotspot.style.top = `${top - pad}px`;
    hotspot.style.left = `${left - pad}px`;
    hotspot.style.width = `${rect.width + pad * 2}px`;
    hotspot.style.height = `${rect.height + pad * 2}px`;
    hotspot.onclick = () => advanceStep();

    // Card Content
    populateCard(step, false);

    // Position Card with Smart Auto-Flip
    card.style.display = 'block';
    const cardRect = card.getBoundingClientRect();
    let pos = step.pos || 'bottom';

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const gap = 16;

    const spaceBelow = winH - (top + rect.height + pad);
    const spaceAbove = top - pad;
    const spaceRight = winW - (left + rect.width + pad);
    const spaceLeft = left - pad;

    if (pos === 'bottom' && spaceBelow < cardRect.height + gap + 10 && spaceAbove >= cardRect.height + gap + 10) {
      pos = 'top';
    } else if (pos === 'top' && spaceAbove < cardRect.height + gap + 10 && spaceBelow >= cardRect.height + gap + 10) {
      pos = 'bottom';
    } else if (pos === 'right' && spaceRight < cardRect.width + gap + 10 && spaceLeft >= cardRect.width + gap + 10) {
      pos = 'left';
    } else if (pos === 'left' && spaceLeft < cardRect.width + gap + 10 && spaceRight >= cardRect.width + gap + 10) {
      pos = 'right';
    }

    let cardTop = 0;
    let cardLeft = 0;

    if (pos === 'bottom') {
      cardTop = top + rect.height + pad + gap;
      cardLeft = left + (rect.width / 2) - (cardRect.width / 2);
    } else if (pos === 'top') {
      cardTop = top - pad - gap - cardRect.height;
      cardLeft = left + (rect.width / 2) - (cardRect.width / 2);
    } else if (pos === 'left') {
      cardTop = top + (rect.height / 2) - (cardRect.height / 2);
      cardLeft = left - pad - gap - cardRect.width;
    } else if (pos === 'right') {
      cardTop = top + (rect.height / 2) - (cardRect.height / 2);
      cardLeft = left + rect.width + pad + gap;
    }

    // Viewport clamping
    if (cardLeft < 16) cardLeft = 16;
    if (cardLeft + cardRect.width > winW - 16) cardLeft = winW - cardRect.width - 16;
    if (cardTop < 56) cardTop = 56;
    if (cardTop + cardRect.height > winH - 16) cardTop = winH - cardRect.height - 16;

    card.style.top = `${cardTop}px`;
    card.style.left = `${cardLeft}px`;
  }

  function positionCenter(step, forceContinue) {
    spotlight.style.display = 'none';
    hotspot.style.display = 'none';
    populateCard(step, forceContinue);
    card.style.display = 'block';
    card.style.top = '50%';
    card.style.left = '50%';
    card.style.transform = 'translate(-50%, -50%)';
  }

  function populateCard(step, forceContinue) {
    card.style.transform = 'none';

    const isAction = step.action || step.targetScreen;
    // Show Continue button if: it's not an action step, OR if forceContinue is true (selector didn't match)
    const showContinue = !isAction || forceContinue;
    const isLast = currentStepIdx === flatSteps.length - 1;

    card.innerHTML = `
      <div class="player-kicker">${step.chapterTitle || 'Interactive Walkthrough'}</div>
      <div class="player-title">${step.title || ''}</div>
      <div class="player-body">${step.body || ''}</div>
      ${(isAction && !forceContinue) ? `<div class="player-hint">👆 Click the highlighted element to continue</div>` : ''}
      <div class="player-footer">
        <div class="player-dots">
          ${flatSteps.map((_, i) => `<span class="player-dot ${i === currentStepIdx ? 'active' : ''}${i < currentStepIdx ? ' done' : ''}"></span>`).join('')}
        </div>
        <div class="player-btn-group">
          ${currentStepIdx > 0 ? `<button id="player-prev-btn" class="player-btn player-btn-secondary">Back</button>` : ''}
          ${showContinue ? `<button id="player-next-btn" class="player-btn player-btn-primary">${isLast ? 'Complete' : 'Continue'}</button>` : ''}
        </div>
      </div>
    `;

    const prevBtn = document.getElementById('player-prev-btn');
    if (prevBtn) prevBtn.onclick = () => renderStep(currentStepIdx - 1);

    const nextBtn = document.getElementById('player-next-btn');
    if (nextBtn) nextBtn.onclick = () => advanceStep();
  }

  // ── Keyboard navigation ─────────────────────────────────────
  window.addEventListener('keydown', e => {
    if (modalBackdrop.style.display === 'flex') return; // don't navigate during modals
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      advanceStep();
    } else if (e.key === 'ArrowLeft' && currentStepIdx > 0) {
      e.preventDefault();
      renderStep(currentStepIdx - 1);
    } else if (e.key === 'Escape') {
      // Skip to end
    }
  });

  // ── Resize handler — reposition on window resize ────────────
  window.addEventListener('resize', () => {
    if (currentStepIdx >= 0 && currentStepIdx < flatSteps.length) {
      const step = flatSteps[currentStepIdx];
      const el = findElementInIframe(step.sel);
      if (el) positionSpotlightAndCard(el, step);
    }
  });

  // ── Start Demo ──────────────────────────────────────────────
  function init() {
    if (CFG.launchTitle) {
      showModal(
        CFG.launchTitle || 'Welcome to Interactive Demo',
        CFG.launchBody || 'Explore this hands-on interactive guided walkthrough.',
        CFG.startLabel || 'Start Demo',
        () => renderStep(0),
        CFG.dismissLabel || 'Explore on my own',
        () => {
          modalBackdrop.style.display = 'none';
          loadScreen(screenKeys[0]);
        }
      );
    } else {
      renderStep(0);
    }
  }

  // Run init when DOM is ready, or immediately if already loaded
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DemoStudioPlayer = {
    renderStep,
    loadScreen,
    next: () => advanceStep(),
    prev: () => renderStep(currentStepIdx - 1)
  };
})();
