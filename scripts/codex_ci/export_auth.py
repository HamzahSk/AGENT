"""Export only explicit file-backed auth, without changing the source Codex home."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
from runtime import AUTH_FILES, SafeError, json_bytes, parse_bundle, private_write, read_regular


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, required=True, help="Dedicated CI login's CODEX_HOME")
    parser.add_argument("--include-chatgpt", action="store_true", help="Include managed ChatGPT auth for account-dependent plugins (private repos only)")
    destination = parser.add_mutually_exclusive_group(required=True)
    destination.add_argument("--output", type=Path, help="New private file outside the repository")
    destination.add_argument("--upload", metavar="OWNER/REPO", help="Pipe directly to gh secret set --env codex-ci")
    args = parser.parse_args()
    files = {}
    for name in sorted(AUTH_FILES):
        if name == "auth.json" and not args.include_chatgpt:
            continue
        path = args.home / name
        if path.exists():
            import json
            files[name] = json.loads(read_regular(path, 48 * 1024))
    bundle = json_bytes(parse_bundle(json_bytes({"version": 1, "files": files})))
    if args.output:
        target = args.output.resolve()
        source_root = Path(__file__).resolve().parents[2]
        if target.is_relative_to(source_root) or any((p / ".git").exists() for p in target.parents):
            raise SafeError("Credential export must be outside any repository.")
        private_write(target, bundle)
        print("Created a private credential bundle. Keep it out of version control.")
    else:
        result = subprocess.run(["gh", "secret", "set", "CODEX_AUTH_BUNDLE", "--repo", args.upload,
                                 "--env", "codex-ci"], input=bundle, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode:
            raise SafeError("Secret upload failed; check gh authentication and environment permissions.")
        print("Uploaded CODEX_AUTH_BUNDLE to the codex-ci environment.")


if __name__ == "__main__":
    os.umask(0o077)
    try:
        main()
    except SafeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Export failed; sensitive diagnostic details were withheld.", file=sys.stderr)
        sys.exit(1)
