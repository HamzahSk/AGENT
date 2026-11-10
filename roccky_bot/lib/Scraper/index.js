import { loadDirectory } from '../DirectoryLoader.js'
export const Scrap = {}
let loaded
export default function loadScrap() {
   return loaded ||= loadDirectory(import.meta.url).then(() => Scrap)
}
