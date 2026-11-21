# Usulan (belum dibangun)

Di luar PRD; tidak dikerjakan di M0.

1. **Klarifikasi lisensi wrapper `rubberband-wasm`**: paket menyatakan "GPLv2" saja. Bila proyek akan dibagikan, pertimbangkan build WASM sendiri dari Rubber Band 3.x (GPL-2.0-or-later) agar status lisensi jelas.
2. **Bypass saat rasio 1.0**: lewati Rubber Band ketika rasio nada = 1 (tempo 1×, kunci 0) untuk menghemat CPU/baterai di A23. Perlu uji klik/transisi.
3. **Satu mode "latihan" otomatis menurunkan R3 ke R2** bila `underrun` meningkat.
4. **Pengukuran CPU lebih presisi**: `SharedArrayBuffer` + `Atomics` membutuhkan cross-origin isolation (header COOP/COEP) di hosting; dinilai terlalu merepotkan untuk M0.
5. **Bias frekuensi R2 pada nada murni rendah (~1%)**: bila terdengar mengganggu, uji `PitchHighQuality` atau window panjang.
