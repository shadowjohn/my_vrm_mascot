import { ExpressionProfiles } from './ExpressionProfiles.js';
import { MotionClips } from './MotionClips.js';
import { pickSemanticMotion } from './SemanticMotionPicker.js';

export const ALLOWED_GAZE_MODES = Object.freeze(['mouse', 'point', 'none']);
export const ALLOWED_MOTION_NAMES = Object.freeze([
  'idle',
  'presenting',
]);

export const ACTING_POLICY_STATES = Object.freeze([
  'idle',
  'success',
  'done',
  'warning',
  'blocked',
  'thinking',
  'speaking',
  'pending',
  'running',
  'error',
  'failed',
]);

const ACTING_POLICIES = Object.freeze({
  idle: {
    state: 'idle',
    expression: { name: 'neutral', intensity: 1, fadeSec: 0.25 },
    motion: { name: 'idle' },
    gaze: { mode: 'none' },
  },
  success: {
    state: 'success',
    expression: { name: 'happy', intensity: 0.85, duration: 1200, fadeSec: 0.18 },
    clip: { name: 'victory' },
    gaze: { mode: 'mouse' },
  },
  done: {
    state: 'done',
    expression: { name: 'happy', intensity: 0.78, duration: 1200, fadeSec: 0.18 },
    clip: { name: 'wave' },
    gaze: { mode: 'mouse' },
  },
  warning: {
    state: 'warning',
    expression: { name: 'surprised', intensity: 0.72, duration: 1200, fadeSec: 0.18 },
    clip: { name: 'warning_nod' },
    gaze: { mode: 'mouse' },
  },
  blocked: {
    state: 'blocked',
    expression: { name: 'angry', intensity: 0.78, duration: 1200, fadeSec: 0.18 },
    clip: { name: 'warning_nod' },
    gaze: { mode: 'mouse' },
  },
  thinking: {
    state: 'thinking',
    expression: { name: 'thinking', intensity: 0.72, duration: 1600, fadeSec: 0.22 },
    motion: { name: 'idle' },
    gaze: { mode: 'mouse' },
  },
  speaking: {
    state: 'speaking',
  },
  pending: {
    state: 'pending',
    expression: { name: 'thinking', intensity: 0.72, duration: 1600, fadeSec: 0.22 },
    motion: { name: 'idle' },
    gaze: { mode: 'mouse' },
  },
  running: {
    state: 'running',
    expression: { name: 'thinking', intensity: 0.68, duration: 1400, fadeSec: 0.18 },
    motion: { name: 'presenting' },
    gaze: { mode: 'point', data: { x: -0.45, y: 0.05 } },
  },
  error: {
    state: 'error',
    expression: { name: 'sad', intensity: 0.82, duration: 1300, fadeSec: 0.18 },
    clip: { name: 'shake_head' },
    gaze: { mode: 'mouse' },
  },
  failed: {
    state: 'failed',
    expression: { name: 'sad', intensity: 0.82, duration: 1300, fadeSec: 0.18 },
    clip: { name: 'shake_head' },
    gaze: { mode: 'mouse' },
  },
});

let semanticMotionLibrary = null;

export function configureSemanticMotionLibrary(library) {
  semanticMotionLibrary = library && Array.isArray(library.motions) ? library : null;
  return Boolean(semanticMotionLibrary);
}

function clonePolicy(policy, meta = {}) {
  if (!policy) return null;
  return {
    state: policy.state,
    expression: policy.expression ? { ...policy.expression } : undefined,
    clip: policy.clip ? { ...policy.clip } : undefined,
    motion: policy.motion ? { ...policy.motion } : undefined,
    gaze: policy.gaze
      ? {
          ...policy.gaze,
          data: policy.gaze.data ? { ...policy.gaze.data } : undefined,
        }
      : undefined,
    semanticMotionId: policy.semanticMotionId,
    meta: { ...meta },
  };
}

function normalizeStateName(state) {
  const value = String(state || '').toLowerCase();
  if (value === 'timeout') return 'failed';
  if (value === 'error') return 'error';
  if (value === 'blocked') return 'blocked';
  if (value === 'warning') return 'warning';
  if (value === 'complete') return 'done';
  return ACTING_POLICIES[value] ? value : 'idle';
}

function mapStateToSemanticIntent(state) {
  if (state === 'blocked' || state === 'warning') return 'warning';
  if (state === 'pending' || state === 'thinking' || state === 'running') return 'thinking';
  if (state === 'done' || state === 'success') return 'success';
  if (state === 'failed' || state === 'error') return 'surprised';
  return state;
}

