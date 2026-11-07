//go:build windows

package main

import (
    "embed"
    "fmt"
    "os"
    "os/exec"
    "path/filepath"
    "syscall"
    "unsafe"
)

//go:embed CPM-Toolchain-Installer.ps1 c-cpp-project-manager-and-build-0.2.81.vsix
var payload embed.FS

func messageBox(title, message string, flags uintptr) {
    user32 := syscall.NewLazyDLL("user32.dll")
    proc := user32.NewProc("MessageBoxW")
    t, _ := syscall.UTF16PtrFromString(title)
    m, _ := syscall.UTF16PtrFromString(message)
    _, _, _ = proc.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), flags)
}

func fail(err error) {
    messageBox("CPM Setup", err.Error(), 0x10) // MB_ICONERROR
}

func writeEmbedded(name, dst string) error {
    data, err := payload.ReadFile(name)
    if err != nil {
        return err
    }
    return os.WriteFile(dst, data, 0o600)
}

func main() {
    tempRoot, err := os.MkdirTemp("", "CPM-Setup-0.2.81-")
    if err != nil {
        fail(fmt.Errorf("unable to create temporary setup directory: %w", err))
        return
    }
    defer os.RemoveAll(tempRoot)

    scriptPath := filepath.Join(tempRoot, "CPM-Toolchain-Installer.ps1")
    vsixPath := filepath.Join(tempRoot, "c-cpp-project-manager-and-build-0.2.81.vsix")
    if err := writeEmbedded("CPM-Toolchain-Installer.ps1", scriptPath); err != nil {
        fail(fmt.Errorf("unable to extract installer script: %w", err))
        return
    }
    if err := writeEmbedded("c-cpp-project-manager-and-build-0.2.81.vsix", vsixPath); err != nil {
        fail(fmt.Errorf("unable to extract CPM extension: %w", err))
        return
    }

    powershell := filepath.Join(os.Getenv("SystemRoot"), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    if _, err := os.Stat(powershell); err != nil {
        powershell = "powershell.exe"
    }

    cmd := exec.Command(
        powershell,
        "-NoLogo",
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", scriptPath,
        "-VsixPath", vsixPath,
    )
    cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
    if err := cmd.Run(); err != nil {
        fail(fmt.Errorf("CPM Setup failed: %w\n\nSee %%LOCALAPPDATA%%\\CPM\\setup\\CPM-Setup.log for details.", err))
    }
}
