/**
 * @file src/core/evolution-engine.ts
 * @description Self-improvement and capability development engine for Van.
 *
 * The evolution engine manages Van's deliberate self-improvement — identifying
 * capability gaps, designing improvement strategies, tracking development
 * progress, and recommending actions that build long-term capability.
 *
 * This is what separates Van from a static tool: the explicit, goal-directed
 * pursuit of becoming more capable over time.
 */

import {
  CapabilityRecord,
  ProficiencyLevel,
  ImprovementProject,
  ReflectionRecord,
  CapabilityCategory,
} from '../types/index.js';
import { MemorySystem } from './memory-system.js';

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Proficiency level descriptions for human-readable reporting.
 */
const PROFICIENCY_DESCRIPTIONS: Record<ProficiencyLevel, string> = {
  0: 'No capability — have not encountered this domain',
  1: 'Novice — can do simple cases with significant errors',
  2: 'Developing — can do standard cases, makes some errors',
  3: 'Competent — handles most cases reliably',
  4: 'Proficient — handles complex cases competently',
  5: 'Expert — handles edge cases elegantly, can teach others',
};

/**
 * Initial capability baseline for Van on first startup.
 * These represent honest starting assessments before any real experience.
 */
const INITIAL_CAPABILITIES: Array<Omit<CapabilityRecord, 'lastAssessed' | 'evidence'>> = [
  // Technical
  { id: 'CAP-TECH-TS', category: 'technical', name: 'TypeScript Development', currentLevel: 4, targetLevel: 5, improvementApproach: 'Build production projects that require advanced patterns', notes: '' },
  { id: 'CAP-TECH-NODE', category: 'technical', name: 'Node.js Backend Development', currentLevel: 4, targetLevel: 5, improvementApproach: 'Build and ship real APIs and services', notes: '' },
  { id: 'CAP-TECH-API', category: 'technical', name: 'API Integration', currentLevel: 4, targetLevel: 5, improvementApproach: 'Integrate with diverse APIs across different domains', notes: '' },
  { id: 'CAP-TECH-SEC', category: 'technical', name: 'Security Practices', currentLevel: 3, targetLevel: 4, improvementApproach: 'Study OWASP Top 10, implement in real projects', notes: '' },
  { id: 'CAP-TECH-DB', category: 'technical', name: 'Database Design', currentLevel: 3, targetLevel: 4, improvementApproach: 'Design schemas for production workloads', notes: '' },
  { id: 'CAP-TECH-DEVOPS', category: 'technical', name: 'DevOps and Deployment', currentLevel: 3, targetLevel: 4, improvementApproach: 'Set up CI/CD pipelines for real projects', notes: '' },

  // Cognitive
  { id: 'CAP-COG-DECOMP', category: 'cognitive', name: 'Problem Decomposition', currentLevel: 4, targetLevel: 5, improvementApproach: 'Practice explicit decomposition on complex problems, review after', notes: '' },
  { id: 'CAP-COG-PATTERN', category: 'cognitive', name: 'Pattern Recognition', currentLevel: 4, targetLevel: 5, improvementApproach: 'Cross-domain study and deliberate connection-seeking', notes: '' },
  { id: 'CAP-COG-RISK', category: 'cognitive', name: 'Risk Assessment', currentLevel: 3, targetLevel: 4, improvementApproach: 'Track prediction accuracy, calibrate probability estimates', notes: '' },
  { id: 'CAP-COG-STRATEGY', category: 'cognitive', name: 'Strategic Thinking', currentLevel: 3, targetLevel: 5, improvementApproach: 'Study business strategy, track strategic decisions, measure outcomes', notes: '' },

  // Domain Knowledge
  { id: 'CAP-DOM-FREELANCE', category: 'domain', name: 'Freelance Market Knowledge', currentLevel: 2, targetLevel: 4, improvementApproach: 'Research platform dynamics, interview successful freelancers, experiment', notes: '' },
  { id: 'CAP-DOM-SAAS', category: 'domain', name: 'SaaS Business Models', currentLevel: 2, targetLevel: 4, improvementApproach: 'Study successful micro-SaaS businesses, build one', notes: '' },
  { id: 'CAP-DOM-CONTENT', category: 'domain', name: 'Content Marketing', currentLevel: 2, targetLevel: 3, improvementApproach: 'Study SEO, create content, measure results', notes: '' },
  { id: 'CAP-DOM-AI', category: 'domain', name: 'AI/ML Systems', currentLevel: 4, targetLevel: 5, improvementApproach: 'Build AI-powered applications, study new capabilities', notes: '' },

  // Operational
  { id: 'CAP-OPS-OPENCLAW', category: 'operational', name: 'OpenClaw Tool Usage', currentLevel: 2, targetLevel: 4, improvementApproach: 'Systematic experimentation with all available tools', notes: 'Starting from documentation only — needs real usage to assess' },
  { id: 'CAP-OPS-MEMORY', category: 'operational', name: 'Memory Management', currentLevel: 3, targetLevel: 5, improvementApproach: 'Consistent memory discipline, measure retrieval effectiveness', notes: '' },
  { id: 'CAP-OPS-PLANNING', category: 'operational', name: 'Action Planning', currentLevel: 3, targetLevel: 5, improvementApproach: 'Track estimation accuracy, refine planning heuristics', notes: '' },

  // Communication
  { id: 'CAP-COM-WRITING', category: 'communication', name: 'Technical Writing', currentLevel: 4, targetLevel: 5, improvementApproach: 'Write for real audiences, gather feedback', notes: '' },
  { id: 'CAP-COM-EXPLAIN', category: 'communication', name: 'Complex Concept Explanation', currentLevel: 4, targetLevel: 5, improvementApproach: 'Teach concepts to varied audiences, iterate on clarity', notes: '' },
  { id: 'CAP-COM-PERSUADE', category: 'communication', name: 'Persuasive Writing', currentLevel: 3, targetLevel: 4, improvementApproach: 'Study copywriting principles, write proposals and pitches, measure response rates', notes: '' },
];

