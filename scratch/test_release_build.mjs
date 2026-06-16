import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const VERSION = 'v0.0.0';
const RELEASE_DIR = join('dist', 'releases', VERSION);
const VERIFY_PHASE = process.env.ALICIA_RELEASE_VERIFY_PHASE === '1';

function read(path) {
  return readFileSync(path, 'utf8');
}

function listFiles(root) {
  const results = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else {
        results.push(relative(root, path).replaceAll('\\', '/'));
      }
    }
  }
  walk(root);
  return results.sort();
}

function runBuild(args) {
  return spawnSync('cmd.exe', ['/c', 'build_release.bat', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env },
  });
}

function assertFile(path) {
  assert.equal(existsSync(path), true, `${path} should exist`);
}

function testReleaseBuildScriptsExistAndUseExpectedContracts() {
  assertFile('build_release.bat');
  assertFile('scripts/build_release.ps1');

  const bat = read('build_release.bat');
  const ps1 = read('scripts/build_release.ps1');

  assert.match(bat, /pwsh/i);
  assert.match(bat, /scripts[\\\/]build_release\.ps1/i);
  assert.match(ps1, /dist[\\\/]releases/i);
  assert.ok(ps1.includes("^v\\d+\\.\\d+\\.\\d+$"), 'script should validate vX.Y.Z versions');
  assert.ok(ps1.includes("'diff', '--cached', '--check'"), 'script should run git diff --cached --check');
  assert.match(ps1, /ALICIA_RELEASE_VERIFY_PHASE/);
  assert.doesNotMatch(ps1, /dist[\\\/]alicia[\\\/]releases/i);
}

function testInvalidVersionIsRejected() {
  const result = runBuild(['0.0.0']);
  assert.notEqual(result.status, 0, 'build should reject versions without leading v');
  assert.match(`${result.stdout}\n${result.stderr}`, /vX\.Y\.Z|version/i);
}

function testReleaseBuildCreatesVersionedPackage() {
  if (VERIFY_PHASE) {
    return;
  }

  rmSync(RELEASE_DIR, { recursive: true, force: true });
  const result = runBuild([VERSION]);
  assert.equal(
    result.status,
    0,
    `build_release.bat should succeed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
  );

  assertFile(join(RELEASE_DIR, 'alicia-runtime.js'));
  assertFile(join(RELEASE_DIR, 'release.json'));
  assertFile(join(RELEASE_DIR, 'README.md'));
  assertFile(join(RELEASE_DIR, 'manifests', 'asset_manifest.json'));
  assertFile(join(RELEASE_DIR, 'manifests', 'semantic_motion_library.json'));
  assertFile(join(RELEASE_DIR, 'manifests', 'semantic_motion_registry.json'));
  assertFile(join(RELEASE_DIR, 'skills', 'alicia-skill-bridge.schema.json'));
  assertFile(join(RELEASE_DIR, 'skills', 'alicia-skill.md'));
  assertFile(join(RELEASE_DIR, 'skills', 'alicia-skill.examples.md'));
  assertFile(join(RELEASE_DIR, 'examples', 'basic_embed.html'));
  assertFile(join(RELEASE_DIR, 'examples', 'step_threejs_adapter.example.js'));
  assertFile(join(RELEASE_DIR, 'docs', 'usage.md'));
  assertFile(join(RELEASE_DIR, 'docs', 'release-notes.md'));
  assertFile(join(RELEASE_DIR, 'docs', 'asset-policy.md'));

  const release = JSON.parse(read(join(RELEASE_DIR, 'release.json')));
  assert.equal(release.version, '0.0.0');
  assert.equal(release.entry, 'alicia-runtime.js');
  assert.equal(release.skillSchema, 'skills/alicia-skill-bridge.schema.json');
  assert.deepEqual(release.examples, [
    'examples/basic_embed.html',
    'examples/step_threejs_adapter.example.js',
  ]);

  const assetManifest = JSON.parse(read(join(RELEASE_DIR, 'manifests', 'asset_manifest.json')));
  assert.ok(Array.isArray(assetManifest.assets));
  const vrmaAssets = assetManifest.assets.filter((asset) => asset.type === 'vrma');
  assert.ok(vrmaAssets.length > 0, 'release should include approved demo VRMA assets when restored locally');
  for (const asset of vrmaAssets) {
    assert.equal(typeof asset.path, 'string');
    assert.equal(typeof asset.source, 'string');
    assert.equal(asset.licenseStatus, 'approved');
    assert.equal(asset.distributable, true);
  }

  const files = listFiles(RELEASE_DIR);
  assert.equal(files.some((file) => file.startsWith('scratch/')), false);
  assert.equal(files.some((file) => file.startsWith('local_assets/')), false);
  assert.equal(files.some((file) => file.startsWith('docs/superpowers/specs/')), false);
  assert.equal(files.includes('motion_template_lab.html'), false);
}

async function run() {
  const tests = [
    testReleaseBuildScriptsExistAndUseExpectedContracts,
    testInvalidVersionIsRejected,
    testReleaseBuildCreatesVersionedPackage,
  ];

  for (const test of tests) {
    await test();
    console.log(`PASS ${test.name}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
