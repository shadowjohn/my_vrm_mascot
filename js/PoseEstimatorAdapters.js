function unavailableAdapter({ id, label, sourceTypes }) {
  return {
    id,
    label,
    sourceTypes,
    isAvailable: false,
    async estimateFrame() {
      return { ok: false, reason: 'pose_estimator_unavailable', adapterId: id };
    }
  };
}

function currentTimeMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export class PoseEstimatorRegistry {
  constructor() {
    this.adapters = new Map();
  }

  register(id, adapter, { replace = false } = {}) {
    if (this.adapters.has(id) && !replace) {
      return { ok: false, reason: 'duplicate_adapter', adapterId: id };
    }
    this.adapters.set(id, { ...adapter, id });
    return { ok: true, adapterId: id };
  }

  get(id) {
    return this.adapters.get(id) || null;
  }

  list() {
    return [...this.adapters.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
}

export function createMediaPipePoseAdapter({ poseLandmarker = globalThis.PoseLandmarker } = {}) {
  const id = 'mediapipe_pose';
  const label = 'MediaPipe Pose';
  const sourceTypes = ['video', 'webcam'];

  if (typeof poseLandmarker?.detectForVideo !== 'function') {
    return unavailableAdapter({ id, label, sourceTypes });
  }

  return {
    id,
    label,
    sourceTypes,
    isAvailable: true,
    async estimateFrame(videoElement, timestampMs = currentTimeMs()) {
      const result = poseLandmarker.detectForVideo(videoElement, timestampMs);
      return { ok: true, adapterId: id, raw: result, timestampMs };
    }
  };
}

export function createMoveNetPoseAdapter({ detector = null } = {}) {
  const id = 'movenet';
  const label = 'MoveNet';
  const sourceTypes = ['video', 'webcam'];

  if (typeof detector?.estimatePoses !== 'function') {
    return unavailableAdapter({ id, label, sourceTypes });
  }

  return {
    id,
    label,
    sourceTypes,
    isAvailable: true,
    async estimateFrame(input, timestampMs = currentTimeMs()) {
      const result = await detector.estimatePoses(input);
      return { ok: true, adapterId: id, raw: result, timestampMs };
    }
  };
}

export function createYoloPoseAdapter({ detector = null } = {}) {
  const id = 'yolo_pose';
  const label = 'YOLO Pose';
  const sourceTypes = ['video'];

  if (typeof detector?.detect !== 'function') {
    return unavailableAdapter({ id, label, sourceTypes });
  }

  return {
    id,
    label,
    sourceTypes,
    isAvailable: true,
    async estimateFrame(input, timestampMs = currentTimeMs()) {
      const result = await detector.detect(input);
      return { ok: true, adapterId: id, raw: result, timestampMs };
    }
  };
}
