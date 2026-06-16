import {
  ExpressionProfiles,
  clampExpressionWeight,
  getExpressionProfile,
} from './ExpressionProfiles.js';

/**
 * ExpressionController — VRM 表情與眨眼系統
 *
 * 支援 three-vrm 0.6.7 的 blendShapeProxy API
 * 功能：自動眨眼（隨機間隔）、語意表情 profile 與低階 blendshape fade
 */
function finiteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeFadeSec(value, fallback = 0.25) {
  return Math.max(0.01, finiteNumber(value, fallback));
}

function normalizeDurationSec(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num / 1000 : null;
}

export class ExpressionController {
  /** @type {import('three-vrm').VRM|null} */
  #vrm = null;
  #blinkTimerId = null;
  #blinkPhase = 'open'; // 'open' | 'closing' | 'opening'
  #blinkWeight = 0;
  #minInterval = 2000;
  #maxInterval = 6000;

  // Expression fade
  #currentExpr = null;
  #currentValues = {};
  #targetValues = {};
  #managedExpressions = new Set();
  #fadeDuration = 0.3; // seconds
  #holdRemaining = null;

  /**
   * 綁定 VRM 模型
   * @param {object} vrm - three-vrm VRM instance
   */
  setVrm(vrm) {
    this.#vrm = vrm;
    this.#blinkPhase = 'open';
    this.#blinkWeight = 0;
    this.#currentExpr = null;
    this.#currentValues = {};
    this.#targetValues = {};
    this.#managedExpressions = new Set();
    this.#holdRemaining = null;
  }

  /**
   * 開啟自動眨眼
   * @param {number} [minMs=2000] - 最短間隔 (ms)
   * @param {number} [maxMs=6000] - 最長間隔 (ms)
   */
  startAutoBlink(minMs = 2000, maxMs = 6000) {
    this.#minInterval = minMs;
    this.#maxInterval = maxMs;
    this.stopAutoBlink();
    this.#scheduleBlink();
  }

  /** 停止自動眨眼 */
  stopAutoBlink() {
    if (this.#blinkTimerId !== null) {
      clearTimeout(this.#blinkTimerId);
      this.#blinkTimerId = null;
    }
  }

  /**
   * 設定低階表情 blendshape；若傳入 semantic profile name，會自動轉給 setProfile()。
   * @param {string|null} name - 表情名稱 ('joy'|'angry'|'sorrow'|'fun'|null) 或 profile name
   * @param {number} [weight=1.0] - 目標權重 0~1
   * @param {number} [fadeSec=0.3] - 淡入時間
   */
  set(name, weight = 1.0, fadeSec = 0.3) {
    if (name === null || name === undefined || name === '') {
      return this.clear({ fadeSec });
    }

    const profileKey = String(name).trim().toLowerCase();
    if (ExpressionProfiles[profileKey]) {
      return this.setProfile(profileKey, {
        intensity: weight,
        fadeSec,
      });
    }

    const blendShapeName = String(name);
    return this.#activateTargets(
      blendShapeName,
      { [blendShapeName]: clampExpressionWeight(weight) },
      fadeSec,
      null
    );
  }

