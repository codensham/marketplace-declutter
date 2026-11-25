# Hide Repeated Listings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide every Marketplace card whose listing ID is already shown in another card on the page.

**Architecture:** A pure helper in `lib/listing.js` turns a kept card into the verdict `repeat`; `content.js` keeps a per-pass map of listing ID → the cell that is showing it, and re-checks hidden repeats whose original has left the page. The popup gets a "Repeats" row like the existing ones.

**Tech Stack:** Plain JS (classic scripts), Manifest V3, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-repeats-design.md`

## Global Constraints

- No network requests.
- Never hide the only copy of a listing; the first copy in document order stays.
- Setting `hideRepeats`, default `true`; verdict string `'repeat'`; count key `repeat`.
- Popup row label "Repeats", aria-label "Hide repeated listings".

## Review Focus

- A card re-judged on a later pass (an `unknown` card's re-check) must not count itself as its own original → Task 1 test `withRepeat keeps a card whose only shown copy is itself`.
- The first copy hidden for another reason (far, ad, price, word): the second has the same text and the same verdict, so it is not counted as a repeat → covered by `withRepeat leaves other verdicts alone`.
- Facebook removing the first copy from the page: the hidden repeat must come back → Task 1 step 5, checked live in Task 2.
- Turning "Repeats" off must show the copies again without a reload → `sameFilter` change + `hides` test.
- Settings change re-judges every card in document order, so the first copy still wins → checked live in Task 2.

---

### Task 1: Repeat verdict and content wiring

**Files:**
- Modify: `lib/geo.js` (`DEFAULT_SETTINGS`, `hides`, `sameFilter`)
- Modify: `lib/listing.js` (new `withRepeat`, export)
- Modify: `content.js` (`pass`, `getCounts`)
- Test: `test/listing.test.mjs`, `test/geo.test.mjs`

**Interfaces:**
- Produces: `L.withRepeat(verdict: string, shownElsewhere: boolean, settings) -> string`; `G.DEFAULT_SETTINGS.hideRepeats = true`; `G.hides('repeat', s)` true; `getCounts` returns `repeat: number`.

- [ ] **Step 1: Write the failing tests**

```js
test('withRepeat hides a kept card already shown elsewhere', () => {
  const S = { hideRepeats: true };
  assert.equal(L.withRepeat('keep', true, S), 'repeat');
  assert.equal(L.withRepeat('unknown', true, S), 'repeat');
  assert.equal(L.withRepeat('keep', true, { hideRepeats: false }), 'keep');
});
test('withRepeat keeps a card whose only shown copy is itself', () => {
  assert.equal(L.withRepeat('keep', false, { hideRepeats: true }), 'keep');
});
test('withRepeat leaves other verdicts alone', () => {
  for (const v of ['far', 'ad', 'ship', 'price', 'word'])
    assert.equal(L.withRepeat(v, true, { hideRepeats: true }), v);
});
// geo.test.mjs
test('hides repeats', () => { assert.equal(G.hides('repeat', {}), true); });
test('sameFilter sees hideRepeats', () => {
  const a = { ...G.DEFAULT_SETTINGS };
  assert.equal(G.sameFilter(a, { ...a, hideRepeats: false }), false);
});
```

- [ ] **Step 2: Run `npm test`** — expected: the new tests fail (`withRepeat` not a function).

- [ ] **Step 3: Implement** `withRepeat` in `lib/listing.js`; add `hideRepeats: true` to `DEFAULT_SETTINGS`, `'repeat'` to `hides`, `a.hideRepeats === b.hideRepeats` to `sameFilter`.

- [ ] **Step 4: Wire `content.js` `pass()`.** Before the read loop, build `shown: Map<id, cell>` from connected cells with `data-mlf-id` and no `data-mlf-hidden`. Apply `withRepeat` last, with `shownElsewhere = shown.has(id) && shown.get(id) !== cell`. In the write loop, a cell whose verdict is not hidden is added to `shown` if its id is not already there. Process judged cells in document order (the Map's insertion order already is).

- [ ] **Step 5: Bring back orphaned repeats.** At the start of `pass()`, for each `[data-mlf="repeat"]` cell whose id has no other connected, unhidden cell, remove `data-mlf`, `data-mlf-hidden`, `data-mlf-id` and clear `data-mlf-seen` on its anchors so it is judged afresh.

- [ ] **Step 6: Add `repeat: count('repeat')` to `getCounts`.**

- [ ] **Step 7: Run `npm test`** — expected: all pass.

- [ ] **Step 8: Commit** `feat: hide repeated copies of the same listing`.

### Task 2: Popup row, docs and live check

**Files:**
- Modify: `popup.html`, `popup.js`, `README.md`, `store/listing.md`

**Interfaces:**
- Consumes: `settings.hideRepeats`, counts `c.repeat`.

- [ ] **Step 1: Popup.** Add a row after "Words": eye checkbox `#hideRepeats` (aria-label "Hide repeated listings"), text "Repeats", count `#repeatCount`. Wire render/save/count/reset like `hideAds`/`adCount`.
- [ ] **Step 2: Docs.** README "What it hides" row: `| Repeat | Facebook shows the same listing again on the page; the first copy stays (can be turned off) |`. Store listing bullet: `• Listings Facebook shows twice – the extra copy is hidden`.
- [ ] **Step 3: Run `npm test`** — all pass.
- [ ] **Step 4: Live check** in the user's Chrome with the extension loaded from this branch: scroll `/marketplace/` ~20 screens; expect `[data-mlf="repeat"]` cells, each with exactly one other unhidden cell of the same `data-mlf-id`; toggle Repeats off and see them return.
- [ ] **Step 5: Commit** `feat: Repeats row in the popup`.
