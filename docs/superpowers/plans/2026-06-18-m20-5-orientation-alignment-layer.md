# M20.5 Orientation Alignment Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the M20.5 Orientation Layer MVP so Alicia Pose Copier can apply body yaw, head gaze, and conservative chest alignment without replacing limb retargeting.

**Architecture:** Add small pure modules for orientation contract normalization, head gaze estimation, and upper-body alignment. Wire their output into `AliciaMotionPreviewAdapter.previewPoseAtTimeMs()` through an `orientationTransform` hook, then expose read-only diagnostics in `motion_capture_lab.html`. Head / neck application stays behind `LookAtController`; limb bones remain owned by `AliciaSkeletonRetargeter` and the existing preview adapter.

**Tech Stack:** Browser JavaScript ES modules, Three.js quaternion-compatible animation payloads, Node scratch tests, existing Motion Capture Lab static tests.

---

## File Structure

- Create `js/AliciaOrientationAlignment.js`: normalize orientation frames, find nearest frame, and apply orientation transforms to animation payloads. This module is the only place that can mutate orientation animation data.
- Create `js/AliciaHeadGazeEstimator.js`: estimate head yaw / pitch from face landmarks or skeleton head / neck / chest vectors.
- Create `js/AliciaUpperBodyAlignment.js`: estimate conservative chest yaw and shoulder roll from shoulders, chest, hips, and hip line.
- Modify `js/AliciaMotionPreviewAdapter.js`: accept `orientationTransform` in `previewPoseAtTimeMs()`, apply it after building the normal limb pose and before `transformAnimation`.
- Modify `js/LookAtController.js`: add a preview gaze API that applies head / neck yaw and pitch without changing MotionController.
- Modify `motion_capture_lab.html`: compute orientation diagnostics for the current frame, pass orientation transform into pose sync, and display Orientation Layer / Body Yaw / Head Gaze / Chest Align summary rows.
- Add tests:
  - `scratch/test_orientation_alignment_contract.mjs`
  - `scratch/test_alicia_head_gaze_estimator.mjs`
  - `scratch/test_alicia_upper_body_alignment.mjs`
  - `scratch/test_alicia_orientation_preview_adapter.mjs`
  - `scratch/test_look_at_preview_gaze.mjs`
- Update `scratch/test_motion_capture_lab.mjs` for static UI/contract coverage.
- Update `history.md` after implementation lands.

### Task 1: Orientation Contract Normalizer

**Files:**
- Create: `js/AliciaOrientationAlignment.js`
- Create: `scratch/test_orientation_alignment_contract.mjs`

- [ ] **Step 1: Write the failing contract test**

Create `scratch/test_orientation_alignment_contract.mjs`:

```js
import assert from 'node:assert/strict';
import {
  findNearestOrientationFrame,
  normalizeOrientationSequence
} from '../js/AliciaOrientationAlignment.js';

const normalized = normalizeOrientationSequence({
  ok: true,
  frames: [{
    t: 1.23,
    bodyYawDegrees: -220,
    headYawDegrees: -80,
    headPitchDegrees: 45,
    chestYawDegrees: -40,
    shoulderRollDegrees: 22,
    confidence: { body: 1.4, head: 0.66, chest: -0.2 },
    source: { body: 'gvhmr', head: 'mediapipe_face', chest: 'skeleton_3d' }
  }]
});

assert.equal(normalized.ok, true);
assert.equal(normalized.frames.length, 1);
assert.equal(normalized.frames[0].bodyYawDegrees, -180);
assert.equal(normalized.frames[0].headYawDegrees, -45);
assert.equal(normalized.frames[0].headPitchDegrees, 30);
assert.equal(normalized.frames[0].chestYawDegrees, -18);
assert.equal(normalized.frames[0].shoulderRollDegrees, 10);
assert.deepEqual(normalized.frames[0].confidence, { body: 1, head: 0.66, chest: 0 });
assert.deepEqual(normalized.frames[0].source, {
  body: 'gvhmr',
  head: 'mediapipe_face',
  chest: 'skeleton_3d'
});

const nearest = findNearestOrientationFrame([
  { t: 0, bodyYawDegrees: 0 },
  { t: 1, bodyYawDegrees: 30 },
  { t: 2, bodyYawDegrees: 60 }
], 1.4);
assert.equal(nearest.bodyYawDegrees, 30);

const bad = normalizeOrientationSequence({ ok: false, reason: 'missing_orientation_frames' });
assert.equal(bad.ok, false);
assert.equal(bad.reason, 'missing_orientation_frames');
assert.deepEqual(bad.frames, []);

console.log('PASS test_orientation_alignment_contract');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node scratch\test_orientation_alignment_contract.mjs
```

Expected: FAIL with `Cannot find module '../js/AliciaOrientationAlignment.js'`.

