# ROCCKY technical documentation

ROCCKY runs a Baileys WhatsApp worker supervised by `index.js`. It supports moderation, downloads, image/audio tools, quizzes, interactive menus, AI conversations, an owner agent, and a language tutor. The optional Hono gateway provides Chat Completions, Responses and legacy completion endpoints through an unofficial DeepSeek provider.

The stack is JavaScript ESM, Node.js/Bun, the pinned Elaina Baileys fork, native Node streams, PostgreSQL or MongoDB snapshot storage, local JSON recovery files, and FFmpeg. No additional service or queue infrastructure is required.

| Document | Purpose |
| --- | --- |
| [ARCHITECTURE](ARCHITECTURE.md) | Process boundaries, startup, sockets and data flow |
| [STRUCTURE](STRUCTURE.md) | Source tree and module responsibilities |
| [INSTALLATION](INSTALLATION.md) | Dependencies, authentication, Node/Bun, PM2 and Docker |
| [CONFIGURATION](CONFIGURATION.md) | Global configuration, environment variables and persistent settings |
| [FEATURES](FEATURES.md) | Complete plugin catalogue, commands, helpers and limitations |
| [PLUGINS](PLUGINS.md) | Discovery, interfaces, command guards and extension examples |
| [EVENTS](EVENTS.md) | Connection, message, group, presence and call handling |
| [DATABASE](DATABASE.md) | Snapshot schemas, atomic files, cloud recovery and restore |
| [BAILEYS](BAILEYS.md) | Auth, native flow, menu repair and protocol references |
| [ERROR_HANDLING](ERROR_HANDLING.md) | Scoped boundaries, diagnostics and controlled shutdown |
| [PERFORMANCE](PERFORMANCE.md) | Resource bounds and low-memory operation |
| [DEVELOPMENT](DEVELOPMENT.md) | Workflow, regression tests and compatibility rules |
| [TROUBLESHOOTING](TROUBLESHOOTING.md) | Symptom-based operational guidance |
| [CHANGELOG](CHANGELOG.md) | Audit repairs and compatibility changes |
| [AUDIT](AUDIT.md) | Findings, verification evidence and remaining limitations |

These documents describe the audited implementation, not a guarantee about external APIs or WhatsApp client rendering. Read AUDIT before deploying the changes.
