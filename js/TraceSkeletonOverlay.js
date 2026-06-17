const DEFAULT_GROUND_Y = -0.95;
const DEFAULT_TARGET_HEIGHT = 1.55;
const DEFAULT_DEPTH_SCALE = 0.7;
const NEAR_COLOR = 0xf6cb5e;
const FAR_COLOR = 0x5a98ff;
const MID_COLOR = 0xdce8df;
const HIP_COLOR = 0xf0c86a;

export const DEFAULT_TRACE_BONES = Object.freeze([
  ['head', 'chest'],
  ['leftShoulder', 'chest'],
  ['rightShoulder', 'chest'],
  ['chest', 'hips'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['hips', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['hips', 'rightKnee'],
  ['rightKnee', 'rightAnkle']
]);

const TRACE_JOINTS = Object.freeze([
  'head',
  'chest',
  'hips',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle'
]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexChannel(from, to, ratio) {
  return Math.round(from + (to - from) * clamp(ratio, 0, 1));
}

function mixHex(from, to, ratio) {
  const r = hexChannel((from >> 16) & 255, (to >> 16) & 255, ratio);
  const g = hexChannel((from >> 8) & 255, (to >> 8) & 255, ratio);
  const b = hexChannel(from & 255, to & 255, ratio);
  return (r << 16) | (g << 8) | b;
}

function depthRank(z, zMin, zMax) {
  const span = Math.max(0.0001, zMax - zMin);
  return clamp(1 - ((finiteNumber(z) - zMin) / span), 0, 1);
}

function colorForDepth(rank) {
  return mixHex(FAR_COLOR, NEAR_COLOR, rank);
}

function sourceBounds(landmarks = {}) {
  const points = Object.values(landmarks).filter((point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)));
  const xs = points.map((point) => finiteNumber(point.x));
  const ys = points.map((point) => finiteNumber(point.y));
  const zs = points.map((point) => finiteNumber(point.z));
  const ankles = ['leftAnkle', 'rightAnkle']
    .map((name) => landmarks[name])
    .filter((point) => point && Number.isFinite(Number(point.y)));

  const minX = Math.min(...xs, -0.5);
  const maxX = Math.max(...xs, 0.5);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1.6);
  const minZ = Math.min(...zs, -0.08);
  const maxZ = Math.max(...zs, 0.08);
  const groundSourceY = ankles.length
    ? Math.min(...ankles.map((point) => finiteNumber(point.y)))
    : minY;

  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    groundSourceY,
    height: Math.max(0.1, maxY - groundSourceY)
  };
}

function pointHasPosition(point) {
  return Boolean(
    point &&
      Number.isFinite(Number(point.x)) &&
      Number.isFinite(Number(point.y))
  );
}

function leadFootFromAnkles(leftAnkle, rightAnkle, confidence) {
  if (!leftAnkle || !rightAnkle || confidence < 0.2) {
    return 'unknown';
  }
  const delta = leftAnkle.z - rightAnkle.z;
  if (Math.abs(delta) < 0.025) {
    return 'uncertain';
  }
  return delta > 0 ? 'left' : 'right';
}

export function buildTraceSkeletonFrame(frame, options = {}) {
  const landmarks = frame?.landmarks || {};
  const bounds = sourceBounds(landmarks);
  const hips = pointHasPosition(landmarks.hips)
    ? landmarks.hips
    : { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY, z: 0 };
  const targetHeight = Math.max(0.2, finiteNumber(options.targetHeight, DEFAULT_TARGET_HEIGHT));
  const groundY = finiteNumber(options.groundY, DEFAULT_GROUND_Y);
  const targetCenterX = finiteNumber(options.targetCenterX, 0);
  const targetCenterZ = finiteNumber(options.targetCenterZ, 0);
  const depthScale = finiteNumber(options.depthScale, DEFAULT_DEPTH_SCALE);
  const mirrorX = options.mirrorX !== false;
  const xSign = mirrorX ? -1 : 1;
  const scale = targetHeight / bounds.height;
  const joints = {};

  for (const name of TRACE_JOINTS) {
    const point = landmarks[name];
    if (!pointHasPosition(point)) {
      continue;
    }
    const rank = depthRank(finiteNumber(point.z), bounds.minZ, bounds.maxZ);
    joints[name] = {
      x: targetCenterX + (finiteNumber(point.x) - finiteNumber(hips.x)) * scale * xSign,
      y: groundY + (finiteNumber(point.y) - bounds.groundSourceY) * scale,
      z: targetCenterZ - (finiteNumber(point.z) - finiteNumber(hips.z)) * scale * depthScale,
      rank,
      color: name === 'hips' ? HIP_COLOR : colorForDepth(rank)
    };
  }

  const leftAnkle = joints.leftAnkle;
  const rightAnkle = joints.rightAnkle;
  const depthDelta = leftAnkle && rightAnkle ? Math.abs(leftAnkle.z - rightAnkle.z) : 0;
  const depthConfidence = clamp(depthDelta / 0.16, 0, 1);

  return {
    timeMs: finiteNumber(frame?.timeMs),
    frameIndex: frame?.frameIndex ?? 0,
    previewTimeMs: 0,
    durationMs: 0,
    joints,
    metrics: {
      leadFoot: leadFootFromAnkles(leftAnkle, rightAnkle, depthConfidence),
      depthConfidence,
      leftFootLift: leftAnkle ? Math.max(0, leftAnkle.y - groundY) : 0,
      rightFootLift: rightAnkle ? Math.max(0, rightAnkle.y - groundY) : 0
    }
  };
}

