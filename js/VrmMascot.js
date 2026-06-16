/**
 * VrmMascot — VRM 吉祥物主控制器
 *
 * 整合 Three.js scene、VRM 載入、以及四個子系統：
 *   - MotionController    (程序式動作)
 *   - ExpressionController (眨眼 + 表情)
 *   - LookAtController    (滑鼠注視)
 *   - MascotStateMachine  (狀態機 API)
 *
 * 用法：
 *   const mascot = new VrmMascot(document.getElementById('container'));
 *   await mascot.load('models/mascot.vrm');
 *   mascot.dispatch('wave');
 *   mascot.dispatch('talking', { text: '你好' });
 *   mascot.say('部署完成了！');
 *
 * 升級策略：
 *   VRM 版本相關 API 全部集中在 _vrm* 開頭的 helper，
 *   Phase 2 從 0.6.7 升級 @pixiv/three-vrm 3.x 時，
 *   只需改這幾個 helper，其他模組完全不動。
 */

import {
  DEFAULT_POSE_PRESET_URL,
  getPosePresetUrlForModel,
  MotionController,
} from './MotionController.js';
import { ExpressionController } from './ExpressionController.js';
import { LookAtController }     from './LookAtController.js';
import { MascotStateMachine }   from './MascotStateMachine.js';
import { ActionQueue }          from './ActionQueue.js';
import { ToolRegistry }         from './ToolRegistry.js';
import { ConversationMemory }   from './ConversationMemory.js';
import { SpatialContext }       from './SpatialContext.js';
import { DomContext }           from './DomContext.js';
import { PolicyGate }           from './PolicyGate.js';
import { PoseDirector }         from './PoseDirector.js';
import { ActingBridge }         from './ActingBridge.js';
import { configureSemanticMotionLibrary } from './ActingPolicy.js';

const SEMANTIC_MOTION_LIBRARY_URL = 'examples/m6_7_vrma_samples/review/semantic_motion_library.json';

/**
 * 意圖對照 Preset表，定義各種高階意圖所對應的底層指令序列與預設值
 */
const INTENT_PRESETS = {
  greeting: {
    text: '哈囉！你好，我是網頁導覽助理。',
    emotion: 'joy',
    motion: 'wave',
    actions: (text, emotion, motion) => [
      { type: 'lookAt', target: 'mouse' },
      { type: 'wait', duration: 200 },
      { type: 'say', text, emotion, motion, timeout: 7000 }
    ]
  },
  success: {
    text: '太棒了！任務順利完成了！🚀',
    emotion: 'joy',
    motion: 'wave',
    actions: (text, emotion, motion) => [
      { type: 'lookAt', target: 'mouse' },
      { type: 'say', text, emotion, motion, timeout: 7000 }
    ]
  },
  error: {
    text: '抱歉... 執行過程中發生了一些錯誤。😢',
    emotion: 'sorrow',
    motion: 'shake_head',
    actions: (text, emotion, motion) => [
      { type: 'lookAt', target: 'mouse' },
      { type: 'say', text, emotion, motion, timeout: 7000 }
    ]
  },
  thinking: {
    text: '讓我想一想，稍等我一下喔...',
    emotion: 'sorrow',
    motion: 'think',
    actions: (text, emotion, motion) => [
      { type: 'lookAt', target: 'mouse' },
      { type: 'say', text, emotion, timeout: 6000 }
    ]
  },
  warning: {
    text: '請注意！檢測到潛在的風險，請小心操作。⚠️',
    emotion: 'angry',
    motion: 'warning',
    actions: (text, emotion, motion) => [
      { type: 'lookAt', target: 'mouse' },
      { type: 'say', text, emotion, motion, timeout: 7000 }
    ]
  },
  searching: {
    text: '正在為您查詢相關資料，請稍候...',
    emotion: 'fun',
    motion: 'dance_short',
    actions: (text, emotion, motion) => [
      { type: 'lookAt', target: 'mouse' },
      { type: 'say', text, emotion, motion, timeout: 7000 }
    ]
  },
  explain: {
    text: '讓我為您詳細說明一下這個部分的內容。',
    emotion: 'joy',
    motion: 'wave',
    actions: (text, emotion, motion) => [
      { type: 'lookAt', target: 'mouse' },
      { type: 'wait', duration: 100 },
      { type: 'say', text, emotion, motion, timeout: 8000 }
    ]
  }
};

/**
 * 建立固定四步驟 trace，讓 Debug Panel 有穩定的顯示順序。
 * @param {object} [options]
 * @param {boolean} [options.isTool=false]
 * @param {string} [options.selfHealStatus]
 * @param {string[]} [options.selfHealArgs]
 * @param {string} [options.policyStatus]
 * @param {string} [options.policyReason]
 * @param {string} [options.executeStatus]
 * @param {string} [options.executeReason]
 * @returns {object[]}
 */
export function createIntentTrace(options = {}) {
  const isTool = !!options.isTool;
  const trace = [
    { step: 'normalize', status: 'ok' },
    { step: 'self_heal', status: isTool ? (options.selfHealStatus || 'skipped') : 'none' },
    { step: 'policy_check', status: isTool ? (options.policyStatus || 'none') : 'none' },
    { step: 'execute_tool', status: isTool ? (options.executeStatus || 'none') : 'none' }
  ];

  if (trace[1].status === 'healed' && Array.isArray(options.selfHealArgs) && options.selfHealArgs.length > 0) {
    trace[1].args = [...options.selfHealArgs];
  }
  if (trace[2].status === 'blocked' && options.policyReason) {
    trace[2].reason = options.policyReason;
  }
  if (options.executeReason) {
    trace[3].reason = options.executeReason;
  }

  return trace;
}

