# Configuration reference

## Sources and precedence

`config.js` assigns globals at worker startup. It remains the compatibility source for existing plugins. Configure identities, provider credentials and paths privately. The core database environment override is `ROCCKY_DATABASE_URL ?? global.databaseUrl`; an empty environment value disables cloud for that process. Most other globals do not automatically read same-named environment variables.

The launcher reads gateway flags/host/port from the environment. Agent and RO-LANG configuration can load `.env` with existing environment values taking precedence; runtime override objects have the highest priority. The core config file is not a credential template and must not be copied into reports or image layers.

The following table covers every top-level field in the existing config file. Identity, credential, URL and general string values are deliberately not reproduced. Numeric/boolean defaults and non-private paths are shown where useful.

| Global field | Existing default/value | Purpose |
| --- | --- | --- |
| `ownerName` | Operator value (not reproduced) | Owner display name. |
| `ownerNumber` | Operator value (not reproduced) | Exact owner international phone digits; private configuration. |
| `botName` | Operator value (not reproduced) | Bot display/branding name. |
| `footer` | Operator value (not reproduced) | Outgoing message footer. |
| `botNumber` | Operator value (not reproduced) | International phone digits used for pairing. |
| `pairingCode` | false | Choose pairing code instead of QR; requires a private terminal. |
| `defaultLimit` | 25 | Initial/reset user limit. |
| `stickerPackName` | Operator value (not reproduced) | Sticker metadata pack label. |
| `stickerPackPublisher` | Operator value (not reproduced) | Sticker metadata publisher label. |
| `freeTheAi` | Operator value (not reproduced) | Optional Free AI provider credential/configuration. |
| `googleApiKey` | Operator value (not reproduced) | Optional Gemini provider credential. |
| `groqApiKeys` | Operator value (not reproduced) | Optional Groq provider credential list. |
| `logFlareApi` | Operator value (not reproduced) | Optional provider/log-service credential. |
| `apiUser` | Operator value (not reproduced) | Optional SightEngine provider identity. |
| `apiSecret` | Operator value (not reproduced) | Optional SightEngine provider credential. |
| `localTimezone` | `Asia/Jakarta` | Timezone used by date utilities and prayer reminders. |
| `botThumbnail` | Operator value (not reproduced) | Local/remote branding image; keep reachable within media caps. |
| `botMenuMusic` | Operator value (not reproduced) | Menu audio source. |
| `temporaryFolder` | `temp` | Owned temporary media directory. |
| `pluginsFolder` | `plugins` | Plugin discovery root. |
| `authFolder` | `session` | Persistent Baileys multifile auth directory. |
| `storeFilename` | Operator value (not reproduced) | Local Store snapshot; retain its pending marker. |
| `saluranName` | Operator value (not reproduced) | Newsletter display configuration. |
| `saluranJid` | Operator value (not reproduced) | Newsletter identity; keep privately configured. |
| `donateUrl` | Operator value (not reproduced) | Donation destination used by credits. |
| `databaseName` | Operator value (not reproduced) | Mongo database name; default fallback in driver is roccky. |
| `databaseUrl` | Operator value (not reproduced) | Core Mongo/PostgreSQL connection string; ROCCKY_DATABASE_URL takes precedence. |
| `proxyUrl` | Operator value (not reproduced) | Optional existing proxy configuration; provider support varies. |
| `databaseFilename` | Operator value (not reproduced) | Local user/group/settings snapshot; retain its pending marker. |
| `temporaryFileInterval` | `1_000 * 60 * 30` | Temporary-directory maintenance interval in milliseconds. |
| `sessionFileMaxAge` | `60 * 60 * 1000` | Legacy setting retained for compatibility; age-based auth deletion is disabled. |
| `sessionCleanInterval` | `30 * 60 * 1000` | Legacy setting retained for compatibility; session cleanup is disabled. |
| `dataInterval` | `1_000 * 60` | Autosave, cloud recovery, Store pruning and RSS sample interval. |
| `dbFlushDebounce` | 5000 | Dirty-write coalescing delay in milliseconds. |
| `storeMessageRetention` | `2 * 24 * 60 * 60 * 1000` | Stored message retention in milliseconds. |
| `storeMaxMessagesPerChat` | 50 | Per-chat retained message count. |
| `storeMaxTotalMessages` | 8000 | Global message cap, enforced by periodic pruning. |
| `storeMaxContacts` | 4000 | Contact cap, enforced by pruning. |
| `gcInterval` | `1_000 * 60 * 60` | Optional exposed-GC interval in milliseconds. |
| `requestTimeout` | `1_000 * 60 * 1.5` | Shared request/download time budget in milliseconds. |
| `ffmpegTimeout` | `1_000 * 60` | Media process runtime limit in milliseconds. |
| `minDelay` | 100 | Minimum optional send delay. |
| `maxDelay` | `1_000 * 3` | Maximum optional send delay. |
| `ignoreOldMessageTS` | 30 | Existing old-message configuration; Event also filters notify messages older than five minutes. |
| `rssLimit` | `1_024 * 1_024 * 768` | Resident-memory threshold in bytes; requires three consecutive high samples. |
| `ffmpegConcurrency` | 1 | Media concurrency; repaired default one, runtime maximum four. |
| `maxNSFWScore` | 0.75 | Existing image moderation threshold. |
| `maxHistoryChatSize` | 20 | Existing chatbot history bound. |
| `ExploreSession` | Operator value (not reproduced) | Existing exploration-session TTL cache configured at startup. |

