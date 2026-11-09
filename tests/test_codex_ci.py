import base64
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/codex_ci"))
import runtime


class Credentials(unittest.TestCase):
    def test_strict_bundle_rejects_arbitrary_paths_and_external_account_tokens(self):
        for files in ({"../auth.json": {}}, {"config.toml": {}}, {"auth.json": {"auth_mode": "chatgptAuthTokens"}}, {}):
            with self.subTest(files=files), self.assertRaises(runtime.SafeError):
                runtime.parse_bundle(json.dumps({"version": 1, "files": files}))

    def test_valid_oauth_bundle_preserves_schema(self):
        bundle = {"version": 1, "files": {".credentials.json": {"server-id": {"access_token": "opaque-test-credential", "refresh_token": "opaque-refresh-credential"}}}}
        self.assertEqual(runtime.parse_bundle(json.dumps(bundle)), bundle)

    def test_integrations_cannot_inject_execution_environment(self):
        for name in ["PATH", "BASH_ENV", "LD_PRELOAD", "GITHUB_OUTPUT", "CODEX_HOME", "GIT_CONFIG_COUNT", "NODE_OPTIONS", "OPENAI_API_KEY", "PYTHONINSPECT"]:
            with self.subTest(name=name), self.assertRaises(runtime.SafeError):
                runtime.parse_integrations(json.dumps({name: "bad"}))
        self.assertEqual(runtime.parse_integrations('{"SERVICE_API_TOKEN":"test-token-value"}'), {"SERVICE_API_TOKEN": "test-token-value"})

    def test_secret_scanner_checks_encodings_and_binary_data(self):
        secret = "canary-value-with-special/&=characters"
        variants = runtime.secret_variants([secret])
        for value in variants:
            with self.subTest(value=value), self.assertRaises(runtime.SafeError):
                runtime.assert_clean(b"\x00binary" + value + b"\xff", variants)
        runtime.assert_clean(b"ordinary source file", variants)

    def test_write_does_not_follow_symlink_or_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = root / "original"
            original.write_bytes(b"unchanged")
            (root / "link").symlink_to(original)
            with self.assertRaises(FileExistsError):
                runtime.private_write(root / "link", b"secret")
            self.assertEqual(original.read_bytes(), b"unchanged")
            fresh = root / "new"
            runtime.private_write(fresh, b"secret")
            self.assertEqual(fresh.stat().st_mode & 0o777, 0o600)

    def test_workflow_mask_escapes_command_delimiters(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            runtime.mask("token\n::warning::bad%value\r")
        self.assertEqual(output.getvalue(), "::add-mask::token%0A::warning::bad%25value%0D\n")

    @unittest.skipUnless(importlib.util.find_spec("nacl"), "PyNaCl installed in GitHub validation job")
    def test_sealed_credentials_roundtrip_and_no_plaintext(self):
        from nacl.public import PrivateKey, SealedBox
        from nacl.encoding import Base64Encoder
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            home = root / "home"
            home.mkdir()
            secret = "rotated-refresh-token-canary"
            (home / ".credentials.json").write_text(json.dumps({"s": {"refresh_token": secret}}))
            key = PrivateKey.generate()
            self.assertTrue(runtime.seal_auth(home, root, key.public_key.encode(Base64Encoder).decode(), "123"))
            raw = (root / "sealed/auth-update.json").read_bytes()
            self.assertNotIn(secret.encode(), raw)
            encrypted = json.loads(raw)
            restored = json.loads(SealedBox(key).decrypt(base64.b64decode(encrypted["encrypted_value"])))
            self.assertEqual(restored["files"][".credentials.json"]["s"]["refresh_token"], secret)


class GitPublication(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.state = self.root / "state"
        self.state.mkdir()
        self.git("init", "-q")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        (self.repo / "tracked.txt").write_text("original\n")
        (self.repo / "delete.txt").write_text("remove me\n")
        self.git("add", ".")
        self.git("commit", "-qm", "base")
        self.base = self.git("rev-parse", "HEAD").decode().strip()
        (self.state / "base-sha").write_text(self.base)
        (self.state / "private").mkdir()
        (self.state / "artifacts").mkdir()

    def git(self, *args):
        return runtime.run_git(self.repo, *args)

    def test_patch_preserves_new_binary_deletion_and_committed_changes(self):
        (self.repo / "tracked.txt").write_text("changed\n")
        self.git("commit", "-am", "agent committed a change")
        (self.repo / "delete.txt").unlink()
        binary = bytes(range(256)) * 16
        (self.repo / "codex-output").mkdir()
        (self.repo / "codex-output/report.txt").write_text("downloadable report")
        (self.repo / "new asset.bin").write_bytes(binary)
        self.assertTrue(runtime.collect_patch(self.repo, self.state, []))
        patch_data = (self.state / "artifacts/changes.patch").read_bytes()
        self.assertEqual((self.state / "artifacts/files/report.txt").read_text(), "downloadable report")
        (self.repo / "codex-output/report.txt").unlink()
        self.git("reset", "--hard", self.base)
        (self.repo / "new asset.bin").unlink()
        runtime.run_git(self.repo, "apply", "--index", "-", data=patch_data)
        self.assertEqual((self.repo / "new asset.bin").read_bytes(), binary)
        self.assertFalse((self.repo / "delete.txt").exists())
        self.assertEqual((self.repo / "tracked.txt").read_text(), "changed\n")

    def test_leaked_secret_blocks_patch_before_artifact_creation(self):
        secret = "integration-canary-secret"
        (self.repo / "new.bin").write_bytes(b"\x00" + secret.encode())
        with self.assertRaises(runtime.SafeError):
            runtime.collect_patch(self.repo, self.state, runtime.secret_variants([secret]))
        self.assertFalse((self.state / "artifacts/changes.patch").exists())

    def test_symlink_and_protected_changes_are_rejected(self):
        path = self.repo / "leak"
        path.symlink_to(self.root / "state/base-sha")
        with self.assertRaises(runtime.SafeError):
            runtime.collect_patch(self.repo, self.state, [])
        path.unlink()
        workflow = self.repo / ".github/workflows/inject.yml"
        workflow.parent.mkdir(parents=True)
        workflow.write_text("untrusted workflow")
        with self.assertRaises(runtime.SafeError):
            runtime.collect_patch(self.repo, self.state, [])

    def test_no_change_result(self):
        self.assertFalse(runtime.collect_patch(self.repo, self.state, []))
        self.assertEqual((self.state / "artifacts/changes.patch").read_bytes(), b"")

    def test_private_runner_environment_and_actual_child_process(self):
        seed = self.repo / ".github/codex/home"
        seed.mkdir(parents=True)
        (seed / "config.toml").write_text('mcp_oauth_credentials_store = "file"\n')
        prompts = self.repo / ".github/codex/prompts"
        prompts.mkdir()
        (prompts / "task.md").write_text("Private task\n")
        # Commit the harness so the output diff includes only agent changes.
        self.git("add", ".")
        self.git("commit", "-qm", "harness")
        runner_temp = self.root / "runner"
        runner_temp.mkdir()
        output = self.root / "outputs"
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        fake = bin_dir / "codex"
        fake.write_text(f'''#!{sys.executable}
import os, sys
from pathlib import Path
assert "GITHUB_TOKEN" not in os.environ
assert "CODEX_INTEGRATION_ENV_JSON" not in os.environ
assert "AUTH_ADMIN_TOKEN" not in os.environ
assert "OPENAI_API_KEY" not in os.environ
assert "CODEX_API_KEY" not in os.environ
assert sys.argv[sys.argv.index("--model") + 1] == "provider/custom-model-v2"
assert os.environ["SERVICE_API_TOKEN"] == "service-secret-canary"
assert "operator input $(no-shell-expansion)" in sys.stdin.read()
assert "--sandbox" in sys.argv and "workspace-write" in sys.argv
Path("generated.txt").write_text("generated result")
Path(sys.argv[sys.argv.index("-o") + 1]).write_text("Done service-secret-canary")
print("never publish raw output service-secret-canary")
''')
        fake.chmod(0o700)
        env = {"GITHUB_WORKSPACE": str(self.repo), "RUNNER_TEMP": str(runner_temp),
               "GITHUB_OUTPUT": str(output), "GITHUB_TOKEN": "github-secret-canary", "AUTH_ADMIN_TOKEN": "admin-secret-canary",
               "OPENAI_API_KEY": "openai-secret-canary", "CODEX_API_KEY": "custom-secret-canary",
               "TASK_MODEL": "provider/custom-model-v2", "TASK_PROMPT": "operator input $(no-shell-expansion)",
               "CODEX_INTEGRATION_ENV_JSON": '{"SERVICE_API_TOKEN":"service-secret-canary"}',
               "PATH": str(bin_dir) + os.pathsep + os.environ["PATH"]}
        with patch.dict(os.environ, env), contextlib.redirect_stdout(io.StringIO()):
            runtime.init()
            state = runner_temp / "codex-ci"
            (state / "proxy").mkdir()
            (state / "proxy/config.toml").write_text('model_provider="codex-action-responses-proxy"\n[model_providers.codex-action-responses-proxy]\nbase_url="http://127.0.0.1:1234/v1"\n')
            runtime.execute()
            self.assertEqual((state / "artifacts/final.md").read_text(), "Done [REDACTED]")
            self.assertIn("has_changes=true", output.read_text())
            self.assertIn(b"generated result", (state / "artifacts/changes.patch").read_bytes())
            self.assertFalse((state / "artifacts/transcript.log").exists())
            runtime.cleanup()
            self.assertFalse((state / "home").exists())
            self.assertFalse((state / "private").exists())
        self.assertEqual((seed / "config.toml").read_text(), 'mcp_oauth_credentials_store = "file"\n')


if __name__ == "__main__":
    unittest.main()
