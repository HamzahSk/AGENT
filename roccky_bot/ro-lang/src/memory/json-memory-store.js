import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { normalizeLearner } from "./learner-model.js";

export class JsonMemoryStore {
  constructor(filePath) {
    this.filePath = resolve(filePath);
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await mkdir(dirname(this.filePath), { recursive: true });
  }

  async readState() {
    try {
      const content = await readFile(this.filePath, "utf8");
      const state = JSON.parse(content);
      return state?.learners ? state : { learners: {} };
    } catch (error) {
      if (error.code === "ENOENT") return { learners: {} };
      throw new Error(`Unable to read memory file: ${error.message}`);
    }
  }

  async getLearner(userId) {
    await this.writeQueue;
    const state = await this.readState();
    return normalizeLearner(state.learners[userId]);
  }

  async saveLearner(learner) {
    const write = this.writeQueue.then(async () => {
      const state = await this.readState();
      state.learners[learner.id] = learner;

      const temporaryPath = `${this.filePath}.tmp-${process.pid}`;
      await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, this.filePath);
    });

    this.writeQueue = write.catch(() => {});
    await write;
    return learner;
  }

  async close() {
    await this.writeQueue;
  }
}
