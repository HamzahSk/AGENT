import { normalizeLearner } from "./learner-model.js";

export class MongoMemoryStore {
  constructor({ uri, databaseName, collectionName }) {
    this.uri = uri;
    this.databaseName = databaseName;
    this.collectionName = collectionName;
  }

  async init() {
    let MongoClient;
    try {
      ({ MongoClient } = await import("mongodb"));
    } catch {
      throw new Error(
        "MongoDB is configured but the mongodb package is unavailable. Run npm install.",
      );
    }

    this.client = new MongoClient(this.uri);
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
    await this.client?.close();
  }
}
