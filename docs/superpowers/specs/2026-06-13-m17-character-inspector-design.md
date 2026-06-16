# M1.7 Character Inspector Design

## Purpose

Rename and reshape the current `Pose Calibration Panel` into a broader VRM developer surface:

```text
角色檢查器
Character Inspector
```

M1.7 still ships only **Base Pose calibration**, but the UI should no longer look like a narrow one-off debug form. It should become the first slice of a future `VRM Developer Mode` that can later host expression, look-at, motion, voice, and pronunciation debugging without another layout reset.

The guiding product idea:

```text
Agent Runtime Debug
  Action Trace Timeline
  Suggested Actions

VRM Runtime Debug
  Character Inspector
    姿勢
    表情
    視線
    動作
```

## Current Project Fit

The app already has the runtime primitives needed for M1.7:

- `MotionController` owns natural pose, semantic overlays, and the new pose preset API.
- `DEFAULT_POSE_PRESET` / `POSE_CALIBRATION_BONES` provide a stable base pose contract.
- `index.html` already exposes a Debug Panel with Action Trace Timeline and the first Pose Calibration UI.
- `mascot.css` already defines the dark glass UI language, trace status colors, and compact debug surfaces.
- The existing browser app is a 3D VRM + GIS split view, so persistent UI must protect the character and map reading area.

Implementation should keep using the current plain HTML/CSS/ES module structure. Do not introduce React, Vue, Tailwind, a new build step, or a server save path.

## Design Direction

Use the approved **B: right-side deck** direction from the visual companion.

The panel should read as a compact game/tool HUD rather than a normal admin form:

- right-side deck / side drawer visual structure;
- dark translucent surface, mint accent, amber axis highlights;
- compact controls with strong grouping;
- clear Chinese primary labels;
- English runtime identifiers retained where they are part of the technical contract.

### Naming

Primary visible title:

```text
角色檢查器
```

Secondary label:

```text
Character Inspector
```

Status label:

```text
開發者模式
```

Avoid using `Pose Calibration Panel` as the visible product name. It can remain in code comments only if needed for compatibility, but new UI copy should use `角色檢查器`.

## M1.7 Scope

M1.7 implements only the **姿勢** section:

- bone group selector;
- bone selector;
- x/y/z sliders;
- mirror mode;
- reset current bone;
- reset all;
- copy JSON;
- save to `localStorage`;
- JSON preview for the current pose preset.

Out of scope for M1.7:

- expression sliders;
- look-at vector editing;
- motion timeline debugging;
- TTS or pronunciation debugging;
- ML / heuristic auto-fix;
- server-side preset saving;
- semantic overlay editing;
- contextDigest changes.

## Information Architecture

The Character Inspector has these conceptual layers:

```text
Header
  角色檢查器
  Character Inspector
  開發者模式 / save status

Runtime Tabs
  姿勢
  表情
  視線
  動作

Pose Controls
  Bone groups
  Bone selector / bone chips
  Mirror mode
  X/Y/Z controls

Preset Output
  JSON preview
  Copy / Save / Reset actions
```

M1.7 may show future tabs as disabled, or hide them until implemented. If shown, they must clearly appear unavailable and must not pretend to work.

## Chinese UI Copy

Primary UI copy should be Traditional Chinese:

- `角色檢查器`
- `開發者模式`
- `姿勢`
- `表情`
- `視線`
- `動作`
- `骨骼`
- `身體`
- `手臂`
- `手腕`
- `重心`
- `鏡像調整`
- `複製 JSON`
- `儲存本機`
- `重設骨骼`
- `全部重設`
- `已儲存本機`
- `預設姿勢`
- `編輯中`

Humanoid bone IDs stay in English because they are runtime identifiers:

```text
右上臂 rightUpperArm
左前臂 leftLowerArm
重心 hips
```

## Bone Groups

M1.7 should keep the approved limited bone list:

- `hips`
- `spine`
- `chest`
- `leftUpperArm`
- `rightUpperArm`
- `leftLowerArm`
- `rightLowerArm`
- `leftHand`
- `rightHand`

Recommended group mapping:

- `重心`: `hips`
- `身體`: `spine`, `chest`
- `手臂`: `leftUpperArm`, `rightUpperArm`, `leftLowerArm`, `rightLowerArm`
- `手腕`: `leftHand`, `rightHand`

The first implementation can use group chips or a single select if time is tight, but the visual hierarchy should make the group concept clear.

## Layout

Use a right-side deck inside the Debug Panel / developer area.

Desktop behavior:

- the deck should feel like a side inspector;
- controls are concentrated on the right side;
- the character observation area should remain visually dominant;
- avoid center-screen and lower-middle overlays over the 3D canvas;
- JSON preview is a lower dock inside the inspector, not the primary visual.

Mobile behavior:

- stack the inspector vertically;
- keep sliders full width;
- avoid horizontal overflow;
- allow JSON preview to scroll within its own dock.

The current app keeps the Debug Panel at the bottom. M1.7 can implement the side-deck look within that panel first, but the component should be named and structured as `Character Inspector` so it can later move to a true side drawer without another naming refactor.

## Interaction Rules

### Slider Editing

- Rotation bones use degrees in UI.
- `hips` uses position units and shows compact decimal values.
- Editing a slider immediately updates `MotionController` through the existing pose preset API.
- The JSON preview updates immediately.
- Status changes to `編輯中`.

