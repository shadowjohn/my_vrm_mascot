# Phase M6.7: Motion Template Importer Design

## Summary

Phase M6.7 adds a small developer lab for importing existing pose / motion templates and translating them into the mascot runtime's current Natural Pose preset format.

The first version is **VRMA-first Pose Importer**:

```text
VRMA file
  -> sample first frame or selected timestamp
  -> extract upper-body humanoid rotations
  -> merge into AliciaSolid base preset
  -> export NaturalPosePreset.json
```

This phase is not a new runtime feature. It is a developer workflow that reduces manual bone tuning time by turning existing animation templates into editable pose presets.

## Goals

- Load a `.vrma` file in a dedicated lab page.
- Preview the sampled pose on Alicia.
- Sample the first frame or a selected timestamp.
- Extract only upper-body humanoid bone rotations.
- Export JSON compatible with the existing `MotionController.loadPosePreset()` schema.
- Preserve the current Alicia lower-body and hips position baseline unless the user explicitly edits them later in Character Inspector.
- Keep the output editable through the existing Character Inspector workflow.

## Non-Goals

- No Agent Runtime changes.
- No `contextDigest` changes.
- No `ActionQueue`, `ActingBridge`, `ActingPolicy`, or `PoseDirector` changes.
- No YOLO, mocap, IK, physics, or retargeting pipeline.
- No expression import in M6.7, even though VRMA can describe expressions.
- No gaze import in M6.7, even though VRMA can describe gaze.
- No server-side save.
- No bundled third-party motion asset unless the asset source and license are explicitly documented.
- No VMD/MMD production support.
- No Mixamo/FBX production support in this phase.

## Context

Current mascot animation layers are already separated:

```text
M1 Natural Pose
M2 Idle Micro Motion
M3 Short Motion Clips
M4 Expression Layer
M5 Acting Policy
M6 Conversation Acting Bridge
```

M6.7 must not disturb those layers. It should produce data that existing runtime APIs already know how to consume:

```js
mascot.motion.loadPosePreset(preset);
mascot.motion.getPosePreset();
```

The existing pose preset schema is:

```json
{
  "model": "AliciaSolid",
  "basePose": {
    "rotation": {
      "leftUpperArm": { "x": 9, "y": -3, "z": 54 }
    },
    "position": {
      "hips": { "x": -0.014, "y": 0, "z": 0.004 }
    }
  }
}
```

## External Format Choice

### Primary: VRMA

VRM Animation is designed for humanoid VRM animation reuse. The same VRMA can be used across VRM models, and the format can describe humanoid bone animation, expression animation, and gaze control.

M6.7 uses VRMA only for bone pose sampling. Expressions and gaze are intentionally ignored in this phase.

Useful references:

- https://vrm.dev/en/vrma/
- https://github.com/vrm-c/vrm-specification
- https://github.com/pixiv/three-vrm/blob/dev/packages/three-vrm-animation/examples/loader-plugin.html
- https://www.npmjs.com/package/@pixiv/three-vrm-animation

### Later: Mixamo / FBX

Mixamo has a large animation library and can feed future short clip import work. The first production route should be through a retargeting layer or through VRMA conversion, not direct runtime use.

Useful references:

- https://github.com/saori-eth/vrm-mixamo-retargeter
- https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html

### Later / Experimental: VMD / MMD

MMD/VMD has a large community motion ecosystem but carries more coordinate, physics, and licensing risk. It should remain an experiment until VRMA import is stable.

Useful reference:

- https://github.com/hanakla/three-mmd-loader

## New Artifacts

Add:

```text
docs/superpowers/specs/2026-06-13-m6-7-motion-template-importer-design.md
motion_template_lab.html
scratch/test_motion_template_importer.mjs
```

The lab page is a developer tool, similar in spirit to Character Inspector and M6.5 demo harness.

It must be reachable at:

```text
http://127.0.0.1:8765/motion_template_lab.html
```

## Architecture

M6.7 keeps the importer outside the production runtime:

