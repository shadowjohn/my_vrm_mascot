# M20.5 Orientation Alignment Layer Spec

## Goal

M20.5 upgrades Motion Capture Lab from a pose copier into an orientation-aware pose copier.

The feature adds a narrow orientation layer that corrects Alicia's broad facing direction, gaze direction, and upper-body reference frame without replacing the existing limb retarget pipeline.

The intended pipeline becomes:

```text
video
-> 2D pose / MotionBERT 3D lift
-> orientation estimates
-> AliciaSkeletonRetargeter
-> Alicia-local limb pose
-> Orientation Alignment Layer
-> Alicia preview / export
```

M20.5 keeps the same core rule as M20.4:

```text
Alicia limbs = MotionBERT / AliciaSkeletonRetargeter
Alicia root, gaze, chest reference frame = Orientation Alignment Layer
```

## Core Principle

Orientation Alignment Layer may only correct:

- root / hips body yaw,
- head and neck gaze,
- chest / shoulder reference-frame alignment.

It must not directly overwrite Alicia limb bone rotations.

Specifically, M20.5 must not replace or directly author rotations for:

- `leftUpperArm`,
- `leftLowerArm`,
- `rightUpperArm`,
- `rightLowerArm`,
- `leftUpperLeg`,
- `leftLowerLeg`,
- `rightUpperLeg`,
- `rightLowerLeg`.

Limb motion remains owned by `AliciaSkeletonRetargeter` and `AliciaMotionPreviewAdapter`. Orientation modules can influence the coordinate frame those limbs are interpreted in, but they cannot become a second limb retargeter.

## Non-Goals

- Do not implement full SMPL-to-VRM retargeting.
- Do not replace MotionBERT for Alicia limb pose.
- Do not rewrite `AliciaSkeletonRetargeter`.
- Do not break the current `MotionController` / `LookAtController` responsibility boundary.
- Do not add hand, finger, expression, or dance-grade motion capture.
- Do not require GVHMR assets for the existing Pose Copier path.
- Do not make world-motion providers mandatory for normal Lab startup.

## Orientation Contract

M20.5 normalizes orientation estimates into this shape:

```js
{
  ok: true,
  frames: [
    {
      t: 1.23,
      bodyYawDegrees: -80,
      headYawDegrees: -24,
      headPitchDegrees: 8,
      chestYawDegrees: -12,
      shoulderRollDegrees: 4,
      confidence: {
        body: 0.78,
        head: 0.66,
        chest: 0.58
      },
      source: {
        body: "gvhmr",
        head: "mediapipe_face",
        chest: "skeleton_3d"
      }
    }
  ],
  metadata: {
    version: "orientation_alignment_v1"
  }
}
```

Field rules:

- `t` is seconds from the active video timeline.
- `bodyYawDegrees` is Alicia root / hips yaw in degrees.
- `headYawDegrees` is local head gaze yaw relative to the body direction, not a replacement for body yaw.
- `headPitchDegrees` is local gaze pitch relative to the body direction.
- `chestYawDegrees` is a small upper-body twist correction.
- `shoulderRollDegrees` is a small shoulder-line roll correction.
- `confidence.body`, `confidence.head`, and `confidence.chest` are clamped to `0..1`.
- `source.body`, `source.head`, and `source.chest` identify where each estimate came from. Initial valid values are `gvhmr`, `mediapipe_face`, `skeleton_2d`, `skeleton_3d`, `motionbert`, `fixture`, and `unknown`.

Failure responses stay non-throwing:

```js
{
  ok: false,
  reason: "missing_orientation_frames",
  frames: []
}
```

## Module Boundaries

### `AliciaWorldMotionFusion`

Owns root / hips body yaw.

Responsibilities:

- Continue consuming M20.4 `bodyYawDegrees`.
- Apply body yaw to root / hips rotation.
- Keep root translation and foot-contact metadata support.
- Do not alter limb bones.
- Expose applied world orientation metadata for Lab summaries.

### `AliciaHeadGazeEstimator`

Owns head yaw / pitch estimates.

Responsibilities:

- Estimate `headYawDegrees`, `headPitchDegrees`, and `confidence.head`.
- Prefer face/nose/ear landmarks when available.
- Fall back to head / neck / chest skeleton vectors when face landmarks are absent.
- Accept future GVHMR / SMPL head orientation if it can be normalized safely.
- Return `unknown` with low confidence instead of guessing aggressively.

Initial sources:

- `mediapipe_face` from nose / eye / ear visibility and relative position.
- `skeleton_3d` from head / neck / chest direction after MotionBERT lift.
- `skeleton_2d` as a weak fallback for yaw sign only.

### `AliciaUpperBodyAlignment`

Owns small chest and shoulder reference-frame corrections.

Responsibilities:

- Estimate `chestYawDegrees`, `shoulderRollDegrees`, and `confidence.chest`.
- Use shoulder line, chest-to-hips vector, and hip line.
- Apply conservative clamps so chest correction improves direction without pulling arms apart.
- Provide a transform that preview code can apply to chest / spine reference bones only.
- Do not write arm rotations directly.

Initial clamp targets:

- `chestYawDegrees`: `-18..18`.
- `shoulderRollDegrees`: `-10..10`.
- Confidence below `0.35` should produce no visible correction.

### `AliciaMotionPreviewAdapter`

Owns integration of the orientation transform into Pose Copier.

Responsibilities:

- Extend `previewPoseAtTimeMs()` to accept `orientationTransform`.
- Build the normal Alicia limb pose first.
- Apply orientation transforms only after the limb pose is built.
- Preserve existing `transformAnimation` support used by M20.4.
- Return orientation metadata so Lab can show what was applied.

Expected integration point:

```js
previewPoseAtTimeMs(timeMs, skeletonFrames, {
  orientationTransform,
  transformAnimation
});
```

## Runtime Data Flow

### Body yaw

```text
GVHMR worldMotion.bodyYawDegrees
-> AliciaWorldMotionFusion
-> Alicia root / hips yaw
```

Acceptance:

- Side-view walking rotates Alicia root.
- Forward / backward walking is not interpreted as exaggerated left / right leg spread.
- Missing GVHMR keeps the existing body-yaw heuristic path intact.

### Head gaze

```text
video face landmarks or lifted skeleton head vector
-> AliciaHeadGazeEstimator
-> neck / head gaze transform
```

Acceptance:

- If the source person looks left, Alicia head turns left.
- If the source person looks right, Alicia head turns right.
- Head gaze remains local to the body and does not rotate the whole body.
- Low-confidence face data does not create large head snaps.

### Upper-body alignment

```text
shoulder line + chest vector + hip line
-> AliciaUpperBodyAlignment
-> chest / spine reference-frame correction
```

Acceptance:

- Chest follows the source person's broad torso direction.
- Shoulder roll can follow a tilted shoulder line.
- Arm rotations remain owned by limb retargeting.
- Cross-chest gestures improve because the chest frame is less wrong, not because arms are overwritten.

## Lab UI

Motion Capture Lab should expose this as orientation diagnostics, not a separate workflow.

Add summary fields after the existing GVHMR world-motion summary:

- `Orientation Layer`: `off / heuristic / gvhmr / mixed / failed`.
- `Body Yaw`: applied yaw and confidence.
- `Head Gaze`: yaw / pitch and confidence.
- `Chest Align`: yaw / shoulder roll and confidence.

These fields are read-only diagnostics in M20.5. They help verify the layer without adding another mode switch.

## Testing Strategy

Add focused fixture tests before implementation:

- `scratch/test_alicia_head_gaze_estimator.mjs`
  - left-looking face landmarks produce negative or expected left yaw according to existing Alicia convention,
  - right-looking face landmarks produce opposite yaw,
  - missing face landmarks return low confidence instead of a large guess.

- `scratch/test_alicia_upper_body_alignment.mjs`
  - shoulder-line yaw creates small chest yaw,
  - tilted shoulders create shoulder roll,
  - clamps prevent corrections beyond the MVP range.

- `scratch/test_orientation_alignment_contract.mjs`
  - validates the combined orientation frame shape,
  - verifies source attribution is preserved,
  - verifies confidence values are clamped.

- Existing preview tests:
  - extend `scratch/test_alicia_world_motion_fusion.mjs` to ensure body yaw only changes hips/root.
  - extend `scratch/test_motion_capture_lab.mjs` to lock the new diagnostics.

## MVP Acceptance Criteria

M20.5 is successful when these are true:

1. Side-view videos rotate Alicia root through body yaw.
2. Looking left / right in the source turns Alicia head in the same direction.
3. Chest and shoulder alignment improves broad torso direction without blowing up arm poses.
4. Existing Pose Copier and Walk Extractor still work when GVHMR assets are missing.
5. Orientation Layer never directly writes Alicia limb bone rotations.

## Risks

- Face landmarks can be missing or unreliable in cropped dance videos.
- 2D face yaw can be ambiguous when the source is partially turned away.
- Head gaze may fight existing `LookAtController` behavior if the responsibility boundary is not explicit.
- Chest correction can make arm contact worse if applied too strongly.
- Provider yaw conventions may differ and must be normalized at module boundaries.

## Implementation Guardrails

- Keep the layer optional and confidence-gated.
- Keep all corrections conservative in MVP.
- Prefer fixture-first tests before touching Lab behavior.
- Keep `MotionController` responsible for body animation playback.
- Keep `LookAtController` responsible for direct head / neck control; add a clear preview gaze API rather than mutating head bones from unrelated modules.
- Update `history.md` after each M20.5 phase lands.
