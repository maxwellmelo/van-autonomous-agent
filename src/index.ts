/**
 * @file src/index.ts
 * @description Entry point for the Van autonomous agent system.
 *
 * This file initializes all subsystems, wires them together, and starts
 * the autonomous cognitive loop. It also handles process lifecycle events
 * (SIGINT, SIGTERM) for graceful shutdown.
 *
 * Usage:
 *   npm start           — Start Van in production mode
 *   npm run dev         — Start with hot reload for development
 *   npm run cycle:once  — Execute a single cognitive cycle for testing
 */

import { MemorySystem } from './core/memory-system.js';
import { GoalSystem } from './core/goal-system.js';
import { PersonalityEngine } from './core/personality.js';
import { ActionExecutor, OpenClawAdapter } from './core/action-executor.js';
import { ReflectionEngine } from './core/reflection-engine.js';
import { EvolutionEngine } from './core/evolution-engine.js';
import { RevenueEngine } from './core/revenue-engine.js';
import { WorldModel } from './core/world-model.js';
import { CognitiveEngine } from './core/cognitive-engine.js';

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * Runtime configuration.
 *
 * Van is an OpenClaw plugin — the AI provider and model are inherited
 * from the OpenClaw instance. This CONFIG only holds optional runtime
 * overrides for the cognitive loop timing.
 */
const CONFIG = {
  // OpenClaw daemon URL (override only if running on non-default port)
  openClawUrl: process.env.OPENCLAW_URL ?? 'http://localhost:18789',

  // Cognitive loop timing
  cycleIntervalMs: parseInt(process.env.CYCLE_INTERVAL_MS ?? '5000', 10),
  maxCycles: process.env.MAX_CYCLES ? parseInt(process.env.MAX_CYCLES, 10) : undefined,
};

// ============================================================
// DEPENDENCY INJECTION AND WIRING
// ============================================================

/**
 * Creates and wires all subsystems together.
 *
 * The dependency order is:
 * 1. MemorySystem (no dependencies)
 * 2. GoalSystem, PersonalityEngine, WorldModel (depend on MemorySystem)
 * 3. EvolutionEngine, RevenueEngine (depend on MemorySystem + GoalSystem)
 * 4. ReflectionEngine (depends on MemorySystem + PersonalityEngine)
 * 5. ActionExecutor (depends on MemorySystem + OpenClawAdapter)
 * 6. CognitiveEngine (depends on all of the above)
 */
function createAgentSystem() {
  // Layer 1: Foundation (memory root configured in openclaw.config.yaml → memory.root_path)
  const memory = new MemorySystem('./memory');

  // Layer 2: Core subsystems
  const personality = new PersonalityEngine(memory);
  const worldModel = new WorldModel(memory);
  const goalSystem = new GoalSystem(memory);

  // Layer 3: Dependent subsystems
  const evolutionEngine = new EvolutionEngine(memory);
  const revenueEngine = new RevenueEngine(memory, goalSystem);
  const reflectionEngine = new ReflectionEngine(memory, personality);

  // Layer 4: Execution layer (agent ID configured in openclaw.config.yaml → agent.id)
  const openClawAdapter = new OpenClawAdapter(CONFIG.openClawUrl, 'van-agent-001');
  const actionExecutor = new ActionExecutor(memory, openClawAdapter);

  // Layer 5: Cognitive engine (orchestrator)
  const cognitiveEngine = new CognitiveEngine({
    memory,
    goalSystem,
    personality,
    executor: actionExecutor,
    reflectionEngine,
    evolutionEngine,
    revenueEngine,
    worldModel,
    cycleIntervalMs: CONFIG.cycleIntervalMs,
  });

  return {
    cognitiveEngine,
    memory,
    goalSystem,
    personality,
    worldModel,
    evolutionEngine,
    revenueEngine,
    reflectionEngine,
    actionExecutor,
    openClawAdapter,
  };
}

// ============================================================
// STARTUP BANNER
// ============================================================

function printStartupBanner(): void {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    VAN AUTONOMOUS AGENT                     ║');
  console.log('║           Cognitive Loop — OpenClaw Integration             ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  OpenClaw: ${CONFIG.openClawUrl.padEnd(52)}║`);
  console.log(`║  Cycle interval: ${String(CONFIG.cycleIntervalMs).padEnd(4)}ms${' '.repeat(42)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

async function main(): Promise<void> {
  printStartupBanner();

  const { cognitiveEngine, openClawAdapter } = createAgentSystem();

  // Check OpenClaw availability
  const openClawHealthy = await openClawAdapter.healthCheck();
  if (!openClawHealthy) {
    console.warn('[Van] WARNING: OpenClaw daemon not responding at', CONFIG.openClawUrl);
    console.warn('[Van] Van will start but tool executions may fail until OpenClaw is available.');
    console.warn('[Van] To start OpenClaw: run `openclaw start` or see docs/setup.md');
  } else {
    console.log('[Van] OpenClaw daemon healthy.');
  }

  // Initialize all subsystems
  await cognitiveEngine.initialize();

  // Set up graceful shutdown handlers
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[Van] Received ${signal} — initiating graceful shutdown...`);
    await cognitiveEngine.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Handle uncaught errors — log and continue if possible
  process.on('uncaughtException', (error) => {
    console.error('[Van] Uncaught exception:', error);
    // Don't exit — let the cognitive loop's error handling manage recovery
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Van] Unhandled rejection:', reason);
  });

  // Start the cognitive loop
  console.log('[Van] Starting autonomous operation...');
  console.log('[Van] Press Ctrl+C to stop gracefully.');
  console.log('');

  await cognitiveEngine.run(CONFIG.maxCycles);
}

// ============================================================
// EXECUTION
// ============================================================

main().catch((error) => {
  console.error('[Van] Fatal startup error:', error);
  process.exit(1);
});
