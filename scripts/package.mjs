// Builds the Chrome Web Store upload: dist/marketplace-declutter-<version>.zip
// with manifest.json at its root and only the files the extension loads.
// No dependencies: the zip is written by hand with Node's zlib.
//
//   npm run package
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const FILES = [
  'manifest.json',
  'content.js',
  'popup.html',
  'popup.js',
  'lib/geo.js',
  'data/places.json',
  ...readdirSync(join(root, 'icons'))
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => `icons/${f}`),
];

// Every file the manifest or popup points at must be in the zip.
export function referencedFiles(manifest) {
  const refs = new Set([manifest.action?.default_popup, 'popup.js', 'lib/geo.js']);
  for (const p of Object.values(manifest.icons ?? {})) refs.add(p);
  for (const p of Object.values(manifest.action?.default_icon ?? {})) refs.add(p);
  for (const cs of manifest.content_scripts ?? []) for (const p of cs.js ?? []) refs.add(p);
  for (const w of manifest.web_accessible_resources ?? []) for (const p of w.resources) refs.add(p);
  refs.add('icons/icon48.png'); // popup header logo
  refs.delete(undefined);
  return [...refs];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// entries: [{ name, data: Buffer }]. Fixed timestamps keep builds identical.
export function zip(entries) {
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + packed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function main() {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const missing = referencedFiles(manifest).filter((p) => !FILES.includes(p) || !existsSync(join(root, p)));
  if (missing.length) {
    console.error(`Referenced but not packaged or not found: ${missing.join(', ')}`);
    process.exit(1);
  }
  const entries = FILES.map((name) => ({ name, data: readFileSync(join(root, name)) }));
  const out = join(root, 'dist', `marketplace-declutter-${manifest.version}.zip`);
  mkdirSync(dirname(out), { recursive: true });
  const buf = zip(entries);
  writeFileSync(out, buf);
  console.log(`${out} (${entries.length} files, ${(buf.length / 1024).toFixed(0)} KB)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
