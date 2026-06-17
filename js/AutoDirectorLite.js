export class AutoDirectorLite {
  #touchFaceIntervalSec = 90;
  #stretchIntervalSec = 180;
  #gestureCooldownSec = 8;

  #enabled = false;
  #level = 2;

  #nextTouchFaceSec = 90;
  #nextStretchSec = 180;
  #cooldownRemainingSec = 0;
  #lastAction = "none";
  #isEligible = false;

  constructor(options = {}) {
    if (options.touchFaceIntervalSec !== undefined) this.#touchFaceIntervalSec = Number(options.touchFaceIntervalSec);
    if (options.stretchIntervalSec !== undefined) this.#stretchIntervalSec = Number(options.stretchIntervalSec);
    if (options.gestureCooldownSec !== undefined) this.#gestureCooldownSec = Number(options.gestureCooldownSec);

    this.reset();
  }

  get touchFaceIntervalSec() { return this.#touchFaceIntervalSec; }
  get stretchIntervalSec() { return this.#stretchIntervalSec; }
  get gestureCooldownSec() { return this.#gestureCooldownSec; }

  configure({ enabled, level }) {
    if (enabled !== undefined) this.#enabled = !!enabled;
    if (level !== undefined) this.#level = Number(level);
  }

  reset() {
    this.#nextTouchFaceSec = this.#touchFaceIntervalSec;
    this.#nextStretchSec = this.#stretchIntervalSec;
    this.#cooldownRemainingSec = 0;
    this.#lastAction = "none";
    this.#isEligible = false;
  }

  notifyManualGesture(name) {
    this.#cooldownRemainingSec = this.#gestureCooldownSec;
    this.#lastAction = name;
    if (name === 'touch_face') {
      this.#nextTouchFaceSec = this.#touchFaceIntervalSec;
    } else if (name === 'stretch') {
      this.#nextStretchSec = this.#stretchIntervalSec;
    }
  }

  update(dt, state = {}) {
    const {
      playgroundActive = false,
      currentAction = "idle",
      isVrmaActive = false,
      activeGesture = null,
      onGesture = null
    } = state;

    let timeEligible = 0;

    if (this.#cooldownRemainingSec > 0) {
      const spentInCooldown = Math.min(dt, this.#cooldownRemainingSec);
      this.#cooldownRemainingSec -= spentInCooldown;
      timeEligible = dt - spentInCooldown;
    } else {
      timeEligible = dt;
    }

    // Eligibility check
    this.#isEligible = playgroundActive &&
                      this.#enabled &&
                      currentAction === "idle" &&
                      !isVrmaActive &&
                      !activeGesture &&
                      this.#cooldownRemainingSec <= 0;

    if (!this.#isEligible || timeEligible <= 0) {
      return;
    }

    // Update timers based on level eligibility
    let touchFaceDue = false;
    let stretchDue = false;

    if (this.#level >= 3) {
      this.#nextTouchFaceSec = Math.max(0, this.#nextTouchFaceSec - timeEligible);
      if (this.#nextTouchFaceSec <= 0) {
        touchFaceDue = true;
      }
    }

    if (this.#level >= 4) {
      this.#nextStretchSec = Math.max(0, this.#nextStretchSec - timeEligible);
      if (this.#nextStretchSec <= 0) {
        stretchDue = true;
      }
    }

    // Trigger gestures
    if (stretchDue && touchFaceDue) {
      // Tie breaker: stretch wins, touch face timer resets
      this.#nextStretchSec = this.#stretchIntervalSec;
      this.#nextTouchFaceSec = this.#touchFaceIntervalSec;
      this.#cooldownRemainingSec = this.#gestureCooldownSec;
      this.#lastAction = "stretch";
      if (onGesture) {
        onGesture("stretch");
      }
    } else if (stretchDue) {
      this.#nextStretchSec = this.#stretchIntervalSec;
      this.#cooldownRemainingSec = this.#gestureCooldownSec;
      this.#lastAction = "stretch";
      if (onGesture) {
        onGesture("stretch");
      }
    } else if (touchFaceDue) {
      this.#nextTouchFaceSec = this.#touchFaceIntervalSec;
      this.#cooldownRemainingSec = this.#gestureCooldownSec;
      this.#lastAction = "touch_face";
      if (onGesture) {
        onGesture("touch_face");
      }
    }
  }

  get debugState() {
    return {
      enabled: this.#enabled,
      level: this.#level,
      nextTouchFaceSec: this.#nextTouchFaceSec,
      nextStretchSec: this.#nextStretchSec,
      lastAction: this.#lastAction,
      cooldownRemainingSec: this.#cooldownRemainingSec,
      eligible: this.#isEligible
    };
  }
}
