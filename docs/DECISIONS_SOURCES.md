# Keputusan: cari dan unduh dari sumber legal (0.2.0)

Permintaan: fitur pencarian dan unduh dari sumber yang sah untuk diunduh. Tab **Cari** di PWA.

## Pilihan arsitektur: langsung dari browser, tanpa server

Diuji pada 2026-11-23 dari origin `https://musik.mitra247.com` (browser pane):

| Sumber            | Pencarian (CORS)                                                  | Berkas audio (CORS, Range)                                           |
| ----------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Internet Archive  | `advancedsearch.php` dan `metadata/<id>` terbuka; tanpa kunci API | `archive.org/download/...` dialihkan ke `*.archive.org`, 206 terbuka |
| Openverse         | `api.openverse.org/v1/audio/` anonim, terbuka                     | CDN asal (mis. Freesound) terbuka; host lain **bisa** menolak CORS   |
| Wikimedia Commons | `commons.wikimedia.org/w/api.php` dengan `origin=*`               | `upload.wikimedia.org` terbuka                                       |

Karena ketiganya mengizinkan CORS, tidak perlu proxy di server. Ini menghindari SSRF di server dan tidak menambah beban cPanel. Server YouTube tetap tidak berubah (URL tetap dibangun dari ID video).

Konsekuensi: bila satu host berkas menolak CORS (terutama hasil Openverse dari penyedia lain), unduhan gagal dengan pesan jelas dan tautan "Buka halaman sumber" tetap ada; berkasnya bisa diimpor manual lewat Library.

## Sumber yang tidak dipakai

- **Jamendo langsung**: butuh `client_id`; sudah ikut lewat Openverse.
- **Free Music Archive**: API ditutup / butuh kunci.
- **Bandcamp, SoundCloud**: tidak ada API publik untuk unduhan sah; hanya jalur resmi artis.

## Aturan lisensi (`core/sources/license.ts`)

- Hanya CC (BY, BY-SA, BY-NC, BY-ND, BY-NC-SA, BY-NC-ND), CC0, dan domain publik.
- Tidak dikenali, kosong, atau "all rights reserved" = **hasil dibuang**, tidak ditebak.
- NC dan ND ditandai di daftar; unduhan tetap boleh untuk latihan pribadi. Membagikan ulang tunduk pada syarat lisensi, dan atribusi disimpan di Library (`SongMeta.credit`; `attributionLine()` membuat teksnya).

## Detail per sumber

- **Internet Archive**: query `(kata) AND mediatype:audio AND licenseurl:* AND -collection:(librivoxaudio OR audio_bookspoetry OR podcasts)`; karakter khusus Lucene diganti spasi. Hasil adalah item (album); berkasnya dimuat saat dibuka: MP3 terbaik, lalu Ogg Vorbis, lalu MP3 64 kbps; maks 100 berkas.
- **Openverse**: `category=music`; hanya URL https dan lisensi dikenali. Catatan: beberapa hasil Freesound adalah _preview_ (hq), bukan berkas asli.
- **Wikimedia Commons**: `filetype:audio`, namespace berkas, lisensi dari `LicenseUrl` lalu `LicenseShortName`; nama pencipta dibersihkan dari HTML.

## Unduhan (`core/sources/download.ts`)

Hanya https, tipe isi audio (atau `octet-stream` dengan tipe cadangan dari sumber), batas 200 MB (dicek dari header dan saat streaming), progres, nama berkas aman. Hasil disimpan dengan `LibraryStore.add(file, 'web', { title, credit })`.

## Mode pencarian, urutan, dan tahun rilis (0.2.1)

Mode: **Semua** (default), **Judul**, **Artis**. Mengganti mode saat sudah ada hasil mengulang pencarian.

| Sumber            | Judul                                       | Artis                                                                                         | Tahun rilis                                                         |
| ----------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Internet Archive  | `title:(kata)`                              | `creator:(kata)`                                                                              | `year`, bila kosong tahun dari `date`                               |
| Openverse         | parameter `title`                           | parameter `creator`                                                                           | **tidak ada** (hanya `indexed_on`, itu bukan tahun rilis)           |
| Wikimedia Commons | tiap kata `intitle:` (semua kata harus ada) | tidak ada kolom khusus: teks penuh, lalu **disaring** di sisi aplikasi pada metadata `Artist` | tahun pertama di `DateTimeOriginal` (teks bebas, mis. "circa 1935") |

Diverifikasi ke API nyata pada 2026-11-23: `title=` dan `creator=` Openverse menyaring hasil; `title:` dan `creator:` Internet Archive jalan; `year` Internet Archive kadang kosong.

Catatan mode Artis di Commons: karena disaring setelah pencarian, satu halaman bisa menyusut atau kosong walau masih ada halaman berikutnya ("Muat lagi" tetap tersedia).

**Urutan** (`core/sources/sort.ts`): Relevansi (bergiliran antar sumber, urutan tiap sumber dipertahankan), Nama artis, Judul lagu, Ukuran, Tahun rilis, dengan tombol arah naik / turun. Arah awal: A-Z untuk teks, terbesar / terbaru dulu untuk angka. Nilai tidak diketahui (artis kosong, ukuran atau tahun null) **selalu di akhir**, apa pun arahnya. Urutan berlaku untuk hasil yang sudah dimuat, bukan seluruh hasil di sumber. Hasil ketiga sumber ditampilkan dalam **satu daftar** dengan label sumber di tiap baris.

