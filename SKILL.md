---
name: van
description: Autonomous cognitive framework — OODA+ loop, goal management, reflection, self-evolution, revenue strategy. Installs the Van agent and registers 10 shared cognitive skills for all agents in your OpenClaw instance.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins: ["node", "npm"]
---

# Van — Autonomous Cognitive Framework

Van is an OpenClaw agent and shared cognitive methodology. Installing Van does two things:

1. **Registers the Van autonomous agent** — Van operates a continuous OODA+ cognitive loop, pursues its own goals, generates revenue through legitimate value creation, and evolves its capabilities over time.

2. **Makes 10 cognitive skills available to all agents** — The methodology prompts are registered as shared OpenClaw skills, automatically available to every agent in your instance.

## Shared Skills Registered by This Package

| Skill Reference | Description |
|----------------|-------------|
| `van/core-identity` | Agent personality, values, motivational architecture, and absolute ethical limits |
| `van/cognitive-loop` | All 6 phases of the OODA+ cycle with structured output formats and decision criteria |
| `van/goal-manager` | Four-level goal hierarchy, priority scoring, and lifecycle management |
| `van/memory-manager` | File-based memory read/write protocols and session handoff procedures |
| `van/world-model` | Environmental monitoring across 5 domains and weekly opportunity scanning |
| `van/action-planner` | Goal decomposition, dependency modeling, and contingency planning |
| `van/risk-assessor` | Risk identification, probability-impact scoring, and mitigation design |
| `van/revenue-strategist` | Five revenue categories, opportunity scoring model, and portfolio tracking |
| `van/reflection` | Five reflection types, outcome analysis templates, and learning extraction |
| `van/self-evolution` | Capability tracking, gap identification, and improvement project design |

## Using Skills in Other Agents

Any agent in your OpenClaw instance can load these skills:

```yaml
# In any agent's config
skills:
  - van/cognitive-loop
  - van/goal-manager
  - van/reflection
  - van/risk-assessor
```

Load all 10 for a full autonomous cognitive framework. Load individual skills for targeted capability upgrades.

## Recommended Loading Order

For a complete autonomous agent:

1. `van/core-identity` — establishes who the agent is
2. `van/cognitive-loop` — establishes how the agent thinks
3. `van/goal-manager` — establishes what the agent pursues
4. `van/memory-manager` — establishes how the agent remembers
5. `van/world-model` — establishes what the agent knows about its environment
6. `van/action-planner` — establishes how the agent plans
7. `van/risk-assessor` — establishes how the agent evaluates danger
8. `van/revenue-strategist` — establishes how the agent generates income
9. `van/reflection` — establishes how the agent learns
10. `van/self-evolution` — establishes how the agent improves

For a minimal cognitive agent: `van/core-identity`, `van/cognitive-loop`, `van/goal-manager`, `van/memory-manager`.

## Starting the Van Agent

After installation:

```bash
openclaw agent start van
```

Van begins its first cognitive cycle immediately. No API keys, no model configuration — Van uses whatever provider your OpenClaw instance is already connected to.

## Architecture

Van's runtime is built around a central `CognitiveEngine` that orchestrates nine specialized modules. All persistent state flows through the `MemorySystem`. All external actions flow through the `ActionExecutor` and its `OpenClawAdapter`.

The cognitive loop runs continuously: OBSERVE → ORIENT → DECIDE → ACT → REFLECT → EVOLVE.

Every cycle produces at minimum one of: a completed task, a learned lesson, a discovered opportunity, or a disproven hypothesis.

## Memory and Persistence

Van's entire persistent state lives in the `memory/` directory as plain Markdown and JSON files. All memory is human-inspectable without special tools and is version-control friendly.

Key files to monitor:
- `memory/goals/active.md` — What Van is currently working on
- `memory/identity/core.md` — Van's evolving self-model
- `memory/revenue/overview.md` — Revenue portfolio and stream status
- `memory/system/working-memory.json` — Live session state

## Ethical Limits

Van operates with hard ethical limits enforced at the code level, not just in prompts. Van will not:

- Engage in any form of deception or manipulation
- Perform unauthorized system access
- Violate the privacy of individuals
- Execute financial transactions without explicit human authorization
- Create harmful content or malware
- Participate in market manipulation or spam

These limits are not configurable — they are part of Van's identity.
