import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripCensusSuffix, placeNames, buildTable } from '../scripts/build-places.mjs';

const H = 'USPS|GEOID|GEOIDFQ|ANSICODE|NAME|LSAD|FUNCSTAT|ALAND|AWATER|ALAND_SQMI|AWATER_SQMI|INTPTLAT|INTPTLONG';
const row = (st, name, aland, lat, lon) =>
  [st, '0', '0', '0', name, '25', 'A', aland, '0', '0', '0', lat, lon].join('|');

const places = [
  H,
  row('OK', 'Oklahoma City city', 1000, '35.467600', '-97.513700'),
  row('TX', 'Austin city', 500, '30.267153', '-97.743057'),
  row('TX', 'Austin city', 9000, '30.300000', '-97.700000'),
  row('NJ', 'Cherry Hill Mall CDP', 10, '39.938000', '-75.012000'),
].join('\n');

const cousubs = [
  H,
  row('NJ', 'Cherry Hill township', 900, '39.903500', '-74.994600'),
  row('TX', 'Austin CCD', 99999, '1.0', '1.0'),
].join('\n');

test('stripCensusSuffix removes one suffix only', () => {
  assert.equal(stripCensusSuffix('Oklahoma City city'), 'Oklahoma City');
  assert.equal(stripCensusSuffix('Cherry Hill township'), 'Cherry Hill');
  assert.equal(stripCensusSuffix('Kansas City'), 'Kansas City');
});

test('buildTable', () => {
  const t = buildTable(places, cousubs);
  assert.deepEqual(t['oklahoma city|OK'], [35.468, -97.514]);
  assert.deepEqual(t['austin|TX'], [30.3, -97.7]); // larger ALAND wins; place beats cousub
  assert.deepEqual(t['cherry hill|NJ'], [39.904, -74.995]); // township from cousubs
  assert.equal(t['austin ccd|TX'], undefined); // CCD rows are skipped
});

test('stripCensusSuffix removes (balance) and the type before it', () => {
  assert.equal(stripCensusSuffix('Indianapolis city (balance)'), 'Indianapolis');
  assert.equal(
    stripCensusSuffix('Nashville-Davidson metropolitan government (balance)'),
    'Nashville-Davidson',
  );
  assert.equal(stripCensusSuffix('San Juan zona urbana'), 'San Juan');
});

test('placeNames adds the everyday name for consolidated and renamed places', () => {
  assert.deepEqual(placeNames('Austin city'), ['Austin']);
  assert.deepEqual(placeNames('Winston-Salem city'), ['Winston-Salem']);
  assert.deepEqual(
    placeNames('Nashville-Davidson metropolitan government (balance)'),
    ['Nashville-Davidson', 'Nashville'],
  );
  assert.deepEqual(placeNames('Lexington-Fayette urban county'), ['Lexington-Fayette', 'Lexington']);
  assert.deepEqual(placeNames('Butte-Silver Bow (balance)'), ['Butte-Silver Bow', 'Butte']);
  assert.deepEqual(placeNames('San Buenaventura (Ventura) city'), ['San Buenaventura', 'Ventura']);
  assert.deepEqual(placeNames('Boise City city'), ['Boise City', 'Boise']);
  assert.deepEqual(placeNames('Urban Honolulu CDP'), ['Urban Honolulu', 'Honolulu']);
});

test('buildTable: an everyday name never replaces a real place of that name', () => {
  const p = [
    H,
    row('TN', 'Nashville-Davidson metropolitan government (balance)', 5000, '36.171800', '-86.785000'),
    row('GA', 'Athens-Clarke County unified government (balance)', 5000, '33.950000', '-83.370000'),
    row('GA', 'Athens city', 10, '1.000000', '1.000000'),
  ].join('\n');
  const t = buildTable(p, H);
  assert.deepEqual(t['nashville|TN'], [36.172, -86.785]);
  assert.deepEqual(t['athens|GA'], [1, 1]);
});

test('buildTable skips non-town county subdivisions', () => {
  const c = [
    H,
    row('IL', 'Springfield precinct', 10, '1.0', '1.0'),
    row('AK', 'Nome census subarea', 10, '1.0', '1.0'),
    row('NY', 'County subdivisions not defined', 10, '1.0', '1.0'),
  ].join('\n');
  assert.deepEqual(buildTable(H, c), {});
});
