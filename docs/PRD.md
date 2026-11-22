# PRD — Musik Tools

Player, speed changer, transpose, minus one, dan YouTube→MP3 untuk latihan musik.

> **Source of truth** produk. Perubahan scope/keputusan dicatat di *Decision Log* (bagian 13).
> Status: **v1.0** · Diperbarui: 2026-11-22 · Owner: DF (PT Indomobil)

**Dokumen terkait:** [`FRONTEND.md`](./FRONTEND.md) (UI, arsitektur audio, PWA, extension) · [`CLAUDE_CODE_PROMPT.md`](./CLAUDE_CODE_PROMPT.md) (instruksi eksekusi di Claude Code)

---

## 1. Ringkasan

Tool musik pribadi untuk latihan. Lima kemampuan inti: **player**, **speed changer** (tempo tanpa ubah nada), **transpose** (nada tanpa ubah tempo), **minus one** (kurangi vokal), dan **YouTube→MP3** (simpan audio dari satu URL YouTube untuk diputar di player).

Berjalan di **Android** (PWA, target Samsung Galaxy A23) dan **Chrome desktop** (extension unpacked + PWA) dari satu inti kode web. Pemrosesan audio memakai **DSP klasik di perangkat** (Rubber Band WASM), tanpa AI/GPU. Konversi YouTube→MP3 dijalankan oleh **layanan Node kecil di server pribadi**.

## 2. Keputusan Terkunci

| Topik | Keputusan |
|---|---|
| Pengguna | Hanya pemilik (pribadi) |
| Sumber audio | File lokal, YouTube di tab (extension), dan MP3 hasil YouTube→MP3 |
| Platform | Android (PWA) + Chrome desktop (extension MV3 unpacked + PWA); **tanpa iOS** |
| Perangkat target | **Samsung Galaxy A23** (patokan performa) |
| Frontend | **Vite + TypeScript + Svelte**, mobile-first (lihat `FRONTEND.md`) |
| Mesin pitch | **Rubber Band WASM**, default engine **R2**; R3 opsional bila lolos uji di A23 |
| Minus one | DSP klasik saja; **tanpa AI/GPU** |
| Lisensi proyek | **GPL-3.0** |
| Server | cPanel shared hosting (CloudLinux), publik, HTTPS tersedia; Node via *Setup Node.js App*, dependensi lewat `vendor.zip` (pure JS) |
| Deploy | Build lokal → push ke repo **`musik-deploy`** → `git pull` **manual** di server → restart lewat cPanel |
| Repo | Dua repo git terpisah: **`musik`** (source) dan **`musik-deploy`** (hasil build) |
| YouTube→MP3 | **Satu URL per permintaan**; **MP3 saja** (default V2/192k); tanpa playlist/batch |
| Autentikasi | **Token acak panjang** di header Bearer + batas laju |
| Retensi file di server | **1 jam**, lalu dihapus otomatis |
| Extension | Unpacked, dipasang manual lewat `chrome://extensions` |

## 3. Tujuan & Non-Tujuan

**Tujuan**
1. Satu alat untuk semua kebutuhan latihan, nyaman dipakai satu tangan saat bermain alat musik.
2. Android + Chrome dari satu basis kode.
3. Kualitas pitch/tempo tinggi (Rubber Band) yang tetap mulus di A23.
4. Dari URL YouTube sampai lagu siap latihan di Android dalam beberapa langkah.

**Non-tujuan**
- Bukan DAW / editor multitrack.
- Bukan layanan publik atau multi-pengguna; hasil unduhan tidak dibagikan.
- Bukan iOS; bukan pemisahan stem AI; bukan transkripsi chord otomatis.
- Bukan unduhan playlist/batch.

## 4. Pengguna

Satu pengguna: pemilik. Tidak ada akun, multi-tenant, atau profil ganda. Keamanan server tetap penting karena endpoint berada di internet publik.

## 5. Arsitektur

### 5.1 Komponen

Inti web (TypeScript + Web Audio API + WASM) dengan dua pembungkus dan satu layanan server.

| Target | Bentuk | Sumber audio |
|---|---|---|
| Android | PWA (HTTPS, dipasang ke layar utama) | File lokal, MP3 hasil YouTube→MP3 |
| Chrome desktop | Extension MV3 unpacked + PWA | YouTube di tab (extension); file lokal & MP3 (PWA) |
| Server | Hosting statis + layanan Node (yt-dlp + ffmpeg) | — |

