# API reference

All paths below start with `/api/v1`. Send JSON with `Content-Type:
application/json`; bodies are limited to 2 MB. Signed-in requests use
`Authorization: Bearer <session-token>`. Successful requests return JSON unless
listed as 204, which has no body.

## Public library

| Method and path | Parameters | Response |
| --- | --- | --- |
| `GET /health` | None | 200: `{"status":"ok","apiVersion":"v1"}` after checking PostgreSQL |
| `GET /stories` | Optional `language=en|id|tl`, `category`, `difficulty=A1|A2|B1|B2|C1|C2`, `limit` (1–100, default 30), `after` (story ID) | 200: `{stories:[summary],next:ID|null}`; published stories only |
| `GET /stories/:id` | Story ID | 200: full authoring content plus `vocabulary`, `level`, `status`, `updatedAt` |
| `GET /stories/:id/translations` | Required `language=en|id|tl` | 200: `{language,title,summary,sentences:[string]}` |
| `GET /stories/:id/vocabulary` | Optional `language=en|id|tl` | 200: `{vocabulary:[lexeme]}` |

Story summaries include `id`, `family`, `category`, `difficulty`, all-language
`title` and `summary`, derived Android `level`, publication `status`, and ISO
`updatedAt`. They omit paragraphs and vocabulary. Full story and lexeme shapes
are in [Stories](STORIES.md) and the [complete JSON example](examples/story.json).
Public detail requests for draft or missing stories return 404.

```sh
curl 'http://localhost:3000/api/v1/stories?difficulty=A1&language=en&limit=10'
curl http://localhost:3000/api/v1/stories/market_beginner
curl 'http://localhost:3000/api/v1/stories/market_beginner/translations?language=id'
```

Follow `next` using `after` until `next` is null. Lists sort by ID, not update time.
Categories must match exactly; URL-encode category names with spaces.

## Accounts

| Method and path | JSON body | Response |
| --- | --- | --- |
| `POST /auth/register` | `{email,password,displayName}` | 201: `{token,expiresAt,user:{id,email,displayName,role}}` |
| `POST /auth/login` | `{email,password}` | 200: same session shape |
| `POST /auth/logout` | None; current bearer session required | 204: session revoked |
| `GET /me` | None; signed in | 200: `{id,email,displayName,role}` |
| `PUT /me` | `{displayName}`; signed in | 200: `{id,displayName}` |

Email must be valid and at most 254 characters. Passwords are 12–128 characters;
display names are trimmed and 1–100 characters. Registration creates a `learner`;
the server rejects extra fields such as `role`. Only the administrative script
can promote an editor. Session expiration is an ISO timestamp, while learning
timestamps below are milliseconds since the Unix epoch.

Example registration body (placeholders only):

```json
{
  "email": "learner@example.com",
  "password": "<your 12–128 character password>",
  "displayName": "Maya"
}
```

```sh
# ROLANG_TOKEN represents your session in a private shell.
curl http://localhost:3000/api/v1/me -H "Authorization: Bearer $ROLANG_TOKEN"
curl -X PUT http://localhost:3000/api/v1/me \
  -H "Authorization: Bearer $ROLANG_TOKEN" -H 'Content-Type: application/json' \
  --data '{"displayName":"Maya"}'
```

Passwords use salted scrypt; the database stores only token hashes. Sessions last
30 days by default. Database-backed registration/login rate limits allow 20
attempts per email and 100 per IP in 15 minutes across server instances. Android
stores session tokens encrypted using Keystore and does not persist passwords.
Email verification and password recovery are not implemented.

## Learner records

All routes in this table require sign-in. Keys belong to the signed-in account;
clients cannot request another learner's records.

| Resource | GET list | PUT or DELETE one | Record kind |
| --- | --- | --- | --- |
| Reading | `/me/progress` | `/me/progress/:key` | `progress` |
| Reading history | `/me/history` | Use progress routes | `progress` |
| Vocabulary | `/me/vocabulary` | `/me/vocabulary/:key` | `vocabulary` |
| Review events | `/me/reviews` | `/me/reviews/:key` | `review` |
| Learning preferences | `/me/preferences` | `/me/preferences/:key` | `profile` |

GET lists return 200: `{"records":[record],"next":null}`. They accept optional
`limit` (1–500, default 100) and `after` (record key), sort by key, and omit
tombstones. `/me/history` returns the same saved positions/completion as
`/me/progress`; it is not a log of every reading visit. PUT replaces a full record
and returns 200 with its envelope. DELETE writes a tombstone and returns 204.
Use sync to download deletions.

```json
{
  "kind": "progress",
  "key": "market_beginner:en",
  "data": {"storyId":"market_beginner","language":"en","sentence":1,"completed":false},
  "deleted": false,
  "revision": 42
}
```

| Kind | Key | Required data |
| --- | --- | --- |
| `progress` | `storyId:language` | `storyId`, `language`, zero-based `sentence` (0–299), `completed` boolean |
| `vocabulary` | `language:reference:storyId:normalizedWord` | Complete vocabulary body below |
| `review` | UUID for this event | `vocabularyKey`, `language`, `reference`, `reviewedAt`, `correct`, `rating` |
| `profile` | `preferences` | `target`, `native`, `level`, `fontSize`, `dark` |

Progress completion stays true across rereads and devices. Delete progress to
reset completion. Language codes are `en`, `id`, `tl`; reference is the language
used for translations. Vocabulary keys distinguish stories and language pairs.
URL-encode keys when using them in paths.

