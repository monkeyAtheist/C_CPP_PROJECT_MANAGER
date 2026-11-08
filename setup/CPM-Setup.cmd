@echo off
setlocal
set "SCRIPT=%~dp0CPM-Toolchain-Installer.ps1"
set "VSIX=%~dp0c-cpp-project-manager-and-build-0.2.88.vsix"
if not exist "%SCRIPT%" (
  echo CPM installer script not found: %SCRIPT%
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -VsixPath "%VSIX%"
if errorlevel 1 (
  echo.
  echo CPM Setup returned an error. See %%LOCALAPPDATA%%\CPM\setup\CPM-Setup.log
  pause
)
endlocal
