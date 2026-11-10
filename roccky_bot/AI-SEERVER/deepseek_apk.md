# deepseek_apk.js — DeepSeek Android API client with a pure-JS SHA3 proof-of-work solver (no WASM)

## 📌 Source Info
| Field | Value | Status |
|---|---|---|
| Raw file URL | `https://moonstar.cyou/snippet/code/deepseek_apk.js` | NEED |
| File name | `deepseek_apk.js` | AUTO |
| Source host | `moonstar.cyou` | AUTO |
| Author / Creator | `andhikagg` | NEED |
| Created date | `2026-11-03` (user-provided) | OPTIONAL |
| Last modified | `2026-11-03` (user-provided) | OPTIONAL |
| Original page / repo | `https://moonstar.cyou/snippet/code/deepseek_apk.js` | OPTIONAL |
| License | No license declared (third-party-derived code; see header note) | OPTIONAL |
| Version / commit | — (no separate version/commit; the raw URL is the source) | OPTIONAL |
| Gist URL | — | OPTIONAL |
| Documented on | 2026-11-03 | AUTO |
| Documented by | AI-generated, needs human review | AUTO |
| Extra notes | Upstream and local file names are both `deepseek_apk.js`. Header says this is a rewrite of Paxsenix0's `apk.js`; it inlines a pure-JS Keccak reverse-engineered from `ds_tai.wasm`. Sibling files: `apk.js` (original, WASM), `apk_fixed.js` (WASM + fixes), `dshashv5.js` (pure hash + `dsSolve` reference). | OPTIONAL |

> Type: api-client + crypto helper
> Language/Runtime: Node.js ESM (`package.json` has `"type": "module"`), target Node 22+ (author-provided; syntax also works on 18+). Verified against the local copy; the upstream URL content was not fetched, so local/remote drift is possible.

## ⚠️ Key Findings
- **Module import is fixed:** the broken `export default deepseek;` was replaced with `export default DeepSeek;`, and the file now also exports `DeepSeekHash`. `import { DeepSeek } from "./deepseek_apk.js"` works.
- **Credential handling is hardened:** there is no longer a hardcoded default token. `auth` defaults to `process.env.DEEPSEEK_TOKEN`, and the constructor throws if it is empty. The previously hardcoded token belonged to the author's personal DeepSeek account and should still be treated as compromised/rotated.
- **Reverse-engineered client:** the author states this is reverse-engineered from the Android app; no official documentation exists, and live-API success was not confirmed.
- **`uploadFile` polling is bounded:** the status poll now runs at most 5 attempts (5 s apart) and throws on `FAILED` or timeout, instead of looping forever.
- **Unsafe file-type handling remains:** `fileTypeFromBuffer()` may return `undefined` for text/unknown buffers, and `const { ext } = ...` then throws. Content-Type matching is exact and can fail for values like `application/pdf; charset=binary`.
- **PoW solver is functionally correct and wrapped in `class DeepSeekHash`:** verified with a challenge produced by `dshash()`; `DeepSeekHash.solve` (and the `dsSolve` wrapper) recovered the nonce and the recomputed hash matched. Performance can still be improved (round constants and scratch buffers are rebuilt per permutation).
- **Unofficial API:** DeepSeek's private Android endpoints and PoW are undocumented and may change or be blocked. Review ToS and account risk before use.

## 1. Executive Summary
`deepseek_apk.js` is a self-contained Node ESM client for DeepSeek's Android chat API. It performs the server's proof-of-work challenge entirely in JavaScript (no `.wasm` file), creates chat sessions, streams completions over SSE, and uploads remote files as attachments. The PoW solver implements a custom 23-round SHA3-256 variant (`DeepSeekHashV1`) using two 32-bit words per 64-bit lane, exposed as `class DeepSeekHash`. The API surface is a `DeepSeek` class plus a `ChatSession` wrapper that tracks `parent_message_id` automatically.

## 2. Purpose & Context
Primary use cases:
- Send prompts to DeepSeek from Node without a browser.
- Continue a conversation by reusing a `chat_session_id` and the tracked parent message.
- Attach images/documents by fetching a URL, uploading it, and referencing the returned file id.
- Study or reuse the pure-JS `DeepSeekHashV1` PoW solver (`dsSolve`).

Do **not** use it when:
- You need an officially supported, stable API (this is an unofficial mobile-client imitation).
- You cannot legally or contractually use DeepSeek's private endpoints.
- You need multi-user isolation or production-grade retry/rate-limit handling (not implemented here).

Position in the system: a leaf client library. It exports `DeepSeek`, `ChatSession`, and `dsSolve`. It depends only on `axios`, `form-data`, `crypto`, `url`, and `file-type`.

Alternatives in this workspace: `apk.js`/`apk_fixed.js` (same client with a WASM solver), `dshashv5.js` (standalone hash + solver), `deepseek.js` (a different client implementation).

## 3. Prerequisites & Installation
Target runtime: Node.js 22+ (author-provided). The source syntax itself works on Node 18+, but `file-type` v22 is ESM-only and may require a newer Node, so Node 20+ is the practical floor.

Dependencies (from `package.json`):
- `axios` — HTTP calls to DeepSeek and to attachment URLs.
- `form-data` — multipart upload body.
- `file-type` — detect the real extension of an uploaded buffer.
- `crypto` (built-in) — `randomUUID()` for uploaded filenames.
- `url` (built-in) — `fileURLToPath` for the "run as main" check.

Environment variables: `DEEPSEEK_TOKEN` is read as the default `auth`. If neither the constructor option nor the env var is set, the constructor throws.

### Getting the token from the web app
The Bearer token is your own logged-in DeepSeek web session's `authorization` header. Do this only with your own account:

1. Open `https://chat.deepseek.com` in a browser and **log in first**.
2. Open DevTools (F12) → **Network** tab, filter to **Fetch/XHR**, and enable **Preserve log**.
3. Send a chat message so the app calls an authenticated endpoint, e.g. `POST /api/v0/chat/completion` (the session-create call, `/api/v0/chat_session/create`, also carries the header).
4. Click that request → **Headers** → **Request Headers** → find `authorization: Bearer <TOKEN>`.
5. Copy only the part **after** `Bearer ` — that is the token.
6. Store it outside the repo, e.g.:
```bash
export DEEPSEEK_TOKEN='<TOKEN>'
```
or pass it explicitly: `new DeepSeek({ auth: "<TOKEN>" })`.

