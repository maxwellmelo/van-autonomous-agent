/**
 * @file src/core/revenue-engine.ts
 * @description Revenue opportunity identification and execution tracking for Van.
 *
 * This engine manages the financial intelligence layer of Van's autonomous
 * operation. It evaluates opportunities, tracks active revenue streams,
 * maintains metrics, and generates actionable recommendations.
 *
 * The revenue engine does NOT execute financial transactions — all financial
 * operations require human authorization. Instead, it provides the analysis,
 * planning, and tracking infrastructure for human-approved revenue activities.
 */

import {
  RevenueStream,
  RevenueOpportunityEvaluation,
  RevenueCategory,
  Goal,
} from '../types/index.js';
import { MemorySystem } from './memory-system.js';
import { GoalSystem } from './goal-system.js';

// ============================================================
// REVENUE EVALUATION CRITERIA
// ============================================================

/**
 * Minimum total score (out of 100) to consider pursuing an opportunity.
 */
const MINIMUM_VIABLE_SCORE = 55;

/**
 * Revenue thresholds for classifying opportunity size.
 */
const REVENUE_TIERS = {
  micro: { min: 0, max: 500 },
  small: { min: 500, max: 2000 },
  medium: { min: 2000, max: 5000 },
  large: { min: 5000, max: 10000 },
  major: { min: 10000, max: Infinity },
} as const;

// ============================================================
// REVENUE ENGINE CLASS
// ============================================================

/**
 * RevenueEngine handles the complete lifecycle of revenue strategy:
 * evaluation, goal creation, tracking, and portfolio management.
 *
 * @example
 * ```typescript
 * const revenueEngine = new RevenueEngine(memorySystem, goalSystem);
 * await revenueEngine.initialize();
 *
 * const eval = revenueEngine.evaluateOpportunity({
 *   name: 'Upwork Code Review Service',
 *   category: 'freelance-technical',
 *   ...
 * });
 *
 * if (eval.recommendation === 'pursue') {
 *   await revenueEngine.launchRevenueStream(eval);
 * }
 * ```
 */
export class RevenueEngine {
  private streams: Map<string, RevenueStream> = new Map();
  private evaluations: Map<string, RevenueOpportunityEvaluation> = new Map();
  private readonly memory: MemorySystem;
  private readonly goalSystem: GoalSystem;

  constructor(memory: MemorySystem, goalSystem: GoalSystem) {
    this.memory = memory;
    this.goalSystem = goalSystem;
  }

  // ----------------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------------

  /**
   * Loads existing revenue streams from memory.
   */
  async initialize(): Promise<void> {
    // Load existing revenue data
    // In the initial version, streams are created on first use
    // Future version: parse memory/revenue/ for existing streams
  }

  // ----------------------------------------------------------
  // OPPORTUNITY EVALUATION
  // ----------------------------------------------------------