```
core/        engine audio: tempo, pitch (Rubber Band), minus-one, loop, EQ
ui/          komponen Svelte bersama
app-pwa/     PWA (Android & desktop)
ext-chrome/  extension MV3 (content script, popup, offscreen bila perlu)
server/      layanan Node: auth, validasi, antrian, yt-dlp+ffmpeg, retensi
docs/        PRD, FRONTEND, prompt Claude Code
scripts/     build & deploy
```

### 5.2 Alur utama

1. **Android:** tempel/bagikan URL YouTube ke PWA → server mengunduh dan mengonversi ke MP3 → klien menyimpan ke penyimpanan lokal → diputar dengan speed/transpose/minus one.
2. **Desktop (cepat):** extension mengontrol video YouTube di tab, tanpa unduh.
3. **Desktop (offline):** gunakan YouTube→MP3 untuk menyimpan lagu.

### 5.3 Batasan platform

- Chrome Android tidak mendukung extension; Android memakai PWA. Dengan alur URL→MP3, YouTube tetap bisa dipakai di Android.
- PWA butuh HTTPS (terpenuhi); pastikan sertifikat dipercaya HP.
- Extension unpacked: perlu Developer mode, ada peringatan saat Chrome dibuka, dan perubahan kode butuh tombol *Reload* manual.

### 5.4 Build & Deploy (dua repo git)

| Repo | Isi | Catatan |
|---|---|---|
| `musik` (source) | Seluruh kode sumber, `docs/`, `scripts/` | Dikerjakan di lokal |
| `musik-deploy` (deploy) | Hasil build: aset statis PWA, build layanan Node (`dist/`), `package.json` + lockfile produksi | Tanpa rahasia/`.env`; **tanpa** `vendor.zip` |

Alur: **build di lokal → commit/push hasil build ke `musik-deploy` → di server `git pull` manual → restart lewat cPanel** (Setup Node.js App → Restart, atau `touch <app-root>/tmp/restart.txt` lalu buka URL app sekali). Tidak ada webhook/otomasi. Rahasia (token, konfigurasi) hanya di environment variable app di server. Build diberi tag git untuk rollback. `vendor.zip` (dependensi pure JS) diunggah manual dan diekstrak sekali; unggah ulang hanya saat dependensi berubah. Versi Node saat build lokal harus sama dengan versi di Setup Node.js App.

### 5.5 Hasil verifikasi server (2026-11-21)

Server: cPanel shared hosting CloudLinux (LVE), Linux x86_64, tanpa root, ada terminal SSH.

| Komponen | Hasil |
|---|---|
| Node.js | Tidak ada di PATH; dikelola cPanel lewat Setup Node.js App (`~/nodevenv`) |
| ffmpeg | **Berhasil**: build statis 7.0.2 di `~/bin/ffmpeg` (diekstrak lewat Python karena `xz` tidak ada) |
| yt-dlp | Binary `yt-dlp_linux` **gagal** dimuat (batas LVE). **Berhasil** lewat venv Python 3.13: `/opt/alt/python313` → `~/ytvenv` (yt-dlp 2026.10.26) |
| Akses YouTube dari IP server | Tidak diblokir pada tes ini |
| Konversi 10 detik | **Berhasil**: 7 detik |
| Konversi lagu penuh (3,5 menit) | **Berhasil**: 22 detik (2 detik unduh, sisanya encode MP3 V0), 7 MB, tidak dimatikan. Default layanan diturunkan ke V2/192k |
| Belum diuji | Dua konversi bersamaan; perilaku di bawah proses Node dari cPanel |

Tindak lanjut:
- yt-dlp memperingatkan **tidak ada JavaScript runtime** (hanya `deno` aktif bawaan); ekstraksi tanpa runtime *deprecated* dan sebagian format bisa hilang. Beri `--js-runtimes node:<path>` ke Node di `~/nodevenv` atau pasang `deno` di `~/bin`. Uji di M2.
- Layanan Node memanggil `~/ytvenv/bin/yt-dlp` dan `~/bin/ffmpeg` dengan path absolut dari konfigurasi.
- Hasil ini hanya mencerminkan satu waktu; blokir YouTube dan batas LVE bisa berubah.

## 6. Fitur & Requirement

