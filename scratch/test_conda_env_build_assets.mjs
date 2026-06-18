import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const expectedFiles = [
  'conda_vm/micromamba_build_conda_env.bat',
  'conda_vm/motionBERT_build_conda_env.bat',
  'conda_vm/gvhmr_build_conda_env.bat',
  'conda_vm/server_build_conda_env.bat',
  'conda_vm/micromamba_requirements.txt',
  'conda_vm/motionBERT_requirements.txt',
  'conda_vm/gvhmr_requirements.txt',
  'conda_vm/server_requirements.txt'
];

for (const file of expectedFiles) {
  assert.equal(existsSync(file), true, `${file} should exist`);
  const ignore = spawnSync('git', ['check-ignore', '-q', file], { cwd: process.cwd() });
  assert.notEqual(ignore.status, 0, `${file} should be trackable despite conda_vm ignore rules`);
}

for (const ignoredEnvPath of [
  'conda_vm/gvhmr/env/python.exe',
  'conda_vm/motionBERT/env/python.exe',
  'conda_vm/server/env/python.exe',
  'conda_vm/micromamba/micromamba.exe'
]) {
  const ignore = spawnSync('git', ['check-ignore', '-q', ignoredEnvPath], { cwd: process.cwd() });
  assert.equal(ignore.status, 0, `${ignoredEnvPath} should stay ignored`);
}

const micromambaBat = readFileSync('conda_vm/micromamba_build_conda_env.bat', 'utf8');
assert.match(micromambaBat, /micro\.mamba\.pm\/api\/micromamba\/win-64\/latest/);
assert.match(micromambaBat, /micromamba\.exe/);

const motionBertBat = readFileSync('conda_vm/motionBERT_build_conda_env.bat', 'utf8');
assert.match(motionBertBat, /motionBERT\\env/);
assert.match(motionBertBat, /MotionBERT/);
assert.match(motionBertBat, /motionBERT_requirements\.txt/);

const gvhmrBat = readFileSync('conda_vm/gvhmr_build_conda_env.bat', 'utf8');
assert.match(gvhmrBat, /gvhmr\\env/);
assert.match(gvhmrBat, /GVHMR/);
assert.match(gvhmrBat, /gvhmr_requirements\.txt/);
assert.match(gvhmrBat, /pytorch3d/);

const serverBat = readFileSync('conda_vm/server_build_conda_env.bat', 'utf8');
assert.match(serverBat, /server\\env/);
assert.match(serverBat, /server_requirements\.txt/);

const runServer = readFileSync('run_server.bat', 'utf8');
assert.match(runServer, /conda_vm\\server\\env\\python\.exe/);
assert.match(runServer, /server\.py/);

const stopServer = readFileSync('stop_server.bat', 'utf8');
assert.match(stopServer, /conda_vm\\server\\env\\python\.exe/);
assert.match(stopServer, /scripts\\stop_server\.py/);

const motionBertReq = readFileSync('conda_vm/motionBERT_requirements.txt', 'utf8');
assert.match(motionBertReq, /torch==2\.11\.0\+cu128/);
assert.match(motionBertReq, /easydict==1\.13/);

const gvhmrReq = readFileSync('conda_vm/gvhmr_requirements.txt', 'utf8');
assert.match(gvhmrReq, /torch==2\.11\.0\+cu128/);
assert.match(gvhmrReq, /chumpy==0\.70/);
assert.match(gvhmrReq, /cython_bbox==0\.1\.5/);
assert.match(gvhmrReq, /pytorch3d/);

const serverReq = readFileSync('conda_vm/server_requirements.txt', 'utf8');
assert.match(serverReq, /Flask>=3\.0,<4/);
assert.match(serverReq, /yt-dlp/);
assert.match(serverReq, /mediapipe==0\.10\.14/);

console.log('PASS test_conda_env_build_assets');
