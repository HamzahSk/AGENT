# Setup, authentication, and operation

## What this environment does

`codex-remote.yml` is both a manual workflow and a reusable workflow. It runs on
a fresh Ubuntu 24.04 GitHub-hosted runner and accepts a task, API base URL,
API-key secret name, model, and an option to publish changes. Only runs against the default branch proceed.
Protect that branch: its code, dependencies, configuration, setup scripts,
skills, and plugins are trusted executable inputs.

The runner installs Node 24, Python 3.12, Git, ripgrep, jq, build tools, and
bubblewrap. It installs root Node dependencies using npm, pnpm, or Yarn; Python
projects using uv, requirements.txt, or a build-system-enabled pyproject.toml;
Go modules; and Rust dependencies. Go follows go.mod. Cargo uses the toolchain
already present on the Ubuntu runner and respects rust-toolchain.toml when
present. Set CODEX_NODE_VERSION and CODEX_PYTHON_VERSION environment variables
in GitHub's **Variables** settings to override those runtime versions.

Use `.github/codex/setup.sh` for monorepo subdirectories, Poetry/Pipenv projects,
additional system packages, browsers, services, and plugin executables. This
hook runs before integration and OpenAI secrets are introduced. Private package
registries need separately scoped install credentials and a reviewed setup step;
the integration secret is deliberately unavailable during dependency installation.
Pin your package manager in package.json's `packageManager` field and commit
lockfiles. Dependencies without a lockfile are less reproducible.

The pinned official Codex action installs Codex and its Responses API proxy in
setup-only mode (no prompt), then removes sudo. The API key goes to that action's
proxy, not the agent or project setup. Our wrapper subsequently runs `codex exec`
with workspace writes, network access, no interactive approvals, and Linux
`no_new_privs` to prevent setuid-based privilege escalation. Required
MCP failures cause Codex to fail. Tools requiring interactive approval cannot
complete unattended; configure service permissions to match authorized tasks.
No deprecated `--full-auto` flag is used.

The wrapper captures tool output privately. After successful execution it scans
generated file content and the patch for supplied credentials, common encodings,
and recognizable credential patterns. It uploads a redacted final response and
a checked binary Git patch. A separate job has GitHub write permission and can
commit this patch to `codex/run-RUN_ID-ATTEMPT` and open a PR. It never executes the
patched project. The workflow never merges into or pushes directly to the
original branch.

## First run

1. Copy this directory's contents, including `.github`, into your repository.
   Keep any existing project files and merge `.gitignore` entries.
2. Create an environment named `codex-ci` in repository Settings → Environments.
   Restrict it to the protected default branch. Optional required reviewers can
   gate runs according to your repository policy.
3. In that environment, add your provider's API key as a secret, for example
   `MY_PROVIDER_API_KEY`. The existing default secret name is `OPENAI_API_KEY`.
   This workflow uses the selected provider's API billing for model inference.
4. To open PRs, enable **Allow GitHub Actions to create and approve pull requests**
   in Settings → Actions → General. Repository/organization policy must permit
   `contents: write` and `pull-requests: write` for the publishing job.
5. Dispatch **Remote Codex** from the default branch. Start with a small task such
   as “Inspect this repository and summarize its build and test commands.”

With GitHub CLI already authenticated:

```sh
gh secret set OPENAI_API_KEY --repo OWNER/REPO --env codex-ci
gh workflow run codex-remote.yml --repo OWNER/REPO \
  -f prompt='Inspect this repository and summarize its build and test commands.'
```

`gh secret set` prompts privately for the value. Do not put secret values in
command arguments, workflow inputs, issue comments, or this repository.

GitHub-generated PRs do not normally trigger other Actions workflows when pushed
with GITHUB_TOKEN. Run your validation manually or use a separately designed
GitHub App publication flow if downstream CI must trigger automatically.

## Custom base URL, API key, and model

All three settings are available in **Actions → Remote Codex → Run workflow**
and as reusable-workflow inputs:

| Workflow input | Example | Default when empty |
| --- | --- | --- |
| `base_url` | `https://api.example.com/v1` | Variable `CODEX_BASE_URL`, then `https://api.openai.com/v1` |
| `api_key_secret` | `MY_PROVIDER_API_KEY` | Variable `CODEX_API_KEY_SECRET`, then `OPENAI_API_KEY` |
| `model` | `your-provider/model-id` | Variable `CODEX_MODEL`, then Codex configuration |

Create `MY_PROVIDER_API_KEY` as an **Environment secret** in `codex-ci` and store
the actual key there. Enter only its name in `api_key_secret`. You can create
separate secrets for different providers and select the matching secret per run.
The workflow reports a missing or empty selected secret before starting Codex.
The existing OPENAI_API_KEY configuration continues to work with empty inputs.