export function prepareTraceSkeletonFrames(frames, options = {}) {
  const sortedFrames = Array.isArray(frames)
    ? frames
      .filter((frame) => frame?.landmarks && Number.isFinite(Number(frame.timeMs)))
      .slice()
      .sort((a, b) => Number(a.timeMs) - Number(b.timeMs))
    : [];
  if (!sortedFrames.length) {
    return [];
  }

  const previewSpeed = clamp(finiteNumber(options.previewSpeed, 1), 0.25, 2.5);
  const loopStartMs = finiteNumber(options.loopStartMs, sortedFrames[0].timeMs);
  const sourceDurationMs = Math.max(
    300,
    finiteNumber(options.loopDurationMs, sortedFrames.at(-1).timeMs - loopStartMs)
  );
  const durationMs = Math.max(300, Math.round(sourceDurationMs / previewSpeed));

  return sortedFrames.map((frame) => ({
    ...buildTraceSkeletonFrame(frame, options),
    previewTimeMs: clamp(Math.round((finiteNumber(frame.timeMs) - loopStartMs) / previewSpeed), 0, durationMs),
    durationMs
  }));
}

export function summarizeTraceAlignment(frames) {
  const prepared = Array.isArray(frames) ? frames.filter((frame) => frame?.joints) : [];
  if (!prepared.length) {
    return {
      sampleCount: 0,
      leadFoot: 'unknown',
      depthConfidence: 0,
      leftFootLift: 0,
      rightFootLift: 0,
      footLiftDelta: 0,
      footDeltaLabel: 'L -- / R --'
    };
  }

  let depthConfidence = 0;
  let leftFootLift = 0;
  let rightFootLift = 0;
  let leadBalance = 0;
  let leadSamples = 0;

  for (const frame of prepared) {
    depthConfidence += finiteNumber(frame.metrics?.depthConfidence);
    leftFootLift += finiteNumber(frame.metrics?.leftFootLift);
    rightFootLift += finiteNumber(frame.metrics?.rightFootLift);
    const left = frame.joints.leftAnkle;
    const right = frame.joints.rightAnkle;
    if (left && right) {
      leadBalance += left.z - right.z;
      leadSamples += 1;
    }
  }

  const count = prepared.length;
  const avgLeft = leftFootLift / count;
  const avgRight = rightFootLift / count;
  const avgDepth = depthConfidence / count;
  const leadDelta = leadSamples ? leadBalance / leadSamples : 0;
  const leadFoot = Math.abs(leadDelta) < 0.025
    ? 'uncertain'
    : (leadDelta > 0 ? 'left' : 'right');

  return {
    sampleCount: count,
    leadFoot,
    depthConfidence: clamp(avgDepth, 0, 1),
    leftFootLift: avgLeft,
    rightFootLift: avgRight,
    footLiftDelta: avgLeft - avgRight,
    footDeltaLabel: `L ${avgLeft.toFixed(2)} / R ${avgRight.toFixed(2)}`
  };
}

function sampleTraceFrame(frames, elapsedMs) {
  if (!frames.length) {
    return null;
  }
  const durationMs = Math.max(300, frames[0].durationMs || frames.at(-1).previewTimeMs || 300);
  const localMs = ((elapsedMs % durationMs) + durationMs) % durationMs;
  let current = frames[0];
  let next = frames[0];

  for (let i = 0; i < frames.length; i += 1) {
    const candidate = frames[i];
    const after = frames[i + 1] || frames[0];
    const candidateTime = candidate.previewTimeMs;
    const afterTime = after === frames[0] ? durationMs : after.previewTimeMs;
    if (localMs >= candidateTime && localMs <= afterTime) {
      current = candidate;
      next = after;
      break;
    }
  }

  const nextTime = next === frames[0] ? durationMs : next.previewTimeMs;
  const span = Math.max(1, nextTime - current.previewTimeMs);
  const ratio = clamp((localMs - current.previewTimeMs) / span, 0, 1);
  return interpolateTraceFrames(current, next, ratio);
}

