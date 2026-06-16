/**
 * PoseDirector — 語意演出 policy 的表現層執行器。
 *
 * 這層只套用 ActingPolicy 的結果，不保存 intent/tool 業務邏輯，
 * 也不寫骨架角度或 blendshape 權重細節。
 */

import {
  resolveActingPolicyForState,
  resolveActingPolicyForTrace,
} from './ActingPolicy.js';

/**
 * @deprecated Phase M5 後請使用 resolveActingPolicyForState()
 * @param {string} state
 * @param {object} [meta]
 * @returns {object|null}
 */
export function resolvePoseDirectiveForState(state, meta = {}) {
  return resolveActingPolicyForState(state, meta);
}

/**
 * @deprecated Phase M5 後請使用 resolveActingPolicyForTrace()
 * @param {string} step
 * @param {object} [patch]
 * @param {object} [intentObj]
 * @returns {object|null}
 */
export function resolvePoseDirectiveForTrace(step, patch = {}, intentObj = {}) {
  return resolveActingPolicyForTrace(step, patch, intentObj);
}

export class PoseDirector {
  #motion = null;
  #expression = null;
  #lookAt = null;
  #lastPose = 'none';
  #lastPolicy = null;

  constructor(controllers = {}) {
    this.setControllers(controllers);
  }

  setControllers(controllers = {}) {
    this.#motion = controllers.motion || null;
    this.#expression = controllers.expression || null;
    this.#lookAt = controllers.lookAt || null;
  }

  get lastPose() {
    return this.#lastPose;
  }

  get lastPolicy() {
    return this.#lastPolicy;
  }

  act(state, meta = {}) {
    return this.applyDirective(resolveActingPolicyForState(state, meta));
  }

  actForIntentResult(status, intentObj = {}) {
    return this.act(status, {
      action: intentObj.action,
      tool: intentObj.tool,
      reason: intentObj.reason,
    });
  }

  poseForState(state, meta = {}) {
    return this.act(state, meta);
  }

  poseForIntentResult(status, intentObj = {}) {
    return this.actForIntentResult(status, intentObj);
  }

  applyDirective(policy) {
    if (!policy) return null;

    const expression = policy.expression;
    if (expression?.name) {
      if (this.#expression?.setProfile) {
        this.#expression.setProfile(expression.name, {
          intensity: expression.intensity ?? 1,
          duration: expression.duration,
          fadeSec: expression.fadeSec ?? 0.25,
        });
      } else if (this.#expression?.set) {
        this.#expression.set(
          expression.name,
          expression.intensity ?? 1,
          expression.fadeSec ?? 0.25
        );
      }
    }

    const motionName = typeof policy.motion === 'string'
      ? policy.motion
      : policy.motion?.name;
    if (motionName && this.#motion?.play) {
      this.#motion.play(motionName);
    }

    const clipName = typeof policy.clip === 'string'
      ? policy.clip
      : policy.clip?.name;
    if (clipName) {
      if (this.#motion?.playClip) {
        this.#motion.playClip(clipName);
      } else if (this.#motion?.play) {
        this.#motion.play(clipName);
      }
    }

    const gaze = policy.gaze;
    if (gaze?.mode && this.#lookAt?.setTarget) {
      this.#lookAt.setTarget(gaze.mode, gaze.data);
    }

    this.#lastPolicy = policy;
    this.#lastPose = clipName || motionName || expression?.name || 'none';
    return policy;
  }
}
