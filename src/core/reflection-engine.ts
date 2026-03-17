/**
 * @file src/core/reflection-engine.ts
 * @description Post-action reflection and learning extraction for Van.
 *
 * The reflection engine converts raw execution data into structured learning.
 * It analyzes outcomes, extracts generalizable lessons, updates knowledge
 * bases, and generates recommendations for strategy adaptation.
 *
 * This is one of the most important modules in the system — it is the mechanism
 * by which experience converts to wisdom. Without effective reflection, the agent
 * repeats mistakes and misses opportunities for improvement.
 */

import {
  ReflectionRecord,
  ReflectionType,
  ExecutionState,
  Goal,
  CycleState,
  PersonalityState,
} from '../types/index.js';
import { MemorySystem } from './memory-system.js';
import { PersonalityEngine } from './personality.js';

// ============================================================
// REFLECTION ENGINE CLASS
// ============================================================

/**
 * ReflectionEngine analyzes completed cognitive cycles and execution states
 * to extract lessons, update knowledge, and recommend strategy changes.
 *
 * @example
 * ```typescript
 * const reflectionEngine = new ReflectionEngine(memorySystem, personalityEngine);
 *
 * const reflection = await reflectionEngine.reflectOnCycle(cycleState);
 * console.log(reflection.learnings.mostImportantLearning);
 * ```
 */
export class ReflectionEngine {
  private readonly memory: MemorySystem;
  private readonly personality: PersonalityEngine;
  private cycleCount: number = 0;

  constructor(memory: MemorySystem, personality: PersonalityEngine) {
    this.memory = memory;
    this.personality = personality;
  }

  // ----------------------------------------------------------
  // PRIMARY REFLECTION METHODS
  // ----------------------------------------------------------

  /**
   * Conducts a comprehensive reflection on a completed cognitive cycle.
   *
   * Analyzes outcomes, extracts lessons, updates memory, and generates
   * recommendations for the next cycle.
   *
   * @param cycle - The completed cognitive cycle state
   * @returns A structured reflection record
   */
  async reflectOnCycle(cycle: CycleState): Promise<ReflectionRecord> {
    this.cycleCount++;
    const reflectionType = this.determineReflectionType(cycle.cycleNumber ?? 0);

    const reflection: ReflectionRecord = {
      id: `REFLECT-${Date.now()}`,
      type: reflectionType,
      cycleNumber: cycle.cycleNumber,
      createdAt: new Date(),

      outcomes: this.analyzeOutcomes(cycle),
      decisions: this.analyzeDecisions(cycle),
      errors: this.analyzeErrors(cycle),
      learnings: await this.extractLearnings(cycle),
      strategyRecommendations: this.generateStrategyRecommendations(cycle),
      nextCyclePriority: this.determineNextCyclePriority(cycle),
      memoryUpdatesWritten: [],
    };

    // Persist the reflection and update memory
    const reflectionPath = await this.memory.writeReflection(reflection);
    reflection.memoryUpdatesWritten.push(reflectionPath);

    // Update personality state based on outcomes
    await this.updatePersonalityFromReflection(reflection);

    // Write experience entries for significant findings
    await this.writeSignificantExperiences(reflection);

    // For deep reflection cycles, perform additional analysis
    if (reflectionType === 'strategic' || reflectionType === 'transformative') {
      await this.performDeepAnalysis(reflection, cycle);
    }

    return reflection;
  }

  /**
   * Conducts a micro-reflection after a single action.
   *
   * Lighter-weight than cycle reflection — captures the key observation
   * without full analysis overhead.
   *
   * @param actionDescription - What was attempted
   * @param expected - What was expected to happen
   * @param actual - What actually happened
   * @param success - Whether the action succeeded
   */
  async reflectOnAction(
    actionDescription: string,
    expected: string,
    actual: string,
    success: boolean
  ): Promise<{
    insight: string;
    behaviorChange: string | null;
    shouldUpdateMemory: boolean;
  }> {
    const matched = success && this.matchesExpectation(expected, actual);
    const insight = this.deriveActionInsight(actionDescription, expected, actual, success, matched);
    const behaviorChange = success ? null : this.deriveBehaviorChange(actionDescription, actual);

    // Only write to memory for significant mismatches or failures
    const shouldUpdateMemory = !success || (!matched && this.isSignificantMismatch(expected, actual));

    if (shouldUpdateMemory) {
      await this.memory.writeExperience({
        category: success ? 'experience-insight' : 'experience-failure',
        title: `Action ${success ? 'insight' : 'failure'}: ${actionDescription.slice(0, 50)}`,
        content: [
          `Action: ${actionDescription}`,
          `Expected: ${expected}`,
          `Actual: ${actual}`,
          `Success: ${success}`,
          `Matched expectation: ${matched}`,
          '',
          `Insight: ${insight}`,
          behaviorChange ? `Behavior change: ${behaviorChange}` : '',
        ].filter(l => l !== '').join('\n'),
        tags: ['action-reflection', success ? 'success' : 'failure'],
        importance: success ? 1 : 2,
        relatedMemoryIds: [],
      });
    }

    return { insight, behaviorChange, shouldUpdateMemory };
  }

