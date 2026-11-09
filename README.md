# Remote Codex for GitHub Actions

Run Codex CLI against a trusted repository checkout, with project dependencies,
MCP integrations, skills, plugins, private credential restoration, downloadable
results, and optional commits on a new pull-request branch.

1. Add these files to your repository's default branch.
2. Create a GitHub environment named **codex-ci** and restrict its deployment
   branches to your default branch.
3. Add your provider's API key as a secret in that environment, for example
   **MY_PROVIDER_API_KEY** (or **OPENAI_API_KEY** for the existing default).
4. Open **Actions → Remote Codex → Run workflow** and enter a task. Set:
   - `base_url`: your API base URL, e.g. `https://api.example.com/v1`.
   - `api_key_secret`: the secret's **name**, e.g. `MY_PROVIDER_API_KEY`.
   - `model`: the exact model ID offered by your provider.

The provider must support the **Responses API** with bearer-token authentication.
A `/responses` endpoint is added to the base URL automatically; a complete
`/responses` URL also works. API key values belong in GitHub Secrets, never in
workflow inputs. Leave the fields empty to use `CODEX_BASE_URL`,
`CODEX_API_KEY_SECRET`, and `CODEX_MODEL` from GitHub Variables. Without those
variables, the defaults are OpenAI, `OPENAI_API_KEY`, and Codex's configured model.

Enable **publish_changes** to commit the generated changes on a new branch and
open a pull request. Otherwise, download the run's `codex-result-*` artifact;
`changes.patch` includes new files, binary files, modifications, and deletions.

Read [the setup and authentication guide](docs/codex-remote.md) before adding
OAuth integrations. The workflow does not inherit this machine's login state.

Local checks:

```sh
python -m pip install -r scripts/codex_ci/requirements.txt
python -m unittest discover -s tests -v
```

The validation workflow also checks GitHub Actions syntax with Actionlint. All
third-party actions are pinned by commit; the Codex CLI/proxy version is pinned
in `.github/workflows/codex-remote.yml`.