Complete vocabulary request body:

```json
{
  "language": "en", "reference": "id", "word": "reads",
  "translation": "membaca", "meaning": "Understands written words.",
  "partOfSpeech": "verb", "explanation": "Present tense.",
  "example": "Maya reads.", "exampleTranslation": "Maya membaca.",
  "storyId": "reader_a1", "storyTitle": "The reader", "category": "Everyday life",
  "createdAt": 1000, "dueAt": 2000, "lastReviewedAt": 0,
  "repetitions": 0, "intervalDays": 0, "ease": 2.5, "lapses": 0,
  "mastered": false, "status": "LEARNING", "statusChangedAt": 1000
}
```

`status` is `NEW`, `LEARNING`, `ALMOST_MASTERED`, or `KNOWN`; `mastered` must be
true exactly when status is Known. `statusChangedAt` records the latest status
update, manual or automatic. For older clients, these two new fields are optional:
the server infers status from `mastered`/`repetitions` and defaults the timestamp
to 0. It returns normalized fields for old database rows too. Other vocabulary
fields are required. Counters are integers 0–1,000,000, intervals 0–365 days,
ease 1.3–100, and timestamps integers 0–8,640,000,000,000,000. Text values must be
nonempty; normalized words are at most 120 characters.

Review example:

```json
{
  "vocabularyKey": "en:id:reader_a1:reads", "language": "en", "reference": "id",
  "reviewedAt": 2000, "correct": true, "rating": "GOOD"
}
```

Ratings are `AGAIN`, `HARD`, `GOOD`, `EASY`. Record an event and its updated
vocabulary schedule together in one sync request; PUT of a review alone does
not recalculate mastery. Android computes the schedule. Preferences use
`level=BEGINNER|INTERMEDIATE|ADVANCED`, `fontSize=16–28`, and a boolean `dark`:

```json
{"target":"en","native":"id","level":"BEGINNER","fontSize":20,"dark":false}
```

## Synchronization

`POST /me/sync` requires sign-in. Send a nonnegative revision `cursor` and at most
100 operations. Each operation has a fresh UUID `id`, valid `kind`/`key`,
`deleted`, and complete `data`. Tombstones require `deleted:true,data:null`.

```sh
curl -X POST http://localhost:3000/api/v1/me/sync \
  -H "Authorization: Bearer $ROLANG_TOKEN" -H 'Content-Type: application/json' \
  --data '{"cursor":0,"operations":[{"id":"00000000-0000-4000-8000-000000000001","kind":"progress","key":"market_beginner:en","deleted":false,"data":{"storyId":"market_beginner","language":"en","sentence":1,"completed":false}}]}'
```

200 response:

```json
{
  "acknowledged": ["00000000-0000-4000-8000-000000000001"],
  "records": [{
    "kind":"progress", "key":"market_beginner:en",
    "data":{"storyId":"market_beginner","language":"en","sentence":1,"completed":false},
    "deleted":false, "revision":42
  }],
  "cursor":42, "hasMore":false
}
```

Records include up to 500 changes ordered by revision, including tombstones.
Follow `hasMore` with the returned cursor, even with no uploads. Retries must keep
the original operation UUID and payload; a new edit needs a new UUID. Reusing an
ID with changed data returns `OPERATION_CONFLICT` (409). `CURSOR_INVALID` (409)
means reset the cursor to zero and retry with existing queued operations. See
[Learning system](LEARNING_SYSTEM.md) for transaction and conflict rules.

## Content administration

All of these endpoints require an account with role `admin`.

| Method and path | Body / query | Response |
| --- | --- | --- |
| `GET /admin/stories` | Optional `limit` (1–100, default 30), `after` ID | 200: `{stories:[fullStory],next:ID|null}`, including drafts |
| `POST /stories` | Full [authoring JSON](examples/story.json) | 201: full story, initially draft |
| `PUT /stories/:id` | Full authoring JSON with matching ID | 200: replaced story, publication status retained |
| `POST /stories/:id/publish` | `{"published":true}` or `{"published":false}` | 200: full story with new status |
| `DELETE /stories/:id` | None | 204; learner history remains |

See [Stories](STORIES.md) for executable examples.

## Errors

```json
{"error":{"code":"VALIDATION_ERROR","message":"Request validation failed.","fields":[{"path":"difficulty","message":"Invalid option"}]}}
```

`fields` is present for validation failures; other errors have `code` and
`message`. SQL, database connection details, and passwords are never included.

| HTTP status | Meaning / typical code |
| --- | --- |
| 400 | Invalid shape or key (`VALIDATION_ERROR`), malformed JSON (`INVALID_JSON`), mismatched story ID (`INVALID_ID`) |
| 401 | Missing/expired session (`UNAUTHENTICATED`) or failed login (`INVALID_CREDENTIALS`) |
| 403 | Administrator role required (`FORBIDDEN`) |
| 404 | Missing route, missing story, or unpublished public story (`NOT_FOUND`) |
| 409 | Duplicate account/story (`ALREADY_EXISTS`), changed retry (`OPERATION_CONFLICT`), invalid sync cursor (`CURSOR_INVALID`) |
| 413 | Body exceeds 2 MB (`BODY_TOO_LARGE`) |
| 429 | Registration/login attempt limit (`RATE_LIMITED`) |
| 503 | Temporary server/database error (`SERVICE_UNAVAILABLE`) |
