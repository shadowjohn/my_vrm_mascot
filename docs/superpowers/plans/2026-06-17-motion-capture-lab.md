# M20.3 Motion Capture Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser Motion Capture Lab that turns captured skeleton sequences into reusable Alicia motion clips, starting with deterministic Skeleton JSON and leaving clean adapter seams for Video, Webcam, VRMA, MediaPipe, MoveNet, and YOLO Pose sources.

**Architecture:** Keep M20.3 as a lab-only capture and export surface: source adapters normalize landmarks, cycle detection marks walk phases, the exporter writes a motion clip contract, and Alicia preview reads that clip without changing `VrmMascot` core public API. M20.4 Motion Synthesizer and M20.5 Locomotion Runtime are not implemented in this plan, but the exported JSON contract is shaped so they can consume it.

**Tech Stack:** Plain HTML/CSS/ES modules, Three.js/VRM runtime already used by the repo, Node `assert` contract tests, Python compile check for existing server safety.

---

## Scope

M20.3 builds the capture lab and the clip contract. It does not add `mascot.moveTo()`, STEP/GIS integration, WebSocket/SSE, physics interaction, production defaults, or a `MotionController` rewrite.

The first fully functional path is:

```text
Skeleton JSON
-> normalized capture sequence
-> manual or evenly seeded walk phase markers
-> key pose extraction
-> motion clip JSON
-> Alicia lab preview
```

Video, Webcam, and VRMA are present as source inputs in the UI and adapter registry. Video/Webcam use a browser preview element and can call a MediaPipe-compatible adapter if `PoseLandmarker` is present on `window`. If the detector is not present, the UI returns a clear `pose_estimator_unavailable` status and keeps the Skeleton JSON path usable.

## File Structure

- Create `motion_capture_lab.html`
  - Lab UI: source inputs, video preview, skeleton preview canvas, cycle markers, Alicia preview, export panel.
  - Imports only lab modules and existing Alicia runtime modules.
- Create `js/MotionCaptureTypes.js`
  - Shared constants, canonical landmark names, phase names, frame normalization, sequence validation.
- Create `js/SkeletonSequenceAdapter.js`
  - Parses Skeleton JSON text/object into normalized frames.
- Create `js/PoseEstimatorAdapters.js`
  - Adapter registry and safe MediaPipe/MoveNet/YOLO-compatible adapter contracts.
- Create `js/MotionCycleDetector.js`
  - Loop range, phase markers, deterministic phase seeding, frame extraction.
- Create `js/MotionClipExporter.js`
  - Builds `motion_clip_v1` JSON from a normalized sequence and cycle markers.
- Create `js/AliciaMotionPreviewAdapter.js`
  - Lab-only preview bridge that can apply exported key poses or trigger existing safe walk preview behavior without changing `VrmMascot` core.
- Create `motions/capture_samples/walk_reference_001.json`
  - Small deterministic sample capture sequence for tests and the Load Sample button.
- Create `scratch/test_motion_capture_types.mjs`
- Create `scratch/test_skeleton_sequence_adapter.mjs`
- Create `scratch/test_pose_estimator_adapters.mjs`
- Create `scratch/test_motion_cycle_detector.mjs`
- Create `scratch/test_motion_clip_exporter.mjs`
- Create `scratch/test_motion_capture_lab.mjs`
- Modify `history.md`
  - Record the M20.3 plan and implementation contract after code lands.

## Data Contracts

Canonical capture frame:

```js
{
  timeMs: 240,
  landmarks: {
    hips: { x: 0, y: 1.02, z: 0, visibility: 1 },
    chest: { x: 0, y: 1.38, z: 0, visibility: 1 },
    head: { x: 0.01, y: 1.68, z: 0, visibility: 1 },
    leftShoulder: { x: -0.22, y: 1.46, z: 0, visibility: 1 },
    rightShoulder: { x: 0.22, y: 1.45, z: 0, visibility: 1 },
    leftWrist: { x: -0.34, y: 1.08, z: 0.02, visibility: 1 },
    rightWrist: { x: 0.36, y: 1.10, z: -0.02, visibility: 1 },
    leftAnkle: { x: -0.12, y: 0.05, z: 0.18, visibility: 1 },
    rightAnkle: { x: 0.12, y: 0.05, z: -0.18, visibility: 1 }
  }
}
```

Motion clip export:

```js
{
  schemaVersion: 1,
  kind: "motion_clip_v1",
  id: "walk_cycle_001",
  label: "Walk Cycle 001",
  source: {
    type: "skeleton_json",
    adapter: "SkeletonSequenceAdapter",
    sourceId: "walk_reference_001"
  },
  loop: { startMs: 0, endMs: 960, durationMs: 960 },
  phases: {
    contact_left: { timeMs: 0, frameIndex: 0 },
    down_left: { timeMs: 120, frameIndex: 1 },
    passing_left: { timeMs: 240, frameIndex: 2 },
    up_left: { timeMs: 360, frameIndex: 3 },
    contact_right: { timeMs: 480, frameIndex: 4 },
    down_right: { timeMs: 600, frameIndex: 5 },
    passing_right: { timeMs: 720, frameIndex: 6 },
    up_right: { timeMs: 840, frameIndex: 7 }
  },
  keyPoses: [
    { phase: "contact_left", timeMs: 0, frameIndex: 0, landmarks: {} }
  ],
  retargetHints: {
    strideScale: 1,
    armSwingScale: 1,
    hipBobScale: 1,
    smoothing: 0.35
  }
}
```

### Task 1: Motion Capture Shared Types

**Files:**
- Create: `scratch/test_motion_capture_types.mjs`
- Create: `js/MotionCaptureTypes.js`

- [ ] **Step 1: Write the failing test**

Create `scratch/test_motion_capture_types.mjs`:

