// Builds data/places.json from:
//   - the GeoNames US postal-code file (CC BY 4.0, geonames.org), and
//   - the US Census Gazetteer "Places" and "County Subdivisions" national
//     files (public domain), which fill in names that are not postal cities.
//
//   node scripts/build-places.mjs <places.txt> <cousubs.txt> <geonames-zip-US.txt>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../lib/geo.js';

const { makeKey } = globalThis.MLFGeo;

// Census appends the legal type to every name ("Austin city"). Longest first,
// so "charter township" is removed whole rather than leaving "charter".
const SUFFIXES = [
  'consolidated government',
  'metropolitan government',
  'unified government',
  'metro government',
  'charter township',
  'city and borough',
  'urban county',
  'municipality',
  'zona urbana',
  'plantation',
  'comunidad',
  'township',
  'borough',
  'village',
  'city',
  'town',
  'CDP',
];

// County subdivisions that are statistical or administrative areas, not towns.
const SKIP = /\s(CCD|UT|district|precinct|barrio|census subarea)$|not defined$/;

// Merged city-county governments: people use the part before the hyphen.
const CONSOLIDATED = /\(balance\)$| government$| urban county$/;

// Legal names nobody uses, mapped to the everyday name.
const ALIASES = { 'Boise City': 'Boise', 'Urban Honolulu': 'Honolulu' };

export function stripCensusSuffix(name) {
  const n = name.endsWith(' (balance)') ? name.slice(0, -' (balance)'.length) : name;
  for (const suffix of SUFFIXES) {
    if (n.endsWith(` ${suffix}`)) return n.slice(0, -suffix.length - 1);
  }
  return n;
}

// Every name a Census row should be findable under: the legal name first,
// then any everyday names.
export function placeNames(censusName) {
  const base = stripCensusSuffix(censusName);
  const paren = /^(.+) \((.+)\)$/.exec(base); // "San Buenaventura (Ventura)"
  const names = paren ? [paren[1], paren[2]] : [base];
  if (CONSOLIDATED.test(censusName)) names.push(base.split(/[-/]/)[0].trim());
  if (ALIASES[base]) names.push(ALIASES[base]);
  return [...new Set(names)];
}

const round3 = (n) => Math.round(n * 1000) / 1000;

// Returns { primary, extra }: Maps of key -> { aland, coords }. A duplicate
// key within a map keeps the row with the larger land area.
function parseFile(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  // Files up to 2024 are tab-delimited; 2025 onwards use pipes.
  const sep = lines[0].includes('|') ? '|' : '\t';
  const header = lines[0].split(sep).map((h) => h.trim());
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Gazetteer file is missing column ${name}`);
    return i;
  };
  const [st, nm, al, la, lo] = ['USPS', 'NAME', 'ALAND', 'INTPTLAT', 'INTPTLONG'].map(col);

  const primary = new Map();
  const extra = new Map();
  const put = (map, key, entry) => {
    const prev = map.get(key);
    if (!prev || entry.aland > prev.aland) map.set(key, entry);
  };

  for (const line of lines.slice(1)) {
    const f = line.split(sep).map((v) => v.trim());
    if (SKIP.test(f[nm])) continue;
    const lat = Number(f[la]);
    const lon = Number(f[lo]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const entry = { aland: Number(f[al]) || 0, coords: [round3(lat), round3(lon)] };
    const [legal, ...everyday] = placeNames(f[nm]);
    put(primary, makeKey(legal, f[st]), entry);
    for (const name of everyday) put(extra, makeKey(name, f[st]), entry);
  }
  return { primary, extra };
}

// Postal city names from the GeoNames postal-code file (tab-delimited:
// country, zip, city, state name, state, ..., lat at 9, lon at 10). Facebook
// labels listings with postal city names ("Henrico, VA"), many of which are
// not Census places. A city's point is the mean of its ZIP centroids.
export function buildPostal(zipText) {
  const sums = new Map(); // key -> [latSum, lonSum, count]
  for (const line of zipText.split(/\r?\n/)) {
    const f = line.split('\t');
    const lat = Number(f[9]);
    const lon = Number(f[10]);
    if (!f[2] || !f[4] || !f[9] || !f[10] || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = makeKey(f[2], f[4]);
    const s = sums.get(key) ?? [0, 0, 0];
    sums.set(key, [s[0] + lat, s[1] + lon, s[2] + 1]);
  }
  const table = {};
  for (const [key, [lat, lon, n]] of sums) table[key] = [round3(lat / n), round3(lon / n)];
  return table;
}

// Precedence: postal city name, then a Census place's legal name, then a
// place's everyday name, then county subdivisions. Earlier sources are never
// overwritten.
export function buildTable(placesText, cousubsText, zipText = '') {
  const places = parseFile(placesText);
  const cousubs = parseFile(cousubsText);
  const table = buildPostal(zipText);
  for (const map of [places.primary, places.extra, cousubs.primary, cousubs.extra]) {
    for (const [key, { coords }] of map) {
      if (!(key in table)) table[key] = coords;
    }
  }
  return table;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [placesPath, cousubsPath, zipPath] = process.argv.slice(2);
  if (!placesPath || !cousubsPath || !zipPath) {
    console.error('usage: node scripts/build-places.mjs <places.txt> <cousubs.txt> <geonames-zip-US.txt>');
    process.exit(1);
  }
  const table = buildTable(
    readFileSync(placesPath, 'utf8'),
    readFileSync(cousubsPath, 'utf8'),
    readFileSync(zipPath, 'utf8'),
  );
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../data/places.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(table));
  console.log(`${Object.keys(table).length} entries -> ${out}`);
}
