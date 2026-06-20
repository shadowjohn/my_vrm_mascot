# GVHMR Alicia Rest Pose Offset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal SMPL A-pose to Alicia VRM T-pose rest offset for direct GVHMR skeleton preview.

**Architecture:** Keep the existing direct skeleton pose copier. Add a hard-coded rest offset table in `AliciaMotionPreviewAdapter.js`, and only merge it into base rotations when `directSkeletonPose` is true.

**Tech Stack:** Plain JavaScript ES modules, existing assert-based scratch tests.

---

### Task 1: Direct Skeleton Rest Offset

**Files:**
- Modify: `js/AliciaMotionPreviewAdapter.js`
- Test: `scratch/test_motion_clip_exporter.mjs`

- [ ] **Step 1: Add a failing contract check**

Add checks near the existing GVHMR direct skeleton assertions in `scratch/test_motion_clip_exporter.mjs`:

```js
import { readFileSync } from 'fs';

const previewAdapterSource = readFileSync('js/AliciaMotionPreviewAdapter.js', 'utf8');
assert.match(previewAdapterSource, /ALICIA_SMPL_REST_OFFSETS/);
assert.match(previewAdapterSource, /hints\.directSkeletonPose\s*\?\s*applyAliciaSmplRestOffsetsToBase/);
```

- [ ] **Step 2: Run test to verify current state**

Run:

```powershell
node scratch\test_motion_clip_exporter.mjs
```

Expected before implementation: FAIL because `ALICIA_SMPL_REST_OFFSETS` is not defined.

- [ ] **Step 3: Add minimal implementation**

Add this after `DEFAULT_BASE_ROTATIONS` in `js/AliciaMotionPreviewAdapter.js`:

```js
const ALICIA_SMPL_REST_OFFSETS = Object.freeze({
  leftShoulder: { x: 0, y: 0, z: 4 },
  rightShoulder: { x: 0, y: 0, z: -4 },
  leftUpperArm: { x: 0, y: 0, z: 14 },
  rightUpperArm: { x: 0, y: 0, z: -14 },
  leftUpperLeg: { x: 0, y: 0, z: -3 },
  rightUpperLeg: { x: 0, y: 0, z: 3 },
  leftFoot: { x: -4, y: 0, z: 0 },
  rightFoot: { x: -4, y: 0, z: 0 }
});

function applyAliciaSmplRestOffsetsToBase(baseRotations = {}) {
  return Object.fromEntries(
    Object.entries(baseRotations).map(([boneName, rotation]) => [
      boneName,
      addDegrees(rotation, ALICIA_SMPL_REST_OFFSETS[boneName])
    ])
  );
}
```

Then in both animation builders, change base rotation setup to:

```js
const hints = retargetHints(clip);
const baseRotations = hints.directSkeletonPose
  ? applyAliciaSmplRestOffsetsToBase(getBaseRotations(mascot))
  : getBaseRotations(mascot);
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
node scratch\test_motion_clip_exporter.mjs
```

Expected: PASS.

- [ ] **Step 5: Run whitespace check**

Run:

```powershell
git diff --check -- js/AliciaMotionPreviewAdapter.js scratch/test_motion_clip_exporter.mjs
```

Expected: no whitespace errors.
