# server-auth: pemeriksaan login Google

Satu berkas PHP (`public/auth.php`) dan satu tabel MySQL (`app_users`) untuk gerbang login aplikasi. Alamatnya `https://musik.mitra247.com/api/auth.php`. Rancangan lengkap: [`docs/GOOGLE_SSO.md`](../docs/GOOGLE_SSO.md) bagian 7.

Cara kerja: aplikasi mengirim token akses Google, server menanyakan ke Google siapa pemiliknya (dan bahwa token dikeluarkan untuk salah satu dari dua aplikasi kita), mencatat email di `app_users` (pendaftaran terbuka), menolak email yang `blocked`, lalu mengembalikan tanda sesi 30 hari.

## Ikut folder deploy (git pull)

`npm run deploy:prepare` menyalin `auth.php` dan `auth-config.example.php` ke folder **`api/`** di repo `musik-deploy`. Folder dokumen subdomain `musik.mitra247.com` adalah akar repo itu (lihat `docs/DEPLOY.md`), jadi setelah `git pull` di server, berkas ada di `https://musik.mitra247.com/api/auth.php`. Berkas konfigurasi rahasia `api/auth-config.php` **diabaikan git** (tidak ikut, tidak tertimpa `git pull`) dan dibuat sekali di server.

> `/api/health`, `/api/search`, dan seterusnya tetap dijawab Node. Berkas `api/auth.php` yang benar-benar ada di disk umumnya dilayani web server lebih dulu daripada Node (berkas statis menang atas rute aplikasi). Hal ini **belum diuji di hosting Anda**: pakai langkah 6 di bawah untuk memastikan. Bila jawabannya `Token tidak ada atau salah.`, Node masih mengambil alih jalur itu.

## Pasang di server (sekali)

Istilah Virtualmin; di cPanel padanannya MySQL Databases / MySQL Database Wizard dan File Manager.

1. **Basis data.** Buat basis data (misalnya `mitra247_musik`) dan pengguna dengan kata sandi acak, lalu impor skema (phpMyAdmin Import, atau):

   ```sh
   mysql -u <pengguna> -p <basis_data> < server-auth/schema.sql
   ```

2. **PHP.** Perlu PHP 8.1 atau lebih baru dengan ekstensi `curl` dan `pdo_mysql`, aktif untuk subdomain `musik.mitra247.com`.

3. **Berkas konfigurasi.** Salin `api/auth-config.example.php` menjadi **`api/auth-config.php`** di server dan isi: DSN, pengguna, kata sandi, dan `session_secret` acak (`php -r "echo bin2hex(random_bytes(32));"`). `chmod 600`. Berkas ini hanya `return [...]`, jadi tidak mengeluarkan apa pun bila diminta lewat web, dan sudah di `.gitignore`. **Jangan commit.**

   Lebih aman: taruh berkas di luar folder dokumen (mis. `/home/<user>/musik-auth-config.php`) dan tambahkan baris ini ke `.htaccess` folder dokumen yang Anda kelola sendiri, di luar blok yang dikelola cPanel (jangan masukkan ke repo):

   ```apache
   SetEnv MUSIK_AUTH_CONFIG /home/<user>/musik-auth-config.php
   ```

4. **Client ID.** Di `client_ids`, pastikan dua nilai sama dengan Client ID di Google Cloud (`music-player-mitra247`, Google Auth Platform, Clients: `com.mitra247.musicplayer` dan `com.mitra247.musictools`). Contoh di berkas sudah cocok dengan token asli yang diperiksa pada 26 November 2026. Salah satu yang salah membuat edisi itu ditolak (`audience`). Tambahkan juga `client_id_prefixes` (contoh: `['653398046329-']`, nomor proyek Google Cloud): semua client di proyek itu diterima, termasuk client untuk kunci upload dan kunci Play App Signing yang dibuat belakangan, tanpa mengubah berkas ini lagi.

5. **Deploy.** Di repo sumber, ucapkan "deploy" (atau `npm run build` lalu `npm run deploy:prepare`, commit, tag, push), lalu di server `git pull`. Tidak perlu memulai ulang Node untuk perubahan `api/auth.php`; mulai ulang hanya bila `server/` berubah.

6. **Uji.**

   ```sh
   curl -i https://musik.mitra247.com/api/auth.php
   curl -i -X POST https://musik.mitra247.com/api/auth.php -H "content-type: application/json" -d "{\"accessToken\":\"x\"}"
   ```

   Hasil yang benar: `405` dengan `{"error":"method"}` untuk GET, dan `401` dengan `{"error":"token"}` untuk POST. `500` dengan `config` berarti `auth-config.php` tidak ditemukan; `500` dengan `db` berarti koneksi MySQL gagal (lihat log PHP). Jawaban `{"error":"unauthorized","message":"Token tidak ada atau salah."}` berarti Node yang menjawab, bukan PHP; jawaban HTML atau teks `<?php` berarti PHP tidak dijalankan di jalur itu. Dalam kedua kasus itu jalur `/api/auth.php` tidak bisa dipakai di subdomain ini dan alamatnya perlu dipindah (ubah `MUSIK_AUTH_URL` saat build).

## Mengelola pengguna

```sql
SELECT email, name, edition, status, last_seen, login_count FROM app_users ORDER BY last_seen DESC;
UPDATE app_users SET status = 'blocked' WHERE email = 'nama@contoh.com';   -- kunci aplikasi
UPDATE app_users SET status = 'active'  WHERE email = 'nama@contoh.com';   -- buka lagi
DELETE FROM app_users WHERE email = 'nama@contoh.com';                       -- permintaan hapus data
```

Blokir berlaku pada pemeriksaan berikutnya: paling lambat sehari setelah HP terhubung internet, dan paling lambat 30 hari bila HP tidak pernah online.

## Uji otomatis

```sh
node e2e/auth-server.mjs
```

Memakai PHP, MySQL lokal (XAMPP: user `root` tanpa kata sandi), dan Google palsu. Dilewati bila PHP atau MySQL tidak ada.

## Batasan

- Tidak ada pembatasan laju (rate limit) per IP. Bila endpoint disalahgunakan, tambahkan di level web server (`fail2ban`, aturan LiteSpeed) atau tabel hitung sederhana.
- Memanggil `oauth2.googleapis.com/tokeninfo` dan `www.googleapis.com/oauth2/v3/userinfo` per masuk. Server harus bisa keluar ke internet.
- Gerbang ini adalah kontrol akses, bukan perlindungan penuh: seluruh fitur berjalan di HP, jadi aplikasi yang sengaja dimodifikasi bisa melewatinya.
