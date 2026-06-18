@echo off
setlocal
cd /d "%~dp0"
set "PORT=8765"

echo.
echo Stopping My VRM Mascot server on port %PORT%...
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

"%SERVER_PYTHON%" "%~dp0scripts\stop_server.py" --port %PORT%
pause
