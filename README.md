# Musik Tools

Alat latihan musik pribadi: pemutar, pengubah tempo (tanpa mengubah nada), transpose, Minus One (DSP klasik, tanpa AI), loop A-B, equalizer, metronom, dan unduh YouTube ke MP3. Berjalan sebagai **PWA di Android** (patokan: Samsung Galaxy A23) dan di **Chrome desktop** (PWA + ekstensi). Lisensi **GPL-3.0**.

Sumber kebenaran produk: [`docs/PRD.md`](docs/PRD.md). Hanya untuk penggunaan pribadi; mengunduh dari YouTube melanggar Ketentuan Layanan YouTube dan menjadi risiko pemilik (lihat PRD 6.7).

## Fitur

| Area             | Isi                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pemutar          | Library lokal (OPFS + IndexedDB), waveform, prev / stop / play-pause / next, ±5 detik, antrean, **Buka & putar** tanpa menyimpan, Media Session                                                                         |
| Tempo dan nada   | Tempo 0,25-2× dan kunci ±12 semitone, Rubber Band WASM (R2 bawaan, R3 opsional), tanpa putus saat diubah                                                                                                                |
| Minus One        | Dasar, Jaga bass, Fokus vokal + kekuatan / batas bass / lebar pita vokal                                                                                                                                                |
| Latihan          | Loop A-B, equalizer 5 pita, metronom + hitung masuk, preset per lagu otomatis                                                                                                                                           |
| Cari musik legal | Layar Cari: Internet Archive, Openverse, Wikimedia Commons; cari per judul / artis, urut menurut artis, judul, ukuran, tahun; hanya lisensi CC / domain publik; unduh langsung ke Library dengan atribusi, tanpa server |
| YouTube ke MP3   | Layar YouTube, Share Target Android, server Node pure JS (antrean, token, batas laju, retensi 1 jam)                                                                                                                    |
| Ekstensi Chrome  | Tempo, transpose, Minus One pada `<video>`/`<audio>` di tab aktif; tombol Simpan sebagai MP3 membuka PWA                                                                                                                |

## Status

| Fase | Isi                                        | Status                                                                     |
| ---- | ------------------------------------------ | -------------------------------------------------------------------------- |
| M0   | Fondasi: pipeline audio, PWA, skrip deploy | Selesai; uji A23 lulus                                                     |
| M1   | MVP: pemutar, library, Minus One, ekstensi | Selesai; uji A23 lulus (ekstensi di YouTube belum)                         |
| M2   | YouTube ke MP3                             | Selesai; konversi nyata lulus di PC Windows + A23; **server cPanel belum** |
| M3   | Antrean, loop, EQ, metronom, preset        | Selesai di kode dan uji otomatis; **belum diuji di A23**                   |
| M4   | Minus One lanjutan                         | Selesai di kode dan uji otomatis; **belum didengar di A23**                |
| M6   | Cari dan unduh dari sumber legal (0.2.0)   | Selesai di kode dan uji otomatis; **belum dicoba di A23**                  |
| M5   | Opsional: APK, deteksi kunci               | Belum                                                                      |

Rincian keputusan dan bukti per fase: `docs/DECISIONS_M0.md` ... `docs/DECISIONS_M4.md`, `docs/DECISIONS_SOURCES.md` (sumber legal). Daftar yang belum teruji ada di setiap berkas itu dan di `CHANGELOG.md`.

## Struktur

| Folder        | Isi                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------- |
| `core/`       | Mesin audio (Web Audio + AudioWorklet + Rubber Band WASM), library, klien API, logika latihan |
| `ui/`         | Komponen Svelte bersama, tema, string Indonesia (`ui/i18n/id.ts`)                             |
| `app-pwa/`    | PWA (Vite). Halaman lab audio di `/lab/`                                                      |
| `ext-chrome/` | Ekstensi MV3 (popup + content script), lihat README di dalamnya                               |
| `server/`     | Layanan Node (CommonJS, tanpa dependensi runtime)                                             |
| `scripts/`    | Skrip build / deploy lintas platform (Node)                                                   |
| `e2e/`        | Uji Playwright                                                                                |
| `docs/`       | PRD, keputusan, panduan deploy, daftar uji manual                                             |

## Mulai cepat

Butuh Node >= 20 (server mendukung Node >= 18) dan Git.

```powershell
npm install
npm run dev              # app di http://localhost:5173/ , lab di /lab/
npm run lint
npm run typecheck
npm test                 # unit (core, server, skrip)
npm run build            # -> out/app (PWA) dan out/server
npm run build:ext        # ekstensi -> ext-chrome/dist
```

Uji end-to-end (Playwright memakai Chrome sistem; ekstensi memakai Chromium dari cache Playwright):

```powershell
npm run test:e2e         # lab, aplikasi, alat latihan, Minus One, Cari (sumber legal, jaringan di-mock)
node e2e/m2.mjs          # YouTube ke MP3 (server asli + yt-dlp palsu)
node e2e/ext.mjs         # ekstensi
```

Uji di HP lewat USB atau di server sendiri: `docs/DEPLOY.md` (termasuk "Uji lokal: PC + HP lewat USB").

## Deploy

Build lokal, repo terpisah `musik-deploy` untuk hasil build, `git pull` manual di server, restart lewat cPanel. Langkah lengkap, variabel lingkungan, dan daftar periksa go-live: [`docs/DEPLOY.md`](docs/DEPLOY.md). Uji manual di server nyata: [`docs/TEST_SERVER.md`](docs/TEST_SERVER.md).

## Dokumentasi

| Berkas                                | Isi                                                      |
| ------------------------------------- | -------------------------------------------------------- |
| `docs/PRD.md`                         | Kebutuhan produk dan Decision Log                        |
| `docs/FRONTEND.md`                    | Arsitektur UI, audio, PWA (rancangan awal)               |
| `docs/DEPLOY.md`                      | Repo, build, deploy, restart, uji lokal                  |
| `docs/DECISIONS_M0.md` ... `M4.md`    | Keputusan teknis dan bukti per fase (M3 terbagi A dan B) |
| `docs/TEST_A23.md`                    | Daftar uji manual di HP, per fase                        |
| `docs/TEST_SERVER.md`                 | Daftar uji manual di server cPanel                       |
| `docs/ASSUMPTIONS.md`, `PROPOSALS.md` | Asumsi dan usulan di luar PRD                            |
| `docs/CLAUDE_CODE_PROMPT.md`          | Prompt eksekusi per fase dan pelajaran yang dibawa       |
| `CHANGELOG.md`                        | Ringkasan perubahan per versi                            |

## Lisensi

GPL-3.0 (lihat `LICENSE`), karena memakai Rubber Band. yt-dlp (Unlicense) dan ffmpeg dipanggil sebagai proses terpisah. Catatan lisensi pembungkus WASM ada di `docs/DECISIONS_M0.md`.
