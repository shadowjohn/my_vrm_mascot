import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'alicia-gvhmr-prepare-'));
const fakeRoot = join(dir, 'GVHMR');
mkdirSync(fakeRoot, { recursive: true });

const result = spawnSync('python', [
  join('scripts', 'gvhmr_prepare_assets.py'),
  '--gvhmr-root', fakeRoot,
  '--skip-download'
], {
  cwd: process.cwd(),
  encoding: 'utf8'
});

assert.equal(result.status, 0, result.stderr || result.stdout);
const report = JSON.parse(result.stdout);

assert.equal(report.ok, false);
assert.equal(report.downloadAttempted, false);
assert.equal(report.downloadableReady, false);
assert.equal(report.manualReady, false);
assert.match(report.driveFolderUrl, /drive\.google\.com\/drive\/folders\/1eebJ13FUEXrKBawHpJroW0sNSxLjh9xD/);
assert.ok(report.missingDownloadable.includes('inputs/checkpoints/gvhmr/gvhmr_siga24_release.ckpt'));
assert.ok(report.missingBodyModelFiles.includes('inputs/checkpoints/body_models/smpl/SMPL_NEUTRAL.pkl'));
assert.ok(report.missingBodyModelFiles.includes('inputs/checkpoints/body_models/smplx/SMPLX_NEUTRAL.npz'));

for (const dirPath of [
  'inputs/checkpoints/gvhmr',
  'inputs/checkpoints/hmr2',
  'inputs/checkpoints/vitpose',
  'inputs/checkpoints/yolo',
  'inputs/checkpoints/body_models/smpl',
  'inputs/checkpoints/body_models/smplx'
]) {
  assert.equal(existsSync(join(fakeRoot, ...dirPath.split('/'))), true, `${dirPath} should be created`);
}

assert.equal(existsSync(report.manualChecklistPath), true, 'manual checklist should be written');
const checklist = readFileSync(report.manualChecklistPath, 'utf8');
assert.match(checklist, /SMPL_NEUTRAL\.pkl/);
assert.match(checklist, /SMPLX_NEUTRAL\.npz/);
assert.match(checklist, /https:\/\/smpl\.is\.tue\.mpg\.de\//);
assert.match(checklist, /https:\/\/smpl-x\.is\.tue\.mpg\.de\//);

const script = readFileSync(join('scripts', 'gvhmr_prepare_assets.py'), 'utf8');
assert.match(script, /gdown/);
assert.match(script, /--skip-download/);

const bat = readFileSync(join('conda_vm', 'gvhmr_prepare_assets.bat'), 'utf8');
assert.match(bat, /gvhmr\\env\\python\.exe/);
assert.match(bat, /gvhmr_prepare_assets\.py/);
assert.match(bat, /%\*/);

console.log('PASS test_gvhmr_prepare_assets');
