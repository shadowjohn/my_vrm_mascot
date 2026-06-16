/**
 * DomContext — 角色網頁 DOM 上下文感知層
 *
 * 核心功能：
 *   - 自動攔截並記錄使用者當前 Focus / Click / Input 的元素
 *   - 提供表單狀態（Form State）與校驗狀態（Validation State）追蹤
 *   - 限制敏感資料收集（如密碼輸入框），提供安全的 value 預覽截斷
 */

export class DomContext {
  #state = {
    activeElement: null,
    lastClickedElement: null,
    formState: {},
    validationState: {},
    selectedDomTarget: null,
    updatedAt: null
  };
  #mascot = null;

  /**
   * @param {import('./VrmMascot.js').VrmMascot} mascot
   */
  constructor(mascot) {
    this.#mascot = mascot;
    this.#bindEvents();
  }

  /**
   * 增量更新 DOM 上下文
   * @param {object} newContext
   */
  update(newContext) {
    if (!newContext || typeof newContext !== 'object') return;
    this.#state = {
      ...this.#state,
      ...newContext,
      updatedAt: Date.now()
    };
    this.#mascot.emitIntentUpdate();
  }

  /**
   * 獲取當前完整 DOM 上下文快照
   * @returns {object}
   */
  get() {
    return {
      activeElement: this.#state.activeElement,
      lastClickedElement: this.#state.lastClickedElement,
      formState: { ...this.#state.formState },
      validationState: { ...this.#state.validationState },
      selectedDomTarget: this.#state.selectedDomTarget,
      updatedAt: this.#state.updatedAt
    };
  }

  /**
   * 重置 DOM 上下文
   */
  clear() {
    this.#state = {
      activeElement: null,
      lastClickedElement: null,
      formState: {},
      validationState: {},
      selectedDomTarget: null,
      updatedAt: Date.now()
    };
    this.#mascot.emitIntentUpdate();
  }

  /**
   * 監聽全域事件
   */
  #bindEvents() {
    // 監聽 Focus 元素
    document.addEventListener('focusin', (e) => {
      const elContext = this.readDomElementContext(e.target);
      if (elContext) {
        this.#state.activeElement = elContext;
        this.#state.updatedAt = Date.now();
        this.#mascot.emitIntentUpdate();
      }
    });

    // 監聽 Click 元素
    document.addEventListener('click', (e) => {
      const elContext = this.readDomElementContext(e.target);
      if (elContext) {
        this.#state.lastClickedElement = elContext;
        this.#state.updatedAt = Date.now();
        this.#mascot.emitIntentUpdate();
      }
    });

    // 監聽 Input 輸入
    document.addEventListener('input', (e) => {
      this.updateFormContext(e.target);
      this.#mascot.emitIntentUpdate();
    });
  }

  /**
   * 將 DOM 元素轉換為安全且精簡的資料結構
   * @param {HTMLElement} el
   */
  readDomElementContext(el) {
    if (!el) return null;

    const tag = el.tagName.toLowerCase();
    // 只記錄具備互動性質或關鍵的 UI 元件，避免暴漲
    const isInteractive = ['input', 'textarea', 'select', 'button', 'a'].includes(tag)
                          || el.hasAttribute('onclick')
                          || el.getAttribute('role') === 'button'
                          || el.classList.contains('btn')
                          || el.classList.contains('gis-input');

    if (!isInteractive) return null;

    return {
      tag: el.tagName,
      id: el.id || null,
      name: el.getAttribute('name') || null,
      type: el.getAttribute('type') || null,
      role: el.getAttribute('role') || null,
      label: this.getElementLabel(el),
      placeholder: el.getAttribute('placeholder') || null,
      valuePreview: this.getSafeValuePreview(el),
      required: el.required === true,
      valid: typeof el.checkValidity === 'function' ? el.checkValidity() : null,
      validationMessage: el.validationMessage || null,
      dataset: { ...el.dataset }
    };
  }

  /**
   * 更新特定欄位的表單值與校驗狀態
   * @param {HTMLElement} el
   */
  updateFormContext(el) {
    if (!el) return;
    const tag = el.tagName.toLowerCase();
    if (!['input', 'textarea', 'select'].includes(tag)) return;

    const key = el.id || el.getAttribute('name') || 'unknown';

    // 更新表單值
    this.#state.formState[key] = this.getSafeValuePreview(el);

    // 更新欄位校驗狀態
    const required = el.required === true;
    const valid = typeof el.checkValidity === 'function' ? el.checkValidity() : true;
    const message = el.validationMessage || '';

    this.#state.validationState[key] = {
      required,
      valid,
      validationMessage: message
    };

    this.#state.updatedAt = Date.now();
  }

  /**
   * 獲取元素的文字 Label (支援 aria-label、for 屬性、及 parent label)
   */
  getElementLabel(el) {
    if (!el) return null;

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    if (el.id) {
      const labelEl = document.querySelector(`label[for="${el.id}"]`);
      if (labelEl) return labelEl.textContent.trim();
    }

    const parentLabel = el.closest('label');
    if (parentLabel) {
      return parentLabel.textContent.replace(el.value || '', '').trim();
    }

    if (el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(el.type))) {
      return (el.textContent || '').trim() || el.value || null;
    }

    return null;
  }

  /**
   * 取得安全的值預覽 (截斷且排除密碼)
   */
  getSafeValuePreview(el) {
    if (!el) return '';
    if (el.type === 'password') return '********';
    const val = el.value || '';
    return String(val).slice(0, 100);
  }
}
