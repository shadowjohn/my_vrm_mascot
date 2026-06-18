import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(scriptName, args = []) {
  const result = spawnSync('python', [join('scripts', scriptName), ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${scriptName} failed: ${result.stderr || result.stdout}`);
  return result;
}

const dir = mkdtempSync(join(tmpdir(), 'alicia-world-motion-'));
const fixture = join(dir, 'fixture.json');
const output = join(dir, 'output.json');
writeFileSync(fixture, JSON.stringify({
  ok: true,
  source: 'fixture',
  frames: [{
    t: 0.033,
    bodyYawDegrees: -82.5,
    rootTranslation: { x: 0.02, y: 0, z: 0.14 },
    footContact: { left: true, right: false },
    confidence: 0.78
  }]
}), 'utf8');

run('gvhmr_lift.py', ['--fixture-json', fixture, '--output-json', output, '--static-camera']);
const gvhmr = JSON.parse(readFileSync(output, 'utf8'));
assert.equal(gvhmr.ok, true);
assert.equal(gvhmr.source, 'gvhmr');
assert.equal(gvhmr.metadata.staticCamera, true);
assert.equal(gvhmr.frames[0].bodyYawDegrees, -82.5);

run('wham_lift.py', ['--fixture-json', fixture, '--output-json', output]);
const wham = JSON.parse(readFileSync(output, 'utf8'));
assert.equal(wham.ok, true);
assert.equal(wham.source, 'wham');
assert.equal(wham.frames[0].footContact.left, true);

const fakeGvhmrRoot = join(dir, 'GVHMR');
mkdirSync(join(fakeGvhmrRoot, 'tools', 'demo'), { recursive: true });
writeFileSync(join(fakeGvhmrRoot, 'tools', 'demo', 'demo.py'), 'print("fake gvhmr")\n', 'utf8');
const videoPath = join(dir, 'sample.mp4');
writeFileSync(videoPath, 'fake-video', 'utf8');

run('gvhmr_lift.py', [
  '--gvhmr-root', fakeGvhmrRoot,
  '--video-path', videoPath,
  '--output-json', output,
  '--static-camera',
  '--dry-run'
]);
const dryRun = JSON.parse(readFileSync(output, 'utf8'));
assert.equal(dryRun.ok, false);
assert.equal(dryRun.source, 'gvhmr');
assert.equal(dryRun.reason, 'dry_run');
assert.equal(dryRun.metadata.staticCamera, true);
assert.ok(Array.isArray(dryRun.metadata.command));
assert.ok(dryRun.metadata.command.some((part) => String(part).replaceAll('\\', '/').endsWith('tools/demo/demo.py')));
assert.ok(dryRun.metadata.command.includes(`--video=${videoPath}`));
assert.ok(dryRun.metadata.command.includes('-s'));

run('gvhmr_lift.py', ['--video-path', 'missing.mp4', '--output-json', output]);
const missing = JSON.parse(readFileSync(output, 'utf8'));
assert.equal(missing.ok, false);
assert.equal(missing.source, 'gvhmr');
assert.equal(missing.reason, 'missing_dependency');

console.log('PASS test_world_motion_cli_stubs');
