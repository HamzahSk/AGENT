// lib/Utils/size.js — Utility format ukuran berkas

// ========== SIZE FORMATTER ==========
export const formatSize = (bytes) => {
   if (bytes < 1024) return bytes + ' B'
   if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB'
   if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB'
   if (bytes < 1024 ** 4) return (bytes / 1024 ** 3).toFixed(1) + ' GB'
   return (bytes / 1024 ** 4).toFixed(1) + ' TB'
}