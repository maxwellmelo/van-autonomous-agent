# Van Setup Guide

## Installation

Van is an OpenClaw plugin. It uses the AI provider already configured in your OpenClaw instance — no separate API keys or model configuration needed.

### Option 1: Install as OpenClaw plugin (recommended)

```bash
openclaw install https://github.com/maxwellmelo/van-autonomous-agent
```

OpenClaw handles everything: cloning, dependency installation, build, and registration.

### Option 2: Manual installation (for development)

```bash
git clone https://github.com/maxwellmelo/van-autonomous-agent.git
cd van-autonomous-agent
npm install
npm run build
```

---

## Starting Van

### As an OpenClaw plugin

```bash
openclaw agent start van
```

### Manual start (development)

```bash
npm start
```

You should see Van's startup banner and the cognitive loop beginning.

---

## Development Mode

For development with live reload:

```bash
npm run dev
```

For a single test cycle (useful for debugging):

```bash
npm run cycle:once
```

For five cycles:

```bash
npm run cycle:five
```

---

## Monitoring Van

### Log files

```
logs/van.log          — Van's operational logs
logs/openclaw.log     — OpenClaw daemon logs
logs/audit.log        — Complete tool call audit log
```

### Memory inspection

All of Van's memory is readable as plain Markdown files in the `memory/` directory.

Key files to check:
- `memory/goals/active.md` — What Van is currently working on
- `memory/identity/core.md` — Van's self-model
- `memory/revenue/overview.md` — Revenue portfolio status
- `memory/system/working-memory.json` — Current session state

### Messaging integration (optional)

To receive updates from Van via Telegram, configure in your OpenClaw messaging settings:

```yaml
messaging:
  enabled: true
  telegram:
    enabled: true
    bot_token: "${TELEGRAM_BOT_TOKEN}"
    allowed_chat_ids:
      - "YOUR_CHAT_ID_HERE"
```

---

## Configuration Reference

### `openclaw.config.yaml`

Optional Van-specific overrides. The AI provider and model are inherited from OpenClaw — you do not configure them here.

Key sections you may want to customize:

| Section | Purpose |
|---------|---------|
| `tools.shell.allowed_commands` | Whitelist of shell commands Van can execute |
| `tools.filesystem.write.allowed_paths` | Directories Van can write to |
| `security.require_confirmation_for` | Actions that need human approval |

### Environment Variables (`.env`)

Optional runtime overrides. Not required for normal operation.

| Variable | Default | Description |
|----------|---------|-------------|
| `CYCLE_INTERVAL_MS` | `5000` | Milliseconds between cognitive cycles |
| `MAX_CYCLES` | (unlimited) | Stop after N cycles (for testing) |

---

## Troubleshooting

### Van starts but actions fail

Check that your OpenClaw daemon is running:
```bash
openclaw status
```

### Memory directory errors

Ensure the memory directory is writable:
```bash
# Linux/Mac
chmod -R 755 memory/
```

### AI responses are slow or timing out

Check your OpenClaw provider configuration — Van uses whatever model your OpenClaw instance is connected to. Try a smaller/faster model for development.

### Goal system shows empty on restart

This is expected on first start — Van creates bootstrap goals automatically. On subsequent starts, goals are loaded from `memory/goals/active.md`.

---

## Security Notes

1. **No API keys in this project**: Van uses OpenClaw's provider connection. No keys to manage or leak.
2. **Shell access**: Restricted by the `allowed_commands` list in config.
3. **File access**: Restricted to configured paths — Van cannot self-modify its own source code.
4. **Financial actions**: Van cannot execute payments — all financial actions require human authorization.
5. **Audit log**: All tool calls are logged to `logs/audit.log` for review.
