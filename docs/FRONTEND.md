# FRONTEND — Musik Tools

Dokumen turunan dari [`PRD.md`](./PRD.md). Mencakup stack, UI/UX, arsitektur audio, PWA, extension, penyimpanan, pengujian, dan risiko frontend.
Status: **v1.0** · Diperbarui: 2026-11-21

---

## 1. Stack

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Bahasa | TypeScript (strict) | Keamanan tipe untuk kode audio dan state |
| UI | **Svelte** (+ Vite) | Bundle kecil, cepat di Samsung A23, reaktif tanpa runtime berat |
| Build | **Vite** | Dev cepat; entry terpisah untuk PWA dan extension |
| PWA | `vite-plugin-pwa` (Workbox) | Service worker, manifest, cache offline, Share Target |
| Audio | Web Audio API + `AudioWorklet` + **Rubber Band WASM** | Kualitas pitch tinggi; berjalan di thread audio |
| Penyimpanan | **OPFS** untuk berkas MP3; **IndexedDB** untuk metadata, preset, peak waveform | Berkas besar di OPFS, data kecil terstruktur di IndexedDB |
| Gaya | CSS biasa + variabel CSS (tanpa framework UI berat) | Ukuran kecil, kontrol penuh |
| Uji | Vitest (unit), Playwright (e2e web), checklist manual di A23 | Perilaku audio di perangkat nyata harus diuji manual |

Bahasa antarmuka: **Indonesia** (string dipusatkan di satu berkas agar mudah diganti). Kode, nama variabel, dan komentar: Inggris.

## 2. Struktur kode (frontend)

```
core/
  audio/
    engine.ts            # orkestrasi: elemen media → graph → output
    worklet/
      pitch-processor.ts # AudioWorkletProcessor pembungkus Rubber Band
    rubberband/          # WASM + loader (lisensi GPL, lihat §4.3)
    minus-one.ts         # DSP: pembatalan kanal tengah, terjaga bass, fokus vokal
    loop.ts              # loop A-B
    eq.ts                # equalizer
    metronome.ts
  library/
    store.ts             # OPFS + IndexedDB
    peaks.ts             # hitung & cache peak waveform
  api/
    client.ts            # klien layanan YouTube→MP3 (token Bearer)
ui/
  components/            # Transport, Knob/Stepper, Waveform, LoopBar, ...
  screens/               # Player, Library, YouTube, Settings
  theme.css
  i18n/id.ts
app-pwa/                 # entry PWA, manifest, service worker, Share Target
ext-chrome/              # manifest.json, content script, popup, offscreen (bila perlu)
```

## 3. UI/UX

### 3.1 Prinsip
- **Mobile-first, satu tangan.** HP biasanya ditaruh di dudukan saat bermain musik; kontrol utama harus besar dan terjangkau ibu jari.
- Tema gelap default; kontras tinggi; target sentuh **≥ 48 px**.
- Nilai tempo dan kunci ditampilkan **besar** agar terbaca dari jarak.
- Perubahan kontrol berlaku **seketika**, tanpa tombol "terapkan".
- Tidak ada animasi berat; hormati `prefers-reduced-motion`.

### 3.2 Navigasi
Tab bawah: **Putar · Library · YouTube · Setelan**.

### 3.3 Layar Putar (utama)

```
┌──────────────────────────────┐
│ Judul Lagu                   │
│ Artis / sumber               │
│ ▁▂▅▇▅▂▁▂▃▆▇▅▃▂▁  (waveform)  │
│ [A]━━━━━━━━●━━━━━━[B]  1:23  │
│                              │
│     ⏪5   [  ▶ / ⏸  ]   5⏩   │
│                              │
│  TEMPO            KUNCI      │
│  [−]  0.85×  [+]  [−] +2 [+] │
│  ───●────────     ───●───    │
│                              │
│  Minus One  [ off | on ]     │
│  Mode: Dasar ▾                │
│  Loop A-B  [set A] [set B] ✕ │
├──────────────────────────────┤
│ Putar  Library  YouTube  ⚙   │
└──────────────────────────────┘
```

- Seek bar menampilkan waveform dan penanda loop A-B; ketuk untuk pindah posisi.
- Tombol − / + untuk tempo (langkah 0.05×) dan kunci (1 semitone); slider untuk penyesuaian cepat; tekan lama di nilai untuk reset (1.00× / 0).
- Preset tempo cepat (0.5×, 0.75×, 1×, 1.25×) sebagai chip.
- Minus One: toggle on/off, pilihan mode, dan slider tambahan hanya muncul pada mode yang membutuhkannya (P1).
- Label di bawah mode Minus One: *"Hasil bervariasi tergantung rekaman."*

