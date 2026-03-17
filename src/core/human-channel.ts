/**
 * @file src/core/human-channel.ts
 * @description Bidirectional communication bridge between Van and its human operator.
 *
 * Van is an autonomous agent, but there are moments when human judgment is
 * essential: providing credentials, approving high-stakes actions, redirecting
 * goals, or simply knowing what Van is working on. HumanChannel manages this
 * dialogue without coupling Van's cognitive loop to a specific messaging platform.
 *
 * Architecture
 * ─────────────
 * Outbound (Van → User):
 *   All outbound messages are sent through OpenClawAdapter.sendMessage(), which
 *   hands them off to the OpenClaw daemon. The daemon routes them to whichever
 *   messaging platform is configured (Telegram, Slack, etc.). Van never knows
 *   the platform — it only calls sendMessage("user", text).
 *
 * Inbound (User → Van):
 *   Van polls OpenClawAdapter.pollMessages() at the start of each cognitive
 *   cycle. Messages are matched to pending requests by keyword or by explicit
 *   request-ID inclusion, then dispatched as resolved values.
 *
 * Non-blocking design
 * ────────────────────
 * Van never blocks waiting for a reply. When a request is sent, the goal that
 * requires it is marked 'blocked'. On every subsequent cycle the channel checks
 * whether a reply has arrived. Once it does, the goal is unblocked.
 * If no reply arrives within PENDING_REQUEST_TIMEOUT_MS, the request is
 * marked 'expired' and the goal can decide how to proceed.
 *
 * Persistence
 * ────────────
 * Pending requests are kept in memory (Map) and also written to the MemorySystem
 * as 'system' category entries. On startup, HumanChannel re-loads pending
 * requests from memory so a process restart does not lose waiting requests.
 */

import { UserMessage, PendingRequest, NotificationPriority, Goal, VanState } from '../types/index.js';
import { MemorySystem } from './memory-system.js';
import { OpenClawAdapter } from './action-executor.js';

// ============================================================
// CONSTANTS
// ============================================================

/** Logical channel name used for all user-facing messages. */
const USER_CHANNEL = 'user';

/**
 * How long (in milliseconds) a pending request waits before being marked
 * expired. Defaults to 24 hours — generous enough to survive a sleeping user.
 */
const PENDING_REQUEST_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Memory entry title prefix used when persisting pending requests. */
const PENDING_REQUEST_MEMORY_PREFIX = 'pending-request:';

// ============================================================
// HUMAN CHANNEL CLASS
// ============================================================

/**
 * HumanChannel is Van's voice and ears for communication with its operator.
 *
 * It exposes a clean, high-level API for the CognitiveEngine to use:
 * - Notify the user of events
 * - Request free-form input or yes/no approval
 * - Poll for and process incoming user messages
 * - Understand a small set of control commands (status, pause, resume, stop)
 *
 * @example
 * ```typescript
 * const channel = new HumanChannel(memory, openClawAdapter);
 * await channel.initialize();
 *
 * // Inside a cognitive cycle:
 * const commands = await channel.checkForMessages();
 * await channel.processCommandList(commands);
 *
 * // When a goal needs a secret:
 * await channel.requestInput(
 *   'What is the GitHub personal access token?',
 *   'Needed to push code to the repository for goal: Build Portfolio Site',
 *   goal.id
 * );
 * ```
 */
export class HumanChannel {
  private readonly memory: MemorySystem;
  private readonly adapter: OpenClawAdapter;

  /**
   * In-memory map of all requests that are currently pending a user reply.
   * Keys are request IDs. This map is the authoritative source; the
   * MemorySystem copy serves durability across restarts.
   */
  private readonly pendingRequests: Map<string, PendingRequest> = new Map();

  /**
   * Timestamp of the last successfully processed inbound message.
   * Used as the `since` parameter when polling so we never re-process
   * a message that was already handled.
   */
  private lastMessageTimestamp: Date | undefined = undefined;

  /**
   * Whether the cognitive loop is currently paused by user command.
   * Read by CognitiveEngine at the top of each cycle.
   */
  private _isPaused: boolean = false;

  /**
   * Whether the user has issued a stop command.
   * Read by CognitiveEngine to trigger graceful shutdown.
   */
  private _stopRequested: boolean = false;

