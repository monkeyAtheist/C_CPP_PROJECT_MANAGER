import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { CpmBuildMode, CpmWorkspaceProjectRef } from '../model/types';
import { CpmExternalDependenciesConfiguration, CpmProjectSettingsService } from './cpmProjectSettingsService';
import { CpmWorkspaceService } from './cpmWorkspaceService';
import { CpmDependencyIntegration, dependencyIntegrationPath, emptyDependencyIntegration, readDependencyIntegration, writeDependencyIntegration } from './cpmDependencyModel';

export interface CpmDependencyStatus {
  projectName: string;
  projectPath: string;
  enabled: boolean;
  state: 'disabled' | 'ready' | 'needs-sync' | 'missing-tool' | 'error';
  message: string;
  vcpkgPath: string;
  conanPath: string;
  pkgConfigPath: string;
  managers: string[];
  configuredPackages: number;
  outputDirectory: string;
  integrationFile: string;
  lastSync?: string;
}

export class CpmDependencyService implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changeEmitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private currentStatus?: CpmDependencyStatus;

  constructor(
    private readonly workspaces: CpmWorkspaceService,
    private readonly projectSettings: CpmProjectSettingsService,
    private readonly output: vscode.OutputChannel
  ) {
    this.disposables.push(this.workspaces.onDidChange(() => void this.refresh()));
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.changeEmitter.dispose();
  }

  get status(): CpmDependencyStatus | undefined { return this.currentStatus; }
  get activeProjectRef(): CpmWorkspaceProjectRef | undefined {
    const ref = this.workspaces.activeProjectRef;
    return ref?.exists ? ref : undefined;
  }

  getIntegration(projectRef: CpmWorkspaceProjectRef, mode?: CpmBuildMode): CpmDependencyIntegration {
    const cfg = this.projectSettings.getSettings(projectRef, mode).externalDependencies;
    if (!cfg.enabled) return emptyDependencyIntegration();
    return readDependencyIntegration(path.dirname(projectRef.absolutePath), cfg.outputDirectory);
  }

  async refresh(): Promise<CpmDependencyStatus | undefined> {
    const ref = this.activeProjectRef;
    if (!ref) {
      this.currentStatus = undefined;
      this.changeEmitter.fire();
      return undefined;
    }
    try {
      const cfg = this.projectSettings.getSettings(ref).externalDependencies;
      const root = path.dirname(ref.absolutePath);
      const vcpkgPath = resolveTool(cfg.vcpkg.executable, ['vcpkg', 'vcpkg.exe'], cfg.vcpkg.root ? [path.join(cfg.vcpkg.root, process.platform === 'win32' ? 'vcpkg.exe' : 'vcpkg')] : []);
      const conanPath = resolveTool(cfg.conan.executable, ['conan', 'conan.exe']);
      const pkgConfigPath = resolveTool(cfg.pkgConfig.executable, ['pkg-config', 'pkgconf', 'pkg-config.exe', 'pkgconf.exe']);
      const managers = [cfg.vcpkg.enabled ? 'vcpkg' : '', cfg.conan.enabled ? 'Conan 2' : '', cfg.pkgConfig.enabled ? 'pkg-config' : ''].filter(Boolean);
      const missing = [cfg.vcpkg.enabled && !vcpkgPath ? 'vcpkg' : '', cfg.conan.enabled && !conanPath ? 'Conan 2' : '', cfg.pkgConfig.enabled && !pkgConfigPath ? 'pkg-config' : ''].filter(Boolean);
      const integrationFile = dependencyIntegrationPath(root, cfg.outputDirectory);
      const lastSync = fs.existsSync(integrationFile) ? fs.statSync(integrationFile).mtime.toISOString() : undefined;
      const configuredPackages = cfg.vcpkg.dependencies.length + cfg.conan.requires.length + cfg.pkgConfig.packages.length;
      const state: CpmDependencyStatus['state'] = !cfg.enabled ? 'disabled' : missing.length ? 'missing-tool' : fs.existsSync(integrationFile) ? 'ready' : 'needs-sync';
      const message = !cfg.enabled
        ? 'External dependency management is disabled for this project.'
        : missing.length
          ? `Missing tools: ${missing.join(', ')}.`
          : fs.existsSync(integrationFile)
            ? 'Dependency integration is synchronized.'
            : 'Generate or synchronize dependencies to create build integration.';
      this.currentStatus = {
        projectName: ref.name,
        projectPath: ref.absolutePath,
        enabled: cfg.enabled,
        state,
        message,
        vcpkgPath,
        conanPath,
        pkgConfigPath,
        managers,
        configuredPackages,
        outputDirectory: path.resolve(root, cfg.outputDirectory),
        integrationFile,
        lastSync
      };
    } catch (error) {
      this.currentStatus = {
        projectName: ref.name,
        projectPath: ref.absolutePath,
        enabled: true,
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
        vcpkgPath: '', conanPath: '', pkgConfigPath: '', managers: [], configuredPackages: 0, outputDirectory: '', integrationFile: ''
      };
    }
    this.changeEmitter.fire();
    return this.currentStatus;
  }

  async configure(): Promise<void> {
    const ref = this.requireProject();
    const settings = this.projectSettings.getSettings(ref);
    const enabled = await vscode.window.showQuickPick([
      { label: 'Enable external dependency management', value: true },
      { label: 'Disable external dependency management', value: false }
    ], { title: `C/C++ dependencies — ${ref.name}` });
    if (!enabled) return;
    settings.externalDependencies.enabled = enabled.value;
    if (enabled.value) {
      const managers = await vscode.window.showQuickPick([
        { label: 'vcpkg', value: 'vcpkg', picked: settings.externalDependencies.vcpkg.enabled },
        { label: 'Conan 2', value: 'conan', picked: settings.externalDependencies.conan.enabled },
        { label: 'pkg-config / pkgconf', value: 'pkg', picked: settings.externalDependencies.pkgConfig.enabled }
      ], { title: 'Dependency managers', canPickMany: true });
      if (managers) {
        settings.externalDependencies.vcpkg.enabled = managers.some((entry) => entry.value === 'vcpkg');
        settings.externalDependencies.conan.enabled = managers.some((entry) => entry.value === 'conan');
        settings.externalDependencies.pkgConfig.enabled = managers.some((entry) => entry.value === 'pkg');
      }
    }
    this.projectSettings.setSettings(ref, settings);
    await this.refresh();
  }

  async detectTools(): Promise<CpmDependencyStatus | undefined> {
    const status = await this.refresh();
    if (!status) return undefined;
    this.output.appendLine('[C/C++ Dependencies] Tool detection');
    this.output.appendLine(`[C/C++ Dependencies] vcpkg: ${status.vcpkgPath || 'not found'}`);
    this.output.appendLine(`[C/C++ Dependencies] Conan 2: ${status.conanPath || 'not found'}`);
    this.output.appendLine(`[C/C++ Dependencies] pkg-config: ${status.pkgConfigPath || 'not found'}`);
    vscode.window.showInformationMessage(status.message);
    return status;
  }

  async generateManifests(projectRef?: CpmWorkspaceProjectRef): Promise<boolean> {
    const ref = projectRef ?? this.requireProject();
    const cfg = this.projectSettings.getSettings(ref).externalDependencies;
    if (!cfg.enabled) throw new Error('External dependency management is disabled. Enable it in Project Build Settings first.');
    const root = path.dirname(ref.absolutePath);
    if (cfg.vcpkg.enabled) this.generateVcpkgManifest(root, ref.name, cfg);
    if (cfg.conan.enabled) this.generateConanManifest(root, cfg);
    await this.generateIntegration(ref);
    await this.writeReport(ref);
    this.output.appendLine(`[C/C++ Dependencies] Dependency manifests generated for ${ref.name}.`);
    await this.refresh();
    return true;
  }

  async install(projectRef?: CpmWorkspaceProjectRef): Promise<boolean> {
    const ref = projectRef ?? this.requireProject();
    const cfg = this.projectSettings.getSettings(ref).externalDependencies;
    if (!cfg.enabled) throw new Error('External dependency management is disabled.');
    const root = path.dirname(ref.absolutePath);
    if (cfg.vcpkg.enabled) this.generateVcpkgManifest(root, ref.name, cfg);
    if (cfg.conan.enabled) this.generateConanManifest(root, cfg);
    const status = await this.statusFor(ref);

    if (cfg.vcpkg.enabled) {
      if (!status.vcpkgPath) throw new Error('vcpkg was not found. Configure the executable or VCPKG_ROOT.');
      const triplet = cfg.vcpkg.triplet || inferVcpkgTriplet(this.projectSettings.getCpmConfigurationValue<CpmBuildMode>('buildMode', 'debug'), this.projectSettings.getSettings(ref).linkageMode);
      const args = ['install', '--x-manifest-root', root, '--x-install-root', path.resolve(root, cfg.vcpkg.installRoot), '--triplet', triplet];
      if (cfg.vcpkg.hostTriplet) args.push('--host-triplet', cfg.vcpkg.hostTriplet);
      for (const entry of cfg.vcpkg.overlayPorts) args.push('--overlay-ports', path.resolve(root, entry));
      for (const entry of cfg.vcpkg.overlayTriplets) args.push('--overlay-triplets', path.resolve(root, entry));
      args.push(...cfg.vcpkg.additionalArguments);
      if (!await this.run(status.vcpkgPath, args, root, `vcpkg install — ${ref.name}`)) return false;
    }

    if (cfg.conan.enabled) {
      if (!status.conanPath) throw new Error('Conan 2 was not found. Configure the executable or install Conan 2.');
      const args = ['install', path.resolve(root, cfg.conan.manifestFile), '--output-folder', path.resolve(root, cfg.conan.outputDirectory)];
      if (cfg.conan.buildMissing) args.push('--build=missing');
      if (cfg.conan.profileHost) args.push('-pr:h', cfg.conan.profileHost);
      if (cfg.conan.profileBuild) args.push('-pr:b', cfg.conan.profileBuild);
      if (cfg.conan.lockfile) args.push('--lockfile', path.resolve(root, cfg.conan.lockfile));
      args.push(...cfg.conan.additionalArguments);
      if (!await this.run(status.conanPath, args, root, `Conan install — ${ref.name}`)) return false;
    }

    await this.generateIntegration(ref);
    await this.writeReport(ref);
    if (ref.absolutePath === this.activeProjectRef?.absolutePath) await this.refresh();
    vscode.window.showInformationMessage(`Dependencies synchronized for ${ref.name}.`);
    return true;
  }

  async prepareForBuild(ref: CpmWorkspaceProjectRef): Promise<boolean> {
    const cfg = this.projectSettings.getSettings(ref).externalDependencies;
    if (!cfg.enabled) return true;
    if (cfg.autoInstallBeforeBuild) return this.install(ref);
    const integrationFile = dependencyIntegrationPath(path.dirname(ref.absolutePath), cfg.outputDirectory);
    if (!fs.existsSync(integrationFile)) await this.generateIntegration(ref);
    return true;
  }

  async generateIntegration(ref = this.requireProject()): Promise<CpmDependencyIntegration> {
    const settings = this.projectSettings.getSettings(ref);
    const cfg = settings.externalDependencies;
    const root = path.dirname(ref.absolutePath);
    const integration = emptyDependencyIntegration();
    integration.includeDirectories.push(...cfg.additionalIncludeDirectories.map((entry) => path.resolve(root, entry)));
    integration.libraryDirectories.push(...cfg.additionalLibraryDirectories.map((entry) => path.resolve(root, entry)));
    integration.libraries.push(...cfg.additionalLibraries);
    integration.compilerFlags.push(...cfg.additionalCompilerFlags);
    integration.linkerFlags.push(...cfg.additionalLinkerFlags);

    if (cfg.vcpkg.enabled) {
      const mode = this.projectSettings.getCpmConfigurationValue<CpmBuildMode>('buildMode', 'debug');
      const triplet = cfg.vcpkg.triplet || inferVcpkgTriplet(mode, settings.linkageMode);
      const tripletRoot = path.join(path.resolve(root, cfg.vcpkg.installRoot), triplet);
      const include = path.join(tripletRoot, 'include');
      const releaseLib = path.join(tripletRoot, 'lib');
      const debugLib = path.join(tripletRoot, 'debug', 'lib');
      if (fs.existsSync(include)) integration.includeDirectories.push(include);
      if (isDebugMode(mode) && fs.existsSync(debugLib)) integration.libraryDirectories.push(debugLib);
      if (fs.existsSync(releaseLib)) integration.libraryDirectories.push(releaseLib);
    }

    const pkgConfigSearchPaths = cfg.pkgConfig.searchPaths.map((entry) => path.resolve(root, entry));
    if (cfg.conan.enabled) {
      const out = path.resolve(root, cfg.conan.outputDirectory);
      const conanPkgPaths = [out, path.join(out, 'generators'), path.join(out, 'build', 'generators')].filter((entry) => fs.existsSync(entry));
      pkgConfigSearchPaths.push(...conanPkgPaths);
    }

    if (cfg.pkgConfig.enabled && cfg.pkgConfig.packages.length) {
      const exe = resolveTool(cfg.pkgConfig.executable, ['pkg-config', 'pkgconf', 'pkg-config.exe', 'pkgconf.exe']);
      if (!exe) throw new Error('pkg-config is enabled but no pkg-config/pkgconf executable was found.');
      const env = { ...process.env } as NodeJS.ProcessEnv;
      const configuredPath = unique(pkgConfigSearchPaths).join(path.delimiter);
      if (configuredPath) env.PKG_CONFIG_PATH = [configuredPath, env.PKG_CONFIG_PATH].filter(Boolean).join(path.delimiter);
      const flags = await runCapture(exe, [...(cfg.pkgConfig.staticLink ? ['--static'] : []), '--cflags', '--libs', ...cfg.pkgConfig.additionalArguments, ...cfg.pkgConfig.packages], root, env);
      parsePkgConfigFlags(flags, integration);
      if (configuredPath) integration.environment.PKG_CONFIG_PATH = configuredPath;
    }

    dedupeIntegration(integration);
    const file = dependencyIntegrationPath(root, cfg.outputDirectory);
    writeDependencyIntegration(file, integration);
    this.output.appendLine(`[C/C++ Dependencies] Build integration: ${file}`);
    return integration;
  }

  async openReport(): Promise<void> {
    const report = await this.writeReport(this.requireProject());
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(report), { preview: true });
  }

  async revealOutput(): Promise<void> {
    const ref = this.requireProject();
    const cfg = this.projectSettings.getSettings(ref).externalDependencies;
    const dir = path.resolve(path.dirname(ref.absolutePath), cfg.outputDirectory);
    fs.mkdirSync(dir, { recursive: true });
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dir));
  }

  async clean(): Promise<void> {
    const ref = this.requireProject();
    const cfg = this.projectSettings.getSettings(ref).externalDependencies;
    const dir = path.resolve(path.dirname(ref.absolutePath), cfg.outputDirectory);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    this.output.appendLine(`[C/C++ Dependencies] Cleaned ${dir}`);
    await this.refresh();
  }

  private async statusFor(ref: CpmWorkspaceProjectRef): Promise<CpmDependencyStatus> {
    if (ref.absolutePath === this.activeProjectRef?.absolutePath) {
      const status = await this.refresh();
      if (status) return status;
    }
    const cfg = this.projectSettings.getSettings(ref).externalDependencies;
    const root = path.dirname(ref.absolutePath);
    return {
      projectName: ref.name,
      projectPath: ref.absolutePath,
      enabled: cfg.enabled,
      state: 'needs-sync',
      message: '',
      vcpkgPath: resolveTool(cfg.vcpkg.executable, ['vcpkg', 'vcpkg.exe'], cfg.vcpkg.root ? [path.join(cfg.vcpkg.root, process.platform === 'win32' ? 'vcpkg.exe' : 'vcpkg')] : []),
      conanPath: resolveTool(cfg.conan.executable, ['conan', 'conan.exe']),
      pkgConfigPath: resolveTool(cfg.pkgConfig.executable, ['pkg-config', 'pkgconf', 'pkg-config.exe', 'pkgconf.exe']),
      managers: [], configuredPackages: 0,
      outputDirectory: path.resolve(root, cfg.outputDirectory),
      integrationFile: dependencyIntegrationPath(root, cfg.outputDirectory)
    };
  }

  private generateVcpkgManifest(root: string, projectName: string, cfg: CpmExternalDependenciesConfiguration): void {
    const target = path.resolve(root, cfg.vcpkg.manifestFile);
    const dependencies = cfg.vcpkg.dependencies.map(parseVcpkgDependency);
    const json: Record<string, unknown> = { name: normalizeVcpkgName(projectName), 'version-string': '0.0.0', dependencies };
    if (cfg.vcpkg.baseline) json['builtin-baseline'] = cfg.vcpkg.baseline;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    this.output.appendLine(`[C/C++ Dependencies] Generated ${target}`);
  }

  private generateConanManifest(root: string, cfg: CpmExternalDependenciesConfiguration): void {
    const target = path.resolve(root, cfg.conan.manifestFile);
    const lines: string[] = [];
    if (cfg.conan.requires.length) lines.push('[requires]', ...cfg.conan.requires, '');
    if (cfg.conan.toolRequires.length) lines.push('[tool_requires]', ...cfg.conan.toolRequires, '');
    lines.push('[generators]', 'PkgConfigDeps', 'CMakeDeps', 'CMakeToolchain', '');
    if (cfg.conan.options.length) lines.push('[options]', ...cfg.conan.options, '');
    lines.push('[layout]', 'cmake_layout', '');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${lines.join('\n')}\n`, 'utf8');
    this.output.appendLine(`[C/C++ Dependencies] Generated ${target}`);
  }

  private async writeReport(ref: CpmWorkspaceProjectRef): Promise<string> {
    const cfg = this.projectSettings.getSettings(ref).externalDependencies;
    const root = path.dirname(ref.absolutePath);
    const status = await this.statusFor(ref);
    const integration = readDependencyIntegration(root, cfg.outputDirectory);
    const report = path.resolve(root, cfg.outputDirectory, 'CPM_DEPENDENCIES.md');
    fs.mkdirSync(path.dirname(report), { recursive: true });
    const text = `# C/C++ Dependencies — ${ref.name}\n\n- Enabled: ${cfg.enabled ? 'yes' : 'no'}\n- Auto install before build: ${cfg.autoInstallBeforeBuild ? 'yes' : 'no'}\n- vcpkg: ${cfg.vcpkg.enabled ? (status.vcpkgPath || 'missing') : 'disabled'}\n- Conan 2: ${cfg.conan.enabled ? (status.conanPath || 'missing') : 'disabled'}\n- pkg-config: ${cfg.pkgConfig.enabled ? (status.pkgConfigPath || 'missing') : 'disabled'}\n- Integration: ${dependencyIntegrationPath(root, cfg.outputDirectory)}\n\n## vcpkg dependencies\n\n${cfg.vcpkg.dependencies.map((entry) => `- ${entry}`).join('\n') || '- none'}\n\n## Conan requires\n\n${cfg.conan.requires.map((entry) => `- ${entry}`).join('\n') || '- none'}\n\n## pkg-config packages\n\n${cfg.pkgConfig.packages.map((entry) => `- ${entry}`).join('\n') || '- none'}\n\n## Build integration\n\nInclude directories:\n${integration.includeDirectories.map((entry) => `- ${entry}`).join('\n') || '- none'}\n\nLibrary directories:\n${integration.libraryDirectories.map((entry) => `- ${entry}`).join('\n') || '- none'}\n\nLibraries:\n${integration.libraries.map((entry) => `- ${entry}`).join('\n') || '- none'}\n\nCompiler flags:\n${integration.compilerFlags.map((entry) => `- ${entry}`).join('\n') || '- none'}\n\nLinker flags:\n${integration.linkerFlags.map((entry) => `- ${entry}`).join('\n') || '- none'}\n`;
    fs.writeFileSync(report, text, 'utf8');
    return report;
  }

  private requireProject(): CpmWorkspaceProjectRef {
    const ref = this.activeProjectRef;
    if (!ref) throw new Error('Open or select a C/C++ project first.');
    return ref;
  }

  private run(executable: string, args: string[], cwd: string, label: string): Promise<boolean> {
    this.output.appendLine(`[C/C++ Dependencies] ${label}`);
    this.output.appendLine(`[C/C++ Dependencies] Tool: ${executable}`);
    this.output.appendLine(`[C/C++ Dependencies] Arguments: ${args.map(renderArg).join(' ')}`);
    return new Promise((resolve) => {
      const child = spawn(executable, args, { cwd, env: process.env, shell: false, windowsHide: true });
      child.stdout.on('data', (data) => this.output.append(String(data)));
      child.stderr.on('data', (data) => this.output.append(String(data)));
      child.on('error', (error) => { this.output.appendLine(`[C/C++ Dependencies] ${error.message}`); resolve(false); });
      child.on('close', (code) => { this.output.appendLine(`[C/C++ Dependencies] ${path.basename(executable)} exited with code ${String(code)}.`); resolve(code === 0); });
    });
  }
}

