import {
  CYCLE_PHASES,
  createEmptyCycleMarkers,
  isValidCyclePhase
} from './MotionCaptureTypes.js';

function nearestFrame(frames, timeMs) {
  return frames.reduce((best, frame) => {
    return Math.abs(frame.timeMs - timeMs) < Math.abs(best.timeMs - timeMs) ? frame : best;
  }, frames[0]);
}

function hasFrames(sequence) {
  return Array.isArray(sequence?.frames) && sequence.frames.length > 0;
}

function isUsableFrame(frame) {
  return Boolean(
    frame &&
      typeof frame === 'object' &&
      !Array.isArray(frame) &&
      Number.isFinite(frame.timeMs) &&
      (frame.frameIndex === undefined || Number.isFinite(frame.frameIndex))
  );
}

function usableFrames(sequence) {
  return sequence.frames.filter(isUsableFrame);
}

function copyMarker(marker) {
  return marker ? { ...marker } : null;
}

export class MotionCycleDetector {
  constructor() {
    this.loop = { startMs: 0, endMs: 0, durationMs: 0 };
    this.phaseMarkers = createEmptyCycleMarkers();
  }

  setLoopRange(startMs, endMs) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return { ok: false, reason: 'invalid_loop_range' };
    }

    this.loop = {
      startMs,
      endMs,
      durationMs: endMs - startMs
    };
    return { ok: true, loop: this.getLoop() };
  }

  getLoop() {
    return { ...this.loop };
  }

  getPhaseMarkers() {
    return Object.fromEntries(
      Object.entries(this.phaseMarkers).map(([phase, marker]) => [phase, copyMarker(marker)])
    );
  }

  setPhaseMarker(phase, timeMs, sequence) {
    if (!isValidCyclePhase(phase)) {
      return { ok: false, reason: 'unknown_phase', phase };
    }
    if (!Number.isFinite(timeMs)) {
      return { ok: false, reason: 'invalid_marker_time', phase };
    }
    if (!hasFrames(sequence)) {
      return { ok: false, reason: 'empty_frames' };
    }

    const frames = usableFrames(sequence);
    if (frames.length === 0) {
      return { ok: false, reason: 'invalid_frames' };
    }

    const frame = nearestFrame(frames, timeMs);
    const marker = {
      timeMs: frame.timeMs,
      frameIndex: frame.frameIndex
    };
    this.phaseMarkers[phase] = marker;
    return { ok: true, phase, marker: copyMarker(marker) };
  }

  seedEvenWalkPhases(sequence) {
    if (!hasFrames(sequence)) {
      return { ok: false, reason: 'empty_frames' };
    }

    const frames = usableFrames(sequence);
    if (frames.length === 0) {
      return { ok: false, reason: 'invalid_frames' };
    }

    if (this.loop.durationMs <= 0) {
      const firstFrame = frames[0];
      const lastFrame = frames[frames.length - 1];
      const loopRange = this.setLoopRange(firstFrame.timeMs, lastFrame.timeMs);
      if (!loopRange.ok) {
        return loopRange;
      }
    }

    const stepMs = this.loop.durationMs / CYCLE_PHASES.length;
    for (const [index, phase] of CYCLE_PHASES.entries()) {
      this.setPhaseMarker(phase, this.loop.startMs + stepMs * index, { frames });
    }

    return { ok: true, phaseMarkers: this.getPhaseMarkers() };
  }

  extractCycleFrames(sequence) {
    if (!hasFrames(sequence)) {
      return [];
    }

    return usableFrames(sequence).filter((frame) => (
      frame.timeMs >= this.loop.startMs && frame.timeMs <= this.loop.endMs
    ));
  }
}
