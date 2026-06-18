# M20.4 World-Grounded Orientation Adapter Spec

## Goal

M20.4 adds an experimental world-motion layer for Alicia motion capture without replacing the current MotionBERT limb pipeline.

MotionBERT remains responsible for Alicia-local limb intent:

```text
video -> 2D pose / MotionBERT -> AliciaSkeletonRetargeter -> Alicia limb motion
```

GVHMR and WHAM are evaluated as optional world-grounded providers for data Alicia currently lacks:

```js
{
  bodyYawDegrees,
  rootTranslation,
  footContact,
  confidence
}
```

The final preview/export pipeline should combine the two streams:

```text
Alicia limbs = MotionBERT / AliciaSkeletonRetargeter
Alicia root, hips, yaw, foot contact = GVHMR or WHAM via WorldMotionAdapter
```

## External Reference Notes

GVHMR is a world-grounded human motion recovery method based on Gravity-View coordinates. Its official repository exposes demo scripts under `tools/demo`, and documents `-s` as the static-camera path that skips visual odometry.

WHAM is a world-grounded 3D human motion method focused on global trajectory and contact-aware trajectory refinement, making it a useful comparison adapter for foot sliding and trajectory stability.

These projects stay optional and experimental. M20.4 must not make the main Motion Capture Lab unusable when GVHMR or WHAM are absent.

Reference links:

- GVHMR repository: https://github.com/zju3dv/GVHMR
- GVHMR project page: https://zju3dv.github.io/gvhmr/
- WHAM repository: https://github.com/yohanshin/WHAM
- WHAM project page: https://wham.is.tue.mpg.de/

## Non-Goals

- Do not replace MotionBERT for limb pose.
- Do not implement full SMPL-to-VRM retargeting in M20.4.
- Do not require GVHMR or WHAM checkpoints for normal app startup.
- Do not lock feet by mutating Alicia limb poses directly in Phase 1.
- Do not export GVHMR or WHAM raw model outputs as public Alicia runtime data.

## Common World Motion Contract

All world-motion providers normalize into one shared JSON shape:

```js
{
  ok: true,
  source: "gvhmr",
  frames: [
    {
      t: 0.033,
      bodyYawDegrees: -82.5,
      rootTranslation: { x: 0.02, y: 0.0, z: 0.14 },
      footContact: {
        left: true,
        right: false
      },
      confidence: 0.78
    }
  ],
  metadata: {
    staticCamera: true,
    providerVersion: "experimental"
  }
}
```

Failure responses use the same adapter surface:

```js
{
  ok: false,
  source: "gvhmr",
  reason: "missing_binary",
  frames: []
}
```

Field rules:

- `source` is one of `gvhmr`, `wham`, `fixture`, or `unknown`.
- `t` is seconds from the video/capture range start.
- `bodyYawDegrees` is Alicia root yaw in degrees, positive/negative following the existing Alicia preview convention.
- `rootTranslation` is a relative world-grounded translation vector in meters before Alicia scale conversion.
- `footContact.left/right` are booleans after provider confidence thresholding.
- `confidence` is clamped to `0..1`.
- Missing per-frame values are filled from the nearest valid value or defaulted conservatively.

## New Files

### `scripts/gvhmr_lift.py`

Experimental subprocess wrapper for GVHMR.

Phase 1 behavior:

- Defines CLI arguments and output schema only.
- Supports a fixture input mode for tests.
- Returns a typed missing-dependency response when GVHMR is not installed.

Later behavior:

- Calls the official GVHMR demo path.
- Supports static-camera mode by mapping to GVHMR `-s`.
- Converts provider output into the common world motion contract.

### `scripts/wham_lift.py`

Experimental subprocess wrapper for WHAM.

Phase 1 behavior:

- Defines CLI arguments and output schema only.
- Supports a fixture input mode for tests.
- Returns a typed missing-dependency response when WHAM is not installed.

Later behavior:

- Calls WHAM inference for custom videos after local dependency setup exists.
- Converts global trajectory, root orientation, and contact estimates into the common world motion contract.

### `js/AliciaWorldMotionAdapter.js`

Pure JavaScript normalizer for provider output.

Responsibilities:

- Validate provider JSON.
- Clamp confidence and numeric values.
- Normalize `t`, `bodyYawDegrees`, `rootTranslation`, and `footContact`.
- Provide nearest-frame lookup by time.
- Keep failure responses non-throwing for UI paths.

### `js/AliciaWorldMotionFusion.js`

Pure JavaScript fusion helper.

Responsibilities:

- Accept MotionBERT/Alicia limb pose output plus normalized world-motion frames.
- Smooth yaw over time.
- Scale root translation into Alicia preview units.
- Surface `footContact` as metadata for later foot-locking.
- Return unchanged limb pose if world motion is missing or low-confidence.

## Phase Plan

### Phase 1: Interface Contract

Implement only the stable contract and fixtures:

- Add `AliciaWorldMotionAdapter`.
- Add `AliciaWorldMotionFusion`.
- Add experimental CLI stubs for `gvhmr_lift.py` and `wham_lift.py`.
- Add tests:
  - `scratch/test_alicia_world_motion_adapter.mjs`
  - `scratch/test_alicia_world_motion_fusion.mjs`
- Keep Motion Capture Lab UI unchanged except for optional debug wiring if needed.

Acceptance:

- A fixture provider output normalizes to the common contract.
- Bad provider output returns `{ ok: false }` or empty frames without crashing.
- Fusion can apply `bodyYawDegrees`, `rootTranslation`, and `footContact` metadata to a pose payload.
- Without world motion, existing MotionBERT limb preview remains unchanged.

### Phase 2: GVHMR Adapter

Wire `scripts/gvhmr_lift.py` to a real local GVHMR checkout.

Acceptance:

- Static-camera video can run with visual odometry skipped.
- The adapter emits normalized frames with yaw, translation, contact, and confidence.
- Side-view clips can rotate Alicia root without using limb x-spread as a substitute for body yaw.

### Phase 3: WHAM Adapter

Add WHAM as a second provider for comparison.

Acceptance:

- WHAM emits the same normalized world motion contract.
- Compare GVHMR vs WHAM on:
  - foot sliding,
  - root trajectory stability,
  - side-view yaw stability.
- Keep provider selection explicit and reversible.

## Preview Fusion Strategy

The intended runtime shape is:

```js
const limbPose = motionBertRetargetedPose;
const worldMotion = gvhmrOrWhamWorldMotion;

alicia.root.rotation.y = smoothYaw(worldMotion.bodyYawDegrees);
alicia.root.position.z += scaleRootZ(worldMotion.rootTranslation.z);

if (worldMotion.footContact.left) {
  lockLeftFoot();
}

if (worldMotion.footContact.right) {
  lockRightFoot();
}
```

Phase 1 does not implement hard foot locking. It carries contact metadata and establishes where foot locking will attach.

## MVP Acceptance Criteria

M20.4 is successful when these are true in experimental preview mode:

1. Side-view videos rotate Alicia root instead of widening the legs.
2. Forward/backward walking is no longer interpreted as large left/right leg spread.
3. Foot-contact metadata can reduce visible foot sliding once foot lock is enabled.

## Risks

- GVHMR and WHAM are heavyweight research dependencies and may require separate environments.
- Provider world axes may differ; all axes must be normalized at the adapter boundary.
- Foot contact confidence may be noisy on cropped or low-resolution dance videos.
- Root translation scale must be conservative so Alicia does not drift away from the preview stage.

## Implementation Guardrails

- Keep all provider code optional.
- Prefer fixture-first tests before real model integration.
- Never block the existing Motion Capture Lab on missing GVHMR/WHAM dependencies.
- Keep `MotionBERT -> AliciaSkeletonRetargeter -> limb motion` as the default path.
- Update `history.md` after each phase lands.
