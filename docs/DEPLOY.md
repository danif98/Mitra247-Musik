# Deploy (cPanel, manual)

Alur: **build lokal -> siapkan repo `musik-deploy` -> push -> `git pull` manual di server -> restart**. Rahasia hanya di environment variable server.

## 0. Membuat repo git (sekali saja)

Dua repo terpisah. Keduanya sebaiknya **privat** (repo `musik` berisi seluruh sumber, repo `musik-deploy` hasil build). Tidak ada rahasia di keduanya: `.env`, `vendor.zip`, `data/` sudah masuk `.gitignore`.

**Repo sumber `musik`** (folder proyek ini sudah berisi riwayat commit lokal):

```powershell
git status                      # harus bersih (folder .claude/ tidak ikut, sudah diabaikan)
git remote add origin <url repo musik>
git push -u origin main
```

**Repo deploy `musik-deploy`**: buat repo kosong di GitHub/GitLab, **tanpa** README. Folder lokalnya dibuat oleh `deploy:prepare` (bawaan `..\musik-deploy`, di samping folder proyek):

```powershell
npm run build
npm run deploy:prepare          # mencetak perintah git berikutnya
cd ..\musik-deploy
git init -b main                # hanya pertama kali
git remote add origin <url repo musik-deploy>
git add -A
git commit -m "build: 0.1.0"
git tag v0.1.0
git push -u origin main --tags
```

Server perlu bisa `git pull` dari repo deploy: pakai URL HTTPS dengan _deploy token_ read-only, atau kunci SSH khusus server (deploy key, read-only). Jangan menaruh token itu di repo.

Periksa dulu sebelum push pertama:

```powershell
git ls-files | Select-String -Pattern "\.env$|vendor\.zip|\.pem$"   # harus kosong
```

## 1. Build dan siapkan folder deploy (lokal, Windows/Linux/macOS)

```powershell
npm install
npm run build            # out/app (PWA) + out/server
npm run check:pure-js    # gagal bila dependensi server punya binding native
npm run deploy:prepare   # menyalin ke ..\musik-deploy (atau MUSIK_DEPLOY_DIR)
```

Folder lain: `$env:MUSIK_DEPLOY_DIR = "D:\path\musik-deploy"` sebelum `deploy:prepare`.
Skrip menulis `app/`, `server/`, `api/auth.php` (+ `api/auth-config.example.php`, endpoint login Google; `api/auth-config.php` dengan rahasia dibuat di server, tidak ikut git), `package.json`, `package-lock.json`, `VERSION`, `.gitignore`. Lihat `server-auth/README.md`. Tanpa `vendor.zip`, tanpa `.env`; ada pemindaian rahasia sebelum selesai. Skrip mencetak perintah commit/tag/push; **jalankan manual**:

```powershell
cd ..\musik-deploy
git init                 # hanya pertama kali; lalu git remote add origin <url>
git add -A
git commit -m "build: <versi>"
git tag v<versi>
git push origin HEAD --tags
```

## 2. vendor.zip (hanya bila dependensi server berubah)

```powershell
npm run vendor:zip       # menghasilkan out\vendor.zip (di luar repo deploy), mencetak ukuran dan versi Node
```

Server M2 **tidak punya dependensi runtime** (hanya modul bawaan Node), jadi `vendor.zip` hanya berisi berkas penanda dan tidak perlu diunggah ulang. Bila kelak ada dependensi pure JS: unggah manual ke root aplikasi, ekstrak sehingga `node_modules/` berada di samping `package.json`. Versi Node saat build harus sama dengan versi di _Setup Node.js App_ (server mendukung Node >= 18).

## 3. Di server

### 3.1 Prasyarat (sudah terverifikasi di PRD 5.5)

- ffmpeg statis: `~/bin/ffmpeg`.
- yt-dlp lewat venv Python: `~/ytvenv/bin/yt-dlp`. **Perbarui rutin** (`~/ytvenv/bin/pip install -U yt-dlp`); YouTube sering berubah dan unduhan bisa gagal sampai pembaruan keluar. Versi tampil di `GET /api/health`.
- yt-dlp memerlukan _JavaScript runtime_ untuk sebagian format. Pilih salah satu dan uji (lihat `TEST_SERVER.md`):
  - Node dari cPanel: `YTDLP_JS_RUNTIME=node:/home/<user>/nodevenv/<app>/<versi>/bin/node`
  - atau pasang `deno` di `~/bin` dan `YTDLP_JS_RUNTIME=deno:/home/<user>/bin/deno`

### 3.2 Setup pertama

```bash
cd ~
git clone <url musik-deploy> musik-deploy
```

cPanel -> _Setup Node.js App_ -> Create: Application root `musik-deploy`, Application URL (mis. `domain-anda.com/musik-api`), **Startup file `server/app.js`**, pilih versi Node. Tambahkan _Environment variables_ (daftar lengkap di `.env.example`):