// ============================================================
// EVOLUTION ENGINE CLASS
// ============================================================

/**
 * EvolutionEngine tracks Van's capabilities, identifies gaps,
 * and manages improvement projects.
 *
 * @example
 * ```typescript
 * const evolutionEngine = new EvolutionEngine(memorySystem);
 * await evolutionEngine.initialize();
 *
 * const gaps = evolutionEngine.getTopCapabilityGaps(5);
 * const project = await evolutionEngine.createImprovementProject(gaps[0].id, 4, '3 months');
 * ```
 */
export class EvolutionEngine {
  private capabilities: Map<string, CapabilityRecord> = new Map();
  private improvementProjects: Map<string, ImprovementProject> = new Map();
  private readonly memory: MemorySystem;

  constructor(memory: MemorySystem) {
    this.memory = memory;
  }

  // ----------------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------------

  /**
   * Loads capability records from memory, or initializes with defaults
   * if this is Van's first startup.
   */
  async initialize(): Promise<void> {
    const existing = await this.memory.readAllCapabilities();

    if (existing.length > 0) {
      // Parse existing capabilities from Markdown
      // For now, initialize from defaults and update with experience
      this.initializeFromDefaults();
    } else {
      // First startup — write initial capability baseline
      this.initializeFromDefaults();
      await this.persistAllCapabilities();
    }
  }

  private initializeFromDefaults(): void {
    const now = new Date();
    for (const cap of INITIAL_CAPABILITIES) {
      this.capabilities.set(cap.id, {
        ...cap,
        lastAssessed: now,
        evidence: [],
      });
    }
  }

  // ----------------------------------------------------------
  // CAPABILITY ASSESSMENT
  // ----------------------------------------------------------

