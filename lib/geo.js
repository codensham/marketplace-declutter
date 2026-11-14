// Pure location logic. Classic script (no import/export) so the same file
// loads in the content script, the popup, and Node.
(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    centerLabel: '',
    center: null,
    radiusMiles: 20,
    hideShipping: true,
  };

  // Lower-cased card text that marks a shipped listing.
  const SHIPPING_MARKERS = ['ships to you'];

  const ABBREVIATIONS = [
    [/^st /, 'saint '],
    [/^ft /, 'fort '],
    [/^mt /, 'mount '],
  ];

  function normalizeName(name) {
    let n = String(name).toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    for (const [pattern, full] of ABBREVIATIONS) n = n.replace(pattern, full);
    return n;
  }

  function makeKey(city, state) {
    return `${normalizeName(city)}|${String(state).toUpperCase()}`;
  }

  function parseLocationLine(text) {
    const m = /^([^,]*[a-z][^,]*),\s*([a-z]{2})$/i.exec(String(text ?? '').trim());
    return m ? { city: m[1].trim(), state: m[2].toUpperCase() } : null;
  }

  function isShippingMarker(text) {
    return SHIPPING_MARKERS.includes(String(text ?? '').trim().toLowerCase());
  }

  function extractLocationLine(lines) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (isShippingMarker(lines[i]) || parseLocationLine(lines[i])) return lines[i];
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

  // "ship" and "far" hide the card; "keep" and "unknown" leave it visible.
  function decide(locationText, settings, table) {
    if (isShippingMarker(locationText)) return settings.hideShipping ? 'ship' : 'keep';
    const loc = parseLocationLine(locationText);
    const coords = loc && lookup(table, loc.city, loc.state);
    if (!coords) return 'unknown';
    if (!settings.center) return 'keep';
    return haversineMiles(settings.center, coords) > settings.radiusMiles ? 'far' : 'keep';
  }

  globalThis.MLFGeo = {
    DEFAULT_SETTINGS,
    SHIPPING_MARKERS,
    normalizeName,
    makeKey,
    parseLocationLine,
    isShippingMarker,
    extractLocationLine,
    haversineMiles,
    lookup,
    decide,
  };
})();
