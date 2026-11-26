# Changelog

Satu pengguna, tanpa rilis publik; versi dipakai untuk tag repo deploy (`v<versi>`) dan rollback.

## 0.5.2 (2026-11-26)

- `auth.php` menerima token dari **semua OAuth client di proyek Google Cloud ini**, lewat `client_id_prefixes` di `api/auth-config.php` (contoh: `['653398046329-']`), selain daftar `client_ids`. Client baru untuk kunci upload atau kunci Play App Signing tidak perlu mengubah konfigurasi server lagi. **Tambahkan baris `client_id_prefixes` ke `api/auth-config.php` di server** (lihat `auth-config.example.php`).
- Kunci keystore Play: password tidak lagi disimpan di `keystore.properties`; `npm run android:play:aab` menanyakannya saat build (input tersembunyi, dicek ke keystore), atau memakai `MUSIK_STORE_PASSWORD`. `build.gradle` membaca password dari lingkungan bila berkas tidak memuatnya.
- Dokumen: reviewer Play tidak boleh membuat akun atau memakai akun pribadi, jadi Sign in details butuh akun Google uji khusus.

## 0.5.1 (2026-11-26)

- `server-auth/public/auth.php` kini mencatat kode dan pesan SQL ke log server saat koneksi atau kueri MySQL gagal (sebelumnya hanya nama kelas), supaya sebab `500 db` bisa dibaca di `error_log`. Tidak dikirim ke aplikasi.
- Pesan error layar masuk: kegagalan server login kini berbunyi "Server login sedang bermasalah" (sebelumnya memakai pesan Google Drive yang menyesatkan).
- Gerbang login diuji di HP dengan server sungguhan untuk kedua edisi: masuk, sesi 30 hari, keluar mengunci aplikasi, masuk lagi.

## 0.5.0 (2026-11-25)

- **Akun Google opsional dan cadangan ke Google Drive (semua edisi).** Setelan punya bagian **Akun Google**: masuk dengan Google, lalu preset latihan per lagu (tempo, kunci, loop, equalizer, Minus One) dan tiga setelan (`musik.engine`, `musik.metronome`, `musik.playmode`) disinkronkan ke folder data aplikasi tersembunyi (`appDataFolder`, cakupan `drive.appdata`) di Drive milik pengguna sendiri. Tanpa server kami dan tanpa Firebase. Lagu tidak ikut. Tombol: Sinkronkan sekarang, sinkron otomatis saat aplikasi dibuka (paling sering tiap 6 jam), Keluar, Hapus cadangan di Drive. Sinkron adalah penggabungan dua arah: preset yang disimpan terakhir menang untuk tiap lagu; untuk setelan, nilai di HP ini menang dan yang kosong diisi dari cadangan.
- Plugin native baru `MusikAuth` (`AuthorizationClient` dari `play-services-auth`) mengembalikan nama, email, foto, dan token akses; permintaan Drive dibuat dari aplikasi web (`core/backup/drive.ts`). Token tidak disimpan. Perlu OAuth client Android (nama paket + SHA-1) di Google Cloud untuk tiap `applicationId`: lihat `docs/GOOGLE_SSO.md`. Di browser biasa bagian Akun tidak tampil.
- Preset kini juga menyimpan tanda pengenal lagu (judul + ukuran berkas) supaya lagu yang sama dikenali di HP lain. Database lokal naik ke versi 3 (indeks `sig`). Mengembalikan semua nilai ke bawaan sekarang disimpan sebagai preset bawaan (bukan dihapus) agar pembatalan ikut tersinkron.
- **Login Google wajib (gerbang) di semua edisi Android.** Sebelum aplikasi dipakai, pengguna masuk dengan Google. Aplikasi mengirim token ke server (`server-auth/public/auth.php`, PHP + MySQL di Virtualmin), yang memverifikasinya ke Google, mencatat email dan nama (pendaftaran terbuka), dan mengembalikan sesi 30 hari. Aplikasi berjalan tanpa internet selama sesi berlaku, memeriksa ulang diam-diam bila sesi berumur lebih dari sehari, dan terkunci bila sesi habis atau email diblokir (`UPDATE app_users SET status='blocked'`). Rancangan, pemasangan server, dan batas: `docs/GOOGLE_SSO.md` bagian 7 dan `server-auth/README.md`. Kebijakan privasi, Data safety, dan listing disesuaikan.
- `npm run deploy:prepare` ikut menyalin `server-auth/public/auth.php` dan `auth-config.example.php` ke `musik-deploy/api/`, sehingga `git pull` di server cukup. `api/auth-config.php` (rahasia) ada di `.gitignore` deploy dan tidak pernah ditimpa. Alamat endpoint: `https://musik.mitra247.com/api/auth.php`.
- Pemeriksaan sesi tidak lagi terlewat saat sinkron Drive sedang berjalan.
- Akhir antrean: setelah lagu terakhir selesai dengan ulang mati, posisi kembali ke 0:00 dan tampil "Antrean selesai".
- Perbaikan hasil uji di HP: profil Google (nama, email, foto) kini diambil lewat `userinfo` karena `AuthorizationClient` hanya mengembalikan token; plugin Capacitor tidak lagi dibungkus `$state`; aplikasi Android tidak memakai service worker lagi sehingga pembaruan langsung tampil.
- Uji: `core/backup/backup.test.ts` (gabungan, validasi, klien Drive dengan Drive palsu) dan `e2e/account.mjs` (dua "HP", Drive dan plugin palsu).

