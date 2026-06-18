# M20.6 Contact & Foot Lock Layer Spec

## Goal

M20.6 adds a contact-aware layer to Motion Capture Lab so Alicia can know which foot is planted, reduce visible foot sliding, and keep root motion consistent with stride intent.

M20.4 gave Alicia world yaw, root translation, and foot-contact metadata. M20.5 gave Alicia body orientation, gaze, and upper-body reference-frame alignment. M20.6 uses those foundations to add a conservative contact layer:

```text
video
-> 2D pose / MotionBERT 3D lift
-> AliciaSkeletonRetargeter
-> Alicia-local limb pose
-> Orientation Alignment Layer
-> Contact & Foot Lock Layer
-> Alicia preview / export
```

The MVP is a soft foot-lock layer. It improves root / hips motion while preserving the existing limb retargeter.

## Core Principle

Contact & Foot Lock Layer may correct:

- foot-contact metadata,
- planted-foot state,
- root / hips translation smoothing,
- contact-aware root drift damping,
- preview diagnostics.

It must not become a second leg retargeter.

M20.6 must not directly overwrite Alicia limb rotations for:

- `leftUpperLeg`,
- `leftLowerLeg`,
- `rightUpperLeg`,
- `rightLowerLeg`.

If M20.6 touches foot bones at all, it may only apply low-angle visual stabilization to `leftFoot` / `rightFoot`, and only when contact confidence is high. The MVP should prefer root / hips compensation over foot-bone mutation.

## Non-Goals

- Do not implement full SMPL-to-VRM retargeting.
- Do not add full inverse kinematics.
- Do not pin ankles by twisting knees.
- Do not replace `AliciaSkeletonRetargeter` or `AliciaMotionPreviewAdapter` limb logic.
- Do not require GVHMR assets for normal Pose Copier usage.
- Do not make contact lock affect hand / arm / head pose.
- Do not export raw GVHMR / WHAM contact internals as Alicia runtime data.

## Contact Contract

M20.6 normalizes contact estimates into this shape:

```js
{
  ok: true,
  frames: [
    {
      t: 1.23,
      contact: {
        left: true,
        right: false
      },
      confidence: {
        left: 0.82,
        right: 0.18,
        overall: 0.74
      },
      plantedFoot: "left",
      rootTranslation: {
        x: 0.02,
        y: 0.0,
        z: 0.14
      },
      smoothedRootTranslation: {
        x: 0.018,
        y: 0.0,
        z: 0.11
      },
      rootDrift: {
        raw: 0.045,
        damped: 0.019
      },
      stridePhase: {
        label: "left_contact",
        progress: 0.12
      },
      source: {
        contact: "gvhmr",
        root: "gvhmr",
        phase: "skeleton_3d"
      }
    }
  ],
  metadata: {
    version: "contact_foot_lock_v1"
  }
}
```

Field rules:

- `t` is seconds from the active video timeline.
- `contact.left/right` are booleans after confidence thresholding.
- `confidence.left/right/overall` are clamped to `0..1`.
- `plantedFoot` is one of `left`, `right`, `both`, or `none`.
- `rootTranslation` is the provider or heuristic raw root translation in world units.
- `smoothedRootTranslation` is the contact-aware root translation that preview can use.
- `rootDrift.raw` measures frame-to-frame root displacement before damping.
- `rootDrift.damped` measures displacement after contact-aware smoothing.
- `stridePhase.label` is one of `left_contact`, `left_swing`, `right_contact`, `right_swing`, `double_contact`, or `unknown`.
- `stridePhase.progress` is `0..1` within the current inferred phase when available.
- `source.contact/root/phase` identify the data source. Initial valid values are `gvhmr`, `wham`, `skeleton_2d`, `skeleton_3d`, `motionbert`, `fixture`, and `unknown`.

Failure responses stay non-throwing:

```js
{
  ok: false,
  reason: "missing_contact_frames",
  frames: []
}
```

## Module Boundaries

### `AliciaContactAnalyzer`

Owns contact normalization and heuristic fallback.

Responsibilities:

- Normalize GVHMR / WHAM `footContact` into the contact contract.
- Infer contact from skeleton landmarks when world provider contact is missing.
- Use ankle height, ankle velocity, foot lift delta, and walk phase markers as fallback evidence.
- Emit per-foot confidence and `plantedFoot`.
- Preserve source attribution for each frame.

Initial heuristic:

- A foot is likely planted when ankle vertical velocity is low and ankle height is near the lower foot baseline.
- If both feet are low and velocity is low, emit `plantedFoot: "both"`.
- If confidence is below threshold, emit `plantedFoot: "none"` and do not lock.

### `AliciaRootMotionSmoother`

Owns contact-aware root translation smoothing.

Responsibilities:

- Accept raw `rootTranslation` from GVHMR / WHAM or skeleton fallback.
- Apply temporal smoothing.
- Reduce root drift while a planted foot is active.
- Avoid freezing root motion during swing phases.
- Emit `smoothedRootTranslation` and `rootDrift` diagnostics.

Initial rules:

- Contact confidence below `0.35` means no lock and light smoothing only.
- Single-foot contact can damp horizontal root drift.
- Double contact can damp more strongly.
- Swing phases should keep motion responsive.

### `AliciaFootLockLayer`

Owns the soft lock output applied to preview animation payloads.

Responsibilities:

- Combine contact frames and smoothed root translation.
- Apply root / hips compensation through `hips_position`.
- Preserve existing limb rotations.
- Surface lock metadata for Lab diagnostics.
- Optionally mark `leftFoot` / `rightFoot` visual stabilization as planned, but do not implement hard foot-bone mutation in MVP.

Guardrail:

`AliciaFootLockLayer` must not directly mutate `leftUpperLeg`, `leftLowerLeg`, `rightUpperLeg`, or `rightLowerLeg` rotations.

### `AliciaMotionPreviewAdapter`

Owns integration with Pose Copier.

Responsibilities:

- Accept `contactTransform` in `previewPoseAtTimeMs()`.
- Build the normal Alicia limb pose first.
- Apply orientation transform if present.
- Apply contact transform after orientation transform.
- Preserve `transformAnimation` support from M20.4/M20.5.
- Return contact metadata to Lab summaries.

Expected integration shape:

```js
previewPoseAtTimeMs(timeMs, skeletonFrames, {
  orientationTransform,
  contactTransform,
  transformAnimation
});
```

## Runtime Data Flow

### Provider Contact Path

```text
GVHMR / WHAM world motion
-> footContact + rootTranslation
-> AliciaContactAnalyzer
-> AliciaRootMotionSmoother
-> AliciaFootLockLayer
-> hips_position compensation
```

Acceptance:

- If GVHMR reports left contact, Lab shows left planted.
- During left contact, root drift damping reduces visible left-foot sliding.
- During swing, root motion remains responsive.

### Skeleton Fallback Path

```text
MotionBERT / skeleton frames
-> ankle height + ankle velocity + cycle phase
-> AliciaContactAnalyzer
-> fallback contact frames
```

Acceptance:

- Missing GVHMR does not disable diagnostics.
- Fallback can identify obvious alternating walking contact.
- Low-confidence fallback does not lock aggressively.

### Root Smoothing Path

```text
raw root translation
-> smoothing
-> contact-aware drift damping
-> smoothedRootTranslation
```

Acceptance:

- Sudden root jitter is damped.
- Root translation does not freeze through the whole clip.
- Damped drift is visible in diagnostics.

## Lab UI

Motion Capture Lab should expose contact as read-only diagnostics first.

Add summary fields near the existing GVHMR / Orientation summaries:

- `Contact Layer`: `off / heuristic / gvhmr / mixed / failed`.
- `Left Contact`: contact state and confidence.
- `Right Contact`: contact state and confidence.
- `Locked Foot`: `left / right / both / none`.
- `Root Drift`: raw and damped values.
- `Stride Phase`: label and progress.

These fields should update during scrub and playback. They should not add a separate workflow mode in M20.6.

## Testing Strategy

Add fixture-first tests before implementation:

- `scratch/test_alicia_contact_analyzer.mjs`
  - GVHMR contact frames normalize into the contact contract.
  - Skeleton ankle-height fallback detects an obvious planted foot.
  - Low-confidence frames produce `plantedFoot: "none"`.

- `scratch/test_alicia_root_motion_smoother.mjs`
  - Contact frames reduce root drift.
  - Swing frames keep root translation responsive.
  - Double-contact frames damp more than single-contact frames.

- `scratch/test_alicia_foot_lock_layer.mjs`
  - Contact transform changes `hips_position`.
  - Limb rotations for upper/lower legs remain unchanged.
  - Lock metadata reports planted foot and drift.

- Existing preview tests:
  - extend `scratch/test_motion_capture_lab.mjs` to lock Contact Layer diagnostics.
  - extend `scratch/test_alicia_orientation_preview_adapter.mjs` or add a new preview test to ensure `contactTransform` composes after `orientationTransform`.

## MVP Acceptance Criteria

M20.6 is successful when these are true:

1. Foot-contact trace shows left / right contact over time.
2. Planted-foot frames reduce visible root drift.
3. Root translation smoothing reduces jitter without freezing the motion.
4. Stride phase diagnostics update during video scrub / playback.
5. Missing GVHMR falls back to skeleton heuristics.
6. Contact Layer never directly overwrites Alicia upper/lower leg rotations.
7. No full SMPL retargeting or hard IK is introduced.

## Risks

- Heuristic ankle contact can be noisy on cropped videos or long skirts.
- Root damping can make motion feel stuck if thresholds are too aggressive.
- Contact source axes may differ between GVHMR and WHAM.
- Without full IK, soft lock can reduce but not eliminate all foot sliding.
- Planted-foot visual stabilization may fight existing leg rotations if added too early.

## Implementation Guardrails

- Keep contact lock optional and confidence-gated.
- Prefer root / hips compensation over foot-bone mutation.
- Never mutate upper/lower leg rotations inside the contact layer.
- Keep the layer usable without GVHMR / WHAM assets.
- Start with diagnostics and soft lock before any hard pinning.
- Update `history.md` after each M20.6 phase lands.
