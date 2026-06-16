/**
 * ActingBridge — 將 runtime / talking 事件正規化成 mascot.act(state)。
 *
 * 這層只負責橋接與優先權，不直接碰 expression、motion clip 或 gaze。
 */

const PRIORITY = Object.freeze({
  idle: 0,
  thinking: 1,
  speaking: 2,
  pending: 1,
  running: 3,
  done: 4,
  success: 4,
  warning: 5,
  blocked: 5,
  failed: 5,
  error: 5,
});

const TALKING_PRIORITY = Object.freeze({
  ...PRIORITY,
  done: 2.5,
  success: 2.5,
});

const TRANSIENT_STATES = new Set(['done', 'success']);
const ACTIVE_TRACE_STATES_SUPPRESSING_TALKING_TRANSIENT = new Set([
  'thinking',
  'running',
  'warning',
  'blocked',
  'failed',
  'error',
]);

function normalizeState(state) {
  const value = String(state || '').trim().toLowerCase();
  if (value === 'talk' || value === 'talking' || value === 'say') return 'speaking';
  if (value === 'pending') return 'thinking';
  if (value === 'timeout') return 'failed';
  if (Object.prototype.hasOwnProperty.call(PRIORITY, value)) return value;
  return 'idle';
}

function getTraceStep(trace, step) {
  return Array.isArray(trace)
    ? trace.find(item => item && item.step === step)
    : null;
}

function getPriority(priorityMap, state) {
  return Object.prototype.hasOwnProperty.call(priorityMap, state)
    ? priorityMap[state]
    : 0;
}

function shouldSuppressTalkingTransient(traceState, talkingState) {
  const trace = normalizeState(traceState);
  const talking = normalizeState(talkingState);
  return TRANSIENT_STATES.has(talking)
    && ACTIVE_TRACE_STATES_SUPPRESSING_TALKING_TRANSIENT.has(trace);
}

export function normalizeTalkingState(state) {
  return normalizeState(state);
}

export function resolveTraceActingState(intentObj = {}) {
  const trace = Array.isArray(intentObj?.trace) ? intentObj.trace : [];
  const policyCheck = getTraceStep(trace, 'policy_check');
  const executeTool = getTraceStep(trace, 'execute_tool');
  const policyStatus = String(policyCheck?.status || '').trim().toLowerCase();
  const executeStatus = String(executeTool?.status || '').trim().toLowerCase();

  if (policyStatus === 'blocked') return 'blocked';
  if (policyStatus === 'warning') return 'warning';

  if (executeStatus === 'pending') return 'thinking';
  if (executeStatus === 'running') return 'running';
  if (executeStatus === 'done') return 'done';
  if (executeStatus === 'complete') return 'done';
  if (executeStatus === 'success') return 'success';
  if (executeStatus === 'failed') return 'failed';
  if (executeStatus === 'timeout') return 'failed';
  if (executeStatus === 'error') return 'error';
  if (executeStatus === 'warning') return 'warning';

  return 'idle';
}

export function chooseActingState(traceState = 'idle', talkingState = 'idle') {
  const trace = normalizeState(traceState);
  const talking = normalizeState(talkingState);
  const tracePriority = getPriority(PRIORITY, trace);
  const talkingPriority = getPriority(TALKING_PRIORITY, talking);
  return tracePriority >= talkingPriority ? trace : talking;
}

export class ActingBridge {
  #mascot = null;
  #disposed = false;
  #traceState = 'idle';
  #talkingState = 'idle';
  #currentState = 'none';
  #transientTimer = null;
  #transientState = null;
  #transientToken = 0;
  #now = () => Date.now();
  #setTimeoutFn = (fn, ms) => setTimeout(fn, ms);
  #clearTimeoutFn = (id) => clearTimeout(id);
  #transientMs = 1400;

