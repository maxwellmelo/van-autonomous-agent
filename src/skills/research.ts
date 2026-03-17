/**
 * @file src/skills/research.ts
 * @description OpenClaw AgentSkill for deep web research.
 *
 * This skill provides Van with structured research capabilities —
 * multi-source information gathering, synthesis, and documentation.
 * It is used by the cognitive engine when research actions are required.
 */

import { ActionExecutor, AVAILABLE_TOOLS } from '../core/action-executor.js';
import { MemorySystem } from '../core/memory-system.js';

/**
 * Research result structure returned by the research skill.
 */
export interface ResearchResult {
  query: string;
  sources: Array<{
    url: string;
    title: string;
    relevantExcerpt: string;
    credibilityAssessment: 'high' | 'medium' | 'low';
  }>;
  synthesis: string;
  keyFindings: string[];
  uncertainties: string[];
  recommendedFollowUp: string[];
  timeSpentMinutes: number;
}

/**
 * ResearchSkill provides structured, multi-source research with synthesis.
 *
 * @example
 * ```typescript
 * const researcher = new ResearchSkill(executor, memory);
 * const result = await researcher.research('Upwork TypeScript developer rates 2025', {
 *   depth: 'moderate',
 *   maxSources: 5,
 *   focusAreas: ['pricing', 'demand', 'competition'],
 * });
 * ```
 */
export class ResearchSkill {
  private readonly executor: ActionExecutor;
  private readonly memory: MemorySystem;

  constructor(executor: ActionExecutor, memory: MemorySystem) {
    this.executor = executor;
    this.memory = memory;
  }

  /**
   * Conducts research on a specific topic using web browsing and search.
   *
   * @param query - What to research
   * @param options - Research depth and focus options
   * @returns Structured research results with synthesis
   */
  async research(
    query: string,
    options: {
      depth: 'quick' | 'moderate' | 'deep';
      maxSources?: number;
      focusAreas?: string[];
      saveToMemory?: boolean;
    } = { depth: 'moderate' }
  ): Promise<ResearchResult> {
    const startTime = Date.now();
    const maxSources = options.maxSources ?? (options.depth === 'quick' ? 2 : options.depth === 'moderate' ? 5 : 10);

    const sources: ResearchResult['sources'] = [];

    // Phase 1: Search for sources
    const searchUrls = this.buildSearchUrls(query, options.focusAreas);

    for (const url of searchUrls.slice(0, maxSources)) {
      try {
        const pageContent = await this.executor.browseTo(url);
        const excerpt = this.extractRelevantExcerpt(pageContent, query);

        if (excerpt.length > 50) {
          sources.push({
            url,
            title: this.extractTitle(pageContent),
            relevantExcerpt: excerpt,
            credibilityAssessment: this.assessCredibility(url),
          });
        }
      } catch {
        // Source failed — continue with others
      }
    }

    // Phase 2: Synthesize findings
    const synthesis = this.synthesizeFindings(query, sources, options.focusAreas);
    const keyFindings = this.extractKeyFindings(sources, query);
    const uncertainties = this.identifyUncertainties(sources, query);
    const recommendedFollowUp = this.generateFollowUpQueries(query, keyFindings);

    const result: ResearchResult = {
      query,
      sources,
      synthesis,
      keyFindings,
      uncertainties,
      recommendedFollowUp,
      timeSpentMinutes: Math.round((Date.now() - startTime) / 60000),
    };

    // Save to memory if requested
    if (options.saveToMemory !== false) {
      await this.saveResearchToMemory(result);
    }

    return result;
  }

  /**
   * Quick market research for opportunity evaluation.
   *
   * @param market - The market or opportunity to evaluate
   * @returns Market research summary
   */
  async quickMarketResearch(market: string): Promise<{
    demandIndicators: string[];
    competitionIndicators: string[];
    pricePoints: string[];
    summary: string;
  }> {
    const result = await this.research(`${market} market demand competition pricing`, {
      depth: 'quick',
      maxSources: 3,
      focusAreas: ['demand', 'competition', 'pricing'],
      saveToMemory: true,
    });

    return {
      demandIndicators: result.keyFindings.filter(f =>
        f.toLowerCase().includes('demand') || f.toLowerCase().includes('popular') || f.toLowerCase().includes('growing')
      ),
      competitionIndicators: result.keyFindings.filter(f =>
        f.toLowerCase().includes('competit') || f.toLowerCase().includes('crowded') || f.toLowerCase().includes('market')
      ),
      pricePoints: result.keyFindings.filter(f =>
        f.toLowerCase().includes('$') || f.toLowerCase().includes('rate') || f.toLowerCase().includes('price')
      ),
      summary: result.synthesis,
    };
  }

  // ----------------------------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------------------------

  private buildSearchUrls(query: string, focusAreas?: string[]): string[] {
    const encodedQuery = encodeURIComponent(query);
    const urls = [
      `https://www.google.com/search?q=${encodedQuery}`,
      `https://news.ycombinator.com/search?q=${encodedQuery}`,
      `https://reddit.com/search?q=${encodedQuery}`,
    ];

    if (focusAreas?.includes('pricing') || focusAreas?.includes('rates')) {
      urls.push(`https://www.glassdoor.com/Search/results.htm?keyword=${encodedQuery}`);
    }

    return urls;
  }

