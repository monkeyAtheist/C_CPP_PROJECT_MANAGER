param(
    [switch]$ToolchainsOnly,
    [switch]$Silent,
    [switch]$InstallX64,
    [switch]$InstallX86,
    [switch]$InstallBuildTools,
    [switch]$InstallCppTools,
    [switch]$AddUcrt64ToUserPath,
    [string]$InstallRoot = "$env:LOCALAPPDATA\CPM\Toolchains\msys64",
    [string]$VsixPath = ""
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$script:LogControl = $null
$script:ProgressBar = $null
$script:InstallButton = $null
$script:SetupRoot = Join-Path $env:LOCALAPPDATA 'CPM\setup'
$script:LogFile = Join-Path $script:SetupRoot 'CPM-Setup.log'
$script:MsysInstallerUrl = 'https://repo.msys2.org/distrib/msys2-x86_64-latest.exe'

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Write-SetupLog([string]$Message) {
    Ensure-Directory $script:SetupRoot
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -LiteralPath $script:LogFile -Value $line -Encoding UTF8
    Write-Host $line
    if ($script:LogControl) {
        $script:LogControl.AppendText($line + [Environment]::NewLine)
        $script:LogControl.SelectionStart = $script:LogControl.TextLength
        $script:LogControl.ScrollToCaret()
        [System.Windows.Forms.Application]::DoEvents()
    }
}

function Set-SetupProgress([int]$Value) {
    if ($script:ProgressBar) {
        $script:ProgressBar.Value = [Math]::Max(0, [Math]::Min(100, $Value))
        [System.Windows.Forms.Application]::DoEvents()
    }
}

function Find-CodeCli {
    $command = Get-Command code.cmd -ErrorAction SilentlyContinue
    if (-not $command) { $command = Get-Command code -ErrorAction SilentlyContinue }
    if ($command) { return $command.Source }

    $candidates = @()
    if ($env:LOCALAPPDATA) {
        $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\bin\code.cmd')
        $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd')
    }
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Microsoft VS Code\bin\code.cmd') }
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Microsoft VS Code\bin\code.cmd') }
    $candidates = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    return $candidates | Select-Object -First 1
}

function Invoke-Native([string]$Executable, [string[]]$Arguments, [string]$Description) {
    Write-SetupLog $Description
    Write-SetupLog ("> " + $Executable + ' ' + ($Arguments -join ' '))
    & $Executable @Arguments
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) { $exitCode = 0 }
    if ($exitCode -ne 0) {
        throw "$Description failed with exit code $exitCode."
    }
}

function Download-Msys2Installer {
    $downloadDirectory = Join-Path $env:TEMP 'CPM-Setup'
    Ensure-Directory $downloadDirectory
    $installerPath = Join-Path $downloadDirectory 'msys2-x86_64-latest.exe'
    Write-SetupLog "Downloading the official MSYS2 installer..."
    Invoke-WebRequest -Uri $script:MsysInstallerUrl -OutFile $installerPath -UseBasicParsing
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installerPath).Hash.ToLowerInvariant()
    Write-SetupLog "MSYS2 installer SHA-256: $hash"
    try {
        $signature = Get-AuthenticodeSignature -FilePath $installerPath
    } catch {
        $signature = $null
        Write-SetupLog "Authenticode verification could not be completed: $($_.Exception.Message)"
    }
    if ($signature) {
        Write-SetupLog "MSYS2 installer Authenticode status: $($signature.Status)"
        if ($signature.Status -eq 'NotSigned' -or $signature.Status -eq 'HashMismatch') {
            throw "The downloaded MSYS2 installer signature is not acceptable ($($signature.Status))."
        }
        if ($signature.Status -ne 'Valid') {
            Write-SetupLog "Authenticode verification warning: status is $($signature.Status)."
        }
    }
    return $installerPath
}

function Ensure-Msys2([string]$Root) {
    $bash = Join-Path $Root 'usr\bin\bash.exe'
    if (Test-Path -LiteralPath $bash) {
        Write-SetupLog "Existing MSYS2 installation detected: $Root"
        return $bash
    }

    $installer = Download-Msys2Installer
    $rootForward = $Root.Replace('\','/')
    Ensure-Directory (Split-Path -Parent $Root)
    Write-SetupLog "Installing MSYS2 into $Root"
    $arguments = @('in','--confirm-command','--accept-messages','--root',$rootForward)
    Write-SetupLog ("> " + $installer + ' ' + ($arguments -join ' '))
    $process = Start-Process -FilePath $installer -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "MSYS2 installer failed with exit code $($process.ExitCode)." }
    if (-not (Test-Path -LiteralPath $bash)) {
        throw "MSYS2 installation finished but bash.exe was not found in $Root."
    }
    return $bash
}

