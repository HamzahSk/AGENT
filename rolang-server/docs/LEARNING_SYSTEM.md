# Vocabulary and learning

Android owns learning decisions and local persistence. The backend validates and
synchronizes the results; it does not run quizzes or compute a new schedule when
it receives a review. This keeps reading and practice fully available offline.

## Four statuses and colors

| API status | Display | Meaning |
| --- | --- | --- |
| `NEW` | Blue | No saved learning record yet, or manually reset to New |
| `LEARNING` | Green | Saved for practice; still building familiarity |
| `ALMOST_MASTERED` | Yellow | At least three successful repetitions, or a manual choice |
| `KNOWN` | No highlight | Mastered automatically or manually; reviews are paused |

Every word in a paragraph is tappable, including Known words. The detail sheet
shows the translation, meaning, part of speech, explanation, paragraph example,
and current status. Saving a new word starts it in Learning, due immediately.
Choosing a status for an unsaved word saves its details and status in one local
transaction. The same color palette is used in the reader, vocabulary, and review
screens, with labels so color is not the only cue.

Vocabulary follows the existing key `language:reference:storyId:normalizedWord`.
Repeated occurrences in the same story share a status; language pairs and story
contexts retain separate learning records. Normalization lowercases the word and
replaces curly apostrophes. Inflections remain distinct.

## Automatic progression and spaced repetition

Multiple-choice and written-recall quizzes use the same scheduler. Answer
matching ignores case, accents, and punctuation, and accepts explicitly supplied
translation alternatives separated by `;` or `/`. Partial answers are rejected.
After checking the answer, the learner rates it Again, Hard, Good, or Easy.

| Result / rating | Scheduling and status |
| --- | --- |
| Incorrect answer, or Again | Reset consecutive repetitions and interval to 0, increment lapses, reduce ease by 0.2, return to Learning, review in 10 minutes |
| Correct + Hard | Increment repetitions, reduce ease by 0.15, interval about 1.2× old interval (minimum 1 day), status Learning |
| Correct + Good | First interval 1 day, second 6 days, then about old interval × ease |
| Correct + Easy | First interval 4 days, second 8 days, then about old interval × ease × 1.3; increase ease by 0.15 |

Ease starts at 2.5 and never falls below 1.3. Intervals are rounded to whole days
and capped at 365. Good/Easy reviews reach Almost Mastered at three consecutive
repetitions. At five or more repetitions, an interval of at least 21 days, and a
Good/Easy rating, the word becomes Known. Five Good reviews from a fresh schedule
typically give intervals of 1, 6, 15, 38, and 95 days.

Manual Almost Mastered remains Almost Mastered through successful Good/Easy
reviews even if its repetition count is lower; Hard/Again can lower it. Manually
choosing New or Learning resets consecutive repetitions and interval and makes
the word due now. Manual Known sets `mastered=true` and pauses reviews; choosing
another status unpauses it. Manual changes do not invent successful reviews or
erase historical outcomes/lapses.

`statusChangedAt` records manual and automatic changes. An open quiz must still
match the stored vocabulary snapshot before its rating can commit. A manual edit,
sync update, deletion, early review, or repeated submission rejects the stale
quiz. Leaving a quiz without a rating does not modify its schedule.

## Local data and history

Room stores saved words, schedules, paragraph positions, completion, review
events, cached remote content, and pending operations. Learning preferences live
in DataStore. Completing a story requires **Finish story**; scrolling records a
paragraph position and does not automatically complete it. The reading indicator
shows the last paragraph currently visible, while reopening resumes near the
first visible paragraph. Rereading preserves prior completion.

Each rated quiz logs its timestamp, correctness, effective rating, and vocabulary
key in the same transaction as the schedule and queued uploads. These events
drive accuracy and review streaks. Removing a word deletes its schedule and
queues a tombstone while retaining historical review statistics. Account sign-out
keeps local learning data. Clearing app data or uninstalling removes it.

## Online synchronization

1. A local write also queues an operation UUID in the same Room transaction.
2. WorkManager runs when connected, with retry/backoff and a configurable periodic
   job. **Sync now** in Profile offers a manual retry.
3. `/me/sync` accepts up to 100 operations and returns acknowledged IDs plus up to
   500 revised records. The client follows `hasMore` and saves the cursor.
4. The client removes only the exact acknowledged UUIDs and commits downloaded
   records with the cursor. Edits made during a request keep their newer UUIDs.
5. Failed uploads retain the queue and local changes. Public story refresh also
   preserves cached content on failure or a partial catalog download.

The first account binds the local library; another account cannot upload it.
Reconnecting the original account keeps pending edits. Use a separate Android
profile or clear app data after synchronizing to switch accounts.

Server conflicts use arrival order **per record**, rather than device clocks.
Retries of an old UUID cannot overwrite a later edit. Android skips downloaded
records that still have pending local edits; those edits upload on the next pass.
Manual changes use the same durable path as automatic progression, and Known
words stay paused until changed. Conflicting new edits on separate devices use
the last server-accepted record; `statusChangedAt` does not override this policy.

Simultaneous reviews keep separate UUID-keyed events, but their competing
schedules are replaced rather than merged. A future cursor is reset
to zero on retry; idempotent operation IDs make this safe. Older records infer
Known from `mastered=true`, Almost Mastered from repetitions≥3, otherwise Learning.
Existing offline queues remain valid. Deploy the updated server before the app;
an old server rejects the new fields. An old app's later full-record upload may
derive status from its older mastery fields instead of preserving a manual New
or Almost Mastered choice.