> Warning: the token grants full access to your DeepSeek account. Never commit it, log it, or share it. If it leaks, log out/in to rotate it. Do not automate the login flow; obtain the token manually from your own browser session.

Setup from scratch:
```bash
npm install
# Note: package.json already lists axios, file-type, form-data, fs-extra
```

## 4. Usage
Basic import (after fixing the default export):
```javascript
import { DeepSeek } from "./deepseek_apk.js";

const deepseek = new DeepSeek({ auth: process.env.DEEPSEEK_TOKEN });
const session = await deepseek.create();
const reply = await session.chat({ prompt: "haloo, apa kabar" });
console.log(reply.message);
```

Scenarios:
1. Minimal:
```javascript
const ds = new DeepSeek({ auth: "<API_KEY>" });
const s = await ds.create();
const r = await s.chat({ prompt: "Hello" });
console.log(r.message, r.message_id, r.parent_id);
```
2. Continue the same conversation (parent is automatic):
```javascript
const r2 = await s.chat({ prompt: "And then?" });
```
3. Thinking and web search:
```javascript
const r = await s.chat({ prompt: "Explain X", thinking_enabled: true, search_enabled: true });
console.log(r.thoughts, r.search_queries, r.search_results);
```
4. Attach a remote file:
```javascript
const r = await s.chat({
  prompt: "What is this?",
  ref_file_urls: ["https://example.com/image.png"]
});
```

Method / argument reference:

| Name | Type | Default | Required | Effect | Example |
|---|---|---|---|---|---|
| `new DeepSeek({ auth })` | string | `process.env.DEEPSEEK_TOKEN` | yes (throws if empty) | Bearer token for all requests | `"<API_KEY>"` |
| `auth` | string | `DEEPSEEK_TOKEN` | yes | `Authorization: Bearer <auth>` | |
| `clientVersion` | string | `"2.3.0"` | no | `x-client-version`, User-Agent | `"2.3.0"` |
| `rangersId` | string | `"7865329968002107661"` | no | `x-rangers-id` header | |
| `headers` | object | `{}` | no | merged over base headers | `{ "x-foo": "bar" }` |
| `create({ agent })` | string | `"chat"` | no | creates chat session, returns `ChatSession` | `create()` |
| `createNewChat()` | — | — | — | returns only the session id | |
| `session.chat({ prompt })` | string | — | yes | sends prompt, returns parsed result | |
| `parent_message_id` | number/string | inherited | no | override parent message | |
| `ref_file_urls` | string[] | `[]` | no | uploads each URL first | |
| `thinking_enabled` | boolean | `false` | no | enable reasoning stream | |
| `search_enabled` | boolean | `false` | no | enable web search | |
| `generateSignature(path)` | string | — | yes | returns base64 PoW header | `"/api/v0/chat/completion"` |
| `calculateHash(algorithm, challenge, salt, difficulty, expireAt)` | mixed | — | yes | returns nonce or throws | |
| `chatCompletions({...})` | object | — | yes | low-level send without session tracking | |
| `uploadFile(url)` | string | — | yes | returns `file_id` | |
| `parseEventStream(data)` | string | — | yes | parses SSE text into a result object | |
| `dsSolve(challenge, prefix, maxNonce)` | string,string,number | — | yes | returns nonce or `undefined` | |

Input→output examples are in section 9 and section 15.

Exit codes: the file is a library. When run as main, success exits 0; an exception is caught and logged, and the process exits 0 unless Node treats an unhandled rejection as fatal. Running it as main without `DEEPSEEK_TOKEN` now throws at construction and is caught/logged.

## 5. File Structure Map
```text
deepseek_apk.js
├── RC_LO, RC_HI                     # 23 round-constant halves
├── evenBits(x)                      # gather even bits into 16 bits
├── ilE(lo,hi), ilO(lo,hi)           # interleave lane halves
├── RCE, RC_O                        # interleaved round-constant caches
├── class DeepSeekHash
│   ├── static keccakF8(s)          # 23-round permutation (row 0 only in last round)
│   └── static solve(challenge, prefix, max)  # PoW nonce search
├── dsSolve(challenge, prefix, max)  # thin wrapper over DeepSeekHash.solve
├── class ChatSession
│   ├── constructor(client, {id, parentMessageId})
│   └── chat({...})                  # delegates to client.chatCompletions(), tracks parent
├── class DeepSeek
│   ├── constructor({auth, clientVersion, rangersId, headers})
│   ├── calculateHash(algorithm, challenge, salt, difficulty, expireAt)
│   ├── create({agent})              # -> ChatSession
│   ├── createNewChat()              # -> session id
│   ├── generateSignature(path)      # -> base64 PoW response
│   ├── chatCompletions({...})       # -> parseEventStream result
│   ├── uploadFile(url)              # -> file id
│   └── parseEventStream(data)       # -> {message, thoughts, ...}
├── isMain + main IIFE               # demo run
└── exports: { DeepSeek, ChatSession, DeepSeekHash, dsSolve } + default DeepSeek
```

Dependency diagram:
```text
ChatSession.chat
   └─> DeepSeek.chatCompletions
          ├─> DeepSeek.uploadFile (per ref_file_urls)
          │      ├─> axios.get(url)
          │      ├─> fileTypeFromBuffer
          │      └─> DeepSeek.generateSignature -> calculateHash -> dsSolve -> DeepSeekHash.keccakF8
          ├─> DeepSeek.generateSignature -> calculateHash -> dsSolve -> DeepSeekHash.keccakF8
          ├─> axios.post(/api/v0/chat/completion)
          └─> DeepSeek.parseEventStream

DeepSeek.create -> axios.post(/api/v0/chat_session/create) -> new ChatSession
```

## 6. Section-by-Section Breakdown

### 6.1 Constants
- `RC_LO`, `RC_HI` — two arrays of 23 32-bit halves of the round constants. The algorithm skips `RC[0]` (hence 23 entries and 23 rounds instead of 24). `RC[5]` is `0x8000000080008081` (`RC_LO[5]=0x80008081`, `RC_HI[5]=0x80000000`), matching the header note. Changing any value breaks hash compatibility with the server.
- `RCE`, `RC_O` — `Int32Array(23)` caches of the interleaved constants. They are recomputed inside every `DeepSeekHash.keccakF8` call (see 6.3), which is wasteful but correct.
- `RATE = 136` — SHA3-256 block rate in bytes (1088 bits). Drives the single-block assumption and the padding positions.
- `PAD = 0x06` — SHA3 domain separator (`01` + `000001`), as opposed to SHAKE's `0x1f`.

