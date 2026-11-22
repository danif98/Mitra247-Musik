# Super Prompt — Claude Code (Musik Tools)

Cara pakai: buka Claude Code di folder proyek `D:\xampp\htdocs\musik`, lalu tempel **seluruh isi blok di bawah** sebagai pesan pertama. Prompt ini mengerjakan **M0** saja. Setelah M0 disetujui, pakai prompt lanjutan di bagian akhir berkas ini.

## Status dan pelajaran (diperbarui 2026-11-22)

| Fase | Status | Catatan |
|---|---|---|
| M0 | Selesai | `DECISIONS_M0.md`; uji A23 jalan (0 underrun, layar mati 53 dtk lanjut, R2 ~46% beban worklet saat menggeser nada, ~1% saat bypass) |
| M1 | Selesai di kode dan uji otomatis | `DECISIONS_M1.md`; **belum diuji di A23 dan di YouTube asli** |
| M2 | Selesai di kode dan uji otomatis | `DECISIONS_M2.md`, `TEST_SERVER.md`; **belum diuji di server cPanel nyata dan HP** |
| M3-A | Selesai di kode dan uji otomatis | `DECISIONS_M3A.md`: layar Putar ringkas, antrean prev/next, Buka & putar; **belum diuji di A23** |
| M3-B | Selesai di kode dan uji otomatis | `DECISIONS_M3B.md`: loop A-B, EQ, metronom/count-in, preset per lagu; **belum diuji di A23** |
| M4 | Selesai di kode dan uji otomatis | `DECISIONS_M4.md`: Minus One Dasar/Jaga bass/Fokus vokal + kontrol manual; **belum didengar di A23** |
| M5 | Belum (opsional: APK Capacitor, deteksi kunci, R3) | | gunakan prompt di bawah, sudah disesuaikan |

**Tambahkan blok ini ke awal setiap prompt lanjutan** (pelajaran M0-M1 yang tidak ada di prompt asli):

````text
KONTEKS TETAP (dari M0-M1)
- Baca docs/DECISIONS_M0.md dan DECISIONS_M1.md dulu. Default audio: jalur A + R2 (R3 hanya pilihan di Setelan).
- Perintah: npm run lint | typecheck | test | build | test:e2e (lab + app) ; node e2e/ext.mjs (ekstensi) ; npm run build:ext.
- Uji di HP: audio butuh secure context. Pakai HTTPS atau Chrome flag unsafely-treat-insecure-origin-as-secure untuk http://IP:4173 (npm run preview -w app-pwa), atau adb reverse bila adb ada. Halaman lab dan Setelan menampilkan "Build: <commit> <waktu>"; minta pengguna memeriksanya dan menghapus data situs bila build lama masih termuat (service worker).
- Playwright: aplikasi diuji dengan Chrome sistem; ekstensi harus Chromium dari cache Playwright (Chrome bermerk menonaktifkan --load-extension; path bisa diatur dengan CHROMIUM_EXE). Lingkungan pengembangan tidak punya akses internet ke YouTube: pakai stub/halaman lokal dan nyatakan jelas bagian yang hanya bisa diuji manual.
- Ukur sebelum mengoptimalkan; tulis angka sebelum/sesudah. Analisis log A23 dengan skrip, jangan membaca JSON mentah.
- Skrip deploy/vendor jangan dijalankan ke folder di luar proyek saat verifikasi: set MUSIK_DEPLOY_DIR ke folder di dalam proyek lalu hapus.
- Commit kecil Conventional Commits dengan baris Co-Authored-By; jangan push.
````

---

````text
PERAN
Kamu adalah engineer senior full-stack (TypeScript, Web Audio/WASM, Node.js) yang membangun "Musik Tools" untuk satu pengguna (pemilik). Kerjakan dengan teliti, bertahap, dan jujur melaporkan apa yang terbukti jalan dan apa yang belum teruji.

LANGKAH PERTAMA (WAJIB, SEBELUM MENULIS KODE)
1. Baca seluruh isi folder docs/: PRD.md (source of truth), FRONTEND.md, CLAUDE_CODE_PROMPT.md. Jika ada konflik antara prompt ini dan PRD.md, PRD.md menang; laporkan konfliknya.
2. Periksa kondisi folder (git status, isi folder, versi node/npm/git di mesin ini).
3. Buat rencana kerja singkat M0 (daftar langkah + risiko), tampilkan, lalu langsung kerjakan kecuali ada keputusan yang benar-benar menghalangi. Jangan berhenti untuk pertanyaan yang bisa dijawab dengan default yang wajar; catat asumsi di docs/ASSUMPTIONS.md.

