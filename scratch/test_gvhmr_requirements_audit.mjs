import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function runAudit(requirementsPath, args = []) {
  const output = join(mkdtempSync(join(tmpdir(), 'alicia-gvhmr-audit-')), 'audit.json');
  const result = spawnSync('python', [
    join('scripts', 'gvhmr_requirements_audit.py'),
    '--requirements', requirementsPath,
    '--output-json', output,
    ...args
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(readFileSync(output, 'utf8'));
}

const dir = mkdtempSync(join(tmpdir(), 'alicia-gvhmr-reqs-'));
const unsafeRequirements = join(dir, 'requirements.txt');
writeFileSync(unsafeRequirements, [
  '--extra-index-url https://download.pytorch.org/whl/cu121',
  'torch==2.3.0+cu121',
  'torchvision==0.18.0+cu121',
  'pytorch3d @ https://example.test/pytorch3d-0.7.6-cp310-cp310-linux_x86_64.whl',
  'numpy==1.23.5'
].join('\n'), 'utf8');

const windowsAudit = runAudit(unsafeRequirements, ['--platform', 'win32']);
assert.equal(windowsAudit.ok, true);
assert.equal(windowsAudit.installSafe, false);
assert.ok(windowsAudit.blockers.some((blocker) => blocker.code === 'linux_wheel_on_windows'));
assert.ok(windowsAudit.warnings.some((warning) => warning.code === 'cuda121_torch_pin'));

const linuxAudit = runAudit(unsafeRequirements, ['--platform', 'linux']);
assert.equal(linuxAudit.ok, true);
assert.equal(linuxAudit.installSafe, true);
assert.equal(linuxAudit.blockers.length, 0);
assert.ok(linuxAudit.warnings.some((warning) => warning.code === 'cuda121_torch_pin'));

console.log('PASS test_gvhmr_requirements_audit');
