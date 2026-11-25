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

test("effectiveSettings uses Facebook's location", () => {
  const fb = { city: 'Round Rock', state: 'TX', radiusMiles: 10 };
  assert.deepEqual(G.effectiveSettings(S, fb, table), {
    ...S,
    center: [30.508, -97.679],
    radiusMiles: 10,
    centerLabel: 'Round Rock, TX',
    source: 'facebook',
  });
});

test("effectiveSettings has no centre until Facebook's location is known", () => {
  const none = { ...S, center: null, radiusMiles: null, centerLabel: '', source: 'none' };
  assert.deepEqual(G.effectiveSettings(S, null, table), none);
  const unknown = { city: 'Nowhere', state: 'TX', radiusMiles: 10 };
  assert.deepEqual(G.effectiveSettings(S, unknown, table), none);
});

test('effectiveSettings ignores a city saved by an older version', () => {
  const old = { ...S, manualOverride: true, centerLabel: 'Austin, TX' };
  assert.equal(G.effectiveSettings(old, null, table).center, null);
  const fb = { city: 'Round Rock', state: 'TX', radiusMiles: 10 };
  assert.equal(G.effectiveSettings(old, fb, table).source, 'facebook');
});

test('grace is on by default and adds GRACE_MILES to the radius', () => {
  assert.equal(G.DEFAULT_SETTINGS.grace, true);
  assert.equal(G.GRACE_MILES, 15);
  assert.equal(G.limitMiles({ radiusMiles: 40, grace: true }), 55);
  assert.equal(G.limitMiles({ radiusMiles: 40, grace: false }), 40);
});

test('decide keeps a city inside the grace margin and hides one past it', () => {
  // Round Rock is ~17 mi from Austin.
  const near = { ...S, radiusMiles: 10 };
  assert.equal(G.decide('Round Rock, TX', { ...near, grace: true }, table), 'keep');
  assert.equal(G.decide('Round Rock, TX', { ...near, grace: false }, table), 'far');
  // Dallas is ~180 mi away: hidden either way.
  assert.equal(G.decide('Dallas, TX', { ...near, grace: true }, table), 'far');
});

test('sameFilter compares what decides a card', () => {
  const a = { ...G.DEFAULT_SETTINGS, center: [37.5, -77.6], radiusMiles: 40, source: 'manual' };
  assert.equal(G.sameFilter(a, { ...a, source: 'facebook', centerLabel: 'x' }), true);
  assert.equal(G.sameFilter(a, { ...a, radiusMiles: 20 }), false);
  assert.equal(G.sameFilter(a, { ...a, center: [30, -97] }), false);
  assert.equal(G.sameFilter(a, { ...a, center: null }), false);
  assert.equal(G.sameFilter(a, { ...a, hideAds: false }), false);
  assert.equal(G.sameFilter(a, { ...a, grace: !a.grace }), false);
  assert.equal(G.sameFilter(null, a), false);
});

test('unknownSamples: distinct, capped at 20, empty named', () => {
  assert.deepEqual(G.unknownSamples(['Hollywood, CA', '', 'Hollywood, CA']), [
    'Hollywood, CA',
    '(no location line)',
  ]);
  const many = Array.from({ length: 30 }, (_, i) => `Town${i}, ZZ`);
  assert.equal(G.unknownSamples(many).length, 20);
  assert.deepEqual(G.unknownSamples([]), []);
});

test('shouldRejudge: new cards and unknown cards up to 3 tries', () => {
  assert.equal(G.MAX_UNKNOWN_TRIES, 3);
  assert.equal(G.shouldRejudge(null, 0), true);
  assert.equal(G.shouldRejudge('unknown', 1), true);
  assert.equal(G.shouldRejudge('unknown', 2), true);
  assert.equal(G.shouldRejudge('unknown', 3), false);
  for (const v of ['keep', 'far', 'ship', 'ad']) assert.equal(G.shouldRejudge(v, 0), false);
});

