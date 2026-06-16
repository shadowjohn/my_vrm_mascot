/**
 * ConversationMemory — 角色短期對話記憶層
 *
 * 核心功能：
 *   - 記錄最近執行工具結果、使用者輸入等上下文資訊
 *   - 支援 Memory Cap (上限 50 筆)
 *   - 支援 last(type) / getLastResult() 等便於查詢最新結果的 API
 */

export class ConversationMemory {
  #items = [];
  #mascot = null;
  maxItems = 50;

  /**
   * @param {import('./VrmMascot.js').VrmMascot} mascot
   * @param {number} [maxItems=50]
   */
  constructor(mascot, maxItems = 50) {
    this.#mascot = mascot;
    this.maxItems = maxItems;
  }

  /**
   * 新增一筆記憶項目
   * @param {object} item
   */
  add(item) {
    this.#items.unshift(item); // 最新的放在 index 0
    this.#items = this.#items.slice(0, this.maxItems);
    this.#mascot.emitIntentUpdate();
  }

  /**
   * 新增一筆記憶項目 (相容 push)
   * @param {object} item
   */
  push(item) {
    this.add(item);
  }

  /**
   * 取得最新的一筆記憶項目，或特定類型的最新項目
   * @param {string} [type] - 可選。例如 'tool_result'
   */
  last(type = null) {
    if (this.#items.length === 0) return null;
    if (!type) {
      return this.#items[0]; // index 0 即為最新
    }
    for (let i = 0; i < this.#items.length; i++) {
      if (this.#items[i].type === type) {
        return this.#items[i];
      }
    }
    return null;
  }

  /**
   * 取得最近一次工具的執行結果 (相容 getLastResult)
   */
  getLastResult() {
    const lastToolResult = this.last('tool_result');
    return lastToolResult ? lastToolResult.result : null;
  }

  /**
   * 清空所有記憶
   */
  clear() {
    this.#items = [];
    this.#mascot.emitIntentUpdate();
  }

  /**
   * 取得當前記憶項目數量
   */
  get length() {
    return this.#items.length;
  }

  /**
   * 取得完整的唯讀記憶陣列複製
   * @returns {object[]}
   */
  list() {
    return [...this.#items];
  }
}
