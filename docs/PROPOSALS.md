# Usulan (belum dibangun)

Di luar PRD; tidak dikerjakan sampai disetujui.

## Dari M0 (diperbarui)

1. **Klarifikasi lisensi wrapper `rubberband-wasm`**: paket menyatakan "GPLv2" saja. Bila proyek akan dibagikan, pertimbangkan build WASM sendiri dari Rubber Band 3.x (GPL-2.0-or-later).
2. ~~Bypass pada rasio 1.0~~: **sudah dikerjakan** (`DECISIONS_M0.md` bagian 8).
3. Mode kualitas otomatis: turunkan R3 ke R2 bila underrun meningkat.
4. Pengukuran CPU yang lebih presisi (butuh cross-origin isolation); dinilai merepotkan.
5. Bias frekuensi R2 pada nada murni rendah dan pada rasio besar: bila terdengar, coba `PitchHighConsistency` untuk rasio selain 1.

## Baru (M1-M4 dan go-live)

6. **Share Target berkas**: bagikan musik dari pengelola berkas atau aplikasi lain langsung ke PWA ("Buka & putar") tanpa membuka aplikasi dulu. Perlu penanganan POST di service worker.
7. **Pembungkus APK (Capacitor)**: akses MediaStore agar seluruh musik di HP bisa dipilih tanpa pemilih berkas, dan pemutaran latar belakang yang lebih andal (PRD M5).
8. **Ekspor/impor Library dan preset**: cadangan manual bila data situs terhapus.
9. **Loop A-B**: tampilkan waktu A dan B sebagai angka dan beri penyesuaian halus (±0,1 detik); simpan beberapa loop bernama per lagu.
10. **Metronom**: ketuk-tempo (tap tempo) dan opsi mengikuti tempo lagu; jadwal tetap stabil saat layar mati (perlu diuji).
11. **Ekstensi**: pilihan mode Minus One dan EQ di popup; ingat pengaturan per situs (PRD 6.6 P1).
12. **Server**: simpan status job di disk agar bertahan saat restart; titik akhir `/api/health` yang menyembunyikan versi yt-dlp dari publik bila dianggap bocor informasi.
13. **Deteksi kunci/BPM lagu** (PRD M5) untuk mengisi BPM metronom otomatis.
14. **Tampilan kurva respons EQ** dan indikator tingkat per kanal untuk Minus One.
