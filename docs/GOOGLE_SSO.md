# Login Google dan cadangan Google Drive

Status: **sudah diimplementasikan (0.5.0) dan diuji dengan Google sungguhan di HP untuk kedua edisi (25 November 2026, kunci debug, akun test user).** Proyek Google Cloud `music-player-mitra247` sudah dibuat; yang tersisa: domain, status In production, dan SHA-1 kunci upload serta Play App Signing. Berlaku untuk **semua edisi** (`personal` dan `play`). Terakhir diperbarui: 25 November 2026.

Legenda: ✅ sudah ada, ❌ belum ada, ⚠️ perlu diperbaiki atau diputuskan.

## 1. Keputusan

| Pertanyaan              | Keputusan                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Tujuan                  | **A** (tampilkan nama, email, foto) dan **D** (cadangan preset dan setelan)                  |
| Login wajib?            | **Tidak.** Aplikasi berfungsi penuh tanpa login                                              |
| Server atau Firebase?   | **Tidak keduanya.** Data disimpan di **Google Drive `appDataFolder`** milik pengguna sendiri |
| Berkas audio disinkron? | **Tidak.** Hanya preset dan tiga setelan                                                     |
| Platform                | Aplikasi Android (kedua edisi). Di browser/PWA bagian Akun tidak tampil                      |

Alasan: tanpa server berarti tidak ada akun, basis data pengguna, atau kebocoran data di sisi kami. Cakupan `drive.appdata` tidak sensitif.

## 2. Cara kerja

```
Setelan → Akun Google → [Masuk dengan Google]
      │
      ▼  plugin MusikAuth (Android, AuthorizationClient)
nama, email, foto  +  token akses (cakupan: drive.appdata, email, profile)
      │
      ▼  fetch dari aplikasi web (core/backup/drive.ts)
Google Drive → appDataFolder → musik-backup.json
```

- **Plugin** `MusikAuth` (`app-android/.../MusikAuthPlugin.java`): `signIn` (pemilih akun dan layar izin) dan `getAccessToken` (tanpa layar; menolak dengan `needs_signin` bila perlu izin lagi). Memakai `com.google.android.gms:play-services-auth:21.3.0`. Token tidak disimpan.
- **Klien Drive** (`core/backup/drive.ts`): cari, baca, tulis (buat atau ganti), dan hapus berkas `musik-backup.json` di `appDataFolder`. Bila Drive menjawab 401, meminta token baru satu kali.
- **Isi cadangan** (`core/backup/payload.ts`): `v`, `updatedAt`, `settings` (hanya `musik.engine`, `musik.metronome`, `musik.playmode`), dan `presets` (tanda pengenal lagu `judul|ukuran`, waktu simpan, nilai preset). **Tidak** ada audio, daftar antrean, URL server, token, atau folder.
- **Penggabungan dua arah** (`mergeBackups`): untuk tiap lagu preset yang disimpan terakhir menang. Untuk setelan, nilai di HP ini menang dan yang kosong diisi dari cadangan (berlaku setelah aplikasi dibuka ulang).
- **Mengenali lagu yang sama:** id lagu acak per HP, jadi preset memakai tanda pengenal `judul (huruf kecil) + ukuran berkas` (`songSignature`). Lagu yang sama dengan nama berkas berbeda tidak cocok.
- **Reset ikut tersinkron:** mengembalikan semua ke bawaan kini disimpan sebagai preset bawaan, bukan dihapus.
- **UI:** `app-pwa/src/account/` (`account.svelte.ts`, `AccountPanel.svelte`, `native-auth.ts`), dipakai di `SettingsScreen.svelte`. Sinkron otomatis saat aplikasi dibuka (paling sering tiap 6 jam) bila diaktifkan.
- **Data lokal:** `musik.account` (nama, email, URL foto), `musik.sync.last`, `musik.sync.auto`. "Hapus semua data lokal" ikut melupakan akun.

## 3. Yang harus Anda konfigurasi di Google Cloud (belum dilakukan)

Tanpa langkah ini tombol masuk menampilkan "Login Google belum dikonfigurasi" (kode `config`).