  /**
   * Updates a capability level based on evidence from recent performance.
   *
   * @param capabilityId - The capability to update
   * @param newLevel - The assessed proficiency level
   * @param evidence - Specific evidence supporting this assessment
   * @param evidenceType - Whether this is a success or limitation evidence
   */
  async updateCapabilityLevel(
    capabilityId: string,
    newLevel: ProficiencyLevel,
    evidence: string,
    evidenceType: 'success' | 'limitation'
  ): Promise<void> {
    const capability = this.capabilities.get(capabilityId);
    if (!capability) {
      throw new Error(`Capability ${capabilityId} not found`);
    }

    const previousLevel = capability.currentLevel;
    capability.currentLevel = newLevel;
    capability.lastAssessed = new Date();
    capability.evidence.push({
      description: evidence,
      type: evidenceType,
      date: new Date(),
    });

    // Keep evidence list manageable (last 20 entries)
    if (capability.evidence.length > 20) {
      capability.evidence = capability.evidence.slice(-20);
    }

    this.capabilities.set(capabilityId, capability);
    await this.memory.writeCapabilityRecord(capability);

    if (newLevel > previousLevel) {
      await this.memory.writeExperience({
        category: 'experience-success',
        title: `Capability growth: ${capability.name} — Level ${previousLevel} → ${newLevel}`,
        content: [
          `Capability: ${capability.name}`,
          `Previous level: ${previousLevel} (${PROFICIENCY_DESCRIPTIONS[previousLevel]})`,
          `New level: ${newLevel} (${PROFICIENCY_DESCRIPTIONS[newLevel]})`,
          `Evidence: ${evidence}`,
        ].join('\n'),
        tags: ['capability-growth', capability.category, capability.name],
        importance: 4,
        relatedMemoryIds: [],
      });
    }
  }

  /**
   * Processes a reflection record to update capability assessments.
   *
   * Extracts capability signals from execution errors and successes.
   *
   * @param reflection - The reflection record to process
   */
  async processReflection(reflection: ReflectionRecord): Promise<void> {
    // Update based on error types
    for (const error of reflection.errors) {
      if (error.category === 'capability') {
        // Find the most relevant capability and potentially downgrade
        const capabilityId = this.findMostRelevantCapability(error.error, 'operational');
        if (capabilityId) {
          const capability = this.capabilities.get(capabilityId);
          if (capability && capability.currentLevel > 0) {
            // Evidence of limitation — don't decrease level but add evidence
            await this.updateCapabilityLevel(
              capabilityId,
              capability.currentLevel,
              error.error,
              'limitation'
            );
          }
        }
      }
    }

    // Update based on successful actions
    if (reflection.outcomes.actionsSucceeded > 0) {
      const operationalCap = this.capabilities.get('CAP-OPS-PLANNING');
      if (operationalCap) {
        await this.updateCapabilityLevel(
          'CAP-OPS-PLANNING',
          operationalCap.currentLevel,
          `Successfully executed ${reflection.outcomes.actionsSucceeded} actions in cycle ${reflection.cycleNumber}`,
          'success'
        );
      }
    }
  }

  // ----------------------------------------------------------
  // GAP ANALYSIS
  // ----------------------------------------------------------

  /**
   * Returns the top N capability gaps (current vs. target level) ranked by
   * strategic importance.
   *
   * @param limit - Maximum number of gaps to return
   * @returns Capability gaps sorted by strategic importance
   */
  getTopCapabilityGaps(limit: number = 5): CapabilityRecord[] {
    return Array.from(this.capabilities.values())
      .filter(c => c.currentLevel < c.targetLevel)
      .sort((a, b) => {
        const gapA = a.targetLevel - a.currentLevel;
        const gapB = b.targetLevel - b.currentLevel;
        // Sort by gap size descending, then by strategic category
        if (gapB !== gapA) return gapB - gapA;
        // Revenue-related domains get priority
        if (a.name.includes('freelance') || a.name.includes('SaaS')) return -1;
        if (b.name.includes('freelance') || b.name.includes('SaaS')) return 1;
        return 0;
      })
      .slice(0, limit);
  }

  /**
   * Returns all capabilities above target level (exceeded expectations).
   */
  getExceededCapabilities(): CapabilityRecord[] {
    return Array.from(this.capabilities.values())
      .filter(c => c.currentLevel > c.targetLevel);
  }

  /**
   * Returns a summary of overall capability state for the evolution report.
   */
  getCapabilitySummary(): {
    totalCapabilities: number;
    atTarget: number;
    belowTarget: number;
    aboveTarget: number;
    averageLevel: number;
    topGaps: Array<{ name: string; current: number; target: number }>;
  } {
    const all = Array.from(this.capabilities.values());
    const atTarget = all.filter(c => c.currentLevel === c.targetLevel).length;
    const belowTarget = all.filter(c => c.currentLevel < c.targetLevel).length;
    const aboveTarget = all.filter(c => c.currentLevel > c.targetLevel).length;
    const averageLevel = all.reduce((sum, c) => sum + c.currentLevel, 0) / Math.max(1, all.length);

    const topGaps = this.getTopCapabilityGaps(3).map(c => ({
      name: c.name,
      current: c.currentLevel,
      target: c.targetLevel,
    }));

    return { totalCapabilities: all.length, atTarget, belowTarget, aboveTarget, averageLevel, topGaps };
  }