The base URL must use HTTPS without embedded credentials, query parameters, or
fragments. Include your provider's API prefix (often `/v1`). The workflow appends
`/responses` once and also accepts a full URL ending in `/responses`. For example,
`https://gateway.example.com/api/v1/` becomes
`https://gateway.example.com/api/v1/responses`.

The selected key is passed only to the official Responses proxy, whose upstream
is your selected URL. Codex still uses a local proxy address. The provider must
implement the **Responses API**, including streaming/tool calls needed by Codex,
and accept `Authorization: Bearer` authentication. A service that only implements
`/chat/completions` is not compatible with this workflow. Use the exact model ID
accepted by your provider; the workflow does not translate model names.

Example using GitHub CLI:

```sh
gh secret set MY_PROVIDER_API_KEY --repo OWNER/REPO --env codex-ci
gh workflow run codex-remote.yml --repo OWNER/REPO \
  -f prompt='Inspect the project and run its relevant checks.' \
  -f base_url='https://api.example.com/v1' \
  -f api_key_secret='MY_PROVIDER_API_KEY' \
  -f model='your-model-id'
```

Set `CODEX_BASE_URL`, `CODEX_API_KEY_SECRET`, and `CODEX_MODEL` under GitHub
**Variables** to reuse a provider setup without filling the form each time.
Explicit nonempty workflow inputs take precedence over those variables.

## Preserving configuration, skills, and plugins

The runner builds a fresh `$RUNNER_TEMP/codex-ci/home` and uses it as CODEX_HOME.
It copies the **non-secret** tree `.github/codex/home/` there. No script modifies
your workstation's `~/.codex` or exports it automatically. The proxy has its own
separate config directory so it cannot overwrite the copied user configuration.

- Leave repository `AGENTS.md`, `.agents/skills`, `.codex/config.toml`, and project
  rules where they are. The trusted checkout loads them normally.
- Put portable copies of personal skills in repository `.agents/skills`. Codex's
  documented personal skill directory is `$HOME/.agents/skills`; copying only
  `~/.codex` does not copy that directory.
- Merge portable user configuration into `.github/codex/home/config.toml`.
  Additional config/profile files, user rules, and intentionally vendored plugin
  files can live under the same seed directory. Symlinks and auth files in the
  seed are rejected.
- Reinstall marketplace plugins from pinned Git sources via Codex configuration.
  Keep their `plugin-name@marketplace-name` keys stable. For example:

```toml
[marketplaces.team]
source = "https://github.com/YOUR_ORG/YOUR_PLUGIN_MARKETPLACE.git"
source_type = "git"
ref = "YOUR_REVIEWED_COMMIT_SHA"

[plugins."your-plugin@team"]
enabled = true
```

Use your actual marketplace URL, commit, and plugin name; the stock environment
contains no invented service integrations. The marketplace must use Codex's
`.agents/plugins/marketplace.json` layout. A committed, reviewed plugin cache may
also be copied into the seed tree, but reinstalling from source is easier to
maintain. Do not copy caches containing credentials, browser profiles, or local
binaries. Replace workstation paths with paths valid on Linux. Do not copy
Termux, macOS, or Windows executables to the Ubuntu runner.

The runner routes inference through the official Responses proxy to your chosen
provider, and overrides credential
stores to `file`, and CI execution permissions. Other project configuration is
preserved. Enterprise restrictions still take precedence. Hook trust and managed
plugin access are not automatically bypassed. Configurations that force a
conflicting login/provider or require unavailable local tools need a CI-specific
configuration adjustment.

## API keys and bearer-token integrations

Create the environment secret `CODEX_INTEGRATION_ENV_JSON` as a JSON object whose
keys are the environment variable names expected by the integrations:

```json
{"SERVICE_API_TOKEN":"your-service-token-value"}
```

The example is a shape, not a credential. Enter the real value through GitHub
Secrets. The runner validates names, registers individual values for masking,
and passes them only to the Codex invocation. Reserved environment names such as
PATH, CODEX_HOME, BASH_ENV, GITHUB_*, and interpreter injection settings are rejected.
Secret values must contain at least eight characters. Put non-secret settings
in configuration, not this secret object. For agent-initiated GitHub CLI access,
you may explicitly supply a separately scoped `GH_TOKEN` here; the workflow's
publishing token is never given to the agent.

For an actual HTTP MCP server accepting a bearer token:

```toml
[mcp_servers.service]
url = "https://YOUR_SERVICE_HOST/mcp"
bearer_token_env_var = "SERVICE_API_TOKEN"
required = true
```

