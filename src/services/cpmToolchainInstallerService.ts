import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export class CpmToolchainInstallerService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel
  ) {}

  async openInstaller(): Promise<void> {
    if (process.platform !== 'win32') {
      vscode.window.showInformationMessage('The CPM toolchain installer currently targets Windows. On Linux/macOS, install GCC/Clang with the platform package manager, then use Detect / Select Toolchain.');
      return;
    }

    const script = this.context.asAbsolutePath(path.join('setup', 'CPM-Toolchain-Installer.ps1'));
    if (!fs.existsSync(script)) {
      throw new Error(`CPM toolchain installer script is missing: ${script}`);
    }

    const powershell = findPowerShellExecutable();
    if (!powershell) {
      throw new Error('PowerShell was not found. Install Windows PowerShell/PowerShell 7, or run the standalone CPM Setup bundle.');
    }

    const terminal = vscode.window.createTerminal({ name: 'CPM Toolchain Installer', shellPath: powershell, shellArgs: ['-NoProfile', '-ExecutionPolicy', 'Bypass'] });
    terminal.show(true);
    const command = `& ${quotePowerShell(script)} -ToolchainsOnly`;
    this.output.appendLine(`[C/C++] Opening supported toolchain installer: ${script}`);
    terminal.sendText(command, true);

    const action = await vscode.window.showInformationMessage(
      'CPM Toolchain Installer opened. After installation, restart VS Code and run Detect / Select Toolchain to choose the 64-bit or 32-bit compiler.',
      'Detect / Select Toolchain'
    );
    if (action === 'Detect / Select Toolchain') {
      await vscode.commands.executeCommand('cpm.configureInstallation');
    }
  }
}

function findPowerShellExecutable(): string | undefined {
  const candidates = [
    process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : '',
    'powershell.exe',
    'pwsh.exe'
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
    } else {
      return candidate;
    }
  }
  return undefined;
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
