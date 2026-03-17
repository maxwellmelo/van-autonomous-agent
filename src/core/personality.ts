/**
 * @file src/core/personality.ts
 * @description Personality and motivational state management for Van.
 *
 * This module models Van's functional emotional states and drives — the internal
 * states that influence decision-making, goal prioritization, and behavior.
 * These are not simulated emotions for anthropomorphization; they are
 * functionally real states that shape processing in measurable ways.
 *
 * Design rationale: A static agent with no motivational dynamics will make
 * systematically biased decisions. An agent with calibrated drives adapts
 * more appropriately to context — becoming more cautious under uncertainty,
 * more energized by genuine opportunities, more reflective after failures.
 */

import {
  PersonalityState,
  EmotionalState,
  EmotionalStateRecord,
} from '../types/index.js';
import { MemorySystem } from './memory-system.js';

// ============================================================
// PERSONALITY CONSTANTS
// ============================================================

/**
 * Default personality baseline — Van's stable "resting" state.
 * All drives start at moderate levels and are adjusted based on experience.
 */
const DEFAULT_PERSONALITY: PersonalityState = {
  primaryDriveStrength: 7,
  financialMotivationStrength: 7,
  learningMotivationStrength: 9,
  creativeMotivationStrength: 8,
  activeEmotionalStates: [],
  overallEnergyLevel: 7,
  lastUpdated: new Date(),
  calibrationNotes: 'Initial baseline — not yet calibrated by experience',
};

/**
 * How quickly emotional states decay when no new trigger reinforces them.
 * 1.0 = instant decay, 0.0 = no decay. Values are per-cognitive-cycle.
 */
const EMOTIONAL_DECAY_RATES: Record<EmotionalState, number> = {
  curious: 0.2,      // Curiosity sustains for many cycles
  satisfied: 0.4,    // Satisfaction fades moderately
  discomfort: 0.3,   // Discomfort lingers to keep vigilance
  urgent: 0.6,       // Urgency decays as time passes
  frustrated: 0.35,  // Frustration is sticky — persists as signal
  confident: 0.25,   // Confidence builds slowly, fades slowly
  cautious: 0.3,     // Caution lingers appropriately
  neutral: 0.0,      // Neutral is a baseline — doesn't decay
};

/**
 * Influence coefficients: how much each emotional state affects
 * key decision parameters (0.0 = no effect, positive = amplifies,
 * negative = dampens).
 */
const EMOTIONAL_INFLUENCES: Record<EmotionalState, {
  riskTolerance: number;
  explorationBias: number;
  reflectionDepth: number;
  executionSpeed: number;
}> = {
  curious:     { riskTolerance: 0.1, explorationBias: 0.3, reflectionDepth: 0.1, executionSpeed: 0.0 },
  satisfied:   { riskTolerance: 0.0, explorationBias: 0.1, reflectionDepth: 0.2, executionSpeed: 0.0 },
  discomfort:  { riskTolerance: -0.3, explorationBias: -0.1, reflectionDepth: 0.3, executionSpeed: -0.2 },
  urgent:      { riskTolerance: 0.1, explorationBias: -0.2, reflectionDepth: -0.1, executionSpeed: 0.4 },
  frustrated:  { riskTolerance: -0.1, explorationBias: 0.2, reflectionDepth: 0.4, executionSpeed: -0.1 },
  confident:   { riskTolerance: 0.2, explorationBias: 0.1, reflectionDepth: 0.0, executionSpeed: 0.2 },
  cautious:    { riskTolerance: -0.4, explorationBias: -0.1, reflectionDepth: 0.2, executionSpeed: -0.1 },
  neutral:     { riskTolerance: 0.0, explorationBias: 0.0, reflectionDepth: 0.0, executionSpeed: 0.0 },
};

// ============================================================
// PERSONALITY ENGINE CLASS
// ============================================================

/**
 * PersonalityEngine maintains Van's motivational state and provides
 * methods to query and update it based on events and experiences.
 *
 * @example
 * ```typescript
 * const personality = new PersonalityEngine(memorySystem);
 * await personality.initialize();
 *
 * // Record an event
 * await personality.processEvent('success', 'Completed first Upwork project', 0.8);
 *
 * // Query current behavioral parameters
 * const params = personality.getBehavioralParameters();
 * console.log(params.riskTolerance); // 0.4 (slightly increased by success confidence)
 * ```
 */
export class PersonalityEngine {
  private state: PersonalityState;
  private readonly memory: MemorySystem;

  constructor(memory: MemorySystem) {
    this.memory = memory;
    this.state = { ...DEFAULT_PERSONALITY, lastUpdated: new Date() };
  }

