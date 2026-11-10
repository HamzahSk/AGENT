# Project structure

```text
roccky_bot/
  index.js                 launcher and optional API server
  socket.js                WhatsApp worker initialization and shutdown
  config.js                private global compatibility configuration
  package.json, bun.lock   runtime scripts and locked dependencies
  ecosystem.config.cjs     PM2 process settings
  Dockerfile               Node/Bun/FFmpeg image recipe
  install.sh               platform installation helper
  DOCS_BAILEYS.md           original API/protocol reference (unchanged)
  lib/                     socket, state, queues, utilities and providers
  plugins/                 command and message-event modules
  agent/                   owner coding agent and tools
  ro-lang/                 language tutor, memory and rich components
  AI-SEERVER/              optional HTTP gateway and provider client
  media/                   bundled images/audio and quiz text datasets
  docs/                    technical documentation and audit report
  test/                    synthetic runtime/regression fixtures
  scripts/                 dependency-free syntax checker
```

Runtime auth directories, local database/store snapshots, pending markers, learning/agent memory, temporary downloads and logs are private operational state. They are not source artifacts. Paths are configurable; do not infer a safe deletion policy from their names. Dependencies under node_modules are generated from the lockfile.

## Runtime modules

| Module | Responsibility |
| --- | --- |
| Supervisor / ConnectionManager | Child process and single socket lifecycle |
| Runtime | Safe diagnostics, integer bounds, EventEmitter boundary, per-chat queue |
| Event / Listener / Serialize | Baileys subscriptions, command routing, message/identity normalization |
| SocketClient | Compatible send wrappers and per-socket helpers |
| Watcher / DirectoryLoader | Plugin indices and essential utility loading/watch cleanup |
| Database / SnapshotFile / Persistence / CloudDatabase | Maps, revision flush, atomic files, remote snapshot connections |
| Http / Request | Shared bounded fetches and API helper endpoints |
| MediaProcess / Function/FFMPEG | Bounded subprocess work and conversion wrappers |
| Constants | Schemas, time units, MIME/protocol constants and category metadata |
| Components/Maintenance | Autosave, retention, temp cleanup and sustained memory checks |
| Components/Scheduler | Premium/rental expiry |
| Components/SholatReminder | Prayer schedule fetching and notifications |
| Components/QuizFactory | Generated quiz handlers, locks, lazy datasets and timeout cleanup |
| Components/ErrorHandler / Dispatcher | Top-level failure behavior and HTTP connection pooling |
| Components/AntiSpam / Gemini / SightEngine | Specialized moderation/provider clients |
| Function, Utils, Utilities.js | Namespace loaders, pure helpers and compatibility exports |
| Scraper, Scraper.js | Provider integrations and compatibility exports |
| SessionBackup | Legacy backup helper retained; automatic connection recovery no longer invokes it |

Complete lib source files:

- [`lib/CloudDatabase.js`](../lib/CloudDatabase.js)
- [`lib/Components/AntiSpam.js`](../lib/Components/AntiSpam.js)
- [`lib/Components/Dispatcher.js`](../lib/Components/Dispatcher.js)
- [`lib/Components/ErrorHandler.js`](../lib/Components/ErrorHandler.js)
- [`lib/Components/Gemini.js`](../lib/Components/Gemini.js)
- [`lib/Components/Maintenance.js`](../lib/Components/Maintenance.js)
- [`lib/Components/QuizFactory.js`](../lib/Components/QuizFactory.js)
- [`lib/Components/Scheduler.js`](../lib/Components/Scheduler.js)
- [`lib/Components/SholatReminder.js`](../lib/Components/SholatReminder.js)
- [`lib/Components/SightEngine.js`](../lib/Components/SightEngine.js)
- [`lib/ConnectionManager.js`](../lib/ConnectionManager.js)
- [`lib/Constants.js`](../lib/Constants.js)
- [`lib/Database.js`](../lib/Database.js)
- [`lib/DirectoryLoader.js`](../lib/DirectoryLoader.js)
- [`lib/Event.js`](../lib/Event.js)
- [`lib/Function/FFMPEG.js`](../lib/Function/FFMPEG.js)
- [`lib/Function/Utilities.js`](../lib/Function/Utilities.js)
- [`lib/Function/dateTime.js`](../lib/Function/dateTime.js)
- [`lib/Function/getFileSize.js`](../lib/Function/getFileSize.js)
- [`lib/Function/index.js`](../lib/Function/index.js)
- [`lib/Function/isJid.js`](../lib/Function/isJid.js)
- [`lib/Function/isMime.js`](../lib/Function/isMime.js)
- [`lib/Function/markdown.js`](../lib/Function/markdown.js)
- [`lib/Function/message.js`](../lib/Function/message.js)
- [`lib/Function/toBanner.js`](../lib/Function/toBanner.js)
- [`lib/Function/waBaileys.js`](../lib/Function/waBaileys.js)
- [`lib/Http.js`](../lib/Http.js)
- [`lib/Listener.js`](../lib/Listener.js)
- [`lib/MediaProcess.js`](../lib/MediaProcess.js)
- [`lib/Persistence.js`](../lib/Persistence.js)
- [`lib/Request.js`](../lib/Request.js)
- [`lib/Runtime.js`](../lib/Runtime.js)
- [`lib/Scraper.js`](../lib/Scraper.js)
- [`lib/Scraper/SfileMobi.js`](../lib/Scraper/SfileMobi.js)
- [`lib/Scraper/_chatbot.js`](../lib/Scraper/_chatbot.js)
- [`lib/Scraper/aiedit.js`](../lib/Scraper/aiedit.js)
- [`lib/Scraper/aio.js`](../lib/Scraper/aio.js)
- [`lib/Scraper/freeai.js`](../lib/Scraper/freeai.js)
- [`lib/Scraper/index.js`](../lib/Scraper/index.js)
- [`lib/Scraper/komik-bbato.js`](../lib/Scraper/komik-bbato.js)
- [`lib/Scraper/reels.js`](../lib/Scraper/reels.js)
- [`lib/Scraper/savetik.js`](../lib/Scraper/savetik.js)
- [`lib/Scraper/search.js`](../lib/Scraper/search.js)
- [`lib/Scraper/uploader.js`](../lib/Scraper/uploader.js)
- [`lib/Scraper/vidsave.js`](../lib/Scraper/vidsave.js)
- [`lib/Serialize.js`](../lib/Serialize.js)
- [`lib/SessionBackup.js`](../lib/SessionBackup.js)
- [`lib/SnapshotFile.js`](../lib/SnapshotFile.js)
- [`lib/SocketClient.js`](../lib/SocketClient.js)
- [`lib/Supervisor.js`](../lib/Supervisor.js)
- [`lib/Utilities.js`](../lib/Utilities.js)
- [`lib/Utils/datetime.js`](../lib/Utils/datetime.js)
- [`lib/Utils/general.js`](../lib/Utils/general.js)
- [`lib/Utils/index.js`](../lib/Utils/index.js)
- [`lib/Utils/size.js`](../lib/Utils/size.js)
- [`lib/Utils/text.js`](../lib/Utils/text.js)
- [`lib/Utils/url.js`](../lib/Utils/url.js)
- [`lib/Watcher.js`](../lib/Watcher.js)

