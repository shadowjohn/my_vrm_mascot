@echo off
setlocal
cd /d "%~dp0"

set "ROOT=%~dp0"
set "MAMBA_DIR=%ROOT%micromamba"
set "MAMBA_EXE=%MAMBA_DIR%\micromamba.exe"
set "MAMBA_ARCHIVE=%MAMBA_DIR%\micromamba.tar.bz2"
set "MAMBA_URL=https://micro.mamba.pm/api/micromamba/win-64/latest"

echo.
echo ==================================
echo   Bootstrap portable micromamba
echo ==================================
echo.

if exist "%MAMBA_EXE%" (
  echo micromamba already exists:
  echo   %MAMBA_EXE%
  "%MAMBA_EXE%" --version
  exit /b %ERRORLEVEL%
)

if not exist "%MAMBA_DIR%" mkdir "%MAMBA_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$url='%MAMBA_URL%';" ^
  "$archive='%MAMBA_ARCHIVE%';" ^
  "$dest='%MAMBA_EXE%';" ^
  "$tmp=Join-Path $env:TEMP ('micromamba_' + [guid]::NewGuid().ToString('N'));" ^
  "New-Item -ItemType Directory -Path $tmp | Out-Null;" ^
  "Invoke-WebRequest -Uri $url -OutFile $archive;" ^
  "tar -xjf $archive -C $tmp;" ^
  "$candidate=Join-Path $tmp 'Library\bin\micromamba.exe';" ^
  "if (!(Test-Path $candidate)) { throw 'micromamba.exe not found in archive'; }" ^
  "Copy-Item -Force $candidate $dest;" ^
  "Remove-Item -Recurse -Force $tmp;"

if errorlevel 1 exit /b %ERRORLEVEL%
"%MAMBA_EXE%" --version
