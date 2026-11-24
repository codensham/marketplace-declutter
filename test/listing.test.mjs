import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../lib/listing.js';

const L = globalThis.MLFListing;

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
  // Min above max is mid-edit, not a range to save (typing Min 200 over 0–100).
  assert.equal(L.normalizePriceRange('200', '50'), null);
  assert.equal(L.normalizePriceRange('200', '100'), null);
  assert.deepEqual(L.normalizePriceRange('-5', 'abc'), { priceMin: null, priceMax: null });
  assert.deepEqual(L.normalizePriceRange('0', ''), { priceMin: 0, priceMax: null });
});

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
