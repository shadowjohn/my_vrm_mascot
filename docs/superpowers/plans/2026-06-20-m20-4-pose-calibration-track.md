# M20.4 Pose Calibration Track Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a same-video pose calibration track to `pose_training_lab.html`.

**Architecture:** Keep keyframes in the existing JSON model. Add a small track UI, a numeric interpolation helper, and one shared ordered bone list used by the select and Alicia click picker.

**Tech Stack:** Plain HTML/JavaScript, existing assert-based Node tests.

---

### Task 1: Track UI Contract

**Files:**
- Modify: `scratch/test_pose_training_lab.mjs`
- Modify: `pose_training_lab.html`

- [ ] Add failing tests for track DOM ids, inference functions, and numbered bone list.
- [ ] Run `node scratch\test_pose_training_lab.mjs` and verify it fails.
- [ ] Add the smallest HTML/JS implementation to pass.
- [ ] Run `node scratch\test_pose_training_lab.mjs`.
- [ ] Run `git diff --check -- pose_training_lab.html scratch/test_pose_training_lab.mjs`.
