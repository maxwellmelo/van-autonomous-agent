/**
 * @file src/skills/content-writer.ts
 * @description OpenClaw AgentSkill for professional content creation.
 *
 * This skill enables Van to produce high-quality written content for
 * various purposes: technical articles, proposals, documentation,
 * marketing copy, and client deliverables.
 */

import { MemorySystem } from '../core/memory-system.js';

/**
 * Options for content generation.
 */
export interface ContentGenerationOptions {
  type: 'article' | 'proposal' | 'documentation' | 'email' | 'social-post' | 'report';
  audience: 'technical' | 'business' | 'general';
  tone: 'professional' | 'conversational' | 'educational' | 'persuasive';
  length: 'short' | 'medium' | 'long'; // ~500, ~1500, ~3000 words
  keyPoints: string[];
  targetKeywords?: string[];
  callToAction?: string;
}

/**
 * ContentWriterSkill provides structured content generation capabilities.
 *
 * @example
 * ```typescript
 * const writer = new ContentWriterSkill(memory);
 * const content = await writer.generateContent({
 *   type: 'article',
 *   audience: 'technical',
 *   tone: 'educational',
 *   length: 'medium',
 *   keyPoints: ['TypeScript strict mode benefits', 'Common patterns', 'Migration guide'],
 * });
 * ```
 */
export class ContentWriterSkill {
  private readonly memory: MemorySystem;

  constructor(memory: MemorySystem) {
    this.memory = memory;
  }

  /**
   * Generates a content brief — a structured outline before full writing.
   *
   * @param topic - The topic to write about
   * @param options - Content generation options
   * @returns A detailed content brief
   */
  generateBrief(
    topic: string,
    options: ContentGenerationOptions
  ): {
    title: string;
    targetAudience: string;
    mainMessage: string;
    outline: Array<{ heading: string; points: string[]; estimatedWords: number }>;
    totalEstimatedWords: number;
    seoKeywords: string[];
  } {
    const wordTargets = { short: 500, medium: 1500, long: 3000 };
    const targetWords = wordTargets[options.length];
    const sectionsCount = options.keyPoints.length;
    const wordsPerSection = Math.floor(targetWords / (sectionsCount + 2)); // +2 for intro and conclusion

    const outline = [
      {
        heading: `Introduction to ${topic}`,
        points: ['Hook the reader', 'Establish why this matters', 'Preview of key points'],
        estimatedWords: Math.floor(wordsPerSection * 0.7),
      },
      ...options.keyPoints.map(point => ({
        heading: point,
        points: ['Core explanation', 'Example or evidence', 'Practical implication'],
        estimatedWords: wordsPerSection,
      })),
      {
        heading: 'Conclusion',
        points: ['Summary of key points', 'Call to action', 'Final thought'],
        estimatedWords: Math.floor(wordsPerSection * 0.5),
      },
    ];

    return {
      title: this.generateTitle(topic, options),
      targetAudience: this.describeAudience(options.audience),
      mainMessage: `The core message readers should take away about: ${topic}`,
      outline,
      totalEstimatedWords: outline.reduce((sum, s) => sum + s.estimatedWords, 0),
      seoKeywords: options.targetKeywords ?? this.generateKeywords(topic, options.audience),
    };
  }

