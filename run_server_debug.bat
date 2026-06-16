@echo off
setlocal
cd /d "%~dp0"
set FLASK_DEBUG=1

echo.
echo ==================================
echo   My VRM Mascot Debug Server
echo ==================================
echo.
echo server.py currently runs Flask debug=True.
echo Workbench: http://127.0.0.1:8765/
echo Runtime:   http://127.0.0.1:8765/mascot_runtime.html
echo.

python server.py
pause
