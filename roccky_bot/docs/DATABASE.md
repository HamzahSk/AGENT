# Database and persistence

## Core snapshot model

`lib/Database.js` exposes `Database(path)` and `Store(path)`. `SnapshotFile.js` provides serialized file/remote operations, `Persistence.js` provides encoding and dirty-revision flushing, and `CloudDatabase.js` owns the shared cloud pool. The public `LocalDatabase` export remains available.

| Snapshot | Shape | Usage |
| --- | --- | --- |
| Database | `users`, `groups`, `settings` | User quotas, profile/activity, premium/rental state, group moderation and runtime settings |
| Store | `messages`, `contacts`, `groupMetadata` | Retry/forward/quoted-message support, contacts, metadata caching |

At runtime users/groups/contacts/metadata are maps; snapshots use JSON objects keyed by ID. Message maps are nested by chat and message ID. `SCHEMA` in `Constants.js` provides defaults. It returns fresh objects through getters. Existing values are retained when missing defaults are applied.

`updateUser`, `updateGroup`, delete methods and Store mutations mark dirty state. Direct field mutations need `requestWrite()`; Listener already marks after plugin work. `flush()` awaits outstanding dirty revisions; `flushNow()` requests an immediate snapshot even if clean. `close()` cancels scheduling and waits for persistence. `sync()` retries a pending local snapshot without requiring a new in-memory mutation.

## Local durability and cloud fallback

A write is serialized per snapshot instance:

1. Encode the current data, preserving Buffer, ArrayBuffer, typed-array offsets, DataView and BigInt. Shared object values are preserved; cycles fail visibly.
2. When cloud is configured, atomically write a `.pending` marker.
3. Write a mode-0600 temporary JSON file and rename it over the local snapshot.
4. Attempt an idempotent cloud upsert if connected.
5. Remove the marker only after the remote operation succeeds.

Cloud failure leaves a durable local snapshot and marker. A local failure rejects and retains dirty state for retry. Mutations arriving during an active flush cause another snapshot; callers do not return before their active flush completes. Atomic rename protects against partially written JSON, but this is not a filesystem `fsync` guarantee against abrupt power loss.

Startup prefers an existing pending local snapshot. Otherwise it reads cloud when available and mirrors a valid remote snapshot locally. A missing cloud record falls back to local state. An outage with no local snapshot fails startup instead of creating an empty database. Corrupt/unreadable snapshots fail rather than silently becoming `{}`. Explicit alternate-path reads, used by restore, always read that file. Database record validation happens before replacing live maps.

Core snapshots assume a single writer. A local copy used while cloud is unavailable can be stale if another process wrote cloud state; no automatic merge exists. Resolve such conflicts operationally before starting multiple writers.

## Cloud connection and queries

MongoDB and PostgreSQL drivers are imported lazily. Both share one initialization attempt, a default pool size of two (maximum ten), five-second connection waits and roughly ten-second operation/socket bounds. Failed connections/operations trigger a shared exponential cooldown from five seconds to five minutes. Maintenance invokes connection recovery and pending sync; there is no immediate retry loop per message.

Mongo uses collection `roccky_data`, key `_id`, with `json_data` as a serialized string and `updated_at` timestamp. The built-in `_id` index is sufficient. PostgreSQL uses `roccky_data(file_key TEXT PRIMARY KEY, json_data TEXT, updated_at BIGINT)` and parameterized select/upsert queries; setup requires create/alter privileges. The existing schema is retained. Pool idle errors mark the connection unavailable. Shutdown closes the driver.

MongoDB's 16 MB document limit still applies to a complete snapshot. Local fallback can preserve a larger snapshot but cannot make an oversized Mongo upsert succeed. Large deployments need a separately planned schema migration rather than an automatic destructive conversion.

## Retention and other stores

Store retains only message data needed for retry/forwarding, not serialized helper functions/socket references. It limits messages per chat, global message count, retention age, contacts and group metadata. Maintenance prunes periodically; thumbnails are stripped from persisted copies. These bounds affect old quoted/anti-delete availability.

The owner agent's `MemoryStore` uses per-owner JSON files and locks. Invalid JSON now propagates rather than resetting memory. RO-LANG supports `JsonMemoryStore` and its separate `MongoMemoryStore`; JSON writes recover after a prior rejection, and Mongo has single-flight initialization and bounded pools/timeouts. These stores do not share core snapshot failover.

## Recovery procedure

Stop all writers. Preserve the JSON file, marker and auth directory privately. Check file permissions, disk capacity, URL scheme, DNS/TLS and database permissions. Restore from a known-good private backup or repair the invalid record before restart. Never remove `.pending` merely to hide a failed upload. If enabling cloud on an existing installation, verify which snapshot should win before proceeding.
