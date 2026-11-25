# Data safety (Play Console: App content → Data safety)

Jawaban yang disarankan untuk edisi Play (Music Player, `com.mitra247.musicplayer`, versi 0.5.0). Dasarnya adalah kode dan `PRIVACYPOLICY.md`. Teks formulir di Console bisa berubah; cocokkan maknanya, bukan kata per kata. **Pemilik akun yang menjawab dan bertanggung jawab atas kebenarannya.**

## Fakta yang menjadi dasar

- Tidak ada analitik, pelaporan kerusakan pihak ketiga, iklan, atau SDK pelacak. **Akun Google bersifat opsional** (Setelan, Akun Google).
- Tidak ada server milik developer yang menerima data dari aplikasi.
- Musik, setelan, antrean terakhir, dan preset hanya di perangkat.
- Bila pengguna masuk dengan Google: aplikasi menerima nama, email, dan foto profil dari Google dan menyimpannya **hanya di HP**; lalu menulis **satu berkas cadangan** (preset per lagu dengan judul dan ukuran lagu, plus tiga setelan) ke folder data aplikasi di **Google Drive milik pengguna** (cakupan `drive.appdata`). Tidak ada server kami. Token akses tidak disimpan.
- Lalu lintas keluar lainnya: layar **Cari** mengirim kata kunci (dan alamat IP, sebagai bagian permintaan web biasa) ke `archive.org`, `api.openverse.org`, dan `commons.wikimedia.org`, lalu mengunduh berkas audio dari sana. Semua lewat `https`.
- Izin: `READ_MEDIA_AUDIO` (dan `READ_EXTERNAL_STORAGE` sampai SDK 32), `POST_NOTIFICATIONS`, `INTERNET`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`.

## Bagian 1: ikhtisar

| Pertanyaan                                                             | Jawaban                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Apakah aplikasi mengumpulkan atau membagikan tipe data pengguna wajib? | **Ya** (lihat catatan kata kunci di bawah)                                            |
| Apakah semua data pengguna dienkripsi saat transit?                    | **Ya** (hanya `https`)                                                                |
| Apakah menyediakan cara bagi pengguna untuk meminta penghapusan data?  | **Ya**: hapus semua data lewat Setelan, atau uninstall. Tidak ada data di server kami |

### Catatan penting: kata kunci pencarian

Kata kunci dikirim langsung dari HP ke layanan pihak ketiga. Definisi Google mengira data yang keluar dari perangkat ke pihak ketiga lewat aplikasi sebagai "dibagikan". Ada pengecualian untuk transfer yang dimulai sendiri oleh pengguna dan sesuai harapannya, tetapi penerapannya ke kasus ini tidak pasti. **Rekomendasi: deklarasikan.** Mendeklarasikan sedikit lebih panjang dan jujur lebih aman daripada tidak mendeklarasikan lalu ditolak.

## Bagian 2: tipe data

Tipe yang dicentang (lihat catatan di bawah tabel). Tipe lain **tidak dicentang**: lokasi, info pribadi lain (alamat, ID pengguna, telepon; nama dan email dideklarasikan di tabel), info keuangan, kesehatan, pesan, foto dan video, **file dan dokumen**, kalender, kontak, penelusuran web, info aplikasi dan kinerja (laporan kerusakan, diagnostik), ID perangkat atau lainnya.

> Berkas audio di HP dibaca dan diputar di perangkat saja dan tidak dikirim keluar, jadi **tidak** dideklarasikan sebagai "Audio files" yang dikumpulkan. Foto profil hanya dimuat dari alamat milik Google untuk ditampilkan dan tidak disimpan.

| Kategori           | Tipe data                                                       | Dikumpulkan | Dibagikan | Diproses sementara | Wajib atau opsional | Tujuan                          |
| ------------------ | --------------------------------------------------------------- | ----------- | --------- | ------------------ | ------------------- | ------------------------------- |
| Aktivitas aplikasi | Riwayat penelusuran dalam aplikasi                              | Ya          | Ya        | Tidak              | Opsional            | Fungsi aplikasi                 |
| Info pribadi       | Nama                                                            | Ya          | Tidak     | Tidak              | Opsional            | Fungsi aplikasi, manajemen akun |
| Info pribadi       | Alamat email                                                    | Ya          | Tidak     | Tidak              | Opsional            | Fungsi aplikasi, manajemen akun |
| Aktivitas aplikasi | Konten lain buatan pengguna (preset dan judul lagu di cadangan) | Ya          | Tidak     | Tidak              | Opsional            | Fungsi aplikasi                 |

Penjelasan tiap kolom:

- **Opsional**: pengguna memilih sendiri memakai layar Cari atau masuk dengan Google. Tanpa itu tidak ada data keluar.
- **Nama dan email**: dibaca dari Google Sign-In dan hanya ditampilkan serta disimpan di HP. Karena tidak dikirim ke kami, Anda bisa berargumen data ini tidak "dikumpulkan"; **rekomendasi tetap mendeklarasikan** agar jawaban tidak berbeda dengan perilaku aplikasi.
- **Cadangan Drive**: dikirim dari HP ke Google Drive pengguna sendiri, bukan ke kami. Console mungkin menanyakan apakah ini "dibagikan"; Drive pengguna bukan penyedia layanan yang bekerja untuk kami. Jawab sesuai petunjuk terbaru Console dan catat jawaban akhirnya di bawah.
- **Fungsi aplikasi**: kata kunci hanya untuk menampilkan hasil pencarian. Bukan untuk iklan, analitik, personalisasi, atau pemasaran.
- **Dibagikan dengan**: layanan sumber musik (Internet Archive, Openverse, Wikimedia Commons) yang menjalankan pencarian.

## Bagian 3: praktik keamanan (jawaban)

| Item                                | Jawaban                                              |
| ----------------------------------- | ---------------------------------------------------- |
| Data dienkripsi saat transit        | Ya                                                   |
| Pengguna dapat meminta data dihapus | Ya (Setelan, Hapus semua data lokal; atau uninstall) |
| Mengikuti kebijakan Families        | Tidak berlaku (bukan ditujukan untuk anak)           |
| Validasi keamanan independen        | Tidak                                                |

## Sebelum mengirim

1. Pastikan teks `PRIVACYPOLICY.md` tampil di `https://mitra247.com/kebijakan-privasi` (HTTPS) dan isinya sama.
2. Jika kelak ada analitik, iklan, akun milik kami, atau server, perbarui formulir ini dan kebijakan **sebelum** merilis.
3. **URL penghapusan data** (kolom di Console): pakai `https://mitra247.com/kebijakan-privasi` (bagian 4 menjelaskan cara menghapus). Pastikan bagian itu tampil.
4. **App access**: pilih "semua fungsi tersedia tanpa batasan akses" dan jelaskan bahwa masuk dengan Google bersifat opsional.
5. Simpan salinan jawaban final di berkas ini bila ada perubahan.