### 3.4 Layar Library
Daftar lagu lokal (judul, durasi, sumber), cari, hapus, ubah nama. Menampilkan setelan tersimpan per lagu (tempo/kunci/loop) bila ada (P1). Tambah dari berkas perangkat lewat pemilih berkas.

### 3.5 Layar YouTube
- Satu kolom URL (dukung tempel dan *Share Target*), tombol **Simpan sebagai MP3**.
- Status: mengantre → mengunduh → mengonversi → selesai → otomatis masuk Library dan bisa langsung diputar.
- Galat jelas dan dalam bahasa sederhana: token salah, URL tidak valid, video tidak bisa diunduh, server sibuk/dibatasi, YouTube memblokir.
- Hanya satu konversi aktif dari UI pada satu waktu.

### 3.6 Layar Setelan
URL server, **token** (disimpan lokal di perangkat; tidak ditampilkan penuh), tes koneksi/versi yt-dlp (endpoint kesehatan), kualitas engine pitch (R2/R3), tema, bahasa, hapus data lokal.

### 3.7 Extension (popup/side panel)
Versi ringkas Layar Putar: tempo, kunci, minus one, plus tombol **Simpan sebagai MP3** untuk tab YouTube aktif. Komponen Svelte yang sama dengan PWA.

### 3.8 Keadaan khusus
Kosong (belum ada lagu), memuat, galat jaringan, offline (fitur lokal tetap jalan), format tidak didukung, penyimpanan penuh.

## 4. Arsitektur audio

### 4.1 Pipeline (PWA)

```
<audio> (sumber: berkas di OPFS / blob URL)
   │  playbackRate = tempo ; preservesPitch = false
   ▼
MediaElementAudioSourceNode
   ▼
AudioWorkletNode (Rubber Band, koreksi/pergeseran nada)
   │   rasio nada = transpose × (1 / tempo)
   ▼
Minus One (GainNode / ChannelSplitter-Merger, filter)
   ▼
Equalizer (BiquadFilterNode)
   ▼
GainNode (volume) → AudioContext.destination
```

### 4.2 Keputusan utama
- **Jangan decode seluruh lagu ke memori.** Putar lewat `<audio>` agar seek, durasi, dan memori tetap ringan di A23 (lagu 4 menit float32 stereo ≈ 85 MB bila di-decode penuh).
- **Tempo** diubah lewat `playbackRate` elemen dengan `preservesPitch = false`. Rubber Band hanya menggeser nada: rasio = `2^(semitone/12) / tempo`. Ini menghindari time-stretch penuh sehingga lebih hemat CPU.
- Konsekuensi: kualitas pada tempo ekstrem (mis. 0.5×) bergantung pada pergeseran nada yang besar; **harus diuji dan dibandingkan** dengan `preservesPitch = true` + transpose biasa di M0.
- Rubber Band dijalankan di `AudioWorklet` dengan engine **R2** (default); R3 sebagai opsi di Setelan.
- Parameter dikirim ke worklet lewat `AudioParam`/`port.postMessage`; perubahan dihaluskan (ramp) agar tidak berderak.

### 4.3 Rubber Band WASM
- Opsi A: paket npm berbasis AudioWorklet (mis. `rubberband-web`). Opsi B: build sendiri dari Rubber Band C++ dengan Emscripten.
- **Wajib periksa lisensi** (GPL-3.0 kompatibel dengan proyek) dan ukuran WASM (target PWA < 10 MB).
- Putuskan A atau B di M0 berdasarkan kualitas, ukuran, dan kemudahan perawatan.

### 4.4 Minus One (DSP)
- **Dasar:** `out = L − R` ke kedua kanal (mono, digeser/normalisasi gain).
- **Terjaga Bass:** pisahkan low-pass (< frekuensi potong, tetap mono) dan high-pass (diterapkan L−R), lalu jumlahkan.
- **Fokus Vokal:** mid/side; lemahkan pita ~300 Hz–3.4 kHz pada mid dengan filter bandstop/peaking yang bisa diatur.
- Semua implementasi memakai node Web Audio standar (tanpa WASM) agar ringan.

### 4.5 Waveform dan peak
Hitung peak sekali saat lagu ditambahkan (decode bertahap di Worker, bukan thread utama), simpan di IndexedDB, gambar di `canvas`.

## 5. PWA