  constructor(memory: MemorySystem, adapter: OpenClawAdapter) {
    this.memory = memory;
    this.adapter = adapter;
  }

  // ----------------------------------------------------------
  // PUBLIC STATE ACCESSORS
  // ----------------------------------------------------------

  /** Returns true if the user has requested a pause via messaging. */
  get isPaused(): boolean {
    return this._isPaused;
  }

  /** Returns true if the user has requested a graceful stop via messaging. */
  get stopRequested(): boolean {
    return this._stopRequested;
  }

  // ----------------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------------

  /**
   * Loads persisted pending requests from the MemorySystem.
   *
   * This ensures that if Van restarts, it does not forget about requests
   * it already sent to the user. Any request that survived the restart and
   * whose timeout has not yet elapsed is restored to the pending map.
   */
  async initialize(): Promise<void> {
    console.log('[HumanChannel] Initializing...');

    try {
      // Re-hydrate pending requests from memory
      const raw = await this.memory.readRecentExperiences('system', 50);
      const now = Date.now();

      for (const entry of raw) {
        if (!entry.startsWith(PENDING_REQUEST_MEMORY_PREFIX)) continue;

        try {
          const json = entry.slice(PENDING_REQUEST_MEMORY_PREFIX.length);
          const req = JSON.parse(json) as PendingRequest;

          // Revive Date objects (JSON.parse gives strings)
          req.createdAt = new Date(req.createdAt);
          if (req.resolvedAt) req.resolvedAt = new Date(req.resolvedAt);

          // Only restore requests that are still within their timeout window
          if (
            req.status === 'pending' &&
            now - req.createdAt.getTime() < PENDING_REQUEST_TIMEOUT_MS
          ) {
            this.pendingRequests.set(req.id, req);
          }
        } catch {
          // Corrupted entry — skip silently
        }
      }

      console.log(`[HumanChannel] Restored ${this.pendingRequests.size} pending request(s) from memory.`);
    } catch (error) {
      // Memory read failure is non-fatal; start with empty pending map
      console.warn('[HumanChannel] Could not restore pending requests:', error);
    }
  }

  // ----------------------------------------------------------
  // OUTBOUND: VAN → USER
  // ----------------------------------------------------------

  /**
   * Sends a notification message to the user through OpenClaw's messaging channel.
   *
   * Priority affects the message prefix so the user can triage at a glance:
   * - low:    [Van] <message>
   * - normal: [Van] <message>
   * - urgent: [URGENT] Van: <message>
   *
   * The method does not throw on delivery failure — messaging is best-effort.
   * Failures are logged as console warnings so the cognitive loop is never
   * interrupted by a transient messaging outage.
   *
   * @param message  - Human-readable message body
   * @param priority - Urgency level that affects formatting
   */
  async notifyUser(message: string, priority: NotificationPriority = 'normal'): Promise<void> {
    const prefix = priority === 'urgent' ? '[URGENT] Van:' : '[Van]';
    const formatted = `${prefix} ${message}`;

    const sent = await this.adapter.sendMessage(USER_CHANNEL, formatted);

    if (!sent) {
      console.warn(`[HumanChannel] Failed to deliver notification (priority=${priority}): ${message.slice(0, 80)}`);
    } else {
      console.log(`[HumanChannel] Notification sent (priority=${priority})`);
    }
  }

  /**
   * Sends a request for free-form input to the user and registers a pending
   * request that will be resolved when the user replies.
   *
   * The goal identified by `blockedGoalId` is NOT automatically set to
   * 'blocked' by this method. The caller (CognitiveEngine) is responsible for
   * marking the goal blocked immediately after calling requestInput(), because
   * the cognitive loop must not attempt to act on a goal that is waiting for
   * human input.
   *
   * @param question     - The specific information Van needs
   * @param context      - Why Van needs it and what it will be used for
   * @param blockedGoalId - Optional ID of the goal that is blocked pending this answer
   * @returns The ID of the newly created PendingRequest
   */
  async requestInput(question: string, context: string, blockedGoalId?: string): Promise<string> {
    const requestId = `req-input-${Date.now()}`;
    const request: PendingRequest = {
      id: requestId,
      type: 'input',
      question,
      context,
      blockedGoalId,
      createdAt: new Date(),
      status: 'pending',
    };

    this.pendingRequests.set(requestId, request);
    await this.persistRequest(request);

    const messageText = [
      `I need your input to continue.`,
      ``,
      `Question: ${question}`,
      `Context: ${context}`,
      ``,
      `Please reply with your answer. (Request ID: ${requestId})`,
    ].join('\n');

    await this.notifyUser(messageText, 'urgent');

    return requestId;
  }

