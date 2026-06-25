import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CpmInstallation } from '../model/types';

const CONFIG_SECTION = 'cpm';
const EXECUTABLE_SUFFIXES = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['', '.exe'];

function exists(filePath: string | undefined): filePath is string {
  return !!filePath && fs.existsSync(filePath);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value?.trim()) {
      continue;
    }
    const normalized = path.normalize(value.trim());
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result;
}

function executableNames(baseNames: string[]): string[] {
  const result: string[] = [];
  for (const baseName of baseNames) {
    if (path.extname(baseName)) {
      result.push(baseName);
      continue;
    }
    for (const suffix of EXECUTABLE_SUFFIXES) {
      result.push(`${baseName}${suffix}`);
    }
  }
  return unique(result);
}

function findExecutable(root: string, names: string[], recursive = false): string | undefined {
  const executableCandidates = executableNames(names);
  const commonDirectories = unique([
    root,
    path.join(root, 'bin'),
    path.join(root, 'Bin'),
    path.join(root, 'mingw64', 'bin'),
    path.join(root, 'mingw32', 'bin'),
    path.join(root, 'ucrt64', 'bin'),
    path.join(root, 'clang64', 'bin')
  ]);
  for (const directory of commonDirectories) {
    for (const name of executableCandidates) {
      const candidate = path.join(directory, name);
      if (exists(candidate)) {
        return candidate;
      }
    }
  }
  return recursive ? findExecutableBelow(root, executableCandidates, 4) : undefined;
}

function findExecutableBelow(root: string, names: string[], maxDepth: number): string | undefined {
  if (!fs.existsSync(root)) {
    return undefined;
  }
  const expected = new Set(names.map((name) => name.toLowerCase()));
  const queue: Array<{ directory: string; depth: number }> = [{ directory: root, depth: 0 }];
  while (queue.length) {
    const current = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && expected.has(entry.name.toLowerCase())) {
        return path.join(current.directory, entry.name);
      }
    }
    if (current.depth >= maxDepth) {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        queue.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
      }
    }
  }
  return undefined;
}

function parentDirectoryOfExecutable(executablePath: string | undefined): string | undefined {
  if (!executablePath) {
    return undefined;
  }
  return fs.existsSync(executablePath) ? path.dirname(executablePath) : undefined;
}

function splitPathEnvironment(): string[] {
  const raw = process.env.Path || process.env.PATH || '';
  return raw.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);
}

function commonToolchainRoots(): string[] {
  if (process.platform !== 'win32') {
    return ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin', '/mingw64/bin', '/ucrt64/bin', '/clang64/bin'];
  }

  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [
    'C:\\msys64\\ucrt64\\bin',
    'C:\\msys64\\mingw64\\bin',
    'C:\\msys64\\mingw32\\bin',
    'C:\\msys64\\clang64\\bin',
    'C:\\MinGW\\bin',
    'C:\\mingw64\\bin',
    'C:\\mingw32\\bin',
    'C:\\TDM-GCC-64\\bin',
    'C:\\TDM-GCC-32\\bin',
    'C:\\ProgramData\\chocolatey\\bin',
    path.join(programFiles, 'LLVM', 'bin'),
    path.join(programFilesX86, 'LLVM', 'bin'),
    localAppData ? path.join(localAppData, 'Programs', 'mingw64', 'bin') : ''
  ];

  for (const root of ['C:\\Qt\\Tools', path.join(programFiles, 'Qt', 'Tools'), path.join(programFilesX86, 'Qt', 'Tools')]) {
    candidates.push(...scanChildBinDirectories(root, 2));
  }
  return candidates;
}

function scanChildBinDirectories(root: string, maxDepth: number): string[] {
  const result: string[] = [];
  if (!root || !fs.existsSync(root)) {
    return result;
  }
  const queue: Array<{ directory: string; depth: number }> = [{ directory: root, depth: 0 }];
  while (queue.length) {
    const current = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.directory, { withFileTypes: true });
    } catch {
      continue;
    }
    if (path.basename(current.directory).toLowerCase() === 'bin') {
      result.push(current.directory);
      continue;
    }
    if (current.depth >= maxDepth) {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        result.push(...scanChildBinDirectories(path.join(current.directory, entry.name), maxDepth - current.depth - 1));
      }
    }
  }
  return result;
}