## 0.4.0 (2026-11-25)

- **Dua edisi dari satu repo.** Build Android kini punya dua product flavor: `personal` (`com.mitra247.musictools`, "Musik Tools", APK) dan `play` (`com.mitra247.musicplayer`, "Music Player", AAB untuk Google Play). Edisi `play` tidak memuat modul pribadi (kode, pustaka native, izin dan intent filter, layar, string, riwayat versi); `scripts/check-play-clean.mjs` memeriksanya pada hasil build web dan AAB.
- **Perhatian**: `applicationId` edisi pribadi berubah dari `com.musik.tools` menjadi `com.mitra247.musictools`. Android menganggapnya aplikasi baru yang terpasang berdampingan dengan yang lama; Library dan setelan lama tidak ikut pindah. Simpan MP3 yang masih perlu, pasang versi baru, lalu hapus yang lama.
- Plugin native dipecah: `MusikNative` (musik di HP, pemutaran latar, notifikasi; semua edisi) dan `MusikPersonal` (downloader, folder simpan MP3, tautan yang dibagikan; hanya edisi pribadi). Di web, kode pribadi berada di `app-pwa/src/personal/` dan diganti stub `personal-stub/` pada edisi Play (alias `@personal`).
- Perintah baru: `npm run android:play:aab`, `android:play:apk`, `build:play`, `check:play-clean`, `test:e2e:play`. `npm run android:apk` tetap membangun APK edisi pribadi.
- Edisi Play: R8 aktif (`minifyEnabled`, `shrinkResources`) dengan aturan keep untuk plugin Capacitor, semua ABI didukung, `allowBackup` mati, penandatanganan lewat `keystore.properties` (tidak masuk git). Riwayat versi memakai `CHANGELOG-PLAY.md`.
- Uji: `e2e/play.mjs` (empat tab, tanpa panel pribadi, nama Music Player, riwayat versi Play) dan uji unit untuk `CHANGELOG-PLAY.md`.

## 0.3.4 (2026-11-25)

- **Perbaikan**: pencarian YouTube di 0.3.3 gagal ("Unable to handle request: Unsupported url scheme ytsearchdate15"), di server maupun APK, karena yt-dlp tidak lagi punya `ytsearchdate:`. Pencarian kini membaca halaman hasil YouTube (`results?search_query=...`, hanya video), dibatasi satu halaman per permintaan dengan `--playlist-items`. Terbukti dengan yt-dlp 2026.10.26 asli dan di HP. **Batasan**: urutan "terbaru dulu" tidak bisa dijamin; permintaan urut tanggal (`sp=`) diabaikan YouTube lewat yt-dlp, jadi urutannya mengikuti YouTube (relevansi). Uji lama lolos karena yt-dlp palsu menerima awalan apa saja; yt-dlp palsu kini hanya mengenali URL halaman hasil.

