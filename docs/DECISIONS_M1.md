# Keputusan teknis M1

Status: M1 selesai di sisi kode dan uji otomatis. **Belum diuji di A23 (M1) dan belum diuji di YouTube asli.** Lihat bagian "Belum teruji".

## 1. Default audio

Jalur **A** (`playbackRate` + koreksi nada) dan engine **R2** (`EngineFaster | PitchHighSpeed`), sesuai data uji A23 M0: 0 underrun, beban 1,3% pada tempo 1×/kunci 0 (bypass), sekitar 46% saat memproses nada. Jalur B dan R3 tetap ada di `MusikAudioEngine` (R3 bisa dipilih di Setelan, dengan catatan beban lebih berat). Perbandingan A vs B dengan telinga belum ada; keputusan ini sementara.

## 2. Penyimpanan dan library

- Berkas audio di **OPFS** (`songs/<uuid>`), metadata + peaks di **IndexedDB** (`musik` / `songs`). Tanpa cadangan bila OPFS tidak ada (Chrome Android dan desktop modern mendukung); layar Library menampilkan pesan.
- `navigator.storage.persist()` diminta saat start; Setelan menampilkan pemakaian dan status perlindungan.
- Library mendukung `source: 'local' | 'youtube'` agar M2 tinggal memanggil `store.add(file, 'youtube')`.
- Penyimpanan diuji di Chromium lewat Playwright (tambah, muat ulang, cari, ganti nama, hapus, hapus semua, offline).

## 3. Waveform / peaks (menyimpang dari FRONTEND 4.5)

FRONTEND meminta decode di Worker. `decodeAudioData` tidak tersedia di Worker, jadi:

- decode di main thread lewat `OfflineAudioContext` pada 8 kHz (memori ~6× lebih kecil; lagu 4 menit ≈ 15 MB sementara),
- reduksi ke 600 bucket dilakukan di Worker (buffer ditransfer, tanpa salinan),
- berkas > 80 MB tidak di-decode (tanpa waveform; durasi dari metadata) untuk menjaga memori di A23.
  Decode hanya sekali saat lagu ditambahkan; hasil disimpan.

## 4. Minus One (mode Dasar)

`(L − R) / 2` ke kedua kanal, graph Web Audio standar (`ChannelSplitter` + invert + `ChannelMerger`), crossfade 15 ms antara jalur kering dan basah. Rekaman mono menjadi senyap (dicatat di UI). Label "Hasil bervariasi tergantung rekaman." tampil di bawah toggle. Mode lain (Terjaga Bass, Fokus Vokal, kontrol manual) tetap di M4.

Bukti numerik (sinyal sintetis: vokal 440 Hz di tengah, gitar 330 Hz kiri, keys 550 Hz kanan):

- unit (fungsi murni): vokal turun > 60 dB, instrumen tetap;
- lewat pipeline PWA nyata di Chromium: vokal turun 128 dB, 330/550 Hz berubah 0,0 dB;
- lewat ekstensi pada `<audio>` halaman: vokal turun 103 dB, instrumen tetap.
  Pada rekaman nyata hasilnya akan jauh lebih kecil dari angka sintetis (vokal tidak murni di tengah, ada reverb stereo); itu keterbatasan teknik, bukan bug.

## 5. Aplikasi PWA

- Tab bawah: **Putar · Library · Setelan**. Tab YouTube sengaja belum ada (M2).
- Layar Putar: judul, waveform (seek dengan ketuk/geser/panah), transport (±5 detik, putar/jeda), tempo 0,25–2,0× (langkah 0,05, chip 0,5/0,75/1/1,25), kunci ±12, minus one, volume, tekan lama pada nilai untuk reset. Tidak ada loop A-B (M3).
- Media Session: judul, play/pause, seek ±5, seekto, posisi.
- Service worker: `ignoreURLParametersMatching: [/.*/]` agar halaman ber-query (mis. Share Target di M2, `?test`) tetap cocok dengan precache offline.
- Halaman lab tetap ada di `/lab/` (tautan di Setelan).

## 6. Ekstensi Chrome (MV3)

- Izin hanya `activeTab` + `scripting`. Tidak ada content script otomatis; popup menyuntikkan `content.js` ke tab aktif saat dibuka (frame utama saja).
- Elemen media dipilih generik: yang sedang diputar, lalu yang terbesar/berumur terpanjang. Satu elemen hanya dibungkus sekali (`createMediaElementSource`); inisialisasi bersamaan digabung (ada bug balapan yang ditemukan dan diperbaiki lewat tes).
- `worklet.js` + `rubberband.wasm` sebagai `web_accessible_resources`.
- **Mode terdegradasi** (`allowNoWorklet`) bila halaman memblokir worklet atau WASM: tempo memakai `preservesPitch=true` (nada dijaga), minus one tetap jalan, stepper kunci disembunyikan dan popup menjelaskan. Jalur offscreen + `tabCapture` (FRONTEND 6.1) **tidak dibangun**; baru perlu bila uji YouTube nyata menunjukkan worklet diblokir.
- Pintasan di halaman terkontrol: `[` `]` tempo, `Shift+↑/↓` kunci.
- ID ekstensi stabil lewat `key` di manifest (`oplajmbpldocoebnjhjliogihkbjncbn`); kunci privat tidak disimpan (tidak diperlukan untuk unpacked).
- Build uji (`--test`) menambah `host_permissions` untuk `127.0.0.1` dan hook `test-capture`; build normal tidak memilikinya.

Bukti (Chromium 153 + ekstensi dimuat, `node e2e/ext.mjs`): halaman tanpa media diberi pesan jelas; `<audio>` dikenali; tempo 0,90× diterapkan (`preservesPitch=false`); worklet termuat di content script; minus one dan +12 semitone (440 → 880 Hz) terukur numerik lewat pipeline ekstensi; pintasan keyboard bekerja; halaman dengan CSP ketat `script-src 'self'` tetap memuat worklet (sumber ekstensi tidak diblokir CSP halaman). Chrome bermerk (157) tidak bisa dipakai untuk uji ini karena `--load-extension` dinonaktifkan; dipakai Chromium dari cache Playwright.

## 7. Belum teruji (jujur)

- **YouTube asli di Chrome desktop**: lingkungan pengembangan tidak punya akses ke YouTube. Risiko tersisa: kebijakan keamanan YouTube (Trusted Types), banyak elemen `<video>` (iklan/pratinjau), pemutar yang mengganti elemen. Langkah uji manual ada di `TEST_A23.md` bagian "Ekstensi di YouTube".
- **Aplikasi M1 di A23** (library, OPFS pada berkas besar, waveform, Media Session di layar kunci, install PWA).
- Kualitas pendengaran A vs B, R2 pada rasio besar (bias bertambah dengan `PitchHighSpeed`), klik saat bypass.
- Ekstensi pada iframe, Shadow DOM, dan banyak elemen media bersamaan.
- Ingat pengaturan per situs (P1) tidak dibuat.

## 8. Perubahan lain

- `MusikAudioEngine`: `allowNoWorklet`, `pitchAvailable`, `workletError`, `setMinusOne`.
- Ikon 128 px ditambahkan (`gen-icons`), `npm run build:ext`, `npm run test:e2e` kini menjalankan lab + aplikasi (ekstensi: `node e2e/ext.mjs`, terpisah karena butuh Chromium penuh).