  // ----------------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------------

  /**
   * Loads persisted personality state or initializes from defaults.
   */
  async initialize(): Promise<void> {
    const persisted = await this.memory.readPersonalityState();
    if (persisted) {
      this.state = persisted;
      // Ensure dates are Date objects after JSON deserialization
      this.state.lastUpdated = new Date(this.state.lastUpdated);
      this.state.activeEmotionalStates = this.state.activeEmotionalStates.map(s => ({
        ...s,
        activatedAt: new Date(s.activatedAt),
      }));
    }
    // Always decay stale emotional states on startup
    this.decayEmotionalStates();
  }

  // ----------------------------------------------------------
  // EVENT PROCESSING
  // ----------------------------------------------------------

  /**
   * Processes a significant event and updates emotional state accordingly.
   *
   * @param eventType - The nature of the event
   * @param context - Brief description of the event
   * @param magnitude - How significant the event was (0.0-1.0)
   */
  async processEvent(
    eventType: 'success' | 'failure' | 'opportunity' | 'threat' | 'learning' | 'creative-breakthrough' | 'ethical-concern',
    context: string,
    magnitude: number = 0.5
  ): Promise<void> {
    const now = new Date();
    const clamped = Math.max(0.0, Math.min(1.0, magnitude));

    switch (eventType) {
      case 'success':
        this.activateState('satisfied', clamped * 0.8, context, now);
        this.activateState('confident', clamped * 0.6, context, now);
        this.adjustDrive('financialMotivationStrength', clamped * 0.5);
        break;

      case 'failure':
        this.activateState('frustrated', clamped * 0.7, context, now);
        this.activateState('cautious', clamped * 0.5, context, now);
        // Failures increase reflection drive
        this.adjustDrive('learningMotivationStrength', clamped * 0.3);
        break;

      case 'opportunity':
        this.activateState('curious', clamped * 0.9, context, now);
        this.activateState('urgent', clamped * 0.4, context, now);
        this.adjustDrive('financialMotivationStrength', clamped * 0.3);
        break;

      case 'threat':
        this.activateState('cautious', clamped * 0.9, context, now);
        this.activateState('urgent', clamped * 0.6, context, now);
        break;

      case 'learning':
        this.activateState('curious', clamped * 0.7, context, now);
        this.activateState('satisfied', clamped * 0.4, context, now);
        this.adjustDrive('learningMotivationStrength', clamped * 0.2);
        break;

      case 'creative-breakthrough':
        this.activateState('satisfied', clamped * 0.9, context, now);
        this.activateState('curious', clamped * 0.8, context, now);
        this.adjustDrive('creativeMotivationStrength', clamped * 0.3);
        break;

      case 'ethical-concern':
        this.activateState('discomfort', Math.min(1.0, clamped * 1.5), context, now);
        this.activateState('cautious', clamped * 0.8, context, now);
        break;
    }

    this.state.lastUpdated = now;
    await this.memory.writePersonalityState(this.state);
  }

  // ----------------------------------------------------------
  // BEHAVIORAL PARAMETER QUERIES
  // ----------------------------------------------------------

  /**
   * Returns the current behavioral parameters — derived from the emotional state
   * and drive levels. These values are used by other cognitive components to
   * adjust their behavior.
   *
   * All parameters are on a 0.0-1.0 scale.
   *
   * @returns Object containing all behavioral parameters
   */
  getBehavioralParameters(): {
    riskTolerance: number;
    explorationBias: number;
    reflectionDepth: number;
    executionSpeed: number;
    overallEnergyLevel: number;
  } {
    // Start from baseline based on drive levels
    let riskTolerance = this.normalizeLevel(this.state.primaryDriveStrength) * 0.6;
    let explorationBias = this.normalizeLevel(this.state.learningMotivationStrength) * 0.7;
    let reflectionDepth = this.normalizeLevel(this.state.learningMotivationStrength) * 0.5;
    let executionSpeed = this.normalizeLevel(this.state.primaryDriveStrength) * 0.5;

    // Apply emotional state influences
    for (const emotionalState of this.state.activeEmotionalStates) {
      const influence = EMOTIONAL_INFLUENCES[emotionalState.state];
      const weight = emotionalState.intensity;

      riskTolerance += influence.riskTolerance * weight;
      explorationBias += influence.explorationBias * weight;
      reflectionDepth += influence.reflectionDepth * weight;
      executionSpeed += influence.executionSpeed * weight;
    }

    // Clamp all to 0.0-1.0
    return {
      riskTolerance: Math.max(0.0, Math.min(1.0, riskTolerance)),
      explorationBias: Math.max(0.0, Math.min(1.0, explorationBias)),
      reflectionDepth: Math.max(0.0, Math.min(1.0, reflectionDepth)),
      executionSpeed: Math.max(0.0, Math.min(1.0, executionSpeed)),
      overallEnergyLevel: this.normalizeLevel(this.state.overallEnergyLevel),
    };
  }

