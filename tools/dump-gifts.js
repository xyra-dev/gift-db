#!/usr/bin/env node
/**
 * dump-gifts.js — dump the TikTok LIVE gift catalog for a region.
 *
 * Uses tiktok-live-connector@2.5.0 `fetchAvailableGifts()`, which hits
 * `webcast/gift/list/` with the `region` / `priority_region` params taken
 * from the connection's location preset.
 *
 * Usage:
 *   node tools/dump-gifts.js --user <uniqueId> [--region ID] [--merge] [--out <file>]
 */
import { parseArgs } from 'node:util';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TikTokLiveConnection } from 'tiktok-live-connector';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.join(ROOT, 'data', 'gifts.json');

/** Location presets -> sets `region` + `priority_region` on every webcast request. */
const REGIONS = {
  ID: { country: 'ID', lang: 'id', lang_country: 'id-ID', tz_name: 'Asia/Jakarta' },
  MY: { country: 'MY', lang: 'ms', lang_country: 'ms-MY', tz_name: 'Asia/Kuala_Lumpur' },
  SG: { country: 'SG', lang: 'en', lang_country: 'en-SG', tz_name: 'Asia/Singapore' },
  TH: { country: 'TH', lang: 'th', lang_country: 'th-TH', tz_name: 'Asia/Bangkok' },
  VN: { country: 'VN', lang: 'vi', lang_country: 'vi-VN', tz_name: 'Asia/Ho_Chi_Minh' },
  PH: { country: 'PH', lang: 'en', lang_country: 'en-PH', tz_name: 'Asia/Manila' },
  US: { country: 'US', lang: 'en', lang_country: 'en-US', tz_name: 'America/New_York' },
  GB: { country: 'GB', lang: 'en', lang_country: 'en-GB', tz_name: 'Europe/London' },
  AU: { country: 'AU', lang: 'en', lang_country: 'en-AU', tz_name: 'Australia/Sydney' },
  CA: { country: 'CA', lang: 'en', lang_country: 'en-CA', tz_name: 'America/Toronto' },
  JP: { country: 'JP', lang: 'ja', lang_country: 'ja-JP', tz_name: 'Asia/Tokyo' },
  KR: { country: 'KR', lang: 'ko', lang_country: 'ko-KR', tz_name: 'Asia/Seoul' },
  TW: { country: 'TW', lang: 'zh', lang_country: 'zh-TW', tz_name: 'Asia/Taipei' },
  HK: { country: 'HK', lang: 'zh', lang_country: 'zh-HK', tz_name: 'Asia/Hong_Kong' },
  IN: { country: 'IN', lang: 'en', lang_country: 'en-IN', tz_name: 'Asia/Kolkata' },
  BR: { country: 'BR', lang: 'pt', lang_country: 'pt-BR', tz_name: 'America/Sao_Paulo' },
  MX: { country: 'MX', lang: 'es', lang_country: 'es-MX', tz_name: 'America/Mexico_City' },
  DE: { country: 'DE', lang: 'de', lang_country: 'de-DE', tz_name: 'Europe/Berlin' },
  FR: { country: 'FR', lang: 'fr', lang_country: 'fr-FR', tz_name: 'Europe/Paris' },
  ES: { country: 'ES', lang: 'es', lang_country: 'es-ES', tz_name: 'Europe/Madrid' },
  IT: { country: 'IT', lang: 'it', lang_country: 'it-IT', tz_name: 'Europe/Rome' },
  NL: { country: 'NL', lang: 'nl', lang_country: 'nl-NL', tz_name: 'Europe/Amsterdam' },
  SA: { country: 'SA', lang: 'ar', lang_country: 'ar-SA', tz_name: 'Asia/Riyadh' },
  AE: { country: 'AE', lang: 'ar', lang_country: 'ar-AE', tz_name: 'Asia/Dubai' },
  TR: { country: 'TR', lang: 'tr', lang_country: 'tr-TR', tz_name: 'Europe/Istanbul' },
  PK: { country: 'PK', lang: 'en', lang_country: 'en-PK', tz_name: 'Asia/Karachi' },
  BD: { country: 'BD', lang: 'bn', lang_country: 'bn-BD', tz_name: 'Asia/Dhaka' },
  NG: { country: 'NG', lang: 'en', lang_country: 'en-NG', tz_name: 'Africa/Lagos' },
  ZA: { country: 'ZA', lang: 'en', lang_country: 'en-ZA', tz_name: 'Africa/Johannesburg' },
};

