# Aplikasi Android (APK)

`app-android/` membungkus PWA dengan Capacitor 8. PWA tetap satu-satunya antarmuka; yang ditambahkan adalah fitur native lewat plugin `MusikNative` (`app-android/android/app/src/main/java/com/musik/tools/`).

| Fitur                      | Cara kerja                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pemutaran latar            | `PlaybackService`: foreground service (`mediaPlayback`) + wake lock parsial + `MediaSession`. Audio tetap diputar oleh PWA di WebView.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Notifikasi dan lock screen | Judul, artis, tombol Putar/Jeda/Sebelumnya/Berikutnya dan seek bar. Tombol dikirim balik ke PWA (`mediaAction`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Seluruh musik di HP        | `listAudio` membaca MediaStore (izin `READ_MEDIA_AUDIO`, di Android 12 ke bawah `READ_EXTERNAL_STORAGE`). Lagu dibuka lewat `content://`. Mode **Folder** memakai kolom `RELATIVE_PATH` dan `VOLUME_NAME` (Android 9 ke bawah: dari `_data`), jadi penyimpanan internal dan kartu SD/USB sama-sama tampil. Hanya folder berisi lagu yang sudah diindeks MediaStore yang muncul (folder dengan `.nomedia` tidak). Mengetuk lagu memutarnya dan mengantrekan semua lagu di folder itu (`Player.playLazy`); berkas dibaca saat gilirannya, jadi memori hanya menampung lagu yang sedang diputar. |
| YouTube tanpa server       | `youtubedl-android` (Python + yt-dlp + ffmpeg di dalam APK): `ytSearch`, `ytDownload` (MP3), `ytUpdate`. IP server tidak dipakai.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Bagikan dari YouTube       | Intent filter `ACTION_SEND` (teks) menggantikan Share Target PWA.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Di PWA, kode yang berbicara dengan plugin ada di `app-pwa/src/native.ts` (antarmuka), `native-bridge.svelte.ts` (notifikasi dan tautan bagikan), `device.svelte.ts` (musik di HP), dan cabang `startNative` di `youtube.svelte.ts`. Di browser biasa `native` bernilai `null` dan perilaku tidak berubah.

## Alur lagu YouTube di HP

1. Cari: `ytsearch10:<kata kunci>` dengan `--flat-playlist --dump-json`, disaring seperti di server (id valid, bukan siaran langsung, maks. 20 menit).
2. Pilih satu: yt-dlp mengunduh audio dan ffmpeg mengonversi ke MP3 di cache aplikasi.
3. PWA membaca berkas itu, menyimpannya ke Library (IndexedDB/OPFS), lalu menghapus berkas sementara.
4. Lagu dibuka di tab Putar; tempo dan transpose berjalan seperti lagu lain.

yt-dlp bawaan APK (2025.11.12) cepat usang karena YouTube sering berubah, sehingga diperbarui otomatis: saat aplikasi dibuka bila pemeriksaan terakhir lebih dari 3 hari lalu (HP baru: langsung di pembukaan pertama, sekitar 4 detik, perlu internet), dan sekali setelah unduhan atau pencarian gagal dengan galat umum (jeda minimal 30 menit), lalu perintah diulang. Pembaruan tidak berjalan saat ada unduhan aktif dan permintaan baru menunggu sampai selesai. Setelan, bagian "yt-dlp di HP", punya sakelar otomatis, waktu pemeriksaan terakhir, dan tombol **Perbarui sekarang**. Versi terbaru disimpan di folder internal aplikasi di HP itu.

## Membangun

Prasyarat: JDK 21 (`JAVA_HOME`), Android SDK dengan platform 36 dan build-tools 36.0.0 (`ANDROID_HOME`).

```powershell
npm run android:apk      # build web, cap sync, Gradle assembleDebug
npm run android:sync     # hanya build web dan cap sync
```

Hasil: `app-android/android/app/build/outputs/apk/debug/app-debug.apk` (sekitar 59 MB, hanya `arm64-v8a`). Salin ke HP lalu pasang (izinkan sumber tidak dikenal). Atau `adb install -r app-debug.apk` dengan USB debugging.

Catatan Windows: `scripts/android.mjs` memakai `TEMP=C:\gt`. Dengan folder temp yang terlalu panjang Gradle gagal dengan "Unable to establish loopback connection".

APK debug ditandatangani kunci debug. Untuk rilis perlu keystore sendiri (`assembleRelease` + penandatanganan); simpan keystore dengan aman.

## Status uji di Galaxy A23 (Android 14)

Sudah lulus di perangkat (23 November 2026): pemutaran dari Musik di HP, pemutaran terus berjalan dengan layar mati dan notifikasi media, pencarian YouTube di HP, unduh dan konversi MP3 di HP (sekitar 27 detik unduh, 2 detik konversi), dan JS runtime QuickJS yang ikut terpasang. Satu unduhan pernah gagal tanpa sebab terlihat; kegagalan kini dicatat di logcat (`MusikNative`).

Belum diuji di perangkat: mode Folder (termasuk kartu SD), antrean dari folder, dan tombol notifikasi Berikutnya/Sebelumnya. Hal yang perlu terus diperhatikan:

- Pemutaran terus berjalan saat layar mati dan aplikasi di latar (WebView, AudioWorklet, Rubber Band) dan tidak berhenti oleh penghemat baterai One UI. Bila berhenti: matikan optimasi baterai untuk aplikasi ini.
- Pembukaan lagu `content://` dari MediaStore lewat `fetch` (file besar dibaca penuh ke memori).
- yt-dlp di HP: waktu unduh dan konversi, serta apakah YouTube meminta JavaScript runtime tambahan (yt-dlp terbaru memakainya untuk sebagian format); bila ya, unduhan gagal sampai ada solusinya.
- Notifikasi (Android 13+ meminta izin saat lagu pertama diputar).
- Seek dari lock screen: posisi diperkirakan dari kecepatan pemutaran dan baru dikoreksi saat status berubah.
- Layanan hanya dimulai saat aplikasi di depan; Android menolak memulainya dari latar. Karena itu layanan tetap di foreground selama jeda singkat antar lagu (90 detik) dan tidak turun lalu naik lagi.

## Folder simpan MP3

Setelan, bagian "Folder simpan MP3": `pickSaveFolder` membuka pemilih folder Android (`ACTION_OPEN_DOCUMENT_TREE`), izin baca-tulis dibuat permanen (`takePersistableUriPermission`) dan URI-nya disimpan di SharedPreferences. Setelah konversi, `ytDownload` menyalin MP3 ke folder itu lewat `DocumentFile` (nama dari judul, `(2)`, `(3)` bila sudah ada) lalu meminta media scanner memindai berkasnya, jadi muncul di "Musik di HP". Android 11 ke atas tidak mengizinkan memilih akar penyimpanan atau folder Download; pilih atau buat subfolder (mis. `Music/Musik`). Opsi "Simpan juga di Library aplikasi" mengatur apakah salinan kedua (dengan tempo dan nada per lagu yang diingat) disimpan di Library; bila mati, lagu diputar langsung dari berkas di folder.

## Daftar musik di HP

Daftar dibaca ulang setiap tampilan dibuka. MediaStore menyimpan baris berkas yang sudah dihapus sampai pemindaian berikutnya, jadi plugin memeriksa keberadaan berkas dan menyembunyikan yang hilang (bila semua tampak hilang, jalur berkas dianggap tidak terbaca dan semuanya ditampilkan). Jalur yang hilang dikirim ke `MediaScannerConnection` agar indeks Android ikut bersih.

## Catatan teknis

- Service worker PWA di dalam APK menyimpan versi lama: setelah memasang APK baru, buka aplikasi dua kali agar kode baru yang berjalan.
- Plugin dan PWA berbicara lewat `@capacitor/core` (`registerPlugin`); objek `Capacitor` bawaan WebView saja tidak cukup.
- Debug lewat USB: `adb logcat -d` dan cari `Capacitor`, `MusikNative`, `Capacitor/Console`.

## Batasan

- Hanya `arm64-v8a` (HP modern). Emulator x86 tidak didukung tanpa mengubah `abiFilters`.
- Lagu hasil YouTube disimpan di Library aplikasi, bukan di folder Musik HP.
- Mengunduh dari YouTube melanggar ketentuan layanan YouTube dan bisa melanggar hak cipta; untuk penggunaan pribadi.
