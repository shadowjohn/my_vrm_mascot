# M20.4 Phase 2B GVHMR Local Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:test-driven-development. Keep all cloned research code, conda env files, checkpoints, and model weights under ignored `conda_vm/`.

**Goal:** Bootstrap a local GVHMR checkout far enough to know what is ready, what is missing, and whether Windows/CUDA 12.8 can proceed without breaking the Motion Capture Lab.

**Architecture:** Add a tiny repository-owned readiness checker that inspects the ignored GVHMR environment and checkout, then attempt the external clone/install in `conda_vm/gvhmr`. The checker reports structured JSON so later server/UI code can surface clear provider setup details.

**Tech Stack:** Python 3 JSON CLI, Node `assert` scratch tests, local `micromamba` prefix env, external GVHMR Git checkout.

---

### Task 1: GVHMR Environment Checker

**Files:**
- Create: `scripts/gvhmr_env_check.py`
- Create: `scratch/test_gvhmr_env_check.mjs`

- [ ] Write a failing Node scratch test that creates a fake GVHMR checkout with `tools/demo/demo.py` and `requirements.txt`.
- [ ] Assert the checker returns JSON with `checks.envPython.ok`, `checks.demoScript.ok`, `checks.requirements.ok`, and missing checkpoint details.
- [ ] Assert a missing checkout returns `ready: false` with `reason: "missing_gvhmr_root"`.
- [ ] Implement the checker with defaults:
  - `--env-python conda_vm/gvhmr/env/python.exe`
  - `--gvhmr-root conda_vm/gvhmr/GVHMR`
  - `--skip-imports` for structural checks before requirements are installed.
- [ ] Run the test and Python compile check.

### Task 2: Ignored GVHMR Checkout

**Files:**
- Ignored: `conda_vm/gvhmr/GVHMR`

- [ ] Clone `https://github.com/zju3dv/GVHMR.git` into `conda_vm/gvhmr/GVHMR` if absent.
- [ ] Inspect `requirements.txt` before installing to catch Python/torch/CUDA pin risks.
- [ ] Run `scripts/gvhmr_env_check.py --skip-imports` against the real checkout.

### Task 3: Dependency Attempt

**Files:**
- Create: `scripts/gvhmr_requirements_audit.py`
- Create: `scratch/test_gvhmr_requirements_audit.mjs`
- Ignored: `conda_vm/gvhmr/env`

- [ ] Add a requirements audit that flags platform-specific wheels and CUDA / torch pins before running pip.
- [ ] If requirements look safe for this Windows/CUDA 12.8 machine, try `python -m pip install -r conda_vm/gvhmr/GVHMR/requirements.txt`.
- [ ] If requirements pin an incompatible torch/CUDA stack or fail on Windows-only build issues, stop and record the exact blocker instead of forcing a broken install.
- [ ] Run `scripts/gvhmr_env_check.py` without `--skip-imports` and record the current readiness state.

### Task 4: History, Verification, Commit

**Files:**
- Modify: `history.md`

- [ ] Run focused tests:
  - `node .\scratch\test_gvhmr_env_check.mjs`
  - `node .\scratch\test_gvhmr_requirements_audit.mjs`
  - `node .\scratch\test_world_motion_cli_stubs.mjs`
  - `python -m py_compile .\scripts\gvhmr_env_check.py .\scripts\gvhmr_requirements_audit.py .\scripts\gvhmr_lift.py`
  - `git diff --check`
- [ ] Update `history.md` with clone/install/checker results.
- [ ] Commit only tracked project files; do not add `conda_vm/`.
- [ ] Pull/rebase and push the feature branch.
