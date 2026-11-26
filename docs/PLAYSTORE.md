# Checklist Rilis Google Play

Edisi Play: **Music Player**, `applicationId` `com.mitra247.musicplayer`. Akun Play Console: **personal**. Edisi pribadi (`com.mitra247.musictools`) tidak dipublikasikan di Play.

Legenda: ✅ sudah ada, ❌ belum ada, ⚠️ perlu diperbaiki / dikonfirmasi.

Terakhir diperbarui: 25 November 2026. Bahan listing dan jawaban Console: [`play-store/README.md`](../play-store/README.md). Rancangan teknis dua edisi: [`README-IT.md`](../README-IT.md) bagian 3.

## 0. Keputusan yang sudah diambil

| Keputusan                                                       | Status                        |
| --------------------------------------------------------------- | ----------------------------- |
| Modul pribadi tidak ikut edisi Play                             | ✅                            |
| Satu repo, dua keluaran (flavors `personal` dan `play`)         | ✅ (diimplementasi di 0.4.0)  |
| `applicationId` pribadi `com.mitra247.musictools`               | ✅ (sudah diterapkan di kode) |
| `applicationId` Play `com.mitra247.musicplayer`                 | ✅ (sudah diterapkan di kode) |
| Nama di toko "Music Player"                                     | ✅                            |
| Lisensi GPL-3.0, tautan sumber dicantumkan di About dan listing | ⚠️ tautan belum dibuat        |

## 1. Akun dan administrasi

| Item                                                                                             | Status           |
| ------------------------------------------------------------------------------------------------ | ---------------- |
| Akun Google Play Console dan biaya pendaftaran                                                   | ✅               |
| Verifikasi identitas developer                                                                   | ✅               |
| Akun personal, maka **closed testing: 12 tester, 14 hari berturut-turut** wajib sebelum produksi | ❌ belum dimulai |
| Daftar email 12 tester (akun Google, mereka harus opt-in)                                        | ❌               |

## 2. Build dan penandatanganan

| Item                                                                 | Status                                |
| -------------------------------------------------------------------- | ------------------------------------- |
| `versionCode` / `versionName` otomatis dari `package.json`           | ✅                                    |
| `targetSdk` 36, `minSdk` 24                                          | ✅                                    |
| Flavor `play` dengan `applicationId` baru                            | ✅                                    |
| Modul pribadi dikeluarkan dari bundel dan manifest `play`            | ✅                                    |
| Keystore upload dan `signingConfigs` (di luar git)                   | ❌                                    |
| Build `.aab` (`bundleRelease`)                                       | ✅ (belum bertanda tangan)            |
| Play App Signing diaktifkan                                          | ❌                                    |
| R8 (`minifyEnabled`, `shrinkResources`) dan keep rules               | ✅ aktif; ⚠️ belum diuji di perangkat |
| Semua ABI didukung (hapus `abiFilters`)                              | ✅                                    |
| 16 KB page size terverifikasi pada AAB                               | ❌                                    |
| Ukuran AAB di bawah batas                                            | ✅ 1,6 MiB                            |
| Skrip gerbang `check:play-clean` (bongkar AAB, cari modul terlarang) | ✅                                    |

## 3. Manifest dan izin

| Item                                                           | Status                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `usesCleartextTraffic="false"`                                 | ✅                                                                                                      |
| `READ_MEDIA_AUDIO` (bukan `MANAGE_EXTERNAL_STORAGE`)           | ✅                                                                                                      |
| Foreground service `mediaPlayback` dan izinnya                 | ✅                                                                                                      |
| Hapus intent filter `SEND text/plain` di edisi Play            | ✅                                                                                                      |
| Hapus `extractNativeLibs` / `useLegacyPackaging` di edisi Play | ✅                                                                                                      |
| `allowBackup`: tinjau, tambahkan `dataExtractionRules`         | ✅ mati di Play                                                                                         |
| `WAKE_LOCK`: pastikan dipakai, jika tidak hapus                | ⚠️                                                                                                      |
| Formulir izin media (`READ_MEDIA_AUDIO`) di Console            | ✅ teks siap (biasanya tidak ada formulir untuk audio)                                                  |
| Deklarasi foreground service (`mediaPlayback`) + video demo    | ✅ teks siap di `play-store/console/permissions-and-foreground-service.md`; ❌ video demo belum direkam |

## 4. Kebijakan dan legal

| Item                                                                                               | Status                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Teks kebijakan privasi (`PRIVACYPOLICY.md`)                                                        | ✅ draf siap                                                                                                |
| URL kebijakan privasi `https://mitra247.com/showcase/musik-player-19/privacy-policy` aktif (HTTPS) | ✅ tayang, email dan isi sudah benar (dicek 26 Nov)                                                         |
| URL kebijakan privasi memakai **HTTPS**                                                            | ✅ sertifikat Let's Encrypt valid                                                                           |
| Halaman memuat teks lengkap tanpa login                                                            | ✅ dicek 26 Nov (tampil penuh di browser). ⚠️ memakai halaman SPA: isi baru tampil setelah JavaScript jalan |
| Email kontak publik diisi di kebijakan dan listing                                                 | ✅ `apps.developer@mitra247.com` di kebijakan; ❌ isi juga di Console                                       |
| Formulir **Data safety**                                                                           | ✅ jawaban siap di `play-store/console/data-safety.md`; ❌ belum diisi di Console                           |
| Kuesioner rating konten (IARC)                                                                     | ✅ jawaban siap di `play-store/console/content-rating.md`; ❌ belum diisi di Console                        |
| Target audiens dan konten                                                                          | ✅ jawaban siap; ❌ belum diisi di Console                                                                  |
| Deklarasi iklan: tidak ada iklan                                                                   | ❌ (isi di Console)                                                                                         |
| Tidak ada merek pihak ketiga yang tidak berhak di nama, ikon, deskripsi, screenshot                | ⚠️ cek saat aset dibuat                                                                                     |
| Riwayat versi di About bebas dari modul pribadi                                                    | ✅                                                                                                          |

