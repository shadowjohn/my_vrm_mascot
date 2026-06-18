@echo off
setlocal
cd /d "%~dp0"

set "ROOT=%~dp0"
for %%I in ("%ROOT%..") do set "PROJECT_ROOT=%%~fI"
set "MAMBA_EXE=%ROOT%micromamba\micromamba.exe"
set "ENV_DIR=%ROOT%gvhmr\env"
set "REPO_DIR=%ROOT%gvhmr\GVHMR"
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

echo.
echo GVHMR env installed as far as native Windows allows.
echo Remaining known blocker: pytorch3d has no official Windows pip wheel here.
echo Model weights are not bundled. Run:
echo   python "%PROJECT_ROOT%\scripts\gvhmr_env_check.py"