function interpolateTraceFrames(fromFrame, toFrame, ratio) {
  if (!fromFrame || !toFrame || fromFrame === toFrame) {
    return fromFrame;
  }
  const joints = {};
  const names = new Set([...Object.keys(fromFrame.joints || {}), ...Object.keys(toFrame.joints || {})]);
  for (const name of names) {
    const from = fromFrame.joints[name] || toFrame.joints[name];
    const to = toFrame.joints[name] || fromFrame.joints[name];
    if (!from || !to) {
      continue;
    }
    joints[name] = {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
      z: from.z + (to.z - from.z) * ratio,
      rank: from.rank + (to.rank - from.rank) * ratio,
      color: colorForDepth(from.rank + (to.rank - from.rank) * ratio)
    };
  }
  return {
    ...fromFrame,
    joints
  };
}

function getThree() {
  return globalThis.THREE || null;
}

function disposeObject3d(object3d) {
  object3d?.traverse?.((item) => {
    item.geometry?.dispose?.();
    if (Array.isArray(item.material)) {
      item.material.forEach((material) => material?.dispose?.());
    } else {
      item.material?.dispose?.();
    }
  });
}

export class TraceSkeletonOverlay {
  constructor({ mascot = null, bones = DEFAULT_TRACE_BONES, enabled = true } = {}) {
    this.mascot = mascot;
    this.bones = bones;
    this.enabled = enabled;
    this.group = null;
    this.jointMeshes = new Map();
    this.boneLines = new Map();
    this.footRings = new Map();
    this.frames = [];
    this.summary = summarizeTraceAlignment([]);
    this.startedAtMs = 0;
    this.rafId = 0;
    this.active = false;
    this.options = {};
  }

  setMascot(mascot) {
    if (this.mascot === mascot) {
      return;
    }
    this.dispose();
    this.mascot = mascot;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (this.group) {
      this.group.visible = this.enabled && this.active;
    }
    if (!this.enabled) {
      this.stop();
    }
  }

  isEnabled() {
    return this.enabled;
  }

  play({ frames, loop = {}, previewSpeed = 1, clip = null } = {}) {
    const sceneOptions = this.sceneAlignmentOptions();
    this.options = {
      ...sceneOptions,
      loopStartMs: finiteNumber(loop.startMs, frames?.[0]?.timeMs || 0),
      loopDurationMs: finiteNumber(loop.durationMs, Math.max(300, (frames?.at?.(-1)?.timeMs || 300) - (frames?.[0]?.timeMs || 0))),
      previewSpeed
    };
    this.frames = prepareTraceSkeletonFrames(frames, this.options);
    this.summary = {
      ...summarizeTraceAlignment(this.frames),
      poseMode: clip?.poseMode || clip?.metadata?.poseMode || '2d_estimated',
      depthSource: clip?.metadata?.depthSource || clip?.depthSource || 'heuristic'
    };

    if (!this.enabled || !this.frames.length || !this.ensureGroup()) {
      this.active = false;
      if (this.group) {
        this.group.visible = false;
      }
      return this.summary;
    }

    this.active = true;
    this.startedAtMs = performance.now();
    this.group.visible = true;
    this.update(this.startedAtMs);
    this.startLoop();
    return this.summary;
  }