## 0.3.3 (2026-11-25)

- **YouTube: pencarian berhalaman.** Hasil 15 per halaman, dan halaman berikutnya dimuat otomatis saat daftar digulir (tombol **Muat lebih banyak** sebagai cadangan; maks. 150 hasil). Server: `GET /api/search?q=&offset=` kini mengembalikan `hasMore`. Android: `ytSearch` menerima `offset`.
- Tiap hasil punya **Putar** (cuplikan lewat embed YouTube di panel yang menempel di atas layar; pemutar utama dijeda) dan **Konversi**. Konversi tidak lagi membuka layar Putar atau memutar lagu sendiri; lagu diputar hanya lewat tombol **Putar** di antrean.
- **Antrean konversi**: video diproses satu per satu, dengan jeda acak 5-10 detik (hitung mundur terlihat) sebelum video berikutnya. Selama antrean jalan, hasil lain tetap bisa digulir, dicuplik, atau ditambah. Item gagal punya **Coba lagi**; item bisa dihapus.
- **Judul disingkat** menjadi "Lagu - Artis" (mis. "Sheila On 7 - Dan (Official Music Video)" menjadi "Dan - Sheila On 7"); tanpa pemisah, nama kanal dipakai sebagai artis. Dipakai di daftar, antrean, nama berkas MP3, dan judul di Library. Logika di `core/api/title.ts`.
- Uji: `core/api/title.test.ts`, `server/src/search.test.ts`, `e2e/ytsearch.mjs` (halaman, cuplikan, antrean, jeda), `e2e/m2.mjs`.

## 0.3.2 (2026-11-24)

- Layar **Putar** didesain ulang: kartu "sedang diputar" (sampul gradien dari judul, asal daftar, nomor urut, artis, lencana tempo / kunci / loop / Minus One), gelombang suara, deretan kontrol modern (Acak, Sebelumnya, Putar besar, Berikutnya, Ulangi; lalu 5 detik mundur, Berhenti, 5 detik maju, Auto next), dan dua tab: **Antrean** dan **Latihan**. Latihan memuat tempo dan kunci, loop A-B, equalizer, metronom, volume, dan Minus One dalam kartu yang tertata. Tab terakhir yang dipakai diingat.
- Tab **Latihan** kini ringkas dan muat di layar HP tanpa menggulir: kartu lagu mengecil (sampul 52 px, satu baris judul), gelombang lebih pendek, tombol Putar lebih kecil, tombol **Acak, Auto next, Berhenti** dan **Simpan ke Library** disembunyikan (tetap ada di tab Antrean), tempo dan kunci memakai pencacah ringkas, dan Alat latihan serta volume / Minus One digabung dalam satu kartu. Di mode Latihan, **Ulangi lagu ini** menjadi bawaan; pengaturan Ulangi yang biasa kembali saat keluar dari Latihan, kecuali Anda mengubahnya sendiri di dalam Latihan.
- Tab **Antrean** menampilkan daftar lagu yang sedang diputar (dari Library, Musik di HP, atau folder simpan) dengan lagu yang diputar ditandai dan penanda animasi; ketuk baris untuk langsung memutar lagu itu. Daftar bergulir sendiri ke lagu yang sedang diputar dan memuat ribuan lagu tanpa lambat.
- **Lagu terakhir diputar**: antrean, lagu, dan posisinya diingat di perangkat. Saat aplikasi dibuka lagi, layar Putar langsung menampilkan daftar terakhir dan lagu terakhir (dijeda, dilanjutkan dari posisi terakhir). Berlaku untuk daftar dari Library (yang diingat id lagunya) dan dari Musik di HP termasuk folder dan kartu SD (yang diingat entri MediaStore-nya, maksimal 1000 lagu di sekitar lagu yang diputar). Bila berkas sudah dihapus, layar dimulai kosong tanpa galat. Berkas yang dibuka lewat pemilih berkas tidak bisa dibuka ulang dan tidak diingat. Logika di `core/library/lastplayed.ts`.
- Notifikasi dan layar kunci memakai nama artis lagu dari HP.
- Uji: `core/library/lastplayed.test.ts`, `e2e/playscreen.mjs` (kartu, daftar, tab, ketuk baris, pulih setelah muat ulang, tanpa luapan lebar layar, mode Latihan ringkas muat di 384×780).

