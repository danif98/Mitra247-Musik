# Paket rilis Google Play (Music Player)

Semua bahan listing dan jawaban Play Console untuk edisi Play ada di folder ini. Kode edisi Play ada di repo yang sama (lihat `README-IT.md` bagian 3). Checklist status ada di [`docs/PLAYSTORE.md`](../docs/PLAYSTORE.md).

## Di mana semuanya disimpan

| Apa                                              | Lokasi                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Judul toko                                       | `play-store/metadata/android/<locale>/title.txt`                                                 |
| Deskripsi singkat (maks. 80 karakter)            | `play-store/metadata/android/<locale>/short_description.txt`                                     |
| Deskripsi lengkap (maks. 4000 karakter)          | `play-store/metadata/android/<locale>/full_description.txt`                                      |
| Catatan rilis ("What's new", maks. 500 karakter) | `play-store/metadata/android/<locale>/changelogs/<versionCode>.txt` (`400.txt` untuk 0.4.0)      |
| Ikon toko 512x512                                | `play-store/metadata/android/<locale>/images/icon.png`                                           |
| Feature graphic 1024x500                         | `play-store/metadata/android/<locale>/images/featureGraphic.jpg`                                 |
| Screenshot ponsel 1080x1920                      | `play-store/metadata/android/<locale>/images/phoneScreenshots/1_…5_*.jpg`                        |
| Jawaban Data safety                              | [`console/data-safety.md`](console/data-safety.md)                                               |
| Jawaban rating konten, target audiens, iklan     | [`console/content-rating.md`](console/content-rating.md)                                         |
| Deskripsi foreground service dan izin media      | [`console/permissions-and-foreground-service.md`](console/permissions-and-foreground-service.md) |
| Langkah build, keystore, unggah, closed testing  | [`console/release-steps.md`](console/release-steps.md)                                           |
| Teks kebijakan privasi                           | [`PRIVACYPOLICY.md`](../PRIVACYPOLICY.md) (akar repo)                                            |
| Skrip pembuat gambar listing                     | `scripts/play-listing.mjs` (`npm run play:listing`)                                              |

`<locale>` adalah `id-ID` (Indonesia, utama) dan `en-US` (Inggris). Strukturnya mengikuti format `fastlane supply` (`metadata/android/<locale>/…`), jadi bisa diunggah otomatis bila kelak memakai fastlane. Panjang karakter sudah dicek dan di bawah batas Play.

## Membuat ulang gambar

```powershell
npm run play:listing
```

Skrip membangun web edisi Play, mengisi lima lagu latihan buatan sendiri (tanpa musik berhak cipta), memotret layar pada 360x640 dengan skala 3 (hasil 1080x1920), membuat feature graphic, dan menyalin ikon, lalu menulis ke kedua `<locale>`. Jalankan ulang setelah tampilan aplikasi berubah.

Aturan Play yang sudah dipenuhi: screenshot dan feature graphic berformat JPEG tanpa alpha; ikon PNG 32-bit 512x512 (kurang dari 1 MB); rasio screenshot 9:16.

## Isi yang masih perlu dari pemilik

| Item                                         | Di mana                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Email kontak publik                          | `PRIVACYPOLICY.md` (`[ISI-EMAIL-KONTAK]`), `console/content-rating.md`, listing di Console              |
| HTTPS untuk `mitra247.com/kebijakan-privasi` | Hosting situs. Deskripsi toko sudah memakai alamat `https://`                                           |
| Keystore upload dan passwordnya              | Dibuat sendiri, lihat `console/release-steps.md`                                                        |
| Nama toko final                              | `title.txt` memakai "Music Player: Latihan Musik" agar lebih unik; ubah bila ingin hanya "Music Player" |
| Video demo foreground service                | `console/permissions-and-foreground-service.md`                                                         |
| 12 tester untuk closed testing               | `console/release-steps.md`                                                                              |

## Catatan kualitas yang ditemukan saat membuat screenshot

- Screenshot memakai UI berbahasa Indonesia untuk kedua locale (aplikasi hanya punya bahasa Indonesia). Listing Inggris tetap jujur: itu yang akan dilihat pengguna.
- Pada layar selebar 360 dp (umum di HP Android), kartu Tempo/Kunci dan baris preset tempo di tab Latihan sedikit melewati tepi panel (terlihat di `3_practice.jpg`). Perbaiki tata letak sebelum rilis bila ingin tampil rapi.
- Ikon masih sederhana (lingkaran biru dan tiga batang). Layak diganti desain final sebelum rilis publik.
