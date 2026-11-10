# Baileys integration and interactive menus

## Version and reference

`baileys` is pinned to `npm:@rexxhayanasi/elaina-baileys@1.4.7` in package.json and bun.lock. Its installed implementation lives under `node_modules/baileys/src`. The original [DOCS_BAILEYS.md](../DOCS_BAILEYS.md) was read in full and remains unchanged as the primary local API/protocol reference. This project uses fork-specific APIs; changing to upstream Baileys is not a drop-in upgrade.

`socket.js` uses `makeWASocket`, `useMultiFileAuthState` and `makeCacheableSignalKeyStore`. Authentication loads once per worker; `creds.update` writes are serialized. The installed library chooses its WA version instead of the old hard-coded tuple. Full history sync and high-quality link preview generation are disabled. Query/connect timeouts and retry caches are bounded. `getMessage` returns the inner `.message` protobuf content, not the stored wrapper.

## Root causes of menu failures

Style 1 is an extended text reply. Other styles used native-flow payloads through `lib/Function/message.js`, where recursive null cleanup also traversed Buffer/Uint8Array media keys and hashes, replacing bytes with dictionaries. Raw native-flow buttons were reinterpreted as friendly aliases before their `buttonParamsJson` could be preserved. Other incompatibilities included obsolete manually injected protocol nodes, mixed quick-reply/CTA button types, media-less carousel cards, and PPTX bytes labelled as legacy PPT.

The repaired helper preserves binary objects, raw JSON parameters and native-flow `messageVersion: 1`. It lets the installed fork's `relayMessage` add its own business protocol node. It returns the generated WebMessageInfo after relay, retains positional sendButton/sendList compatibility, enforces homogeneous quick replies (maximum ten) or other buttons (maximum three), and requires image/video headers on carousel cards (one to ten cards).

| Style | Current rendering path |
| --- | --- |
| 1 | Existing extended text plus external preview |
| 2 | Native-flow single-select category list |
| 3–5 | Image card and quick replies, with category commands in body |
| 6 | PPTX document header and quick replies |
| 7 | Profile-image card and quick replies |
| 8 | PPTX document header and quick replies; correct file extension/MIME |
| 9 | Carousel of up to ten categories, with all category commands in the body |

Donate buttons route to the existing credits command (which includes the donation URL) so they can remain quick replies. Menu registry caching follows registry revision; optional music is awaited after the menu across styles.

## Fallback and client compatibility

A helper catches media preparation, validation or relay failure and makes one text fallback attempt; fallback send failure propagates. Menu-level wrappers disable the inner fallback and provide the full category catalogue. List row IDs and carousel button IDs are included in helper fallback text. Text mode bypasses media preparation and relay entirely.

Use `.menu text`, or set `global.interactiveMenuMode = 'text'` for all helper-based interactive sends. Use your actual configured prefix. A successful relay proves server acceptance only; it cannot prove that Android, iOS or Web rendered the controls. The reference describes single-select as Android-specific and documents mixed-button constraints. Native-flow document/card behavior still needs tests on the actual devices.

Callback routing in Serialize reads `nativeFlowResponseMessage.paramsJson.id`, while retaining legacy selection fields. Invalid JSON is ignored. Send helpers preserve existing text/Markdown behavior; the working AI renderer was not rewritten.

## Public issue research

- [WhiskeySockets/Baileys #2465](https://github.com/WhiskeySockets/Baileys/issues/2465): reports interactive/list sends accepted without an error yet not arriving/rendering. This supports exposing text mode; issue comments are anecdotal and are not treated as verified protocol fixes.
- [WhiskeySockets/Baileys #2236](https://github.com/WhiskeySockets/Baileys/issues/2236): discusses externalAdReply URL/client differences and fully qualified URLs. It reinforces client-specific validation rather than assuming identical rendering.

The issues were consulted through the public GitHub API during discovery. Payload repairs rely primarily on the local reference and the pinned fork's implementation, not on unverified issue snippets.

## Authentication and recovery

Temporary disconnections use one manager and bounded backoff. Terminal logout, conflict, forbidden/multidevice mismatch and bad-session codes stop for operator intervention. No code deletes, restores old copies of, or age-prunes Signal keys. Pairing output belongs only in a private TTY. Keep the auth directory persistent and never include it in diagnostics or commits.
