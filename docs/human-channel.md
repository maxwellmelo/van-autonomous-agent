# human-channel.ts — Change Documentation

## Files Modified

| File | Change type |
|---|---|
| `src/core/human-channel.ts` | **New file** |
| `src/types/index.ts` | Added types |
| `src/core/action-executor.ts` | Added two methods to `OpenClawAdapter` |
| `src/core/cognitive-engine.ts` | Integrated HumanChannel into loop |
| `src/index.ts` | Wired HumanChannel in dependency injection |

---

## Why this change was made

Van was fully autonomous but entirely silent. There was no way for the human
operator to know what it was working on, to provide credentials it needed, to
approve high-stakes actions, or to stop it gracefully without killing the process.

The HumanChannel module closes this gap. It turns Van from a black box into a
communicative agent that proactively keeps the user informed and asks for help
exactly when it needs it — without blocking its own cognitive loop while waiting.

---

## Architecture

```
User (Telegram / Slack / etc.)
       |              ^
       |              |
       v              |
  OpenClaw daemon (port 18789)
       |              ^
       |              |
       v              |
  OpenClawAdapter.pollMessages()
  OpenClawAdapter.sendMessage()
       |              ^
       |              |
       v              |
     HumanChannel
       |              ^
       |              |
       v              |
  CognitiveEngine (processInboundMessages, notifyUser)
```

Van never communicates directly with Telegram or Slack. All messages go through
the OpenClaw daemon, which handles platform routing. Van only knows one logical
channel: `"user"`.

---

## `src/types/index.ts` — Before / After

### Before
No types existed for user communication.

### After — three new types added

```typescript
// How urgent a notification is
type NotificationPriority = 'low' | 'normal' | 'urgent';

// A message received from the user
interface UserMessage {
  id: string;
  content: string;
  receivedAt: Date;
  platform: string;
  replyToRequestId?: string;
}

// A request Van sent that is waiting for a user reply
interface PendingRequest {
  id: string;
  type: 'input' | 'approval';
  question: string;
  context: string;
  blockedGoalId?: string;
  createdAt: Date;
  status: 'pending' | 'resolved' | 'expired';
  resolvedValue?: string;
  resolvedAt?: Date;
}
```

**Advantage:** All three types are in the central types file and shared across
the codebase without duplication.

---

## `src/core/action-executor.ts` — Before / After

### Before
`OpenClawAdapter` had two methods: `executeToolCall()` and `healthCheck()`.

### After — two new methods added

```typescript
// Send a message through OpenClaw's messaging channel
async sendMessage(channel: string, content: string): Promise<boolean>

// Poll for new messages from the user since a given timestamp
async pollMessages(since?: Date): Promise<Array<{
  id: string; content: string; receivedAt: string; platform: string;
}>>
```

**Advantage:** Messaging is colocated with the rest of the OpenClaw HTTP
communication. The adapter pattern means these methods can be stubbed in tests
without any real network calls.

**Why separate from `executeToolCall`:** Messaging is a fire-and-forget
side-channel, not a tool execution. It has a different API endpoint, different
error semantics (best-effort, never throw), and different timeout requirements.
Keeping it separate avoids polluting the tool-execution result types.

---

## `src/core/human-channel.ts` — New file

### Public API

| Method | Direction | Purpose |
|---|---|---|
| `notifyUser(msg, priority)` | Van → User | General notification |
| `requestInput(question, context, goalId?)` | Van → User | Ask for free-form answer |
| `requestApproval(action, details)` | Van → User | Ask yes/no |
| `sendStatusUpdate(summary)` | Van → User | Low-priority heartbeat |
| `sendFullStatusUpdate(state, cycle)` | Van → User | Detailed status on demand |
| `sendGoalsSummary(goals)` | Van → User | Goal list on demand |
| `checkForMessages()` | User → Van | Poll + process, return commands |
| `processUserMessage(message)` | User → Van | Handle one message |
| `getResolvedValue(requestId)` | Internal | Check if request answered |
| `isApproved(requestId)` | Internal | Check yes/no result |
| `expireStaleRequests()` | Internal | Cleanup timed-out requests |