  constructor(mascot, options = {}) {
    this.#mascot = mascot || null;
    this.#now = typeof options.now === 'function' ? options.now : this.#now;
    this.#setTimeoutFn = typeof options.setTimeoutFn === 'function'
      ? options.setTimeoutFn
      : this.#setTimeoutFn;
    this.#clearTimeoutFn = typeof options.clearTimeoutFn === 'function'
      ? options.clearTimeoutFn
      : this.#clearTimeoutFn;
    this.#transientMs = Number.isFinite(options.transientMs)
      ? Math.max(0, options.transientMs)
      : this.#transientMs;
  }

  get traceState() {
    return this.#traceState;
  }

  get talkingState() {
    return this.#talkingState;
  }

  get currentState() {
    return this.#currentState;
  }

  dispose() {
    this.#disposed = true;
    this.#clearTransientTimer();
    this.#mascot = null;
    this.#traceState = 'idle';
    this.#talkingState = 'idle';
    this.#currentState = 'none';
  }

  onTraceUpdate(intentObj = {}) {
    if (this.#disposed) {
      return this.#disposedResult();
    }

    this.#traceState = resolveTraceActingState(intentObj);
    if (shouldSuppressTalkingTransient(this.#traceState, this.#talkingState)) {
      this.#talkingState = 'idle';
    }
    return this.resolve({
      source: 'trace',
      intent: intentObj,
    });
  }

  onTalkingState(state, meta = {}) {
    if (this.#disposed) {
      return this.#disposedResult();
    }

    const talkingState = normalizeTalkingState(state);
    this.#talkingState = shouldSuppressTalkingTransient(this.#traceState, talkingState)
      ? 'idle'
      : talkingState;
    return this.resolve({
      source: 'talking',
      talkingState: this.#talkingState,
      ...meta,
    });
  }

  resolve(meta = {}) {
    if (this.#disposed) {
      return this.#disposedResult();
    }

    const nextState = chooseActingState(this.#traceState, this.#talkingState);
    const result = this.#applyState(nextState, meta);
    this.#syncTransientTimer(nextState, {
      refreshExisting: meta?.source !== 'transient_timeout',
    });
    return result;
  }

  #applyState(state, meta = {}) {
    if (state === this.#currentState) {
      return {
        state,
        skipped: true,
      };
    }

    this.#currentState = state;
    return this.#mascot?.act?.(state, {
      source: 'acting_bridge',
      bridgeSource: meta.source || 'resolve',
      traceState: this.#traceState,
      talkingState: this.#talkingState,
      time: this.#now(),
      ...meta,
    }) || null;
  }

  #disposedResult() {
    return {
      state: this.#currentState,
      skipped: true,
      disposed: true,
    };
  }

  #syncTransientTimer(state, options = {}) {
    const refreshExisting = options.refreshExisting !== false;

    if (!TRANSIENT_STATES.has(state)) {
      this.#clearTransientTimer();
      return;
    }

    if (this.#transientState === state && this.#transientTimer) {
      if (!refreshExisting) {
        return;
      }
    }

    this.#clearTransientTimer();
    this.#transientState = state;
    const token = this.#transientToken + 1;
    this.#transientToken = token;
    this.#transientTimer = this.#setTimeoutFn(() => {
      if (token !== this.#transientToken || this.#transientState !== state) {
        return;
      }
      if (this.#traceState === state) {
        this.#traceState = 'idle';
      }
      if (this.#talkingState === state) {
        this.#talkingState = 'idle';
      }
      this.#transientTimer = null;
      this.#transientState = null;
      this.resolve({ source: 'transient_timeout' });
    }, this.#transientMs);
  }

  #clearTransientTimer() {
    const hadTransient = this.#transientTimer || this.#transientState;
    if (this.#transientTimer) {
      this.#clearTimeoutFn(this.#transientTimer);
    }
    if (hadTransient) {
      this.#transientToken += 1;
    }
    this.#transientTimer = null;
    this.#transientState = null;
  }
}
