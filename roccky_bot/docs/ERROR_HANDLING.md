# Error handling

## Boundaries and recovery

| Failure | Boundary | Result |
| --- | --- | --- |
| Plugin throw or rejected awaited send | `Listener.runPlugin` | Safe diagnostic, generic failure response, dirty marking, subsequent work continues |
| Async event callback | `Runtime.onEvent` | Rejection handled at registration boundary |
| Temporary WhatsApp disconnect | `ConnectionManager` | Dispose old socket, bounded retry with jitter |
| Terminal auth/conflict disconnect | Worker/launcher | Preserve auth files and stop with exit 78 |
| Cloud connect/query failure | `CloudDatabase`/`SnapshotFile` | Cooldown, durable local snapshot and pending marker |
| Local JSON corruption/write failure | Persistence/read/flush boundary | Propagate; never silently overwrite with empty state |
| Interactive validation/upload/relay | Send helper or menu wrapper | One text fallback attempt; fallback failure propagates |
| Download too large/slow | Http or Serialize download boundary | Cancel/reject and clean partial resources |
| FFmpeg spawn/timeout/failure | MediaProcess queue | Reject or stream error, release slot after child close |
| Expiry/prayer/maintenance task | Task-specific catch | Isolated failure, bounded repeat/retry, disposable timers |
| Unknown uncaught error/rejection | ErrorHandler | Controlled worker/launcher shutdown rather than unsafe continued execution |

The former global rule that treated virtually every message containing `Error` as nonfatal was removed. Recoverable errors belong at their scope. An unknown uncaught exception can leave inconsistent process state; the supervisor restarts only after the process exits.

## Diagnostics

`reportError(scope, error)` emits scope, error class and a bounded code, not arbitrary request/auth payloads. Common libsignal session-record console output is suppressed. Error objects passing through patched console methods are reduced to class/code. Do not log configuration, raw auth state, headers, tokens, memory files, user conversations or session files. Existing plugin-facing provider messages may contain provider detail; inspect them privately before sharing any report.

Useful scopes include `Cloud database`, `Snapshot upload deferred`, `Worker startup`, `Message handling`, `Plugin load`, `Interactive delivery` and `Media process`. A pending marker identifies local-only persistence, not a confirmed remote save. Queue-full reports are rate-limited to avoid floods.

## Debugging

Start with exit/status code, scope, software version and a minimal synthetic reproduction. Run the regression suite before changing retry behavior. For provider failures, use a controlled live test with your own configuration and redact diagnostics. Never solve a missing error boundary by globally swallowing uncaught exceptions or deleting authentication files.

Owner evaluation remains privileged and must be restricted to the actual owner. Its subprocess output is bounded and time-limited; arbitrary owner JavaScript can still block the event loop. The VM helper is not an isolation boundary for untrusted programs.