Prioritas: **P0** wajib MVP · **P1** setelah MVP · **P2** opsional. Detail UI di [`FRONTEND.md`](./FRONTEND.md).

### 6.1 Player (P0)
- Putar file lokal (MP3, WAV, M4A/AAC, OGG, FLAC) dan MP3 hasil unduhan.
- Play/pause, seek, volume, waktu, waveform sederhana.
- Library lokal dan antrian lagu lokal dasar (P1).
- Media Session API untuk kontrol layar kunci/notifikasi (P1; bila kurang, bungkus Capacitor/APK).

### 6.2 Speed Changer (P0)
- 0.25×–2.0×, langkah 0.05×, preset (0.5×, 0.75×, 1×, 1.25×).
- Nada tetap; bisa diubah saat memutar tanpa putus.
- Berlaku untuk file/MP3 dan YouTube di tab.

### 6.3 Transpose (P0)
- −12 s/d +12 semitone; fine-tune ±50 cent (P1). Tempo tetap.
- **Rubber Band WASM**, default engine R2 (target A23); R3 hanya bila uji di A23 lolos (CPU/baterai).
- Berlaku untuk file/MP3 dan YouTube di tab.

### 6.4 Minus One — DSP klasik (tanpa AI)

Tanpa AI, vokal tidak bisa dihilangkan sempurna. Teknik mengandalkan vokal di kanal tengah. Hasil bagus pada rekaman stereo klasik/akustik; buruk bila vokal di-double, banyak reverb stereo, atau lagu mono.

| Prioritas | Mode | Cara kerja | Catatan |
|---|---|---|---|
| P0 | Dasar | Pembatalan kanal tengah (L−R) | Bass/kick ikut hilang |
| P1 | Terjaga Bass | L−R hanya di atas frekuensi potong (~120–200 Hz) | Bass/kick tetap |
| P1 | Fokus Vokal | Mid/side + pelemahan pita ~300 Hz–3.4 kHz | Instrumen di pita sama ikut berkurang |
| P1 | Kontrol Manual | Slider kekuatan, frekuensi potong, lebar pita | Disetel per lagu |
| P2 | Preset per lagu | Simpan setelan terbaik | Terhubung ke 6.5 |

UI memberi label: *"Hasil bervariasi tergantung rekaman."*

### 6.5 Alat Latihan (P1)
Loop A-B dengan penanda bagian, equalizer 3–5 band, metronom/count-in, preset per lagu (tempo, kunci, loop, setelan minus one).

### 6.6 Extension Chrome (P0 subset)
- Popup/side panel: speed, transpose, minus one pada `<video>`/`<audio>` di tab aktif.
- Ingat pengaturan per situs (P1); pintasan keyboard (`[` `]` tempo, `Shift+↑/↓` kunci).
- Targetkan elemen media generik, bukan selector khusus YouTube.
- Tombol "Simpan sebagai MP3" di halaman YouTube yang memanggil layanan 6.7 (P1).

### 6.7 YouTube → MP3 (P1)

**Fungsi:** menerima **satu URL YouTube** per permintaan, menghasilkan MP3 beserta judul/metadata, lalu menyimpannya ke library lokal. Playlist/batch tidak didukung.

**Implementasi:**
- Layanan **Node.js** membungkus **yt-dlp + ffmpeg** (proses terpisah, argumen tetap). **Keluaran MP3 saja**, default V2/192k.
- Endpoint: `POST /api/jobs {url}` → `GET /api/jobs/{id}` (status) → `GET /api/files/{id}.mp3`. Unduhan file memakai tautan bertoken berumur singkat.
- Antrian sederhana: maksimal **1–2 konversi aktif**; sisanya menunggu atau ditolak dengan pesan jelas. Batas durasi per video (mis. ≤ 20 menit).
- **Retensi 1 jam:** file MP3 dan sisa file sementara dihapus otomatis 1 jam setelah selesai (diunduh atau belum). Pembersihan berjalan periodik dan saat layanan start.
- Klien menyimpan MP3 ke penyimpanan lokal (OPFS/IndexedDB) segera setelah selesai. Android: *Share Target* untuk membagikan URL dari aplikasi YouTube ke PWA.

