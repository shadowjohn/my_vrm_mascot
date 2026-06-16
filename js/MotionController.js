import { getMotionClip } from './MotionClips.js';

/**
 * MotionController — 程序式動作系統
 *
 * 管理 idle / think / presenting / warning 與短動作 clip。
 * 所有動作都是程序式產生（不依賴外部動畫檔），
 * Phase 2 再加入 Mixamo FBX / VRMA 支援。
 *
 * 注意：頭部由 LookAtController 控制，MotionController 不碰 head bone。
 */

/** 取得 VRM bone name 對應 (0.6.7 相容) */
function getBoneNames() {
  if (typeof THREE !== 'undefined' && THREE.VRMHumanoidBoneName) {
    return THREE.VRMHumanoidBoneName;
  }
  // fallback
  return {
    Spine: 'spine', Chest: 'chest', Hips: 'hips',
    LeftUpperArm: 'leftUpperArm', LeftLowerArm: 'leftLowerArm',
    RightUpperArm: 'rightUpperArm', RightLowerArm: 'rightLowerArm',
    LeftHand: 'leftHand', RightHand: 'rightHand',
    LeftUpperLeg: 'leftUpperLeg', LeftLowerLeg: 'leftLowerLeg',
    RightUpperLeg: 'rightUpperLeg', RightLowerLeg: 'rightLowerLeg',
    LeftShoulder: 'leftShoulder', RightShoulder: 'rightShoulder',
  };
}

const DEG = Math.PI / 180;

export const DEFAULT_POSE_PRESET_URL = 'motions/poses/default.json';
export const ALICIA_SOLID_POSE_PRESET_URL = 'motions/poses/alicia_solid.json';

const MODEL_POSE_PRESET_URLS = {
  'models/mascot.vrm': ALICIA_SOLID_POSE_PRESET_URL,
  'mascot.vrm': ALICIA_SOLID_POSE_PRESET_URL,
};

export const POSE_CALIBRATION_BONES = [
  'hips',
  'spine',
  'chest',
  'leftUpperArm',
  'rightUpperArm',
  'leftLowerArm',
  'rightLowerArm',
  'leftHand',
  'rightHand',
];

export const DEFAULT_POSE_PRESET = {
  model: 'default',
  basePose: {
    rotation: {
      spine:          { x: 2, y: 0, z: -2 },
      chest:          { x: -1, y: -2, z: -1 },
      leftShoulder:   { x: 0, y: 0, z: 4 },
      rightShoulder:  { x: 0, y: 0, z: -4 },
      leftUpperArm:   { x: 7, y: 0, z: 42 },
      rightUpperArm:  { x: 7, y: 0, z: -42 },
      leftLowerArm:   { x: 0, y: -9, z: 0 },
      rightLowerArm:  { x: 0, y: 9, z: 0 },
      leftHand:       { x: 0, y: 0, z: 0 },
      rightHand:      { x: 0, y: 0, z: 0 },
      leftUpperLeg:   { x: 1, y: 0, z: 2 },
      rightUpperLeg:  { x: -1, y: 0, z: -2 },
    },
    position: {
      hips:           { x: -0.008, y: 0, z: 0 },
    },
  },
};

const AXES = ['x', 'y', 'z'];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeAxes(input = {}, fallback = {}) {
  return {
    x: finiteNumber(input.x, finiteNumber(fallback.x, 0)),
    y: finiteNumber(input.y, finiteNumber(fallback.y, 0)),
    z: finiteNumber(input.z, finiteNumber(fallback.z, 0)),
  };
}

function normalizePosePreset(preset = {}) {
  const normalized = cloneJson(DEFAULT_POSE_PRESET);
  normalized.model = preset.model || normalized.model;

  const presetBasePose = preset.basePose || {};
  const presetRotation = presetBasePose.rotation || {};
  const presetPosition = presetBasePose.position || {};

  for (const bone of Object.keys(presetRotation)) {
    const fallback = normalized.basePose.rotation[bone] || { x: 0, y: 0, z: 0 };
    normalized.basePose.rotation[bone] = normalizeAxes(presetRotation[bone], fallback);
  }

  for (const bone of Object.keys(presetPosition)) {
    const fallback = normalized.basePose.position[bone] || { x: 0, y: 0, z: 0 };
    normalized.basePose.position[bone] = normalizeAxes(presetPosition[bone], fallback);
  }

  return normalized;
}