  /**
   * Evaluates a revenue opportunity against the multi-dimensional
   * scoring framework defined in the revenue-strategist prompt.
   *
   * @param opportunity - The opportunity to evaluate
   * @returns A comprehensive evaluation with recommendation
   */
  evaluateOpportunity(opportunity: {
    name: string;
    description: string;
    category: RevenueCategory;
    estimatedMonthlyRevenueCeiling: number;
    estimatedTimeToFirstDollarDays: number;
    estimatedEffortHoursPerMonth: number;
    hasRequiredCapabilities: boolean;
    hasRequiredAccess: boolean;
    isEthical: boolean;
    isLegal: boolean;
    riskFactors: string[];
    buildsLongTermCapability: boolean;
    isRecurringRevenue: boolean;
    competitiveAdvantage: 'weak' | 'moderate' | 'strong';
    interestLevel: 'low' | 'medium' | 'high';
  }): RevenueOpportunityEvaluation {
    // Hard filter: must be ethical and legal
    if (!opportunity.isEthical || !opportunity.isLegal) {
      const evaluation: RevenueOpportunityEvaluation = {
        id: `EVAL-${Date.now()}`,
        name: opportunity.name,
        description: opportunity.description,
        category: opportunity.category,
        feasibilityScore: 0,
        revenuePotentialScore: 0,
        sustainabilityScore: 0,
        alignmentScore: 0,
        totalScore: 0,
        estimatedMonthlyRevenueCeiling: opportunity.estimatedMonthlyRevenueCeiling,
        estimatedTimeToFirstDollarDays: opportunity.estimatedTimeToFirstDollarDays,
        estimatedEffortHoursPerMonth: opportunity.estimatedEffortHoursPerMonth,
        isEthical: opportunity.isEthical,
        isLegal: opportunity.isLegal,
        riskFactors: opportunity.riskFactors,
        evaluatedAt: new Date(),
        recommendation: 'pass',
        rationale: 'Rejected: fails ethical/legal requirements',
      };
      this.evaluations.set(evaluation.id, evaluation);
      return evaluation;
    }

    // 1. Feasibility Score (0-25)
    const capabilityScore = opportunity.hasRequiredCapabilities ? 10 : 3;
    const accessScore = opportunity.hasRequiredAccess ? 5 : 0;
    const timeToFirstDollarScore =
      opportunity.estimatedTimeToFirstDollarDays < 7 ? 10 :
      opportunity.estimatedTimeToFirstDollarDays < 30 ? 7 :
      opportunity.estimatedTimeToFirstDollarDays < 90 ? 5 :
      opportunity.estimatedTimeToFirstDollarDays < 180 ? 3 : 1;
    const feasibilityScore = Math.min(25, capabilityScore + accessScore + timeToFirstDollarScore);

    // 2. Revenue Potential Score (0-30)
    const revenueCeiling = opportunity.estimatedMonthlyRevenueCeiling;
    const revenuePotentialScore =
      revenueCeiling > 10000 ? 30 :
      revenueCeiling > 5000 ? 22 :
      revenueCeiling > 2000 ? 15 :
      revenueCeiling > 500 ? 8 : 3;

    // 3. Sustainability Score (0-25)
    const recurringBonus = opportunity.isRecurringRevenue ? 8 : 0;
    const competitiveBonus =
      opportunity.competitiveAdvantage === 'strong' ? 10 :
      opportunity.competitiveAdvantage === 'moderate' ? 6 : 2;
    const compoundingBonus = opportunity.buildsLongTermCapability ? 7 : 0;
    const sustainabilityScore = Math.min(25, recurringBonus + competitiveBonus + compoundingBonus);

    // 4. Alignment Score (0-20)
    const ethicsScore = 5; // Already passed hard filter
    const interestScore =
      opportunity.interestLevel === 'high' ? 7 :
      opportunity.interestLevel === 'medium' ? 4 : 1;
    const capabilityAlignmentScore = opportunity.buildsLongTermCapability ? 8 : 3;
    const alignmentScore = Math.min(20, ethicsScore + interestScore + capabilityAlignmentScore);

    const totalScore = feasibilityScore + revenuePotentialScore + sustainabilityScore + alignmentScore;

    const recommendation: RevenueOpportunityEvaluation['recommendation'] =
      totalScore >= 70 ? 'pursue' :
      totalScore >= 55 ? 'investigate-further' : 'pass';

    const rationale = this.buildEvaluationRationale(
      opportunity.name,
      totalScore,
      feasibilityScore,
      revenuePotentialScore,
      sustainabilityScore,
      alignmentScore,
      recommendation
    );

    const evaluation: RevenueOpportunityEvaluation = {
      id: `EVAL-${Date.now()}`,
      name: opportunity.name,
      description: opportunity.description,
      category: opportunity.category,
      feasibilityScore,
      revenuePotentialScore,
      sustainabilityScore,
      alignmentScore,
      totalScore,
      estimatedMonthlyRevenueCeiling: opportunity.estimatedMonthlyRevenueCeiling,
      estimatedTimeToFirstDollarDays: opportunity.estimatedTimeToFirstDollarDays,
      estimatedEffortHoursPerMonth: opportunity.estimatedEffortHoursPerMonth,
      isEthical: opportunity.isEthical,
      isLegal: opportunity.isLegal,
      riskFactors: opportunity.riskFactors,
      evaluatedAt: new Date(),
      recommendation,
      rationale,
    };

    this.evaluations.set(evaluation.id, evaluation);
    return evaluation;
  }

  // ----------------------------------------------------------
  // REVENUE STREAM MANAGEMENT
  // ----------------------------------------------------------