For a stdio MCP server, install its runtime in setup.sh and configure its real
command/arguments plus `env_vars = ["SERVICE_API_TOKEN"]`. Other HTTP header
schemes can use Codex's `env_http_headers` map. Avoid inline `env` credentials,
`http_headers` secrets, or OAuth client secrets in committed TOML/JSON. Codex's
`mcp add --oauth-client-secret` can store the secret directly in config.toml;
that file must not be committed or put into the non-secret seed.

Third-party CLIs have independent token stores. Prefer their supported environment
variables. This environment does not guess arbitrary service credential paths,
copy entire browser profiles, or assume a plugin directory contains its login.
Integrations needing additional private credential files require an explicit,
service-specific restoration adapter before they can run here.

## What Codex actually stores

The official docs and the pinned Codex 0.166.0 source were inspected for this
implementation:

| State | Storage and portability |
| --- | --- |
| Codex login | `CODEX_HOME/auth.json` with file storage, or an OS credential store. Contains tokens; never publish. |
| Local MCP OAuth | `CODEX_HOME/.credentials.json` with file storage. The direct keyring service is `Codex MCP Credentials`. Server identity and URL participate in lookup; preserve the original JSON and server configuration. |
| Plugin package/config | Skills, manifests, installation/configuration state, and possibly local MCP definitions. These are distinct from authentication. |
| Hosted connector/plugin auth | May be associated with a ChatGPT account or managed service. A local cache copy does not recreate its server-side connection or entitlements. |

Use `cli_auth_credentials_store = "file"` and
`mcp_oauth_credentials_store = "file"` in an isolated CI login home to produce
portable files. Changing the storage setting does not export existing keyring
entries: complete a new login for that isolated home. Do not attempt to copy a
macOS/Windows/Linux keyring database between runners.

API-key Codex authentication supports some curated plugins, but the official docs
explicitly identify unsupported OAuth connection flows. A local HTTP MCP endpoint
with supported OAuth may work even when a hosted app/plugin connection cannot.
The availability of any particular account-dependent plugin must be verified with
that service; this workflow cannot manufacture access, browser consent, or an
unsupported refresh grant.

## OAuth restoration and refresh write-back

Use a **dedicated CI login**. Never share one rotating refresh-token stream with
your normal desktop session, another repository, or concurrent runners.

1. Create a new directory outside your repository and configure file storage.
   Copy only the matching, non-secret MCP definitions into it.
2. Complete OAuth locally once using the same Codex version and server names/URLs
   that CI will use. For example:

```sh
mkdir -m 700 "$HOME/codex-ci-login"
# Create $HOME/codex-ci-login/config.toml with your MCP definition and file stores.
CODEX_HOME="$HOME/codex-ci-login" codex mcp login YOUR_SERVER_NAME
```

3. In GitHub's `codex-ci` environment, set the variable `CODEX_PERSIST_AUTH` to
   `true`. Add `AUTH_ADMIN_TOKEN`, a fine-grained PAT restricted to this repository
   with **Environments: read and write** permission, or an equivalent supported
   token. The ordinary GITHUB_TOKEN cannot update environment secrets. This
   powerful token is present only in the key-fetch and secret-update jobs.
4. Export and upload only the known credential files:

```sh
python scripts/codex_ci/export_auth.py \
  --home "$HOME/codex-ci-login" --upload OWNER/REPO
```

The helper uses `gh secret set CODEX_AUTH_BUNDLE --env codex-ci` over stdin. It
never prints tokens. Alternatively, `--output /PRIVATE/PATH/codex-auth-bundle.json`
creates a new mode-0600 file outside repositories; upload it to that environment
secret and delete the export when no longer needed. GitHub's secret limit is
48 KiB; this implementation rejects larger bundles rather than truncating them.

The workflow restores only `auth.json` and `.credentials.json`, with mode 0600,
into the private runtime home. Codex refreshes supported OAuth tokens itself.
After execution, even a failed run, the wrapper encrypts the latest files using
GitHub's environment public key and libsodium sealed boxes. Only the encrypted
payload is uploaded. A separate job writes that ciphertext to CODEX_AUTH_BUNDLE
using the GitHub API. There is no custom OAuth token-endpoint implementation.

Credential-bearing runs fail before execution unless write-back is configured.
Use **environment secrets**, not repository or organization secrets, for this
rotating state: GitHub reads environment secrets at job start after workflow
serialization. The fixed concurrency group prevents overlapping token use in
this repository; `cancel-in-progress` is false. Do not dispatch another workflow
that shares these credentials under a different concurrency group.

A hard cancellation, runner loss, or failed secret update can still lose a newly
rotated token. Reseed the dedicated CI login if that happens. Do not repeatedly
retry stale OAuth seeds. The encrypted artifact is retained for one day for
recovery, but its private key is held by GitHub; it is not a plaintext backup.

### ChatGPT account-dependent plugins

