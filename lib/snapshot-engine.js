/* ═══════════════════════════════════════════════════════════════
   DemoStudio — Reprise-Style DOM Snapshot Engine
   Captures full DOM, inlines CSS rules, converts SVGs/images,
   strips intrusive scripts (analytics, websockets, auth redirects),
   and outputs a self-contained standalone screen snapshot.
   ════════════════════════════════════════════════════════════════ */

(() => {
  if (typeof window === 'undefined') return;

  function captureStyles() {
    let cssText = '';
    for (let i = 0; i < document.styleSheets.length; i++) {
      try {
        const sheet = document.styleSheets[i];
        if (sheet.href && (sheet.href.includes('studio-overlay') || sheet.href.includes('demo-engine') || sheet.href.includes('__tour'))) continue;
        if (!sheet.cssRules) continue;
        for (let j = 0; j < sheet.cssRules.length; j++) {
          const ruleText = sheet.cssRules[j].cssText;
          if (ruleText.includes('#demostudio-') || ruleText.includes('.studio-')) continue;
          cssText += ruleText + '\n';
        }
      } catch (e) {
        // Cross-origin stylesheets may throw security error; preserve link tag as fallback
      }
    }
    return cssText;
  }

  function serializeDom(options = {}) {
    const clone = document.documentElement.cloneNode(true);

    // 1. Remove DemoStudio's own UI elements from the snapshot
    const studioElements = clone.querySelectorAll(
      '#demostudio-layer, #demostudio-launch, #demostudio-progress, #demostudio-studio, #studio-panel, [id^="demostudio-"], [id^="studio-"], script[src*="__tour"]'
    );
    studioElements.forEach(el => el.remove());

    // 2. Strip active runtime scripts (to prevent redirects, auth timers, websockets from firing offline)
    const scripts = clone.querySelectorAll('script');
    scripts.forEach(s => {
      // Keep JSON data scripts (e.g. Next.js __NEXT_DATA__ or application/json if needed for layout), remove JS code
      const type = s.getAttribute('type') || '';
      if (!type.includes('json')) {
        s.remove();
      }
    });

    // 3. Inline all computed and loaded stylesheets
    const inlinedStyles = captureStyles();
    if (inlinedStyles) {
      const styleTag = document.createElement('style');
      styleTag.setAttribute('data-demostudio-inlined', 'true');
      styleTag.textContent = inlinedStyles;
      const head = clone.querySelector('head') || clone;
      head.appendChild(styleTag);
    }

    // 4. Ensure base href is absolute if requested, so fonts and relative images resolve correctly
    let baseTag = clone.querySelector('base');
    if (!baseTag) {
      baseTag = document.createElement('base');
      baseTag.href = window.location.origin + '/';
      const head = clone.querySelector('head');
      if (head) head.insertBefore(baseTag, head.firstChild);
    }

    // 5. Freeze input values into value attributes and checked state
    const originalInputs = document.querySelectorAll('input, textarea, select');
    const clonedInputs = clone.querySelectorAll('input, textarea, select');
    for (let i = 0; i < originalInputs.length && i < clonedInputs.length; i++) {
      const orig = originalInputs[i];
      const cl = clonedInputs[i];
      if (orig.tagName === 'TEXTAREA') {
        cl.textContent = orig.value;
      } else if (orig.tagName === 'SELECT') {
        cl.value = orig.value;
        const opts = cl.querySelectorAll('option');
        opts.forEach(o => {
          if (o.value === orig.value) o.setAttribute('selected', 'selected');
          else o.removeAttribute('selected');
        });
      } else {
        cl.setAttribute('value', orig.value);
        if (orig.checked) cl.setAttribute('checked', 'checked');
        else cl.removeAttribute('checked');
      }
    }

    // 6. Freeze Canvas elements into high-res data URLs
    const origCanvases = document.querySelectorAll('canvas');
    const clonedCanvases = clone.querySelectorAll('canvas');
    for (let i = 0; i < origCanvases.length && i < clonedCanvases.length; i++) {
      try {
        const orig = origCanvases[i];
        const dataUrl = orig.toDataURL('image/png');
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.cssText = orig.style.cssText;
        img.className = orig.className;
        img.width = orig.width;
        img.height = orig.height;
        clonedCanvases[i].parentNode?.replaceChild(img, clonedCanvases[i]);
      } catch (e) {}
    }

    // 7. Freeze Scroll Positions on Containers
    const origScrollables = document.querySelectorAll('*');
    const clonedScrollables = clone.querySelectorAll('*');
    for (let i = 0; i < origScrollables.length && i < clonedScrollables.length; i++) {
      const orig = origScrollables[i];
      if (orig.scrollTop > 0 || orig.scrollLeft > 0) {
        clonedScrollables[i].setAttribute('data-demostudio-scroll-top', orig.scrollTop);
        clonedScrollables[i].setAttribute('data-demostudio-scroll-left', orig.scrollLeft);
      }
    }

    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  function captureScreen(screenId, screenName) {
    const html = serializeDom();
    const meta = {
      id: screenId || 'screen_' + Date.now(),
      name: screenName || document.title || 'Screen Snapshot',
      url: window.location.pathname + window.location.search,
      capturedAt: new Date().toISOString(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
    return { meta, html };
  }

  window.__DemoStudioSnapshot = {
    serializeDom,
    captureScreen,
    captureStyles
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { serializeDom, captureScreen };
  }
})();
