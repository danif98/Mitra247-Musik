# Music Player

Aplikasi pemutar musik untuk **latihan**. Cocok untuk pemain musik, penyanyi, guru les, kelompok paduan suara atau band: lagu bisa diperlambat tanpa mengubah nada, nadanya bisa dinaikkan atau diturunkan, dan suara vokal bisa dikurangi supaya Anda bisa bernyanyi atau bermain bersama lagu.

Dokumen ini untuk **Tim Operasional**: apa yang bisa dilakukan aplikasi, cara memakainya, dan jawaban atas pertanyaan yang sering muncul. Penjelasan teknis ada di [`README-IT.md`](README-IT.md). Materi penjualan ada di [`PRESENTASI.md`](PRESENTASI.md). Kebijakan privasi ada di [`PRIVACYPOLICY.md`](PRIVACYPOLICY.md).

## Ringkasan

| Hal             | Penjelasan                                                               |
| --------------- | ------------------------------------------------------------------------ |
| Nama            | Music Player                                                             |
| Pembuat         | Mitra247                                                                 |
| Platform        | Android 7.0 ke atas (diuji utama di Samsung Galaxy A23)                  |
| Bahasa tampilan | Indonesia                                                                |
| Perlu akun?     | Tidak                                                                    |
| Ada iklan?      | Tidak                                                                    |
| Perlu internet? | Hanya untuk fitur **Cari**. Memutar dan berlatih berjalan tanpa internet |
| Data pengguna   | Tetap di HP pengguna. Tidak dikirim ke server kami                       |
| Status          | Dalam persiapan rilis di Google Play                                     |

## Modul aplikasi

Aplikasi punya lima bagian di menu bawah.

### 1. Putar

Layar utama untuk mendengarkan dan berlatih. Terdiri dari dua tab: **Antrean** dan **Latihan**.

| Fitur             | Kegunaan                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tempo             | Memperlambat atau mempercepat lagu (0,25x sampai 2x) tanpa mengubah nada. Berguna untuk belajar bagian sulit pelan-pelan                                                        |
| Kunci (transpose) | Menaikkan atau menurunkan nada sampai 12 semitone tanpa mengubah kecepatan. Menyesuaikan lagu dengan jangkauan suara penyanyi                                                   |
| Minus One         | Mengurangi suara vokal agar Anda bisa bernyanyi sendiri. Ada tiga mode: Dasar, Jaga bass, Fokus vokal. Hasilnya bervariasi tergantung rekaman. Rekaman mono akan menjadi senyap |
| Loop A-B          | Mengulang satu bagian lagu terus-menerus. Tandai titik A (awal) dan titik B (akhir)                                                                                             |
| Equalizer         | Mengatur nada rendah, tengah, dan tinggi (5 pita)                                                                                                                               |
| Metronom          | Ketukan pengatur tempo, dengan hitung masuk sebelum lagu mulai                                                                                                                  |
| Preset per lagu   | Aplikasi mengingat tempo, kunci, dan pengaturan terakhir tiap lagu                                                                                                              |
| Antrean           | Daftar lagu yang akan diputar. Ketuk lagu untuk langsung memutarnya                                                                                                             |
| Mode putar        | **Acak**, **Ulangi** (mati / semua / 1 lagu), dan **Auto next**                                                                                                                 |
| Lagu terakhir     | Saat aplikasi dibuka lagi, lagu dan posisi terakhir langsung siap dilanjutkan                                                                                                   |

### 2. Library

Daftar lagu yang disimpan di dalam aplikasi.

- Tambahkan berkas musik (MP3, WAV, M4A, OGG, FLAC) dari HP.
- Cari, ubah nama, atau hapus lagu.
- Pilihan **Buka & putar** memutar berkas tanpa menyimpannya.

### 3. Musik di HP

Menampilkan seluruh musik yang sudah ada di HP, termasuk di kartu SD.

- Mode **Folder**: telusuri musik per folder.
- Mode **Semua lagu**: lihat dan cari semua lagu.
- Mengetuk satu lagu memutar lagu itu dan memasukkan lagu lain di folder yang sama ke antrean.
- Pemutaran tetap berjalan saat layar mati. Kontrol Putar, Jeda, Sebelumnya, dan Berikutnya muncul di notifikasi dan layar kunci.

### 4. Cari

Mencari musik yang **boleh diunduh secara legal** (berlisensi Creative Commons atau domain publik) dari Internet Archive, Openverse, dan Wikimedia Commons.

- Cari berdasarkan judul, artis, atau semua kata.
- Urutkan menurut relevansi, artis, judul, ukuran, atau tahun.
- Unduh langsung ke Library. Nama pencipta dan jenis lisensi ikut tersimpan.

Penting: lisensi adalah klaim dari pengunggah dan tidak diperiksa oleh aplikasi. Bila ragu, buka halaman sumber lewat tombol yang tersedia.

### 5. Setelan

