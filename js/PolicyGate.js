/**
 * PolicyGate — 安全策略保護網關
 *
 * 核心功能：
 *   - 提供工具執行前的風險控制與安全檢查與可解釋性
 *   - 支援 requiredArgs, allowedArgs 校驗
 *   - 支援 allowedTargetPrefixes 前綴規則校驗
 *   - 提供 risk 分級與 requireConfirm 確認標籤
 *   - 提供 explain() 解釋契約違反細節
 */
export class PolicyGate {
  #mascot = null;
  #policies = new Map();

  /**
   * @param {import('./VrmMascot.js').VrmMascot} mascot
   */
  constructor(mascot) {
    this.#mascot = mascot;

    // 註冊預設工具政策
    this.registerPolicy('download_report', {
      risk: 'low',
      requireConfirm: false,
      allowedArgs: ['featureId'],
      requiredArgs: ['featureId'],
      allowedTargetPrefixes: ['PIPE-', 'CCTV-']
    });

    this.registerPolicy('query_pipe', {
      risk: 'low',
      requireConfirm: false,
      allowedArgs: ['x', 'y'],
      requiredArgs: ['x', 'y'],
      allowedTargetPrefixes: []
    });

    this.registerPolicy('query_cctv', {
      risk: 'low',
      requireConfirm: false,
      allowedArgs: ['x', 'y'],
      requiredArgs: ['x', 'y'],
      allowedTargetPrefixes: []
    });
  }

  /**
   * 註冊工具之安全政策
   * @param {string} toolName
   * @param {object} policy
   */
  registerPolicy(toolName, policy) {
    const cleanName = String(toolName || '').trim().toLowerCase();
    this.#policies.set(cleanName, {
      risk: policy.risk || 'low',
      requireConfirm: !!policy.requireConfirm,
      allowedArgs: policy.allowedArgs || [],
      requiredArgs: policy.requiredArgs || [],
      allowedTargetPrefixes: policy.allowedTargetPrefixes || []
    });
  }

  /**
   * 取得工具安全政策
   * @param {string} toolName
   * @returns {object|null}
   */
  getPolicy(toolName) {
    const cleanName = String(toolName || '').trim().toLowerCase();
    return this.#policies.get(cleanName) || null;
  }

  /**
   * 進行安全策略評估，產出詳細合約與狀態解釋
   * @param {string} toolName
   * @param {object} args
   * @returns {object} 解釋物件
   */
  explain(toolName, args = {}) {
    const cleanName = String(toolName || '').trim().toLowerCase();

    // 1. Tool Exists 檢查
    if (!this.#mascot.toolRegistry || !this.#mascot.toolRegistry.has(cleanName)) {
      return {
        toolName: cleanName,
        allowed: false,
        reason: 'unregistered',
        message: `安全策略攔截：工具 ${toolName} 未註冊。`,
        missingArgs: [],
        illegalArgs: [],
        requiredConfirmation: false
      };
    }

    const policy = this.getPolicy(cleanName);
    if (!policy) {
      return {
        toolName: cleanName,
        allowed: false,
        reason: 'no_policy',
        message: `安全策略攔截：工具 ${toolName} 沒有定義安全政策。`,
        missingArgs: [],
        illegalArgs: [],
        requiredConfirmation: false
      };
    }

    // 2. Required Args 檢查 (缺少必要參數)
    const missingArgs = [];
    if (policy.requiredArgs) {
      for (const reqKey of policy.requiredArgs) {
        if (!args || args[reqKey] === undefined || args[reqKey] === null || args[reqKey] === '') {
          missingArgs.push(reqKey);
        }
      }
    }
    if (missingArgs.length > 0) {
      return {
        toolName: cleanName,
        allowed: false,
        reason: 'missing_required_arg',
        message: `安全策略攔截：工具 ${toolName} 缺少必要參數 ${missingArgs.join(', ')}。`,
        missingArgs,
        illegalArgs: [],
        requiredConfirmation: false
      };
    }

    // 3. Allowed Args 檢查 (包含未允許參數)
    const illegalArgs = [];
    if (args) {
      for (const key of Object.keys(args)) {
        if (!policy.allowedArgs.includes(key)) {
          illegalArgs.push(key);
        }
      }
    }
    if (illegalArgs.length > 0) {
      return {
        toolName: cleanName,
        allowed: false,
        reason: 'disallowed_arg',
        message: `安全策略攔截：工具 ${toolName} 包含未允許的參數 ${illegalArgs.join(', ')}。`,
        missingArgs: [],
        illegalArgs,
        requiredConfirmation: false
      };
    }

    // 4. Target Prefix 前綴規則檢查
    if (policy.allowedTargetPrefixes && policy.allowedTargetPrefixes.length > 0) {
      const targetValues = [];
      if (args) {
        for (const [key, val] of Object.entries(args)) {
          if (typeof val === 'string') {
            targetValues.push(val);
          }
        }
      }

      for (const val of targetValues) {
        const isAllowed = policy.allowedTargetPrefixes.some(prefix => val.startsWith(prefix));
        if (!isAllowed) {
          return {
            toolName: cleanName,
            allowed: false,
            reason: 'target_prefix_not_allowed',
            message: `安全策略攔截：標的識別碼 "${val}" 不符合允許的前綴規則 (${policy.allowedTargetPrefixes.join(', ')})。`,
            missingArgs: [],
            illegalArgs: [],
            requiredConfirmation: false
          };
        }
      }
    }

    // 5. Risk / Confirmation 檢查
    if (policy.requireConfirm) {
      return {
        toolName: cleanName,
        allowed: false,
        reason: 'require_confirmation',
        message: `安全策略攔截：執行工具 ${toolName} 需要使用者確認。`,
        missingArgs: [],
        illegalArgs: [],
        requiredConfirmation: true
      };
    }

    return {
      toolName: cleanName,
      allowed: true,
      reason: 'allowed',
      message: '安全策略審查通過，可以執行。',
      missingArgs: [],
      illegalArgs: [],
      requiredConfirmation: false
    };
  }

  /**
   * 檢查工具執行安全政策，並包裹 explain() 結果回傳
   * @param {string} toolName
   * @param {object} args
   * @returns {object} { ok, reason, error, explanation }
   */
  check(toolName, args = {}) {
    const explanation = this.explain(toolName, args);
    return {
      ok: explanation.allowed,
      reason: explanation.reason,
      error: explanation.allowed ? null : explanation.message,
      explanation
    };
  }
}