**Purpose:** encode the custom hash parameters. **Signature:** module-level constants. **Input:** none. **Output:** numbers/arrays. **Side effects:** none. **Edge cases:** any mismatch with the server's variant silently produces wrong nonces. **Design rationale:** extracting the constants from the WASM keeps the solver pure JS. **Dependencies:** used only by `DeepSeekHash.keccakF8` and `DeepSeekHash.solve`.

### 6.2 `evenBits(x)`, `ilE(lo, hi)`, `ilO(lo, hi)`
- **Purpose:** convert a 64-bit lane into two 32-bit "even bits" / "odd bits" words so 64-bit rotations become cheap 32-bit rotations.
- **Signature:** `evenBits(x: number) -> number` (16-bit result); `ilE(lo, hi) -> number`; `ilO(lo, hi) -> number`.
- **Input:** 32-bit integer halves of one lane.
- **Output:** interleaved 32-bit word. `ilE` gathers even-indexed bits, `ilO` gathers odd-indexed bits.
- **Side effects:** none; pure bit operations on signed 32-bit ints.
- **Edge cases:** JavaScript bitwise ops coerce to signed 32-bit; later comparisons use the same representation, so signedness is consistent. Inputs must be 32-bit.
- **Design rationale:** avoids `BigInt` (much slower) and maps 64-bit rotations to V8's fast 32-bit rotate patterns.
- **Dependencies:** used by `DeepSeekHash.keccakF8` and `DeepSeekHash.solve`.

### 6.3 `DeepSeekHash.keccakF8(s)`
- **Purpose:** run the custom 23-round Keccak permutation on an interleaved 50-word state.
- **Signature:** `DeepSeekHash.keccakF8(s: Int32Array(50)) -> void`.
- **Input:** state lanes stored as `s[2i] = even`, `s[2i+1] = odd`; mutated in place.
- **Output:** none; `s` is updated. After the final partial round only lanes `s[0..9]` (row `y=0`) are valid; the first 32 digest bytes live in `s[0..7]`.
- **Side effects:** writes the module-level `RCE`/`RC_O` caches and allocates a new `Int32Array(50)` scratch (`B`) on every call.
- **Edge cases:** not a general-purpose Keccak: only row 0 of the last round is computed, so squeezing more than 32 bytes would be wrong. Input must be 50 words.
- **Design rationale:** the server only needs a 32-byte digest, so the last round can be truncated; the rho+pi step is fused into the theta/chi code for speed.
- **Dependencies:** called by `dsSolve` (and conceptually by any full hash, which was removed from this file).

### 6.4 `class DeepSeekHash` / `dsSolve(challenge, prefix, maxNonce)`
- **Purpose:** find the smallest decimal nonce `n` in `[0, maxNonce)` such that `DeepSeekHashV1(prefix + n)` equals `challenge`.
- **Signature:** `DeepSeekHash.solve(challenge: hex-string(64), prefix: string, maxNonce: number) -> number | undefined`; `dsSolve(...)` is a thin wrapper.
- **Exports:** `DeepSeekHash` (class with static `solve`) and `dsSolve` (function) are both exported.
- **Input:** `challenge` is the 32-byte target as hex; `prefix` is `${salt}_${expire_at}_`; `maxNonce` is the server difficulty.
- **Output:** the matching nonce (`n`) or `undefined` if none is found / the message does not fit one block.
- **Side effects:** allocates `base`, `S`, and `solvePad` per call; pure CPU, no I/O.
- **Edge cases:**
  - `challenge` shorter than 32 bytes → `readInt32LE` throws `RangeError`.
  - `prefix` longer than `RATE - 2` (134 bytes) → immediately returns `undefined`, even if a nonce might exist; the fallback full-hash path was removed.
  - `maxNonce <= 0` → returns `undefined`.
  - Nonce digit width changes at 10, 100, 1000… handled by `digits`/`limit`.
- **Design rationale:** precompute the prefix block once; per nonce rebuild only lanes touched by the digits and pad, then compare the first four lanes directly (no hex conversion).
- **Dependencies:** `ilE`, `ilO`, `DeepSeekHash.keccakF8`.

**Real PoW example (verified):**
```text
prefix  = "salt_1234567890_"
nonce   = 4321
challenge = dshash(prefix + "4321")
        = "..." (32-byte hex)
dsSolve(challenge, prefix, 10000) -> 4321
dshash(prefix + "4321") === challenge -> true
```

### 6.5 `class ChatSession`
**Purpose:** wrap one conversation id and automatically advance `parent_message_id` after each turn.

#### `constructor(client, { id, parentMessageId = null } = {})`
- **Signature:** `new ChatSession(client: DeepSeek, opts?)`.
- **Input:** a client instance and an existing session id (required by `create`).
- **Output:** instance with `client`, `id`, `parentMessageId`.
- **Side effects:** none.
- **Edge cases:** `id` is not validated; `undefined` will produce server errors later.
- **Design rationale:** separates conversation state from transport.
- **Dependencies:** none.

#### `async chat({ prompt, parent_message_id, ref_file_urls = [], thinking_enabled = false, search_enabled = false } = {})`
- **Purpose:** send one turn and update the tracked parent message.
- **Signature:** returns the `parseEventStream` result object.
- **Input:** prompt (required in practice), optional parent override, file URLs, flags.
- **Output:** `{ message, thoughts, search_queries, search_results, search_indexes, message_id, parent_id, error }`.
- **Side effects:** network I/O; may upload files; mutates `this.parentMessageId` when `message_id` is a positive integer.
- **Edge cases:** `parent_message_id` uses `??`, so an explicit `null` cannot force a root message; it falls back to the stored id. A failed/empty response leaves the parent unchanged.
- **Design rationale:** callers can chain `.chat()` without managing message ids.
- **Dependencies:** `DeepSeek.chatCompletions`.

### 6.6 `class DeepSeek`