## 0.3.1 (2026-11-24)

- Android, **perbaikan**: musik berhenti saat layar mati di akhir lagu. Log HP menunjukkan aplikasi crash (`ForegroundServiceStartNotAllowedException`): jeda singkat antar lagu menurunkan layanan dari foreground dan Android 12+ menolak menaikkannya lagi di latar belakang. Layanan kini bertahan di foreground sampai jeda 90 detik, wake lock ikut ditahan, dan penolakan Android tidak lagi menjatuhkan aplikasi. Terbukti di A23: lagu berganti otomatis dengan layar mati, nol crash.
- Pemutar: **Auto next** (hidup/mati), **Ulangi** (mati, semua, 1 lagu), dan **Acak**; tiga tombol di layar Putar, tersimpan di perangkat. Acak memutar setiap lagu sekali per putaran; dengan Ulangi semua, putaran baru diacak ulang dan tidak dimulai dengan lagu yang baru diputar. Tombol Berikutnya/Sebelumnya dan notifikasi mengikuti urutan. Logika murni di `core/library/playmode.ts`.
- Musik di HP: daftar dibaca ulang setiap kali tampilan dibuka, ada tombol **Muat ulang daftar**, entri MediaStore yang berkasnya sudah dihapus atau dipindah disembunyikan (dan Android diminta menyegarkan indeksnya), dan tampilan folder keluar dari folder yang sudah kosong.
- Android: **Folder simpan MP3** di Setelan (pilih folder internal atau kartu SD lewat pemilih folder Android, izin tersimpan). MP3 hasil konversi YouTube disalin ke folder itu dengan nama judul (nomor ditambah bila sudah ada) dan langsung muncul di Musik di HP. Opsi **Simpan juga di Library aplikasi** (aktif bawaan; mati = hanya berkas di folder). Bila penyalinan gagal, lagu tetap disimpan di Library.
- Android: **yt-dlp diperbarui otomatis**. APK membawa yt-dlp 2025.11.12 yang cepat usang; kini plugin memeriksa yt-dlp terbaru saat aplikasi dibuka (paling sering tiap 3 hari, ulang setelah 6 jam bila gagal) dan memperbaruinya sendiri, tanpa menyentuh unduhan yang sedang jalan. Bila unduhan atau pencarian gagal dengan galat umum, yt-dlp diperbarui sekali (jeda minimal 30 menit) lalu perintah diulang. Pencarian dan unduhan menunggu selama pembaruan berlangsung. Sakelar "Perbarui yt-dlp otomatis", waktu pemeriksaan terakhir, dan tombol Perbarui sekarang ada di Setelan. Terbukti di A23: 2025.11.12 menjadi 2026.11.23 dalam sekitar 4 detik saat pembukaan pertama.
- Setelan, bagian **Tentang**: versi (format 0.3.1), tanggal dan jam build (zona waktu perangkat), platform (APK atau Web/PWA), dan tombol **Lihat riwayat versi** yang menampilkan isi `CHANGELOG.md` per versi (versi terbaru terbuka, kode dan huruf tebal dirender tanpa HTML). APK melaporkan versi dan waktu build-nya sendiri: `versionName` dan `versionCode` (0.3.1 menjadi 301) kini diambil dari `package.json` dan waktu build dari `BuildConfig`. Parser di `core/about/changelog.ts`.
- Uji: `core/about/changelog.test.ts` (termasuk membaca `CHANGELOG.md` asli), `e2e/about.mjs`, `core/library/playmode.test.ts`, `e2e/lazyqueue.mjs` (mode putar dan tombol).

## 0.3.0 (2026-11-23)

