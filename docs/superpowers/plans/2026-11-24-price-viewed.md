# Price Filter and Viewed Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide Marketplace listings outside a price range set in the popup, and put a "Viewed" badge on the photo of listings the user has opened before.

**Architecture:** Pure logic goes in a new classic script, `lib/listing.js`
(`globalThis.MLFListing`), which follows the `lib/geo.js` pattern so the
same file loads in the page, the popup and Node tests. `content.js` does all
the DOM work. It adds a `price` verdict next to the existing ones, records
viewed IDs from the URL, and keeps badges in sync on every pass. The popup
gets two price fields and a count.

**Tech Stack:** Chrome MV3 content script, plain JS, `chrome.storage`, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-24-price-viewed-design.md`

## Global Constraints

- No network requests. Viewed data lives in `chrome.storage.local` under key `viewed`, as `{ [id]: day }`.
- `priceMin` and `priceMax` live in the sync `settings` object. `null` means no limit.
- A card whose price can't be read is never hidden by price.
- Precedence: `ad` / `ship` first, then `far`, then `price`.
- Viewed means the user opened `/marketplace/item/<id>` (full page or overlay).
- At most 20,000 viewed entries; the oldest are pruned first.
- The badge uses the current teal theme (`#0f6e56`); the rebrand recolours it later.
- No new manifest permissions and no background worker.
- Every new file the extension loads must be in `scripts/package.mjs` `FILES`.

## Review Focus

1. Price text `$1,200`, `$0`, `Free`: parsed as 1200, 0, 0 (Task 1 test `parsePrice formats`).
2. Two prices on one card (`$80$100`, or `$80` and `$100` on separate lines): the first is used (Task 1 test `cardPrice uses the current price`).
3. Non-dollar or missing price (`CA$50`, `€50`, no price line): `null`, so the card stays visible (Task 1 tests `parsePrice rejects other currencies` and `withPrice keeps unknown prices`).
4. The user types min greater than max, a blank field, or a negative number: swapped, `null`, `null` (Task 1 test `normalizePriceRange`).
5. More than 20,000 viewed listings: the oldest are dropped and the one just opened is kept (Task 2 test `recordViewed prunes oldest`).

---

### Task 1: Price parsing and the price verdict

**Files:**
- Create: `lib/listing.js`
- Test: `test/listing.test.mjs`

**Interfaces:**
- Produces, on `globalThis.MLFListing`:
  - `parsePrice(text: string) -> number | null`
  - `cardPrice(lines: string[]) -> number | null`: checks the first 3 lines and returns the first that `parsePrice` reads.
  - `withPrice(verdict: string, price: number | null, settings: {priceMin, priceMax}) -> string`: returns `'price'` only when `verdict` is `'keep'` or `'unknown'` and the price is outside the range; otherwise returns `verdict` unchanged.
  - `normalizePriceRange(minText: string, maxText: string) -> { priceMin: number | null, priceMax: number | null }`

- [ ] **Step 1: Write the failing tests** in `test/listing.test.mjs` (import `'../lib/listing.js'`; `const L = globalThis.MLFListing`):

