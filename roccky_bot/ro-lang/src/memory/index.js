import { JsonMemoryStore } from "./json-memory-store.js";
import { MongoMemoryStore } from "./mongo-memory-store.js";

export async function createMemoryStore(config) {
  const store = config.mongodbUri
    ? new MongoMemoryStore({
        uri: config.mongodbUri,
        databaseName: config.mongodbDatabase,
        collectionName: config.mongodbCollection,
      })
    : new JsonMemoryStore(config.memoryFile);

  await store.init();
  return store;
}

export { JsonMemoryStore } from "./json-memory-store.js";
export { MongoMemoryStore } from "./mongo-memory-store.js";
