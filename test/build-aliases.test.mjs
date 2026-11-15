import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readGazetteer, resolvePoints, buildAliases, NOT_A_TOWN } from '../scripts/build-aliases.mjs';

// GeoNames dump row: id, name, asciiname, alternates, lat, lon, class, code,
// country, cc2, admin1, ...
const row = (name, ascii, lat, lon, code, state, cls = 'P') =>
  ['1', name, ascii, '', lat, lon, cls, code, 'US', '', state, '', '', '', '0'].join('\t');

const gaz = [
  row('Hollywood', 'Hollywood', '34.09834', '-118.32674', 'PPLX', 'CA'),
  row('Rancho Peñasquitos', 'Rancho Penasquitos', '32.95949', '-117.11531', 'PPLX', 'CA'),
  row('Old Mill', 'Old Mill', '35.0', '-80.0', 'PPLQ', 'NC'),
  row('Sunny Acres Trailer Park', 'Sunny Acres Trailer Park', '35.1', '-80.1', 'PPL', 'NC'),
  row('Hollywood Hill', 'Hollywood Hill', '35.2', '-80.2', 'HLL', 'NC', 'T'),
  row('Highland Park', 'Highland Park', '34.11195', '-118.19896', 'PPLX', 'CA'),
  row('Highland Park', 'Highland Park', '38.55768', '-121.48857', 'PPL', 'CA'),
  row('Twin', 'Twin', '40.0', '-75.0', 'PPL', 'PA'),
  row('Twin', 'Twin', '40.01', '-75.01', 'PPL', 'PA'),
].join('\n');

test('readGazetteer keeps living places under both spellings', () => {
  const pts = readGazetteer(gaz);
  assert.ok(pts.has('hollywood|CA'));
  assert.ok(pts.has('rancho peñasquitos|CA'));
  assert.ok(pts.has('rancho penasquitos|CA'));
  assert.ok(!pts.has('old mill|NC'), 'abandoned places are left out');
  assert.ok(!pts.has('sunny acres trailer park|NC'), 'single sites are left out');
  assert.ok(!pts.has('hollywood hill|NC'), 'non-places are left out');
});

test('NOT_A_TOWN spots single sites but not towns', () => {
  for (const n of ['Oak Mobile Home Park', 'Pine Apartments', 'Ridge Subdivision', 'Kavik Labor Camp'])
    assert.ok(NOT_A_TOWN.test(n), n);
  for (const n of ['Camp Hill', 'Parkville', 'Apex'])
    assert.ok(!NOT_A_TOWN.test(n), n);
});

test('resolvePoints averages close rows and drops far-apart ones', () => {
  assert.deepEqual(resolvePoints([[40, -75], [40.01, -75.01]]), [40.005, -75.005]);
  assert.equal(resolvePoints([[34.11, -118.2], [38.56, -121.49]]), null);
});

test('buildAliases skips names the table finds, applies manual entries', () => {
  const table = { 'twin|PA': [1, 1] };
  const manual = { _comment: 'x', 'hollywood|CA': null, 'soma|CA': [37.778, -122.405] };
  const out = buildAliases(table, readGazetteer(gaz), manual);
  assert.ok(!('twin|PA' in out), 'already in the table');
  assert.ok(!('highland park|CA' in out), 'ambiguous');
  assert.ok(!('hollywood|CA' in out), 'removed by hand');
  assert.ok(!('_comment' in out));
  assert.deepEqual(out['soma|CA'], [37.778, -122.405]);
  assert.deepEqual(out['rancho penasquitos|CA'], [32.959, -117.115]);
});
