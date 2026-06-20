@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "ROOT=%~dp0"
for %%I in ("%ROOT%..") do set "PROJECT_ROOT=%%~fI"
set "ENV_DIR=%ROOT%gvhmr\env"
set "ENV_PYTHON=%ENV_DIR%\python.exe"
set "PYTORCH3D_DIR=%ROOT%gvhmr\PyTorch3D"
set "CUDA_HOME=C:\cuda\12.8"
set "CUDA_PATH=C:\cuda\12.8"
set "FORCE_CUDA=1"
set "DISTUTILS_USE_SDK=1"
set "MSSdk=1"
set "TORCH_CUDA_ARCH_LIST=12.0"
set "NVCC_FLAGS=-allow-unsupported-compiler"
set "MAX_JOBS=4"

if /I "%~1"=="--help" goto :usage

echo.
echo ================================================
echo   GVHMR Easy Build PyTorch3D for Windows CUDA
echo ================================================
echo.
echo This script is intended for:
echo   - VS2022 Developer Command Prompt or PowerShell
echo   - MSVC 19.44 / Visual Studio 2022
echo   - CUDA 12.8 at C:\cuda\12.8
echo   - torch 2.11.0+cu128
echo   - RTX 50-series / sm_120
echo.

if not exist "%ENV_PYTHON%" (
  echo Missing GVHMR conda env python:
  echo   %ENV_PYTHON%
  echo.
  echo Build the GVHMR env first:
  echo   call "%ROOT%gvhmr_build_conda_env.bat"
  exit /b 1
)

where cl.exe >nul 2>nul
if errorlevel 1 (
  echo cl.exe was not found.
  echo Run this script from a VS2022 Developer Command Prompt or Developer PowerShell.
  exit /b 1
)

set "CL_BANNER="
for /f "delims=" %%L in ('cl.exe 2^>^&1 ^| findstr /C:"Version"') do (
  set "CL_BANNER=%%L"
  goto :got_cl_banner
)
:got_cl_banner
echo MSVC:
echo   %CL_BANNER%

echo %CL_BANNER% | findstr /C:"19.51." >nul
if not errorlevel 1 (
  echo.
  echo Refusing to build with VS2026 / MSVC 19.51.
  echo This combination has crashed nvcc cudafe++ 0xC0000005 on this project.
  echo Use VS2022 / MSVC 19.44 instead.
  exit /b 1
)

echo %CL_BANNER% | findstr /C:"19.44." >nul
if errorlevel 1 (
  echo.
  echo Warning: MSVC 19.44 was the validated compiler for this project.
  echo Continuing anyway because only VS2026 / MSVC 19.51 is hard-blocked.
  echo.
)

if not exist "%CUDA_HOME%\bin\nvcc.exe" (
  echo Missing CUDA nvcc:
  echo   %CUDA_HOME%\bin\nvcc.exe
  echo Install CUDA Toolkit 12.8 or update CUDA_HOME in this script.
  exit /b 1
)

where git.exe >nul 2>nul
if errorlevel 1 (
  echo git.exe was not found in PATH.
  exit /b 1
)

echo.
echo Environment:
echo   CUDA_HOME=%CUDA_HOME%
echo   DISTUTILS_USE_SDK=%DISTUTILS_USE_SDK%
echo   MSSdk=%MSSdk%
echo   TORCH_CUDA_ARCH_LIST=%TORCH_CUDA_ARCH_LIST%
echo   MAX_JOBS=%MAX_JOBS%
echo   PYTORCH3D_DIR=%PYTORCH3D_DIR%
echo.

"%ENV_PYTHON%" -c "import torch; print('torch', torch.__version__); print('torch cuda', torch.version.cuda); print('cuda available', torch.cuda.is_available()); print('gpu', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'none'); raise SystemExit(0 if torch.cuda.is_available() else 2)"
if errorlevel 1 exit /b %ERRORLEVEL%

"%ENV_PYTHON%" -m pip install -U pip setuptools wheel ninja
if errorlevel 1 exit /b %ERRORLEVEL%

if not exist "%PYTORCH3D_DIR%\.git" (
  git clone https://github.com/facebookresearch/pytorch3d.git "%PYTORCH3D_DIR%"
  if errorlevel 1 exit /b %ERRORLEVEL%
) else (
  echo PyTorch3D repo already exists:
  echo   %PYTORCH3D_DIR%
)

pushd "%PYTORCH3D_DIR%"
if /I "%~1"=="--clean" (
  echo Cleaning local PyTorch3D build artifacts...
  if exist build rmdir /s /q build
)

echo Installing PyTorch3D without build isolation so setup.py can import torch from this env.
"%ENV_PYTHON%" -m pip install --no-build-isolation -e .
set "BUILD_RESULT=%ERRORLEVEL%"
popd
if not "%BUILD_RESULT%"=="0" exit /b %BUILD_RESULT%

echo.
echo Running PyTorch3D CUDA smoke test...
"%ENV_PYTHON%" -c "import torch; import pytorch3d; from pytorch3d.ops import knn_points; x=torch.rand(1,8,3,device='cuda'); y=torch.rand(1,8,3,device='cuda'); out=knn_points(x,y,K=1); ok=bool(out.dists.isfinite().all().item()); print('pytorch3d', getattr(pytorch3d, '__version__', 'unknown')); print('knn_points finite', ok); raise SystemExit(0 if ok else 3)"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo Running GVHMR environment check...
"%ENV_PYTHON%" "%PROJECT_ROOT%\scripts\gvhmr_env_check.py"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo PyTorch3D build completed for GVHMR.
echo If GVHMR still shows red in Motion Capture Lab, check missing model weights from gvhmr_env_check.py.
exit /b 0

:usage
echo.
echo ================================================
echo   GVHMR Easy Build PyTorch3D for Windows CUDA
echo ================================================
echo.
echo Usage:
echo   gvhmr_easy_build_pytorch3d.bat [--clean]
echo   gvhmr_easy_build_pytorch3d.bat --help
echo.
echo Run from a VS2022 Developer Command Prompt or Developer PowerShell.
echo The validated compiler is MSVC 19.44. VS2026 / MSVC 19.51 is blocked
echo because it crashed nvcc cudafe++ 0xC0000005 on this project.
echo.
echo --clean removes the local PyTorch3D build directory before pip install --no-build-isolation -e .
echo.
exit /b 0
