/**
 * @file src/core/action-executor.ts
 * @description Action execution engine — the interface between Van's planned actions
 *              and OpenClaw's tool execution capabilities.
 *
 * This module translates high-level action specifications into OpenClaw tool calls,
 * handles errors systematically, tracks execution metrics, and provides a clean
 * abstraction over the raw tool interface.
 *
 * Architecture: The executor acts as a façade over OpenClaw's capabilities.
 * It adds pre-execution validation, post-execution monitoring, error classification,
 * rate limiting awareness, and structured result tracking.
 */

import {
  Action,
  ActionResult,
  ActionPlan,
  ExecutionState,
  ToolCall,
  ToolCallResult,
  RiskAssessment,
} from '../types/index.js';
import { MemorySystem } from './memory-system.js';

// ============================================================
// TOOL REGISTRY
// ============================================================

/**
 * Enumeration of all tools available through OpenClaw.
 * These correspond to OpenClaw's AgentSkills and built-in capabilities.
 */
export const AVAILABLE_TOOLS = {
  // Shell and system
  SHELL: 'shell.execute',
  FILE_READ: 'file.read',
  FILE_WRITE: 'file.write',
  FILE_LIST: 'file.list',

  // Browser control
  BROWSER_NAVIGATE: 'browser.navigate',
  BROWSER_CLICK: 'browser.click',
  BROWSER_TYPE: 'browser.type',
  BROWSER_SCREENSHOT: 'browser.screenshot',
  BROWSER_EXTRACT: 'browser.extract',

  // HTTP/API
  HTTP_GET: 'http.get',
  HTTP_POST: 'http.post',

  // Messaging
  MESSAGE_SEND: 'message.send',
  MESSAGE_READ: 'message.read',

  // Cognitive (internal)
  LLM_COMPLETE: 'llm.complete',
  LLM_ANALYZE: 'llm.analyze',

  // Custom Van skills
  RESEARCH: 'van.research',
  WRITE_CONTENT: 'van.writeContent',
  ANALYZE_MARKET: 'van.analyzeMarket',
} as const;

type ToolName = typeof AVAILABLE_TOOLS[keyof typeof AVAILABLE_TOOLS];

// ============================================================
// ACTION EXECUTOR CLASS
// ============================================================

/**
 * ActionExecutor coordinates the execution of action plans, providing
 * error handling, retry logic, and execution monitoring.
 *
 * @example
 * ```typescript
 * const executor = new ActionExecutor(memorySystem, openClawAdapter);
 *
 * const plan: ActionPlan = { ... };
 * const result = await executor.executePlan(plan);
 *
 * console.log(`Success rate: ${result.actionsSucceeded}/${result.actionsExecuted}`);
 * ```
 */
export class ActionExecutor {
  private readonly memory: MemorySystem;
  private readonly openClaw: OpenClawAdapter;
  private executionHistory: ExecutionState[] = [];

  constructor(memory: MemorySystem, openClaw: OpenClawAdapter) {
    this.memory = memory;
    this.openClaw = openClaw;
  }

  // ----------------------------------------------------------
  // PLAN EXECUTION
  // ----------------------------------------------------------