## Optional runtime overrides

These are read by runtime code even if absent from the existing config file. Add them to your private global configuration only when needed.

| Global | Default | Purpose |
| --- | --- | --- |
| `hotReload` | `false` | Development plugin/utility watchers |
| `interactiveMenuMode` | automatic rich send | Set `text` to bypass helper-based interactive payloads |
| `messageConcurrency` | `2`, max `8` | Concurrent chat jobs |
| `messageQueueLimit` | `100`, max `1000` | Pending chat jobs |
| `databasePoolSize` | `2`, max `10` | Core driver pool size |
| `databaseSSL` | driver/URL settings | Explicit PostgreSQL TLS override; do not disable certificate validation casually |
| `dbFlushRetryMs` | `30000` | Delay after local flush failure |
| `storeMaxGroups` | `1000` | Metadata cache cap |
| `maxDownloadBytes` | `33554432` | Shared download/buffer/file cap (32 MiB) |
| `interactiveMediaMaxBytes` | `8388608` | Interactive URL header cap (8 MiB) |
| `mediaQueueLimit` | `8` | Waiting FFmpeg jobs |
| `ffmpegThreads` | `1`, max `4` | Threads per FFmpeg process |
| `antiCall`, `blockIfCall` | unset | Global call rejection/block branch; persistent rejectCall also applies |
| `autoNewsletters`, `autoGroups` | unset | Optional post-connect auto-follow/join lists; private identifiers |

Positive-integer runtime bounds fall back to safe defaults for invalid/negative values. Units are milliseconds unless labelled bytes/count. There is no Redis, remote queue or new service configuration.

## Environment inputs

| Variable/group | Default/precedence and purpose |
| --- | --- |
| `ROCCKY_AI_SERVER` | Enabled unless exactly `false`; controls launcher gateway |
| `AI_SERVER_HOST`, `HOST` | Launcher uses first available, otherwise `0.0.0.0` |
| `AI_SERVER_PORT`, `PORT` | Launcher uses first available, otherwise `8080`; standalone API uses PORT or 3000 |
| `ROCCKY_DATABASE_URL` | Overrides core databaseUrl; secret connection string |
| `DEEPSEEK_KEYS`, `DEEPSEEK_TOKEN` | Comma-separated provider credentials, first variable takes precedence |
| `DEEPSEEK_REQUEST_TIMEOUT_MS`, `DEEPSEEK_STREAM_IDLE_TIMEOUT_MS` | Provider request/SSE idle bounds; see deepseek_apk.js constructor |
| `MAX_SESSIONS` | `50`, validated positive, max 1000 |
| `MAX_RESPONSE_IDS` | `1000`, validated positive, max 10000 |
| `RO_LANG_API_KEY`, `OPENAI_API_KEY` | Tutor provider credentials, RO_LANG value first |
| `RO_LANG_BASE_URL`, `OPENAI_BASE_URL` | Compatible provider base, default https://api.openai.com/v1 |
| `RO_LANG_MODEL`, `OPENAI_MODEL` | Tutor model; existing code default gpt-4.1-mini |
| `RO_LANG_API_MODE`, `OPENAI_API_MODE` | Existing mode auto, chat completions or responses support |
| `RO_LANG_TIMEOUT_MS` | `60000` |
| `RO_LANG_MONGODB_URI`, `MONGODB_URI` | Separate tutor Mongo store URI; optional |
| `RO_LANG_MONGODB_DB`, `MONGODB_DB` | Tutor database, default ro_lang |
| `RO_LANG_MONGODB_COLLECTION`, `MONGODB_COLLECTION` | Tutor collection, default learners |
| `RO_LANG_MEMORY_FILE` | JSON fallback path, default ./data/memory.json; plugin may override location |
| `AGENT_API_KEY`, `AGENT_BASE_URL`, `AGENT_MODEL`, `AGENT_API_MODE` | Owner-agent overrides; otherwise shared RO-LANG settings |
| `AGENT_PROVIDER_TIMEOUT_MS` | Shared tutor timeout or 60000 |
| `AGENT_MAX_TOOL_ROUNDS` | `12` |
| `AGENT_MAX_HISTORY` | `30` messages |
| `AGENT_MAX_RESPONSE_LENGTH` | `14000` characters |
| `AGENT_COMMAND_TIMEOUT_MS` | `120000` |
| `AGENT_FETCH_TIMEOUT_MS` | `30000` |
| `AGENT_FETCH_MAX_BYTES` | `1500000` |
| `AGENT_MESSAGE_STYLE` | Existing adapter output style override; see agent/adapters/WhatsAppAdapter.js |
| `GROQ_API_KEYS` | Optional provider credential list for relevant scraper |
| `NODE_ENV`, `TZ`, `PATH` | Runtime mode, operating timezone and executable lookup; supplied by deployment |

