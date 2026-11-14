import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { FILES, referencedFiles, crc32, zip } from '../scripts/package.mjs';

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('zip round-trips its entries', () => {
  const data = Buffer.from('hello hello hello');
  const buf = zip([{ name: 'a/b.txt', data }]);
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  const nameLen = buf.readUInt16LE(26);
  const size = buf.readUInt32LE(18);
  const body = buf.subarray(30 + nameLen, 30 + nameLen + size);
  assert.deepEqual(inflateRawSync(body), data);
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50);
});

test('everything the manifest loads is packaged, and nothing from dev', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  for (const f of referencedFiles(manifest)) assert.ok(FILES.includes(f), f);
  for (const f of FILES) assert.ok(!/^(test|scripts|docs|store)\//.test(f), f);
});
