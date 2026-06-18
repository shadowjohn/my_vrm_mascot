@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==================================
echo   My VRM Mascot Local Server
echo ==================================
echo.
echo Workbench: http://127.0.0.1:8765/
echo Runtime:   http://127.0.0.1:8765/mascot_runtime.html
echo.

set "SERVER_PYTHON=%~dp0conda_vm\server\env\python.exe"
if not exist "%SERVER_PYTHON%" (
  echo Server conda env not found:
  echo   %SERVER_PYTHON%
  echo.
  echo To create it, run:
  echo   conda_vm\server_build_conda_env.bat
  echo.
  echo Falling back to system python.
  set "SERVER_PYTHON=python"
)

"%SERVER_PYTHON%" server.py
pause