  /**
   * 設定語意表情 profile；未知名稱固定 fallback neutral。
   * @param {string} name
   * @param {object} [options]
   * @param {number} [options.intensity=1]
   * @param {number} [options.fadeSec=0.25]
   * @param {number} [options.duration] - 毫秒；到期後自動淡出
   * @returns {object}
   */
  setProfile(name, options = {}) {
    const profile = getExpressionProfile(name);
    const intensity = clampExpressionWeight(options.intensity, 1);
    const values = {};

    for (const [key, value] of Object.entries(profile.values)) {
      values[key] = clampExpressionWeight(value * intensity, 0);
    }

    return this.#activateTargets(
      profile.name,
      values,
      options.fadeSec ?? 0.25,
      normalizeDurationSec(options.duration)
    );
  }

  /**
   * 清除目前表情，將 ExpressionController 管理過的 blendshape 淡出到 0。
   * @param {object} [options]
   * @param {number} [options.fadeSec=0.25]
   */
  clear(options = {}) {
    this.#holdRemaining = null;
    return this.#activateTargets(
      null,
      {},
      options.fadeSec ?? 0.25,
      null
    );
  }

  /** @deprecated 用 setProfile()/set() 代替 */
  setExpression(name, weightOrOptions, fadeSec) {
    if (weightOrOptions && typeof weightOrOptions === 'object') {
      return this.setProfile(name, weightOrOptions);
    }
    return this.set(name, weightOrOptions, fadeSec);
  }

  /** 取得當前表情名 */
  get currentExpression() {
    return this.#currentExpr;
  }

  /** 取得眨眼狀態（debug 用） */
  get blinkWeight() {
    return this.#blinkWeight;
  }

  /**
   * 每幀更新（由 VrmMascot.update 呼叫）
   * @param {number} dt - deltaTime in seconds
   */
  update(dt) {
    if (!this.#vrm) return;
    this.#updateBlink(dt);
    this.#updateExpression(dt);
  }

  // ── Private ──────────────────────────────

  #scheduleBlink() {
    const delay = this.#minInterval + Math.random() * (this.#maxInterval - this.#minInterval);
    this.#blinkTimerId = setTimeout(() => {
      this.#triggerBlink();
      this.#scheduleBlink();
    }, delay);
  }

  #triggerBlink() {
    if (this.#blinkPhase !== 'open') return; // 上次還沒結束
    this.#blinkPhase = 'closing';
    this.#blinkWeight = 0;
  }

  #updateBlink(dt) {
    if (this.#blinkPhase === 'open') return;

    const speed = dt / 0.07; // 70ms per phase

    if (this.#blinkPhase === 'closing') {
      this.#blinkWeight = Math.min(1, this.#blinkWeight + speed);
      if (this.#blinkWeight >= 1) {
        this.#blinkPhase = 'opening';
      }
    } else if (this.#blinkPhase === 'opening') {
      this.#blinkWeight = Math.max(0, this.#blinkWeight - speed);
      if (this.#blinkWeight <= 0) {
        this.#blinkPhase = 'open';
        this.#blinkWeight = 0;
      }
    }

    // 套用到 VRM blendShapeProxy
    const proxy = this.#vrm.blendShapeProxy;
    if (proxy) {
      proxy.setValue('blink', this.#blinkWeight);
    }
  }

  #updateExpression(dt) {
    const proxy = this.#vrm.blendShapeProxy;
    if (!proxy) return;

    if (this.#holdRemaining !== null) {
      this.#holdRemaining -= dt;
      if (this.#holdRemaining <= 0) {
        this.clear({ fadeSec: this.#fadeDuration });
      }
    }

    const fadeSpeed = dt / Math.max(0.01, this.#fadeDuration);

    for (const key of Array.from(this.#managedExpressions)) {
      const current = this.#currentValues[key] || 0;
      const target = this.#targetValues[key] || 0;
      let next = current;

      if (current < target) {
        next = Math.min(target, current + fadeSpeed);
      } else if (current > target) {
        next = Math.max(target, current - fadeSpeed);
      }
      if (Math.abs(next) < 0.000001) {
        next = 0;
      }

      this.#currentValues[key] = next;
      proxy.setValue(key, next);

      if (next === 0 && target === 0) {
        delete this.#currentValues[key];
        delete this.#targetValues[key];
        this.#managedExpressions.delete(key);
      }
    }
  }

  #activateTargets(name, values, fadeSec, durationSec) {
    const managed = new Set([
      ...Array.from(this.#managedExpressions),
      ...Object.keys(values || {}),
    ]);

    const targets = {};
    for (const key of managed) {
      targets[key] = clampExpressionWeight(values?.[key], 0);
    }

    this.#currentExpr = name;
    this.#targetValues = targets;
    this.#managedExpressions = managed;
    this.#fadeDuration = normalizeFadeSec(fadeSec, 0.25);
    this.#holdRemaining = durationSec;

    return {
      name,
      values: { ...targets },
    };
  }

  /** 清理資源 */
  dispose() {
    this.stopAutoBlink();
    this.#vrm = null;
    this.#currentValues = {};
    this.#targetValues = {};
    this.#managedExpressions = new Set();
    this.#holdRemaining = null;
  }
}
