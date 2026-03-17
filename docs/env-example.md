# Change Log: .env.example and src/index.ts

## File: `.env.example`

### Before
Contained 59 lines with redundant settings — API keys, provider config, agent ID, memory path, log level, messaging tokens — all of which are handled by OpenClaw itself.

### After
Contains only 3 variables that are Node.js runtime overrides (not configurable via OpenClaw):
- `OPENCLAW_URL` — daemon URL override (commented, default: `http://localhost:18789`)
- `CYCLE_INTERVAL_MS` — interval between cognitive cycles (commented, default: `5000`)
- `MAX_CYCLES` — cycle limit for testing (commented, default: unlimited)

### Advantages
- Eliminates configuration duplication between `.env` and `openclaw.config.yaml`
- Single source of truth: everything OpenClaw-related stays in `openclaw.config.yaml`
- Reduces risk of conflicting settings between the two files
- `.env` now contains only what the Node.js runtime actually needs

## File: `src/index.ts`

### Before
`CONFIG` had 6 fields, including `agentId`, `memoryRootPath`, and `logLevel` read from env vars.

### After
`CONFIG` has 3 fields. `agentId` and `memoryRootPath` use fixed values matching `openclaw.config.yaml`. Comments indicate where each value is configured in the YAML.

### Rationale
`openclaw.config.yaml` is the central configuration point. `index.ts` does not need to re-read from env what is already defined in the OpenClaw YAML config.