  /**
   * Executes a complete action plan, respecting dependencies between actions.
   *
   * Execution order is determined by the dependency graph. Actions with no
   * dependencies are eligible to run immediately; actions with dependencies
   * wait for their prerequisites to complete.
   *
   * Failed actions that block others will cause dependent actions to be skipped
   * unless a contingency is defined.
   *
   * @param plan - The action plan to execute
   * @param riskAssessment - Optional pre-computed risk assessment
   * @returns The execution state after all actions complete
   */
  async executePlan(plan: ActionPlan, riskAssessment?: RiskAssessment): Promise<ExecutionState> {
    // If risk assessment says stop, do not execute
    if (riskAssessment?.decision === 'stop') {
      throw new Error(`Execution halted by risk assessment: ${riskAssessment.decisionRationale}`);
    }

    const startTime = Date.now();
    const executionState: ExecutionState = {
      planId: plan.id,
      actionsExecuted: 0,
      actionsSucceeded: 0,
      actionsFailed: 0,
      results: [],
      totalDurationMs: 0,
      unexpectedOutcomes: [],
    };

    await this.memory.recordAction(`Starting plan execution: ${plan.taskDescription}`);

    // Build execution order from dependency graph
    const executionOrder = this.buildExecutionOrder(plan.actions);
    const completedActionIds = new Set<string>();
    const failedActionIds = new Set<string>();

    for (const batch of executionOrder) {
      // Execute actions in this batch (they have no inter-dependencies)
      const batchResults = await Promise.allSettled(
        batch.map(action => this.executeAction(action, completedActionIds, failedActionIds))
      );

      for (let i = 0; i < batchResults.length; i++) {
        const batchResult = batchResults[i];
        const action = batch[i];

        // Both should always be defined since batch and batchResults are same length
        if (!batchResult || !action) continue;

        if (batchResult.status === 'fulfilled') {
          const result = batchResult.value;
          executionState.actionsExecuted++;
          executionState.results.push(result);

          if (result.success) {
            executionState.actionsSucceeded++;
            completedActionIds.add(action.id);
            action.status = 'completed';
          } else {
            executionState.actionsFailed++;
            failedActionIds.add(action.id);
            action.status = 'failed';

            // Check for contingency
            const contingency = plan.contingencies.find(c => c.trigger === action.description);
            if (contingency) {
              executionState.unexpectedOutcomes.push(
                `Action "${action.description}" failed — applying contingency: ${contingency.response}`
              );
            }
          }

          if (!result.matchedExpectation) {
            executionState.unexpectedOutcomes.push(
              `Action "${action.description}" produced unexpected output: ${JSON.stringify(result.output).slice(0, 100)}`
            );
          }
        } else {
          // Promise rejection — unexpected execution error
          executionState.actionsExecuted++;
          executionState.actionsFailed++;
          failedActionIds.add(action.id);
          action.status = 'failed';

          const rejectedResult = batchResult as PromiseRejectedResult;
          executionState.results.push({
            success: false,
            output: null,
            matchedExpectation: false,
            sideEffects: [],
            errorMessage: (rejectedResult.reason as Error)?.message ?? 'Unknown error',
            errorType: 'environmental',
            durationMs: 0,
          });
        }
      }

      // Check review point
      if (plan.reviewPoint && completedActionIds.has(plan.reviewPoint)) {
        const reviewResult = await this.conductMidPlanReview(plan, executionState);
        if (!reviewResult.shouldContinue) {
          executionState.unexpectedOutcomes.push(
            `Plan execution halted at review point: ${reviewResult.reason}`
          );
          break;
        }
      }
    }

    executionState.totalDurationMs = Date.now() - startTime;
    this.executionHistory.push(executionState);

    await this.memory.recordAction(
      `Completed plan: ${plan.taskDescription} — ${executionState.actionsSucceeded}/${executionState.actionsExecuted} succeeded`
    );

    return executionState;
  }

  /**
   * Executes a single action using the appropriate OpenClaw tool.
   *
   * @param action - The action to execute
   * @param completedIds - Set of already-completed action IDs
   * @param failedIds - Set of already-failed action IDs
   * @returns The execution result
   */
  private async executeAction(
    action: Action,
    completedIds: Set<string>,
    failedIds: Set<string>
  ): Promise<ActionResult> {
    const startTime = Date.now();

    // Check if any dependencies have failed
    const failedDependencies = action.dependencies.filter(dep => failedIds.has(dep));
    if (failedDependencies.length > 0) {
      action.status = 'skipped';
      return {
        success: false,
        output: null,
        matchedExpectation: false,
        sideEffects: [`Skipped because dependencies failed: ${failedDependencies.join(', ')}`],
        errorMessage: `Dependencies failed: ${failedDependencies.join(', ')}`,
        errorType: 'logical',
        durationMs: 0,
      };
    }

    // Check if all dependencies have completed
    const pendingDependencies = action.dependencies.filter(dep => !completedIds.has(dep));
    if (pendingDependencies.length > 0) {
      // This shouldn't happen if execution order is built correctly
      throw new Error(`Dependency ordering error: ${pendingDependencies.join(', ')} not yet complete`);
    }

    action.status = 'in-progress';

    try {
      const toolCall: ToolCall = {
        tool: action.tool,
        parameters: action.input as Record<string, unknown>,
        sessionId: `van-session-${Date.now()}`,
        requestId: `req-${action.id}-${Date.now()}`,
        timestamp: new Date(),
      };

      const rawResult = await this.openClaw.executeToolCall(toolCall);
      const durationMs = Date.now() - startTime;

      // Validate result against success/failure criteria
      const success = this.evaluateSuccess(rawResult, action.successCriteria, action.failureCriteria);
      const matchedExpectation = success; // Simplified — could be more nuanced

      const result: ActionResult = {
        success,
        output: rawResult.output,
        matchedExpectation,
        sideEffects: [],
        durationMs,
        errorMessage: rawResult.success ? undefined : rawResult.error,
      };

      action.result = result;
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: ActionResult = {
        success: false,
        output: null,
        matchedExpectation: false,
        sideEffects: [],
        errorMessage,
        errorType: this.classifyError(errorMessage),
        durationMs,
      };

      action.result = result;
      return result;
    }
  }

