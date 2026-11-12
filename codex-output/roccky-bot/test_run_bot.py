"""Synthetic subprocess checks; no bot configuration or auth state is imported."""
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import unittest


WRAPPER = Path(__file__).with_name("run-bot.sh")


class RestartWrapperTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="roccky-wrapper-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def run_wrapper(self, source):
        stub = self.root / "worker.py"
        stub.write_text(source, encoding="utf-8")
        return subprocess.run(
            ["bash", str(WRAPPER), "python3", str(stub)],
            cwd=self.root, capture_output=True, text=True, timeout=30,
        )

    def test_success_stops_without_restart(self):
        result = self.run_wrapper("raise SystemExit(0)\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("retrying", result.stderr)

    def test_terminal_authentication_exit_is_preserved(self):
        result = self.run_wrapper("raise SystemExit(78)\n")
        self.assertEqual(result.returncode, 78, result.stderr)
        self.assertNotIn("retrying", result.stderr)

    def test_launcher_crashes_retry_with_increasing_backoff(self):
        result = self.run_wrapper(
            "from pathlib import Path\n"
            "p = Path('attempts')\n"
            "count = int(p.read_text()) + 1 if p.exists() else 1\n"
            "p.write_text(str(count))\n"
            "raise SystemExit(1 if count < 3 else 0)\n"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / "attempts").read_text(), "3")
        self.assertIn("retrying in 1s", result.stderr)
        self.assertIn("retrying in 2s", result.stderr)

    def test_default_command_uses_node_start_script(self):
        npm = self.root / "npm"
        npm.write_text("#!/bin/sh\n[ \"$1\" = run ] && [ \"$2\" = start:node ]\n")
        npm.chmod(0o700)
        result = subprocess.run(
            ["bash", str(WRAPPER)], cwd=self.root,
            env={"PATH": str(self.root) + os.pathsep + os.defpath},
            capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_term_reaches_worker_and_does_not_restart(self):
        descendant = self.root / "descendant.py"
        descendant.write_text(
            "from pathlib import Path\n"
            "import signal, time\n"
            "def stop(*args):\n"
            "    Path('descendant_stopped').write_text('yes')\n"
            "    raise SystemExit(0)\n"
            "signal.signal(signal.SIGTERM, stop)\n"
            "Path('descendant_ready').write_text('yes')\n"
            "while True: time.sleep(0.05)\n"
        )
        stub = self.root / "worker.py"
        stub.write_text(
            "from pathlib import Path\n"
            "import signal, subprocess, sys, time\n"
            "child = subprocess.Popen([sys.executable, 'descendant.py'])\n"
            "def stop(*args):\n"
            "    child.wait(timeout=5)\n"
            "    Path('stopped').write_text('yes')\n"
            "    raise SystemExit(0)\n"
            "signal.signal(signal.SIGTERM, stop)\n"
            "while not Path('descendant_ready').exists(): time.sleep(0.01)\n"
            "Path('ready').write_text('yes')\n"
            "while True: time.sleep(0.05)\n"
        )
        process = subprocess.Popen(
            ["bash", str(WRAPPER), "python3", str(stub)], cwd=self.root,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        try:
            deadline = time.monotonic() + 5
            while not (self.root / "ready").exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            self.assertTrue((self.root / "ready").exists())
            process.send_signal(signal.SIGTERM)
            _, stderr = process.communicate(timeout=25)
            self.assertEqual(process.returncode, 143, stderr)
            self.assertEqual((self.root / "stopped").read_text(), "yes")
            self.assertEqual((self.root / "descendant_stopped").read_text(), "yes")
            self.assertNotIn("retrying", stderr)
        finally:
            if process.poll() is None:
                process.send_signal(signal.SIGTERM)
                process.communicate(timeout=25)


if __name__ == "__main__":
    unittest.main()
