# Deploy (cPanel, manual)

Alur: **build lokal -> siapkan repo `musik-deploy` -> push -> `git pull` manual di server -> restart**. Rahasia hanya di environment variable server.

## 1. Build dan siapkan folder deploy (lokal, Windows/Linux/macOS)

```powershell
npm install
npm run build            # out/app (PWA) + out/server
npm run check:pure-js    # gagal bila dependensi server punya binding native
npm run deploy:prepare   # menyalin ke ..\musik-deploy (atau MUSIK_DEPLOY_DIR)
```

Folder lain: `$env:MUSIK_DEPLOY_DIR = "D:\path\musik-deploy"` sebelum `deploy:prepare`.
Skrip menulis `app/`, `server/`, `package.json`, `package-lock.json`, `VERSION`, `.gitignore`. Tanpa `vendor.zip`, tanpa `.env`; ada pemindaian rahasia sebelum selesai. Skrip mencetak perintah commit/tag/push; **jalankan manual**:

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

Unggah manual (File Manager/SFTP) ke root aplikasi di server dan ekstrak sekali sehingga `node_modules/` berada di samping `package.json`. Versi Node saat build harus sama dengan versi di _Setup Node.js App_. Saat ini server tanpa dependensi runtime, jadi berkasnya hanya berisi penanda.

## 3. Di server (SSH)

```bash
cd ~/musik-deploy        # repo deploy = root aplikasi Node
git pull
```

Setup pertama kali:

- cPanel -> _Setup Node.js App_: Application root `musik-deploy`, Startup file `server/app.js`, pilih versi Node, tambahkan environment variable (lihat `.env.example`): `MUSIK_TOKEN` (acak, >= 32 byte; contoh `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), `YTDLP_PATH` (mis. `~/ytvenv/bin/yt-dlp`, path absolut), `FFMPEG_PATH` (mis. `~/bin/ffmpeg`), `DATA_DIR`. `PORT` diatur Passenger.
- Situs statis: arahkan `public_html/<jalur>` ke `~/musik-deploy/app` (symlink atau salin). PWA harus lewat HTTPS.

## 4. Restart

Pilih salah satu:

- cPanel -> _Setup Node.js App_ -> **Restart**.
- `touch ~/musik-deploy/tmp/restart.txt` lalu buka URL aplikasi sekali.

Cek: `GET <url>/api/health` mengembalikan `{"status":"ok","version":...}`. Endpoint lain tanpa token yang benar menolak (401/503).

## Rollback

`git checkout v<versi-lama>` di server, lalu restart.
