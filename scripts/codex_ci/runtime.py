"""Private runner state, credential restoration, execution, and safe publication."""
from __future__ import annotations

import argparse
import base64
import ctypes
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import sys
import time
import tomllib
from urllib.parse import quote

AUTH_FILES = {"auth.json", ".credentials.json"}
MAX_SECRET = 48 * 1024
MAX_DELIVERABLES = 25 * 1024 * 1024
MAX_CODEX_ATTEMPTS = 3
CODEX_EXECUTION_SECONDS = 6000
RETRY_DELAYS = (5, 15)
ENV_NAME = re.compile(r"[A-Z][A-Z0-9_]*\Z")
BLOCKED_ENV = {"PATH", "HOME", "BASH_ENV", "ENV", "SHELLOPTS", "BASHOPTS", "IFS", "CDPATH", "NODE_OPTIONS", "PYTHONPATH", "PYTHONHOME", "LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "OPENAI_API_KEY", "CODEX_API_KEY"}
TOKEN_PATTERN = re.compile(rb"(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)")


class SafeError(Exception):
    """Messages must be fixed text, never external output or credentials."""


def json_bytes(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()


def private_write(path: Path, data: bytes):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as out:
        out.write(data)


def read_regular(path: Path, limit=MAX_DELIVERABLES):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > limit:
        raise SafeError("Refused a symlink, non-regular file, or oversized file.")
    return path.read_bytes()


def strings(value):
    if isinstance(value, str):
        if len(value) >= 8:
            yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from strings(child)


def credential_strings(value):
    # Metadata is public; avoid blocking outputs that cite the configured MCP URL.
    public_fields = {"server_name", "server_url", "url", "issuer", "client_id", "auth_mode",
                     "token_type", "scope", "scopes", "last_refresh", "account_id"}
    if isinstance(value, dict):
        for key, child in value.items():
            if key not in public_fields:
                yield from credential_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from credential_strings(child)
    else:
        yield from strings(value)


def secret_variants(values):
    result = set()
    for value in values:
        if len(value) < 8:
            continue
        raw = value.encode()
        result.update((raw, base64.b64encode(raw), quote(value, safe="").encode(), json.dumps(value)[1:-1].encode()))
    return sorted(result, key=len, reverse=True)


def mask(value):
    # Workflow command escaping is distinct from shell quoting.
    encoded = value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::add-mask::{encoded}", flush=True)


def parse_bundle(raw):
    try:
        bundle = json.loads(raw)
        if bundle.get("version") != 1 or not isinstance(bundle.get("files"), dict):
            raise ValueError
        if not bundle["files"] or set(bundle["files"]) - AUTH_FILES:
            raise ValueError
        if any(not isinstance(x, dict) for x in bundle["files"].values()):
            raise ValueError
        if len(json_bytes(bundle)) > MAX_SECRET:
            raise ValueError
        auth = bundle["files"].get("auth.json")
        if auth and (auth.get("auth_mode") != "chatgpt" or not auth.get("tokens", {}).get("refresh_token")):
            raise ValueError
        return bundle
    except (ValueError, TypeError, AttributeError):
        raise SafeError("Invalid auth bundle: use export_auth.py with file-backed Codex credentials.") from None


def parse_integrations(raw):
    try:
        values = json.loads(raw or "{}")
        if not isinstance(values, dict):
            raise ValueError
        for name, value in values.items():
            if (not ENV_NAME.fullmatch(name) or name in BLOCKED_ENV
                or name.startswith(("GITHUB_", "RUNNER_", "ACTIONS_", "CODEX_", "LD_", "DYLD_", "GIT_", "PYTHON", "BASH_", "npm_"))
                or not isinstance(value, str) or len(value) < 8 or "\x00" in value):
                raise ValueError
        return values
    except (ValueError, TypeError):
        raise SafeError("Invalid integration JSON or a reserved environment variable name.") from None


def run_git(repo, *args, env=None, data=None):
    result = subprocess.run(["git", "-C", str(repo), *args], input=data, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, env=env, check=False)
    if result.returncode:
        raise SafeError("A Git operation failed; no raw command output was published.")
    return result.stdout


def paths():
    workspace = Path(os.environ["GITHUB_WORKSPACE"]).resolve()
    root = Path(os.environ["RUNNER_TEMP"]).resolve() / "codex-ci"
    if root == workspace or workspace in root.parents:
        raise SafeError("Private runtime directory must be outside the repository.")
    return workspace, root


def init():
    repo, root = paths()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(root, 0o700)
    home = root / "home"
    home.mkdir(mode=0o700)
    source = repo / ".github/codex/home"
    if source.is_symlink() or not source.is_dir():
        raise SafeError("CI config seed must be a real directory.")
    for path in source.rglob("*"):
        relative = path.relative_to(source)
        if path.is_symlink() or path.name in AUTH_FILES:
            raise SafeError("CI config seed must not contain symlinks or authentication files.")
        if path.is_file():
            private_write(home / relative, read_regular(path))
    config = home / "config.toml"
    if config.exists():
        tomllib.loads(config.read_text())
    else:
        private_write(config, b"")
    private_write(root / "base-sha", run_git(repo, "rev-parse", "HEAD").strip())
    for name in ("private", "artifacts", "sealed"):
        (root / name).mkdir(mode=0o700)


def forbidden_path(name):
    p = PurePosixPath(name)
    if p.is_absolute() or ".." in p.parts or any(c in name for c in "\r\n\x00"):
        return True
    if any(x in {".git", ".ssh", ".aws", ".gnupg"} for x in p.parts):
        return True
    if name.startswith((".github/workflows/", "scripts/codex_ci/", ".github/codex/")):
        return True
    if ".codex" in p.parts and p.name not in {"config.toml", "AGENTS.md"} and p.suffix != ".rules":
        return True
    return (p.name in AUTH_FILES or p.name in {"codex-auth-bundle.json", "credentials", ".npmrc", ".pypirc", ".netrc"}
            or p.name.startswith(".env") and p.name != ".env.example"
            or p.suffix.lower() in {".pem", ".key", ".p12", ".pfx", ".sqlite", ".db", ".jsonl"})


def assert_clean(data, variants):
    if TOKEN_PATTERN.search(data) or any(value in data for value in variants):
        raise SafeError("Publication blocked: a generated file or patch contains credential material.")


def collect_patch(repo, root, variants):
    base = (root / "base-sha").read_text()
    # Compare with the original SHA even if Codex has made local commits.
    changed = set(run_git(repo, "diff", "--name-only", "-z", base).split(b"\0"))
    changed.update(run_git(repo, "ls-files", "--others", "--exclude-standard", "-z").split(b"\0"))
    changed.discard(b"")
    names = sorted(name.decode("utf-8", "strict") for name in changed)
    total = 0
    for name in names:
        if forbidden_path(name):
            raise SafeError("Publication blocked: changes include a protected or credential-related path.")
        path = repo / name
        if path.is_symlink() or not path.resolve().is_relative_to(repo):
            raise SafeError("Publication blocked: a changed path is a symlink or escapes the checkout.")
        if path.exists():
            content = read_regular(path)
            total += len(content)
            if total > MAX_DELIVERABLES:
                raise SafeError("Publication blocked: generated files exceed the 25 MiB limit.")
            assert_clean(content, variants)
    env = dict(os.environ, GIT_INDEX_FILE=str(root / "private/export-index"), GIT_LITERAL_PATHSPECS="1")
    run_git(repo, "read-tree", base, env=env)
    if names:
        run_git(repo, "add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul", env=env,
                data=b"\0".join(name.encode() for name in names) + b"\0")
    patch = run_git(repo, "diff", "--cached", "--binary", "--full-index", base, env=env)
    assert_clean(patch, variants)
    private_write(root / "artifacts/changes.patch", patch)
    private_write(root / "artifacts/manifest.json", json_bytes({"base_sha": base, "files": names, "has_changes": bool(patch)}))
    # Also provide directly downloadable deliverables from the documented output folder.
    for name in names:
        if name.startswith("codex-output/") and (repo / name).is_file():
            private_write(root / "artifacts/files" / name.removeprefix("codex-output/"), read_regular(repo / name))
    # The binary patch preserves generated files, including untracked files and deletions.
    return bool(patch)


def seal_auth(home, root, public_key, key_id):
    from nacl.public import PublicKey, SealedBox
    from nacl.encoding import Base64Encoder
    files = {}
    for name in AUTH_FILES:
        path = home / name
        if path.exists():
            files[name] = json.loads(read_regular(path, MAX_SECRET))
    if not files:
        return False
    payload = json_bytes(parse_bundle(json_bytes({"version": 1, "files": files})))
    encrypted = SealedBox(PublicKey(public_key.encode(), encoder=Base64Encoder)).encrypt(payload)
    private_write(root / "sealed/auth-update.json", json_bytes({"key_id": key_id, "encrypted_value": base64.b64encode(encrypted).decode()}))
    return True


def no_new_privileges():
    # The official setup-only action drops sudo and blocks privileged service sockets.
    # Retain its no-escalation intent for our separately captured CLI invocation.
    if ctypes.CDLL(None, use_errno=True).prctl(38, 1, 0, 0, 0) != 0:  # PR_SET_NO_NEW_PRIVS
        raise OSError("Could not prevent privilege escalation")


def execute():
    repo, root = paths()
    home = root / "home"
    bundle_raw = os.environ.pop("CODEX_AUTH_BUNDLE", "")
    integration_raw = os.environ.pop("CODEX_INTEGRATION_ENV_JSON", "")
    public_key = os.environ.pop("AUTH_PUBLIC_KEY", "")
    key_id = os.environ.pop("AUTH_KEY_ID", "")
    prompt = os.environ.pop("TASK_PROMPT", "").strip()
    model = os.environ.pop("TASK_MODEL", "").strip()
    if not prompt:
        raise SafeError("Provide a nonempty task prompt.")
    if not (root / "proxy/config.toml").exists():
        raise SafeError("The Responses proxy was not initialized; configure the selected API key secret.")
    bundle = parse_bundle(bundle_raw) if bundle_raw else None
    integrations = parse_integrations(integration_raw)
    if bundle and not (public_key and key_id):
        raise SafeError("OAuth restoration requires encrypted write-back. Configure CODEX_PERSIST_AUTH and AUTH_ADMIN_TOKEN first.")
    if bundle and "auth.json" in bundle["files"] and os.environ.get("REPOSITORY_PRIVATE") != "true":
        raise SafeError("ChatGPT account credentials are supported only in private repositories.")
    sensitive = list(strings(integrations)) + list(credential_strings(bundle or {}))
    for value in sensitive:
        mask(value)
    if bundle:
        for name, content in bundle["files"].items():
            private_write(home / name, json_bytes(content))
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write("auth_restored=true\n")
    # The action's proxy home is separate, so it cannot overwrite user config.
    proxy = tomllib.loads((root / "proxy/config.toml").read_text())
    provider = proxy["model_provider"]
    base_url = proxy["model_providers"][provider]["base_url"]
    if not re.fullmatch(r"http://127\.0\.0\.1:[0-9]+/v1", base_url):
        raise SafeError("Unexpected Responses proxy endpoint.")
    # Keep the rollout only in the private temporary home so interrupted runs can resume.
    args = ["codex", "exec", "--color", "never", "--sandbox", "workspace-write",
            "-c", 'approval_policy="never"', "-c", "sandbox_workspace_write.network_access=true",
            "-c", f'projects.{json.dumps(str(repo))}.trust_level="trusted"',
            "-c", 'cli_auth_credentials_store="file"', "-c", 'mcp_oauth_credentials_store="file"',
            "-c", f'model_provider="{provider}"',
            "-c", f'model_providers.{provider}.name="Codex CI Responses Proxy"',
            "-c", f'model_providers.{provider}.base_url={json.dumps(base_url)}',
            "-c", f'model_providers.{provider}.wire_api="responses"',
            "-c", f'model_providers.{provider}.requires_openai_auth=false',
            "-C", str(repo), "-o", str(root / "private/final.md")]
    if model:
        args += ["--model", model]
    env = {k: v for k, v in os.environ.items() if not k.startswith(("ACTIONS_", "GITHUB_", "INPUT_"))
           and k not in {"OPENAI_API_KEY", "CODEX_API_KEY", "GH_TOKEN", "AUTH_ADMIN_TOKEN"}}
    env.update(integrations)
    env["CODEX_HOME"] = str(home)
    full_prompt = (repo / ".github/codex/prompts/task.md").read_text() + "\n\nOperator task:\n" + prompt
    continuation_prompt = """The previous Codex execution ended before the task completed.
Continue the same operator task from the current repository state. Inspect the
existing working tree and prior progress first. Preserve completed work; do not
repeat, revert, or redo it. Finish only the remaining work and run relevant
validation."""
    code = 1
    publication_error = None
    try:
        print("Codex is running. Raw tool output stays private on the runner.", flush=True)
        deadline = time.monotonic() + CODEX_EXECUTION_SECONDS
        for attempt in range(1, MAX_CODEX_ATTEMPTS + 1):
            final = root / "private/final.md"
            final.unlink(missing_ok=True)
            if attempt == 1:
                command = args + ["-"]
                attempt_prompt = full_prompt
            else:
                command = args + ["resume", "--last", "-"]
                attempt_prompt = continuation_prompt
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(command, CODEX_EXECUTION_SECONDS)
            with (root / f"private/transcript-{attempt}.log").open("wb") as log:
                process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT,
                                           cwd=repo, env=env, start_new_session=True, preexec_fn=no_new_privileges)
                try:
                    process.communicate(attempt_prompt.encode(), timeout=remaining)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.communicate()
                    raise
                finally:
                    # Stop leftover MCP servers/commands before retrying or snapshotting state.
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
            code = process.returncode
            if code == 0 and final.is_file() and final.stat().st_size:
                break
            code = code or 1
            if attempt < MAX_CODEX_ATTEMPTS:
                delay = RETRY_DELAYS[attempt - 1]
                if time.monotonic() + delay >= deadline:
                    break
                print(f"Codex attempt {attempt} did not complete; resuming after {delay} seconds.", flush=True)
                time.sleep(delay)
    except subprocess.TimeoutExpired:
        publication_error = SafeError("Codex exceeded its 50-minute execution limit.")
    finally:
        # Capture refreshed credentials even when execution fails. Never upload plaintext.
        for name in AUTH_FILES:
            path = home / name
            if path.exists():
                sensitive.extend(credential_strings(json.loads(read_regular(path, MAX_SECRET))))
        if public_key and key_id:
            seal_auth(home, root, public_key, key_id)
    variants = secret_variants(sensitive)
    final = root / "private/final.md"
    if final.exists():
        redacted = read_regular(final)
        for value in variants:
            redacted = redacted.replace(value, b"[REDACTED]")
        redacted = TOKEN_PATTERN.sub(b"[REDACTED]", redacted)
        private_write(root / "artifacts/final.md", redacted)
    if code == 0 and publication_error is None:
        try:
            has_changes = collect_patch(repo, root, variants)
            with open(os.environ["GITHUB_OUTPUT"], "a") as output:
                output.write(f"has_changes={str(has_changes).lower()}\n")
        except SafeError as error:
            publication_error = error
            # All-or-nothing publication, including the response.
            shutil.rmtree(root / "artifacts")
            (root / "artifacts").mkdir(mode=0o700)
    if publication_error:
        raise publication_error
    if code:
        raise SafeError("Codex execution failed after three attempts. No patch was published. Check account access, model availability, and required MCP configuration; raw logs are deliberately withheld.")
    print("Codex completed; checked deliverables are ready for upload.")


def cleanup():
    _, root = paths()
    for name in ("home", "private", "proxy"):
        shutil.rmtree(root / name, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["init", "run", "cleanup"])
    command = parser.parse_args().command
    try:
        {"init": init, "run": execute, "cleanup": cleanup}[command]()
    except SafeError as error:
        print(f"::error::{error}", file=sys.stderr)
        return 1
    except Exception:
        print("::error::Codex CI failed; sensitive diagnostic details were withheld.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
