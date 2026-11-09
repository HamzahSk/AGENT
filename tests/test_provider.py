import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/codex_ci"))
import provider


class ProviderConfiguration(unittest.TestCase):
    def test_existing_openai_defaults_still_work(self):
        self.assertEqual(provider.resolve({}), {
            "responses_endpoint": "https://api.openai.com/v1/responses",
            "api_key_secret": "OPENAI_API_KEY", "model": "",
        })

    def test_custom_base_urls_and_full_endpoints(self):
        for base, expected in [
            ("https://gateway.example.com/v1", "https://gateway.example.com/v1/responses"),
            ("https://gateway.example.com/v1/", "https://gateway.example.com/v1/responses"),
            ("https://gateway.example.com/v1/responses", "https://gateway.example.com/v1/responses"),
            ("https://gateway.example.com/v1/responses/", "https://gateway.example.com/v1/responses"),
            ("https://gateway.example.com:8443/api", "https://gateway.example.com:8443/api/responses"),
            ("https://gateway.example.com", "https://gateway.example.com/responses"),
        ]:
            with self.subTest(base=base):
                self.assertEqual(provider.responses_endpoint(base), expected)

    def test_workflow_inputs_override_environment_defaults(self):
        env = {"DEFAULT_BASE_URL": "https://default.example.com/v1",
               "DEFAULT_API_KEY_SECRET": "DEFAULT_PROVIDER_KEY", "DEFAULT_MODEL": "default-model",
               "INPUT_BASE_URL": "https://selected.example.com/v1",
               "INPUT_API_KEY_SECRET": "my_provider_api_key", "INPUT_MODEL": "provider/model-v2"}
        self.assertEqual(provider.resolve(env), {
            "responses_endpoint": "https://selected.example.com/v1/responses",
            "api_key_secret": "MY_PROVIDER_API_KEY", "model": "provider/model-v2",
        })
        env.update(INPUT_BASE_URL="", INPUT_API_KEY_SECRET=" ", INPUT_MODEL="")
        self.assertEqual(provider.resolve(env), {
            "responses_endpoint": "https://default.example.com/v1/responses",
            "api_key_secret": "DEFAULT_PROVIDER_KEY", "model": "default-model",
        })

    def test_invalid_urls_and_embedded_credentials_are_rejected(self):
        for base in ["http://gateway.example.com/v1", "file:///tmp/model", "gateway.example.com/v1",
                     "https:///v1", "https://user:password@gateway.example.com/v1",
                     "https://gateway.example.com/v1?api_key=secret",
                     "https://gateway.example.com/v1#secret", "https://gateway.example.com:70000/v1",
                     "https://gateway.example.com/v1/chat/completions",
                     "https://gateway.example.com/v1\nmodel=injected"]:
            with self.subTest(base=base), self.assertRaises(ValueError):
                provider.responses_endpoint(base)

    def test_cannot_select_ci_credentials_or_inject_outputs(self):
        for name in ["AUTH_ADMIN_TOKEN", "CODEX_AUTH_BUNDLE", "CODEX_INTEGRATION_ENV_JSON",
                     "GITHUB_TOKEN", "sk-not-a-secret-name", "KEY\nmodel=injected"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                provider.resolve({"INPUT_API_KEY_SECRET": name})
        for model in ["--help", "model\napi_key_secret=AUTH_ADMIN_TOKEN", "model name"]:
            with self.subTest(model=model), self.assertRaises(ValueError):
                provider.resolve({"INPUT_MODEL": model})

    def test_provider_command_emits_only_normalized_non_secret_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "outputs"
            env = {k: v for k, v in os.environ.items() if not k.startswith(("INPUT_", "DEFAULT_"))}
            env.update(GITHUB_OUTPUT=str(output), INPUT_BASE_URL="https://custom.example.com/v1/",
                       INPUT_API_KEY_SECRET="MY_PROVIDER_API_KEY", INPUT_MODEL="my-model")
            result = subprocess.run([sys.executable, provider.__file__], env=env, capture_output=True)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(output.read_text(), "responses_endpoint=https://custom.example.com/v1/responses\napi_key_secret=MY_PROVIDER_API_KEY\nmodel=my-model\n")
            output.unlink()
            env["INPUT_BASE_URL"] = "https://canary-credential@custom.example.com/v1"
            result = subprocess.run([sys.executable, provider.__file__], env=env, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn(b"canary-credential", result.stdout + result.stderr)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