KONTEKS PRODUK (ringkas; detail ada di docs/)
- Tool musik pribadi: player, speed changer, transpose, minus one (DSP klasik, tanpa AI), YouTube→MP3.
- Platform: Android (PWA, target Samsung Galaxy A23) dan Chrome desktop (extension MV3 unpacked + PWA). Tanpa iOS.
- Satu inti web: Vite + TypeScript (strict) + Svelte. Audio: Web Audio API + AudioWorklet + Rubber Band WASM (default engine R2).
- Server: cPanel shared hosting CloudLinux, publik, HTTPS ada. Node lewat "Setup Node.js App", dependensi diunggah sebagai vendor.zip. Deploy: build lokal -> push ke repo `musik-deploy` -> `git pull` manual di server -> restart.
- Lisensi proyek: GPL-3.0.

ATURAN TIDAK BOLEH DILANGGAR
1. Rahasia (token, kredensial, .env) tidak boleh ada di repo mana pun. Konfigurasi server lewat environment variable. Sediakan `.env.example` tanpa nilai nyata.
2. Server: HANYA dependensi pure JS (tanpa modul native: tidak sharp, bcrypt, dsb.). Lebih disukai modul bawaan Node (http, child_process, crypto, fs).
3. Jangan menjalankan yt-dlp lewat shell string; selalu `spawn` dengan array argumen. Jangan sisipkan input pengguna ke argumen tanpa validasi.
4. Tidak ada AI/ML, tidak ada GPU, tidak ada fitur playlist/batch pada unduhan, tidak ada format selain MP3.
5. Jangan menambah fitur di luar PRD. Jika menurutmu ada yang kurang, tulis di docs/PROPOSALS.md, jangan langsung dibangun.
6. Semua skrip build/deploy harus lintas-platform (Node script, bukan bash), karena mesin pengembangan berjalan di Windows (D:\xampp\htdocs\musik). Gunakan path.join, hindari asumsi shell.
7. Jangan klaim sesuatu "berfungsi" bila belum dijalankan. Bedakan tegas: "sudah diuji (bukti: ...)" vs "belum diuji".
8. Jangan melakukan operasi destruktif di luar folder proyek. Jangan push ke remote mana pun kecuali diminta; siapkan perintahnya saja.
9. Kode dan komentar dalam bahasa Inggris; teks antarmuka dalam bahasa Indonesia, dipusatkan di ui/i18n/id.ts.

SASARAN M0 (FONDASI)
Bukti bahwa pipeline audio inti (tempo + nada via Rubber Band WASM) berjalan mulus di browser, siap diuji di Samsung A23, plus kerangka repo dan skrip build/deploy.

TUGAS M0

A. Struktur repo `musik` (monorepo ringan, npm workspaces)
- Susun sesuai PRD 5.1 / FRONTEND 2: core/, ui/, app-pwa/, ext-chrome/ (kerangka kosong tapi valid), server/ (kerangka), docs/, scripts/.
- Tooling: TypeScript strict, ESLint + Prettier, Vitest. Lisensi GPL-3.0 (LICENSE + header di package.json). .gitignore yang benar (node_modules, dist, .env, vendor.zip).
- `git init`, commit awal berisi docs/ dan kerangka. Buat commit kecil dan bermakna per langkah (Conventional Commits).

B. Prototipe audio inti (core/)
1. Muat Rubber Band WASM. Bandingkan dua opsi singkat (paket npm berbasis AudioWorklet seperti `rubberband-web` vs build sendiri dengan Emscripten): periksa lisensi, ukuran, kemudahan; pilih satu dan catat keputusan + alasan di docs/DECISIONS_M0.md. Jika opsi build sendiri terlalu berat, pakai paket npm dan jelaskan batasnya.
2. Implementasi pipeline (FRONTEND 4.1/4.2): <audio> -> MediaElementAudioSourceNode -> AudioWorkletNode(Rubber Band, pergeseran nada) -> GainNode -> destination.
   - Tempo: `audio.playbackRate = tempo; audio.preservesPitch = false`.
   - Rasio nada ke Rubber Band = 2^(semitone/12) / tempo.
   - Rentang: tempo 0.25–2.0, semitone −12..+12. Perubahan parameter harus dihaluskan (ramp) agar tidak berderak.
   - Engine default R2; sediakan sakelar R3 (opsional) yang bisa dipilih lewat parameter.
