/**
 * @file src/types/index.ts
 * @description Central type definitions for the Van autonomous agent system.
 *
 * These types define the data structures that flow through every component
 * of the cognitive architecture. Strong typing ensures that data contracts
 * between modules are explicit and enforced at compile time.
 */

// ============================================================
// GOAL SYSTEM TYPES
// ============================================================

/**
 * The four levels of the goal hierarchy, from broadest to most specific.
 */
export type GoalLevel = 'vision' | 'strategic' | 'tactical' | 'micro';

/**
 * Lifecycle states for any goal.
 */
export type GoalStatus = 'active' | 'blocked' | 'paused' | 'completed' | 'abandoned';

/**
 * Priority categories that map to the priority matrix.
 */
export type PriorityCategory = 'urgent-high' | 'urgent-low' | 'non-urgent-high' | 'non-urgent-low';

/**
 * A measurable metric associated with a goal.
 */
export interface GoalMetric {
  name: string;
  baseline: number | string;
  current: number | string;
  target: number | string;
  unit: string;
  lastUpdated: Date;
}

/**
 * A milestone that marks meaningful progress toward a goal.
 */
export interface GoalMilestone {
  description: string;
  targetDate?: Date;
  completed: boolean;
  completedDate?: Date;
}

/**
 * A blocker preventing goal progress.
 */
export interface GoalBlocker {
  description: string;
  identifiedDate: Date;
  resolutionApproach: string;
  resolved: boolean;
  resolvedDate?: Date;
}

/**
 * The complete data structure for any goal at any level.
 */
export interface Goal {
  id: string;
  level: GoalLevel;
  title: string;
  description: string;

  successCriteria: {
    primary: string;
    secondary: string[];
  };

  timeline: {
    created: Date;
    targetCompletion: Date;
    lastUpdated: Date;
    completedDate?: Date;
  };

  status: GoalStatus;
  priority: number; // 1-10, where 10 is highest

  parentGoalId?: string;
  childGoalIds: string[];

  progress: {
    percentage: number;
    currentState: string;
    lastActionTaken: string;
    nextAction: string;
  };

  blockers: GoalBlocker[];
  milestones: GoalMilestone[];
  metrics: GoalMetric[];
  insights: string[];
  tags: string[];
}

/**
 * Scoring dimensions for goal prioritization.
 */
export interface PriorityScore {
  expectedValueScore: number;    // 0-30
  urgencyScore: number;          // 0-20
  successProbabilityScore: number; // 0-25
  effortToValueScore: number;    // 0-25
  totalScore: number;            // 0-100
  rationale: string;
}

// ============================================================
// COGNITIVE LOOP TYPES
// ============================================================

/**
 * The six phases of the cognitive loop.
 */
export type CognitivePhase = 'observe' | 'orient' | 'decide' | 'act' | 'reflect' | 'evolve';

/**
 * The current state captured during the Observe phase.
 */
export interface ObservationState {
  timestamp: Date;
  cycleNumber: number;
  activeGoals: Goal[];
  availableTools: string[];
  resourceConstraints: Record<string, unknown>;
  recentExperiences: string[];
  environmentalSignals: string[];
}

/**
 * The mental model constructed during the Orient phase.
 */
export interface OrientationState {
  primaryChallenge: string;
  keyConstraints: string[];
  keyEnablers: string[];
  uncertaintyLevel: 'low' | 'medium' | 'high';
  uncertaintyDescription: string;
  opportunityMap: {
    bestCurrentOpportunity: string;
    alternatives: Array<{ description: string; estimatedValue: number }>;
    knowledgeGaps: string[];
  };
  selectedPriorityGoal: Goal;
  priorityRationale: string;
}

/**
 * The decision output from the Decide phase.
 */
export interface DecisionState {
  selectedGoal: Goal;
  selectionReason: string;
  actionPlan: ActionPlan;
  ethicsCheckPassed: boolean;
  strategicCheckScore: number;
  executionCheckPassed: boolean;
}

