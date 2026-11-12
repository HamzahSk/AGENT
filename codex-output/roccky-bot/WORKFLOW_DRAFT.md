# WhatsApp bot workflow draft

This is a reviewable proposal, not an installed workflow. The operator's current
instruction prohibits changing GitHub workflow files and CI credential handling.
No file under `.github/` has been changed. Installing this proposal and adding
automatic session-secret updates require a separately authorized deployment task.

The draft restores the complete multifile session supplied by the operator and
reuses its live keys for every restart **within a job**. It does not save rotated
keys back to GitHub Secrets. A fresh job needs a current, privately maintained
session secret. Scheduled launches are deliberately absent until a reliable
session writeback mechanism is designed and authorized.

If installed later, the YAML below belongs at the repository root, for example
`.github/workflows/roccky-bot.yml`. The nested `roccky_bot/.github/workflows/`
directory is not discovered by GitHub Actions. Keep the supporting
`codex-output/roccky-bot/run-bot.sh` file at its current path, or adjust the command.

```yaml
name: Run RoccKy WhatsApp bot

on:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: roccky-whatsapp-session
  cancel-in-progress: false

jobs:
  bot:
    # Dispatch trusted default-branch code only; no push or pull-request trigger.
    if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)
    runs-on: ubuntu-24.04
    timeout-minutes: 240
    environment: roccky-bot
    defaults:
      run:
        shell: bash
        working-directory: roccky_bot
    env:
      NODE_ENV: production
      MALLOC_ARENA_MAX: '2'
      ROCCKY_AI_SERVER: 'false'

    steps:
      - name: Check out trusted source
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          persist-credentials: false

      - name: Set up Node.js
        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: '24'

      - name: Set up locked package manager
        uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2
        with:
          bun-version: '1.4.4'

      - name: Install Ubuntu media tools and dependencies
        timeout-minutes: 15
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y --no-install-recommends ffmpeg build-essential
          bun install --production --frozen-lockfile
          ffmpeg -version >/dev/null
          ffprobe -version >/dev/null

      - name: Restore private configuration and paired session
        env:
          ROCCKY_CONFIG_JS: ${{ secrets.ROCCKY_CONFIG_JS }}
          ROCCKY_WHATSAPP_SESSION_JSON: ${{ secrets.ROCCKY_WHATSAPP_SESSION_JSON }}
        run: |
          python3 - <<'PY'
          import json
          import os
          import sys
          from pathlib import Path

          try:
              os.umask(0o077)
              config = os.environ['ROCCKY_CONFIG_JS']
              payload = os.environ['ROCCKY_WHATSAPP_SESSION_JSON']
              if not config.strip() or not payload.strip():
                  raise ValueError()
              if len(config.encode()) > 49152 or len(payload.encode()) > 49152:
                  raise ValueError()
              session = json.loads(payload)
              if not isinstance(session, dict) or not session:
                  raise ValueError()
              creds = session.get('creds.json')
              if not isinstance(creds, dict) or creds.get('registered') is not True:
                  raise ValueError()
              for name, record in session.items():
                  if (not isinstance(name, str) or Path(name).name != name
                      or '/' in name or '\\' in name or '\x00' in name
                      or name.startswith('.') or not name.endswith('.json')
                      or not isinstance(record, dict)):
                      raise ValueError()
              root = Path('session')
              if root.exists() or root.is_symlink():
                  raise ValueError()
              config_path = Path('config.js')
              if config_path.is_symlink():
                  raise ValueError()
              root.mkdir(mode=0o700)
              config_path.write_text(config, encoding='utf-8')
              config_path.chmod(0o600)
              for name, record in session.items():
                  with (root / name).open('x', encoding='utf-8') as handle:
                      json.dump(record, handle, separators=(',', ':'))
          except Exception:
              # Never print secret contents, parse errors, or authentication records.
              print('Private configuration/session restore failed; review secret format.', file=sys.stderr)
              sys.exit(1)
          PY

      - name: Run bot with crash recovery
        timeout-minutes: 205
        env:
          ROCCKY_DATABASE_URL: ${{ secrets.ROCCKY_DATABASE_URL }}
          RO_LANG_API_KEY: ${{ secrets.RO_LANG_API_KEY }}
          AGENT_API_KEY: ${{ secrets.AGENT_API_KEY }}
          DEEPSEEK_TOKEN: ${{ secrets.DEEPSEEK_TOKEN }}
          GROQ_API_KEYS: ${{ secrets.GROQ_API_KEYS }}
        run: |
          status=0
          timeout --signal=TERM --kill-after=30s 200m \
            bash ../codex-output/roccky-bot/run-bot.sh || status=$?
          case "$status" in
            0|124) exit 0 ;;
            78) echo 'WhatsApp authentication needs operator intervention.' >&2 ;;
          esac
          exit "$status"

      - name: Remove private runner files
        if: always()
        run: |
          rm -f -- config.js
          rm -rf -- session
```

Create the `roccky-bot` GitHub environment separately, restrict it to the default
branch, and store the following environment secrets there. No secret values or
authentication files are included in these deliverables.

| Secret | Required format / behavior |
| --- | --- |
| `ROCCKY_CONFIG_JS` | Complete operator-authored ESM configuration. It must set `global.authFolder = 'session'` (or the equivalent in `Object.assign(global, ...)`), disable interactive pairing, and retain the bot's existing required global settings. Author it privately; do not copy the current credential-bearing file into reports. |
| `ROCCKY_WHATSAPP_SESSION_JSON` | JSON object mapping every basename from the active Baileys auth directory to its parsed JSON object. Include `creds.json` and **all** Signal/pre-key/app-state/session files. Buffer JSON representations must remain unchanged. Pair once on a private terminal and stop that bot before taking a consistent snapshot. |
| `ROCCKY_DATABASE_URL` | Optional existing MongoDB/PostgreSQL connection string. Omit for local operation. |
| `RO_LANG_API_KEY`, `AGENT_API_KEY`, `DEEPSEEK_TOKEN`, `GROQ_API_KEYS` | Optional existing provider credentials; only required for their corresponding features. |

GitHub Secrets have a 48 KiB limit per value. The full session can exceed it;
do not omit key files to make it fit. At that point the session requires an
encrypted persistent store or a persistent host, rather than this single-secret
draft. Base64 encoding is not encryption and increases size.

Dependencies are installed before secrets enter steps. The proposal uses no
dependency/authentication cache, upload-artifact action, secret step output, shell
tracing, or secret-writing token. Concurrency prevents overlap between this
workflow's runs; stop any bot running elsewhere with the same WhatsApp identity.

The existing `index.js` supervisor restarts crashed workers with bounded backoff.
The supporting wrapper also restarts failed launchers with 1–60 second backoff,
terminates surviving process groups before replacements, and stops on exit 0 or
78. A 200-minute execution budget allows graceful shutdown before the runner
deadline. The gateway is disabled by default, avoiding an unnecessary HTTP server.

GitHub-hosted jobs are finite (the platform maximum is six hours), schedules may
be delayed, and runner loss can prevent final cleanup or state persistence. This
is not continuous hosting. The draft intentionally does not promise QR-free
future jobs from an old snapshot. Automatic encrypted session-secret writeback,
recovery from abrupt runner loss, and persistent local database/store snapshots
remain unresolved deployment work under the current prohibition. The existing
cloud database stores bot records; it does not store Baileys auth keys.
