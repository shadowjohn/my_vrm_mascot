/**
 * ActionQueue — 角色行為佇列管理器
 *
 * 核心功能：
 *   - 依序排程多個動作，實現連貫的「行為組合」
 *   - 提供 Timeout Guard，防止單一狀態卡死阻塞佇列
 *   - 提供完備的中斷 (Interrupt) 與取消 (Cancel) 機制
 */

export class ActionQueue {
  #mascot = null;
  #queue = [];
  #activeAction = null;
  #isExecuting = false;
  #timeoutId = null;
  #currentToolToken = null;

  /** 佇列全部執行完畢且重歸閒置時的回調 */
  onQueueEmpty = null;

  /**
   * @param {import('./VrmMascot.js').VrmMascot} mascot
   */
  constructor(mascot) {
    this.#mascot = mascot;
  }

  /**
   * 新增動作到佇列（可為單一物件或陣列）
   * @param {object|object[]} action - 動作資料
   */
  enqueue(action) {
    if (Array.isArray(action)) {
      this.#queue.push(...action);
    } else {
      this.#queue.push(action);
    }
    this.#executeNext();
  }

  /**
   * 清空佇列並中斷當前動作
   * @param {string} [reason="cleared"]
   */
  clear(reason = 'cleared') {
    console.log(`[ActionQueue] Clearing queue. Reason: ${reason}`);
    this.#queue = [];
    this.#currentToolToken = null; // 廢棄先前的異步工具
    this.#cancelCurrent(reason);
    this.onQueueEmpty?.();
  }

  /**
   * 取得當前佇列中剩餘動作數量
   */
  get length() {
    return this.#queue.length;
  }

  /**
   * 當前是否有動作在執行中
   */
  get isExecuting() {
    return this.#isExecuting;
  }

  /**
   * 取得當前執行中的動作物件
   */
  get activeAction() {
    return this.#activeAction;
  }