/**
 * 更新指定 trace step；若 step 不存在則依固定順序補上。
 * @param {object} intentObj
 * @param {string} step
 * @param {object} patch
 * @returns {object[]}
 */
export function updateTraceStep(intentObj, step, patch = {}) {
  if (!intentObj || typeof intentObj !== 'object') {
    return [];
  }
  if (!Array.isArray(intentObj.trace)) {
    intentObj.trace = createIntentTrace({ isTool: !!intentObj.tool });
  }

  let target = intentObj.trace.find((item) => item.step === step);
  if (!target) {
    target = { step, status: 'none' };
    intentObj.trace.push(target);
  }

  Object.assign(target, patch);
  if (patch.args === undefined) {
    delete target.args;
  }
  if (patch.reason === undefined) {
    delete target.reason;
  }

  const order = ['normalize', 'self_heal', 'policy_check', 'execute_tool'];
  intentObj.trace.sort((a, b) => {
    const ai = order.indexOf(a.step);
    const bi = order.indexOf(b.step);
    return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
  });

  return intentObj.trace;
}

function cloneParameters(parameters) {
  return { ...(parameters || {}) };
}

function isCompleteParameters(parameters) {
  if (!parameters || typeof parameters !== 'object') {
    return false;
  }
  return Object.values(parameters).every(value => value !== undefined && value !== null && value !== '');
}

/**
 * 建立目前空間上下文可直接執行的工具建議。
 * @param {object} options
 * @param {object} options.spatialContext
 * @param {function} options.hasTool
 * @param {function} options.checkPolicy
 * @param {function} options.mapCenterToGridXY
 * @returns {object[]}
 */
export function createSuggestedActions(options = {}) {
  const spatial = options.spatialContext || {};
  const selectedFeature = spatial.selectedFeature || 'none';
  if (!selectedFeature || selectedFeature === 'none') {
    return [];
  }

  const hasTool = typeof options.hasTool === 'function' ? options.hasTool : () => false;
  const checkPolicy = typeof options.checkPolicy === 'function' ? options.checkPolicy : () => ({ ok: false });
  const mapCenterToGridXY = typeof options.mapCenterToGridXY === 'function'
    ? options.mapCenterToGridXY
    : () => ({ x: undefined, y: undefined });

  const candidates = [];
  const isPipe = selectedFeature.startsWith('PIPE-');
  const isCctv = selectedFeature.startsWith('CCTV-');

  if (isPipe || isCctv) {
    const xy = mapCenterToGridXY(spatial.mapCenter);
    const tool = isPipe ? 'query_pipe' : 'query_cctv';
    const id = isPipe ? 'pipe_details' : 'cctv_status';
    const label = isPipe ? '查看詳細資料' : '查看影像狀態';
    const beforeText = isPipe
      ? '我來查看這根管線的詳細資料。'
      : '我來查看這台監視器的影像狀態。';
    const afterText = isPipe
      ? '已查詢目前選取管線，{summary}'
      : '已查詢目前選取監視器，{summary}';
    const parameters = { x: xy.x, y: xy.y };

    candidates.push({
      id,
      label,
      tool,
      target: selectedFeature,
      parameters,
      intentPayload: {
        action: tool,
        tool,
        parameters: cloneParameters(parameters),
        beforeText,
        afterText
      }
    });

    const reportParameters = { featureId: selectedFeature };
    candidates.push({
      id: 'download_report',
      label: '下載報表',
      tool: 'download_report',
      target: selectedFeature,
      parameters: reportParameters,
      intentPayload: {
        action: 'download_report',
        tool: 'download_report',
        parameters: cloneParameters(reportParameters),
        beforeText: '我幫你下載目前選取物件的維護報告。',
        afterText: '我已經幫您下載完成囉～'
      }
    });
  }

  return candidates.filter(action => {
    if (!hasTool(action.tool) || !isCompleteParameters(action.parameters)) {
      return false;
    }
    const policyCheck = checkPolicy(action.tool, action.parameters);
    return !!policyCheck?.ok;
  });
}

export class VrmMascot {
  // DOM
  #container = null;

  // Three.js
  #scene = null;
  #camera = null;
  #renderer = null;
  #clock = null;
  #orbitControls = null;

  // VRM
  #currentVRM = null;

  // 子系統
  #motion     = new MotionController();
  #expression = new ExpressionController();
  #lookAtCtrl = new LookAtController();
  #stateMachine = null;
  #actionQueue = null;
  #tools = new ToolRegistry(); // 註冊能力系統
  #memory = null;
  #context = null;
  #domContext = null;
  #policyGate = null;
  #poseDirector = null;
  #actingBridge = null;
  #semanticMotionLibraryStatus = 'pending';

  // 外部選項
  #options = {};

  // 狀態監控
  #isUserInteracting = false;

  // 動畫迴圈
  #rafId = 0;
  #fps = 0;
  #frameCount = 0;
  #fpsTimer = 0;

