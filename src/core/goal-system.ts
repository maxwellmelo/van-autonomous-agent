/**
 * @file src/core/goal-system.ts
 * @description Goal hierarchy management for the Van autonomous agent.
 *
 * This module manages Van's complete goal lifecycle: creation, prioritization,
 * tracking, updating, and closure. It implements the four-level hierarchy
 * (vision → strategic → tactical → micro) with full dependency tracking.
 *
 * Design principles:
 * - Goals are immutable once created except through explicit update methods
 * - Priority is computed, not manually assigned, to prevent cognitive biases
 * - Goal state changes are always logged for retrospective analysis
 * - Orphaned goals (parent closed before child) are handled gracefully
 */

import {
  Goal,
  GoalLevel,
  GoalStatus,
  GoalMetric,
  GoalBlocker,
  GoalMilestone,
  PriorityScore,
} from '../types/index.js';
import { MemorySystem } from './memory-system.js';

// ============================================================
// GOAL SYSTEM CLASS
// ============================================================

/**
 * GoalSystem manages Van's complete goal hierarchy in memory, syncing
 * to persistent storage via MemorySystem on every state change.
 *
 * @example
 * ```typescript
 * const goalSystem = new GoalSystem(memorySystem);
 * await goalSystem.initialize();
 *
 * const goal = await goalSystem.createGoal({
 *   level: 'tactical',
 *   title: 'Create Upwork profile',
 *   description: '...',
 *   successCriteria: { primary: 'Profile live with 5 portfolio items', secondary: [] },
 *   targetCompletion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
 *   tags: ['freelance', 'upwork'],
 * });
 * ```
 */
export class GoalSystem {
  private goals: Map<string, Goal> = new Map();
  private readonly memory: MemorySystem;

  constructor(memory: MemorySystem) {
    this.memory = memory;
  }

  // ----------------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------------

  /**
   * Loads existing goals from persistent memory into the in-memory goal store.
   */
  async initialize(): Promise<void> {
    const persistedGoals = await this.memory.readActiveGoals();
    for (const goal of persistedGoals) {
      this.goals.set(goal.id, goal);
    }
  }

  // ----------------------------------------------------------
  // GOAL CREATION
  // ----------------------------------------------------------

  /**
   * Creates a new goal and adds it to the active goal hierarchy.
   *
   * Validation is performed before creation:
   * - Title and description must be non-empty
   * - Target completion date must be in the future
   * - If a parent goal ID is provided, it must exist
   * - Success criteria must have at least a primary criterion
   *
   * @param params - Goal creation parameters
   * @returns The created goal
   * @throws Error if validation fails
   */
  async createGoal(params: {
    level: GoalLevel;
    title: string;
    description: string;
    successCriteria: { primary: string; secondary: string[] };
    targetCompletion: Date;
    parentGoalId?: string;
    tags: string[];
    initialMetrics?: Omit<GoalMetric, 'lastUpdated'>[];
    initialMilestones?: Omit<GoalMilestone, 'completed' | 'completedDate'>[];
  }): Promise<Goal> {
    // Validation
    this.validateGoalParams(params);

    // If parent provided, ensure it exists
    if (params.parentGoalId && !this.goals.has(params.parentGoalId)) {
      throw new Error(`Parent goal ${params.parentGoalId} does not exist`);
    }

    const now = new Date();
    const id = this.generateGoalId(params.title);

    const goal: Goal = {
      id,
      level: params.level,
      title: params.title,
      description: params.description,
      successCriteria: params.successCriteria,
      timeline: {
        created: now,
        targetCompletion: params.targetCompletion,
        lastUpdated: now,
      },
      status: 'active',
      priority: 5, // Default — will be computed by prioritization engine
      parentGoalId: params.parentGoalId,
      childGoalIds: [],
      progress: {
        percentage: 0,
        currentState: 'Not yet started',
        lastActionTaken: 'Goal created',
        nextAction: 'Begin planning execution approach',
      },
      blockers: [],
      milestones: (params.initialMilestones ?? []).map(m => ({
        ...m,
        completed: false,
      })),
      metrics: (params.initialMetrics ?? []).map(m => ({
        ...m,
        lastUpdated: now,
      })),
      insights: [],
      tags: params.tags,
    };

    // Register child relationship on parent
    if (params.parentGoalId) {
      const parent = this.goals.get(params.parentGoalId);
      if (parent) {
        parent.childGoalIds.push(id);
        parent.timeline.lastUpdated = now;
        this.goals.set(params.parentGoalId, parent);
      }
    }

    this.goals.set(id, goal);
    await this.persistGoals();

    await this.memory.writeExperience({
      category: 'experience-insight',
      title: `New goal created: ${params.title}`,
      content: `Created ${params.level} goal: "${params.title}"\n\nDescription: ${params.description}\n\nSuccess criteria: ${params.successCriteria.primary}`,
      tags: ['goal-creation', params.level, ...params.tags],
      importance: 2,
      relatedMemoryIds: [],
    });

    return goal;
  }

