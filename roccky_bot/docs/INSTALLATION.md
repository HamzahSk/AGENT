# Installation and deployment

## Requirements

Use Node.js 24 LTS; `package.json` requires at least Node 22.12. Bun 1.4.4 is the package manager used by `bun.lock`; Bun can also run the bot. FFmpeg and ffprobe are required for audio/video conversion and animated stickers. Native image packages require a supported OS/architecture and sufficient temporary disk space.

A 1-vCPU host with 1 GB RAM is a reasonable starting point, not a measured minimum. On a smaller machine, disable the optional gateway and reduce media usage. The audit did not benchmark a 512 MB production host.

## Install

From the project directory:

```sh
bun install --frozen-lockfile
node scripts/check-syntax.mjs
npm test
```

`install.sh` installs Node, the pinned Bun package manager, FFmpeg and PM2 on its supported platform branches. Review it before use: it performs system package installation/upgrades. Bun/native dependency support on Termux is platform-dependent and was not verified. Do not use the old Yarn instructions; the repository provides a Bun lockfile.

## Private configuration and authentication

Edit `config.js` privately. Set owner/bot identity, storage paths and provider settings; consult [CONFIGURATION](CONFIGURATION.md). No real keys or numbers belong in documentation, issue reports or source examples.

Start in a private interactive terminal with `npm run start:node` or `bun start`. Pairing uses `botNumber` when `pairingCode` is enabled; otherwise scan the terminal QR. QR/pairing output is suppressed outside a TTY. The configured auth directory is retained on network failure, logout and shutdown. It must be writable and persistent.

Run one worker per WhatsApp session. For terminal authentication/conflict errors, stop other instances and investigate the account/session state. Do not delete the old auth directory as a routine reconnect step.

## Database

Local operation needs writable database/store directories. For cloud operation, privately set `ROCCKY_DATABASE_URL` or `global.databaseUrl`, optionally `databaseName`. Supported schemes are MongoDB and PostgreSQL. PostgreSQL TLS follows driver/URL settings unless `databaseSSL` is explicitly configured; the code no longer disables certificate verification automatically.

Keep the local JSON files and their `.pending` markers together on persistent disk, even when cloud storage is configured. A fresh cloud-backed deployment must reach its database at least once; startup refuses to invent empty state during an outage with no local snapshot.

## Production processes

```sh
npm run start:node
# Or use the provided PM2 configuration:
pm2 start ecosystem.config.cjs
```

The PM2 file uses Bun, disables file watching, adds restart backoff, and stops on exit 0 or 78. The Node start command retains its 300 MB V8 heap limit; RSS includes additional native and worker memory. The configured RSS restart threshold is separate from the heap limit.

Set `ROCCKY_AI_SERVER=false` to run only WhatsApp. When enabled, the gateway defaults to port 8080 in the launcher. Its routes have no inbound authentication layer; restrict network access or put an authenticated proxy in front of it. Provider credentials are separate from gateway access control.

## Docker

The Dockerfile uses Node 24, Bun 1.4.4, the committed lockfile and FFmpeg. `.dockerignore` excludes configuration, common auth/state folders and logs. Configure custom private directories outside the build context, or extend the exclusions before building.

Supply `config.js` as a read-only bind mount. For simple volume management set paths in that private configuration to `state/database.json`, `state/store.json`, and `state/session`, then persist `/app/state`. Do not bake credentials or sessions into the image. Pair interactively before background operation. Docker image build and live container operation were not verified during this audit.