  /**
   * Sends a yes/no approval request to the user.
   *
   * Like requestInput(), this registers a PendingRequest. Van will not
   * proceed with the action until the user replies "yes" or "no".
   * Any reply that starts with "y" (case-insensitive) is treated as approval.
   *
   * @param action  - Short description of what Van wants to do
   * @param details - Fuller explanation of consequences and reasoning
   * @returns The ID of the newly created PendingRequest
   */
  async requestApproval(action: string, details: string): Promise<string> {
    const requestId = `req-approval-${Date.now()}`;
    const request: PendingRequest = {
      id: requestId,
      type: 'approval',
      question: `Do you approve: ${action}?`,
      context: details,
      createdAt: new Date(),
      status: 'pending',
    };

    this.pendingRequests.set(requestId, request);
    await this.persistRequest(request);

    const messageText = [
      `I want to take the following action and need your approval:`,
      ``,
      `Action: ${action}`,
      `Details: ${details}`,
      ``,
      `Please reply "yes" to approve or "no" to cancel. (Request ID: ${requestId})`,
    ].join('\n');

    await this.notifyUser(messageText, 'urgent');

    return requestId;
  }

  /**
   * Sends a periodic status update summarizing Van's current activity.
   *
   * This is a low-priority, fire-and-forget notification. It gives the user
   * a regular heartbeat so they know Van is still running, even when no
   * urgent interaction is needed.
   *
   * @param summary - Concise summary text to deliver
   */
  async sendStatusUpdate(summary: string): Promise<void> {
    await this.notifyUser(summary, 'low');
  }

  // ----------------------------------------------------------
  // INBOUND: USER → VAN
  // ----------------------------------------------------------

  /**
   * Polls OpenClaw for new messages from the user and processes each one.
   *
   * This method is called at the START of every cognitive cycle, before the
   * OBSERVE phase. It returns a list of commands extracted from the messages
   * so the CognitiveEngine can act on them immediately.
   *
   * Non-command messages (free-form text) are checked against pending requests
   * and resolve them if a match is found.
   *
   * @returns Array of command strings recognized in the incoming messages
   *          (e.g. ["stop"], ["pause"], ["status"]). Empty if no commands found.
   */
  async checkForMessages(): Promise<string[]> {
    const raw = await this.adapter.pollMessages(this.lastMessageTimestamp);

    if (raw.length === 0) return [];

    const commands: string[] = [];

    for (const raw_msg of raw) {
      const message: UserMessage = {
        id: raw_msg.id,
        content: raw_msg.content,
        receivedAt: new Date(raw_msg.receivedAt),
        platform: raw_msg.platform,
      };

      // Advance the timestamp cursor so we do not process this message again
      if (
        this.lastMessageTimestamp === undefined ||
        message.receivedAt > this.lastMessageTimestamp
      ) {
        this.lastMessageTimestamp = message.receivedAt;
      }

      const command = await this.processUserMessage(message);
      if (command !== null) {
        commands.push(command);
      }
    }

    return commands;
  }

  /**
   * Processes a single inbound user message.
   *
   * The method first checks whether the message is a control command. If not,
   * it attempts to match the message to an open pending request and resolves it.
   *
   * @param message - The inbound message to process
   * @returns The command name if a command was recognized, otherwise null
   */
  async processUserMessage(message: UserMessage): Promise<string | null> {
    const normalized = message.content.trim().toLowerCase();

    console.log(`[HumanChannel] Received message from user: "${message.content.slice(0, 80)}"`);

    // ---- Control commands ----
    if (this.isStopCommand(normalized)) {
      this._stopRequested = true;
      await this.notifyUser('Understood. Initiating graceful shutdown...', 'normal');
      return 'stop';
    }

    if (this.isPauseCommand(normalized)) {
      this._isPaused = true;
      await this.notifyUser('Paused. I will hold at the end of the current cycle. Reply "resume" to continue.', 'normal');
      return 'pause';
    }

    if (this.isResumeCommand(normalized)) {
      this._isPaused = false;
      await this.notifyUser('Resuming cognitive loop now.', 'normal');
      return 'resume';
    }

    if (this.isStatusCommand(normalized)) {
      // The caller (CognitiveEngine) will generate the full status reply.
      // We just signal that it was requested.
      return 'status';
    }

    if (this.isGoalsCommand(normalized)) {
      return 'goals';
    }

    // ---- Pending request reply ----
    // Check if this message resolves any open pending request.
    // Strategy: match by explicit request ID prefix, then by most-recent pending.
    const resolvedRequest = this.matchToPendingRequest(message.content);

    if (resolvedRequest !== null) {
      await this.resolveRequest(resolvedRequest, message.content);
      return null; // Not a command — it was a data reply
    }

    // Unrecognized message — acknowledge receipt so the user knows Van heard them
    await this.notifyUser(
      `I received your message: "${message.content.slice(0, 100)}". I don't have a pending request that matches it right now. Type "status" to see what I'm working on.`,
      'normal'
    );

    return null;
  }

