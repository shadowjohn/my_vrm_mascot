@echo off
setlocal
cd /d "%~dp0"

set "ROOT=%~dp0"
set "MAMBA_EXE=%ROOT%micromamba\micromamba.exe"
set "ENV_DIR=%ROOT%server\env"
set "REQ_FILE=%ROOT%server_requirements.txt"

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

echo.
echo Server env ready:
echo   %ENV_DIR%
