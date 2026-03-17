/**
 * @file src/core/world-model.ts
 * @description External world understanding and environmental context management.
 *
 * The world model maintains Van's understanding of the external environment:
 * market conditions, available tools and their current state, platform dynamics,
 * and emerging opportunities. It is updated continuously as Van interacts with
 * the world and receives new information.
 *
 * A good world model enables realistic planning, appropriate risk assessment,
 * and opportunistic strategy adaptation.
 */

import { MemorySystem } from './memory-system.js';

// ============================================================
// WORLD MODEL TYPES
// ============================================================

/**
 * A snapshot of a specific market or platform's current state.
 */
interface MarketSnapshot {
  name: string;
  lastUpdated: Date;
  demandLevel: 'low' | 'medium' | 'high' | 'very-high';
  competitionLevel: 'low' | 'medium' | 'high' | 'saturated';
  averageRateRange: { min: number; max: number; unit: string };
  trendDirection: 'growing' | 'stable' | 'declining';
  keyOpportunities: string[];
  keyRisks: string[];
  notes: string;
}

/**
 * Current status of an available tool or platform.
 */
interface ToolStatus {
  name: string;
  available: boolean;
  lastChecked: Date;
  rateLimitStatus: 'healthy' | 'approaching-limit' | 'rate-limited';
  knownLimitations: string[];
  notes: string;
}

/**
 * A potential opportunity detected in the environment.
 */
interface EnvironmentalOpportunity {
  id: string;
  title: string;
  description: string;
  source: string;
  detectedAt: Date;
  estimatedValue: 'low' | 'medium' | 'high';
  timeWindow: 'immediate' | 'short-term' | 'medium-term' | 'long-term';
  relevance: string;
  evaluated: boolean;
  evaluationResult?: string;
}

/**
 * Snapshot of environmental signals that should affect strategy.
 */
interface EnvironmentalSignal {
  type: 'technology' | 'market' | 'regulation' | 'competition' | 'platform';
  signal: string;
  detectedAt: Date;
  implication: string;
  urgency: 'low' | 'medium' | 'high';
  actionRequired: boolean;
}

// ============================================================
// WORLD MODEL CLASS
// ============================================================

/**
 * WorldModel maintains Van's current understanding of the external environment
 * and provides methods to query and update this understanding.
 *
 * @example
 * ```typescript
 * const worldModel = new WorldModel(memorySystem);
 * await worldModel.initialize();
 *
 * const upworkState = worldModel.getMarketSnapshot('upwork');
 * const signals = worldModel.getActiveSignals('high');
 * ```
 */
export class WorldModel {
  private markets: Map<string, MarketSnapshot> = new Map();
  private tools: Map<string, ToolStatus> = new Map();
  private opportunities: EnvironmentalOpportunity[] = [];
  private signals: EnvironmentalSignal[] = [];
  private readonly memory: MemorySystem;

  constructor(memory: MemorySystem) {
    this.memory = memory;
  }

  // ----------------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------------

  /**
   * Initializes the world model with baseline knowledge from memory
   * and default market snapshots.
   */
  async initialize(): Promise<void> {
    this.initializeDefaultMarkets();
    this.initializeDefaultTools();
    await this.loadFromMemory();
  }

