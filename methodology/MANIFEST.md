# Methodology Manifest

This file lists all prompt files in the Van methodology, with one-line descriptions suitable for OpenClaw's skill discovery system.

## Prompt Files

| File | Role | Description |
|------|------|-------------|
| `prompts/core-identity.md` | Identity | Defines the agent's personality (7 traits), core values, motivational architecture, emotional state model, and absolute ethical limits. Load this first — it is the character foundation all other prompts build on. |
| `prompts/cognitive-loop.md` | Orchestration | Governs all 6 phases of the OODA+ cycle (Observe, Orient, Decide, Act, Reflect, Evolve). Contains structured output formats, decision criteria, error handling protocols, and cycle rhythm modes. |
| `prompts/goal-manager.md` | Goal System | Defines the four-level goal hierarchy (vision / strategic / tactical / micro), the priority scoring system, goal lifecycle states, and creation/closing protocols. |
| `prompts/memory-manager.md` | Persistence | Defines protocols for reading from and writing to the file-based memory system, covering retrieval strategies, write formats, consolidation cadence, and session handoff procedures. |
| `prompts/action-planner.md` | Execution Planning | Governs how high-level goals are decomposed into concrete, executable action plans, including dependency modeling, contingency planning, and parallelization logic. |
| `prompts/reflection.md` | Learning | Defines the structured learning-extraction process: five reflection types (micro, cycle, domain, strategic, transformative), outcome analysis templates, and knowledge categorization. |
| `prompts/self-evolution.md` | Growth | Governs capability tracking across five categories, gap identification, improvement project design, and the evidence-based framework for deciding when to continue, adjust, pivot, or abandon a strategy. |
| `prompts/revenue-strategist.md` | Revenue | Defines the full revenue taxonomy (5 categories, 20+ strategies), a four-dimension opportunity scoring model (feasibility, potential, sustainability, alignment), execution phases, and portfolio tracking. |
| `prompts/risk-assessor.md` | Risk Management | Defines how risks are identified, classified by type and severity (5 categories), scored (probability x impact), and mitigated before and during action execution. |
| `prompts/world-model.md` | Environment | Governs environmental monitoring across 5 domains: digital economy, AI landscape, business fundamentals, platform tools, and competitive position. Includes weekly opportunity scan and model update protocols. |

## Loading Order

For a complete agent, load prompts in this order:

1. `core-identity.md` — establishes who the agent is
2. `cognitive-loop.md` — establishes how the agent thinks
3. `goal-manager.md` — establishes what the agent pursues
4. `memory-manager.md` — establishes how the agent remembers
5. `world-model.md` — establishes what the agent knows about its environment
6. `action-planner.md` — establishes how the agent plans
7. `risk-assessor.md` — establishes how the agent evaluates danger
8. `revenue-strategist.md` — establishes how the agent generates income
9. `reflection.md` — establishes how the agent learns
10. `self-evolution.md` — establishes how the agent improves

For a minimal viable agent (cognitive loop only), load: `core-identity.md`, `cognitive-loop.md`, `goal-manager.md`, `memory-manager.md`.

## OpenClaw Skill Discovery

This methodology is registered as an OpenClaw skill package. Install with:

```bash
openclaw install https://github.com/maxwellmelo/van-autonomous-agent --path methodology
```

Each prompt file is loadable individually as a skill component, or the entire methodology can be loaded as a single skill set.
