# Asumsi M0

1. PRD 6.3 dan prompt sama-sama menetapkan R2 default; tidak ada konflik antara prompt dan PRD yang ditemukan.
2. "Mulai tanpa MUSIK_TOKEN harus GAGAL untuk endpoint selain health" diartikan: server tetap jalan (agar health bisa dicek), tetapi semua endpoint lain membalas `503 server_not_configured` dengan pesan jelas. Token pendek (<32 karakter) diperlakukan sama.
3. Endpoint terautentikasi selain health membalas `501 not_implemented` sampai M2 (tidak ada fitur baru).
4. Struktur di server: repo deploy menjadi root aplikasi Node (`package.json` di root, startup file `server/app.js`); folder `app/` dipublikasikan sebagai situs statis (symlink/salin ke `public_html/...`).
5. Server ditulis CommonJS dan target Node >= 18 agar aman untuk Passenger cPanel. Versi Node di cPanel belum diketahui; harus sama dengan versi saat `vendor-zip`.
6. Tidak ada dependensi runtime server saat ini, jadi `vendor.zip` berisi berkas penanda saja. Skrip tetap siap untuk dependensi pure JS di M2.
7. Jalur A/B memakai worklet Rubber Band yang sama; "transpose biasa" jalur B berarti rasio `2^(st/12)` tanpa kompensasi tempo.
8. Android uji lewat HTTPS publik (hosting sendiri) atau `adb reverse` ke `localhost` (secure context). Lihat `TEST_A23.md`.
9. `deploy-prepare` secara bawaan menulis ke `../musik-deploy` (di luar folder proyek) sesuai permintaan. Pada verifikasi M0 dijalankan dengan `MUSIK_DEPLOY_DIR` di dalam folder proyek agar tidak menyentuh luar proyek.
10. Playwright memakai Chrome sistem bila Chromium bawaan versi 1255 tidak terpasang (cache lokal berisi build 1243).
11. Ikon PWA adalah placeholder yang dibangkitkan skrip (`scripts/gen-icons.mjs`).
12. Teks UI hanya di `ui/i18n/id.ts`; label di `e2e/run.mjs` (selector) bergantung pada teks itu.

## Asumsi tambahan (M1-M4 dan go-live)

13. Library dan preset hanya ada di browser perangkat (OPFS + IndexedDB); tidak ada sinkronisasi antar perangkat dan tidak ada ekspor. Menghapus data situs menghapus semuanya (`navigator.storage.persist()` diminta, tetapi tidak dijamin).
14. Peaks waveform didekode di main thread pada 8 kHz (`decodeAudioData` tidak ada di Worker); berkas > 80 MB tidak diberi waveform.
15. "Buka & putar" memakai pemilih berkas sistem; PWA Android tidak bisa memindai folder (lihat `DECISIONS_M3A.md`).
16. Metronom tidak mengikuti tempo lagu; BPM diatur manual.
17. Lagu tanpa preset mulai dari nilai bawaan; preset disimpan otomatis per lagu Library.
18. Server berjalan sebagai satu proses; status job disimpan di memori (restart menghapus status, berkas lama dibersihkan lewat umur folder).
19. IP klien diambil dari entri terakhir `X-Forwarded-For` (`TRUST_PROXY=true`); belum diverifikasi terhadap proxy cPanel sebenarnya.
20. Ekstensi dipasang manual (unpacked); tombol Simpan sebagai MP3 membuka PWA dan tidak menyimpan token.
21. PWA dihosting di jalur apa pun (`base: './'`); API di URL terpisah dengan HTTPS dan `ALLOWED_ORIGINS` yang cocok dengan origin PWA.
