# M20.4 Phase 2A GVHMR Adapter Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:test-driven-development. Keep GVHMR optional and never block the existing Motion Capture Lab when the research dependency is absent.

**Goal:** Move `scripts/gvhmr_lift.py` from a fixture-only stub to a real provider boundary that can locate a local GVHMR checkout, build the official demo command, pass static-camera mode, and return typed JSON for dry-run / missing dependency / pending parser states.

**Scope:** This phase does not parse GVHMR raw output into per-frame Alicia world-motion yet. That parser must wait until a real GVHMR run produces an observed output shape on this Windows/CUDA machine.

---

### Task 1: Test the GVHMR Provider Boundary

**Files:**
- Modify: `scratch/test_world_motion_cli_stubs.mjs`

- [ ] Extend the CLI test to create a fake GVHMR checkout with `tools/demo/demo.py`.
- [ ] Assert `--dry-run` emits `{ ok: false, reason: "dry_run" }` with a `metadata.command` array.
- [ ] Assert `--static-camera` maps to GVHMR `-s`.
- [ ] Assert missing checkout or missing demo script still returns typed `missing_dependency`.

### Task 2: Implement `gvhmr_lift.py` Phase 2A

**Files:**
- Modify: `scripts/gvhmr_lift.py`

- [ ] Add `--gvhmr-root`, `--python-exe`, and `--dry-run`.
- [ ] Resolve the official demo script at `tools/demo/demo.py`.
- [ ] Build a subprocess command that includes the video path and `-s` for static camera.
- [ ] Keep fixture mode behavior unchanged.
- [ ] Return non-throwing JSON for missing video, missing checkout, dry-run, and parser-pending states.

### Task 3: Local Environment Bootstrap

**Files:**
- Untracked/ignored only: `conda_vm/gvhmr/env`

- [ ] Use local `micromamba` to create `conda_vm/gvhmr/env` with Python 3.10 when it does not already exist.
- [ ] Do not commit anything under `conda_vm/`.
- [ ] Record whether the environment was created successfully in `history.md`.

### Task 4: Verification, History, Push

**Files:**
- Modify: `history.md`

- [ ] Run focused CLI and world-motion tests.
- [ ] Compile Python scripts.
- [ ] Run `git diff --check`.
- [ ] Update `history.md`.
- [ ] Commit and push the feature branch.
