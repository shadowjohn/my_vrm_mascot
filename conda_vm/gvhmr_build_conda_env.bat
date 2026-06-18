@echo off
setlocal
cd /d "%~dp0"

set "ROOT=%~dp0"
for %%I in ("%ROOT%..") do set "PROJECT_ROOT=%%~fI"
set "MAMBA_EXE=%ROOT%micromamba\micromamba.exe"
set "ENV_DIR=%ROOT%gvhmr\env"
set "REPO_DIR=%ROOT%gvhmr\GVHMR"
set "PYTORCH3D_DIR=%ROOT%gvhmr\PyTorch3D"
set "REQ_FILE=%ROOT%gvhmr_requirements.txt"
set "FILTERED_REQ=%TEMP%\gvhmr_requirements_%RANDOM%%RANDOM%.txt"

call "%ROOT%micromamba_build_conda_env.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

if not exist "%ENV_DIR%\python.exe" (
  "%MAMBA_EXE%" create -y -p "%ENV_DIR%" --override-channels -c conda-forge python=3.10 pip
  if errorlevel 1 exit /b %ERRORLEVEL%
)

"%ENV_DIR%\python.exe" -m pip install --upgrade pip wheel setuptools
if errorlevel 1 exit /b %ERRORLEVEL%

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "Get-Content '%REQ_FILE%' | Where-Object { $_ -notmatch '^\s*chumpy==' -and $_ -notmatch '^\s*pytorch3d\b' } | Set-Content -Encoding ascii '%FILTERED_REQ%';"
if errorlevel 1 exit /b %ERRORLEVEL%

"%ENV_DIR%\python.exe" -m pip install -r "%FILTERED_REQ%"
set "PIP_RESULT=%ERRORLEVEL%"
del "%FILTERED_REQ%" >nul 2>nul
if not "%PIP_RESULT%"=="0" exit /b %PIP_RESULT%

"%ENV_DIR%\python.exe" -m pip install chumpy==0.70 --no-build-isolation
if errorlevel 1 exit /b %ERRORLEVEL%

if not exist "%REPO_DIR%\.git" (
  git clone --depth 1 https://github.com/zju3dv/GVHMR.git "%REPO_DIR%"
  if errorlevel 1 exit /b %ERRORLEVEL%
) else (
  echo GVHMR repo already exists:
  echo   %REPO_DIR%
)

"%ENV_DIR%\python.exe" -m pip install -e "%REPO_DIR%"
if errorlevel 1 exit /b %ERRORLEVEL%

if /I "%BUILD_PYTORCH3D%"=="1" (
  if not defined VS2022_VCVARS set "VS2022_VCVARS=%ProgramFiles%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
  if not exist "%VS2022_VCVARS%" (
    echo Missing VS2022 vcvars64.bat:
    echo   %VS2022_VCVARS%
    echo Set VS2022_VCVARS to a VS2022 x64 toolchain path, then rerun with BUILD_PYTORCH3D=1.
    exit /b 1
  )

  if not exist "%PYTORCH3D_DIR%\.git" (
    git clone https://github.com/facebookresearch/pytorch3d.git "%PYTORCH3D_DIR%"
    if errorlevel 1 exit /b %ERRORLEVEL%
  )

  call "%VS2022_VCVARS%"
  set "DISTUTILS_USE_SDK=1"
  set "MSSdk=1"
  if not defined CUDA_HOME set "CUDA_HOME=C:\cuda\12.8"
  if not defined CUDA_PATH set "CUDA_PATH=%CUDA_HOME%"
  set "FORCE_CUDA=1"
  if not defined TORCH_CUDA_ARCH_LIST set "TORCH_CUDA_ARCH_LIST=12.0"
  if not defined NVCC_FLAGS set "NVCC_FLAGS=-allow-unsupported-compiler"
  if not defined MAX_JOBS set "MAX_JOBS=4"
  pushd "%PYTORCH3D_DIR%"
  "%ENV_DIR%\python.exe" setup.py install
  set "PYTORCH3D_RESULT=%ERRORLEVEL%"
  popd
  if not "%PYTORCH3D_RESULT%"=="0" exit /b %PYTORCH3D_RESULT%
)

echo.
echo GVHMR env installed as far as native Windows allows.
if /I not "%BUILD_PYTORCH3D%"=="1" (
  echo Optional PyTorch3D source build:
  echo   set BUILD_PYTORCH3D=1
  echo   call "%ROOT%gvhmr_build_conda_env.bat"
  echo Use VS2022 MSVC 14.44 for CUDA 12.8; VS2026 MSVC 14.51 can crash nvcc cudafe++.
)
echo Model weights are not bundled. Run:
echo   python "%PROJECT_ROOT%\scripts\gvhmr_env_check.py"