## Feature and subsystem locations

Every plugin file, generated command and its helper imports is listed in [FEATURES](FEATURES.md). Plugin folders cover admin tools, AI, download, exploration, groups, makers, owner/partner controls, tools and user information. File names beginning with `_` usually implement message events or registration; export shape determines actual behavior.

The owner agent has its own core orchestration, policy, provider, memory and WhatsApp adapter. RO-LANG contains configuration, tutor logic, learning memory, spaced repetition, JSON/Mongo stores and renderers. AI-SEERVER contains the Hono API, unofficial provider, streaming parser and bounded proof-of-work worker. Their original tests remain in their own test directories.

Complete subsystem source paths:

- [`AI-SEERVER/api/index.js`](../AI-SEERVER/api/index.js)
- [`AI-SEERVER/deepseek_apk.js`](../AI-SEERVER/deepseek_apk.js)
- [`AI-SEERVER/pow-worker.js`](../AI-SEERVER/pow-worker.js)
- [`AI-SEERVER/pow.js`](../AI-SEERVER/pow.js)
- [`agent/config.js`](../agent/config.js)
- [`agent/core/MemoryStore.js`](../agent/core/MemoryStore.js)
- [`agent/core/OpenAICompatibleProvider.js`](../agent/core/OpenAICompatibleProvider.js)
- [`agent/core/OwnerAgent.js`](../agent/core/OwnerAgent.js)
- [`agent/core/OwnerGuard.js`](../agent/core/OwnerGuard.js)
- [`agent/core/ToolRegistry.js`](../agent/core/ToolRegistry.js)
- [`agent/errors.js`](../agent/errors.js)
- [`agent/index.js`](../agent/index.js)
- [`agent/integrations/whatsapp.js`](../agent/integrations/whatsapp.js)
- [`agent/plugin.js`](../agent/plugin.js)
- [`agent/prompts/system.js`](../agent/prompts/system.js)
- [`agent/security/ProjectPolicy.js`](../agent/security/ProjectPolicy.js)
- [`agent/tools/bot.js`](../agent/tools/bot.js)
- [`agent/tools/filesystem.js`](../agent/tools/filesystem.js)
- [`agent/tools/helpers.js`](../agent/tools/helpers.js)
- [`agent/tools/index.js`](../agent/tools/index.js)
- [`agent/tools/network.js`](../agent/tools/network.js)
- [`agent/tools/process.js`](../agent/tools/process.js)
- [`agent/tools/project.js`](../agent/tools/project.js)
- [`agent/tools/workflow.js`](../agent/tools/workflow.js)
- [`ro-lang/src/cli.js`](../ro-lang/src/cli.js)
- [`ro-lang/src/config.js`](../ro-lang/src/config.js)
- [`ro-lang/src/curriculum.js`](../ro-lang/src/curriculum.js)
- [`ro-lang/src/index.js`](../ro-lang/src/index.js)
- [`ro-lang/src/language-tutor.js`](../ro-lang/src/language-tutor.js)
- [`ro-lang/src/learning-memory.js`](../ro-lang/src/learning-memory.js)
- [`ro-lang/src/memory/index.js`](../ro-lang/src/memory/index.js)
- [`ro-lang/src/memory/json-memory-store.js`](../ro-lang/src/memory/json-memory-store.js)
- [`ro-lang/src/memory/learner-model.js`](../ro-lang/src/memory/learner-model.js)
- [`ro-lang/src/memory/mongo-memory-store.js`](../ro-lang/src/memory/mongo-memory-store.js)
- [`ro-lang/src/openai-client.js`](../ro-lang/src/openai-client.js)
- [`ro-lang/src/rich-components.js`](../ro-lang/src/rich-components.js)
- [`ro-lang/src/spaced-repetition.js`](../ro-lang/src/spaced-repetition.js)
- [`ro-lang/src/structured-output.js`](../ro-lang/src/structured-output.js)