Exact environment references (names and source locations only):

- `AGENT_API_KEY` — `agent/config.js`
- `AGENT_API_MODE` — `agent/config.js`
- `AGENT_BASE_URL` — `agent/config.js`
- `AGENT_COMMAND_TIMEOUT_MS` — `agent/config.js`
- `AGENT_FETCH_MAX_BYTES` — `agent/config.js`
- `AGENT_FETCH_TIMEOUT_MS` — `agent/config.js`
- `AGENT_MAX_HISTORY` — `agent/config.js`
- `AGENT_MAX_RESPONSE_LENGTH` — `agent/config.js`
- `AGENT_MAX_TOOL_ROUNDS` — `agent/config.js`
- `AGENT_MESSAGE_STYLE` — `plugins/ai/_chatbot-agent.js`
- `AGENT_MODEL` — `agent/config.js`
- `AGENT_PROVIDER_TIMEOUT_MS` — `agent/config.js`
- `AI_SERVER_HOST` — `index.js`
- `AI_SERVER_PORT` — `index.js`
- `DEEPSEEK_KEYS` — `AI-SEERVER/api/index.js`
- `DEEPSEEK_REQUEST_TIMEOUT_MS` — `AI-SEERVER/deepseek_apk.js`
- `DEEPSEEK_STREAM_IDLE_TIMEOUT_MS` — `AI-SEERVER/deepseek_apk.js`
- `DEEPSEEK_TOKEN` — `AI-SEERVER/api/index.js`, `AI-SEERVER/deepseek_apk.js`
- `GROQ_API_KEYS` — `lib/Scraper/_chatbot.js`, `plugins/ai/_chatbot.js`
- `HOST` — `AI-SEERVER/api/index.js`, `index.js`
- `MAX_RESPONSE_IDS` — `AI-SEERVER/api/index.js`
- `MAX_SESSIONS` — `AI-SEERVER/api/index.js`
- `MONGODB_COLLECTION` — `ro-lang/src/config.js`
- `MONGODB_DB` — `ro-lang/src/config.js`
- `MONGODB_URI` — `ro-lang/src/config.js`
- `NODE_ENV` — `agent/tools/process.js`
- `OPENAI_API_KEY` — `ro-lang/src/config.js`
- `OPENAI_API_MODE` — `ro-lang/src/config.js`
- `OPENAI_BASE_URL` — `ro-lang/src/config.js`
- `OPENAI_MODEL` — `ro-lang/src/config.js`
- `PATH` — `agent/tools/process.js`
- `PORT` — `AI-SEERVER/api/index.js`, `index.js`
- `ROCCKY_AI_SERVER` — `index.js`
- `ROCCKY_DATABASE_URL` — `lib/Components/Maintenance.js`, `socket.js`
- `RO_LANG_API_KEY` — `ro-lang/src/config.js`
- `RO_LANG_API_MODE` — `ro-lang/src/config.js`
- `RO_LANG_BASE_URL` — `ro-lang/src/config.js`
- `RO_LANG_MEMORY_FILE` — `ro-lang/src/config.js`
- `RO_LANG_MODEL` — `ro-lang/src/config.js`
- `RO_LANG_MONGODB_COLLECTION` — `ro-lang/src/config.js`
- `RO_LANG_MONGODB_DB` — `ro-lang/src/config.js`
- `RO_LANG_MONGODB_URI` — `ro-lang/src/config.js`
- `RO_LANG_TIMEOUT_MS` — `ro-lang/src/config.js`
- `TZ` — `agent/tools/process.js`