```js
import assert from 'node:assert/strict';
import {
  CAPTURE_SOURCE_TYPES,
  CYCLE_PHASES,
  MOTION_CLIP_SCHEMA_VERSION,
  REQUIRED_CANONICAL_LANDMARKS,
  createEmptyCycleMarkers,
  isValidCyclePhase,
  normalizeCaptureFrame,
  validateSkeletonSequence
} from '../js/MotionCaptureTypes.js';

assert.deepEqual(CAPTURE_SOURCE_TYPES, ['video', 'webcam', 'skeleton_json', 'vrma']);
assert.deepEqual(CYCLE_PHASES, [
  'contact_left',
  'down_left',
  'passing_left',
  'up_left',
  'contact_right',
  'down_right',
  'passing_right',
  'up_right'
]);
assert.equal(MOTION_CLIP_SCHEMA_VERSION, 1);
assert.ok(REQUIRED_CANONICAL_LANDMARKS.includes('hips'));
assert.ok(isValidCyclePhase('contact_left'));
assert.equal(isValidCyclePhase('float_spin'), false);

const markers = createEmptyCycleMarkers();
assert.deepEqual(Object.keys(markers), CYCLE_PHASES);
assert.equal(markers.contact_left, null);

const normalized = normalizeCaptureFrame({
  timeMs: 33.3,
  landmarks: {
    hips: { x: '0', y: 1, z: 0 },
    chest: { x: 0, y: 1.4, z: 0 },
    head: { x: 0, y: 1.7, z: 0 },
    leftShoulder: { x: -0.2, y: 1.45, z: 0 },
    rightShoulder: { x: 0.2, y: 1.45, z: 0 },
    leftWrist: { x: -0.32, y: 1.05, z: 0 },
    rightWrist: { x: 0.32, y: 1.05, z: 0 },
    leftAnkle: { x: -0.1, y: 0.05, z: 0.15 },
    rightAnkle: { x: 0.1, y: 0.05, z: -0.15 }
  }
}, 1);

assert.equal(normalized.frameIndex, 1);
assert.equal(normalized.timeMs, 33.3);
assert.equal(normalized.landmarks.hips.x, 0);
assert.equal(normalized.landmarks.hips.visibility, 1);

const valid = validateSkeletonSequence({
  id: 'unit_walk',
  sourceType: 'skeleton_json',
  fps: 30,
  frames: [normalized]
});
assert.equal(valid.ok, true);

const invalid = validateSkeletonSequence({
  id: 'bad_walk',
  sourceType: 'skeleton_json',
  fps: 30,
  frames: [{ timeMs: 0, landmarks: { hips: { x: 0, y: 1, z: 0 } } }]
});
assert.equal(invalid.ok, false);
assert.equal(invalid.reason, 'missing_landmark');
assert.equal(invalid.landmark, 'chest');

console.log('PASS test_motion_capture_types');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scratch\test_motion_capture_types.mjs
```

Expected: FAIL with `Cannot find module '../js/MotionCaptureTypes.js'`.

- [ ] **Step 3: Implement shared types**

Create `js/MotionCaptureTypes.js`:

```js
export const MOTION_CLIP_SCHEMA_VERSION = 1;

export const CAPTURE_SOURCE_TYPES = Object.freeze([
  'video',
  'webcam',
  'skeleton_json',
  'vrma'
]);

export const CYCLE_PHASES = Object.freeze([
  'contact_left',
  'down_left',
  'passing_left',
  'up_left',
  'contact_right',
  'down_right',
  'passing_right',
  'up_right'
]);

export const REQUIRED_CANONICAL_LANDMARKS = Object.freeze([
  'hips',
  'chest',
  'head',
  'leftShoulder',
  'rightShoulder',
  'leftWrist',
  'rightWrist',
  'leftAnkle',
  'rightAnkle'
]);

export function isValidCyclePhase(phase) {
  return CYCLE_PHASES.includes(phase);
}

export function createEmptyCycleMarkers() {
  return CYCLE_PHASES.reduce((markers, phase) => {
    markers[phase] = null;
    return markers;
  }, {});
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeLandmark(landmark) {
  return {
    x: toNumber(landmark?.x),
    y: toNumber(landmark?.y),
    z: toNumber(landmark?.z),
    visibility: toNumber(landmark?.visibility, 1)
  };
}

export function normalizeCaptureFrame(frame, frameIndex = 0) {
  const landmarks = {};
  for (const [name, landmark] of Object.entries(frame?.landmarks || {})) {
    landmarks[name] = normalizeLandmark(landmark);
  }
  return {
    frameIndex,
    timeMs: toNumber(frame?.timeMs),
    landmarks
  };
}

export function validateSkeletonSequence(sequence) {
  if (!sequence || typeof sequence !== 'object') {
    return { ok: false, reason: 'invalid_sequence' };
  }
  if (!CAPTURE_SOURCE_TYPES.includes(sequence.sourceType)) {
    return { ok: false, reason: 'unknown_source_type', sourceType: sequence.sourceType };
  }
  if (!Array.isArray(sequence.frames) || sequence.frames.length === 0) {
    return { ok: false, reason: 'empty_frames' };
  }
  for (const [frameIndex, frame] of sequence.frames.entries()) {
    for (const landmark of REQUIRED_CANONICAL_LANDMARKS) {
      if (!frame.landmarks || !frame.landmarks[landmark]) {
        return { ok: false, reason: 'missing_landmark', frameIndex, landmark };
      }
    }
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node .\scratch\test_motion_capture_types.mjs
```

