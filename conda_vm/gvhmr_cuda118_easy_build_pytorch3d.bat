@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "ROOT=%~dp0"
for %%I in ("%ROOT%..") do set "PROJECT_ROOT=%%~fI"
set "ENV_DIR=%ROOT%gvhmr\env"
set "ENV_PYTHON=%ENV_DIR%\python.exe"
set "PYTORCH3D_DIR=%ROOT%gvhmr\PyTorch3D"
set "CUDA_HOME=C:\cuda\11.8"
set "CUDA_PATH=C:\cuda\11.8"
set "FORCE_CUDA=1"
set "DISTUTILS_USE_SDK=1"
set "MSSdk=1"
set "TORCH_CUDA_ARCH_LIST=6.1"
set "NVCC_FLAGS=-allow-unsupported-compiler"
set "MAX_JOBS=4"
set "GVHMR_ROOT_DIR=%ROOT%gvhmr\GVHMR"
set "GVHMR_ENV_DIR=%ENV_DIR%"
set "PYTORCH3D_BUILD_LOG=%ROOT%gvhmr\pytorch3d_cuda118_build.log"
set "PROGRAMFILES_X86=%ProgramFiles(x86)%"
set "VCVARS64="
set "VS2022_ROOT="
set "MSVC_TOOLS_DIR="
set "MSVC_TOOLSET_VERSION="
set "MSVC_TOOLSET_SHORT="
set "VS2022_1438_COMPONENT=Microsoft.VisualStudio.Component.VC.14.38.17.8.x86.x64"

if /I "%~1"=="--help" goto :usage

echo.
echo ================================================
echo   GVHMR CUDA 11.8 Easy Build PyTorch3D
echo ================================================
echo.
echo This script is intended for:
echo   - GTX 1080 / Pascal / sm_61
echo   - CUDA 11.8 at C:\cuda\11.8
echo   - torch 2.3.0+cu118
echo   - shared env conda_vm\gvhmr\env
echo.

if not exist "%ENV_PYTHON%" (
  echo Missing GVHMR conda env python:
  echo   %ENV_PYTHON%
  echo.
  echo Build the CUDA 11.8 GVHMR env first:
  echo   call "%ROOT%gvhmr_cuda118_build_conda_env.bat"
  exit /b 1
)

if defined GVHMR_VCVARS64 if exist "%GVHMR_VCVARS64%" set "VCVARS64=%GVHMR_VCVARS64%"
if defined VCVARS64 for %%I in ("%VCVARS64%") do set "VS2022_ROOT=%%~dpI..\..\.."
if defined VS2022_ROOT for %%I in ("%VS2022_ROOT%") do set "VS2022_ROOT=%%~fI"
if not defined VS2022_ROOT if exist "%PROGRAMFILES_X86%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" set "VS2022_ROOT=%PROGRAMFILES_X86%\Microsoft Visual Studio\2022\BuildTools"
if not defined VS2022_ROOT if exist "%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" set "VS2022_ROOT=%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools"
if not defined VS2022_ROOT if exist "%PROGRAMFILES_X86%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" set "VS2022_ROOT=%PROGRAMFILES_X86%\Microsoft Visual Studio\2022\Community"
if not defined VS2022_ROOT if exist "%ProgramFiles%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" set "VS2022_ROOT=%ProgramFiles%\Microsoft Visual Studio\2022\Community"
if not defined VS2022_ROOT if exist "%PROGRAMFILES_X86%\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat" set "VS2022_ROOT=%PROGRAMFILES_X86%\Microsoft Visual Studio\2022\Professional"
if not defined VS2022_ROOT if exist "%ProgramFiles%\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat" set "VS2022_ROOT=%ProgramFiles%\Microsoft Visual Studio\2022\Professional"
if not defined VS2022_ROOT if exist "%PROGRAMFILES_X86%\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat" set "VS2022_ROOT=%PROGRAMFILES_X86%\Microsoft Visual Studio\2022\Enterprise"
if not defined VS2022_ROOT if exist "%ProgramFiles%\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat" set "VS2022_ROOT=%ProgramFiles%\Microsoft Visual Studio\2022\Enterprise"
if defined VS2022_ROOT set "VCVARS64=%VS2022_ROOT%\VC\Auxiliary\Build\vcvars64.bat"
if defined VS2022_ROOT set "MSVC_TOOLS_DIR=%VS2022_ROOT%\VC\Tools\MSVC"
if defined MSVC_TOOLS_DIR for /d %%D in ("%MSVC_TOOLS_DIR%\14.38.*") do if not defined MSVC_TOOLSET_VERSION set "MSVC_TOOLSET_VERSION=%%~nxD"
if defined MSVC_TOOLS_DIR if not defined MSVC_TOOLSET_VERSION for /d %%D in ("%MSVC_TOOLS_DIR%\14.39.*") do if not defined MSVC_TOOLSET_VERSION set "MSVC_TOOLSET_VERSION=%%~nxD"
if defined MSVC_TOOLSET_VERSION set "MSVC_TOOLSET_SHORT=%MSVC_TOOLSET_VERSION:~0,5%"
if defined VS2022_ROOT if not defined MSVC_TOOLSET_SHORT (
  echo Missing CUDA 11.8-compatible MSVC v143 toolset.
  echo Found VS2022, but CUDA 11.8 fails with newer MSVC 14.4x toolsets.
  echo Install the VS2022 v14.38 toolset:
  echo   "!PROGRAMFILES_X86!\Microsoft Visual Studio\Installer\setup.exe" modify --installPath "!VS2022_ROOT!" --add !VS2022_1438_COMPONENT! --passive --norestart
  echo.
  echo Or add this component in Visual Studio Installer:
  echo   !VS2022_1438_COMPONENT!
  exit /b 1
)
if defined VCVARS64 if exist "%VCVARS64%" (
  echo Activating VS2022 toolchain:
  echo   !VCVARS64!
  echo   MSVC toolset !MSVC_TOOLSET_VERSION!
  set "INCLUDE="
  set "LIB="
  set "LIBPATH="
  call "!VCVARS64!" -vcvars_ver=!MSVC_TOOLSET_SHORT! >nul
)

