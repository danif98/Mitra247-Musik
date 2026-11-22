# Keputusan teknis M2 (YouTube → MP3)

Status: M2 selesai di kode dan uji otomatis. **Belum diuji di server cPanel nyata dan belum diuji di HP/YouTube nyata**; lingkungan pengembangan tidak bisa menjangkau YouTube, sehingga semua uji otomatis memakai yt-dlp palsu. Daftar uji manual: `TEST_SERVER.md` dan bagian M2 di `TEST_A23.md`.

## 1. Server (`server/src`, CommonJS, tanpa dependensi)

| Berkas           | Isi                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `youtube-url.ts` | validasi URL; hanya ID video yang dipercaya, URL ke yt-dlp dibangun ulang `https://www.youtube.com/watch?v=<id>` |
| `jobs.ts`        | antrean 1-2 aktif, `spawn` dengan array argumen, klasifikasi galat, retensi, jam yang bisa disuntik              |
| `limits.ts`      | pembatas laju jendela-geser; penguncian IP setelah token salah                                                   |
| `signing.ts`     | tautan unduh HMAC-SHA256 berumur 5 menit                                                                         |
| `app.ts`         | routing, CORS, gerbang autentikasi, berkas                                                                       |

Endpoint: `GET /api/health` (publik), `POST /api/jobs {url}` → 202, `GET /api/jobs/<id>` (status + `downloadUrl` bertanda tangan saat selesai), `GET /api/files/<id>.mp3` (tautan bertanda tangan **atau** Bearer).

Keputusan dan alasan:

- **URL dibangun ulang dari ID video.** Mencegah SSRF dan penyalahgunaan sebagai proxy lebih kuat daripada daftar host saja: tidak ada host, path, query, atau kredensial buatan pengguna yang sampai ke yt-dlp. Playlist ditolak; URL video dalam playlist dipakai sebagai satu video (`--no-playlist`). Argumen `--` dipasang sebelum URL.
- **yt-dlp tidak mewarisi rahasia.** Lingkungan proses anak disaring (PATH, HOME, TMP, dll.); `MUSIK_TOKEN` tidak diteruskan. `--ignore-config` mencegah konfigurasi luar memengaruhi argumen.
- **Batas durasi lewat `--match-filters duration<=N`** (bukan pra-pemeriksaan terpisah): satu proses, tanpa permintaan tambahan ke YouTube. Bila tersaring yt-dlp keluar 0 tanpa berkas; server mengenali pesan "does not pass filter" sebagai `too_long`.
- **Informasi judul/durasi dari `--write-info-json`** (lebih stabil antar versi daripada `--print`).
- **Tautan unduh bertanda tangan** (`exp` + `sig`) berumur 5 menit agar berkas bisa diambil tanpa header Authorization (mis. tag `<audio>`); Bearer tetap diterima. Kunci HMAC diturunkan dari token, jadi ganti token membatalkan semua tautan.
- **Penguncian token salah**: 5 kegagalan / 10 menit per IP → blokir 15 menit (`429`, `Retry-After`). Tidak ada penundaan buatan; pemblokiran dianggap cukup. Batas laju: 120 permintaan/menit umum, 10 konversi/menit per IP, 20/menit per token.
- **IP klien**: entri **terakhir** `X-Forwarded-For` (ditambahkan proxy cPanel; entri kiri bisa dipalsukan klien). `TRUST_PROXY=false` untuk uji langsung.
- **CORS**: hanya origin di `ALLOWED_ORIGINS`; preflight dijawab sebelum autentikasi; origin lain tidak mendapat header CORS (preflight 403). Header CORS juga ada pada galat (agar PWA bisa membaca pesan).
- **Retensi 1 jam**: `sweep()` saat start dan tiap 5 menit; folder tanpa catatan di memori (sisa sebelum restart) dinilai dari umur folder.
- Job disimpan di memori (satu pengguna, satu proses). Restart menghapus status job.

## 2. Klien