| Variabel             | Isi                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `MUSIK_TOKEN`        | wajib; 32 byte acak hex: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`                    |
| `YTDLP_PATH`         | `/home/<user>/ytvenv/bin/yt-dlp` (path absolut)                                                                        |
| `FFMPEG_PATH`        | `/home/<user>/bin/ffmpeg`                                                                                              |
| `DATA_DIR`           | folder kerja di luar `public_html`, mis. `/home/<user>/musik-data`                                                     |
| `ALLOWED_ORIGINS`    | origin PWA, mis. `https://domain-anda.com` (tanpa path); tambahkan `chrome-extension://<id>` bila memakai ekstensi     |
| `YTDLP_COOKIES_FILE` | opsional; path berkas `cookies.txt` (format Netscape) di luar `public_html`, `chmod 600`. Lihat 3.2                    |
| `YTDLP_PROXY`        | opsional; mis. `socks5h://user:sandi@host:1080` atau `http://host:3128`. Lihat 3.2                                     |
| `YTDLP_JS_RUNTIME`   | lihat 3.1                                                                                                              |
| opsional             | `MAX_ACTIVE` (1-2), `MAX_QUEUE`, `MAX_DURATION_SEC` (1200), `RETENTION_MINUTES` (60), `JOB_TIMEOUT_SEC`, `TRUST_PROXY` |

**3.2 Bila YouTube memblokir server ("Sign in to confirm you're not a bot").** IP hosting bersama sering ditolak YouTube. Uji dengan `yt-dlp --simulate --no-playlist <url>` di Terminal cPanel; log kegagalan job juga masuk `stderr.log` (10 baris terakhir, tanpa URL). Dua opsi, boleh dipakai bersama:

- `YTDLP_PROXY`: lalu lintas yt-dlp lewat proxy dengan IP yang tidak diblokir (VPS sendiri, tunnel ke rumah). Nilai bisa berisi sandi: isi hanya sebagai variabel, jangan di repo. Hanya skema `http`, `https`, `socks4`, `socks5`, `socks5h` yang diterima; nilai lain diabaikan dengan peringatan.
- `YTDLP_COOKIES_FILE`: cookies akun YouTube hasil ekspor dari browser (lihat wiki yt-dlp "Exporting YouTube cookies"). Server menyalin berkas ini per job dan menghapus salinannya setelah selesai, jadi berkas asli tidak diubah. **Risiko:** akun yang dipakai bisa kena batasan atau ditandai; pakai akun cadangan, bukan akun utama. Perlakukan berkas ini seperti sandi: di luar document root, `chmod 600`, jangan di-commit.

`/api/health` menampilkan `cookies` dan `proxy` (true/false saja, nilainya tidak pernah ditampilkan). Isi variabel di cPanel lalu Restart.

**Alternatif `.env`:** buat `~/musik-deploy/.env` (akar aplikasi, sejajar `package.json`; bukan di `app/` atau `server/`), isi dari `.env.example`, lalu `chmod 600 .env`. Berkas ini diabaikan git sehingga `git pull` tidak menimpanya; variabel yang diisi di cPanel menang atas isi `.env`. Hanya `app/` yang boleh terbuka ke web; jangan membuka seluruh `~/musik-deploy`, karena `.env` berisi token. Cek hasilnya di `/api/health` (`configured:true`).

`PORT` diatur Passenger. Server berjalan sebagai pengguna cPanel (bukan root). Token tidak pernah dicatat di log. Simpan token yang sama di perangkat (Setelan PWA); mengganti token = ubah variabel lalu restart, lalu perbarui PWA.

Situs statis PWA: arahkan `public_html/<jalur>` ke `~/musik-deploy/app` (symlink atau salin). **PWA harus lewat HTTPS** dan API juga HTTPS (kalau tidak, browser memblokir panggilan campuran). Berkas `app/.htaccess` (ikut terbawa dari build) mengatur tipe MIME `.wasm` / `.webmanifest` dan `Cache-Control: no-cache` untuk HTML, `sw.js` dan manifest; pastikan hosting memakai Apache/LiteSpeed yang membaca `.htaccess`, lalu cek dengan `curl -sI`.

### 3.3 Perbarui versi

```bash
cd ~/musik-deploy && git pull
```

lalu restart (bagian 4).

## 4. Restart

Pilih salah satu:

- cPanel -> _Setup Node.js App_ -> **Restart**.
- `touch ~/musik-deploy/tmp/restart.txt` lalu buka URL aplikasi sekali.

Cek cepat:

```bash
curl -s https://domain-anda.com/musik-api/api/health
# {"status":"ok","version":"...","ytdlp":"2026.x.x","configured":true,...}
```

