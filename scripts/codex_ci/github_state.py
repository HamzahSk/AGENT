"""GitHub environment-secret API. Runs only in jobs that never execute Codex."""
import base64
import json
import os
from pathlib import Path
import sys
import urllib.request
from urllib.parse import quote


def request(method, suffix, payload=None):
    repo_id = os.environ["REPOSITORY_ID"]
    if not repo_id.isdecimal():
        raise ValueError
    url = f'https://api.github.com/repositories/{repo_id}/environments/codex-ci/secrets/{suffix}'
    req = urllib.request.Request(url, method=method, data=json.dumps(payload).encode() if payload else None,
        headers={"Authorization": "Bearer " + os.environ["AUTH_ADMIN_TOKEN"],
                 "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response) if method == "GET" else None


def main():
    if sys.argv[1] == "key":
        data = request("GET", "public-key")
        if len(base64.b64decode(data["key"], validate=True)) != 32 or not str(data["key_id"]).isalnum():
            raise ValueError
        with open(os.environ["GITHUB_OUTPUT"], "a") as out:
            out.write(f'key={data["key"]}\nkey_id={data["key_id"]}\n')
    elif sys.argv[1] == "write":
        path = Path(sys.argv[2])
        if path.is_symlink() or path.stat().st_size > 70000:
            raise ValueError
        payload = json.loads(path.read_bytes())
        if set(payload) != {"key_id", "encrypted_value"} or str(payload["key_id"]) != os.environ["AUTH_KEY_ID"]:
            raise ValueError
        cipher = base64.b64decode(payload["encrypted_value"], validate=True)
        if not 48 < len(cipher) <= 48 * 1024 + 48:
            raise ValueError
        request("PUT", quote("CODEX_AUTH_BUNDLE"), payload)
        print("Updated the encrypted Codex authentication environment secret.")
    else:
        raise ValueError


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("::error::Credential persistence failed. Check AUTH_ADMIN_TOKEN environment-secret permissions and reseed authentication before another run if tokens rotated.", file=sys.stderr)
        sys.exit(1)
