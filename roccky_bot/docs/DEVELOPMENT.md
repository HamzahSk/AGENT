# Development and maintenance

## Workflow

Read `docs/ARCHITECTURE.md`, relevant module docs, project instructions and `DOCS_BAILEYS.md` before changing protocol behavior. Work from the project root so relative media/plugin paths resolve. Use the committed Bun lockfile; do not switch forks or replace the lock casually. Node 24 is the verified runtime.

Keep changes within the existing process/plugin architecture. Use native Node APIs when practical. Preserve state schemas, configuration and auth directories; plan explicit migrations instead of resetting data. Never commit credentials, user databases, environment files, auth keys or session logs.

## Validation

```sh
bun install --frozen-lockfile --ignore-scripts
node scripts/check-syntax.mjs
npm test
bash -n install.sh
```

The audit install suppressed package install scripts. Deployment may need platform-specific native setup, so validate image/audio packages on the target platform.

The Node suite includes the existing agent, RO-LANG and AI gateway suites plus tests in `test/`. Tests use temporary synthetic databases and mock cloud/socket interfaces. The startup fixture intercepts configuration/auth imports, disables external network requests and exercises the existing launcher/worker entry points. It does not authenticate to WhatsApp.

Core runtime, persistence, HTTP/media-process, interactive, proof-of-work and plugin/menu/media integration tests also ran under Bun 1.4.4 (34 passing tests). The full startup fixture uses Node module-loader hooks; it is not a live Bun login test.

A temporary Babel/ESLint audit checked source imports, metadata, undefined references and selected async rules. This audit tool is not a project dependency. Remaining `no-promise-executor-return` findings describe ignored executor return values, not failing runtime tests. The committed syntax check is dependency-free.

## Coding rules

- Await work inside the correct boundary. Async EventEmitter callbacks need explicit rejection handling.
- Capture ownership: a socket lifecycle owns its listeners/timers; a file creator owns its cleanup; a shared pool owns its reconnect cooldown.
- Use exact identity matching and current group metadata for access checks.
- Make queues finite and preserve ordering where shared state is mutated.
- Do not retry a plain send automatically after an ambiguous network error.
- Preserve binary objects through protobuf construction; validate mixed-button constraints and retain text commands.
- Use revision-based dirty tracking and atomic writes; propagate local errors.
- Do not log raw error/request/auth objects. Prefer scope and safe error code.

## Where to start

| Change | Inspect first |
| --- | --- |
| Startup/restart | index.js, socket.js, Supervisor, ConnectionManager, Event |
| Command behavior | Listener, Serialize, Watcher, relevant plugin |
| Menus | plugins/menu.js, Function/message.js, SocketClient, DOCS_BAILEYS.md |
| Persistence | Database, SnapshotFile, Persistence, CloudDatabase, Constants |
| Media | Http, Request, MediaProcess, Function/FFMPEG, Function/Utilities |
| Background jobs | Maintenance, Scheduler, SholatReminder, QuizFactory |
| Owner agent | agent/plugin.js, agent/core, agent/adapters, agent/config.js |
| Language tutor | plugins/ai/_rocky-learning.js, ro-lang/src |
| Gateway | AI-SEERVER/api/index.js, deepseek_apk.js, pow.js |

Update feature/configuration docs when adding commands or options. Add tests for meaningful behavior changes, particularly lifecycle, persistence and protocol boundaries; avoid implementation-mirroring assertions. Use a private staging account for final Android/iOS/Web and cloud validation.
