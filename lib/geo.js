// Pure location logic. Classic script (no import/export) so the same file
// loads in the content script, the popup, and Node.
(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    centerLabel: '',
    center: null,
    radiusMiles: 20,
    hideShipping: true,
    hideAds: true,
  };

  // Lower-cased card text, as seen on the live Marketplace feed (Nov 2026).
  const SHIPPING_MARKERS = ['ships to you'];
  const AD_MARKERS = ['ad from seller'];

  const ABBREVIATIONS = [
    [/^st /, 'saint '],
    [/^ft /, 'fort '],
    [/^mt /, 'mount '],
  ];

  // Facebook pads some labels with zero-width characters.
  const clean = (text) => String(text ?? '').replace(/[​-‍⁠﻿]/g, '').trim();

  function cardLines(innerText) {
    return String(innerText ?? '').split('\n').map(clean).filter(Boolean);
  }

  function normalizeName(name) {
    let n = clean(name).toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    for (const [pattern, full] of ABBREVIATIONS) n = n.replace(pattern, full);
    return n;
  }

  function makeKey(city, state) {
    return `${normalizeName(city)}|${String(state).toUpperCase()}`;
  }

  function parseLocationLine(text) {
    const m = /^([^,]*[a-z][^,]*),\s*([a-z]{2})$/i.exec(clean(text));
    return m ? { city: m[1].trim(), state: m[2].toUpperCase() } : null;
  }

  function isShippingMarker(text) {
    return SHIPPING_MARKERS.includes(clean(text).toLowerCase());
  }

  function isAdMarker(text) {
    return AD_MARKERS.includes(clean(text).toLowerCase());
  }

  // The last line that says where (or how) the listing is offered.
  function extractLocationLine(lines) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (isAdMarker(line) || isShippingMarker(line) || parseLocationLine(line)) return line;
    }
    return null;
  }

  function haversineMiles(a, b) {
    const rad = (deg) => (deg * Math.PI) / 180;
    const dLat = rad(b[0] - a[0]);
    const dLon = rad(b[1] - a[1]);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * 3958.8 * Math.asin(Math.sqrt(h));
  }

  function lookup(table, city, state) {
    return table[makeKey(city, state)] ?? null;
  }

  // "ad", "ship" and "far" hide the card; "keep" and "unknown" leave it visible.
  function decide(locationText, settings, table) {
    if (isAdMarker(locationText)) return settings.hideAds ? 'ad' : 'keep';
    if (isShippingMarker(locationText)) return settings.hideShipping ? 'ship' : 'keep';
    const loc = parseLocationLine(locationText);
    const coords = loc && lookup(table, loc.city, loc.state);
    if (!coords) return 'unknown';
    if (!settings.center) return 'keep';
    return haversineMiles(settings.center, coords) > settings.radiusMiles ? 'far' : 'keep';
  }

  // Upper bound on a listing card's size in CSS pixels. Stops the content
  // script from mistaking a row, grid or page section for one card.
  function isCardSized(width, height) {
    return width <= 520 && height <= 640;
  }

  globalThis.MLFGeo = {
    isCardSized,
    DEFAULT_SETTINGS,
    SHIPPING_MARKERS,
    AD_MARKERS,
    cardLines,
    normalizeName,
    makeKey,
    parseLocationLine,
    isShippingMarker,
    isAdMarker,
    extractLocationLine,
    haversineMiles,
    lookup,
    decide,
  };
})();
