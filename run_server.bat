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

python server.py
pause