- [ ] **Step 3: Implement the minimal normalizer**

Create `js/AliciaOrientationAlignment.js` with:

```js
const VALID_SOURCES = new Set(['gvhmr', 'mediapipe_face', 'skeleton_2d', 'skeleton_3d', 'motionbert', 'fixture', 'unknown']);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSource(value) {
  return VALID_SOURCES.has(value) ? value : 'unknown';
}

function normalizeConfidence(confidence = {}) {
  return {
    body: clamp(finiteNumber(confidence.body), 0, 1),
    head: clamp(finiteNumber(confidence.head), 0, 1),
    chest: clamp(finiteNumber(confidence.chest), 0, 1)
  };
}

function normalizeSourceMap(source = {}) {
  return {
    body: normalizeSource(source.body),
    head: normalizeSource(source.head),
    chest: normalizeSource(source.chest)
  };
}

function normalizeOrientationFrame(frame) {
  const t = finiteNumber(frame?.t, NaN);
  if (!Number.isFinite(t)) {
    return null;
  }
  return {
    t,
    bodyYawDegrees: clamp(finiteNumber(frame?.bodyYawDegrees), -180, 180),
    headYawDegrees: clamp(finiteNumber(frame?.headYawDegrees), -45, 45),
    headPitchDegrees: clamp(finiteNumber(frame?.headPitchDegrees), -30, 30),
    chestYawDegrees: clamp(finiteNumber(frame?.chestYawDegrees), -18, 18),
    shoulderRollDegrees: clamp(finiteNumber(frame?.shoulderRollDegrees), -10, 10),
    confidence: normalizeConfidence(frame?.confidence),
    source: normalizeSourceMap(frame?.source)
  };
}

export function normalizeOrientationSequence(payload = {}) {
  if (payload?.ok === false) {
    return {
      ok: false,
      reason: String(payload.reason || 'orientation_failed'),
      frames: [],
      metadata: payload.metadata && typeof payload.metadata === 'object' ? { ...payload.metadata } : {}
    };
  }
  const frames = Array.isArray(payload.frames)
    ? payload.frames.map(normalizeOrientationFrame).filter(Boolean).sort((a, b) => a.t - b.t)
    : [];
  if (!frames.length) {
    return {
      ok: false,
      reason: 'missing_orientation_frames',
      frames: [],
      metadata: payload.metadata && typeof payload.metadata === 'object' ? { ...payload.metadata } : {}
    };
  }
  return {
    ok: true,
    frames,
    metadata: {
      version: 'orientation_alignment_v1',
      ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {})
    }
  };
}

export function findNearestOrientationFrame(frames, timeSeconds) {
  const source = Array.isArray(frames) ? frames : [];
  if (!source.length) {
    return null;
  }
  const target = finiteNumber(timeSeconds, source[0].t);
  return source.reduce((nearest, frame) => (
    Math.abs(frame.t - target) < Math.abs(nearest.t - target) ? frame : nearest
  ), source[0]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node scratch\test_orientation_alignment_contract.mjs
```

Expected: PASS.

### Task 2: Head Gaze Estimator and LookAt Preview API

**Files:**
- Create: `js/AliciaHeadGazeEstimator.js`
- Create: `scratch/test_alicia_head_gaze_estimator.mjs`
- Modify: `js/LookAtController.js`
- Create: `scratch/test_look_at_preview_gaze.mjs`

- [ ] **Step 1: Write failing head estimator tests**

Create `scratch/test_alicia_head_gaze_estimator.mjs`:

