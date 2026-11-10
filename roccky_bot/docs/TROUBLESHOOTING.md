# Troubleshooting

| Symptom | Likely cause and next action |
| --- | --- |
| Bot restarts repeatedly | Check worker exit code and safe error scope. PM2 watching is disabled; check for another external watcher. Inspect sustained RSS and startup read failures before changing thresholds. |
| Temporary WhatsApp disconnect | Allow bounded in-worker backoff. Verify network/DNS. Do not run another instance or remove the auth folder. |
| Worker stops with 78 | Terminal auth/conflict status. Verify no other worker uses the same session, inspect account state privately, and plan any re-pairing without overwriting the previous session. |
| QR/pairing code absent in PM2 logs | Pairing is restricted to a private interactive terminal. Start interactively for authentication, then return to managed operation. |
| Menu says version unsupported / buttons absent | Send `.menu text`; optionally configure `interactiveMenuMode: 'text'`. Test the pinned fork against Android/iOS/Web. Relay acceptance alone is insufficient. |
| List selection fails | Single-select client support varies. Type the command ID shown in fallback text or use quick replies/text mode. |
| Media/header fails | Check size caps, URL reachability, actual MIME/extension and native image package support. Document menus contain PPTX bytes and must remain labelled PPTX. |
| A send fails but bot keeps running | Expected plugin boundary behavior. Investigate the provider/transport error privately; do not add blind retries that duplicate ambiguous sends. |
| Cloud unavailable | Local writes retain a `.pending` marker. Check connectivity/TLS/permissions and allow shared cooldown. Maintenance retries pending uploads after reconnection. |
| Fresh cloud deployment will not start offline | No trustworthy local recovery snapshot exists. Restore a known-good private snapshot or restore cloud access; do not initialize empty data to bypass the check. |
| Snapshot invalid / disk write fails | Preserve the file, check JSON/schema, permissions and disk space. Correct or restore the snapshot while the worker is stopped. |
| Mongo remains pending although connected | Check operation errors and the 16 MB document limit. Snapshot architecture may need a planned schema migration for larger datasets. |
| Plugin fails to load | Check syntax/imports with the suite. Failed reload keeps the previous handler. Duplicate aliases retain their first owner. |
| New plugin not picked up | Production hot reload is off; restart after review. New directories need rescan/restart even in development. |
| High CPU | Check media workload, concurrency/threads, large groups and provider work. Proof of work is queued off-loop; owner evaluation can still execute CPU-heavy code. |
| High RAM | Check native codecs, Store limits, gateway sessions and hot reload. Disable unused services and measure actual workload; do not rely on restart loops. |
| Quiz stuck after disconnect | Quiz sessions intentionally end when the socket is disposed. Start a new quiz; network failure no longer leaves its processing lock held. |
| Tutor storage differs from core DB | RO-LANG has a separate JSON/Mongo backend and environment configuration; core snapshot failover does not apply to it. |
| AI gateway returns provider errors | Verify private provider environment settings and provider availability. The unofficial provider can change independently of the bot. |

Use synthetic reproductions and redacted scope/code diagnostics in reports. Do not attach config.js, `.env`, auth/session directories, user databases or conversation logs. See [AUDIT](AUDIT.md) for checks already performed and limitations.