```text
motion_template_lab.html
  -> isolated VRMA loading / sampling logic
  -> NaturalPosePreset JSON preview
  -> Copy / Download JSON

index.html
  -> unchanged

VrmMascot.js
  -> unchanged

MotionController.js
  -> unchanged unless tests expose a schema compatibility issue
```

The lab may use a newer isolated `@pixiv/three-vrm` / `@pixiv/three-vrm-animation` import path if required for VRMA support. This dependency must stay inside `motion_template_lab.html` and must not replace the existing `vendor/three-vrm.min.js` runtime path used by the main mascot page.

Reason: the current runtime still carries a VRM 0.6.7 compatibility layer. VRMA loading belongs in the lab first, not the production renderer.

## Data Flow

### Load

```text
User selects .vrma
  -> validate file extension / MIME where available
  -> load VRMA through isolated loader
  -> read animation duration
  -> enable timestamp slider
```

### Sample

```text
Selected timestamp t
  -> apply animation pose to preview VRM
  -> read whitelisted humanoid bone rotations
  -> convert radians to degrees
  -> round to stable decimal precision
  -> merge into Alicia baseline preset
  -> render JSON preview
```

### Export

```text
Preset preview
  -> Copy JSON
  -> Download JSON
  -> manually paste / load into Character Inspector
```

No server save is performed in M6.7.

## Bone Extraction Scope

MVP extracts upper body only:

```text
spine
chest
leftShoulder
rightShoulder
leftUpperArm
rightUpperArm
leftLowerArm
rightLowerArm
leftHand
rightHand
```

MVP excludes:

```text
hips position
hips rotation
legs
feet
head
neck
eyes
fingers
spring bones
expression weights
look-at / gaze target
```

Head and neck remain controlled by `LookAtController` and should not be exported by default.

Lower body and hips position come from the current Alicia preset:

```text
motions/poses/alicia_solid.json
```

The exported preset is a merge:

```text
existing Alicia base preset
  + imported upper-body rotations
```

This prevents a clean upper-body import from accidentally breaking the tuned idle stance.

## Preset Output Contract

Exported JSON:

```json
{
  "model": "AliciaSolid",
  "source": {
    "type": "vrma",
    "fileName": "template.vrma",
    "sampleTime": 0,
    "boneScope": "upper_body"
  },
  "basePose": {
    "rotation": {
      "spine": { "x": 0, "y": 0, "z": 0 },
      "chest": { "x": 0, "y": 0, "z": 0 },
      "leftUpperArm": { "x": 7, "y": 0, "z": 42 }
    },
    "position": {
      "hips": { "x": -0.014, "y": 0, "z": 0.004 }
    }
  }
}
```

`source` is debug metadata. `MotionController.loadPosePreset()` should ignore unknown top-level fields, which is already consistent with the existing preset normalization behavior.

Rotation values are stored in degrees. Runtime conversion to radians remains inside `MotionController`.

## UI Design

Use a Chinese developer-tool UI, not a marketing page.

Suggested layout:

```text
left:  VRM preview canvas
right: Motion Template Lab controls
```

Controls:

- `載入 VRMA`
- `取第一幀`
- `取指定時間`
- timestamp slider
- sampled duration display
- bone scope display: `Upper Body`
- warning list
- JSON preview
- `複製 JSON`
- `下載 JSON`

Status copy must clearly distinguish:

- `已載入 Alicia`
- `已載入 VRMA`
- `已取樣`
- `無法讀取 VRMA`
- `找不到可用 humanoid bone`
- `匯出完成`

The lab should also show a compact extraction summary:

```text
source file
sample time
duration
exported bone count
warnings
```

This is the data-visualization surface of M6.7: a small evidence panel that tells the developer what was extracted and why the result may or may not be trustworthy.

## Error Handling

Show a visible warning and do not export when:

- file is not selected
- file extension is not `.vrma`
- loader fails
- no VRM animation is found
- no whitelisted humanoid bones are found
- sampled pose produces no non-zero upper-body rotations