```js
import assert from 'node:assert/strict';
import { estimateHeadGaze } from '../js/AliciaHeadGazeEstimator.js';

const lookingLeft = estimateHeadGaze({
  nose: { x: -0.08, y: 1.68, z: -0.08, visibility: 0.95 },
  leftEar: { x: -0.22, y: 1.66, z: 0, visibility: 0.92 },
  rightEar: { x: 0.18, y: 1.66, z: 0, visibility: 0.92 },
  head: { x: 0, y: 1.7, z: 0 },
  neck: { x: 0, y: 1.54, z: 0 },
  chest: { x: 0, y: 1.42, z: 0 }
});
assert.equal(lookingLeft.source, 'mediapipe_face');
assert.ok(lookingLeft.headYawDegrees < -8);
assert.ok(lookingLeft.confidence >= 0.55);

const lookingRight = estimateHeadGaze({
  nose: { x: 0.09, y: 1.68, z: -0.08, visibility: 0.95 },
  leftEar: { x: -0.18, y: 1.66, z: 0, visibility: 0.92 },
  rightEar: { x: 0.22, y: 1.66, z: 0, visibility: 0.92 },
  head: { x: 0, y: 1.7, z: 0 },
  neck: { x: 0, y: 1.54, z: 0 },
  chest: { x: 0, y: 1.42, z: 0 }
});
assert.ok(lookingRight.headYawDegrees > 8);

const skeletonFallback = estimateHeadGaze({
  head: { x: 0.05, y: 1.72, z: -0.11 },
  neck: { x: 0, y: 1.54, z: 0 },
  chest: { x: 0, y: 1.42, z: 0 }
});
assert.equal(skeletonFallback.source, 'skeleton_3d');
assert.ok(skeletonFallback.confidence >= 0.35);

const missing = estimateHeadGaze({ hips: { x: 0, y: 1, z: 0 } });
assert.equal(missing.source, 'unknown');
assert.ok(missing.confidence < 0.2);
assert.equal(missing.headYawDegrees, 0);

console.log('PASS test_alicia_head_gaze_estimator');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node scratch\test_alicia_head_gaze_estimator.mjs
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement `estimateHeadGaze()`**

Create `js/AliciaHeadGazeEstimator.js` with:

```js
function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function point(landmarks, name) {
  const item = landmarks?.[name];
  if (!item) return null;
  return {
    x: finiteNumber(item.x),
    y: finiteNumber(item.y),
    z: finiteNumber(item.z),
    visibility: clamp(finiteNumber(item.visibility, 1), 0, 1)
  };
}

function estimateFromFace(landmarks) {
  const nose = point(landmarks, 'nose');
  const leftEar = point(landmarks, 'leftEar');
  const rightEar = point(landmarks, 'rightEar');
  if (!nose || !leftEar || !rightEar) {
    return null;
  }
  const earSpan = Math.max(0.0001, Math.abs(rightEar.x - leftEar.x));
  const earCenterX = (leftEar.x + rightEar.x) / 2;
  const yaw = clamp(((nose.x - earCenterX) / earSpan) * 70, -45, 45);
  const earCenterY = (leftEar.y + rightEar.y) / 2;
  const pitch = clamp((earCenterY - nose.y) * 140, -30, 30);
  const confidence = clamp((nose.visibility + leftEar.visibility + rightEar.visibility) / 3, 0, 1);
  return { headYawDegrees: yaw, headPitchDegrees: pitch, confidence, source: 'mediapipe_face' };
}

function estimateFromSkeleton(landmarks) {
  const head = point(landmarks, 'head');
  const neck = point(landmarks, 'neck') || point(landmarks, 'chest');
  const chest = point(landmarks, 'chest');
  if (!head || !neck || !chest) {
    return null;
  }
  const dx = head.x - neck.x;
  const dy = head.y - neck.y;
  const dz = head.z - neck.z;
  const yaw = clamp(Math.atan2(dx, Math.max(0.0001, Math.abs(dz))) * 180 / Math.PI, -45, 45);
  const pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz) || 0.0001) * 180 / Math.PI - 45, -30, 30);
  const confidence = Math.max(0.35, Math.min(0.62, Math.hypot(dx, dz) * 3 + 0.35));
  return { headYawDegrees: yaw, headPitchDegrees: pitch, confidence, source: 'skeleton_3d' };
}

export function estimateHeadGaze(landmarks = {}) {
  const estimate = estimateFromFace(landmarks) || estimateFromSkeleton(landmarks);
  if (!estimate) {
    return { headYawDegrees: 0, headPitchDegrees: 0, confidence: 0, source: 'unknown' };
  }
  return {
    headYawDegrees: Number(estimate.headYawDegrees.toFixed(2)),
    headPitchDegrees: Number(estimate.headPitchDegrees.toFixed(2)),
    confidence: Number(clamp(estimate.confidence, 0, 1).toFixed(3)),
    source: estimate.source
  };
}
```

- [ ] **Step 4: Write failing LookAt preview API test**

Create `scratch/test_look_at_preview_gaze.mjs`:

```js
import assert from 'node:assert/strict';
import { LookAtController } from '../js/LookAtController.js';

function bone() {
  return { rotation: { x: 0, y: 0, z: 0 } };
}

const head = bone();
const neck = bone();
const ctrl = new LookAtController();
ctrl.setVrm({
  humanoid: {
    getBoneNode(name) {
      return name === 'head' ? head : name === 'neck' ? neck : null;
    }
  }
});

ctrl.setPreviewGaze({ yawDegrees: 20, pitchDegrees: -10, confidence: 0.8 });
ctrl.update(0.016);

assert.ok(head.rotation.y > 0.2, `head yaw should be positive, got ${head.rotation.y}`);
assert.ok(neck.rotation.y > 0.05, `neck yaw should be positive, got ${neck.rotation.y}`);
assert.ok(head.rotation.x < -0.1, `head pitch should be negative, got ${head.rotation.x}`);
assert.equal(ctrl.debugValues.mode, 'preview');

