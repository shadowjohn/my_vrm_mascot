# M6.7.4 Review Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Chinese-first Review Queue to Motion Template Lab so VRMA samples can be batch reviewed, classified, reclassified, undone, and exported as mining data.

**Architecture:** Keep the feature local to Motion Template Lab. Add queue state and pure helpers inside `motion_template_lab.html`, reuse existing Quick Review presets and `buildMotionMiningEntry()`, and keep runtime controllers untouched.

**Tech Stack:** Static HTML/CSS/ES modules, Three.js VRMA preview, existing standalone Node contract tests.

---

### Task 1: Lock Review Queue Contracts

**Files:**
- Modify: `scratch/test_motion_template_importer.mjs`

- [ ] **Step 1: Add failing contract tests**

Add tests that assert:

```js
function testLabIncludesReviewQueueControls() {
  const html = read(LAB_PATH);

  assert.match(html, /id="reviewQueuePanel"/);
  assert.match(html, /審核清單/);
  assert.match(html, /id="btnGenerateReviewQueue"/);
  assert.match(html, /id="reviewQueueFilter"/);
  assert.match(html, /id="btnReviewPrevious"/);
  assert.match(html, /id="btnReviewNext"/);
  assert.match(html, /id="reviewQueueList"/);
  assert.match(html, /function\s+buildReviewQueueItems\s*\(/);
  assert.match(html, /function\s+selectReviewQueueItem\s*\(/);
  assert.match(html, /function\s+classifySelectedReviewItem\s*\(/);
}
```

Add tests that assert:

```js
function testReviewQueueUsesChineseFirstLabels() {
  const html = read(LAB_PATH);

  assert.match(html, /待分類/);
  assert.match(html, /已分類/);
  assert.match(html, /全部/);
  assert.match(html, /產生清單/);
  assert.match(html, /上一筆/);
  assert.match(html, /下一筆/);
  assert.doesNotMatch(html, />\\s*Generate Queue\\s*</);
  assert.doesNotMatch(html, />\\s*Pending\\s*</);
  assert.doesNotMatch(html, />\\s*Classified\\s*</);
}
```

Add tests that assert helper contracts:

```js
function testReviewQueueSchemaAndBehaviorContracts() {
  const html = read(LAB_PATH);

  assert.match(html, /const\s+MINING_CATEGORIES\s*=/);
  assert.match(html, /status:\s*'pending'/);
  assert.match(html, /status:\s*'classified'/);
  assert.match(html, /duration\s*-\s*0\.001/);
  assert.match(html, /selectedReviewQueueId/);
  assert.match(html, /updatedAt/);
  assert.match(html, /reviewActionHistory/);
  assert.match(html, /entry\.status\s*===\s*'classified'/);
}
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
node .\scratch\test_motion_template_importer.mjs
```

Expected: FAIL because Review Queue controls and helpers do not exist.

### Task 2: Implement Review Queue UI and State

**Files:**
- Modify: `motion_template_lab.html`

- [ ] **Step 1: Add Chinese-first markup**

Add a `reviewQueuePanel` section below Quick Review with Chinese labels, filter, generate, previous, next, and list controls.

- [ ] **Step 2: Add state and helper functions**

Add:

```js
const MINING_CATEGORIES = [...MOTION_MINING_CATEGORIES];
const reviewQueue = [];
const reviewActionHistory = [];
let selectedReviewQueueId = '';
```

Implement deterministic queue helpers:

```js
buildReviewQueueItems(files, durations)
getReviewSampleTimes(duration)
selectReviewQueueItem(id)
classifySelectedReviewItem(category)
renderReviewQueue()
```

- [ ] **Step 3: Route Quick Review through selected queue item**

If a queue item is selected, classify or reclassify it. If no queue item is selected, keep existing append behavior.

- [ ] **Step 4: Update undo behavior**

If the last action came from the queue, restore the previous queue item snapshot. Otherwise remove the last appended mining entry.

- [ ] **Step 5: Export only classified entries**

Change mining log export to include only `status === "classified"` entries where status exists, while preserving current standalone candidate behavior.

### Task 3: Verify and Commit

**Files:**
- Test: `scratch/test_motion_template_importer.mjs`
- Verify: `motion_template_lab.html`

- [ ] **Step 1: Run Node tests**

```powershell
node .\scratch\test_motion_template_importer.mjs
node .\scratch\test_semantic_pose_binding.mjs
node .\scratch\test_character_inspector_ui.mjs
```

- [ ] **Step 2: Run Python and diff checks**

```powershell
python -m py_compile .\server.py
git diff --check
```

- [ ] **Step 3: Browser smoke**

Open `http://127.0.0.1:8765/motion_template_lab.html`, generate the queue, select `Angry.vrma @ 0.000s`, classify as warning, reclassify as think, undo back to pending, export, and confirm no console errors.

- [ ] **Step 4: Commit**

```powershell
git add -- docs/superpowers/plans/2026-06-14-m6-7-4-review-queue.md motion_template_lab.html scratch/test_motion_template_importer.mjs
git commit -m "feat: add motion mining review queue"
```
