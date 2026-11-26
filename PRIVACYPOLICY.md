# Kebijakan Privasi Music Player

**Berlaku sejak:** 26 November 2026
**Terakhir diperbarui:** 26 November 2026

Kebijakan ini menjelaskan bagaimana aplikasi **Music Player** ("Aplikasi") menangani informasi Anda. Aplikasi dikembangkan dan diterbitkan oleh **Mitra247** ("kami").

**Ringkasnya:** Aplikasi tidak melacak Anda dan tidak menampilkan iklan. Untuk memakai Aplikasi Anda masuk dengan akun Google; **alamat email dan nama akun Anda dicatat di server kami**. Musik, pengaturan, dan preset Anda tetap berada di HP Anda. Anda juga dapat mencadangkan preset latihan ke Google Drive **milik Anda sendiri**.

## 1. Informasi yang kami kumpulkan

### Data yang disimpan di server kami

Saat Anda masuk dengan Google, Aplikasi mengirim token akses dari Google ke server kami (`https://musik.mitra247.com`) untuk memastikan akun itu sah. Server kami menyimpan:

| Data                                           | Tujuan                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Alamat email dan nama akun Google              | Mengenali pengguna Aplikasi dan memastikan hanya akun Google sah masuk |
| Edisi Aplikasi (`play` atau `personal`)        | Mengetahui versi yang dipakai                                          |
| Waktu masuk pertama dan terakhir, jumlah masuk | Mengelola akses dan mengetahui Aplikasi masih dipakai                  |
| Status akun (aktif atau diblokir)              | Memblokir penyalahgunaan                                               |

Token akses dari Google dipakai sebentar untuk memverifikasi akun dan **tidak disimpan** oleh kami. Kami tidak menjual atau membagikan data ini kepada pihak lain dan tidak memakainya untuk iklan atau analitik.

Aplikasi tidak meminta kontak, lokasi, kamera, atau mikrofon.

### Data yang tersimpan hanya di HP Anda

| Data                                                    | Tujuan                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| Lagu yang Anda tambahkan atau unduh ke Library          | Memutar lagu di dalam Aplikasi                             |
| Daftar dan keterangan lagu di HP (judul, artis, folder) | Menampilkan menu **Musik di HP**                           |
| Pengaturan (tempo, kunci, equalizer, preset per lagu)   | Mengingat pengaturan Anda untuk tiap lagu                  |
| Antrean, lagu, dan posisi terakhir diputar              | Melanjutkan pemutaran saat Aplikasi dibuka lagi            |
| Nama, email, dan alamat foto profil akun Google         | Menampilkan siapa yang masuk                               |
| Tanda masuk dari server (berlaku 30 hari)               | Membuka Aplikasi tanpa internet sampai masa berlaku habis  |
| Waktu sinkron terakhir dan pilihan sinkron otomatis     | Untuk cadangan Google Drive                                |
| Catatan diagnostik (opsional)                           | Hanya dibuat bila Anda menekan tombol unduh log di Setelan |

Musik dan data ini **tidak dikirim** ke kami. Catatan diagnostik hanya keluar dari HP bila Anda sendiri mengirimkannya.

## 2. Izin yang diminta Aplikasi

### Akses berkas audio lokal (`READ_MEDIA_AUDIO`)

Dipakai untuk membaca daftar musik dan memutar lagu yang sudah ada di HP Anda. Aplikasi hanya membaca berkas audio, tidak membaca foto, video, atau dokumen. Di Android 12 ke bawah izin yang setara adalah `READ_EXTERNAL_STORAGE`. Isi dan daftar lagu diproses di HP dan tidak dikirim ke mana pun. Anda dapat mencabut izin ini kapan saja di Setelan Android.

### Notifikasi (`POST_NOTIFICATIONS`)

Dipakai untuk menampilkan kontrol pemutaran (Putar, Jeda, Sebelumnya, Berikutnya) di bilah notifikasi dan layar kunci, serta menjaga musik tetap berjalan saat layar mati. Notifikasi tidak dipakai untuk promosi atau iklan. Anda dapat menolaknya; musik tetap dapat diputar, namun kontrol di notifikasi tidak tampil.