function Invoke-Pacman([string]$Bash, [string]$Command, [string]$Description) {
    Invoke-Native $Bash @('-lc', $Command) $Description
}

function Update-Msys2([string]$Bash) {
    # Running the update twice is intentional: an MSYS2 runtime/core update can
    # require a fresh shell before the remaining packages are updated.
    for ($i = 1; $i -le 2; $i++) {
        try {
            Invoke-Pacman $Bash 'pacman -Syu --noconfirm' "Updating MSYS2 package database/system (pass $i/2)"
        } catch {
            if ($i -eq 2) { throw }
            Write-SetupLog "First update pass requested a restart or returned a transient status; retrying in a fresh shell."
        }
    }
}

function Install-X64Toolchain([string]$Bash, [bool]$WithBuildTools) {
    $packages = @('mingw-w64-ucrt-x86_64-toolchain')
    if ($WithBuildTools) {
        $packages += @('mingw-w64-ucrt-x86_64-cmake','mingw-w64-ucrt-x86_64-ninja')
    }
    Invoke-Pacman $Bash ("pacman -S --needed --noconfirm " + ($packages -join ' ')) 'Installing MinGW-w64 UCRT64 GCC/G++ 64-bit toolchain'
}

function Install-X86Toolchain([string]$Bash) {
    # GDB and mingw32-make are requested explicitly because the current i686
    # toolchain group metadata is not as complete/consistent as UCRT64.
    $packages = @(
        'mingw-w64-i686-toolchain',
        'mingw-w64-i686-gdb',
        'mingw-w64-i686-make'
    )
    Invoke-Pacman $Bash ("pacman -S --needed --noconfirm " + ($packages -join ' ')) 'Installing MinGW-w64 MINGW32 GCC/G++ 32-bit toolchain'
}

