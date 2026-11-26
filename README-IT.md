# Music Player (Musik Tools) — Panduan Tim IT

Dokumen teknis untuk developer, analis, dan tim IT. Untuk penjelasan umum bagi tim operasional lihat [`README.md`](README.md). Untuk materi penjualan lihat [`PRESENTASI.md`](PRESENTASI.md). Kebijakan privasi: [`PRIVACYPOLICY.md`](PRIVACYPOLICY.md). Checklist rilis Google Play: [`docs/PLAYSTORE.md`](docs/PLAYSTORE.md).

Sumber kebenaran produk: [`docs/PRD.md`](docs/PRD.md). Lisensi **GPL-3.0** (lihat `LICENSE`).

## 1. Ringkasan teknis

Aplikasi latihan musik: pemutar, pengubah tempo tanpa mengubah nada, transpose, Minus One (DSP klasik, tanpa AI), loop A-B, equalizer 5 pita, metronom, preset per lagu, library lokal, dan pencarian musik legal (CC / domain publik). Satu basis kode web (TypeScript + Svelte + Web Audio + WASM) dibungkus Capacitor 8 menjadi aplikasi Android, plus PWA dan ekstensi Chrome.

| Lapisan   | Teknologi                                                                      |
| --------- | ------------------------------------------------------------------------------ |
| UI        | Svelte 5, Vite 8, TypeScript 5.9, string Indonesia di `ui/i18n/id.ts`          |
| Audio     | Web Audio API, AudioWorklet, Rubber Band WASM (R2 bawaan, R3 opsional)         |
| Penyimpan | OPFS + IndexedDB (Library), `localStorage` (setelan, antrean terakhir)         |
| Android   | Capacitor 8, plugin native `MusikNative` (Java), `PlaybackService`, MediaStore |
| Uji       | Vitest (unit), Playwright (e2e), ESLint, Prettier, svelte-check                |

## 2. Struktur repo

| Folder         | Isi                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `core/`        | Mesin audio, library, antrean, mode putar, logika latihan, sumber musik legal (`core/sources`)        |
| `ui/`          | Komponen Svelte bersama, tema, string                                                                 |
| `app-pwa/`     | PWA (Vite). Halaman lab audio di `/lab/`                                                              |
| `app-android/` | Proyek Android (Capacitor) dan plugin native                                                          |
| `ext-chrome/`  | Ekstensi MV3. Tidak ikut edisi Google Play                                                            |
| `server/`      | Layanan Node untuk fitur edisi pribadi. Tidak ikut edisi Google Play                                  |
| `scripts/`     | Skrip build / deploy lintas platform (Node)                                                           |
| `e2e/`         | Uji Playwright                                                                                        |
| `docs/`        | PRD, keputusan per fase (`DECISIONS_*.md`), daftar uji manual, panduan Android dan deploy, Play Store |

## 3. Dua edisi dari satu repo

Satu repo menghasilkan dua keluaran. Pemisahan dilakukan saat build, bukan dengan menyalin kode.

| Edisi      | applicationId              | Nama di perangkat | Tujuan                       | Keluaran                |
| ---------- | -------------------------- | ----------------- | ---------------------------- | ----------------------- |
| `personal` | `com.mitra247.musictools`  | Musik Tools       | Pemakaian internal / pribadi | APK (`assembleRelease`) |
| `play`     | `com.mitra247.musicplayer` | Music Player      | Distribusi Google Play       | AAB (`bundleRelease`)   |

Edisi `play` tidak boleh memuat modul pribadi apa pun: kode, pustaka native, izin manifest, intent filter, string UI, dan riwayat versi. Dua `applicationId` berbeda membuat kedua edisi bisa terpasang berdampingan di satu HP.

> **Status:** sudah diimplementasikan di versi 0.4.0. Edisi `play` sudah menghasilkan AAB yang lolos pemeriksaan kebersihan. Belum dikerjakan: keystore upload, uji di perangkat edisi Play (terutama R8), dan semua langkah Play Console (bagian 9).

