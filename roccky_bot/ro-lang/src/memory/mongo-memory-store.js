import { normalizeLearner } from "./learner-model.js";

export class MongoMemoryStore {
  constructor({ uri, databaseName, collectionName }) {
    this.uri = uri;
    this.databaseName = databaseName;
    this.collectionName = collectionName;
  }

  async init() {
    if (this.collection) return;
    if (this.initializing) return this.initializing;
    this.initializing = this.open().catch(async error => {
      await this.client?.close(); this.client = null; this.collection = null;
      throw error;
    }).finally(() => { this.initializing = null; });
    return this.initializing;
  }

  async open() {
    let MongoClient;
    try {
      ({ MongoClient } = await import("mongodb"));
    } catch {
      throw new Error(
        "MongoDB is configured but the mongodb package is unavailable. Run npm install.",
      );
    }

    this.client = new MongoClient(this.uri, { maxPoolSize: 2, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 10000, waitQueueTimeoutMS: 5000 });
    await this.client.connect();
    this.collection = this.client
      .db(this.databaseName)
      .collection(this.collectionName);
    await this.collection.createIndex({ updatedAt: -1 });
  }

  async getLearner(userId) {
    const document = await this.collection.findOne({ _id: userId });
    if (!document) return null;

    const { _id, ...learner } = document;
    return normalizeLearner({ id: _id, ...learner });
  }

  async saveLearner(learner) {
    const { id, ...document } = learner;
    await this.collection.updateOne(
      { _id: id },
      { $set: document },
      { upsert: true },
    );
    return learner;
  }

  async close() {
    if (this.initializing) await this.initializing.catch(() => {});
    await this.client?.close();
    this.collection = null; this.client = null;
  }
}
