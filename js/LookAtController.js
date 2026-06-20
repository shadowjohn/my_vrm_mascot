/**
 * LookAtController — 滑鼠注視系統
 *
 * 將滑鼠螢幕座標轉換為頭部 bone 旋轉，帶 EMA 平滑。
 * 與 MotionController 共存：LookAt 只控制頭部，Motion 控制其他骨骼。
 */

export class LookAtController {
  #vrm = null;
  #headBone = null;
  #neckBone = null;
  #enabled = true;
  #targetMode = 'mouse';
  #elapsed = 0;
  #previewYawDegrees = 0;
  #previewPitchDegrees = 0;
  #previewConfidence = 0;

  // 目標（滑鼠正規化座標 -1~1）
  #targetX = 0;
  #targetY = 0;

  // 平滑後的值
  #smoothX = 0;
  #smoothY = 0;

  // 參數
  #alpha = 0.10;    // EMA 係數（越小越滑）
  #maxYaw = 30;     // 最大左右轉角（度）
  #maxPitch = 20;   // 最大上下仰角（度）
  #neckRatio = 0.3; // 脖子分攤比例
  #headOffset = null;
  #neckOffset = null;


  /**
   * 綁定 VRM 模型
   * @param {object} vrm - three-vrm VRM instance
   */
  setVrm(vrm) {
    this.#vrm = vrm;
    // getBoneNode 使用 VRM 0.6.7 的 lowercase bone names
    this.#headBone = vrm.humanoid?.getBoneNode('head') ?? null;
    this.#neckBone = vrm.humanoid?.getBoneNode('neck') ?? null;
    this.#elapsed = 0;
  }

  /** 開啟/關閉注視 */
  setEnabled(flag) {
    this.#enabled = flag;
    this.#targetMode = flag ? 'mouse' : 'disabled';
    if (!flag) {
      this.#targetX = 0;
      this.#targetY = 0;
    }
  }

  /** @returns {boolean} */
  get enabled() {
    return this.#enabled;
  }

  /**
   * 設定注視模式
   * @param {'mouse'|'point'|'none'} type
   * @param {{x?:number, y?:number}} [data]
   */
  setTarget(type, data) {
    switch (type) {
      case 'none':
        this.#enabled = false;
        this.#targetMode = 'none';
        this.#targetX = 0;
        this.#targetY = 0;
        break;
      case 'mouse':
        this.#enabled = true;
        this.#targetMode = 'mouse';
        break;
      case 'point':
        this.#enabled = true;
        this.#targetMode = 'point';
        if (data) {
          this.#targetX = data.x ?? 0;
          this.#targetY = data.y ?? 0;
        }
        break;
    }
  }

  /**
   * 設定影片姿勢拷貝的頭部注視方向。
   * @param {{yawDegrees?:number, pitchDegrees?:number, confidence?:number}} gaze
   */
  setPreviewGaze(gaze = {}) {
    const confidence = Math.max(0, Math.min(1, Number(gaze.confidence) || 0));
    this.#enabled = true;
    this.#targetMode = confidence >= 0.35 ? 'preview' : 'preview_low_confidence';
    this.#previewYawDegrees = this.#targetMode === 'preview'
      ? Math.max(-45, Math.min(45, Number(gaze.yawDegrees) || 0))
      : 0;
    this.#previewPitchDegrees = this.#targetMode === 'preview'
      ? Math.max(-30, Math.min(30, Number(gaze.pitchDegrees) || 0))
      : 0;
    this.#previewConfidence = confidence;
  }

