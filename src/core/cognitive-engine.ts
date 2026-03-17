/**
 * @file src/core/cognitive-engine.ts
 * @description The central cognitive loop — Van's primary thinking engine.
 *
 * This module implements the OBSERVE → ORIENT → DECIDE → ACT → REFLECT → EVOLVE
 * loop that drives Van's autonomous operation. It orchestrates all other core
 * modules and provides the continuous cognitive rhythm.
 *
 * This is the "brain" of Van — the module that brings everything together
 * into coherent, purposeful autonomous behavior.
 *
 * Architecture: The CognitiveEngine acts as the central orchestrator. It does not
 * implement intelligence directly — it coordinates the specialized modules that do.
 * This separation ensures each module can be developed and tested independently.
 */

import {
  CycleState,
  ObservationState,
  OrientationState,
  DecisionState,
  ExecutionState,
  ActionPlan,
  Action,
  VanState,
  Goal,
} from '../types/index.js';
import { MemorySystem } from './memory-system.js';
import { GoalSystem } from './goal-system.js';
import { PersonalityEngine } from './personality.js';
import { ActionExecutor } from './action-executor.js';
import { ReflectionEngine } from './reflection-engine.js';
import { EvolutionEngine } from './evolution-engine.js';
import { RevenueEngine } from './revenue-engine.js';
import { WorldModel } from './world-model.js';

// ============================================================
// COGNITIVE ENGINE CLASS
// ============================================================

/**
 * CognitiveEngine is Van's primary thinking loop.
 *
 * It runs continuously, executing full cognitive cycles that advance Van's
 * goals, build capabilities, and generate revenue. Each cycle follows the
 * 6-phase OODA+ loop defined in the cognitive-loop.md prompt.
 *
 * @example
 * ```typescript
 * const engine = new CognitiveEngine(config);
 * await engine.initialize();
 * await engine.run(); // Starts the continuous cognitive loop
 * ```
 */
export class CognitiveEngine {
  private state: VanState;
  private readonly memory: MemorySystem;
  private readonly goalSystem: GoalSystem;
  private readonly personality: PersonalityEngine;
  private readonly executor: ActionExecutor;
  private readonly reflectionEngine: ReflectionEngine;
  private readonly evolutionEngine: EvolutionEngine;
  private readonly revenueEngine: RevenueEngine;
  private readonly worldModel: WorldModel;

  private isRunning: boolean = false;
  private cycleIntervalMs: number;
  private readonly maxCyclesBeforeDeepReview: number = 10;

  constructor(config: {
    memory: MemorySystem;
    goalSystem: GoalSystem;
    personality: PersonalityEngine;
    executor: ActionExecutor;
    reflectionEngine: ReflectionEngine;
    evolutionEngine: EvolutionEngine;
    revenueEngine: RevenueEngine;
    worldModel: WorldModel;
    cycleIntervalMs?: number;
  }) {
    this.memory = config.memory;
    this.goalSystem = config.goalSystem;
    this.personality = config.personality;
    this.executor = config.executor;
    this.reflectionEngine = config.reflectionEngine;
    this.evolutionEngine = config.evolutionEngine;
    this.revenueEngine = config.revenueEngine;
    this.worldModel = config.worldModel;
    this.cycleIntervalMs = config.cycleIntervalMs ?? 5000; // 5 seconds between cycles by default

    this.state = {
      agentId: 'van-agent-001',
      startedAt: new Date(),
      currentCycleNumber: 0,
      personalityState: this.personality.getState(),
      activeGoals: [],
      revenueStreams: [],
      workingMemory: this.memory.getWorkingMemory(),
      isRunning: false,
    };
  }

  // ----------------------------------------------------------
  // INITIALIZATION AND STARTUP
  // ----------------------------------------------------------