## Persistent settings and records

`SCHEMA.Setting` in `lib/Constants.js` defines the settings snapshot. Owner commands update these values without rewriting config.js. Settings cover partner/prefix/disabled-command lists, forbidden words and sticker commands; public/self/group-only modes; read/reaction/call and presence behavior; chatbot model/instruction; menu text/style/music; notification and broadcast settings; newsletter identity; ingress/egress counters and last reset time. Most toggles have corresponding owner commands; see FEATURES. Presence/secure-label send-wrapper changes require a reconnect/restart.

Groups retain moderation/welcome/leave/reminder toggles, participant state and rental expiry. Users retain limits, energy, premium expiry, activity, AFK and command counters. Defaults are filled only where fields are absent. Existing settings win over schema defaults. Preserve the database when changing configuration.

`.menu text` is a per-request text override and does not modify stored menu style. Setting `interactiveMenuMode: 'text'` affects all sends through the shared interactive helpers. External provider credentials are optional unless the associated feature is used; the bot can operate locally without cloud or AI credentials.

## Schema field defaults

These defaults apply only to missing fields; they do not reset existing records. IDs and user-specific values start empty.

### User

| Field | Default |
| --- | --- |
| `_notifiedPremium` | false |
| `jid` | null |
| `lid` | null |
| `name` | null |
| `banned` | false |
| `historyChat` | Empty array |
| `afkContext` | Empty object |
| `afkTimestamp` | -1 |
| `afkReason` | Empty string |
| `limit` | `defaultLimit` |
| `energy` | 100 |
| `premiumExpiry` | 0 |
| `commandUsage` | 0 |
| `callAttempt` | 0 |
| `lastClaim` | 0 |
| `lastSeen` | 0 |

### Group

| Field | Default |
| --- | --- |
| `_notifiedRent` | false |
| `id` | null |
| `name` | null |
| `left` | false |
| `welcome` | false |
| `mute` | false |
| `adminOnly` | false |
| `antiBot` | false |
| `antiDelete` | false |
| `antiPorn` | false |
| `antiSpam` | false |
| `antiWALink` | false |
| `antiLink` | false |
| `antiRejoin` | false |
| `antiTagAll` | false |
| `antiToxic` | false |
| `antiGroupStatus` | false |
| `antiTagStatus` | false |
| `autoSticker` | false |
| `memberLabelUpdate` | false |
| `sholatReminder` | false |
| `viewOnceForwarder` | false |
| `leftMessage` | Empty string |
| `welcomeMessage` | Empty string |
| `participants` | Empty object |
| `rentExpiry` | 0 |
| `lastActivity` | 0 |

### Setting

| Field | Default |
| --- | --- |
| `partner` | Empty array |
| `prefixes` | Built-in array (5 entries) |
| `forbiddenWords` | Built-in array (87 entries) |
| `disabledCommand` | Empty array |
| `stickerCommand` | Empty object |
| `self` | false |
| `afkNotifier` | true |
| `autoDownload` | true |
| `commandSuggestions` | true |
| `chatBot` | false |
| `noPrefix` | false |
| `groupOnly` | true |
| `menuMusic` | true |
| `notifier` | false |
| `reactStatus` | true |
| `readMessage` | true |
| `rejectCall` | true |
| `secureLabel` | false |
| `slowMode` | false |
| `typingPresence` | true |
| `botInstruction` | Built-in text |
| `botModel` | Empty string |
| `menuMessage` | Built-in text |
| `newsletterId` | Empty string |
| `broadcastCooldown` | 10000 |
| `replyStyle` | 3 |
| `menuStyle` | 3 |
| `messageIngress` | 0 |
| `messageEgress` | 0 |
| `byteIngress` | 0 |
| `byteEgress` | 0 |
| `lastReset` | 0 |

### Participant

| Field | Default |
| --- | --- |
| `isAdmin` | false |
| `leftGroup` | false |
| `messages` | 0 |
| `warningPoint` | 0 |
| `lastSeen` | 0 |