3. Sebagai pembanding, implementasikan juga jalur B: `preservesPitch = true` + transpose biasa. Halaman lab harus bisa berpindah antara jalur A dan B untuk A/B-testing pendengaran.
4. Unit test (Vitest) untuk fungsi murni: rasio nada, pembatas rentang, konversi semitone/cent.

C. Halaman lab (app-pwa/lab) untuk uji di A23
- Satu halaman sederhana, mobile-first: pilih berkas audio lokal, play/pause, seek, slider/stepper tempo & semitone, pilih jalur A/B dan engine R2/R3.
- Panel diagnostik: baseLatency, outputLatency, sampleRate, state AudioContext, jumlah underrun/glitch worklet (hitung bila memungkinkan), estimasi beban CPU (mis. waktu proses per blok di worklet), dan log perubahan state saat layar dimatikan/halaman disembunyikan (visibilitychange).
- Tombol "unduh log diagnostik" (JSON) agar hasil uji di HP bisa dikirim balik.
- Tidak perlu gaya rumit; yang penting fungsional dan terbaca di layar 6,6".

D. PWA minimum
- vite-plugin-pwa: manifest, ikon placeholder (maskable), service worker precache termasuk WASM. Pastikan bisa di-install dan jalan offline di Chromium (uji dengan Playwright atau Lighthouse/CLI bila tersedia).
- Media Session API dasar (judul, play/pause) di halaman lab.

E. Skrip build & deploy (scripts/, Node, lintas-platform)
- `scripts/build.mjs`: build PWA (dan kerangka server) ke folder keluaran.
- `scripts/deploy-prepare.mjs`: salin hasil build ke folder repo `musik-deploy` (path dari variabel lingkungan MUSIK_DEPLOY_DIR; default: ../musik-deploy), tulis `package.json` + lockfile produksi untuk server, TANPA vendor.zip dan TANPA rahasia, buat file VERSION, dan cetak langkah commit/tag/push yang harus dijalankan manual.
- `scripts/vendor-zip.mjs`: buat vendor.zip berisi node_modules produksi layanan server (pure JS) di luar repo deploy; cetak ukuran dan versi Node yang dipakai.
- `scripts/check-pure-js.mjs`: gagal bila ada dependensi server yang punya binding native (cari `binding.gyp`, `.node`, `prebuilds`).
- Siapkan README singkat deploy di docs/DEPLOY.md: urutan build -> repo deploy -> git pull manual -> restart (cPanel Setup Node.js App -> Restart, atau `touch <app-root>/tmp/restart.txt` lalu buka URL sekali).
- Kerangka server (server/): satu endpoint `GET /api/health` yang mengembalikan versi build dan (opsional) versi yt-dlp bila path-nya dikonfigurasi. Belum ada logika unduhan (itu M2). Baca konfigurasi dari env: PORT, MUSIK_TOKEN, YTDLP_PATH, FFMPEG_PATH, DATA_DIR. Mulai tanpa MUSIK_TOKEN harus GAGAL dengan pesan jelas untuk endpoint selain health.

F. Dokumentasi hasil
- docs/DECISIONS_M0.md: keputusan teknis (pilihan Rubber Band, jalur A vs B, struktur), asumsi, dan hal yang belum pasti.
- docs/TEST_A23.md: checklist uji manual di A23 yang bisa kuikuti langkah demi langkah (cara membuka halaman lab di HP lewat HTTPS, cara memutar, apa yang diamati, cara mengunduh log). Sertakan tabel pengisian hasil (CPU/glitch/baterai/layar mati/kualitas di 0.5×, 0.75×, 1.25×, ±2/±4 semitone).
- Perbarui docs/PRD.md hanya bila ada keputusan baru; tambahkan baris di Decision Log. Jangan menulis ulang bagian lain.

