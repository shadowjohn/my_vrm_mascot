import { CYCLE_PHASES } from './MotionCaptureTypes.js';

const WALK_STYLE_SCHEMA_VERSION = 1;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function point(frame, name) {
  return frame?.landmarks?.[name] || null;
}

function distance2d(a, b) {
  if (!a || !b) {
    return 0;
  }
  const dx = finiteNumber(a.x) - finiteNumber(b.x);
  const dz = finiteNumber(a.z) - finiteNumber(b.z);
  return Math.hypot(dx, dz);
}

function range(values) {
  const finite = values.map((value) => Number(value)).filter(Number.isFinite);
  if (finite.length === 0) {
    return 0;
  }
  return Math.max(...finite) - Math.min(...finite);
}

function average(values, fallback = 0) {
  const finite = values.map((value) => Number(value)).filter(Number.isFinite);
  if (finite.length === 0) {
    return fallback;
  }
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function rounded(value, digits = 3) {
  return Number((Number(value) || 0).toFixed(digits));
}

function getLoop(detector, frames) {
  const loop = typeof detector?.getLoop === 'function' ? detector.getLoop() : null;
  if (loop?.durationMs > 0) {
    return { ...loop };
  }
  const first = frames[0];
  const last = frames[frames.length - 1];
  return {
    startMs: first?.timeMs ?? 0,
    endMs: last?.timeMs ?? 0,
    durationMs: Math.max(0, (last?.timeMs ?? 0) - (first?.timeMs ?? 0))
  };
}

function getPhaseMarkers(detector) {
  return typeof detector?.getPhaseMarkers === 'function' ? detector.getPhaseMarkers() : {};
}

function usableFrames(sequence) {
  return Array.isArray(sequence?.frames)
    ? sequence.frames.filter((frame) => (
      frame &&
        typeof frame === 'object' &&
        Number.isFinite(Number(frame.timeMs)) &&
        frame.landmarks &&
        typeof frame.landmarks === 'object' &&
        !Array.isArray(frame.landmarks)
    ))
    : [];
}

function cycleFrames(sequence, detector, loop) {
  if (typeof detector?.extractCycleFrames === 'function') {
    const frames = detector.extractCycleFrames(sequence);
    if (frames.length > 0) {
      return frames;
    }
  }
  return usableFrames(sequence).filter((frame) => (
    frame.timeMs >= loop.startMs && frame.timeMs <= loop.endMs
  ));
}

function cadenceFromMarkers(markers, loop) {
  const contacts = [
    markers.contact_left?.timeMs,
    markers.contact_right?.timeMs
  ].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (contacts.length >= 2) {
    const halfCycleMs = Math.abs(contacts[1] - contacts[0]);
    if (halfCycleMs > 0) {
      return clamp(1000 / halfCycleMs, 0.35, 3.2);
    }
  }
  return loop.durationMs > 0 ? clamp(2000 / loop.durationMs, 0.35, 3.2) : 1;
}

function phaseSnapshot(markers) {
  const phases = {};
  for (const phase of CYCLE_PHASES) {
    if (markers[phase]) {
      phases[phase] = { ...markers[phase] };
    }
  }
  return phases;
}

function estimateParameters(frames, markers, loop) {
  const cadence = cadenceFromMarkers(markers, loop);
  const strideReach = frames.map((frame) => {
    const hips = point(frame, 'hips');
    return Math.max(
      distance2d(hips, point(frame, 'leftAnkle')),
      distance2d(hips, point(frame, 'rightAnkle'))
    );
  });
  const armReach = frames.map((frame) => (
    (distance2d(point(frame, 'leftShoulder'), point(frame, 'leftWrist')) +
      distance2d(point(frame, 'rightShoulder'), point(frame, 'rightWrist'))) / 2
  ));
  const hipsY = frames.map((frame) => point(frame, 'hips')?.y);
  const chestY = frames.map((frame) => point(frame, 'chest')?.y);
  const lean = frames.map((frame) => {
    const hips = point(frame, 'hips');
    const chest = point(frame, 'chest');
    return hips && chest ? finiteNumber(chest.x) - finiteNumber(hips.x) : 0;
  });

  return {
    stride: clamp(average(strideReach) / 0.65, 0, 1),
    cadence,
    armSwing: clamp(range(armReach) / 0.45, 0, 1),
    hipBob: clamp(range(hipsY) / 0.18, 0, 1),
    bounce: clamp(((range(hipsY) + range(chestY)) / 2) / 0.2, 0, 1),
    bodyLean: clamp(average(lean) / 0.35, -1, 1)
  };
}

function landmarkZValues(frames, names) {
  return frames.flatMap((frame) => (
    names.map((name) => Number(point(frame, name)?.z)).filter(Number.isFinite)
  ));
}

function hasDepthSignal(frames) {
  return range(landmarkZValues(frames, ['leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'])) > 0.04;
}

function sideDepth(frames, side) {
  return average(landmarkZValues(frames, [`${side}Knee`, `${side}Ankle`]), 0);
}

function estimateDepthLeadFoot(frames) {
  if (hasDepthSignal(frames)) {
    const leftDepth = sideDepth(frames, 'left');
    const rightDepth = sideDepth(frames, 'right');
    const delta = rightDepth - leftDepth;
    return {
      leadFoot: delta >= 0 ? 'left' : 'right',
      frontBackConfidence: clamp(Math.abs(delta) / 0.6, 0, 1),
      depthConfidence: clamp(Math.abs(delta) / 0.6, 0, 1),
      depthSourceFallback: 'pose_z'
    };
  }

  const reachDelta = average(frames.map((frame) => {
    const hips = point(frame, 'hips');
    const left = point(frame, 'leftAnkle');
    const right = point(frame, 'rightAnkle');
    if (!hips || !left || !right) {
      return 0;
    }
    return Math.abs(finiteNumber(left.x) - finiteNumber(hips.x)) -
      Math.abs(finiteNumber(right.x) - finiteNumber(hips.x));
  }), 0);
  return {
    leadFoot: reachDelta >= 0 ? 'left' : 'right',
    frontBackConfidence: clamp(Math.abs(reachDelta) / 0.28, 0, 0.45),
    depthConfidence: 0,
    depthSourceFallback: '2d_heuristic'
  };
}

function poseMetadata(sequence, frames) {
  const inferred = estimateDepthLeadFoot(frames);
  const poseMode = sequence?.poseMode || '2d_estimated';
  const depthSource = sequence?.depthSource || sequence?.source?.depthSource || inferred.depthSourceFallback;
  const frontBackConfidence = Number.isFinite(Number(sequence?.frontBackConfidence))
    ? clamp(Number(sequence.frontBackConfidence), 0, 1)
    : inferred.frontBackConfidence;
  return {
    poseMode,
    depthSource,
    viewpoint: sequence?.viewpoint || 'front',
    frontBackConfidence: rounded(frontBackConfidence),
    leadFoot: sequence?.leadFoot || inferred.leadFoot,
    motionBert: sequence?.source?.motionBert || null,
    depthConfidence: rounded(Number.isFinite(Number(sequence?.depthConfidence))
      ? clamp(Number(sequence.depthConfidence), 0, 1)
      : Math.max(inferred.depthConfidence, poseMode === '3d_lifted' ? frontBackConfidence : 0))
  };
}

function estimateConfidence(frames, markers, depthConfidence = 0) {
  const phaseCount = Object.values(markers).filter(Boolean).length;
  const frameScore = clamp(frames.length / 16, 0.15, 1);
  const phaseScore = clamp(phaseCount / CYCLE_PHASES.length, 0, 1);
  const visibilities = frames.flatMap((frame) => (
    Object.values(frame.landmarks || {}).map((landmark) => finiteNumber(landmark.visibility, 1))
  ));
  const visibilityScore = clamp(average(visibilities, 1), 0, 1);
  const legs = clamp((frameScore + phaseScore + visibilityScore) / 3, 0, 1);
  const arms = clamp((frameScore + visibilityScore) / 2, 0, 1);
  const trackingConfidence = clamp((frameScore + phaseScore + visibilityScore) / 3, 0, 1);
  return {
    legs: rounded(legs),
    arms: rounded(arms),
    overall: rounded((legs * 0.6) + (arms * 0.4)),
    trackingConfidence: rounded(trackingConfidence),
    depthConfidence: rounded(depthConfidence)
  };
}

function roundedParameters(parameters) {
  return Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => [key, Number(value.toFixed(3))])
  );
}

export function exportWalkStyle({
  id,
  label,
  sequence,
  detector,
  source
}) {
  const frames = usableFrames(sequence);
  const loop = getLoop(detector, frames);
  const markers = getPhaseMarkers(detector);
  const framesInLoop = cycleFrames(sequence, detector, loop);
  const parameters = estimateParameters(framesInLoop, markers, loop);
  const metadata = poseMetadata(sequence, framesInLoop);

  return {
    schemaVersion: WALK_STYLE_SCHEMA_VERSION,
    kind: 'walk_style_v1',
    id,
    label,
    poseMode: metadata.poseMode,
    viewpoint: metadata.viewpoint,
    frontBackConfidence: metadata.frontBackConfidence,
    leadFoot: metadata.leadFoot,
    metadata: {
      poseMode: metadata.poseMode,
      depthSource: metadata.depthSource,
      motionBert: metadata.motionBert
    },
    source,
    loop,
    phases: phaseSnapshot(markers),
    parameters: roundedParameters(parameters),
    confidence: estimateConfidence(framesInLoop, markers, metadata.depthConfidence)
  };
}
