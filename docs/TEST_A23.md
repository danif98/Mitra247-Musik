# Uji manual M0 di Samsung Galaxy A23

Tujuan: membuktikan tempo + nada (Rubber Band) mulus di A23, dan perilaku saat layar mati. Perkiraan waktu: 45 menit.
Siapkan: satu lagu MP3 (stereo, ada vokal dan instrumen) dan, bila ada, satu lagu lain bertempo cepat. Charger dicabut; catat baterai awal.

## A. Membuka halaman lab di HP (pilih salah satu)

**Cara 1 (HTTPS di hosting sendiri, disarankan untuk uji PWA/layar mati)**

1. Di PC: `npm run build`, lalu `npm run deploy:prepare` dan push repo deploy (lihat `DEPLOY.md`), atau salin isi `out/app` ke folder statis HTTPS di hosting.
2. Di HP buka Chrome -> `https://<domain>/<jalur>/lab/`.

**Cara 2 (kabel USB, tanpa hosting)**

1. HP: aktifkan Opsi pengembang -> Debugging USB. Sambungkan ke PC.
2. PC: `npm run build`, lalu jalankan dua perintah ini di terminal berbeda:
   ```powershell
   node e2e/static-server.mjs out/app 4173
   ```
   ```powershell
   adb reverse tcp:4173 tcp:4173
   ```
3. Di HP buka Chrome -> `http://localhost:4173/lab/` (localhost dianggap aman, AudioWorklet dan service worker berfungsi).

Pemasangan PWA (opsional, untuk uji layar mati dalam mode terpasang): menu Chrome -> _Instal aplikasi_ / _Tambahkan ke layar utama_, lalu buka dari ikon. Ulangi bagian C dalam mode terpasang.

Pastikan status tertulis **"Mesin audio siap."** Bila tertulis galat, simpan layarnya dan lanjut ke bagian F.

## B. Pemeriksaan dasar

1. Tekan **Pilih berkas audio**, pilih lagu. (Atau **Buat nada uji 440 Hz**.)
2. Tekan **Putar**. Suara keluar normal pada tempo 1.00×, kunci 0.
3. Geser posisi (seek) maju-mundur: tidak ada suara pecah panjang.
4. Catat di panel Diagnostik: sample rate, baseLatency, outputLatency, latensi Rubber Band, Beban worklet (%), Underrun worklet, Beban render (bila bukan n/a).

## C. Uji kualitas dan beban (isi tabel di bawah)

Untuk setiap baris: setel tempo/kunci, putar **2 menit**, dengarkan, lihat diagnostik, lalu tandai.
Lakukan untuk **Jalur A + R2** dulu; ulangi baris bertanda * untuk **Jalur B + R2**, lalu **Jalur A + R3** untuk 0.75× dan ±4.

Yang didengarkan: patah-patah/glitch, berderak saat mengubah nilai, suara "berair"/"bergema" (artefak), vokal terdengar aneh.

## D. Uji layar mati (paling penting)

1. Jalur A, R2, tempo 0.75×, kunci +2. Putar lagu.
2. Tekan tombol daya (layar mati). Tunggu **3 menit** (dengarkan lewat speaker/headphone).
3. Catat: apakah audio terus berbunyi? Apakah ada tombol kontrol di layar kunci/notifikasi (judul lagu, putar/jeda)?
4. Hidupkan layar. Catat apakah masih memutar atau terjeda.
5. Ulangi dengan **10 menit**.
6. Ulangi dengan layar mati lalu tekan jeda/putar dari layar kunci.

Log otomatis mencatat `visibilitychange`, `audiocontext:state` dan `media:*` dengan waktu.

## E. Baterai dan CPU

1. Catat baterai awal. Putar lagu 30 menit pada 0.75×, +2 (R2), layar mati (atau redup bila audio berhenti saat mati).
2. Catat baterai akhir dan suhu perangkat (hangat/panas/normal).
3. CPU: pakai "Beban worklet (%)" dan "Beban render" dari panel (perkiraan kasar). Target PRD: < 30% rata-rata.

## F. Mengunduh log diagnostik

