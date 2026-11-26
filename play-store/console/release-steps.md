# Langkah rilis: build, keystore, unggah, closed testing

## 1. Keystore upload (sekali saja)

Buat sendiri di terminal Anda. `keytool` akan menanyakan password; **ketik sendiri dan simpan di pengelola kata sandi**. Jangan dikirim ke chat dan jangan di-commit. Simpan juga cadangan berkas `.jks` di tempat terpisah. Kehilangan upload key bisa direset lewat dukungan Google, tetapi merepotkan.

```powershell
keytool -genkeypair -v -keystore D:\rahasia\musicplayer-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Lalu buat `app-android/android/keystore.properties` (sudah diabaikan git). **Tanpa password**: berkas ini hanya menyebut lokasi dan alias, jadi tidak ada rahasia di disk:

```properties
storeFile=D:/rahasia/musicplayer-upload.jks
keyAlias=upload
```

Password ditanyakan **saat build** (input tersembunyi, diperiksa langsung ke keystore) dan hanya diteruskan ke Gradle lewat variabel lingkungan proses itu. Untuk otomasi, set `MUSIK_STORE_PASSWORD` (dan `MUSIK_KEY_PASSWORD` bila berbeda) hanya untuk satu perintah. Bila Anda tetap ingin menyimpannya, `storePassword` dan `keyPassword` di berkas yang sama masih dibaca.

`storeFile` boleh jalur absolut. Aktifkan **Play App Signing** saat membuat aplikasi di Console (disarankan Google): kunci di atas hanyalah kunci unggah.

## 2. Build AAB bertanda tangan

```powershell
npm run android:play:aab
```

Skrip membangun web edisi Play, AAB release (R8 aktif), lalu menjalankan pemeriksaan kebersihan. Hasil: `app-android/android/app/build/outputs/bundle/playRelease/app-play-release.aab`. Tanpa `keystore.properties` AAB tidak bertanda tangan dan akan ditolak Play.

Naikkan versi sebelum tiap unggahan: ubah `version` di `package.json` (mis. `0.4.1`; `versionCode` = mayor x 10000 + minor x 100 + patch dan harus naik terus), tambahkan entri di `CHANGELOG-PLAY.md` dan `play-store/metadata/android/<locale>/changelogs/<versionCode>.txt`.

## 3. Uji di HP sebelum unggah

R8 belum diuji di perangkat. Pasang dan coba semua layar:

```powershell
npm run android:play:apk
```

Hasil: `app-android/android/app/build/outputs/apk/play/debug/app-play-debug.apk`. Periksa: Library, Musik di HP (izin dan folder), pemutaran dengan layar mati, tombol notifikasi, Cari, Setelan, Tentang. Pasang dengan `adb install -r`.

## 4. Play Console

1. Buat aplikasi: nama, bahasa utama Indonesia, aplikasi (bukan game), gratis.
2. **App content**: kebijakan privasi, iklan, akses aplikasi, rating konten, target audiens, Data safety, foreground service. Jawaban: file-file di folder `console/`.
3. **Store listing**: salin teks dan unggah gambar dari `metadata/android/id-ID/` (lalu `en-US/` untuk terjemahan). Kategori Musik & Audio. Email kontak dan situs `https://mitra247.com`.
4. Unggah AAB ke **Internal testing** dulu untuk memeriksa pemasangan.

## 5. Closed testing (wajib untuk akun personal baru)

- Minimal **12 tester** yang opt-in, aktif **14 hari berturut-turut**, sebelum bisa meminta akses produksi.
- Buat track Closed testing, tambahkan daftar email tester (akun Google mereka), bagikan tautan opt-in.
- Tester harus benar-benar menginstal dan membiarkan aplikasi terpasang selama 14 hari. Minta mereka membukanya sesekali.
- Siapkan jawaban pertanyaan Google saat mengajukan produksi: bagaimana pengujian dilakukan, umpan balik yang diterima, perbaikan yang dibuat.

| Tester | Email | Tanggal opt-in |
| ------ | ----- | -------------- |
| (isi)  |       |                |

## 6. Setelah disetujui

1. Ajukan **Production** dan pilih negara.
2. Tinjauan Google biasanya beberapa hari.
3. Pantau **Android Vitals** dan ulasan setelah rilis.