**Tombol**: Lihat lagu (daftar), Unduh (panah turun), dan Putar (segitiga) berupa ikon dengan `aria-label` dan `title`.

## Catatan Jamendo

Jamendo tidak dipakai langsung (API-nya butuh `client_id`); hasilnya datang lewat Openverse, dengan `provider: jamendo` dan berkas MP3 di `prod-1.storage.jamendo.com`.

Temuan 2026-11-23:

- Di PC ini (browser pane, origin `https://musik.mitra247.com`), dari 20 hasil Jamendo untuk "piano" sekitar sepertiga **gagal** diambil: `fetch` melempar "Failed to fetch" (tanpa header CORS pada jawabannya), baik dengan maupun tanpa header `Range`, dan hasilnya tetap sama saat diulang. Satu contoh yang gagal: "Old Movie Ragtime Piano".
- Berkas yang sama, "Old Movie Ragtime Piano", **berhasil diunduh di Samsung A23**. Jadi kegagalan bergantung pada jaringan, lokasi, atau backend yang melayani, bukan batas tetap per berkas.
- Hasil yang berhasil: `206 audio/mpeg`, `content-length` 2-15 MB.

Keputusan:

- Tidak ada pemeriksaan awal atau penyembunyian hasil Jamendo; itu menambah satu permintaan per hasil dan hasilnya berbeda per perangkat.
- Bila gagal, aplikasi menampilkan pesan dan tautan **Buka halaman sumber** (halaman album Jamendo) tetap ada; berkas bisa diunduh manual lalu diimpor lewat Library.
- Lisensi hasil Jamendo di Openverse sering CC BY-NC-ND / BY-NC-SA: aman untuk latihan pribadi, tetapi ditandai "Non-komersial" dan "Tanpa turunan" di daftar.

## Simulasi: "Dear Jessie" oleh Madonna (2026-11-23)

Dijalankan di PWA (`http://localhost:5173/`) dan dicocokkan dengan API nyata. **Tidak ditemukan, dan itu benar.**

- Lagu itu (Madonna, 1989) berhak cipta komersial. Ketiga sumber hanya memuat karya yang dilisensikan terbuka oleh penciptanya; label besar tidak merilis lewat sumber ini.
- Internet Archive hanya punya satu item berjudul "Dear Jessie": `Rollergirl - Dear Jessie [CD RIP/WAV]` (cover grup lain, bukan Madonna). Item itu **tidak punya `licenseurl`**, jadi disembunyikan oleh aturan lisensi. Openverse dan Commons memberi 0 hasil untuk judul itu.
- Mode Judul "dear jessie" = 0 hasil di ketiga sumber; mode Artis "madonna" = 14 (Archive) + 12 (Openverse, grup "Madonna del Pettoruto", bukan Madonna penyanyi) + 0 (Commons).

**Peringatan penting: lisensi di sumber adalah klaim pengunggah, tidak diverifikasi.** Beberapa pengunggah Internet Archive menandai rip CD Madonna sebagai **CC0** (mis. "Madonna - Give It 2 Me", "Madonna - American Life (Instrumental Version)"). Itu hampir pasti salah label, dan aplikasi menampilkannya sebagai berlisensi terbuka karena membaca metadata apa adanya. Mitigasi saat ini: teks peringatan di layar Cari dan di sini. Tidak ada cara otomatis yang andal untuk membedakannya. Bila ingin lebih ketat, opsi: sembunyikan item Internet Archive yang tidak dari koleksi netlabel / musik terkurasi (mengurangi hasil sah), atau tandai "klaim pengunggah" di tiap baris Archive.

Temuan lain dari simulasi, sudah diperbaiki di 0.2.2:

- Openverse mengirim teks ber-entitas HTML ("John Dada &amp; the Weathermen"); kini didekode.
- Internet Archive memakai OR antar kata, sehingga "dear jessie madonna" mengembalikan item tak relevan; kini AND antar kata.
- Openverse `title=` / `creator=` mencocokkan longgar; di mode Judul / Artis hasil kini disaring agar judul / artis benar-benar memuat semua kata (aksen diabaikan).
- Mode Semua masih longgar: kata bisa cocok di deskripsi atau tag, jadi sebagian hasil terlihat tak relevan (mis. satu koleksi besar jazz untuk "dear jessie madonna").

## Pengujian

- `core/sources/sources.test.ts`: 32 uji dengan `fetch` palsu (lisensi, tiap sumber, mode pencarian, tahun, pengurutan, entitas HTML, penyaringan judul / artis, kegagalan sebagian, unduhan, batas ukuran, atribusi).
- `e2e/search.mjs`: 30 pemeriksaan di Chromium dengan jaringan di-mock (daftar gabungan, hasil tanpa lisensi disembunyikan, album, unduh, kredit tersimpan, putar, lisensi di Library, mode Judul / Artis, semua urutan dan arah, tahun, tombol ikon, satu sumber gagal, chip sumber).
- Verifikasi nyata ke tiga API: manual di browser pane (pencarian dan unduhan 1 KB per sumber lewat Range).

## Belum teruji

- Unduhan penuh dari tiap sumber nyata pada A23 (ukuran besar, jaringan seluler).
- Openverse dengan penyedia selain Freesound / Wikimedia (CORS bisa berbeda; lihat Catatan Jamendo).
- Urutan Tahun rilis di A23 dengan data nyata (banyak hasil tanpa tahun).
- Batas laju anonim ketiga API pada pemakaian berat.
