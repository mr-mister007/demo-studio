/* ═══════════════════════════════════════════════════════════════
   DemoStudio Reprise-Grade Standalone Player Engine
   ════════════════════════════════════════════════════════════════ */

(() => {
  const PKG = window.__DEMO_PACKAGE || {
    config: window.__TOUR_CONFIG || {},
    screens: window.__DEMO_SCREENS || {}
  };

  const CFG = PKG.config || {};
  const SCREENS = PKG.screens || {};

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

  // Load a screen snapshot into the iframe
  function loadScreen(screenId, callback) {
    if (currentScreenId === screenId && frame.contentDocument && frame.contentDocument.body) {
      if (callback) callback();
      return;
    }
    currentScreenId = screenId;
    const html = SCREENS[screenId] || Object.values(SCREENS)[0] || '';
    if (!html) {
      console.warn('Screen snapshot not found for ID:', screenId);
      if (callback) callback();
      return;
    }

    frame.srcdoc = html;
    frame.onload = () => {
      // Inject helper to prevent link navigation or page unload inside iframe
      try {
        const doc = frame.contentDocument;
        if (doc) {
          doc.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', e => e.preventDefault());
          });
        }
      } catch (e) {}
      if (callback) setTimeout(callback, 50);
    };
  }

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

  function findElementInIframe(sel) {
    if (!sel || !frame.contentDocument) return null;
    try {
      if (sel.startsWith('text=')) {
        const t = sel.slice(5).trim();
        const nodes = [...frame.contentDocument.querySelectorAll('div, span, h1, h2, h3, h4, button, a, p, li')];
        const matches = nodes.filter(n => (n.textContent || '').includes(t) && n.children.length < 4);
        return matches[0] || null;
      }
      const el = frame.contentDocument.querySelector(sel);
      if (el) return el;

      // Fallback: If selector was hierarchical, try the last segment
      if (sel.includes('>')) {
        const lastPart = sel.split('>').pop().trim();
        if (lastPart) {
          const fallback = frame.contentDocument.querySelector(lastPart);
          if (fallback) return fallback;
        }
      }
    } catch (e) {
      console.warn('Error querying selector in iframe:', sel, e);
    }
    return null;
  }

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
    const screenId = step.screenId || Object.keys(SCREENS)[0];

    loadScreen(screenId, () => {
      // Update Progress
      if (progressFill) progressFill.style.width = `${((idx + 1) / flatSteps.length) * 100}%`;
      if (progressLabel) progressLabel.textContent = `${idx + 1} / ${flatSteps.length}`;

      const el = findElementInIframe(step.sel);
      if (!el) {
        // Fallback: center card
        positionCenter(step);
        return;
      }

      positionSpotlightAndCard(el, step);
    });
  }

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

    // Hotspot Click Target
    if (step.action || step.targetScreen) {
      hotspot.style.display = 'block';
      hotspot.style.top = `${top - pad}px`;
      hotspot.style.left = `${left - pad}px`;
      hotspot.style.width = `${rect.width + pad * 2}px`;
      hotspot.style.height = `${rect.height + pad * 2}px`;
      hotspot.onclick = () => {
        if (step.targetScreen) {
          loadScreen(step.targetScreen, () => renderStep(currentStepIdx + 1));
        } else {
          renderStep(currentStepIdx + 1);
        }
      };
    } else {
      hotspot.style.display = 'none';
      hotspot.onclick = null;
    }

    // Card Content
    populateCard(step);

    // Position Card with Smart Auto-Flip
    card.style.display = 'block';
    const cardRect = card.getBoundingClientRect();
    let pos = step.pos || 'bottom';

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const gap = 16;

    // Viewport collision check & dynamic auto-flip
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

  function positionCenter(step) {
    spotlight.style.display = 'none';
    hotspot.style.display = 'none';
    populateCard(step);
    card.style.display = 'block';
    card.style.top = '50%';
    card.style.left = '50%';
    card.style.transform = 'translate(-50%, -50%)';
  }

  function populateCard(step) {
    card.style.transform = 'none';
    card.innerHTML = `
      <div class="player-kicker">${step.chapterTitle || 'Interactive Walkthrough'}</div>
      <div class="player-title">${step.title || ''}</div>
      <div class="player-body">${step.body || ''}</div>
      ${(step.action || step.targetScreen) ? `<div class="player-hint">Click the highlighted element to continue</div>` : ''}
      <div class="player-footer">
        <div class="player-dots">
          ${flatSteps.map((_, i) => `<span class="player-dot ${i === currentStepIdx ? 'active' : ''}"></span>`).join('')}
        </div>
        <div class="player-btn-group">
          ${currentStepIdx > 0 ? `<button id="player-prev-btn" class="player-btn player-btn-secondary">Back</button>` : ''}
          <button id="player-next-btn" class="player-btn player-btn-primary">${currentStepIdx === flatSteps.length - 1 ? 'Complete' : 'Continue'}</button>
        </div>
      </div>
    `;

    const prevBtn = document.getElementById('player-prev-btn');
    if (prevBtn) prevBtn.onclick = () => renderStep(currentStepIdx - 1);

    const nextBtn = document.getElementById('player-next-btn');
    if (nextBtn) {
      nextBtn.onclick = () => {
        if (step.targetScreen) {
          loadScreen(step.targetScreen, () => renderStep(currentStepIdx + 1));
        } else {
          renderStep(currentStepIdx + 1);
        }
      };
    }
  }

  // Keyboard navigation
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      renderStep(currentStepIdx + 1);
    } else if (e.key === 'ArrowLeft' && currentStepIdx > 0) {
      renderStep(currentStepIdx - 1);
    }
  });

  // Start Demo
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
          loadScreen(Object.keys(SCREENS)[0]);
        }
      );
    } else {
      renderStep(0);
    }
  }

  window.addEventListener('DOMContentLoaded', init);

  window.DemoStudioPlayer = {
    renderStep,
    loadScreen,
    next: () => renderStep(currentStepIdx + 1),
    prev: () => renderStep(currentStepIdx - 1)
  };
})();
