
import { Func } from '#func'
import axios from 'axios'

Func.getFileSize = async (url) => {
   try {
      const res = await axios.head(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const bytes = parseInt(res.headers['content-length'] || 0)
      return {
         bytes: bytes,
         size: Func.formatSize(bytes) // formatSize diekspor via namespace Utils (#utils)
      }
   } catch {
      try {
         const res = await axios.get(url, { responseType: 'stream', headers: { 'User-Agent': 'Mozilla/5.0' } })
         const bytes = parseInt(res.headers['content-length'] || 0)
         res.data.destroy()
         return {
            bytes: bytes,
            size: Func.formatSize(bytes)
         }
      } catch {
         return { bytes: 0, size: 'Unknown' }
      }
   }
}