  // ----------------------------------------------------------
  // GOAL UPDATES
  // ----------------------------------------------------------

  /**
   * Updates the progress state of a goal.
   *
   * @param goalId - The goal to update
   * @param update - Progress fields to update
   */
  async updateProgress(
    goalId: string,
    update: {
      percentage?: number;
      currentState?: string;
      lastActionTaken?: string;
      nextAction?: string;
    }
  ): Promise<void> {
    const goal = this.requireGoal(goalId);
    const now = new Date();

    goal.progress = {
      percentage: update.percentage ?? goal.progress.percentage,
      currentState: update.currentState ?? goal.progress.currentState,
      lastActionTaken: update.lastActionTaken ?? goal.progress.lastActionTaken,
      nextAction: update.nextAction ?? goal.progress.nextAction,
    };
    goal.timeline.lastUpdated = now;

    // Check for milestone completions based on percentage
    for (const milestone of goal.milestones) {
      if (!milestone.completed && update.percentage !== undefined) {
        // Milestones are ordered — first incomplete one that should be complete
        // This is a heuristic; exact completion should be explicitly triggered
      }
    }

    this.goals.set(goalId, goal);
    await this.persistGoals();
  }

  /**
   * Updates a specific metric on a goal.
   *
   * @param goalId - The goal containing the metric
   * @param metricName - The name of the metric to update
   * @param newValue - The new current value
   */
  async updateMetric(goalId: string, metricName: string, newValue: number | string): Promise<void> {
    const goal = this.requireGoal(goalId);
    const now = new Date();

    const metric = goal.metrics.find(m => m.name === metricName);
    if (!metric) {
      throw new Error(`Metric "${metricName}" not found on goal ${goalId}`);
    }

    metric.current = newValue;
    metric.lastUpdated = now;
    goal.timeline.lastUpdated = now;

    this.goals.set(goalId, goal);
    await this.persistGoals();
  }

  /**
   * Adds a blocker to a goal and changes its status to 'blocked'.
   *
   * @param goalId - The goal to block
   * @param blockerDescription - What is blocking progress
   * @param resolutionApproach - How the blocker will be resolved
   */
  async addBlocker(goalId: string, blockerDescription: string, resolutionApproach: string): Promise<void> {
    const goal = this.requireGoal(goalId);
    const now = new Date();

    const blocker: GoalBlocker = {
      description: blockerDescription,
      identifiedDate: now,
      resolutionApproach,
      resolved: false,
    };

    goal.blockers.push(blocker);
    goal.status = 'blocked';
    goal.timeline.lastUpdated = now;

    this.goals.set(goalId, goal);
    await this.persistGoals();
  }

  /**
   * Resolves a blocker on a goal, returning it to 'active' status.
   *
   * @param goalId - The goal with the blocker
   * @param blockerIndex - Index of the blocker to resolve
   */
  async resolveBlocker(goalId: string, blockerIndex: number): Promise<void> {
    const goal = this.requireGoal(goalId);
    const now = new Date();

    if (blockerIndex >= goal.blockers.length) {
      throw new Error(`Blocker index ${blockerIndex} out of range`);
    }

    const blocker = goal.blockers[blockerIndex];
    if (!blocker) throw new Error(`Blocker at index ${blockerIndex} is undefined`);
    blocker.resolved = true;
    blocker.resolvedDate = now;

    // Only return to active if no remaining blockers
    const activeBlockers = goal.blockers.filter(b => !b.resolved);
    if (activeBlockers.length === 0) {
      goal.status = 'active';
    }

    goal.timeline.lastUpdated = now;
    this.goals.set(goalId, goal);
    await this.persistGoals();
  }

  /**
   * Adds an insight learned while pursuing a goal.
   *
   * @param goalId - The goal this insight relates to
   * @param insight - The insight text
   */
  async addInsight(goalId: string, insight: string): Promise<void> {
    const goal = this.requireGoal(goalId);
    goal.insights.push(insight);
    goal.timeline.lastUpdated = new Date();
    this.goals.set(goalId, goal);
    await this.persistGoals();
  }

  // ----------------------------------------------------------
  // GOAL LIFECYCLE
  // ----------------------------------------------------------

