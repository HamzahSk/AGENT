import { loadDirectory } from '../DirectoryLoader.js'
export const Func = {}
let loaded
export default function loadFunc() {
   return loaded ||= loadDirectory(import.meta.url).then(() => Func)
}
