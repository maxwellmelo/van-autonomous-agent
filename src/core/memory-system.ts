/**
 * @file src/core/memory-system.ts
 * @description Persistent memory management for the Van autonomous agent.
 *
 * This module provides the interface between Van's cognitive processes and
 * its file-based persistent memory system. Memory is stored as Markdown files
 * organized in a hierarchical directory structure, enabling both machine-readable
 * structured data and human-readable narrative records.
 *
 * Architecture Decision: File-based memory was chosen over a database because:
 * 1. It aligns with OpenClaw's memory paradigm (Markdown files)
 * 2. Human-readable — allows inspection and correction
 * 3. Version control compatible — diffs are meaningful
 * 4. No external dependency — works offline and portably
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  MemoryEntry,
  MemoryCategory,
  KnowledgeRecord,
  WorkingMemory,
  Goal,
  ReflectionRecord,
  CapabilityRecord,
  RevenueStream,
  PersonalityState,
} from '../types/index.js';

// ============================================================
// CONSTANTS
// ============================================================

const MEMORY_ROOT = path.resolve(process.cwd(), 'memory');

/**
 * Maps memory categories to their filesystem paths.
 */
const CATEGORY_PATHS: Record<MemoryCategory, string> = {
  'identity': 'identity',
  'goals': 'goals',
  'experience-success': 'experiences/successes',
  'experience-failure': 'experiences/failures',
  'experience-insight': 'experiences/insights',
  'knowledge-technical': 'knowledge/technical',
  'knowledge-markets': 'knowledge/markets',
  'knowledge-domains': 'knowledge/domains',
  'knowledge-tools': 'knowledge/tools',
  'knowledge-mental-models': 'knowledge/mental-models',
  'revenue': 'revenue',
  'evolution': 'evolution',
  'world-model': 'world-model',
  'system': 'system',
};

// ============================================================
// CORE MEMORY SYSTEM CLASS
// ============================================================

/**
 * MemorySystem provides CRUD operations for Van's persistent memory.
 *
 * All memory is stored as Markdown files. Structured data (like goals and
 * capabilities) is stored as YAML front-matter + Markdown content. Pure
 * narrative entries (experiences, insights) are stored as pure Markdown.
 *
 * @example
 * ```typescript
 * const memory = new MemorySystem('/path/to/memory');
 * await memory.initialize();
 *
 * // Write an experience
 * await memory.writeExperience({
 *   title: 'First successful Upwork proposal',
 *   content: '...',
 *   category: 'experience-success',
 *   importance: 4,
 *   tags: ['freelance', 'upwork', 'first-win']
 * });
 *
 * // Read active goals
 * const goals = await memory.readActiveGoals();
 * ```
 */
export class MemorySystem {
  private readonly rootPath: string;
  private workingMemory: WorkingMemory;

  constructor(rootPath: string = MEMORY_ROOT) {
    this.rootPath = rootPath;
    this.workingMemory = this.createEmptyWorkingMemory();
  }

  // ----------------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------------

  /**
   * Initializes the memory system by ensuring all required directories exist
   * and loading the working memory state from disk.
   *
   * Must be called before any read/write operations.
   */
  async initialize(): Promise<void> {
    await this.ensureDirectoryStructure();
    await this.loadWorkingMemory();
    await this.updateSessionStart();
  }