### 3.1 Cara kerja

1. **Gradle product flavors** (dimensi `edition`) di `app-android/android/app/build.gradle`:
   - `personal`: `applicationId "com.mitra247.musictools"`, `resValue app_name "Musik Tools"`.
   - `play`: `applicationId "com.mitra247.musicplayer"`, `resValue app_name "Music Player"`.
   - `namespace` tetap `com.musik.tools`. Namespace tidak sama dengan `applicationId`, jadi paket Java tidak perlu dipindah.
2. **Source set per edisi**:
   - `src/personal/` memuat kode, dependensi (`personalImplementation`), `abiFilters`, dan entri manifest khusus edisi pribadi.
   - `src/play/` memuat implementasi pengganti yang kosong (stub) dengan antarmuka sama, tanpa dependensi tambahan.
   - `MusikNativePlugin` memanggil antarmuka itu, sehingga file plugin tunggal tetap sama untuk dua edisi.
   - `src/main/AndroidManifest.xml` hanya memuat yang dipakai bersama.
3. **Flag edisi di web**: `VITE_EDITION=personal|play` dibaca `vite.config.ts` menjadi `__EDITION__`. Navigasi, layar, setelan, dan modul klien edisi pribadi dibungkus kondisi `__EDITION__ === 'personal'` sehingga terhapus total dari bundel `play` (dead-code elimination). Keluaran: `out/app-personal` dan `out/app-play`.
4. **Aset web per edisi**: Gradle menyalin `out/app-<edisi>` ke `assets/public` milik flavor (`sourceSets.<flavor>.assets.srcDirs`). `capacitor.config.json` dibuat per edisi (`appId`, `appName`).
5. **Riwayat versi di About**: dibaca dari `CHANGELOG.md` saat build web. Edisi `play` memakai berkas hasil saringan (entri yang ditandai khusus pribadi dibuang) agar tidak membocorkan modul pribadi. Aturan penandaan ditetapkan saat implementasi.
6. **Penandatanganan**: `keystore.properties` di luar git. `signingConfigs.play` hanya dipakai `bundleRelease`. Aktifkan Play App Signing dan simpan upload key di tempat aman.
7. **Gerbang kepatuhan (CI / skrip)**: setelah build AAB `play`, skrip membongkar AAB dan gagal bila ditemukan string modul pribadi, pustaka native pribadi, atau izin / intent filter terlarang. Ini pagar utama agar kebijakan Play tidak terlanggar karena regresi.
8. **Perintah**:

   | Perintah                                             | Hasil                                                                         |
   | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
   | `npm run android:apk` (alias `android:personal:apk`) | APK debug edisi pribadi: `app/build/outputs/apk/personal/debug/`              |
   | `npm run android:play:aab`                           | AAB release edisi Play + pemeriksaan: `app/build/outputs/bundle/playRelease/` |
   | `npm run android:play:apk`                           | APK debug edisi Play untuk dicoba di HP                                       |
   | `npm run build:play`                                 | Web edisi Play saja, ke `out/app-play`                                        |
   | `npm run check:play-clean [berkas.aab]`              | Gagal bila ada sisa modul pribadi di web (dan di AAB/APK bila diberi berkas)  |
   | `npm run test:e2e:play`                              | Build web Play, uji `e2e/play.mjs`, dan pemeriksaan kebersihan                |

### 3.2 Perubahan manifest edisi `play`