function resolveTool(configured: string, names: string[], extra: string[] = []): string {
  for (const candidate of [configured, ...extra]) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return '';
}

function normalizeVcpkgName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'cpm-project';
}
function parseVcpkgDependency(value: string): string | Record<string, unknown> {
  const match = /^([^\[]+)\[([^\]]+)\]$/.exec(value.trim());
  return match ? { name: match[1].trim(), features: match[2].split(',').map((entry) => entry.trim()).filter(Boolean) } : value.trim();
}
function inferVcpkgTriplet(mode: CpmBuildMode, linkageMode: string): string {
  const is64 = mode === 'debug64' || mode === 'release64';
  const staticSuffix = linkageMode === 'static' && process.platform === 'win32' ? '-static' : '';
  if (process.platform === 'win32') return `${is64 ? 'x64' : 'x86'}-windows${staticSuffix}`;
  if (process.platform === 'darwin') return `${process.arch === 'arm64' ? 'arm64' : 'x64'}-osx`;
  return `${process.arch === 'arm64' ? 'arm64' : 'x64'}-linux`;
}
function isDebugMode(mode: CpmBuildMode): boolean { return mode === 'debug' || mode === 'debug64'; }
function renderArg(value: string): string { return /\s/.test(value) ? JSON.stringify(value) : value; }
function runCapture(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, shell: false, windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (data) => stdout += String(data));
    child.stderr.on('data', (data) => stderr += String(data));
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${path.basename(executable)} exited with code ${String(code)}: ${stderr.trim()}`)));
  });
}
function parsePkgConfigFlags(text: string, integration: CpmDependencyIntegration): void {
  const tokens = splitShell(text);
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if ((token === '-I' || token === '-L' || token === '-isystem') && tokens[index + 1]) {
      const value = tokens[++index];
      if (token === '-L') integration.libraryDirectories.push(value);
      else integration.includeDirectories.push(value);
    } else if (token.startsWith('-I') && token.length > 2) integration.includeDirectories.push(token.slice(2));
    else if (token.startsWith('-L') && token.length > 2) integration.libraryDirectories.push(token.slice(2));
    else if (token.startsWith('-l') && token.length > 2) integration.libraries.push(token.slice(2));
    else if (token.startsWith('-D') || token.startsWith('-f') || token === '-pthread' || token.startsWith('-std=')) integration.compilerFlags.push(token);
    else integration.linkerFlags.push(token);
  }
}
function splitShell(value: string): string[] {
  const result: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) result.push(match[1] ?? match[2] ?? match[3]);
  return result;
}
function dedupeIntegration(value: CpmDependencyIntegration): void {
  value.includeDirectories = unique(value.includeDirectories);
  value.libraryDirectories = unique(value.libraryDirectories);
  value.libraries = unique(value.libraries);
  value.compilerFlags = unique(value.compilerFlags);
  value.linkerFlags = unique(value.linkerFlags);
}
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