### Mirror Mode

- Mirror applies only to paired arm and hand bones:
  - `leftUpperArm` / `rightUpperArm`
  - `leftLowerArm` / `rightLowerArm`
  - `leftHand` / `rightHand`
- Mirror does not apply to `hips`, `spine`, or `chest`.
- Mirrored `y` and `z` axes invert sign; `x` stays the same.

### Reset

- `重設骨骼` resets the selected bone to `DEFAULT_POSE_PRESET`.
- `全部重設` resets all base pose values to defaults for the current model context.

### Copy And Save

- `複製 JSON` copies the current pose preset JSON.
- `儲存本機` writes to `localStorage`.
- The status label should report success or failure without using `alert()`.

## Data Contract

Continue using the M1.7 preset schema:

```json
{
  "model": "models/mascot.vrm",
  "basePose": {
    "rotation": {
      "rightUpperArm": { "x": 7, "y": 0, "z": -42 }
    },
    "position": {
      "hips": { "x": -0.008, "y": 0, "z": 0 }
    }
  }
}
```

Do not put Character Inspector state into:

- `contextDigest`;
- `/api/llm` payloads;
- Agent runtime trace;
- Suggested Actions.

The inspector is local UI/debug/telemetry territory.

## Component Boundaries

Recommended naming:

- HTML container: `characterInspectorPanel`
- CSS namespace: `.character-inspector-*`
- JS functions:
  - `renderCharacterInspector()`
  - `renderCharacterInspectorPreview()`
  - `handleInspectorSliderInput()`
  - `saveInspectorPresetLocal()`
  - `loadInspectorPresetFromLocal()`

This keeps the UI aligned with future expression/look-at/motion sections.

`MotionController` remains responsible only for pose preset data and bone application. It should not know about Chinese labels, tabs, or inspector UI.

## Visual Quality Bar

The inspector should feel closer to game tooling than a SaaS admin panel:

- compact side-deck density;
- no nested card stacks;
- no large explanatory text blocks in the live app;
- stable slider row dimensions;
- readable labels over dark motion backgrounds;
- clear active/disabled/hover states;
- no UI overlap at desktop or mobile widths;
- no decorative blobs or unrelated gradients.

### Color Direction

The right-side inspector and any auxiliary note area must stay in the same dark HUD family as the VRM stage.

Avoid:

- large medium-gray panels;
- flat document-card surfaces;
- high-coverage neutral blocks that look detached from the character scene;
- washed-out gray backgrounds behind the inspector.

Prefer:

- deep navy / near-black translucent surfaces;
- subtle teal borders and active states;
- amber only for axis/value emphasis;
- muted slate text for secondary metadata;
- lower-opacity surfaces for notes and roadmap items.

The right-side area should support the character scene, not read as a separate gray spec document beside it.

## Accessibility And Input

- Native buttons/selects/range inputs are acceptable for M1.7.
- Visible focus states should remain usable.
- Slider values must be visible as text, not color only.
- Disabled future tabs must not be keyboard traps.
- Reduced motion does not require extra work because this UI should not add heavy animation.

## Testing Plan

Automated checks:

- `node scratch/test_semantic_pose_binding.mjs`
- `node scratch/test_trace_timeline.mjs`
- `node scratch/test_suggested_actions.mjs`
- `python -m py_compile .\server.py`
- `git diff --check`

Browser smoke:

1. Open `http://127.0.0.1:8765/`.
2. Open Debug Panel / developer area.
3. Confirm visible title is `角色檢查器`.
4. Confirm `姿勢` is the active M1.7 section.
5. Confirm operation labels are Traditional Chinese.
6. Select `右上臂 rightUpperArm`.
7. Adjust `Z`; confirm JSON preview updates.
8. Confirm mirror updates paired arm value.
9. Click `儲存本機`; confirm non-alert status update.
10. Click `全部重設`; confirm default pose values return.
11. Confirm console has no new errors or warnings.

Visual smoke:

- desktop screenshot: no clipped buttons, no slider/value overlap, no panel collision;
- mobile-width screenshot: inspector stacks cleanly and JSON preview scrolls;
- 3D character or viewport remains visually readable while inspector is open.

## Risks And Tradeoffs

- A true side drawer may be cleaner long term, but moving the Debug Panel layout too aggressively in M1.7 could disturb the existing runtime debug surface. First implementation can emulate side-deck styling inside the current Debug Panel.
- Future disabled tabs are useful for direction, but they can feel fake if too prominent. Keep them subtle or hidden unless the final implementation can make disabled state clear.
- The current plain HTML file is growing. M1.7 can keep changes local, but a later phase should consider extracting inspector UI helpers if expression/look-at/motion sections are added.

## Acceptance Criteria

M1.7 Character Inspector is accepted when:

- visible UI name is `角色檢查器 / Character Inspector`;
- first implemented section is pose/base-pose calibration only;
- Chinese labels replace English operation labels;
- bone labels include Chinese semantic text plus English humanoid ID;
- existing pose preset APIs continue to pass tests;
- contextDigest and Agent Runtime payloads remain unchanged;
- browser smoke verifies slider, mirror, copy/save/reset flows;
- the UI reads as a compact developer HUD rather than a generic debug form.