### Internet (`INTERNET`)

Dipakai untuk **masuk dan verifikasi berkala** (bagian 4), **cadangan Google Drive** (bagian 4), dan fitur **Cari** (bagian 3).

### Layanan latar depan dan penahan layar mati (`FOREGROUND_SERVICE`, `WAKE_LOCK`)

Dipakai agar pemutaran musik berlanjut saat layar mati atau Aplikasi di latar belakang.

## 3. Data yang dikirim ke pihak ketiga: Cari musik

Saat Anda memakai layar **Cari**, Aplikasi mencari dan mengunduh musik berlisensi terbuka dari layanan pihak ketiga:

| Layanan           | Alamat                  | Data yang diterima layanan                                              |
| ----------------- | ----------------------- | ----------------------------------------------------------------------- |
| Internet Archive  | `archive.org`           | Kata kunci pencarian, alamat IP, jenis perangkat (permintaan web biasa) |
| Openverse         | `api.openverse.org`     | Kata kunci pencarian, alamat IP, jenis perangkat                        |
| Wikimedia Commons | `commons.wikimedia.org` | Kata kunci pencarian, alamat IP, jenis perangkat                        |

Permintaan ini dikirim langsung dari HP Anda ke layanan tersebut lewat koneksi terenkripsi (`https`). Kami tidak melihat, menyimpan, atau menerima salinan kata kunci Anda. Layanan itu menangani data sesuai kebijakan privasinya masing-masing. Bila Anda tidak memakai **Cari**, tidak ada data yang dikirim ke layanan itu. Berkas yang Anda unduh disimpan di HP Anda, bersama nama pencipta dan jenis lisensinya.

## 4. Akun Google, server kami, dan cadangan di Google Drive

Aplikasi **memerlukan** masuk dengan akun Google. Akun Google apa pun dapat masuk. Saat Anda memilih **Masuk dengan Google**:

- Aplikasi meminta izin ke Google untuk: mengetahui nama, alamat email, dan foto profil Anda, serta mengakses **folder data aplikasi tersembunyi** di Google Drive Anda (cakupan `drive.appdata`). Aplikasi **tidak** dapat melihat berkas Drive Anda yang lain.
- Aplikasi mengirim token akses ke server kami lewat `https`. Server memastikan token itu dikeluarkan Google untuk Aplikasi ini, mencatat email dan nama Anda (bagian 1), dan mengembalikan tanda masuk yang berlaku **30 hari**.
- Selama 30 hari itu Aplikasi dapat dipakai **tanpa internet**. Bila Aplikasi terhubung ke internet dan tanda masuk berumur lebih dari satu hari, Aplikasi memeriksa ulang ke server secara diam-diam. Setelah 30 hari tanpa pemeriksaan, Aplikasi terkunci sampai Anda masuk lagi dengan internet.
- Akun yang kami blokir (misalnya karena penyalahgunaan) tidak dapat memakai Aplikasi pada pemeriksaan berikutnya.
- Aplikasi dapat menyimpan **satu berkas cadangan** di folder tersembunyi di Drive Anda. Isinya: preset latihan per lagu (tempo, kunci, loop, equalizer, Minus One), **judul dan ukuran lagu** yang dipakai untuk mencocokkan lagu yang sama di HP lain, dan beberapa setelan (kualitas mesin nada, metronom, mode putar). **Lagu atau berkas audio tidak ikut dicadangkan.**
- Cadangan ini **milik Anda** dan berada di akun Google Anda. Cadangan tidak lewat server kami. Komunikasi dengan Google Drive langsung antara HP Anda dan Google, lewat `https`.
- Foto profil ditampilkan dengan memuatnya dari alamat milik Google, sehingga Google menerima permintaan gambar tersebut dari HP Anda.
- Token akses dari Google hanya dipakai sebentar di memori; Aplikasi tidak menyimpannya.
- Dengan **Sinkron otomatis** aktif, Aplikasi menyinkronkan cadangan saat dibuka (paling sering sekali dalam 6 jam). Anda dapat mematikannya atau menekan **Sinkronkan sekarang** sendiri.

