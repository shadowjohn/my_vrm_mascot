# Phase M6.7.4: Review Queue Design

## Summary

Phase M6.7.4 turns Motion Template Lab from single-sample quick tagging into a batch review workbench for motion mining.

The goal is to make it cheap to collect and classify VRMA pose candidates:

```text
VRMA samples
  -> deterministic pending queue
  -> Original / Agent Pose review
  -> Quick Review classification
  -> mining_log.json
  -> future Pose Library design from real data
```

This phase does not create the Pose Library. It creates the reviewed mining data that will make M6.8 accurate.

## Goals

- Add a Review Queue inside `motion_template_lab.html`.
- Auto-generate pending review items from available VRMA files.
- Let the user click a queue item to load the VRMA and jump to its `sampleTime`.
- Keep the existing Original VRMA / Agent Pose preview switch.
- Keep Quick Review as the main classification path.
- Let Quick Review update the selected queue item instead of always appending a new candidate.
- Preserve fast append behavior when no queue item is selected.
- Export `mining_log.json` with `status: "pending" | "classified"`.
- Keep `candidate_future` as a first-class category, not a reject bucket.
- Support a fixed categories config that can become editable in a later phase.
- Keep the interface Chinese-first. Buttons, status text, filters, hints, and exported user-facing content default to Traditional Chinese. English may appear only as secondary labels or developer-facing notes, not as the primary workflow language.

## Non-Goals

- No M6.8 Pose Library.
- No runtime binding.
- No Agent Runtime changes.
- No `ActionQueue`, `ActingBridge`, `ActingPolicy`, `PoseDirector`, or `contextDigest` changes.
- No ML, similarity search, auto classification, YOLO, mocap, IK, or retargeting.
- No server-side save in this phase.
- No dual-view synchronized comparison.
- No category editor UI in this phase.

## Current Context

The current lab already supports:

- VRMA sample loading.
- Play / pause / stop.
- Sample first frame and sample selected time.
- Original VRMA vs Agent Pose preview.
- Quick Review buttons and keyboard shortcuts.
- `sourceScore`, `agentScore`, `score`.
- `candidate_future`, `reject`, reasons, tags, notes.
- Duplicate protection for accidental repeated Quick Review clicks.
- `mining_log.json` export.

M6.7.4 should extend this surface, not replace it.

## Recommended Approach

Use a non-invasive Review Queue inside the existing lab page.

Rejected alternatives:

- Pose Library first: too early, because the project still needs 100+ reviewed mining entries before library categories are trustworthy.
- Auto-classification first: too much guesswork before there is labeled data.
- Dual viewport Original / Agent comparison: useful later, but it adds synchronization and layout cost now.

## Directory Layout

Define the mining area as:

```text
examples/m6_7_vrma_samples/
  raw/
  candidates/
  review/
```

Compatibility rule:

1. Prefer loading VRMA files from `raw/`.
2. If a file is not found in `raw/`, fall back to the existing flat sample path.
3. The first implementation may keep existing files in the flat folder to avoid breaking current examples.

Directory purposes:

- `raw/`: original collected VRMA assets.
- `candidates/`: exported NaturalPosePreset JSON files.
- `review/`: `mining_log.json`, reports, and future sprint summaries.

## Fixed Categories Config

M6.7.4 uses a fixed config in the lab script:

```js
const MINING_CATEGORIES = [
  'present',
  'point',
  'think',
  'warning',
  'success',
  'candidate_future',
  'reject',
];
```

This config is not editable in M6.7.4. It exists so future UI category editing has one clear source to replace.

## Review Queue Data Model

Pending item:

```json
{
  "id": "angry_pending_001",
  "source": "Angry.vrma",
  "sampleTime": 0.5,
  "status": "pending"
}
```

Classified item:

```json
{
  "id": "warning_001",
  "source": "Angry.vrma",
  "sampleTime": 0.5,
  "status": "classified",
  "category": "warning",
  "score": 4,
  "sourceScore": 4,
  "agentScore": 4,
  "note": "適合提醒、限制或異常狀態。",
  "tags": ["upper_body", "attitude", "quick_review"],
  "exportedPoseFile": "warning_001.json",
  "createdAt": "2026-06-14T00:00:00+08:00"
}
```

Future candidate item:

```json
{
  "id": "candidate_future_001",
  "source": "Jump.vrma",
  "sampleTime": 1.2,
  "status": "classified",
  "category": "candidate_future",
  "score": 4,
  "sourceScore": 5,
  "agentScore": 2,
  "reason": "requires_weight_shift",
  "note": "原始動作有價值，但目前 Agent Pose 鎖下半身後失衡。",
  "tags": ["future_candidate", "requires_lower_body", "quick_review"],
  "exportedPoseFile": "candidate_future_001.json",
  "createdAt": "2026-06-14T00:00:00+08:00"
}
```

Reject item:

```json
{
  "id": "reject_001",
  "source": "Clapping.vrma",
  "sampleTime": 1.2,
  "status": "classified",
  "category": "reject",
  "score": 1,
  "sourceScore": 2,
  "agentScore": 1,
  "rejectReason": "hands_cover_face",
  "note": "手遮住臉，不適合 Agent 回覆狀態。",
  "tags": ["negative_sample", "quick_review"],
  "exportedPoseFile": "reject_001.json",
  "createdAt": "2026-06-14T00:00:00+08:00"
}
```

## Queue Generation

The lab should auto-generate pending queue items from every available VRMA example.

Default sample points per file:

```text
0
duration * 0.25
duration * 0.5
duration * 0.75
duration - 0.001
```

Rules:

- Clamp every sample time through the existing sample-time clamp helper.
- Avoid the exact `sampleTime === duration` loop boundary.
- Deduplicate sample times after rounding to three decimals.
- Deterministic export matters: repeated generation with the same files and durations must produce the same queue order and IDs.
- If duration is unknown before loading, generate a provisional first-frame pending item, then expand after load metadata is known.

Pending ID format:

```text
<source_slug>_pending_<NNN>
```

Examples:

```text
angry_pending_001
thinking_pending_004
```

## Classification Behavior

Quick Review has two modes:

1. Selected queue item exists:
   - Update that item.
   - Set `status: "classified"`.
   - Replace pending ID with category sequence ID, such as `warning_001`.
   - Preserve `source` and `sampleTime`.
   - Apply Quick Review defaults for score, tags, note, reasons.

2. No queue item selected:
   - Preserve current append behavior.
   - Use duplicate guard to prevent repeated accidental entries.

Reclassification:

- Clicking a classified item selects it.
- Pressing another Quick Review category overwrites its classification.
- The old category sequence ID may change to the new category ID.
- `createdAt` is updated only when the item first becomes classified.
- Add `updatedAt` when an already classified item is reclassified.

Undo:

- Existing "撤銷上一筆" remains.
- If the last action classified a pending item, undo restores that item to `status: "pending"`.
- If the last action appended a new item outside the queue, undo removes it.

## UI Design

Keep the current right-side control panel. Add one compact Review Queue section below Quick Review and above Advanced Mining.

Interface language is Chinese-first. All buttons, state labels, filters, helper text, warning messages, and export-facing labels should default to Traditional Chinese. English can be kept as a small secondary label where it helps debugging or developer recognition, but no core workflow should depend on English-only labels.

Chinese-first labels:

```text
審核清單 / Review Queue
待分類
已分類
全部
產生清單
下一筆
上一筆
重新分類
```

Queue row content:

```text
Angry.vrma @ 0.500s
待分類
```

Classified row content:

```text
warning_001
Angry.vrma @ 0.500s / warning / 4 分
```

Interactions:

- Clicking a row selects it.
- Selected row loads source VRMA when needed.
- Selected row moves the time slider to `sampleTime`.
- Selected row samples that time and applies the current preview mode.
- Quick Review buttons classify or reclassify the selected row.
- `下一筆` jumps to the next pending item.
- `上一筆` jumps to the previous queue item.
- `全部 / 待分類 / 已分類` filter the visible queue.

Visual direction:

- Keep current dark lab palette.
- Use small dense rows, not large cards.
- Pending rows should be neutral.
- Classified rows should show category color hints.
- Reject rows should be visibly muted but still readable.
- Candidate future rows should be distinct from reject.

## Export Behavior

`mining_log.json` exports all classified items by default.

Add an option later for exporting pending items; M6.7.4 can include pending items only when the user explicitly enables "包含待分類". If that checkbox is not implemented in the first cut, export only classified items.

The exported classified entries must retain:

- `status`
- `source`
- `sampleTime`
- `category`
- `score`
- `sourceScore`
- `agentScore`
- `reason` or `rejectReason`
- `note`
- `tags`
- `exportedPoseFile`
- `createdAt`
- `updatedAt` when present

## Acceptance Criteria

- Lab can generate a deterministic pending queue from all VRMA examples.
- Each VRMA gets up to five sample points.
- Clicking a pending item loads the correct file and sample time.
- Original / Agent Pose switch still works for selected queue items.
- Quick Review classifies selected queue items without appending duplicates.
- Reclassifying a selected item overwrites the category and keeps source/sampleTime.
- `candidate_future` is not treated as reject.
- Undo restores a classified pending item back to pending.
- Exported `mining_log.json` contains classified queue entries with `status: "classified"`.
- UI labels are Chinese-first.
- No core workflow requires English-only labels.
- Existing standalone importer tests continue to pass.
- Browser smoke confirms selecting, classifying, reclassifying, undoing, and exporting.

## Test Plan

Standalone Node tests in `scratch/test_motion_template_importer.mjs` should cover:

- Review Queue UI contract exists.
- Fixed categories config exists.
- Pending queue item schema includes `status: "pending"`.
- Classified mining entry schema includes `status: "classified"`.
- Queue generation uses deterministic sample points.
- Queue generation avoids `sampleTime === duration`.
- Quick Review selected item path updates instead of appending.
- Reclassification writes `updatedAt`.
- Undo restores pending status for queue-origin entries.
- Export excludes pending entries unless an explicit include-pending option exists.

Browser smoke should cover:

1. Open `motion_template_lab.html`.
2. Generate Review Queue.
3. Select `Angry.vrma @ 0.000s`.
4. Press Warning.
5. Confirm row becomes `warning_001`.
6. Press Think on the same selected row.
7. Confirm row becomes `think_001` and no duplicate row is added.
8. Press Undo.
9. Confirm row returns to pending.
10. Confirm console has no new error or warning.

## Implementation Notes

Keep the implementation local to:

```text
motion_template_lab.html
scratch/test_motion_template_importer.mjs
```

Only add helper files if the lab script becomes too large to keep maintainable.

Prefer pure data helpers:

```js
buildReviewQueueItems(files, durations)
classifyReviewQueueItem(item, preset, sequence)
reclassifyReviewQueueItem(item, preset, sequence)
getVisibleReviewQueueItems(filter)
```

Do not move mining behavior into runtime controllers. This is a lab-only mining workflow.

## Risks

- Queue UI can become too dense. Mitigation: keep rows compact and filters simple.
- Classification and append paths can drift. Mitigation: route both through one mining entry builder.
- Pending export could pollute reviewed data. Mitigation: export classified entries by default.
- Sample point generation can create duplicate timestamps on short clips. Mitigation: round and dedupe.
- Moving files into `raw/` can break existing examples. Mitigation: add fallback path first.

## Open Decisions

No unresolved design blockers.

The first implementation will auto-generate up to five pending samples per VRMA and keep category editing out of scope.