Expected: `PASS test_motion_capture_types`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add js/MotionCaptureTypes.js scratch/test_motion_capture_types.mjs
git commit -m "feat: add motion capture data contracts"
```

### Task 2: Skeleton JSON Sample And Adapter

**Files:**
- Create: `motions/capture_samples/walk_reference_001.json`
- Create: `scratch/test_skeleton_sequence_adapter.mjs`
- Create: `js/SkeletonSequenceAdapter.js`

- [ ] **Step 1: Add deterministic sample capture file**

Create `motions/capture_samples/walk_reference_001.json`:

```json
{
  "id": "walk_reference_001",
  "label": "Walk Reference 001",
  "sourceType": "skeleton_json",
  "fps": 30,
  "frames": [
    { "timeMs": 0, "landmarks": { "hips": { "x": 0, "y": 1.02, "z": 0 }, "chest": { "x": 0, "y": 1.38, "z": 0 }, "head": { "x": 0, "y": 1.68, "z": 0 }, "leftShoulder": { "x": -0.22, "y": 1.46, "z": 0 }, "rightShoulder": { "x": 0.22, "y": 1.45, "z": 0 }, "leftWrist": { "x": -0.34, "y": 1.08, "z": 0.02 }, "rightWrist": { "x": 0.36, "y": 1.1, "z": -0.02 }, "leftAnkle": { "x": -0.13, "y": 0.05, "z": 0.22 }, "rightAnkle": { "x": 0.12, "y": 0.05, "z": -0.16 } } },
    { "timeMs": 120, "landmarks": { "hips": { "x": -0.01, "y": 0.99, "z": 0.03 }, "chest": { "x": -0.01, "y": 1.35, "z": 0.02 }, "head": { "x": -0.01, "y": 1.65, "z": 0.02 }, "leftShoulder": { "x": -0.23, "y": 1.43, "z": 0.02 }, "rightShoulder": { "x": 0.21, "y": 1.42, "z": 0.01 }, "leftWrist": { "x": -0.31, "y": 1.11, "z": -0.03 }, "rightWrist": { "x": 0.33, "y": 1.05, "z": 0.04 }, "leftAnkle": { "x": -0.11, "y": 0.04, "z": 0.14 }, "rightAnkle": { "x": 0.13, "y": 0.08, "z": -0.05 } } },
    { "timeMs": 240, "landmarks": { "hips": { "x": 0, "y": 1.04, "z": 0.06 }, "chest": { "x": 0, "y": 1.4, "z": 0.04 }, "head": { "x": 0, "y": 1.7, "z": 0.04 }, "leftShoulder": { "x": -0.22, "y": 1.48, "z": 0.03 }, "rightShoulder": { "x": 0.22, "y": 1.47, "z": 0.03 }, "leftWrist": { "x": -0.28, "y": 1.14, "z": -0.05 }, "rightWrist": { "x": 0.3, "y": 1.03, "z": 0.06 }, "leftAnkle": { "x": -0.06, "y": 0.09, "z": 0.04 }, "rightAnkle": { "x": 0.12, "y": 0.06, "z": 0.02 } } },
    { "timeMs": 360, "landmarks": { "hips": { "x": 0.01, "y": 1.07, "z": 0.08 }, "chest": { "x": 0.01, "y": 1.43, "z": 0.06 }, "head": { "x": 0.01, "y": 1.73, "z": 0.05 }, "leftShoulder": { "x": -0.21, "y": 1.51, "z": 0.05 }, "rightShoulder": { "x": 0.23, "y": 1.5, "z": 0.04 }, "leftWrist": { "x": -0.24, "y": 1.16, "z": -0.06 }, "rightWrist": { "x": 0.27, "y": 1.02, "z": 0.07 }, "leftAnkle": { "x": 0, "y": 0.12, "z": -0.06 }, "rightAnkle": { "x": 0.08, "y": 0.05, "z": 0.12 } } },
    { "timeMs": 480, "landmarks": { "hips": { "x": 0, "y": 1.02, "z": 0.1 }, "chest": { "x": 0, "y": 1.38, "z": 0.08 }, "head": { "x": 0, "y": 1.68, "z": 0.08 }, "leftShoulder": { "x": -0.22, "y": 1.45, "z": 0.07 }, "rightShoulder": { "x": 0.22, "y": 1.46, "z": 0.07 }, "leftWrist": { "x": -0.36, "y": 1.1, "z": -0.02 }, "rightWrist": { "x": 0.34, "y": 1.08, "z": 0.02 }, "leftAnkle": { "x": -0.12, "y": 0.05, "z": -0.16 }, "rightAnkle": { "x": 0.13, "y": 0.05, "z": 0.22 } } },
    { "timeMs": 600, "landmarks": { "hips": { "x": 0.01, "y": 0.99, "z": 0.13 }, "chest": { "x": 0.01, "y": 1.35, "z": 0.11 }, "head": { "x": 0.01, "y": 1.65, "z": 0.1 }, "leftShoulder": { "x": -0.21, "y": 1.42, "z": 0.1 }, "rightShoulder": { "x": 0.23, "y": 1.43, "z": 0.1 }, "leftWrist": { "x": -0.33, "y": 1.05, "z": 0.04 }, "rightWrist": { "x": 0.31, "y": 1.11, "z": -0.03 }, "leftAnkle": { "x": -0.13, "y": 0.08, "z": -0.05 }, "rightAnkle": { "x": 0.11, "y": 0.04, "z": 0.14 } } },
    { "timeMs": 720, "landmarks": { "hips": { "x": 0, "y": 1.04, "z": 0.16 }, "chest": { "x": 0, "y": 1.4, "z": 0.14 }, "head": { "x": 0, "y": 1.7, "z": 0.13 }, "leftShoulder": { "x": -0.22, "y": 1.47, "z": 0.13 }, "rightShoulder": { "x": 0.22, "y": 1.48, "z": 0.13 }, "leftWrist": { "x": -0.3, "y": 1.03, "z": 0.06 }, "rightWrist": { "x": 0.28, "y": 1.14, "z": -0.05 }, "leftAnkle": { "x": -0.12, "y": 0.06, "z": 0.02 }, "rightAnkle": { "x": 0.06, "y": 0.09, "z": 0.04 } } },
    { "timeMs": 840, "landmarks": { "hips": { "x": -0.01, "y": 1.07, "z": 0.18 }, "chest": { "x": -0.01, "y": 1.43, "z": 0.16 }, "head": { "x": -0.01, "y": 1.73, "z": 0.15 }, "leftShoulder": { "x": -0.23, "y": 1.5, "z": 0.15 }, "rightShoulder": { "x": 0.21, "y": 1.51, "z": 0.15 }, "leftWrist": { "x": -0.27, "y": 1.02, "z": 0.07 }, "rightWrist": { "x": 0.24, "y": 1.16, "z": -0.06 }, "leftAnkle": { "x": -0.08, "y": 0.05, "z": 0.12 }, "rightAnkle": { "x": 0, "y": 0.12, "z": -0.06 } } },
    { "timeMs": 960, "landmarks": { "hips": { "x": 0, "y": 1.02, "z": 0.2 }, "chest": { "x": 0, "y": 1.38, "z": 0.18 }, "head": { "x": 0, "y": 1.68, "z": 0.18 }, "leftShoulder": { "x": -0.22, "y": 1.46, "z": 0.17 }, "rightShoulder": { "x": 0.22, "y": 1.45, "z": 0.17 }, "leftWrist": { "x": -0.34, "y": 1.08, "z": 0.02 }, "rightWrist": { "x": 0.36, "y": 1.1, "z": -0.02 }, "leftAnkle": { "x": -0.13, "y": 0.05, "z": 0.22 }, "rightAnkle": { "x": 0.12, "y": 0.05, "z": -0.16 } } }
  ]
}
```

- [ ] **Step 2: Write the failing adapter test**

Create `scratch/test_skeleton_sequence_adapter.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SkeletonSequenceAdapter } from '../js/SkeletonSequenceAdapter.js';

const sampleText = readFileSync('motions/capture_samples/walk_reference_001.json', 'utf8');
const adapter = new SkeletonSequenceAdapter({ sourceId: 'walk_reference_001' });
const result = adapter.loadFromText(sampleText);

assert.equal(result.ok, true);
assert.equal(result.sequence.id, 'walk_reference_001');
assert.equal(result.sequence.sourceType, 'skeleton_json');
assert.equal(result.sequence.frames.length, 9);
assert.equal(result.sequence.frames[0].frameIndex, 0);
assert.equal(result.sequence.frames[8].timeMs, 960);
assert.equal(result.durationMs, 960);

const frameAt240 = adapter.getFrameAtMs(result.sequence, 250);
assert.equal(frameAt240.frameIndex, 2);
assert.equal(frameAt240.timeMs, 240);

const badJson = adapter.loadFromText('{');
assert.equal(badJson.ok, false);
assert.equal(badJson.reason, 'invalid_json');

const badSequence = adapter.load({ id: 'empty', sourceType: 'skeleton_json', frames: [] });
assert.equal(badSequence.ok, false);
assert.equal(badSequence.reason, 'empty_frames');

console.log('PASS test_skeleton_sequence_adapter');
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```powershell
node .\scratch\test_skeleton_sequence_adapter.mjs
```

Expected: FAIL with `Cannot find module '../js/SkeletonSequenceAdapter.js'`.

- [ ] **Step 4: Implement the adapter**

Create `js/SkeletonSequenceAdapter.js`:

```js
import {
  normalizeCaptureFrame,
  validateSkeletonSequence
} from './MotionCaptureTypes.js';

export class SkeletonSequenceAdapter {
  constructor({ sourceId = 'skeleton_json' } = {}) {
    this.sourceId = sourceId;
  }

  loadFromText(text) {
    try {
      return this.load(JSON.parse(text));
    } catch (error) {
      return { ok: false, reason: 'invalid_json', error: error.message };
    }
  }

  load(rawSequence) {
    const frames = (rawSequence.frames || []).map((frame, index) => normalizeCaptureFrame(frame, index));
    const sequence = {
      id: rawSequence.id || this.sourceId,
      label: rawSequence.label || rawSequence.id || this.sourceId,
      sourceType: rawSequence.sourceType || 'skeleton_json',
      fps: Number(rawSequence.fps) || 30,
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
```

- [ ] **Step 5: Run tests**

Run:

```powershell
node .\scratch\test_motion_capture_types.mjs
node .\scratch\test_skeleton_sequence_adapter.mjs
```

Expected:

```text
PASS test_motion_capture_types
PASS test_skeleton_sequence_adapter
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add motions/capture_samples/walk_reference_001.json js/SkeletonSequenceAdapter.js scratch/test_skeleton_sequence_adapter.mjs
git commit -m "feat: add skeleton sequence adapter"
```

### Task 3: Pose Estimator Adapter Registry

**Files:**
- Create: `scratch/test_pose_estimator_adapters.mjs`
- Create: `js/PoseEstimatorAdapters.js`

- [ ] **Step 1: Write the failing test**

Create `scratch/test_pose_estimator_adapters.mjs`:

```js
import assert from 'node:assert/strict';
import {
  PoseEstimatorRegistry,
  createMediaPipePoseAdapter,
  createMoveNetPoseAdapter,
  createYoloPoseAdapter
} from '../js/PoseEstimatorAdapters.js';

const registry = new PoseEstimatorRegistry();
registry.register('mediapipe_pose', createMediaPipePoseAdapter({ poseLandmarker: null }));
registry.register('movenet', createMoveNetPoseAdapter({ detector: null }));
registry.register('yolo_pose', createYoloPoseAdapter({ detector: null }));

assert.deepEqual(registry.list().map((entry) => entry.id), [
  'mediapipe_pose',
  'movenet',
  'yolo_pose'
]);

assert.equal(registry.get('mediapipe_pose').label, 'MediaPipe Pose');
assert.equal(registry.get('missing'), null);

const duplicate = registry.register('mediapipe_pose', createMediaPipePoseAdapter({ poseLandmarker: null }));
assert.equal(duplicate.ok, false);
assert.equal(duplicate.reason, 'duplicate_adapter');

const replaced = registry.register('mediapipe_pose', createMediaPipePoseAdapter({ poseLandmarker: null }), { replace: true });
assert.equal(replaced.ok, true);

const unavailable = await registry.get('mediapipe_pose').estimateFrame({ currentTime: 0 });
assert.equal(unavailable.ok, false);
assert.equal(unavailable.reason, 'pose_estimator_unavailable');

console.log('PASS test_pose_estimator_adapters');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scratch\test_pose_estimator_adapters.mjs
```

Expected: FAIL with `Cannot find module '../js/PoseEstimatorAdapters.js'`.

- [ ] **Step 3: Implement safe adapter registry**

Create `js/PoseEstimatorAdapters.js`:

```js
function unavailableAdapter({ id, label, sourceTypes }) {
  return {
    id,
    label,
    sourceTypes,
    isAvailable() {
      return false;
    },
    async estimateFrame() {
      return { ok: false, reason: 'pose_estimator_unavailable', adapterId: id };
    }
  };
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
  if (!poseLandmarker) {
    return unavailableAdapter({
      id: 'mediapipe_pose',
      label: 'MediaPipe Pose',
      sourceTypes: ['video', 'webcam']
    });
  }
  return {
    id: 'mediapipe_pose',
    label: 'MediaPipe Pose',
    sourceTypes: ['video', 'webcam'],
    isAvailable() {
      return true;
    },
    async estimateFrame(videoElement, timestampMs = performance.now()) {
      const result = await poseLandmarker.detectForVideo(videoElement, timestampMs);
      return { ok: true, adapterId: 'mediapipe_pose', raw: result, timestampMs };
    }
  };
}

export function createMoveNetPoseAdapter({ detector = null } = {}) {
  if (!detector) {
    return unavailableAdapter({
      id: 'movenet',
      label: 'MoveNet',
      sourceTypes: ['video', 'webcam']
    });
  }
  return {
    id: 'movenet',
    label: 'MoveNet',
    sourceTypes: ['video', 'webcam'],
    isAvailable() {
      return true;
    },
    async estimateFrame(input, timestampMs = performance.now()) {
      const result = await detector.estimatePoses(input);
      return { ok: true, adapterId: 'movenet', raw: result, timestampMs };
    }
  };
}

export function createYoloPoseAdapter({ detector = null } = {}) {
  if (!detector) {
    return unavailableAdapter({
      id: 'yolo_pose',
      label: 'YOLO Pose',
      sourceTypes: ['video']
    });
  }
  return {
    id: 'yolo_pose',
    label: 'YOLO Pose',
    sourceTypes: ['video'],
    isAvailable() {
      return true;
    },
    async estimateFrame(input, timestampMs = performance.now()) {
      const result = await detector.detect(input);
      return { ok: true, adapterId: 'yolo_pose', raw: result, timestampMs };
    }
  };
}
```

- [ ] **Step 4: Run test**

Run:

```powershell
node .\scratch\test_pose_estimator_adapters.mjs
```

Expected: `PASS test_pose_estimator_adapters`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add js/PoseEstimatorAdapters.js scratch/test_pose_estimator_adapters.mjs
git commit -m "feat: add pose estimator adapter registry"
```

### Task 4: Motion Cycle Detector

**Files:**
- Create: `scratch/test_motion_cycle_detector.mjs`
- Create: `js/MotionCycleDetector.js`

- [ ] **Step 1: Write the failing test**

Create `scratch/test_motion_cycle_detector.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SkeletonSequenceAdapter } from '../js/SkeletonSequenceAdapter.js';
import { CYCLE_PHASES } from '../js/MotionCaptureTypes.js';
import { MotionCycleDetector } from '../js/MotionCycleDetector.js';

const adapter = new SkeletonSequenceAdapter({ sourceId: 'walk_reference_001' });
const { sequence } = adapter.loadFromText(readFileSync('motions/capture_samples/walk_reference_001.json', 'utf8'));

const detector = new MotionCycleDetector();
detector.setLoopRange(0, 960);
assert.deepEqual(detector.getLoop(), { startMs: 0, endMs: 960, durationMs: 960 });

const seeded = detector.seedEvenWalkPhases(sequence);
assert.equal(seeded.ok, true);
assert.equal(Object.keys(detector.getPhaseMarkers()).length, CYCLE_PHASES.length);
assert.equal(detector.getPhaseMarkers().contact_left.timeMs, 0);
assert.equal(detector.getPhaseMarkers().up_right.timeMs, 840);

