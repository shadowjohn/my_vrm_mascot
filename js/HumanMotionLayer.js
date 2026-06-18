function getBoneNames() {
  if (typeof THREE !== 'undefined' && THREE.VRMHumanoidBoneName) {
    return THREE.VRMHumanoidBoneName;
  }
  return {
    Spine: 'spine', Chest: 'chest', Hips: 'hips',
    Neck: 'neck', Head: 'head',
    LeftUpperArm: 'leftUpperArm', LeftLowerArm: 'leftLowerArm',
    RightUpperArm: 'rightUpperArm', RightLowerArm: 'rightLowerArm',
    LeftHand: 'leftHand', RightHand: 'rightHand',
    LeftUpperLeg: 'leftUpperLeg', LeftLowerLeg: 'leftLowerLeg',
    LeftFoot: 'leftFoot',
    RightUpperLeg: 'rightUpperLeg', RightLowerLeg: 'rightLowerLeg',
    RightFoot: 'rightFoot',
    LeftShoulder: 'leftShoulder', RightShoulder: 'rightShoulder',
  };
}

const DEFAULT_QUALITY = {
  motionIntensity: 1,
  breathingAmplitude: 1,
  weightShiftAmplitude: 1,
  shoulderRelax: 1,
  headDrift: 1,
  gestureEase: 1,
  gestureDuration: 1,
  idleAsymmetry: 1,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberOrDefault(value, fallback, min = 0, max = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, min, max);
}

function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function ease01(t, easeAmount = 1) {
  const eased = smoothstep(t);
  const power = 1 / numberOrDefault(easeAmount, 1, 0.5, 2);
  return Math.pow(eased, power);
}

function gestureEnvelope(progressRatio, easeAmount) {
  if (progressRatio < 0.22) {
    return {
      phase: 'anticipation',
      weight: -0.22 * ease01(progressRatio / 0.22, easeAmount),
    };
  }
  if (progressRatio < 0.72) {
    return {
      phase: 'action',
      weight: ease01((progressRatio - 0.22) / 0.5, easeAmount),
    };
  }
  return {
    phase: 'recovery',
    weight: 1 - ease01((progressRatio - 0.72) / 0.28, easeAmount),
  };
}

export class HumanMotionLayer {
  #enabled = false;
  #profile = "alicia";
  #level = 2;
  #vrm = null;
  #bones = {};
  #time = 0;
  #quality = { ...DEFAULT_QUALITY };

  // Gesture tracking
  #activeGesture = null; // null | "touch_face" | "stretch"
  #gestureProgress = 0;
  #gestureDuration = 0;
  #gesturePhase = null;

  constructor() {}

