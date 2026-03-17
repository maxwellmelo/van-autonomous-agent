# Methodology Restructure

**Date**: 2026-03-17
**Scope**: Added `methodology/` directory and updated `README.md`

---

## What Changed

### Before

The project had a single installation path: `openclaw install https://github.com/maxwellmelo/van-autonomous-agent`, which installed the full TypeScript agent. Users who wanted only the cognitive framework (the prompt system) had no way to install just that component — they received the entire runtime whether they needed it or not.

The README.md Quick Start section described only the full-agent installation path.

### After

The project now has two clearly defined installation paths.

**New: `methodology/` directory** — A self-contained directory containing:

- `methodology/README.md` — Standalone documentation covering what the methodology is, how to install it, how to integrate the prompts into any agent, how to adapt them, the cognitive loop (with Mermaid diagrams), the goal hierarchy system, the revenue evaluation framework, and design principles.
- `methodology/MANIFEST.md` — A table of all prompt files with one-line descriptions, loading order recommendation, and minimal viable agent configuration.
- `methodology/prompts/` — Copies of all ten prompt files from `src/prompts/`:
  - `core-identity.md`
  - `cognitive-loop.md`
  - `goal-manager.md`
  - `memory-manager.md`
  - `action-planner.md`
  - `reflection.md`
  - `self-evolution.md`
  - `revenue-strategist.md`
  - `risk-assessor.md`
  - `world-model.md`

**Updated: `README.md`**

- Added a "Two Ways to Use This Project" section immediately after the "What is Van?" section, explaining Option A (methodology only) and Option B (full agent) with install commands for each.
- Rewrote the Quick Start section to present both paths with separate headings, prerequisites, commands, and development-mode instructions.

The original prompt files in `src/prompts/` are unchanged. The TypeScript codebase continues to import from that location. The `methodology/prompts/` files are copies, not symlinks, to ensure the methodology directory is fully self-contained without requiring the repository to be cloned with symlink support.

---

## Why This Change Was Made

**Separation of concerns**: The cognitive framework (the ten prompt files) is conceptually independent of the TypeScript implementation. A user with their own agent runtime should be able to adopt Van's OODA+ loop, goal hierarchy, and revenue evaluation framework without adopting the full runtime.

**Reduced installation friction**: Users who want just the methodology previously had to clone the whole repository and manually extract the relevant files. The `--path methodology` install flag gives them a direct, supported path.

**Cleaner discoverability**: OpenClaw's skill discovery system benefits from a well-documented, manifest-driven directory. `MANIFEST.md` provides the one-line descriptions needed for that discovery surface.

**Better README clarity**: The original Quick Start assumed a single installation intent. The new structure makes both paths equally prominent, reducing confusion for users who do not need the full TypeScript runtime.

---

## Files Created

| File | Purpose |
|------|---------|
| `methodology/README.md` | Standalone guide for the methodology |
| `methodology/MANIFEST.md` | Prompt file manifest for OpenClaw skill discovery |
| `methodology/prompts/core-identity.md` | Copy from `src/prompts/` |
| `methodology/prompts/cognitive-loop.md` | Copy from `src/prompts/` |
| `methodology/prompts/goal-manager.md` | Copy from `src/prompts/` |
| `methodology/prompts/memory-manager.md` | Copy from `src/prompts/` |
| `methodology/prompts/action-planner.md` | Copy from `src/prompts/` |
| `methodology/prompts/reflection.md` | Copy from `src/prompts/` |
| `methodology/prompts/self-evolution.md` | Copy from `src/prompts/` |
| `methodology/prompts/revenue-strategist.md` | Copy from `src/prompts/` |
| `methodology/prompts/risk-assessor.md` | Copy from `src/prompts/` |
| `methodology/prompts/world-model.md` | Copy from `src/prompts/` |
| `docs/methodology-restructure.md` | This documentation file |

## Files Modified

| File | Change |
|------|--------|
| `README.md` | Added "Two Ways to Use This Project" section after "What is Van?"; rewrote Quick Start to cover both installation paths |

## Files Unchanged

All files in `src/prompts/` are unchanged. All TypeScript source files are unchanged. The `src/prompts/` path remains the canonical source for the runtime.