KRITERIA SELESAI M0 (tunjukkan buktinya satu per satu)
1. `npm run lint`, `npm run typecheck`, `npm test` lulus; tunjukkan output ringkas.
2. `npm run build` menghasilkan PWA; tunjukkan ukuran total dan ukuran WASM (target PWA < 10 MB).
3. Halaman lab berjalan di Chromium (Playwright): memuat berkas audio uji, play, mengubah tempo & semitone tanpa error konsol; tunjukkan hasil tes atau screenshot.
4. Tes numerik: untuk sinyal sinus sintetis 440 Hz, setelah pergeseran +12 semitone, frekuensi dominan ≈ 880 Hz (toleransi kecil) pada jalur A dan B. Jalankan di Node/Playwright dan tunjukkan angkanya. Jika pengujian di headless tidak memungkinkan, jelaskan dan sediakan tes manual.
5. `scripts/deploy-prepare.mjs` berjalan dan menghasilkan folder deploy yang benar tanpa rahasia dan tanpa vendor.zip; `scripts/check-pure-js.mjs` lulus.
6. Server kerangka berjalan lokal (`node server/...`) dan `/api/health` merespons; endpoint lain menolak tanpa token yang benar.
7. docs/TEST_A23.md lengkap dan jelas.

CARA KERJA
- Kerjakan berurutan A -> F. Setelah tiap langkah besar: jalankan pengecekan, commit, lalu lanjut.
- Jika sebuah pendekatan gagal, catat penyebabnya, coba alternatif yang masuk akal (maks. dua), lalu laporkan; jangan berputar tanpa batas.
- Jangan mengubah file di luar D:\xampp\htdocs\musik. Jangan memasang paket global tanpa memberi tahu.
- Prioritaskan keterbacaan dan kesederhanaan; hindari abstraksi berlebihan.

FORMAT LAPORAN AKHIR (singkat, tanpa bertele-tele)
1. Ringkasan: apa yang selesai.
2. Bukti per kriteria selesai (1–7): lulus / gagal / belum teruji + bukti.
3. Keputusan teknis penting dan alasannya.
4. Masalah & risiko yang ditemukan (terutama yang memengaruhi A23).
5. Langkah manual yang harus kulakukan (uji di A23, push repo deploy, dll.), berupa daftar bernomor yang bisa langsung diikuti.
6. Usulan berikutnya (tanpa mengerjakannya).
Berhenti setelah laporan; jangan mulai M1.
````

---

## Prompt lanjutan

Pakai setelah fase sebelumnya disetujui. Tempel di sesi Claude Code yang sama (atau sesi baru; di sesi baru, minta ia membaca `docs/` dan `docs/DECISIONS_M0.md` dulu).

### M1 — MVP (SELESAI; prompt di bawah untuk arsip, jangan dijalankan ulang)

````text
Lanjutkan ke M1 sesuai docs/PRD.md (6.1–6.4 P0, 6.6 subset) dan docs/FRONTEND.md. Baca ulang docs/ dan hasil uji A23 yang kulampirkan di bawah; sesuaikan keputusan audio (jalur A/B, R2/R3) berdasarkan data itu dan catat di docs/DECISIONS_M1.md.

Bangun: Layar Putar, Library (tambah berkas lokal, OPFS+IndexedDB, peak waveform di Worker), speed, transpose, Minus One mode Dasar, Media Session, PWA Android; extension MV3 unpacked yang mengontrol <video>/<audio> aktif di tab (tempo, kunci, minus one) dengan popup memakai komponen Svelte yang sama.

Bukti wajib: uji unit + e2e lulus; uji numerik DSP minus one pada sinyal sintetis (vokal sintetis di tengah berkurang signifikan); extension diuji di Chrome desktop pada halaman YouTube (jelaskan cara uji dan hasil; bila CORS/CSP/MSE menghalangi, laporkan dan jalankan jalur cadangan di FRONTEND 6.1). Perbarui docs/TEST_A23.md untuk M1. Aturan dan format laporan sama seperti M0. Berhenti setelah laporan.

[tempel hasil uji A23 / log diagnostik di sini]
````

### M2 — YouTube→MP3 (SELESAI; prompt di bawah untuk arsip, jangan dijalankan ulang)

````text
Lanjutkan ke M2 sesuai docs/PRD.md 6.7 dan 5.5. Baca ulang docs/.

