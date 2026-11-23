# Keputusan: cari dan unduh dari sumber legal (0.2.0)

Permintaan: fitur pencarian dan unduh dari sumber yang sah untuk diunduh. Tab **Cari** di PWA.

## Pilihan arsitektur: langsung dari browser, tanpa server

Diuji pada 2026-11-23 dari origin `https://musik.mitra247.com` (browser pane):

| Sumber            | Pencarian (CORS)                                                  | Berkas audio (CORS, Range)                                           |
| ----------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Internet Archive  | `advancedsearch.php` dan `metadata/<id>` terbuka; tanpa kunci API | `archive.org/download/...` dialihkan ke `*.archive.org`, 206 terbuka |
| Openverse         | `api.openverse.org/v1/audio/` anonim, terbuka                     | CDN asal (mis. Freesound) terbuka; host lain **bisa** menolak CORS   |
| Wikimedia Commons | `commons.wikimedia.org/w/api.php` dengan `origin=*`               | `upload.wikimedia.org` terbuka                                       |

Karena ketiganya mengizinkan CORS, tidak perlu proxy di server. Ini menghindari SSRF di server dan tidak menambah beban cPanel. Server YouTube tetap tidak berubah (URL tetap dibangun dari ID video).

Konsekuensi: bila satu host berkas menolak CORS (terutama hasil Openverse dari penyedia lain), unduhan gagal dengan pesan jelas dan tautan "Buka halaman sumber" tetap ada; berkasnya bisa diimpor manual lewat Library.

## Sumber yang tidak dipakai

- **Jamendo langsung**: butuh `client_id`; sudah ikut lewat Openverse.
- **Free Music Archive**: API ditutup / butuh kunci.
- **Bandcamp, SoundCloud**: tidak ada API publik untuk unduhan sah; hanya jalur resmi artis.

## Aturan lisensi (`core/sources/license.ts`)

- Hanya CC (BY, BY-SA, BY-NC, BY-ND, BY-NC-SA, BY-NC-ND), CC0, dan domain publik.
- Tidak dikenali, kosong, atau "all rights reserved" = **hasil dibuang**, tidak ditebak.
- NC dan ND ditandai di daftar; unduhan tetap boleh untuk latihan pribadi. Membagikan ulang tunduk pada syarat lisensi, dan atribusi disimpan di Library (`SongMeta.credit`; `attributionLine()` membuat teksnya).

## Detail per sumber

- **Internet Archive**: query `(kata) AND mediatype:audio AND licenseurl:* AND -collection:(librivoxaudio OR audio_bookspoetry OR podcasts)`; karakter khusus Lucene diganti spasi. Hasil adalah item (album); berkasnya dimuat saat dibuka: MP3 terbaik, lalu Ogg Vorbis, lalu MP3 64 kbps; maks 100 berkas.
- **Openverse**: `category=music`; hanya URL https dan lisensi dikenali. Catatan: beberapa hasil Freesound adalah _preview_ (hq), bukan berkas asli.
- **Wikimedia Commons**: `filetype:audio`, namespace berkas, lisensi dari `LicenseUrl` lalu `LicenseShortName`; nama pencipta dibersihkan dari HTML.

## Unduhan (`core/sources/download.ts`)

Hanya https, tipe isi audio (atau `octet-stream` dengan tipe cadangan dari sumber), batas 200 MB (dicek dari header dan saat streaming), progres, nama berkas aman. Hasil disimpan dengan `LibraryStore.add(file, 'web', { title, credit })`.

## Pengujian

- `core/sources/sources.test.ts`: 18 uji dengan `fetch` palsu (lisensi, tiap sumber, kegagalan sebagian, unduhan, batas ukuran, atribusi).
- `e2e/search.mjs`: 17 pemeriksaan di Chromium dengan jaringan di-mock (pencarian tiga sumber, hasil tanpa lisensi disembunyikan, album, unduh, kredit tersimpan, putar, lisensi di Library, satu sumber gagal, chip sumber).
- Verifikasi nyata ke tiga API: manual di browser pane (pencarian dan unduhan 1 KB per sumber lewat Range).

## Belum teruji

- Unduhan penuh dari tiap sumber nyata pada A23 (ukuran besar, jaringan seluler).
- Openverse dengan penyedia selain Freesound / Wikimedia (CORS bisa berbeda).
- Batas laju anonim ketiga API pada pemakaian berat.
