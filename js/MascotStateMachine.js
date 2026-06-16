/**
 * MascotStateMachine — 角色狀態機（State Pattern）
 *
 * 核心設計：
 *   每個狀態是獨立的 class，擁有 onEnter / onExit / update。
 *   dispatch(name) 切換狀態，update(dt) 每幀驅動。
 *
 * 用法：
 *   mascot.dispatch("greeting");
 *   mascot.dispatch("talking", { text: "你好" });
 *   mascot.dispatch("idle");
 *
 * 未來 LLM 接入：
 *   LLM 輸出 intent → dispatch(intent.state, intent.params) → 角色自動反應
 *
 * 新增狀態只需：
 *   class MyState extends MascotState { ... }
 *   stateMachine.register(new MyState());
 */

// ══════════════════════════════════════════════
//  StateContext — 狀態可存取的共用環境
// ══════════════════════════════════════════════

class StateContext {
  #machine;
  #mascot;

  constructor(machine, mascot) {
    this.#machine = machine;
    this.#mascot = mascot;
  }

  /** @returns {import('./MotionController.js').MotionController} */
  get motion() { return this.#mascot.motion; }

  /** @returns {import('./ExpressionController.js').ExpressionController} */
  get expression() { return this.#mascot.expression; }

  /** @returns {import('./LookAtController.js').LookAtController} */
  get lookAt() { return this.#mascot.lookAt; }

  /** @returns {import('./VrmMascot.js').VrmMascot} */
  get mascot() { return this.#mascot; }

  /** 切換到另一個狀態 */
  transition(stateName, params) {
    this.#machine.dispatch(stateName, params);
  }

  /** 取得 VRM blendShapeProxy（版本隔離） */
  getProxy() {
    return this.#mascot._getBlendShapeProxy();
  }

  /** 顯示對話泡泡 */
  showBubble(text) {
    this.#machine.onSay?.(text);
  }

  /** 隱藏對話泡泡 */
  hideBubble() {
    this.#machine.onSay?.(null);
  }

  /**
   * 將對話狀態交給 ActingBridge；StateMachine 不直接知道表情 / clip / gaze 策略。
   * @param {string} state
   * @param {object} [meta]
   * @returns {object|null}
   */
  notifyTalkingState(state, meta = {}) {
    return this.#mascot.notifyTalkingState?.(state, meta) || null;
  }
}

// ══════════════════════════════════════════════
//  MascotState — 狀態基底類別
// ══════════════════════════════════════════════

class MascotState {
  onComplete = null;
  onCancel = null;

  /** 狀態名稱（子類別必須覆寫） */
  get name() { return 'unknown'; }

  /**
   * 進入狀態
   * @param {StateContext} ctx
   * @param {object} [params] - dispatch 傳入的參數
   */
  onEnter(ctx, params) {
    this.onComplete = params?.onComplete ?? null;
    this.onCancel = params?.onCancel ?? null;
  }

  /** 正常播放完成，觸發完成回調並切回 idle */
  finish(ctx) {
    const cb = this.onComplete;
    this.onComplete = null;
    this.onCancel = null;
    ctx.transition('idle');
    cb?.();
  }

  /** 被外力中斷，觸發取消回調 */
  cancel(ctx) {
    const cb = this.onCancel;
    this.onComplete = null;
    this.onCancel = null;
    ctx.transition('idle');
    cb?.();
  }

  /**
   * 離開狀態
   * @param {StateContext} ctx
   */
  onExit(ctx) {
    // 離開時清除回調，避免重複觸發
    this.onComplete = null;
    this.onCancel = null;
  }

  /**
   * 每幀更新（可用於自動轉場）
   * @param {StateContext} ctx
   * @param {number} dt - deltaTime (seconds)
   */
  update(ctx, dt) {}
}

// ══════════════════════════════════════════════
//  具體狀態實作
// ══════════════════════════════════════════════

class IdleState extends MascotState {
  #idleTime = 0;
  #nextTriggerTime = 8;

  get name() { return 'idle'; }

  onEnter(ctx, params) {
    super.onEnter(ctx, params);
    const talkingResult = ctx.notifyTalkingState('idle', { source: 'idle_state' });
    if (!talkingResult || talkingResult.state === 'idle') {
      ctx.motion.play('idle');
      ctx.expression.set(null);
    }
    this.#idleTime = 0;
    this.#nextTriggerTime = 8 + Math.random() * 7; // 8~15 秒隨機觸發
  }

  update(ctx, dt) {
    // 嚴格閒置自主微動作觸發條件：
    // 1. 使用者沒有在拖拽操作 3D 攝影機鏡頭
    // 2. 佇列沒有在執行，且為空
    // 3. 當前肢體動作處於 idle
    if (
      !ctx.mascot.isUserInteracting &&
      ctx.mascot.queue.length === 0 &&
      !ctx.mascot.queue.isExecuting &&
      ctx.motion.currentAction === 'idle'
    ) {
      this.#idleTime += dt;
      if (this.#idleTime >= this.#nextTriggerTime) {
        this.#idleTime = 0;
        this.#nextTriggerTime = 8 + Math.random() * 7;
        this.#triggerAutoBehavior(ctx);
      }
    } else {
      this.#idleTime = 0;
    }
  }

  #triggerAutoBehavior(ctx) {
    const behaviors = ['happy_blink', 'smile', 'look_away'];
    const chosen = behaviors[Math.floor(Math.random() * behaviors.length)];
    console.log('[IdleState] Auto behavior triggered:', chosen);

    if (chosen === 'happy_blink') {
      ctx.expression.set('fun', 0.5, 0.15);
      setTimeout(() => {
        if (ctx.mascot.state.currentState === 'idle') {
          ctx.expression.set(null, 0, 0.25);
        }
      }, 1000);
    } else if (chosen === 'smile') {
      ctx.expression.set('joy', 0.4, 0.3);
      setTimeout(() => {
        if (ctx.mascot.state.currentState === 'idle') {
          ctx.expression.set(null, 0, 0.4);
        }
      }, 2000);
    } else if (chosen === 'look_away') {
      const rx = (Math.random() - 0.5) * 0.8;
      const ry = (Math.random() - 0.5) * 0.4;
      ctx.lookAt.setTarget('point', { x: rx, y: ry });
      setTimeout(() => {
        // 只有在仍然是 idle 且沒有被新佇列佔用時才看回滑鼠
        if (ctx.mascot.state.currentState === 'idle' && !ctx.mascot.queue.isExecuting) {
          ctx.lookAt.setTarget('mouse');
        }
      }, 1500);
    }
  }
}

// ── 打招呼 ──────────────────────────────

class GreetingState extends MascotState {
  get name() { return 'greeting'; }

  onEnter(ctx, params) {
    super.onEnter(ctx, params);
    ctx.motion.play('wave');
  }

  update(ctx, dt) {
    if (ctx.motion.currentAction === 'idle') {
      this.finish(ctx);
    }
  }
}

// ── 思考 ────────────────────────────────

class ThinkingState extends MascotState {
  #elapsed = 0;
  #duration = 1.6;

  get name() { return 'thinking'; }

  onEnter(ctx, params) {
    super.onEnter(ctx, params);
    this.#elapsed = 0;
    ctx.notifyTalkingState('thinking', { source: 'thinking_state' });
  }

  onExit(ctx) {
    super.onExit(ctx);
    ctx.notifyTalkingState('idle', { source: 'thinking_exit' });
  }

  update(ctx, dt) {
    this.#elapsed += dt;
    if (this.#elapsed >= this.#duration) {
      this.finish(ctx);
    }
  }
}

// ── 說話 ────────────────────────────────

class TalkingState extends MascotState {
  #text = '';
  #elapsed = 0;
  #duration = 0;

  // Lip sync 元音控制
  #vowels = ['a', 'i', 'u', 'e', 'o'];
  #currentVowel = 'a';
  #vowelTimer = 0;
  #vowelWeights = { a: 0, i: 0, u: 0, e: 0, o: 0 };

  get name() { return 'talking'; }

  onEnter(ctx, params) {
    super.onEnter(ctx, params);
    this.#text = params?.text ?? '';
    // 依據字數動態調整說話長度，語速比率更合理
    this.#duration = Math.max(0.8, Math.min(this.#text.length * 0.15, 5.0));
    this.#elapsed = 0;
    this.#vowelTimer = 0;
    this.#currentVowel = 'a';
    this.#vowels.forEach(v => this.#vowelWeights[v] = 0);

    ctx.showBubble(this.#text);

    // M6：TalkingState 只回報對話生命週期；語意演出狀態由 ActingBridge / trace 裁決。
    const talkingResult = ctx.notifyTalkingState('speaking', {
      source: 'talking_state',
      text: this.#text,
    });
    const canApplyLegacyPose = !talkingResult || talkingResult.state === 'speaking';

    if (canApplyLegacyPose && params?.emotion) {
      ctx.expression.set(params.emotion, 0.8, 0.3);
    }
    if (canApplyLegacyPose && params?.motion) {
      ctx.motion.play(params.motion);
    }
  }

  update(ctx, dt) {
    this.#elapsed += dt;
    this.#vowelTimer += dt;

    // 每 120ms 隨機切換元音，並有概率「閉嘴」停頓
    if (this.#vowelTimer >= 0.12) {
      this.#vowelTimer = 0;
      const r = Math.random();
      if (r < 0.22) {
        this.#currentVowel = null; // 閉嘴/呼吸暫停
      } else {
        this.#currentVowel = this.#vowels[Math.floor(Math.random() * this.#vowels.length)];
      }
    }

    const proxy = ctx.getProxy();
    if (proxy) {
      const targetWeights = { a: 0, i: 0, u: 0, e: 0, o: 0 };
      if (this.#currentVowel) {
        // 當多元音張合度隨 Sine 曲線震盪，模擬更自然的口腔肌肉伸縮
        targetWeights[this.#currentVowel] = 0.45 + Math.sin(this.#elapsed * 24) * 0.25;
      }

      // 平滑漸變元音
      for (const v of this.#vowels) {
        this.#vowelWeights[v] += (targetWeights[v] - this.#vowelWeights[v]) * 0.28;
        proxy.setValue(v, this.#vowelWeights[v]);
      }
    }

    if (this.#elapsed >= this.#duration) {
      this.finish(ctx);
    }
  }

  onExit(ctx) {
    super.onExit(ctx);
    const proxy = ctx.getProxy();
    if (proxy) {
      for (const v of this.#vowels) {
        proxy.setValue(v, 0);
      }
    }
    ctx.hideBubble();
    ctx.notifyTalkingState('idle', { source: 'talking_exit' });
  }
}

// ── 舞步 ────────────────────────────────

class DancingState extends MascotState {
  get name() { return 'dancing'; }

  onEnter(ctx, params) {
    super.onEnter(ctx, params);
    ctx.motion.play('dance_short');
    ctx.expression.set('fun', 0.6, 0.3);
  }

  onExit(ctx) {
    super.onExit(ctx);
    ctx.expression.set(null, 0, 0.3);
  }

  update(ctx, dt) {
    if (ctx.motion.currentAction === 'idle') {
      this.finish(ctx);
    }
  }
}

// ── 開心 ────────────────────────────────

class HappyState extends MascotState {
  get name() { return 'happy'; }

  onEnter(ctx, params) {
    super.onEnter(ctx, params);
    ctx.motion.play('happy');
    ctx.expression.set('joy', 0.9, 0.2);
  }

  onExit(ctx) {
    super.onExit(ctx);
    ctx.expression.set(null, 0, 0.3);
  }

  update(ctx, dt) {
    if (ctx.motion.currentAction === 'idle') {
      this.finish(ctx);
    }
  }
}

// ── 自訂動畫 ──────────────────────────────

class CustomAnimationState extends MascotState {
  #animData = null;
  #loop = false;

  get name() { return 'custom_animation'; }

  onEnter(ctx, params) {
    super.onEnter(ctx, params);
    this.#animData = params?.animationData ?? null;
    this.#loop = params?.loop ?? false;
    if (this.#animData) {
      ctx.motion.playCustom(this.#animData, {
        loop: this.#loop,
        onComplete: () => {
          if (!this.#loop) {
            this.finish(ctx);
          }
        }
      });
    } else {
      this.finish(ctx);
    }
  }

  update(ctx, dt) {
    // 如果是循環播放，由外部狀態轉移或中斷；非循環播放由 playCustom 的 onComplete 觸發 finish
  }
}

// ══════════════════════════════════════════════
//  MascotStateMachine — 狀態機主體
// ══════════════════════════════════════════════

/** 別名映射：讓使用者用簡短名稱也能觸發 */
const STATE_ALIASES = {
  wave:             'greeting',
  dance:            'dancing',
  dance_short:      'dancing',
  think:            'thinking',
  talk:             'talking',
  say:              'talking',
  custom:           'custom_animation',
  custom_animation: 'custom_animation',
};

export class MascotStateMachine {
  #states = new Map();
  #current = null;
  #ctx = null;

  /** 外部回調 */
  onSay = null;
  onStateChange = null;

  /**
   * @param {import('./VrmMascot.js').VrmMascot} mascot
   */
  constructor(mascot) {
    this.#ctx = new StateContext(this, mascot);

    // 註冊內建狀態
    for (const S of [
      IdleState,
      GreetingState,
      ThinkingState,
      TalkingState,
      DancingState,
      HappyState,
      CustomAnimationState,
    ]) {
      this.register(new S());
    }

    // 預設 idle
    this.#current = this.#states.get('idle');
  }

  /**
   * 註冊新狀態（可擴展）
   * @param {MascotState} state
   */
  register(state) {
    this.#states.set(state.name, state);
  }

  /**
   * 派發狀態切換（主要 API）
   *
   *   dispatch("greeting")
   *   dispatch("wave")               ← 別名，等同 "greeting"
   *   dispatch("talking", { text: "你好" })
   *   dispatch("idle")
   *
   * @param {string} name - 狀態名或別名
   * @param {object} [params] - 傳給 onEnter 的參數
   */
  dispatch(name, params) {
    let resolvedName = name;
    let resolvedParams = params;

    // 支援物件型態參數 (相容於 README 描述)
    if (typeof name === 'object' && name !== null) {
      const type = name.type;
      if (type === 'do' || type === 'emote') {
        resolvedName = name.name;
      } else if (type === 'say') {
        resolvedName = 'talking';
        resolvedParams = { text: name.text };
      } else if (type === 'lookAt') {
        // 注視由獨立的 lookAtController 控制，但仍可切回 idle
        resolvedName = 'idle';
      } else if (type === 'reset') {
        resolvedName = 'idle';
      }
      resolvedParams = { ...name, ...resolvedParams };
    }

    const resolved = STATE_ALIASES[resolvedName] ?? resolvedName;
    const next = this.#states.get(resolved);

    if (!next) {
      console.warn('[StateMachine] unknown state:', name);
      return;
    }

    // 離開當前狀態
    if (this.#current) {
      this.#current.onExit(this.#ctx);
    }

    // 進入新狀態
    this.#current = next;
    this.#current.onEnter(this.#ctx, resolvedParams);
    this.onStateChange?.(resolved);
  }

  /**
   * 每幀更新（由 VrmMascot render loop 呼叫）
   * @param {number} dt
   */
  update(dt) {
    this.#current?.update(this.#ctx, dt);
  }

  /** 取得當前狀態名 */
  get currentState() {
    return this.#current?.name ?? 'none';
  }

  /** 中斷當前狀態 */
  cancelCurrentState() {
    if (this.#current) {
      this.#current.cancel(this.#ctx);
    }
  }

  /** 重設到 idle */
  reset() {
    this.dispatch('idle');
  }

  /** 清理 */
  dispose() {
    if (this.#current) {
      this.#current.onExit(this.#ctx);
    }
    this.#current = null;
    this.onSay = null;
    this.onStateChange = null;
  }
}