  /**
   * Marks a goal as completed and archives it.
   *
   * Cascades status change to notify parent goal of progress.
   *
   * @param goalId - The goal to complete
   * @param completionNote - Optional note about how it was completed
   */
  async completeGoal(goalId: string, completionNote?: string): Promise<void> {
    const goal = this.requireGoal(goalId);
    const now = new Date();

    goal.status = 'completed';
    goal.progress.percentage = 100;
    goal.progress.currentState = completionNote ?? 'Goal completed successfully';
    goal.timeline.completedDate = now;
    goal.timeline.lastUpdated = now;

    this.goals.delete(goalId);
    await this.memory.archiveGoal(goal, 'completed');

    // Update parent goal progress
    if (goal.parentGoalId) {
      await this.updateParentGoalProgress(goal.parentGoalId);
    }

    await this.persistGoals();

    await this.memory.writeExperience({
      category: 'experience-success',
      title: `Goal completed: ${goal.title}`,
      content: [
        `Goal: ${goal.title}`,
        `Level: ${goal.level}`,
        `Completion note: ${completionNote ?? 'N/A'}`,
        '',
        `Insights gained:`,
        ...goal.insights.map(i => `- ${i}`),
      ].join('\n'),
      tags: ['goal-completion', goal.level, ...goal.tags],
      importance: 3,
      relatedMemoryIds: [],
    });
  }

  /**
   * Abandons a goal with documented reasoning.
   *
   * @param goalId - The goal to abandon
   * @param reason - Why the goal is being abandoned
   * @param lessonsLearned - What was learned from pursuing it
   */
  async abandonGoal(goalId: string, reason: string, lessonsLearned: string): Promise<void> {
    const goal = this.requireGoal(goalId);
    const now = new Date();

    goal.status = 'abandoned';
    goal.insights.push(`Abandonment reason: ${reason}`);
    goal.insights.push(`Lessons: ${lessonsLearned}`);
    goal.timeline.lastUpdated = now;

    this.goals.delete(goalId);
    await this.memory.archiveGoal(goal, 'abandoned');
    await this.persistGoals();

    await this.memory.writeExperience({
      category: 'experience-failure',
      title: `Goal abandoned: ${goal.title}`,
      content: [
        `Goal: ${goal.title}`,
        `Level: ${goal.level}`,
        `Reason for abandonment: ${reason}`,
        '',
        `Lessons learned: ${lessonsLearned}`,
        '',
        `Time invested: from ${goal.timeline.created.toISOString().slice(0, 10)} to ${now.toISOString().slice(0, 10)}`,
      ].join('\n'),
      tags: ['goal-abandoned', goal.level, ...goal.tags],
      importance: 3,
      relatedMemoryIds: [],
    });
  }

  // ----------------------------------------------------------
  // PRIORITY COMPUTATION
  // ----------------------------------------------------------