  // 意圖紀錄與除錯
  #currentIntent = 'idle';
  #lastIntent = 'none';
  #lastSpeech = '';
  #intentHistory = [];
  #actionIntent = {
    action: 'none',
    target: 'none',
    confidence: 0.0,
    parameters: {},
    status: 'idle',
    source: 'system'
  };

  // 回調
  /** @type {function|null} */
  onFpsUpdate = null;
  /** @type {function|null} */
  onLoaded = null;
  /** @type {function|null} */
  onLoadProgress = null;
  /** @type {function|null} */
  onLoadError = null;
  /** @type {function|null} */
  onIntentUpdate = null;

  /**
   * @param {HTMLElement} container - 3D viewport 容器
   * @param {object} [options]
   * @param {boolean} [options.orbitControls=true]
   * @param {boolean} [options.grid=true]
   */
  constructor(container, options = {}) {
    this.#container = container;
    this.#actionQueue = new ActionQueue(this);
    this.#stateMachine = new MascotStateMachine(this);
    this.#memory = new ConversationMemory(this);
    this.#context = new SpatialContext(this);
    this.#domContext = new DomContext(this);
    this.#policyGate = new PolicyGate(this);
    this.#poseDirector = new PoseDirector({
      motion: this.#motion,
      expression: this.#expression,
      lookAt: this.#lookAtCtrl,
    });
    this.#actingBridge = new ActingBridge(this);

    // 監聽佇列變空
    this.#actionQueue.onQueueEmpty = () => {
      this.#currentIntent = 'idle';
      this.#actingBridge?.onTalkingState('idle', { source: 'queue_empty' });
      this.#emitIntentUpdate();
    };

    this.#options = options;
    this.#init3D(options);
    this.#startLoop();
    this.#bindResize();
    this.#loadSemanticMotionLibrary(options.semanticMotionLibraryUrl ?? SEMANTIC_MOTION_LIBRARY_URL);

    // 初始發送一次 update
    this.#emitIntentUpdate();
  }

  // ── Public 子系統存取 ─────────────────

  /** @returns {MotionController} */
  get motion() { return this.#motion; }

  /** @returns {ExpressionController} */
  get expression() { return this.#expression; }

  /** @returns {LookAtController} */
  get lookAt() { return this.#lookAtCtrl; }

  /** @returns {MascotStateMachine} */
  get state() { return this.#stateMachine; }

  /** @returns {ActionQueue} */
  get queue() { return this.#actionQueue; }

  /** @returns {ToolRegistry} */
  get tools() { return this.#tools; }

  /** @returns {ConversationMemory} */
  get memory() { return this.#memory; }

  /** @returns {SpatialContext} */
  get context() { return this.#context; }

  /** @returns {DomContext} */
  get domContext() { return this.#domContext; }

  /** @returns {PolicyGate} */
  get policyGate() { return this.#policyGate; }

  /** @returns {PoseDirector} */
  get poseDirector() { return this.#poseDirector; }

  /** @returns {ActingBridge} */
  get actingBridge() { return this.#actingBridge; }

  /** @returns {object} */
  get intent() { return this.#actionIntent; }

  /** @returns {ToolRegistry} */
  get toolRegistry() { return this.tools; }

  /** @returns {object} 建構選項（含 enableTts 等） */
  get options() { return this.#options; }

  /** @type {boolean} enableTts 捷徑 */
  get _enableTts() { return !!this.#options.enableTts; }
  set _enableTts(val) { this.#options.enableTts = !!val; }

  /** @returns {boolean} */
  get isUserInteracting() { return this.#isUserInteracting; }

  /** @returns {number} 當前 FPS */
  get fps() { return this.#fps; }

  /** @returns {boolean} 是否已載入模型 */
  get isLoaded() { return this.#currentVRM !== null; }

  /**
   * 取得目前 Three.js 場景上下文，供展示頁或外部 adapter 掛載 3D 物件。
   * 外部只能新增/移除場景物件，不應直接接管 render loop。
   *
   * @returns {{scene: object|null, camera: object|null, renderer: object|null, controls: object|null, vrm: object|null, vrmRoot: object|null, container: HTMLElement|null}}
   */
  getSceneContext() {
    return {
      scene: this.#scene,
      camera: this.#camera,
      renderer: this.#renderer,
      controls: this.#orbitControls,
      vrm: this.#currentVRM,
      vrmRoot: this.#currentVRM?.scene ?? null,
      container: this.#container,
    };
  }

  /**
   * 將外部展示物件掛到 Alicia 的同一個 Three.js scene。
   * 這讓 demo props 與 VRM 共用 camera、depth、lighting，而不是浮在 overlay canvas。
   *
   * @param {object} object3d - THREE.Object3D
   * @returns {boolean}
   */
  addSceneObject(object3d) {
    if (!this.#scene || !object3d) return false;
    this.#scene.add(object3d);
    return true;
  }

  /**
   * 從 Alicia scene 移除外部展示物件。
   *
   * @param {object} object3d - THREE.Object3D
   * @returns {boolean}
   */
  removeSceneObject(object3d) {
    if (!this.#scene || !object3d) return false;
    this.#scene.remove(object3d);
    return true;
  }

  // ── 狀態機頂層 API ─────────────────

  /**
   * 派發狀態切換（主要 API）
   *
   *   mascot.dispatch('wave');
   *   mascot.dispatch('talking', { text: '你好' });
   *   mascot.dispatch('idle');
   *
   * @param {string} name - 狀態名或別名
   * @param {object} [params]
   */
  dispatch(name, params) {
    // 如果不是來自佇列的指令，視為使用者中斷，清空佇列
    const fromQueue = (typeof name === 'object' && name !== null && name.fromQueue)
                     || (params && params.fromQueue);
    if (!fromQueue) {
      const prevIntent = this.#currentIntent;
      this.#actionQueue.clear('user_interrupt');
      this.#lastIntent = prevIntent;
      this.#currentIntent = typeof name === 'string' ? name : (name?.type || 'custom');
      if (params && params.text) {
        this.#lastSpeech = String(params.text).slice(0, 120);
      }
      this.#emitIntentUpdate();
    }
    this.#stateMachine.dispatch(name, params);
  }

  /**
   * 新增動作到排程佇列
   * @param {object|object[]} action
   */
  enqueue(action) {
    this.#actionQueue.enqueue(action);
  }

  /**
   * 清空排程佇列
   */
  clearQueue() {
    this.#actionQueue.clear('user_interrupt');
    this.#currentIntent = 'idle';
    this.#emitIntentUpdate();
  }

  /**
   * 讓角色說話（便捷方法）
   * @param {string} text
   */
  say(text) {
    this.dispatch('talking', { text });
  }

  /**
   * 設定語意表情 profile；骨架姿勢仍交給 Motion / LookAt 層處理。
   * @param {string} name
   * @param {object} [options]
   * @returns {object}
   */
  setExpression(name, options = {}) {
    return this.#expression.setProfile(name, options);
  }

  /**
   * 清除語意表情 profile，淡出 ExpressionController 管理中的 blendshape。
   * @param {object} [options]
   * @returns {object}
   */
  clearExpression(options = {}) {
    return this.#expression.clear(options);
  }

  /**
   * 依語意狀態套用演出策略：expression + motion/clip + gaze。
   * @param {string} state
   * @param {object} [meta]
   * @returns {object|null}
   */
  act(state, meta = {}) {
    return this.#poseDirector?.act(state, meta) || null;
  }

  /**
   * 依 intent 執行結果套用演出策略。
   * @param {string} status
   * @param {object} [intentObj]
   * @returns {object|null}
   */
  actForIntentResult(status, intentObj = {}) {
    return this.#poseDirector?.actForIntentResult(status, intentObj) || null;
  }

  /**
   * 將 talking lifecycle 事件交給 ActingBridge；不在 StateMachine 內直接決定表情或動作。
   * @param {string} state
   * @param {object} [meta]
   * @returns {object|null}
   */
  notifyTalkingState(state, meta = {}) {
    return this.#actingBridge?.onTalkingState(state, meta) || null;
  }

  /**
   * 依語意狀態播放姿勢，不暴露骨架細節給 Agent Runtime。
   * @param {string} state
   * @param {object} [meta]
   * @returns {object|null}
   */
  poseForState(state, meta = {}) {
    return this.#poseDirector?.poseForState(state, meta) || null;
  }

  /**
   * 依 intent 執行結果播放姿勢。
   * @param {string} status
   * @param {object} [intentObj]
   * @returns {object|null}
   */
  poseForIntentResult(status, intentObj = {}) {
    return this.#poseDirector?.poseForIntentResult(status, intentObj) || null;
  }

  /**
   * 將傳入的各種意圖格式規格化為統一的結構
   * @param {object|string} intentObj
   * @returns {object}
   */
  normalizeIntent(intentObj) {
    let normalized = intentObj;
    if (typeof intentObj === 'string') {
      normalized = { intent: intentObj };
    } else if (!intentObj || typeof intentObj !== 'object') {
      normalized = {};
    }

    const action = normalized.intent || normalized.action || 'explain';
    const tool = normalized.tool || (this.tools.has(action) ? action : null);
    const parameters = normalized.args || normalized.parameters || {};
    const target = parameters.featureId || normalized.target || 'none';
    const confidence = typeof normalized.confidence === 'number' ? normalized.confidence : 1.0;
    const status = normalized.status || 'pending';
    const source = normalized.source || 'llm';

    // 文字與 Preset 屬性
    const beforeText = normalized.text || normalized.beforeText || '';
    const afterText = normalized.afterText || '';

    return {
      action,
      target,
      confidence,
      parameters,
      tool,
      beforeText,
      afterText,
      status,
      source
    };
  }

  /**
   * 執行代理意圖 (Agent Intent)
   * 將高階語意意圖翻譯為底層動作序列並排程播放
   *
   * @param {object|string} intentObj - 意圖物件或意圖名稱字串
   * @returns {Promise<any>}
   */
  async performIntent(intentObj) {
    // 1. 規格化
    let normalizedIntent = this.normalizeIntent(intentObj);
    let toolName = normalizedIntent.tool;
    normalizedIntent.trace = createIntentTrace({ isTool: !!toolName });

    // 1.5 自我修復 (Phase 12.7)
    normalizedIntent = this.selfHealIntent(normalizedIntent);
    toolName = normalizedIntent.tool;
    if (toolName) {
      const healedArgs = Array.isArray(normalizedIntent.selfHealLog)
        ? normalizedIntent.selfHealLog.map(item => item.arg).filter(Boolean)
        : [];
      updateTraceStep(normalizedIntent, 'self_heal', healedArgs.length > 0
        ? { status: 'healed', args: healedArgs }
        : { status: 'skipped' });
    } else {
      updateTraceStep(normalizedIntent, 'self_heal', { status: 'none' });
    }
    this.#actionIntent = normalizedIntent;
    this.#emitIntentUpdate();

    // 2. Policy Layer Guard
    if (toolName) {
      const policyCheck = this.policyGate.check(toolName, normalizedIntent.parameters);
      if (!policyCheck.ok) {
        normalizedIntent.status = 'blocked';
        this.updateIntentTrace(normalizedIntent, 'policy_check', {
          status: 'blocked',
          reason: policyCheck.reason
        });
        this.updateIntentTrace(normalizedIntent, 'execute_tool', {
          status: 'skipped',
          reason: 'policy_blocked'
        });
        this.dispatch('warning', { text: policyCheck.error });
        return { ok: false, error: 'blocked' };
      }
      this.updateIntentTrace(normalizedIntent, 'policy_check', { status: 'ok' });
      this.updateIntentTrace(normalizedIntent, 'execute_tool', { status: 'pending' });
    } else {
      this.updateIntentTrace(normalizedIntent, 'policy_check', { status: 'none' });
      this.updateIntentTrace(normalizedIntent, 'execute_tool', { status: 'none' });
    }

    let intentName = normalizedIntent.action.toLowerCase();
    if (!INTENT_PRESETS[intentName]) {
      intentName = 'explain';
    }
    const preset = INTENT_PRESETS[intentName];

    // 文字與動作選擇
    const text = normalizedIntent.beforeText || normalizedIntent.text || preset.text;
    const safeText = String(text || "").slice(0, 120);

    const emotion = normalizedIntent.emotion || preset.emotion;
    const motion = normalizedIntent.motion || preset.motion;

    // 記錄到意圖歷史與狀態
    this.#lastIntent = this.#currentIntent;
    this.#currentIntent = intentName;
    this.#lastSpeech = safeText;

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const time = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    this.#intentHistory.unshift({
      time,
      intent: intentName,
      text: safeText
    });
    this.#intentHistory = this.#intentHistory.slice(0, 50);
    this.#emitIntentUpdate();

    // 5. 轉譯為行為序列
    const sequence = preset.actions(text, emotion, motion);

    if (toolName) {
      return new Promise((resolve) => {
        sequence.push({
          type: 'tool',
          name: toolName,
          args: normalizedIntent.parameters,
          timeout: normalizedIntent.timeout || 10000,
          afterText: normalizedIntent.afterText,
          afterEmotion: normalizedIntent.afterEmotion,
          afterMotion: normalizedIntent.afterMotion,
          intentObj: normalizedIntent,
          onToolComplete: (result) => {
            resolve(result);
          }
        });
        this.enqueue(sequence);
      });
    } else {
      this.enqueue(sequence);
      return { ok: true };
    }
  }

  /**
   * 取得意圖與佇列除錯資訊
   */
  getIntentDebugInfo() {
    return {
      currentIntent: this.#currentIntent,
      lastIntent: this.#lastIntent,
      lastSpeech: this.#lastSpeech,
      queueLength: this.queue?.length ?? 0,
      history: [...this.#intentHistory],
      registeredTools: this.tools.list(),
      memoryCount: this.#memory?.length ?? 0,
      lastTool: this.#memory?.last('tool_result')?.tool || 'none',
      lastResult: this.#memory?.getLastResult()?.summary || 'none',
      selectedFeature: this.#context?.get().selectedFeature || 'none',
      activeLayer: this.#context?.get().activeLayer || 'none',
      mapCenter: this.#context?.get().mapCenter ? JSON.stringify(this.#context.get().mapCenter) : '[120.6, 24.1]',
      activeElement: this.#domContext?.get().activeElement ? `${this.#domContext.get().activeElement.tag}${this.#domContext.get().activeElement.id ? '#' + this.#domContext.get().activeElement.id : ''}` : 'none',
      lastClicked: this.#domContext?.get().lastClickedElement ? `${this.#domContext.get().lastClickedElement.tag}${this.#domContext.get().lastClickedElement.id ? '#' + this.#domContext.get().lastClickedElement.id : ''}` : 'none',
      formKeys: Object.keys(this.#domContext?.get().formState || {}).join(', ') || 'none',
      actionIntent: {
        action: this.#actionIntent.action,
        target: this.#actionIntent.target,
        confidence: this.#actionIntent.confidence,
        status: this.#actionIntent.status,
        pickedSemanticMotion: this.#actionIntent.pickedSemanticMotion
          ? { ...this.#actionIntent.pickedSemanticMotion }
          : null,
        trace: Array.isArray(this.#actionIntent.trace)
          ? this.#actionIntent.trace.map(item => ({ ...item }))
          : []
      },
      suggestedActions: this.buildSuggestedActions(),
      semanticMotionLibraryStatus: this.#semanticMotionLibraryStatus
    };
  }

  /**
   * 取得已註冊工具之契約與安全政策摘要 (Tool Digest)
   * @returns {object[]}
   */
  buildToolDigest() {
    if (!this.tools) return [];
    return this.tools.list().map(t => {
      const policy = this.policyGate ? this.policyGate.getPolicy(t.name) : null;
      return {
        name: t.name,
        requiredArgs: policy ? (policy.requiredArgs || []) : [],
        allowedArgs: policy ? (policy.allowedArgs || []) : [],
        allowedTargetPrefixes: policy ? (policy.allowedTargetPrefixes || []) : [],
        risk: policy ? (policy.risk || "low") : "low",
        requireConfirm: policy ? (policy.requireConfirm || false) : false
      };
    });
  }

  /**
   * 建立極簡的上下文摘要 (Context Digest)，供 LLM Proxy 推理使用，降低 Token 消耗。
   * @returns {object}
   */
  buildContextDigest() {
    const spatial = this.#context ? this.#context.get() : {};
    const dom = this.#domContext ? this.#domContext.get() : {};

    const selectedFeature = spatial.selectedFeature || "none";

    // activeElement: 優先抓 ID，若無則抓 tag
    const activeEl = dom.activeElement;
    const activeElement = activeEl ? (activeEl.id || activeEl.tag || "none") : "none";

    // activePanel: 依據 activeElement 或者是網頁當前焦點元素判斷所屬區塊
    let activePanel = "none";
    if (typeof document !== 'undefined' && document.activeElement) {
      const el = document.activeElement;
      if (el.closest) {
        if (el.closest('#exportPanel')) {
          activePanel = "exportPanel";
        } else if (el.closest('#gisReportForm')) {
          activePanel = "gisReportForm";
        } else if (el.closest('#gisPanel')) {
          activePanel = "gisPanel";
        }
      }
    }
    // Fallback: 靜態比對
    if (activePanel === "none" && activeElement !== "none") {
      if (['reportAddress', 'reportEmail', 'reportDesc', 'btnSubmitReport'].includes(activeElement)) {
        activePanel = "gisReportForm";
      } else if (['exportFormat', 'btnExportFeature'].includes(activeElement)) {
        activePanel = "exportPanel";
      }
    }

    // availableActions: 當前註冊之工具清單
    const availableActions = this.tools ? this.tools.list().map(t => t.name) : [];

    // lastIntent: 最後一次執行的行動/意圖名稱
    const lastIntent = this.#actionIntent ? (this.#actionIntent.action || "none") : "none";

    // mapCenter: 目前地圖經緯度
    const mapCenter = spatial.mapCenter || [120.6, 24.1];

    // validationErrors: 蒐集當前表單中所有校驗失敗（valid === false）的欄位鍵值
    const validationErrors = [];
    const valState = dom.validationState || {};
    for (const key of Object.keys(valState)) {
      if (valState[key] && valState[key].valid === false) {
        validationErrors.push(key);
      }
    }

    return {
      selectedFeature,
      activeElement,
      activePanel,
      availableActions,
      lastIntent,
      mapCenter,
      validationErrors,
      toolDigest: this.buildToolDigest()
    };
  }

  /**
   * 建立目前使用者可直接點擊執行的工具建議。
   * @returns {object[]}
   */
  buildSuggestedActions() {
    const spatial = this.#context ? this.#context.get() : {};
    return createSuggestedActions({
      spatialContext: spatial,
      hasTool: (toolName) => this.tools ? this.tools.has(toolName) : false,
      checkPolicy: (toolName, parameters) => this.policyGate
        ? this.policyGate.check(toolName, parameters)
        : { ok: false },
      mapCenterToGridXY: (mapCenter) => this.mapCenterToGridXY(mapCenter)
    });
  }

  /**
   * 將地圖中心經緯度轉換為模擬格點座標 (Phase 12.7)
   * @param {number[]} mapCenter
   * @returns {object} { x, y }
   */
  mapCenterToGridXY(mapCenter) {
    if (!Array.isArray(mapCenter) || mapCenter.length !== 2) {
      return { x: 50000, y: 50000 };
    }
    return {
      x: Math.round(mapCenter[0] * 1000),
      y: Math.round(mapCenter[1] * 1000)
    };
  }

  /**
   * 自我修復意圖參數 (Phase 12.7)
   * @param {object} normalizedIntent
   * @returns {object} 修復後的意圖物件
   */
  selfHealIntent(normalizedIntent) {
    if (!normalizedIntent || !normalizedIntent.tool) {
      return normalizedIntent;
    }

    const toolName = normalizedIntent.tool;
    const policy = this.policyGate ? this.policyGate.getPolicy(toolName) : null;
    if (!policy) {
      return normalizedIntent;
    }

    const parameters = { ...(normalizedIntent.parameters || {}) };
    const missingArgs = [];
    for (const reqKey of policy.requiredArgs) {
      if (parameters[reqKey] === undefined || parameters[reqKey] === null || parameters[reqKey] === '') {
        missingArgs.push(reqKey);
      }
    }

    if (missingArgs.length === 0) {
      return normalizedIntent;
    }

    const spatial = this.#context ? this.#context.get() : {};
    const selectedFeature = spatial.selectedFeature || "none";
    const selfHealLog = [];
    let selfHealed = false;

    for (const missingKey of missingArgs) {
      // 1. 修復 featureId
      if (missingKey === 'featureId' && selectedFeature !== 'none') {
        // 必須符合 policy 的 prefix 檢查才予以修復
        let allowed = true;
        if (policy.allowedTargetPrefixes && policy.allowedTargetPrefixes.length > 0) {
          allowed = policy.allowedTargetPrefixes.some(prefix => selectedFeature.startsWith(prefix));
        }
        if (allowed) {
          parameters['featureId'] = selectedFeature;
          selfHealed = true;
          selfHealLog.push({
            arg: 'featureId',
            source: 'context.selectedFeature',
            value: selectedFeature
          });
          console.info(`[Self-Healing] Automatically filled missing required argument 'featureId' with selectedFeature '${selectedFeature}'`);
        }
      }

      // 2. 修復 x, y 座標
      if ((missingKey === 'x' || missingKey === 'y') && spatial.mapCenter) {
        const grid = this.mapCenterToGridXY(spatial.mapCenter);
        if (grid && grid[missingKey] !== undefined) {
          parameters[missingKey] = grid[missingKey];
          selfHealed = true;
          selfHealLog.push({
            arg: missingKey,
            source: 'context.mapCenter',
            value: grid[missingKey]
          });
          console.info(`[Self-Healing] Automatically filled missing required argument '${missingKey}' with grid value '${grid[missingKey]}'`);
        }
      }
    }

    if (selfHealed) {
      return {
        ...normalizedIntent,
        parameters,
        target: parameters.featureId || normalizedIntent.target,
        selfHealed: true,
        selfHealLog
      };
    }

    return normalizedIntent;
  }

  emitIntentUpdate() {
    this.#emitIntentUpdate();
  }

  async #loadSemanticMotionLibrary(url) {
    if (!url) {
      configureSemanticMotionLibrary(null);
      this.#semanticMotionLibraryStatus = 'disabled';
      return;
    }

    this.#semanticMotionLibraryStatus = 'loading';
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }
      const library = await res.json();
      configureSemanticMotionLibrary(library);
      this.#semanticMotionLibraryStatus = 'loaded';
      this.#emitIntentUpdate();
    } catch (err) {
      configureSemanticMotionLibrary(null);
      this.#semanticMotionLibraryStatus = 'unavailable';
      console.warn('[VrmMascot] semantic motion library unavailable:', err);
    }
  }

  /**
   * 更新 action intent trace 並通知 Debug Panel。
   * @param {object} intentObj
   * @param {string} step
   * @param {object} patch
   */
  updateIntentTrace(intentObj, step, patch = {}) {
    updateTraceStep(intentObj, step, patch);
    this.#actionIntent = intentObj;
    this.#actingBridge?.onTraceUpdate(intentObj);
    this.#emitIntentUpdate();
  }

  /**
   * 發送意圖更新通知
   */
  #emitIntentUpdate() {
    try {
      this.onIntentUpdate?.(this.getIntentDebugInfo());
    } catch (err) {
      console.warn("[VrmMascot] onIntentUpdate failed:", err);
    }
  }

  // ── 模型載入 ──────────────────────────

  /**
   * 讀取靜態 JSON 資產；沿用 Three.js loader，避免新增前端請求實作。
   * @param {string} url
   * @returns {Promise<object>}
   */
  #loadJsonAsset(url) {
    return new Promise((resolve, reject) => {
      if (typeof THREE === 'undefined' || !THREE.FileLoader) {
        reject(new Error('THREE.FileLoader is not available'));
        return;
      }

      const loader = new THREE.FileLoader();
      loader.setResponseType?.('text');
      loader.load(
        url,
        (text) => {
          try {
            resolve(JSON.parse(text));
          } catch (err) {
            reject(err);
          }
        },
        undefined,
        reject
      );
    });
  }

  /**
   * 依模型套用 base pose preset；model-specific 失敗時退回 default。
   * @param {string} url
   * @returns {Promise<void>}
   */
  async #loadPosePresetForModel(url) {
    const presetUrl = getPosePresetUrlForModel(url);
    try {
      const preset = await this.#loadJsonAsset(presetUrl);
      this.#motion.loadPosePreset(preset);
      return;
    } catch (err) {
      console.warn(`[VrmMascot] Failed to load pose preset ${presetUrl}:`, err);
    }

    if (presetUrl === DEFAULT_POSE_PRESET_URL) {
      this.#motion.resetBasePoseAll();
      return;
    }

    try {
      const fallbackPreset = await this.#loadJsonAsset(DEFAULT_POSE_PRESET_URL);
      this.#motion.loadPosePreset(fallbackPreset);
    } catch (err) {
      console.warn('[VrmMascot] Failed to load default pose preset:', err);
      this.#motion.resetBasePoseAll();
    }
  }

  /**
   * 載入 VRM 模型（主要 API）
   * @param {string} url - .vrm 檔案路徑
   * @returns {Promise<void>}
   */
  async load(url) {
    // 清理舊模型
    this._vrmDispose();

    return new Promise((resolve, reject) => {
      const loader = new THREE.GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          this._vrmFromGltf(gltf).then(async (vrm) => {
            this.#currentVRM = vrm;
            this.#scene.add(vrm.scene);

            // VRM 面向攝影機
            vrm.scene.rotation.y = Math.PI;
            vrm.scene.position.y = -0.95;

            // 啟用陰影
            vrm.scene.traverse((obj) => {
              if (obj.isMesh) {
                obj.castShadow = true;
                obj.receiveShadow = true;
              }
            });

            // 綁定子系統
            this.#motion.setVrm(vrm, url);
            await this.#loadPosePresetForModel(url);
            this.#expression.setVrm(vrm);
            this.#lookAtCtrl.setVrm(vrm);

            // 關閉 VRM 內建 lookAt（我們手動控制頭部）
            if (vrm.lookAt) {
              vrm.lookAt.autoUpdate = false;
            }

            // 啟動眨眼
            this.#expression.startAutoBlink(2000, 5500);

            // 啟動滑鼠注視
            this.#lookAtCtrl.setTarget('mouse');

            this.onLoaded?.();
            resolve();
          }).catch(reject);
        },
        (progress) => {
          const pct = progress.total > 0
            ? Math.round(progress.loaded / progress.total * 100)
            : 0;
          this.onLoadProgress?.(pct);
        },
        (error) => {
          this.onLoadError?.(error);
          reject(error);
        }
      );
    });
  }

  /** @deprecated 用 load() 代替 */
  async loadModel(url) { return this.load(url); }

  /**
   * 從 File 物件載入 VRM
   * @param {File} file
   * @returns {Promise<void>}
   */
  async loadFromFile(file) {
    const url = URL.createObjectURL(file);
    try {
      await this.load(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** @deprecated 用 loadFromFile() 代替 */
  async loadModelFromFile(file) { return this.loadFromFile(file); }

  /**
   * 載入自訂 JSON 動作動畫
   * @param {string} url
   * @returns {Promise<object>}
   */
  async loadCustomAnimation(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load custom animation: ${res.statusText}`);
    return await res.json();
  }

  /**
   * 從 File 物件載入自訂 JSON 動作動畫
   * @param {File} file
   * @returns {Promise<object>}
   */
  async loadCustomAnimationFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          resolve(data);
        } catch (err) {
          reject(new Error(`Failed to parse motion JSON: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsText(file);
    });
  }

  // ── 滑鼠事件 ─────────────────────────

  /**
   * 處理滑鼠移動（由外部 mousemove 呼叫）
   * @param {MouseEvent} event
   */
  handleMouseMove(event) {
    const rect = this.#container.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.#lookAtCtrl.onMouseMove(nx, ny);
  }

  // ══ VRM Version Abstraction Layer ════════
  // 以下 _vrm* 方法封裝所有 VRM 版本相關 API。
  // Phase 2 升級 three-vrm 3.x 時，只需改這區塊。

  /**
   * 從 GLTF 建立 VRM（0.6.7: VRM.from / 3.x: VRMLoaderPlugin）
   * @internal
   */
  _vrmFromGltf(gltf) {
    const VRM = THREE.VRM || (typeof THREE_VRM !== 'undefined' && THREE_VRM.VRM);
    if (!VRM) throw new Error('THREE.VRM not available');
    return VRM.from(gltf);
  }

  /**
   * 取得 BlendShape Proxy（0.6.7: blendShapeProxy / 3.x: expressionManager）
   * @internal
   */
  _getBlendShapeProxy() {
    return this.#currentVRM?.blendShapeProxy
        ?? this.#currentVRM?.expressionManager
        ?? null;
  }

  /**
   * 取得骨骼節點（0.6.7: getBoneNode / 3.x: getNormalizedBoneNode）
   * @internal
   */
  _getBoneNode(boneName) {
    const h = this.#currentVRM?.humanoid;
    if (!h) return null;
    return h.getNormalizedBoneNode?.(boneName)
        ?? h.getBoneNode?.(boneName)
        ?? null;
  }

  /**
   * 更新 VRM 內部系統（springBone 等）
   * @internal
   */
  _vrmUpdate(dt) {
    this.#currentVRM?.update(dt);
  }

  /**
   * 清理 VRM 模型
   * @internal
   */
  _vrmDispose() {
    if (!this.#currentVRM) return;
    this.#scene.remove(this.#currentVRM.scene);
    const utils = THREE.VRMUtils || (typeof THREE_VRM !== 'undefined' && THREE_VRM.VRMUtils);
    utils?.deepDispose?.(this.#currentVRM.scene);
    this.#currentVRM = null;
  }

  // ── 重置攝影機 ────────────────────────

  resetCamera() {
    if (this.#camera) {
      this.#camera.position.set(0.0, 0.75, 2.8);
    }
    if (this.#orbitControls) {
      this.#orbitControls.target.set(0.0, 0.45, 0.0);
      this.#orbitControls.update();
    }
  }

  // ── Three.js 初始化 ───────────────────

  #init3D(options) {
    const { orbitControls = true, grid = true } = options;

    this.#scene = new THREE.Scene();
    this.#scene.background = new THREE.Color(0x0e1525);

    // 地板網格
    if (grid) {
      const gridHelper = new THREE.GridHelper(10, 24, 0x1a2a40, 0x14202e);
      gridHelper.position.y = -0.95;
      this.#scene.add(gridHelper);
    }

    // 攝影機
    const aspect = this.#container.clientWidth / Math.max(1, this.#container.clientHeight);
    this.#camera = new THREE.PerspectiveCamera(28, aspect, 0.1, 50.0);
    this.#camera.position.set(0.0, 0.75, 2.8);

    // 渲染器
    this.#renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.#renderer.setSize(this.#container.clientWidth, this.#container.clientHeight);
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.outputEncoding = THREE.sRGBEncoding;
    this.#renderer.shadowMap.enabled = true;
    this.#container.appendChild(this.#renderer.domElement);

    // 軌道控制
    if (orbitControls) {
      this.#orbitControls = new THREE.OrbitControls(this.#camera, this.#renderer.domElement);
      this.#orbitControls.screenSpacePanning = true;
      this.#orbitControls.target.set(0.0, 0.45, 0.0);
      this.#orbitControls.enableDamping = true;
      this.#orbitControls.dampingFactor = 0.12;
      this.#orbitControls.maxDistance = 8;
      this.#orbitControls.minDistance = 1;
      this.#orbitControls.update();

      // 監聽相機拖拽操作以更新 isUserInteracting
      this.#orbitControls.addEventListener('start', () => {
        this.#isUserInteracting = true;
      });
      this.#orbitControls.addEventListener('end', () => {
        this.#isUserInteracting = false;
      });
    }

    // 燈光
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.#scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 4, 2);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    this.#scene.add(dirLight);

    // 補光（底光）
    const fillLight = new THREE.DirectionalLight(0x88aacc, 0.25);
    fillLight.position.set(-1, -1, 1);
    this.#scene.add(fillLight);

    // 背景柔光
    const hemiLight = new THREE.HemisphereLight(0x1a2a40, 0x080c16, 0.4);
    this.#scene.add(hemiLight);

    this.#clock = new THREE.Clock();
  }

  // ── 動畫迴圈 ──────────────────────────

  #startLoop() {
    const animate = () => {
      this.#rafId = requestAnimationFrame(animate);
      const dt = this.#clock.getDelta();

      // FPS 計算
      this.#frameCount++;
      this.#fpsTimer += dt;
      if (this.#fpsTimer >= 0.5) {
        this.#fps = Math.round(this.#frameCount / this.#fpsTimer);
        this.#frameCount = 0;
        this.#fpsTimer = 0;
        this.onFpsUpdate?.(this.#fps);
      }

      // 更新子系統（順序重要）
      this.#stateMachine.update(dt);   // 1. 狀態機：自動轉場
      this.#motion.update(dt);         // 2. 動作：身體骨骼
      this.#expression.update(dt);     // 3. 表情：眨眼 / BlendShape
      this._vrmUpdate(dt);             // 4. VRM 內部：springBone（lookAt 已關）
      this.#lookAtCtrl.update(dt);     // 5. 注視：頭/頸旋轉（在 vrm.update 之後，不會被覆蓋）

      // 軌道控制阻尼更新
      this.#orbitControls?.update();

      // 渲染
      this.#renderer.render(this.#scene, this.#camera);
    };
    animate();
  }

  // ── 視窗 Resize ───────────────────────

  #bindResize() {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.#camera.aspect = width / height;
          this.#camera.updateProjectionMatrix();
          this.#renderer.setSize(width, height);
        }
      }
    });
    observer.observe(this.#container);
  }

  // ── 清理 ──────────────────────────────

  dispose() {
    cancelAnimationFrame(this.#rafId);
    this.#actingBridge?.dispose?.();
    this.#motion.dispose();
    this.#expression.dispose();
    this.#lookAtCtrl.dispose();
    this.#stateMachine.dispose();
    this._vrmDispose();

    this.#renderer?.dispose();
    this.#container?.removeChild(this.#renderer?.domElement);
  }
}