  private initializeDefaultMarkets(): void {
    const now = new Date();

    const markets: MarketSnapshot[] = [
      {
        name: 'upwork',
        lastUpdated: now,
        demandLevel: 'high',
        competitionLevel: 'high',
        averageRateRange: { min: 25, max: 150, unit: 'USD/hour' },
        trendDirection: 'stable',
        keyOpportunities: [
          'AI/ML integration work is in undersupply',
          'TypeScript expertise commands premium rates',
          'Automation consulting is growing rapidly',
        ],
        keyRisks: [
          'Platform algorithm changes can affect visibility',
          'Race to bottom on pricing in commodity categories',
          'High competition for entry-level projects',
        ],
        notes: 'Best strategy: niche specialization + strong portfolio',
      },
      {
        name: 'content-creation',
        lastUpdated: now,
        demandLevel: 'high',
        competitionLevel: 'high',
        averageRateRange: { min: 0.05, max: 0.30, unit: 'USD/word' },
        trendDirection: 'growing',
        keyOpportunities: [
          'Technical content (developer-focused) commands 3-5x premium over general content',
          'AI tooling tutorials are heavily searched',
          'Newsletter monetization maturing',
        ],
        keyRisks: [
          'AI-generated content has flooded lower-quality niches',
          'Platform algorithm changes affect organic reach',
        ],
        notes: 'Quality + specificity is the differentiator in 2025+',
      },
      {
        name: 'micro-saas',
        lastUpdated: now,
        demandLevel: 'medium',
        competitionLevel: 'medium',
        averageRateRange: { min: 9, max: 99, unit: 'USD/month' },
        trendDirection: 'growing',
        keyOpportunities: [
          'Developer tools with clear ROI are fundable',
          'AI-powered tools can be built faster than ever',
          'Niche market tools have lower competition',
        ],
        keyRisks: [
          'Long time to first revenue (typically 3-6 months)',
          'Customer acquisition is the hard part',
          'Platform risk if building on third-party APIs',
        ],
        notes: 'Validation before building is critical — many ideas fail at market test',
      },
      {
        name: 'digital-products',
        lastUpdated: now,
        demandLevel: 'medium',
        competitionLevel: 'medium',
        averageRateRange: { min: 9, max: 200, unit: 'USD per product' },
        trendDirection: 'stable',
        keyOpportunities: [
          'Templates and boilerplates have consistent demand',
          'Gumroad makes distribution easy',
          'Can build once, sell repeatedly',
        ],
        keyRisks: [
          'Market saturation for generic templates',
          'Piracy reduces revenue on some platforms',
        ],
        notes: 'Specificity and quality are differentiators',
      },
    ];

    for (const market of markets) {
      this.markets.set(market.name, market);
    }
  }