| Item                                                                            | Edisi `play`                                 |
| ------------------------------------------------------------------------------- | -------------------------------------------- |
| `INTERNET`                                                                      | Ada (pencarian dan unduhan musik legal)      |
| `READ_MEDIA_AUDIO`, `READ_EXTERNAL_STORAGE` (maks. SDK 32)                      | Ada                                          |
| `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Ada                                          |
| `WAKE_LOCK`                                                                     | Ada, hapus bila tidak dipakai setelah audit  |
| Intent filter `SEND text/plain`                                                 | **Dihapus**                                  |
| `extractNativeLibs`, `useLegacyPackaging`                                       | **Dihapus** (hanya dibutuhkan modul pribadi) |
| `abiFilters`                                                                    | **Dihapus**, semua ABI didukung              |
| `allowBackup`                                                                   | Tinjau; tambahkan `dataExtractionRules`      |
| `usesCleartextTraffic`                                                          | `false` (tetap)                              |

## 4. Mulai cepat (developer)

Prasyarat: Node >= 20 dan Git. Untuk Android: JDK 21 dan Android SDK 36 (lihat `docs/ANDROID.md`).

```powershell
npm install
npm run dev              # app di http://localhost:5173/ , lab di /lab/
npm run lint             # ESLint + Prettier --check
npm run typecheck        # tsc + svelte-check
npm test                 # unit (core, server, skrip)
npm run build            # out/app (PWA) dan out/server
npm run android:apk      # APK debug edisi pribadi
npm run android:play:aab # AAB edisi Google Play + pemeriksaan kebersihan
```

Uji end-to-end (Playwright memakai Chrome sistem):

```powershell
npm run test:e2e
```

Catatan Windows: Gradle gagal bila `TEMP` terlalu panjang. `scripts/android.mjs` memakai `TEMP=C:\gt`.

## 5. Arsitektur singkat

- **Mesin audio** (`core/audio`): graf Web Audio dengan AudioWorklet yang menjalankan Rubber Band WASM. Tempo 0,25-2x dan kunci +-12 semitone, bypass pada rasio 1,0.
- **Minus One** (`core/audio`): tiga mode (Dasar, Jaga bass, Fokus vokal), pembatalan kanal tengah dan mid/side. Bukan AI; hasil bervariasi menurut rekaman, rekaman mono menjadi senyap.
- **Library** (`core/library`): OPFS + IndexedDB, antrean (`queue.ts`), mode putar acak / ulangi (`playmode.ts`), lagu terakhir (`lastplayed.ts`), tampilan folder (`folders.ts`).
- **Latihan** (`core/practice`): loop A-B, equalizer, metronom, preset per lagu.
- **Sumber musik legal** (`core/sources`): Internet Archive, Openverse, Wikimedia Commons. Hanya lisensi CC / domain publik. Unduhan hanya `https`, hanya tipe audio, maksimal 200 MB, disimpan dengan atribusi.
- **Akun dan cadangan** (`app-pwa/src/account`, `core/backup`, plugin `MusikAuth`): login Google **wajib** (gerbang) dan cadangan preset ke `appDataFolder` di Drive pengguna. Verifikasi dan daftar pengguna lewat `server-auth/` (PHP + MySQL di Virtualmin). Semua edisi. Detail, konfigurasi Google Cloud, dan checklist: `docs/GOOGLE_SSO.md`.
- **Android** (`app-android`): `PlaybackService` (foreground service `mediaPlayback`, wake lock, MediaSession), `MusikNativePlugin` (MediaStore lewat `listAudio`, pemilih folder), jembatan di `app-pwa/src/native*.ts`. Detail: `docs/ANDROID.md`.

## 6. Data dan jaringan (untuk Data safety)

Edisi `play` hanya berkomunikasi dengan tiga layanan pihak ketiga, dan hanya saat pengguna memakai layar **Cari**:

| Host                    | Dipakai untuk        | Data keluar dari HP   |
| ----------------------- | -------------------- | --------------------- |
| `archive.org`           | Cari dan unduh musik | Kata kunci, alamat IP |
| `api.openverse.org`     | Cari musik           | Kata kunci, alamat IP |
| `commons.wikimedia.org` | Cari dan unduh musik | Kata kunci, alamat IP |

Tidak ada analitik, pelacakan, atau iklan. Login Google wajib; email dan nama pengguna dicatat di MySQL milik kami lewat `server-auth/public/auth.php` (lihat `docs/GOOGLE_SSO.md` bagian 7). Daftar musik, lagu, setelan, dan antrean terakhir hanya ada di perangkat. Izin Android: `READ_MEDIA_AUDIO` (membaca daftar dan isi lagu di HP), `POST_NOTIFICATIONS` (kontrol pemutaran).

Bila pengguna masuk dengan Google: HP berbicara dengan `googleapis.com` (Drive `appDataFolder`, cakupan `drive.appdata`) dan layanan Google Play untuk otorisasi. Data yang masuk ke Drive pengguna: preset per lagu (dengan judul dan ukuran lagu) dan tiga setelan. Nama, email, foto hanya disimpan di HP. Token tidak disimpan.

Saran pengisian **Data safety** (konfirmasi sebelum kirim):

- Data pribadi dikumpulkan: tidak ada.
- Kata kunci pencarian dikirim ke layanan pihak ketiga: tinjau apakah dideklarasikan sebagai "Aktivitas aplikasi > Riwayat pencarian dalam aplikasi, dibagikan". Pilihan paling aman: deklarasikan.
- Enkripsi dalam perjalanan: ya (hanya `https`).
- Penghapusan data: pengguna bisa menghapus di aplikasi ("Hapus semua data lokal") atau lewat uninstall.

Teks kebijakan: [`PRIVACYPOLICY.md`](PRIVACYPOLICY.md). URL publik: `http://mitra247.com/kebijakan-privasi` (wajib dialihkan ke HTTPS sebelum pengajuan).