function toolchainKind(installation: CpmInstallation): string {
  const paths = [installation.cCompilerExe, installation.cppCompilerExe, installation.clangCcExe, installation.root]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (paths.includes('clang')) return 'Clang/LLVM';
  if (paths.includes('msys64')) return 'MSYS2/MinGW';
  if (paths.includes('mingw')) return 'MinGW/GCC';
  if (paths.includes('tdm-gcc')) return 'TDM-GCC';
  if (paths.includes('gcc') || paths.includes('g++')) return 'GCC';
  return 'C/C++ toolchain';
}

function pathDetail(value: string | undefined, fallback: string): string {
  return value ? path.basename(value) : fallback;
}

export class CpmInstallationService {
  constructor(private readonly output: vscode.OutputChannel) {}

  get configuration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
  }

  describe(root: string, source: CpmInstallation['source'], recursive = false): CpmInstallation {
    const normalizedRoot = path.normalize(root);
    const cCompilerExe = findExecutable(normalizedRoot, ['gcc', 'clang', 'cc'], recursive);
    const cppCompilerExe = findExecutable(normalizedRoot, ['g++', 'clang++', 'c++'], recursive);
    const archiverExe = findExecutable(normalizedRoot, ['ar', 'gcc-ar', 'llvm-ar'], recursive);
    const debuggerExe = findExecutable(normalizedRoot, ['gdb', 'lldb'], recursive);
    const intelliSenseCompiler = cppCompilerExe ?? cCompilerExe ?? findExecutable(normalizedRoot, ['clang', 'clang++'], recursive);

    return {
      root: normalizedRoot,
      label: `${toolchainLabelFromRoot(normalizedRoot)} (${toolchainLabelFromPath(cppCompilerExe ?? cCompilerExe ?? normalizedRoot)})`,
      compileExe: cCompilerExe,
      ideExe: undefined,
      clangCcExe: intelliSenseCompiler,
      cCompilerExe,
      cppCompilerExe,
      archiverExe,
      debuggerExe,
      source
    };
  }

  describeExplicitCompilerPaths(source: CpmInstallation['source'] = 'configured'): CpmInstallation | undefined {
    const cCompiler = normalizeExecutableSetting(this.configuration.get<string>('cCompilerPath', ''));
    const cppCompiler = normalizeExecutableSetting(this.configuration.get<string>('cppCompilerPath', ''));
    const archiver = normalizeExecutableSetting(this.configuration.get<string>('archiverPath', ''));
    const debuggerPath = normalizeExecutableSetting(this.configuration.get<string>('debuggerPath', ''));
    const root = parentDirectoryOfExecutable(cppCompiler) ?? parentDirectoryOfExecutable(cCompiler) ?? 'PATH';
    if (!cCompiler && !cppCompiler) {
      return undefined;
    }
    return {
      root,
      label: `${toolchainLabelFromRoot(root)} (configured executables)`,
      compileExe: cCompiler,
      ideExe: undefined,
      clangCcExe: cppCompiler ?? cCompiler,
      cCompilerExe: cCompiler,
      cppCompilerExe: cppCompiler,
      archiverExe: archiver,
      debuggerExe: debuggerPath,
      source
    };
  }

  getConfiguredInstallations(): CpmInstallation[] {
    const roots = this.configuration.get<string[]>('installations', []);
    const activeRoot = this.configuration.get<string>('activeInstallation', '').trim();
    const explicit = this.describeExplicitCompilerPaths('configured');
    return [
      ...(explicit ? [explicit] : []),
      ...unique([activeRoot, ...roots]).filter((root) => fs.existsSync(root)).map((root) => this.describe(root, 'configured'))
    ].filter(hasCompiler);
  }

  scanInstallations(): CpmInstallation[] {
    const roots: string[] = [];
    for (const variableName of ['MINGW_HOME', 'MSYS2_ROOT', 'LLVM_HOME', 'GCC_HOME']) {
      const value = process.env[variableName];
      if (value) {
        roots.push(value, path.join(value, 'bin'));
      }
    }
    roots.push(...splitPathEnvironment());
    roots.push(...commonToolchainRoots());

    return unique(roots)
      .filter((root) => fs.existsSync(root))
      .map((root) => this.describe(root, 'scan'))
      .filter(hasCompiler);
  }

  getKnownInstallations(workspaceCpmDir?: string): CpmInstallation[] {
    const configured = this.getConfiguredInstallations();
    const scanned = this.scanInstallations();
    const workspace = workspaceCpmDir && fs.existsSync(workspaceCpmDir) ? [this.describe(workspaceCpmDir, 'workspace')].filter(hasCompiler) : [];
    const merged = [...configured, ...workspace, ...scanned];
    const byKey = new Map<string, CpmInstallation>();
    for (const installation of merged) {
      const key = [installation.cCompilerExe, installation.cppCompilerExe, installation.root].filter(Boolean).join('|').toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, installation);
      }
    }
    return [...byKey.values()];
  }

  getActiveInstallation(workspaceCpmDir?: string, scanIfNeeded = true): CpmInstallation | undefined {
    const explicit = this.describeExplicitCompilerPaths('configured');
    if (explicit && hasCompiler(explicit)) {
      return explicit;
    }

    const selectedRoot = this.configuration.get<string>('activeInstallation', '').trim();
    if (selectedRoot && fs.existsSync(selectedRoot)) {
      const selected = this.describe(selectedRoot, 'configured');
      if (hasCompiler(selected)) {
        return selected;
      }
    }

    if (workspaceCpmDir && fs.existsSync(workspaceCpmDir)) {
      const workspace = this.describe(workspaceCpmDir, 'workspace');
      if (hasCompiler(workspace)) {
        return workspace;
      }
    }

    return scanIfNeeded ? this.getKnownInstallations()[0] : undefined;
  }

  async selectInstallation(workspaceCpmDir?: string): Promise<CpmInstallation | undefined> {
    const installations = this.getKnownInstallations(workspaceCpmDir);
    const choices: Array<vscode.QuickPickItem & { installation?: CpmInstallation; manualFolder?: boolean; manualExecutables?: boolean }> = installations.map((installation) => ({
      label: `$(tools) ${toolchainKind(installation)}`,
      description: installation.root,
      detail: `${pathDetail(installation.cCompilerExe, 'C compiler missing')} · ${pathDetail(installation.cppCompilerExe, 'C++ compiler missing')} · ${pathDetail(installation.debuggerExe, 'debugger missing')} · ${installation.source}`,
      installation
    }));
    choices.push({
      label: '$(folder-opened) Add toolchain from folder...',
      description: 'Choose a bin directory or a toolchain root containing gcc/g++/clang.',
      manualFolder: true
    });
    choices.push({
      label: '$(edit) Enter compiler executable paths manually...',
      description: 'Configure C compiler, C++ compiler, archiver and debugger paths explicitly.',
      manualExecutables: true
    });

    const selected = await vscode.window.showQuickPick(choices, {
      title: 'Select the C/C++ toolchain',
      placeHolder: 'Detected GCC, MinGW, MSYS2 and Clang toolchains are listed first.'
    });
    if (!selected) {
      return undefined;
    }

    let installation = selected.installation;
    if (selected.manualFolder) {
      const folder = await vscode.window.showOpenDialog({
        title: 'Select the C/C++ toolchain root or bin directory',
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false
      });
      if (!folder?.[0]) {
        return undefined;
      }
      installation = this.describe(folder[0].fsPath, 'manual');
      if (!hasCompiler(installation)) {
        vscode.window.showWarningMessage('No gcc/g++/clang executable was detected in this folder. You can still enter compiler paths manually.');
      }
    }

    if (selected.manualExecutables) {
      installation = await this.promptManualExecutablePaths();
    }

    if (!installation) {
      return undefined;
    }

    await this.persistToolchain(installation);
    this.output.appendLine(`[C/C++] Selected toolchain: ${installation.root}`);
    this.output.appendLine(`[C/C++] C compiler: ${installation.cCompilerExe ?? '<not configured>'}`);
    this.output.appendLine(`[C/C++] C++ compiler: ${installation.cppCompilerExe ?? '<not configured>'}`);
    this.output.appendLine(`[C/C++] Archiver: ${installation.archiverExe ?? '<not configured>'}`);
    this.output.appendLine(`[C/C++] Debugger: ${installation.debuggerExe ?? '<not configured>'}`);

    if (!installation.cCompilerExe && !installation.cppCompilerExe) {
      vscode.window.showWarningMessage('No C/C++ compiler executable is configured. Build commands will fail until gcc/g++/clang paths are configured.');
    } else if (!installation.debuggerExe) {
      vscode.window.showWarningMessage('The selected toolchain does not expose gdb/lldb. Build and run will work, but debug may require setting cpm.debuggerPath manually.');
    } else {
      vscode.window.showInformationMessage(`C/C++ toolchain selected: ${toolchainKind(installation)}.`);
    }
    return installation;
  }

  private async promptManualExecutablePaths(): Promise<CpmInstallation | undefined> {
    const current = this.describeExplicitCompilerPaths('manual');
    const cCompiler = await promptPath('C compiler executable', current?.cCompilerExe ?? 'gcc');
    if (cCompiler === undefined) return undefined;
    const cppCompiler = await promptPath('C++ compiler executable', current?.cppCompilerExe ?? 'g++');
    if (cppCompiler === undefined) return undefined;
    const archiver = await promptPath('Static-library archiver executable', current?.archiverExe ?? 'ar');
    if (archiver === undefined) return undefined;
    const debuggerPath = await promptPath('Debugger executable', current?.debuggerExe ?? 'gdb');
    if (debuggerPath === undefined) return undefined;

    const root = parentDirectoryOfExecutable(cppCompiler) ?? parentDirectoryOfExecutable(cCompiler) ?? process.cwd();
    return {
      root,
      label: `${toolchainLabelFromRoot(root)} (manual paths)`,
      compileExe: normalizeExecutableSetting(cCompiler),
      ideExe: undefined,
      clangCcExe: normalizeExecutableSetting(cppCompiler) ?? normalizeExecutableSetting(cCompiler),
      cCompilerExe: normalizeExecutableSetting(cCompiler),
      cppCompilerExe: normalizeExecutableSetting(cppCompiler),
      archiverExe: normalizeExecutableSetting(archiver),
      debuggerExe: normalizeExecutableSetting(debuggerPath),
      source: 'manual'
    };
  }

  private async persistToolchain(installation: CpmInstallation): Promise<void> {
    // Persist the active toolchain in the current workspace as well as globally.
    // Workspace values override user values in VS Code; saving only globally made
    // toolchain selection appear to succeed while builds still used older local
    // settings such as plain gcc/g++ or a 32-bit MinGW path.
    await this.persistToolchainToTarget(installation, vscode.ConfigurationTarget.Global);
    await this.persistToolchainToTarget(installation, vscode.ConfigurationTarget.Workspace);
  }

  private async persistToolchainToTarget(installation: CpmInstallation, target: vscode.ConfigurationTarget): Promise<void> {
    await this.configuration.update('activeInstallation', installation.root, target);
    if (installation.cCompilerExe) {
      await this.configuration.update('cCompilerPath', installation.cCompilerExe, target);
    }
    if (installation.cppCompilerExe) {
      await this.configuration.update('cppCompilerPath', installation.cppCompilerExe, target);
      await this.configuration.update('intelliSenseCompilerPath', installation.cppCompilerExe, target);
    } else if (installation.cCompilerExe) {
      await this.configuration.update('intelliSenseCompilerPath', installation.cCompilerExe, target);
    }
    if (installation.archiverExe) {
      await this.configuration.update('archiverPath', installation.archiverExe, target);
    }
    if (installation.debuggerExe) {
      await this.configuration.update('debuggerPath', installation.debuggerExe, target);
    }
    const configured = this.configuration.get<string[]>('installations', []);
    if (!configured.some((root) => path.normalize(root).toLowerCase() === installation.root.toLowerCase())) {
      await this.configuration.update('installations', [...configured, installation.root], target);
    }
  }
}

function hasCompiler(installation: CpmInstallation): boolean {
  return Boolean(installation.cCompilerExe || installation.cppCompilerExe || installation.compileExe || installation.clangCcExe);
}

function normalizeExecutableSetting(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (fs.existsSync(trimmed)) {
    return path.normalize(trimmed);
  }
  // Keep simple command names such as gcc, g++, ar or gdb. They are valid for
  // both the build pipeline and cpptools compilerPath when the executable is on
  // PATH, and they avoid an expensive PATH/toolchain scan during activation.
  if (!path.isAbsolute(trimmed) && !trimmed.includes(path.sep) && !trimmed.includes('/')) {
    return trimmed;
  }
  return trimmed;
}

async function promptPath(title: string, value: string): Promise<string | undefined> {
  return await vscode.window.showInputBox({
    title,
    value,
    prompt: 'Enter either an executable name available from PATH or an absolute executable path.'
  });
}

function toolchainLabelFromRoot(root: string): string {
  const normalized = root.replace(/\\+$/, '');
  const base = path.basename(normalized);
  return base || normalized;
}

function toolchainLabelFromPath(value: string): string {
  return path.basename(path.dirname(value)) || path.basename(value) || value;
}
