# Checklist Rilis Google Play

Edisi Play: **Music Player**, `applicationId` `com.mitra247.musicplayer`. Akun Play Console: **personal**. Edisi pribadi (`com.mitra247.musictools`) tidak dipublikasikan di Play.

Legenda: ✅ sudah ada, ❌ belum ada, ⚠️ perlu diperbaiki / dikonfirmasi.

Terakhir diperbarui: 25 November 2026. Rancangan teknis dua edisi: [`README-IT.md`](../README-IT.md) bagian 3.

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

| Item                                                           | Status          |
| -------------------------------------------------------------- | --------------- |
| `usesCleartextTraffic="false"`                                 | ✅              |
| `READ_MEDIA_AUDIO` (bukan `MANAGE_EXTERNAL_STORAGE`)           | ✅              |
| Foreground service `mediaPlayback` dan izinnya                 | ✅              |
| Hapus intent filter `SEND text/plain` di edisi Play            | ✅              |
| Hapus `extractNativeLibs` / `useLegacyPackaging` di edisi Play | ✅              |
| `allowBackup`: tinjau, tambahkan `dataExtractionRules`         | ✅ mati di Play |
| `WAKE_LOCK`: pastikan dipakai, jika tidak hapus                | ⚠️              |
| Formulir izin media (`READ_MEDIA_AUDIO`) di Console            | ❌              |
| Deklarasi foreground service (`mediaPlayback`) + video demo    | ❌              |

## 4. Kebijakan dan legal

| Item                                                                                | Status                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------- |
| Teks kebijakan privasi (`PRIVACYPOLICY.md`)                                         | ✅ draf siap                                |
| URL kebijakan privasi `http://mitra247.com/kebijakan-privasi` aktif                 | ✅                                          |
| URL kebijakan privasi memakai **HTTPS**                                             | ❌ `https://` tidak merespons               |
| Halaman memuat teks lengkap tanpa login (halaman SPA, isi perlu dicek)              | ⚠️                                          |
| Email kontak publik diisi di kebijakan dan listing                                  | ❌ butuh input pemilik                      |
| Formulir **Data safety**                                                            | ❌ saran jawaban di `README-IT.md` bagian 6 |
| Kuesioner rating konten (IARC)                                                      | ❌                                          |
| Target audiens dan konten                                                           | ❌                                          |
| Deklarasi iklan: tidak ada iklan                                                    | ❌ (isi di Console)                         |
| Tidak ada merek pihak ketiga yang tidak berhak di nama, ikon, deskripsi, screenshot | ⚠️ cek saat aset dibuat                     |
| Riwayat versi di About bebas dari modul pribadi                                     | ✅                                          |

## 5. Aset listing

| Item                                                         | Status                                             |
| ------------------------------------------------------------ | -------------------------------------------------- |
| Ikon launcher dan splash                                     | ✅                                                 |
| Ikon toko 512x512 PNG (32-bit, maks. 1 MB)                   | ⚠️ `app-pwa/public/icon-512.png` ada, belum dicek  |
| Feature graphic 1024x500                                     | ❌                                                 |
| Screenshot ponsel, minimal 2 (ideal 4 sampai 8)              | ❌                                                 |
| Screenshot tablet 7 / 10 inci (disarankan)                   | ❌                                                 |
| Judul (maks. 30 karakter): "Music Player"                    | ✅ teks siap                                       |
| Deskripsi singkat (maks. 80 karakter), Indonesia + Inggris   | ❌                                                 |
| Deskripsi lengkap (maks. 4000 karakter), Indonesia + Inggris | ❌ (bahan: `README.md`)                            |
| Cek nama "Music Player" tidak bentrok di Play                | ❌ nama umum, risiko tinggi; siapkan nama cadangan |

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
3. Alihkan situs ke HTTPS; pasang isi `PRIVACYPOLICY.md`; isi email kontak.
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