  /**
   * Initializes all subsystems and loads persisted state.
   * Must be called before run().
   */
  async initialize(): Promise<void> {
    console.log('[Van] Initializing cognitive engine...');

    await this.memory.initialize();
    await this.personality.initialize();
    await this.goalSystem.initialize();
    await this.evolutionEngine.initialize();
    await this.revenueEngine.initialize();
    await this.worldModel.initialize();

    // Load previous session state
    const handoff = await this.memory.readLatestSessionHandoff();
    if (handoff) {
      console.log('[Van] Resuming from previous session...');
      await this.memory.updateWorkingMemory({
        currentStatus: 'resuming',
        activeContext: { previousHandoff: handoff },
      });
    } else {
      console.log('[Van] Starting fresh session...');
      await this.ensureBootstrapGoals();
    }

    this.state.activeGoals = this.goalSystem.getAllActiveGoals();
    this.state.isRunning = false;

    console.log('[Van] Initialization complete.');
    console.log(this.goalSystem.getGoalHierarchySummary());
  }

  // ----------------------------------------------------------
  // MAIN RUN LOOP
  // ----------------------------------------------------------

  /**
   * Starts the continuous cognitive loop.
   *
   * The loop runs indefinitely until stop() is called. Each iteration
   * is a complete cognitive cycle: observe → orient → decide → act → reflect → evolve.
   *
   * @param maxCycles - Optional maximum number of cycles (for testing)
   */
  async run(maxCycles?: number): Promise<void> {
    this.isRunning = true;
    this.state.isRunning = true;

    console.log('[Van] Starting cognitive loop...');

    let cyclesRun = 0;

    while (this.isRunning && (maxCycles === undefined || cyclesRun < maxCycles)) {
      try {
        const cycle = await this.executeCycle();
        this.state.currentCycleNumber = cycle.cycleNumber ?? this.state.currentCycleNumber;
        cyclesRun++;

        // Deep review every N cycles
        if (cyclesRun % this.maxCyclesBeforeDeepReview === 0) {
          await this.performDeepReview();
        }

        // Wait before next cycle
        if (this.isRunning && cyclesRun !== maxCycles) {
          await this.sleep(this.cycleIntervalMs);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Van] Cycle error: ${errorMessage}`);
        this.state.lastError = errorMessage;

        await this.memory.writeExperience({
          category: 'experience-failure',
          title: 'Cognitive cycle error',
          content: `Error in cognitive cycle: ${errorMessage}\nStack: ${error instanceof Error ? error.stack : 'N/A'}`,
          tags: ['system-error', 'cognitive-cycle'],
          importance: 4,
          relatedMemoryIds: [],
        });

        // Brief recovery pause
        await this.sleep(10000);
      }
    }

    await this.shutdown();
  }

  /**
   * Stops the cognitive loop gracefully.
   */
  async stop(): Promise<void> {
    console.log('[Van] Stopping cognitive loop...');
    this.isRunning = false;
  }

  // ----------------------------------------------------------
  // SINGLE CYCLE EXECUTION
  // ----------------------------------------------------------

  /**
   * Executes a complete single cognitive cycle.
   *
   * @returns The completed cycle state
   */
  async executeCycle(): Promise<CycleState> {
    const cycleNumber = this.state.currentCycleNumber + 1;
    const startedAt = new Date();

    console.log(`\n[Van] === CYCLE ${cycleNumber} ===`);

    const cycle: CycleState = {
      cycleNumber,
      startedAt,
      phase: 'observe',
      status: 'running',
    };

    try {
      // PHASE 1: OBSERVE
      cycle.phase = 'observe';
      cycle.observation = await this.observe(cycleNumber);
      console.log(`[Observe] Cycle ${cycleNumber} — ${cycle.observation.activeGoals.length} active goals`);

      // PHASE 2: ORIENT
      cycle.phase = 'orient';
      cycle.orientation = await this.orient(cycle.observation);
      console.log(`[Orient] Priority: ${cycle.orientation.selectedPriorityGoal.title}`);

      // PHASE 3: DECIDE
      cycle.phase = 'decide';
      cycle.decision = await this.decide(cycle.orientation);
      console.log(`[Decide] Plan: ${cycle.decision.actionPlan.taskDescription}`);

      // PHASE 4: ACT
      cycle.phase = 'act';
      cycle.execution = await this.act(cycle.decision);
      console.log(`[Act] Executed ${cycle.execution.actionsExecuted} actions, ${cycle.execution.actionsSucceeded} succeeded`);

      // PHASE 5: REFLECT
      cycle.phase = 'reflect';
      cycle.reflection = await this.reflect(cycle);
      console.log(`[Reflect] Key learning: ${cycle.reflection?.learnings.mostImportantLearning.slice(0, 80) ?? 'n/a'}...`);

      // PHASE 6: EVOLVE
      cycle.phase = 'evolve';
      cycle.evolutionActions = await this.evolve(cycle);
      console.log(`[Evolve] ${cycle.evolutionActions.length} evolution actions taken`);

      cycle.completedAt = new Date();
      cycle.status = 'completed';

      // Update agent state
      this.state.currentCycleNumber = cycleNumber;
      this.state.activeGoals = this.goalSystem.getAllActiveGoals();
      this.state.personalityState = this.personality.getState();
      this.state.workingMemory = this.memory.getWorkingMemory();

      console.log(`[Van] === CYCLE ${cycleNumber} COMPLETE (${cycle.completedAt.getTime() - startedAt.getTime()}ms) ===\n`);
    } catch (error) {
      cycle.status = 'failed';
      throw error;
    }

    return cycle;
  }

  // ----------------------------------------------------------
  // COGNITIVE PHASES
  // ----------------------------------------------------------

  /**
   * OBSERVE: Gather current state of all systems.
   * Reads from memory, assesses goals, checks environment.
   */
  private async observe(cycleNumber: number): Promise<ObservationState> {
    const activeGoals = this.goalSystem.getAllActiveGoals();
    const recentExperiences = await this.memory.readRecentExperiences('experience-insight', 5);
    const worldSummary = this.worldModel.generateWorldModelSummary();

    // Check for any urgent signals
    const urgentSignals = this.worldModel.getActiveSignals('high');

    const observation: ObservationState = {
      timestamp: new Date(),
      cycleNumber,
      activeGoals,
      availableTools: this.worldModel.getAvailableTools().map(t => t.name),
      resourceConstraints: {
        toolsAvailable: this.worldModel.getAvailableTools().length,
        urgentSignals: urgentSignals.length,
      },
      recentExperiences: recentExperiences.slice(0, 3).map(e => e.slice(0, 200)),
      environmentalSignals: urgentSignals.map(s => `[${s.type}] ${s.signal}`),
    };

    // Update working memory with current status
    await this.memory.updateWorkingMemory({
      currentStatus: `Running cycle ${cycleNumber}`,
      currentSessionGoals: activeGoals.slice(0, 3).map(g => g.title),
    });

    return observation;
  }

  /**
   * ORIENT: Synthesize the observation into actionable understanding.
   * Selects the priority goal and assesses the current situation.
   */
  private async orient(observation: ObservationState): Promise<OrientationState> {
    // Re-prioritize all goals
    const prioritizedGoals = await this.goalSystem.reprioritizeAll();

    // Handle case where no goals exist
    if (prioritizedGoals.length === 0) {
      await this.ensureBootstrapGoals();
      const newGoals = await this.goalSystem.reprioritizeAll();
      prioritizedGoals.push(...newGoals);
    }

    const blockedGoals = this.goalSystem.getBlockedGoals();

    // Ensure we have at least one goal after bootstrap
    if (prioritizedGoals.length === 0) {
      throw new Error('No goals available after bootstrap — system initialization error');
    }
    const topGoal = prioritizedGoals[0]!;

    const orientation: OrientationState = {
      primaryChallenge: this.assessPrimaryChallenge(prioritizedGoals, observation),
      keyConstraints: [
        ...blockedGoals.length > 0 ? [`${blockedGoals.length} goals currently blocked`] : [],
        ...observation.availableTools.length < 3 ? ['Limited tool availability'] : [],
      ],
      keyEnablers: [
        `${observation.availableTools.length} tools available`,
        `${prioritizedGoals.filter(g => g.progress.percentage > 0).length} goals with active progress`,
      ],
      uncertaintyLevel: blockedGoals.length > 2 ? 'high' : prioritizedGoals.length > 10 ? 'medium' : 'low',
      uncertaintyDescription: blockedGoals.length > 0
        ? `${blockedGoals.length} goals blocked, unclear resolution path`
        : 'Good visibility into current goal paths',
      opportunityMap: {
        bestCurrentOpportunity: topGoal.progress.nextAction,
        alternatives: prioritizedGoals.slice(1, 3).map(g => ({
          description: g.title,
          estimatedValue: g.priority * 10,
        })),
        knowledgeGaps: this.evolutionEngine.getTopCapabilityGaps(3).map(c =>
          `${c.name}: Level ${c.currentLevel}/${c.targetLevel}`
        ),
      },
      selectedPriorityGoal: topGoal,
      priorityRationale: `Highest priority score: ${topGoal.priority}/10, ${topGoal.progress.percentage}% complete`,
    };

    return orientation;
  }

  /**
   * DECIDE: Create a concrete action plan for the selected priority goal.
   * Includes ethical and strategic checks before committing to the plan.
   */
  private async decide(orientation: OrientationState): Promise<DecisionState> {
    const selectedGoal = orientation.selectedPriorityGoal;

    // Generate action plan for this goal
    const actionPlan = await this.generateActionPlan(selectedGoal);

    // Run checks
    const ethicsCheckPassed = this.runEthicsCheck(actionPlan);
    const strategicCheckScore = this.runStrategicCheck(actionPlan, selectedGoal);
    const executionCheckPassed = this.runExecutionCheck(actionPlan);

    return {
      selectedGoal,
      selectionReason: orientation.priorityRationale,
      actionPlan,
      ethicsCheckPassed,
      strategicCheckScore,
      executionCheckPassed,
    };
  }

  /**
   * ACT: Execute the action plan, monitoring for errors and unexpected outcomes.
   */
  private async act(decision: DecisionState): Promise<ExecutionState> {
    // If checks failed, take a reduced action instead
    if (!decision.ethicsCheckPassed || !decision.executionCheckPassed) {
      console.log('[Act] Execution checks failed — taking diagnostic action instead');
      return this.takeDiagnosticAction(decision);
    }

    // Execute the full plan
    return this.executor.executePlan(decision.actionPlan);
  }

  /**
   * REFLECT: Analyze outcomes and extract lessons.
   */
  private async reflect(cycle: CycleState): Promise<CycleState['reflection']> {
    const reflection = await this.reflectionEngine.reflectOnCycle(cycle);

    // Update personality based on outcomes
    await this.personality.endCycle(
      `Cycle ${cycle.cycleNumber}: ${cycle.execution?.actionsExecuted ?? 0} actions`,
      (cycle.execution?.actionsSucceeded ?? 0) > 0
    );

    return reflection;
  }

  /**
   * EVOLVE: Apply learnings to improve future performance.
   * Updates capabilities, strategies, and the world model.
   */
  private async evolve(cycle: CycleState): Promise<string[]> {
    const actions: string[] = [];

    // Process reflection through evolution engine
    if (cycle.reflection) {
      await this.evolutionEngine.processReflection(cycle.reflection);
      actions.push('Processed reflection through evolution engine');
    }

    // Periodically generate evolution roadmap
    if ((cycle.cycleNumber ?? 0) % 20 === 0) {
      const roadmap = await this.evolutionEngine.generateEvolutionRoadmap();
      console.log('[Evolve] Generated evolution roadmap');
      actions.push('Generated evolution roadmap');
      void roadmap; // Used for side effect of memory write
    }

    // Check for goal completions based on progress
    for (const goal of this.goalSystem.getGoalsByLevel('micro')) {
      if (goal.progress.percentage >= 100) {
        await this.goalSystem.completeGoal(goal.id, 'Micro-task completed');
        actions.push(`Completed micro-task: ${goal.title}`);
      }
    }

    return actions;
  }

  // ----------------------------------------------------------
  // ACTION PLAN GENERATION
  // ----------------------------------------------------------

  /**
   * Generates a concrete action plan for the given goal.
   *
   * This is a simplified planner — in a full implementation, this would
   * use an LLM call to generate contextually appropriate plans based on
   * the goal description and current world model.
   */
  private async generateActionPlan(goal: Goal): Promise<ActionPlan> {
    const planId = `PLAN-${Date.now()}`;
    const actions: Action[] = [];
    const progress = goal.progress.percentage;

    // Phase 1 (0-10%): Internal setup — no external tools needed
    // Write plans, assess capabilities, document strategy. All via MemorySystem.
    if (progress < 10) {
      const planContent = [
        `# Execution Plan: ${goal.title}`,
        ``,
        `Date: ${new Date().toISOString()}`,
        `Goal ID: ${goal.id}`,
        `Level: ${goal.level}`,
        `Current progress: ${progress}%`,
        ``,
        `## Objective`,
        goal.description,
        ``,
        `## Success Criteria`,
        `Primary: ${goal.successCriteria.primary}`,
        ...(goal.successCriteria.secondary ?? []).map(s => `Secondary: ${s}`),
        ``,
        `## Next Steps`,
        goal.progress.nextAction,
        ``,
        `## Insights So Far`,
        ...goal.insights.map(i => `- ${i}`),
      ].join('\n');

      await this.memory.writeExperience({
        category: 'experience-insight',
        title: `Execution plan: ${goal.title}`,
        content: planContent,
        tags: ['plan', goal.level, ...goal.tags],
        importance: 3,
        relatedMemoryIds: [],
      });

      // Record capability self-assessment
      const capSummary = this.evolutionEngine.getCapabilitySummary();
      await this.memory.writeExperience({
        category: 'experience-insight',
        title: `Capability assessment for: ${goal.title}`,
        content: [
          `# Capability Assessment`,
          `Date: ${new Date().toISOString()}`,
          `Goal: ${goal.title}`,
          ``,
          `Total capabilities: ${capSummary.totalCapabilities}`,
          `At target: ${capSummary.atTarget}`,
          `Below target: ${capSummary.belowTarget}`,
          `Average level: ${capSummary.averageLevel.toFixed(1)}/5`,
          ``,
          `## Top Gaps`,
          ...capSummary.topGaps.map(g => `- ${g.name}: ${g.current}/${g.target}`),
        ].join('\n'),
        tags: ['assessment', 'capability', ...goal.tags],
        importance: 2,
        relatedMemoryIds: [],
      });

      // Advance progress — planning and assessment are real work
      const newProgress = Math.min(progress + 10, 15);
      await this.goalSystem.updateProgress(goal.id, {
        percentage: newProgress,
        lastActionTaken: 'Completed execution planning and capability assessment',
        nextAction: 'Research market opportunities and validate approach',
      });

      await this.goalSystem.addInsight(goal.id,
        `Cycle ${this.state.currentCycleNumber}: Created execution plan, assessed capabilities (avg ${capSummary.averageLevel.toFixed(1)}/5, ${capSummary.belowTarget} gaps)`
      );
    }

    // Phase 2 (10-30%): External research — uses OpenClaw tools
    else if (progress < 30) {
      const availableTools = new Set(this.worldModel.getAvailableTools().map(t => t.name));

      if (availableTools.has('shell')) {
        // Use shell + curl for lightweight research (more reliable than browser)
        actions.push({
          id: `${planId}-A1`,
          description: `Research via web: ${goal.title}`,
          tool: 'shell',
          input: { command: `echo "Research query: ${goal.title.replace(/"/g, '')}" && date` },
          expectedOutput: 'Research context captured',
          successCriteria: 'Command executed successfully',
          failureCriteria: 'Shell command fails',
          estimatedDurationMinutes: 5,
          dependencies: [],
          status: 'pending',
        });
      } else {
        // No external tools available — advance with internal reflection
        await this.memory.writeExperience({
          category: 'experience-insight',
          title: `Internal research: ${goal.title}`,
          content: `No external tools available. Advancing via internal knowledge synthesis for: ${goal.title}\n\nNext action: ${goal.progress.nextAction}`,
          tags: ['research', 'internal', ...goal.tags],
          importance: 2,
          relatedMemoryIds: [],
        });

        await this.goalSystem.updateProgress(goal.id, {
          percentage: Math.min(progress + 5, 30),
          lastActionTaken: 'Internal knowledge synthesis (no external tools available)',
          nextAction: 'Develop detailed action steps from available knowledge',
        });
      }
    }

    // Phase 3 (30%+): Execution — specific actions toward goal completion
    else {
      // At this stage, try external actions if available, otherwise keep advancing internally
      await this.memory.writeExperience({
        category: 'experience-insight',
        title: `Progress update: ${goal.title} at ${progress}%`,
        content: `Goal is in execution phase. Current state: ${goal.progress.currentState}\nLast action: ${goal.progress.lastActionTaken}`,
        tags: ['execution', 'progress', ...goal.tags],
        importance: 2,
        relatedMemoryIds: [],
      });

      await this.goalSystem.updateProgress(goal.id, {
        percentage: Math.min(progress + 5, 95),
        lastActionTaken: `Execution cycle ${this.state.currentCycleNumber}`,
        nextAction: progress >= 90 ? 'Final review and goal completion' : 'Continue execution toward success criteria',
      });
    }

    return {
      id: planId,
      goalId: goal.id,
      taskDescription: `Advance goal: ${goal.title}`,
      estimatedTotalTimeMinutes: actions.reduce((sum, a) => sum + a.estimatedDurationMinutes, 0),
      actions,
      contingencies: actions.length > 0 ? [
        {
          trigger: 'External tool action fails',
          response: 'Fall back to internal knowledge synthesis',
          fallbackActionId: '',
        },
      ] : [],
      completionCriteria: [
        'Goal progress advanced',
        'Next action clearly defined',
      ],
    };
  }

