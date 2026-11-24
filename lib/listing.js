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

  // The popup's two fields as settings: blank or invalid is no limit, and a
  // minimum above the maximum is swapped.
  function normalizePriceRange(minText, maxText) {
    const read = (text) => {
      const t = String(text ?? '').trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    let priceMin = read(minText);
    let priceMax = read(maxText);
    if (priceMin !== null && priceMax !== null && priceMin > priceMax) [priceMin, priceMax] = [priceMax, priceMin];
    return { priceMin, priceMax };
  }

  globalThis.MLFListing = {
    parsePrice,
    cardPrice,
    withPrice,
    normalizePriceRange,
  };
})();
