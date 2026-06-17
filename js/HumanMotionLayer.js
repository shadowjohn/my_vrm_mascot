function getBoneNames() {
  if (typeof THREE !== 'undefined' && THREE.VRMHumanoidBoneName) {
    return THREE.VRMHumanoidBoneName;
  }
  return {
    Spine: 'spine', Chest: 'chest', Hips: 'hips',
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

export class HumanMotionLayer {
  #enabled = false;
  #profile = "alicia";
  #level = 2;
  #vrm = null;
  #bones = {};
  #time = 0;

  // Gesture tracking
  #activeGesture = null; // null | "touch_face" | "stretch"
  #gestureProgress = 0;
  #gestureDuration = 0;

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

  configure({ profile, level }) {
    if (profile !== undefined) this.#profile = profile;
    if (level !== undefined) this.#level = Number(level);
  }

  setEnabled(flag) {
    this.#enabled = !!flag;
    if (!this.#enabled) {
      this.#activeGesture = null;
      this.#gestureProgress = 0;
    }
  }

  triggerGesture(name) {
    if (!this.#enabled) return;
    if (name === 'touch_face' && this.#level >= 3) {
      this.#activeGesture = 'touch_face';
      this.#gestureProgress = 0;
      this.#gestureDuration = 3.0;
    } else if (name === 'stretch' && this.#level >= 4) {
      this.#activeGesture = 'stretch';
      this.#gestureProgress = 0;
      this.#gestureDuration = 4.0;
    }
  }

  update(dt, { currentAction, isVrmaActive } = {}) {
    if (!this.#enabled || !this.#vrm) return;

    const isIdle = currentAction === 'idle';
    if (!isIdle || isVrmaActive) {
      this.#activeGesture = null;
      this.#gestureProgress = 0;
      return;
    }

    this.#time += dt;

    // 1. Level 1: Breathing (spine, chest, hips overlay)
    if (this.#level >= 1) {
      const breathTime = this.#time * 1.5;
      const breathSin = Math.sin(breathTime);
      const breathCos = Math.cos(breathTime);

      if (this.#bones.spine) {
        this.#bones.spine.rotation.x += breathSin * 0.005;
      }
      if (this.#bones.chest) {
        this.#bones.chest.rotation.x += breathSin * 0.004;
      }
      if (this.#bones.hips) {
        this.#bones.hips.position.y += breathCos * 0.0015;
      }
    }

    // 2. Level 2: Weight Shift (Level 1 + hips shift + spine offset)
    if (this.#level >= 2) {
      const shiftTime = this.#time * 0.4;
      const shiftSin = Math.sin(shiftTime);
      const shiftCos = Math.cos(shiftTime);

      if (this.#bones.hips) {
        this.#bones.hips.position.x += shiftSin * 0.004;
        this.#bones.hips.position.z += shiftCos * 0.002;
      }
      if (this.#bones.spine) {
        this.#bones.spine.rotation.z += shiftSin * 0.006;
      }
    }

    // 3. Gestures (Level 3: touch_face, Level 4: stretch)
    if (this.#activeGesture) {
      this.#gestureProgress += dt;
      let progressRatio = this.#gestureProgress / this.#gestureDuration;
      if (progressRatio >= 1.0) {
        progressRatio = 1.0;
        this.#activeGesture = null;
      }

      const gestureWeight = Math.sin(progressRatio * Math.PI);

      if (this.#activeGesture === 'touch_face' && this.#level >= 3) {
        // Raise right arm toward chin
        if (this.#bones.rightUpperArm) {
          this.#bones.rightUpperArm.rotation.z -= gestureWeight * 0.5;
          this.#bones.rightUpperArm.rotation.x -= gestureWeight * 0.3;
        }
        if (this.#bones.rightLowerArm) {
          this.#bones.rightLowerArm.rotation.y += gestureWeight * 0.6;
        }
        if (this.#bones.spine) {
          this.#bones.spine.rotation.x += gestureWeight * 0.04;
        }
      } else if (this.#activeGesture === 'stretch' && this.#level >= 4) {
        // Expand both arms and lean chest back
        if (this.#bones.leftUpperArm) {
          this.#bones.leftUpperArm.rotation.z += gestureWeight * 0.3;
        }
        if (this.#bones.rightUpperArm) {
          this.#bones.rightUpperArm.rotation.z -= gestureWeight * 0.3;
        }
        if (this.#bones.chest) {
          this.#bones.chest.rotation.x -= gestureWeight * 0.06;
        }
        if (this.#bones.spine) {
          this.#bones.spine.rotation.x -= gestureWeight * 0.03;
        }
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
      blinkActive: true, // Blink always active for level >= 0
      breathingActive: this.#enabled && this.#level >= 1,
      weightShiftActive: this.#enabled && this.#level >= 2,
      touchFaceActive: this.#enabled && this.#level >= 3 && this.#activeGesture === 'touch_face',
      stretchActive: this.#enabled && this.#level >= 4 && this.#activeGesture === 'stretch'
    };
  }
}