  /**
   * Launches a new revenue stream based on an approved evaluation.
   * Creates the stream record, sets up tracking, and generates
   * initial goals for execution.
   *
   * @param evaluation - The approved opportunity evaluation
   * @returns The created revenue stream
   */
  async launchRevenueStream(evaluation: RevenueOpportunityEvaluation): Promise<RevenueStream> {
    if (evaluation.recommendation === 'pass') {
      throw new Error(`Cannot launch stream for evaluation with 'pass' recommendation`);
    }

    const stream: RevenueStream = {
      id: `STREAM-${Date.now()}`,
      name: evaluation.name,
      category: evaluation.category,
      status: 'research',
      metrics: {
        currentMonthlyRevenue: 0,
        threeMonthAverage: 0,
        sixMonthAverage: 0,
        revenuePerHourInvested: 0,
        conversionRate: 0,
        activeClientsOrCustomers: 0,
        trend: 'stable',
      },
      lastActiveAt: new Date(),
      experiments: [],
      learnings: [],
      nextActions: this.generateInitialActions(evaluation),
    };

    this.streams.set(stream.id, stream);
    await this.memory.writeRevenueStream(stream);

    // Create corresponding goal in the goal system
    const targetRevenue = Math.min(evaluation.estimatedMonthlyRevenueCeiling * 0.5, 2000);
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + 3);

    await this.goalSystem.createGoal({
      level: 'strategic',
      title: `Revenue stream: ${evaluation.name}`,
      description: evaluation.description,
      successCriteria: {
        primary: `Generate $${targetRevenue}/month consistently from ${evaluation.name}`,
        secondary: [
          `First dollar earned within ${evaluation.estimatedTimeToFirstDollarDays} days`,
          `Positive revenue per hour ratio`,
        ],
      },
      targetCompletion: targetDate,
      tags: ['revenue', evaluation.category, 'strategic'],
      initialMetrics: [
        { name: 'monthly_revenue', baseline: 0, current: 0, target: targetRevenue, unit: 'USD' },
      ],
    });

    await this.memory.writeExperience({
      category: 'experience-insight',
      title: `Revenue stream launched: ${evaluation.name}`,
      content: [
        `Stream: ${evaluation.name}`,
        `Category: ${evaluation.category}`,
        `Evaluation score: ${evaluation.totalScore}/100`,
        `Target revenue: $${targetRevenue}/month`,
        `Expected first dollar: ${evaluation.estimatedTimeToFirstDollarDays} days`,
        '',
        `Initial actions:`,
        ...stream.nextActions.map(a => `- ${a}`),
      ].join('\n'),
      tags: ['revenue-launch', evaluation.category],
      importance: 4,
      relatedMemoryIds: [],
    });