`configured:false` berarti `MUSIK_TOKEN` belum ada / terlalu pendek. `ytdlp:null` berarti `YTDLP_PATH` salah atau tidak bisa dijalankan.

## 5. Perilaku layanan yang perlu diketahui

- Satu URL per permintaan, MP3 saja (V2 / 192k). Playlist ditolak; URL dibangun ulang dari ID video sehingga hanya youtube.com / youtu.be / music.youtube.com yang bisa dijangkau.
- Antrean: `MAX_ACTIVE` aktif + `MAX_QUEUE` menunggu; sisanya ditolak `429 busy`.
- Berkas MP3 dihapus `RETENTION_MINUTES` setelah selesai (default 1 jam) dan saat layanan start.
- 5 token salah dari satu IP dalam 10 menit = IP diblokir 15 menit. Batas laju: 10 permintaan konversi/menit per IP, 20/menit per token.
- IP klien diambil dari entri terakhir `X-Forwarded-For` (`TRUST_PROXY=true`, bawaan). Bila server tidak di belakang proxy, set `TRUST_PROXY=false`.
- Data job ada di memori: restart server menghapus status job (berkas lama tetap dibersihkan lewat umur folder).

## Rollback

`git checkout v<versi-lama>` di server, lalu restart.

## Uji lokal: PC + HP lewat USB (tanpa cPanel)

Server membaca `.env` di folder kerjanya (akar aplikasi); variabel yang sudah ada di lingkungan tidak ditimpa. Di cPanel cara yang disarankan tetap _Environment variables_ di Setup Node.js App; `.env` di server juga bekerja (lihat 3.2). Buat `.env` di akar proyek dari `.env.example`:

```
MUSIK_TOKEN=<token >= 32 karakter>
PORT=3000
ALLOWED_ORIGINS=http://localhost:4173
TRUST_PROXY=false
# opsional, bila yt-dlp/ffmpeg terpasang di PC:
# YTDLP_PATH=C:\path\yt-dlp.exe
# FFMPEG_PATH=C:\path\ffmpeg.exe
```

Tiga proses/perintah (terminal terpisah):

```powershell
npm run build
node e2e/static-server.mjs out/app 4173    # PWA
node out/server/app.js                      # API di port 3000
adb reverse tcp:4173 tcp:4173
adb reverse tcp:3000 tcp:3000
```

Di PWA (HP) buka `http://localhost:4173/`, Setelan -> **URL server `http://localhost:3000`** (tanpa `/musik-api`), isi token yang sama, Tes koneksi. Port 4173 adalah PWA, bukan API.

## Struktur nyata di cPanel, diagnosa, dan pengamanan

### Bila folder dokumen subdomain = akar aplikasi (kasus `musik.<domain>`)

Bila repo `musik-deploy` di-clone langsung sebagai folder dokumen subdomain, alamatnya menjadi:

| Alamat                                  | Isi                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `https://<subdomain>/app/`              | **PWA** (buka ini di HP; bukan `/`, karena `/` tidak punya `index.html`) |
| `https://<subdomain>/<Application URL>` | API Node (mis. `/musik-api`); `.../api/health` harus memberi JSON        |

Akibatnya semua isi repo ikut terbuka ke web: daftar folder (`server/`, `node_modules/`, `package.json`, `VERSION`). Berkas titik (`.env`, `.htaccess`) biasanya diblokir server (403), tetapi **jangan bergantung padanya**. Tambahkan aturan berikut ke `.htaccess` di folder dokumen itu, **di luar** blok `CLOUDLINUX PASSENGER CONFIGURATION` yang dikelola cPanel (jangan menaruh `.htaccess` ini di repo; `git pull` akan bentrok dengan berkas yang diubah cPanel):

```apache
Options -Indexes
RewriteEngine On
RewriteRule ^$ /app/ [R=302,L]
RewriteRule ^(server|node_modules|tmp|data|public)(/|$) - [F,L]
RewriteRule ^(package(-lock)?\.json|VERSION|README\.md)$ - [F,L]
```

Artinya: `/` mengalihkan ke `/app/`, daftar folder dimatikan, dan kode server serta berkas konfigurasi tidak bisa diunduh. Jangan menaruh `DATA_DIR` di dalam folder dokumen (pakai mis. `/home/<user>/musik-data`), supaya MP3 hasil konversi tidak bisa diakses lewat web. Verifikasi dengan `curl -sI https://<subdomain>/server/app.js` (harus 403) dan `curl -sI https://<subdomain>/` (harus 302 ke `/app/`).

Alternatif yang lebih bersih: pisahkan folder dokumen (hanya berisi isi `app/`) dari akar aplikasi Node. Cara ini butuh pemetaan Passenger yang berbeda; lakukan hanya bila Anda nyaman mengubah pengaturan cPanel.

### Diagnosa dari browser (tanpa SSH)