const manual = detector.setPhaseMarker('passing_left', 260, sequence);
assert.equal(manual.ok, true);
assert.equal(detector.getPhaseMarkers().passing_left.frameIndex, 2);

const unknown = detector.setPhaseMarker('float_spin', 260, sequence);
assert.equal(unknown.ok, false);
assert.equal(unknown.reason, 'unknown_phase');

const cycleFrames = detector.extractCycleFrames(sequence);
assert.equal(cycleFrames.length, 9);
assert.equal(cycleFrames[0].timeMs, 0);
assert.equal(cycleFrames.at(-1).timeMs, 960);

console.log('PASS test_motion_cycle_detector');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scratch\test_motion_cycle_detector.mjs
```

Expected: FAIL with `Cannot find module '../js/MotionCycleDetector.js'`.

- [ ] **Step 3: Implement detector**

Create `js/MotionCycleDetector.js`:

```js
import {
  CYCLE_PHASES,
  createEmptyCycleMarkers,
  isValidCyclePhase
} from './MotionCaptureTypes.js';

function nearestFrame(sequence, timeMs) {
  return sequence.frames.reduce((best, frame) => {
    return Math.abs(frame.timeMs - timeMs) < Math.abs(best.timeMs - timeMs) ? frame : best;
  }, sequence.frames[0]);
}

export class MotionCycleDetector {
  constructor() {
    this.loop = { startMs: 0, endMs: 0, durationMs: 0 };
    this.phaseMarkers = createEmptyCycleMarkers();
  }

  setLoopRange(startMs, endMs) {
    const start = Number(startMs);
    const end = Number(endMs);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return { ok: false, reason: 'invalid_loop_range' };
    }
    this.loop = { startMs: start, endMs: end, durationMs: end - start };
    return { ok: true, loop: this.getLoop() };
  }

  getLoop() {
    return { ...this.loop };
  }

  getPhaseMarkers() {
    return Object.fromEntries(
      Object.entries(this.phaseMarkers).map(([phase, marker]) => [
        phase,
        marker ? { ...marker } : null
      ])
    );
  }

  setPhaseMarker(phase, timeMs, sequence) {
    if (!isValidCyclePhase(phase)) {
      return { ok: false, reason: 'unknown_phase', phase };
    }
    const frame = nearestFrame(sequence, Number(timeMs));
    const marker = { timeMs: frame.timeMs, frameIndex: frame.frameIndex };
    this.phaseMarkers[phase] = marker;
    return { ok: true, phase, marker };
  }

  seedEvenWalkPhases(sequence) {
    if (this.loop.durationMs <= 0) {
      const first = sequence.frames[0];
      const last = sequence.frames[sequence.frames.length - 1];
      this.setLoopRange(first.timeMs, last.timeMs);
    }
    const stepMs = this.loop.durationMs / CYCLE_PHASES.length;
    for (const [index, phase] of CYCLE_PHASES.entries()) {
      this.setPhaseMarker(phase, this.loop.startMs + stepMs * index, sequence);
    }
    return { ok: true, phaseMarkers: this.getPhaseMarkers() };
  }

  extractCycleFrames(sequence) {
    return sequence.frames.filter((frame) => {
      return frame.timeMs >= this.loop.startMs && frame.timeMs <= this.loop.endMs;
    });
  }
}
```

- [ ] **Step 4: Run test**

Run:

```powershell
node .\scratch\test_motion_cycle_detector.mjs
```

Expected: `PASS test_motion_cycle_detector`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add js/MotionCycleDetector.js scratch/test_motion_cycle_detector.mjs
git commit -m "feat: add motion cycle detector"
```

### Task 5: Motion Clip Exporter

**Files:**
- Create: `scratch/test_motion_clip_exporter.mjs`
- Create: `js/MotionClipExporter.js`

- [ ] **Step 1: Write the failing test**

Create `scratch/test_motion_clip_exporter.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SkeletonSequenceAdapter } from '../js/SkeletonSequenceAdapter.js';
import { MotionCycleDetector } from '../js/MotionCycleDetector.js';
import { exportMotionClip } from '../js/MotionClipExporter.js';

const adapter = new SkeletonSequenceAdapter({ sourceId: 'walk_reference_001' });
const { sequence } = adapter.loadFromText(readFileSync('motions/capture_samples/walk_reference_001.json', 'utf8'));
const detector = new MotionCycleDetector();
detector.setLoopRange(0, 960);
detector.seedEvenWalkPhases(sequence);

const clip = exportMotionClip({
  id: 'walk_cycle_001',
  label: 'Walk Cycle 001',
  sequence,
  detector,
  source: {
    type: 'skeleton_json',
    adapter: 'SkeletonSequenceAdapter',
    sourceId: 'walk_reference_001'
  },
  retargetHints: {
    strideScale: 1.2,
    armSwingScale: 0.8,
    hipBobScale: 1.1,
    smoothing: 0.4
  }
});

assert.equal(clip.schemaVersion, 1);
assert.equal(clip.kind, 'motion_clip_v1');
assert.equal(clip.id, 'walk_cycle_001');
assert.equal(clip.loop.durationMs, 960);
assert.equal(clip.keyPoses.length, 8);
assert.equal(clip.keyPoses[0].phase, 'contact_left');
assert.equal(clip.keyPoses[0].landmarks.hips.y, 1.02);
assert.equal(clip.retargetHints.strideScale, 1.2);

const text = JSON.stringify(clip, null, 2);
assert.match(text, /"kind": "motion_clip_v1"/);
assert.match(text, /"contact_left"/);

console.log('PASS test_motion_clip_exporter');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scratch\test_motion_clip_exporter.mjs
```

Expected: FAIL with `Cannot find module '../js/MotionClipExporter.js'`.

- [ ] **Step 3: Implement exporter**

Create `js/MotionClipExporter.js`:

```js
import {
  CYCLE_PHASES,
  MOTION_CLIP_SCHEMA_VERSION
} from './MotionCaptureTypes.js';

function cloneLandmarks(landmarks) {
  return Object.fromEntries(
    Object.entries(landmarks).map(([name, value]) => [name, { ...value }])
  );
}

export function exportMotionClip({
  id,
  label,
  sequence,
  detector,
  source,
  retargetHints = {}
}) {
  const loop = detector.getLoop();
  const markers = detector.getPhaseMarkers();
  const framesByIndex = new Map(sequence.frames.map((frame) => [frame.frameIndex, frame]));
  const phases = {};
  const keyPoses = [];

  for (const phase of CYCLE_PHASES) {
    const marker = markers[phase];
    if (!marker) {
      continue;
    }
    const frame = framesByIndex.get(marker.frameIndex);
    phases[phase] = { ...marker };
    keyPoses.push({
      phase,
      timeMs: marker.timeMs,
      frameIndex: marker.frameIndex,
      landmarks: cloneLandmarks(frame.landmarks)
    });
  }

  return {
    schemaVersion: MOTION_CLIP_SCHEMA_VERSION,
    kind: 'motion_clip_v1',
    id,
    label,
    source,
    loop,
    phases,
    keyPoses,
    retargetHints: {
      strideScale: Number(retargetHints.strideScale ?? 1),
      armSwingScale: Number(retargetHints.armSwingScale ?? 1),
      hipBobScale: Number(retargetHints.hipBobScale ?? 1),
      smoothing: Number(retargetHints.smoothing ?? 0.35)
    }
  };
}
```

