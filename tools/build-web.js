/**
 * build-web.js — copy data/gifts.json into docs/gifts.json for GitHub Pages.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data', 'gifts.json');
const DEST = path.join(ROOT, 'docs', 'gifts.json');

const raw = await readFile(SRC, 'utf8');
const data = JSON.parse(raw);

if (!Array.isArray(data.gifts)) {
  throw new Error(`${SRC} tidak punya array "gifts".`);
}

const ids = new Set();
for (const gift of data.gifts) {
  if (!gift || typeof gift.name !== 'string' || typeof gift.displayName !== 'string') {
    throw new Error(`${SRC} berisi entri gift yang tidak valid.`);
  }
  ids.add(gift.name);
}

const payload = {
  region: data.region ?? '—',
  updatedAt: data.updatedAt ?? null,
  count: data.gifts.length,
  gifts: data.gifts,
};

await mkdir(path.dirname(DEST), { recursive: true });
const tmp = `${DEST}.${process.pid}.tmp`;
await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
await rename(tmp, DEST);

console.log(
  `ok: ${path.relative(ROOT, DEST)} -> ${payload.count} gift, region ${payload.region}, ` +
    `${ids.size} id unik`,
);