- Kualitas mesin nada: **R2** (cepat, disarankan) atau **R3** (kualitas lebih tinggi, lebih berat).
- Penyimpanan: ruang yang dipakai dan tombol menghapus semua data lokal.
- Diagnostik: unduh catatan teknis bila perlu dikirim ke tim IT.
- **Tentang**: versi aplikasi dan riwayat perubahan.

## Izin yang diminta aplikasi

| Izin            | Kapan muncul                                   | Alasan                                                      |
| --------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| Musik dan audio | Saat membuka **Musik di HP**                   | Membaca daftar dan memutar lagu yang ada di HP              |
| Notifikasi      | Saat lagu pertama diputar (Android 13 ke atas) | Menampilkan kontrol pemutaran di notifikasi dan layar kunci |
| Internet        | Otomatis                                       | Untuk fitur **Cari** saja                                   |

Aplikasi tidak meminta akses kontak, lokasi, kamera, atau mikrofon.

## Pertanyaan yang sering muncul

**Musik berhenti saat layar mati.**
Matikan penghemat baterai untuk aplikasi ini: Setelan Android, Aplikasi, Music Player, Baterai, pilih "Tidak dibatasi".

**Daftar Musik di HP kosong.**
Izin musik mungkin ditolak. Buka Setelan Android, Aplikasi, Music Player, Izin, Musik dan audio, lalu pilih Izinkan. Lagu di folder yang diberi tanda `.nomedia` memang tidak tampil.

**Lagu baru tidak muncul di daftar.**
Buka **Musik di HP** lalu tekan **Muat ulang daftar**.

**Suara vokal masih terdengar setelah Minus One.**
Minus One bekerja dengan mengurangi suara yang ada di tengah. Hasilnya bergantung pada cara lagu direkam. Coba mode lain (Jaga bass atau Fokus vokal) dan atur kekuatannya.

**Rekaman jadi senyap setelah Minus One.**
Rekaman mono tidak punya perbedaan kiri dan kanan, jadi suaranya hilang seluruhnya. Matikan Minus One untuk rekaman seperti itu.

**Hasil pencarian tidak bisa diunduh.**
Sumber kadang menolak unduhan dari aplikasi. Buka halaman sumber, unduh berkasnya, lalu masukkan lewat **Library**.

**Cara menghapus semua data.**
Setelan, Penyimpanan, **Hapus semua data lokal**. Atau hapus (uninstall) aplikasi.

**Apakah data saya dikirim ke pihak lain?**
Tidak ada akun, pelacakan, atau iklan. Satu-satunya data yang keluar dari HP adalah kata kunci dan alamat IP ke layanan sumber musik saat Anda memakai **Cari**. Rincian: [`PRIVACYPOLICY.md`](PRIVACYPOLICY.md).

## Batasan yang perlu diketahui

- Hanya untuk Android. Tidak ada versi iPhone.
- Kualitas Minus One tidak sama dengan pemisahan vokal berbasis AI. Ini pengurangan sederhana dan hasilnya berbeda-beda per lagu.
- Pencarian musik hanya menampilkan karya berlisensi terbuka, jadi lagu komersial populer umumnya tidak ada.
- Lagu di Library memakan ruang penyimpanan HP.
- Belum semua fitur diuji pada banyak model HP. Patokan uji saat ini adalah Samsung Galaxy A23.

## Bantuan

Bila ada kendala, kirim ke Tim IT: model HP, versi Android, versi aplikasi (**Setelan, Tentang**), langkah yang dilakukan, dan jika ada, berkas **Unduh log diagnostik** dari Setelan.

## Rencana Selanjutnya (To Do)

### Menuju rilis Google Play

1. Menyiapkan versi khusus Google Play dengan nama **Music Player**.
2. Menyelesaikan kebijakan privasi di situs resmi (alamat harus aman memakai HTTPS).
3. Menyiapkan tampilan toko: ikon, gambar sampul, tangkapan layar, dan deskripsi.
4. Mengisi formulir Google Play (keamanan data, rating usia, penggunaan izin).
5. Uji tertutup oleh 12 penguji selama 14 hari berturut-turut, sesuai syarat Google untuk akun baru.
6. Mengajukan rilis ke publik setelah uji tertutup selesai.

### Peningkatan kualitas

1. Menguji di lebih banyak model HP dan versi Android.
2. Menyelesaikan uji tertunda: mode Folder, kartu SD, antrean, dan tombol notifikasi.
3. Memperbaiki aksesibilitas (label tombol, kontras warna, ukuran tombol).
4. Memantau laporan kerusakan setelah rilis.

### Fitur yang direncanakan

1. Cadangan dan pemulihan Library serta pengaturan lagu.
2. Loop A-B yang lebih teliti: waktu dalam angka, penyesuaian halus, beberapa loop bernama per lagu.
3. Metronom dengan ketuk tempo, dan opsi mengikuti tempo lagu.
4. Deteksi nada dasar dan BPM lagu secara otomatis.
5. Grafik equalizer.
6. Membagikan musik dari aplikasi lain langsung ke Music Player.