- Server: `GET /api/search?q=` (token wajib) mencari YouTube lewat yt-dlp `ytsearch10:` tanpa mengunduh. Hasil: id, judul, kanal, durasi, thumbnail (dibuat dari id, bukan URL dari yt-dlp). Siaran langsung dan video di atas batas durasi disaring. Kata kunci maks. 100 karakter, hanya sebagai satu argumen setelah `--`. Batas 15 pencarian/menit per IP, maks. 2 pencarian bersamaan, cache 5 menit.
- PWA: layar YouTube punya kolom pencarian; memilih satu hasil mengonversi, menyimpannya ke Library, lalu langsung membukanya di Putar (tempo dan nada bisa diatur).
- Android: workspace `app-android/` (Capacitor 8) dan plugin native `MusikNative`: pemutaran latar belakang (foreground service, notifikasi media, kontrol lock screen), tab "Musik di HP" yang membaca seluruh musik lewat MediaStore, pencarian dan unduh YouTube ke MP3 langsung di HP (youtubedl-android), tombol perbarui yt-dlp di Setelan, dan menerima tautan yang dibagikan dari aplikasi YouTube. `npm run android:apk` membangun APK debug. Belum diuji di perangkat. Lihat `docs/ANDROID.md`.
- Android: tab "Musik di HP" punya mode **Folder**: pilih penyimpanan (internal atau kartu SD/USB), masuk-keluar folder dengan breadcrumb dan tombol naik, atau mode Semua lagu dengan pencarian. Dibangun dari kolom volume dan folder MediaStore (`core/library/folders.ts`), tanpa izin tambahan; hanya folder berisi lagu yang dikenali Android yang tampil.
- Android: memutar lagu dari "Musik di HP" kini membuat **antrean** dari folder yang sedang dibuka (atau hasil pencarian di mode Semua lagu), jadi Berikutnya/Sebelumnya, lagu otomatis lanjut, dan tombol notifikasi bekerja. `Player.playLazy`: berkas dibaca hanya saat gilirannya, hanya lagu yang diputar disimpan di memori. Uji: `e2e/lazyqueue.mjs`.
- Klien: `parseYoutubeVideoId`.
- Uji: `server/src/search.test.ts`, uji klien di `core/api/client.test.ts`, `e2e/ytsearch.mjs`.

## 0.2.2 (2026-11-23)

- Cari: entitas HTML dari Openverse didekode ("&amp;" tampil "&").
- Cari: Internet Archive mencocokkan semua kata (AND), bukan salah satu (OR).
- Cari: mode Judul / Artis hanya menampilkan hasil yang judul / artisnya memuat semua kata (aksen diabaikan).
- Cari: teks peringatan bahwa lisensi adalah klaim pengunggah dan tidak diverifikasi (rip CD komersial kadang salah dilabeli CC0). Simulasi "Dear Jessie" Madonna dan temuannya di `docs/DECISIONS_SOURCES.md`.

## 0.2.1 (2026-11-23)

- Cari: mode pencarian **Semua / Judul / Artis** (kolom judul dan pencipta di tiap sumber; Commons menyaring artis di sisi aplikasi).
- Cari: hasil tiga sumber dalam **satu daftar** yang bisa diurutkan menurut relevansi, nama artis, judul lagu, ukuran, atau tahun rilis, naik atau turun; nilai tidak diketahui selalu di akhir. Tahun rilis ditampilkan bila sumber menyebutnya (Internet Archive, Commons; Openverse tidak punya).
- Cari: Lihat lagu, Unduh, dan Putar kini berupa ikon (dengan nama aksesibel).
- Dokumentasi: temuan Jamendo (sebagian berkas gagal di PC, berhasil di A23) di `docs/DECISIONS_SOURCES.md`.
- Konversi YouTube tidak berubah.

## 0.2.0 (2026-11-23)

- PWA: tab **Cari** untuk mencari dan mengunduh musik legal langsung dari sumbernya (tanpa server): Internet Archive, Openverse, Wikimedia Commons. Hanya karya berlisensi Creative Commons atau domain publik yang tampil; tanpa lisensi dikenali = disembunyikan. Label lisensi dan penanda non-komersial / tanpa turunan terlihat; album Internet Archive dibuka per berkas. Unduhan memakai progres, batas 200 MB, hanya https dan hanya tipe audio, lalu masuk Library dengan atribusi (`credit`: pencipta, lisensi, tautan).
- Library menampilkan lisensi lagu unduhan; `SongMeta.source` mendapat nilai `web`.
- Uji: 18 uji unit (`core/sources`) dan `e2e/search.mjs` (jaringan di-mock). Detail: `docs/DECISIONS_SOURCES.md`.

