# Changelog

## 2026-11-10 — stability audit

- Replaced overlapping connection/restart paths with a single socket manager and child supervisor, bounded backoff, explicit terminal-session behavior and graceful disposal.
- Removed automatic session deletion/restoration and age-based Signal-key cleanup. Added private-terminal pairing behavior and serialized credential writes.
- Added local-first atomic snapshots, pending cloud upload markers, revision-based flushes, corruption/restore validation, shared cloud retry cooldown, bounded pools and pool cleanup.
- Corrected retry message content, awaited event/plugin sends, repaired undefined command/socket references, isolated plugin failures, and fixed quiz registration/locks/timers.
- Preserved binary interactive headers and raw button JSON, removed redundant protocol nodes, enforced native-flow constraints, corrected PPTX metadata, fixed donation routing, and provided complete fallback commands and `.menu text`.
- Made plugin discovery deterministic, reload failure-safe (including Bun cache invalidation) and production watching opt-in. Menu caches now follow registry revision.
- Bounded shared downloads, FFmpeg queues/process lifetimes, caches and quiz datasets; moved gateway signature proof of work off the main event loop.
- Preserved caller-owned audio inputs, waited for stream closure before file deletion and handled partial downloads/process cleanup, and made schedulers non-overlapping and disposable.
- Repaired script ZIP streaming/finish handling and added private-path/updater traversal exclusions; fixed installer/Docker lockfile use and PM2 data-file restart behavior.
- Pinned the existing Baileys fork to 1.4.7; declared already-used lru-cache, p-queue, undici and ws directly. Runtime baseline is Node 22.12+, verified on Node 24.22.2 and core tests on Bun 1.4.4.
- Added built-in regression tests and comprehensive technical documentation. The original Baileys reference and AI Markdown renderer remain unchanged.

### Compatibility and operational changes

Persist local JSON snapshots and `.pending` markers even in cloud mode. Invalid snapshots now stop rather than silently reset. Terminal authentication/conflict states stop for operator intervention. PostgreSQL no longer implicitly disables certificate checks. Large downloads may be rejected by configured caps. Hot reload is off by default. Style 8 uses valid PPTX; style 9 caps cards at ten while exposing every category as text. Plain send failures propagate rather than returning undefined.

No database schema migration, new infrastructure, CI credential change, workflow edit or commit was performed by the audit.