| Uji                                                                                     | Hasil benar                     | Bila lain                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://<subdomain>/app/`                                                              | Aplikasi tampil                 | 404 / daftar folder: symlink atau salinan `app/` belum benar                                                                                                                              |
| `.../app/sw.js`                                                                         | `Content-Type: text/javascript` | MIME lain: `app/.htaccess` tidak terbaca (hosting bukan Apache/LiteSpeed)                                                                                                                 |
| `.../<Application URL>/api/health`                                                      | JSON `{"status":"ok",...}`      | **Daftar folder kosong atau halaman 404 HTML dari LiteSpeed = aplikasi Node tidak berjalan**                                                                                              |
| `.../<Application URL>/api/health` -> 401                                               | JSON `unauthorized`             | Aplikasi jalan tetapi memakai versi < 0.1.1 (tidak mengenal awalan jalur); perbarui ke 0.1.1+                                                                                             |
| `.../<Application URL>/api/health` -> **503** (halaman "Service Unavailable" LiteSpeed) | JSON `{"status":"ok",...}`      | Permintaan sudah diteruskan ke aplikasi tetapi aplikasi tidak menjawab: gagal start, mati, atau (versi < 0.1.2) tidak pernah memanggil `listen()`. Perbarui ke 0.1.2+, Restart, lihat log |

Bila aplikasi Node tidak berjalan (daftar folder atau 404 HTML dari LiteSpeed): buka cPanel -> _Setup Node.js App_ dan periksa

1. status aplikasi **Started** (bukan Stopped); tekan **Restart**;
2. _Application root_ benar (folder yang berisi `package.json`), _Application startup file_ `server/app.js`, _Application URL_ sama dengan yang dipakai di alamat API;
3. versi Node dipilih (>= 18) dan variabel lingkungan tersimpan (tombol **Save**, lalu Restart);
4. log kesalahan aplikasi (`stderr.log` di akar aplikasi, atau tautan log di halaman aplikasi). Pesan `MUSIK_TOKEN is not set` bukan galat fatal (server tetap hidup); galat `Cannot find module` berarti folder `server/` tidak lengkap (ulangi `git pull`).

**Startup file:** `server/app.js` selalu memanggil `listen()` saat dimuat (Passenger memuatnya lewat pembungkus). Uji sebelum deploy: `npm run build && npm run smoke:server` memuat hasil build lewat `require()` seperti Passenger dan memeriksa `/api/health`.

**Awalan jalur:** Passenger meneruskan URL asli ke aplikasi (mis. `/musik-api/api/health`). Server 0.1.1+ mengabaikan apa pun sebelum `/api/`, jadi Application URL bebas (`/musik-api`, `/musik/api`, dll.).

## Daftar periksa go-live

Urutan dari paling mendasar. Centang satu per satu; detail uji ada di `TEST_SERVER.md`.

1. [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check:pure-js`, `npm run smoke:server` lulus di PC.
2. [ ] Versi Node di _Setup Node.js App_ >= 18 (disarankan 20 atau 22); catat versinya.
3. [ ] `~/ytvenv/bin/yt-dlp --version` dan `~/bin/ffmpeg -version` berjalan dari SSH; pilih runtime JS untuk yt-dlp.
4. [ ] Environment variable terisi: `MUSIK_TOKEN`, `YTDLP_PATH`, `FFMPEG_PATH`, `DATA_DIR`, `ALLOWED_ORIGINS` (origin PWA yang persis, tanpa `/` di akhir), `YTDLP_JS_RUNTIME`.
5. [ ] `curl -s https://<domain>/<Application URL>/api/health` -> `configured:true`, `ytdlp` berisi versi, `ffmpegFound:true`.
6. [ ] PWA terbuka lewat HTTPS di alamat yang benar (lihat tabel struktur di atas; bila folder dokumen = akar aplikasi, alamatnya `/app/`); `curl -sI https://<domain>/<jalur>/sw.js` -> `Content-Type: text/javascript`, `Cache-Control: no-cache`; `.../assets/*.wasm` -> `application/wasm`.
7. [ ] Di PWA: Setelan -> URL server + token -> Tes koneksi -> "Terhubung. Token benar."
8. [ ] Satu konversi nyata (video pendek) sampai masuk Library dan bisa diputar.
9. [ ] Pasang PWA di HP (Instal aplikasi), uji offline (mode pesawat) dan Share Target dari aplikasi YouTube.
10. [ ] Setelah 1 jam: folder job di `DATA_DIR/jobs` terhapus.
11. [ ] Tag git `v<versi>` ada di repo deploy (untuk rollback); catat hasil uji di `TEST_SERVER.md`.

Bila ada galat: `ytdlpProblem` di health menjelaskan masalah yt-dlp; pesan di layar YouTube menjelaskan kode galat job; log server ada di Passenger/cPanel (tidak memuat token).