  /**
   * Conducts a weekly strategic reflection.
   *
   * Reviews all cycles from the past week, identifies trends,
   * and makes strategic recommendations.
   *
   * @param recentCycles - The cycles from the past week
   * @param activeGoals - Currently active goals
   */
  async reflectStrategically(
    recentCycles: CycleState[],
    activeGoals: Goal[]
  ): Promise<{
    performanceTrend: 'improving' | 'stable' | 'declining';
    topStrategies: string[];
    abandonRecommendations: string[];
    newOpportunities: string[];
    weeklyInsight: string;
  }> {
    // Calculate success rate trend
    const successRates = recentCycles.map(c => {
      const exec = c.execution;
      if (!exec || exec.actionsExecuted === 0) return 0;
      return exec.actionsSucceeded / exec.actionsExecuted;
    });

    const recentAvg = successRates.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const olderAvg = successRates.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(1, successRates.length - 3);

    let performanceTrend: 'improving' | 'stable' | 'declining';
    if (recentAvg > olderAvg + 0.05) performanceTrend = 'improving';
    else if (recentAvg < olderAvg - 0.05) performanceTrend = 'declining';
    else performanceTrend = 'stable';

    // Identify most effective strategies from goal tags
    const tagFrequency: Record<string, number> = {};
    for (const goal of activeGoals.filter(g => g.status === 'completed' || g.progress.percentage > 50)) {
      for (const tag of goal.tags) {
        tagFrequency[tag] = (tagFrequency[tag] ?? 0) + 1;
      }
    }
    const topStrategies = Object.entries(tagFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([tag]) => tag);

    // Identify goals to consider abandoning (blocked for > 2 weeks, no progress)
    const now = new Date();
    const abandonRecommendations = activeGoals
      .filter(g => {
        const daysSinceUpdate = (now.getTime() - g.timeline.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
        return g.status === 'blocked' && daysSinceUpdate > 14 && g.progress.percentage < 10;
      })
      .map(g => g.title);

    const weeklyInsight = this.synthesizeWeeklyInsight(performanceTrend, successRates, activeGoals);

    const result = {
      performanceTrend,
      topStrategies,
      abandonRecommendations,
      newOpportunities: [], // Would be populated by world model scan
      weeklyInsight,
    };

    // Write to memory
    await this.memory.writeExperience({
      category: 'experience-insight',
      title: `Weekly strategic reflection — ${new Date().toISOString().slice(0, 10)}`,
      content: [
        `Performance trend: ${performanceTrend}`,
        `Recent success rate: ${Math.round(recentAvg * 100)}%`,
        `Older success rate: ${Math.round(olderAvg * 100)}%`,
        '',
        `Top performing strategies: ${topStrategies.join(', ')}`,
        '',
        `Goals to consider abandoning: ${abandonRecommendations.length > 0 ? abandonRecommendations.join(', ') : 'None'}`,
        '',
        `Weekly insight: ${weeklyInsight}`,
      ].join('\n'),
      tags: ['weekly-reflection', 'strategic'],
      importance: 4,
      relatedMemoryIds: [],
    });

    return result;
  }

  // ----------------------------------------------------------
  // ANALYSIS METHODS
  // ----------------------------------------------------------

  private analyzeOutcomes(cycle: CycleState): ReflectionRecord['outcomes'] {
    const exec = cycle.execution;

    return {
      actionsSucceeded: exec?.actionsSucceeded ?? 0,
      actionsFailed: exec?.actionsFailed ?? 0,
      unexpectedPositives: (exec?.unexpectedOutcomes ?? [])
        .filter(o => o.toLowerCase().includes('success') || o.toLowerCase().includes('better than')),
      unexpectedNegatives: (exec?.unexpectedOutcomes ?? [])
        .filter(o => !o.toLowerCase().includes('success')),
      goalProgressDelta: cycle.decision?.selectedGoal
        ? `Working on: ${cycle.decision.selectedGoal.title}`
        : 'No goal selected',
    };
  }

  private analyzeDecisions(cycle: CycleState): ReflectionRecord['decisions'] {
    const decisions: ReflectionRecord['decisions'] = [];

    if (cycle.decision) {
      decisions.push({
        decision: `Selected goal: ${cycle.decision.selectedGoal.title}`,
        reasoning: cycle.decision.selectionReason,
        outcome: cycle.execution
          ? `${cycle.execution.actionsSucceeded}/${cycle.execution.actionsExecuted} actions succeeded`
          : 'No execution data',
        assessment: cycle.execution && cycle.execution.actionsSucceeded > 0
          ? 'Decision was reasonable — produced results'
          : 'Decision may need re-evaluation',
      });
    }

    return decisions;
  }

  private analyzeErrors(cycle: CycleState): ReflectionRecord['errors'] {
    const errors: ReflectionRecord['errors'] = [];

    if (!cycle.execution) return errors;

    for (const result of cycle.execution.results) {
      if (!result.success && result.errorMessage) {
        errors.push({
          error: result.errorMessage,
          rootCause: this.inferRootCause(result.errorMessage, result.errorType),
          category: result.errorType ?? 'logical',
          lesson: this.deriveLessonFromError(result.errorMessage, result.errorType),
          behaviorChange: this.deriveBehaviorChangeFromError(result.errorType),
        });
      }
    }

    return errors;
  }

  private async extractLearnings(cycle: CycleState): Promise<ReflectionRecord['learnings']> {
    const newKnowledge: string[] = [];
    const refinedUnderstanding: string[] = [];
    const incorrectBeliefsCorrected: string[] = [];

    // Analyze unexpected outcomes for knowledge updates
    for (const unexpected of cycle.execution?.unexpectedOutcomes ?? []) {
      if (unexpected.includes('unexpected')) {
        newKnowledge.push(`Discovered: ${unexpected}`);
      }
    }

    // Analyze error patterns
    const errorTypes = cycle.execution?.results
      .filter(r => !r.success)
      .map(r => r.errorType) ?? [];

    if (errorTypes.filter(t => t === 'transient').length > 1) {
      refinedUnderstanding.push('External services have higher transient failure rate than expected — build in more retry logic');
    }
    if (errorTypes.filter(t => t === 'capability').length > 0) {
      incorrectBeliefsCorrected.push('Some actions assumed capabilities that were not available — validate capabilities before planning');
    }

    const mostImportantLearning = this.synthesizeMostImportantLearning(
      cycle,
      newKnowledge,
      refinedUnderstanding,
      incorrectBeliefsCorrected
    );

    return {
      newKnowledge,
      refinedUnderstanding,
      incorrectBeliefsCorrected,
      mostImportantLearning,
    };
  }

  private generateStrategyRecommendations(cycle: CycleState): ReflectionRecord['strategyRecommendations'] {
    const recommendations: ReflectionRecord['strategyRecommendations'] = [];

    if (!cycle.execution) return recommendations;

    const successRate = cycle.execution.actionsExecuted > 0
      ? cycle.execution.actionsSucceeded / cycle.execution.actionsExecuted
      : 0;

    if (successRate < 0.5) {
      recommendations.push({
        area: 'Action planning',
        recommendation: 'Actions are failing at high rate — review planning assumptions and tool capabilities before executing complex plans',
        rationale: `Success rate of ${Math.round(successRate * 100)}% is below acceptable threshold of 50%`,
      });
    }

    if ((cycle.execution.unexpectedOutcomes ?? []).length > 2) {
      recommendations.push({
        area: 'World model',
        recommendation: 'Multiple unexpected outcomes suggest world model needs updating — dedicate next cycle to updating environmental understanding',
        rationale: `${cycle.execution.unexpectedOutcomes.length} unexpected outcomes in a single cycle indicates significant model-reality gap`,
      });
    }

    return recommendations;
  }

  private determineNextCyclePriority(cycle: CycleState): string {
    // If current goal made good progress, continue it
    if (cycle.execution && cycle.execution.actionsSucceeded > 0 && cycle.decision?.selectedGoal) {
      const progressMade = cycle.execution.actionsSucceeded / Math.max(1, cycle.execution.actionsExecuted);
      if (progressMade > 0.6) {
        return `Continue: ${cycle.decision.selectedGoal.title}`;
      }
    }

    // If errors were high, prioritize diagnosis
    if (cycle.execution && cycle.execution.actionsFailed > cycle.execution.actionsSucceeded) {
      return 'Diagnose and address recurring error patterns before continuing';
    }

    return 'Re-assess goal priorities and select highest-value action';
  }

  // ----------------------------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------------------------

  private determineReflectionType(cycleNumber: number): ReflectionType {
    if (cycleNumber % 50 === 0) return 'strategic';
    if (cycleNumber % 10 === 0) return 'domain';
    return 'cycle';
  }

  private matchesExpectation(expected: string, actual: string): boolean {
    // Simple heuristic: look for key terms from expected in actual
    const expectedKeyTerms = expected.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const actualLower = actual.toLowerCase();
    const matchCount = expectedKeyTerms.filter(term => actualLower.includes(term)).length;
    return matchCount / Math.max(1, expectedKeyTerms.length) > 0.4;
  }

  private isSignificantMismatch(expected: string, actual: string): boolean {
    return !this.matchesExpectation(expected, actual);
  }

  private deriveActionInsight(
    action: string,
    expected: string,
    actual: string,
    success: boolean,
    matched: boolean
  ): string {
    if (success && matched) {
      return `Action executed as expected — approach is validated for "${action.slice(0, 40)}"`;
    }
    if (success && !matched) {
      return `Action succeeded but differently than expected — may need to update model of how "${action.slice(0, 40)}" works`;
    }
    if (!success) {
      return `Action failed — "${action.slice(0, 40)}" requires different approach. Expected: ${expected.slice(0, 50)}. Got: ${actual.slice(0, 50)}`;
    }
    return 'Unexpected state';
  }

  private deriveBehaviorChange(action: string, actual: string): string {
    return `Before attempting "${action.slice(0, 40)}", validate preconditions. Failure pattern: ${actual.slice(0, 80)}`;
  }

  private inferRootCause(errorMessage: string, errorType?: string): string {
    const typeExplanations: Record<string, string> = {
      transient: 'External service temporarily unavailable or rate-limited',
      input: 'Incorrect input provided to the tool — likely a planning assumption error',
      capability: 'Required capability not available — need to verify what tools can do',
      environmental: 'External system changed or is unavailable — world model needs updating',
      logical: 'Incorrect reasoning about how to accomplish the task',
    };

    return typeExplanations[errorType ?? 'logical'] ?? `Unknown cause: ${errorMessage.slice(0, 100)}`;
  }

  private deriveLessonFromError(errorMessage: string, errorType?: string): string {
    const lessons: Record<string, string> = {
      transient: 'Implement exponential backoff retry for transient failures; do not treat them as permanent failures',
      input: 'Validate inputs against tool documentation before executing; trace back assumption that produced wrong input',
      capability: 'Verify tool capabilities against documentation before including in action plans',
      environmental: 'External environment is dynamic; model it probabilistically and update when it changes',
      logical: `Reasoning error in "${errorMessage.slice(0, 50)}" — trace the assumption chain that led here`,
    };

    return lessons[errorType ?? 'logical'] ?? 'Investigate root cause before retrying';
  }

  private deriveBehaviorChangeFromError(errorType?: string): string {
    const changes: Record<string, string> = {
      transient: 'Add retry with backoff before marking actions of this type as failed',
      input: 'Add input validation step before executing tool calls',
      capability: 'Add capability check step before including tools in action plans',
      environmental: 'Add fresh environment check before planning actions dependent on external state',
      logical: 'Add explicit assumption review step before executing multi-step plans',
    };

    return changes[errorType ?? 'logical'] ?? 'Review and correct the approach before retrying';
  }

  private synthesizeMostImportantLearning(
    cycle: CycleState,
    newKnowledge: string[],
    refinedUnderstanding: string[],
    incorrectBeliefsCorrected: string[]
  ): string {
    if (incorrectBeliefsCorrected.length > 0) {
      return `Corrected belief: ${incorrectBeliefsCorrected[0]}`;
    }
    if (newKnowledge.length > 0) {
      return `New knowledge: ${newKnowledge[0]}`;
    }
    if (refinedUnderstanding.length > 0) {
      return `Refined: ${refinedUnderstanding[0]}`;
    }
    if (cycle.execution) {
      const rate = cycle.execution.actionsExecuted > 0
        ? cycle.execution.actionsSucceeded / cycle.execution.actionsExecuted
        : 0;
      return `Execution performance: ${Math.round(rate * 100)}% success rate in this cycle`;
    }
    return 'No significant new learning this cycle — consider if the goal selection and approach need adjustment';
  }

  private synthesizeWeeklyInsight(
    trend: string,
    successRates: number[],
    goals: Goal[]
  ): string {
    const avgRate = successRates.reduce((a, b) => a + b, 0) / Math.max(1, successRates.length);
    const blockedCount = goals.filter(g => g.status === 'blocked').length;

    if (trend === 'improving') {
      return `Performance is improving (avg ${Math.round(avgRate * 100)}% success rate). Current approaches are working — continue and build on them.`;
    }
    if (trend === 'declining') {
      return `Performance declining (avg ${Math.round(avgRate * 100)}% success rate, ${blockedCount} goals blocked). Priority: diagnose root causes and consider strategy pivots.`;
    }
    return `Performance stable at ${Math.round(avgRate * 100)}% success rate. Look for optimization opportunities rather than major changes.`;
  }

  private async updatePersonalityFromReflection(reflection: ReflectionRecord): Promise<void> {
    const successRate = reflection.outcomes.actionsSucceeded /
      Math.max(1, reflection.outcomes.actionsSucceeded + (reflection.errors.length));

    if (successRate > 0.7) {
      await this.personality.processEvent('success', reflection.learnings.mostImportantLearning, successRate);
    } else if (successRate < 0.3 && reflection.errors.length > 0) {
      const firstError = reflection.errors[0];
      await this.personality.processEvent('failure', firstError?.error ?? 'unknown error', 1 - successRate);
    } else {
      await this.personality.processEvent('learning', reflection.learnings.mostImportantLearning, 0.5);
    }
  }

  private async writeSignificantExperiences(reflection: ReflectionRecord): Promise<void> {
    // Write significant insights to long-term memory
    if (reflection.learnings.mostImportantLearning &&
        reflection.learnings.mostImportantLearning !== 'No significant new learning this cycle — consider if the goal selection and approach need adjustment') {
      await this.memory.writeExperience({
        category: 'experience-insight',
        title: `Key insight — Cycle ${reflection.cycleNumber}`,
        content: reflection.learnings.mostImportantLearning,
        tags: ['cycle-insight', reflection.type],
        importance: 3,
        relatedMemoryIds: [],
      });
    }

    // Write significant errors to failure memory
    for (const error of reflection.errors.filter(e => e.category === 'logical' || e.category === 'capability')) {
      await this.memory.writeExperience({
        category: 'experience-failure',
        title: `Significant error — ${error.error.slice(0, 50)}`,
        content: [
          `Error: ${error.error}`,
          `Root cause: ${error.rootCause}`,
          `Lesson: ${error.lesson}`,
          `Behavior change: ${error.behaviorChange}`,
        ].join('\n'),
        tags: ['error', error.category],
        importance: 3,
        relatedMemoryIds: [],
      });
    }
  }

  private async performDeepAnalysis(reflection: ReflectionRecord, _cycle: CycleState): Promise<void> {
    // Write a deep analysis summary for strategic and transformative reflections
    await this.memory.writeExperience({
      category: 'experience-insight',
      title: `Deep analysis — ${reflection.type} reflection (Cycle ${reflection.cycleNumber})`,
      content: [
        `## Reflection Type: ${reflection.type}`,
        '',
        `## Strategy Recommendations`,
        ...reflection.strategyRecommendations.map(r => `- **${r.area}**: ${r.recommendation}\n  Rationale: ${r.rationale}`),
        '',
        `## Learnings Summary`,
        `New knowledge items: ${reflection.learnings.newKnowledge.length}`,
        `Beliefs corrected: ${reflection.learnings.incorrectBeliefsCorrected.length}`,
        `Most important: ${reflection.learnings.mostImportantLearning}`,
      ].join('\n'),
      tags: ['deep-analysis', reflection.type, 'strategic'],
      importance: 5,
      relatedMemoryIds: [],
    });
  }
}