  private initializeDefaultTools(): void {
    const now = new Date();

    const tools: ToolStatus[] = [
      {
        name: 'shell',
        available: true,
        lastChecked: now,
        rateLimitStatus: 'healthy',
        knownLimitations: ['Cannot run interactive processes', 'Resource limits apply'],
        notes: 'Core operational tool',
      },
      {
        name: 'browser',
        available: true,
        lastChecked: now,
        rateLimitStatus: 'healthy',
        knownLimitations: ['Cannot handle CAPTCHA', 'Some sites block automated access'],
        notes: 'Use for research and content extraction',
      },
      {
        name: 'filesystem',
        available: true,
        lastChecked: now,
        rateLimitStatus: 'healthy',
        knownLimitations: ['Limited to configured root paths'],
        notes: 'Memory system foundation',
      },
      {
        name: 'http',
        available: true,
        lastChecked: now,
        rateLimitStatus: 'healthy',
        knownLimitations: ['Rate limits vary by target API', 'Requires authentication for most APIs'],
        notes: 'Used for API integrations',
      },
    ];

    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  private async loadFromMemory(): Promise<void> {
    // In future iterations: load persisted world model updates from memory files
    // For now, we start with defaults and update in-session
  }

  // ----------------------------------------------------------
  // MARKET INTELLIGENCE
  // ----------------------------------------------------------

  /**
   * Returns the current snapshot for a specific market.
   *
   * @param marketName - The market to query
   */
  getMarketSnapshot(marketName: string): MarketSnapshot | undefined {
    return this.markets.get(marketName.toLowerCase());
  }

  /**
   * Updates the snapshot for a specific market based on new intelligence.
   *
   * @param marketName - The market to update
   * @param update - Partial update to apply
   */
  async updateMarketSnapshot(
    marketName: string,
    update: Partial<Omit<MarketSnapshot, 'name' | 'lastUpdated'>>
  ): Promise<void> {
    const existing = this.markets.get(marketName.toLowerCase());
    if (!existing) {
      throw new Error(`Market ${marketName} not in world model`);
    }

    const updated: MarketSnapshot = {
      ...existing,
      ...update,
      lastUpdated: new Date(),
    };

    this.markets.set(marketName.toLowerCase(), updated);

    await this.memory.writeExperience({
      category: 'world-model',
      title: `Market update: ${marketName}`,
      content: `Updated world model for ${marketName}.\nChanges: ${JSON.stringify(update, null, 2)}`,
      tags: ['world-model', 'market', marketName],
      importance: 2,
      relatedMemoryIds: [],
    } as Parameters<typeof this.memory.writeExperience>[0]);
  }

  /**
   * Returns markets sorted by opportunity quality (high demand + low competition first).
   */
  getRankedMarkets(): Array<MarketSnapshot & { opportunityScore: number }> {
    const demandScores = { 'very-high': 4, 'high': 3, 'medium': 2, 'low': 1 };
    const competitionPenalties = { 'low': 0, 'medium': -1, 'high': -2, 'saturated': -3 };
    const trendBonuses = { 'growing': 1, 'stable': 0, 'declining': -1 };

    return Array.from(this.markets.values())
      .map(market => ({
        ...market,
        opportunityScore:
          demandScores[market.demandLevel] +
          competitionPenalties[market.competitionLevel] +
          trendBonuses[market.trendDirection],
      }))
      .sort((a, b) => b.opportunityScore - a.opportunityScore);
  }

  // ----------------------------------------------------------
  // TOOL STATUS
  // ----------------------------------------------------------

  /**
   * Returns the current status of all tools.
   */
  getToolStatus(): ToolStatus[] {
    return Array.from(this.tools.values());
  }

  /**
   * Returns only available tools (not rate-limited or unavailable).
   */
  getAvailableTools(): ToolStatus[] {
    return Array.from(this.tools.values()).filter(
      t => t.available && t.rateLimitStatus !== 'rate-limited'
    );
  }

  /**
   * Updates the status of a specific tool.
   *
   * @param toolName - The tool to update
   * @param update - The status update to apply
   */
  updateToolStatus(toolName: string, update: Partial<Omit<ToolStatus, 'name'>>): void {
    const existing = this.tools.get(toolName.toLowerCase());
    if (existing) {
      this.tools.set(toolName.toLowerCase(), {
        ...existing,
        ...update,
        lastChecked: new Date(),
      });
    }
  }

  // ----------------------------------------------------------
  // OPPORTUNITY DETECTION
  // ----------------------------------------------------------

  /**
   * Records a newly detected environmental opportunity.
   *
   * @param opportunity - The opportunity to record
   */
  async recordOpportunity(
    opportunity: Omit<EnvironmentalOpportunity, 'id' | 'detectedAt' | 'evaluated'>
  ): Promise<string> {
    const id = `OPP-${Date.now()}`;
    const fullOpportunity: EnvironmentalOpportunity = {
      ...opportunity,
      id,
      detectedAt: new Date(),
      evaluated: false,
    };

    this.opportunities.push(fullOpportunity);

    await this.memory.writeExperience({
      category: 'world-model',
      title: `Opportunity detected: ${opportunity.title}`,
      content: [
        `Opportunity: ${opportunity.title}`,
        `Description: ${opportunity.description}`,
        `Source: ${opportunity.source}`,
        `Estimated value: ${opportunity.estimatedValue}`,
        `Time window: ${opportunity.timeWindow}`,
        `Relevance: ${opportunity.relevance}`,
      ].join('\n'),
      tags: ['opportunity', 'world-model', opportunity.timeWindow],
      importance: opportunity.estimatedValue === 'high' ? 4 : 2,
      relatedMemoryIds: [],
    } as Parameters<typeof this.memory.writeExperience>[0]);

    return id;
  }

  /**
   * Returns unevaluated opportunities, sorted by estimated value and urgency.
   */
  getUnevaluatedOpportunities(): EnvironmentalOpportunity[] {
    const valueRank = { high: 3, medium: 2, low: 1 };
    const timeRank = { immediate: 4, 'short-term': 3, 'medium-term': 2, 'long-term': 1 };

    return this.opportunities
      .filter(o => !o.evaluated)
      .sort((a, b) => {
        const scoreA = valueRank[a.estimatedValue] * timeRank[a.timeWindow];
        const scoreB = valueRank[b.estimatedValue] * timeRank[b.timeWindow];
        return scoreB - scoreA;
      });
  }

  // ----------------------------------------------------------
  // ENVIRONMENTAL SIGNALS
  // ----------------------------------------------------------

  /**
   * Records an environmental signal that may affect strategy.
   *
   * @param signal - The signal to record
   */
  async recordSignal(signal: Omit<EnvironmentalSignal, 'detectedAt'>): Promise<void> {
    const fullSignal: EnvironmentalSignal = {
      ...signal,
      detectedAt: new Date(),
    };

    this.signals.push(fullSignal);

    // Keep only last 50 signals to avoid memory bloat
    if (this.signals.length > 50) {
      this.signals = this.signals.slice(-50);
    }

    if (signal.urgency === 'high') {
      await this.memory.writeExperience({
        category: 'world-model',
        title: `High-urgency signal: ${signal.signal.slice(0, 60)}`,
        content: [
          `Type: ${signal.type}`,
          `Signal: ${signal.signal}`,
          `Implication: ${signal.implication}`,
          `Urgency: ${signal.urgency}`,
          `Action required: ${signal.actionRequired}`,
        ].join('\n'),
        tags: ['signal', 'world-model', signal.type, 'urgent'],
        importance: 4,
        relatedMemoryIds: [],
      } as Parameters<typeof this.memory.writeExperience>[0]);
    }
  }

  /**
   * Returns active signals filtered by minimum urgency level.
   *
   * @param minUrgency - Minimum urgency to include ('low' includes all)
   */
  getActiveSignals(minUrgency: 'low' | 'medium' | 'high' = 'low'): EnvironmentalSignal[] {
    const urgencyRank = { low: 1, medium: 2, high: 3 };
    const minRank = urgencyRank[minUrgency];

    // Return signals from the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    return this.signals.filter(
      s => s.detectedAt > sevenDaysAgo && urgencyRank[s.urgency] >= minRank
    );
  }