```js
test('parsePrice formats', () => {
  assert.equal(L.parsePrice('$1,200'), 1200);
  assert.equal(L.parsePrice('$45'), 45);
  assert.equal(L.parsePrice('$0'), 0);
  assert.equal(L.parsePrice('Free'), 0);
  assert.equal(L.parsePrice('​$300'), 300);
});
test('parsePrice rejects other currencies and text', () => {
  for (const t of ['CA$50', '€50', '£20', 'Oak desk', 'Austin, TX', '', 'Just listed'])
    assert.equal(L.parsePrice(t), null, t);
});
test('cardPrice uses the current price', () => {
  assert.equal(L.cardPrice(['$80$100', 'Chair', 'Austin, TX']), 80);
  assert.equal(L.cardPrice(['Just listed', '$80', '$100', 'Chair']), 80);
  assert.equal(L.cardPrice(['Chair', 'Austin, TX']), null);
});
test('withPrice', () => {
  const s = { priceMin: 50, priceMax: 200 };
  assert.equal(L.withPrice('keep', 20, s), 'price');
  assert.equal(L.withPrice('keep', 250, s), 'price');
  assert.equal(L.withPrice('keep', 50, s), 'keep');
  assert.equal(L.withPrice('keep', 200, s), 'keep');
  assert.equal(L.withPrice('unknown', 20, s), 'price');
  assert.equal(L.withPrice('ad', 20, s), 'ad');
  assert.equal(L.withPrice('ship', 20, s), 'ship');
  assert.equal(L.withPrice('far', 20, s), 'far');
  assert.equal(L.withPrice('keep', 20, { priceMin: null, priceMax: null }), 'keep');
  assert.equal(L.withPrice('keep', 0, { priceMin: 1, priceMax: null }), 'price');
});
test('withPrice keeps unknown prices', () => {
  assert.equal(L.withPrice('keep', null, { priceMin: 50, priceMax: 200 }), 'keep');
});
test('normalizePriceRange', () => {
  assert.deepEqual(L.normalizePriceRange('', ''), { priceMin: null, priceMax: null });
  assert.deepEqual(L.normalizePriceRange('50', '200'), { priceMin: 50, priceMax: 200 });
  assert.deepEqual(L.normalizePriceRange('200', '50'), { priceMin: 50, priceMax: 200 });
  assert.deepEqual(L.normalizePriceRange('-5', 'abc'), { priceMin: null, priceMax: null });
  assert.deepEqual(L.normalizePriceRange('0', ''), { priceMin: 0, priceMax: null });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `node --test test/listing.test.mjs`. Expected: FAIL, because `lib/listing.js` doesn't exist yet.

- [ ] **Step 3: Implement `lib/listing.js`** as a classic IIFE script that assigns `globalThis.MLFListing`, like `lib/geo.js`. Strip zero-width characters the same way `geo.js` `clean` does. `parsePrice` matches `^\$([\d,]+)` (whole dollars; drop any cents) or exact `free`, case-insensitive. `$80$100` matches its leading `$80`.

- [ ] **Step 4: Run it and confirm it passes.** Run `node --test test/listing.test.mjs`. Expected: all tests PASS.

- [ ] **Step 5: Commit.** `git add lib/listing.js test/listing.test.mjs` then `git commit -m "feat: parse card prices and add the price verdict"`

### Task 2: Viewed helpers

**Files:**
- Modify: `lib/listing.js`
- Test: `test/listing.test.mjs`

**Interfaces:**
- Produces, on `MLFListing`:
  - `MAX_VIEWED = 20000`
  - `viewedIdFromPath(pathname: string) -> string | null`
  - `recordViewed(viewed: {[id]: number}, id: string, day: number, max = MAX_VIEWED) -> {[id]: number}`: returns a new object. If there are more than `max` entries, it drops the lowest `day` values and always keeps `id`.
  - `today(now = Date.now()) -> number`: whole days since the epoch, `Math.floor(now / 86400000)`.

- [ ] **Step 1: Write the failing tests:**

```js
test('viewedIdFromPath', () => {
  assert.equal(L.viewedIdFromPath('/marketplace/item/123456/'), '123456');
  assert.equal(L.viewedIdFromPath('/marketplace/item/123456'), '123456');
  assert.equal(L.viewedIdFromPath('/marketplace/austin/'), null);
  assert.equal(L.viewedIdFromPath('/groups/1/'), null);
});
test('recordViewed adds without mutating', () => {
  const before = { a: 1 };
  const after = L.recordViewed(before, 'b', 5);
  assert.deepEqual(after, { a: 1, b: 5 });
  assert.deepEqual(before, { a: 1 });
});
test('recordViewed prunes oldest', () => {
  const v = L.recordViewed({ a: 1, b: 2, c: 3 }, 'd', 4, 3);
  assert.deepEqual(Object.keys(v).sort(), ['b', 'c', 'd']);
  const w = L.recordViewed({ a: 9, b: 9, c: 9 }, 'd', 1, 3);
  assert.ok('d' in w);
  assert.equal(Object.keys(w).length, 3);
});
test('today', () => {
  assert.equal(L.today(86400000 * 3 + 5), 3);
});
```

- [ ] **Step 2: Run them and confirm they fail.** Run `node --test test/listing.test.mjs`. Expected: the 4 new tests FAIL.
- [ ] **Step 3: Implement the four exports in `lib/listing.js`.** The ID regex is `/^\/marketplace\/item\/(\d+)/`.
- [ ] **Step 4: Run them and confirm they pass.** Run `node --test test/listing.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat: track viewed listings"`. Both files are already tracked.

