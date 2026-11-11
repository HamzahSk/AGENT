Buat sebuah aplikasi Android bernama Ro-Lang, yaitu aplikasi belajar bahasa melalui cerita interaktif (story-based language learning).

Gunakan Kotlin, Jetpack Compose, dan Gradle Kotlin DSL. Buat aplikasi dengan desain modern, clean, intuitif, dan nyaman digunakan.

Fitur Utama

1. Story-Based Learning
   
   - Belajar bahasa melalui cerita pendek dan menarik.
   - Sediakan berbagai kategori cerita.
   - Setiap cerita memiliki tingkat kesulitan: Beginner (A1–A2), Intermediate (B1–B2), dan Advanced (C1–C2).
   - Tingkat kesulitan disesuaikan dengan kemampuan pengguna.

2. Word Translation
   
   - Setiap kata dalam cerita bisa ditekan untuk melihat terjemahannya.
   - Tampilkan arti kata, jenis kata, contoh penggunaan, dan penjelasan singkat.
   - Sediakan terjemahan per kalimat dan per kata.

3. Multilingual Support
   Sediakan tiga bahasa utama:
   
   - English
   - Indonesian
   - Filipino (Tagalog)
   
   Pengguna bisa memilih bahasa yang ingin dipelajari dan bahasa yang digunakan sebagai terjemahan.

4. Vocabulary Collection
   
   - Simpan kata baru ke daftar vocabulary.
   - Tampilkan arti dan contoh penggunaannya.
   - Kelompokkan berdasarkan cerita atau kategori.
   - Tandai kata yang sudah dikuasai.

5. Learning Review
   
   - Sistem pengulangan vocabulary menggunakan spaced repetition.
   - Quiz sederhana untuk menguji pemahaman.
   - Review kata-kata yang pernah dipelajari.
   - Statistik progres pembelajaran.

6. Offline Mode
   
   - Cerita dan vocabulary yang sudah tersedia bisa diakses tanpa internet.
   - Simpan data pembelajaran secara lokal.
   - Pastikan fitur utama tetap berfungsi tanpa koneksi internet.

Teknologi

- Kotlin
- Jetpack Compose
- Material 3
- Room Database untuk penyimpanan lokal.
- DataStore untuk preferensi pengguna.
- Navigation Compose.

UI/UX

- Buat desain modern dengan navigasi yang sederhana.
- Gunakan bottom navigation.
- Sediakan halaman Home, Stories, Vocabulary, Review, dan Profile.
- Buat reading experience yang nyaman dengan typography yang bagus.
- Tambahkan progress indicator dan animasi ringan.
- Pastikan tampilannya responsif dan konsisten.

Instruksi Pengembangan

- Periksa struktur project terlebih dahulu sebelum mulai mengembangkan.
- Buat arsitektur kode yang modular dan mudah dikembangkan.
- Jangan hanya membuat UI atau mockup. Implementasikan fitur agar benar-benar berfungsi.
- Sediakan beberapa cerita bawaan beserta terjemahan dan vocabulary-nya.
- Pastikan database lokal dan offline mode berfungsi.
- Hindari penggunaan API berbayar untuk fitur inti.
- Uji dan perbaiki error hingga project berhasil di-build.

Fokus pada aplikasi belajar bahasa yang benar-benar bisa digunakan, bukan sekadar tampilan demonstrasi.