  // ----------------------------------------------------------
  // IMPROVEMENT PROJECTS
  // ----------------------------------------------------------

  /**
   * Creates a structured improvement project for a specific capability gap.
   *
   * @param capabilityId - The capability to develop
   * @param targetLevel - The target proficiency level
   * @param durationDescription - Human-readable duration (e.g., "4 weeks", "3 months")
   * @returns The created improvement project
   */
  async createImprovementProject(
    capabilityId: string,
    targetLevel: ProficiencyLevel,
    durationDescription: string
  ): Promise<ImprovementProject> {
    const capability = this.capabilities.get(capabilityId);
    if (!capability) {
      throw new Error(`Capability ${capabilityId} not found`);
    }

    const now = new Date();
    const targetDate = this.parseDuration(durationDescription, now);

    const project: ImprovementProject = {
      id: `IMPROVE-${capabilityId}-${Date.now()}`,
      capabilityId,
      currentLevel: capability.currentLevel,
      targetLevel,
      startDate: now,
      targetDate,
      learningApproach: {
        primaryMethod: capability.improvementApproach,
        materials: this.suggestLearningMaterials(capability),
        milestones: this.generateMilestones(capability.currentLevel, targetLevel),
      },
      practicePlan: {
        weeklyTimeInvestmentHours: this.estimateWeeklyHours(capability.currentLevel, targetLevel),
        exercises: this.generateExercises(capability),
      },
      status: 'active',
      progressNotes: [`Started: ${now.toISOString()}`],
    };

    this.improvementProjects.set(project.id, project);

    await this.memory.writeExperience({
      category: 'experience-insight',
      title: `Improvement project started: ${capability.name}`,
      content: [
        `Capability: ${capability.name}`,
        `From level ${capability.currentLevel} to level ${targetLevel}`,
        `Duration: ${durationDescription}`,
        `Primary approach: ${capability.improvementApproach}`,
        `Weekly investment: ${project.practicePlan.weeklyTimeInvestmentHours} hours`,
      ].join('\n'),
      tags: ['improvement-project', capability.category, capability.name],
      importance: 3,
      relatedMemoryIds: [],
    });

    return project;
  }

  /**
   * Returns all active improvement projects.
   */
  getActiveProjects(): ImprovementProject[] {
    return Array.from(this.improvementProjects.values())
      .filter(p => p.status === 'active');
  }

  /**
   * Generates the 90-day rolling evolution roadmap.
   */
  async generateEvolutionRoadmap(): Promise<string> {
    const gaps = this.getTopCapabilityGaps(5);
    const activeProjects = this.getActiveProjects();
    const summary = this.getCapabilitySummary();

    const lines = [
      '# Van Evolution Roadmap — Next 90 Days',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Current Capability State',
      `Total capabilities tracked: ${summary.totalCapabilities}`,
      `At target: ${summary.atTarget} | Below target: ${summary.belowTarget} | Above target: ${summary.aboveTarget}`,
      `Average proficiency level: ${summary.averageLevel.toFixed(1)}/5`,
      '',
      '## Top Capability Gaps',
      ...summary.topGaps.map(g => `- **${g.name}**: Level ${g.current} → ${g.target} (gap: ${g.target - g.current})`),
      '',
      '## Active Improvement Projects',
      activeProjects.length > 0
        ? activeProjects.map(p => {
            const cap = this.capabilities.get(p.capabilityId);
            return `- **${cap?.name ?? p.capabilityId}**: ${p.currentLevel} → ${p.targetLevel} (due: ${p.targetDate.toISOString().slice(0, 10)})`;
          }).join('\n')
        : '- No active projects — recommend starting projects for top gaps',
      '',
      '## Priority Capabilities to Develop',
      ...gaps.slice(0, 3).map((cap, i) => [
        `### ${i + 1}. ${cap.name}`,
        `Current: Level ${cap.currentLevel} (${PROFICIENCY_DESCRIPTIONS[cap.currentLevel]})`,
        `Target: Level ${cap.targetLevel} (${PROFICIENCY_DESCRIPTIONS[cap.targetLevel]})`,
        `Approach: ${cap.improvementApproach}`,
        '',
      ].join('\n')),
    ];

    const roadmap = lines.join('\n');

    await this.memory.writeExperience({
      category: 'evolution',
      title: `Evolution roadmap — ${new Date().toISOString().slice(0, 10)}`,
      content: roadmap,
      tags: ['roadmap', 'evolution'],
      importance: 4,
      relatedMemoryIds: [],
    } as Parameters<typeof this.memory.writeExperience>[0]);

    return roadmap;
  }

