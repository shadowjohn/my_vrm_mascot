import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const expectedFiles = [
  'conda_vm/micromamba_build_conda_env.bat',
  'conda_vm/motionBERT_build_conda_env.bat',
  'conda_vm/gvhmr_build_conda_env.bat',
  'conda_vm/gvhmr_prepare_assets.bat',
  'conda_vm/gvhmr_easy_build_pytorch3d.bat',
  'conda_vm/gvhmr_cuda118_build_conda_env.bat',
  'conda_vm/gvhmr_cuda118_easy_build_pytorch3d.bat',
  'conda_vm/server_build_conda_env.bat',
  'conda_vm/micromamba_requirements.txt',
  'conda_vm/motionBERT_requirements.txt',
  'conda_vm/gvhmr_requirements.txt',
  'conda_vm/gvhmr_cuda118_requirements.txt',
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

const gvhmrPrepareAssetsBat = readFileSync('conda_vm/gvhmr_prepare_assets.bat', 'utf8');
assert.match(gvhmrPrepareAssetsBat, /gvhmr\\env\\python\.exe/);
assert.match(gvhmrPrepareAssetsBat, /gvhmr_prepare_assets\.py/);
assert.match(gvhmrPrepareAssetsBat, /--skip-download/);
assert.match(gvhmrPrepareAssetsBat, /%\*/);
const gvhmrPrepareAssetsHelp = spawnSync('cmd.exe', ['/c', 'conda_vm\\gvhmr_prepare_assets.bat', '--help'], {
  cwd: process.cwd(),
  encoding: 'utf8'
});
assert.equal(gvhmrPrepareAssetsHelp.status, 0, gvhmrPrepareAssetsHelp.stderr || gvhmrPrepareAssetsHelp.stdout);
assert.match(gvhmrPrepareAssetsHelp.stdout, /Prepare GVHMR model assets/);
assert.match(gvhmrPrepareAssetsHelp.stdout, /--skip-download/);

const gvhmrPytorch3dBat = readFileSync('conda_vm/gvhmr_easy_build_pytorch3d.bat', 'utf8');
assert.match(gvhmrPytorch3dBat, /--help/);
assert.match(gvhmrPytorch3dBat, /VS2022 Developer/);
assert.match(gvhmrPytorch3dBat, /VS2026/);
assert.match(gvhmrPytorch3dBat, /cudafe\+\+ 0xC0000005/);
assert.match(gvhmrPytorch3dBat, /TORCH_CUDA_ARCH_LIST=12\.0/);
assert.match(gvhmrPytorch3dBat, /DISTUTILS_USE_SDK=1/);
assert.match(gvhmrPytorch3dBat, /MSSdk=1/);
assert.match(gvhmrPytorch3dBat, /MAX_JOBS=4/);
assert.match(gvhmrPytorch3dBat, /CUDA_HOME=C:\\cuda\\12\.8/);
assert.match(gvhmrPytorch3dBat, /git clone https:\/\/github\.com\/facebookresearch\/pytorch3d\.git/);
assert.match(gvhmrPytorch3dBat, /pip install --no-build-isolation -e \./);
assert.match(gvhmrPytorch3dBat, /knn_points/);
assert.match(gvhmrPytorch3dBat, /gvhmr_env_check\.py/);
const gvhmrPytorch3dHelp = spawnSync('cmd.exe', ['/c', 'conda_vm\\gvhmr_easy_build_pytorch3d.bat', '--help'], {
  cwd: process.cwd(),
  encoding: 'utf8'
});
assert.equal(gvhmrPytorch3dHelp.status, 0, gvhmrPytorch3dHelp.stderr || gvhmrPytorch3dHelp.stdout);
assert.match(gvhmrPytorch3dHelp.stdout, /GVHMR Easy Build PyTorch3D/);
assert.match(gvhmrPytorch3dHelp.stdout, /--clean/);

const gvhmrCuda118Bat = readFileSync('conda_vm/gvhmr_cuda118_build_conda_env.bat', 'utf8');
assert.match(gvhmrCuda118Bat, /gvhmr\\env/);
assert.match(gvhmrCuda118Bat, /gvhmr_cuda118_requirements\.txt/);
assert.match(gvhmrCuda118Bat, /GVHMR_ROOT_DIR/);
assert.match(gvhmrCuda118Bat, /gvhmr\\GVHMR/);
assert.match(gvhmrCuda118Bat, /C:\\cuda\\11\.8/);
assert.match(gvhmrCuda118Bat, /gvhmr_cuda118_easy_build_pytorch3d\.bat/);

const gvhmrCuda118Pytorch3dBat = readFileSync('conda_vm/gvhmr_cuda118_easy_build_pytorch3d.bat', 'utf8');
assert.match(gvhmrCuda118Pytorch3dBat, /--help/);
assert.match(gvhmrCuda118Pytorch3dBat, /GTX 1080/);
assert.match(gvhmrCuda118Pytorch3dBat, /CUDA_HOME=C:\\cuda\\11\.8/);
assert.match(gvhmrCuda118Pytorch3dBat, /TORCH_CUDA_ARCH_LIST=6\.1/);
assert.match(gvhmrCuda118Pytorch3dBat, /DISTUTILS_USE_SDK=1/);
assert.match(gvhmrCuda118Pytorch3dBat, /MSSdk=1/);
assert.match(gvhmrCuda118Pytorch3dBat, /GVHMR_VCVARS64/);
assert.match(gvhmrCuda118Pytorch3dBat, /PROGRAMFILES_X86/);
assert.match(gvhmrCuda118Pytorch3dBat, /Visual Studio\\2022\\BuildTools/);
assert.match(gvhmrCuda118Pytorch3dBat, /Visual Studio\\2022\\Community/);
assert.match(gvhmrCuda118Pytorch3dBat, /Microsoft\.VisualStudio\.Component\.VC\.14\.38\.17\.8\.x86\.x64/);
assert.match(gvhmrCuda118Pytorch3dBat, /14\.38\.\*/);
assert.match(gvhmrCuda118Pytorch3dBat, /-vcvars_ver=/);
assert.match(gvhmrCuda118Pytorch3dBat, /Version 19\\.4/);
assert.match(gvhmrCuda118Pytorch3dBat, /set "INCLUDE="/);
assert.match(gvhmrCuda118Pytorch3dBat, /set "LIB="/);
assert.match(gvhmrCuda118Pytorch3dBat, /set "LIBPATH="/);
assert.match(gvhmrCuda118Pytorch3dBat, /vcvars64\.bat/);
assert.match(gvhmrCuda118Pytorch3dBat, /VS2022 Build Tools/);
assert.match(gvhmrCuda118Pytorch3dBat, /Microsoft\.VisualStudio\.2022\.BuildTools/);
assert.match(gvhmrCuda118Pytorch3dBat, /vs_buildtools\.exe/);
assert.doesNotMatch(gvhmrCuda118Pytorch3dBat, /echo\s+"%PROGRAMFILES_X86%\\Microsoft Visual Studio\\Installer\\setup\.exe"/);
assert.match(gvhmrCuda118Pytorch3dBat, /PYTORCH3D_BUILD_LOG/);
assert.match(gvhmrCuda118Pytorch3dBat, /Get-Content -LiteralPath .* -Tail 160/);
assert.match(gvhmrCuda118Pytorch3dBat, /touch_build_log/);
assert.match(gvhmrCuda118Pytorch3dBat, /build log is already in use/);
assert.match(gvhmrCuda118Pytorch3dBat, /FileShare\]::None/);
assert.match(gvhmrCuda118Pytorch3dBat, /patch_pytorch3d_windows_cub/);
assert.match(gvhmrCuda118Pytorch3dBat, /#undef small/);
assert.match(gvhmrCuda118Pytorch3dBat, /MAX_JOBS=4/);
assert.match(gvhmrCuda118Pytorch3dBat, /gvhmr\\PyTorch3D/);
assert.match(gvhmrCuda118Pytorch3dBat, /sm_61/);
assert.match(gvhmrCuda118Pytorch3dBat, /pip install -v --no-build-isolation -e \./);
assert.match(gvhmrCuda118Pytorch3dBat, /knn_points/);
assert.match(gvhmrCuda118Pytorch3dBat, /gvhmr_env_check\.py/);
const gvhmrCuda118Pytorch3dHelp = spawnSync('cmd.exe', ['/c', 'conda_vm\\gvhmr_cuda118_easy_build_pytorch3d.bat', '--help'], {
  cwd: process.cwd(),
  encoding: 'utf8'
});
assert.equal(gvhmrCuda118Pytorch3dHelp.status, 0, gvhmrCuda118Pytorch3dHelp.stderr || gvhmrCuda118Pytorch3dHelp.stdout);
assert.match(gvhmrCuda118Pytorch3dHelp.stdout, /GVHMR CUDA 11\.8 Easy Build PyTorch3D/);
assert.match(gvhmrCuda118Pytorch3dHelp.stdout, /--clean/);

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

const gvhmrCuda118Req = readFileSync('conda_vm/gvhmr_cuda118_requirements.txt', 'utf8');
assert.match(gvhmrCuda118Req, /torch==2\.3\.0\+cu118/);
assert.match(gvhmrCuda118Req, /torchvision==0\.18\.0\+cu118/);
assert.match(gvhmrCuda118Req, /numpy==1\.23\.5/);
assert.match(gvhmrCuda118Req, /chumpy==0\.70/);
assert.match(gvhmrCuda118Req, /cython_bbox==0\.1\.5/);
assert.match(gvhmrCuda118Req, /pytorch3d/);

const pytorch3dPulsarGpuCommands = readFileSync('conda_vm/gvhmr/PyTorch3D/pytorch3d/csrc/pulsar/gpu/commands.h', 'utf8');
assert.match(pytorch3dPulsarGpuCommands, /#ifdef small\s+#undef small\s+#endif/);

const serverReq = readFileSync('conda_vm/server_requirements.txt', 'utf8');
assert.match(serverReq, /Flask>=3\.0,<4/);
assert.match(serverReq, /yt-dlp/);
assert.match(serverReq, /mediapipe==0\.10\.14/);

console.log('PASS test_conda_env_build_assets');