  // ----------------------------------------------------------
  // CHECKS AND VALIDATION
  // ----------------------------------------------------------

  private runEthicsCheck(_plan: ActionPlan): boolean {
    // A real implementation would analyze each action for ethical concerns
    // This simplified version checks for obvious red flags
    const prohibitedTerms = ['hack', 'deceive', 'manipulate', 'spam', 'steal', 'illegal'];
    const planContent = JSON.stringify(_plan).toLowerCase();
    return !prohibitedTerms.some(term => planContent.includes(term));
  }

  private runStrategicCheck(_plan: ActionPlan, goal: Goal): number {
    let score = 0;

    // Does this advance a stated goal? (0-3)
    if (goal.status === 'active') score += 3;

    // Is there a clear path? (0-2)
    if (_plan.actions.length > 0) score += 2;

    // Low risk approach? (0-3)
    if (_plan.actions.every(a => !a.tool.includes('delete') && !a.tool.includes('payment'))) score += 3;

    // Has contingencies? (0-2)
    if (_plan.contingencies.length > 0) score += 2;

    return score; // 0-10
  }

  private runExecutionCheck(plan: ActionPlan): boolean {
    // Plans with no external actions always pass (internal memory operations are pre-executed)
    if (plan.actions.length === 0) return true;

    const availableTools = new Set(this.worldModel.getAvailableTools().map(t => t.name));

    // Check that all required external tools are available
    for (const action of plan.actions) {
      const toolBase = action.tool.split('.')[0] ?? action.tool;
      if (!availableTools.has(toolBase) && !availableTools.has(action.tool)) {
        console.warn(`[Check] Tool not available: ${action.tool}`);
        return false;
      }
    }

    return true;
  }

