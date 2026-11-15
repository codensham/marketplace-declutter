// Builds data/aliases.json: places Facebook may name on a listing that
// data/places.json cannot find. Mostly city neighborhoods ("Hollywood, CA",
// "Harlem, NY") and unincorporated communities.
//
// Sources:
//   - the GeoNames US gazetteer dump (CC BY 4.0, geonames.org), populated
//     places only, and
//   - scripts/manual-aliases.json, hand-kept names GeoNames lacks or places
//     badly. Manual entries win; null removes a name.
//
//   node scripts/build-aliases.mjs <geonames US.txt>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../lib/geo.js';

const { makeKey, lookup, haversineMiles } = globalThis.MLFGeo;

// GeoNames feature codes for places people live. Left out: PPLQ (abandoned),
// PPLH (historical), PPLW (destroyed).
const CODES = new Set([
  'PPL', 'PPLX', 'PPLL', 'PPLS', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4',
  'PPLC', 'PPLCH', 'PPLF', 'STLMT',
]);

// Same-named places in one state further apart than this are left out: a
// listing could be at either, and a wrong point would hide it.
export const AMBIGUOUS_MILES = 10;

// Populated places that are a single site, not somewhere a listing is
// labelled with: trailer parks, apartment complexes, subdivisions, camps.
export const NOT_A_TOWN =
  /\b(mobile homes?|trailers?|rv|manufactured homes?|apartments?|condominiums?|condos?|townhomes|townhouses|subdivision|(labor|mining|dredge|fish|work|lumber|construction) camp)\b/i;

const round3 =(n) => Math.round(n * 1000) / 1000;

// GeoNames dump columns (tab-delimited): name 1, ASCII name 2, lat 4, lon 5,
// feature class 6, feature code 7, country 8, state 10.
export function readGazetteer(text) {
  const points = new Map(); // key -> [[lat, lon], ...]
  for (const line of text.split(/\r?\n/)) {
    const f = line.split('\t');
    if (f[6] !== 'P' || !CODES.has(f[7]) || f[8] !== 'US' || !/^[A-Z]{2}$/.test(f[10] ?? '')) continue;
    const lat = Number(f[4]);
    const lon = Number(f[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // "Rancho Peñasquitos" and "Rancho Penasquitos" are both findable.
    for (const name of new Set([f[1], f[2]])) {
      if (!name || NOT_A_TOWN.test(name)) continue;
      const key = makeKey(name, f[10]);
      const list = points.get(key) ?? [];
      list.push([lat, lon]);
      points.set(key, list);
    }
  }
  return points;
}

// One point per name: the mean of its rows, or nothing when the rows are
// too far apart to tell which place is meant.
export function resolvePoints(list) {
  for (const a of list) {
    for (const b of list) if (haversineMiles(a, b) > AMBIGUOUS_MILES) return null;
  }
  const lat = list.reduce((s, p) => s + p[0], 0) / list.length;
  const lon = list.reduce((s, p) => s + p[1], 0) / list.length;
  return [round3(lat), round3(lon)];
}

// Names the city table can't already find, sorted by state then name.
export function buildAliases(table, points, manual = {}) {
  const out = {};
  for (const [key, list] of points) {
    const bar = key.lastIndexOf('|');
    if (lookup(table, key.slice(0, bar), key.slice(bar + 1))) continue;
    const coords = resolvePoints(list);
    if (coords) out[key] = coords;
  }
  for (const [key, coords] of Object.entries(manual)) {
    if (key.startsWith('_')) continue;
    if (coords === null) delete out[key];
    else out[key] = coords;
  }
  const keys = Object.keys(out).sort((x, y) => {
    const [xn, xs] = [x.slice(0, x.lastIndexOf('|')), x.slice(x.lastIndexOf('|') + 1)];
    const [yn, ys] = [y.slice(0, y.lastIndexOf('|')), y.slice(y.lastIndexOf('|') + 1)];
    return xs.localeCompare(ys) || xn.localeCompare(yn);
  });
  return Object.fromEntries(keys.map((k) => [k, out[k]]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [gazPath] = process.argv.slice(2);
  if (!gazPath) {
    console.error('usage: node scripts/build-aliases.mjs <geonames US.txt>');
    process.exit(1);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const table = JSON.parse(readFileSync(resolve(here, '../data/places.json'), 'utf8'));
  const manual = JSON.parse(readFileSync(resolve(here, 'manual-aliases.json'), 'utf8'));
  const aliases = buildAliases(table, readGazetteer(readFileSync(gazPath, 'utf8')), manual);
  const out = resolve(here, '../data/aliases.json');
  writeFileSync(out, JSON.stringify(aliases));
  console.log(`${Object.keys(aliases).length} entries -> ${out}`);
}