ctrl.setPreviewGaze({ yawDegrees: 40, pitchDegrees: 20, confidence: 0.1 });
ctrl.update(0.016);
assert.ok(Math.abs(head.rotation.y) < 0.001);
assert.equal(ctrl.debugValues.mode, 'preview_low_confidence');

console.log('PASS test_look_at_preview_gaze');
```

- [ ] **Step 5: Run LookAt test to verify it fails**

Run:

```powershell
node scratch\test_look_at_preview_gaze.mjs
```

Expected: FAIL with `setPreviewGaze is not a function`.

- [ ] **Step 6: Implement preview gaze API in `LookAtController`**

Modify `js/LookAtController.js`:

```js
#previewYawDegrees = 0;
#previewPitchDegrees = 0;
#previewConfidence = 0;
```

Add:

```js
setPreviewGaze(gaze = {}) {
  this.#enabled = true;
  this.#targetMode = Number(gaze.confidence) >= 0.35 ? 'preview' : 'preview_low_confidence';
  this.#previewYawDegrees = this.#targetMode === 'preview'
    ? Math.max(-45, Math.min(45, Number(gaze.yawDegrees) || 0))
    : 0;
  this.#previewPitchDegrees = this.#targetMode === 'preview'
    ? Math.max(-30, Math.min(30, Number(gaze.pitchDegrees) || 0))
    : 0;
  this.#previewConfidence = Math.max(0, Math.min(1, Number(gaze.confidence) || 0));
}
```

In `update(dt)`, before EMA mouse smoothing:

```js
if (this.#targetMode === 'preview' || this.#targetMode === 'preview_low_confidence') {
  this.#applyHeadRotation(this.#previewYawDegrees, this.#previewPitchDegrees);
  return;
}
```

Add private helper:

```js
#applyHeadRotation(yawDegrees, pitchDegrees) {
  const yawRad = yawDegrees * Math.PI / 180;
  const pitchRad = pitchDegrees * Math.PI / 180;
  if (this.#neckBone) {
    this.#neckBone.rotation.y = yawRad * this.#neckRatio;
    this.#neckBone.rotation.x = pitchRad * this.#neckRatio;
  }
  const headRatio = 1 - this.#neckRatio;
  this.#headBone.rotation.y = yawRad * headRatio;
  this.#headBone.rotation.x = pitchRad * headRatio;
  this.#headBone.rotation.z = 0;
}
```

Extend `debugValues` with:

```js
mode: this.#targetMode,
confidence: +this.#previewConfidence.toFixed(2)
```

- [ ] **Step 7: Run tests to verify they pass**

Run:

```powershell
node scratch\test_alicia_head_gaze_estimator.mjs
node scratch\test_look_at_preview_gaze.mjs
```

Expected: both PASS.

### Task 3: Upper-Body Alignment Module

**Files:**
- Create: `js/AliciaUpperBodyAlignment.js`
- Create: `scratch/test_alicia_upper_body_alignment.mjs`

- [ ] **Step 1: Write failing upper-body tests**

Create `scratch/test_alicia_upper_body_alignment.mjs`:

```js
import assert from 'node:assert/strict';
import { estimateUpperBodyAlignment } from '../js/AliciaUpperBodyAlignment.js';

const yawed = estimateUpperBodyAlignment({
  hips: { x: 0, y: 1, z: 0 },
  chest: { x: 0.03, y: 1.42, z: -0.18 },
  leftShoulder: { x: -0.12, y: 1.5, z: -0.12 },
  rightShoulder: { x: 0.18, y: 1.5, z: 0.12 },
  leftHip: { x: -0.12, y: 1, z: 0 },
  rightHip: { x: 0.12, y: 1, z: 0 }
});
assert.equal(yawed.source, 'skeleton_3d');
assert.ok(Math.abs(yawed.chestYawDegrees) > 4);
assert.ok(yawed.confidence >= 0.35);

const rolled = estimateUpperBodyAlignment({
  hips: { x: 0, y: 1, z: 0 },
  chest: { x: 0, y: 1.42, z: 0 },
  leftShoulder: { x: -0.2, y: 1.56, z: 0 },
  rightShoulder: { x: 0.2, y: 1.45, z: 0 },
  leftHip: { x: -0.12, y: 1, z: 0 },
  rightHip: { x: 0.12, y: 1, z: 0 }
});
assert.ok(Math.abs(rolled.shoulderRollDegrees) > 4);
assert.ok(Math.abs(rolled.shoulderRollDegrees) <= 10);

const extreme = estimateUpperBodyAlignment({
  hips: { x: 0, y: 1, z: 0 },
  chest: { x: 1, y: 1.42, z: -1 },
  leftShoulder: { x: -2, y: 2, z: -2 },
  rightShoulder: { x: 2, y: 1, z: 2 }
});
assert.ok(Math.abs(extreme.chestYawDegrees) <= 18);
assert.ok(Math.abs(extreme.shoulderRollDegrees) <= 10);