**Keamanan (server publik, wajib ketat):**
- **Autentikasi:** token acak ≥ 32 byte di header `Authorization: Bearer <token>` lewat HTTPS; tidak ada endpoint anonim. Perbandingan memakai `crypto.timingSafeEqual`. Token hanya di environment variable server dan di perangkat pemilik (bukan di URL/repo). Ganti token dengan mengubah variabel lingkungan dan memperbarui PWA.
- **Validasi URL:** hanya `youtube.com`, `youtu.be`, `music.youtube.com`; tolak skema/host lain (cegah SSRF dan penyalahgunaan sebagai proxy). URL playlist tidak diperluas.
- **Batas laju** per IP dan per token, batas tugas aktif, batas durasi/ukuran. Token salah berulang dikenai penundaan/pemblokiran sementara per IP.
- CORS dibatasi ke origin PWA. Gunakan `spawn` dengan array argumen; jangan sisipkan input pengguna ke shell. Log tidak menyimpan token.

**Kepatuhan & risiko:**
- Mengunduh dari YouTube **melanggar Ketentuan Layanan YouTube** dan dapat melanggar hak cipta atas materi yang diunduh. Hanya untuk **penggunaan pribadi** oleh pemilik; tidak dibagikan atau dijadikan layanan untuk orang lain. Risiko ada pada pemilik.
- Penyedia hosting bisa melarang pengunduhan dari YouTube dan proses berat; periksa kebijakan penyedia.

**Keandalan:**
- YouTube sering berubah; **yt-dlp wajib diperbarui rutin** (endpoint kesehatan menampilkan versi). Unduhan bisa gagal sampai pembaruan keluar.
- IP hosting bisa terkena pemeriksaan bot/pemblokiran; **tidak ada jaminan berhasil**. Mitigasi: konkurensi rendah dan galat jelas di UI; cadangan: layanan dijalankan di PC rumah (IP residensial).
- Video terbatas umur/anggota/DRM tidak bisa diunduh.

## 7. Kebutuhan Non-Fungsional

| Area | Target |
|---|---|
| Latensi kontrol | Perubahan speed/pitch terdengar < 300 ms |
| Kualitas | Tanpa artefak mengganggu pada 0.5×–1.5× dan ±4 semitone |
| Performa (A23) | Putar + speed + transpose (R2) tanpa patah-patah; CPU rata-rata < 30%; dampak baterai wajar |
| Offline | Fitur P0 untuk file lokal/MP3 tersimpan jalan tanpa internet |
| Privasi | Audio diproses di perangkat; unduhan hanya lewat server pribadi |
| Ukuran | PWA awal < 10 MB (termasuk WASM Rubber Band) |
| Server | Hosting statis + layanan ringan; tanpa GPU |
| Konversi | Lagu 4 menit < 60 detik (terukur: 22 detik); maks 1–2 konversi bersamaan |
| Keamanan | Endpoint terautentikasi, URL tervalidasi, HTTPS |
| Aksesibilitas | Target sentuh ≥ 48 px; bisa dioperasikan keyboard di desktop |

## 8. Lisensi & Kepatuhan

- Proyek **GPL-3.0** karena Rubber Band; sumber kode tersedia. Karena pengguna hanya pemilik, kewajiban distribusi praktis tidak terpicu, tetapi lisensi dipertahankan agar bersih bila kelak dibagikan.
- Dependensi harus kompatibel GPL-3.0. yt-dlp (Unlicense) dan ffmpeg dipanggil sebagai proses terpisah.
- Ketentuan YouTube: lihat 6.7. Fitur unduh adalah risiko pribadi pemilik dan tidak dijadikan layanan untuk orang lain.

## 9. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Rubber Band berat di A23 | Patah-patah/baterai | Default R2; R3 opsional; uji di perangkat nyata di M0 |
| Pemutaran berhenti saat layar mati (Android) | UX buruk | Media Session API; uji di M0; cadangan Capacitor/APK |
| Minus one DSP terbatas | Kualitas kurang | Label jujur; mode Terjaga Bass; kontrol manual |
| YouTube memblokir/ubah sistem | Unduhan gagal | Update yt-dlp rutin; galat jelas; cadangan extension di tab atau layanan di PC rumah |
| Endpoint disalahgunakan | Beban/penyalahgunaan | Token, validasi domain, batas laju, CORS, non-root |
| Pelanggaran ToS/hak cipta | Risiko pribadi | Pakai pribadi saja; tidak didistribusikan |
| Batas LVE mematikan proses berat | Konversi gagal | Konkurensi 1–2; uji dari dalam proses Node; cadangan PC rumah |
| Rahasia bocor lewat repo deploy | Akses tak sah | Tanpa `.env`/token di repo |
| Kontrol media YouTube di extension gagal (CORS/CSP/MSE) | Extension tak berfungsi | Uji dini di M1; lihat risiko di `FRONTEND.md` |
| Extension unpacked merepotkan | Reload manual, peringatan | Terima sebagai trade-off; dokumentasikan langkah pasang |

