@echo off
setlocal
set PORT=8765
set FOUND=

echo.
echo Stopping My VRM Mascot server on port %PORT%...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    set FOUND=1
    echo Stopping PID %%a
    taskkill /PID %%a /F
)

if not defined FOUND (
    echo No listening process found on port %PORT%.
)

pause