where cl.exe >nul 2>nul
if errorlevel 1 (
  echo cl.exe was not found.
  echo Install VS2022 Build Tools with Desktop development with C++.
  echo Direct bootstrapper:
  echo   https://aka.ms/vs/17/release/vs_buildtools.exe
  echo Or use winget:
  echo   winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  echo VS2026 / MSVC 19.51 is not supported for this CUDA 11.8 PyTorch3D lane.
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
  echo Install VS2022 Build Tools or use a CUDA 11.8-compatible VS toolchain instead.
  exit /b 1
)

echo %CL_BANNER% | findstr /R /C:"Version 19\.4[0-9]\." >nul
if not errorlevel 1 (
  echo.
  echo Refusing to build with MSVC 19.40 or newer.
  echo CUDA 11.8 hits STL1002 with this compiler family. Install and use VS2022 v14.38:
  echo   "!PROGRAMFILES_X86!\Microsoft Visual Studio\Installer\setup.exe" modify --installPath "!VS2022_ROOT!" --add !VS2022_1438_COMPONENT! --passive --norestart
  exit /b 1
)

if not exist "%CUDA_HOME%\bin\nvcc.exe" (
  echo Missing CUDA nvcc:
  echo   %CUDA_HOME%\bin\nvcc.exe
  echo Install CUDA Toolkit 11.8 or update CUDA_HOME in this script.
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
echo   MSVC_TOOLSET_VERSION=%MSVC_TOOLSET_VERSION%
echo   PYTORCH3D_DIR=%PYTORCH3D_DIR%
echo   PYTORCH3D_BUILD_LOG=%PYTORCH3D_BUILD_LOG%
echo.

"%ENV_PYTHON%" -c "import torch; archs=torch.cuda.get_arch_list(); print('torch', torch.__version__); print('torch cuda', torch.version.cuda); print('cuda available', torch.cuda.is_available()); print('gpu', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'none'); print('arch list', archs); raise SystemExit(0 if torch.cuda.is_available() and 'sm_61' in archs else 2)"
if errorlevel 1 (
  echo.
  echo Torch CUDA smoke failed or this torch wheel does not expose sm_61.
  echo Rebuild with:
  echo   call "%ROOT%gvhmr_cuda118_build_conda_env.bat"
  exit /b %ERRORLEVEL%
)

"%ENV_PYTHON%" -m pip install -U pip setuptools wheel ninja
if errorlevel 1 exit /b %ERRORLEVEL%

if not exist "%PYTORCH3D_DIR%\.git" (
  git clone https://github.com/facebookresearch/pytorch3d.git "%PYTORCH3D_DIR%"
  if errorlevel 1 exit /b %ERRORLEVEL%
) else (
  echo PyTorch3D repo already exists:
  echo   %PYTORCH3D_DIR%
)

call :patch_pytorch3d_windows_cub
if errorlevel 1 exit /b %ERRORLEVEL%

pushd "%PYTORCH3D_DIR%"
if /I "%~1"=="--clean" (
  echo Cleaning local PyTorch3D build artifacts...
  if exist build rmdir /s /q build
)

echo Installing PyTorch3D without build isolation so setup.py can import torch from this env.
echo Build log:
echo   %PYTORCH3D_BUILD_LOG%
call :touch_build_log
if errorlevel 1 (
  popd
  echo.
  echo PyTorch3D build log is already in use:
  echo   %PYTORCH3D_BUILD_LOG%
  echo Another PyTorch3D build is probably still running. Wait for it to finish, then rerun this script.
  exit /b 1
)
"%ENV_PYTHON%" -m pip install -v --no-build-isolation -e . > "%PYTORCH3D_BUILD_LOG%" 2>&1
set "BUILD_RESULT=%ERRORLEVEL%"
popd
if not "%BUILD_RESULT%"=="0" (
  echo.
  echo PyTorch3D build failed. Last build log lines:
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -LiteralPath '%PYTORCH3D_BUILD_LOG%' -Tail 160"
  echo.
  echo Full log:
  echo   %PYTORCH3D_BUILD_LOG%
  exit /b %BUILD_RESULT%
)

echo.
echo Running PyTorch3D CUDA smoke test...
"%ENV_PYTHON%" -c "import torch; import pytorch3d; from pytorch3d.ops import knn_points; x=torch.rand(1,8,3,device='cuda'); y=torch.rand(1,8,3,device='cuda'); out=knn_points(x,y,K=1); ok=bool(out.dists.isfinite().all().item()); print('pytorch3d', getattr(pytorch3d, '__version__', 'unknown')); print('knn_points finite', ok); raise SystemExit(0 if ok else 3)"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo Running GVHMR environment check...
"%ENV_PYTHON%" "%PROJECT_ROOT%\scripts\gvhmr_env_check.py"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo PyTorch3D build completed for GVHMR CUDA 11.8 / GTX 1080.
echo If GVHMR still shows red in Motion Capture Lab, check missing model weights from gvhmr_env_check.py.
exit /b 0

:patch_pytorch3d_windows_cub
set "PULSAR_GPU_COMMANDS=%PYTORCH3D_DIR%\pytorch3d\csrc\pulsar\gpu\commands.h"
if not exist "%PULSAR_GPU_COMMANDS%" (
  echo Missing PyTorch3D Pulsar commands header:
  echo   %PULSAR_GPU_COMMANDS%
  exit /b 1
)
findstr /C:"#undef small" "%PULSAR_GPU_COMMANDS%" >nul
if not errorlevel 1 (
  echo PyTorch3D Windows CUB macro patch already applied.
  exit /b 0
)
echo Applying PyTorch3D Windows CUB macro patch.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$path=$env:PULSAR_GPU_COMMANDS; $text=[IO.File]::ReadAllText($path); $needle='#include <cooperative_groups.h>' + [Environment]::NewLine + '#include <cub/cub.cuh>'; $replacement='#include <cooperative_groups.h>' + [Environment]::NewLine + '#ifdef small' + [Environment]::NewLine + '#undef small' + [Environment]::NewLine + '#endif' + [Environment]::NewLine + '#include <cub/cub.cuh>'; if (-not $text.Contains($needle)) { Write-Error 'Could not find CUB include block to patch.'; exit 1 }; [IO.File]::WriteAllText($path, $text.Replace($needle, $replacement)); exit 0"
exit /b %ERRORLEVEL%

:touch_build_log
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $stream = [System.IO.File]::Open($env:PYTORCH3D_BUILD_LOG, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None); $stream.Close(); exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
exit /b %ERRORLEVEL%

:usage
echo.
echo ================================================
echo   GVHMR CUDA 11.8 Easy Build PyTorch3D
echo ================================================
echo.
echo Usage:
echo   gvhmr_cuda118_easy_build_pytorch3d.bat [--clean]
echo   gvhmr_cuda118_easy_build_pytorch3d.bat --help
echo.
echo This uses shared env:
echo   conda_vm\gvhmr\env
echo.
echo It targets GTX 1080 / Pascal with CUDA 11.8 and TORCH_CUDA_ARCH_LIST=6.1.
echo It auto-activates VS2022 Build Tools if installed. VS2026 / MSVC 19.51 and MSVC 19.40+ are blocked.
echo Direct bootstrapper: https://aka.ms/vs/17/release/vs_buildtools.exe
echo Winget: winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
echo CUDA 11.8 needs an older VS2022 v143 toolset; install:
echo   "!PROGRAMFILES_X86!\Microsoft Visual Studio\Installer\setup.exe" modify --installPath "!PROGRAMFILES_X86!\Microsoft Visual Studio\2022\BuildTools" --add Microsoft.VisualStudio.Component.VC.14.38.17.8.x86.x64 --passive --norestart
echo For custom VS2022 paths, set GVHMR_VCVARS64 to the full vcvars64.bat path.
echo Build log: conda_vm\gvhmr\pytorch3d_cuda118_build.log
echo --clean removes the local PyTorch3D build directory before pip install --no-build-isolation -e .
echo.
exit /b 0
