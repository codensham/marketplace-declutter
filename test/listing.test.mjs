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

test('parseWords splits, trims and drops blanks and repeats', () => {
  assert.deepEqual(L.parseWords(' wanted, ISO ,, iso,parts  only '), ['wanted', 'ISO', 'parts only']);
  assert.deepEqual(L.parseWords(''), []);
});

test('blockedWord matches whole words in any case', () => {
  const words = ['wanted', 'ISO'];
  assert.equal(L.blockedWord('ISO: kids bike', words), 'ISO');
  assert.equal(L.blockedWord('Wanted - Couch', words), 'wanted');
  assert.equal(L.blockedWord('(iso) dresser', words), 'ISO');
  assert.equal(L.blockedWord('Isolated cabin print', words), null);
  assert.equal(L.blockedWord('Unwanted gift, new', words), null);
  assert.equal(L.blockedWord('Car parts only', ['parts only']), 'parts only');
  assert.equal(L.blockedWord('C++ book', ['c++']), 'c++');
});

test('withWords hides kept cards with a blocked word, but not by their city', () => {
  const S = { hideWords: true, blockWords: ['wanted', 'ISO'] };
  const card = ['$0', 'ISO twin bed frame', 'Austin, TX'];
  assert.equal(L.withWords('keep', card, 'Austin, TX', S), 'word');
  assert.equal(L.withWords('unknown', card, 'Austin, TX', S), 'word');
  assert.equal(L.withWords('far', card, 'Austin, TX', S), 'far');
  assert.equal(L.withWords('keep', card, 'Austin, TX', { ...S, hideWords: false }), 'keep');
  assert.equal(L.withWords('keep', card, 'Austin, TX', { ...S, blockWords: [] }), 'keep');
  assert.equal(L.withWords('keep', ['$5', 'Lamp', 'Wanted, TX'], 'Wanted, TX', S), 'keep');
});

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
  for (const v of ['far', 'ad', 'ship', 'price', 'word']) assert.equal(L.withRepeat(v, true, { hideRepeats: true }), v);
});