- [ ] **Step 4: Run test**

Run:

```powershell
node .\scratch\test_motion_clip_exporter.mjs
```

Expected: `PASS test_motion_clip_exporter`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add js/MotionClipExporter.js scratch/test_motion_clip_exporter.mjs
git commit -m "feat: add motion clip exporter"
```

### Task 6: Alicia Motion Preview Adapter

**Files:**
- Create: `js/AliciaMotionPreviewAdapter.js`
- Modify: `scratch/test_motion_clip_exporter.mjs`

- [ ] **Step 1: Extend exporter test with preview contract**

Append this code to `scratch/test_motion_clip_exporter.mjs` before the final `console.log`:

```js
import { AliciaMotionPreviewAdapter } from '../js/AliciaMotionPreviewAdapter.js';

const calls = [];
const preview = new AliciaMotionPreviewAdapter({
  mascot: {
    enableHumanization(config) {
      calls.push(['enableHumanization', config]);
    },
    motion: {
      play(name) {
        calls.push(['motion.play', name]);
      }
    }
  }
});

const previewResult = preview.previewClip(clip);
assert.equal(previewResult.ok, true);
assert.deepEqual(calls[0], ['enableHumanization', { profile: 'alicia', level: 2 }]);
assert.deepEqual(calls[1], ['motion.play', 'walk_cycle']);

const badPreview = preview.previewClip({ kind: 'pose_preset' });
assert.equal(badPreview.ok, false);
assert.equal(badPreview.reason, 'unsupported_clip');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scratch\test_motion_clip_exporter.mjs
```

Expected: FAIL with `Cannot find module '../js/AliciaMotionPreviewAdapter.js'`.

- [ ] **Step 3: Implement preview adapter**

Create `js/AliciaMotionPreviewAdapter.js`:

```js
export class AliciaMotionPreviewAdapter {
  constructor({ mascot } = {}) {
    this.mascot = mascot;
  }

  previewClip(clip) {
    if (!clip || clip.kind !== 'motion_clip_v1') {
      return { ok: false, reason: 'unsupported_clip' };
    }
    if (!this.mascot) {
      return { ok: false, reason: 'missing_mascot' };
    }
    if (typeof this.mascot.enableHumanization === 'function') {
      this.mascot.enableHumanization({ profile: 'alicia', level: 2 });
    }
    if (this.mascot.motion && typeof this.mascot.motion.play === 'function') {
      this.mascot.motion.play('walk_cycle');
    }
    return { ok: true, clipId: clip.id };
  }
}
```

- [ ] **Step 4: Run test**

Run:

```powershell
node .\scratch\test_motion_clip_exporter.mjs
```

Expected: `PASS test_motion_clip_exporter`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add js/AliciaMotionPreviewAdapter.js scratch/test_motion_clip_exporter.mjs
git commit -m "feat: add alicia motion clip preview adapter"
```

### Task 7: Motion Capture Lab Page Contract

**Files:**
- Create: `scratch/test_motion_capture_lab.mjs`
- Create: `motion_capture_lab.html`

- [ ] **Step 1: Write failing page contract test**

Create `scratch/test_motion_capture_lab.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('motion_capture_lab.html', 'utf8');

const requiredIds = [
  'captureSourceType',
  'captureVideoInput',
  'captureWebcamButton',
  'captureSkeletonJsonInput',
  'captureVrmaInput',
  'btnLoadSampleSkeleton',
  'captureStatus',
  'videoPreview',
  'skeletonPreviewCanvas',
  'cycleStartMs',
  'cycleEndMs',
  'btnSeedCyclePhases',
  'phase_contact_left',
  'phase_down_left',
  'phase_passing_left',
  'phase_up_left',
  'phase_contact_right',
  'phase_down_right',
  'phase_passing_right',
  'phase_up_right',
  'aliciaPreview',
  'btnPreviewWalkCycle',
  'btnExportMotionClip',
  'motionClipOutput'
];

for (const id of requiredIds) {
  assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
}

const requiredImports = [
  './js/MotionCaptureTypes.js',
  './js/SkeletonSequenceAdapter.js',
  './js/PoseEstimatorAdapters.js',
  './js/MotionCycleDetector.js',
  './js/MotionClipExporter.js',
  './js/AliciaMotionPreviewAdapter.js',
  './js/VrmMascot.js'
];

for (const specifier of requiredImports) {
  assert.ok(html.includes(specifier), `missing import ${specifier}`);
}

assert.match(html, /fetch\('motions\/capture_samples\/walk_reference_001\.json'\)/);
assert.match(html, /adapter\.loadFromText/);
assert.match(html, /detector\.seedEvenWalkPhases/);
assert.match(html, /exportMotionClip/);
assert.match(html, /previewAdapter\.previewClip/);
assert.doesNotMatch(html, /mascot\.moveTo/);
assert.doesNotMatch(html, /SceneObjectAdapter/);

console.log('PASS test_motion_capture_lab');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scratch\test_motion_capture_lab.mjs
```

Expected: FAIL because `motion_capture_lab.html` does not exist.

- [ ] **Step 3: Build the lab page**