function semanticTriggerForState(state, meta = {}) {
  if (meta.reason) return meta.reason;
  if (state === 'blocked') return '政策阻擋';
  if (state === 'warning') return '警告';
  if (state === 'running') return '查詢中';
  if (state === 'pending' || state === 'thinking') return '查詢中';
  if (state === 'done' || state === 'success') return '完成';
  if (state === 'failed' || state === 'error') return '意外結果';
  return meta.trigger || state;
}

function toolStatusForState(state, meta = {}) {
  if (meta.status) return meta.status;
  if (state === 'blocked') return 'blocked';
  if (state === 'running') return 'running';
  if (state === 'pending' || state === 'thinking') return 'pending';
  if (state === 'done' || state === 'success') return 'done';
  if (state === 'failed' || state === 'error') return 'failed';
  return undefined;
}

function buildSemanticPickerRequest(policy, meta = {}) {
  const state = policy?.state || 'idle';
  const request = {
    intent: mapStateToSemanticIntent(state),
    trigger: semanticTriggerForState(state, meta),
    context: {
      toolStatus: toolStatusForState(state, meta),
      action: meta.action,
      tool: meta.tool,
      reason: meta.reason,
      selectedFeature: meta.selectedFeature,
    },
  };
  return request;
}

function recordPickedSemanticMotion(meta = {}, pickedSemanticMotion) {
  if (!pickedSemanticMotion) return;
  const intentObj = meta.intent || meta.intentObj;
  if (intentObj && typeof intentObj === 'object') {
    intentObj.pickedSemanticMotion = { ...pickedSemanticMotion };
  }
}

function enrichPolicyWithSemanticMotion(policy, meta = {}) {
  if (!policy || !semanticMotionLibrary) return policy;
  if (policy.state === 'idle' || policy.state === 'speaking') return policy;

  const pickedSemanticMotion = pickSemanticMotion(
    buildSemanticPickerRequest(policy, meta),
    semanticMotionLibrary
  );
  if (!pickedSemanticMotion) return policy;

  const nextPolicy = {
    ...policy,
    semanticMotionId: pickedSemanticMotion.motionId,
    meta: {
      ...(policy.meta || {}),
      pickedSemanticMotion,
    },
  };
  recordPickedSemanticMotion(meta, pickedSemanticMotion);
  return nextPolicy;
}

export function resolveActingPolicyForState(state, meta = {}) {
  const policy = clonePolicy(ACTING_POLICIES[normalizeStateName(state)] || ACTING_POLICIES.idle, meta);
  return enrichPolicyWithSemanticMotion(policy, meta);
}

export function resolveActingPolicyForTrace(step, patch = {}, intentObj = {}) {
  const status = String(patch.status || '').toLowerCase();
  if (!status) return null;

  if (step === 'policy_check' && status === 'blocked') {
    return resolveActingPolicyForState('blocked', {
      step,
      status,
      reason: patch.reason,
      action: intentObj.action,
      tool: intentObj.tool,
      intentObj,
    });
  }

  if (step !== 'execute_tool') {
    return null;
  }

  if (status === 'pending') {
    return resolveActingPolicyForState('pending', {
      step,
      status,
      action: intentObj.action,
      tool: intentObj.tool,
      intentObj,
    });
  }
  if (status === 'running') {
    return resolveActingPolicyForState('running', {
      step,
      status,
      action: intentObj.action,
      tool: intentObj.tool,
      intentObj,
    });
  }
  if (status === 'done') {
    return resolveActingPolicyForState('done', {
      step,
      status,
      action: intentObj.action,
      tool: intentObj.tool,
      intentObj,
    });
  }
  if (status === 'failed') {
    return resolveActingPolicyForState('failed', {
      step,
      status,
      reason: patch.reason,
      action: intentObj.action,
      tool: intentObj.tool,
      intentObj,
    });
  }

  return null;
}

export function validateActingPolicy(policy) {
  const issues = [];
  if (!policy || typeof policy !== 'object') {
    return ['policy_missing'];
  }

  if (policy.expression && !ExpressionProfiles[policy.expression.name]) {
    issues.push(`unknown_expression:${policy.expression.name}`);
  }
  if (policy.clip && !MotionClips[policy.clip.name]) {
    issues.push(`unknown_clip:${policy.clip.name}`);
  }
  if (policy.motion && !ALLOWED_MOTION_NAMES.includes(policy.motion.name)) {
    issues.push(`unknown_motion:${policy.motion.name}`);
  }
  if (policy.gaze && !ALLOWED_GAZE_MODES.includes(policy.gaze.mode)) {
    issues.push(`unknown_gaze:${policy.gaze.mode}`);
  }

  return issues;
}
