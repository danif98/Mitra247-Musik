# Changelog

Satu pengguna, tanpa rilis publik; versi dipakai untuk tag repo deploy (`v<versi>`) dan rollback.

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
