# M20.4 World-Grounded Orientation Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 1 of M20.4: a fixture-first world-motion contract, optional GVHMR/WHAM subprocess stubs, and a pure JS fusion layer that can add root yaw/translation/contact metadata without replacing MotionBERT limb retargeting.

**Architecture:** Keep MotionBERT/AliciaSkeletonRetargeter as the limb source. Add `AliciaWorldMotionAdapter` to normalize provider output and `AliciaWorldMotionFusion` to merge world yaw/translation/contact into an Alicia custom animation payload. GVHMR/WHAM scripts remain optional stubs that support fixture output and typed missing-dependency responses.

**Tech Stack:** ESM JavaScript modules, Node `assert` scratch tests, Python 3 JSON CLI stubs, existing PowerShell/git workflow.

---

### Task 1: World Motion Adapter Contract

**Files:**
- Create: `js/AliciaWorldMotionAdapter.js`
- Test: `scratch/test_alicia_world_motion_adapter.mjs`

- [ ] **Step 1: Write the failing adapter test**

Create `scratch/test_alicia_world_motion_adapter.mjs`:

```js
import assert from 'node:assert/strict';
import {
  findNearestWorldMotionFrame,
  normalizeWorldMotion
} from '../js/AliciaWorldMotionAdapter.js';

const normalized = normalizeWorldMotion({
  ok: true,
  source: 'gvhmr',
  frames: [
    {
      t: '0.033',
      bodyYawDegrees: '-82.5',
      rootTranslation: { x: '0.02', y: 'bad', z: '0.14' },
      footContact: { left: 0.9, right: 0.2 },
      confidence: 1.4
    },
    {
      t: 0.1,
      bodyYawDegrees: -80,
      rootTranslation: { x: 0.03, y: 0, z: 0.2 },
      footContact: { left: false, right: true },
      confidence: 0.75
    }
  ],
  metadata: { staticCamera: true }
});

assert.equal(normalized.ok, true);
assert.equal(normalized.source, 'gvhmr');
assert.equal(normalized.frames.length, 2);
assert.deepEqual(normalized.frames[0].rootTranslation, { x: 0.02, y: 0, z: 0.14 });
assert.deepEqual(normalized.frames[0].footContact, { left: true, right: false });
assert.equal(normalized.frames[0].confidence, 1);
assert.equal(findNearestWorldMotionFrame(normalized.frames, 0.09).t, 0.1);

const missing = normalizeWorldMotion({ ok: false, source: 'gvhmr', reason: 'missing_binary' });
assert.equal(missing.ok, false);
assert.equal(missing.reason, 'missing_binary');
assert.deepEqual(missing.frames, []);

const invalid = normalizeWorldMotion({ ok: true, source: 'unknown', frames: [{ t: 'nope' }] });
assert.equal(invalid.ok, false);
assert.equal(invalid.reason, 'missing_valid_frames');

console.log('PASS test_alicia_world_motion_adapter');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scratch\test_alicia_world_motion_adapter.mjs`

Expected: FAIL with module not found for `AliciaWorldMotionAdapter.js`.

- [ ] **Step 3: Implement the adapter**

Create `js/AliciaWorldMotionAdapter.js` with:

```js
const VALID_SOURCES = new Set(['gvhmr', 'wham', 'fixture', 'unknown']);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeFootContact(contact = {}) {
  return {
    left: contact.left === true || Number(contact.left) >= 0.5,
    right: contact.right === true || Number(contact.right) >= 0.5
  };
}

function normalizeRootTranslation(rootTranslation = {}) {
  return {
    x: finiteNumber(rootTranslation.x),
    y: finiteNumber(rootTranslation.y),
    z: finiteNumber(rootTranslation.z)
  };
}

function normalizeFrame(frame) {
  const t = finiteNumber(frame?.t, NaN);
  if (!Number.isFinite(t)) {
    return null;
  }
  return {
    t,
    bodyYawDegrees: clamp(finiteNumber(frame.bodyYawDegrees), -180, 180),
    rootTranslation: normalizeRootTranslation(frame.rootTranslation),
    footContact: normalizeFootContact(frame.footContact),
    confidence: clamp(finiteNumber(frame.confidence, 0), 0, 1)
  };
}

export function normalizeWorldMotion(payload = {}) {
  const source = VALID_SOURCES.has(payload.source) ? payload.source : 'unknown';
  if (payload.ok === false) {
    return {
      ok: false,
      source,
      reason: String(payload.reason || 'provider_failed'),
      frames: [],
      metadata: payload.metadata || {}
    };
  }

  const frames = Array.isArray(payload.frames)
    ? payload.frames.map(normalizeFrame).filter(Boolean).sort((a, b) => a.t - b.t)
    : [];
  if (!frames.length) {
    return { ok: false, source, reason: 'missing_valid_frames', frames: [], metadata: payload.metadata || {} };
  }
  return { ok: true, source, frames, metadata: payload.metadata || {} };
}

export function findNearestWorldMotionFrame(frames, timeSeconds) {
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

Run: `node .\scratch\test_alicia_world_motion_adapter.mjs`

Expected: `PASS test_alicia_world_motion_adapter`

### Task 2: World Motion Fusion

**Files:**
- Create: `js/AliciaWorldMotionFusion.js`
- Test: `scratch/test_alicia_world_motion_fusion.mjs`

- [ ] **Step 1: Write the failing fusion test**

Create `scratch/test_alicia_world_motion_fusion.mjs`:

```js
import assert from 'node:assert/strict';
import { fuseAliciaWorldMotion } from '../js/AliciaWorldMotionFusion.js';

const pose = {
  name: 'pose_copier_frame',
  bones: {
    hips: [{ time_ms: 0, rot: [0, 0, 0, 1] }],
    leftUpperArm: [{ time_ms: 0, rot: [0.1, 0, 0, 0.99] }]
  },
  hips_position: [{ time_ms: 0, pos: [0, 0, 0] }],
  world_motion: { existing: true }
};

const fused = fuseAliciaWorldMotion(pose, {
  ok: true,
  source: 'fixture',
  frames: [{
    t: 0.5,
    bodyYawDegrees: -90,
    rootTranslation: { x: 0.2, y: 0, z: 1.5 },
    footContact: { left: true, right: false },
    confidence: 0.8
  }]
}, { timeSeconds: 0.52, rootScale: 0.1, yawSmoothing: 0.5 });

assert.notEqual(fused, pose);
assert.deepEqual(fused.bones.leftUpperArm, pose.bones.leftUpperArm);
assert.equal(fused.world_motion.source, 'fixture');
assert.equal(fused.world_motion.applied, true);
assert.equal(fused.world_motion.footContact.left, true);
assert.ok(Math.abs(fused.world_motion.bodyYawDegrees + 45) < 0.001);
assert.deepEqual(fused.hips_position[0].pos, [0.02, 0, 0.15]);

const unchanged = fuseAliciaWorldMotion(pose, { ok: false, frames: [] });
assert.deepEqual(unchanged, pose);

const lowConfidence = fuseAliciaWorldMotion(pose, {
  ok: true,
  source: 'fixture',
  frames: [{
    t: 0,
    bodyYawDegrees: 120,
    rootTranslation: { x: 1, y: 0, z: 1 },
    footContact: { left: true, right: true },
    confidence: 0.1
  }]
}, { minConfidence: 0.35 });
assert.deepEqual(lowConfidence, pose);

console.log('PASS test_alicia_world_motion_fusion');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scratch\test_alicia_world_motion_fusion.mjs`

Expected: FAIL with module not found for `AliciaWorldMotionFusion.js`.

- [ ] **Step 3: Implement the fusion helper**

Create `js/AliciaWorldMotionFusion.js` with:

```js
import { findNearestWorldMotionFrame, normalizeWorldMotion } from './AliciaWorldMotionAdapter.js';

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothYaw(value, smoothing) {
  return finiteNumber(value) * clamp(finiteNumber(smoothing, 1), 0, 1);
}