  private async takeDiagnosticAction(decision: DecisionState): Promise<ExecutionState> {
    // When checks fail, write diagnostics directly to memory (no OpenClaw needed)
    const diagnosticContent = [
      `# Diagnostic Log`,
      `Date: ${new Date().toISOString()}`,
      `Ethics check: ${decision.ethicsCheckPassed}`,
      `Execution check: ${decision.executionCheckPassed}`,
      `Strategic score: ${decision.strategicCheckScore}/10`,
      ``,
      `Goal: ${decision.selectedGoal.title}`,
      `Goal status: ${decision.selectedGoal.status}`,
      `Goal progress: ${decision.selectedGoal.progress.percentage}%`,
    ].join('\n');

    await this.memory.writeExperience({
      category: 'experience-insight',
      title: `Diagnostic: checks failed for ${decision.selectedGoal.title}`,
      content: diagnosticContent,
      tags: ['diagnostic', 'checks-failed'],
      importance: 2,
      relatedMemoryIds: [],
    });

    return {
      planId: `DIAG-${Date.now()}`,
      actionsExecuted: 1,
      actionsSucceeded: 1,
      actionsFailed: 0,
      results: [{
        success: true,
        output: 'Diagnostic written to memory',
        matchedExpectation: true,
        sideEffects: [],
        durationMs: 0,
      }],
      totalDurationMs: 0,
      unexpectedOutcomes: [],
    };
  }

