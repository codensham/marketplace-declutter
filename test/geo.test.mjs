import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../lib/geo.js';

const G = globalThis.MLFGeo;

const table = {
  'austin|TX': [30.267, -97.743],
  'round rock|TX': [30.508, -97.679],
  'dallas|TX': [32.777, -96.797],
  'saint louis|MO': [38.627, -90.198],
};
const S = { ...G.DEFAULT_SETTINGS, center: [30.267, -97.743], radiusMiles: 40 };

test('normalizeName expands abbreviations', () => {
  assert.equal(G.normalizeName('St. Louis'), 'saint louis');
  assert.equal(G.normalizeName('  Ft.  Worth '), 'fort worth');
  assert.equal(G.normalizeName('Mt Pleasant'), 'mount pleasant');
  assert.equal(G.normalizeName('Stanton'), 'stanton');
});

test('parseLocationLine', () => {
  assert.deepEqual(G.parseLocationLine('Round Rock, TX'), { city: 'Round Rock', state: 'TX' });
  assert.deepEqual(G.parseLocationLine('austin, tx'), { city: 'austin', state: 'TX' });
  assert.equal(G.parseLocationLine('Miami'), null);
  assert.equal(G.parseLocationLine('$1,200'), null);
  assert.equal(G.parseLocationLine(''), null);
});

test('extractLocationLine picks the location or shipping line', () => {
  assert.equal(G.extractLocationLine(['$50', 'Oak desk', 'Austin, TX']), 'Austin, TX');
  assert.equal(G.extractLocationLine(['$50', 'Oak desk', 'Ships to you']), 'Ships to you');
  assert.equal(G.extractLocationLine(['$50', 'Oak desk']), null);
});

test('haversineMiles Austin–Dallas is about 182 miles', () => {
  const d = G.haversineMiles(table['austin|TX'], table['dallas|TX']);
  assert.ok(d > 177 && d < 187, `got ${d}`);
});

test('lookup uses normalised keys', () => {
  assert.deepEqual(G.lookup(table, 'St. Louis', 'mo'), [38.627, -90.198]);
  assert.equal(G.lookup(table, 'Nowhere', 'TX'), null);
});

test('decide', () => {
  assert.equal(G.decide('Round Rock, TX', S, table), 'keep');
  assert.equal(G.decide('Dallas, TX', S, table), 'far');
  assert.equal(G.decide('Ships to you', S, table), 'ship');
  assert.equal(G.decide('Ships to you', { ...S, hideShipping: false }, table), 'keep');
  assert.equal(G.decide('Toronto, ON', S, table), 'unknown');
  assert.equal(G.decide('Nowhere, TX', S, table), 'unknown');
  assert.equal(G.decide(null, S, table), 'unknown');
  assert.equal(G.decide('Dallas, TX', { ...S, center: null }, table), 'keep');
  assert.equal(G.decide('Ships to you', { ...S, center: null }, table), 'ship');
});

// Facebook prefixes the ad label with a zero-width space.
const AD = '​Ad from seller';

test('ad label is recognised despite the zero-width space', () => {
  assert.equal(G.isAdMarker(AD), true);
  assert.equal(G.isAdMarker('Ad from seller'), true);
  assert.equal(G.isAdMarker('Richmond, VA'), false);
  assert.equal(G.extractLocationLine(['$3,000', 'Walnut desk', AD]), AD);
});

test('decide hides seller ads unless hideAds is off', () => {
  assert.equal(G.DEFAULT_SETTINGS.hideAds, true);
  assert.equal(G.decide(AD, S, table), 'ad');
  assert.equal(G.decide(AD, { ...S, hideAds: false }, table), 'keep');
  assert.equal(G.decide(AD, { ...S, center: null }, table), 'ad');
});

test('card lines are trimmed of invisible characters', () => {
  assert.deepEqual(G.cardLines('Just listed\n$4,000\n\n ​ \nKents Store, VA\n'), [
    'Just listed',
    '$4,000',
    'Kents Store, VA',
  ]);
});

test('isCardSized rejects containers bigger than a listing card', () => {
  assert.equal(G.isCardSized(269, 348), true); // desktop grid cell
  assert.equal(G.isCardSized(253, 79), true); // text half of a seller ad
  assert.equal(G.isCardSized(1100, 348), false); // a whole grid row
  assert.equal(G.isCardSized(269, 2400), false); // a single-column feed
});

test("parseFacebookLocation reads Marketplace's own location filter", () => {
  assert.deepEqual(G.parseFacebookLocation('Location: Springfield, Illinois, Within 40 mi'), {
    city: 'Springfield',
    state: 'IL',
    radiusMiles: 40,
  });
  assert.deepEqual(G.parseFacebookLocation('Location: Winston-Salem, North Carolina, Within 5 miles'), {
    city: 'Winston-Salem',
    state: 'NC',
    radiusMiles: 5,
  });
  assert.equal(G.parseFacebookLocation('Location: Washington, District of Columbia, Within 100 mi').state, 'DC');
  const km = G.parseFacebookLocation('Location: Austin, Texas, Within 100 km');
  assert.ok(Math.abs(km.radiusMiles - 62.14) < 0.01, `got ${km.radiusMiles}`);
});

test('parseFacebookLocation returns null for anything it cannot read', () => {
  assert.equal(G.parseFacebookLocation('Location: Toronto, Ontario, Within 40 mi'), null);
  assert.equal(G.parseFacebookLocation('Location: Springfield, Illinois'), null);
  assert.equal(G.parseFacebookLocation('Location'), null);
  assert.equal(G.parseFacebookLocation(null), null);
});

