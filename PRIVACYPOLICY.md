# Kebijakan Privasi Music Player

**Berlaku sejak:** 25 November 2026
**Terakhir diperbarui:** 25 November 2026

Kebijakan ini menjelaskan bagaimana aplikasi **Music Player** ("Aplikasi") menangani informasi Anda. Aplikasi dikembangkan dan diterbitkan oleh **Mitra247** ("kami").

**Ringkasnya:** Aplikasi tidak memakai akun, tidak melacak Anda, dan tidak menampilkan iklan. Musik dan pengaturan Anda tetap berada di HP Anda. Kami tidak memiliki server yang menerima data dari Aplikasi.

## 1. Informasi yang kami kumpulkan

Kami **tidak mengumpulkan** data pribadi Anda. Kami tidak menerima nama, email, nomor telepon, lokasi, kontak, kamera, mikrofon, atau pengenal iklan.

### Data yang tersimpan hanya di HP Anda

| Data                                                    | Tujuan                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| Lagu yang Anda tambahkan atau unduh ke Library          | Memutar lagu di dalam Aplikasi                             |
| Daftar dan keterangan lagu di HP (judul, artis, folder) | Menampilkan menu **Musik di HP**                           |
| Pengaturan (tempo, kunci, equalizer, preset per lagu)   | Mengingat pengaturan Anda untuk tiap lagu                  |
| Antrean, lagu, dan posisi terakhir diputar              | Melanjutkan pemutaran saat Aplikasi dibuka lagi            |
| Catatan diagnostik (opsional)                           | Hanya dibuat bila Anda menekan tombol unduh log di Setelan |

Data ini **tidak dikirim** ke kami atau ke pihak mana pun. Catatan diagnostik hanya keluar dari HP bila Anda sendiri mengirimkannya.

## 2. Izin yang diminta Aplikasi

### Akses berkas audio lokal (`READ_MEDIA_AUDIO`)

Dipakai untuk membaca daftar musik dan memutar lagu yang sudah ada di HP Anda. Aplikasi hanya membaca berkas audio, tidak membaca foto, video, atau dokumen. Di Android 12 ke bawah izin yang setara adalah `READ_EXTERNAL_STORAGE`. Isi dan daftar lagu diproses di HP dan tidak dikirim ke mana pun. Anda dapat mencabut izin ini kapan saja di Setelan Android.

### Notifikasi (`POST_NOTIFICATIONS`)

Dipakai untuk menampilkan kontrol pemutaran (Putar, Jeda, Sebelumnya, Berikutnya) di bilah notifikasi dan layar kunci, serta menjaga musik tetap berjalan saat layar mati. Notifikasi tidak dipakai untuk promosi atau iklan. Anda dapat menolaknya; musik tetap dapat diputar, namun kontrol di notifikasi tidak tampil.

### Internet (`INTERNET`)

Dipakai hanya untuk fitur **Cari** (bagian 3).

### Layanan latar depan dan penahan layar mati (`FOREGROUND_SERVICE`, `WAKE_LOCK`)

Dipakai agar pemutaran musik berlanjut saat layar mati atau Aplikasi di latar belakang.

## 3. Data yang dikirim ke server

**Kami tidak menjalankan server yang menerima data dari Aplikasi.**

Satu-satunya data yang meninggalkan HP Anda terjadi saat Anda memakai layar **Cari**, yang mencari dan mengunduh musik berlisensi terbuka dari layanan pihak ketiga:

| Layanan           | Alamat                  | Data yang diterima layanan                                              |
| ----------------- | ----------------------- | ----------------------------------------------------------------------- |
| Internet Archive  | `archive.org`           | Kata kunci pencarian, alamat IP, jenis perangkat (permintaan web biasa) |
| Openverse         | `api.openverse.org`     | Kata kunci pencarian, alamat IP, jenis perangkat                        |
| Wikimedia Commons | `commons.wikimedia.org` | Kata kunci pencarian, alamat IP, jenis perangkat                        |

Permintaan ini dikirim langsung dari HP Anda ke layanan tersebut lewat koneksi terenkripsi (`https`). Kami tidak melihat, menyimpan, atau menerima salinan kata kunci Anda. Layanan itu menangani data sesuai kebijakan privasinya masing-masing, yang tidak kami kendalikan. Bila Anda tidak memakai **Cari**, tidak ada data yang dikirim.

Berkas yang Anda unduh disimpan di HP Anda, bersama nama pencipta dan jenis lisensinya.

## 4. Tidak ada akun, pelacakan, atau iklan

- Aplikasi **tidak memerlukan akun** atau proses masuk.
- Aplikasi **tidak melacak** perilaku Anda dan tidak memakai layanan analitik atau pelaporan kerusakan dari pihak ketiga.
- Aplikasi **tidak menampilkan iklan** dan tidak memakai pengenal iklan.
- Kami **tidak menjual atau membagikan** data Anda karena kami tidak memilikinya.

Google Play dapat mengumpulkan data teknis kerusakan dan kinerja (Android Vitals) dari perangkat yang mengaktifkannya. Pengumpulan itu dilakukan oleh Google menurut kebijakan Google, bukan oleh Aplikasi.

## 5. Penyimpanan dan penghapusan data

Seluruh data Aplikasi ada di penyimpanan HP Anda. Anda dapat:

- menghapus lagu satu per satu di **Library**;
- memilih **Setelan, Hapus semua data lokal** untuk menghapus semua lagu dan pengaturan;
- menghapus (uninstall) Aplikasi, yang menghapus seluruh data Aplikasi.

Karena kami tidak menyimpan data Anda di server, tidak ada data yang perlu kami hapus atas permintaan Anda.

## 6. Keamanan

Seluruh sambungan internet Aplikasi memakai `https`. Aplikasi menolak alamat unduhan yang tidak aman dan hanya menerima berkas bertipe audio. Karena data disimpan di HP, keamanannya juga bergantung pada pengamanan HP Anda (misalnya kunci layar).

## 7. Anak-anak

Aplikasi tidak ditujukan khusus untuk anak di bawah 13 tahun dan tidak mengumpulkan data pribadi dari siapa pun, termasuk anak-anak.

## 8. Perubahan kebijakan

Bila kebijakan ini berubah, kami memperbarui tanggal "Terakhir diperbarui" di atas dan menerbitkan versi terbaru di alamat yang sama. Perubahan yang berarti akan kami sampaikan lewat pembaruan Aplikasi atau halaman toko.

## 9. Kontak

Pertanyaan tentang kebijakan ini dapat dikirim ke:

**Mitra247**
Email: **[ISI-EMAIL-KONTAK]**
Situs: <https://mitra247.com>

---

> **Catatan internal (hapus sebelum dipublikasikan):**
>
> 1. Ganti `[ISI-EMAIL-KONTAK]` dengan email kontak publik yang sama dengan yang diisi di Google Play Console.
> 2. Teks ini harus tampil lengkap di `mitra247.com/kebijakan-privasi` dan alamat itu harus bisa dibuka lewat HTTPS.
> 3. Isi kebijakan menggambarkan **edisi Google Play**. Jika fitur Aplikasi berubah (mis. menambah analitik, iklan, atau server), kebijakan dan formulir Data safety harus diperbarui lebih dulu.