## 10. Metrik Keberhasilan

- URL YouTube → lagu siap diputar dengan tempo/kunci di Android < 2 menit.
- Perubahan speed/pitch tanpa putus dan tanpa artefak jelas pada rentang wajar.
- Keberhasilan YouTube→MP3 ≥ 90% untuk video biasa (di luar pembatasan YouTube).
- Crash-free session ≥ 99%.

## 11. Roadmap

| Fase | Isi | Hasil |
|---|---|---|
| **M0 — Fondasi** | Dua repo + skrip build/deploy; `core/` dengan Rubber Band WASM (R2) + AudioWorklet; **uji performa & pemutaran layar mati di A23**; verifikasi PWA/HTTPS | Demo speed+pitch di A23 |
| **M1 — MVP** | Player, speed, transpose, minus one Dasar; PWA Android; extension unpacked (YouTube di tab) | Dipakai pribadi |
| **M2 — YouTube→MP3** | Layanan Node: auth token, validasi, antrian 1–2, retensi 1 jam, JS runtime yt-dlp; UI + Share Target; tombol di extension | Alur URL→latihan |
| **M3 — Latihan** | Loop A-B, EQ, metronom, preset, antrian lagu lokal | v1 |
| **M4 — Minus One lanjutan** | Terjaga Bass, Fokus Vokal, kontrol manual, preset per lagu | v1.1 |
| **M5 — Opsional** | Capacitor/APK, deteksi kunci, R3 bila A23 kuat | Sesuai kebutuhan |

Catatan: M2 berada sebelum M3 karena membuka alur utama di Android.

**Status implementasi (2026-11-22):** M0-M4 selesai di kode dan uji otomatis (rilis 0.1.0, lihat `CHANGELOG.md`). Terbukti di A23: M0, M1, konversi YouTube nyata lewat server di PC. Belum teruji: server di cPanel, M3 dan M4 di A23, ekstensi di YouTube asli. M5 belum dikerjakan.

## 12. Pertanyaan Terbuka

1. Uji beban sebelum M2 selesai: 2 konversi bersamaan, dari dalam proses Node cPanel (bukan hanya terminal).
2. JS runtime untuk yt-dlp: Node dari `~/nodevenv` (`--js-runtimes node:<path>`) atau `deno` di `~/bin`? Putuskan setelah uji di M2.
3. Varian A23 (RAM 4/6 GB, 4G/5G) dan versi Android, untuk patokan performa.
4. Antrian lagu lokal di player (P1) dipertahankan? (default: ya; ini fitur pemutar, bukan unduhan)

## 13. Decision Log