function assertAxis(axis) {
  if (!AXES.includes(axis)) {
    throw new Error(`Invalid pose axis: ${axis}`);
  }
}

function normalizeModelPresetKey(url = '') {
  return String(url)
    .split(/[?#]/)[0]
    .replace(/\\/g, '/')
    .replace(/^.*\/models\//, 'models/')
    .replace(/^.*\//, '')
    .toLowerCase();
}

/**
 * 依模型 URL 取得 base pose preset；找不到 model-specific preset 時回到 default。
 * @param {string} modelUrl
 * @returns {string}
 */
export function getPosePresetUrlForModel(modelUrl = '') {
  const normalized = String(modelUrl)
    .split(/[?#]/)[0]
    .replace(/\\/g, '/')
    .toLowerCase();
  const direct = MODEL_POSE_PRESET_URLS[normalized];
  if (direct) return direct;

  const key = normalizeModelPresetKey(modelUrl);
  return MODEL_POSE_PRESET_URLS[key] || DEFAULT_POSE_PRESET_URL;
}

/** 平滑插值 */
function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/** ease-in-out */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}


export class MotionController {
  #vrm = null;
  #currentAction = 'idle';
  #elapsed = 0;       // 當前動作經過時間 (s)
  #bones = {};
  #hipsBaseY = 0;     // hips 初始 Y 位置
  #customAnimData = null;
  #customOptions = {};
  #tempQ1 = null;
  #tempQ2 = null;
  #posePreset = normalizePosePreset(DEFAULT_POSE_PRESET);
  #activeClip = null;

  /**
   * 綁定 VRM 模型
   * @param {object} vrm
   */
  setVrm(vrm) {
    this.#vrm = vrm;
    this.#cacheBones();
    this.#currentAction = 'idle';
    this.#elapsed = 0;
    this.#activeClip = null;
    this.resetToNaturalPose(0);
  }

  /** 快取骨骼節點 */
  #cacheBones() {
    const h = this.#vrm.humanoid;
    const bn = getBoneNames();
    this.#bones = {
      spine:          h.getBoneNode(bn.Spine),
      chest:          h.getBoneNode(bn.Chest),
      hips:           h.getBoneNode(bn.Hips),
      leftUpperArm:   h.getBoneNode(bn.LeftUpperArm),
      leftLowerArm:   h.getBoneNode(bn.LeftLowerArm),
      rightUpperArm:  h.getBoneNode(bn.RightUpperArm),
      rightLowerArm:  h.getBoneNode(bn.RightLowerArm),
      leftHand:       h.getBoneNode(bn.LeftHand || 'leftHand'),
      rightHand:      h.getBoneNode(bn.RightHand || 'rightHand'),
      leftUpperLeg:   h.getBoneNode(bn.LeftUpperLeg),
      rightUpperLeg:  h.getBoneNode(bn.RightUpperLeg),
      leftShoulder:   h.getBoneNode(bn.LeftShoulder),
      rightShoulder:  h.getBoneNode(bn.RightShoulder),
    };
    // 記錄 hips 初始 Y
    if (this.#bones.hips) {
      this.#hipsBaseY = this.#bones.hips.position.y;
    }
  }

  /**
   * 播放動作
   * @param {string} name - 動作名 (idle|think|happy|presenting|warning 或 MotionClips clip name)
   */
  play(name) {
    if (getMotionClip(name)) {
      return this.playClip(name);
    }

    if (this.#currentAction !== name) {
      this.resetToNaturalPose(0);
    }
    this.#activeClip = null;
    this.#currentAction = name;
    this.#elapsed = 0;
    this.#clearMotionOverlay();
    return true;
  }

  /**
   * 播放短動作 clip；clip 結束後會回到 idle 並重套自然基準姿勢。
   * @param {string} name
   * @returns {boolean} 是否成功播放
   */
  playClip(name) {
    const clip = getMotionClip(name);
    if (!clip) return false;

    this.resetToNaturalPose(0);
    this.#activeClip = clip;
    this.#currentAction = name;
    this.#elapsed = 0;
    this.#clearMotionOverlay();
    return true;
  }

  /**
   * 播放自訂 JSON 動畫
   * @param {object} animData - JSON 動畫資料
   * @param {object} [options]
   * @param {boolean} [options.loop=false]
   * @param {function} [options.onComplete]
   */
  playCustom(animData, options = {}) {
    this.resetToNaturalPose(0);
    this.#activeClip = null;
    this.#currentAction = 'custom';
    this.#elapsed = 0;
    this.#customAnimData = animData;
    this.#customOptions = options;
  }

  /**
   * 回到自然基準姿勢，不回到 VRM bind/rest pose。
   * @param {number} [t=0]
   */
  resetToNaturalPose(t = 0) {
    if (!this.#vrm) return;
    this.#applyNaturalPose(t);
  }

  /**
   * 載入基準姿勢校準資料。rotation 使用度數，position 使用 VRM 場景單位。
   * @param {object} preset
   */
  loadPosePreset(preset = {}) {
    this.#posePreset = normalizePosePreset(preset);
    this.resetToNaturalPose(0);
    return this.getPosePreset();
  }

  /** @returns {object} 目前基準姿勢 preset（rotation 保持 degree） */
  getPosePreset() {
    return cloneJson(this.#posePreset);
  }

  /**
   * 更新單一骨骼 rotation 軸向（degree）。
   * @param {string} bone
   * @param {'x'|'y'|'z'} axis
   * @param {number} degrees
   */
  setBasePoseRotation(bone, axis, degrees) {
    assertAxis(axis);
    if (!this.#posePreset.basePose.rotation[bone]) {
      this.#posePreset.basePose.rotation[bone] = { x: 0, y: 0, z: 0 };
    }
    this.#posePreset.basePose.rotation[bone][axis] = finiteNumber(degrees, 0);
    this.resetToNaturalPose(0);
    return this.getPosePreset();
  }

  /**
   * 更新單一骨骼 position 軸向（目前主要給 hips 重心校準）。
   * @param {string} bone
   * @param {'x'|'y'|'z'} axis
   * @param {number} value
   */
  setBasePosePosition(bone, axis, value) {
    assertAxis(axis);
    if (!this.#posePreset.basePose.position[bone]) {
      this.#posePreset.basePose.position[bone] = { x: 0, y: 0, z: 0 };
    }
    this.#posePreset.basePose.position[bone][axis] = finiteNumber(value, 0);
    this.resetToNaturalPose(0);
    return this.getPosePreset();
  }

  /**
   * 重設單一骨骼校準值到預設基準。
   * @param {string} bone
   */
  resetBasePoseBone(bone) {
    const defaults = DEFAULT_POSE_PRESET.basePose;
    if (defaults.rotation[bone]) {
      this.#posePreset.basePose.rotation[bone] = cloneJson(defaults.rotation[bone]);
    } else {
      delete this.#posePreset.basePose.rotation[bone];
    }

    if (defaults.position[bone]) {
      this.#posePreset.basePose.position[bone] = cloneJson(defaults.position[bone]);
    } else {
      delete this.#posePreset.basePose.position[bone];
    }

    this.resetToNaturalPose(0);
    return this.getPosePreset();
  }

  /** 重設全部基準姿勢校準值。 */
  resetBasePoseAll() {
    this.#posePreset = normalizePosePreset(DEFAULT_POSE_PRESET);
    this.resetToNaturalPose(0);
    return this.getPosePreset();
  }

  /** 回到 idle */
  stop() {
    this.play('idle');
  }

  /** @returns {string} 當前動作名 */
  get currentAction() {
    return this.#currentAction;
  }

  /**
   * 每幀更新
   * @param {number} dt - deltaTime (s)
   */
  update(dt) {
    if (!this.#vrm) return;
    this.#elapsed += dt;

    if (this.#activeClip) {
      this.#updateClip(this.#activeClip);
      return;
    }

    switch (this.#currentAction) {
      case 'idle':        this.#doIdle(); break;
      case 'think':       this.#doThink(); break;
      case 'happy':       this.#doHappy(); break;
      case 'presenting':  this.#doPresenting(); break;
      case 'warning':     this.#doWarning(); break;
      case 'custom':      this.#doCustom(); break;
      default:            this.#doIdle(); break;
    }
  }

  // ── Idle：呼吸微動 ───────────────────────

  #doIdle() {
    const t = this.#elapsed;
    this.#applyNaturalPose(t);
    this.#applyIdleMicroMotion(t);
  }

  // ── Think：歪頭沉思 ────────────────────

  #doThink() {
    const t = this.#elapsed;
    const totalDuration = 3.0;

    if (t >= totalDuration) {
      this.#finishTimedAction();
      return;
    }

    this.#applyNaturalPose(t);
    this.#applyBreathingOverlay(t, 0.35);

    const fadeIn = Math.min(1, t / 0.4);
    const fadeOut = t > 2.4 ? 1 - (t - 2.4) / 0.6 : 1;
    const intensity = easeInOut(fadeIn) * Math.max(0, fadeOut);

    // 右手抬到下巴
    if (this.#bones.rightUpperArm) {
      this.#bones.rightUpperArm.rotation.z += -50 * DEG * intensity;
      this.#bones.rightUpperArm.rotation.x += 34 * DEG * intensity;
      this.#bones.rightUpperArm.rotation.y += -8 * DEG * intensity;
    }
    if (this.#bones.rightLowerArm) {
      this.#bones.rightLowerArm.rotation.y += 82 * DEG * intensity;
    }
    if (this.#bones.spine) {
      this.#bones.spine.rotation.x += 4 * DEG * intensity;
    }
  }

  // ── Happy：開心跳躍 ────────────────────

  #doHappy() {
    const t = this.#elapsed;
    const totalDuration = 2.0;

    if (t >= totalDuration) {
      this.#finishTimedAction();
      return;
    }

    this.#applyNaturalPose(t);

    // 雙手舉高
    const riseEnd = 0.3;
    const holdEnd = 1.5;
    let armIntensity;
    if (t < riseEnd) {
      armIntensity = easeInOut(t / riseEnd);
    } else if (t < holdEnd) {
      armIntensity = 1;
    } else {
      armIntensity = 1 - easeInOut((t - holdEnd) / (totalDuration - holdEnd));
    }

    if (this.#bones.leftUpperArm) {
      this.#bones.leftUpperArm.rotation.z += 60 * DEG * armIntensity;
      this.#bones.leftUpperArm.rotation.x += 10 * DEG * armIntensity;
    }
    if (this.#bones.rightUpperArm) {
      this.#bones.rightUpperArm.rotation.z += -60 * DEG * armIntensity;
      this.#bones.rightUpperArm.rotation.x += 10 * DEG * armIntensity;
    }

    // 小跳躍
    if (this.#bones.hips && t < holdEnd) {
      const jumpPhase = Math.sin((t - riseEnd) * 6);
      this.#bones.hips.position.y += Math.max(0, jumpPhase) * 0.03 * armIntensity;
    }

    // 身體微微後仰
    if (this.#bones.spine) {
      this.#bones.spine.rotation.x += -5 * DEG * armIntensity;
    }
  }

  // ── Presenting：看向面板並伸手介紹 ───────

  #doPresenting() {
    const t = this.#elapsed;
    const totalDuration = 3.2;

    if (t >= totalDuration) {
      this.#finishTimedAction();
      return;
    }

    this.#applyNaturalPose(t);
    this.#applyBreathingOverlay(t, 0.45);

    const fadeIn = Math.min(1, t / 0.35);
    const fadeOut = t > 2.6 ? 1 - (t - 2.6) / 0.6 : 1;
    const intensity = easeInOut(fadeIn) * Math.max(0, fadeOut);
    const accent = Math.sin(t * 4.5) * 2 * DEG * intensity;

    if (this.#bones.spine) {
      this.#bones.spine.rotation.z += 3 * DEG * intensity;
      this.#bones.spine.rotation.x += -2 * DEG * intensity;
    }
    if (this.#bones.chest) {
      this.#bones.chest.rotation.y += -10 * DEG * intensity;
    }
    if (this.#bones.rightUpperArm) {
      this.#bones.rightUpperArm.rotation.z += 18 * DEG * intensity + accent;
      this.#bones.rightUpperArm.rotation.x += -4 * DEG * intensity;
      this.#bones.rightUpperArm.rotation.y += -16 * DEG * intensity;
    }
    if (this.#bones.rightLowerArm) {
      this.#bones.rightLowerArm.rotation.y += 28 * DEG * intensity;
    }
  }

  // ── Warning：短促警示姿勢 ───────────────

  #doWarning() {
    const t = this.#elapsed;
    const totalDuration = 2.4;

    if (t >= totalDuration) {
      this.#finishTimedAction();
      return;
    }

    this.#applyNaturalPose(t);
    this.#applyBreathingOverlay(t, 0.25);

    const fadeIn = Math.min(1, t / 0.25);
    const fadeOut = t > 1.8 ? 1 - (t - 1.8) / 0.6 : 1;
    const intensity = easeInOut(fadeIn) * Math.max(0, fadeOut);
    const pulse = (Math.sin(t * 16) * 1.5 * DEG) * intensity;

    if (this.#bones.spine) {
      this.#bones.spine.rotation.x += 5 * DEG * intensity;
      this.#bones.spine.rotation.z += pulse;
    }
    if (this.#bones.chest) {
      this.#bones.chest.rotation.x += 3 * DEG * intensity;
    }
    if (this.#bones.leftUpperArm) {
      this.#bones.leftUpperArm.rotation.z += 24 * DEG * intensity;
      this.#bones.leftUpperArm.rotation.x += 16 * DEG * intensity;
    }
    if (this.#bones.rightUpperArm) {
      this.#bones.rightUpperArm.rotation.z += -24 * DEG * intensity;
      this.#bones.rightUpperArm.rotation.x += 16 * DEG * intensity;
    }
    if (this.#bones.leftLowerArm) {
      this.#bones.leftLowerArm.rotation.y += -45 * DEG * intensity;
    }
    if (this.#bones.rightLowerArm) {
      this.#bones.rightLowerArm.rotation.y += 45 * DEG * intensity;
    }
  }

  // ── Utilities ──────────────────────────

  #clearMotionOverlay() {
    this.#customAnimData = null;
    this.#customOptions = {};
  }

  #finishTimedAction() {
    this.#activeClip = null;
    this.#currentAction = 'idle';
    this.#elapsed = 0;
    this.resetToNaturalPose(0);
  }

  #updateClip(clip) {
    const durationSec = Math.max(0.001, clip.duration / 1000);

    if (this.#elapsed >= durationSec) {
      this.#finishTimedAction();
      return;
    }

    this.#applyNaturalPose(this.#elapsed);
    this.#applyClipOverlay(clip, this.#elapsed / durationSec);
  }

  #applyClipOverlay(clip, progress) {
    const ctx = {
      rotate: (boneName, axes = {}) => {
        const bone = this.#bones[boneName];
        if (!bone) return;
        for (const axis of AXES) {
          const value = axes[axis];
          if (Number.isFinite(value)) {
            bone.rotation[axis] += value;
          }
        }
      },
      move: (boneName, axes = {}) => {
        const bone = this.#bones[boneName];
        if (!bone) return;
        for (const axis of AXES) {
          const value = axes[axis];
          if (Number.isFinite(value)) {
            bone.position[axis] += value;
          }
        }
      },
    };

    clip.apply(ctx, Math.max(0, Math.min(1, progress)));
  }

  #applyNaturalPose(_t = 0) {
    const basePose = this.#posePreset.basePose || {};
    const positions = basePose.position || {};
    const rotations = basePose.rotation || {};

    for (const [key, pose] of Object.entries(positions)) {
      const bone = this.#bones[key];
      if (!bone) continue;
      bone.position.x = pose.x || 0;
      bone.position.y = this.#hipsBaseY + (pose.y || 0);
      bone.position.z = pose.z || 0;
    }

    for (const [key, pose] of Object.entries(rotations)) {
      const bone = this.#bones[key];
      if (!bone) continue;
      bone.rotation.set(
        (pose.x || 0) * DEG,
        (pose.y || 0) * DEG,
        (pose.z || 0) * DEG
      );
    }
  }

  /** 低強度呼吸（供其他動作疊加） */
  #applyBreathingOverlay(t, scale = 1) {
    if (this.#bones.spine) {
      this.#bones.spine.rotation.x += Math.sin(t * 1.4) * 0.008 * scale;
      this.#bones.spine.rotation.z += Math.sin(t * 0.7) * 0.003 * scale;
    }
    if (this.#bones.chest) {
      this.#bones.chest.rotation.x += Math.sin(t * 1.2 + 0.4) * 0.003 * scale;
    }
    if (this.#bones.hips) {
      this.#bones.hips.position.x += Math.sin(t * 0.65) * 0.001 * scale;
      this.#bones.hips.position.y += Math.sin(t * 1.4) * 0.002 * scale;
    }
  }

  /** 待機微動：只給 idle 使用，避免污染語意動作。 */
  #applyIdleMicroMotion(t) {
    const breathSpine = Math.sin(t * 1.18);
    const breathChest = Math.sin(t * 1.42 + 0.35);
    const weight = Math.sin(t * 0.55 + 0.2);
    const slow = Math.sin(t * 0.33 + 0.6);

    if (this.#bones.spine) {
      this.#bones.spine.rotation.x += breathSpine * 0.006 + slow * 0.002;
      this.#bones.spine.rotation.z += weight * 0.004;
    }
    if (this.#bones.chest) {
      this.#bones.chest.rotation.x += breathChest * 0.005;
      this.#bones.chest.rotation.y += Math.sin(t * 0.41 + 1.1) * 0.003;
    }
    if (this.#bones.hips) {
      this.#bones.hips.position.x += weight * 0.0026;
      this.#bones.hips.position.y += breathChest * 0.0024;
      this.#bones.hips.position.z += Math.sin(t * 0.37 + 0.8) * 0.001;
    }

    if (this.#bones.leftShoulder) {
      this.#bones.leftShoulder.rotation.z += Math.sin(t * 0.62 + 0.4) * 0.01;
      this.#bones.leftShoulder.rotation.x += Math.sin(t * 0.48 + 1.5) * 0.004;
    }
    if (this.#bones.rightShoulder) {
      this.#bones.rightShoulder.rotation.z += Math.sin(t * 0.58 + 2.0) * 0.01;
      this.#bones.rightShoulder.rotation.x += Math.sin(t * 0.45 + 2.4) * 0.004;
    }

    if (this.#bones.leftUpperArm) {
      this.#bones.leftUpperArm.rotation.z += Math.sin(t * 0.9) * 0.006;
      this.#bones.leftUpperArm.rotation.x += Math.sin(t * 0.52 + 0.2) * 0.003;
    }
    if (this.#bones.rightUpperArm) {
      this.#bones.rightUpperArm.rotation.z += Math.sin(t * 0.9 + 0.5) * 0.006;
      this.#bones.rightUpperArm.rotation.x += Math.sin(t * 0.5 + 1.1) * 0.003;
    }

    if (this.#bones.leftLowerArm) {
      this.#bones.leftLowerArm.rotation.y += Math.sin(t * 0.72 + 1.1) * 0.008;
      this.#bones.leftLowerArm.rotation.z += Math.sin(t * 0.43 + 0.7) * 0.004;
    }
    if (this.#bones.rightLowerArm) {
      this.#bones.rightLowerArm.rotation.y += Math.sin(t * 0.7 + 2.4) * 0.008;
      this.#bones.rightLowerArm.rotation.z += Math.sin(t * 0.44 + 2.2) * 0.004;
    }

    if (this.#bones.leftHand) {
      this.#bones.leftHand.rotation.z += Math.sin(t * 0.8 + 1.8) * 0.007;
      this.#bones.leftHand.rotation.x += Math.sin(t * 0.54 + 0.3) * 0.004;
    }
    if (this.#bones.rightHand) {
      this.#bones.rightHand.rotation.z += Math.sin(t * 0.78 + 2.7) * 0.007;
      this.#bones.rightHand.rotation.x += Math.sin(t * 0.55 + 1.3) * 0.004;
    }
  }

  #lazyInitTempQ() {
    if (!this.#tempQ1 && typeof THREE !== 'undefined') {
      this.#tempQ1 = new THREE.Quaternion();
      this.#tempQ2 = new THREE.Quaternion();
    }
  }

  /** 播放自訂 JSON 動作軌跡（插值邏輯） */
  #doCustom() {
    if (!this.#customAnimData) return;
    this.#applyNaturalPose(this.#elapsed);
    const durationMs = this.#customAnimData.duration_ms || 1000;
    const loop = this.#customOptions.loop ?? false;
    let timeMs = this.#elapsed * 1000;

    if (timeMs >= durationMs) {
      if (loop) {
        timeMs = timeMs % durationMs;
      } else {
        // 結束動作
        this.#finishTimedAction();
        const cb = this.#customOptions.onComplete;
        this.#customAnimData = null;
        this.#customOptions = {};
        cb?.();
        return;
      }
    }

    this.#lazyInitTempQ();

    // 1. 骨骼旋轉插值 (Slerp)
    const bonesData = this.#customAnimData.bones || {};
    for (const [boneName, keys] of Object.entries(bonesData)) {
      const boneNode = this.#bones[boneName];
      if (!boneNode || !keys || keys.length === 0) continue;

      let kA = keys[0];
      let kB = keys[0];

      if (timeMs <= keys[0].time_ms) {
        kA = keys[0];
        kB = keys[0];
      } else if (timeMs >= keys[keys.length - 1].time_ms) {
        kA = keys[keys.length - 1];
        kB = keys[keys.length - 1];
      } else {
        // 線性搜尋
        for (let i = 0; i < keys.length - 1; i++) {
          if (timeMs >= keys[i].time_ms && timeMs <= keys[i + 1].time_ms) {
            kA = keys[i];
            kB = keys[i + 1];
            break;
          }
        }
      }

      const denom = kB.time_ms - kA.time_ms;
      const alpha = denom > 0 ? (timeMs - kA.time_ms) / denom : 0;

      if (this.#tempQ1 && this.#tempQ2) {
        this.#tempQ1.set(kA.rot[0], kA.rot[1], kA.rot[2], kA.rot[3]);
        this.#tempQ2.set(kB.rot[0], kB.rot[1], kB.rot[2], kB.rot[3]);
        boneNode.quaternion.slerpQuaternions(this.#tempQ1, this.#tempQ2, alpha);
      }
    }

    // 2. Hips 平移插值 (Lerp)
    const hipsPosData = this.#customAnimData.hips_position || [];
    if (this.#bones.hips && hipsPosData.length > 0) {
      let kA = hipsPosData[0];
      let kB = hipsPosData[0];

      if (timeMs <= hipsPosData[0].time_ms) {
        kA = hipsPosData[0];
        kB = hipsPosData[0];
      } else if (timeMs >= hipsPosData[hipsPosData.length - 1].time_ms) {
        kA = hipsPosData[hipsPosData.length - 1];
        kB = hipsPosData[hipsPosData.length - 1];
      } else {
        for (let i = 0; i < hipsPosData.length - 1; i++) {
          if (timeMs >= hipsPosData[i].time_ms && timeMs <= hipsPosData[i + 1].time_ms) {
            kA = hipsPosData[i];
            kB = hipsPosData[i + 1];
            break;
          }
        }
      }

      const denom = kB.time_ms - kA.time_ms;
      const alpha = denom > 0 ? (timeMs - kA.time_ms) / denom : 0;

      const px = lerp(kA.pos[0], kB.pos[0], alpha);
      const py = lerp(kA.pos[1], kB.pos[1], alpha);
      const pz = lerp(kA.pos[2], kB.pos[2], alpha);

      this.#bones.hips.position.x = px;
      this.#bones.hips.position.y = this.#hipsBaseY + py;
      this.#bones.hips.position.z = pz;
    }
  }

  /** 清理 */
  dispose() {
    this.#vrm = null;
    this.#bones = {};
    this.#customAnimData = null;
    this.#customOptions = {};
    this.#activeClip = null;
  }
}