const missing = estimateUpperBodyAlignment({ head: { x: 0, y: 1.7, z: 0 } });
assert.equal(missing.source, 'unknown');
assert.equal(missing.confidence, 0);

console.log('PASS test_alicia_upper_body_alignment');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node scratch\test_alicia_upper_body_alignment.mjs
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement upper-body estimator**

Create `js/AliciaUpperBodyAlignment.js`:

```js
function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function point(landmarks, name) {
  const item = landmarks?.[name];
  return item ? { x: finiteNumber(item.x), y: finiteNumber(item.y), z: finiteNumber(item.z) } : null;
}

export function estimateUpperBodyAlignment(landmarks = {}) {
  const hips = point(landmarks, 'hips');
  const chest = point(landmarks, 'chest');
  const leftShoulder = point(landmarks, 'leftShoulder');
  const rightShoulder = point(landmarks, 'rightShoulder');
  if (!hips || !chest || !leftShoulder || !rightShoulder) {
    return { chestYawDegrees: 0, shoulderRollDegrees: 0, confidence: 0, source: 'unknown' };
  }

  const shoulderDx = rightShoulder.x - leftShoulder.x;
  const shoulderDz = rightShoulder.z - leftShoulder.z;
  const shoulderDy = rightShoulder.y - leftShoulder.y;
  const chestDz = chest.z - hips.z;
  const chestYaw = Math.atan2(shoulderDz + chestDz * 0.6, Math.max(0.0001, Math.abs(shoulderDx))) * 180 / Math.PI;
  const shoulderRoll = Math.atan2(shoulderDy, Math.max(0.0001, Math.abs(shoulderDx))) * 180 / Math.PI;
  const depthEvidence = clamp((Math.abs(shoulderDz) + Math.abs(chestDz)) / 0.28, 0, 1);
  const rollEvidence = clamp(Math.abs(shoulderDy) / 0.12, 0, 1);

  return {
    chestYawDegrees: Number(clamp(chestYaw, -18, 18).toFixed(2)),
    shoulderRollDegrees: Number(clamp(shoulderRoll, -10, 10).toFixed(2)),
    confidence: Number(Math.max(depthEvidence, rollEvidence, 0.35).toFixed(3)),
    source: 'skeleton_3d'
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node scratch\test_alicia_upper_body_alignment.mjs
```

Expected: PASS.

### Task 4: Apply Orientation Transform in Preview Adapter

**Files:**
- Modify: `js/AliciaOrientationAlignment.js`
- Modify: `js/AliciaMotionPreviewAdapter.js`
- Create: `scratch/test_alicia_orientation_preview_adapter.mjs`

- [ ] **Step 1: Write failing transform test**

Create `scratch/test_alicia_orientation_preview_adapter.mjs`:

```js
import assert from 'node:assert/strict';
import { applyOrientationTransform } from '../js/AliciaOrientationAlignment.js';
import { AliciaMotionPreviewAdapter } from '../js/AliciaMotionPreviewAdapter.js';

const limbBones = ['leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm', 'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg'];
const animation = {
  bones: {
    hips: [{ time_ms: 0, rot: [0, 0, 0, 1] }],
    spine: [{ time_ms: 0, rot: [0, 0, 0, 1] }],
    chest: [{ time_ms: 0, rot: [0, 0, 0, 1] }],
    leftUpperArm: [{ time_ms: 0, rot: [0.1, 0, 0, 0.99] }],
    leftLowerArm: [{ time_ms: 0, rot: [0.2, 0, 0, 0.98] }],
    rightUpperArm: [{ time_ms: 0, rot: [-0.1, 0, 0, 0.99] }],
    rightLowerArm: [{ time_ms: 0, rot: [-0.2, 0, 0, 0.98] }],
    leftUpperLeg: [{ time_ms: 0, rot: [0, 0.1, 0, 0.99] }],
    leftLowerLeg: [{ time_ms: 0, rot: [0, 0.2, 0, 0.98] }],
    rightUpperLeg: [{ time_ms: 0, rot: [0, -0.1, 0, 0.99] }],
    rightLowerLeg: [{ time_ms: 0, rot: [0, -0.2, 0, 0.98] }]
  }
};
const before = JSON.parse(JSON.stringify(animation));
const transformed = applyOrientationTransform(animation, {
  t: 0,
  headYawDegrees: 20,
  headPitchDegrees: -10,
  chestYawDegrees: 12,
  shoulderRollDegrees: 6,
  confidence: { body: 0, head: 0.8, chest: 0.7 },
  source: { body: 'unknown', head: 'fixture', chest: 'fixture' }
});

assert.notDeepEqual(transformed.bones.chest, before.bones.chest);
assert.notDeepEqual(transformed.bones.spine, before.bones.spine);
for (const bone of limbBones) {
  assert.deepEqual(transformed.bones[bone], before.bones[bone], `${bone} must not be changed by orientation layer`);
}
assert.equal(transformed.orientation_alignment.head.applied, true);
assert.equal(transformed.orientation_alignment.chest.applied, true);

let heldAnimation = null;
const adapter = new AliciaMotionPreviewAdapter({
  mascot: {
    lookAt: { setPreviewGaze(gaze) { this.lastGaze = gaze; } },
    motion: {
      getPosePreset() { return { basePose: { rotation: {} } }; },
      holdCustomPose(anim) { heldAnimation = anim; }
    }
  }
});
const result = adapter.previewPoseAtTimeMs(0, [{
  timeMs: 0,
  landmarks: {
    hips: { x: 0, y: 1, z: 0 },
    chest: { x: 0, y: 1.4, z: 0 },
    head: { x: 0, y: 1.7, z: 0 },
    leftShoulder: { x: -0.2, y: 1.5, z: 0 },
    rightShoulder: { x: 0.2, y: 1.5, z: 0 },
    leftWrist: { x: -0.45, y: 1.1, z: 0 },
    rightWrist: { x: 0.45, y: 1.1, z: 0 },
    leftAnkle: { x: -0.12, y: 0, z: 0 },
    rightAnkle: { x: 0.12, y: 0, z: 0 }
  }
}], {
  orientationTransform: {
    t: 0,
    headYawDegrees: 16,
    headPitchDegrees: 4,
    chestYawDegrees: 8,
    shoulderRollDegrees: 3,
    confidence: { body: 0, head: 0.9, chest: 0.8 },
    source: { body: 'unknown', head: 'fixture', chest: 'fixture' }
  }
});
assert.equal(result.ok, true);
assert.ok(heldAnimation.orientation_alignment.chest.applied);
assert.ok(result.orientationAlignment.head.applied);

console.log('PASS test_alicia_orientation_preview_adapter');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node scratch\test_alicia_orientation_preview_adapter.mjs
```

Expected: FAIL with `applyOrientationTransform` missing or `orientationTransform` ignored.

- [ ] **Step 3: Implement transform application**

Add to `js/AliciaOrientationAlignment.js`:

```js
function quatFromDegrees({ x = 0, y = 0, z = 0 } = {}) {
  const hx = x * Math.PI / 360;
  const hy = y * Math.PI / 360;
  const hz = z * Math.PI / 360;
  const c1 = Math.cos(hx), c2 = Math.cos(hy), c3 = Math.cos(hz);
  const s1 = Math.sin(hx), s2 = Math.sin(hy), s3 = Math.sin(hz);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3
  ];
}

function normalizeQuat(quat) {
  const length = Math.hypot(quat[0], quat[1], quat[2], quat[3]) || 1;
  return quat.map((value) => Math.round((value / length) * 1000000) / 1000000);
}

function multiplyQuat(a, b) {
  return normalizeQuat([
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ]);
}

function applyBoneDelta(bones, boneName, deltaQuat) {
  if (!bones?.[boneName]?.length) return bones?.[boneName];
  return bones[boneName].map((key) => ({
    ...key,
    rot: Array.isArray(key.rot) && key.rot.length === 4 ? multiplyQuat(deltaQuat, key.rot) : key.rot
  }));
}

export function applyOrientationTransform(animation, orientationFrame, options = {}) {
  const frame = normalizeOrientationFrame(orientationFrame);
  if (!animation || !frame) return animation;
  const minConfidence = finiteNumber(options.minConfidence, 0.35);
  const bones = { ...(animation.bones || {}) };
  const chestApplied = frame.confidence.chest >= minConfidence;
  if (chestApplied) {
    const chestQuat = quatFromDegrees({ y: frame.chestYawDegrees, z: frame.shoulderRollDegrees });
    const spineQuat = quatFromDegrees({ y: frame.chestYawDegrees * 0.45, z: frame.shoulderRollDegrees * 0.35 });
    bones.chest = applyBoneDelta(bones, 'chest', chestQuat);
    bones.spine = applyBoneDelta(bones, 'spine', spineQuat);
  }
  const headApplied = frame.confidence.head >= minConfidence;
  return {
    ...animation,
    bones,
    orientation_alignment: {
      applied: chestApplied || headApplied,
      frameTimeSeconds: frame.t,
      head: {
        applied: headApplied,
        yawDegrees: headApplied ? frame.headYawDegrees : 0,
        pitchDegrees: headApplied ? frame.headPitchDegrees : 0,
        confidence: frame.confidence.head,
        source: frame.source.head
      },
      chest: {
        applied: chestApplied,
        yawDegrees: chestApplied ? frame.chestYawDegrees : 0,
        shoulderRollDegrees: chestApplied ? frame.shoulderRollDegrees : 0,
        confidence: frame.confidence.chest,
        source: frame.source.chest
      }
    }
  };
}
```

