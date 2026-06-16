# Phase M6: Conversation Acting Bridge Design

## Summary

Phase M6 adds a bridge between real conversation/runtime events and the existing mascot acting stack.

The goal is not to add new expressions, motion clips, or gaze modes. The goal is to make Alicia automatically act according to current system state:

```text
Tool trace / Talking state
  -> ActingBridge
  -> ActingPolicy
  -> mascot.act(state)
```

This turns the M1-M5 acting layers from manually callable APIs into an automatic Agent Avatar Runtime.

## Boundaries

`ActionQueue` remains runtime-only. It updates tool trace and does not know character behavior.

`VrmMascot.updateIntentTrace()` remains the trace update hook. It forwards trace changes to `ActingBridge` but does not choose expression, clip, or gaze directly.

`TalkingState` emits conversation state to `ActingBridge`, such as `thinking`, `speaking`, and `idle`. It does not choose expression, clip, or gaze directly.

`ActingBridge` normalizes runtime/talking events into one semantic acting state.

`ActingPolicy.js` remains the only source for mapping acting states to expression, clip, and gaze.

Controllers remain presentation-only:

- `ExpressionController`: blendshape / fade / blink
- `MotionController`: natural pose / idle micro motion / clip playback
- `LookAtController`: gaze target and mode

## New Component

Add:

```text
js/ActingBridge.js
scratch/test_acting_bridge.mjs
```

`ActingBridge` public API:

```js
bridge.onTraceUpdate(intentObj);
bridge.onTalkingState(state);
bridge.resolve();
```

`ActingBridge` output is restricted to one operation:

```js
mascot.act(state);
```

The `state` value must be a normalized acting state such as `thinking`, `running`, `done`, `blocked`, `failed`, `speaking`, or `idle`.

It must not call:

```js
setExpression();
playClip();
setGaze();
```

## Event Sources

### Trace Events

`updateIntentTrace(intentObj, step, patch)` updates `intentObj.trace`, then forwards the intent object to:

```js
actingBridge.onTraceUpdate(intentObj);
```

Trace normalization:

| Trace condition | Acting state |
| --- | --- |
| `execute_tool: pending` | `thinking` |
| `execute_tool: running` | `running` |
| `execute_tool: done` | `done` |
| `execute_tool: failed` | `failed` |
| `policy_check: blocked` | `blocked` |

### Talking Events

Talking lifecycle emits:

| Talking state | Acting state candidate |
| --- | --- |
| `thinking` | `thinking` |
| `speaking` | `speaking` |
| `idle` | `idle` |

Talking events are lower priority than active tool runtime states.

## Priority

When multiple event sources are active, `ActingBridge.resolve()` chooses the highest priority state:

```text
failed / blocked / warning
> running
> speaking
> thinking
> idle
```

Important behavior:

- `speaking` must not override active `running`.
- `done` and `success` are transient acting states.
- After a transient `done` / `success` act, the bridge can return to `idle` when no higher-priority source is active.

## Data Flow

```text
User asks question
  -> Mascot enters thinking
  -> TalkingState emits thinking
  -> ActingBridge resolves thinking
  -> mascot.act('thinking')

Tool starts
  -> ActionQueue updates trace execute_tool: running
  -> VrmMascot.updateIntentTrace forwards trace
  -> ActingBridge resolves running
  -> mascot.act('running')

Tool succeeds
  -> ActionQueue updates trace execute_tool: done
  -> ActingBridge resolves done
  -> mascot.act('done')
  -> bridge later resolves idle when conversation/runtime is clear

Tool fails
  -> ActionQueue updates trace execute_tool: failed
  -> ActingBridge resolves failed
  -> mascot.act('failed')
```

## Non-Goals

M6 does not:

- Add expression profiles
- Add motion clips
- Add gaze modes
- Change `contextDigest`
- Change `/api/llm`
- Move acting policy into `ActionQueue`
- Let controllers know about runtime/tool states
- Introduce JSON policy loading

## Test Plan

Add `scratch/test_acting_bridge.mjs`.

Required tests:

- `execute_tool: pending` resolves `thinking`.
- `execute_tool: running` resolves `running`.
- `execute_tool: done` resolves `done`.
- `policy_check: blocked` resolves `blocked`.
- `execute_tool: failed` resolves `failed`.
- `talking: speaking` resolves `speaking` when no tool state is active.
- `talking: speaking` does not override active `running`.
- `failed / blocked / warning` override `running`.
- `done` / `success` are transient and can return to `idle`.
- Bridge only calls `mascot.act(state)`.
- Bridge does not call expression, motion, or gaze controllers directly.

Regression tests:

```text
node scratch/test_acting_bridge.mjs
node scratch/test_acting_policy.mjs
node scratch/test_expression_layer.mjs
node scratch/test_semantic_pose_binding.mjs
node scratch/test_trace_timeline.mjs
node scratch/test_suggested_actions.mjs
python -m py_compile server.py
```

## Acceptance Criteria

M6 is complete when:

- Tool trace events automatically drive mascot acting state through `ActingBridge`.
- Talking state events automatically drive mascot acting state through `ActingBridge`.
- `ActionQueue` remains unaware of character expressions, motion clips, and gaze.
- `ActingPolicy.js` remains the only semantic acting mapping.
- `speaking` does not override tool `running`.
- `done` / `success` plays as a short transient state and can return to `idle`.
- Existing M1-M5 behavior remains intact.