## 7. Pengujian

| Jenis      | Perintah / berkas                                            |
| ---------- | ------------------------------------------------------------ |
| Unit       | `npm test` (`core/**/*.test.ts`, `scripts/scripts.test.mjs`) |
| End-to-end | `npm run test:e2e` (`e2e/*.mjs`)                             |
| Manual HP  | `docs/TEST_A23.md` (Samsung Galaxy A23, Android 14)          |
| Statis     | `npm run lint`, `npm run typecheck`                          |

Status uji perangkat: pemutaran latar, notifikasi, dan Musik di HP lulus di A23. Belum diuji di perangkat: mode Folder (termasuk kartu SD), antrean dari folder, tombol Berikutnya / Sebelumnya di notifikasi, dan sebagian uji M3 / M4 / Cari (`docs/TEST_A23.md`).

## 8. Rilis

- **Edisi pribadi:** build lokal, repo hasil build `musik-deploy`, alur di `docs/DEPLOY.md`. Prosedur "deploy" yang berlaku: build, siapkan, commit, tag, push dengan pesan dari perubahan nyata.
- **Edisi Play:** AAB bertanda tangan, unggah ke Google Play Console. Checklist lengkap dan status: [`docs/PLAYSTORE.md`](docs/PLAYSTORE.md).
- Versi diambil dari `package.json`. `versionCode` = mayor x 10000 + minor x 100 + patch. Nilai harus naik di tiap unggahan Play.

## 9. Rencana Selanjutnya (To Do)

Urutan prioritas. Status: belum dikerjakan kecuali ditulis lain.

### Prioritas 1: rilis Google Play

0. **Konfigurasi Google Cloud untuk login Google** (consent screen, OAuth client Android dengan SHA-1, Drive API) dan uji di HP: `docs/GOOGLE_SSO.md` bagian 3 dan 5. Kode sudah siap; tanpa ini login menampilkan "belum dikonfigurasi".

