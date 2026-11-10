# Owner Development Agent

This directory contains the private autonomous development agent for the bot owner. It is intentionally independent from the WhatsApp plugin/event entry point.

## Integration

The future `events/plugins/ai/_chatbot-agent.js` only needs to create one integration, pass the serialized message plus listener context, and send the returned text:

```js
import { createPluginAgentIntegration } from '../../../agent/plugin.js'

const ownerAgent = createPluginAgentIntegration()

export default {
   owner: true,
   async run(m, context) {
      const result = await ownerAgent.handleMessage(m, context)
      if (result?.text) await m.reply(result.text)
   }
}
```

The event must still declare `owner: true`, but that is not the only security boundary. `OwnerGuard` independently requires `context.isOwner === true` and an exact normalized match against `global.ownerNumber` or `global.owners` on every interaction and before every tool round.

## Provider configuration

The agent uses the same OpenAI-compatible environment and endpoint selection as `ro-lang`, without adding a package. Configuration priority:

- The root `.env` is loaded through the same loader used by `ro-lang`.
- `AGENT_*` can override `RO_LANG_*`, which can override the corresponding `OPENAI_*` values.
- `RO_LANG_API_MODE` / `OPENAI_API_MODE` supports `auto`, `responses`, and `chat_completions`.
- Full endpoint URLs ending in `/responses` or `/chat/completions` are normalized without duplicating the route.

Agent responses use reliable WhatsApp text by default. Set `AGENT_MESSAGE_STYLE=airich` to opt into the experimental AIRich renderer. Buttons remain separate quick-reply messages because `DOCS_BAILEYS.md` documents that `richResponseMessage` and `interactiveMessage` cannot be combined, and AIRich rendering is account/client dependent.

## Safety model

- All paths remain inside the project root and symlink escapes are rejected.
- `.env`, auth/session folders, databases, Git internals, and credential paths cannot be read or changed.
- Secret-looking values are redacted from file, process, and network output.
- Existing files are edited atomically and backed up below `agent/.state/backups/`.
- Critical entry/configuration files and destructive operations create a short-lived confirmation request.
- The owner can approve naturally in the next message; the model then invokes `confirm_action`.
- Commands are executed without a shell, with a small allowlist and a minimal environment.
- Network access blocks private/local addresses, credential-bearing URLs, binary payloads, and oversized responses.
- Live administration tools expose only aggregate status, allowlisted boolean settings, command enable/disable state, and the existing controlled IPC restart path.

## Extension

Add a module under `agent/tools/` and register it in `agent/tools/index.js`. A tool definition consists of `name`, `description`, JSON Schema `parameters`, and an async `execute(args, context)` function. Runtime memory, tasks, decisions, confirmations, audit summaries, and backups are stored below the ignored `agent/.state/` directory.

