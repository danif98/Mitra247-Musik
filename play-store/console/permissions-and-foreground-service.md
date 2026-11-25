# Izin dan layanan latar depan (Play Console: App content)

Teks untuk formulir deklarasi di Console. Console berbahasa Inggris, jadi teks isian ditulis dalam bahasa Inggris. **Pemilik akun yang mengisi dan mengirim.**

## 1. Foreground service: `mediaPlayback`

Manifest: `<service android:name=".PlaybackService" android:foregroundServiceType="mediaPlayback" />` dengan izin `FOREGROUND_SERVICE` dan `FOREGROUND_SERVICE_MEDIA_PLAYBACK`.

| Isian formulir                        | Jawaban                          |
| ------------------------------------- | -------------------------------- |
| Jenis foreground service yang dipakai | **Media playback**               |
| Dipakai di aplikasi apa saja          | Satu layanan (`PlaybackService`) |

**Deskripsi tugas (Task description):**

```
Music Player is a music player and practice tool. The user starts a song and the app keeps playing it while the screen is off or another app is in front, like any music player. The foreground service shows a media notification with the song title, artist, play/pause, previous, next and a seek bar, and registers a MediaSession so the lock screen and Bluetooth controls work. The service starts only when the user plays a song and stops shortly after playback stops, or when the user dismisses it. Without a foreground service Android would stop the audio as soon as the app leaves the screen, which would make the app unusable for practising along with a song.
```

**Dampak pada pengguna bila tugas tertunda atau dihentikan (User impact):**

```
Playback would stop when the screen turns off or the user switches apps. Musicians practise with the phone beside them and the screen off, so the music would cut out in the middle of a song and the user would have to unlock the phone to continue.
```

**Video demo** (wajib, tautan YouTube tidak terdaftar atau berkas yang diizinkan Console). Isi video, 30 sampai 60 detik:

1. Buka aplikasi, buka tab **Library**, putar satu lagu.
2. Tekan tombol daya (layar mati) dan tunjukkan lagu terus berjalan.
3. Nyalakan layar, tarik bilah notifikasi: tunjukkan notifikasi media dan tekan **Jeda** lalu **Putar**.
4. Kunci layar dan tunjukkan kontrol di layar kunci.
5. Geser aplikasi ke latar belakang, buka aplikasi lain, lagu tetap berjalan.
6. Tutup notifikasi atau tekan **Berhenti**: layanan berhenti.

Rekam dari perangkat nyata (`adb shell screenrecord` atau perekam layar bawaan). Simpan hasil di luar repo (berkas besar); catat tautannya di bawah.

| Tautan video | Tanggal rekam |
| ------------ | ------------- |
| (isi)        |               |

## 2. Izin `READ_MEDIA_AUDIO`

Izin ini **tidak** termasuk "photo and video permissions" yang memerlukan formulir khusus di Play Console; formulir itu berlaku untuk `READ_MEDIA_IMAGES` dan `READ_MEDIA_VIDEO`. Biasanya tidak ada isian untuk `READ_MEDIA_AUDIO`. Bila Console tetap menanyakan alasan, pakai teks ini:

```
Music Player lists and plays the audio files that are already on the user's phone (the "Music on phone" screen, by folder, including the SD card). It reads only audio files, through MediaStore, to show their title, artist and folder and to play them. File names, tags and content are used on the device only and are never uploaded. The permission is requested when the user opens "Music on phone". Without it the user can still add files one by one with the system file picker.
```

Di Android 12 ke bawah izin setara adalah `READ_EXTERNAL_STORAGE` (dibatasi `maxSdkVersion="32"` di manifest).

## 3. Izin lain (pembenaran singkat)

| Izin                                                      | Alasan                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `INTERNET`                                                | Layar Cari: mencari dan mengunduh musik berlisensi terbuka                 |
| `POST_NOTIFICATIONS`                                      | Notifikasi kontrol pemutaran (diminta saat lagu pertama diputar)           |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Pemutaran saat layar mati (bagian 1)                                       |
| `WAKE_LOCK`                                               | Menjaga CPU aktif saat memutar dan menerapkan efek audio dengan layar mati |

> **Perlu diperiksa:** pastikan `WAKE_LOCK` benar-benar dipakai (`PlaybackService` memegang wake lock parsial). Bila suatu saat tidak dipakai, hapus dari manifest.

## 3b. Login Google (versi 0.5.0)

Login dan Drive tidak menambah izin manifest (memakai `INTERNET` dan layanan Google Play). Cakupan OAuth `drive.appdata`, `email`, `profile` tidak sensitif, jadi tidak ada formulir verifikasi cakupan. Lihat `docs/GOOGLE_SSO.md`.

## 4. Pernyataan lain di Console

| Pernyataan                                                               | Jawaban                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------ |
| Aplikasi memuat atau mengunduh kode yang dapat dijalankan dari luar Play | **Tidak** (modul pribadi tidak ada di edisi ini) |
| Aplikasi dapat menginstal paket lain                                     | Tidak                                            |
| Akses semua file (`MANAGE_EXTERNAL_STORAGE`)                             | Tidak diminta                                    |
| Layanan aksesibilitas                                                    | Tidak                                            |
| Izin SMS / log panggilan                                                 | Tidak diminta                                    |
| Lokasi latar belakang                                                    | Tidak diminta                                    |