Create `motion_capture_lab.html` with these sections and module imports:

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Alicia Motion Capture Lab</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #0b1020; color: #e7eefc; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { display: grid; grid-template-rows: 56px 1fr; }
    header { display: flex; align-items: center; gap: 12px; padding: 0 20px; border-bottom: 1px solid rgba(148, 163, 184, 0.25); background: #101827; }
    h1 { font-size: 18px; margin: 0; }
    .app { min-height: 0; display: grid; grid-template-columns: 320px minmax(360px, 1fr) 360px; }
    aside, main { min-height: 0; overflow: auto; border-right: 1px solid rgba(148, 163, 184, 0.22); }
    aside, .panel { padding: 16px; }
    label { display: block; margin: 12px 0 6px; color: #aebbd3; font-size: 13px; }
    select, input, button, textarea { width: 100%; box-sizing: border-box; border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 8px; background: #121b2d; color: #e7eefc; padding: 9px 10px; }
    button { cursor: pointer; font-weight: 700; }
    button.primary { background: #1f8a9b; border-color: #35d4e5; }
    video, canvas { width: 100%; border-radius: 8px; background: #050814; border: 1px solid rgba(148, 163, 184, 0.22); }
    #skeletonPreviewCanvas { height: 300px; }
    #aliciaPreview { height: 420px; border-radius: 8px; background: #07111f; }
    .phase-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .status { min-height: 42px; padding: 10px; border-radius: 8px; background: rgba(14, 165, 233, 0.12); color: #7dd3fc; }
    textarea { min-height: 260px; font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; font-size: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>Alicia Motion Capture Lab</h1>
    <span>M20.3 Capture → Cycle → Motion Clip</span>
  </header>
  <div class="app">
    <aside>
      <h2>Video Input</h2>
      <label for="captureSourceType">Source</label>
      <select id="captureSourceType">
        <option value="skeleton_json">Skeleton JSON</option>
        <option value="video">Video</option>
        <option value="webcam">Webcam</option>
        <option value="vrma">VRMA</option>
      </select>
      <label for="captureVideoInput">Video File</label>
      <input id="captureVideoInput" type="file" accept="video/*">
      <button id="captureWebcamButton" type="button">Start Webcam</button>
      <label for="captureSkeletonJsonInput">Skeleton JSON</label>
      <input id="captureSkeletonJsonInput" type="file" accept="application/json,.json">
      <label for="captureVrmaInput">VRMA</label>
      <input id="captureVrmaInput" type="file" accept=".vrma">
      <button id="btnLoadSampleSkeleton" class="primary" type="button">Load Sample Skeleton</button>
      <div id="captureStatus" class="status">Ready.</div>
      <video id="videoPreview" controls muted playsinline></video>
    </aside>
    <main class="panel">
      <h2>Skeleton Preview</h2>
      <canvas id="skeletonPreviewCanvas" width="720" height="420"></canvas>
      <h2>Cycle Detection</h2>
      <label for="cycleStartMs">Start</label>
      <input id="cycleStartMs" type="number" value="0">
      <label for="cycleEndMs">End</label>
      <input id="cycleEndMs" type="number" value="960">
      <button id="btnSeedCyclePhases" type="button">Seed Walk Phases</button>
      <div class="phase-grid">
        <input id="phase_contact_left" type="number" value="0">
        <input id="phase_down_left" type="number" value="120">
        <input id="phase_passing_left" type="number" value="240">
        <input id="phase_up_left" type="number" value="360">
        <input id="phase_contact_right" type="number" value="480">
        <input id="phase_down_right" type="number" value="600">
        <input id="phase_passing_right" type="number" value="720">
        <input id="phase_up_right" type="number" value="840">
      </div>
    </main>
    <aside>
      <h2>Alicia Preview</h2>
      <div id="aliciaPreview"></div>
      <button id="btnPreviewWalkCycle" type="button">Preview Walk Cycle</button>
      <h2>Export Motion Clip</h2>
      <button id="btnExportMotionClip" class="primary" type="button">Export Motion Clip</button>
      <textarea id="motionClipOutput" spellcheck="false"></textarea>
    </aside>
  </div>
  <script type="module">
    import { CYCLE_PHASES } from './js/MotionCaptureTypes.js';
    import { SkeletonSequenceAdapter } from './js/SkeletonSequenceAdapter.js';
    import {
      PoseEstimatorRegistry,
      createMediaPipePoseAdapter,
      createMoveNetPoseAdapter,
      createYoloPoseAdapter
    } from './js/PoseEstimatorAdapters.js';
    import { MotionCycleDetector } from './js/MotionCycleDetector.js';
    import { exportMotionClip } from './js/MotionClipExporter.js';
    import { AliciaMotionPreviewAdapter } from './js/AliciaMotionPreviewAdapter.js';
    import { VrmMascot } from './js/VrmMascot.js';

    const state = {
      sequence: null,
      detector: new MotionCycleDetector(),
      clip: null,
      mascot: null,
      previewAdapter: null
    };

    const registry = new PoseEstimatorRegistry();
    registry.register('mediapipe_pose', createMediaPipePoseAdapter());
    registry.register('movenet', createMoveNetPoseAdapter());
    registry.register('yolo_pose', createYoloPoseAdapter());

    const $ = (id) => document.getElementById(id);
    const status = (message) => { $('captureStatus').textContent = message; };

    function drawSkeleton(sequence) {
      const canvas = $('skeletonPreviewCanvas');
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#07111f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!sequence) return;
      const frame = sequence.frames[0];
      ctx.strokeStyle = '#35d4e5';
      ctx.fillStyle = '#f8fafc';
      for (const landmark of Object.values(frame.landmarks)) {
        const x = canvas.width * (0.5 + landmark.x);
        const y = canvas.height * (1 - landmark.y / 1.9);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function applyPhaseInputs() {
      for (const phase of CYCLE_PHASES) {
        const value = Number($(`phase_${phase}`).value);
        state.detector.setPhaseMarker(phase, value, state.sequence);
      }
    }

    function loadSequenceText(text) {
      const adapter = new SkeletonSequenceAdapter({ sourceId: 'motion_capture_lab' });
      const result = adapter.loadFromText(text);
      if (!result.ok) {
        status(`Skeleton load failed: ${result.reason}`);
        return;
      }
      state.sequence = result.sequence;
      $('cycleStartMs').value = String(result.sequence.frames[0].timeMs);
      $('cycleEndMs').value = String(result.sequence.frames.at(-1).timeMs);
      state.detector.setLoopRange(Number($('cycleStartMs').value), Number($('cycleEndMs').value));
      state.detector.seedEvenWalkPhases(state.sequence);
      for (const [phase, marker] of Object.entries(state.detector.getPhaseMarkers())) {
        $(`phase_${phase}`).value = String(marker.timeMs);
      }
      drawSkeleton(state.sequence);
      status(`Loaded ${result.sequence.label}: ${result.frameCount} frames`);
    }

    $('btnLoadSampleSkeleton').addEventListener('click', async () => {
      const response = await fetch('motions/capture_samples/walk_reference_001.json');
      loadSequenceText(await response.text());
    });

    $('captureSkeletonJsonInput').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (file) loadSequenceText(await file.text());
    });

    $('captureVideoInput').addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      $('videoPreview').src = URL.createObjectURL(file);
      status('Video loaded. Use Skeleton JSON export until a pose estimator is available in this browser.');
    });

    $('captureWebcamButton').addEventListener('click', async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      $('videoPreview').srcObject = stream;
      await $('videoPreview').play();
      status('Webcam active. Pose estimator adapter is ready when a detector is present on window.');
    });

    $('btnSeedCyclePhases').addEventListener('click', () => {
      if (!state.sequence) {
        status('Load a skeleton sequence first.');
        return;
      }
      state.detector.setLoopRange(Number($('cycleStartMs').value), Number($('cycleEndMs').value));
      state.detector.seedEvenWalkPhases(state.sequence);
      for (const [phase, marker] of Object.entries(state.detector.getPhaseMarkers())) {
        $(`phase_${phase}`).value = String(marker.timeMs);
      }
      status('Cycle phases seeded.');
    });

    $('btnExportMotionClip').addEventListener('click', () => {
      if (!state.sequence) {
        status('Load a skeleton sequence first.');
        return;
      }
      state.detector.setLoopRange(Number($('cycleStartMs').value), Number($('cycleEndMs').value));
      applyPhaseInputs();
      state.clip = exportMotionClip({
        id: 'walk_cycle_001',
        label: 'Walk Cycle 001',
        sequence: state.sequence,
        detector: state.detector,
        source: { type: 'skeleton_json', adapter: 'SkeletonSequenceAdapter', sourceId: state.sequence.id }
      });
      $('motionClipOutput').value = JSON.stringify(state.clip, null, 2);
      status('Motion clip exported.');
    });

    $('btnPreviewWalkCycle').addEventListener('click', () => {
      if (!state.clip) $('btnExportMotionClip').click();
      const result = state.previewAdapter?.previewClip(state.clip);
      status(result?.ok ? `Previewing ${state.clip.id}` : `Preview failed: ${result?.reason || 'missing_preview'}`);
    });

    async function bootAliciaPreview() {
      state.mascot = new VrmMascot({ container: $('aliciaPreview') });
      await state.mascot.load();
      state.previewAdapter = new AliciaMotionPreviewAdapter({ mascot: state.mascot });
    }

    bootAliciaPreview().catch((error) => status(`Alicia preview failed: ${error.message}`));
  </script>
</body>
</html>
```

- [ ] **Step 4: Run page contract test**

Run:

```powershell
node .\scratch\test_motion_capture_lab.mjs
```

Expected: `PASS test_motion_capture_lab`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add motion_capture_lab.html scratch/test_motion_capture_lab.mjs
git commit -m "feat: add motion capture lab page"
```

### Task 8: Browser Smoke Test

**Files:**
- Verify: `motion_capture_lab.html`

- [ ] **Step 1: Start local server if needed**

Run:

```powershell
python .\server.py
```

Expected: server listens on the existing local port used by the repo, typically `http://127.0.0.1:8765/`.

- [ ] **Step 2: Open the lab**

Open:

```text
http://127.0.0.1:8765/motion_capture_lab.html
```

Expected:
- Page title says `Alicia Motion Capture Lab`.
- No console error on first render.
- Left side has Video, Webcam, Skeleton JSON, VRMA inputs.
- Center canvas is visible without document-level scroll.
- Right side has Alicia preview and export controls.

- [ ] **Step 3: Load sample and export**

Actions:
- Click `Load Sample Skeleton`.
- Click `Seed Walk Phases`.
- Click `Export Motion Clip`.

Expected:
- Status says the sample loaded.
- Phase inputs show `0, 120, 240, 360, 480, 600, 720, 840`.
- `motionClipOutput` contains `"kind": "motion_clip_v1"` and `"id": "walk_cycle_001"`.

- [ ] **Step 4: Preview**

Action:
- Click `Preview Walk Cycle`.

Expected:
- Status says `Previewing walk_cycle_001`.
- Alicia preview does not throw a console error.
- Existing production pages are unchanged.

### Task 9: History And Regression Verification

**Files:**
- Modify: `history.md`

- [ ] **Step 1: Update history**

Add this bullet under the current `## 2026-06-17` section in `history.md`:

```markdown
- 新增 M20.3 Motion Capture Lab：建立 lab-only 捕捉流程與 Motion Clip v1 契約，先支援 deterministic Skeleton JSON -> Cycle Detection -> Key Pose Extraction -> Alicia Preview -> Export Motion Clip，並保留 Video/Webcam/VRMA 與 MediaPipe/MoveNet/YOLO Pose adapter 入口；不修改 `VrmMascot` core public API、不接 STEP/GIS、不新增 `mascot.moveTo()`。
```

- [ ] **Step 2: Run M20.3 tests**

Run:

```powershell
node .\scratch\test_motion_capture_types.mjs
node .\scratch\test_skeleton_sequence_adapter.mjs
node .\scratch\test_pose_estimator_adapters.mjs
node .\scratch\test_motion_cycle_detector.mjs
node .\scratch\test_motion_clip_exporter.mjs
node .\scratch\test_motion_capture_lab.mjs
```

Expected:

```text
PASS test_motion_capture_types
PASS test_skeleton_sequence_adapter
PASS test_pose_estimator_adapters
PASS test_motion_cycle_detector
PASS test_motion_clip_exporter
PASS test_motion_capture_lab
```

- [ ] **Step 3: Run existing M20 regression tests**

Run:

```powershell
node .\scratch\test_pose_training_lab.mjs
node .\scratch\test_human_motion_layer.mjs
node .\scratch\test_auto_director_lite.mjs
node .\scratch\test_showcase_pack.mjs
```

Expected: each command prints its existing `PASS ...` line.

- [ ] **Step 4: Run server and whitespace checks**

Run:

```powershell
python -m py_compile .\server.py
git diff --check
```

Expected:
- `python -m py_compile .\server.py` exits with code `0`.
- `git diff --check` prints no whitespace errors.

- [ ] **Step 5: Commit**

Run:

```powershell
git add history.md
git commit -m "docs: record motion capture lab contract"
```

## Final Verification Command Set

Run this complete set before claiming M20.3 is complete:

```powershell
node .\scratch\test_motion_capture_types.mjs
node .\scratch\test_skeleton_sequence_adapter.mjs
node .\scratch\test_pose_estimator_adapters.mjs
node .\scratch\test_motion_cycle_detector.mjs
node .\scratch\test_motion_clip_exporter.mjs
node .\scratch\test_motion_capture_lab.mjs
node .\scratch\test_pose_training_lab.mjs
node .\scratch\test_human_motion_layer.mjs
node .\scratch\test_auto_director_lite.mjs
node .\scratch\test_showcase_pack.mjs
python -m py_compile .\server.py
git diff --check
```

Expected:
- Every Node test prints `PASS ...`.
- Python compile exits with code `0`.
- `git diff --check` prints no output.

## Self-Review

Spec coverage:
- M20.3 is named Motion Capture Lab, not Video Skeleton Trainer.
- Inputs are represented: Video, Webcam, Skeleton JSON, VRMA.
- Skeleton JSON is the first complete capture-to-clip path.
- MediaPipe, MoveNet, and YOLO Pose have explicit adapter contracts.
- Pipeline is Video/Webcam/Skeleton source -> Pose Estimation or normalized frames -> Cycle Detection -> Key Pose Extraction -> Motion Clip -> Alicia Preview.
- M20.4 and M20.5 are deferred by contract, not mixed into this implementation.

Type consistency:
- `CYCLE_PHASES`, `createEmptyCycleMarkers()`, `SkeletonSequenceAdapter`, `MotionCycleDetector`, `exportMotionClip()`, and `AliciaMotionPreviewAdapter` are named consistently across tests, implementation snippets, and page code.
- Exported clip uses `kind: "motion_clip_v1"` and `schemaVersion: 1` everywhere.
- Phase DOM ids use `phase_${phase}`, matching the `CYCLE_PHASES` values.

Commit hygiene:
- Do not stage `scratch/download_external_vrmas.py`.
- Do not stage line-ending noise under `examples/m6_7_vrma_samples/review/`.
- Do not stage user-tuned pose files unless the user explicitly asks to include them.