### User commands recognized

| User sends | Van does |
|---|---|
| `status` / `como vai` / `progress` | Sends full status report |
| `goals` / `objetivos` / `metas` | Sends goal list |
| `stop` / `shutdown` / `quit` | Sets `stopRequested = true` |
| `pause` / `hold` / `wait` | Sets `isPaused = true` |
| `resume` / `continue` / `go` | Clears `isPaused` |
| Anything else | Matched to pending request or acknowledged |

### Non-blocking design

Van never awaits a reply. When `requestInput()` is called:
1. A `PendingRequest` is created with status `'pending'`
2. The question is sent to the user via `notifyUser()`
3. The caller marks the goal `'blocked'`
4. On each subsequent cycle, `checkForMessages()` checks for replies
5. When a reply arrives, `resolveRequest()` sets `status = 'resolved'`
6. The caller reads `getResolvedValue()` and unblocks the goal

If no reply arrives within 24 hours, `expireStaleRequests()` marks the request
expired and notifies the user. The goal can then decide whether to proceed
without the information or abandon.

### Persistence across restarts

Pending requests are serialized as JSON and written to the `MemorySystem` under
the `'system'` category with a title prefix of `pending-request:`. On startup,
`initialize()` reads these entries and re-hydrates the in-memory map, so a
process restart does not lose waiting requests.

---

## `src/core/cognitive-engine.ts` — Before / After

### Constructor — Before
```typescript
constructor(config: {
  memory, goalSystem, personality, executor,
  reflectionEngine, evolutionEngine, revenueEngine, worldModel,
  cycleIntervalMs?
})
```

### Constructor — After
```typescript
constructor(config: {
  memory, goalSystem, personality, executor,
  reflectionEngine, evolutionEngine, revenueEngine, worldModel,
  humanChannel,          // <-- new
  cycleIntervalMs?
})
```

### `initialize()` — After
Added `await this.humanChannel.initialize()` to restore persisted pending requests.

### `run()` loop — After (additions)

```typescript
// 1. Pause support — while paused, poll for "resume" every 5 s
while (this.humanChannel.isPaused && this.isRunning) {
  await this.humanChannel.checkForMessages();
}

// 2. Stop support — exit loop cleanly
if (this.humanChannel.stopRequested) {
  this.isRunning = false; break;
}

// 3. Periodic status every 10 cycles
if (cyclesRun % 10 === 0) {
  await this.humanChannel.sendFullStatusUpdate(this.state, cycleNumber);
}

// 4. Notify user on cycle error
await this.humanChannel.notifyUser(`Error: ${errorMessage}`, 'urgent');
```

### `executeCycle()` — After (additions)

```typescript
// PRE-CYCLE: message check before OBSERVE
await this.processInboundMessages(cycleNumber);
await this.humanChannel.expireStaleRequests();
```

### New private method: `processInboundMessages(cycleNumber)`

Dispatches recognized commands returned by `checkForMessages()`:
- `status` → calls `sendFullStatusUpdate`
- `goals` → calls `sendGoalsSummary`
- `stop` / `pause` / `resume` → handled by `run()` via flag properties

### Goal completion notifications

Both `generateActionPlan()` (for full goals) and `evolve()` (for micro-tasks)
now call `humanChannel.notifyUser()` when a goal reaches 100% completion, with
a reference to the next queued objective.

**Advantage:** The user always knows when something finishes without having to
ask, and always has the context of what comes next.

---

## `src/index.ts` — Before / After

### Before
```
Layer 4: OpenClawAdapter + ActionExecutor
Layer 5: CognitiveEngine
```

### After
```
Layer 4: OpenClawAdapter + ActionExecutor
Layer 5: HumanChannel (memory + openClawAdapter)
Layer 6: CognitiveEngine (all previous + humanChannel)
```

`humanChannel` is also included in the returned system object for potential
use by future modules or integration tests.

---

## TypeScript compliance

`tsc --noEmit` passes with zero errors. All types are explicit; no implicit
`any`. Strict null checks are satisfied throughout (optional properties are
guarded before access).