  /**
   * Computes a priority score for a goal using the multi-dimensional
   * scoring framework defined in the goal-manager prompt.
   *
   * @param goal - The goal to score
   * @returns A computed priority score with rationale
   */
  computePriorityScore(goal: Goal): PriorityScore {
    const now = new Date();
    const daysUntilDeadline = (goal.timeline.targetCompletion.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    // Expected Value Score (0-30)
    const revenueTag = goal.tags.includes('revenue') ? 10 : 5;
    const capabilityTag = goal.tags.includes('capability') ? 10 : 3;
    const strategicTag = goal.tags.includes('strategic') ? 10 : 3;
    const expectedValueScore = Math.min(30, revenueTag + capabilityTag + strategicTag);

    // Urgency Score (0-20)
    const timeUrgency = daysUntilDeadline < 1 ? 10 :
                        daysUntilDeadline < 7 ? 8 :
                        daysUntilDeadline < 30 ? 5 : 2;
    const urgencyScore = Math.min(20, timeUrgency * 2);

    // Success Probability Score (0-25)
    const blockerPenalty = goal.blockers.filter(b => !b.resolved).length * 5;
    const progressBonus = goal.progress.percentage > 50 ? 5 : 0;
    const successProbabilityScore = Math.max(0, Math.min(25, 20 - blockerPenalty + progressBonus));

    // Effort-to-Value Score (0-25)
    // Higher score when impact is high and level is micro/tactical (near-term completion)
    const levelBonus = goal.level === 'micro' ? 10 :
                       goal.level === 'tactical' ? 7 :
                       goal.level === 'strategic' ? 5 : 3;
    const effortToValueScore = Math.min(25, levelBonus + (expectedValueScore / 6));

    const totalScore = Math.min(100,
      expectedValueScore + urgencyScore + successProbabilityScore + effortToValueScore
    );

    return {
      expectedValueScore,
      urgencyScore,
      successProbabilityScore,
      effortToValueScore,
      totalScore,
      rationale: `EV:${expectedValueScore} + Urgency:${urgencyScore} + Probability:${successProbabilityScore} + E/V:${effortToValueScore} = ${totalScore}`,
    };
  }

  /**
   * Re-scores and re-sorts all active goals by priority.
   *
   * @returns Sorted array of goals, highest priority first
   */
  async reprioritizeAll(): Promise<Goal[]> {
    const allGoals = Array.from(this.goals.values());

    for (const goal of allGoals) {
      const score = this.computePriorityScore(goal);
      goal.priority = Math.round(score.totalScore / 10); // Normalize to 1-10
      this.goals.set(goal.id, goal);
    }

    await this.persistGoals();

    return allGoals.sort((a, b) => b.priority - a.priority);
  }

  // ----------------------------------------------------------
  // QUERIES
  // ----------------------------------------------------------

  /**
   * Returns the highest-priority active goal across all levels.
   */
  getHighestPriorityGoal(): Goal | undefined {
    const active = Array.from(this.goals.values())
      .filter(g => g.status === 'active');

    if (active.length === 0) return undefined;

    return active.sort((a, b) => b.priority - a.priority)[0];
  }

  /**
   * Returns all goals at a specific level.
   *
   * @param level - The goal level to filter by
   */
  getGoalsByLevel(level: GoalLevel): Goal[] {
    return Array.from(this.goals.values()).filter(g => g.level === level);
  }

  /**
   * Returns all goals with a specific status.
   *
   * @param status - The status to filter by
   */
  getGoalsByStatus(status: GoalStatus): Goal[] {
    return Array.from(this.goals.values()).filter(g => g.status === status);
  }

  /**
   * Returns all goals that are currently blocked.
   */
  getBlockedGoals(): Goal[] {
    return this.getGoalsByStatus('blocked');
  }

  /**
   * Returns a complete snapshot of all active goals, structured by level.
   */
  getGoalHierarchySummary(): string {
    const lines: string[] = ['=== GOAL HIERARCHY ==='];

    const levels: GoalLevel[] = ['vision', 'strategic', 'tactical', 'micro'];
    for (const level of levels) {
      const levelGoals = this.getGoalsByLevel(level);
      if (levelGoals.length > 0) {
        lines.push(`\n[${level.toUpperCase()}]`);
        for (const goal of levelGoals) {
          const status = goal.status === 'blocked' ? '⊘' : '●';
          lines.push(`  ${status} ${goal.title} (${goal.progress.percentage}%) — P:${goal.priority}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Returns a specific goal by ID.
   *
   * @param id - The goal ID to look up
   */
  getGoal(id: string): Goal | undefined {
    return this.goals.get(id);
  }

  /**
   * Returns all active goals as an array.
   */
  getAllActiveGoals(): Goal[] {
    return Array.from(this.goals.values());
  }

  // ----------------------------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------------------------

  private validateGoalParams(params: {
    title: string;
    description: string;
    successCriteria: { primary: string; secondary: string[] };
    targetCompletion: Date;
  }): void {
    if (!params.title?.trim()) {
      throw new Error('Goal title cannot be empty');
    }
    if (!params.description?.trim()) {
      throw new Error('Goal description cannot be empty');
    }
    if (!params.successCriteria.primary?.trim()) {
      throw new Error('Goal must have a primary success criterion');
    }
    if (params.targetCompletion <= new Date()) {
      throw new Error('Target completion date must be in the future');
    }
  }

  private requireGoal(goalId: string): Goal {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal ${goalId} not found`);
    }
    return goal;
  }

  private generateGoalId(title: string): string {
    const slug = title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
    return `GOAL-${Date.now()}-${slug}`;
  }

  private async persistGoals(): Promise<void> {
    await this.memory.writeActiveGoals(Array.from(this.goals.values()));
  }

  private async updateParentGoalProgress(parentGoalId: string): Promise<void> {
    const parent = this.goals.get(parentGoalId);
    if (!parent) return;

    const children = parent.childGoalIds
      .map(id => this.goals.get(id))
      .filter((g): g is Goal => g !== undefined);

    if (children.length === 0) return;

    const avgProgress = children.reduce((sum, c) => sum + c.progress.percentage, 0) / children.length;
    await this.updateProgress(parentGoalId, {
      percentage: Math.round(avgProgress),
      currentState: `${children.filter(c => c.progress.percentage === 100).length} of ${children.length} sub-goals completed`,
    });
  }
}