1. Setelah semua uji, tekan **Unduh log diagnostik (JSON)** (berkas `musik-lab-log-....json` masuk ke Unduhan).
2. Kirim berkas itu ke PC (kabel/Drive) dan lampirkan di sesi M1 bersama tabel di bawah. Bila perlu uji ulang dari awal: **Hapus log**.
3. Bila halaman gagal dimuat, kirim tangkapan layar dan versi Chrome (Chrome -> Setelan -> Tentang Chrome).

## Tabel hasil

Skala kualitas: 1 = buruk, 3 = cukup, 5 = tidak ada artefak. Glitch: jumlah kejadian terdengar dalam 2 menit. Underrun: angka dari panel setelah 2 menit.

| Jalur | Engine | Tempo | Kunci   | Beban worklet % | Underrun | Glitch terdengar | Berderak saat ubah nilai (ya/tidak) | Kualitas 1-5 | Catatan |
| ----- | ------ | ----- | ------- | --------------- | -------- | ---------------- | ----------------------------------- | ------------ | ------- |
| A     | R2     | 1.00× | 0       |                 |          |                  |                                     |              |         |
| A     | R2     | 0.50× | 0       |                 |          |                  |                                     |              |         |
| A     | R2     | 0.75× | 0       |                 |          |                  |                                     |              |         |
| A     | R2     | 1.25× | 0       |                 |          |                  |                                     |              |         |
| A     | R2     | 1.00× | +2      |                 |          |                  |                                     |              |         |
| A     | R2     | 1.00× | -2      |                 |          |                  |                                     |              |         |
| A     | R2     | 1.00× | +4      |                 |          |                  |                                     |              |         |
| A     | R2     | 1.00× | -4      |                 |          |                  |                                     |              |         |
| A     | R2     | 0.75× | +2      |                 |          |                  |                                     |              |         |
| A     | R2     | 0.75× | -4      |                 |          |                  |                                     |              |         |
| B*    | R2     | 0.50× | 0       |                 |          |                  |                                     |              |         |
| B*    | R2     | 0.75× | 0       |                 |          |                  |                                     |              |         |
| B*    | R2     | 1.25× | 0       |                 |          |                  |                                     |              |         |
| B*    | R2     | 1.00× | ±2 / ±4 |                 |          |                  |                                     |              |         |
| B*    | R2     | 0.75× | +2      |                 |          |                  |                                     |              |         |
| A     | R3     | 0.75× | 0       |                 |          |                  |                                     |              |         |
| A     | R3     | 1.00× | +4      |                 |          |                  |                                     |              |         |
| A     | R3     | 1.00× | -4      |                 |          |                  |                                     |              |         |

| Pengukuran                                                 | Hasil |
| ---------------------------------------------------------- | ----- |
| Model/Android/Chrome (versi)                               |       |
| RAM varian (4/6 GB), jaringan                              |       |
| sample rate / baseLatency / outputLatency (ms)             |       |
| Latensi Rubber Band R2 / R3 (ms)                           |       |
| Beban render ada (bukan n/a)? nilainya                     |       |
| Baterai awal -> akhir (30 menit)                           |       |
| Suhu perangkat                                             |       |
| Layar mati 3 menit: audio lanjut? kontrol kunci layar ada? |       |
| Layar mati 10 menit: audio lanjut?                         |       |
| Setelah layar hidup: lanjut / terjeda                      |       |
| Jalur A vs B pada 0.5×: mana lebih enak (A/B/sama)         |       |
| R2 vs R3: perbedaan terdengar? R3 mulus di A23?            |       |
| PWA terpasang & berjalan offline (mode pesawat)?           |       |

Kriteria lulus M0 (PRD): putar + speed + transpose (R2) tanpa patah-patah, CPU rata-rata < 30%, audio tetap jalan (atau perilakunya jelas) saat layar mati.

---

# Uji manual M1

Pakai build terbaru (lihat baris **Build** di Setelan atau halaman lab; harus berisi commit terbaru). Cara membuka halaman di HP sama seperti bagian A di atas, tetapi buka `/` (bukan `/lab/`). Bila HP masih memuat versi lama: Setelan situs -> Hapus data, lalu buka lagi.

