import { positiveInt, reportError } from './Runtime.js'

// One lazy pool, one connection attempt at a time, and a shared retry cooldown.
// Reads and upserts are idempotent; failed operations are not blindly replayed.
export class CloudDatabase {
   constructor({ mongoFactory, postgresFactory, now = Date.now } = {}) {
      Object.assign(this, { mongoFactory, postgresFactory, now })
      this.connected = false
      this.url = ''
      this.client = null
      this.pending = null
      this.retryAt = 0
      this.failures = 0
      this.closed = false
   }
   get configured() { return !!this.url }
   async connect(url = this.url) {
      if (!url || this.closed) return false
      if (this.url && url !== this.url) throw new Error('Restart to change cloud database URL')
      this.url = url
      if (this.connected) return true
      if (this.pending) return this.pending
      if (this.now() < this.retryAt) return false
      this.pending = this.open().finally(() => { this.pending = null })
      return this.pending
   }
   async open() {
      try {
         await this.release()
         if (/^mongodb(?:\+srv)?:\/\//.test(this.url)) {
            this.type = 'mongodb'
            const factory = this.mongoFactory || (async (url, options) => {
               const { MongoClient } = await import('mongodb')
               return new MongoClient(url, options)
            })
            this.client = await factory(this.url, {
               maxPoolSize: positiveInt(global.databasePoolSize, 2, 10), minPoolSize: 0,
               serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 10000,
               waitQueueTimeoutMS: 5000, timeoutMS: 10000
            })
            await this.client.connect()
            this.collection = this.client.db(global.databaseName || 'roccky').collection('roccky_data')
            // _id already has a unique index. A ping verifies connectivity without DDL.
            await this.client.db(global.databaseName || 'roccky').command({ ping: 1 })
         } else if (/^postgres(?:ql)?:\/\//.test(this.url)) {
            this.type = 'postgres'
            const factory = this.postgresFactory || (async options => {
               const { default: pg } = await import('pg')
               return new pg.Pool(options)
            })
            this.client = await factory({
               connectionString: this.url,
               ...(global.databaseSSL === undefined ? {} : { ssl: global.databaseSSL }),
               max: positiveInt(global.databasePoolSize, 2, 10), idleTimeoutMillis: 30000,
               connectionTimeoutMillis: 5000, query_timeout: 10000, statement_timeout: 10000
            })
            this.client.on('error', error => this.failed(error))
            await this.client.query('CREATE TABLE IF NOT EXISTS roccky_data (file_key TEXT PRIMARY KEY, json_data TEXT, updated_at BIGINT)')
            await this.client.query('ALTER TABLE roccky_data ADD COLUMN IF NOT EXISTS updated_at BIGINT')
         } else throw new Error('Unsupported cloud database scheme')
         this.connected = true
         this.failures = 0
         this.retryAt = 0
         console.log(`[Database] ${this.type} connected`)
         return true
      } catch (error) {
         this.failed(error)
         await this.release()
         return false
      }
   }
   failed(error) {
      this.connected = false
      this.retryAt = this.now() + Math.min(300000, 5000 * 2 ** Math.min(this.failures++, 6))
      reportError('Cloud database; local persistence retained, retry delayed', error)
   }
   async operation(run) {
      if (!this.connected) {
         const error = new Error('Cloud database unavailable')
         error.code = 'CLOUD_UNAVAILABLE'
         throw error
      }
      try { return await run() }
      catch (error) { this.failed(error); throw error }
   }
   read(key) {
      return this.operation(async () => {
         if (this.type === 'mongodb') return (await this.collection.findOne({ _id: key }))?.json_data ?? null
         return (await this.client.query('SELECT json_data FROM roccky_data WHERE file_key = $1', [key])).rows[0]?.json_data ?? null
      })
   }
   write(key, json) {
      return this.operation(async () => {
         if (this.type === 'mongodb') await this.collection.updateOne({ _id: key }, { $set: { json_data: json, updated_at: this.now() } }, { upsert: true })
         else await this.client.query('INSERT INTO roccky_data (file_key, json_data, updated_at) VALUES ($1, $2, $3) ON CONFLICT (file_key) DO UPDATE SET json_data = EXCLUDED.json_data, updated_at = EXCLUDED.updated_at', [key, json, this.now()])
      })
   }
   async release() {
      const client = this.client
      this.client = this.collection = null
      if (client) {
         try { if (this.type === 'mongodb') await client.close(); else await client.end() }
         catch (error) { reportError('Cloud pool close', error) }
      }
   }
   async close() {
      this.closed = true
      if (this.pending) await this.pending
      this.connected = false
      await this.release()
   }
}

export const cloudDatabase = new CloudDatabase()
