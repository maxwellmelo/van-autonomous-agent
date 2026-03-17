# Van Setup Guide

## Prerequisites

1. **Node.js 20+**: Required for the TypeScript runtime
   - Download: https://nodejs.org/
   - Verify: `node --version`

2. **OpenClaw**: The execution platform Van runs on
   - Install: Follow OpenClaw documentation
   - Verify: `openclaw --version`

3. **AI Provider API Key**: Van needs an LLM to reason
   - Anthropic Claude (recommended): https://console.anthropic.com/
   - OpenAI GPT-4: https://platform.openai.com/
   - Or any provider supported by OpenClaw

---

## Installation

### 1. Clone or prepare the Van directory

```bash
cd "E:/Vibe Coding/Van"
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Build TypeScript

```bash
npm run build
```

### 4. Configure AI provider

Edit `openclaw.config.yaml` — find the `model` section:

```yaml
model:
  provider: "anthropic"
  name: "claude-3-5-sonnet-20241022"
```

Set your API key as an environment variable:

```bash
# Windows (PowerShell)
$env:ANTHROPIC_API_KEY = "your-key-here"

# Linux/Mac
export ANTHROPIC_API_KEY="your-key-here"
```

### 5. Start OpenClaw daemon

```bash
openclaw start --config openclaw.config.yaml
```

Verify it is running:
```bash
openclaw status
```

### 6. Start Van

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

To receive updates from Van via Telegram:

1. Create a Telegram bot: Talk to @BotFather on Telegram
2. Get your chat ID: Talk to @userinfobot
3. Configure in `openclaw.config.yaml`:

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

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_URL` | `http://localhost:18789` | OpenClaw daemon URL (override only if non-default port) |
| `CYCLE_INTERVAL_MS` | `5000` | Milliseconds between cognitive cycles |
| `MAX_CYCLES` | (unlimited) | Stop after N cycles (for testing) |

> All other settings (AI provider, API keys, agent ID, memory path, log level, messaging) are configured in `openclaw.config.yaml`.

---

## Troubleshooting

### Van starts but actions fail

Check that OpenClaw daemon is running:
```bash
openclaw status
curl http://localhost:18789/health
```

### Memory directory errors

Ensure the memory directory is writable:
```bash
# Linux/Mac
chmod -R 755 memory/
```

### AI responses are slow or timing out

Adjust the model configuration in `openclaw.config.yaml`:
- Try a smaller/faster model for development
- Increase timeout settings if on a slow connection

### Goal system shows empty on restart

This is expected on first start — Van creates bootstrap goals automatically. On subsequent starts, goals are loaded from `memory/goals/active.md`.

---

## Security Notes

1. **API keys**: Never commit API keys to version control. Use environment variables.
2. **Shell access**: The shell tool is restricted by the allowed_commands list in config.
3. **File access**: Filesystem access is restricted to configured paths.
4. **Financial actions**: Van cannot execute payments — all financial actions require human authorization.
5. **Audit log**: All tool calls are logged to `logs/audit.log` for review.
