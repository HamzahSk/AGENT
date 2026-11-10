import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvLine(line) {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!match) return null;

  let value = match[2];
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/\s+#.*$/, "").trim();
  }

  return [match[1], value.replace(/\\n/g, "\n")];
}

export function loadEnvFile(filePath = ".env") {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) return;

  for (const line of readFileSync(absolutePath, "utf8").split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (entry && process.env[entry[0]] === undefined) {
      process.env[entry[0]] = entry[1];
    }
  }
}

export function getConfig(overrides = {}) {
  loadEnvFile(overrides.envFile);

  return {
    apiKey:
      overrides.apiKey ??
      process.env.RO_LANG_API_KEY ??
      process.env.OPENAI_API_KEY,
    baseUrl:
      overrides.baseUrl ??
      process.env.RO_LANG_BASE_URL ??
      process.env.OPENAI_BASE_URL ??
      "https://api.openai.com/v1",
    model:
      overrides.model ??
      process.env.RO_LANG_MODEL ??
      process.env.OPENAI_MODEL ??
      "gpt-4.1-mini",
    apiMode:
      overrides.apiMode ??
      process.env.RO_LANG_API_MODE ??
      process.env.OPENAI_API_MODE ??
      "auto",
    timeoutMs: Number(
      overrides.timeoutMs ?? process.env.RO_LANG_TIMEOUT_MS ?? 60_000,
    ),
    mongodbUri:
      overrides.mongodbUri ??
      process.env.RO_LANG_MONGODB_URI ??
      process.env.MONGODB_URI,
    mongodbDatabase:
      overrides.mongodbDatabase ??
      process.env.RO_LANG_MONGODB_DB ??
      process.env.MONGODB_DB ??
      "ro_lang",
    mongodbCollection:
      overrides.mongodbCollection ??
      process.env.RO_LANG_MONGODB_COLLECTION ??
      process.env.MONGODB_COLLECTION ??
      "learners",
    memoryFile:
      overrides.memoryFile ??
      process.env.RO_LANG_MEMORY_FILE ??
      "./data/memory.json",
  };
}