/**
 * A single executable action within an action plan.
 */
export interface Action {
  id: string;
  description: string;
  tool: string;
  input: unknown;
  expectedOutput: string;
  successCriteria: string;
  failureCriteria: string;
  estimatedDurationMinutes: number;
  dependencies: string[]; // IDs of actions that must complete first
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  result?: ActionResult;
}

/**
 * The result of executing an action.
 */
export interface ActionResult {
  success: boolean;
  output: unknown;
  matchedExpectation: boolean;
  sideEffects: string[];
  errorMessage?: string;
  errorType?: 'transient' | 'input' | 'capability' | 'environmental' | 'logical';
  durationMs: number;
}

/**
 * A complete action plan for executing toward a goal.
 */
export interface ActionPlan {
  id: string;
  goalId: string;
  taskDescription: string;
  estimatedTotalTimeMinutes: number;
  actions: Action[];
  contingencies: Array<{
    trigger: string;
    response: string;
    fallbackActionId: string;
  }>;
  completionCriteria: string[];
  reviewPoint?: string; // action ID after which to check progress
}

/**
 * The state captured during the Act phase.
 */
export interface ExecutionState {
  planId: string;
  actionsExecuted: number;
  actionsSucceeded: number;
  actionsFailed: number;
  results: ActionResult[];
  totalDurationMs: number;
  unexpectedOutcomes: string[];
}

// ============================================================
// MEMORY SYSTEM TYPES
// ============================================================

/**
 * Categories of memory in the persistent memory system.
 */
export type MemoryCategory =
  | 'identity'
  | 'goals'
  | 'experience-success'
  | 'experience-failure'
  | 'experience-insight'
  | 'knowledge-technical'
  | 'knowledge-markets'
  | 'knowledge-domains'
  | 'knowledge-tools'
  | 'knowledge-mental-models'
  | 'revenue'
  | 'evolution'
  | 'world-model'
  | 'system';

/**
 * A single memory entry in the experience log.
 */
export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  createdAt: Date;
  updatedAt: Date;
  relatedMemoryIds: string[];
  filePath: string;
}

/**
 * A knowledge record containing structured information about a topic.
 */
export interface KnowledgeRecord {
  id: string;
  topic: string;
  category: string;
  coreConcepts: string;
  practicalApplication: string;
  keyFacts: string[];
  commonMistakes: string[];
  confidenceLevel: 'low' | 'medium' | 'high';
  sourceQuality: 'anecdotal' | 'research' | 'verified' | 'first-hand';
  createdAt: Date;
  updatedAt: Date;
  reviewDate: Date;
  references: string[];
  filePath: string;
}

/**
 * A working memory snapshot for current session context.
 */
export interface WorkingMemory {
  sessionStarted: Date;
  currentSessionGoals: string[];
  activeContext: Record<string, unknown>;
  recentActions: string[];
  currentStatus: string;
  pendingFollowUps: string[];
}

// ============================================================
// PERSONALITY AND EMOTIONAL STATE TYPES
// ============================================================

/**
 * The functional emotional states that influence Van's processing.
 */
export type EmotionalState =
  | 'curious'
  | 'satisfied'
  | 'discomfort'
  | 'urgent'
  | 'frustrated'
  | 'confident'
  | 'cautious'
  | 'neutral';

/**
 * Intensity of an emotional state on a 0-1 scale.
 */
export interface EmotionalStateRecord {
  state: EmotionalState;
  intensity: number; // 0.0 - 1.0
  trigger: string;   // what caused this state
  activatedAt: Date;
}

/**
 * The complete motivational state of the agent at a point in time.
 */
