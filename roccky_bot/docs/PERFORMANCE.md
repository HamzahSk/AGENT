# Performance and small servers

## Bounds and defaults

| Resource | Bound/behavior |
| --- | --- |
| Message execution | Two concurrent chats, one active task per chat, 100 pending tasks by default |
| Socket instances | One worker socket plus one in-flight initialization; previous disposal completes before replacement |
| Cloud connections | Pool size two, configurable to ten; shared retry cooldown |
| Database writes | Dirty revisions, five-second default debounce, serialized snapshots and periodic pending-upload retry |
| Store | Configured retention, per-chat/global message/contact limits; periodic pruning; minimal message records |
| Profile pictures | Per-socket LRU, maximum 1,000, five-minute TTL |
| Message dedup | 30-second TTL, maximum 10,000 entries |
| Message retry counts | 60-second TTL, maximum 5,000 entries |
| FFmpeg | Default concurrency one; maximum configured concurrency four; eight queued jobs, one thread per process by default |
| Downloads | 32 MiB default for shared fetch/persistence helpers; 8 MiB default for interactive header URLs |
| Brat animation | Maximum 30 words / 500 characters; sequential frame downloads and cleanup |
| Quiz data | Loaded on demand; at most three datasets cached |
| API sessions/response IDs | Default 50 sessions / 1,000 response-ID mappings |
| Provider proof of work | One worker job at a time, eight queued, bounded timeout and cancellation |

Consult CONFIGURATION for overrides and actual committed numeric defaults. Some individual scrapers use their own clients/limits; shared bounds are not a universal guarantee over every third-party library.

## Memory and CPU

Stored messages omit serialization closures that previously retained entire sockets. Cache limits, listener disposal and disabled production hot reload reduce long-run retention. Full history synchronization is disabled. Query retries are shared across Database/Store instead of occurring per message. Native image/media allocations and workers still count toward RSS outside V8's heap limit.

Media streaming keeps its queue slot until the subprocess closes. Spawn errors, timeouts and consumer cancellation are handled. Audio cleanup only removes files created for that operation, preserving caller-owned inputs. Other temporary media is subject to the existing maintenance policy; long downloads and high-volume conversion need adequate disk capacity.

DeepSeek signature requests now calculate proof of work outside the main event loop. The exported synchronous hash helper remains for compatibility; callers should use the request path or `solvePow` for runtime work. No persistent worker farm or external infrastructure was introduced.

The RSS guard requests a restart only after three consecutive high samples. It asks for graceful shutdown rather than recursively spawning workers. The configured interval still controls detection latency. Garbage collection settings only operate when the runtime exposes `global.gc`.

## Recommended operation

Start with media concurrency one, avoid unneeded hot reload and disable the optional AI gateway if unused. Measure RSS, task latency, disk usage and pending cloud state under your own workload before increasing concurrency. Keep cloud recovery snapshots on persistent storage. A larger memory threshold does not repair a leak, and constant restarts can conceal overload.

The API session cache still needs careful validation under concurrent create/evict traffic. Plugin APIs, native image codecs, provider rate limits and exceptionally large groups can dominate cost. This audit did not perform a multi-day soak, real media benchmark or production memory-capacity study.
