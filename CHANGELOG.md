# Changelog

Satu pengguna, tanpa rilis publik; versi dipakai untuk tag repo deploy (`v<versi>`) dan rollback.

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
