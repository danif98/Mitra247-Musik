# server-auth: pemeriksaan login Google

Satu berkas PHP (`public/auth.php`) dan satu tabel MySQL (`app_users`) untuk gerbang login aplikasi. Berjalan di server Virtualmin yang sama dengan `mitra247.com`, di alamat `https://mitra247.com/musik-auth/auth.php`. Rancangan lengkap: [`docs/GOOGLE_SSO.md`](../docs/GOOGLE_SSO.md) bagian 7.

Cara kerja: aplikasi mengirim token akses Google, server menanyakan ke Google siapa pemiliknya (dan bahwa token dikeluarkan untuk salah satu dari dua aplikasi kita), mencatat email di `app_users` (pendaftaran terbuka), menolak email yang `blocked`, lalu mengembalikan tanda sesi 30 hari.

## Pasang di Virtualmin

Langkah memakai istilah Virtualmin. Di cPanel padanannya: MySQL Databases / MySQL Database Wizard, File Manager, dan AutoSSL.

**Kenapa `mitra247.com/musik-auth/` dan bukan `musik.mitra247.com`:** subdomain `musik.` sepenuhnya dilayani server Node (setiap jalur, termasuk `/api/auth.php`, dijawab Node dengan `Token tidak ada atau salah.`), dan `mitra247.com/api/` dipegang backend situs utama. Jalur `/musik-auth/` di domain utama bebas. Sertifikat `*.mitra247.com` Let's Encrypt sudah berlaku di domain utama.

1. **Basis data.** Virtualmin, domain `mitra247.com`, Edit Databases, buat basis data (misalnya `mitra247_musik`) dan pengguna dengan kata sandi acak. Impor skema:

   ```sh
   mysql -u <pengguna> -p <basis_data> < schema.sql
   ```

2. **PHP.** Perlu PHP 8.1 atau lebih baru dengan ekstensi `curl` dan `pdo_mysql`.

3. **Berkas konfigurasi di luar web root.** Salin `auth-config.example.php` ke `/home/<domain>/auth-config.php` (satu tingkat di atas `public_html`), lalu isi: DSN, pengguna, kata sandi, dan `session_secret` acak (`php -r "echo bin2hex(random_bytes(32));"`). Izin `chmod 600`. **Jangan commit berkas ini.**

4. **Daftar client ID.** Di `client_ids`, pastikan dua nilai sama dengan Client ID di Google Cloud (`music-player-mitra247`, Google Auth Platform, Clients: satu untuk `com.mitra247.musicplayer` dan satu untuk `com.mitra247.musictools`). Salah satu saja yang salah membuat edisi itu ditolak (`audience`).

5. **Unggah endpoint.** Salin `public/auth.php` dan `public/.htaccess` ke folder `musik-auth/` di document root `mitra247.com` (`public_html/musik-auth/`) sehingga alamatnya `https://musik.mitra247.com/api/auth.php`. Di `.htaccess` itu, hapus tanda `#` pada baris `SetEnv MUSIK_AUTH_CONFIG ...` dan isi dengan jalur absolut berkas dari langkah 3. Berkas konfigurasi **tidak boleh** berada di dalam `public_html`.

6. **HTTPS.** Sertifikat harus dari CA yang dipercaya (Let's Encrypt) dan valid untuk `mitra247.com` (sudah, per 26 November 2026). Aplikasi menolak HTTP.

7. **Uji.**

   ```sh
   curl -i -X POST https://mitra247.com/musik-auth/auth.php -H "content-type: application/json" -d "{\"accessToken\":\"x\"}"
   ```

   Hasil yang benar: `401` dengan `{"error":"token"}`. Jawaban HTML (halaman situs) berarti PHP tidak dijalankan di jalur itu; jawaban `Token tidak ada atau salah.` berarti server Node yang menjawab. `500` dengan `config` berarti berkas konfigurasi tidak ditemukan; `500` dengan `db` berarti koneksi MySQL gagal (lihat log PHP).

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

- Tidak ada pembatasan laju (rate limit) per IP. Bila endpoint disalahgunakan, tambahkan di level Apache (`mod_evasive`, `fail2ban`) atau tabel hitung sederhana.
- Memakai pemanggilan `oauth2.googleapis.com/tokeninfo` dan `www.googleapis.com/oauth2/v3/userinfo` per masuk. Server harus bisa keluar ke internet.
- Gerbang ini adalah kontrol akses, bukan perlindungan penuh: seluruh fitur berjalan di HP, jadi aplikasi yang sengaja dimodifikasi bisa melewatinya.