Show a non-blocking warning when:

- some whitelisted bones are missing
- rotations exceed a configurable sanity threshold, such as `120deg`
- source duration is unknown
- timestamp is outside animation duration and has been clamped

The warning output should stay visible in the lab and should also be included in the JSON preview under `source.warnings` if export is still allowed.

## Testing

Add:

```text
scratch/test_motion_template_importer.mjs
```

Standalone tests should verify:

- `motion_template_lab.html` exists.
- UI is Chinese.
- Required controls exist:
  - `載入 VRMA`
  - `取第一幀`
  - `取指定時間`
  - `複製 JSON`
  - `下載 JSON`
- The page references VRMA loading capability.
- The output schema uses `basePose.rotation` and `basePose.position`.
- The bone whitelist includes upper-body bones only.
- The page does not import or modify `ActionQueue`, `ActingBridge`, `ActingPolicy`, `PoseDirector`, or `contextDigest`.
- The main `index.html` is not modified for importer wiring.

Regression checks:

```powershell
node .\scratch\test_motion_template_importer.mjs
node .\scratch\test_semantic_pose_binding.mjs
node .\scratch\test_character_inspector_ui.mjs
python -m py_compile .\server.py
git diff --check
```

Browser smoke:

- Open `http://127.0.0.1:8765/motion_template_lab.html`.
- Confirm Alicia preview canvas is visible.
- Confirm Chinese control surface is visible.
- Load a local `.vrma`.
- Sample first frame.
- Move timestamp slider and sample again.
- Copy JSON.
- Paste JSON into Character Inspector.
- Confirm `MotionController.loadPosePreset()` accepts it and does not reveal T-Pose.
- Confirm console has no new error/warn.

## Acceptance Criteria

M6.7 is complete when:

- The lab loads Alicia and a local VRMA file.
- The lab can sample first frame and selected timestamp.
- The lab exports NaturalPose preset JSON.
- Exported JSON preserves Alicia lower body / hips baseline.
- Exported JSON only overrides the upper-body rotation whitelist.
- Exporting the same VRMA sample twice is deterministic: JSON differences are not allowed except explicitly documented metadata fields.
- Exported JSON can be pasted into Character Inspector.
- No Agent Runtime files are touched.
- No production mascot runtime path depends on VRMA loader code.
- Standalone tests pass.
- Browser smoke passes.

## Risks

### VRM Version Split

The production runtime currently uses a compatibility layer around older `three-vrm`. VRMA tooling may require newer `@pixiv/three-vrm-animation` APIs.

Mitigation: isolate VRMA support in `motion_template_lab.html`. Do not upgrade production runtime as part of M6.7.

### Coordinate Drift

Rotations sampled from a VRMA preview pipeline may not perfectly match the current runtime's bone coordinate assumptions.

Mitigation: export only upper body, preserve Alicia baseline, and keep Character Inspector as the final calibration pass.

### Asset Licensing

Motion templates from community sources may have unclear licensing.

Mitigation: the importer supports user-selected local files. Do not bundle third-party VRMA/MMD/Mixamo assets until source and license are recorded.

### False Sense of Automation

Imported pose templates may still need tuning.

Mitigation: name the tool `Motion Template Lab`, not `Auto Pose Fixer`, and keep the workflow as import -> preview -> export -> inspector tuning.

## Future Phases

### M6.8 Motion Clip Template Importer

Sample multiple timestamps and export short clip presets compatible with `MotionClips.js` or a future JSON clip format.

### M6.9 Mixamo / FBX Retarget Lab

Use Mixamo assets through a retargeting or VRMA conversion path, then export short clips.

### M7 Motion Library

Build a curated internal library of verified poses and short clips with metadata, license, preview thumbnails, and quality notes.

## Spec Self-Review

- No placeholder sections remain.
- Scope is limited to VRMA-first pose import.
- Runtime boundaries are explicit.
- Agent and `contextDigest` isolation are explicit.
- Test and browser smoke expectations are concrete.
- Known risks are documented with mitigations.
