"""Resolve non-secret provider inputs before selecting a GitHub API-key secret."""
import os
import re
import sys
from urllib.parse import urlsplit, urlunsplit

DEFAULT_BASE_URL = "https://api.openai.com/v1"
RESERVED_SECRETS = {"AUTH_ADMIN_TOKEN", "CODEX_AUTH_BUNDLE", "CODEX_INTEGRATION_ENV_JSON"}


def select(env, name, fallback=""):
    return env.get(f"INPUT_{name}", "").strip() or env.get(f"DEFAULT_{name}", "").strip() or fallback


def responses_endpoint(base_url):
    # API keys stay in Secrets; a base URL must not embed authentication.
    if any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in base_url) or "\\" in base_url:
        raise ValueError("base_url contains invalid characters.")
    try:
        url = urlsplit(base_url)
        port = url.port
    except ValueError:
        raise ValueError("base_url is not a valid URL.") from None
    if (url.scheme != "https" or not url.hostname or url.username is not None
            or url.password is not None or url.query or url.fragment
            or "?" in base_url or "#" in base_url or port == 0):
        raise ValueError("base_url must be an HTTPS URL without credentials, query parameters, or fragments.")
    path = url.path.rstrip("/")
    if path.endswith("/chat/completions"):
        raise ValueError("The provider must support the Responses API, not only Chat Completions.")
    if not path.endswith("/responses"):
        path += "/responses"
    return urlunsplit((url.scheme, url.netloc, path, "", ""))


def resolve(env):
    secret_name = select(env, "API_KEY_SECRET", "OPENAI_API_KEY").upper()
    if (not re.fullmatch(r"[A-Z_][A-Z0-9_]*", secret_name)
            or secret_name.startswith("GITHUB_") or secret_name in RESERVED_SECRETS):
        raise ValueError("api_key_secret must name a provider API-key secret, not contain a key or refer to CI credentials.")
    model = select(env, "MODEL")
    if model and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:/@+-]{0,255}", model):
        raise ValueError("model must be a model ID without whitespace or control characters.")
    return {
        "responses_endpoint": responses_endpoint(select(env, "BASE_URL", DEFAULT_BASE_URL)),
        "api_key_secret": secret_name,
        "model": model,
    }


def main():
    try:
        values = resolve(os.environ)
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            for name, value in values.items():
                output.write(f"{name}={value}\n")
    except ValueError as error:
        # Messages are constant strings; never echo a rejected input.
        print(f"::error::{error}", file=sys.stderr)
        return 1
    except Exception:
        print("::error::Could not resolve provider settings.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
