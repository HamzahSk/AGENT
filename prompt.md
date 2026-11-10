Set up GitHub Actions workflows to run my WhatsApp bot inside the "roccky_bot/" directory.

Requirements:

- Analyze the project structure inside "roccky_bot/" and identify the correct startup command.
- Create a GitHub Actions workflow to install dependencies and run the bot.
- Use GitHub Secrets to securely store WhatsApp session credentials and other sensitive environment variables.
- Restore and manage the WhatsApp session from GitHub Secrets so the bot doesn't require QR scanning on every restart.
- Ensure the workflow can automatically restart the bot if it crashes.
- Optimize the workflow for GitHub Actions Ubuntu runners.
- Do not hardcode credentials or modify unrelated project files.

Read the existing source code and configuration files first. Ensure everything is compatible with the bot's current runtime and dependencies.