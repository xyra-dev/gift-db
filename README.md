# gift-db

Katalog gift TikTok LIVE per region, di-dump lewat [`tiktok-live-connector@2.5.0`](https://github.com/zerodytrash/TikTok-Live-Connector)
(`fetchAvailableGifts()` → endpoint webcast `gift/list/`).

> Untuk AI/agent: baca [`AGENTS.md`](./AGENTS.md) — berisi gotcha API, mapping field, dan aturan repo.

## Install

```bash
npm install
```

Butuh Node.js >= 20.

## Pakai

```bash
node tools/dump-gifts.js --user <uniqueId>
```

`--user` wajib: username TikTok yang **sedang LIVE**. Room-nya dipakai sebagai konteks
untuk membaca daftar gift (TikTok tidak menyediakan endpoint gift list tanpa room).

| Flag | Default | Fungsi |
| --- | --- | --- |
| `--user <uniqueId>` | — (wajib) | Username TikTok yang sedang live. |
| `--region <CC>` | `ID` | Region yang diminta ke TikTok (`region` + `priority_region`). Lihat daftar di bawah. |
| `--merge` | off | Gabung dengan file output lama, bukan menimpa. Gift baru menang untuk `name` yang sama; gift lama yang tidak muncul di API tetap disimpan. |
| `--out <file>` | `data/gifts.json` | Path output. Path relatif dihitung dari direktori kerja. |
| `--help`, `-h` | — | Bantuan. |

Contoh:

```bash
# dump region Indonesia, timpa data/gifts.json
node tools/dump-gifts.js --user some_live_creator --region ID

# tambah/refresh tanpa membuang gift lama
node tools/dump-gifts.js --user some_live_creator --region ID --merge

# simpan ke file lain
node tools/dump-gifts.js --user some_live_creator --region MY --out data/gifts-my.json
```

Region yang didukung: `ID MY SG TH VN PH US GB AU CA JP KR TW HK IN BR MX DE FR ES IT NL SA AE TR PK BD NG ZA`.
Kalau butuh region lain, tambahkan entri di tabel `REGIONS` pada `tools/dump-gifts.js`.

## Website (GitHub Pages)

Galeri statis read-only ada di `docs/` (folder yang di-publish GitHub Pages).

```bash
npm run build:web   # data/gifts.json -> docs/gifts.json
npm run web         # preview lokal: http://127.0.0.1:4321/
```

Fitur galeri: grid gambar + nama + id + coin, search (nama/id), filter coin
(`1`, `<100`, `100–1.000`, `1.000+`), sort, "Muat lagi" per 100 kartu, filter tersimpan di URL hash.

Format copy bisa dipilih di toolbar (**Copy:**):

| Pilihan | Hasil |
| --- | --- |
| Nama | `Rose` |
| ID | `5655` |
| Nama (ID) | `Rose (5655)` |
| Nama (ID) + coin | `Rose (5655) · 1 coin` |

Klik nama/kartu → pakai format terpilih (disimpan di `localStorage`). Klik chip `#id` selalu copy id saja.

Deploy: push repo ke GitHub → **Settings → Pages → Branch `main`, folder `/docs`**.
Situs: `https://<user>.github.io/<repo>/`. Repo harus publik. Setelah data di-dump ulang:

```bash
npm run build:web
git add docs/gifts.json && git commit -m "refresh gifts" && git push
```

## Format `data/gifts.json`

```json
{
  "region": "ID",
  "updatedAt": "2026-11-25T00:00:00.000Z",
  "count": 2,
  "gifts": [
    { "name": "5655", "displayName": "Rose", "coin": 1, "image": "https://p16-...webp" },
    { "name": "5827", "displayName": "TikTok", "coin": 1, "image": "https://p16-...webp" }
  ]
}
```

Mapping dari respons mentah `gift/list/`:

| Output | Sumber | Catatan |
| --- | --- | --- |
| `name` | `gift.id` | ID numerik gift (string), stabil untuk key database. |
| `displayName` | `gift.name` (fallback `describe`) | Nama gift yang tampil di panel. |
| `coin` | `diamond_count` / `diamondCount` | Harga gift dalam koin/diamond. |
| `image` | `image.url_list[0]` (fallback `icon`, `preview_image`) | URL gambar utama. |

Entri di-dedupe per `name`, lalu diurutkan berdasarkan `coin` naik, `displayName`, `name`.
File ditulis atomik (temp file + rename), jadi tidak pernah setengah jadi.

## Catatan

- Request `gift/list/` normalnya ditandatangani lewat `api.eulerstream.com` (bawaan library).
  Sign server menolak endpoint ini untuk plan gratis, jadi tool otomatis fallback ke request
  unsigned ke endpoint yang sama (tetap lewat `fetchAvailableGifts()` dulu). Set `SIGN_API_KEY`
  kalau punya plan berbayar.
- Nama/isi gift berbeda per region dan bisa berubah kapan saja; jalankan ulang saat mau data segar.
- Kalau akun tidak live, tool keluar dengan error dan **tidak** menulis file.
