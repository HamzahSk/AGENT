**Role:** Senior WhatsApp Bot Developer & Protocol Specialist (Baileys)

**Konteks Masalah:** Sistem pesan AI (teks/Markdown) saat ini sudah berjalan dengan sempurna, jadi tidak perlu diubah. Tolong fokuskan analisismu 100% pada **sistem pengiriman pesan interaktif (Menu)**. 

Saat ini ada satu *bug*: semua *template* menu (kecuali menu yang pertama) selalu memunculkan error *"Pesan versi WhatsApp tidak didukung, silakan perbarui"* di perangkat pengguna. Padahal sebelumnya semua menu ini berfungsi normal.

**Tugasmu:**
Tolong bantu saya menganalisis dan memperbaiki masalah ini. Saya membebaskanmu untuk memikirkan pendekatan terbaik dan mengeksekusi solusinya, namun silakan gunakan poin-poin berikut sebagai arah analisismu:

1. **Analisis Komparatif:** Silakan cek dan bandingkan kode antara "Menu Pertama" (yang masih berhasil) dengan menu-menu lainnya yang memicu error. Cari tahu apa yang membuat WhatsApp menolak *payload* menu-menu tersebut.
2. **Riset Referensi (GitHub):** Lakukan investigasi mandiri di [GitHub Issues Baileys](https://github.com/WhiskeySockets/Baileys/issues). Coba telusuri diskusi terbaru mengenai *Interactive Message*, *Native Flow Message*, atau masalah *WhatsApp version not supported* akibat *deprecated buttons/lists*.
3. **Implementasi & Fallback:** Terapkan perbaikan kode berdasarkan temuanmu. Sebagai tambahan, tolong pikirkan dan buatkan juga mekanisme *fallback* yang aman (misal: otomatis menjadi menu teks biasa) agar ke depannya jika ada perubahan kebijakan UI dari WhatsApp, pengguna tetap bisa melihat menu.
