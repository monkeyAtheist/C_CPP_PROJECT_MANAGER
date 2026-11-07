Unicode True
Name "C/C++ Project Manager Setup 0.2.81"
OutFile "CPM-Setup-0.2.81.exe"
RequestExecutionLevel user
SilentInstall normal
AutoCloseWindow true
ShowInstDetails show
Icon "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"

Section "CPM Setup"
  SetOutPath "$PLUGINSDIR\CPM-Setup"
  File "CPM-Toolchain-Installer.ps1"
  File "c-cpp-project-manager-and-build-0.2.81.vsix"
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\CPM-Setup\CPM-Toolchain-Installer.ps1" -VsixPath "$PLUGINSDIR\CPM-Setup\c-cpp-project-manager-and-build-0.2.81.vsix"' $0
  SetErrorLevel $0
SectionEnd