#### `constructor({ auth = "<HARDCODED>", clientVersion = "2.3.0", rangersId = "7865329968002107661", headers = {} } = {})`
- **Purpose:** build the authenticated HTTP header set.
- **Signature:** `new DeepSeek(opts?)`.
- **Input:** token, client version, rangers id, extra headers.
- **Output:** instance with `clientVersion`, `auth`, `baseHeaders`, `headers`.
- **Side effects:** none.
- **Edge cases:** omitting `auth` silently uses the leaked default token. `headers` overrides any base header, including `authorization`.
- **Design rationale:** centralizes the mobile-client headers so every endpoint uses the same identity.
- **Dependencies:** none (axios is used by methods).

#### `calculateHash(algorithm, challenge, salt, difficulty, expireAt)`
- **Purpose:** validate the algorithm and run `dsSolve` with the exact prefix format.
- **Signature:** `-> number | undefined`.
- **Input:** `algorithm` must be `"DeepSeekHashV1"`; `prefix = `${salt}_${expireAt}_``.
- **Output:** nonce, or `undefined` if not found.
- **Side effects:** logs `Hash solved in X.XXXs` to stdout; CPU-bound.
- **Edge cases:** unsupported algorithm throws `Error("Unsupported algorithm: ...")`.
- **Design rationale:** keeps the prefix format in one place.
- **Dependencies:** `dsSolve`.

#### `async create({ agent = "chat" } = {})`
- **Purpose:** create a new chat session.
- **Signature:** `-> ChatSession`.
- **Input:** `agent` passed to the server (default `"chat"`).
- **Output:** `ChatSession` whose `id` is `biz_data.chat_session.id`.
- **Side effects:** `POST https://chat.deepseek.com/api/v0/chat_session/create`.
- **Edge cases:** missing id → `Error("Failed to create new chat")`; non-2xx throws an Axios error.
- **Design rationale:** returns an object so callers get automatic parent tracking.
- **Dependencies:** axios, `ChatSession`.

#### `async createNewChat()`
- **Purpose:** backward-compatible helper returning only the id.
- **Signature:** `-> Promise<string>`.
- **Input:** none.
- **Output:** `session.id`.
- **Side effects:** same network call as `create()`.
- **Edge cases:** same as `create()`; cannot pass `agent`.
- **Design rationale:** ease migration from the old object-style client.
- **Dependencies:** `create`.

#### `async generateSignature(path)`
- **Purpose:** request a PoW challenge for a target path and return the value for `x-ds-pow-response`.
- **Signature:** `-> Promise<string>` (base64 JSON).
- **Input:** target path, e.g. `/api/v0/chat/completion`.
- **Output:** base64 of `{algorithm, challenge, salt, answer, signature, target_path}`.
- **Side effects:** `POST /api/v0/chat/create_pow_challenge`; CPU-bound solve; console log from `calculateHash`.
- **Edge cases:** missing challenge → `Error("Failed to obtain challenge.")`; nonce not found → `Error("PoW failed: nonce not found")`. `pow.status !== 200` is effectively dead code because axios rejects non-2xx.
- **Design rationale:** mirrors the mobile client's proof-of-work handshake.
- **Dependencies:** axios, `calculateHash`, `dsSolve`.

#### `async chatCompletions({ prompt, chat_session_id, parent_message_id = null, ref_file_urls = [], thinking_enabled = false, search_enabled = false })`
- **Purpose:** low-level send: upload references, solve PoW, POST the completion, parse SSE.
- **Signature:** `-> Promise<result | null>`.
- **Input:** same fields as `ChatSession.chat` plus required `chat_session_id`.
- **Output:** parsed result object, or `null` on a non-200 flag branch / non-string body without `biz_code`.
- **Side effects:** multiple network calls; console logs from `uploadFile` and `calculateHash`.
- **Edge cases:** `ref_file_ids` may contain `null` when `uploadFile` rejects a MIME type; a JSON error body with `biz_code` throws `Error("DeepSeek error <code>: <msg>")`; `response.status !== 200` is unreachable under axios defaults.
- **Design rationale:** keeps the session wrapper thin and lets callers use the raw API.
- **Dependencies:** `uploadFile`, `generateSignature`, axios, `parseEventStream`.

#### `async uploadFile(url)`
- **Purpose:** download a remote file, validate its type, upload it, and wait until DeepSeek finishes processing.
- **Signature:** `-> Promise<string | null>` (file id).
- **Input:** a public URL.
- **Output:** the file id reported by `biz_data.id` after status `SUCCESS`; `null` for a disallowed MIME type.
- **Side effects:** `GET url`, `POST /api/v0/file/upload_file`, up to 5 `GET /api/v0/file/fetch_files?file_ids=...` polls (5 s apart), console logs per attempt.
- **Edge cases:**
  - `content-type` missing → `.startsWith` throws.
  - `application/pdf; charset=binary` fails the exact allowlist check even though it is a PDF.
  - `fileTypeFromBuffer` returning `undefined` → destructuring throws.
  - `files[0]` missing → treated as pending; after 5 attempts it throws a timeout.
  - Status `FAILED` → throws immediately; a stuck job → throws after 5 attempts.
  - Non-200 upload → `null`, which callers push into `ref_file_ids`.
- **Design rationale:** the server requires a processed file id before it can be referenced.
- **Dependencies:** axios, `file-type`, `form-data`, `crypto`, `generateSignature`.

#### `parseEventStream(data)`
- **Purpose:** convert the SSE text body into one result object.
- **Signature:** `-> { message, thoughts, search_queries, search_results, search_indexes, message_id, parent_id, error }`.
- **Input:** raw response text (`data:` lines).
- **Output:** accumulated strings/arrays; ids default to `-1`; `error` defaults to `null`.
- **Side effects:** none.
- **Edge cases:** malformed JSON is silently skipped; `data:` with `{}` skipped; only the first text/thinking winner per event is applied; the first-fragment snapshot is handled; possible duplicate text if the server re-sends full snapshots `[NEEDS CONFIRMATION]`.
- **Design rationale:** tolerates both legacy delta format and the newer `v.response.fragments` format, fixing the "first word missing" bug from `apk.js`.
- **Dependencies:** none.

### 6.7 Module-level demo
- `isMain = process.argv[1] === fileURLToPath(import.meta.url)`.
- If true, the IIFE creates a session with the default token, sends `"haloo, apa kabar"`, and logs the parsed result. Errors are caught and printed.
- **Edge cases:** the current default export bug makes module evaluation fail before/around this run; do not rely on it until fixed.