  // ----------------------------------------------------------
  // PENDING REQUEST MANAGEMENT
  // ----------------------------------------------------------

  /**
   * Checks whether a pending request identified by `requestId` has been
   * resolved by the user.
   *
   * Used by the CognitiveEngine to check if a blocked goal can be unblocked.
   *
   * @param requestId - The ID returned by requestInput() or requestApproval()
   * @returns The resolved value (user's reply text), or null if still pending/expired
   */
  getResolvedValue(requestId: string): string | null {
    const request = this.pendingRequests.get(requestId);
    if (!request || request.status !== 'resolved') return null;
    return request.resolvedValue ?? null;
  }

  /**
   * Returns true if the approval request was answered with "yes".
   * Returns false for "no", null for still-pending, and false for expired.
   *
   * @param requestId - The ID returned by requestApproval()
   */
  isApproved(requestId: string): boolean | null {
    const request = this.pendingRequests.get(requestId);
    if (!request) return null;
    if (request.status === 'pending') return null;
    if (request.status === 'expired') return false;
    if (request.status === 'resolved' && request.resolvedValue !== undefined) {
      return request.resolvedValue.trim().toLowerCase().startsWith('y');
    }
    return false;
  }

  /**
   * Expires any pending requests that have exceeded the timeout window.
   * Should be called periodically (e.g. once per cycle) to keep the map tidy.
   */
  async expireStaleRequests(): Promise<void> {
    const now = Date.now();

    for (const [id, request] of this.pendingRequests) {
      if (
        request.status === 'pending' &&
        now - request.createdAt.getTime() > PENDING_REQUEST_TIMEOUT_MS
      ) {
        request.status = 'expired';
        this.pendingRequests.set(id, request);
        await this.persistRequest(request);

        console.warn(`[HumanChannel] Request ${id} expired without a reply.`);

        await this.notifyUser(
          `Request "${request.question.slice(0, 80)}" expired without a reply. I will proceed without the information.`,
          'low'
        );
      }
    }
  }

  /**
   * Returns all pending (unresolved) requests currently active.
   */
  getPendingRequests(): PendingRequest[] {
    return Array.from(this.pendingRequests.values()).filter(r => r.status === 'pending');
  }

  // ----------------------------------------------------------
  // STATUS GENERATION
  // ----------------------------------------------------------

  /**
   * Builds and sends a comprehensive status update to the user.
   *
   * Called by CognitiveEngine when the user sends a "status" command,
   * and also automatically every 10 cycles as a heartbeat.
   *
   * @param state       - The current VanState snapshot
   * @param cycleNumber - The current cycle number
   */
  async sendFullStatusUpdate(state: VanState, cycleNumber: number): Promise<void> {
    const goals = state.activeGoals;
    const topGoals = goals.slice(0, 5);

    const goalLines = topGoals.length > 0
      ? topGoals.map(g =>
          `  • ${g.title} [${g.status}] — ${g.progress.percentage}% complete`
        ).join('\n')
      : '  (no active goals)';

    const pendingCount = this.getPendingRequests().length;
    const pendingSuffix = pendingCount > 0
      ? `\n\nWaiting for your reply on ${pendingCount} request(s).`
      : '';

    const summary = [
      `Status update — Cycle ${cycleNumber}`,
      ``,
      `Active goals (${goals.length} total):`,
      goalLines,
      ``,
      `Working memory: ${state.workingMemory.currentStatus}`,
      `Emotional state: ${state.personalityState.activeEmotionalStates[0]?.state ?? 'neutral'}`,
      pendingSuffix,
    ].join('\n');

    await this.notifyUser(summary, 'low');
  }