  /**
   * 中斷當前執行中的動作
   */
  #cancelCurrent(reason = 'interrupted') {
    this.#clearTimeoutGuard();
    this.#currentToolToken = null; // 廢棄先前的異步工具
    if (this.#isExecuting && this.#activeAction) {
      this.#mascot.state.cancelCurrentState();
    }
    this.#activeAction = null;
    this.#isExecuting = false;
  }

  /**
   * 執行下一個排程動作
   */
  #executeNext() {
    if (this.#isExecuting || this.#queue.length === 0) return;

    this.#isExecuting = true;
    this.#activeAction = this.#queue.shift();

    const action = this.#activeAction;
    console.log('[ActionQueue] Start executing:', action);

    // 1. 設置 Timeout Guard (預設 8 秒)
    const timeoutDuration = action.timeout ?? 8000;
    this.#timeoutId = setTimeout(() => {
      console.warn(`[ActionQueue] Action timed out (${timeoutDuration}ms), skipping:`, action);
      if (action.type === 'tool') {
        const intentObj = action.intentObj;
        if (intentObj) {
          intentObj.status = 'failed';
          intentObj.result = { ok: false, error: 'Tool timeout' };
          if (this.#mascot.updateIntentTrace) {
            this.#mascot.updateIntentTrace(intentObj, "execute_tool", { status: "failed", reason: "timeout" });
          } else {
            this.#mascot.emitIntentUpdate();
          }
        }
        action.onToolComplete?.({ ok: false, error: 'Tool timeout' });
        this.#handleToolFailure(action, 'Tool timeout');
        return;
      }
      this.#cancelCurrent('timeout');
      // 稍微延遲後執行下一個，確保狀態機有時間回歸 idle
      setTimeout(() => this.#executeNext(), 50);
    }, timeoutDuration);

    // 2. 準備回調函數
    const onComplete = () => {
      this.#onActionFinished(action);
    };

    const onCancel = () => {
      // 被中斷，直接清除旗標，不主動觸發下一個（交由中斷者控制）
      this.#clearTimeoutGuard();
      this.#activeAction = null;
      this.#isExecuting = false;
    };

    // 3. 執行動作分發
    try {
      if (action.type === 'say') {
        // 說話（包含文字、表情、動作同步）
        this.#mascot.dispatch('talking', {
          text: action.text,
          emotion: action.emotion,
          motion: action.motion,
          onComplete,
          onCancel,
          fromQueue: true,
        });
      } else if (action.type === 'do' || action.type === 'emote') {
        // 程序式動作或表情
        this.#mascot.dispatch(action.name, {
          onComplete,
          onCancel,
          fromQueue: true,
        });
      } else if (action.type === 'tool') {
        const intentObj = action.intentObj;
        if (intentObj) {
          intentObj.status = 'running';
          if (this.#mascot.updateIntentTrace) {
            this.#mascot.updateIntentTrace(intentObj, "execute_tool", { status: "running" });
          } else {
            this.#mascot.emitIntentUpdate();
          }
        }

        if (this.#mascot.tools) {
          const currentActionToken = {};
          this.#currentToolToken = currentActionToken;

          const timeoutMs = action.timeout ?? 10000;
          let timeoutId;
          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error('Tool timeout'));
            }, timeoutMs);
          });

          Promise.race([
            Promise.resolve(this.#mascot.tools.execute(action.name, action.args)),
            timeoutPromise
          ])
          .then((result) => {
            clearTimeout(timeoutId);

            // 保護點 3：中斷後舊工具不注入，先確認 token 仍有效
            if (this.#currentToolToken !== currentActionToken) return; // stale discard

            const isOk = result && result.ok !== false;

            if (intentObj) {
              intentObj.status = isOk ? 'done' : 'failed';
              intentObj.result = result;
              if (this.#mascot.updateIntentTrace) {
                this.#mascot.updateIntentTrace(intentObj, "execute_tool", { status: isOk ? "done" : "failed" });
              } else {
                this.#mascot.emitIntentUpdate();
              }
            }

            // 觸發 Promise 解析回調
            action.onToolComplete?.(result);

            if (isOk) {
              console.log('[ActionQueue] Tool success:', result);

              // Automatically record tool result in mascot memory if memory exists
              if (this.#mascot.memory) {
                this.#mascot.memory.add({
                  type: 'tool_result',
                  tool: action.name,
                  result: result
                });
              }

              // 保護點 1：summary 要 safe string 且限制 200 字，同時支援 summary 或 message
              const summary = String(result?.summary || result?.message || "").slice(0, 200);

              // 保護點 2：沒有 summary/message 就不要注入 say
              if (!summary) {
                this.#onActionFinished(action);
                return;
              }

              // 進行對白編譯
              let compiledText = '';
              const afterText = action.afterText;
              if (afterText) {
                if (afterText.includes('{summary}')) {
                  compiledText = afterText.replace('{summary}', summary);
                } else {
                  // 拼接時補標點
                  compiledText = `${afterText}，${summary}`;
                }
              } else {
                compiledText = summary;
              }

              // 3. unshift 前要檢查 token
              if (this.#currentToolToken !== currentActionToken) {
                return;
              }

              // 將編譯好的 say 動作注入佇列最前面
              this.#queue.unshift({
                type: 'say',
                text: compiledText,
                emotion: action.afterEmotion || 'joy',
                motion: action.afterMotion || 'wave',
                fromQueue: true
              });

              this.#onActionFinished(action);
            } else {
              console.warn('[ActionQueue] Tool failed status:', result);
              this.#handleToolFailure(action, result?.error || 'Tool failed');
            }
          })
          .catch((err) => {
            clearTimeout(timeoutId);
            if (this.#currentToolToken !== currentActionToken) return; // stale discard

            if (intentObj) {
              intentObj.status = 'failed';
              intentObj.result = { ok: false, error: err.message || String(err) };
              if (this.#mascot.updateIntentTrace) {
                const reason = /timeout/i.test(err.message || String(err)) ? "timeout" : "error";
                this.#mascot.updateIntentTrace(intentObj, "execute_tool", { status: "failed", reason });
              } else {
                this.#mascot.emitIntentUpdate();
              }
            }

            action.onToolComplete?.({ ok: false, error: err.message || String(err) });

            console.warn('[ActionQueue] Tool error/timeout:', err);
            this.#handleToolFailure(action, err.message || err);
          });
        } else {
          console.warn('[ActionQueue] No ToolRegistry available on mascot');
          if (intentObj) {
            intentObj.status = 'failed';
            intentObj.result = { ok: false, error: 'No ToolRegistry available' };
            if (this.#mascot.updateIntentTrace) {
              this.#mascot.updateIntentTrace(intentObj, "execute_tool", { status: "failed" });
            } else {
              this.#mascot.emitIntentUpdate();
            }
          }
          action.onToolComplete?.({ ok: false, error: 'No ToolRegistry available' });
          this.#onActionFinished(action, true);
        }
      } else if (action.type === 'lookAt') {
        // 設定注視目標（非阻塞，立即完成）
        this.#mascot.lookAt.setTarget(action.target ?? 'mouse');
        this.#onActionFinished(action, true);
      } else if (action.type === 'wait') {
        // 延遲等待時間 (blocking)
        // 這裡將完成回調包在 setTimeout 中，當成 wait 狀態的 finish 機制
        this.#timeoutId = setTimeout(() => {
          this.#onActionFinished(action);
        }, action.duration ?? 1000);
      } else if (action.type === 'reset') {
        // 重設狀態（非阻塞，立即完成）
        this.#mascot.state.reset();
        this.#onActionFinished(action, true);
      } else {
        // 未知動作，直接跳過
        console.warn('[ActionQueue] Unknown action type:', action.type);
        this.#onActionFinished(action, true);
      }
    } catch (err) {
      console.error('[ActionQueue] Error executing action:', err);
      this.#cancelCurrent('error');
      setTimeout(() => this.#executeNext(), 50);
    }
  }

  /**
   * 動作執行完畢時呼叫
   * @param {object} action
   * @param {boolean} [immediate=false] - 是否立即執行下一動，不加過渡延遲
   */
  #onActionFinished(action, immediate = false) {
    this.#clearTimeoutGuard();
    this.#activeAction = null;
    this.#isExecuting = false;

    console.log('[ActionQueue] Action finished:', action);

    if (immediate) {
      this.#executeNext();
    } else {
      // 給予 50ms 的動畫過渡間隔，動作看起來會更自然
      setTimeout(() => this.#executeNext(), 50);
    }

    // 檢查佇列是否完全空置閒置
    if (this.#queue.length === 0 && !this.#isExecuting) {
      this.onQueueEmpty?.();
    }
  }

  /**
   * 清除 Timeout 守衛
   */
  #clearTimeoutGuard() {
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId);
      this.#timeoutId = null;
    }
  }

  #handleToolFailure(action, errorMsg) {
    this.clear(`tool_failure: ${errorMsg}`);
    this.#mascot.performIntent({
      intent: 'error',
      text: `抱歉，地圖查詢失敗：${errorMsg}`
    });
  }
}
