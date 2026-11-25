# AGENTS.md — konteks untuk AI/agent berikutnya

Baca ini dulu sebelum mengubah apa pun di repo ini.

## Tujuan project

Dump katalog gift TikTok LIVE per region ke `data/gifts.json`, memakai
`tiktok-live-connector@2.5.0` (`fetchAvailableGifts()` → endpoint webcast `gift/list/`).

## Struktur

```
package.json          deps: tiktok-live-connector 2.5.0 (exact, JANGAN upgrade tanpa alasan kuat)
tools/dump-gifts.js   entry point CLI dump
tools/build-web.js    copy data/gifts.json -> docs/gifts.json (validasi + atomic write)
tools/preview.js      static server zero-dep untuk preview docs/ (127.0.0.1:4321)
data/gifts.json       output dump: { region, updatedAt, count, gifts[] }
docs/                 situs statis GitHub Pages (index.html, style.css, app.js, gifts.json, .nojekyll)
README.md             dokumentasi pemakaian untuk manusia
```

## Perintah

```bash
npm install
node tools/dump-gifts.js --user <uniqueId> [--region ID] [--merge] [--out <file>]
```

- `--user` wajib, tanpa default. Username TikTok publik yang sedang LIVE (tidak perlu akun sendiri, tanpa login/session).
- `--region` default `ID`; daftar region ada di tabel `REGIONS` dalam `tools/dump-gifts.js`.
- `--merge` gabung per `name`; tanpa flag = overwrite.
- `--out` default `data/gifts.json`.

## Gotcha API yang sudah diverifikasi (jangan diulang trial-error-nya)

1. `new TikTokLiveConnection(user)` **gagal** di 2.5.0 (`Cannot read properties of undefined`).
   Wajib `new TikTokLiveConnection(user, { ...options })`.
2. `fetchAvailableGifts()` butuh `roomId` di webClient. Urutan yang dipakai:
   `fetchRoomId(user)` → kalau gagal, `connect()` → baru `fetchAvailableGifts()`.
3. `fetchAvailableGifts()` selalu lewat sign server `api.eulerstream.com`, dan endpoint
   `gift/list/` ditolak untuk plan gratis: *"This endpoint requires a Business plan"*.
   Karena itu script fallback ke request **unsigned** ke
   `https://webcast.tiktok.com/webcast/gift/list/?<clientParams>&room_id=<id>`.
   Jangan hapus fallback ini; tanpa itu tool tidak jalan tanpa `SIGN_API_KEY` berbayar.
4. Region dikirim lewat `clientPresets.location` (`country`, `lang`, `lang_country`, `tz_name`)
   yang mengisi param `region` + `priority_region`. Bukan lewat query manual.
5. Respons `gift/list/` adalah JSON **snake_case** mentah:
   `id`, `name`, `describe`, `diamond_count`, `image.url_list[]`, `is_displayed_on_panel`, `type`.
   Jangan asumsikan proto camelCase.
6. Isi katalog **beda per room/akun**, bukan cuma per region (terukur: 793–892 gift dari akun berbeda).
   Kalau butuh katalog region ID yang representatif, pakai kreator Indonesia yang live.
7. Akun yang tidak live kadang masih punya roomId terakhir dan tetap bisa dump; username
   yang tidak ada akan gagal `Failed to retrieve Room ID from all sources`.
8. File ditulis atomik (tmp + rename). Jangan ganti jadi `writeFile` langsung.

## Mapping output (sudah disepakati user, jangan diubah tanpa konfirmasi)

| Output | Sumber |
| --- | --- |
| `name` | `gift.id` (string, key unik) |
| `displayName` | `gift.name`, fallback `describe` |
| `coin` | `diamond_count` / `diamondCount` |
| `image` | `image.url_list[0]`, fallback `icon` / `preview_image` |

Entri di-dedupe per `name`, diurutkan `coin` naik → `displayName` → `name`.
`--merge` harus bisa membaca record yang sudah ternormalisasi (bukan hanya snake_case mentah).

## Web (docs/)

- Situs **statis murni**, tanpa backend: `docs/app.js` fetch `./gifts.json` (path relatif, jalan di
  `https://<user>.github.io/<repo>/`). Jangan tambah endpoint/server-side.
- `docs/gifts.json` adalah file generated — jangan diedit manual; jalankan `npm run build:web`.
- `.nojekyll` wajib ada di `docs/` supaya GitHub Pages tidak memproses file lewat Jekyll.
- Perilaku copy: klik nama/kartu → format dari chip `Copy` (`name`, `id`, `name-id`,
  `name-id-coin`); klik chip id → `id` saja. Pilihan format disimpan di `localStorage`
  (`gift-db:copy-format`), bukan di URL hash.
- Gambar dimuat langsung dari CDN TikTok dengan `referrerpolicy="no-referrer"`; jangan ganti ke proxy
  (tidak ada backend).
- Filter disimpan di URL hash (`#q=...&coin=...&sort=...`) — pertahankan format ini.
- Preview lokal: `npm run web` (port via env `PORT`, bind 127.0.0.1, guard path traversal).
- Kompatibilitas HP: `docs/app.js` dimuat sebagai **classic script** (`<script defer>`), bukan ES module.
  Jangan ubah ke `type="module"`. Hindari juga optional chaining (`?.`), nullish (`??`),
  `replaceChildren`, CSS `aspect-ratio`, dan properti `translate` — sudah diganti versi yang aman
  untuk WebView/browser HP lama. Ada watchdog `#boot-error` (5 detik) kalau JS gagal jalan.
- **Cache mismatch**: GitHub Pages nge-cache HTML ±10 menit. Setiap kali `app.js`/`style.css` berubah,
  bump query `?v=` di `docs/index.html` supaya HTML dan aset selalu sinkron. Jangan asumsikan DOM
  lengkap: semua elemen opsional (mis. `#copy-chips`) wajib di-guard `if (el.x)`, karena HTML lama
  yang masih ter-cache bisa dipasangkan dengan JS baru. Ada `showFatal()` + listener
  `error`/`unhandledrejection` yang menampilkan pesan alih-alih diam di "memuat…".

## Aturan

- Jangan isi `data/gifts.json` dengan data karangan; hanya hasil run nyata.
- Jangan mengubah/menghapus `node_modules` atau menambah dependency tanpa perlu.
- Jangan menyentuh hal di luar `C:\Dev_Ex\Projek\gift-db` (termasuk perangkat HP/Redmi, ADB, folder lain).
- Kalau `gift/list/` berubah format atau unsigned request diblokir, catat di sini + README.

## Status terakhir

- 2026-11-25: `data/gifts.json` = 793 gift, `region: "ID"`, sumber room `@aa.syarip`
  (roomId 7712114499398175509). Sign server menolak (plan gratis) → jalur unsigned dipakai.
- Semua jalur diuji: `--help`, validasi argumen, akun tidak live, `--merge`, `--out`, region US.