  /**
   * Builds and sends a summary of all active goals to the user.
   *
   * Called when the user sends a "goals" command.
   *
   * @param goals - The list of active goals to summarize
   */
  async sendGoalsSummary(goals: Goal[]): Promise<void> {
    if (goals.length === 0) {
      await this.notifyUser('No active goals right now.', 'low');
      return;
    }

    const lines = goals.map((g, i) =>
      `${i + 1}. [${g.level.toUpperCase()}] ${g.title}\n   Status: ${g.status} | Progress: ${g.progress.percentage}%\n   Next: ${g.progress.nextAction.slice(0, 100)}`
    );

    const message = `Active goals (${goals.length}):\n\n${lines.join('\n\n')}`;
    await this.notifyUser(message, 'low');
  }

  // ----------------------------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------------------------

  /**
   * Matches an inbound message text to an open pending request.
   *
   * Matching strategy (in priority order):
   * 1. Explicit request ID — if the message contains "req-input-..." or
   *    "req-approval-..." that matches a pending request, use that one.
   * 2. Implicit — if only one pending request is open, use it regardless
   *    of content (the user almost certainly is replying to it).
   *
   * Returns null if no match can be determined.
   */
  private matchToPendingRequest(messageContent: string): PendingRequest | null {
    const pending = this.getPendingRequests();
    if (pending.length === 0) return null;

    // Strategy 1: explicit ID in the message
    for (const request of pending) {
      if (messageContent.includes(request.id)) {
        return request;
      }
    }

    // Strategy 2: single open request — assume this is the reply
    if (pending.length === 1 && pending[0] !== undefined) {
      return pending[0];
    }

    // Ambiguous — cannot match safely
    return null;
  }

  /**
   * Marks a pending request as resolved with the user's reply text.
   */
  private async resolveRequest(request: PendingRequest, replyText: string): Promise<void> {
    request.status = 'resolved';
    request.resolvedValue = replyText;
    request.resolvedAt = new Date();

    this.pendingRequests.set(request.id, request);
    await this.persistRequest(request);

    console.log(`[HumanChannel] Request ${request.id} resolved by user reply.`);

    await this.notifyUser(
      `Got it — thank you! I'll use your response to continue with the blocked task.`,
      'normal'
    );
  }

  /**
   * Persists a PendingRequest to the MemorySystem so it survives restarts.
   *
   * The memory entry uses a special title prefix so initialize() can
   * identify and restore it during startup.
   */
  private async persistRequest(request: PendingRequest): Promise<void> {
    try {
      await this.memory.writeExperience({
        category: 'system',
        title: `${PENDING_REQUEST_MEMORY_PREFIX}${JSON.stringify(request)}`,
        content: `PendingRequest persisted at ${new Date().toISOString()}`,
        tags: ['human-channel', 'pending-request', request.type],
        importance: 3,
        relatedMemoryIds: [],
      });
    } catch (error) {
      // Non-fatal — the in-memory map still tracks the request
      console.warn('[HumanChannel] Failed to persist pending request to memory:', error);
    }
  }

  // ---- Command detection helpers ----

  private isStopCommand(normalized: string): boolean {
    return normalized === 'stop' || normalized === 'shutdown' || normalized === 'quit';
  }

  private isPauseCommand(normalized: string): boolean {
    return normalized === 'pause' || normalized === 'hold' || normalized === 'wait';
  }

  private isResumeCommand(normalized: string): boolean {
    return normalized === 'resume' || normalized === 'continue' || normalized === 'go';
  }

  private isStatusCommand(normalized: string): boolean {
    return (
      normalized === 'status' ||
      normalized === 'como vai' ||
      normalized === 'o que esta fazendo' ||
      normalized === 'what are you doing' ||
      normalized === 'update' ||
      normalized === 'progress'
    );
  }

  private isGoalsCommand(normalized: string): boolean {
    return (
      normalized === 'goals' ||
      normalized === 'objetivos' ||
      normalized === 'metas' ||
      normalized === 'list goals'
    );
  }
}
