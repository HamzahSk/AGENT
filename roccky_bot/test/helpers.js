// Deliberately synthetic configuration; tests never import config.js or auth state.
Object.assign(global, {
   ownerName: 'Test operator', ownerNumber: '10000000000', botName: 'Test bot', botNumber: '10000000001', footer: 'Test',
   databaseFilename: 'database.json', storeFilename: 'store.json', temporaryFolder: 'temp', authFolder: 'auth',
   pluginsFolder: './plugins', hotReload: false, defaultLimit: 25, requestTimeout: 30000, ffmpegTimeout: 1000, ffmpegConcurrency: 1,
   stickerPackPublisher: 'Test', stickerPackName: 'Test', localTimezone: 'Asia/Jakarta',
   botThumbnail: './media/Image/thumbnail.jpg', botMenuMusic: './media/Audio/menu.mp3', donateUrl: 'https://example.invalid',
   dataInterval: 30000, rssLimit: 1e9, dbFlushDebounce: 60000, interactiveMenuMode: 'auto'
})
export const deferred = () => {
   let resolve, reject
   const promise = new Promise((a, b) => { resolve = a; reject = b })
   return { promise, resolve, reject }
}
export const turn = () => new Promise(resolve => { setImmediate(resolve) })
export const fakeTimers = () => {
   let next = 0
   const timers = new Map()
   return { timers, setTimer(fn, ms) { const id = ++next; timers.set(id, { fn, ms }); return id }, clearTimer(id) { timers.delete(id) }, async fire(id = timers.keys().next().value) { const task = timers.get(id); timers.delete(id); await task?.fn(); await turn() } }
}