| #   | Langkah                                                                                                                                                                      | Status                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Buat proyek di Google Cloud Console                                                                                                                                          | ✅ `music-player-mitra247`                                                                                        |
| 2   | Aktifkan **Google Drive API** (APIs & Services → Library)                                                                                                                    | ✅                                                                                                                |
| 3   | **OAuth consent screen** (Google Auth Platform): jenis External, nama app, email dukungan, logo, domain, tautan kebijakan privasi (`https://mitra247.com/kebijakan-privasi`) | ⚠️ nama, audiens External, kontak sudah; logo, tautan kebijakan privasi, dan domain menunggu HTTPS `mitra247.com` |
| 4   | Tambahkan cakupan `.../auth/drive.appdata`, `email`, `profile` (semuanya tidak sensitif)                                                                                     | ✅                                                                                                                |
| 5   | Verifikasi domain `mitra247.com` di Search Console (untuk tautan di consent screen)                                                                                          | ❌                                                                                                                |
| 6   | Ubah status ke **In production** (mode Testing: maksimal 100 penguji dan token cepat kedaluwarsa)                                                                            | ❌                                                                                                                |
| 7   | Buat **OAuth client ID** tipe **Android** untuk tiap `applicationId` dan SHA-1 (tabel di bawah)                                                                              | ⚠️ client dibuat untuk kedua nama paket dengan SHA-1 debug; SHA-1 upload dan Play App Signing menyusul            |
| 8   | Tidak perlu client ID Web dan tidak perlu menaruh client ID di kode                                                                                                          | ✅                                                                                                                |

### OAuth client Android yang perlu dibuat

| Edisi      | Nama paket                 | SHA-1 yang didaftarkan                                                                                                                                                                                                             |
| ---------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `personal` | `com.mitra247.musictools`  | Kunci **debug** di PC ini: `BA:AA:A4:76:D0:EF:90:96:BF:B7:CE:6B:DA:18:71:7D:08:09:F5:21`. APK pribadi ditandatangani kunci debug (`assemblePersonalDebug`). Bila nanti memakai kunci rilis sendiri, daftarkan juga SHA-1 kunci itu |
| `play`     | `com.mitra247.musicplayer` | **Tiga**: kunci debug (uji `android:play:apk`), **kunci upload**, dan **kunci Play App Signing** (Play Console → Setup → App signing)                                                                                              |

Kesalahan paling umum: SHA-1 Play App Signing tidak didaftarkan, sehingga login jalan di build debug tetapi gagal di versi dari Play. Satu nama paket boleh punya beberapa OAuth client dengan SHA-1 berbeda.

Mengambil SHA-1 kunci debug atau kunci upload:

```powershell
keytool -list -v -alias androiddebugkey -keystore $env:USERPROFILE\.android\debug.keystore -storepass android
keytool -list -v -alias upload -keystore D:\rahasia\musicplayer-upload.jks
```

## 4. Checklist

### Kode

| Item                                                                                   | Status                        |
| -------------------------------------------------------------------------------------- | ----------------------------- |
| Plugin `MusikAuth` (kompilasi di kedua edisi)                                          | ✅                            |
| Klien Drive `appDataFolder` + tes unit dengan Drive palsu                              | ✅                            |
| Penggabungan, validasi, dan tes unit cadangan                                          | ✅                            |
| UI Akun, sinkron otomatis, keluar, hapus cadangan                                      | ✅                            |
| Tes e2e dua "HP" dengan plugin dan Drive palsu (`e2e/account.mjs`)                     | ✅                            |
| Tanda pengenal lagu di preset dan database v3                                          | ✅                            |
| Pengujian dengan Google sungguhan di HP (kedua edisi, kunci debug)                     | ✅                            |
| Tombol sesuai **pedoman merek Google** ("Sign in with Google")                         | ⚠️ saat ini tombol teks biasa |
| R8: aturan keep untuk `play-services-auth` diuji di perangkat (edisi Play)             | ❌                            |
| HP tanpa Google Play services: pesan `unavailable` tampil (bagian Akun tetap terlihat) | ⚠️ perlu diuji                |
| Cadangan pertama kali: konfirmasi sebelum menggabungkan dengan cadangan yang sudah ada | ⚠️ saat ini langsung digabung |
| Konflik setelan (satu HP mengubah setelan, HP lain tidak ikut)                         | ⚠️ batasan yang diketahui     |
| Menghapus lagu di satu HP tidak menghapus presetnya di HP lain                         | ⚠️ batasan yang diketahui     |

### Kebijakan (edisi Play)

| Item                                                                                             | Status                                     |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Kebijakan privasi memuat akun Google, Drive, data, dan penghapusan (`PRIVACYPOLICY.md`)          | ✅ draf                                    |
| URL kebijakan di `mitra247.com` memakai HTTPS dan isinya sama                                    | ❌                                         |
| Data safety diperbarui (`play-store/console/data-safety.md`)                                     | ✅ jawaban siap; ❌ belum diisi di Console |
| Jalur penghapusan data: **Hapus cadangan di Drive** dan **Hapus semua data lokal** di aplikasi   | ✅                                         |
| URL web untuk permintaan penghapusan data (isi di Data safety): pakai halaman kebijakan bagian 4 | ⚠️ perlu bagian yang jelas di situs        |
| **App access** di Console: login opsional, jelaskan agar reviewer tidak perlu masuk              | ❌ isi di Console                          |
| Listing, README, PRESENTASI tidak lagi berklaim "tanpa akun"                                     | ✅                                         |
| UU PDP Indonesia: tinjau dasar pemrosesan dan hak pengguna                                       | ⚠️ konsultasikan                           |

