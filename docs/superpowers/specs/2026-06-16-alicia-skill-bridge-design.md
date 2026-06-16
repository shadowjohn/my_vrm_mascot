# Alicia Skill Bridge Design

## Summary

M18 adds a local HTTP-first Skill Bridge for Alicia. External tools such as Codex can enqueue a mascot action through `server.py`; the running browser runtime polls the queue, executes the action through the existing `mascot.performIntent()` / `mascot.act()` path, then posts the result back to the server.

This phase turns Alicia from a local demo character into a tool-callable runtime target. It does not move development to 3wa.tw and does not introduce WebSocket, SSE, or online deployment yet.

## Goals

- Define a stable action input schema for tool callers.
- Add local HTTP endpoints for enqueue, runtime polling, and result reporting.
- Keep an in-memory action queue in `server.py`.
- Let `mascot_runtime.html` poll for pending actions.
- Map bridge actions onto existing runtime APIs: `performIntent()`, `act()`, and current semantic policy metadata.
- Return deterministic result payloads that callers can inspect.
- Add focused Node/Python tests for schema validation, queue lifecycle, result storage, and runtime mapping contracts.
- Keep all VRM / VRMA binary handling local-only and out of this phase.

## Non-Goals

- No WebSocket.
- No Server-Sent Events.
- No Motion Mine changes.
- No online 3wa deployment.
- No public internet-facing bridge endpoint.
- No local VRMA binary management.
- No persistent queue database.
- No authentication system beyond local-only guardrails in this phase.
- No direct skeleton, blendshape, or VRMA playback control from the HTTP action schema.

## Current Context

The project already has the pieces M18 should reuse:

- `server.py` exposes local Flask APIs for VRMA samples, motion profiles, mining logs, and mock LLM intent output.
- `mascot_runtime.html` already calls `/api/llm`, receives intent JSON, and runs `mascot.performIntent(result)`.
- `VrmMascot.performIntent()` normalizes tool-like intents and builds trace data.
- `ActingBridge.js` translates trace/talking lifecycle into one acting state.
- `ActingPolicy.js` maps acting state to expression, clip, gaze, and semantic motion metadata.
- Semantic motion data exists in `examples/m6_7_vrma_samples/review/semantic_motion_library.json` and registry JSON.

M18 should be a thin bridge over this existing runtime path. It should not create a parallel mascot controller.

## Recommended Approach

Use HTTP polling first:

```text
Tool / caller
  -> POST /api/alicia/actions
  -> receives actionId

Browser runtime
  -> GET /api/alicia/actions/next
  -> executes action
  -> POST /api/alicia/actions/:id/result

Tool / caller
  -> GET /api/alicia/actions/:id/result
  -> receives completed / failed result
```

Why this approach:

- It fits the existing Flask server and static browser runtime.
- It is easy to test without a browser-controlled WebSocket server.
- It works locally and can later be wrapped by 3wa demo infrastructure.
- It keeps M19 free to choose SSE or WebSocket without changing the action schema.

Rejected alternatives:

- WebSocket-first: better realtime behavior, but it couples schema design to deployment and connection lifecycle too early.
- Direct browser-only API: simple for demos, but external tools cannot reliably call a page without a server-side queue.
- Runtime-specific JavaScript snippets: too brittle and hard to expose as a skill contract.

## API Surface

### `POST /api/alicia/actions`

Called by external tools to enqueue an Alicia action.

Request:

```json
{
  "intent": "thinking",
  "emotion": "focused",
  "semanticMotionId": "thinking_chin",
  "message": "正在分析資料",
  "source": "codex",
  "priority": "normal",
  "trace": {
    "task": "runtime_binding"
  }
}
```

Required fields:

- `intent`: semantic acting or intent name.
- `source`: caller identifier, such as `codex`, `local_script`, or `3wa_demo`.

Optional fields:

- `message`: text Alicia should say or surface in runtime state.
- `emotion`: caller hint for expression mapping.
- `semanticMotionId`: preferred semantic motion id; the runtime may fall back.
- `priority`: `low`, `normal`, or `high`; default is `normal`.
- `trace`: JSON object for caller metadata.
- `ttlMs`: optional queue expiry. Default should be 30000 ms. Maximum should be capped.

Immediate response:

```json
{
  "ok": true,
  "actionId": "act_20260616_001",
  "status": "queued",
  "queuePosition": 1
}
```

Validation errors return `400`:

```json
{
  "ok": false,
  "error": "intent_required"
}
```

### `GET /api/alicia/actions/next`

Called by the active browser runtime. It claims the next queued action.

Runtime request query parameters:

```text
runtimeId=local-runtime-001
capabilities=performIntent,act,semanticMotion
```

Empty response:

```json
{
  "ok": true,
  "action": null
}
```

Claimed response:

```json
{
  "ok": true,
  "action": {
    "actionId": "act_20260616_001",
    "intent": "thinking",
    "emotion": "focused",
    "semanticMotionId": "thinking_chin",
    "message": "正在分析資料",
    "source": "codex",
    "priority": "normal",
    "trace": {
      "task": "runtime_binding"
    },
    "createdAt": "2026-06-16T12:00:00+08:00",
    "claimedAt": "2026-06-16T12:00:01+08:00"
  }
}
```

Claiming moves the action from `queued` to `dispatched`.

### `POST /api/alicia/actions/:id/result`

Called by the runtime after execution.

Request:

```json
{
  "ok": true,
  "runtimeId": "local-runtime-001",
  "selectedMotion": "Thinking.vrma",
  "fallback": false,
  "runtimeState": "speaking",
  "details": {
    "actedState": "thinking",
    "pickedSemanticMotionId": "thinking_chin"
  }
}
```

