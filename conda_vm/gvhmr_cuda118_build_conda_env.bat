@echo off
setlocal
cd /d "%~dp0"

set "ROOT=%~dp0"
for %%I in ("%ROOT%..") do set "PROJECT_ROOT=%%~fI"
set "MAMBA_EXE=%ROOT%micromamba\micromamba.exe"
set "ENV_DIR=%ROOT%gvhmr\env"
set "REPO_DIR=%ROOT%gvhmr\GVHMR"
set "REQ_FILE=%ROOT%gvhmr_cuda118_requirements.txt"
set "FILTERED_REQ=%TEMP%\gvhmr_cuda118_requirements_%RANDOM%%RANDOM%.txt"
set "CUDA_HOME=C:\cuda\11.8"
set "CUDA_PATH=C:\cuda\11.8"
set "GVHMR_ROOT_DIR=%REPO_DIR%"
set "GVHMR_ENV_DIR=%ENV_DIR%"

echo.
echo ==========================================
echo   GVHMR CUDA 11.8 env rebuild
echo ==========================================
echo.
echo Target env:
echo   %ENV_DIR%
echo.
echo This rebuilds the shared GVHMR env for GTX 1080 / Pascal.
echo It will replace the torch stack in conda_vm\gvhmr\env with cu118.
echo.

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

echo.
echo GVHMR env rebuilt for CUDA 11.8 / GTX 1080.
echo Next step for PyTorch3D:
echo   call "%ROOT%gvhmr_cuda118_easy_build_pytorch3d.bat"
echo.
echo Environment variables for this lane:
echo   CUDA_HOME=%CUDA_HOME%
echo   GVHMR_ROOT_DIR=%GVHMR_ROOT_DIR%
echo   GVHMR_ENV_DIR=%GVHMR_ENV_DIR%
