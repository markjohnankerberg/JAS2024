/* ===== CUSTOM PRODUCT APPENDER (drop-in) ===== */
(() => {
  // Do nothing in HubSpot editor/preview
  if (window.hsInEditor || window.location.href.includes('hs-sites-editor')) return;

  // --- CONFIG: update as needed ---
  const INPUT_SELECTOR = '#module_17467742129505-input';
  const HS_UL_SELECTOR = '#autocomplete-results';
  const API_BASE = 'https://evening-hamlet-21806-48ff8cbe05f8.herokuapp.com/woocommerce/search/api/';
  const API_SOURCE = 'live';
  const MIN_QUERY = 2;
  const DEBOUNCE_MS = 300;
  const MAX_ITEMS = 6;

  // --- UTILS ---
  const CUSTOM_debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const CUSTOM_norm = s => (s || '').toString().trim().toLowerCase();
  const CUSTOM_cleanURL = href => {
    if (!href) return '';
    try { return new URL(href, location.origin).toString(); } catch { return href; }
  };

  // --- STATE ---
  let CUSTOM_lastQuery = '';
  let CUSTOM_lastProducts = [];
  let CUSTOM_aborter = null;
  let CUSTOM_observer = null;
  let CUSTOM_retryCount = 0;
  const CUSTOM_MAX_RETRIES = 20;

  // Append custom products to HubSpot's existing results
  function CUSTOM_renderAppend(products) {
    try {
      const ul = document.querySelector(HS_UL_SELECTOR);
      if (!ul) return;

      // Remove our previous group
      ul.querySelectorAll('.custom-suggestion, .custom-group-label').forEach(n => n.remove());

      if (!products || !products.length) return;

      // Avoid duplicates with HS suggestions
      const existingKeys = new Set();
      ul.querySelectorAll('li a[href]').forEach(a => {
        const key = CUSTOM_norm(a.textContent) + '|' + CUSTOM_cleanURL(a.getAttribute('href'));
        existingKeys.add(key);
      });

      const frag = document.createDocumentFragment();

      // Add section label if HS has any items already
      if (ul.children.length > 0) {
        const label = document.createElement('li');
        label.className = 'custom-group-label';
        label.setAttribute('role', 'presentation');
        label.setAttribute('aria-hidden', 'true');
        label.textContent = 'Products';
        frag.appendChild(label);
      }

      // Add product rows
      products.slice(0, MAX_ITEMS).forEach(p => {
        const title = p.name || 'Untitled';
        const href = CUSTOM_cleanURL((p.permalink || '#').replace('//product', '/product'));
        const key = CUSTOM_norm(title) + '|' + href;
        if (existingKeys.has(key)) return;

        const li = document.createElement('li');
        li.className = 'custom-suggestion';
        li.setAttribute('role', 'option');
        li.setAttribute('tabindex', '-1');

        const imgSrc = p.primary_image || (p.images && p.images[0] && p.images[0].src) || '';
        if (imgSrc) {
          const img = document.createElement('img');
          img.src = imgSrc;
          img.alt = title;
          img.onerror = () => (img.style.display = 'none');
          li.appendChild(img);
        }

        const meta = document.createElement('div');
        meta.className = 'meta';

        const t = document.createElement('div');
        t.className = 'title';
        t.textContent = title;

        const pr = document.createElement('div');
        pr.className = 'price';
        pr.textContent = p.formatted_price || p.price || '';

        meta.appendChild(t);
        if (pr.textContent) meta.appendChild(pr);
        li.appendChild(meta);

        li.addEventListener('click', (e) => {
          e.preventDefault();
          if (typeof window.hsInEditor === 'undefined' && !window.location.href.includes('hs-sites-editor')) {
            window.location.href = href;
          }
        });

        frag.appendChild(li);
      });

      ul.appendChild(frag);
    } catch (err) {
      console.warn('[custom-append] render error:', err);
    }
  }

  async function CUSTOM_runProductSearch(q) {
    if (CUSTOM_aborter) CUSTOM_aborter.abort();
    CUSTOM_aborter = new AbortController();

    const url = `${API_BASE}?q=${encodeURIComponent(q)}&source=${encodeURIComponent(API_SOURCE)}`;

    try {
      const res = await fetch(url, {
        signal: CUSTOM_aborter.signal,
        mode: 'cors',
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      CUSTOM_lastProducts = (data && data.products) || [];
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('[custom-append] API error:', err);
      CUSTOM_lastProducts = [];
    }

    // Let HubSpot draw its suggestions first, then append ours
    setTimeout(() => CUSTOM_renderAppend(CUSTOM_lastProducts), 150);
  }

  function CUSTOM_startObserver() {
    const ul = document.querySelector(HS_UL_SELECTOR);
    if (!ul) return;

    if (CUSTOM_observer) CUSTOM_observer.disconnect();

    CUSTOM_observer = new MutationObserver((mutations) => {
      try {
        // Detect HS updates but not our own additions
        const hubspotChanged = mutations.some(m =>
          Array.from(m.addedNodes).some(node =>
            node.nodeType === 1 &&
            !node.classList?.contains('custom-suggestion') &&
            !node.classList?.contains('custom-group-label')
          ) ||
          Array.from(m.removedNodes).some(node =>
            node.nodeType === 1 &&
            !node.classList?.contains('custom-suggestion') &&
            !node.classList?.contains('custom-group-label')
          )
        );

        if (hubspotChanged && CUSTOM_lastQuery.length >= MIN_QUERY && CUSTOM_lastProducts.length > 0) {
          setTimeout(() => CUSTOM_renderAppend(CUSTOM_lastProducts), 100);
        }
      } catch (err) {
        console.warn('[custom-append] observer error:', err);
      }
    });

    CUSTOM_observer.observe(ul, { childList: true, subtree: false });
  }

  function CUSTOM_initAutocomplete() {
    const input = document.querySelector(INPUT_SELECTOR);
    if (!input) { console.warn('[custom-append] Search input not found:', INPUT_SELECTOR); return; }

    const onInput = CUSTOM_debounce(() => {
      const q = input.value.trim();
      CUSTOM_lastQuery = q;

      if (q.length < MIN_QUERY) {
        const ul = document.querySelector(HS_UL_SELECTOR);
        if (ul) ul.querySelectorAll('.custom-suggestion, .custom-group-label').forEach(n => n.remove());
        return;
      }
      CUSTOM_runProductSearch(q);
    }, DEBOUNCE_MS);

    input.addEventListener('input', onInput);
    input.addEventListener('focus', () => {
      if ((input.value || '').trim().length >= MIN_QUERY) onInput();
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        const ul = document.querySelector(HS_UL_SELECTOR);
        if (ul && !ul.matches(':hover')) {
          ul.querySelectorAll('.custom-suggestion, .custom-group-label').forEach(n => n.remove());
        }
      }, 150);
    });

    // Wait for HS autocomplete <ul> to exist, then observe
    const tryStart = () => {
      if (document.querySelector(HS_UL_SELECTOR)) {
        CUSTOM_startObserver();
        CUSTOM_retryCount = 0;
      } else if (CUSTOM_retryCount < CUSTOM_MAX_RETRIES) {
        CUSTOM_retryCount++;
        setTimeout(tryStart, 300);
      } else {
        console.warn('[custom-append] HS UL not found after retries:', HS_UL_SELECTOR);
      }
    };
    setTimeout(tryStart, 500);
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', CUSTOM_initAutocomplete);
  } else {
    setTimeout(CUSTOM_initAutocomplete, 1000);
  }
})();