test("effectiveSettings prefers Facebook's location over the popup's", () => {
  const fb = { city: 'Round Rock', state: 'TX', radiusMiles: 10 };
  assert.deepEqual(G.effectiveSettings(S, fb, table), {
    ...S,
    center: [30.508, -97.679],
    radiusMiles: 10,
    centerLabel: 'Round Rock, TX',
    source: 'facebook',
  });
});

test('effectiveSettings falls back to the popup settings', () => {
  assert.deepEqual(G.effectiveSettings(S, null, table), { ...S, source: 'manual' });
  const unknown = { city: 'Nowhere', state: 'TX', radiusMiles: 10 };
  assert.deepEqual(G.effectiveSettings(S, unknown, table), { ...S, source: 'manual' });
});

const FB = { city: 'Springfield', state: 'IL', radiusMiles: 40 };

test("popupLocation defaults to Facebook's location", () => {
  assert.deepEqual(G.popupLocation({ ...S, centerLabel: 'Austin, TX' }, FB), {
    city: 'Springfield, IL',
    radius: 40,
    source: 'facebook',
  });
  assert.equal(G.popupLocation(S, { ...FB, radiusMiles: 62.1371 }).radius, 62);
});

test('popupLocation shows the saved location once it was changed by hand', () => {
  const saved = { ...S, centerLabel: 'Austin, TX', radiusMiles: 25, manualOverride: true };
  assert.deepEqual(G.popupLocation(saved, FB), { city: 'Austin, TX', radius: 25, source: 'manual' });
});

test("popupLocation shows the saved location when Facebook's is not known", () => {
  const saved = { ...S, centerLabel: 'Austin, TX', radiusMiles: 25 };
  assert.deepEqual(G.popupLocation(saved, null), { city: 'Austin, TX', radius: 25, source: 'manual' });
});

test('effectiveSettings: a location changed by hand overrides Facebook', () => {
  const fb = { city: 'Round Rock', state: 'TX', radiusMiles: 10 };
  const manual = { ...S, manualOverride: true };
  assert.deepEqual(G.effectiveSettings(manual, fb, table), { ...manual, source: 'manual' });
  // An override with no usable city cannot filter, so Facebook still applies.
  assert.equal(G.effectiveSettings({ ...manual, center: null }, fb, table).source, 'facebook');
});

test('manualOverride is off by default', () => {
  assert.equal(G.DEFAULT_SETTINGS.manualOverride, false);
});

const cityTable = {
  'fredericksburg|VA': [38.303, -77.461],
  'fredericksburg|TX': [30.275, -98.872],
  'frederick|MD': [39.414, -77.411],
  'fredonia|NY': [42.44, -79.332],
  'saint louis|MO': [38.627, -90.198],
  'winston-salem|NC': [36.1, -80.244],
};
const cityIndex = G.buildCityIndex(cityTable);
const richmond = [37.541, -77.436];
const labels = (q, near, limit) => G.suggestCities(cityIndex, q, near, limit).map((c) => c.label);

test('buildCityIndex makes display labels', () => {
  const all = cityIndex.map((c) => c.label);
  assert.ok(all.includes('Fredericksburg, VA'));
  assert.ok(all.includes('Saint Louis, MO'));
  assert.ok(all.includes('Winston-Salem, NC'));
});
test('suggestCities matches the start of the city name, nearest first', () => {
  assert.deepEqual(labels('fred', richmond), [
    'Fredericksburg, VA',
    'Frederick, MD',
    'Fredonia, NY',
    'Fredericksburg, TX',
  ]);
  assert.deepEqual(labels('FRED', [30.267, -97.743])[0], 'Fredericksburg, TX');
});
test('suggestCities ranks a nearby longer name above a far exact one', () => {
  const index = G.buildCityIndex({ ...cityTable, 'fred|TX': [30.575, -94.176] });
  const got = G.suggestCities(index, 'fred', richmond).map((c) => c.label);
  assert.equal(got[0], 'Fredericksburg, VA');
  assert.equal(got.at(-1), 'Fredericksburg, TX');
});
test('suggestCities sorts by name when there is no centre', () => {
  assert.deepEqual(labels('fred', null), [
    'Frederick, MD',
    'Fredericksburg, TX',
    'Fredericksburg, VA',
    'Fredonia, NY',
  ]);
});
test('suggestCities narrows by a typed state', () => {
  assert.deepEqual(labels('fredericksburg, t', richmond), ['Fredericksburg, TX']);
  assert.deepEqual(labels('fredericksburg va', null), ['Fredericksburg, VA']);
  assert.deepEqual(labels('Fredericksburg, VA', null), ['Fredericksburg, VA']);
});
test('suggestCities understands abbreviations, limits, and empty input', () => {
  assert.deepEqual(labels('st. lou', null), ['Saint Louis, MO']);
  assert.equal(labels('fred', richmond, 2).length, 2);
  assert.deepEqual(labels('', richmond), []);
  assert.deepEqual(labels('   ', richmond), []);
  assert.deepEqual(labels('zzz', richmond), []);
});

test('sameFilter compares what decides a card', () => {
  const a = { ...G.DEFAULT_SETTINGS, center: [37.5, -77.6], radiusMiles: 40, source: 'manual' };
  assert.equal(G.sameFilter(a, { ...a, source: 'facebook', centerLabel: 'x' }), true);
  assert.equal(G.sameFilter(a, { ...a, radiusMiles: 20 }), false);
  assert.equal(G.sameFilter(a, { ...a, center: [30, -97] }), false);
  assert.equal(G.sameFilter(a, { ...a, center: null }), false);
  assert.equal(G.sameFilter(a, { ...a, hideAds: false }), false);
  assert.equal(G.sameFilter(null, a), false);
});
