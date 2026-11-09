"""Apply a checked patch and push a new branch; never run generated project code."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from runtime import SafeError, forbidden_path, read_regular, run_git, TOKEN_PATTERN


def main():
    repo = Path(os.environ["GITHUB_WORKSPACE"]).resolve()
    artifacts = Path(os.environ["ARTIFACT_DIR"])
    manifest = json.loads(read_regular(artifacts / "manifest.json"))
    base = os.environ["BASE_SHA"]
    if manifest["base_sha"] != base or not re.fullmatch(r"[0-9a-f]{40}", base):
        raise SafeError("Artifact base SHA does not match the dispatched commit.")
    patch = read_regular(artifacts / "changes.patch", 75 * 1024 * 1024)
    if not patch:
        print("No changes to publish.")
        return
    if TOKEN_PATTERN.search(patch):
        raise SafeError("Credential pattern detected in patch.")
    run_git(repo, "config", "core.hooksPath", "/dev/null")
    run_git(repo, "apply", "--check", "--index", "-", data=patch)
    run_git(repo, "apply", "--index", "-", data=patch)
    names = run_git(repo, "diff", "--cached", "--name-only", "-z").split(b"\0")
    actual = sorted(name.decode() for name in names if name)
    if actual != manifest["files"] or any(forbidden_path(name) for name in actual):
        raise SafeError("Artifact contains unexpected or protected paths.")
    for name in actual:
        path = repo / name
        if path.is_symlink() or not path.resolve().is_relative_to(repo):
            raise SafeError("Artifact contains a symlink or escaping path.")
        if path.exists() and TOKEN_PATTERN.search(read_regular(path)):
            raise SafeError("Credential pattern detected in generated file.")
    run_id = os.environ["GITHUB_RUN_ID"]
    attempt = os.environ["GITHUB_RUN_ATTEMPT"]
    if not run_id.isdecimal() or not attempt.isdecimal():
        raise SafeError("Invalid run identity.")
    branch = f"codex/run-{run_id}-{attempt}"
    run_git(repo, "switch", "-c", branch)
    run_git(repo, "config", "user.name", "github-actions[bot]")
    run_git(repo, "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com")
    run_git(repo, "commit", "-m", "Apply Codex task changes")
    # gh supplies ephemeral Git credentials; checkout never persisted a token.
    env = dict(os.environ, GH_TOKEN=os.environ["PUBLISH_TOKEN"])
    helper = "!gh auth git-credential"
    run_git(repo, "-c", "credential.helper=", "-c", f"credential.helper={helper}", "push", "origin", branch, env=env)
    body_path = artifacts / "pr-body.md"
    body_path.write_text(f"Codex generated these changes from commit `{base}`.\n\nReview the patch and validation before merging.\n\nWorkflow run: https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{run_id}\n")
    result = subprocess.run(["gh", "pr", "create", "--repo", os.environ["GITHUB_REPOSITORY"],
                             "--base", os.environ["BASE_BRANCH"], "--head", branch,
                             "--title", "Codex task changes", "--body-file", str(body_path)],
                            env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise SafeError("Changes were pushed to the Codex branch, but PR creation failed. Enable Actions pull-request creation or open the PR from that branch.")
    url = result.stdout.decode().strip()
    print(url)
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write(f"Created pull request: {url}\n")


if __name__ == "__main__":
    try:
        main()
    except SafeError as error:
        print(f"::error::{error}", file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("::error::Publishing failed; no generated project code was executed.", file=sys.stderr)
        sys.exit(1)