## 0.1.4 (2026-11-23)

- Server: `YTDLP_PROXY` (`--proxy`, skema http/https/socks4/socks5/socks5h divalidasi) dan `YTDLP_COOKIES_FILE` (`--cookies`; berkas disalin per job dan salinannya dihapus setelah selesai) untuk kasus YouTube memblokir IP server. `/api/health` menampilkan `cookies` dan `proxy` sebagai true/false saja. Lihat `docs/DEPLOY.md` 3.2.

## 0.1.3 (2026-11-23)

- Server: kegagalan job menulis 10 baris terakhir output yt-dlp ke stderr (`stderr.log` di cPanel). URL dan path dihapus dari baris itu; token tidak pernah masuk. Sebelumnya `stderr.log` kosong sehingga penyebab `blocked` tidak terlihat.

## 0.1.2 (2026-11-23)

- Server: `server/app.js` selalu menjalankan server saat dimuat. Sebelumnya hanya jalan bila menjadi modul utama (`require.main === module`), sedangkan Passenger/CloudLinux memuatnya lewat pembungkus, sehingga aplikasi diam dan pengunjung mendapat **503**. Kode yang bisa diuji dipindah ke `server/src/server.ts`.
- Skrip baru `npm run smoke:server`: memuat hasil build lewat `require()` seperti Passenger dan memeriksa `/api/health` (juga di bawah `/musik-api`).

## 0.1.1 (2026-11-23)

- Server: rute `/api/...` kini bekerja di bawah awalan jalur apa pun (mis. Application URL `/musik-api` di cPanel/Passenger, yang meneruskan URL lengkap). Ditemukan saat deploy pertama.
- Dokumentasi: struktur nyata di cPanel, aturan `.htaccess` untuk menutup isi repo dari web, diagnosa dari browser.

## 0.1.0 (2026-11-22)

Pertama kali di-deploy. Mencakup M0 sampai M4.

### M0 Fondasi

- Pipeline audio: `<audio>` → AudioWorklet Rubber Band WASM (R2 bawaan, R3 opsional) → volume; jalur A (`playbackRate` + koreksi nada) dan jalur B.
- Halaman lab dengan diagnostik dan unduh log; PWA precache dan offline; skrip build / deploy / vendor / cek pure-JS.
- Uji A23: 0 underrun; audio bertahan saat layar mati.
- Optimasi CPU: bypass pada rasio 1.0, pembatasan pembaruan nada, R2 `PitchHighSpeed`.

### M1 MVP

- Layar Putar, Library (OPFS + IndexedDB, waveform), Minus One mode Dasar, Media Session, Setelan.
- Ekstensi Chrome MV3: tempo, transpose, Minus One di tab aktif; mode terdegradasi bila worklet diblokir.

### M2 YouTube ke MP3

- Server Node tanpa dependensi: antrean 1-2 aktif, URL dibangun ulang dari ID video, token Bearer, kunci IP, batas laju, CORS, tautan unduh bertanda tangan, retensi 1 jam.
- Layar YouTube, Setelan server (URL + token + tes koneksi), Share Target, pembaca `.env` untuk uji lokal, `/api/health` dengan diagnosis yt-dlp.
- Konversi nyata berhasil di PC Windows + A23.

### M3 Latihan

- Layar Putar ringkas dengan ikon; antrean prev / stop / next dan lanjut otomatis; Buka & putar tanpa menyimpan.
- Loop A-B, equalizer 5 pita, metronom dan hitung masuk, preset per lagu otomatis (IndexedDB v2).

### M4 Minus One lanjutan

- Mode Dasar, Jaga bass, Fokus vokal; kontrol kekuatan, batas bass, lebar pita vokal; tersimpan di preset per lagu.

### Belum teruji pada rilis ini

- Server di cPanel dengan yt-dlp dan ffmpeg nyata (`docs/TEST_SERVER.md`).
- M3 dan M4 di A23; Share Target dari aplikasi YouTube; ekstensi di YouTube asli.