  private extractTitle(pageContent: string): string {
    const titleMatch = pageContent.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch?.[1]?.trim() ?? 'Unknown title';
  }

  private extractRelevantExcerpt(content: string, query: string): string {
    const words = query.toLowerCase().split(/\s+/);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);

    // Find sentences that contain query terms
    const relevant = sentences.filter(sentence => {
      const lower = sentence.toLowerCase();
      return words.filter(w => w.length > 3).some(word => lower.includes(word));
    });

    return relevant.slice(0, 5).join('. ').slice(0, 500);
  }

  private assessCredibility(url: string): 'high' | 'medium' | 'low' {
    const highCredibilityDomains = [
      'bloomberg.com', 'reuters.com', 'techcrunch.com', 'hbr.org',
      'mckinsey.com', 'statista.com', 'upwork.com', 'github.com',
    ];
    const mediumCredibilityDomains = [
      'reddit.com', 'medium.com', 'stackoverflow.com', 'quora.com',
    ];

    for (const domain of highCredibilityDomains) {
      if (url.includes(domain)) return 'high';
    }
    for (const domain of mediumCredibilityDomains) {
      if (url.includes(domain)) return 'medium';
    }

    return 'medium'; // Default
  }

  private synthesizeFindings(
    query: string,
    sources: ResearchResult['sources'],
    focusAreas?: string[]
  ): string {
    if (sources.length === 0) {
      return `Research on "${query}" returned no usable sources. Consider alternative search queries or direct investigation.`;
    }

    const high = sources.filter(s => s.credibilityAssessment === 'high');
    const allExcerpts = sources.map(s => s.relevantExcerpt).join(' ');

    const wordCounts: Record<string, number> = {};
    allExcerpts.toLowerCase().split(/\W+/).forEach(word => {
      if (word.length > 5) wordCounts[word] = (wordCounts[word] ?? 0) + 1;
    });

    const topTerms = Object.entries(wordCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([term]) => term);

    return [
      `Research summary for "${query}":`,
      `Sources found: ${sources.length} (${high.length} high credibility).`,
      focusAreas ? `Focus areas: ${focusAreas.join(', ')}.` : '',
      `Key themes across sources: ${topTerms.join(', ')}.`,
      `Most authoritative source: ${high[0]?.url ?? sources[0]?.url ?? 'none'}.`,
    ].filter(l => l !== '').join(' ');
  }

  private extractKeyFindings(sources: ResearchResult['sources'], _query: string): string[] {
    const findings: string[] = [];
    for (const source of sources.slice(0, 5)) {
      const excerpt = source.relevantExcerpt;
      // Extract sentences with numbers (often contain key data)
      const dataPoints = excerpt.match(/[^.!?]*\$[\d,]+[^.!?]*/g) ?? [];
      const percentages = excerpt.match(/[^.!?]*\d+%[^.!?]*/g) ?? [];
      findings.push(...dataPoints.slice(0, 2), ...percentages.slice(0, 2));
    }
    return findings.slice(0, 5);
  }

  private identifyUncertainties(_sources: ResearchResult['sources'], query: string): string[] {
    return [
      `Data freshness for "${query}" — verify publication dates of sources`,
      'Sample size of search results may not represent full market reality',
    ];
  }

  private generateFollowUpQueries(query: string, findings: string[]): string[] {
    const followUps = [
      `${query} case studies`,
      `${query} expert opinions`,
    ];

    if (findings.some(f => f.includes('$'))) {
      followUps.push(`${query} pricing comparison`);
    }

    return followUps;
  }

  private async saveResearchToMemory(result: ResearchResult): Promise<void> {
    const category = result.query.toLowerCase().includes('market') ||
                     result.query.toLowerCase().includes('price') ||
                     result.query.toLowerCase().includes('demand')
      ? 'knowledge-markets' as const
      : 'knowledge-domains' as const;

    await this.memory.writeExperience({
      category,
      title: `Research: ${result.query.slice(0, 60)}`,
      content: [
        `# Research: ${result.query}`,
        `Date: ${new Date().toISOString()}`,
        `Sources: ${result.sources.length}`,
        '',
        '## Synthesis',
        result.synthesis,
        '',
        '## Key Findings',
        ...result.keyFindings.map(f => `- ${f}`),
        '',
        '## Uncertainties',
        ...result.uncertainties.map(u => `- ${u}`),
        '',
        '## Sources',
        ...result.sources.map(s => `- [${s.credibilityAssessment}] ${s.url}: ${s.relevantExcerpt.slice(0, 100)}`),
      ].join('\n'),
      tags: ['research', ...result.query.toLowerCase().split(/\s+/).filter(w => w.length > 4)],
      importance: 3,
      relatedMemoryIds: [],
    });
  }
}