## G. Aplikasi (di A23)

1. **Library**: Tambah berkas -> pilih 2-3 lagu (satu panjang, > 10 menit bila ada). Catat: apakah muncul di daftar, durasi benar, waktu sampai selesai, ada galat? Tutup Chrome dari daftar aplikasi, buka lagi: lagu masih ada?
2. **Putar**: ketuk lagu. Waveform tampil; ketuk waveform untuk pindah posisi; tombol -5/+5; putar/jeda.
3. **Tempo/Kunci**: tombol +/- , slider, chip preset, tekan lama nilai untuk reset. Dengarkan berderak atau tidak saat mengubah. Isi tabel kualitas (bagian C) untuk 0.5x, 0.75x, +-2, +-4 pada lagu nyata.
4. **Minus One**: hidupkan pada lagu stereo berpenyanyi. Catat seberapa vokal berkurang (0-5), apakah bass/kick hilang, dan apakah lagu mono menjadi senyap.
5. **Layar mati 3 menit** saat memutar: audio lanjut? Layar kunci menampilkan judul dan tombol putar/jeda/geser? Coba jeda dan putar dari layar kunci.
6. **Install PWA** (menu Chrome -> Instal aplikasi), buka dari ikon, mode pesawat: buka Library dan putar lagu.
7. **Setelan**: pemakaian penyimpanan tampil; "Dilindungi dari pembersihan otomatis"?; pilih R3 lalu putar lagi, catat beban/glitch; kembali ke R2.
8. Unduh log dari halaman lab bila ada glitch (lab memakai pipeline yang sama).

| Pemeriksaan                                    | Hasil | Catatan |
| ---------------------------------------------- | ----- | ------- |
| Tambah 3 lagu / waktu                          |       |         |
| Lagu > 10 menit: waveform, memori, galat       |       |         |
| Lagu tetap ada setelah Chrome ditutup          |       |         |
| Ganti nama / hapus                             |       |         |
| Seek lewat waveform / +-5 s                    |       |         |
| Berderak saat ubah tempo/kunci (ya/tidak)      |       |         |
| Minus One: vokal berkurang (0-5) / bass hilang |       |         |
| Layar mati 3 menit: lanjut?                    |       |         |
| Kontrol layar kunci (judul, putar/jeda, geser) |       |         |
| PWA terpasang + offline: library + putar       |       |         |
| R3 di Setelan: glitch?                         |       |         |

## H. Ekstensi di YouTube (Chrome desktop)

Belum pernah diuji di YouTube asli; ini uji terpenting untuk ekstensi.

1. `npm run build:ext`; Chrome -> `chrome://extensions` -> Developer mode -> **Load unpacked** -> `ext-chrome/dist`.
2. Buka video YouTube biasa, putar. Klik ikon ekstensi.
3. Ubah tempo 0.75x: kecepatan berubah dan nada tetap? Kunci +2: nada naik, tempo tetap? Catat apakah ada suara senyap, pecah, atau pesan peringatan oranye di popup ("Pergeseran nada diblokir...").
4. Minus One on/off pada video musik stereo.
5. Pintasan `[` `]` dan `Shift+Up/Down` saat fokus di video (bukan di kolom komentar).
6. Ganti video (klik video lain, atau iklan muncul): popup masih mengontrol video yang benar?
7. Buka halaman tanpa media dan halaman `chrome://extensions`: pesan jelas, tanpa galat?
8. Setelah mengubah kode: tombol **Reload** di kartu ekstensi + muat ulang tab.

| Pemeriksaan                     | Hasil | Catatan |
| ------------------------------- | ----- | ------- |
| Tempo 0.75x, nada tetap         |       |         |
| Kunci +2, tempo tetap           |       |         |
| Peringatan "diblokir" muncul?   |       |         |
| Minus One                       |       |         |
| Pintasan keyboard               |       |         |
| Ganti video / iklan             |       |         |
| Halaman tanpa media / chrome:// |       |         |
