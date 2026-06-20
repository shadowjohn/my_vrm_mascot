@echo off
setlocal
cd /d "%~dp0"

set "ROOT=%~dp0"
for %%I in ("%ROOT%..") do set "PROJECT_ROOT=%%~fI"
set "ENV_PYTHON=%ROOT%gvhmr\env\python.exe"
set "GVHMR_ROOT=%ROOT%gvhmr\GVHMR"

if /I "%~1"=="--help" goto :help
if /I "%~1"=="-h" goto :help

echo.
echo ==========================================
echo   GVHMR prepare model assets
echo ==========================================
echo.
echo This downloads public GVHMR checkpoints when possible.
echo SMPL and SMPL-X still require manual licensed downloads.
echo.
echo Dry run:
echo   call "%~nx0" --skip-download
echo.

if not exist "%ENV_PYTHON%" (
  echo Missing GVHMR env python:
  echo   %ENV_PYTHON%
  echo Run gvhmr_build_conda_env.bat or gvhmr_cuda118_build_conda_env.bat first.
  exit /b 1
)

:run
"%ENV_PYTHON%" "%PROJECT_ROOT%\scripts\gvhmr_prepare_assets.py" --gvhmr-root "%GVHMR_ROOT%" %*
exit /b %ERRORLEVEL%

:help
if exist "%ENV_PYTHON%" (
  "%ENV_PYTHON%" "%PROJECT_ROOT%\scripts\gvhmr_prepare_assets.py" --help
) else (
  python "%PROJECT_ROOT%\scripts\gvhmr_prepare_assets.py" --help
)
exit /b %ERRORLEVEL%