Google memproses data akun dan Drive Anda menurut kebijakan privasi Google.

### Menghapus data akun dan cadangan

- **Setelan, Akun Google, Hapus cadangan di Drive**: menghapus berkas cadangan dari Drive Anda.
- **Keluar**: Aplikasi melupakan akun dan tanda masuk Anda di HP, lalu terkunci. Cadangan di Drive dan catatan di server kami tidak dihapus.
- **Setelan, Hapus semua data lokal**: menghapus lagu, setelan, dan data akun di HP.
- **Menghapus email dan nama Anda dari server kami**: kirim permintaan ke email kontak di bagian 9 dari alamat email akun yang bersangkutan. Kami menghapus catatan Anda dalam waktu wajar. Setelah dihapus, Anda dapat masuk lagi dan akan dicatat sebagai pengguna baru.
- **Mencabut akses**: buka `https://myaccount.google.com/permissions` di akun Google Anda dan hapus akses Music Player. Berkas di folder data aplikasi juga ikut terhapus bila Anda memilih menghapus data aplikasi di sana.
- Menghapus (uninstall) Aplikasi menghapus seluruh data Aplikasi di HP.

## 5. Tidak ada pelacakan atau iklan

- Aplikasi **tidak melacak** perilaku Anda dan tidak memakai layanan analitik atau pelaporan kerusakan dari pihak ketiga.
- Aplikasi **tidak menampilkan iklan** dan tidak memakai pengenal iklan.
- Kami **tidak menjual atau membagikan** email dan nama Anda kepada pihak lain.

Google Play dapat mengumpulkan data teknis kerusakan dan kinerja (Android Vitals) dari perangkat yang mengaktifkannya. Pengumpulan itu dilakukan oleh Google menurut kebijakan Google, bukan oleh Aplikasi.

## 6. Penyimpanan dan keamanan

Musik dan pengaturan Anda ada di penyimpanan HP Anda; cadangan opsional ada di Google Drive Anda; catatan akun (bagian 1) ada di basis data server kami. Seluruh sambungan internet Aplikasi memakai `https`. Aplikasi menolak alamat unduhan yang tidak aman dan hanya menerima berkas bertipe audio. Karena data disimpan di HP, keamanannya juga bergantung pada pengamanan HP dan akun Google Anda (misalnya kunci layar).

## 7. Anak-anak

Aplikasi tidak ditujukan khusus untuk anak di bawah 13 tahun dan kami tidak sengaja mengumpulkan data pribadi dari anak-anak.

## 8. Perubahan kebijakan

Bila kebijakan ini berubah, kami memperbarui tanggal "Terakhir diperbarui" di atas dan menerbitkan versi terbaru di alamat yang sama. Perubahan yang berarti akan kami sampaikan lewat pembaruan Aplikasi atau halaman toko.

## 9. Kontak

Pertanyaan tentang kebijakan ini, dan permintaan penghapusan data, dapat dikirim ke:

**Mitra247**
Email: **[ISI-EMAIL-KONTAK]**
Situs: <https://mitra247.com>

---

> **Catatan internal (hapus sebelum dipublikasikan):**
>
> 1. Ganti `[ISI-EMAIL-KONTAK]` dengan email kontak publik yang sama dengan yang diisi di Google Play Console.
> 2. Teks ini harus tampil lengkap di `mitra247.com/kebijakan-privasi` dan alamat itu harus bisa dibuka lewat HTTPS dengan sertifikat yang dipercaya. Alamat ini juga cocok dipakai sebagai URL permintaan penghapusan data (bagian 4).
> 3. Isi kebijakan menggambarkan **edisi Google Play** (versi 0.5.0 dengan login wajib). Jika fitur Aplikasi berubah (mis. menambah analitik, iklan, atau data lain di server), kebijakan dan formulir Data safety harus diperbarui lebih dulu.
> 4. Bagian "Data yang disimpan di server kami" harus sesuai dengan tabel `app_users` di `server-auth/schema.sql`.