test('nameVariants', () => {
  assert.ok(G.nameVariants('N Chesterfield').includes('north chesterfield'));
  assert.ok(G.nameVariants('Pt Pleasant').includes('point pleasant'));
  assert.ok(G.nameVariants('The Bronx').includes('bronx'));
  assert.ok(G.nameVariants('Winston Salem').includes('winston-salem'));
  assert.ok(G.nameVariants('Port St. Lucie').includes('port saint lucie'));
  assert.ok(G.nameVariants("Coeur d'Alene").includes('coeur dalene'));
  assert.equal(G.nameVariants('Nashville')[0], 'nashville');
  assert.ok(!G.nameVariants('Nashville').some((v) => v.startsWith('north')));
  assert.ok(!G.nameVariants('St Albans').some((v) => v.includes('street')));
});
test('lookup falls back to variants and aliases', () => {
  const t = G.withAliases({ 'winston-salem|NC': [36.1, -80.24], 'bronx|NY': [40.84, -73.87] },
                          { 'north chesterfield|VA': [37.53, -77.52] });
  assert.deepEqual(G.lookup(t, 'Winston Salem', 'NC'), [36.1, -80.24]);
  assert.deepEqual(G.lookup(t, 'The Bronx', 'ny'), [40.84, -73.87]);
  assert.deepEqual(G.lookup(t, 'N Chesterfield', 'VA'), [37.53, -77.52]);
  assert.equal(G.lookup(t, 'Nowhere', 'VA'), null);
});
test('farCities: one row per city, nearest first, unplaced last', () => {
  const t = { 'richmond|VA': [37.54, -77.44], 'norfolk|VA': [36.85, -76.29] };
  const rows = G.farCities(
    ['Norfolk, VA', 'Richmond, VA', 'Norfolk, VA', 'Austin, TX', '', null],
    t,
    [38.03, -78.48], // Charlottesville
  );
  assert.deepEqual(rows.map((r) => [r.label, r.count]), [
    ['Richmond, VA', 1],
    ['Norfolk, VA', 2],
    ['Austin, TX', 1],
  ]);
  assert.ok(rows[0].miles > 50 && rows[0].miles < 70);
  assert.equal(rows[2].miles, null);
  assert.equal(G.farCities(['A, VA', 'B, VA'], {}, null, 1).length, 1);
});
test('lookup ignores accents', () => {
  const t = { 'rancho penasquitos|CA': [32.959, -117.115] };
  assert.deepEqual(G.lookup(t, 'Rancho Peñasquitos', 'CA'), [32.959, -117.115]);
});
test('withAliases never overwrites the table', () => {
  const t = G.withAliases({ 'a|VA': [1, 1] }, { 'a|VA': [2, 2] });
  assert.deepEqual(t['a|VA'], [1, 1]);
});

const sb = G.buildStateBounds({
  'richmond|VA': [37.54, -77.44], 'bristol|VA': [36.6, -82.19], 'norfolk|VA': [36.85, -76.29],
  'raleigh|NC': [35.78, -78.64], 'durham|NC': [35.99, -78.9],
  'los angeles|CA': [34.05, -118.24], 'eureka|CA': [40.8, -124.16],
  'anchorage|AK': [61.2, -149.9],
});
const mid = { ...G.DEFAULT_SETTINGS, center: [37.5, -77.65], radiusMiles: 40 };
test('milesToState', () => {
  assert.equal(G.milesToState(sb, 'VA', mid.center), 0);
  assert.ok(G.milesToState(sb, 'CA', mid.center) > 2000);
  assert.equal(G.milesToState(sb, 'ON', mid.center), null);
  assert.equal(G.milesToState(sb, 'AK', mid.center), null);
});
test('decide: unknown city, far state → far; near or unbounded → unknown', () => {
  assert.equal(G.decide('Hollywoodish, CA', mid, {}, sb), 'far');
  assert.equal(G.decide('Unknownville, NC', { ...mid, radiusMiles: 300 }, {}, sb), 'unknown');
  assert.equal(G.decide('Unknownville, VA', mid, {}, sb), 'unknown');
  assert.equal(G.decide('Toronto, ON', mid, {}, sb), 'unknown');
  assert.equal(G.decide('Nome, AK', mid, {}, sb), 'unknown');
  assert.equal(G.decide('Hollywoodish, CA', { ...mid, center: null }, {}, sb), 'unknown');
  assert.equal(G.decide('Hollywoodish, CA', mid, {}), 'unknown'); // no bounds given
});

test('hides: unknown only when the switch is on', () => {
  const s = G.DEFAULT_SETTINGS;
  assert.equal(s.hideUnknown, false);
  assert.equal(G.hides('unknown', s), false);
  assert.equal(G.hides('unknown', { ...s, hideUnknown: true }), true);
  for (const v of ['ad', 'ship', 'far']) assert.equal(G.hides(v, s), true);
  assert.equal(G.hides('keep', { ...s, hideUnknown: true }), false);
});

test('hides: an unknown card waits until its re-checks are over', () => {
  const on = { ...G.DEFAULT_SETTINGS, hideUnknown: true };
  assert.equal(G.hides('unknown', on, false), false);
  assert.equal(G.hides('unknown', on, true), true);
  assert.equal(G.hides('far', on, false), true);
});

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

test('hideFar off keeps far cards visible', () => {
  assert.equal(G.DEFAULT_SETTINGS.hideFar, true);
  assert.equal(G.hides('far', G.DEFAULT_SETTINGS), true);
  assert.equal(G.hides('far', { ...G.DEFAULT_SETTINGS, hideFar: false }), false);
  assert.equal(G.sameFilter(S, { ...S, hideFar: false }), false);
});