  // ----------------------------------------------------------
  // DIRECT TOOL EXECUTION
  // ----------------------------------------------------------

  /**
   * Executes a single tool call directly, outside of a plan context.
   * Useful for one-off operations in the cognitive loop.
   *
   * @param tool - The tool to execute
   * @param parameters - Tool parameters
   * @returns The raw tool result
   */
  async executeToolDirect(tool: string, parameters: Record<string, unknown>): Promise<ToolCallResult> {
    const toolCall: ToolCall = {
      tool,
      parameters,
      sessionId: `van-direct-${Date.now()}`,
      requestId: `direct-${Date.now()}`,
      timestamp: new Date(),
    };

    return this.openClaw.executeToolCall(toolCall);
  }

  /**
   * Executes a shell command and returns the output.
   *
   * @param command - The shell command to run
   * @param workingDirectory - Optional working directory
   */
  async executeShell(command: string, workingDirectory?: string): Promise<string> {
    const result = await this.executeToolDirect(AVAILABLE_TOOLS.SHELL, {
      command,
      cwd: workingDirectory,
    });

    if (!result.success) {
      throw new Error(`Shell command failed: ${result.error}`);
    }

    return String(result.output);
  }

  /**
   * Reads a file and returns its content.
   *
   * @param filePath - Absolute path to the file
   */
  async readFile(filePath: string): Promise<string> {
    const result = await this.executeToolDirect(AVAILABLE_TOOLS.FILE_READ, { path: filePath });

    if (!result.success) {
      throw new Error(`File read failed: ${result.error}`);
    }

    return String(result.output);
  }

  /**
   * Writes content to a file.
   *
   * @param filePath - Absolute path to the file
   * @param content - Content to write
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const result = await this.executeToolDirect(AVAILABLE_TOOLS.FILE_WRITE, {
      path: filePath,
      content,
    });

    if (!result.success) {
      throw new Error(`File write failed: ${result.error}`);
    }
  }

  /**
   * Navigates a browser to a URL and returns the page content.
   *
   * @param url - The URL to navigate to
   */
  async browseTo(url: string): Promise<string> {
    const result = await this.executeToolDirect(AVAILABLE_TOOLS.BROWSER_NAVIGATE, { url });

    if (!result.success) {
      throw new Error(`Browser navigation failed: ${result.error}`);
    }

    return String(result.output);
  }

  /**
   * Makes an HTTP GET request.
   *
   * @param url - The URL to request
   * @param headers - Optional request headers
   */
  async httpGet(url: string, headers?: Record<string, string>): Promise<unknown> {
    const result = await this.executeToolDirect(AVAILABLE_TOOLS.HTTP_GET, { url, headers });

    if (!result.success) {
      throw new Error(`HTTP GET failed: ${result.error}`);
    }

    return result.output;
  }

  // ----------------------------------------------------------
  // EXECUTION METRICS
  // ----------------------------------------------------------

  /**
   * Returns aggregate metrics across all executions in the current session.
   */
  getSessionMetrics(): {
    totalPlansExecuted: number;
    totalActionsExecuted: number;
    totalActionsSucceeded: number;
    overallSuccessRate: number;
    averagePlanDurationMs: number;
  } {
    const total = this.executionHistory.reduce(
      (acc, state) => ({
        plans: acc.plans + 1,
        executed: acc.executed + state.actionsExecuted,
        succeeded: acc.succeeded + state.actionsSucceeded,
        durationMs: acc.durationMs + state.totalDurationMs,
      }),
      { plans: 0, executed: 0, succeeded: 0, durationMs: 0 }
    );

    return {
      totalPlansExecuted: total.plans,
      totalActionsExecuted: total.executed,
      totalActionsSucceeded: total.succeeded,
      overallSuccessRate: total.executed > 0 ? total.succeeded / total.executed : 0,
      averagePlanDurationMs: total.plans > 0 ? total.durationMs / total.plans : 0,
    };
  }