function scaledRootPosition(rootTranslation, rootScale) {
  const scale = finiteNumber(rootScale, 0.08);
  return [
    finiteNumber(rootTranslation?.x) * scale,
    finiteNumber(rootTranslation?.y) * scale,
    finiteNumber(rootTranslation?.z) * scale
  ];
}

export function fuseAliciaWorldMotion(poseAnimation, worldMotionPayload, options = {}) {
  const worldMotion = normalizeWorldMotion(worldMotionPayload);
  if (!poseAnimation || !worldMotion.ok) {
    return poseAnimation;
  }
  const frame = findNearestWorldMotionFrame(worldMotion.frames, finiteNumber(options.timeSeconds, 0));
  const minConfidence = finiteNumber(options.minConfidence, 0.35);
  if (!frame || frame.confidence < minConfidence) {
    return poseAnimation;
  }

  const bodyYawDegrees = smoothYaw(frame.bodyYawDegrees, options.yawSmoothing ?? 1);
  return {
    ...poseAnimation,
    hips_position: [{
      time_ms: 0,
      pos: scaledRootPosition(frame.rootTranslation, options.rootScale)
    }],
    world_motion: {
      applied: true,
      source: worldMotion.source,
      frameTimeSeconds: frame.t,
      bodyYawDegrees,
      rootTranslation: frame.rootTranslation,
      footContact: frame.footContact,
      confidence: frame.confidence
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\scratch\test_alicia_world_motion_fusion.mjs`

Expected: `PASS test_alicia_world_motion_fusion`

### Task 3: GVHMR/WHAM CLI Stubs

**Files:**
- Create: `scripts/gvhmr_lift.py`
- Create: `scripts/wham_lift.py`
- Test: `scratch/test_world_motion_cli_stubs.mjs`

- [ ] **Step 1: Write the failing CLI stub test**

Create `scratch/test_world_motion_cli_stubs.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(scriptName, args = []) {
  const result = spawnSync('python', [join('scripts', scriptName), ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${scriptName} failed: ${result.stderr || result.stdout}`);
  return result;
}

const dir = mkdtempSync(join(tmpdir(), 'alicia-world-motion-'));
const fixture = join(dir, 'fixture.json');
const output = join(dir, 'output.json');
writeFileSync(fixture, JSON.stringify({
  ok: true,
  source: 'fixture',
  frames: [{
    t: 0.033,
    bodyYawDegrees: -82.5,
    rootTranslation: { x: 0.02, y: 0, z: 0.14 },
    footContact: { left: true, right: false },
    confidence: 0.78
  }]
}), 'utf8');

run('gvhmr_lift.py', ['--fixture-json', fixture, '--output-json', output, '--static-camera']);
const gvhmr = JSON.parse(readFileSync(output, 'utf8'));
assert.equal(gvhmr.ok, true);
assert.equal(gvhmr.source, 'gvhmr');
assert.equal(gvhmr.metadata.staticCamera, true);
assert.equal(gvhmr.frames[0].bodyYawDegrees, -82.5);

run('wham_lift.py', ['--fixture-json', fixture, '--output-json', output]);
const wham = JSON.parse(readFileSync(output, 'utf8'));
assert.equal(wham.ok, true);
assert.equal(wham.source, 'wham');
assert.equal(wham.frames[0].footContact.left, true);

run('gvhmr_lift.py', ['--video-path', 'missing.mp4', '--output-json', output]);
const missing = JSON.parse(readFileSync(output, 'utf8'));
assert.equal(missing.ok, false);
assert.equal(missing.source, 'gvhmr');
assert.equal(missing.reason, 'missing_dependency');

console.log('PASS test_world_motion_cli_stubs');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scratch\test_world_motion_cli_stubs.mjs`

Expected: FAIL because `scripts/gvhmr_lift.py` and `scripts/wham_lift.py` do not exist.

- [ ] **Step 3: Implement the CLI stubs**

Create both scripts with:

```python
import argparse
import json
from pathlib import Path


def write_json(path, payload):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def load_fixture(path, source, static_camera=False):
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    payload["source"] = source
    payload.setdefault("metadata", {})
    payload["metadata"]["staticCamera"] = bool(static_camera)
    return payload


def main():
    parser = argparse.ArgumentParser(description="Experimental world-motion provider stub.")
    parser.add_argument("--video-path", default="")
    parser.add_argument("--fixture-json", default="")
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--static-camera", action="store_true")
    args = parser.parse_args()

    source = "gvhmr"  # change to "wham" in wham_lift.py
    if args.fixture_json:
        output = load_fixture(args.fixture_json, source, args.static_camera)
    else:
        output = {
            "ok": False,
            "source": source,
            "reason": "missing_dependency",
            "frames": [],
            "metadata": {
                "videoPath": args.video_path,
                "staticCamera": bool(args.static_camera),
                "providerVersion": "experimental_stub"
            }
        }
    write_json(Path(args.output_json), output)


if __name__ == "__main__":
    main()
```

For `scripts/wham_lift.py`, set `source = "wham"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\scratch\test_world_motion_cli_stubs.mjs`

Expected: `PASS test_world_motion_cli_stubs`

### Task 4: Verification, History, Commit

**Files:**
- Modify: `history.md`

- [ ] **Step 1: Run focused tests**

Run:

```powershell
node .\scratch\test_alicia_world_motion_adapter.mjs
node .\scratch\test_alicia_world_motion_fusion.mjs
node .\scratch\test_world_motion_cli_stubs.mjs
node .\scratch\test_motion_clip_exporter.mjs
node .\scratch\test_motion_capture_lab.mjs
git diff --check
```

Expected:

- Each Node test prints its `PASS ...` line.
- `git diff --check` exits `0`, allowing Windows LF/CRLF warnings only.

- [ ] **Step 2: Update `history.md`**

Add under `## 2026-06-18`:

```md
- 完成 M20.4 Phase 1 World Motion Contract：
  - 新增 `AliciaWorldMotionAdapter` 與 `AliciaWorldMotionFusion`，先以 fixture-first contract 正規化 `bodyYawDegrees`、`rootTranslation`、`footContact` 與 `confidence`，並可把 root yaw/translation/contact metadata 融合進 Alicia pose payload。
  - 新增 `scripts/gvhmr_lift.py` / `scripts/wham_lift.py` experimental stub，缺少研究模型時回 typed `missing_dependency`，避免 Motion Capture Lab 被重型依賴阻塞。
  - 新增 `scratch/test_alicia_world_motion_adapter.mjs`、`scratch/test_alicia_world_motion_fusion.mjs`、`scratch/test_world_motion_cli_stubs.mjs` 鎖定 Phase 1 contract。
```

- [ ] **Step 3: Commit**

Run:

```powershell
git add -- docs/superpowers/plans/2026-06-18-m20-4-world-grounded-orientation-adapter.md history.md js/AliciaWorldMotionAdapter.js js/AliciaWorldMotionFusion.js scripts/gvhmr_lift.py scripts/wham_lift.py scratch/test_alicia_world_motion_adapter.mjs scratch/test_alicia_world_motion_fusion.mjs scratch/test_world_motion_cli_stubs.mjs
git commit -m "feat: add world motion adapter contract"
git -c url.https://github.com/.insteadOf=git@github.com: pull --rebase origin codex/m20-4-world-grounded-orientation-adapter
git -c url.https://github.com/.insteadOf=git@github.com: push origin codex/m20-4-world-grounded-orientation-adapter
```

Expected: branch pushes cleanly.