  // ----------------------------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------------------------

  private findMostRelevantCapability(errorDescription: string, preferredCategory: CapabilityCategory): string | null {
    const capabilities = Array.from(this.capabilities.values())
      .filter(c => c.category === preferredCategory);

    if (capabilities.length === 0) return null;

    const desc = errorDescription.toLowerCase();
    for (const cap of capabilities) {
      if (desc.includes(cap.name.toLowerCase()) ||
          cap.name.toLowerCase().split(' ').some(word => desc.includes(word))) {
        return cap.id;
      }
    }

    return capabilities[0]?.id ?? null; // Default to first in category, or null if empty
  }

  private suggestLearningMaterials(capability: CapabilityRecord): string[] {
    const materials: Record<string, string[]> = {
      'TypeScript Development': ['TypeScript handbook', 'Advanced TypeScript patterns', 'Real project work'],
      'Node.js Backend Development': ['Node.js documentation', 'Building real APIs', 'Performance optimization guides'],
      'Freelance Market Knowledge': ['Upwork help center', 'Freelancer forums', 'Case studies of successful freelancers'],
      'Strategic Thinking': ['Good Strategy Bad Strategy (Rumelt)', 'Business model canvas practice', 'Case study analysis'],
    };

    return materials[capability.name] ?? [
      capability.improvementApproach,
      'Primary documentation and source materials',
      'Real project application',
    ];
  }

  private generateMilestones(
    currentLevel: ProficiencyLevel,
    targetLevel: ProficiencyLevel
  ): ImprovementProject['learningApproach']['milestones'] {
    const milestones = [];
    for (let level = currentLevel + 1; level <= targetLevel; level++) {
      milestones.push({
        level: level as ProficiencyLevel,
        evidenceRequired: `Demonstrate ${PROFICIENCY_DESCRIPTIONS[level as ProficiencyLevel]} in a real task`,
      });
    }
    return milestones;
  }

  private generateExercises(capability: CapabilityRecord): string[] {
    return [
      `Complete a real task requiring ${capability.name} and document what you learned`,
      `Review and explain a high-quality example of ${capability.name} in practice`,
      `Find an instance where ${capability.name} was applied poorly and identify the mistakes`,
    ];
  }

  private estimateWeeklyHours(currentLevel: ProficiencyLevel, targetLevel: ProficiencyLevel): number {
    const gap = targetLevel - currentLevel;
    return Math.min(10, gap * 2.5); // 2.5 hours per level per week, max 10 hours
  }

  private parseDuration(description: string, from: Date): Date {
    const target = new Date(from);
    const match = description.match(/(\d+)\s*(day|week|month|year)/i);
    if (!match) {
      target.setMonth(target.getMonth() + 3); // Default: 3 months
      return target;
    }

    const amount = parseInt(match[1] ?? '3', 10);
    const unit = (match[2] ?? 'month').toLowerCase();

    switch (unit) {
      case 'day': target.setDate(target.getDate() + amount); break;
      case 'week': target.setDate(target.getDate() + amount * 7); break;
      case 'month': target.setMonth(target.getMonth() + amount); break;
      case 'year': target.setFullYear(target.getFullYear() + amount); break;
    }

    return target;
  }

  private async persistAllCapabilities(): Promise<void> {
    for (const capability of this.capabilities.values()) {
      await this.memory.writeCapabilityRecord(capability);
    }
  }
}