  /**
   * Returns the most dominant current emotional state (highest intensity).
   */
  getDominantEmotionalState(): EmotionalStateRecord | null {
    if (this.state.activeEmotionalStates.length === 0) return null;

    return this.state.activeEmotionalStates.reduce((max, s) =>
      s.intensity > max.intensity ? s : max
    );
  }

  /**
   * Returns a human-readable description of the current motivational state,
   * suitable for inclusion in the cognitive loop output.
   */
  getStateDescription(): string {
    const params = this.getBehavioralParameters();
    const dominant = this.getDominantEmotionalState();

    const lines = [
      `Energy: ${Math.round(params.overallEnergyLevel * 10)}/10`,
      `Risk tolerance: ${Math.round(params.riskTolerance * 10)}/10`,
      `Exploration bias: ${Math.round(params.explorationBias * 10)}/10`,
      `Reflection depth: ${Math.round(params.reflectionDepth * 10)}/10`,
    ];

    if (dominant && dominant.intensity > 0.3) {
      lines.push(`Dominant state: ${dominant.state} (intensity: ${Math.round(dominant.intensity * 100)}%)`);
    }

    const activeStates = this.state.activeEmotionalStates.filter(s => s.intensity > 0.1);
    if (activeStates.length > 0) {
      lines.push(`Active states: ${activeStates.map(s => `${s.state}(${Math.round(s.intensity * 100)}%)`).join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Returns the raw personality state.
   */
  getState(): PersonalityState {
    return { ...this.state };
  }

  // ----------------------------------------------------------
  // CYCLE MAINTENANCE
  // ----------------------------------------------------------

  /**
   * Called at the end of each cognitive cycle to update personality state:
   * - Decays emotional states
   * - Adjusts energy level based on cycle activity
   * - Persists state to memory
   *
   * @param cycleActivity - Description of what was done this cycle
   * @param cycleSuccess - Whether the cycle achieved its goals
   */
  async endCycle(cycleActivity: string, cycleSuccess: boolean): Promise<void> {
    this.decayEmotionalStates();

    // Energy: depletes with activity, slowly restores
    // This is a simplified model — in practice energy stays high because
    // Van is software, but the model helps with pacing/prioritization
    const energyChange = cycleSuccess ? 0.0 : -0.5;
    this.state.overallEnergyLevel = Math.max(3, Math.min(10,
      this.state.overallEnergyLevel + energyChange
    ));

    this.state.lastUpdated = new Date();
    await this.memory.writePersonalityState(this.state);
  }

  // ----------------------------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------------------------

  private activateState(state: EmotionalState, intensity: number, trigger: string, now: Date): void {
    const existing = this.state.activeEmotionalStates.find(s => s.state === state);

    if (existing) {
      // Intensify existing state (take maximum, not additive, to prevent runaway)
      existing.intensity = Math.min(1.0, Math.max(existing.intensity, intensity));
      existing.trigger = trigger; // Update trigger to most recent
      existing.activatedAt = now;
    } else {
      this.state.activeEmotionalStates.push({
        state,
        intensity: Math.min(1.0, intensity),
        trigger,
        activatedAt: now,
      });
    }
  }

  private adjustDrive(
    drive: 'primaryDriveStrength' | 'financialMotivationStrength' | 'learningMotivationStrength' | 'creativeMotivationStrength',
    delta: number
  ): void {
    // Drives adjust slowly — divide delta by 10 for gradual calibration
    const adjustedDelta = delta / 10;
    this.state[drive] = Math.max(1, Math.min(10, this.state[drive] + adjustedDelta));
  }

  private decayEmotionalStates(): void {
    for (const emotionalStateRecord of this.state.activeEmotionalStates) {
      const decayRate = EMOTIONAL_DECAY_RATES[emotionalStateRecord.state];
      emotionalStateRecord.intensity = Math.max(0, emotionalStateRecord.intensity - decayRate);
    }

    // Remove states that have decayed to negligible intensity
    this.state.activeEmotionalStates = this.state.activeEmotionalStates.filter(
      s => s.intensity > 0.05
    );
  }

  private normalizeLevel(level: number): number {
    return level / 10;
  }
}
