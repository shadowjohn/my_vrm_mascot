import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function runAssetCheck(args = []) {
  const result = spawnSync('python', [join('scripts', 'gvhmr_asset_check.py'), ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const dir = mkdtempSync(join(tmpdir(), 'alicia-gvhmr-assets-'));
const fakeRoot = join(dir, 'GVHMR');
mkdirSync(fakeRoot, { recursive: true });

const missing = runAssetCheck(['--gvhmr-root', fakeRoot]);
assert.equal(missing.ok, false);
assert.ok(Array.isArray(missing.missing));
assert.ok(missing.missing.includes('inputs/checkpoints/gvhmr/gvhmr_siga24_release.ckpt'));
assert.ok(missing.missing.includes('inputs/checkpoints/hmr2/epoch=10-step=25000.ckpt'));
assert.ok(missing.missing.includes('inputs/checkpoints/vitpose/vitpose-h-multi-coco.pth'));
assert.ok(missing.missing.includes('inputs/checkpoints/yolo/yolov8x.pt'));
assert.ok(missing.missing.includes('inputs/checkpoints/body_models/smpl'));
assert.ok(missing.missing.includes('inputs/checkpoints/body_models/smplx'));
assert.ok(missing.missing.includes('inputs/checkpoints/body_models/smpl/SMPL_NEUTRAL.pkl'));
assert.ok(missing.missing.includes('inputs/checkpoints/body_models/smplx/SMPLX_NEUTRAL.npz'));
assert.ok(missing.missingBodyModelFiles.includes('inputs/checkpoints/body_models/smpl/SMPL_NEUTRAL.pkl'));
assert.ok(missing.missingBodyModelFiles.includes('inputs/checkpoints/body_models/smplx/SMPLX_NEUTRAL.npz'));

for (const file of [
  'inputs/checkpoints/gvhmr/gvhmr_siga24_release.ckpt',
  'inputs/checkpoints/hmr2/epoch=10-step=25000.ckpt',
  'inputs/checkpoints/vitpose/vitpose-h-multi-coco.pth',
  'inputs/checkpoints/yolo/yolov8x.pt'
]) {
  const path = join(fakeRoot, ...file.split('/'));
  mkdirSync(path.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  writeFileSync(path, 'fake-checkpoint', 'utf8');
}

mkdirSync(join(fakeRoot, 'inputs', 'checkpoints', 'body_models', 'smpl'), { recursive: true });
mkdirSync(join(fakeRoot, 'inputs', 'checkpoints', 'body_models', 'smplx'), { recursive: true });

const emptyBodyModels = runAssetCheck(['--gvhmr-root', fakeRoot]);
assert.equal(emptyBodyModels.ok, false);
assert.deepEqual(emptyBodyModels.missingCheckpoints, []);
assert.deepEqual(emptyBodyModels.missingModelDirs, []);
assert.ok(emptyBodyModels.missingBodyModelFiles.includes('inputs/checkpoints/body_models/smpl/SMPL_NEUTRAL.pkl'));
assert.ok(emptyBodyModels.missingBodyModelFiles.includes('inputs/checkpoints/body_models/smplx/SMPLX_NEUTRAL.npz'));

for (const file of [
  'inputs/checkpoints/body_models/smpl/SMPL_NEUTRAL.pkl',
  'inputs/checkpoints/body_models/smplx/SMPLX_NEUTRAL.npz'
]) {
  const path = join(fakeRoot, ...file.split('/'));
  writeFileSync(path, 'fake-body-model', 'utf8');
}

const ready = runAssetCheck(['--gvhmr-root', fakeRoot]);
assert.equal(ready.ok, true);
assert.deepEqual(ready.missing, []);
assert.deepEqual(ready.missingCheckpoints, []);
assert.deepEqual(ready.missingModelDirs, []);
assert.deepEqual(ready.missingBodyModelFiles, []);

console.log('PASS test_gvhmr_asset_check');
