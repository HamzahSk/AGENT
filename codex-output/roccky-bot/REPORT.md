# Operator task result

The authorized preparation and validation are complete. Deployment and automatic
cross-run session-secret updates are not implemented because the task's parent
instruction explicitly says: "Do not change CI credential handling or GitHub
workflow files." The conflicting requirements in `prompt.md` were handled as a
proposal under `codex-output/`, without editing active workflows or credentials.

## Phases performed in order

1. **Inspect source and configuration.** No applicable `AGENTS.md` was found.
   Reviewed package metadata, launcher, supervisor, connection manager, auth
   lifecycle, deployment configuration, and project documentation. Sensitive
   configuration was inspected for names/structure only; credential values were
   not reproduced. Startup is `npm run start:node` from `roccky_bot/`:
   `NODE_ENV=production MALLOC_ARENA_MAX=2 node --max-old-space-size=300 --expose-gc index.js`.
   `bun start` is the existing alternative. Node must be at least 22.12;
   project deployment documentation uses Node 24 and Bun 1.4.4.
2. **Prepare workflow.** `WORKFLOW_DRAFT.md` contains validated YAML with a
   manual default-branch trigger, Ubuntu 24.04, pinned actions, read-only GitHub
   permissions, session concurrency, Bun frozen installation, and FFmpeg.
   GitHub discovers workflows at the root `.github/workflows/`, not the nested
   directory inside `roccky_bot/`.
3. **Specify private configuration and session restoration.** The draft consumes
   GitHub environment secrets only after dependency installation, restores a
   complete paired multifile session into a private directory, checks secret
   format and filenames, and includes cleanup. It never uploads authentication
   files or exports them as step outputs. No restore code was executed against
   real authentication data and no secrets were created or updated.
4. **Implement and check restart behavior.** `run-bot.sh` runs the existing Node
   startup script, adds launcher retries with 1–60 second backoff, forwards
   shutdown to the process group, and cleans up surviving children before a
   replacement. Exit 0 stops normally; exit 78 preserves the existing terminal
   authentication behavior. The draft bounds runtime to 200 minutes, with room
   for graceful shutdown before the runner deadline.
5. **Validate and leave deliverables in the working tree.** Checks below passed.
   No commits were created. Changes are confined to this output directory;
   source files, dependency metadata, GitHub workflows, and CI credential
   handling are unchanged.

## Validation

| Check | Result |
| --- | --- |
| Bun 1.4.4 `install --production --frozen-lockfile` | Passed; 315 packages installed, lockfile unchanged. Bun blocked two dependency postinstall scripts under its existing trust policy; the test suite still passed. |
| Existing project `node --test test/*.test.js agent/test/*.test.js ro-lang/test/*.test.js AI-SEERVER/test/*.test.js` under Node 24.22.2 with a clean process environment | 121 tests passed. Uses synthetic fixtures, including launcher startup and terminal disconnect. |
| `node scripts/check-syntax.mjs` | 270 files checked; zero failures. |
| `python codex-output/roccky-bot/test_run_bot.py -v` | Five synthetic wrapper tests passed: Node command selection, successful exit, terminal authentication exit, crash backoff, and process-group shutdown including a descendant. |
| `shellcheck codex-output/roccky-bot/run-bot.sh` and `bash -n` | Passed. |
| Actionlint 1.7.7 on YAML extracted from `WORKFLOW_DRAFT.md` through stdin | Passed, including available ShellCheck integration. |
| Git diff check for root/nested workflows, CI scripts, `package.json`, and `bun.lock` | Unchanged. |

Reproduce the checks from the repository root:

```sh
python codex-output/roccky-bot/test_run_bot.py -v
shellcheck codex-output/roccky-bot/run-bot.sh
bash -n codex-output/roccky-bot/run-bot.sh
```

Extract the YAML fence and pipe it to `actionlint -` to validate the proposal
without creating an active workflow file. Existing bot test/syntax commands run
from `roccky_bot/` after installing its frozen dependencies.

## Limitations

The workflow is not installed or live-tested on GitHub, and no real WhatsApp
connection was attempted. Its full-session restore avoids re-pairing within a
single job, but **does not update rotated keys back into GitHub Secrets**. A
future fresh runner needs a current complete snapshot; an old snapshot cannot
guarantee continued authentication. Scheduling should wait for an authorized,
reliable encrypted writeback design. The single-secret format is unusable if the
complete session exceeds GitHub's 48 KiB per-secret limit.

GitHub-hosted jobs have a six-hour platform maximum and are not persistent
hosting. Abrupt runner loss can skip cleanup and lose new keys. Local database,
store, pending snapshots, and tutor/agent memory also need persistence for
multi-run deployment. The optional cloud database covers bot records, not
Baileys credentials. Concurrency protects this proposed workflow only; any
other instance using the same WhatsApp session must be stopped independently.