Response:

```json
{
  "ok": true,
  "actionId": "act_20260616_001",
  "status": "completed",
  "selectedMotion": "Thinking.vrma",
  "fallback": false,
  "runtimeState": "speaking"
}
```

Failed runtime execution:

```json
{
  "ok": false,
  "runtimeId": "local-runtime-001",
  "error": "runtime_mapping_failed",
  "runtimeState": "error"
}
```

The server stores failed results as `status: "failed"` and keeps the error string.

### `GET /api/alicia/actions/:id/result`

Called by tools that need to check completion.

Queued or dispatched response:

```json
{
  "ok": true,
  "actionId": "act_20260616_001",
  "status": "dispatched",
  "result": null
}
```

Completed response:

```json
{
  "ok": true,
  "actionId": "act_20260616_001",
  "status": "completed",
  "result": {
    "selectedMotion": "Thinking.vrma",
    "fallback": false,
    "runtimeState": "speaking"
  }
}
```

Unknown id returns `404`:

```json
{
  "ok": false,
  "error": "action_not_found"
}
```

## Queue Lifecycle

States:

```text
queued -> dispatched -> completed
queued -> expired
dispatched -> failed
dispatched -> expired
```

Rules:

- Queue is in memory only.
- `high` priority actions are claimed before `normal`; `normal` before `low`.
- Within the same priority, FIFO order is preserved.
- Every action gets `createdAt`, `updatedAt`, and optional `claimedAt`, `completedAt`, or `failedAt`.
- Expired actions are skipped by `/next` and reported as `expired`.
- Duplicate `actionId` is never accepted from clients; the server creates ids.
- The queue should cap total retained actions to avoid unbounded memory growth.

## Runtime Mapping

The runtime poller in `mascot_runtime.html` should convert claimed actions into one existing runtime path:

```js
mascot.performIntent({
  intent: action.intent,
  text: action.message,
  emotion: action.emotion,
  source: action.source,
  semanticMotionId: action.semanticMotionId,
  bridgeActionId: action.actionId,
  trace: [
    { step: 'bridge_receive', status: 'done', source: action.source },
    { step: 'execute_tool', status: 'running', detail: action.trace?.task || '' }
  ]
});
```

Mapping rules:

- `message` maps to `text`.
- `source` stays top-level and is also copied into trace metadata.
- `priority` affects queue order only; it does not affect acting policy.
- `semanticMotionId` is a preference, not a hard requirement.
- If `intent` maps to an acting state (`thinking`, `running`, `success`, `warning`, `failed`), the runtime may call `mascot.act(state)` directly when no speech/text behavior is needed.
- If `message` exists, prefer `performIntent()` so the current talking lifecycle remains active.

Result extraction should prefer existing runtime metadata:

- `runtimeState`: current debug/runtime state when available.
- `selectedMotion`: selected semantic motion variant or legacy clip name when available.
- `fallback`: true when the requested `semanticMotionId` was not used.

## Error Handling

- Invalid action schema returns `400`.
- Unknown result id returns `404`.
- Posting a result for a completed action returns `409`.
- Runtime execution exceptions are reported to the result endpoint with `ok: false`.
- If the runtime is not open, actions remain queued until TTL expiry.
- The bridge must not crash if semantic motion JSON is unavailable; it should fall back to existing acting policy.

## Local Safety

M18 remains local-only:

- Flask continues to bind to `127.0.0.1`.
- No CORS opening is required for M18.
- No public token is introduced in M18.
- Requests should cap field lengths to prevent large payloads.
- `trace` must be stored as metadata only; it must not be executed.

M19 will revisit public demo safety, including origin allowlist, simple token, proxy behavior, and transport choice.

## Test Plan

Python tests in `scratch/test_alicia_skill_bridge_api.py` should cover:

- Enqueue valid action returns `actionId`, `queued`, and queue position.
- Missing `intent` returns `400`.
- Missing `source` returns `400`.
- Invalid `priority` returns `400` with `error: "invalid_priority"`.
- `/next` returns high priority before normal and FIFO within the same priority.
- `/next` returns `action: null` when the queue is empty.
- Posting success result changes status to `completed`.
- Posting failed result changes status to `failed`.
- `GET /result` returns queued, dispatched, completed, failed, and unknown-id states correctly.
- Expired actions are skipped.

Node contract tests should cover:

- `mascot_runtime.html` includes polling configuration for `/api/alicia/actions/next`.
- Runtime mapping uses `mascot.performIntent()` for actions with `message`.
- Runtime mapping can call `mascot.act()` for state-only actions.
- Result reporting calls `/api/alicia/actions/:id/result`.
- The bridge path does not import or modify Motion Mine.

Manual smoke:

1. Start `run_server.bat`.
2. Open `http://127.0.0.1:8765/mascot_runtime.html`.
3. `POST /api/alicia/actions` with a `thinking` action.
4. Confirm Alicia reacts in the browser.
5. `GET /api/alicia/actions/:id/result`.
6. Confirm `status: "completed"` and a runtime result payload.

## M19 Follow-Up

M19 should build on the same schema:

- 3wa demo page uses a release build.
- Online bridge can use SSE or WebSocket after the M18 schema is stable.
- Add origin allowlist and a simple deployment token.
- Keep public demo read-only for motion data.
- Do not expose local mining assets.

## Acceptance Criteria

- The spec defines all M18 endpoints and payloads.
- Queue lifecycle is explicit and testable.
- Runtime mapping reuses existing Alicia APIs.
- M18 excludes WebSocket, SSE, Motion Mine, online deployment, and local VRMA management.
- The design can move directly into an implementation plan with scope blockers already closed.
