import { loadDirectory } from '../DirectoryLoader.js'
import { Func } from '#func'
export * from './general.js'
export * from './text.js'
export * from './url.js'
export * from './size.js'
export * from './datetime.js'
export const Utils = {}
let loaded
export default function loadUtils() {
   return loaded ||= loadDirectory(import.meta.url, mod => { Object.assign(Utils, mod); Object.assign(Func, mod) }).then(() => Utils)
}
