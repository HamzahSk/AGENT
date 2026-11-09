import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/codex_ci"))
import publish
import runtime


class Publishing(unittest.TestCase):
    def test_real_commit_push_and_pr_command_are_separate_from_agent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "checkout"
            remote = root / "remote.git"
            artifacts = root / "artifacts"
            repo.mkdir()
            artifacts.mkdir()
            git = lambda *args: runtime.run_git(repo, *args)
            git("init", "-q")
            git("config", "user.name", "Test")
            git("config", "user.email", "test@example.invalid")
            (repo / "file.txt").write_text("before\n")
            git("add", ".")
            git("commit", "-qm", "base")
            base = git("rev-parse", "HEAD").decode().strip()
            git("init", "--bare", str(remote))
            git("remote", "add", "origin", str(remote))
            (repo / "file.txt").write_text("after\n")
            (artifacts / "changes.patch").write_bytes(git("diff", "--binary", "HEAD"))
            (artifacts / "manifest.json").write_text(json.dumps({"base_sha": base, "files": ["file.txt"]}))
            git("checkout", "--", "file.txt")
            binary_dir = root / "bin"
            binary_dir.mkdir()
            gh = binary_dir / "gh"
            gh.write_text(f'''#!{sys.executable}
import os, sys
assert sys.argv[1:3] == ["pr", "create"]
assert "--body-file" in sys.argv
assert os.environ["GH_TOKEN"] == "publishing-canary"
print("https://github.com/test/repo/pull/1")
''')
            gh.chmod(0o700)
            env = {"GITHUB_WORKSPACE": str(repo), "ARTIFACT_DIR": str(artifacts), "BASE_SHA": base,
                   "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1", "GITHUB_REPOSITORY": "test/repo",
                   "BASE_BRANCH": "main", "PUBLISH_TOKEN": "publishing-canary",
                   "GITHUB_STEP_SUMMARY": str(root / "summary"),
                   "PATH": str(binary_dir) + os.pathsep + os.environ["PATH"]}
            with patch.dict(os.environ, env), contextlib.redirect_stdout(io.StringIO()):
                publish.main()
            ref = git("--git-dir", str(remote), "rev-parse", "refs/heads/codex/run-123-1").decode().strip()
            self.assertNotEqual(ref, base)
            self.assertEqual(git("--git-dir", str(remote), "show", f"{ref}:file.txt"), b"after\n")
            self.assertIn("https://github.com/test/repo/pull/1", (root / "summary").read_text())
            self.assertNotIn("publishing-canary", (repo / ".git/config").read_text())


if __name__ == "__main__":
    unittest.main()
