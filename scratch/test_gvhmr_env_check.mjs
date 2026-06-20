import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function runChecker(args = []) {
  const result = spawnSync('python', [join('scripts', 'gvhmr_env_check.py'), ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const pythonPath = spawnSync('python', ['-c', 'import sys; print(sys.executable)'], {
  encoding: 'utf8'
}).stdout.trim();
assert.ok(pythonPath, 'test requires a Python executable');

const dir = mkdtempSync(join(tmpdir(), 'alicia-gvhmr-env-'));
const fakeRoot = join(dir, 'GVHMR');
mkdirSync(join(fakeRoot, 'tools', 'demo'), { recursive: true });
writeFileSync(join(fakeRoot, 'tools', 'demo', 'demo.py'), 'print("fake demo")\n', 'utf8');
writeFileSync(join(fakeRoot, 'requirements.txt'), 'numpy\n', 'utf8');

const structural = runChecker([
  '--env-python', pythonPath,
  '--gvhmr-root', fakeRoot,
  '--skip-imports'
]);
assert.equal(structural.ok, true);
assert.equal(structural.ready, false);
assert.equal(structural.reason, 'missing_checkpoints');
assert.equal(structural.checks.envPython.ok, true);
assert.equal(structural.checks.demoScript.ok, true);
assert.equal(structural.checks.requirements.ok, true);
assert.equal(structural.checks.imports.skipped, true);
assert.ok(structural.missingCheckpoints.includes('inputs/checkpoints/gvhmr/gvhmr_siga24_release.ckpt'));
assert.ok(structural.missingModelDirs.includes('inputs/checkpoints/body_models/smpl'));
assert.ok(structural.missingBodyModelFiles.includes('inputs/checkpoints/body_models/smpl/SMPL_NEUTRAL.pkl'));
assert.ok(structural.missingBodyModelFiles.includes('inputs/checkpoints/body_models/smplx/SMPLX_NEUTRAL.npz'));

for (const file of [
  'inputs/checkpoints/gvhmr/gvhmr_siga24_release.ckpt',
  'inputs/checkpoints/hmr2/epoch=10-step=25000.ckpt',
  'inputs/checkpoints/vitpose/vitpose-h-multi-coco.pth',
  'inputs/checkpoints/yolo/yolov8x.pt',
  'inputs/checkpoints/body_models/smpl/SMPL_NEUTRAL.pkl',
  'inputs/checkpoints/body_models/smplx/SMPLX_NEUTRAL.npz'
]) {
  const path = join(fakeRoot, ...file.split('/'));
  mkdirSync(path.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  writeFileSync(path, 'fake-asset', 'utf8');
}

const ready = runChecker([
  '--env-python', pythonPath,
  '--gvhmr-root', fakeRoot,
  '--skip-imports'
]);
assert.equal(ready.ok, true);
assert.equal(ready.ready, true);
assert.equal(ready.reason, 'ready');
assert.deepEqual(ready.missingCheckpoints, []);
assert.deepEqual(ready.missingModelDirs, []);
assert.deepEqual(ready.missingBodyModelFiles, []);

const missingRoot = runChecker([
  '--env-python', pythonPath,
  '--gvhmr-root', join(dir, 'missing-GVHMR'),
  '--skip-imports'
]);
assert.equal(missingRoot.ok, true);
assert.equal(missingRoot.ready, false);
assert.equal(missingRoot.reason, 'missing_gvhmr_root');
assert.equal(missingRoot.checks.gvhmrRoot.ok, false);

const importFailure = runChecker([
  '--env-python', pythonPath,
  '--gvhmr-root', fakeRoot,
  '--required-import', 'json',
  '--required-import', 'definitely_missing_gvhmr_test_module'
]);
assert.equal(importFailure.ok, true);
assert.equal(importFailure.ready, false);
assert.equal(importFailure.reason, 'missing_imports');
assert.equal(importFailure.checks.imports.ok, false);
assert.deepEqual(importFailure.checks.imports.missingImports, ['definitely_missing_gvhmr_test_module']);

console.log('PASS test_gvhmr_env_check');