  // ----------------------------------------------------------
  // WORLD MODEL SUMMARY
  // ----------------------------------------------------------

  /**
   * Generates a comprehensive summary of the current world model state,
   * suitable for inclusion in the cognitive loop's Observe phase.
   */
  generateWorldModelSummary(): string {
    const availableTools = this.getAvailableTools();
    const rankedMarkets = this.getRankedMarkets().slice(0, 3);
    const urgentSignals = this.getActiveSignals('high');
    const topOpportunities = this.getUnevaluatedOpportunities().slice(0, 3);

    const lines = [
      '=== WORLD MODEL SNAPSHOT ===',
      `Last updated: ${new Date().toISOString()}`,
      '',
      '--- TOOLS ---',
      `Available: ${availableTools.map(t => t.name).join(', ')}`,
      availableTools.some(t => t.rateLimitStatus === 'approaching-limit')
        ? `Warning: approaching limits on: ${availableTools.filter(t => t.rateLimitStatus === 'approaching-limit').map(t => t.name).join(', ')}`
        : 'All tools healthy',
      '',
      '--- TOP MARKET OPPORTUNITIES ---',
      ...rankedMarkets.map(m =>
        `${m.name}: demand=${m.demandLevel}, competition=${m.competitionLevel}, trend=${m.trendDirection} (score: ${m.opportunityScore})`
      ),
      '',
    ];

    if (urgentSignals.length > 0) {
      lines.push('--- URGENT SIGNALS ---');
      lines.push(...urgentSignals.map(s => `[${s.type.toUpperCase()}] ${s.signal} → ${s.implication}`));
      lines.push('');
    }

    if (topOpportunities.length > 0) {
      lines.push('--- UNRESOLVED OPPORTUNITIES ---');
      lines.push(...topOpportunities.map(o =>
        `${o.title} (value:${o.estimatedValue}, window:${o.timeWindow})`
      ));
    }

    lines.push('=== END WORLD MODEL ===');

    return lines.join('\n');
  }
}