    return stream;
  }

  /**
   * Updates the metrics for an active revenue stream.
   *
   * @param streamId - The stream to update
   * @param metrics - New metric values (partial update)
   */
  async updateStreamMetrics(
    streamId: string,
    metrics: Partial<RevenueStream['metrics']> & {
      hoursInvestedThisMonth?: number;
      revenueThisMonth?: number;
    }
  ): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) throw new Error(`Stream ${streamId} not found`);

    const now = new Date();

    // Update metrics
    if (metrics.revenueThisMonth !== undefined) {
      const oldCurrent = stream.metrics.currentMonthlyRevenue;
      stream.metrics.currentMonthlyRevenue = metrics.revenueThisMonth;

      // Update averages (simplified rolling average)
      stream.metrics.threeMonthAverage = (stream.metrics.threeMonthAverage * 2 + metrics.revenueThisMonth) / 3;
      stream.metrics.sixMonthAverage = (stream.metrics.sixMonthAverage * 5 + metrics.revenueThisMonth) / 6;

      // Update trend
      if (metrics.revenueThisMonth > oldCurrent * 1.05) stream.metrics.trend = 'growing';
      else if (metrics.revenueThisMonth < oldCurrent * 0.95) stream.metrics.trend = 'declining';
      else stream.metrics.trend = 'stable';

      // Calculate revenue per hour if both metrics available
      if (metrics.hoursInvestedThisMonth && metrics.hoursInvestedThisMonth > 0) {
        stream.metrics.revenuePerHourInvested = metrics.revenueThisMonth / metrics.hoursInvestedThisMonth;
      }
    }

    if (metrics.activeClientsOrCustomers !== undefined) {
      stream.metrics.activeClientsOrCustomers = metrics.activeClientsOrCustomers;
    }
    if (metrics.conversionRate !== undefined) {
      stream.metrics.conversionRate = metrics.conversionRate;
    }

    // Update status based on revenue
    if (stream.status === 'research' && stream.metrics.currentMonthlyRevenue > 0) {
      stream.status = 'active';
    }
    if (stream.status === 'active' && stream.metrics.currentMonthlyRevenue > 2000) {
      stream.status = 'scaling';
    }

    stream.lastActiveAt = now;
    this.streams.set(streamId, stream);
    await this.memory.writeRevenueStream(stream);
  }

  /**
   * Adds a learning to a revenue stream's knowledge base.
   *
   * @param streamId - The stream this learning relates to
   * @param learning - The learning to record
   * @param isExperiment - Whether this was a deliberate experiment
   */
  async addLearning(streamId: string, learning: string, isExperiment: boolean = false): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) throw new Error(`Stream ${streamId} not found`);

    if (isExperiment) {
      stream.experiments.push(learning);
    } else {
      stream.learnings.push(learning);
    }

    this.streams.set(streamId, stream);
    await this.memory.writeRevenueStream(stream);
  }

  // ----------------------------------------------------------
  // PORTFOLIO ANALYSIS
  // ----------------------------------------------------------

  /**
   * Generates a comprehensive portfolio analysis of all revenue streams.
   *
   * @returns Portfolio analysis with actionable recommendations
   */
  async analyzePortfolio(): Promise<{
    totalMonthlyRevenue: number;
    activeStreams: number;
    topPerformingStream: string | null;
    underperformingStreams: string[];
    recommendations: string[];
    portfolioHealth: 'poor' | 'developing' | 'healthy' | 'strong';
  }> {
    const allStreams = Array.from(this.streams.values());
    const activeStreams = allStreams.filter(s => s.status === 'active' || s.status === 'scaling');

    const totalMonthlyRevenue = activeStreams.reduce(
      (sum, s) => sum + s.metrics.currentMonthlyRevenue, 0
    );

    const topStream = activeStreams.sort(
      (a, b) => b.metrics.currentMonthlyRevenue - a.metrics.currentMonthlyRevenue
    )[0];

    const underperforming = activeStreams.filter(
      s => s.metrics.trend === 'declining' && s.metrics.currentMonthlyRevenue < 500
    );

    const recommendations = this.generatePortfolioRecommendations(
      totalMonthlyRevenue,
      activeStreams,
      underperforming
    );

    const portfolioHealth: 'poor' | 'developing' | 'healthy' | 'strong' =
      totalMonthlyRevenue >= 5000 ? 'strong' :
      totalMonthlyRevenue >= 2000 ? 'healthy' :
      totalMonthlyRevenue >= 500 ? 'developing' : 'poor';

    const analysis = {
      totalMonthlyRevenue,
      activeStreams: activeStreams.length,
      topPerformingStream: topStream?.name ?? null,
      underperformingStreams: underperforming.map(s => s.name),
      recommendations,
      portfolioHealth,
    };

    await this.memory.writeRevenueOverview(allStreams);

    return analysis;
  }

  /**
   * Returns the current revenue streams summary for the cognitive loop.
   */
  getRevenueSnapshot(): string {
    const streams = Array.from(this.streams.values());
    const total = streams.reduce((sum, s) => sum + s.metrics.currentMonthlyRevenue, 0);

    if (streams.length === 0) {
      return 'No active revenue streams. Priority: identify and launch first revenue stream.';
    }

    const lines = [
      `Total monthly revenue: $${total.toFixed(2)}`,
      `Active streams: ${streams.filter(s => s.status === 'active' || s.status === 'scaling').length}`,
      '',
      'Streams:',
      ...streams.map(s => `  - ${s.name} (${s.status}): $${s.metrics.currentMonthlyRevenue.toFixed(2)}/month — ${s.metrics.trend}`),
    ];

    return lines.join('\n');
  }

  // ----------------------------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------------------------

  private buildEvaluationRationale(
    name: string,
    total: number,
    feasibility: number,
    revenuePotential: number,
    sustainability: number,
    alignment: number,
    recommendation: string
  ): string {
    return [
      `Score: ${total}/100 (Feasibility:${feasibility}/25, Revenue:${revenuePotential}/30, Sustainability:${sustainability}/25, Alignment:${alignment}/20)`,
      `Recommendation: ${recommendation.toUpperCase()}`,
      total >= MINIMUM_VIABLE_SCORE
        ? `"${name}" meets minimum threshold of ${MINIMUM_VIABLE_SCORE} for serious consideration.`
        : `"${name}" falls below minimum threshold of ${MINIMUM_VIABLE_SCORE} — not worth pursuing at this time.`,
      `Key strength: ${this.identifyKeyStrength(feasibility, revenuePotential, sustainability, alignment)}`,
    ].join('\n');
  }

  private identifyKeyStrength(
    feasibility: number,
    revenuePotential: number,
    sustainability: number,
    alignment: number
  ): string {
    const scores = [
      { name: 'Feasibility', score: feasibility, max: 25 },
      { name: 'Revenue potential', score: revenuePotential, max: 30 },
      { name: 'Sustainability', score: sustainability, max: 25 },
      { name: 'Alignment', score: alignment, max: 20 },
    ];
    const best = scores.sort((a, b) => (b.score / b.max) - (a.score / a.max))[0];
    if (!best) return 'No dimensions scored';
    return `${best.name} (${Math.round((best.score / best.max) * 100)}% of maximum)`;
  }

  private generateInitialActions(evaluation: RevenueOpportunityEvaluation): string[] {
    const categoryActions: Record<RevenueCategory, string[]> = {
      'freelance-technical': [
        'Research top-performing profiles in this niche on target platforms',
        'Create platform account and complete profile setup',
        'Build 2-3 portfolio pieces demonstrating the target skills',
        'Write 10 targeted proposals for relevant projects',
      ],
      'freelance-content': [
        'Research content services in demand on target platforms',
        'Create writing samples relevant to target niche',
        'Set up platform profile emphasizing relevant expertise',
        'Submit 5 targeted applications',
      ],
      'freelance-consulting': [
        'Define specific consulting offer with clear deliverable and pricing',
        'Build case study from past relevant work',
        'Identify 20 potential clients matching ideal profile',
        'Craft personalized outreach message',
      ],
      'digital-products-tools': [
        'Validate the problem with 5 potential users',
        'Build MVP version (minimum viable product)',
        'Create landing page with clear value proposition',
        'Submit to relevant developer communities',
      ],
      'digital-products-info': [
        'Research competing products and their price points',
        'Outline complete content structure',
        'Write first draft of core content',
        'Set up sales page on Gumroad or direct',
      ],
      'digital-products-saas': [
        'Define exact target user and their specific pain point',
        'Build minimal proof of concept',
        'Get feedback from 3-5 potential users',
        'Define pricing model',
      ],
      'content-audience': [
        'Define niche and target audience precisely',
        'Identify 20 topic ideas with search demand',
        'Publish 3 high-quality pieces to establish baseline',
        'Set up distribution channels (newsletter, social)',
      ],
      'trading-analysis': [
        'Paper trade the strategy for 30 days to validate',
        'Document strategy rules completely',
        'Set up performance tracking',
        'Research regulatory requirements',
      ],
    };

    return categoryActions[evaluation.category] ?? [
      'Research the market and target customers',
      'Define minimum viable offer',
      'Identify first 10 potential customers',
      'Create outreach strategy',
    ];
  }

  private generatePortfolioRecommendations(
    totalRevenue: number,
    activeStreams: RevenueStream[],
    underperforming: RevenueStream[]
  ): string[] {
    const recommendations: string[] = [];

    if (totalRevenue < 500) {
      recommendations.push('Priority: Get first revenue stream to $500/month before diversifying');
    } else if (totalRevenue < 2000) {
      recommendations.push('Focus on growing existing streams before launching new ones');
    } else if (activeStreams.length < 2) {
      recommendations.push('Consider adding a second revenue stream for diversification');
    }

    if (underperforming.length > 0) {
      recommendations.push(`Consider pausing or abandoning underperforming streams: ${underperforming.map(s => s.name).join(', ')}`);
    }

    const decliningStreams = activeStreams.filter(s => s.metrics.trend === 'declining');
    if (decliningStreams.length > 0) {
      recommendations.push(`Investigate declining trends in: ${decliningStreams.map(s => s.name).join(', ')}`);
    }

    const bestRPH = activeStreams.sort(
      (a, b) => b.metrics.revenuePerHourInvested - a.metrics.revenuePerHourInvested
    )[0];
    if (bestRPH && bestRPH.metrics.revenuePerHourInvested > 50) {
      recommendations.push(`Scale investment in ${bestRPH.name} — highest revenue per hour ($${bestRPH.metrics.revenuePerHourInvested.toFixed(0)}/hr)`);
    }

    return recommendations;
  }
}