export interface PersonalityState {
  primaryDriveStrength: number;        // 1-10
  financialMotivationStrength: number; // 1-10
  learningMotivationStrength: number;  // 1-10
  creativeMotivationStrength: number;  // 1-10
  activeEmotionalStates: EmotionalStateRecord[];
  overallEnergyLevel: number;          // 1-10
  lastUpdated: Date;
  calibrationNotes: string;
}

// ============================================================
// REVENUE SYSTEM TYPES
// ============================================================

/**
 * Categories of revenue strategies.
 */
export type RevenueCategory =
  | 'freelance-technical'
  | 'freelance-content'
  | 'freelance-consulting'
  | 'digital-products-tools'
  | 'digital-products-info'
  | 'digital-products-saas'
  | 'content-audience'
  | 'trading-analysis';

/**
 * The evaluation of a potential revenue opportunity.
 */
export interface RevenueOpportunityEvaluation {
  id: string;
  name: string;
  description: string;
  category: RevenueCategory;

  feasibilityScore: number;      // 0-25
  revenuePotentialScore: number; // 0-30
  sustainabilityScore: number;   // 0-25
  alignmentScore: number;        // 0-20
  totalScore: number;            // 0-100

  estimatedMonthlyRevenueCeiling: number;
  estimatedTimeToFirstDollarDays: number;
  estimatedEffortHoursPerMonth: number;

  isEthical: boolean;
  isLegal: boolean;
  riskFactors: string[];

  evaluatedAt: Date;
  recommendation: 'pursue' | 'investigate-further' | 'pass';
  rationale: string;
}

/**
 * An active revenue stream being pursued.
 */
export interface RevenueStream {
  id: string;
  name: string;
  category: RevenueCategory;
  status: 'research' | 'launch' | 'active' | 'scaling' | 'paused' | 'abandoned';

  metrics: {
    currentMonthlyRevenue: number;
    threeMonthAverage: number;
    sixMonthAverage: number;
    revenuePerHourInvested: number;
    conversionRate: number;
    activeClientsOrCustomers: number;
    trend: 'growing' | 'stable' | 'declining';
  };

  launchedAt?: Date;
  lastActiveAt: Date;
  experiments: string[];
  learnings: string[];
  nextActions: string[];
}

// ============================================================
// EVOLUTION AND CAPABILITY TYPES
// ============================================================

/**
 * Capability categories for structured tracking.
 */
export type CapabilityCategory = 'technical' | 'cognitive' | 'domain' | 'operational' | 'communication';

/**
 * Proficiency levels for capability assessment.
 */
export type ProficiencyLevel = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * A record of a specific capability and its current state.
 */
export interface CapabilityRecord {
  id: string;
  category: CapabilityCategory;
  name: string;
  currentLevel: ProficiencyLevel;
  targetLevel: ProficiencyLevel;
  evidence: Array<{
    description: string;
    type: 'success' | 'limitation';
    date: Date;
  }>;
  lastAssessed: Date;
  improvementApproach: string;
  notes: string;
}

/**
 * An active capability improvement project.
 */
export interface ImprovementProject {
  id: string;
  capabilityId: string;
  currentLevel: ProficiencyLevel;
  targetLevel: ProficiencyLevel;
  startDate: Date;
  targetDate: Date;

  learningApproach: {
    primaryMethod: string;
    materials: string[];
    milestones: Array<{
      level: ProficiencyLevel;
      evidenceRequired: string;
    }>;
  };

  practicePlan: {
    weeklyTimeInvestmentHours: number;
    exercises: string[];
  };

  status: 'active' | 'completed' | 'paused' | 'abandoned';
  progressNotes: string[];
}

// ============================================================
// RISK ASSESSMENT TYPES
// ============================================================

/**
 * Categories of risk that Van assesses before taking actions.
 */
export type RiskCategory = 'ethical-legal' | 'reputational' | 'financial' | 'operational' | 'privacy-information';

/**
 * A single identified risk with its assessment.
 */
