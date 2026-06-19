# GVHMR Alicia Rest Pose Offset Design

## Goal

Make `pose_training_lab.html` preview Alicia closer to GVHMR/SMPL skeletons by compensating the SMPL A-pose vs Alicia VRM T-pose mismatch before the existing direct skeleton pose copier runs.

## Scope

Implement A1 only:

- Add a small hard-coded Alicia/SMPL rest-pose offset table in `js/AliciaMotionPreviewAdapter.js`.
- Apply it only when `retargetHints.directSkeletonPose === true`.
- Keep existing `pose_training_lab.html` calibration, `boneOffsets`, keyframes, and JSON format working as-is.

Out of scope:

- Blender BVH/FBX retarget pipeline.
- IK foot locking.
- New UI for editing rest-pose offsets.
- Full SMPL local-axis solver.

## Design

The current direct skeleton pose copier already converts GVHMR landmarks into Alicia pose rotations. The weak point is that the source rest pose is SMPL-like A-pose while Alicia is VRM T-pose, so raw arm/leg directions carry a constant offset.

Add `ALICIA_SMPL_REST_OFFSETS` near the direct skeleton pose helpers. It stores small per-bone Euler degree offsets for shoulders, upper arms, upper legs, lower legs, and feet. After generating the direct skeleton animation pose, merge these offsets into the pose rotation output before sending it to `MotionController.loadPosePreset()` / preview playback.

The existing `pose_training_lab.html` `boneOffsets` remains the final manual correction layer. Rest offsets are the default baseline; user calibration still wins visually by being loaded into the mascot pose preset as it does today.

## Data Flow

GVHMR frames -> `AliciaMotionPreviewAdapter.previewPoseAtTimeMs()` -> direct skeleton pose animation -> apply Alicia/SMPL rest offsets -> mascot preview.

## Error Handling

If a target bone is missing from the generated pose, skip that offset. Unknown bones do not throw. Non-direct skeleton modes are unchanged.

## Testing

Add one assert-based check in the existing motion preview tests:

- direct skeleton pose applies the rest offset to at least one known arm/leg bone.
- non-direct preview path does not receive the rest-pose offset.

This is enough for the first pass; visual tuning happens in `pose_training_lab.html`.