- **Manifest:** nama, ikon (maskable), `display: standalone`, tema gelap, `orientation: portrait` (opsional).
- **Service worker (Workbox):** precache aset aplikasi dan WASM; strategi *cache-first* untuk aset, *network-only* untuk panggilan API; aplikasi jalan penuh offline untuk lagu lokal.
- **Share Target:** `share_target` di manifest agar URL YouTube dari aplikasi YouTube bisa dibagikan ke PWA (mengisi kolom URL di Layar YouTube).
- **Media Session API:** judul, kontrol putar/jeda/seek di layar kunci dan notifikasi.
- **Pemutaran latar belakang (layar mati):** wajib diuji di A23. Bila `AudioContext` ditangguhkan, cadangan: Capacitor/APK (M5).
- **Penyimpanan:** minta `navigator.storage.persist()` agar OPFS/IndexedDB tidak dibersihkan otomatis.

## 6. Extension Chrome (MV3, unpacked)

- **Content script** menemukan elemen `<video>`/`<audio>` aktif (generik, bukan selector YouTube) dan menyambungkannya ke pipeline yang sama.
- **Popup/side panel** mengirim perintah ke content script lewat `chrome.runtime`/`chrome.tabs` messaging.
- Tombol **Simpan sebagai MP3** mengirim URL tab YouTube ke layanan server (token dari penyimpanan extension).
- Izin minimal: `activeTab`, `scripting`, `storage`; `offscreen`/`tabCapture` hanya bila terpaksa.
- Pemasangan: `chrome://extensions` → Developer mode → *Load unpacked*. Perubahan kode butuh *Reload* manual.

### 6.1 Risiko khusus extension (uji dini di M1)
- `createMediaElementSource` pada media lintas-origin tanpa CORS menghasilkan **senyap**. Video YouTube memakai MSE (blob URL, satu origin) sehingga biasanya aman, tetapi harus dibuktikan.
- Memuat `AudioWorklet` dari konteks halaman bisa terhalang **CSP** situs. Cadangan: pakai `playbackRate` + `preservesPitch=true` untuk tempo, dan jalankan pergeseran nada lewat jalur lain (offscreen document + `tabCapture`) bila perlu.
- Perubahan struktur halaman YouTube tidak boleh merusak extension; cari elemen media generik dan tangani banyak elemen (iklan, pratinjau).

## 7. State & penyimpanan

- State aplikasi: store Svelte (lagu aktif, tempo, kunci, mode minus one, loop, status unduhan).
- Preset per lagu (tempo, kunci, loop, mode, parameter minus one) di IndexedDB, dikaitkan ke ID lagu.
- Token dan URL server di `localStorage`/`chrome.storage` (tidak di kode, tidak di repo).
- Batas penyimpanan: tampilkan sisa ruang dan jumlah lagu; peringatan saat hampir penuh.

## 8. Pengujian

| Jenis | Cakupan |
|---|---|
| Unit (Vitest) | Hitung rasio nada, parser URL, validasi, DSP minus one (uji numerik pada sinyal sintetis), penyimpanan |
| E2E (Playwright) | Alur PWA di Chromium: tambah berkas, putar, ubah tempo/kunci, simpan preset, mode offline |
| Manual di **A23** (checklist M0/M1) | Putar 30 menit tanpa patah-patah; CPU/baterai; layar mati; ganti tempo/kunci saat main; kualitas di 0.5× dan ±4 semitone; Share Target; install PWA |
| Manual extension | YouTube di Chrome desktop: tempo/kunci terdengar benar; tab lain tidak terpengaruh; perubahan halaman |

## 9. Performa (anggaran)

- Muat awal PWA < 10 MB (termasuk WASM); aplikasi interaktif < 2 detik pada A23 setelah terpasang.
- CPU rata-rata < 30% saat memutar + speed + transpose (R2).
- Tanpa kerja berat di thread utama (peak waveform di Worker; audio di AudioWorklet).

## 10. Risiko frontend

| Risiko | Mitigasi |
|---|---|
| Rubber Band berat di A23 | R2 default; ukur di M0; turunkan kualitas/buffer bila perlu |
| Layar mati menghentikan audio | Media Session API; uji di M0; cadangan Capacitor |
| Artefak di tempo ekstrem | Bandingkan metode pada M0; batasi rentang praktis bila perlu |
| Extension tak bisa menyentuh audio YouTube (CORS/CSP/MSE) | Uji dini di M1; jalur cadangan offscreen + `tabCapture` |
| Ukuran WASM terlalu besar | Pilih build ringan; muat malas (*lazy*) |
| OPFS dibersihkan browser | `navigator.storage.persist()`; kemungkinan ekspor/cadangan manual |

## 11. Pertanyaan terbuka (frontend)

1. Rubber Band: paket npm (`rubberband-web`) atau build sendiri? Putuskan di M0.
2. Apakah koreksi nada + `playbackRate` memberi kualitas yang cukup di 0.5×? Bandingkan dengan `preservesPitch = true` di M0.
3. Perlu ekspor/impor library (cadangan) untuk antisipasi data lokal hilang?
