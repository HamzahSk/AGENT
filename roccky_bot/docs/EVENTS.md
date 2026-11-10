# Events and message processing

`registerAllEvents(sock, context)` creates the per-socket queue and returns an async disposer. `onEvent` catches synchronous throws and rejected async handlers; the disposer unregisters each callback and closes the queue. Socket transport shutdown precedes draining active commands.

| Baileys event | Handling |
| --- | --- |
| `creds.update` | Serialized `saveCreds` chain in `socket.js`; failure initiates controlled shutdown |
| `connection.update` | Single pairing attempt, private-terminal QR, open hooks, manager-controlled close/reconnect |
| `messages.upsert` | Notify messages queued by chat; own appended messages retained for retries; historical append commands ignored |
| `groups.update` | Invalidates short group cache and merges metadata into Store |
| `group-participants.update` | Queues by group, handles object/string participants, updates records and welcome/leave/moderation behavior |
| `call` | Global anti-call settings or Listener's persistent reject-call setting |
| `presence.update` | Queues presence handling by chat |

## Notify lifecycle

1. Reject malformed entries, unsupported batch types and notifications older than five minutes.
2. Deduplicate by remote chat, participant and message ID with a bounded TTL cache.
3. Enqueue with a per-chat ordering constraint and global concurrency/pending limits.
4. Handle status read/reaction settings, or invoke Listener.
5. Serialize content and interactive callback IDs, store a minimal message record, update user/group activity, and determine permissions.
6. Apply command or event guards, await plugin execution, contain failures, mark dirty state.

When the queue is full the event is skipped and a rate-limited diagnostic is emitted. There is no persistent message queue or delivery guarantee. Pending work is discarded on disconnect; active work is drained within the shutdown deadline. Appended history remains excluded even when history sync settings change.

Native-flow callback JSON routes its `id` as the message body; malformed JSON yields no command. Existing legacy button/list reply fields remain recognized. Responses to a successfully relayed but unsupported menu cannot be inferred from server acceptance, so `.menu text` is always available.

## Background work

Maintenance owns daily limit/energy resets and existing inactive record retention, coalesced autosave/cloud retry, store pruning, sustained RSS checks and temporary-file cleanup. Scheduler handles premium/rental expiry without overlapping ticks. Prayer reminders own guarded timers and retry schedule-fetch failures after five minutes. Quiz timers are cleared on disconnect. The language tutor's lifecycle hook replaces or releases its socket reference; its own scheduling/storage subsystem remains separate.

Remote group metadata can still be temporarily stale. Live permission changes, LID mapping and large group batches need validation against the target account and WhatsApp version.
