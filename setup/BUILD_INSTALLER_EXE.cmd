@echo off
setlocal
set "ROOT=%~dp0.."
set "SETUP=%~dp0"
set "VSIX=%ROOT%\c-cpp-project-manager-and-build-0.2.84.vsix"
set "LOCALVSIX=%SETUP%c-cpp-project-manager-and-build-0.2.84.vsix"
set "OUT=%ROOT%\CPM-Setup-0.2.84.exe"

where go.exe >nul 2>nul
if errorlevel 1 (
  echo Go was not found on PATH.
  echo Install Go or use the prebuilt CPM-Setup-0.2.84.exe.
  exit /b 1
)
if not exist "%VSIX%" (
  echo VSIX not found: %VSIX%
  echo Build/package CPM 0.2.84 first.
  exit /b 1
)
copy /Y "%VSIX%" "%LOCALVSIX%" >nul
pushd "%SETUP%"
set GOOS=windows
set GOARCH=amd64
set CGO_ENABLED=0
go build -trimpath -ldflags "-H windowsgui -s -w" -o "%OUT%" CPM-Setup-Launcher.go
set "RC=%ERRORLEVEL%"
popd
del /Q "%LOCALVSIX%" >nul 2>nul
if not "%RC%"=="0" exit /b %RC%
echo Built: %OUT%
endlocal
