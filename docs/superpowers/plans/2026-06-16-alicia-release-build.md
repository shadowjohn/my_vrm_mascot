# Alicia Release Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `build_release.bat vX.Y.Z` that builds a versioned Alicia Runtime release package under `dist/releases/vX.Y.Z/`.

**Architecture:** Keep the Windows entrypoint as a small `.bat` wrapper and put the build logic in `scripts/build_release.ps1`. Add a Node contract/integration test that validates the script contract and runs one local build while preventing recursive test/build loops.

**Tech Stack:** Windows batch, PowerShell 7, Node `assert` tests, static ES modules.

---

### Task 1: Lock Release Build Contracts

**Files:**
- Create: `scratch/test_release_build.mjs`

- [ ] **Step 1: Write failing tests**

Test that `build_release.bat` and `scripts/build_release.ps1` exist, validate `vX.Y.Z`, output to `dist/releases/vX.Y.Z/`, generate `release.json`, include skill docs/examples/docs/manifests, include `asset_manifest.json` VRMA license fields, exclude `scratch` and internal specs, and avoid recursive build invocation when `ALICIA_RELEASE_VERIFY_PHASE=1`.

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
node .\scratch\test_release_build.mjs
```

Expected: FAIL because `build_release.bat` does not exist.

### Task 2: Implement Build Entrypoint and Release Packager

**Files:**
- Create: `build_release.bat`
- Create: `scripts/build_release.ps1`

- [ ] **Step 1: Add BAT wrapper**

The wrapper calls `pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts/build_release.ps1 %*`.

- [ ] **Step 2: Add PowerShell packager**

The packager validates `vX.Y.Z`, runs verification, refuses existing output, creates `dist/releases/vX.Y.Z/`, copies allowlisted runtime files, approved local assets, manifests, docs, skill files, examples, and writes `release.json`.

- [ ] **Step 3: Run release build test**

Run:

```powershell
node .\scratch\test_release_build.mjs
```

Expected: PASS and output exists under `dist/releases/v0.0.0/`.

### Task 3: Verify and Commit

**Files:**
- Modify: `history.md`
- Test: `scratch/test_release_build.mjs`
- Create: `build_release.bat`
- Create: `scripts/build_release.ps1`

- [ ] **Step 1: Update history**

Record the `build_release.bat` implementation and v0.1.0 packaging contract.

- [ ] **Step 2: Run verification**

Run:

```powershell
$tests = Get-ChildItem -LiteralPath .\scratch -Filter test_*.mjs | Sort-Object Name
foreach ($test in $tests) {
  node $test.FullName
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
python .\scratch\test_motion_profile_api.py
python -m py_compile .\server.py
git diff --check
git diff --cached --check
```

- [ ] **Step 3: Commit**

```powershell
git add build_release.bat scripts/build_release.ps1 scratch/test_release_build.mjs docs/superpowers/plans/2026-06-16-alicia-release-build.md history.md
git commit -m "feat: add Alicia release build script"
```