  stop() {
    this.active = false;
    if (this.group) {
      this.group.visible = false;
    }
    if (this.rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = 0;
  }

  dispose() {
    this.stop();
    if (this.mascot && this.group && typeof this.mascot.removeSceneObject === 'function') {
      this.mascot.removeSceneObject(this.group);
    }
    disposeObject3d(this.group);
    this.group = null;
    this.jointMeshes.clear();
    this.boneLines.clear();
    this.footRings.clear();
  }

  getSummary() {
    return this.summary;
  }

  sceneAlignmentOptions() {
    const THREE = getThree();
    const context = this.mascot?.getSceneContext?.();
    if (!THREE || !context?.vrmRoot) {
      return {
      groundY: DEFAULT_GROUND_Y,
      targetHeight: DEFAULT_TARGET_HEIGHT,
      depthScale: DEFAULT_DEPTH_SCALE,
      mirrorX: true
    };
    }

    const box = new THREE.Box3().setFromObject(context.vrmRoot);
    const height = box.max.y - box.min.y;
    return {
      groundY: Number.isFinite(box.min.y) ? box.min.y : DEFAULT_GROUND_Y,
      targetHeight: Number.isFinite(height) && height > 0.4 ? height * 0.86 : DEFAULT_TARGET_HEIGHT,
      targetCenterX: 0,
      targetCenterZ: 0,
      depthScale: DEFAULT_DEPTH_SCALE,
      mirrorX: true
    };
  }

  ensureGroup() {
    if (this.group) {
      return true;
    }
    const THREE = getThree();
    if (!THREE || !this.mascot || typeof this.mascot.addSceneObject !== 'function') {
      return false;
    }

    const group = new THREE.Group();
    group.name = 'AliciaTraceSkeletonOverlay';
    group.renderOrder = 50;
    group.visible = false;

    const jointGeometry = new THREE.SphereGeometry(0.026, 12, 8);
    for (const name of TRACE_JOINTS) {
      const material = new THREE.MeshBasicMaterial({
        color: name === 'hips' ? HIP_COLOR : MID_COLOR,
        transparent: true,
        opacity: 0.94,
        depthTest: false
      });
      const mesh = new THREE.Mesh(jointGeometry, material);
      mesh.name = `trace_${name}`;
      mesh.renderOrder = 52;
      mesh.visible = false;
      group.add(mesh);
      this.jointMeshes.set(name, mesh);
    }

    for (const [from, to] of this.bones) {
      const material = new THREE.LineBasicMaterial({
        color: MID_COLOR,
        transparent: true,
        opacity: 0.82,
        depthTest: false
      });
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 0)
      ]);
      const line = new THREE.Line(geometry, material);
      line.name = `trace_${from}_${to}`;
      line.renderOrder = 51;
      line.visible = false;
      group.add(line);
      this.boneLines.set(`${from}:${to}`, line);
    }

    const ringGeometry = new THREE.RingGeometry(0.045, 0.07, 32);
    for (const name of ['leftAnkle', 'rightAnkle']) {
      const material = new THREE.MeshBasicMaterial({
        color: name === 'leftAnkle' ? NEAR_COLOR : FAR_COLOR,
        transparent: true,
        opacity: 0.82,
        depthTest: false,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeometry, material);
      ring.name = `trace_${name}_ground`;
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 53;
      ring.visible = false;
      group.add(ring);
      this.footRings.set(name, ring);
    }

    this.group = group;
    return this.mascot.addSceneObject(group);
  }

  startLoop() {
    if (this.rafId || typeof requestAnimationFrame !== 'function') {
      return;
    }
    const tick = (timeMs) => {
      this.rafId = 0;
      if (!this.active || !this.enabled) {
        return;
      }
      this.update(timeMs);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  update(nowMs) {
    if (!this.group || !this.active || !this.frames.length) {
      return;
    }
    const frame = sampleTraceFrame(this.frames, nowMs - this.startedAtMs);
    if (!frame) {
      return;
    }
    this.applyFrame(frame);
  }

  applyFrame(frame) {
    const THREE = getThree();
    if (!THREE) {
      return;
    }
    for (const [name, mesh] of this.jointMeshes.entries()) {
      const joint = frame.joints[name];
      mesh.visible = !!joint;
      if (!joint) {
        continue;
      }
      mesh.position.set(joint.x, joint.y, joint.z);
      const scale = name === 'hips' ? 1.45 : (0.82 + joint.rank * 0.55);
      mesh.scale.setScalar(scale);
      mesh.material.color.setHex(joint.color);
    }

    for (const [from, to] of this.bones) {
      const line = this.boneLines.get(`${from}:${to}`);
      const a = frame.joints[from];
      const b = frame.joints[to];
      if (!line) {
        continue;
      }
      line.visible = !!(a && b);
      if (!a || !b) {
        continue;
      }
      const positions = line.geometry.attributes.position;
      positions.setXYZ(0, a.x, a.y, a.z);
      positions.setXYZ(1, b.x, b.y, b.z);
      positions.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.material.color.setHex(colorForDepth((a.rank + b.rank) / 2));
    }

    for (const [name, ring] of this.footRings.entries()) {
      const joint = frame.joints[name];
      ring.visible = !!joint;
      if (!joint) {
        continue;
      }
      ring.position.set(joint.x, this.options.groundY + 0.004, joint.z);
      ring.material.color.setHex(joint.color);
    }
  }
}
