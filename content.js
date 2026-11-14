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
  // Facebook's location as last seen in any tab. Used until this page renders
  // its own filter, so the first cards are judged without waiting for it.
  let fbCached = null;
  let ready = false; // settings and cached location loaded
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
  // Returns true when the location in force changed.
  function syncFacebookLocation() {
    const label = document.querySelector(G.FB_LOCATION_SELECTOR)?.getAttribute('aria-label');
    if (!label || label === fbLabel) return false;
    fbLabel = label;
    const parsed = G.parseFacebookLocation(label);
    const before = active;
    active = G.effectiveSettings(settings, parsed, table);
    if (JSON.stringify(parsed) !== JSON.stringify(fbCached)) {
      fbCached = parsed;
      // Shared with the popup and with the next page load.
      chrome.storage.local.set({ fbLocation: parsed }).catch(() => {});
    }
    return !G.sameFilter(before, active);
  }

  function pass() {
    scheduled = false;
    if (!ready || !settings.enabled || !onMarketplace()) return;
    if (!table) return loadTable();
    if (!active) {
      const fb = fbLabel ? G.parseFacebookLocation(fbLabel) : fbCached;
      active = G.effectiveSettings(settings, fb, table);
    }
    if (syncFacebookLocation()) return reset(); // location changed: re-judge every card

    // Read everything first, then write. Hiding a card between reads would
    // make the browser redo layout for every card measured after it.
    const seen = [];
    const judged = new Map(); // cell -> { verdict, loc }
    for (const anchor of document.querySelectorAll(`${ITEM}:not([data-mlf-seen])`)) {
      if (!itemId(anchor)) {
        seen.push(anchor);
        continue;
      }
      const cell = cellOf(anchor);
      if (!cell.hasAttribute('data-mlf') && !judged.has(cell)) {
        const lines = G.cardLines(cell.innerText);
        if (!lines.length) continue; // text not rendered yet; look again on the next pass
        const loc = G.extractLocationLine(lines);
        judged.set(cell, { verdict: G.decide(loc, active, table), loc: loc ?? '' });
      }
      seen.push(anchor);
    }

    for (const anchor of seen) anchor.setAttribute('data-mlf-seen', '');
    let hid = 0;
    for (const [cell, { verdict, loc }] of judged) {
      cell.setAttribute('data-mlf', verdict);
      cell.setAttribute('data-mlf-loc', loc);
      if (HIDING.has(verdict)) {
        cell.setAttribute('data-mlf-hidden', verdict);
        hid++;
      }
    }

    if (judged.size) nudges = 0;
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
    }, 100);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    // Next frame, or shortly after when no frame comes (a background tab),
    // so a tab opened in the background is already filtered when shown.
    const run = () => scheduled && pass();
    requestAnimationFrame(run);
    setTimeout(run, 60);
  }

  function reset() {
    for (const el of document.querySelectorAll('[data-mlf], [data-mlf-hidden], [data-mlf-seen]')) {
      el.removeAttribute('data-mlf');
      el.removeAttribute('data-mlf-loc');
      el.removeAttribute('data-mlf-hidden');
      el.removeAttribute('data-mlf-seen');
    }
    nudges = 0;
    schedule();
  }

  // Settings, the last known Facebook location and the city table all load
  // at once, as soon as the page starts, so the first cards can be judged
  // the moment they render.
  Promise.all([chrome.storage.sync.get('settings'), chrome.storage.local.get('fbLocation')])
    .then(([stored, local]) => {
      settings = { ...G.DEFAULT_SETTINGS, ...stored.settings };
      fbCached = local.fbLocation ?? null;
      ready = true;
      schedule();
    })
    .catch(() => {}); // extension reloaded under this page
  if (onMarketplace()) loadTable();

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
      unknownSamples: G.unknownSamples(
        [...document.querySelectorAll('[data-mlf="unknown"]')].map((c) => c.getAttribute('data-mlf-loc')),
      ),
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