  /**
   * 處理滑鼠移動（由外部 mousemove 事件呼叫）
   * @param {number} nx - 正規化 X (-1 ~ 1，左到右)
   * @param {number} ny - 正規化 Y (-1 ~ 1，下到上)
   */
  onMouseMove(nx, ny) {
    if (!this.#enabled) return;
    this.#targetX = Math.max(-1, Math.min(1, nx));
    this.#targetY = Math.max(-1, Math.min(1, ny));
  }

  /**
   * Debug 資訊
   * @returns {{yaw: number, pitch: number}}
   */
  get debugValues() {
    return {
      yaw: +(this.#smoothX * this.#maxYaw).toFixed(1),
      pitch: +(this.#smoothY * this.#maxPitch).toFixed(1),
      mode: this.#targetMode,
      confidence: +this.#previewConfidence.toFixed(2),
    };
  }

  /**
   * 每幀更新
   * @param {number} dt - deltaTime in seconds
   */
  update(dt, offsets = {}) {
    if (!this.#headBone) return;
    this.#elapsed += dt;

    this.#headOffset = offsets.headOffset || null;
    this.#neckOffset = offsets.neckOffset || null;

    if (!this.#enabled) {
      if (this.#targetMode === 'none') {
        this.#applyIdleHeadDrift();
      }
      return;
    }

    if (this.#targetMode === 'preview' || this.#targetMode === 'preview_low_confidence') {
      this.#applyHeadRotation(this.#previewYawDegrees, this.#previewPitchDegrees);
      return;
    }

    // EMA 平滑
    this.#smoothX += (this.#targetX - this.#smoothX) * this.#alpha;
    this.#smoothY += (this.#targetY - this.#smoothY) * this.#alpha;

    this.#applyHeadRotation(this.#smoothX * this.#maxYaw, this.#smoothY * this.#maxPitch);
  }

  #applyHeadRotation(yawDegrees, pitchDegrees) {
    const yawRad = yawDegrees * Math.PI / 180;
    const pitchRad = pitchDegrees * Math.PI / 180;

    const DEG = Math.PI / 180;
    const neckOffset = this.#neckOffset || { x: 0, y: 0, z: 0 };
    const headOffset = this.#headOffset || { x: 0, y: 0, z: 0 };

    // 分攤到脖子和頭部，並加上 base offset
    if (this.#neckBone) {
      this.#neckBone.rotation.x = pitchRad * this.#neckRatio + (neckOffset.x || 0) * DEG;
      this.#neckBone.rotation.y = yawRad * this.#neckRatio + (neckOffset.y || 0) * DEG;
      this.#neckBone.rotation.z = (neckOffset.z || 0) * DEG;
    }

    // 頭部拿剩餘的旋轉，並加上 base offset
    const headRatio = 1 - this.#neckRatio;
    this.#headBone.rotation.x = pitchRad * headRatio + (headOffset.x || 0) * DEG;
    this.#headBone.rotation.y = yawRad * headRatio + (headOffset.y || 0) * DEG;
    this.#headBone.rotation.z = (headOffset.z || 0) * DEG;
  }

  #applyIdleHeadDrift() {
    const yawRad = Math.sin(this.#elapsed * 0.38 + 0.4) * 1.2 * Math.PI / 180;
    const pitchRad = Math.sin(this.#elapsed * 0.44 + 1.2) * 0.9 * Math.PI / 180;
    const rollRad = Math.sin(this.#elapsed * 0.31 + 0.8) * 0.6 * Math.PI / 180;

    const DEG = Math.PI / 180;
    const neckOffset = this.#neckOffset || { x: 0, y: 0, z: 0 };
    const headOffset = this.#headOffset || { x: 0, y: 0, z: 0 };

    if (this.#neckBone) {
      this.#neckBone.rotation.x = pitchRad * 0.25 + (neckOffset.x || 0) * DEG;
      this.#neckBone.rotation.y = yawRad * 0.25 + (neckOffset.y || 0) * DEG;
      this.#neckBone.rotation.z = rollRad * 0.2 + (neckOffset.z || 0) * DEG;
    }

    this.#headBone.rotation.x = pitchRad * 0.75 + (headOffset.x || 0) * DEG;
    this.#headBone.rotation.y = yawRad * 0.75 + (headOffset.y || 0) * DEG;
    this.#headBone.rotation.z = rollRad * 0.8 + (headOffset.z || 0) * DEG;
  }

  /** 清理 */
  dispose() {
    this.#vrm = null;
    this.#headBone = null;
    this.#neckBone = null;
  }
}