- [ ] **Step 4: Wire `orientationTransform` in `AliciaMotionPreviewAdapter`**

Modify `js/AliciaMotionPreviewAdapter.js`:

```js
import { applyOrientationTransform } from './AliciaOrientationAlignment.js';
```

Inside `previewPoseAtTimeMs()` after `buildPoseAnimation()` and before `transformAnimation`:

```js
if (options.orientationTransform) {
  animation = applyOrientationTransform(animation, options.orientationTransform);
  if (animation.orientation_alignment?.head?.applied && typeof this.mascot.lookAt?.setPreviewGaze === 'function') {
    this.mascot.lookAt.setPreviewGaze({
      yawDegrees: animation.orientation_alignment.head.yawDegrees,
      pitchDegrees: animation.orientation_alignment.head.pitchDegrees,
      confidence: animation.orientation_alignment.head.confidence
    });
  }
}
```

Extend return value:

```js
orientationAlignment: animation.orientation_alignment || null
```

- [ ] **Step 5: Run transform test to verify it passes**

Run:

```powershell
node scratch\test_alicia_orientation_preview_adapter.mjs
```

Expected: PASS.

### Task 5: Lab Diagnostics and Per-Frame Orientation

**Files:**
- Modify: `motion_capture_lab.html`
- Modify: `scratch/test_motion_capture_lab.mjs`

- [ ] **Step 1: Extend static Lab test**

Modify `scratch/test_motion_capture_lab.mjs` to require:

```js
'orientationLayerStatus',
'orientationBodyYaw',
'orientationHeadGaze',
'orientationChestAlign',
```

Add regex checks:

```js
assert.match(html, /Orientation Layer/);
assert.match(html, /Body Yaw/);
assert.match(html, /Head Gaze/);
assert.match(html, /Chest Align/);
assert.match(html, /estimateHeadGaze/);
assert.match(html, /estimateUpperBodyAlignment/);
assert.match(html, /function buildOrientationTransformForFrame/);
assert.match(html, /orientationTransform:\s*buildOrientationTransformForFrame/);
```

- [ ] **Step 2: Run static test to verify it fails**

Run:

```powershell
node scratch\test_motion_capture_lab.mjs
```

Expected: FAIL because new IDs/imports/functions are missing.

- [ ] **Step 3: Add Lab imports and summary rows**

Modify `motion_capture_lab.html` module imports:

```js
import { estimateHeadGaze } from './js/AliciaHeadGazeEstimator.js';
import { estimateUpperBodyAlignment } from './js/AliciaUpperBodyAlignment.js';
```

Add summary rows after GVHMR rows:

```html
<div class="summary-row"><span>Orientation Layer</span><output id="orientationLayerStatus">off</output></div>
<div class="summary-row"><span>Body Yaw</span><output id="orientationBodyYaw">--</output></div>
<div class="summary-row"><span>Head Gaze</span><output id="orientationHeadGaze">--</output></div>
<div class="summary-row"><span>Chest Align</span><output id="orientationChestAlign">--</output></div>
```

- [ ] **Step 4: Add Lab orientation builder**

Add functions near GVHMR summary helpers:

```js
function sourceFromSequenceDepth() {
  if (state.sequence?.depthSource === 'motionbert') return 'motionbert';
  if (state.sequence?.poseMode === '3d_lifted') return 'skeleton_3d';
  return 'skeleton_2d';
}

function buildOrientationTransformForFrame(frame, timeMs) {
  if (!frame?.landmarks) return null;
  const timeSeconds = Math.max(0, Number(timeMs) || 0) / 1000;
  const head = estimateHeadGaze(frame.landmarks);
  const chest = estimateUpperBodyAlignment(frame.landmarks);
  const worldFrame = nearestGvhmrWorldMotionFrame(state.worldMotion, timeSeconds);
  const bodyConfidence = Number(worldFrame?.confidence) || state.sequence?.depthConfidence || 0;
  const transform = {
    t: timeSeconds,
    bodyYawDegrees: Number(worldFrame?.bodyYawDegrees) || state.previewAdapter?.lastBodyYawDegrees || 0,
    headYawDegrees: head.headYawDegrees,
    headPitchDegrees: head.headPitchDegrees,
    chestYawDegrees: chest.chestYawDegrees,
    shoulderRollDegrees: chest.shoulderRollDegrees,
    confidence: {
      body: Math.max(0, Math.min(1, bodyConfidence)),
      head: head.confidence,
      chest: chest.confidence
    },
    source: {
      body: worldFrame ? 'gvhmr' : sourceFromSequenceDepth(),
      head: head.source,
      chest: chest.source
    }
  };
  updateOrientationSummary(transform);
  return transform;
}

function updateOrientationSummary(transform) {
  if (!transform) {
    setText('orientationLayerStatus', 'off');
    setText('orientationBodyYaw', '--');
    setText('orientationHeadGaze', '--');
    setText('orientationChestAlign', '--');
    return;
  }
  const status = transform.source.body === 'gvhmr' ? 'gvhmr' : 'heuristic';
  const isMixed = new Set(Object.values(transform.source)).size > 1;
  setText('orientationLayerStatus', isMixed ? `mixed (${status})` : status);
  setText('orientationBodyYaw', `${formatMetric(transform.bodyYawDegrees, 1)} deg / ${formatMetric(transform.confidence.body)}`);
  setText('orientationHeadGaze', `yaw ${formatMetric(transform.headYawDegrees, 1)} / pitch ${formatMetric(transform.headPitchDegrees, 1)} / ${formatMetric(transform.confidence.head)}`);
  setText('orientationChestAlign', `yaw ${formatMetric(transform.chestYawDegrees, 1)} / roll ${formatMetric(transform.shoulderRollDegrees, 1)} / ${formatMetric(transform.confidence.chest)}`);
}
```

In `syncAliciaPoseToVideoTime()`:

```js
const frame = state.adapter.getFrameAtMs(state.sequence, roundedTimeMs);
const orientationTransform = buildOrientationTransformForFrame(frame, roundedTimeMs);
```

Pass:

```js
orientationTransform,
```

- [ ] **Step 5: Run static test to verify it passes**

Run:

```powershell
node scratch\test_motion_capture_lab.mjs
```

Expected: PASS.

### Task 6: Verification, History, and Commit

**Files:**
- Modify: `history.md`

- [ ] **Step 1: Update history**

Add to `history.md` under `2026-06-18`:

```markdown
- 完成 M20.5 Orientation Alignment Layer MVP 第一版：
  - 新增 orientation contract normalizer、head gaze estimator 與 upper-body alignment estimator，採 fixture-first TDD 鎖定 confidence clamp、source attribution 與保守角度限制。
  - `AliciaMotionPreviewAdapter.previewPoseAtTimeMs()` 新增 `orientationTransform`，先生成原本 limb pose，再只修 chest / spine reference frame 與 LookAt preview gaze，不直接覆蓋四肢骨頭 rotation。
  - Motion Capture Lab 新增 Orientation Layer / Body Yaw / Head Gaze / Chest Align read-only diagnostics，Pose Copier scrub/play sync 會同步更新方向層摘要。
```

- [ ] **Step 2: Run full verification**

Run:

```powershell
node scratch\test_orientation_alignment_contract.mjs
node scratch\test_alicia_head_gaze_estimator.mjs
node scratch\test_look_at_preview_gaze.mjs
node scratch\test_alicia_upper_body_alignment.mjs
node scratch\test_alicia_orientation_preview_adapter.mjs
node scratch\test_alicia_world_motion_fusion.mjs
node scratch\test_motion_capture_lab.mjs
node scratch\test_world_motion_cli_stubs.mjs
python scratch\test_video_world_motion_api.py
python scratch\test_video_skeleton_api.py
git diff --check
```

Expected: all tests PASS; `git diff --check` has no whitespace errors.

- [ ] **Step 3: Commit**

Run:

```powershell
git add docs\superpowers\plans\2026-06-18-m20-5-orientation-alignment-layer.md js\AliciaOrientationAlignment.js js\AliciaHeadGazeEstimator.js js\AliciaUpperBodyAlignment.js js\AliciaMotionPreviewAdapter.js js\LookAtController.js motion_capture_lab.html scratch\test_orientation_alignment_contract.mjs scratch\test_alicia_head_gaze_estimator.mjs scratch\test_look_at_preview_gaze.mjs scratch\test_alicia_upper_body_alignment.mjs scratch\test_alicia_orientation_preview_adapter.mjs scratch\test_motion_capture_lab.mjs history.md
git commit -m "feat: add m20 5 orientation alignment layer"
```

Expected: commit succeeds. Do not stage unrelated untracked files.

## Self-Review

- Spec coverage: body yaw stays in world fusion, head gaze gets estimator and LookAt API, chest alignment gets conservative transform, Lab diagnostics are included, and limb overwrite prohibition is tested.
- Placeholder scan: no `TBD`, `TODO`, or vague implementation slots remain.
- Type consistency: the plan consistently uses `orientationTransform`, `orientation_alignment`, `estimateHeadGaze()`, `estimateUpperBodyAlignment()`, and `applyOrientationTransform()`.
