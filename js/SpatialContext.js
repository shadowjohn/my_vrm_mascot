/**
 * SpatialContext — 角色空間上下文記憶層
 *
 * 核心功能：
 *   - 記錄地圖當前操作狀態（畫面中心、啟用圖層、選取物件）
 *   - 提供座標格式校驗與常規化（normalizeCenter）
 *   - 提供 update / get / clear 等 API
 */

function normalizeCenter(center) {
  if (!Array.isArray(center) || center.length !== 2) return [120.6, 24.1];

  const lng = Number(center[0]);
  const lat = Number(center[1]);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return [120.6, 24.1];
  }

  return [lng, lat];
}

export class SpatialContext {
  #context = {
    selectedFeature: 'none',
    activeLayer: 'none',
    mapCenter: [120.6, 24.1]
  };
  #mascot = null;

  /**
   * @param {import('./VrmMascot.js').VrmMascot} mascot
   */
  constructor(mascot) {
    this.#mascot = mascot;
  }

  /**
   * 增量更新空間上下文
   * @param {object} newContext
   */
  update(newContext) {
    if (!newContext || typeof newContext !== 'object') return;

    const updated = {
      ...this.#context,
      ...newContext
    };

    if (newContext.mapCenter !== undefined) {
      updated.mapCenter = normalizeCenter(newContext.mapCenter);
    }

    this.#context = updated;
    this.#mascot.emitIntentUpdate();
  }

  /**
   * 獲取當前完整空間上下文
   * @returns {object}
   */
  get() {
    return { ...this.#context };
  }

  /**
   * 重設為預設空間狀態
   */
  clear() {
    this.#context = {
      selectedFeature: 'none',
      activeLayer: 'none',
      mapCenter: [120.6, 24.1]
    };
    this.#mascot.emitIntentUpdate();
  }
}
