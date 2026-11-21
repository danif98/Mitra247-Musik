# Keputusan teknis M0

Status: M0 selesai di sisi kode. Uji perangkat nyata (Samsung A23) **belum dilakukan**; lihat `TEST_A23.md`.

## 1. Pilihan Rubber Band WASM

| Opsi                                               | Lisensi                                                         | Ukuran                                       | Catatan                                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rubberband-web` 0.2.1 (worklet siap pakai)        | GPL-2.0-or-later                                                | 612 KB (satu berkas JS minified berisi WASM) | Hanya `pitch`, `tempo`, `highQuality`. Tidak ada R3, tidak ada statistik/diagnostik, `console.log` di setiap pesan, kode minified sulit diaudit. |
| `rubberband-wasm` 3.3.0 (binding WASM + C wrapper) | "GPLv2" (teks GPL v2; Rubber Band hulu adalah GPL-2.0-or-later) | WASM 265 KB (118 KB gzip)                    | Rubber Band 3.3: engine R2 (`EngineFaster`) dan R3 (`EngineFiner`), mode real-time, opsi pitch lengkap. Worklet ditulis sendiri.                 |
| Build sendiri (Emscripten)                         | GPL                                                             | ~265 KB                                      | `emcc` tidak ada di mesin ini; menambah toolchain berat. Ditolak untuk M0.                                                                       |

**Dipilih: `rubberband-wasm` 3.3.0 + worklet sendiri** (`core/audio/worklet/pitch-processor.ts`, inti di `core/audio/pitch-shifter-core.ts`).
Alasan: satu-satunya opsi siap pakai yang menyediakan R2 _dan_ R3 (syarat PRD), memberi akses ke latensi/underrun untuk diagnostik, dan ukurannya kecil.
Batas/risiko:

- Lisensi paket tertulis "GPLv2" tanpa "or later". Rubber Band hulu GPL-2.0-or-later (kompatibel dengan GPL-3.0), tetapi wrapper C `rubberband.c` tidak punya header lisensi. Penggunaan pribadi, risiko praktis rendah; **perlu klarifikasi bila kode dibagikan** (usulan di `PROPOSALS.md`).
- `@echogarden/rubberband-wasm` (GPL-2.0-only) tidak dipakai: tidak kompatibel dengan GPL-3.0.
- Versi dikunci tepat (`3.3.0`) agar WASM tidak berubah diam-diam.

Opsi R2 dan R3 (`engineOptions`): keduanya `ProcessRealTime | ThreadingNever | ChannelsTogether`. R2 menambah `EngineFaster | PitchHighConsistency` (konsisten saat rasio berubah terus). R3 menambah `EngineFiner`.

## 2. Jalur A vs jalur B

- **A**: `playbackRate = tempo`, `preservesPitch = false`, rasio Rubber Band = `2^(st/12) / tempo`. Time-stretch dilakukan lewat resampling browser; Rubber Band hanya menggeser nada.
- **B**: `playbackRate = tempo`, `preservesPitch = true`, rasio Rubber Band = `2^(st/12)`. Time-stretch oleh browser (WSOLA), transpose oleh Rubber Band.
- Keduanya memakai worklet yang sama; sakelar di halaman lab. Hasil numerik (sinus 440 Hz, Chrome headless): kedua jalur tepat pada ±12 semitone dan pada tempo 0.5×. **Kualitas pendengaran A vs B belum dinilai**; itu tugas uji A23 (`TEST_A23.md`). Keputusan A/B final ditunda sampai ada data.

## 3. Penghalusan parameter

- Tempo dan semitone diubah lewat ramp 80 ms (smoothstep) di sisi UI; `playbackRate` dan `pitchRatio` digerakkan bersama tiap 16 ms.
- Di worklet, rasio nada dihaluskan lagi (konstanta waktu 8 ms, domain log).
- Saat halaman tersembunyi (layar mati) timer dibatasi browser, sehingga ramp dilewati dan nilai langsung diterapkan.
- Worklet memakai FIFO keluaran dengan prebuffer (R2 256 frame, R3 1024 frame). Tanpa prebuffer R3 menghasilkan 1 underrun dalam 3 detik pada tes Node. Prebuffer menambah latensi kontrol kecil.

## 4. Struktur

Sesuai PRD 5.1 / FRONTEND 2, dengan penyesuaian:

- `core/audio/` memuat `pitch-math.ts` (fungsi murni, diuji), `pitch-shifter-core.ts` (jalan di worklet dan Node), `engine.ts` (tidak bergantung bundler; URL aset disuntikkan), `assets.ts` (impor khusus Vite).
- Keluaran build: `out/app` (PWA statis), `out/server` (CommonJS, startup file `server/app.js`). Server CommonJS agar aman dengan Passenger/cPanel versi Node berbeda.
- Repo deploy: `app/`, `server/`, `package.json` + lockfile, `VERSION`. Lihat `DEPLOY.md`.
- `typecheck`: `tsc` (root), `tsc` (server), `svelte-check`.

## 5. Diagnostik di halaman lab

- Latensi: `baseLatency`, `outputLatency`, latensi Rubber Band (`getLatency`).
- Underrun worklet: dihitung saat FIFO tidak bisa mengisi satu blok setelah prebuffer terpenuhi.
- Beban worklet: `Date.now()` hanya beresolusi 1 ms di AudioWorklet (tidak ada `performance`). Nilai adalah **rata-rata berdither atas banyak blok, perkiraan kasar**, bukan ukuran presisi.
- `AudioContext.renderCapacity` (Chrome 126+): beban render dan rasio underrun dari browser. Di Chrome headless nilainya tidak muncul (`n/a`); **belum diketahui apakah muncul di Chrome Android A23**.
- Log: event (visibilitychange, statechange, media play/pause/waiting/stalled, perubahan parameter) dan sampel per detik, diunduh sebagai JSON.

## 6. Temuan numerik

- Sinus 440 Hz +12 semitone: R3 tepat (880.00 Hz). R2 memiliki bias sekitar +1% (888 Hz di Node, 885 Hz di Chrome) pada nada murni berfrekuensi rendah; pada 1000 Hz tepat. Dugaan: pelacakan puncak per bin pada window standar. Untuk musik nyata dampaknya belum dinilai; **cek dengan telinga di A23**. Toleransi tes R2 diset 2%, R3 0.2% (Node) / 1% (Chrome).
- Rasio ekstrem (tempo 0.25 dan +12 semitone, rasio 8) diuji di Node: ~2% menyimpang pada R2.

## 7. Asumsi dan ketidakpastian

Lihat `ASSUMPTIONS.md`. Hal yang belum pasti: perilaku `AudioContext` dan Media Session saat layar mati di A23, beban CPU nyata R2/R3 di A23, kualitas jalur A pada 0.5×, ketersediaan `renderCapacity` di Android.