function Add-UserPathEntry([string]$Entry) {
    $current = [Environment]::GetEnvironmentVariable('Path','User')
    $parts = @($current -split ';' | Where-Object { $_ -and $_.Trim() })
    if (-not ($parts | Where-Object { $_.TrimEnd('\') -ieq $Entry.TrimEnd('\') })) {
        [Environment]::SetEnvironmentVariable('Path', (($parts + $Entry) -join ';'), 'User')
        Write-SetupLog "Added to user PATH: $Entry"
    } else {
        Write-SetupLog "User PATH already contains: $Entry"
    }
}

function Install-VsCodeComponents([string]$Vsix, [bool]$CppTools) {
    $code = Find-CodeCli
    if (-not $code) {
        Write-SetupLog 'VS Code CLI was not found; skipping extension installation. The VSIX can be installed manually.'
        return
    }
    Write-SetupLog "VS Code CLI: $code"
    if ($CppTools) {
        Invoke-Native $code @('--install-extension','ms-vscode.cpptools','--force') 'Installing/updating Microsoft C/C++ extension'
    }
    if ($Vsix -and (Test-Path -LiteralPath $Vsix)) {
        Invoke-Native $code @('--install-extension',$Vsix,'--force') 'Installing/updating C/C++ Project Manager'
    } elseif (-not $ToolchainsOnly) {
        Write-SetupLog "CPM VSIX was not found at '$Vsix'; toolchains were installed but CPM itself was not changed."
    }
}

function Get-FirstVersionLine([string]$Executable) {
    if (-not (Test-Path -LiteralPath $Executable)) { return $null }
    try { return (& $Executable --version 2>$null | Select-Object -First 1) } catch { return $null }
}

function Write-InstallationReport([string]$Root) {
    $reportPath = Join-Path $script:SetupRoot 'toolchains.json'
    $report = [ordered]@{
        generatedAt = (Get-Date).ToString('o')
        msys2Root = $Root
        x64 = [ordered]@{
            gcc = Get-FirstVersionLine (Join-Path $Root 'ucrt64\bin\gcc.exe')
            gxx = Get-FirstVersionLine (Join-Path $Root 'ucrt64\bin\g++.exe')
            gdb = Get-FirstVersionLine (Join-Path $Root 'ucrt64\bin\gdb.exe')
            cmake = Get-FirstVersionLine (Join-Path $Root 'ucrt64\bin\cmake.exe')
            ninja = Get-FirstVersionLine (Join-Path $Root 'ucrt64\bin\ninja.exe')
        }
        x86 = [ordered]@{
            gcc = Get-FirstVersionLine (Join-Path $Root 'mingw32\bin\gcc.exe')
            gxx = Get-FirstVersionLine (Join-Path $Root 'mingw32\bin\g++.exe')
            gdb = Get-FirstVersionLine (Join-Path $Root 'mingw32\bin\gdb.exe')
            make = Get-FirstVersionLine (Join-Path $Root 'mingw32\bin\mingw32-make.exe')
        }
    }
    $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8
    Write-SetupLog "Installation report: $reportPath"
}

function Invoke-CpmSetup([bool]$DoX64, [bool]$DoX86, [bool]$DoBuildTools, [bool]$DoCppTools, [bool]$DoAddPath, [string]$Root, [string]$Vsix) {
    if (-not $DoX64 -and -not $DoX86 -and $ToolchainsOnly) {
        throw 'Select at least one toolchain.'
    }
    Set-SetupProgress 5
    Write-SetupLog '=== CPM Setup started ==='
    Write-SetupLog "Toolchain root: $Root"

    $needsMsys = $DoX64 -or $DoX86
    if ($needsMsys) {
        $bash = Ensure-Msys2 $Root
        Set-SetupProgress 25
        Update-Msys2 $bash
        Set-SetupProgress 45
        if ($DoX64) {
            Install-X64Toolchain $bash $DoBuildTools
        }
        Set-SetupProgress 65
        if ($DoX86) {
            Install-X86Toolchain $bash
        }
        Set-SetupProgress 80
        [Environment]::SetEnvironmentVariable('MSYS2_ROOT', $Root, 'User')
        [Environment]::SetEnvironmentVariable('CPM_TOOLCHAINS_ROOT', $Root, 'User')
        Write-SetupLog 'User environment variables MSYS2_ROOT and CPM_TOOLCHAINS_ROOT were updated.'
        if ($DoAddPath -and $DoX64) {
            Add-UserPathEntry (Join-Path $Root 'ucrt64\bin')
        }
        Write-InstallationReport $Root
    }

    Set-SetupProgress 88
    Install-VsCodeComponents $Vsix $DoCppTools
    Set-SetupProgress 100
    Write-SetupLog '=== CPM Setup completed successfully ==='
}

function Show-InstallerGui {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()

    $form = New-Object System.Windows.Forms.Form
    $form.Text = if ($ToolchainsOnly) { 'CPM Toolchain Installer' } else { 'C/C++ Project Manager Setup' }
    $form.Size = New-Object System.Drawing.Size(790,690)
    $form.MinimumSize = New-Object System.Drawing.Size(790,690)
    $form.StartPosition = 'CenterScreen'
    $form.Font = New-Object System.Drawing.Font('Segoe UI',9)

    $title = New-Object System.Windows.Forms.Label
    $title.Text = 'C/C++ Project Manager - Development Environment Setup'
    $title.Font = New-Object System.Drawing.Font('Segoe UI Semibold',14)
    $title.Location = New-Object System.Drawing.Point(22,18)
    $title.AutoSize = $true
    $form.Controls.Add($title)

    $subtitle = New-Object System.Windows.Forms.Label
    $subtitle.Text = 'Install supported MinGW-w64 toolchains side-by-side without putting both gcc.exe versions on PATH.'
    $subtitle.Location = New-Object System.Drawing.Point(24,52)
    $subtitle.Size = New-Object System.Drawing.Size(730,38)
    $form.Controls.Add($subtitle)

    $x64 = New-Object System.Windows.Forms.CheckBox
    $x64.Text = 'MinGW-w64 GCC/G++ 64-bit (MSYS2 UCRT64) - recommended'
    $x64.Checked = $true
    $x64.Location = New-Object System.Drawing.Point(28,98)
    $x64.Size = New-Object System.Drawing.Size(650,26)
    $form.Controls.Add($x64)

    $x86 = New-Object System.Windows.Forms.CheckBox
    $x86.Text = 'MinGW-w64 GCC/G++ 32-bit (MSYS2 MINGW32)'
    $x86.Checked = $true
    $x86.Location = New-Object System.Drawing.Point(28,130)
    $x86.Size = New-Object System.Drawing.Size(650,26)
    $form.Controls.Add($x86)

    $buildTools = New-Object System.Windows.Forms.CheckBox
    $buildTools.Text = 'Install CMake + Ninja in the UCRT64 environment'
    $buildTools.Checked = $true
    $buildTools.Location = New-Object System.Drawing.Point(48,162)
    $buildTools.Size = New-Object System.Drawing.Size(650,26)
    $form.Controls.Add($buildTools)

    $cppTools = New-Object System.Windows.Forms.CheckBox
    $cppTools.Text = 'Install/update Microsoft C/C++ extension (cpptools) for IntelliSense and cppdbg'
    $cppTools.Checked = $true
    $cppTools.Location = New-Object System.Drawing.Point(28,194)
    $cppTools.Size = New-Object System.Drawing.Size(700,26)
    $form.Controls.Add($cppTools)

    $pathCheck = New-Object System.Windows.Forms.CheckBox
    $pathCheck.Text = 'Add only UCRT64\\bin to my user PATH (optional; CPM does not require this)'
    $pathCheck.Checked = $false
    $pathCheck.Location = New-Object System.Drawing.Point(28,226)
    $pathCheck.Size = New-Object System.Drawing.Size(700,26)
    $form.Controls.Add($pathCheck)

    $rootLabel = New-Object System.Windows.Forms.Label
    $rootLabel.Text = 'MSYS2 / toolchain installation root:'
    $rootLabel.Location = New-Object System.Drawing.Point(26,266)
    $rootLabel.AutoSize = $true
    $form.Controls.Add($rootLabel)

    $rootBox = New-Object System.Windows.Forms.TextBox
    $rootBox.Text = $InstallRoot
    $rootBox.Location = New-Object System.Drawing.Point(28,288)
    $rootBox.Size = New-Object System.Drawing.Size(700,25)
    $form.Controls.Add($rootBox)

    $note = New-Object System.Windows.Forms.Label
    $note.Text = 'The installer uses the official MSYS2 distribution and pacman. Toolchains are installed side-by-side in ucrt64 (64-bit) and mingw32 (32-bit).'
    $note.Location = New-Object System.Drawing.Point(28,322)
    $note.Size = New-Object System.Drawing.Size(705,42)
    $form.Controls.Add($note)

    $progress = New-Object System.Windows.Forms.ProgressBar
    $progress.Location = New-Object System.Drawing.Point(28,370)
    $progress.Size = New-Object System.Drawing.Size(700,20)
    $form.Controls.Add($progress)
    $script:ProgressBar = $progress

    $log = New-Object System.Windows.Forms.TextBox
    $log.Multiline = $true
    $log.ReadOnly = $true
    $log.ScrollBars = 'Vertical'
    $log.Location = New-Object System.Drawing.Point(28,404)
    $log.Size = New-Object System.Drawing.Size(700,170)
    $log.Anchor = 'Top,Bottom,Left,Right'
    $form.Controls.Add($log)
    $script:LogControl = $log

    $install = New-Object System.Windows.Forms.Button
    $install.Text = if ($ToolchainsOnly) { 'Install / Update toolchains' } else { 'Install CPM environment' }
    $install.Location = New-Object System.Drawing.Point(508,594)
    $install.Size = New-Object System.Drawing.Size(220,34)
    $install.Anchor = 'Bottom,Right'
    $form.Controls.Add($install)
    $script:InstallButton = $install

    $close = New-Object System.Windows.Forms.Button
    $close.Text = 'Close'
    $close.Location = New-Object System.Drawing.Point(392,594)
    $close.Size = New-Object System.Drawing.Size(105,34)
    $close.Anchor = 'Bottom,Right'
    $close.Add_Click({ $form.Close() })
    $form.Controls.Add($close)

    $install.Add_Click({
        $install.Enabled = $false
        $close.Enabled = $false
        try {
            Invoke-CpmSetup $x64.Checked $x86.Checked $buildTools.Checked $cppTools.Checked $pathCheck.Checked $rootBox.Text.Trim() $VsixPath
            [System.Windows.Forms.MessageBox]::Show('Installation completed successfully. Restart VS Code, then use "Detect / Select Toolchain" in CPM to choose x64 or x86.','CPM Setup','OK','Information') | Out-Null
        } catch {
            Write-SetupLog "ERROR: $($_.Exception.Message)"
            [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'CPM Setup failed','OK','Error') | Out-Null
        } finally {
            $install.Enabled = $true
            $close.Enabled = $true
        }
    })

    [void]$form.ShowDialog()
}

Ensure-Directory $script:SetupRoot
if ($Silent) {
    if (-not $InstallX64 -and -not $InstallX86) { $InstallX64 = $true }
    if (-not $PSBoundParameters.ContainsKey('InstallBuildTools')) { $InstallBuildTools = $true }
    if (-not $PSBoundParameters.ContainsKey('InstallCppTools')) { $InstallCppTools = $true }
    Invoke-CpmSetup $InstallX64 $InstallX86 $InstallBuildTools $InstallCppTools $AddUcrt64ToUserPath $InstallRoot $VsixPath
} else {
    Show-InstallerGui
}