1. ~~Implementasi dua edisi (bagian 3)~~ **selesai** (0.4.0).
2. ~~Pindahkan kode modul pribadi ke `src/personal/`, stub `src/play/`~~ **selesai**.
3. ~~Hapus layar, navigasi, dan setelan modul pribadi dari bundel `play`~~ **selesai**.
4. ~~Riwayat versi (About) untuk edisi `play`~~ **selesai** (`CHANGELOG-PLAY.md`).
5. `signingConfigs` dan `bundleRelease` **selesai**; **keystore upload belum dibuat** (password diisi sendiri oleh pemilik).
6. R8 dan keep rules **sudah aktif**; **uji di perangkat belum**. Pasang `android:play:apk` dan coba semua layar sebelum unggah.
7. ~~Skrip gerbang `check:play-clean`~~ **selesai**.
8. Ukuran AAB 1,6 MiB (terukur). Verifikasi 16 KB page size: **belum**.
9. `allowBackup` sudah mati di Play. Tinjau `WAKE_LOCK` dan manifest akhir: **belum**.
10. Alihkan `mitra247.com` ke HTTPS; pastikan halaman kebijakan menampilkan isi `PRIVACYPOLICY.md` dan email kontak sebenarnya.
11. Lengkapi Play Console: Data safety, rating konten, deklarasi foreground service + video demo, izin media, target audiens.
12. Aset toko: ikon 512, feature graphic 1024x500, screenshot ponsel (dan tablet), teks listing Indonesia + Inggris.
13. Closed testing 12 tester selama 14 hari berturut-turut (akun personal), lalu ajukan produksi.

### Prioritas 2: kualitas

1. Uji di Android 14 / 15 / 16 selain A23, dan flow izin / notifikasi ditolak.
2. Selesaikan uji A23 yang tertunda (Folder, kartu SD, antrean, tombol notifikasi, M3, M4, Cari).
3. Aksesibilitas: label tombol ikon, kontras, target sentuh 48 dp.
4. Pantau Android Vitals di Play Console setelah rilis.
5. Perbarui `docs/ANDROID.md`, `docs/DEPLOY.md`, dan `docs/TEST_A23.md` per edisi.

### Prioritas 3: fitur (dari `docs/PROPOSALS.md`)

1. Ekspor / impor Library dan preset.
2. Loop A-B: waktu numerik, penyesuaian halus, beberapa loop bernama.
3. Metronom: tap tempo dan ikut tempo lagu.
4. Deteksi kunci dan BPM, untuk mengisi BPM metronom otomatis.
5. Tampilan kurva respons equalizer.
6. Bagikan berkas audio dari aplikasi lain ke aplikasi ("Buka & putar").

## 10. Dokumentasi

| Berkas                             | Isi                                                                 |
| ---------------------------------- | ------------------------------------------------------------------- |
| `README.md`                        | Penjelasan umum untuk tim operasional                               |
| `README-IT.md`                     | Dokumen ini                                                         |
| `PRESENTASI.md`                    | Materi presentasi tim Sales                                         |
| `PRIVACYPOLICY.md`                 | Kebijakan privasi                                                   |
| `play-store/`                      | Bahan listing Play (teks, gambar) dan jawaban Console               |
| `docs/GOOGLE_SSO.md`               | Login Google dan cadangan Drive: cara kerja, konfigurasi, checklist |
| `docs/PLAYSTORE.md`                | Checklist rilis Google Play dan statusnya                           |
| `docs/PRD.md`                      | Kebutuhan produk dan Decision Log                                   |
| `docs/ANDROID.md`                  | Aplikasi Android, build, status uji                                 |
| `docs/DEPLOY.md`                   | Repo, build, deploy edisi pribadi                                   |
| `docs/DECISIONS_M0.md` ... `M4.md` | Keputusan teknis dan bukti per fase                                 |
| `docs/DECISIONS_SOURCES.md`        | Sumber musik legal                                                  |
| `docs/TEST_A23.md`                 | Daftar uji manual di HP                                             |
| `CHANGELOG.md`                     | Ringkasan perubahan per versi                                       |

## 11. Lisensi

GPL-3.0 karena memakai Rubber Band. Sumber kode harus tersedia bagi pengguna; cantumkan tautan repo di layar Tentang dan di listing Play. Catatan lisensi pembungkus WASM ada di `docs/DECISIONS_M0.md`.
