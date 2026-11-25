// Pure listing logic: card prices and the listings the user has opened.
// Classic script (no import/export) so the same file loads in the content
// script, the popup, and Node.
(() => {
  // Facebook pads some labels with zero-width characters.
  const clean = (text) => String(text ?? '').replace(/[​-‍⁠﻿]/g, '').trim();

  // Whole US dollars from a card's price line: "$1,200" -> 1200, "Free" -> 0.
  // Anything else (another currency, a title) is null. A line holding two
  // prices, as when Facebook shows a crossed-out original, reads as the first.
  function parsePrice(text) {
    const t = clean(text);
    if (/^free$/i.test(t)) return 0;
    const m = /^\$(\d[\d,]*)/.exec(t);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  }

  // The price sits in the first lines of a card, after an optional
  // "Just listed"; the first readable one is the current price.
  function cardPrice(lines) {
    for (const line of lines.slice(0, 3)) {
      const price = parsePrice(line);
      if (price !== null) return price;
    }
    return null;
  }

  // A card the location checks keep becomes "price" when its price is
  // outside the range. Ads, shipping-only and far cards keep their verdict,
  // and an unreadable price never hides a card.
  function withPrice(verdict, price, settings) {
    if (verdict !== 'keep' && verdict !== 'unknown') return verdict;
    if (price === null) return verdict;
    const { priceMin, priceMax } = settings;
    if (priceMin != null && price < priceMin) return 'price';
    if (priceMax != null && price > priceMax) return 'price';
    return verdict;
  }

  // The popup's two fields as settings: blank or invalid is no limit. A
  // minimum above the maximum is null: the user is part-way through editing
  // (typing Min 200 over a 0–100 range), so nothing is saved yet.
  function normalizePriceRange(minText, maxText) {
    const read = (text) => {
      const t = String(text ?? '').trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const priceMin = read(minText);
    const priceMax = read(maxText);
    if (priceMin !== null && priceMax !== null && priceMin > priceMax) return null;
    return { priceMin, priceMax };
  }

  // The popup's comma-separated words as a list: trimmed, blanks dropped,
  // and repeats (in any case) kept once.
  function parseWords(text) {
    const words = [];
    for (const part of String(text ?? '').split(',')) {
      const w = clean(part).replace(/\s+/g, ' ');
      if (w && !words.some((x) => x.toLowerCase() === w.toLowerCase())) words.push(w);
    }
    return words;
  }

  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // The first word found in the text as a whole word, any case: "ISO" is in
  // "ISO: couch" but not in "isolated"; "wanted" is not in "unwanted".
  function blockedWord(text, words) {
    for (const word of words ?? []) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'iu');
      if (re.test(text)) return word;
    }
    return null;
  }

  // A card the other checks keep becomes "word" when its text, apart from
  // the location line, has a blocked word.
  function withWords(verdict, lines, locationLine, settings) {
    if (verdict !== 'keep' && verdict !== 'unknown') return verdict;
    if (!settings.hideWords || !settings.blockWords?.length) return verdict;
    const text = lines.filter((line) => line !== locationLine).join('\n');
    return blockedWord(text, settings.blockWords) ? 'word' : verdict;
  }

  // How many opened listings are remembered; past this the oldest go.
  const MAX_VIEWED = 20000;

  // The listing open in the page, from a full listing page or the overlay
  // Facebook opens over the feed (both put the item in the URL).
  function viewedIdFromPath(pathname) {
    return /^\/marketplace\/item\/(\d+)/.exec(pathname ?? '')?.[1] ?? null;
  }

  // Whole days since the epoch: the date a listing was last opened.
  function today(now = Date.now()) {
    return Math.floor(now / 86400000);
  }

  // A copy of `viewed` ({ id: day }) with `id` opened on `day`, trimmed to
  // `max` entries by dropping the least recently opened. `id` always stays.
  function recordViewed(viewed, id, day, max = MAX_VIEWED) {
    const next = { ...viewed, [id]: day };
    const ids = Object.keys(next);
    if (ids.length <= max) return next;
    const oldest = ids
      .filter((k) => k !== id)
      .sort((a, b) => next[a] - next[b])
      .slice(0, ids.length - max);
    for (const k of oldest) delete next[k];
    return next;
  }

  globalThis.MLFListing = {
    MAX_VIEWED,
    viewedIdFromPath,
    today,
    recordViewed,
    parsePrice,
    cardPrice,
    withPrice,
    normalizePriceRange,
    parseWords,
    blockedWord,
    withWords,
  };
})();