  setVrm(vrm) {
    this.#vrm = vrm;
    this.#bones = {};
    this.#activeGesture = null;
    this.#gestureProgress = 0;
    if (!vrm) return;

    const h = vrm.humanoid;
    if (!h) return;

    const bn = getBoneNames();
    this.#bones = {
      spine:          h.getBoneNode(bn.Spine),
      chest:          h.getBoneNode(bn.Chest),
      hips:           h.getBoneNode(bn.Hips),
      neck:           h.getBoneNode(bn.Neck || 'neck'),
      head:           h.getBoneNode(bn.Head || 'head'),
      leftUpperArm:   h.getBoneNode(bn.LeftUpperArm),
      leftLowerArm:   h.getBoneNode(bn.LeftLowerArm),
      rightUpperArm:  h.getBoneNode(bn.RightUpperArm),
      rightLowerArm:  h.getBoneNode(bn.RightLowerArm),
      leftHand:       h.getBoneNode(bn.LeftHand || 'leftHand'),
      rightHand:      h.getBoneNode(bn.RightHand || 'rightHand'),
      leftUpperLeg:   h.getBoneNode(bn.LeftUpperLeg),
      leftLowerLeg:   h.getBoneNode(bn.LeftLowerLeg || 'leftLowerLeg'),
      leftFoot:       h.getBoneNode(bn.LeftFoot || 'leftFoot'),
      rightUpperLeg:  h.getBoneNode(bn.RightUpperLeg),
      rightLowerLeg:  h.getBoneNode(bn.RightLowerLeg || 'rightLowerLeg'),
      rightFoot:      h.getBoneNode(bn.RightFoot || 'rightFoot'),
      leftShoulder:   h.getBoneNode(bn.LeftShoulder),
      rightShoulder:  h.getBoneNode(bn.RightShoulder),
    };
  }

  configure({
    profile,
    level,
    motionIntensity,
    breathingAmplitude,
    weightShiftAmplitude,
    shoulderRelax,
    headDrift,
    gestureEase,
    gestureDuration,
    idleAsymmetry,
  }) {
    if (profile !== undefined) this.#profile = profile;
    if (level !== undefined) this.#level = Number(level);
    this.#quality = {
      motionIntensity: numberOrDefault(motionIntensity, this.#quality.motionIntensity, 0.5, 2),
      breathingAmplitude: numberOrDefault(breathingAmplitude, this.#quality.breathingAmplitude, 0, 2),
      weightShiftAmplitude: numberOrDefault(weightShiftAmplitude, this.#quality.weightShiftAmplitude, 0, 2),
      shoulderRelax: numberOrDefault(shoulderRelax, this.#quality.shoulderRelax, 0, 2),
      headDrift: numberOrDefault(headDrift, this.#quality.headDrift, 0, 2),
      gestureEase: numberOrDefault(gestureEase, this.#quality.gestureEase, 0.5, 2),
      gestureDuration: numberOrDefault(gestureDuration, this.#quality.gestureDuration, 0.5, 2),
      idleAsymmetry: numberOrDefault(idleAsymmetry, this.#quality.idleAsymmetry, 0, 2),
    };
  }

  setEnabled(flag) {
    this.#enabled = !!flag;
    if (!this.#enabled) {
      this.#activeGesture = null;
      this.#gestureProgress = 0;
      this.#gesturePhase = null;
    }
  }

  triggerGesture(name) {
    if (!this.#enabled) return;
    if (name === 'touch_face' && this.#level >= 3) {
      this.#activeGesture = 'touch_face';
      this.#gestureProgress = 0;
      this.#gestureDuration = 3.0 * this.#quality.gestureDuration;
      this.#gesturePhase = 'anticipation';
    } else if (name === 'stretch' && this.#level >= 4) {
      this.#activeGesture = 'stretch';
      this.#gestureProgress = 0;
      this.#gestureDuration = 4.0 * this.#quality.gestureDuration;
      this.#gesturePhase = 'anticipation';
    }
  }

  update(dt, { currentAction, isVrmaActive } = {}) {
    if (!this.#enabled || !this.#vrm) return;

    const isIdle = currentAction === 'idle';
    if (!isIdle || isVrmaActive) {
      this.#activeGesture = null;
      this.#gestureProgress = 0;
      this.#gesturePhase = null;
      return;
    }

    this.#time += dt;
    const intensity = this.#quality.motionIntensity;
    const breathingAmp = intensity * this.#quality.breathingAmplitude;
    const weightShiftAmp = intensity * this.#quality.weightShiftAmplitude;
    const shoulderAmp = intensity * this.#quality.shoulderRelax;
    const headAmp = intensity * this.#quality.headDrift;
    const asymmetryAmp = intensity * this.#quality.idleAsymmetry;

    // 1. Level 1: Breathing (spine, chest, hips overlay)
    if (this.#level >= 1) {
      const breathTime = this.#time * 1.5;
      const breathSin = Math.sin(breathTime);
      const breathCos = Math.cos(breathTime);

      if (this.#bones.spine) {
        this.#bones.spine.rotation.x += breathSin * 0.005 * breathingAmp;
      }
      if (this.#bones.chest) {
        this.#bones.chest.rotation.x += breathSin * 0.0055 * breathingAmp;
      }
      if (this.#bones.hips) {
        this.#bones.hips.position.y += breathCos * 0.0015 * breathingAmp;
      }
      if (this.#bones.leftShoulder) {
        this.#bones.leftShoulder.rotation.z += (-0.006 + breathSin * 0.002) * shoulderAmp;
      }
      if (this.#bones.rightShoulder) {
        this.#bones.rightShoulder.rotation.z += (0.004 - breathSin * 0.0015) * shoulderAmp;
      }
    }

    // 2. Level 2: Weight Shift (Level 1 + hips shift + spine offset)
    if (this.#level >= 2) {
      const shiftTime = this.#time * 0.4;
      const shiftSin = Math.sin(shiftTime);
      const shiftCos = Math.cos(shiftTime);

      if (this.#bones.hips) {
        this.#bones.hips.position.x += shiftSin * 0.004 * weightShiftAmp;
        this.#bones.hips.position.z += shiftCos * 0.002 * weightShiftAmp;
        this.#bones.hips.rotation.y += (0.003 + shiftSin * 0.002) * asymmetryAmp;
      }
      if (this.#bones.spine) {
        this.#bones.spine.rotation.z += shiftSin * 0.006 * weightShiftAmp;
      }
      if (this.#bones.chest) {
        this.#bones.chest.rotation.z += shiftSin * 0.003 * weightShiftAmp;
      }
      if (this.#bones.head) {
        this.#bones.head.rotation.y += (Math.sin(this.#time * 0.33) * 0.014 + 0.004) * headAmp;
        this.#bones.head.rotation.x += Math.cos(this.#time * 0.27) * 0.006 * headAmp;
      }
      if (this.#bones.neck) {
        this.#bones.neck.rotation.y += Math.sin(this.#time * 0.31 + 0.4) * 0.006 * headAmp;
      }
      if (this.#bones.leftHand) {
        this.#bones.leftHand.rotation.z += (0.018 + Math.sin(this.#time * 0.21) * 0.004) * asymmetryAmp;
      }
      if (this.#bones.rightHand) {
        this.#bones.rightHand.rotation.z += (-0.011 + Math.cos(this.#time * 0.19) * 0.003) * asymmetryAmp;
      }
      if (this.#bones.leftShoulder) {
        this.#bones.leftShoulder.rotation.z += 0.005 * asymmetryAmp;
      }
      if (this.#bones.rightShoulder) {
        this.#bones.rightShoulder.rotation.z -= 0.003 * asymmetryAmp;
      }
    }

    // 3. Gestures (Level 3: touch_face, Level 4: stretch)
    if (this.#activeGesture) {
      const gestureName = this.#activeGesture;
      this.#gestureProgress += dt;
      const progressRatio = Math.min(this.#gestureProgress / this.#gestureDuration, 1.0);
      const envelope = gestureEnvelope(progressRatio, this.#quality.gestureEase);
      this.#gesturePhase = envelope.phase;
      const prepWeight = Math.max(0, -envelope.weight) * intensity;
      const actionWeight = Math.max(0, envelope.weight) * intensity;

      if (gestureName === 'touch_face' && this.#level >= 3) {
        // Anticipation pulls slightly away before the hand travels toward the face.
        if (this.#bones.rightUpperArm) {
          this.#bones.rightUpperArm.rotation.z += prepWeight * 0.1 - actionWeight * 0.5;
          this.#bones.rightUpperArm.rotation.x += prepWeight * 0.04 - actionWeight * 0.3;
        }
        if (this.#bones.rightLowerArm) {
          this.#bones.rightLowerArm.rotation.y -= prepWeight * 0.08;
          this.#bones.rightLowerArm.rotation.y += actionWeight * 0.6;
        }
        if (this.#bones.spine) {
          this.#bones.spine.rotation.x += prepWeight * 0.015 + actionWeight * 0.04;
        }
        if (this.#bones.chest) {
          this.#bones.chest.rotation.y -= actionWeight * 0.025;
        }
        if (this.#bones.head) {
          this.#bones.head.rotation.x += actionWeight * 0.018;
          this.#bones.head.rotation.y -= actionWeight * 0.022;
        }
      } else if (gestureName === 'stretch' && this.#level >= 4) {
        // Expand both arms with a small shoulder/chest/head chain.
        if (this.#bones.leftUpperArm) {
          this.#bones.leftUpperArm.rotation.z -= prepWeight * 0.08;
          this.#bones.leftUpperArm.rotation.z += actionWeight * 0.3;
        }
        if (this.#bones.rightUpperArm) {
          this.#bones.rightUpperArm.rotation.z += prepWeight * 0.08;
          this.#bones.rightUpperArm.rotation.z -= actionWeight * 0.3;
        }
        if (this.#bones.leftShoulder) {
          this.#bones.leftShoulder.rotation.z += actionWeight * 0.08;
        }
        if (this.#bones.rightShoulder) {
          this.#bones.rightShoulder.rotation.z -= actionWeight * 0.08;
        }
        if (this.#bones.chest) {
          this.#bones.chest.rotation.x += prepWeight * 0.015;
          this.#bones.chest.rotation.x -= actionWeight * 0.065;
        }
        if (this.#bones.spine) {
          this.#bones.spine.rotation.x -= actionWeight * 0.03;
        }
        if (this.#bones.head) {
          this.#bones.head.rotation.x += actionWeight * 0.025;
          this.#bones.head.rotation.y += Math.sin(this.#time * 0.5) * 0.008 * actionWeight;
        }
      }

      if (progressRatio >= 1.0) {
        this.#activeGesture = null;
        this.#gestureProgress = 0;
        this.#gesturePhase = null;
      }
    }
  }

  get debugState() {
    return {
      enabled: this.#enabled,
      profile: this.#profile,
      level: this.#level,
      activeGesture: this.#activeGesture,
      gestureProgress: this.#gestureProgress,
      gestureDurationSec: this.#gestureDuration,
      gesturePhase: this.#gesturePhase,
      quality: { ...this.#quality },
      blinkActive: true, // Blink always active for level >= 0
      breathingActive: this.#enabled && this.#level >= 1,
      weightShiftActive: this.#enabled && this.#level >= 2,
      touchFaceActive: this.#enabled && this.#level >= 3 && this.#activeGesture === 'touch_face',
      stretchActive: this.#enabled && this.#level >= 4 && this.#activeGesture === 'stretch'
    };
  }
}