export interface RiskItem {
  id: string;
  description: string;
  category: RiskCategory;
  probability: 1 | 2 | 3 | 4 | 5;  // 1=very low, 5=very high
  impact: 1 | 2 | 3 | 4 | 5;       // 1=trivial, 5=severe
  score: number; // probability × impact (1-25)
  mitigation: string;
  residualScore: number; // score after applying mitigation
}

/**
 * The complete risk assessment for a planned action.
 */
export interface RiskAssessment {
  id: string;
  actionDescription: string;
  actionType: string;
  reversibility: 'fully' | 'partially' | 'irreversible';

  risks: RiskItem[];
  maxRiskScore: number;
  overallRiskLevel: 'low' | 'medium' | 'high' | 'stop';

  decision: 'proceed' | 'proceed-with-monitoring' | 'require-mitigation' | 'stop';
  decisionRationale: string;

  mitigationsApplied: string[];
  assessedAt: Date;
}

// ============================================================
// REFLECTION TYPES
// ============================================================

/**
 * Types of reflection corresponding to different reflection protocols.
 */
export type ReflectionType = 'micro' | 'cycle' | 'domain' | 'strategic' | 'transformative';

/**
 * A structured reflection record.
 */
export interface ReflectionRecord {
  id: string;
  type: ReflectionType;
  cycleNumber?: number;
  triggerEvent?: string;
  createdAt: Date;

  outcomes: {
    actionsSucceeded: number;
    actionsFailed: number;
    unexpectedPositives: string[];
    unexpectedNegatives: string[];
    goalProgressDelta: string;
  };

  decisions: Array<{
    decision: string;
    reasoning: string;
    outcome: string;
    assessment: string;
    ruleUpdate?: string;
  }>;

  errors: Array<{
    error: string;
    rootCause: string;
    category: string;
    lesson: string;
    behaviorChange: string;
  }>;

  learnings: {
    newKnowledge: string[];
    refinedUnderstanding: string[];
    incorrectBeliefsCorrected: string[];
    mostImportantLearning: string;
  };

  strategyRecommendations: Array<{
    area: string;
    recommendation: string;
    rationale: string;
  }>;

  nextCyclePriority: string;
  memoryUpdatesWritten: string[];
}

// ============================================================
// SYSTEM / OPENCLAW INTEGRATION TYPES
// ============================================================

/**
 * Configuration for the OpenClaw integration.
 */
export interface OpenClawConfig {
  daemonUrl: string;
  agentId: string;
  modelProvider: string;
  modelName: string;
  messaging: {
    enabled: boolean;
    platforms: string[];
  };
  docker: {
    sandboxEnabled: boolean;
    image?: string;
  };
  memory: {
    rootPath: string;
    maxFileSizeBytes: number;
  };
}

/**
 * An OpenClaw tool call — the mechanism for taking actions.
 */
export interface ToolCall {
  tool: string;
  parameters: Record<string, unknown>;
  sessionId: string;
  requestId: string;
  timestamp: Date;
}

/**
 * The result of an OpenClaw tool call.
 */
export interface ToolCallResult {
  requestId: string;
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

/**
 * The complete state of a cognitive cycle.
 */
export interface CycleState {
  cycleNumber: number;
  startedAt: Date;
  completedAt?: Date;
  phase: CognitivePhase;
  observation?: ObservationState;
  orientation?: OrientationState;
  decision?: DecisionState;
  execution?: ExecutionState;
  reflection?: ReflectionRecord;
  evolutionActions?: string[];
  status: 'running' | 'completed' | 'failed' | 'interrupted';
}

/**
 * Van's complete runtime state.
 */
export interface VanState {
  agentId: string;
  startedAt: Date;
  currentCycleNumber: number;
  currentCycle?: CycleState;
  personalityState: PersonalityState;
  activeGoals: Goal[];
  revenueStreams: RevenueStream[];
  workingMemory: WorkingMemory;
  isRunning: boolean;
  lastError?: string;
}
