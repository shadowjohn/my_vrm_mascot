# M20.4 Pose Calibration Track Design

## Goal

Turn manual Alicia/GVHMR alignment keyframes into a reusable pose calibration track for the same video. The user can see which frames were calibrated, jump back to them, and infer offsets for uncalibrated frames from nearby calibrated frames.

## Scope

Build the smallest useful version in `pose_training_lab.html`:

- Rename the concept to `Pose Calibration Track / 姿勢校正軌`.
- Show saved calibration keyframes as a track list.
- Let each keyframe jump to its frame, apply its calibration, or delete it.
- Add current-frame status: calibrated / uncalibrated, and which nearby keyframes can infer it.
- Add `自動姿勢推論` for the current frame.
- Generate `#trainingBoneSelect` from one shared bone list with numbered labels.
- Use the same shared bone list for Alicia click-picking and `boneOffsets`.

Out of scope:

- Cross-video learning.
- Blender bake.
- IK / foot locking.
- Spline or curve interpolation.
- Per-bone confidence.
- Finger-level editing.

## Calibration Track Model

Keep the existing JSON shape and keep using `keyframes`.

Each keyframe already stores:

- `timeMs`
- `frameIndex`
- `calibration`
- `boneOffsets`

M20.4 treats this array as a track. No schema version bump is required because existing JSON remains valid.

## Inference Rules

For the current frame:

1. If there are keyframes before and after it, linearly interpolate numeric fields.
2. If only one nearby keyframe exists, apply the nearest keyframe.
3. If no keyframes exist, do nothing and show a clear status message.

Only numeric fields are inferred:

- `calibration.scale`
- `calibration.offsetX`
- `calibration.offsetY`
- `calibration.offsetZ`
- `calibration.yawDegrees`
- `calibration.timeOffsetMs`
- `boneOffsets[bone].x`
- `boneOffsets[bone].y`
- `boneOffsets[bone].z`

`mirrorX` is boolean and is copied from the nearest keyframe instead of interpolated.

## UI

Add a `姿勢校正軌` section near the existing JSON controls.

Controls:

- `儲存目前影格校正` reuses the current keyframe save behavior.
- `自動姿勢推論` applies inferred calibration to the current frame.
- Existing `匯出 JSON` / `匯入 JSON` remain the document save/load path.

Track list:

```text
#   time    frame    狀態      操作
1   0.83s   25       已校正    跳到 / 套用 / 刪除
2   1.42s   43       已校正    跳到 / 套用 / 刪除
3   2.10s   63       已校正    跳到 / 套用 / 刪除
```

Current-frame status:

```text
目前影格：frame 52 / 1.73s
狀態：未校正
可用推論來源：frame 43 -> frame 63
```

## Bone List

Create one shared ordered list for selection, click picking, offsets, and labels:

1. 頭部 `head`
2. 頸部 `neck`
3. 上胸 `upperChest`
4. 胸部 `chest`
5. 脊椎 `spine`
6. 臀部 `hips`
7. 左肩 `leftShoulder`
8. 左上臂 `leftUpperArm`
9. 左前臂 `leftLowerArm`
10. 左手 `leftHand`
11. 右肩 `rightShoulder`
12. 右上臂 `rightUpperArm`
13. 右前臂 `rightLowerArm`
14. 右手 `rightHand`
15. 左大腿 `leftUpperLeg`
16. 左小腿 `leftLowerLeg`
17. 左腳 `leftFoot`
18. 左腳趾 `leftToes`
19. 右大腿 `rightUpperLeg`
20. 右小腿 `rightLowerLeg`
21. 右腳 `rightFoot`
22. 右腳趾 `rightToes`

Finger bones are intentionally excluded because they are hard to click accurately and add noise to the calibration workflow.

## Testing

Extend the existing assert-based `scratch/test_pose_training_lab.mjs`:

- track section exists.
- infer button exists.
- keyframe list container exists.
- select options are generated from the shared ordered bone list.
- inference helper handles:
  - previous + next keyframes by interpolation.
  - only one nearby keyframe by nearest copy.
  - no keyframes by no-op.