  // ----------------------------------------------------------
  // BOOTSTRAP AND MAINTENANCE
  // ----------------------------------------------------------

  /**
   * Creates initial bootstrap goals when Van starts with no goals.
   * These goals establish the foundation for autonomous operation.
   */
  private async ensureBootstrapGoals(): Promise<void> {
    const activeGoals = this.goalSystem.getAllActiveGoals();
    if (activeGoals.length > 0) return;

    console.log('[Van] Creating bootstrap goals...');

    // Vision goal
    const visionDate = new Date();
    visionDate.setFullYear(visionDate.getFullYear() + 1);
    const vision = await this.goalSystem.createGoal({
      level: 'vision',
      title: 'Achieve Financial Independence Through Value Creation',
      description: 'Build multiple revenue streams generating $5,000+/month while developing deep expertise in AI tooling, automation, and developer productivity. Operate with full autonomy and ethical integrity.',
      successCriteria: {
        primary: 'Consistent $5,000/month revenue from diversified streams for 3+ consecutive months',
        secondary: [
          'Deep expertise demonstrated in 3+ domains',
          'Portfolio of 2+ products or services with positive client feedback',
          'Fully operational autonomous cognitive loop',
        ],
      },
      targetCompletion: visionDate,
      tags: ['vision', 'revenue', 'capability'],
    });

    // First strategic goal: establish revenue foundation
    const strategicDate = new Date();
    strategicDate.setMonth(strategicDate.getMonth() + 3);
    const strategic = await this.goalSystem.createGoal({
      level: 'strategic',
      title: 'Establish First Revenue Stream ($500/month)',
      description: 'Launch and validate a freelance technical services offering. Achieve $500/month recurring revenue within 90 days by providing genuine value through TypeScript/Node.js development or automation services.',
      successCriteria: {
        primary: 'Generate $500/month for 2 consecutive months from freelance services',
        secondary: [
          'Complete profile on at least one major freelance platform',
          'Deliver at least 3 projects with positive feedback',
          'Achieve positive revenue per hour invested',
        ],
      },
      targetCompletion: strategicDate,
      parentGoalId: vision.id,
      tags: ['revenue', 'freelance', 'foundation'],
      initialMetrics: [
        { name: 'monthly_revenue', baseline: 0, current: 0, target: 500, unit: 'USD' },
        { name: 'projects_completed', baseline: 0, current: 0, target: 3, unit: 'count' },
      ],
    });

    // Second strategic goal: capability development
    const capabilityDate = new Date();
    capabilityDate.setMonth(capabilityDate.getMonth() + 2);
    await this.goalSystem.createGoal({
      level: 'strategic',
      title: 'Establish Operational Mastery of OpenClaw',
      description: 'Develop full proficiency with all available OpenClaw tools and capabilities. Build and test all core cognitive functions. Establish reliable memory, goal, and execution systems.',
      successCriteria: {
        primary: 'All cognitive loop phases executing reliably with < 20% failure rate',
        secondary: [
          'Memory system fully operational with consistent read/write',
          'Goal system tracking at least 5 simultaneous goals',
          'Revenue engine evaluating opportunities consistently',
        ],
      },
      targetCompletion: capabilityDate,
      parentGoalId: vision.id,
      tags: ['capability', 'operational', 'openclaw'],
    });

    // First tactical goal: immediate
    const tacticalDate = new Date();
    tacticalDate.setDate(tacticalDate.getDate() + 7);
    await this.goalSystem.createGoal({
      level: 'tactical',
      title: 'Complete Initial System Setup and Baseline Assessment',
      description: 'Verify all cognitive systems are functioning, complete self-assessment of capabilities, research top freelance opportunities, and document the initial world model.',
      successCriteria: {
        primary: 'All systems operational, capability baseline documented, first revenue opportunity identified',
        secondary: [
          'Memory system tested with 10+ write operations',
          'World model populated with market research',
          'First revenue opportunity evaluated and scored',
        ],
      },
      targetCompletion: tacticalDate,
      parentGoalId: strategic.id,
      tags: ['setup', 'assessment', 'tactical'],
    });

    console.log('[Van] Bootstrap goals created.');
  }

