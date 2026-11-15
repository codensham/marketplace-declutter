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
  const MAX_NUDGES = 5;
  const RECHECK_MS = 400; // gap between re-checks of an unknown card

  let settings = { ...G.DEFAULT_SETTINGS };
  let active = null; // settings in force: Facebook's location if readable, else the popup's
  let fbLabel = null; // last aria-label read from Facebook's location filter
  // Facebook's location as last seen in any tab. Used until this page renders
  // its own filter, so the first cards are judged without waiting for it.
  let fbCached = null;
  let ready = false; // settings and cached location loaded
  let table = null;
  let stateBounds = null;
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

  // A card already judged is found again through its marker rather than by
  // measuring: a hidden card has no size, so cellOf would stop at the link.
  function cellFor(anchor, id) {
    const judged = anchor.closest('[data-mlf]');
    if (judged && [...judged.querySelectorAll(ITEM)].every((l) => itemId(l) === id)) return judged;
    return cellOf(anchor);
  }

  // A card's text, one entry per line. innerText follows the layout, so it
  // drops the line breaks of a card that is not rendered (one we hid, or a
  // feed Facebook hides while it loads another location) and glues price,
  // title and city into one line. Such a card is read one text node per line.
  function cardLinesOf(cell) {
    if (cell.checkVisibility()) return G.cardLines(cell.innerText);
    const texts = [];
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) texts.push(walker.currentNode.nodeValue);
    return G.cardLines(texts.join('\n'));
  }

  function loadTable() {
    if (table || tableLoading) return;
    tableLoading = true;
    const getJson = (path) => fetch(chrome.runtime.getURL(path)).then((r) => r.json());
    Promise.all([getJson('data/places.json'), getJson('data/aliases.json').catch(() => ({}))])
      .then(([t, aliases]) => {
        table = G.withAliases(t, aliases);
        stateBounds = G.buildStateBounds(table);
        schedule();
      })
      .catch(() => {
        tableLoading = false; // extension reloaded or file missing: leave the page untouched
      });
  }

  // Reads Marketplace's own location filter. Pages without the filter (a
  // single listing, say) keep the last value read in this tab. Only a
  // rendered filter counts: Facebook can keep an earlier page mounted but
  // hidden, and its filter would still show the old location.
  // Returns true when the location in force changed.
  function syncFacebookLocation() {
    const filter = [...document.querySelectorAll(G.FB_LOCATION_SELECTOR)].find(
      (el) => el.getClientRects().length > 0,
    );
    const label = filter?.getAttribute('aria-label');
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
    // An anchor is marked seen, with its listing's id, once its card has a
    // final verdict; anchors of unknown cards stay unseen so later passes can
    // read the card again. Keeping the id means a link Facebook reuses for a
    // different listing is judged afresh instead of keeping the old verdict.
    const seen = [];
    const judged = new Map(); // cell -> { id, verdict, loc, tries, isNew, anchors }
    for (const anchor of document.querySelectorAll(ITEM)) {
      const id = itemId(anchor) ?? '';
      if (anchor.getAttribute('data-mlf-seen') === id) continue;
      if (!id) {
        seen.push(anchor);
        continue;
      }
      const cell = cellFor(anchor, id);
      const entry = judged.get(cell);
      if (entry) {
        entry.anchors.push(anchor);
        continue;
      }
      // A verdict recorded for another listing does not carry over.
      const sameListing = cell.getAttribute('data-mlf-id') === id;
      const previous = sameListing ? cell.getAttribute('data-mlf') : null;
      const tries = sameListing ? Number(cell.getAttribute('data-mlf-tries')) || 0 : 0;
      if (!G.shouldRejudge(previous, tries)) {
        seen.push(anchor);
        continue;
      }
      const lines = cardLinesOf(cell);
      if (!lines.length) continue; // text not rendered yet; look again on the next pass
      const loc = G.extractLocationLine(lines);
      const verdict = G.decide(loc, active, table, stateBounds);
      judged.set(cell, { id, verdict, loc: loc ?? '', tries, isNew: !previous, anchors: [anchor] });
    }

    for (const anchor of seen) anchor.setAttribute('data-mlf-seen', itemId(anchor) ?? '');
    let hid = 0;
    let fresh = 0;
    let pending = 0; // unknown cards with re-checks left
    for (const [cell, { id, verdict, loc, tries, isNew, anchors }] of judged) {
      cell.setAttribute('data-mlf-id', id);
      cell.setAttribute('data-mlf', verdict);
      cell.setAttribute('data-mlf-loc', loc);
      if (isNew) fresh++;
      let final = true;
      if (verdict === 'unknown') {
        cell.setAttribute('data-mlf-tries', String(tries + 1));
        final = tries + 1 >= G.MAX_UNKNOWN_TRIES;
        if (!final) pending++;
      } else {
        cell.removeAttribute('data-mlf-tries');
      }
      if (final) for (const a of anchors) a.setAttribute('data-mlf-seen', id);
      if (G.hides(verdict, active, final)) {
        cell.setAttribute('data-mlf-hidden', verdict);
        hid++;
      } else {
        cell.removeAttribute('data-mlf-hidden');
      }
    }

    if (fresh) nudges = 0;
    if (hid) nudgeIfShort();
    // A quiet page triggers no further passes, so come back for the
    // remaining re-checks rather than waiting for the next page change.
    if (pending) setTimeout(schedule, RECHECK_MS);
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
      el.removeAttribute('data-mlf-id');
      el.removeAttribute('data-mlf-loc');
      el.removeAttribute('data-mlf-tries');
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
      unknownHidden: Boolean(active?.hideUnknown),
      farCities: table
        ? G.farCities(
            [...document.querySelectorAll('[data-mlf="far"]')].map((c) => c.getAttribute('data-mlf-loc')),
            table,
            active?.center ?? null,
          )
        : [],
      active: onMarketplace(),
      source: active?.source ?? 'manual',
      centerLabel: active?.centerLabel ?? '',
      radiusMiles: active?.radiusMiles ?? null,
    });
  });

  // aria-label is watched because changing the location in Marketplace's
  // filter rewrites the label on the existing button rather than replacing
  // it, often after the new feed has rendered; without it the change would
  // go unseen until the next unrelated page change.
  // href is watched so a link reused for another listing is re-judged.
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'href'],
  });
})();
