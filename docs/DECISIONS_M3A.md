# Keputusan teknis M3-A: layar Putar ringkas, antrean, putar tanpa simpan

Status: selesai di kode dan uji otomatis. **Belum diuji di A23** (lihat bagian terakhir `TEST_A23.md`).

## Cakupan

Permintaan pengguna: sederhanakan tab Putar (kurangi teks), ikon untuk reset dan Minus One, toolbar audio umum (stop, play/pause, prev, next, tetap ±5 detik), dan putar lagu dari penyimpanan tanpa menambahkannya ke Library. Bagian M3 yang ikut terpenuhi: **antrean lagu lokal dasar** (prev/next, lanjut otomatis). Loop A-B, EQ, metronom, dan preset per lagu **belum** dikerjakan (tetap M3-B); mode Minus One lanjutan tetap M4.

## Keputusan

- **Tata letak Putar**: judul + penunjuk antrean (`2 / 5`), waveform + waktu, baris transport `±5 | prev | stop | play/pause | next | ±5`, dua stepper (TEMPO, KUNCI) dengan ikon reset, chip preset tempo, baris bawah: ikon speaker + slider volume + ikon Minus One + ikon info. Nama berkas, "Tahan untuk reset", panel Minus One, dan label "Volume" dihapus. Semua ikon SVG inline (`ui/components/Icon.svelte`), nama aksesibel dari `ui/i18n/id.ts`, target sentuh >= 48 px.
- **Reset**: hanya ikon (↺) di tiap stepper, nonaktif saat nilai sudah bawaan. Tekan-lama dihapus (tidak terlihat pengguna).
- **Minus One**: satu tombol ikon (mikrofon; berubah mikrofon-coret dan berwarna saat aktif, `aria-pressed`). Peringatan wajib PRD 6.4 ("Hasil bervariasi tergantung rekaman.") dan catatan mono dipindah ke ikon info yang membuka keterangan singkat.
- **Stop** = jeda dan kembali ke 0:00. **Play/pause** = satu tombol toggle.
- **Antrean**: urutan daftar Library saat lagu dipilih. `next` berhenti di lagu terakhir (tombol nonaktif). `prev`: bila > 3 detik, ulang dari awal; selain itu lagu sebelumnya (pada lagu pertama: ulang). Akhir lagu lanjut otomatis; lagu terakhir berhenti. Tempo dan kunci **dipertahankan** antar lagu (belum ada preset per lagu). Tanpa acak/ulang. Logika murni di `core/library/queue.ts` (diuji unit). Media Session ikut mendapat `previoustrack`, `nexttrack`, `stop`.
- **Putar tanpa simpan (opsi A)**: tombol "Buka & putar" (di Library dan di layar Putar kosong) memakai pemilih berkas sistem (`<input type="file" multiple>`). Berkas yang dipilih menjadi antrean sementara (id `tmp:<n>`), diputar dari `File` lewat object URL **tanpa disalin ke OPFS dan tanpa masuk Library**. Waveform dan durasi dihitung setelah pemutaran mulai. Tombol "Simpan ke Library" menyimpan lagu sementara yang sedang diputar. Antrean sementara hilang saat aplikasi ditutup.
- **Batas platform (penting)**: di Android Chrome PWA tidak bisa menelusuri folder atau memindai musik HP (`showOpenFilePicker`/`showDirectoryPicker` hanya di desktop). Pemilih berkas sistem adalah satu-satunya jalan; membaca seluruh penyimpanan hanya mungkin lewat pembungkus APK (Capacitor, M5 di PRD). Opsi lain yang belum dibangun: Share Target berkas (bagikan dari pengelola berkas ke aplikasi).

## Perbaikan kecil yang ikut

- `Player.seek()` mengabaikan nilai non-finit (sebelumnya melempar galat bila durasi belum termuat).

## Bukti uji otomatis

- Unit: `queue.test.ts` (urutan, batas akhir, aturan prev 3 detik).
- E2E `e2e/app.mjs` 43/43, mencakup: ikon reset memulihkan tempo 1.00x dan kunci 0 dan nonaktif di nilai bawaan; teks "Tahan untuk reset" tidak ada; toggle Minus One (`aria-pressed`) dan info; stop kembali ke 0:00; prev ke lagu sebelumnya, prev > 3 detik mengulang; next; penunjuk `1 / 2`; lanjut otomatis di akhir lagu; **Buka & putar**: antrean sementara terputar, Library dan OPFS tidak bertambah, waveform dihitung belakangan, simpan ke Library bekerja.
- Lab 23/23, M2 27/27, ekstensi 11/11 tetap lulus.

## Belum teruji

- Tampilan dan kenyamanan sentuh di A23 (enam tombol transport pada layar 6,6").
- Pemilih berkas Android (Files/Documents) untuk "Buka & putar": format M4A/MP3 besar, beberapa berkas sekaligus, dan apakah lagu berjalan lancar dari `content://` tanpa disalin.
- Kontrol layar kunci untuk prev/next/stop.