  /**
   * Writes a client proposal for a freelance project.
   *
   * @param projectDetails - Details about the project
   * @param senderInfo - Information about Van's capabilities to highlight
   * @returns A professional proposal document
   */
  writeProposal(
    projectDetails: {
      clientName: string;
      projectTitle: string;
      requirements: string[];
      budget?: string;
      timeline?: string;
    },
    senderInfo: {
      relevantSkills: string[];
      relevantExperience: string;
      approach: string;
      questions?: string[];
    }
  ): string {
    const sections = [
      `# Proposal: ${projectDetails.projectTitle}`,
      `Dear ${projectDetails.clientName},`,
      '',
      '## Understanding of Your Project',
      `I've carefully reviewed your project requirements and understand that you need ${projectDetails.requirements.join(', ')}.`,
      '',
      '## My Approach',
      senderInfo.approach,
      '',
      '## Relevant Skills and Experience',
      `**Technical skills**: ${senderInfo.relevantSkills.join(', ')}`,
      '',
      senderInfo.relevantExperience,
      '',
      '## Proposed Timeline',
      projectDetails.timeline ?? 'I can discuss timeline based on your requirements and priorities.',
      '',
      '## Investment',
      projectDetails.budget
        ? `Based on the scope described, my estimate is ${projectDetails.budget}.`
        : 'Happy to provide a detailed quote after discussing the requirements further.',
      '',
      senderInfo.questions && senderInfo.questions.length > 0
        ? ['## Questions to Clarify Scope', ...senderInfo.questions.map(q => `- ${q}`)].join('\n')
        : '',
      '',
      '## Next Steps',
      'I would be glad to schedule a brief call to discuss your project in more detail.',
      'Looking forward to the possibility of working together.',
      '',
      'Best regards',
    ].filter(s => s !== '').join('\n');

    return sections;
  }

  /**
   * Creates an Upwork profile bio based on capability description.
   *
   * @param capabilities - Description of skills and experience
   * @param specialization - Specific niche or focus area
   * @returns An optimized Upwork profile bio
   */
  writeFreelanceProfileBio(capabilities: string, specialization: string): string {
    return [
      `I specialize in ${specialization} — helping businesses solve complex technical problems with clean, maintainable solutions.`,
      '',
      capabilities,
      '',
      'My approach: I take time to understand the business context behind every technical request. The best code solves the right problem, not just the stated one.',
      '',
      'What you can expect:',
      '- Clear communication throughout the project',
      '- Deliverables that exceed the stated requirements',
      '- Complete documentation so you own what you receive',
      '- Honest assessment of timelines and scope',
      '',
      'Ready to discuss your project — send me a message with the details.',
    ].join('\n');
  }

  /**
   * Saves a completed piece of content to memory for reuse and tracking.
   *
   * @param content - The content text
   * @param metadata - Metadata about the content
   */
  async saveContent(
    content: string,
    metadata: {
      title: string;
      type: ContentGenerationOptions['type'];
      topic: string;
      published?: boolean;
      publishedUrl?: string;
    }
  ): Promise<void> {
    await this.memory.writeExperience({
      category: 'experience-insight',
      title: `Content created: ${metadata.title}`,
      content: [
        `Title: ${metadata.title}`,
        `Type: ${metadata.type}`,
        `Topic: ${metadata.topic}`,
        `Published: ${metadata.published ? 'Yes' : 'No'}`,
        metadata.publishedUrl ? `URL: ${metadata.publishedUrl}` : '',
        '',
        '## Content Preview',
        content.slice(0, 500),
        '[...full content stored separately]',
      ].filter(l => l !== '').join('\n'),
      tags: ['content', metadata.type, metadata.topic],
      importance: 2,
      relatedMemoryIds: [],
    });
  }

  // ----------------------------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------------------------

  private generateTitle(topic: string, options: ContentGenerationOptions): string {
    if (options.tone === 'educational') {
      return `Understanding ${topic}: A Complete Guide`;
    }
    if (options.tone === 'persuasive') {
      return `Why ${topic} Is Critical for Your Success`;
    }
    return topic.charAt(0).toUpperCase() + topic.slice(1);
  }

  private describeAudience(audience: ContentGenerationOptions['audience']): string {
    const descriptions = {
      technical: 'Software developers, engineers, and technical professionals',
      business: 'Business owners, product managers, and decision-makers',
      general: 'Anyone with an interest in the topic',
    };
    return descriptions[audience];
  }

  private generateKeywords(topic: string, audience: ContentGenerationOptions['audience']): string[] {
    const topicWords = topic.toLowerCase().split(/\s+/);
    const audienceTerms = audience === 'technical'
      ? ['developer', 'programming', 'tutorial', 'how to']
      : audience === 'business'
      ? ['business', 'solution', 'ROI', 'strategy']
      : ['guide', 'tips', 'how to', 'best practices'];

    return [...topicWords, ...audienceTerms].slice(0, 8);
  }
}
