#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { getConfig } from "./config.js";
import { LanguageTutor } from "./language-tutor.js";
import { LearningMemory } from "./learning-memory.js";
import { createMemoryStore } from "./memory/index.js";
import { OpenAICompatibleClient } from "./openai-client.js";

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith("--")) continue;

    const [rawKey, inlineValue] = argument.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const nextValue = rest[index + 1];

    if (inlineValue !== undefined) {
      options[key] = inlineValue;
    } else if (nextValue && !nextValue.startsWith("--")) {
      options[key] = nextValue;
      index += 1;
    } else {
      options[key] = true;
    }
  }

  return { command, options };
}

function printHelp() {
  console.log(`
ro-lang - AI personal language tutor

AI learning:
  node src/cli.js chat     [--target Japanese]
  node src/cli.js lesson   --target English [--topic "introductions"]
  node src/cli.js practice --target English [--focus grammar]
  node src/cli.js review   --target English --question "..." --answer "..."

Memory and progress:
  node src/cli.js profile      --user alice --goals "travel,work" --interests "music"
  node src/cli.js progress     --user alice
  node src/cli.js vocab-add    --user alice --word hello --translation halo [--list greetings]
  node src/cli.js vocab-list   --user alice [--list greetings] [--due]
  node src/cli.js vocab-review --user alice --word hello --quality 4

Common options:
  --user default
  --native Indonesian
  --level beginner
  --api-key YOUR_KEY
  --base-url https://api.openai.com/v1
  --model gpt-4.1-mini

MongoDB is used when MONGODB_URI is configured. Otherwise data is saved to
RO_LANG_MEMORY_FILE (default: ./data/memory.json).
`);
}

function learnerOptions(options, existingLearner) {
  return {
    userId: options.user ?? "default",
    targetLanguage:
      options.target ?? existingLearner?.profile.targetLanguage ?? "English",
    nativeLanguage:
      options.native ?? existingLearner?.profile.nativeLanguage ?? "Indonesian",
    level:
      options.level ?? existingLearner?.profile.declaredLevel ?? "beginner",
    goals: options.goals,
    interests: options.interests,
  };
}

function printProgress(summary) {
  if (!summary) {
    console.log("No learner profile found.");
    return;
  }

  const weaknesses = summary.progress.weaknesses
    .sort((left, right) => right.count - left.count)
    .slice(0, 5)
    .map((item) => `${item.name} (${item.count}x)`)
    .join(", ");
  const lists = Object.entries(summary.vocabulary.lists)
    .map(([name, count]) => `${name}: ${count}`)
    .join(", ");

  console.log([
    `Language: ${summary.profile.targetLanguage}`,
    `Estimated level: ${summary.profile.estimatedLevel}`,
    `Proficiency score: ${summary.progress.proficiencyScore}/100`,
    `Lessons: ${summary.progress.lessonsCompleted}`,
    `Practices: ${summary.progress.practicesCompleted}`,
    `Answers reviewed: ${summary.progress.answersReviewed}`,
    `Completed topics: ${summary.progress.completedTopics.join(", ") || "none"}`,
    `Weaknesses: ${weaknesses || "not enough evidence yet"}`,
    `Vocabulary: ${summary.vocabulary.total} total, ${summary.vocabulary.due} due, ${summary.vocabulary.mastered} mastered`,
    `Vocabulary lists: ${lists || "none"}`,
  ].join("\n"));
}

function printVocabulary(items) {
  if (items.length === 0) {
    console.log("No vocabulary items matched.");
    return;
  }

  for (const item of items) {
    console.log(
      `${item.word} — ${item.translation} [${item.list}] | next: ${item.nextReviewAt} | interval: ${item.intervalDays}d`,
    );
  }
}

async function runChat(tutor, options) {
  const reader = createInterface({ input, output });
  const history = [];

  const opening = await tutor.converse({
    ...options,
    event: "session_start",
  });
  console.log(`\nTutor: ${opening.reply}\n\nType /exit to stop.\n`);

  try {
    while (true) {
      const message = (await reader.question("You: ")).trim();
      if (!message || message === "/exit") break;

      const turn = await tutor.converse({
        ...options,
        history,
        message,
      });

      console.log(`\nTutor: ${turn.reply}\n`);
      history.push(
        { role: "user", content: message },
        { role: "assistant", content: turn.reply },
      );
    }
  } finally {
    reader.close();
  }
}

async function runMemoryCommand(command, options, memory, learningOptions) {
  await memory.initializeLearner(learningOptions);

  switch (command) {
    case "profile":
    case "progress":
      printProgress(await memory.getProgress(learningOptions.userId));
      return true;
    case "vocab-add": {
      const item = await memory.addVocabulary(learningOptions.userId, {
        word: options.word,
        translation: options.translation,
        example: options.example ?? "",
        list: options.list ?? "general",
        tags: options.tags?.split(",") ?? [],
      });
      console.log(`Saved "${item.word}". Next review: ${item.nextReviewAt}`);
      return true;
    }
    case "vocab-list":
      printVocabulary(
        await memory.listVocabulary(learningOptions.userId, {
          list: options.list,
          dueOnly: Boolean(options.due),
        }),
      );
      return true;
    case "vocab-review": {
      const item = await memory.reviewVocabulary(
        learningOptions.userId,
        options.word ?? "",
        options.quality,
      );
      console.log(
        `Reviewed "${item.word}". Next review: ${item.nextReviewAt} (${item.intervalDays} days).`,
      );
      return true;
    }
    default:
      return false;
  }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "help" || options.help) {
    printHelp();
    return;
  }

  const supportedCommands = new Set([
    "lesson",
    "practice",
    "review",
    "chat",
    "profile",
    "progress",
    "vocab-add",
    "vocab-list",
    "vocab-review",
  ]);
  if (!supportedCommands.has(command)) {
    throw new Error(`Unknown command: ${command}. Run with "help" for usage.`);
  }

  const config = getConfig(options);
  const store = await createMemoryStore(config);
  const memory = new LearningMemory(store);
  const userId = options.user ?? "default";
  const existingLearner = await memory.getLearner(userId);
  const learningOptions = learnerOptions(options, existingLearner);
  if (command === "chat" && !options.target && !existingLearner) {
    learningOptions.targetLanguage = "Undetermined";
  }

  try {
    if (await runMemoryCommand(command, options, memory, learningOptions)) return;

    const client = new OpenAICompatibleClient(config);
    const tutor = new LanguageTutor(client, { memory });
    let result;

    switch (command) {
      case "lesson":
        result = await tutor.createLesson({
          ...learningOptions,
          topic: options.topic,
        });
        break;
      case "practice":
        result = await tutor.createPractice({
          ...learningOptions,
          focus: options.focus ?? "mixed skills",
        });
        break;
      case "review":
        result = await tutor.reviewAnswer({
          ...learningOptions,
          question: options.question,
          answer: options.answer,
        });
        break;
      case "chat":
        await runChat(tutor, learningOptions);
        return;
    }

    console.log(result);
  } finally {
    await store.close();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
