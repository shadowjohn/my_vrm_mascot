# Alicia Showcase Pack Design

## Goal

v0.1.2 turns the 172 human-described VRMA mining profiles into a stronger public demo experience.

The release demo should no longer depend only on the 11 starter VRMA files and hand-written scene events. It should consume mined descriptions, semantic motion registry data, and a curated showcase motion pack.

## Boundary

This phase produces showcase data and updates the demo page. It does not add formal VRMA playback to `MotionController`, does not modify `ActionQueue`, and does not connect showcase motions to production `performIntent` runtime behavior.

Full local mining data stays local. The public release receives only curated showcase assets and explicit asset metadata.

## Data Flow

```text
motion_profiles.json
semantic_motion_registry.json
semantic_motion_library.json
  -> scratch/generate_showcase_pack.mjs
  -> showcase_motion_pack.json
  -> showcase_events.json
  -> demo.php Director events
```

`showcase_motion_pack.json` selects representative motions across semantic families. `showcase_events.json` turns those selected motions into Director-friendly story events with text generated from the human motion description, usage description, and Agent usage fields.

## Release Packaging

The release builder copies:

- `demo.php`
- `manifests/showcase_motion_pack.json`
- `manifests/showcase_events.json`
- selected VRMA files under `motions/showcase/`

Approved demo assets keep `licenseStatus: "approved"`. Mining corpus assets keep `licenseStatus: "research_preview"` and their original `distributable` flag from the generated pack.

## Acceptance Criteria

- Showcase pack contains at least 20 selected motions.
- Showcase events cover the 10 first semantic motion seeds.
- Demo prefers showcase events when present and falls back to semantic motion catalog when absent.
- Release packages include showcase manifests and selected motion files.
- Asset manifest preserves license status and distributable fields for every VRMA.
- No production Agent Runtime behavior changes.