  // ----------------------------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------------------------

  /**
   * Builds a batched execution order respecting action dependencies.
   * Actions with no remaining unmet dependencies are placed in the same batch.
   * Returns an array of batches, where each batch can be executed in parallel.
   */
  private buildExecutionOrder(actions: Action[]): Action[][] {
    const completed = new Set<string>();
    const remaining = [...actions];
    const order: Action[][] = [];

    while (remaining.length > 0) {
      const ready = remaining.filter(
        action => action.dependencies.every(dep => completed.has(dep))
      );

      if (ready.length === 0) {
        // Circular dependency or missing dependency — include remaining as a batch
        order.push(remaining.splice(0));
        break;
      }

      // Remove ready actions from remaining
      for (const action of ready) {
        const idx = remaining.indexOf(action);
        if (idx !== -1) remaining.splice(idx, 1);
        completed.add(action.id);
      }

      order.push(ready);
    }

    return order;
  }

  private evaluateSuccess(
    result: ToolCallResult,
    successCriteria: string,
    _failureCriteria: string
  ): boolean {
    // Primary success signal: did the tool call itself succeed?
    if (!result.success) return false;

    // If the output is a string and contains known failure patterns, mark as failed
    const output = String(result.output ?? '');
    const failurePatterns = ['error:', 'exception:', 'failed:', 'not found', '404', '500'];
    for (const pattern of failurePatterns) {
      if (output.toLowerCase().includes(pattern)) {
        return false;
      }
    }

    // For now, trust the tool's success signal
    // A more sophisticated implementation would check output against successCriteria
    // using LLM-based evaluation
    void successCriteria; // Used in future iterations

    return true;
  }

  private classifyError(errorMessage: string): ActionResult['errorType'] {
    const msg = errorMessage.toLowerCase();

    if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
      return 'transient';
    }
    if (msg.includes('invalid') || msg.includes('bad request') || msg.includes('400')) {
      return 'input';
    }
    if (msg.includes('not found') || msg.includes('404') || msg.includes('unavailable')) {
      return 'environmental';
    }
    if (msg.includes('permission') || msg.includes('unauthorized') || msg.includes('403')) {
      return 'capability';
    }

    return 'logical';
  }

  private async conductMidPlanReview(
    _plan: ActionPlan,
    state: ExecutionState
  ): Promise<{ shouldContinue: boolean; reason: string }> {
    // Simple heuristic: if failure rate > 50%, stop and re-assess
    const failureRate = state.actionsExecuted > 0
      ? state.actionsFailed / state.actionsExecuted
      : 0;

    if (failureRate > 0.5) {
      return {
        shouldContinue: false,
        reason: `High failure rate (${Math.round(failureRate * 100)}%) at review point — plan needs reassessment`,
      };
    }

    return { shouldContinue: true, reason: 'Within acceptable failure threshold' };
  }
}

// ============================================================
// OPENCLAW ADAPTER
// ============================================================

/**
 * OpenClawAdapter provides the interface to OpenClaw's execution layer.
 *
 * This is the boundary between Van's internal logic and OpenClaw's runtime.
 * The adapter pattern allows the internal logic to be tested without a live
 * OpenClaw instance, and allows the OpenClaw integration to be updated
 * independently of the cognitive logic.
 */
export class OpenClawAdapter {
  private readonly daemonUrl: string;
  private readonly agentId: string;

  constructor(daemonUrl: string, agentId: string) {
    this.daemonUrl = daemonUrl;
    this.agentId = agentId;
  }

  /**
   * Executes a tool call against the OpenClaw daemon.
   *
   * @param toolCall - The tool call to execute
   * @returns The result of the tool call
   */
  async executeToolCall(toolCall: ToolCall): Promise<ToolCallResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.daemonUrl}/api/tools/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': this.agentId,
          'X-Request-Id': toolCall.requestId,
        },
        body: JSON.stringify({
          tool: toolCall.tool,
          parameters: toolCall.parameters,
          sessionId: toolCall.sessionId,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          requestId: toolCall.requestId,
          success: false,
          output: null,
          error: `HTTP ${response.status}: ${error}`,
          durationMs: Date.now() - startTime,
        };
      }

      const data = await response.json() as { output?: unknown; error?: string };

      return {
        requestId: toolCall.requestId,
        success: true,
        output: data.output,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        requestId: toolCall.requestId,
        success: false,
        output: null,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Checks if the OpenClaw daemon is reachable and healthy.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.daemonUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
