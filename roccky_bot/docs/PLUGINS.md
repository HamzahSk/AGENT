# Plugin development

## Discovery and registry

`lib/Watcher.js` recursively loads only regular `.js` files from `pluginsFolder` in deterministic name order. A file exports an object with `run`, or an array of such objects. `_quiz-registry.js` awaits factory registration and exports its generated handlers. `ModuleCache` maps file paths to arrays; callers still tolerate legacy single-object entries. `CommandIndex` maps normalized command/hidden aliases; `EventIndex` holds handlers without a command.

The first registered handler owns a duplicate alias. A later duplicate is reported and skipped. Unindexing only removes aliases owned by that handler. Failed reload imports retain the old working handler. `registryRevision` invalidates menu caches even when the command count is unchanged.

Production hot reload is off. Setting `global.hotReload=true` enables one tracked watcher per directory with debouncing. Bun reloads also invalidate its file-module cache. Node ESM cache-busted modules cannot be unloaded, so use process restarts for sustained production code updates. Newly added subdirectories require a rescan/restart. Watcher shutdown is explicit.

## Interface and access checks

```js
export default {
  command: ['hello'],
  hidden: ['hi'],
  category: 'other',
  async run(m, { sock, db, user, isPrefix, text }) {
    await m.reply(`Hello ${m.pushName}. Use ${isPrefix}menu for help.`)
  }
}
```

Listener supplies `sock`, `db`, `store`, `user`, `group`, `setting`, `groupMetadata`, `body`, `command`, `text`, `args`, `isPrefix`, authorization flags, `Func`, `Scrap`, `Utils` and their lowercase aliases. It also supplies interactive-send helper aliases. `m` is the serialized message with `reply`, `react`, `download` and quoted-message helpers.

Boolean guards include `owner`, `partner`, `premium`, `group`, `private`, `admin`, and `botAdmin`; numeric `limit` and `energy` are handled by Listener. Owner checks use the exact configured JID, with existing self-message semantics retained. Admin checks use group metadata, filtering absent IDs.

Plugins without `command` run as message event handlers when no command is selected and the handler's guards pass. They are not independent Baileys event subscriptions. Return early when a message is irrelevant.

```js
export default {
  group: true,
  async run(m, { group }) {
    if (!group.welcome || m.body !== 'hello') return
    await m.reply('Welcome!')
  },
  onConnect(sock) { /* optional lifecycle hook */ },
  onDisconnect(sock) { /* release references to this socket */ }
}
```

## Error and data ownership

Await every send, reaction, download and database operation, or attach a deliberate rejection handler to detached work. Listener contains plugin failures and marks database state dirty in `finally`. A local catch does not catch a promise that was never awaited. Timers need their own boundary and cleanup, and must not retain a socket after disconnect.

Use the Database/Store APIs. Mutable user/settings objects require `db.requestWrite()` when changed outside Listener. Use `flush()` for pending changes, `flushNow()` only for explicit durable operations such as backups. Never prune authentication keys or store full serialized messages with socket closures.

For buttons prefer same-type quick replies and include actionable command IDs. `sendList` has client limitations; supply a useful text fallback. See [BAILEYS](BAILEYS.md).

## Modify and validate

Inspect the existing plugin and relevant utilities before editing. Check alias collisions and update the catalogue. Run `npm test` and the syntax check; the import smoke test exercises all plugin modules with synthetic configuration and blocked external fetches. It does not execute every remote provider or owner administrative operation.

Owner evaluation and update commands retain substantial privileges. VM-based evaluation is not a security sandbox for hostile code. `backupsc` excludes common private/configuration paths; extend its exclusions for custom secrets. The updater protects excluded/path-traversal targets, but still trusts upstream code and is not a transactional deployment system.
