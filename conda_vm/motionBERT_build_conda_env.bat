@echo off
setlocal
cd /d "%~dp0"

set "ROOT=%~dp0"
set "MAMBA_EXE=%ROOT%micromamba\micromamba.exe"
set "ENV_DIR=%ROOT%motionBERT\env"
set "REPO_DIR=%ROOT%motionBERT\MotionBERT"
set "REQ_FILE=%ROOT%motionBERT_requirements.txt"

call "%ROOT%micromamba_build_conda_env.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

if not exist "%ENV_DIR%\python.exe" (
  "%MAMBA_EXE%" create -y -p "%ENV_DIR%" --override-channels -c conda-forge python=3.10 pip
  if errorlevel 1 exit /b %ERRORLEVEL%
)

"%ENV_DIR%\python.exe" -m pip install --upgrade pip wheel setuptools
if errorlevel 1 exit /b %ERRORLEVEL%

"%ENV_DIR%\python.exe" -m pip install -r "%REQ_FILE%"
if errorlevel 1 exit /b %ERRORLEVEL%

if not exist "%REPO_DIR%\.git" (
  git clone https://github.com/Walter0807/MotionBERT "%REPO_DIR%"
  if errorlevel 1 exit /b %ERRORLEVEL%
) else (
  echo MotionBERT repo already exists:
  echo   %REPO_DIR%
)

echo.
echo MotionBERT env ready:
echo   %ENV_DIR%
echo.
echo Checkpoint is not bundled. Place it under:
echo   %REPO_DIR%\checkpoint\pose3d\FT_MB_lite_MB_ft_h36m_global_lite\best_epoch.bin
