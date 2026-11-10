# ROCCKY Bot

An ESM WhatsApp bot with group moderation, media tools, interactive menus, quizzes, AI conversations, an owner coding agent, and a language tutor. Based on the Starseed project by Lia Wynn / Starfall Co. Ltd.; see [LICENSE](LICENSE).

Use Node.js 24 LTS (minimum 22.12), Bun 1.4.4 for the committed lockfile, and FFmpeg/ffprobe for media conversion.

```sh
bun install --frozen-lockfile
# Configure config.js privately before starting.
npm run start:node
```

`bun start` remains available. Authenticate from a private interactive terminal. Keep the configured session directory and database snapshots on persistent storage. Run only one bot worker for a session and database.

The pinned `baileys` alias resolves to `@rexxhayanasi/elaina-baileys@1.4.7`. The original [DOCS_BAILEYS.md](DOCS_BAILEYS.md) is retained as the protocol reference.

See [the documentation index](docs/README.md), [installation](docs/INSTALLATION.md), [configuration](docs/CONFIGURATION.md), [all features](docs/FEATURES.md), and [audit and validation results](docs/AUDIT.md). If a menu cannot render on your device, send `.menu text` using your configured prefix.

```sh
npm test
node scripts/check-syntax.mjs
```
