# Van Setup Guide

## Installation

Van is an OpenClaw agent and shared cognitive framework. It uses the AI provider already configured in your OpenClaw instance — no separate API keys or model configuration needed.

### Step 1: Install the lossless-claw plugin

```bash
openclaw plugins install @martian-engineering/lossless-claw
```

This replaces the default sliding-window context with DAG-based lossless memory. Van (and all your agents) never lose context across sessions.

### Step 2: Clone Van into your OpenClaw agents workspace

```bash
git clone https://github.com/maxwellmelo/van-autonomous-agent.git ~/.openclaw/agents-workspaces/van
```

On Windows:

```powershell
git clone https://github.com/maxwellmelo/van-autonomous-agent.git "$env:USERPROFILE\.openclaw\agents-workspaces\van"
```

### Step 3: Run the setup script

On Linux/macOS:

```bash
cd ~/.openclaw/agents-workspaces/van
chmod +x setup.sh
./setup.sh
```

On Windows (PowerShell):

```powershell
cd $env:USERPROFILE\.openclaw\agents-workspaces\van
.\setup.ps1
```

The setup script performs the following steps automatically:
1. Runs `npm install` and `npm run build`
2. Creates the `memory/` directory structure
3. Copies the 10 cognitive skill manifests into `~/.openclaw/skills/van/`
4. Registers the Van agent via `openclaw agents add van --workspace <path>`
5. Prints next steps on success

If any step fails, the script exits with a clear error message indicating the cause.

---

## Starting Van

### As an OpenClaw agent

```bash
openclaw agent start van
```

Van will begin its first cognitive cycle and print a startup banner. The first cycle creates bootstrap goals in `memory/goals/active.md`.

### Manual start (for development)

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

## Updating Van

To pull the latest changes and re-run setup:

```bash
cd ~/.openclaw/agents-workspaces/van
git pull
./setup.sh      # or .\setup.ps1 on Windows
```

The setup script is idempotent — re-running it is safe. It overwrites skill files and skips agent re-registration if the agent is already registered.

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

## Using Shared Cognitive Skills

After setup, the 10 Van cognitive skills are available to all agents in your OpenClaw instance. Load them in any agent's configuration:

```yaml
# In any agent's config
skills:
  - van/core-identity
  - van/cognitive-loop
  - van/goal-manager
  - van/memory-manager
  - van/world-model
  - van/action-planner
  - van/risk-assessor
  - van/revenue-strategist
  - van/reflection
  - van/self-evolution
```

Use any subset. Recommended minimal set for a basic autonomous agent:

```yaml
skills:
  - van/core-identity
  - van/cognitive-loop
  - van/goal-manager
  - van/memory-manager
```

The skill files are located at `~/.openclaw/skills/van/`.

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

Copy `.env.example` to `.env` and uncomment only the variables you need to override.

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

### setup.sh: Permission denied

Make the script executable:
```bash
chmod +x setup.sh
```

### setup.ps1: Script execution is disabled

Allow script execution in PowerShell:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Agent already registered error

The setup script checks for existing registration and skips re-registration. If you need to force re-registration, first remove the existing agent:
```bash
openclaw agents remove van
./setup.sh
```

---

## Security Notes

1. **No API keys in this project**: Van uses OpenClaw's provider connection. No keys to manage or leak.
2. **Shell access**: Restricted by the `allowed_commands` list in config.
3. **File access**: Restricted to configured paths — Van cannot self-modify its own source code.
4. **Financial actions**: Van cannot execute payments — all financial actions require human authorization.
5. **Audit log**: All tool calls are logged to `logs/audit.log` for review.
