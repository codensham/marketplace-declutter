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
    // True once the user edits the city or radius in the popup. Until then
    // (and again after "Use Facebook's location") Facebook's filter is used.
    manualOverride: false,
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

  // Other spellings of a city name that Facebook or the table may use.
  // Each rule adds variants; the plain normalised name is always first.
  const DIRECTIONS = { n: 'north', s: 'south', e: 'east', w: 'west',
                       ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest' };
  const WORDS = { st: 'saint', ste: 'sainte', ft: 'fort', mt: 'mount' };
  const VARIANT_RULES = [
    (n) => n.replace(/^(n|s|e|w|ne|nw|se|sw) /, (_, d) => `${DIRECTIONS[d]} `),
    (n) => n.replace(/^pt /, 'point '),
    (n) => n.replace(/\b(st|ste|ft|mt)\b/g, (w) => WORDS[w]),
    (n) => n.replace(/^the /, ''),
    (n) => n.replace(/-/g, ' '),
    (n) => n.replace(/ /g, '-'),
    (n) => n.replace(/['\u2019]/g, ''),
  ];

  function nameVariants(city) {
    const variants = [normalizeName(city)];
    for (const rule of VARIANT_RULES) {
      for (const v of [...variants]) {
        const next = rule(v);
        if (next && !variants.includes(next)) variants.push(next);
      }
    }
    return variants;
  }

  function lookup(table, city, state) {
    const st = String(state).toUpperCase();
    for (const name of nameVariants(city)) {
      const coords = table[`${name}|${st}`];
      if (coords) return coords;
    }
    return null;
  }

  // Adds hand-kept names (data/aliases.json) that the table lacks.
  function withAliases(table, aliases) {
    for (const [key, coords] of Object.entries(aliases ?? {})) {
      if (!(key in table)) table[key] = coords;
    }
    return table;
  }

  // A box around each state's known places. Alaska is left out: its
  // longitudes wrap past 180 degrees, so a box would be meaningless.
  function buildStateBounds(table) {
    const bounds = {};
    for (const [key, [lat, lon]] of Object.entries(table)) {
      const state = key.slice(key.lastIndexOf('|') + 1);
      if (state === 'AK') continue;
      const b = (bounds[state] ??= { minLat: lat, maxLat: lat, minLon: lon, maxLon: lon });
      b.minLat = Math.min(b.minLat, lat);
      b.maxLat = Math.max(b.maxLat, lat);
      b.minLon = Math.min(b.minLon, lon);
      b.maxLon = Math.max(b.maxLon, lon);
    }
    return bounds;
  }

  // Miles from `center` to the nearest point of the state's box; 0 inside
  // it, null for a state with no box.
  function milesToState(bounds, state, center) {
    const b = bounds[state];
    if (!b) return null;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    return haversineMiles(center, [clamp(center[0], b.minLat, b.maxLat), clamp(center[1], b.minLon, b.maxLon)]);
  }

  // An unknown town can sit a little outside its state's outermost listed place.
  const STATE_MARGIN_MILES = 10;

  // "ad", "ship" and "far" hide the card; "keep" and "unknown" leave it visible.
  // With `stateBounds`, an unknown city whose whole state is out of range is "far".
  function decide(locationText, settings, table, stateBounds) {
    if (isAdMarker(locationText)) return settings.hideAds ? 'ad' : 'keep';
    if (isShippingMarker(locationText)) return settings.hideShipping ? 'ship' : 'keep';
    const loc = parseLocationLine(locationText);
    const coords = loc && lookup(table, loc.city, loc.state);
    if (!coords) {
      if (loc && stateBounds && settings.center) {
        const miles = milesToState(stateBounds, loc.state, settings.center);
        if (miles !== null && miles > settings.radiusMiles + STATE_MARGIN_MILES) return 'far';
      }
      return 'unknown';
    }
    if (!settings.center) return 'keep';
    return haversineMiles(settings.center, coords) > settings.radiusMiles ? 'far' : 'keep';
  }

  const STATE_ABBR = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
    colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
    florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
    indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
    maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
    mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
    oregon: 'OR', pennsylvania: 'PA', 'puerto rico': 'PR', 'rhode island': 'RI',
    'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX',
    utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
    'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  };

  // Selector for Marketplace's own location filter button, whose aria-label
  // reads "Location: Springfield, Illinois, Within 40 mi" (Nov 2026).
  const FB_LOCATION_SELECTOR = '[aria-label^="Location: "]';

  function parseFacebookLocation(ariaLabel) {
    const m = /^Location:\s*(.+),\s*([^,]+),\s*Within\s+([\d.]+)\s*(mi|miles?|km|kilometers?)$/i.exec(
      clean(ariaLabel),
    );
    if (!m) return null;
    const state = STATE_ABBR[m[2].trim().toLowerCase()];
    const amount = Number(m[3]);
    if (!state || !Number.isFinite(amount) || amount <= 0) return null;
    const radiusMiles = /^k/i.test(m[4]) ? amount * 0.621371 : amount;
    return { city: m[1].trim(), state, radiusMiles };
  }

  // Facebook's own location filter is the default. The popup's city and
  // radius apply when the user changed them by hand, or when Facebook's
  // filter cannot be read or names a city that is not in the table.
  function effectiveSettings(settings, fbLocation, table) {
    if (settings.manualOverride && settings.center) return { ...settings, source: 'manual' };
    const coords = fbLocation && lookup(table, fbLocation.city, fbLocation.state);
    if (!coords) return { ...settings, source: 'manual' };
    return {
      ...settings,
      center: coords,
      radiusMiles: fbLocation.radiusMiles,
      centerLabel: `${fbLocation.city}, ${fbLocation.state}`,
      source: 'facebook',
    };
  }

  // An unknown card is read again on later passes, in case its location
  // line rendered after the first read, but only a few times so a feed of
  // genuinely unknown cities is not re-read on every scroll.
  const MAX_UNKNOWN_TRIES = 3;

  function shouldRejudge(verdict, tries) {
    if (!verdict) return true;
    return verdict === 'unknown' && tries < MAX_UNKNOWN_TRIES;
  }

  // The location lines of unknown cards, for the popup to list: distinct,
  // at most 20, with cards that had no location line at all named as such.
  function unknownSamples(values) {
    const named = values.map((v) => v || '(no location line)');
    return [...new Set(named)].slice(0, 20);
  }

  // True when two effectiveSettings results would judge every card the same.
  function sameFilter(a, b) {
    if (!a || !b) return false;
    return (
      a.enabled === b.enabled &&
      a.hideShipping === b.hideShipping &&
      a.hideAds === b.hideAds &&
      a.radiusMiles === b.radiusMiles &&
      a.center?.[0] === b.center?.[0] &&
      a.center?.[1] === b.center?.[1]
    );
  }

  // What the popup's city and radius fields should show: Facebook's location
  // (as last read from a Marketplace page) unless the user changed it by hand.
  function popupLocation(settings, fbLocation) {
    if (fbLocation && !settings.manualOverride) {
      return {
        city: `${fbLocation.city}, ${fbLocation.state}`,
        radius: Math.round(fbLocation.radiusMiles),
        source: 'facebook',
      };
    }
    return { city: settings.centerLabel, radius: settings.radiusMiles, source: 'manual' };
  }

  // "winston-salem" → "Winston-Salem", for showing table names to the user.
  function titleCase(name) {
    return name.replace(/(^|[\s-])([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase());
  }

  // The city table as a list the popup can search while the user types.
  function buildCityIndex(table) {
    return Object.entries(table).map(([key, coords]) => {
      const [name, state] = key.split('|');
      return { name, state, coords, label: `${titleCase(name)}, ${state}` };
    });
  }

  // Cities whose name starts with what was typed, optionally narrowed by a
  // state ("fred", "fredericksburg, v", "fredericksburg va"). Closest to
  // `near` ([lat, lon]) first, so a far-off "Fred, TX" does not outrank the
  // Fredericksburg next door; with no `near`, alphabetical.
  function suggestCities(index, query, near, limit = 6) {
    const q = clean(query);
    if (!q) return [];
    const find = (cityPart, statePart) => {
      const name = normalizeName(cityPart);
      const state = statePart.trim().toUpperCase();
      if (!name) return [];
      return index.filter((c) => c.name.startsWith(name) && c.state.startsWith(state));
    };
    let found;
    const comma = q.indexOf(',');
    if (comma >= 0) {
      found = find(q.slice(0, comma), q.slice(comma + 1));
    } else {
      found = find(q, '');
      // Nothing matched: read a short last word as the start of a state.
      const m = /^(.*\S)\s+([a-z]{1,2})$/i.exec(q);
      if (!found.length && m) found = find(m[1], m[2]);
    }
    const rank = near
      ? (c) => haversineMiles(near, c.coords)
      : () => 0;
    return found
      .map((c) => ({ c, d: rank(c) }))
      .sort(
        (a, b) =>
          a.d - b.d ||
          a.c.name.localeCompare(b.c.name) ||
          a.c.state.localeCompare(b.c.state),
      )
      .slice(0, limit)
      .map(({ c }) => c);
  }

  // Upper bound on a listing card's size in CSS pixels. Stops the content
  // script from mistaking a row, grid or page section for one card.
  function isCardSized(width, height) {
    return width <= 520 && height <= 640;
  }

  globalThis.MLFGeo = {
    buildCityIndex,
    sameFilter,
    unknownSamples,
    MAX_UNKNOWN_TRIES,
    shouldRejudge,
    suggestCities,
    isCardSized,
    FB_LOCATION_SELECTOR,
    parseFacebookLocation,
    effectiveSettings,
    popupLocation,
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
    nameVariants,
    withAliases,
    decide,
    buildStateBounds,
    milesToState,
  };
})();
