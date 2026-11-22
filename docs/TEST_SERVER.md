# Uji manual di server nyata (M2)

Uji otomatis memakai yt-dlp palsu; bagian di bawah hanya bisa dibuktikan di server cPanel Anda. Jalankan berurutan. Jangan melakukan unduhan massal: pakai 2-3 video pendek (< 5 menit) milik Anda atau yang bebas.

Siapkan di terminal (PC atau server), token tidak ditempel ke riwayat bersama:

```bash
export API=https://domain-anda.com/musik-api
read -s -p "Token: " TOKEN; echo
```

## A. Dasar

| #   | Langkah                                                                                   | Hasil yang diharapkan                                                        | Hasil |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----- |
| 1   | `curl -s $API/api/health`                                                                 | `status:ok`, `configured:true`, `ytdlp` berisi versi (bukan null)            |       |
| 2   | `curl -s -o /dev/null -w "%{http_code}\n" $API/api/jobs/00000000000000000000000000000000` | `401`                                                                        |       |
| 3   | sama dengan header `-H "Authorization: Bearer $TOKEN"`                                    | `404`                                                                        |       |
| 4   | Setelan PWA: isi URL server + token, **Tes koneksi**                                      | "Terhubung. Token benar." + versi server dan yt-dlp                          |       |
| 5   | Token sengaja salah 5 kali berturut-turut (Tes koneksi)                                   | pesan "Token salah", lalu "Terlalu banyak percobaan..." (IP diblokir 15 mnt) |       |

(Setelah langkah 5 tunggu 15 menit atau restart server sebelum lanjut.)

## B. Konversi nyata

| #   | Langkah                                                              | Hasil yang diharapkan                                                  | Hasil |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----- |
| 6   | PWA -> YouTube: tempel URL satu video pendek, **Simpan sebagai MP3** | langkah: mengantre -> mengunduh -> mengonversi -> menyimpan -> selesai |       |
| 7   | Catat durasi dari tekan tombol sampai lagu muncul di Library         | < 60 detik untuk lagu 4 menit (PRD 7); catat angkanya                  |       |
| 8   | Putar lagu itu; ubah tempo/kunci                                     | berfungsi seperti lagu lokal; sumber tertulis "YouTube" di Library     |       |
| 9   | Buka log aplikasi di cPanel (atau `~/musik-deploy/stderr.log`)       | ada baris `job xxxxxxxx done`; **tidak ada** token atau URL lengkap    |       |
| 10  | Setelah 1 jam: `ls $DATA_DIR/jobs`                                   | folder job tadi sudah hilang                                           |       |
| 11  | Restart server, lalu `ls $DATA_DIR/jobs`                             | folder lama (> 1 jam) dibersihkan saat start                           |       |

## C. Beban dan batas (pertanyaan terbuka PRD 12)

| #   | Langkah                                                                                                                                                                                                                                                                              | Hasil yang diharapkan                                                                    | Hasil |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----- |
| 12  | Set `MAX_ACTIVE=2`, restart. Dari dua perangkat/tab (PWA tidak mengizinkan dua sekaligus dari satu UI), kirim dua URL hampir bersamaan lewat `curl -X POST $API/api/jobs -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"url":"https://youtu.be/<ID>"}'` | keduanya selesai tanpa proses dimatikan LVE; catat waktu masing-masing                   |       |
| 13  | Kirim 3 URL cepat (MAX_ACTIVE=1, MAX_QUEUE=1)                                                                                                                                                                                                                                        | satu berjalan, satu antre, yang ketiga `429 busy`                                        |       |
| 14  | Video > 20 menit                                                                                                                                                                                                                                                                     | status error `too_long`, PWA: "Video terlalu panjang"                                    |       |
| 15  | Video privat / dibatasi umur                                                                                                                                                                                                                                                         | error `unavailable`                                                                      |       |
| 16  | Cek `ps`/cPanel Resource Usage saat konversi                                                                                                                                                                                                                                         | catat CPU/RAM puncak; tidak ada "Resource limit reached"                                 |       |
| 17  | Ulangi 6 setelah memilih runtime JS yang lain (Node vs deno) bila `YTDLP_JS_RUNTIME` diubah                                                                                                                                                                                          | catat mana yang berhasil dan apakah ada peringatan "no JavaScript runtime" di log yt-dlp |       |

Catat hasil dan kirim ke sesi berikutnya. Bila YouTube memblokir IP server (`blocked`), cadangannya: ekstensi di desktop atau menjalankan layanan di PC rumah (PRD 6.7).