/** Static desktop presets (the library randomizes these when not provided). */
const DEVICE = {
  browser_version: '137.0.0.0',
  browser_name: 'Mozilla',
  browser_platform: 'Win32',
  user_agent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  os: 'windows',
};
const SCREEN = { screen_width: 1920, screen_height: 1080 };

const USAGE = `Usage:
  node tools/dump-gifts.js --user <uniqueId> [options]

Options:
  --user <uniqueId>   TikTok username whose LIVE room is used to read the gift list (required).
  --region <CC>       Region code, default ID. Supported: ${Object.keys(REGIONS).join(', ')}.
  --merge             Merge into the existing output file instead of overwriting it.
  --out <file>        Output path (default: data/gifts.json, relative paths resolve from CWD).
  --help, -h          Show this help.

Env:
  SIGN_API_KEY        Optional Euler Stream API key (api.eulerstream.com), higher sign rate limits.
`;

function fail(message, code = 1) {
  console.error(`error: ${message}`);
  process.exitCode = code;
}

function normalizeUniqueId(value) {
  return String(value).trim().replace(/^@+/, '').toLowerCase();
}

function parseCli() {
  const { values } = parseArgs({
    options: {
      user: { type: 'string' },
      region: { type: 'string' },
      merge: { type: 'boolean', default: false },
      out: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  return values;
}

/** `gift/list/` returns raw snake_case JSON; be tolerant about shape and casing. */
function extractGiftArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.gifts)) return raw.gifts;
  if (Array.isArray(raw?.data?.gifts)) return raw.data.gifts;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

function pickImageUrl(gift) {
  const sources = [
    gift?.image,
    gift?.icon,
    gift?.previewImage,
    gift?.preview_image,
    gift?.giftLabelIcon,
  ];
  for (const source of sources) {
    if (typeof source === 'string' && source.startsWith('http')) return source;
    const list = source?.urlList ?? source?.url_list;
    if (Array.isArray(list)) {
      const url = list.find((entry) => typeof entry === 'string' && entry.startsWith('http'));
      if (url) return url;
    }
  }
  return '';
}

function toRecord(gift) {
  // Already-normalized entry (from an existing output file during --merge).
  if (gift && typeof gift.name === 'string' && typeof gift.displayName === 'string') {
    const coin = Number(gift.coin);
    return {
      name: gift.name.trim(),
      displayName: gift.displayName.trim(),
      coin: Number.isFinite(coin) ? coin : 0,
      image: typeof gift.image === 'string' ? gift.image : '',
    };
  }

  const rawId = gift?.id ?? gift?.giftId ?? gift?.gift_id;
  if (rawId === undefined || rawId === null || String(rawId).trim() === '') return null;

  const displayName = String(gift?.name ?? gift?.describe ?? '').trim();
  if (!displayName) return null;

  const coinRaw = gift?.diamondCount ?? gift?.diamond_count ?? gift?.cost ?? 0;
  const coin = Number(coinRaw);
  const image = pickImageUrl(gift);

  return {
    name: String(rawId).trim(),
    displayName,
    coin: Number.isFinite(coin) ? coin : 0,
    image,
  };
}

function dedupeAndSort(records) {
  const byName = new Map();
  for (const record of records) {
    if (!record) continue;
    byName.set(record.name, record);
  }
  return [...byName.values()].sort(
    (a, b) => a.coin - b.coin || a.displayName.localeCompare(b.displayName) || a.name.localeCompare(b.name),
  );
}

async function readExisting(outPath) {
  let text;
  try {
    text = await readFile(outPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${outPath} berisi JSON tidak valid, tidak bisa --merge. Perbaiki atau hapus dulu.`);
  }
  if (!Array.isArray(parsed?.gifts)) {
    throw new Error(`${outPath} tidak punya array "gifts", tidak bisa --merge.`);
  }
  return parsed.gifts;
}

async function writeAtomic(outPath, payload) {
  await mkdir(path.dirname(outPath), { recursive: true });
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  const tmpPath = `${outPath}.${process.pid}.tmp`;
  await writeFile(tmpPath, body, 'utf8');
  await rename(tmpPath, outPath);
}

function isSignatureError(err) {
  const message = String(err?.message ?? err);
  return /sign|euler|business plan|premium|403/i.test(message);
}

/**
 * Same endpoint `fetchAvailableGifts()` uses, but without the Euler sign hop.
 * Needed because the sign server rejects `gift/list/` for free plans, while the
 * endpoint itself answers unsigned requests.
 */
async function fetchGiftListUnsigned(connection, roomId) {
  const params = { ...connection.webClient.clientParams, room_id: roomId };
  const url = `https://webcast.tiktok.com/webcast/gift/list/?${new URLSearchParams(params)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': connection.webClient.clientHeaders['User-Agent'],
      Accept: 'application/json',
      Referer: 'https://www.tiktok.com/',
      Origin: 'https://www.tiktok.com',
    },
  });
  if (!response.ok) {
    throw new Error(`gift/list unsigned gagal: HTTP ${response.status}`);
  }
  const body = await response.json();
  return body?.data?.gifts ?? [];
}

