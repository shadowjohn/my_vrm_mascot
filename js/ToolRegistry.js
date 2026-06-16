/**
 * ToolRegistry — 工具能力註冊中心
 *
 * 核心功能：
 *   - 提供 mascot.tools.register() 註冊自訂異步工具
 *   - 提供 mascot.tools.list() 顯示當前 Agent 能力清單
 *   - 提供 簡易 Schema 驗證（Required Params 檢查）
 *   - 提供 未知工具與異常防範護欄
 */

export class ToolRegistry {
  #tools = new Map();

  /**
   * 註冊工具
   * @param {string} name - 工具名稱 (將自動格式化並做小寫處理)
   * @param {function} handler - 異步執行函數
   * @param {object} [options]
   * @param {string} [options.description] - 工具描述
   * @param {object} [options.schema] - 簡易校驗規格 (例如：{ required: ['x', 'y'] })
   */
  register(name, handler, options = {}) {
    // 1. 必修正 1：名稱格式化與正則驗證
    const cleanName = String(name || "").trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]*$/.test(cleanName)) {
      throw new Error(`[ToolRegistry] Invalid tool name: "${name}". Must match /^[a-z][a-z0-9_]*$/`);
    }

    if (typeof handler !== 'function') {
      throw new Error(`[ToolRegistry] Tool handler for "${cleanName}" must be a function`);
    }

    this.#tools.set(cleanName, {
      name: cleanName,
      handler,
      description: options.description || '',
      schema: options.schema || null
    });

    console.log(`[ToolRegistry] Registered capability: "${cleanName}" - ${options.description || 'No description'}`);
  }

  /**
   * 取得已註冊工具清單與描述
   * @returns {object[]}
   */
  list() {
    return Array.from(this.#tools.values()).map(t => ({
      name: t.name,
      description: t.description
    }));
  }

  /**
   * 檢查是否存在該工具
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    const cleanName = String(name || "").trim().toLowerCase();
    return this.#tools.has(cleanName);
  }

  /**
   * 執行指定的工具，並進行參數與合法性檢驗
   * @param {string} name
   * @param {object} args
   * @returns {Promise<any>}
   */
  async execute(name, args) {
    const cleanName = String(name || "").trim().toLowerCase();
    const tool = this.#tools.get(cleanName);

    // 必修正 3：未知工具拋出 error
    if (!tool) {
      throw new Error(`Unknown tool: ${cleanName}`);
    }

    // 必修正 2：簡易 required 參數存在驗證
    if (tool.schema && tool.schema.required) {
      for (const key of tool.schema.required) {
        if (args === undefined || args === null || args[key] === undefined || args[key] === null) {
          throw new Error(`Missing required parameter: ${key}`);
        }
      }
    }

    // 執行並回傳 Promise
    return await tool.handler(args);
  }

  /**
   * 執行指定的工具，做為 execute 的別名
   * @param {string} name
   * @param {object} args
   * @returns {Promise<any>}
   */
  async run(name, args) {
    return await this.execute(name, args);
  }
}
