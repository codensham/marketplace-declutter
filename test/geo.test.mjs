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
