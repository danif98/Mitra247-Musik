# Keputusan teknis M4: Minus One lanjutan

Status: selesai di kode dan uji otomatis. **Belum diuji dengan telinga di A23** (bagian terakhir `TEST_A23.md`). Angka sintetis di bawah membuktikan DSP bekerja sesuai desain, bukan bahwa hasilnya enak didengar pada rekaman nyata.

## Mode

Notasi: M = (L + R) / 2 (tengah), S = (L − R) / 2 (sisi). Semua memakai node Web Audio standar (tanpa WASM). Implementasi: `core/audio/minus-one.ts`.

| Mode (UI)                 | Keluaran                     | Sifat                                                                                             |
| ------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| **Dasar** (`basic`)       | S di kedua kanal             | Semua yang di tengah hilang, termasuk bass dan kick. Rekaman mono menjadi senyap.                 |
| **Jaga bass** (`bass`)    | LP(M) + HP(S) di kedua kanal | Tengah tetap terdengar di bawah batas (80-300 Hz); di atasnya dibatalkan. Keluaran mono.          |
| **Fokus vokal** (`focus`) | (M − k·BP(M)) ± S            | Stereo terjaga; hanya pita vokal di tengah dikurangi. Instrumen di pita yang sama ikut berkurang. |

Filter LP/HP berorde 4 (dua tahap Butterworth berantai, Q = 1/√2) agar pemisahan cukup tajam; pita vokal memakai satu HP dan satu LP berorde 2.

## Kontrol manual

- **Kekuatan** (0-100%, semua mode): pada Dasar dan Jaga bass mencampur sinyal asli dengan hasil; pada Fokus vokal adalah k (seberapa penuh pita vokal dikurangi).
- **Batas bass** (Jaga bass, 80-300 Hz, bawaan 150).
- **Lebar pita vokal** (Fokus vokal, 0-100%): 0% = 600-2000 Hz, 50% (bawaan) = 400-3500 Hz (sesuai PRD 300 Hz-3,4 kHz), 100% = 200-5000 Hz.
- Panel mode dan slider muncul hanya saat Minus One hidup; slider yang tidak relevan untuk mode terpilih disembunyikan; satu kalimat petunjuk menjelaskan mode terpilih. Label wajib "Hasil bervariasi tergantung rekaman." tetap di ikon info.

## Preset per lagu

Mode dan ketiga kontrol ikut disimpan di preset otomatis per lagu (`Preset.mo`). Preset lama (tanpa `mo`) dibaca dengan nilai bawaan; tidak ada migrasi data yang diperlukan. Semua nilai dinormalkan saat dibaca (diuji unit).

## Perilaku graf

- Hanya jalur yang dipakai yang tersambung ke front end M/S; jalur lain diputus setelah crossfade 90 ms agar tidak memakan CPU (di A23 sudah dekat batas dengan pergeseran nada). Saat mati, front end juga diputus dan sinyal lewat jalur kering.
- Pindah mode dan menggeser slider dihaluskan (konstanta 15 ms), tanpa derak yang terukur.
- Temuan saat uji: pada Web Audio parameter `Q` filter lowpass/highpass dalam **dB**, bukan linear; `Q = 0,7071` membuat resonansi dan angka hasil tidak sesuai desain. Dipakai `-3,0103 dB` (= Q linear 0,7071). Setelah diperbaiki hasil ukur sama dengan prediksi teori (mis. batas 300 Hz: -1,6 dB, batas 100 Hz: -24,6 dB pada nada tengah 200 Hz).
- Temuan lain: pemutusan simpul dijadwalkan ganda bila diubah berulang dalam 90 ms (galat `disconnect`); diperbaiki, diuji (tanpa galat konsol).

## Bukti numerik (render offline di Chromium, kelas `MinusOne` asli)

Campuran uji: nada tengah 80, 200, 1000, 3000, 8000 Hz; 330 Hz hanya kiri; 550 Hz hanya kanan (masing-masing amplitudo 0,3).

| Pemeriksaan                                        | Hasil terukur                               |
| -------------------------------------------------- | ------------------------------------------- |
| Nonaktif: sinyal tidak berubah                     | 0,0 dB                                      |
| Dasar: semua nada tengah                           | < -169 dB (batas ukur)                      |
| Dasar: instrumen kiri/kanan                        | -6,0 dB di kedua kanal                      |
| Dasar 50%: tengah                                  | -6,0 dB                                     |
| Dasar 0%: sama dengan aslinya                      | 0,0 dB                                      |
| Jaga bass (150 Hz): tengah 80 Hz                   | -0,7 dB (terjaga)                           |
| Jaga bass: tengah 1 k / 3 k / 8 kHz                | -66 / -104 / -141 dB                        |
| Jaga bass: instrumen di atas batas                 | -6,0 / -6,1 dB                              |
| Jaga bass: batas 300 Hz vs 100 Hz pada nada 200 Hz | -1,6 dB vs -24,6 dB                         |
| Fokus vokal: tengah 1 kHz                          | -14,7 dB                                    |
| Fokus vokal: tengah 80 Hz / 8 kHz                  | +0,3 / +1,1 dB (terjaga)                    |
| Fokus vokal: nada kiri 330 Hz                      | kiri +0,6 dB, kanan -11 dB (stereo terjaga) |
| Fokus vokal 50% vs 100% pada 1 kHz                 | -5,6 dB vs -14,7 dB                         |
| Fokus vokal: lebar sempit vs lebar pada 3 kHz      | +1,3 dB vs -2,3 dB                          |

Catatan jujur: Fokus vokal hanya menurunkan nada tengah di pita vokal sekitar 15 dB pada kekuatan penuh (bukan menghilangkannya), karena filter pita berorde 2 dan pergeseran fasa; ini kompromi desain untuk menjaga stereo. Untuk penghilangan lebih kuat gunakan Dasar atau Jaga bass.

## Uji otomatis

- Unit: parameter (batas, perbaikan nilai rusak, perbandingan), pita vokal, preset dengan `mo`.
- E2E `e2e/minusone.mjs` 26/26: tabel di atas, pergantian mode pada node hidup, UI (panel hanya saat hidup, 3 mode, slider per mode, petunjuk), parameter sampai ke engine, tersimpan per lagu dan pulih setelah muat ulang, tanpa galat konsol.
- Lab 23/23, aplikasi 43/43, alat latihan 26/26, M2 27/27, ekstensi 11/11 tetap lulus. Ekstensi memakai Minus One mode Dasar (tanpa panel).

## Belum teruji / batas

- **Kualitas pada rekaman nyata**: belum didengar. Vokal yang di-double, reverb stereo, dan rekaman mono akan memberi hasil buruk (batas teknik tanpa AI, sudah dinyatakan di PRD 6.4).
- Beban CPU tiga mode di A23 (jalur aktif saja yang tersambung, tetapi belum diukur di perangkat).
- Ekstensi belum punya pilihan mode (hanya Dasar).
- Tidak ada tampilan kurva respons maupun indikator tingkat per kanal.