## 4b. Login Google dan cadangan Drive (0.5.0)

Rincian: [`docs/GOOGLE_SSO.md`](GOOGLE_SSO.md).

| Item                                                             | Status                                                                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Kode: plugin, klien Drive, UI Akun, tes unit dan e2e             | ✅                                                                                                               |
| Proyek Google Cloud, Drive API, consent screen                   | ✅ dibuat (`music-player-mitra247`, status Testing). ❌ belum In production, logo, dan domain                    |
| OAuth client Android (SHA-1 debug, upload, **Play App Signing**) | ✅ dua client dengan SHA-1 debug; ❌ SHA-1 upload dan Play App Signing menunggu keystore dan aplikasi di Console |
| Uji dengan Google sungguhan di HP (kedua edisi)                  | ✅ masuk, sinkron Drive, gerbang login, blokir, offline (kunci debug)                                            |
| Kebijakan privasi memuat akun Google dan Drive                   | ✅ tayang di `mitra247.com/showcase/musik-player-19/privacy-policy`                                              |
| Data safety: nama, email, konten pengguna (jawaban siap)         | ✅ jawaban; ❌ belum di Console                                                                                  |
| App access: login Google wajib, akun apa pun boleh masuk         | ❌ isi di Console                                                                                                |

## 5. Aset listing

| Item                                                         | Status                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Ikon launcher dan splash                                     | ✅                                                                       |
| Ikon toko 512x512 PNG (32-bit, maks. 1 MB)                   | ✅ `play-store/metadata/android/<locale>/images/icon.png` (cek tampilan) |
| Feature graphic 1024x500                                     | ✅ `images/featureGraphic.jpg`                                           |
| Screenshot ponsel, minimal 2 (ideal 4 sampai 8)              | ✅ 5 buah (`images/phoneScreenshots/`)                                   |
| Screenshot tablet 7 / 10 inci (disarankan)                   | ❌                                                                       |
| Judul (maks. 30 karakter): "Music Player"                    | ✅ `title.txt`                                                           |
| Deskripsi singkat (maks. 80 karakter), Indonesia + Inggris   | ✅ `short_description.txt` (id-ID, en-US)                                |
| Deskripsi lengkap (maks. 4000 karakter), Indonesia + Inggris | ✅ `full_description.txt` (id-ID, en-US)                                 |
| Cek nama "Music Player" tidak bentrok di Play                | ❌ nama umum, risiko tinggi; siapkan nama cadangan                       |

## 6. Kualitas

| Item                                                                  | Status |
| --------------------------------------------------------------------- | ------ |
| Uji Galaxy A23 (Android 14): pemutaran latar, notifikasi, Musik di HP | ✅     |
| Unit test, e2e, ESLint, svelte-check                                  | ✅     |
| Uji mode Folder dan kartu SD, antrean folder, tombol notifikasi       | ❌     |
| Uji Android 15 / 16 dan perangkat lain                                | ❌     |
| Uji izin ditolak, notifikasi ditolak, rotasi, mode gelap              | ❌     |
| Aksesibilitas (label tombol, kontras, target 48 dp)                   | ⚠️     |
| Pre-launch report Play lalu perbaiki temuan                           | ❌     |

## 7. Langkah rilis

1. ~~Implementasikan dua edisi dan keluarkan modul pribadi dari edisi Play.~~ Selesai (0.4.0).
2. Buat keystore upload, aktifkan R8, bangun AAB, jalankan gerbang `check:play-clean`.
3. ~~Alihkan situs ke HTTPS; pasang isi `PRIVACYPOLICY.md`; isi email kontak.~~ Selesai 26 November (halaman tayang dengan email `apps.developer@mitra247.com`).
4. Buat aplikasi di Play Console dan lengkapi **App content**.
5. Siapkan aset listing dan teks dua bahasa.
6. Unggah AAB ke **Internal testing**, lalu **Closed testing** dengan 12 tester selama 14 hari berturut-turut.
7. Perbaiki temuan pre-launch report.
8. Ajukan akses produksi; tinjauan oleh Google biasanya beberapa hari.

## 8. Informasi yang masih dibutuhkan dari pemilik

| Info                                                                  | Dipakai untuk                 |
| --------------------------------------------------------------------- | ----------------------------- |
| Email kontak publik                                                   | Kebijakan privasi dan listing |
| Keystore: dibuat baru atau sudah ada (password diisi pemilik sendiri) | Penandatanganan AAB           |
| Nama cadangan bila "Music Player" sudah dipakai                       | Listing                       |
| Bahasa listing (Indonesia + Inggris?)                                 | Teks toko                     |
| 12 email tester                                                       | Closed testing                |
| Jalur publikasi: manual / semi-otomatis / API                         | Cara unggah AAB               |

## 9. Siapa melakukan apa

| Pihak               | Tugas                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Pengembang (Claude) | Kode dua edisi, build AAB, gerbang kepatuhan, teks listing, jawaban Data safety, screenshot, dokumentasi                   |
| Pemilik akun        | Login Play Console, menerima perjanjian, mengisi dan mengirim deklarasi legal, menekan tombol final "Kirim untuk ditinjau" |