### Task 3: Settings, hiding rule, and packaging

**Files:**
- Modify: `lib/geo.js`: `DEFAULT_SETTINGS`, `hides`, `sameFilter`
- Modify: `manifest.json`: `content_scripts[0].js` becomes `["lib/geo.js", "lib/listing.js", "content.js"]`
- Modify: `scripts/package.mjs`: add `'lib/listing.js'` to `FILES` and to the `referencedFiles` seed set, because the popup loads it
- Test: `test/geo.test.mjs`, `test/package.test.mjs` (the existing manifest test covers packaging)

**Interfaces:**
- Produces: `DEFAULT_SETTINGS.priceMin = null`, `DEFAULT_SETTINGS.priceMax = null`. `hides('price', s)` returns `true`. `sameFilter` also compares `priceMin` and `priceMax`.

- [ ] **Step 1: Write the failing tests** in `test/geo.test.mjs`:

```js
test('price settings default to no limit and price verdict hides', () => {
  assert.equal(G.DEFAULT_SETTINGS.priceMin, null);
  assert.equal(G.DEFAULT_SETTINGS.priceMax, null);
  assert.equal(G.hides('price', G.DEFAULT_SETTINGS), true);
});
test('sameFilter notices a price change', () => {
  const a = { ...S };
  assert.equal(G.sameFilter(a, { ...a }), true);
  assert.equal(G.sameFilter(a, { ...a, priceMax: 100 }), false);
});
```

- [ ] **Step 2: Run them and confirm they fail.** Run `node --test test/geo.test.mjs`. Expected: the 2 new tests FAIL.
- [ ] **Step 3: Make the `lib/geo.js` changes** listed above. Then update the manifest and `scripts/package.mjs`.
- [ ] **Step 4: Run the full suite.** Run `npm test`. Expected: all tests PASS, including `package.test.mjs` "everything the manifest loads is packaged".
- [ ] **Step 5: Commit.** `git commit -am "feat: price range settings and price verdict hiding"`

### Task 4: Apply the price verdict in the content script

**Files:**
- Modify: `content.js`, the judging loop in `pass()` and the `getCounts` handler

**Interfaces:**
- Consumes: `MLFListing.cardPrice`, `MLFListing.withPrice` (Task 1). Settings changes come from Task 3.
- Produces: the `getCounts` response gains `price: number`, the count of `[data-mlf="price"]`.

- [ ] **Step 1: Wire in the price verdict.** Add `const L = globalThis.MLFListing;`. In the judging loop, replace the `verdict` line with `const verdict = L.withPrice(G.decide(loc, active, table, stateBounds), L.cardPrice(lines), active);`. Add `price: count('price')` to the `getCounts` response.
- [ ] **Step 2: Run the tests.** Run `npm test`. Expected: PASS. There are no unit tests for `content.js`; the logic is covered in Tasks 1 and 3.
- [ ] **Step 3: Check it in the browser.** Reload the unpacked extension. Open Marketplace. Open the popup, right-click it, choose Inspect, and in that console run `chrome.storage.sync.get('settings', ({settings}) => chrome.storage.sync.set({settings: {...settings, priceMax: 50}}))`. Expected: cards over $50 disappear and "Free" cards stay. Then set `priceMax: null`. Expected: the cards return.
- [ ] **Step 4: Commit.** `git commit -am "feat: hide listings outside the price range"`

### Task 5: Record views and show the Viewed badge

**Files:**
- Modify: `content.js`

**Interfaces:**
- Consumes: `MLFListing.viewedIdFromPath`, `recordViewed`, `today` (Task 2).
- Produces: DOM markers `data-mlf-badge` (the badge element) and `data-mlf-badge-host` (its positioned parent). Both are removed by `reset()`.