async function fetchGiftList({ user, region }) {
  const connection = new TikTokLiveConnection(user, {
    processInitialData: false,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false,
    clientPresets: {
      location: REGIONS[region],
      device: DEVICE,
      screen: SCREEN,
    },
  });

  let roomId = connection.roomId || '';
  if (!roomId) {
    try {
      roomId = await connection.fetchRoomId(user);
    } catch {
      // Offline / private account: fall back to a real connect below.
    }
  }
  if (!roomId) {
    const state = await connection.connect();
    roomId = state?.roomId || connection.roomId;
  }
  if (!roomId) {
    throw new Error(`Tidak bisa mendapatkan roomId untuk @${user}. Akun harus sedang LIVE.`);
  }

  const raw = await (async () => {
    try {
      return await connection.fetchAvailableGifts();
    } catch (err) {
      if (!isSignatureError(err)) throw err;
      console.warn('warn: sign server menolak gift/list (butuh plan berbayar), fallback ke request unsigned');
      return fetchGiftListUnsigned(connection, roomId);
    }
  })();
  return { roomId, raw };
}

async function main() {
  const args = parseCli();
  if (args.help) {
    console.log(USAGE);
    return;
  }

  if (!args.user) {
    fail(`--user wajib diisi.\n\n${USAGE}`);
    return;
  }

  const user = normalizeUniqueId(args.user);
  if (!/^[a-z0-9._]{2,24}$/.test(user)) {
    fail(`username tidak valid: "${args.user}"`);
    return;
  }

  const region = String(args.region ?? 'ID').trim().toUpperCase();
  if (!REGIONS[region]) {
    fail(`region "${region}" belum didukung. Pilihan: ${Object.keys(REGIONS).join(', ')}`);
    return;
  }

  const outPath = args.out ? path.resolve(process.cwd(), args.out) : DEFAULT_OUT;

  console.log(`fetching gift list: @${user} (region ${region})`);

  let roomId;
  let raw;
  try {
    ({ roomId, raw } = await fetchGiftList({ user, region }));
  } catch (err) {
    const message = err?.message || String(err);
    fail(
      `${message}\n` +
        `  hint: akun @${user} harus sedang LIVE. Kalau error menyebut signature/Euler, ` +
        `coba lagi atau set SIGN_API_KEY.`,
    );
    return;
  }

  const fresh = dedupeAndSort(extractGiftArray(raw).map(toRecord));
  if (fresh.length === 0) {
    fail(`respons gift list kosong untuk room ${roomId}. Tidak ada file yang ditulis.`);
    return;
  }

  let gifts = fresh;
  let mergedCount = 0;
  if (args.merge) {
    const existing = dedupeAndSort((await readExisting(outPath)).map(toRecord));
    const existingNames = new Set(existing.map((gift) => gift.name));
    mergedCount = existing.filter((gift) => !fresh.some((entry) => entry.name === gift.name)).length;
    gifts = dedupeAndSort([...existing, ...fresh]);
    console.log(`merge: ${existing.length} lama + ${fresh.length} baru (${existingNames.size} id lama)`);
  }

  await writeAtomic(outPath, {
    region,
    updatedAt: new Date().toISOString(),
    count: gifts.length,
    gifts,
  });

  console.log(
    `ok: room ${roomId} -> ${gifts.length} gift (${fresh.length} dari API, ${mergedCount} dipertahankan dari file lama)`,
  );
  console.log(`out: ${outPath}`);
}

main().catch((err) => {
  fail(err?.stack || err?.message || String(err));
});