### Lisensi

| Item                                                                                                                                                                                                        | Status        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `play-services-auth` bersifat proprietary dan dibundel di APK. Risikonya jauh lebih kecil daripada AdMob tetapi tetap perlu ditinjau bersama pertanyaan lisensi Rubber Band (wrapper "GPLv2 saja", GPL-3.0) | ⚠️            |
| Pendapat hukum tertulis sebelum rilis publik                                                                                                                                                                | ❌ disarankan |

## 4b. Temuan dari uji di HP (sudah diperbaiki)

- `AuthorizationClient` mengembalikan token tetapi **tanpa profil**: nama, email, foto kosong. Profil kini diambil dari `https://www.googleapis.com/oauth2/v3/userinfo` dengan token itu (`fetchProfile` di `account.svelte.ts`).
- Objek plugin Capacitor tidak boleh dibungkus `$state` Svelte (proxy-nya menghilangkan method `signIn`). Dipakai `$state.raw`. Tes e2e kini memakai plugin palsu berbentuk Proxy supaya bug ini tertangkap.
- Service worker PWA menyajikan bundel web lama satu kali setelah pembaruan APK. Di aplikasi Android service worker tidak didaftarkan lagi dan yang lama dihapus otomatis (`register-sw.ts`). Pembaruan dari versi sebelum perbaikan ini butuh sekitar dua kali buka aplikasi.

## 5. Menguji di HP

1. Selesaikan bagian 3 untuk edisi pribadi (nama paket `com.mitra247.musictools` + SHA-1 debug di atas).
2. Pasang `npm run android:apk` (`app-personal-debug.apk`) di HP dengan Google Play services.
3. Setelan → Akun Google → **Masuk dengan Google**. Pilih akun, setujui izin Drive.
4. Ubah tempo satu lagu, tekan **Sinkronkan sekarang**. Periksa di drive.google.com → Penyimpanan → Kelola aplikasi (folder data aplikasi tidak bisa dilihat isinya, tetapi ukuran data aplikasi bertambah).
5. Pasang di HP kedua, tambahkan lagu yang sama, masuk dengan akun yang sama, tekan Sinkronkan: tempo dan kunci harus ikut.
6. Coba: keluar, masuk lagi, **Hapus cadangan di Drive**, tanpa internet, cabut akses di myaccount.google.com/permissions.
7. Ulangi untuk edisi Play (`npm run android:play:apk`) setelah OAuth client Play dibuat.

## 6. Kode kesalahan

Plugin menolak dengan kode pendek; pesan Indonesia ada di `ui/i18n/id.ts` (`account.errors`):

| Kode            | Arti                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| `cancelled`     | Pengguna menutup layar masuk                                                  |
| `config`        | `DEVELOPER_ERROR` (10): OAuth client atau SHA-1 belum cocok. Periksa bagian 3 |
| `network`       | Tidak ada internet                                                            |
| `unavailable`   | Tidak ada layanan Google Play di HP                                           |
| `needs_signin`  | Izin perlu diberikan lagi (cabut akses atau token tidak berlaku)              |
| `auth`, `scope` | Drive menolak token atau izin Drive belum diberikan                           |
| `quota`         | Batas permintaan atau Drive penuh                                             |
| `server`        | Drive bermasalah                                                              |
| `failed`        | Lainnya                                                                       |

Log HP: `adb logcat -s MusikAuth`.

## 7. Login wajib dengan daftar pengguna di server (26 November 2026)

Keputusan pemilik: semua pengguna, semua edisi, **login Google wajib sebelum aplikasi dipakai**. Akun Google apa pun boleh masuk (pendaftaran terbuka); emailnya dicatat di MySQL Virtualmin; email dapat **diblokir**; masa tenggang offline **30 hari**; tanpa sesi yang sah, aplikasi **terkunci total**.

Ini menggantikan keputusan awal "login opsional, tanpa server" di bagian 1. Kode, kebijakan privasi, Data safety, dan listing sudah disesuaikan.

### Alur

```
Buka aplikasi (Android)
   │  sesi sah (belum 30 hari)? ── ya ──▶ aplikasi terbuka (tanpa internet pun)
   │ tidak
   ▼
Layar masuk (LoginGate)  ──[Masuk dengan Google]──▶ plugin MusikAuth ──▶ token akses
   ▼
POST https://musik.mitra247.com/api/auth.php {accessToken, edition}
   │  server: tokeninfo Google (aud = client ID edisi ini, email_verified), userinfo (nama)
   │  upsert app_users, tolak bila status = blocked
   ▼
200 {session, exp = +30 hari}  ── disimpan di HP (musik.session)
403 blocked ──▶ tetap terkunci, "Akun ini diblokir"
```

