# Changelog

Satu pengguna, tanpa rilis publik; versi dipakai untuk tag repo deploy (`v<versi>`) dan rollback.

## 0.3.1 (2026-11-24)

- Android, **perbaikan**: musik berhenti saat layar mati di akhir lagu. Log HP menunjukkan aplikasi crash (`ForegroundServiceStartNotAllowedException`): jeda singkat antar lagu menurunkan layanan dari foreground dan Android 12+ menolak menaikkannya lagi di latar belakang. Layanan kini bertahan di foreground sampai jeda 90 detik, wake lock ikut ditahan, dan penolakan Android tidak lagi menjatuhkan aplikasi. Terbukti di A23: lagu berganti otomatis dengan layar mati, nol crash.
- Pemutar: **Auto next** (hidup/mati), **Ulangi** (mati, semua, 1 lagu), dan **Acak**; tiga tombol di layar Putar, tersimpan di perangkat. Acak memutar setiap lagu sekali per putaran; dengan Ulangi semua, putaran baru diacak ulang dan tidak dimulai dengan lagu yang baru diputar. Tombol Berikutnya/Sebelumnya dan notifikasi mengikuti urutan. Logika murni di `core/library/playmode.ts`.
- Musik di HP: daftar dibaca ulang setiap kali tampilan dibuka, ada tombol **Muat ulang daftar**, entri MediaStore yang berkasnya sudah dihapus atau dipindah disembunyikan (dan Android diminta menyegarkan indeksnya), dan tampilan folder keluar dari folder yang sudah kosong.
- Android: **Folder simpan MP3** di Setelan (pilih folder internal atau kartu SD lewat pemilih folder Android, izin tersimpan). MP3 hasil konversi YouTube disalin ke folder itu dengan nama judul (nomor ditambah bila sudah ada) dan langsung muncul di Musik di HP. Opsi **Simpan juga di Library aplikasi** (aktif bawaan; mati = hanya berkas di folder). Bila penyalinan gagal, lagu tetap disimpan di Library.
- Uji: `core/library/playmode.test.ts`, `e2e/lazyqueue.mjs` (mode putar dan tombol).

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
