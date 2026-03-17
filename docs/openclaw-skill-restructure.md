# OpenClaw Skill Restructure — Documentation

## What Changed and Why

This document records the changes made to restructure Van into a proper OpenClaw skill and agent, replacing the previous non-existent `openclaw install` command with the correct installation pattern.

---

## Problem

The previous README and docs/setup.md referenced an `openclaw install <github-url>` command that does not exist in OpenClaw. The project claimed to install via:

```bash
openclaw install https://github.com/maxwellmelo/van-autonomous-agent
```

This command is not part of the OpenClaw CLI. OpenClaw provides:
- `openclaw plugins install <npm-package>` — for system-level plugins
- `openclaw agents add <name> --workspace <path>` — to register agents
- Skills are auto-discovered from `~/.openclaw/skills/<skill-name>/SKILL.md`

---

## Files Created

### `SKILL.md` (project root)

**Before**: Did not exist.

**After**: A top-level OpenClaw skill manifest with YAML frontmatter declaring the `van` skill. Describes all 10 shared cognitive skills, how to use them in other agents, recommended loading order, and Van's core architecture.

**Why**: OpenClaw auto-discovers skills from SKILL.md files. This file is the entry point for the `van` skill package and is copied to `~/.openclaw/skills/van/SKILL.md` during setup.

---

### `methodology/skills/*/SKILL.md` (10 files)

**Before**: Did not exist. The prompts only lived in `methodology/prompts/` as plain Markdown without SKILL.md manifests.

**After**: Each of the 10 prompts now has a corresponding `SKILL.md` in `methodology/skills/<skill-name>/SKILL.md` with:
- YAML frontmatter (`name`, `description`, `version`, `load_order`)
- The full content of the corresponding prompt

The 10 skills created:
| Path | Skill Name | Load Order |
|------|-----------|------------|
| `methodology/skills/core-identity/SKILL.md` | `van/core-identity` | 1 |
| `methodology/skills/cognitive-loop/SKILL.md` | `van/cognitive-loop` | 2 |
| `methodology/skills/goal-manager/SKILL.md` | `van/goal-manager` | 3 |
| `methodology/skills/memory-manager/SKILL.md` | `van/memory-manager` | 4 |
| `methodology/skills/world-model/SKILL.md` | `van/world-model` | 5 |
| `methodology/skills/action-planner/SKILL.md` | `van/action-planner` | 6 |
| `methodology/skills/risk-assessor/SKILL.md` | `van/risk-assessor` | 7 |
| `methodology/skills/revenue-strategist/SKILL.md` | `van/revenue-strategist` | 8 |
| `methodology/skills/reflection/SKILL.md` | `van/reflection` | 9 |
| `methodology/skills/self-evolution/SKILL.md` | `van/self-evolution` | 10 |

**Why**: OpenClaw skill discovery requires SKILL.md files with YAML frontmatter. Without them, the prompts are not loadable as skills. Each skill must be individually discoverable so agents can load only the skills they need (e.g., an agent that only wants `van/reflection` without the full methodology).

---

### `setup.sh` (project root)

**Before**: Did not exist.

**After**: A bash setup script that:
1. Checks prerequisites (node 20+, npm, openclaw)
2. Runs `npm install` and `npm run build`
3. Creates the `memory/` directory structure
4. Copies skill SKILL.md files to `~/.openclaw/skills/van/`
5. Registers the agent via `openclaw agents add van --workspace <path>`
6. Prints next steps

**Why**: The installation process now requires multiple explicit steps. A setup script gives users one command to run after cloning rather than manually executing each step. The script is idempotent (safe to re-run) and includes error handling at each step.

---

### `setup.ps1` (project root)

**Before**: Did not exist.

**After**: PowerShell equivalent of `setup.sh` for Windows users, using native PowerShell patterns (`New-Item`, `Copy-Item`, `Join-Path`, etc.).

**Why**: Windows users cannot run bash scripts natively. The PowerShell script provides first-class Windows support without requiring WSL.

---

## Files Modified

### `README.md` — Quick Start section

**Before**:
```bash
openclaw plugins install @martian-engineering/lossless-claw
openclaw install https://github.com/maxwellmelo/van-autonomous-agent
```

**After**:
```bash
# Step 1
openclaw plugins install @martian-engineering/lossless-claw

# Step 2
git clone https://github.com/maxwellmelo/van-autonomous-agent.git ~/.openclaw/agents-workspaces/van

# Step 3
cd ~/.openclaw/agents-workspaces/van
chmod +x setup.sh
./setup.sh
```

The Mermaid diagram reference to `openclaw install van` was also updated to `./setup.sh`.

**Why**: The `openclaw install` command does not exist. The corrected flow reflects the actual OpenClaw installation pattern: clone into the agents workspace, then run the setup script.

---

### `docs/setup.md`

**Before**: Referenced `openclaw install https://github.com/maxwellmelo/van-autonomous-agent` as "Option 1: Install as OpenClaw plugin (recommended)".

**After**: Full three-step installation guide matching the README. Added:
- `setup.sh` and `setup.ps1` usage instructions
- What the setup script does (explicit steps list)
- How to re-run setup for updates (idempotency note)
- Troubleshooting entries for `setup.sh` permission denied, `setup.ps1` execution policy, and already-registered agent
- Documentation on using shared skills in other agents with code examples

**Why**: The old setup.md described an installation method that does not work. The updated document describes the actual correct process with Windows support and covers common failure modes.

---

## Installation Flow Summary

Old (broken):
```
openclaw install <url>  ←  command does not exist
```

New (correct):
```
1. openclaw plugins install @martian-engineering/lossless-claw
2. git clone <repo> ~/.openclaw/agents-workspaces/van
3. cd ~/.openclaw/agents-workspaces/van && ./setup.sh
   └── npm install + npm run build
   └── mkdir -p memory/...
   └── cp SKILL.md → ~/.openclaw/skills/van/SKILL.md
   └── cp methodology/skills/*/SKILL.md → ~/.openclaw/skills/van/*/SKILL.md
   └── openclaw agents add van --workspace ~/.openclaw/agents-workspaces/van
```