## 7. Execution Flow & Data Flow
Main path (`create` → `chat`):
1. `create()` POSTs `{agent:"chat"}` with base headers.
2. Server returns `{data:{biz_data:{chat_session:{id}}}}`; a `ChatSession` is constructed.
3. `session.chat()` calls `chatCompletions` with the prompt, session id, and tracked parent.
4. For each `ref_file_urls` entry: `uploadFile` downloads the buffer, checks MIME, uploads multipart, polls until `SUCCESS`, returns `file_id`.
5. `generateSignature("/api/v0/chat/completion")` POSTs the target path.
6. The challenge is parsed; `prefix = salt + "_" + expire_at + "_"`.
7. `DeepSeekHash.solve` finds the nonce; `DeepSeekHash.keccakF8` computes candidate digests.
8. The answer is serialized to base64 JSON and sent as `x-ds-pow-response`.
9. `POST /api/v0/chat/completion` with `legacy_format: true` returns SSE text.
10. `parseEventStream` accumulates text/thinking/search data and ids.
11. `ChatSession.chat` updates `parentMessageId` from `message_id` when positive.

PoW internal flow (`dsSolve`):
1. Decode the 32-byte challenge and interleave into `t0..t7`.
2. Build `base` from `prefix` with `0x80` at `RATE-1`.
3. For each nonce `n`: render decimal digits at `pl..len-1`, write `PAD` at `len`.
4. Copy `base` into `S`, rebuild lanes `firstLane..len>>3`, run `DeepSeekHash.keccakF8`.
5. Compare `S[0..7]` to `t0..t7`; return `n` on match.
6. Return `undefined` if `maxNonce` is exhausted or `len > RATE-2`.

Data shape changes:
- Input URL → `ArrayBuffer` → `Buffer` → multipart body → `file_id` string.
- Challenge JSON → hex string → interleaved `Int32Array` digest → nonce number → base64 JSON header.
- SSE text → result object.