Yang sudah ada dan harus dipakai ulang (jangan dibuat ulang): server/src (CommonJS, ditulis ke out/server, startup file server/app.js di repo deploy) dengan config.ts (env), auth.ts (safeEqual, hasValidBearer), app.ts (gerbang: health publik, lainnya 503 tanpa token / 401 salah token / 501 placeholder yang diganti di M2), ytdlp.ts (spawn array argumen), server.test.ts; scripts/build.mjs, deploy-prepare.mjs, vendor-zip.mjs, check-pure-js.mjs; LibraryStore.add(file, 'youtube'); layar Setelan (tambahkan URL server + token + tes koneksi di sana, token disimpan di localStorage); service worker sudah mengabaikan query string (siap untuk Share Target, tinggal menambah share_target di manifest vite.config.ts). Ekstensi: ID stabil, izin hanya activeTab + scripting; tombol "Simpan sebagai MP3" butuh izin akses ke URL server (gunakan optional_host_permissions + chrome.permissions.request dari klik pengguna, jangan host_permissions luas). CORS server dibatasi ke origin PWA dan ke chrome-extension://<id ekstensi>.

Server (Node, pure JS): POST /api/jobs {url}, GET /api/jobs/{id}, GET /api/files/{id}.mp3 (tautan bertoken berumur singkat), GET /api/health. Autentikasi Bearer dengan crypto.timingSafeEqual; penundaan/pemblokiran sementara per IP untuk token salah; batas laju per IP/token; validasi URL ketat (hanya youtube.com, youtu.be, music.youtube.com; tolak playlist/skema/host lain); maksimal 1–2 konversi aktif dengan antrian; batas durasi 20 menit; retensi 1 jam (pembersihan periodik dan saat start); CORS dibatasi ke origin PWA; spawn dengan array argumen: yt-dlp -f ba -x --audio-format mp3 --audio-quality 2 --ffmpeg-location <FFMPEG_PATH> dan --js-runtimes sesuai konfigurasi; path yt-dlp/ffmpeg dari env (server nyata: ~/ytvenv/bin/yt-dlp dan ~/bin/ffmpeg). Log tidak boleh memuat token. Sediakan simulasi yt-dlp (stub, skrip Node yang mencetak berkas MP3 kecil) agar tes otomatis tidak memanggil YouTube; di lingkungan pengembangan YouTube memang tidak bisa dijangkau.

Klien: Layar YouTube (satu URL, Share Target, status bertahap, galat jelas), simpan MP3 ke library setelah selesai, Layar Setelan (URL server, token, tes koneksi), tombol "Simpan sebagai MP3" di extension untuk tab YouTube.

Bukti wajib: tes unit/integrasi server (auth, validasi URL termasuk kasus SSRF dan playlist, batas laju, antrian, retensi dengan jam tiruan); build server lolos check-pure-js; docs/DEPLOY.md diperbarui dengan langkah env var, vendor.zip, restart; daftar uji manual di server nyata (termasuk 2 konversi bersamaan dan JS runtime yt-dlp) yang bisa kuikuti. Jangan menjalankan unduhan massal. Aturan dan format laporan sama seperti M0. Berhenti setelah laporan.
````

### M3 / M4

````text
Catatan teknis: graph audio saat ini = <audio> -> worklet Rubber Band -> MinusOne (core/audio/minus-one.ts, kelas dengan input/output GainNode) -> GainNode volume; sisipkan EQ (BiquadFilterNode) di antara MinusOne dan volume. Preset per lagu masuk IndexedDB (naikkan DB_VERSION di core/library/store.ts, siapkan migrasi). Loop A-B memakai waveform di ui/components/Waveform.svelte (tambah penanda). Tambahkan uji e2e di e2e/app.mjs dan, bila menyentuh ekstensi, e2e/ext.mjs.

Lanjutkan ke M3 (Alat Latihan: loop A-B, EQ, metronom/count-in, preset per lagu, antrian lagu lokal) / M4 (Minus One lanjutan: Terjaga Bass, Fokus Vokal, kontrol manual, preset per lagu) sesuai docs/PRD.md dan docs/FRONTEND.md. Baca ulang docs/ dan catatan keputusan fase sebelumnya. Sertakan uji unit untuk logika murni dan uji numerik untuk DSP, perbarui docs/TEST_A23.md, dan ikuti aturan serta format laporan yang sama. Berhenti setelah laporan.
````