- [ ] **Step 1: Load viewed history at start.** Add `'viewed'` to the initial `chrome.storage.local.get`, and keep it in `let viewed = {}`. Listen for `chrome.storage.onChanged` with `area === 'local' && changes.viewed`, so another tab's views apply: update `viewed`, then `schedule()`.
- [ ] **Step 2: Record views.** At the top of `pass()`, after the `ready` / `enabled` / `onMarketplace()` guard: `const openId = L.viewedIdFromPath(location.pathname)`. If it's set and `viewed[openId] !== L.today()`, set `viewed = L.recordViewed(viewed, openId, L.today())` and call `saveViewedSoon()`. That function debounces (1000 ms) `chrome.storage.local.set({ viewed }).catch(() => {})`.
- [ ] **Step 3: Sync badges.** Add `syncBadges()` and call it at the end of every `pass()`. For each `[data-mlf-id]` cell that isn't hidden: if `viewed[id]` exists and the cell has no `[data-mlf-badge]`, find `cell.querySelector('img')?.parentElement`, set `data-mlf-badge-host` on it, and append `<div data-mlf-badge>` with an eye SVG and the text `Viewed`. If the badge is present but the ID isn't viewed, which happens when Facebook reuses a cell, remove it. Add to the injected style: `[data-mlf-badge-host]{position:relative}` and `[data-mlf-badge]{position:absolute;top:6px;left:6px;display:flex;gap:4px;align-items:center;padding:2px 7px;border-radius:10px;background:#0f6e56;color:#fff;font:600 11px/16px system-ui,sans-serif;pointer-events:none;z-index:1}`. The badge's own DOM insert re-triggers the observer, and `syncBadges` changes nothing on that second pass, so it doesn't loop.
- [ ] **Step 4: Clean up in `reset()`.** Remove all `[data-mlf-badge]` elements and the `data-mlf-badge-host` attributes.
- [ ] **Step 5: Run the tests.** Run `npm test`. Expected: PASS.
- [ ] **Step 6: Check it in the browser.** Reload the extension, open a listing from the feed (overlay), then close it. Expected: within a second, that card shows "Viewed" on its photo. Refresh the page. Expected: the badge is still there. Open the same feed in a second tab. Expected: the badge shows there too.
- [ ] **Step 7: Commit.** `git commit -am "feat: Viewed badge on listings you've opened"`

### Task 6: Popup price fields, count, and README

**Files:**
- Modify: `popup.html`: a price row after the grace help `<p>` and before the second `<hr />`. Load `<script src="lib/listing.js"></script>` before `popup.js`.
- Modify: `popup.js`
- Modify: `README.md`: add to the "What it hides" table and a short "Viewed" note under "Using it"

**Interfaces:**
- Consumes: `MLFListing.normalizePriceRange` (Task 1) and `getCounts().price` (Task 4).

- [ ] **Step 1: Add the price fields.** Markup: `<div class="price"><label for="priceMin">Price</label><input type="number" id="priceMin" min="0" step="1" placeholder="Min" inputmode="numeric" /> <span>to</span> <input type="number" id="priceMax" min="0" step="1" placeholder="Max" inputmode="numeric" /></div>`. Style it as a flex row with 6px gaps. Inputs are 70px wide and use the existing `--line` border and 6px radius.
- [ ] **Step 2: Wire the fields.** In `popup.js`, `render()` fills both inputs from settings (`null` shows as `''`). On `change` of either input, call `save(L.normalizePriceRange(priceMin.value, priceMax.value))`. Because `render()` runs after `save`, a swapped or cleared value shows corrected.
- [ ] **Step 3: Show the count.** Change the counts line to `, ${c.ship} shipping, ${c.ad} ads, ${c.price ?? 0} outside price range · `.
- [ ] **Step 4: Update the README.** Add a row: `| Out of price range | Its price is below your minimum or above your maximum (blank = no limit; unreadable prices are kept) |`. Add one sentence: listings you've opened show a "Viewed" badge, stored only in this browser.
- [ ] **Step 5: Run the tests.** Run `npm test`. Expected: PASS.
- [ ] **Step 6: Check it in the browser.** Open the popup on Marketplace and type Min 200, Max 50. Expected: the fields show 50 and 200, the feed filters, and the counts show "N outside price range". Clear both fields. Expected: the cards return.
- [ ] **Step 7: Commit.** `git add popup.html popup.js README.md` then `git commit -m "feat: price range in the popup"`
