// lib/Scraper.js — Compatibility re-export atas namespace `Scrap` (lib/Scraper/*).
//
// Fungsi scraper/fetcher eksternal kini terorganisir di dalam folder `lib/Scraper/`
// dan diekspor via alias `#scrap` (namespace `Scrap`). File ini tetap dipertahankan
// sebagai shim agar seluruh import lama berikut tetap berfungsi tanpa perubahan:
//   import { catbox, uguu, quax, ... } from '../../lib/Scraper.js'

export { catbox, uguu, quax } from './Scraper/uploader.js'
export { reelsvideo, tikwm } from './Scraper/reels.js'
export { meloboom, getStickerPack, stickerLy } from './Scraper/search.js'