## 8. Configuration & Tuning
| Parameter | Location | Default | Raising / lowering effect | Risk |
|---|---|---|---|---|
| `auth` | `DeepSeek` constructor | `process.env.DEEPSEEK_TOKEN` (throws if empty) | Must be a valid token | 401/403; account ban if leaked |
| `clientVersion` | constructor | `"2.3.0"` | Server rejects `< 2.0.0` (`CLIENT_VERSION_TOO_LOW`) | Version checks may change |
| `rangersId` | constructor | `"7865329968002107661"` | Sent as `x-rangers-id`; must look like a device id | Spoofing/ban risk |
| extra `headers` | constructor | `{}` | Can override `authorization`, `content-type` | Easy to break requests |
| `agent` | `create()` | `"chat"` | Selects server-side agent | Unknown values may fail |
| `thinking_enabled` | `chat()` | `false` | Enables reasoning stream (more tokens) | Slower/costlier |
| `search_enabled` | `chat()` | `false` | Enables web search metadata | Extra server behavior |
| `difficulty` (server) | challenge response | e.g. 144000 | `dsSolve` loop bound | Higher = slower |
| poll interval | `uploadFile` | `5000 ms` | Lower = faster detection, more requests | Rate limits |
| MIME allowlist | `uploadFile` | image/*, text/*, JSON, PDF, DOC, DOCX | Add types to accept more files | Server may reject |
| `RATE`, `PAD` | constants | 136, 0x06 | Must match server | Any change breaks PoW |

## 9. Output Schema
`parseEventStream` result:
| Field | Type | Nullable | Example |
|---|---|---|---|
| `message` | string | no (may be `""`) | `"Halo! Saya baik..."` |
| `thoughts` | string | no (may be `""`) | `"The user greets..."` |
| `search_queries` | array | no | `["latest news"]` |
| `search_results` | array | no | `[{title,url,snippet}]` (server-shaped) |
| `search_indexes` | array | no | `[0,1]` |
| `message_id` | number | no | `123456789` |
| `parent_id` | number | no | `987654321` |
| `error` | string \| null | yes | `"rate limited"` |

`create()` → `ChatSession` with `{ client, id, parentMessageId }`.
`generateSignature()` → base64 string decoding to:
```json
{
  "algorithm": "DeepSeekHashV1",
  "challenge": "<64 hex chars>",
  "salt": "<salt>",
  "answer": 1234,
  "signature": "<signature>",
  "target_path": "/api/v0/chat/completion"
}
```
`dsSolve()` → `number | undefined`.
`uploadFile()` → `string` file id or `null`.

Sample result (illustrative values, not a real run):
```json
{
  "message": "Halo! Saya baik, terima kasih.",
  "thoughts": "",
  "search_queries": [],
  "search_results": [],
  "search_indexes": [],
  "message_id": 100000001,
  "parent_id": 100000000,
  "error": null
}
```

## 10. Common Errors & Failure Modes
| Symptom | Root cause | Diagnose | Solution |
|---|---|---|---|
| `ReferenceError: deepseek is not defined` on import | broken `export default deepseek;` | run the import test | remove the line or export `DeepSeek` |
| `CLIENT_VERSION_TOO_LOW` | stale `x-client-version` | inspect the response body | use `2.3.0`+ |
| 401/403 | invalid/expired token | log headers (redact token) | pass a fresh `auth` |
| `Failed to obtain challenge.` | unexpected challenge JSON | log `pow.data` | verify endpoint/headers |
| `PoW failed: nonce not found` | difficulty higher than any found nonce; prefix too long; wrong hash | check `len`, `maxNonce`, algorithm | raise `maxNonce`, verify hash variant |
| Stuck at `DEEPSEEK CHECKING FILE...` | server never reports `SUCCESS` | poll logs | add timeout/retry cap; use text-bearing files |
| `Cannot destructure property 'ext'` | `fileTypeFromBuffer` returned `undefined` | log buffer magic bytes | guard `if (!ft) throw ...` |
| `Cannot read properties of undefined (reading 'startsWith')` | missing `content-type` | log response headers | default to `""` and reject |
| Infinite `while (true)` | status `FAILED`/never terminal | count polls | add deadline + handle failure |
| `DeepSeek error <code>: <msg>` | server rejected request | inspect `biz_code` | fix payload/params |
| Duplicated first words | repeated full fragment snapshots | compare event stream | dedupe by fragment id `[NEEDS CONFIRMATION]` |

## 11. Performance & Scalability
- PoW is CPU-bound and single-threaded. Cost scales linearly with difficulty × permutation cost.
- Header note claims WASM ≈8400 hashes/s vs this Uint32 path ≈5300 hashes/s; a local smoke test solved nonce 4321 in ~0.38 s (machine-dependent, illustrative).
- Waste per permutation: `DeepSeekHash.keccakF8` re-interleaves all 23 round constants on every call and allocates a new `Int32Array(50)` for `B`. Moving both to module scope would remove per-hash overhead.
- `dsSolve` precomputes the prefix block and rebuilds only affected lanes per nonce, so per-nonce work is dominated by the permutation itself.
- Network calls are sequential: uploads, then challenge, then completion. Each upload waits up to 5 s per poll.
- No request pooling, retry/backoff, rate limiting, or cancellation.

## 12. Security, Ethics & Compliance
- **Leaked token:** the constructor's default `auth` is a real-looking Bearer token. Rotate it and never commit it. Always pass `<API_KEY>` via an environment variable.
- **Unofficial API:** endpoints are private mobile-client APIs with a custom PoW. They are undocumented and may change; using them may violate DeepSeek's ToS. Assess legal and account risk.
- **Device spoofing:** `x-rangers-id` and the Android User-Agent imitate the app. This can be considered circumvention; do not use it to evade controls.
- **Untrusted URLs:** `uploadFile` fetches any URL the caller supplies (SSRF risk if the URL comes from users). Validate/allowlist hosts and size in a service context.
- **File handling:** uploads keep the whole file in memory; no size limit is enforced locally.
- **Logging:** logs file ids and hash timing; redact tokens.
- **No secrets in examples:** use placeholders only.

## 13. Assumptions, Limitations & Technical Debt
- `🐞 Bug:` `export default deepseek;` → module is not importable. Fix: delete the line or use `export default DeepSeek;`.
- `🐞 Bug:` hardcoded default `auth` token (secret exposure). Fix: remove the default, require `auth`, or default to `process.env.DEEPSEEK_TOKEN`.
- `🐞 Bug:` `uploadFile` infinite loop with no deadline/retry cap and no `FAILED` handling. Fix: cap attempts and throw on terminal status.
- `🐞 Bug:` `const { ext } = await fileTypeFromBuffer(buffer)` throws when the result is `undefined`. Fix: check and fall back to a MIME-derived extension.
- `🐞 Bug:` `mimetype.startsWith` throws if `content-type` is missing; exact allowlist rejects parameterized content types. Fix: `const ct = (response.headers["content-type"] || "").split(";")[0].trim()`.
- `🐞 Bug:` `ref_file_ids.push(file_id)` can push `null` when `uploadFile` returns `null`. Fix: filter/reject.
- `🐞 Bug:` `data.data.biz_data.files[0]` assumes at least one file. Fix: guard the array and handle `status === "FAILED"`.
- `🐞 Bug:` `pow.status !== 200` / `response.status !== 200` checks are dead under axios's default `validateStatus`. Fix: rely on try/catch or set `validateStatus`.
- `🐞 Bug:` `dsSolve` returns `undefined` (instead of falling back) when `prefix` exceeds `RATE-2`; the full-hash fallback was removed. Fix: restore a full hash fallback if long prefixes are possible.
- `🐞 Bug:` `RCE`/`RC_O` recomputed and `B` allocated on every permutation. Fix: precompute module-level and reuse scratch.
- Limitation: the last round computes only row 0, so `DeepSeekHash.keccakF8` cannot produce a full digest; only 32 bytes are valid.
- Limitation: no streaming callbacks; the full SSE body is buffered before parsing.
- Limitation: no cancellation/timeouts on axios calls.
- Assumption: file URLs are publicly accessible and return a recognizable `content-type`.
- Assumption: the server still accepts `legacy_format: true` and the fragment/delta shapes handled here.
- Technical debt: the file mixes crypto, transport, and demo code; `dshash` and several helpers were removed, leaving a large explanatory comment block.

## 14. Modification Guide
Fix the module export first:
1. In `deepseek_apk.js`, replace `export default deepseek;` with `export default DeepSeek;` (or delete it).
2. Verify with:
```bash
node --input-type=module -e "import('./deepseek_apk.js').then(m=>console.log(Object.keys(m)))"
```
Expected: `[ 'DeepSeek', 'ChatSession', 'dsSolve', 'default' ]`.

Require an explicit token (author's plan: remove the hardcoded default later, but add validation now):
1. In the `DeepSeek` constructor, keep the default temporarily if needed, but throw a clear error when `auth` is empty/undefined.
2. Update the demo IIFE to pass `{ auth: process.env.DEEPSEEK_TOKEN }`.
3. Later remove the hardcoded default entirely and read `process.env.DEEPSEEK_TOKEN`.
4. Test with the import check and a dry-run that never logs the token.

Harden uploads:
1. In `uploadFile`, normalize `content-type` before matching.
2. Guard `fileTypeFromBuffer` and derive `ext` from the MIME type as a fallback.
3. Replace `while (true)` with a maximum of **5 poll attempts** (author's chosen limit), then throw on `FAILED`/timeout.
4. In `chatCompletions`, reject `null` file ids before building `ref_file_ids`.

Optimize / refactor PoW (author's preference):
1. Extract the hash/PoW logic into a `class DeepSeekHash` (author suggestion) instead of free functions.
2. Move `RCE`/`RC_O` initialization to module scope (already declared; remove the per-call loop in `DeepSeekHash.keccakF8`).
3. Move `B` to module scope and reuse it.
4. Benchmark with the pure test in section 15; compare before/after.

Danger zones:
- Changing `RATE`, `PAD`, round constants, or the number of rounds breaks server compatibility.
- Changing header names/values or the `legacy_format` flag may change the response shape.
- Do not assume the SSE first-fragment shape is stable.

Safe extension points:
- Add retry/backoff around axios calls.
- Add an options object for poll interval/deadline.
- Add a `close()`/cancel hook.
- Add typed wrappers around `chatCompletions` for search/thinking toggles.

## 15. Testing & Verification
Pure PoW test (no network; import `dshash` from `dshashv5.js`):
```bash
node --input-type=module -e "
import { dshash } from './dshashv5.js';
import { dsSolve } from './deepseek_apk.js';
const prefix = 'salt_1234567890_';
const n = 4321;
const ch = dshash(prefix + n);
const a = dsSolve(ch, prefix, 10000);
console.log(a, dshash(prefix + a) === ch);
"
```
Expected (verified): `4321 true`.

Import smoke test:
```bash
node --input-type=module -e "import('./deepseek_apk.js').then(m=>console.log(Object.keys(m))).catch(e=>{console.error(e.name, e.message); process.exit(1)})"
```
Currently fails with `ReferenceError deepseek is not defined`; after the fix it should print the export names.

Offline parser test (no network):
```bash
node --input-type=module -e "
import { DeepSeek } from './deepseek_apk.js';
const ds = new DeepSeek({ auth: '<API_KEY>' });
const r = ds.parseEventStream('data: {\"v\":{\"response\":{\"fragments\":[{\"type\":\"RESPONSE\",\"content\":\"Hi\"}]}}}\n');
console.log(r.message);
"
```
Expected: `Hi`.

Live smoke test (network, needs a real token and permission):
```bash
node deepseek_apk.js
```
Expected: a session id and a parsed reply; requires fixing the export bug first.

Failure-path tests:
- `uploadFile("https://example.com/unknown.bin")` should not hang; with the current code it may throw on `fileTypeFromBuffer`.
- `generateSignature` with a stub difficulty of 0 should throw `PoW failed`.
- `parseEventStream("data: {\"type\":\"error\",\"content\":\"x\"}")` should set `error`.

## 16. Glossary
- **PoW** — proof of work: find a nonce whose hash meets the server's target.
- **`DeepSeekHashV1`** — DeepSeek's custom SHA3-256 variant: 23 rounds, `RC[0]` skipped.
- **Keccak-f[1600]** — the permutation underlying SHA3; here truncated to 23 rounds.
- **Rate (`RATE`)** — bytes absorbed per block (136 for SHA3-256).
- **Lane** — one 64-bit Keccak word, stored here as two 32-bit words (even/odd bits).
- **SSE** — Server-Sent Events; the completion stream uses `data:` lines.
- **Interleave** — split a 64-bit lane's even and odd bits into separate 32-bit words.
- **Fragment** — a piece of the response in the newer `v.response.fragments` format.
- **`parent_message_id`** — id of the previous message, needed to continue a conversation.

## 17. References & Docs
- Raw file URL: `https://moonstar.cyou/snippet/code/deepseek_apk.js` (same name locally and upstream). Content was not fetched, so this document is verified only against the local copy.
- Author: `andhikagg` (per user). No license declared.
- Original WASM project referenced by the header: `https://raw.githubusercontent.com/Paxsenix0/Paxsenix0/refs/heads/main/sha3_wasm_bg.wasm`.
- DeepSeek chat web/API host used: `https://chat.deepseek.com/api/v0/...` (unofficial; no public documentation).
- SHA3/Keccak specification: FIPS 202 (rate/padding/round constants).
- axios: `https://axios-http.com/` (interceptors, `validateStatus`, `responseType`).
- `file-type`: `https://github.com/sindresorhus/file-type` (`fileTypeFromBuffer` may return `undefined`).
- `form-data`: `https://github.com/form-data/form-data` (`getHeaders()`, Buffer append).
- Node `crypto.randomUUID`: `https://nodejs.org/api/crypto.html`.

## 18. Credits & Attribution
- **Paxsenix0** — original `apk.js` client and the WASM SHA3 helper (`sha3_wasm_bg.wasm`) referenced in the header: `https://raw.githubusercontent.com/Paxsenix0/Paxsenix0/refs/heads/main/sha3_wasm_bg.wasm`.
- **andhikagg** — author of this `deepseek_apk.js` rewrite (user-provided), including the pure-JS Uint32 Keccak/PoW implementation.
- **DeepSeek** — owner of the reverse-engineered Android API and `ds_tai.wasm`; the `DeepSeekHashV1` round constants and protocol behavior derive from that binary. The code also notes that the Uint32 technique matches DeepSeek's official JS fallback (worker 76608).
- **Related workspace implementations** (reference/lineage only; authorship not independently verified): `dshashv5.js`, `dshash32.js`, `ds_hash.js`, `dshashv3.js` (pure hash/PoW variants), `apk_fixed.js` (WASM client + fixes), `deepseek.js` (class-based client), and `p.js` (WASM loader/server).
- No license is declared for `deepseek_apk.js`; third-party code remains the property of its respective authors.

## Appendix: Open Questions

### Verification status
- [RESOLVED] The client is a reverse-engineered imitation of the DeepSeek Android app (user-provided).
- [NEEDS CONFIRMATION] Has the full client ever completed a live request? The user did not confirm a successful chat/upload; only the PoW path was verified locally.
- [RESOLVED] Token origin: it is the author's personal DeepSeek account token (user-provided). Treat it as compromised; remove/rotate it.
- [NEEDS CONFIRMATION] Token lifetime: the user guesses "maybe never expires".
- [NEEDS CONFIRMATION] Server `difficulty` has never been observed by the user; the `144000` figure comes only from the file header.
- [NEEDS CONFIRMATION] Whether `maxNonce = difficulty` always suffices (user does not know).

### Author decisions (from questionnaire)
- [DECISION] Fix the `export default deepseek;` bug first.
- [DECISION] Remove the hardcoded token later, but add validation now for an empty `auth` input in the class.
- [DECISION] Cap `uploadFile` polling at **5 attempts**.
- [DECISION] `fileTypeFromBuffer` returning `undefined` is still unresolved (author does not know the right fallback).
- [DECISION] Preferred refactor: extract the hash/PoW into `class DeepSeekHash`.
- [DECISION] No other documentation notes requested.

### Provenance
- [RESOLVED] Raw file URL: `https://moonstar.cyou/snippet/code/deepseek_apk.js` (user-provided).
- [RESOLVED] Author: `andhikagg` (user-provided).
- [RESOLVED] License: none declared (user-provided).
- [RESOLVED] Created date: `2026-11-03`; last modified: `2026-11-03` (user-provided).
- [RESOLVED] No separate version/commit/repo is known; the raw URL is the source (user answered "url sendiri").
- [RESOLVED] Upstream and local file names are both `deepseek_apk.js` (no rename).

### Hash / PoW (`DeepSeekHash.keccakF8`, `DeepSeekHash.solve`, `dsSolve`, `calculateHash`)
- [NEEDS CONFIRMATION] Is `DeepSeekHashV1` still 23 rounds with `RC[0]` skipped, `RATE = 136`, and `PAD = 0x06`?
- [NEEDS CONFIRMATION] What is the current server `difficulty`, and is `maxNonce = difficulty` always sufficient?
- [NEEDS CONFIRMATION] Can `salt`/`expire_at` ever make `prefix` longer than `RATE - 2` (134 bytes), which currently returns `undefined` without a full-hash fallback?
- [NEEDS CONFIRMATION] Does the server compare the full 32-byte digest, or only the first four lanes that `dsSolve` checks?
- [NEEDS CONFIRMATION] Is `challenge` always exactly 64 hex characters (32 bytes)? Shorter input throws in `readInt32LE`.
- [NEEDS CONFIRMATION] Is the nonce the smallest valid decimal integer starting at 0, written with no leading zeros?
- [NEEDS CONFIRMATION] Must `answer` be a JSON number (as sent), or does the server accept a string?
- [NEEDS CONFIRMATION] Is the exact prefix format `${salt}_${expireAt}_` (single underscores, no trimming) still correct?
- [NEEDS CONFIRMATION] Are there endpoints that need more than 32 digest bytes, which the row-0-only final round cannot provide?
- [INFERENCE] The claimed `~5300 hash/s` may be machine-dependent; what is the target throughput for production use?

### Session / transport (`create`, `chatCompletions`)
- [NEEDS CONFIRMATION] Is `agent: "chat"` the only valid value, or are there others? (user does not know)
- [RESOLVED] `x-client-version: "2.3.0"` is accepted (user-confirmed).
- [NEEDS CONFIRMATION] Is `x-rangers-id` validated, and what format/length does it require? (user does not know)
- [RESOLVED] The session id is read from `biz_data.chat_session.id`, matching the actual result (user-confirmed).
- [NEEDS CONFIRMATION] Are `message_id` / `parent_id` always numeric, and can they be `0`? (user: "maybe, not sure")
- [NEEDS CONFIRMATION] Is `legacy_format: true` still supported? What changes when it is `false`? (user does not know)
- [NEEDS CONFIRMATION] Are there rate limits, concurrency limits, or per-session message caps? (user does not know)
- [RESOLVED] No `biz_code` errors have been observed yet (user).
- [RESOLVED] Only the `authorization` header is needed; no extra cookies/headers in the user's experience.
- [NEEDS CONFIRMATION] Is there a token refresh flow? (user does not know)

### SSE / `parseEventStream`
- [NEEDS CONFIRMATION] Are `v.response.fragments` snapshots cumulative, so repeated snapshots would duplicate `message`?
- [NEEDS CONFIRMATION] Are fragment events always `type: "RESPONSE"`, or are there other content types?
- [NEEDS CONFIRMATION] Are `search_queries`, `search_results`, and `search_indexes` cumulative (replace) or incremental (append)? The code replaces.
- [NEEDS CONFIRMATION] Are there `p` values other than `response/content` and `response/fragments/-1/content` that carry text?
- [NEEDS CONFIRMATION] Can `doc.v` be a nested object while also carrying text, causing double-counting?
- [NEEDS CONFIRMATION] Is the error event always `type: "error"` with `content`, or can it arrive as `finish_reason` only?
- [NEEDS CONFIRMATION] Are `{}` heartbeats the only payloads to skip?
- [NEEDS CONFIRMATION] Can `choices` contain more than one entry, or non-`choices[0]` deltas?
- [NEEDS CONFIRMATION] Is a final `message_id`/`parent_id` guaranteed in the stream or in a terminal event?

### File upload (`uploadFile`)
- [NEEDS CONFIRMATION] Which terminal statuses can `fetch_files` return (`SUCCESS`, `FAILED`, `ERROR`, …), and what is a safe poll deadline? (user does not know)
- [NEEDS CONFIRMATION] Is `files` guaranteed non-empty and in the same order as `file_ids`? (user does not know)
- [RESOLVED] In the user's experience, `content-type` is plain (no `; charset=...` parameter), so the exact allowlist works in practice.
- [NEEDS CONFIRMATION] What is the maximum file size? (user does not know)
- [NEEDS CONFIRMATION] Is the real MIME allowlist exactly the four types plus `image/*`/`text/*`? (user does not know)
- [INFERENCE] The file may need to contain text to reach `SUCCESS` (user: "maybe"; the code comment claims it).
- [NEEDS CONFIRMATION] Does `file-type` return `undefined` for plain `.txt`/unknown buffers? (user does not know)
- [NEEDS CONFIRMATION] Is setting `Content-Type: undefined` before spreading `data.getHeaders()` required to preserve the multipart boundary? (user does not know)
- [NEEDS CONFIRMATION] Should `null` file ids be filtered out, or does the server tolerate `null` in `ref_file_ids`? (user does not know)
- [RESOLVED] Multiple uploaded ids are carried in the `ref_file_ids` array; the current `fetch_files` request is made per single `file_id`.
- [NEEDS CONFIRMATION] How long does a typical upload take to reach `SUCCESS`? (user does not know)

### Runtime / security / operations
- [RESOLVED] Target Node version is 22+ (user-provided); the source syntax works on older versions, but `file-type` may not.
- [NEEDS CONFIRMATION] Is `file-type` v22 (ESM-only) the intended version, and does it work with this import style on all targets? (user does not know)
- [RESOLVED] No explicit axios timeout/`AbortSignal` is required in the author's use (user answer: "not needed").
- [RESOLVED] No proxy/WAF/Cloudflare handling is required in the author's experience (user answer: "no").
- [NEEDS CONFIRMATION] Can `uploadFile` be abused for SSRF if `ref_file_urls` comes from untrusted users? (user does not know)
- [RESOLVED] Legal/ToS status depends on DeepSeek's policy (user: "depends on the provider").
- [RESOLVED] `RCE`/`RC_O` are safe under the current single-threaded synchronous use (user-confirmed); multi-worker use remains untested.