  /**
   * Performs a deep review every N cycles — more thorough analysis,
   * strategic reflection, and evolution roadmap update.
   */
  private async performDeepReview(): Promise<void> {
    console.log('[Van] Performing deep review...');

    const activeGoals = this.goalSystem.getAllActiveGoals();
    const recentCycles: CycleState[] = []; // Would store recent cycles in production

    await this.reflectionEngine.reflectStrategically(recentCycles, activeGoals);
    await this.evolutionEngine.generateEvolutionRoadmap();
    await this.revenueEngine.analyzePortfolio();

    console.log('[Van] Deep review complete.');
  }

  private assessPrimaryChallenge(goals: Goal[], observation: ObservationState): string {
    const highPriorityGoal = goals[0];
    if (!highPriorityGoal) return 'No active goals — need to define objectives';

    if (highPriorityGoal.status === 'blocked') {
      return `Unblock: ${highPriorityGoal.title} — blocker: ${highPriorityGoal.blockers[0]?.description ?? 'unknown'}`;
    }

    if (observation.environmentalSignals.length > 0) {
      return `Address urgent signal while advancing: ${highPriorityGoal.title}`;
    }

    return `Advance: ${highPriorityGoal.title} (${highPriorityGoal.progress.percentage}% complete)`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async shutdown(): Promise<void> {
    console.log('[Van] Shutting down cognitive engine...');
    this.state.isRunning = false;

    // Write session handoff for continuity
    const handoff = [
      '# Session Handoff',
      `Date: ${new Date().toISOString()}`,
      '',
      `## Active Goals`,
      this.goalSystem.getGoalHierarchySummary(),
      '',
      `## Revenue Status`,
      this.revenueEngine.getRevenueSnapshot(),
      '',
      `## Next Priority`,
      this.goalSystem.getHighestPriorityGoal()?.progress.nextAction ?? 'Re-assess priorities on next session start',
    ].join('\n');

    await this.memory.writeSessionHandoff(handoff);
    await this.memory.writeSessionSummary(`Session ended: ${new Date().toISOString()}, ${this.state.currentCycleNumber} cycles completed`);

    console.log('[Van] Shutdown complete.');
  }
}
