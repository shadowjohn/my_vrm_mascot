import {
  normalizeCaptureFrame,
  validateSkeletonSequence
} from './MotionCaptureTypes.js';

export class SkeletonSequenceAdapter {
  constructor({ sourceId = 'skeleton_json' } = {}) {
    this.sourceId = sourceId;
  }

  loadFromText(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { ok: false, reason: 'invalid_json', error: error.message };
    }
    return this.load(parsed);
  }

  load(rawSequence) {
    if (!rawSequence || typeof rawSequence !== 'object' || Array.isArray(rawSequence)) {
      return { ok: false, reason: 'invalid_sequence' };
    }

    const rawCandidate = {
      id: rawSequence.id || this.sourceId,
      label: rawSequence.label || rawSequence.id || this.sourceId,
      sourceType: rawSequence.sourceType || 'skeleton_json',
      fps: Number(rawSequence.fps) || 30,
      poseMode: rawSequence.poseMode,
      depthSource: rawSequence.depthSource,
      viewpoint: rawSequence.viewpoint,
      frontBackConfidence: rawSequence.frontBackConfidence,
      leadFoot: rawSequence.leadFoot,
      source: rawSequence.source,
      frames: rawSequence.frames
    };

    const rawValidation = validateSkeletonSequence(rawCandidate);
    if (!rawValidation.ok) {
      return rawValidation;
    }

    const frames = rawSequence.frames.map((frame, index) => normalizeCaptureFrame(frame, index));
    const sequence = {
      ...rawCandidate,
      frames
    };
    const validation = validateSkeletonSequence(sequence);
    if (!validation.ok) {
      return validation;
    }
    const first = frames[0];
    const last = frames[frames.length - 1];
    return {
      ok: true,
      sequence,
      frameCount: frames.length,
      durationMs: Math.max(0, last.timeMs - first.timeMs)
    };
  }

  getFrameAtMs(sequence, timeMs) {
    return sequence.frames.reduce((best, frame) => {
      return Math.abs(frame.timeMs - timeMs) < Math.abs(best.timeMs - timeMs) ? frame : best;
    }, sequence.frames[0]);
  }
}