The CLI uses the selected provider API key (OPENAI_API_KEY by default) for model
inference in this implementation. It does
not provide a ChatGPT-only inference mode. When a supported plugin needs account
state, the bundle can optionally include a **managed ChatGPT** auth.json:

```sh
CODEX_HOME="$HOME/codex-ci-login" codex login --device-auth
python scripts/codex_ci/export_auth.py --home "$HOME/codex-ci-login" \
  --include-chatgpt --upload OWNER/REPO
```

This is allowed only for private repositories, requires refresh write-back, and
is subject to plugin support and account permissions. `chatgptAuthTokens`
(external-token host sessions) are rejected. Merely restoring auth.json is not a
guarantee that account-bound plugin tools work with the API proxy. Prefer direct
MCP OAuth or service keys when supported. For ChatGPT-only inference, use the
separate official CI authentication pattern linked below; do not assume this
workflow's API proxy consumes ChatGPT entitlements.

## Downloading and reusing results

Download `codex-result-RUN_ID-ATTEMPT`. From the exact base commit listed in
manifest.json, apply:

```sh
git apply --check /PATH/TO/changes.patch
git apply /PATH/TO/changes.patch
```

Checked deliverables created under `codex-output/` are also available directly
under `files/` in the artifact. The patch preserves untracked deliverables,
binary files, deletions, and local agent commits relative to the initial checkout SHA.
Ignored files are not included. Generated content is limited to 25 MiB. Symlinks,
credential-related paths, workflow edits, and the CI control scripts are rejected
from automatic publication. Make changes to this infrastructure through a normal
reviewed checkout. The agent's Git index is not used for packaging results.

Call the reusable workflow from another workflow in **the same repository**:

```yaml
jobs:
  codex:
    uses: ./.github/workflows/codex-remote.yml
    permissions:
      contents: write
      pull-requests: write
    with:
      prompt: "Update the project documentation and validate the examples."
      publish_changes: true
      base_url: "https://api.example.com/v1"
      api_key_secret: CODEX_API_KEY
      model: "your-model-id"
    secrets:
      CODEX_API_KEY: ${{ secrets.MY_PROVIDER_API_KEY }}
```

The example maps a caller's secret to the declared `CODEX_API_KEY` secret. You can
also use `secrets: inherit` or keep the selected secret in the `codex-ci`
environment; an environment secret with the same name takes precedence. The
caller must run against the trusted
default branch; do not feed it unreviewed PR or issue text. To use another
repository, copy the environment files there: control scripts are loaded from
the caller's checkout, so a cross-repository `uses: owner/repo/...` reference alone
is insufficient.

## Security boundary, validation, and maintenance

This is a trusted automation environment, not a sandbox for hostile code. Codex
and its integrations need access to their own OAuth credentials; connected tools
can act within those services' permissions. Filesystem modes, secret masking, and
content scanning cannot stop a deliberately malicious plugin from transforming
and exfiltrating a credential over the network. Review dependencies and plugins,
use least-privilege service accounts, and keep the workflow restricted to trusted
operators and code. No credential homes, sessions, raw transcripts, or environment
dumps are cached or uploaded. The checkout token is never persisted.

Validation includes workflow linting, shell parsing, private-file permissions,
credential schema and environment injection rejection, secret detection in binary
outputs, patch reconstruction, isolated child-process execution, and an encrypted
credential round-trip. It does not assert that external accounts are connected.
An actual GitHub run with your own secrets is required to verify billing/model
access, runner behavior, branch policy, and individual integrations.

Dependabot updates action pins and the Python encryption dependency. Update Codex
CLI and proxy together in codex-remote.yml. Re-check the pinned action's setup-only
behavior, configuration schema, MCP credential format, and plugin compatibility
when upgrading. If a run fails, raw logs are intentionally withheld; reproduce
configuration/startup failures locally with the dedicated CI home rather than
publishing credentials in diagnostic artifacts.

## Sources

- [Official Codex GitHub Action](https://developers.openai.com/codex/github-action)
- [Non-interactive execution](https://developers.openai.com/codex/noninteractive)
- [Authentication and credential stores](https://developers.openai.com/codex/auth)
- [Maintaining account auth in CI](https://developers.openai.com/codex/auth/ci-cd-auth)
- [MCP configuration and OAuth](https://developers.openai.com/codex/mcp)
- [Configuration reference](https://developers.openai.com/codex/config-reference)
- [Skills discovery](https://developers.openai.com/codex/skills)
- [Plugin availability](https://developers.openai.com/codex/plugins)
- [Pinned MCP credential implementation](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/rmcp-client/src/oauth.rs)
- [Pinned official action implementation](https://github.com/openai/codex-action/blob/bdf19a4a223ec2549a3e2274a0cf61556bc07675/action.yml)