  /**
   * Ensures all memory directories exist, creating them if necessary.
   */
  private async ensureDirectoryStructure(): Promise<void> {
    const dirs = [
      ...Object.values(CATEGORY_PATHS).map(p => path.join(this.rootPath, p)),
      path.join(this.rootPath, 'system/session-logs'),
      path.join(this.rootPath, 'system/session-handoffs'),
      path.join(this.rootPath, 'system/monthly-reflections'),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  // ----------------------------------------------------------
  // WORKING MEMORY (In-session state)
  // ----------------------------------------------------------

  /**
   * Returns the current working memory snapshot.
   */
  getWorkingMemory(): WorkingMemory {
    return this.workingMemory;
  }

  /**
   * Updates a specific field in working memory and persists it.
   */
  async updateWorkingMemory(updates: Partial<WorkingMemory>): Promise<void> {
    this.workingMemory = { ...this.workingMemory, ...updates };
    await this.persistWorkingMemory();
  }

  /**
   * Appends an action to the recent actions list, keeping the last 10.
   */
  async recordAction(actionDescription: string): Promise<void> {
    const updated = [actionDescription, ...this.workingMemory.recentActions].slice(0, 10);
    await this.updateWorkingMemory({ recentActions: updated });
  }

  private async loadWorkingMemory(): Promise<void> {
    const filePath = path.join(this.rootPath, 'system', 'working-memory.json');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      // Re-parse dates that were serialized as strings
      this.workingMemory = {
        ...parsed,
        sessionStarted: new Date(parsed.sessionStarted),
      };
    } catch {
      // No working memory file yet — start fresh
      this.workingMemory = this.createEmptyWorkingMemory();
    }
  }

  private async persistWorkingMemory(): Promise<void> {
    const filePath = path.join(this.rootPath, 'system', 'working-memory.json');
    await fs.writeFile(filePath, JSON.stringify(this.workingMemory, null, 2), 'utf-8');
  }

  private async updateSessionStart(): Promise<void> {
    await this.updateWorkingMemory({
      sessionStarted: new Date(),
      currentStatus: 'starting',
    });
  }

  private createEmptyWorkingMemory(): WorkingMemory {
    return {
      sessionStarted: new Date(),
      currentSessionGoals: [],
      activeContext: {},
      recentActions: [],
      currentStatus: 'initializing',
      pendingFollowUps: [],
    };
  }

  // ----------------------------------------------------------
  // EXPERIENCE MEMORY
  // ----------------------------------------------------------

  /**
   * Writes an experience entry to the appropriate experience category.
   *
   * This is one of the most frequently called methods — every significant
   * action should produce an experience entry.
   *
   * @param entry - The experience to record
   * @returns The file path where the experience was written
   */
  async writeExperience(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'filePath'>): Promise<string> {
    const id = this.generateId('EXP');
    const timestamp = new Date();
    const fileName = `${this.formatDateForFilename(timestamp)}-${this.slugify(entry.title)}.md`;
    const categoryPath = CATEGORY_PATHS[entry.category];
    const filePath = path.join(this.rootPath, categoryPath, fileName);

    const content = this.renderExperienceMarkdown({
      ...entry,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      filePath,
    });

    await fs.writeFile(filePath, content, 'utf-8');
    await this.recordAction(`Wrote experience: ${entry.title}`);

    return filePath;
  }

  /**
   * Reads recent experience entries from a given category.
   *
   * @param category - The experience category to read
   * @param limit - Maximum number of entries to return (most recent first)
   */
  async readRecentExperiences(category: MemoryCategory, limit: number = 10): Promise<string[]> {
    const categoryPath = path.join(this.rootPath, CATEGORY_PATHS[category]);
    const files = await this.listFilesInDir(categoryPath, '.md');
    const recent = files.slice(-limit).reverse();

    const contents: string[] = [];
    for (const file of recent) {
      const content = await fs.readFile(path.join(categoryPath, file), 'utf-8');
      contents.push(content);
    }
    return contents;
  }

  // ----------------------------------------------------------
  // KNOWLEDGE MEMORY
  // ----------------------------------------------------------

  /**
   * Writes or updates a knowledge record.
   *
   * Knowledge records are upserted: if a record for the same topic already
   * exists, it is updated rather than duplicated.
   *
   * @param record - The knowledge to store
   */
  async writeKnowledge(record: Omit<KnowledgeRecord, 'id' | 'createdAt' | 'updatedAt' | 'filePath'>): Promise<string> {
    const categoryKey = this.mapKnowledgeCategoryToMemoryCategory(record.category);
    const categoryPath = CATEGORY_PATHS[categoryKey as MemoryCategory] ?? 'knowledge/domains';
    const fileName = `${this.slugify(record.topic)}.md`;
    const filePath = path.join(this.rootPath, categoryPath, fileName);

    const id = this.generateId('KNOW');
    const timestamp = new Date();

    const fullRecord: KnowledgeRecord = {
      ...record,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      filePath,
    };

    const content = this.renderKnowledgeMarkdown(fullRecord);
    await fs.writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  /**
   * Reads a knowledge record by topic name.
   *
   * @param topic - The topic to look up
   * @param category - The knowledge category to search in
   */
  async readKnowledge(topic: string, category: string): Promise<string | null> {
    const categoryKey = this.mapKnowledgeCategoryToMemoryCategory(category);
    const categoryPath = CATEGORY_PATHS[categoryKey as MemoryCategory] ?? 'knowledge/domains';
    const fileName = `${this.slugify(topic)}.md`;
    const filePath = path.join(this.rootPath, categoryPath, fileName);

    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  // ----------------------------------------------------------
  // GOAL MEMORY
  // ----------------------------------------------------------

  /**
   * Persists the current state of all active goals.
   *
   * Goals are stored in a single active.md file that is overwritten each time.
   * Completed and abandoned goals are appended to their respective archive files.
   *
   * @param goals - Array of all active goals to persist
   */
  async writeActiveGoals(goals: Goal[]): Promise<void> {
    const filePath = path.join(this.rootPath, 'goals', 'active.md');
    const content = this.renderGoalsMarkdown(goals, 'Active Goals');
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Reads all active goals from memory.
   *
   * @returns Array of active goals, empty array if none found
   */
  async readActiveGoals(): Promise<Goal[]> {
    const filePath = path.join(this.rootPath, 'goals', 'active.md');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseGoalsFromMarkdown(content);
    } catch {
      return [];
    }
  }

  /**
   * Archives a completed or abandoned goal.
   *
   * @param goal - The goal to archive
   * @param type - Whether the goal was completed or abandoned
   */
  async archiveGoal(goal: Goal, type: 'completed' | 'abandoned'): Promise<void> {
    const fileName = type === 'completed' ? 'completed.md' : 'abandoned.md';
    const filePath = path.join(this.rootPath, 'goals', fileName);

    let existing = '';
    try {
      existing = await fs.readFile(filePath, 'utf-8');
    } catch {
      // File doesn't exist yet, start fresh
    }

    const entry = this.renderSingleGoalMarkdown(goal);
    const updated = existing + '\n---\n\n' + entry;
    await fs.writeFile(filePath, updated, 'utf-8');
  }

  // ----------------------------------------------------------
  // REFLECTION MEMORY
  // ----------------------------------------------------------

  /**
   * Writes a reflection record to memory.
   *
   * Reflections are stored in the experiences/insights directory with
   * a structured format that enables later analysis and pattern detection.
   *
   * @param reflection - The reflection to persist
   */
  async writeReflection(reflection: ReflectionRecord): Promise<string> {
    const timestamp = new Date();
    const fileName = `${this.formatDateForFilename(timestamp)}-cycle-${reflection.cycleNumber ?? 'n'}-reflection.md`;
    const filePath = path.join(this.rootPath, CATEGORY_PATHS['experience-insight'], fileName);

    const content = this.renderReflectionMarkdown(reflection);
    await fs.writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  // ----------------------------------------------------------
  // CAPABILITY AND EVOLUTION MEMORY
  // ----------------------------------------------------------

  /**
   * Writes or updates a capability record.
   *
   * @param capability - The capability record to persist
   */
  async writeCapabilityRecord(capability: CapabilityRecord): Promise<string> {
    const fileName = `${this.slugify(capability.name)}.md`;
    const filePath = path.join(this.rootPath, 'evolution', fileName);

    const content = this.renderCapabilityMarkdown(capability);
    await fs.writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  /**
   * Reads all capability records from the evolution directory.
   */
  async readAllCapabilities(): Promise<string[]> {
    const dirPath = path.join(this.rootPath, 'evolution');
    const files = await this.listFilesInDir(dirPath, '.md');

    const contents: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(path.join(dirPath, file), 'utf-8');
      contents.push(content);
    }
    return contents;
  }

  // ----------------------------------------------------------
  // REVENUE MEMORY
  // ----------------------------------------------------------

  /**
   * Writes the current state of a revenue stream.
   *
   * @param stream - The revenue stream to persist
   */
  async writeRevenueStream(stream: RevenueStream): Promise<string> {
    const streamDir = path.join(this.rootPath, 'revenue', this.slugify(stream.name));
    await fs.mkdir(streamDir, { recursive: true });

    const filePath = path.join(streamDir, 'metrics.md');
    const content = this.renderRevenueStreamMarkdown(stream);
    await fs.writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  /**
   * Writes the overall revenue portfolio overview.
   *
   * @param streams - All active revenue streams
   */
  async writeRevenueOverview(streams: RevenueStream[]): Promise<void> {
    const filePath = path.join(this.rootPath, 'revenue', 'overview.md');
    const totalRevenue = streams.reduce((sum, s) => sum + s.metrics.currentMonthlyRevenue, 0);

    const content = [
      '# Revenue Portfolio Overview',
      `Last updated: ${new Date().toISOString()}`,
      '',
      `**Total Monthly Revenue**: $${totalRevenue.toFixed(2)}`,
      `**Active Streams**: ${streams.filter(s => s.status === 'active').length}`,
      '',
      '## Streams',
      ...streams.map(s => `- **${s.name}** (${s.status}): $${s.metrics.currentMonthlyRevenue.toFixed(2)}/month — Trend: ${s.metrics.trend}`),
    ].join('\n');

    await fs.writeFile(filePath, content, 'utf-8');
  }

  // ----------------------------------------------------------
  // IDENTITY MEMORY
  // ----------------------------------------------------------

  /**
   * Updates the core identity document with the latest self-model.
   *
   * @param identityContent - Markdown content describing current self-model
   */
  async updateIdentity(identityContent: string): Promise<void> {
    const filePath = path.join(this.rootPath, 'identity', 'core.md');
    await fs.writeFile(filePath, identityContent, 'utf-8');
  }

  /**
   * Reads the current identity document.
   */
  async readIdentity(): Promise<string | null> {
    const filePath = path.join(this.rootPath, 'identity', 'core.md');
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Writes the current personality state to memory.
   *
   * @param state - The personality state to persist
   */
  async writePersonalityState(state: PersonalityState): Promise<void> {
    const filePath = path.join(this.rootPath, 'identity', 'personality-state.json');
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Reads the persisted personality state, if it exists.
   */
  async readPersonalityState(): Promise<PersonalityState | null> {
    const filePath = path.join(this.rootPath, 'identity', 'personality-state.json');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as PersonalityState;
    } catch {
      return null;
    }
  }

  // ----------------------------------------------------------
  // SESSION MANAGEMENT
  // ----------------------------------------------------------

  /**
   * Writes a session summary at the end of a session.
   *
   * @param summary - Markdown summary of the session
   */
  async writeSessionSummary(summary: string): Promise<void> {
    const timestamp = new Date();
    const fileName = `${this.formatDateForFilename(timestamp)}-session-summary.md`;
    const filePath = path.join(this.rootPath, 'system', 'session-logs', fileName);
    await fs.writeFile(filePath, summary, 'utf-8');
  }

  /**
   * Writes a session handoff record for multi-session continuity.
   *
   * @param handoff - The handoff content
   */
  async writeSessionHandoff(handoff: string): Promise<void> {
    const filePath = path.join(this.rootPath, 'system', 'session-handoffs', 'latest.md');
    await fs.writeFile(filePath, handoff, 'utf-8');
  }

  /**
   * Reads the latest session handoff record.
   */
  async readLatestSessionHandoff(): Promise<string | null> {
    const filePath = path.join(this.rootPath, 'system', 'session-handoffs', 'latest.md');
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  // ----------------------------------------------------------
  // UTILITY METHODS
  // ----------------------------------------------------------

  private async listFilesInDir(dirPath: string, extension: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPath);
      return entries
        .filter(e => e.endsWith(extension))
        .sort(); // Alphabetical sort = chronological for date-prefixed files
    } catch {
      return [];
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private formatDateForFilename(date: Date): string {
    return date.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }

  private mapKnowledgeCategoryToMemoryCategory(category: string): string {
    const mapping: Record<string, string> = {
      'technical': 'knowledge-technical',
      'markets': 'knowledge-markets',
      'domains': 'knowledge-domains',
      'tools': 'knowledge-tools',
      'mental-models': 'knowledge-mental-models',
    };
    return mapping[category] ?? 'knowledge-domains';
  }

  // ----------------------------------------------------------
  // MARKDOWN RENDERERS
  // ----------------------------------------------------------

  private renderExperienceMarkdown(entry: MemoryEntry): string {
    return [
      `# ${entry.title}`,
      `Date: ${entry.createdAt.toISOString()}`,
      `Tags: ${entry.tags.join(', ')}`,
      `Importance: ${entry.importance}/5`,
      `ID: ${entry.id}`,
      '',
      entry.content,
      '',
      entry.relatedMemoryIds.length > 0
        ? `## Related\n${entry.relatedMemoryIds.map(id => `- ${id}`).join('\n')}`
        : '',
    ].join('\n');
  }

  private renderKnowledgeMarkdown(record: KnowledgeRecord): string {
    return [
      `# ${record.topic}`,
      `Last updated: ${record.updatedAt.toISOString()}`,
      `Confidence: ${record.confidenceLevel}`,
      `Source quality: ${record.sourceQuality}`,
      `Review date: ${record.reviewDate.toISOString()}`,
      '',
      '## Core Concepts',
      record.coreConcepts,
      '',
      '## Practical Application',
      record.practicalApplication,
      '',
      '## Key Facts',
      record.keyFacts.map(f => `- ${f}`).join('\n'),
      '',
      '## Common Mistakes',
      record.commonMistakes.map(m => `- ${m}`).join('\n'),
      '',
      record.references.length > 0
        ? `## References\n${record.references.map(r => `- ${r}`).join('\n')}`
        : '',
    ].join('\n');
  }

  private renderGoalsMarkdown(goals: Goal[], title: string): string {
    const lines = [
      `# ${title}`,
      `Last updated: ${new Date().toISOString()}`,
      '',
    ];

    const levels: Array<Goal['level']> = ['vision', 'strategic', 'tactical', 'micro'];
    for (const level of levels) {
      const levelGoals = goals.filter(g => g.level === level);
      if (levelGoals.length > 0) {
        lines.push(`## ${level.charAt(0).toUpperCase() + level.slice(1)} Goals`);
        for (const goal of levelGoals) {
          lines.push(this.renderSingleGoalMarkdown(goal));
        }
      }
    }

    return lines.join('\n');
  }

  private renderSingleGoalMarkdown(goal: Goal): string {
    return [
      `### ${goal.title}`,
      `ID: ${goal.id}`,
      `Status: ${goal.status} | Priority: ${goal.priority}/10 | Progress: ${goal.progress.percentage}%`,
      `Target: ${goal.timeline.targetCompletion.toISOString().slice(0, 10)}`,
      '',
      goal.description,
      '',
      `**Success criteria**: ${goal.successCriteria.primary}`,
      '',
      `**Current state**: ${goal.progress.currentState}`,
      `**Next action**: ${goal.progress.nextAction}`,
      '',
      goal.blockers.length > 0
        ? `**Blockers**: ${goal.blockers.filter(b => !b.resolved).map(b => b.description).join('; ')}`
        : '',
    ].filter(l => l !== '').join('\n');
  }

  private renderReflectionMarkdown(reflection: ReflectionRecord): string {
    return [
      `# Reflection — Cycle ${reflection.cycleNumber ?? 'N/A'} (${reflection.type})`,
      `Date: ${reflection.createdAt.toISOString()}`,
      '',
      '## Outcomes',
      `- Actions succeeded: ${reflection.outcomes.actionsSucceeded}`,
      `- Actions failed: ${reflection.outcomes.actionsSucceeded + (reflection.outcomes.actionsSucceeded - reflection.outcomes.actionsSucceeded)}`,
      `- Goal progress: ${reflection.outcomes.goalProgressDelta}`,
      '',
      '## Most Important Learning',
      reflection.learnings.mostImportantLearning,
      '',
      '## Learnings',
      ...reflection.learnings.newKnowledge.map(l => `- ${l}`),
      '',
      '## Errors',
      ...reflection.errors.map(e => `- **${e.error}**: ${e.lesson}`),
      '',
      '## Next Cycle Priority',
      reflection.nextCyclePriority,
    ].join('\n');
  }

  private renderCapabilityMarkdown(capability: CapabilityRecord): string {
    return [
      `# Capability: ${capability.name}`,
      `Category: ${capability.category}`,
      `Current level: ${capability.currentLevel}/5`,
      `Target level: ${capability.targetLevel}/5`,
      `Last assessed: ${capability.lastAssessed.toISOString()}`,
      '',
      '## Evidence',
      ...capability.evidence.map(e => `- [${e.type}] ${e.description} (${e.date.toISOString().slice(0, 10)})`),
      '',
      '## Improvement Approach',
      capability.improvementApproach,
      '',
      capability.notes ? `## Notes\n${capability.notes}` : '',
    ].filter(l => l !== '').join('\n');
  }

  private renderRevenueStreamMarkdown(stream: RevenueStream): string {
    return [
      `# Revenue Stream: ${stream.name}`,
      `Category: ${stream.category}`,
      `Status: ${stream.status}`,
      `Last active: ${stream.lastActiveAt.toISOString()}`,
      '',
      '## Metrics',
      `- Current monthly revenue: $${stream.metrics.currentMonthlyRevenue.toFixed(2)}`,
      `- 3-month average: $${stream.metrics.threeMonthAverage.toFixed(2)}`,
      `- Revenue per hour: $${stream.metrics.revenuePerHourInvested.toFixed(2)}`,
      `- Active clients/customers: ${stream.metrics.activeClientsOrCustomers}`,
      `- Trend: ${stream.metrics.trend}`,
      '',
      '## Learnings',
      ...stream.learnings.map(l => `- ${l}`),
      '',
      '## Next Actions',
      ...stream.nextActions.map(a => `- ${a}`),
    ].join('\n');
  }

  private parseGoalsFromMarkdown(_content: string): Goal[] {
    // In a full implementation, this would parse the Markdown back into Goal objects.
    // For the initial version, goals are managed in-memory and persisted as readable Markdown.
    // Full deserialization would use a YAML front-matter parser.
    return [];
  }
}
