#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${RUNNER_TEMP:?Run inside GitHub Actions}"
: "${GITHUB_WORKSPACE:?Missing checkout}"
# Runs without integration or OpenAI credentials.
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends git jq ripgrep build-essential bubblewrap acl
python -m venv "$RUNNER_TEMP/codex-ci-tools"
"$RUNNER_TEMP/codex-ci-tools/bin/python" -m pip install --disable-pip-version-check -r scripts/codex_ci/requirements.txt
if [[ -f pnpm-lock.yaml || -f yarn.lock ]]; then
  npm install --global corepack@0.34.6
  corepack enable
fi
if [[ -f pnpm-lock.yaml ]]; then
  corepack pnpm install --frozen-lockfile
elif [[ -f yarn.lock ]]; then
  yarn_version=$(corepack yarn --version)
  if [[ "$yarn_version" == 1.* ]]; then corepack yarn install --frozen-lockfile; else corepack yarn install --immutable; fi
elif [[ -f package-lock.json || -f npm-shrinkwrap.json ]]; then
  npm ci
elif [[ -f package.json ]]; then
  npm install
fi
if [[ -f uv.lock ]]; then
  "$RUNNER_TEMP/codex-ci-tools/bin/python" -m pip install uv==0.11.6
  "$RUNNER_TEMP/codex-ci-tools/bin/uv" sync --locked
elif [[ -f requirements.txt || -f pyproject.toml ]]; then
  python -m venv .venv
  if [[ -f requirements.txt ]]; then .venv/bin/python -m pip install -r requirements.txt; fi
  if [[ -f pyproject.toml ]]; then
    if python -c 'import tomllib; assert "build-system" in tomllib.load(open("pyproject.toml", "rb"))'; then
      .venv/bin/python -m pip install -e .
    else
      echo 'No Python build system; use .github/codex/setup.sh for additional dependencies.'
    fi
  fi
fi
if [[ -d .venv/bin ]]; then echo "$GITHUB_WORKSPACE/.venv/bin" >> "$GITHUB_PATH"; fi
if [[ -f go.mod ]]; then go mod download; fi
if [[ -f Cargo.toml ]]; then
  if [[ -f Cargo.lock ]]; then cargo fetch --locked; else cargo fetch; fi
fi
bash .github/codex/setup.sh
mkdir -p "$RUNNER_TEMP/codex-ci/control"
cp scripts/codex_ci/*.py "$RUNNER_TEMP/codex-ci/control/"
"$RUNNER_TEMP/codex-ci-tools/bin/python" "$RUNNER_TEMP/codex-ci/control/runtime.py" init