- **Pemeriksaan ulang diam-diam:** saat aplikasi dibuka atau kembali ke depan, bila sesi berumur lebih dari 1 hari dan ada internet, aplikasi meminta token baru (tanpa layar) dan memeriksa ke server. Tanpa internet atau server bermasalah, sesi lama tetap dipakai sampai habis. Bila server menjawab `blocked`, aplikasi langsung terkunci dan melupakan akun.
- **Sesi habis (30 hari tanpa pemeriksaan):** terkunci dengan pesan "Masa berlaku masuk habis. Sambungkan internet lalu masuk lagi."
- **Keluar** (Setelan) menghapus akun dan sesi, aplikasi terkunci. Cadangan di Drive tidak dihapus.
- **Browser biasa (PWA, tanpa plugin Android):** tidak ada gerbang, karena tidak ada login Google di sana.
- Pemutaran dijeda bila aplikasi terkunci saat dipakai.

### Komponen

| Bagian                       | Berkas                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Gerbang dan sesi di aplikasi | `app-pwa/src/account/account.svelte.ts` (`unlocked`, `guard`, `refreshSession`), `LoginGate.svelte`, `App.svelte` |
| Alamat server                | `__AUTH_URL__`: bawaan `https://musik.mitra247.com/api/auth.php`, ubah dengan env `MUSIK_AUTH_URL` saat build     |
| Endpoint PHP                 | `server-auth/public/auth.php`                                                                                     |
| Tabel                        | `server-auth/schema.sql` (`app_users`: email unik, nama, status, edisi, waktu, jumlah masuk)                      |
| Konfigurasi server           | `server-auth/auth-config.example.php` (di luar web root, jangan commit)                                           |
| Panduan pasang               | `server-auth/README.md`                                                                                           |
| Tes                          | `e2e/auth-server.mjs` (PHP + MySQL + Google palsu), `e2e/account.mjs` (gerbang di browser)                        |

Kenapa PHP dan bukan Node: Apache dan HTTPS di Virtualmin sudah melayani `mitra247.com`, tanpa proses baru, dan server Node tetap tanpa dependensi. Server Node untuk YouTube (edisi personal) tidak berubah.

### Status dan yang harus dikerjakan pemilik

| Item                                                                                                            | Status                              |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Kode aplikasi (gerbang, sesi, blokir, offline 30 hari) dan tes e2e                                              | ✅                                  |
| Endpoint PHP dan skema, diuji dengan MariaDB asli dan Google palsu (21 pemeriksaan)                             | ✅                                  |
| Client ID Android sama dengan `aud` token asli di HP (diperiksa untuk kedua edisi)                              | ✅                                  |
| HTTPS dengan sertifikat dipercaya yang mencakup `musik.mitra247.com` (dan `mitra247.com`, sekarang self-signed) | ❌                                  |
| Buat basis data dan pengguna MySQL di Virtualmin, impor `schema.sql`                                            | ❌                                  |
| Pasang `auth.php` di `api/` pada subdomain `musik.mitra247.com`, konfigurasi di luar web root                   | ❌                                  |
| Uji dari HP dengan server sungguhan                                                                             | ❌ (tidak bisa sebelum HTTPS valid) |
| Bangun ulang dan pasang APK **sesudah** server siap (build terkunci tanpa server)                               | ❌                                  |
| Perbarui kebijakan privasi di situs (versi 26 November) dan isi formulir Data safety di Console                 | ❌                                  |
| **App access** di Console: sebutkan login Google wajib dan akun apa pun boleh masuk                             | ❌                                  |

**Peringatan:** APK yang memuat gerbang ini mengunci pemakainya sampai server dapat dihubungi. Jangan pasang di HP yang dipakai sehari-hari sebelum server siap.

### Risiko dan batas

- **Kontrol akses, bukan perlindungan penuh.** Seluruh fitur berjalan di HP; aplikasi yang sengaja dimodifikasi dapat melewati gerbang. Cukup untuk membatasi pengguna biasa dan memblokir penyalahgunaan terang-terangan.
- **Blokir tidak seketika:** berlaku pada pemeriksaan berikutnya (paling lambat sehari setelah online; paling lambat 30 hari bila HP tidak pernah online).
- **Ulasan Play:** login wajib untuk semua pengguna Play umum menaikkan risiko ulasan buruk. Karena pendaftaran terbuka, reviewer dapat memakai akun Google apa pun.
- **UU PDP:** email dan nama kini disimpan di server kami; dasar pemrosesan, masa simpan, dan hak hapus perlu ditinjau (kebijakan memberi jalur hapus lewat email kontak).
- Tanpa pembatasan laju per IP di endpoint (lihat `server-auth/README.md`).