- `core/api/client.ts`: `ApiClient` dengan `fetch` yang bisa disuntik, galat bertipe (`unauthorized`, `network`, `busy`, `invalid_url`, `locked_out`, `job_failed`, ...), polling `waitForJob`, `download` lewat tautan bertanda tangan, `extractYoutubeUrl` (teks yang dibagikan), `buildAppLink`.
- Layar **YouTube**: satu URL, tombol "Simpan sebagai MP3", langkah bertahap (mengantre → mengunduh → mengonversi → menyimpan → selesai), pesan galat dalam bahasa sederhana, hanya satu konversi aktif dari UI, hasil masuk Library (`source: 'youtube'`) dengan tombol "Putar sekarang".
- **Setelan**: URL server, token (kolom sandi, hanya tampil terselubung `abcd…wxyz`), Tes koneksi (health + cek token tanpa efek samping: ID job nol memberi 404 bila token benar, 401 bila salah).
- **Share Target** (`share_target` GET di manifest; berlaku setelah PWA dipasang di Android): tautan di `text`/`url`/`title` diekstrak, layar YouTube terisi, query dibersihkan dari bilah alamat. Teks tanpa tautan YouTube diabaikan.
- Token dan URL server hanya di `localStorage` perangkat.

## 3. Ekstensi (menyimpang dari FRONTEND 6)

Tombol **Simpan sebagai MP3** di popup (muncul pada tab YouTube) tidak memanggil server sendiri; ia membuka PWA dengan `?url=<url video>` dan pengguna menekan Simpan di sana. Alasan: MP3 harus masuk Library PWA (OPFS beda origin dengan ekstensi), dan cara ini menghindari penyimpanan token di ekstensi serta izin host ke server (`host_permissions`). Menambah izin `storage` hanya untuk mengingat URL aplikasi. Uji otomatis popup baru hanya mencakup kompilasi dan e2e ekstensi lama (11/11); **tombol ini belum diuji di YouTube asli** (ditunda atas keputusan pengguna).

## 4. Lain-lain

- `scripts/build.mjs` menulis `out/server/package.json` `{ "type": "commonjs" }`: ditemukan saat uji bahwa `package.json` akar (`"type": "module"`) membuat `out/server/app.js` dimuat sebagai ESM dan gagal. Di repo deploy sudah aman (package.json deploy tanpa `type`), kini juga aman secara lokal.
- `.env.example` dan `DEPLOY.md` diperbarui (variabel baru, runtime JS, perilaku layanan).

## 5. Bukti uji otomatis

- Server: 89 tes (validasi URL termasuk kasus SSRF/playlist/injeksi, pembatas laju dan penguncian dengan jam tiruan, tautan bertanda tangan, siklus job lewat HTTP, antrean/`busy`, dua konversi bersamaan, timeout, retensi dengan jam tiruan, pembersihan saat start, CORS, argumen yt-dlp tepat, lingkungan anak tanpa token, log tanpa token).
- Klien: 20 tes `ApiClient` dan fungsi bantu.
- E2E (`node e2e/m2.mjs`, 27 cek): server terbangun asli + yt-dlp palsu, PWA di origin berbeda: pesan tanpa konfigurasi, tes koneksi (URL salah, token salah, token benar + versi), token tidak tampil penuh, konversi sukses masuk Library dengan durasi dan waveform lalu diputar, enam kasus galat, Share Target, pengaturan bertahan setelah muat ulang, galat saat offline, tanpa galat konsol.

## 6. Belum teruji

- yt-dlp dan ffmpeg **nyata** di server cPanel (konversi lagu penuh, runtime JS, dua konversi bersamaan di bawah proses Node cPanel, batas LVE): `TEST_SERVER.md`.
- Alur lengkap di HP (Share Target dari aplikasi YouTube, install PWA, HTTPS ke server): bagian M2 di `TEST_A23.md`.
- Header `X-Forwarded-For` dari proxy cPanel sebenarnya (apakah entri terakhir memang IP klien).
- Popup ekstensi pada YouTube asli.
