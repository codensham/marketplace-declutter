// Hides Marketplace cards that are out of range, shipping-only, or seller ads.
//
// Verified against the live feed (Nov 2026):
//  - every listing card contains a[href*="/marketplace/item/<id>"];
//  - a card's text lines are [optional "Just listed"], price, title, then
//    "City, ST", "Ships to you", or "Ad from seller" (zero-width-space prefix);
//  - a seller ad has two links to the same item (image and text) in one card;
//  - the feed is many grid containers, one per loaded batch;
//  - the sidebar's location button has aria-label
//    "Location: Springfield, Illinois, Within 40 mi", on browse and search pages.
(() => {
  const G = globalThis.MLFGeo;
  const ITEM = 'a[href*="/marketplace/item/"]';
  const HIDING = new Set(['ad', 'ship', 'far']);
  const MAX_NUDGES = 5;

  let settings = { ...G.DEFAULT_SETTINGS };
  let active = null; // settings in force: Facebook's location if readable, else the popup's
  let fbLabel = null; // last aria-label read from Facebook's location filter
  let table = null;
  let tableLoading = false;
  let scheduled = false;
  let nudges = 0;

  const style = document.createElement('style');
  style.textContent = '[data-mlf-hidden]{display:none!important}';
  document.documentElement.appendChild(style);

  const onMarketplace = () => location.pathname.startsWith('/marketplace');
  const itemId = (a) => /\/marketplace\/item\/(\d+)/.exec(a.getAttribute('href') || '')?.[1];

  // The card's cell is the largest card-sized ancestor whose item links all
  // point to this one listing. The size limit matters when a page shows a
  // single listing: without it the walk would climb to the whole page.
  function cellOf(anchor) {
    const id = itemId(anchor);
    let node = anchor;
    while (node.parentElement && node.parentElement !== document.body) {
      const parent = node.parentElement;
      if ([...parent.querySelectorAll(ITEM)].some((l) => itemId(l) !== id)) break;
      const box = parent.getBoundingClientRect();
      if (!G.isCardSized(box.width, box.height)) break;
      node = parent;
    }
    return node;
  }

  function loadTable() {
    if (table || tableLoading) return;
    tableLoading = true;
    fetch(chrome.runtime.getURL('data/places.json'))
      .then((r) => r.json())
      .then((t) => {
        table = t;
        schedule();
      })
      .catch(() => {
        tableLoading = false; // extension reloaded or file missing: leave the page untouched
      });
  }

  // Reads Marketplace's own location filter. Pages without the filter (a
  // single listing, say) keep the last value read in this tab.
  function syncFacebookLocation() {
    const label = document.querySelector(G.FB_LOCATION_SELECTOR)?.getAttribute('aria-label');
    if (!label || label === fbLabel) return false;
    fbLabel = label;
    const parsed = G.parseFacebookLocation(label);
    active = G.effectiveSettings(settings, parsed, table);
    // Shared with the popup so it can show the location Facebook is using.
    chrome.storage.local.set({ fbLocation: parsed }).catch(() => {});
    return true;
  }

  function pass() {
    scheduled = false;
    if (!settings.enabled || !onMarketplace()) return;
    if (!table) return loadTable();
    if (!active) active = G.effectiveSettings(settings, G.parseFacebookLocation(fbLabel), table);
    if (syncFacebookLocation()) return reset(); // location changed: re-judge every card

    let processed = 0;
    let hid = 0;
    for (const anchor of document.querySelectorAll(`${ITEM}:not([data-mlf-seen])`)) {
      anchor.setAttribute('data-mlf-seen', '');
      if (!itemId(anchor)) continue;
      const cell = cellOf(anchor);
      if (cell.hasAttribute('data-mlf')) continue;
      const lines = G.cardLines(cell.innerText);
      if (!lines.length) {
        // Text not rendered yet; look again on the next pass.
        anchor.removeAttribute('data-mlf-seen');
        continue;
      }
      const verdict = G.decide(G.extractLocationLine(lines), active, table);
      cell.setAttribute('data-mlf', verdict);
      processed++;
      if (HIDING.has(verdict)) {
        cell.setAttribute('data-mlf-hidden', verdict);
        hid++;
      }
    }

    if (processed) nudges = 0;
    if (hid) nudgeIfShort();
  }

  // Hiding cards can leave the page too short to trigger Facebook's next
  // load, so prod the scroll position. Capped so an exhausted feed cannot loop.
  function nudgeIfShort() {
    if (nudges >= MAX_NUDGES) return;
    const doc = document.documentElement;
    if (doc.scrollHeight - (window.scrollY + window.innerHeight) >= 600) return;
    nudges++;
    setTimeout(() => {
      window.scrollBy(0, 1);
      window.scrollBy(0, -1);
      window.dispatchEvent(new Event('scroll'));
    }, 300);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(pass);
  }

  function reset() {
    for (const el of document.querySelectorAll('[data-mlf], [data-mlf-hidden], [data-mlf-seen]')) {
      el.removeAttribute('data-mlf');
      el.removeAttribute('data-mlf-hidden');
      el.removeAttribute('data-mlf-seen');
    }
    nudges = 0;
    schedule();
  }

  chrome.storage.sync.get('settings').then((stored) => {
    settings = { ...G.DEFAULT_SETTINGS, ...stored.settings };
    schedule();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.settings) return;
    settings = { ...G.DEFAULT_SETTINGS, ...changes.settings.newValue };
    active = null;
    reset();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'getCounts') return;
    const count = (v) => document.querySelectorAll(`[data-mlf="${v}"]`).length;
    sendResponse({
      ad: count('ad'),
      ship: count('ship'),
      far: count('far'),
      unknown: count('unknown'),
      active: onMarketplace(),
      source: active?.source ?? 'manual',
      centerLabel: active?.centerLabel ?? '',
      radiusMiles: active?.radiusMiles ?? null,
    });
  });

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
