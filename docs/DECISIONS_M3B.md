# Keputusan teknis M3-B: loop A-B, equalizer, metronom/count-in, preset per lagu

Status: selesai di kode dan uji otomatis. **Belum diuji di A23** (bagian terakhir `TEST_A23.md`).

## Loop A-B

- Tiga tombol ikon di layar Putar: **A** (titik awal = posisi saat ini), **B** (titik akhir), **×** (hapus). Waveform memperlihatkan daerah loop (diarsir) dan dua penanda.
- Aturan murni di `core/practice/loop.ts` (diuji unit): panjang minimum 0,5 detik; B tanpa A memulai loop di 0:00; menggeser A melewati B menghapus B; B yang terlalu dekat dengan A diabaikan.
- Pelompatan ke A memakai pemantau 25 ms selama pemutaran (bukan `timeupdate`, yang hanya ~4 Hz dan membuat loop tidak presisi). Lompat hanya saat posisi tepat di B; **menggeser sendiri ke luar loop diizinkan** (loop tidak mengurung pengguna).
- Terukur di Chromium: loop 3,2-6,2 detik tetap dalam batas pada tempo 1× dan 2× (selisih sekitar 0,05 detik dari B), dan membungkus berulang.
- Batas: antarmuka tidak menunjukkan waktu A dan B sebagai angka (hanya penanda di waveform). Penyesuaian halus titik (±0,1 detik) belum ada.

## Equalizer

- 5 pita, `BiquadFilterNode`: low shelf 80 Hz, peaking 250 Hz / 1 kHz / 4 kHz (Q=1), high shelf 12 kHz; ±12 dB, langkah 1 dB. Dipasang di graf setelah Minus One dan sebelum volume.
- UI: ikon penyetel membuka panel dengan 5 slider vertikal (label 80, 250, 1k, 4k, 12k) dan ikon reset; tertutup secara bawaan.
- Respons teoretis dari rumus RBJ (`biquadMagnitudeDb`) diuji unit: pita peaking memberi gain penuh di frekuensi tengah, shelf memberi gain penuh di dalam daerahnya dan sekitar separuh di sudutnya, pengaturan datar transparan.
- Terukur lewat pipeline nyata (Chromium): +12 dB pada pita 250 Hz menaikkan nada 330 Hz sebesar +8,8 dB dan 550 Hz hanya +3,3 dB; -12 dB menurunkan 330 Hz sebesar 8,8 dB; reset kembali datar (0,00 dB).
- Tidak ada preset EQ bawaan (rock, vokal, dll.) dan tidak ada tampilan kurva respons.

## Metronom dan hitung masuk (count-in)

- Dijadwalkan pada jam audio dengan look-ahead (bukan timer), jadi ketukan stabil; klik berupa osilator pendek bernada lebih tinggi untuk ketukan pertama birama. Keluaran melewati volume tetapi **tidak** melewati penggeser nada/EQ.
- Pengaturan: BPM 30-240, ketukan per birama 1-12 (tersimpan di perangkat), tombol hidup/mati, dan tombol **hitung masuk** ("1 2 3 4"). BPM tidak mengikuti tempo lagu (tidak ada deteksi BPM).
- Hitung masuk: setiap kali Putar ditekan dari keadaan jeda, satu birama klik dimainkan, lalu lagu mulai tepat di ketukan berikutnya. Menekan Jeda/Stop saat menghitung membatalkan permulaan. Bila metronom sedang hidup, ia dilanjutkan sejajar dengan awal lagu.
- Mengubah BPM saat berjalan menyusun ulang jadwal pada ketukan berikutnya tanpa celah (bug celah ditemukan lewat e2e dan diperbaiki; diuji unit dan e2e).
- Terukur: 120 BPM menghasilkan klik berjarak 0,5000 detik (jam audio); ketukan pertama diberi aksen; klik terdengar di keluaran (puncak 0,40); hitung masuk 4 ketukan pada 240 BPM menunda lagu sekitar 1,1 detik.

## Preset per lagu

- Yang disimpan per lagu Library: tempo, kunci, Minus One, titik loop, dan 5 gain EQ. Disimpan **otomatis** 0,6 detik setelah setiap perubahan, dibaca otomatis saat lagu dipilih. Tidak ada tombol simpan.
- Lagu tanpa preset dimulai dari nilai bawaan (tempo 1×, kunci 0, tanpa loop, EQ datar, Minus One mati). Ini menggantikan perilaku M3-A yang mempertahankan tempo/kunci antar lagu.
- Kembali ke semua nilai bawaan menghapus rekaman preset; menghapus lagu menghapus presetnya; "Hapus semua data" membersihkan semuanya. Berkas dari "Buka & putar" tidak menyimpan preset (selalu mulai dari bawaan); "Simpan ke Library" menyimpan pengaturan yang sedang aktif sebagai preset lagu itu.
- IndexedDB naik ke versi 2 (toko `presets`, kunci `songId`); lagu dan data lama tidak berubah. Preset dinormalkan saat dibaca (nilai rusak/di luar rentang diperbaiki; diuji unit).
- Metronom dan pengaturannya global, bukan per lagu.

## Bukti uji otomatis

- Unit: `core/practice/practice.test.ts` (loop, preset, respons EQ, penjadwalan metronom dengan konteks audio tiruan), `queue.test.ts` (M3-A).
- E2E `e2e/practice.mjs` 26/26: loop (batas, membungkus, tempo 2×, keluar dari loop, hapus, B tanpa A), EQ numerik, metronom (jarak klik, aksen, terdengar, ubah BPM, mati), hitung masuk (+pembatalan), preset (lagu lain bawaan, pemulihan, tahan muat ulang, hapus saat bawaan, hapus saat lagu dihapus), tanpa galat konsol.
- `e2e/app.mjs` 43/43, lab 23/23, M2 27/27, ekstensi 11/11 tetap lulus.

## Belum teruji

- Kenyamanan sentuh dan keterbacaan di A23 (tombol A/B/×/EQ/metronom, slider EQ vertikal).
- Beban CPU saat EQ dan metronom aktif bersama pergeseran nada R2 di A23.
- Ketepatan loop dan metronom di perangkat dengan latensi keluaran ~0,3 detik (jam audio tepat, tetapi persepsi sinkron dengan lagu belum dinilai).
- Metronom saat layar mati (jadwal look-ahead bergantung pada timer di halaman tersembunyi; belum diuji).
