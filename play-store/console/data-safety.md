# Data safety (Play Console: App content → Data safety)

Jawaban yang disarankan untuk edisi Play (Music Player, `com.mitra247.musicplayer`, versi 0.5.2). Dasarnya adalah kode dan `PRIVACYPOLICY.md`. Teks formulir di Console bisa berubah; cocokkan maknanya, bukan kata per kata. **Pemilik akun yang menjawab dan bertanggung jawab atas kebenarannya.**

## Fakta yang menjadi dasar

- Tidak ada analitik, pelaporan kerusakan pihak ketiga, iklan, atau SDK pelacak. **Login Google wajib** (layar masuk sebelum aplikasi dipakai).
- Ada **server milik developer** (`https://musik.mitra247.com/api/auth.php`, PHP dan MySQL) yang menerima token akses Google saat masuk, memverifikasinya ke Google, dan menyimpan **email, nama, edisi aplikasi, waktu masuk pertama dan terakhir, jumlah masuk, dan status (aktif atau diblokir)**. Token tidak disimpan.
- Musik, setelan, antrean terakhir, dan preset hanya di perangkat.
- Saat masuk, aplikasi menerima nama, email, dan foto profil dari Google. Nama dan email juga dikirim ke server kami (lihat atas); foto hanya di HP. Aplikasi menulis **satu berkas cadangan** (preset per lagu dengan judul dan ukuran lagu, plus tiga setelan) ke folder data aplikasi di **Google Drive milik pengguna** (cakupan `drive.appdata`). Cadangan tidak lewat server kami. Token akses tidak disimpan.
- Lalu lintas keluar lainnya: layar **Cari** mengirim kata kunci (dan alamat IP, sebagai bagian permintaan web biasa) ke `archive.org`, `api.openverse.org`, dan `commons.wikimedia.org`, lalu mengunduh berkas audio dari sana. Semua lewat `https`.
- Izin: `READ_MEDIA_AUDIO` (dan `READ_EXTERNAL_STORAGE` sampai SDK 32), `POST_NOTIFICATIONS`, `INTERNET`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`.

## Bagian 1: ikhtisar

| Pertanyaan                                                             | Jawaban                                                                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Apakah aplikasi mengumpulkan atau membagikan tipe data pengguna wajib? | **Ya** (lihat catatan kata kunci di bawah)                                                                             |
| Apakah semua data pengguna dienkripsi saat transit?                    | **Ya** (hanya `https`)                                                                                                 |
| Apakah menyediakan cara bagi pengguna untuk meminta penghapusan data?  | **Ya**: hapus data lokal lewat Setelan, hapus cadangan Drive, dan minta penghapusan email di server lewat email kontak |

### Catatan penting: kata kunci pencarian

Kata kunci dikirim langsung dari HP ke layanan pihak ketiga. Definisi Google mengira data yang keluar dari perangkat ke pihak ketiga lewat aplikasi sebagai "dibagikan". Ada pengecualian untuk transfer yang dimulai sendiri oleh pengguna dan sesuai harapannya, tetapi penerapannya ke kasus ini tidak pasti. **Rekomendasi: deklarasikan.** Mendeklarasikan sedikit lebih panjang dan jujur lebih aman daripada tidak mendeklarasikan lalu ditolak.

## Bagian 2: tipe data

Tipe yang dicentang (lihat catatan di bawah tabel). Tipe lain **tidak dicentang**: lokasi, info pribadi lain (alamat, ID pengguna, telepon; nama dan email dideklarasikan di tabel), info keuangan, kesehatan, pesan, foto dan video, **file dan dokumen**, kalender, kontak, penelusuran web, info aplikasi dan kinerja (laporan kerusakan, diagnostik), ID perangkat atau lainnya.

> Berkas audio di HP dibaca dan diputar di perangkat saja dan tidak dikirim keluar, jadi **tidak** dideklarasikan sebagai "Audio files" yang dikumpulkan. Foto profil hanya dimuat dari alamat milik Google untuk ditampilkan dan tidak disimpan.

| Kategori           | Tipe data                                                       | Dikumpulkan | Dibagikan | Diproses sementara | Wajib atau opsional | Tujuan                          |
| ------------------ | --------------------------------------------------------------- | ----------- | --------- | ------------------ | ------------------- | ------------------------------- |
| Aktivitas aplikasi | Riwayat penelusuran dalam aplikasi                              | Ya          | Ya        | Tidak              | Opsional            | Fungsi aplikasi                 |
| Info pribadi       | Nama                                                            | Ya          | Tidak     | Tidak              | Wajib               | Fungsi aplikasi, manajemen akun |
| Info pribadi       | Alamat email                                                    | Ya          | Tidak     | Tidak              | Wajib               | Fungsi aplikasi, manajemen akun |
| Aktivitas aplikasi | Konten lain buatan pengguna (preset dan judul lagu di cadangan) | Ya          | Tidak     | Tidak              | Opsional            | Fungsi aplikasi                 |

Penjelasan tiap kolom:

- **Wajib atau opsional**: nama dan email **wajib** (login Google diperlukan untuk memakai aplikasi). Layar Cari dan cadangan Drive opsional.
- **Nama dan email**: dikirim ke dan disimpan di server kami (basis data pengguna), jadi **dikumpulkan**. Tujuan: fungsi aplikasi (hanya akun Google sah yang masuk) dan manajemen akun (memblokir penyalahgunaan). Tidak dibagikan ke pihak lain, tidak untuk iklan atau analitik.
- **Cadangan Drive**: dikirim dari HP ke Google Drive pengguna sendiri, bukan ke kami. Console mungkin menanyakan apakah ini "dibagikan"; Drive pengguna bukan penyedia layanan yang bekerja untuk kami. Jawab sesuai petunjuk terbaru Console dan catat jawaban akhirnya di bawah.
- **Fungsi aplikasi**: kata kunci hanya untuk menampilkan hasil pencarian. Bukan untuk iklan, analitik, personalisasi, atau pemasaran.
- **Dibagikan dengan**: layanan sumber musik (Internet Archive, Openverse, Wikimedia Commons) yang menjalankan pencarian.

## Bagian 3: praktik keamanan (jawaban)

| Item                                | Jawaban                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Data dienkripsi saat transit        | Ya                                                                                                                                 |
| Pengguna dapat meminta data dihapus | Ya: Setelan (Hapus cadangan di Drive, Hapus semua data lokal), permintaan hapus email di server lewat email kontak, atau uninstall |
| Mengikuti kebijakan Families        | Tidak berlaku (bukan ditujukan untuk anak)                                                                                         |
| Validasi keamanan independen        | Tidak                                                                                                                              |

## Sebelum mengirim

1. Pastikan teks `PRIVACYPOLICY.md` tampil di `https://mitra247.com/showcase/musik-player-19/privacy-policy` (HTTPS) dan isinya sama (halaman sudah diperiksa 26 November: email `apps.developer@mitra247.com`, tanpa blok catatan internal). Catatan internal ada di `play-store/console/privacy-policy-notes.md`.
2. Jika kelak ada analitik, iklan, akun milik kami, atau server, perbarui formulir ini dan kebijakan **sebelum** merilis.
3. **URL penghapusan data** (kolom di Console): pakai `https://mitra247.com/showcase/musik-player-19/privacy-policy` (bagian 4 menjelaskan cara menghapus). Pastikan bagian itu tampil.
4. **Sign in details** (dulu "App access"): pilih "ya, sebagian fungsi dibatasi", tambahkan satu set detail. **Play menyatakan reviewer tidak bisa membuat akun dan tidak memakai akun pribadinya**, jadi siapkan **akun Google uji khusus** (tanpa verifikasi 2 langkah) dan isi email serta passwordnya di kolom username dan password. Tulis instruksi dalam bahasa Inggris: ketuk "Masuk dengan Google", pilih akun uji, izinkan akses. Akun uji itu akan tercatat di `app_users` sebagai pengguna biasa. Jangan pakai akun pribadi Anda.
5. Simpan salinan jawaban final di berkas ini bila ada perubahan.