| Tanggal | Keputusan | Alasan |
|---|---|---|
| 2026-11-21 | Inti web bersama + PWA (Android) + extension MV3 (Chrome) | Chrome Android tanpa extension; satu basis kode |
| 2026-11-21 | Sumber audio: file lokal + YouTube | Permintaan pemilik |
| 2026-11-21 | Lisensi GPL-3.0 | Memungkinkan Rubber Band |
| 2026-11-21 | Tanpa iOS | Permintaan pemilik |
| 2026-11-21 | Tanpa AI/GPU; minus one DSP klasik | Tidak ada budget GPU |
| 2026-11-21 | Tambah YouTube→MP3 | Permintaan pemilik; penggunaan pribadi; risiko ToS dicatat di 6.7 |
| 2026-11-21 | Pengguna tunggal | Sederhanakan keamanan/skala |
| 2026-11-21 | Rubber Band langsung (tanpa SoundTouch) | Permintaan pemilik |
| 2026-11-21 | Extension unpacked manual | Tanpa Web Store |
| 2026-11-21 | Server publik cPanel; Node; build lokal → dua repo git | Pisahkan source dari artefak deploy; rahasia hanya di server |
| 2026-11-21 | Format unduhan MP3 saja | Sederhanakan |
| 2026-11-21 | Target HP Samsung A23; Rubber Band default R2 | Perangkat menengah-bawah |
| 2026-11-21 | Server: ffmpeg statis + yt-dlp via venv Python 3.13; Node via Setup Node.js App + `vendor.zip` | Terverifikasi lewat tes terminal; `yt-dlp_linux` gagal dimuat |
| 2026-11-21 | Unduhan playlist/batch **dibatalkan** | Permintaan pemilik; kurangi risiko blokir |
| 2026-11-21 | Autentikasi token Bearer acak panjang | Cukup untuk pengguna tunggal |
| 2026-11-21 | Deploy `git pull` manual + restart via cPanel | Permintaan pemilik |
| 2026-11-21 | Retensi MP3 di server 1 jam | Hemat ruang, kurangi jejak |
| 2026-11-21 | Frontend: Vite + TypeScript + Svelte; tempo via `playbackRate` + koreksi nada Rubber Band | Bundle kecil; hemat CPU/memori di A23; perlu dibuktikan di M0 |
| 2026-11-22 | M0: Rubber Band lewat `rubberband-wasm` 3.3.0 (R2+R3) dengan worklet sendiri; `rubberband-web` ditolak (tanpa R3/diagnostik) | Lihat `DECISIONS_M0.md`; lisensi wrapper perlu klarifikasi bila dibagikan |
| 2026-11-22 | Server dikompilasi CommonJS, repo deploy = root aplikasi Node (`server/app.js`) + `app/` statis | Aman untuk Passenger/cPanel; lihat `DEPLOY.md` |
| 2026-11-22 | M1: default jalur A + R2; library OPFS + IndexedDB; minus one Dasar `(L-R)/2`; ekstensi on-demand (`activeTab`) dengan mode terdegradasi bila worklet diblokir | Lihat `DECISIONS_M1.md`; peaks di-decode di main thread (decodeAudioData tidak ada di Worker) |
| 2026-11-22 | M2: URL dibangun ulang dari ID video; tautan unduh HMAC 5 menit; penguncian IP setelah 5 token salah; ekstensi membuka PWA (`?url=`) alih-alih memanggil server | Lihat `DECISIONS_M2.md`; mencegah SSRF dan menghindari token/izin host di ekstensi |
| 2026-11-22 | M3-A: layar Putar ringkas (ikon, transport prev/stop/play/next), antrean dasar, "Buka & putar" tanpa menyimpan | Lihat `DECISIONS_M3A.md`; PWA Android tidak bisa memindai folder, hanya pemilih berkas |
| 2026-11-22 | M3-B: loop A-B, EQ 5 pita, metronom + hitung masuk, preset per lagu otomatis (tempo, kunci, minus one, loop, EQ); lagu tanpa preset mulai dari bawaan | Lihat `DECISIONS_M3B.md`; menggantikan "tempo dan kunci dipertahankan antar lagu" dari M3-A |
| 2026-11-22 | M4: Minus One Dasar / Jaga bass / Fokus vokal dengan kontrol manual (kekuatan, batas bass, lebar pita vokal), tersimpan di preset per lagu | Lihat `DECISIONS_M4.md`; hanya DSP klasik, hasil bervariasi tergantung rekaman |

## 14. Glosarium

- **Time-stretch / Pitch-shift:** ubah tempo tanpa ubah nada / ubah nada tanpa ubah tempo.
- **Semitone:** satu langkah nada.
- **Minus one:** versi lagu tanpa vokal untuk dinyanyikan sendiri.
- **Pembatalan kanal tengah:** kurangi kiri dari kanan sehingga bagian identik di kedua kanal (biasanya vokal) hilang.
- **Mid/Side:** representasi stereo: tengah (L+R) dan sisi (L−R).
- **Rubber Band:** pustaka time-stretch/pitch-shift berkualitas tinggi (GPL/komersial). **R2/R3:** engine cepat / engine kualitas tinggi.
- **yt-dlp:** alat baris perintah untuk mengunduh media dari situs video.
- **PWA / MV3:** web app yang bisa dipasang / format extension Chrome saat ini.
- **Unpacked extension:** extension dimuat langsung dari folder lewat Developer mode.
- **LVE:** pembatas sumber daya per akun di CloudLinux (shared hosting).
- **OPFS:** Origin Private File System, penyimpanan file privat per origin di browser.
