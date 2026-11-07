import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { CpmParser } from '../model/cpmParser';
import { CpmBuildMode, CpmWorkspaceProjectRef } from '../model/types';
import { CpmWorkspaceService } from './cpmWorkspaceService';

export type CpmLinkageMode = 'dynamic' | 'static-runtime' | 'static';
export type CpmBuildBackend = 'direct' | 'cmake';

export interface CpmCMakeConfiguration {
  executable: string;
  generator: string;
  generatorPlatform: string;
  generatorToolset: string;
  ninjaExecutable: string;
  sourceDirectory: string;
  buildDirectory: string;
  target: string;
  configureBeforeBuild: boolean;
  exportCompileCommands: boolean;
  inheritCpmCompilers: boolean;
  useDependencyToolchain: boolean;
  toolchainFile: string;
  cacheVariables: string[];
  configureArguments: string[];
  buildArguments: string[];
}


export interface CpmExternalDependenciesConfiguration {
  enabled: boolean;
  autoInstallBeforeBuild: boolean;
  outputDirectory: string;
  additionalIncludeDirectories: string[];
  additionalLibraryDirectories: string[];
  additionalLibraries: string[];
  additionalCompilerFlags: string[];
  additionalLinkerFlags: string[];
  vcpkg: {
    enabled: boolean;
    executable: string;
    root: string;
    manifestFile: string;
    installRoot: string;
    triplet: string;
    hostTriplet: string;
    baseline: string;
    dependencies: string[];
    overlayPorts: string[];
    overlayTriplets: string[];
    additionalArguments: string[];
  };
  conan: {
    enabled: boolean;
    executable: string;
    manifestFile: string;
    outputDirectory: string;
    requires: string[];
    toolRequires: string[];
    options: string[];
    profileHost: string;
    profileBuild: string;
    buildMissing: boolean;
    lockfile: string;
    additionalArguments: string[];
  };
  pkgConfig: {
    enabled: boolean;
    executable: string;
    packages: string[];
    searchPaths: string[];
    staticLink: boolean;
    additionalArguments: string[];
  };
}


export interface CpmRemoteLinuxConfiguration {
  enabled: boolean;
  sshHost: string;
  sshUser: string;
  sshPort: number;
  sshExecutable: string;
  scpExecutable: string;
  rsyncExecutable: string;
  useRsync: boolean;
  remoteProjectDirectory: string;
  remoteBuildDirectory: string;
  syncBeforeBuild: boolean;
  syncBeforeRun: boolean;
  remoteBuildCommand: string;
  remoteRunCommand: string;
  cCompiler: string;
  cppCompiler: string;
  archiver: string;
  additionalCompilerFlags: string[];
  additionalLinkerFlags: string[];
  additionalIncludeDirectories: string[];
  additionalLibraryDirectories: string[];
  additionalLibraries: string[];
  pkgConfigPackages: string[];
  environment: string[];
  gdbServerPort: number;
  gdbServerExecutable: string;
  remoteDebuggerExecutable: string;
  startGdbServerAutomatically: boolean;
}

export interface CpmRunSettings {
  arguments: string;
  workingDirectory: string;
  environmentOptions: string;
  externalProcessPath: string;
}

export interface CpmProjectBuildSettings {
  preBuildActions: string[];
  buildBackend: CpmBuildBackend;
  cmake: CpmCMakeConfiguration;
  linkageMode: CpmLinkageMode;
  parallelJobs: number;
  useResponseFiles: boolean;
  precompiledHeadersEnabled: boolean;
  cPrecompiledHeader: string;
  cppPrecompiledHeader: string;
  unityBuildEnabled: boolean;
  unityBatchSize: number;
  customBuildActions: string[];
  postBuildActions: string[];
  dependencies: string[];
  externalDependencies: CpmExternalDependenciesConfiguration;
  remoteLinux: CpmRemoteLinuxConfiguration;
  run: CpmRunSettings;
  nativeBuildActions: boolean;
}

interface CpmProjectBuildSettingsStore {
  version: number;
  projects: Record<string, CpmProjectBuildSettings>;
}

const EMPTY_RUN_SETTINGS: CpmRunSettings = {
  arguments: '',
  workingDirectory: '',
  environmentOptions: '',
  externalProcessPath: ''
};


export const DEFAULT_CMAKE_CONFIGURATION: CpmCMakeConfiguration = {
  executable: 'cmake',
  generator: 'Ninja',
  generatorPlatform: '',
  generatorToolset: '',
  ninjaExecutable: 'ninja',
  sourceDirectory: '.',
  buildDirectory: '.cpm/cmake/${buildMode}',
  target: '',
  configureBeforeBuild: true,
  exportCompileCommands: true,
  inheritCpmCompilers: true,
  useDependencyToolchain: true,
  toolchainFile: '',
  cacheVariables: [],
  configureArguments: [],
  buildArguments: []
};

export const DEFAULT_EXTERNAL_DEPENDENCIES: CpmExternalDependenciesConfiguration = {
  enabled: false,
  autoInstallBeforeBuild: false,
  outputDirectory: '.cpm/dependencies',
  additionalIncludeDirectories: [],
  additionalLibraryDirectories: [],
  additionalLibraries: [],
  additionalCompilerFlags: [],
  additionalLinkerFlags: [],
  vcpkg: {
    enabled: false, executable: '', root: '', manifestFile: 'vcpkg.json', installRoot: '.cpm/dependencies/vcpkg_installed',
    triplet: '', hostTriplet: '', baseline: '', dependencies: [], overlayPorts: [], overlayTriplets: [], additionalArguments: []
  },
  conan: {
    enabled: false, executable: '', manifestFile: 'conanfile.txt', outputDirectory: '.cpm/dependencies/conan', requires: [], toolRequires: [], options: [],
    profileHost: 'default', profileBuild: 'default', buildMissing: true, lockfile: '', additionalArguments: []
  },
  pkgConfig: { enabled: false, executable: '', packages: [], searchPaths: [], staticLink: false, additionalArguments: [] }
};


export const DEFAULT_REMOTE_LINUX: CpmRemoteLinuxConfiguration = {
  enabled: false,
  sshHost: '',
  sshUser: '',
  sshPort: 22,
  sshExecutable: 'ssh',
  scpExecutable: 'scp',
  rsyncExecutable: 'rsync',
  useRsync: true,
  remoteProjectDirectory: '~/cpm-projects/${projectName}',
  remoteBuildDirectory: '.cpm-remote-build',
  syncBeforeBuild: true,
  syncBeforeRun: true,
  remoteBuildCommand: '',
  remoteRunCommand: '',
  cCompiler: 'gcc',
  cppCompiler: 'g++',
  archiver: 'ar',
  additionalCompilerFlags: [],
  additionalLinkerFlags: [],
  additionalIncludeDirectories: [],
  additionalLibraryDirectories: [],
  additionalLibraries: [],
  pkgConfigPackages: [],
  environment: [],
  gdbServerPort: 2345,
  gdbServerExecutable: 'gdbserver',
  remoteDebuggerExecutable: 'gdb',
  startGdbServerAutomatically: true
};

export class CpmProjectSettingsService {
  constructor(
    private readonly workspaces: CpmWorkspaceService,
    private readonly parser: CpmParser,
    private readonly output: vscode.OutputChannel
  ) {}

  getConfigurationPath(): string | undefined {
    const root = this.getConfigurationRoot();
    return root ? path.join(root, '.vscode', 'cpm-build.json') : undefined;
  }

  getCpmConfigurationValue<T>(key: string, fallback: T): T {
    const value = vscode.workspace.getConfiguration('cpm').get<T>(key, fallback);
    if (this.canUseNativeWorkspaceSettings()) {
      return value;
    }
    const detached = this.readDetachedCpmConfigurationValue<T>(key);
    return detached === undefined ? value : detached;
  }

  async updateCpmConfigurationValue(key: string, value: unknown): Promise<void> {
    if (this.canUseNativeWorkspaceSettings()) {
      await vscode.workspace.getConfiguration('cpm').update(key, value, vscode.ConfigurationTarget.Workspace);
      return;
    }
    this.writeDetachedCpmConfigurationValue(key, value);
  }

  getSettings(projectRef: CpmWorkspaceProjectRef, mode: CpmBuildMode = this.buildMode): CpmProjectBuildSettings {
    const store = this.loadStore();
    const stored = store.projects[this.projectKey(projectRef.absolutePath)];
    const cwsRun = this.getCwsRunSettings(projectRef, mode);
    const nativeActions = this.parser.getProjectBuildActions(projectRef.absolutePath, mode);
    const normalized = normalizeSettings(stored, cwsRun, nativeActions.nativeSectionsPresent ? nativeActions : undefined, nativeActions.nativeSectionsPresent);
    // CPM 0.2.72 and earlier exposed static linking through the workspace-level
    // runtimeDependencyMode setting. Preserve that choice until the project is
    // explicitly saved with the new per-project linkage mode.
    if (!stored || !('linkageMode' in stored)) {
      const legacyRuntimeMode = this.getCpmConfigurationValue<string>('runtimeDependencyMode', 'copy-dlls');
      if (legacyRuntimeMode === 'static-link') {
        normalized.linkageMode = 'static';
      }
    }
    return normalized;
  }

  setSettings(projectRef: CpmWorkspaceProjectRef, settings: CpmProjectBuildSettings, mode: CpmBuildMode = this.buildMode): void {
    const store = this.loadStore();
    const normalized = normalizeSettings(settings);
    this.parser.setProjectBuildActions(projectRef.absolutePath, mode, normalized);
    normalized.nativeBuildActions = true;
    store.projects[this.projectKey(projectRef.absolutePath)] = normalized;
    this.saveStore(store);
    this.setCwsRunSettings(projectRef, normalized.run, mode);
    this.output.appendLine(`[CPM] Project build settings saved: ${projectRef.name}`);
  }

  getBuildOrder(projectRef: CpmWorkspaceProjectRef): CpmWorkspaceProjectRef[] {
    const workspace = this.workspaces.currentWorkspace;
    if (!workspace) {
      return [projectRef];
    }
    const byKey = new Map(workspace.projects.map((ref) => [this.projectKey(ref.absolutePath), ref]));
    const result: CpmWorkspaceProjectRef[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (ref: CpmWorkspaceProjectRef): void => {
      const key = this.projectKey(ref.absolutePath);
      if (visited.has(key)) {
        return;
      }
      if (visiting.has(key)) {
        throw new Error(`Circular C/C++ build dependency detected at ${ref.name}.`);
      }
      visiting.add(key);
      for (const dependencyKey of this.getSettings(ref).dependencies) {
        const dependency = byKey.get(dependencyKey);
        if (dependency?.exists) {
          visit(dependency);
        }
      }
      visiting.delete(key);
      visited.add(key);
      result.push(ref);
    };

    visit(projectRef);
    return result;
  }

  hasNativeBuildActions(projectRef: CpmWorkspaceProjectRef): boolean {
    return this.parser.getProjectBuildActions(projectRef.absolutePath, this.buildMode).nativeSectionsPresent;
  }

  dependencyKey(projectRef: CpmWorkspaceProjectRef): string {
    return this.projectKey(projectRef.absolutePath);
  }

  async runActions(actions: string[], label: string, cwd: string): Promise<boolean> {
    const commands = actions.map((entry) => entry.trim()).filter((entry) => entry && !entry.startsWith('#'));
    if (!commands.length) {
      return true;
    }
    this.output.appendLine(`[CPM] ${label}`);
    for (const command of commands) {
      this.output.appendLine(`[CPM] > ${command}`);
      const success = await this.runShellCommand(command, cwd);
      if (!success) {
        this.output.appendLine(`[CPM] ${label} failed.`);
        return false;
      }
    }
    return true;
  }

  parseArguments(value: string): string[] {
    const result: string[] = [];
    const pattern = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      result.push(match[1] ?? match[2] ?? match[3]);
    }
    return result;
  }

  parseEnvironment(value: string): NodeJS.ProcessEnv {
    const result: NodeJS.ProcessEnv = { ...process.env };
    for (const entry of value.split(';')) {
      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }
      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      const val = trimmed.slice(separator + 1).trim();
      if (key) {
        result[key] = val;
      }
    }
    return result;
  }

  private getCwsRunSettings(projectRef: CpmWorkspaceProjectRef, mode: CpmBuildMode = this.buildMode): CpmRunSettings | undefined {
    const workspace = this.workspaces.currentWorkspace;
    if (!workspace || path.extname(workspace.path).toLowerCase() !== '.cws') {
      return undefined;
    }
    return this.parser.getWorkspaceRunOptions(workspace.path, projectRef.index, mode);
  }

  private setCwsRunSettings(projectRef: CpmWorkspaceProjectRef, run: CpmRunSettings, mode: CpmBuildMode = this.buildMode): void {
    const workspace = this.workspaces.currentWorkspace;
    if (!workspace || path.extname(workspace.path).toLowerCase() !== '.cws') {
      return;
    }
    this.parser.setWorkspaceRunOptions(workspace.path, projectRef.index, mode, run);
  }

  private get buildMode(): CpmBuildMode {
    return this.getCpmConfigurationValue<CpmBuildMode>('buildMode', 'debug');
  }

  private canUseNativeWorkspaceSettings(): boolean {
    return (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  }

  private getDetachedSettingsPath(): string | undefined {
    const root = this.getConfigurationRoot();
    return root ? path.join(root, '.vscode', 'settings.json') : undefined;
  }

  private readDetachedCpmConfigurationValue<T>(key: string): T | undefined {
    const settingsPath = this.getDetachedSettingsPath();
    if (!settingsPath || !fs.existsSync(settingsPath)) {
      return undefined;
    }
    try {
      const settings = parseJsoncObject(fs.readFileSync(settingsPath, 'utf8'));
      const value = settings[`cpm.${key}`];
      return value === undefined ? undefined : value as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`[CPM] Warning: unable to read detached settings ${settingsPath}: ${message}`);
      return undefined;
    }
  }

  private writeDetachedCpmConfigurationValue(key: string, value: unknown): void {
    const settingsPath = this.getDetachedSettingsPath();
    if (!settingsPath) {
      throw new Error('No C/C++ workspace directory is available to store compiler settings.');
    }
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        settings = parseJsoncObject(fs.readFileSync(settingsPath, 'utf8'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to read detached settings ${settingsPath}: ${message}`);
      }
    }
    settings[`cpm.${key}`] = value;
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    this.output.appendLine(`[CPM] Detached setting saved: cpm.${key} -> ${settingsPath}`);
  }

  private getConfigurationRoot(): string | undefined {
    const workspace = this.workspaces.currentWorkspace;
    if (workspace) {
      return path.dirname(workspace.path);
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private projectKey(projectPath: string): string {
    const root = this.getConfigurationRoot();
    if (!root) {
      return path.normalize(projectPath).replace(/\\/g, '/').toLowerCase();
    }
    return path.relative(root, projectPath).replace(/\\/g, '/').toLowerCase();
  }

  private loadStore(): CpmProjectBuildSettingsStore {
    const filePath = this.getConfigurationPath();
    let effectivePath = filePath;
    if (!effectivePath || !fs.existsSync(effectivePath)) {
      const root = this.getConfigurationRoot();
      const legacyPath = root ? path.join(root, '.vscode', 'labwindows-cpm-build.json') : undefined;
      if (!legacyPath || !fs.existsSync(legacyPath)) {
        return { version: 1, projects: {} };
      }
      effectivePath = legacyPath;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(effectivePath, 'utf8')) as Partial<CpmProjectBuildSettingsStore>;
      return { version: 1, projects: raw.projects && typeof raw.projects === 'object' ? raw.projects : {} };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to read ${effectivePath}: ${message}`);
    }
  }

  private saveStore(store: CpmProjectBuildSettingsStore): void {
    const filePath = this.getConfigurationPath();
    if (!filePath) {
      throw new Error('No C/C++ workspace directory is available to store build settings.');
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  }

  private async runShellCommand(command: string, cwd: string): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      const child = spawn(command, { cwd, shell: true, windowsHide: true });
      child.stdout.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.stderr.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.on('error', (error) => {
        this.output.appendLine(`[CPM] Unable to run action: ${error.message}`);
        resolve(false);
      });
      child.on('close', (code) => {
        this.output.appendLine(`[CPM] Action exited with code ${String(code)}.`);
        resolve(code === 0);
      });
    });
  }
}

function parseJsoncObject(raw: string): Record<string, unknown> {
  const stripped = stripJsonComments(raw).trim();
  if (!stripped) {
    return {};
  }
  const parsed = JSON.parse(stripped) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

function stripJsonComments(raw: string): string {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index++) {
    const current = raw[index];
    const next = raw[index + 1];
    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
      } else if (current === '\\') {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }
    if (current === '"') {
      inString = true;
      output += current;
      continue;
    }
    if (current === '/' && next === '/') {
      while (index < raw.length && raw[index] !== '\n') {
        index++;
      }
      output += '\n';
      continue;
    }
    if (current === '/' && next === '*') {
      index += 2;
      while (index < raw.length && !(raw[index] === '*' && raw[index + 1] === '/')) {
        index++;
      }
      index++;
      continue;
    }
    output += current;
  }
  return output;
}

function normalizeSettings(value?: Partial<CpmProjectBuildSettings>, fallbackRun?: Partial<CpmRunSettings>, nativeActions?: Partial<CpmProjectBuildSettings>, nativeBuildActions = false): CpmProjectBuildSettings {
  return {
    preBuildActions: normalizeActions(nativeActions?.preBuildActions ?? value?.preBuildActions),
    buildBackend: value?.buildBackend === 'cmake' ? 'cmake' : 'direct',
    cmake: normalizeCMakeConfiguration(value?.cmake),
    linkageMode: normalizeLinkageMode(value?.linkageMode),
    parallelJobs: normalizeParallelJobs(value?.parallelJobs),
    useResponseFiles: value?.useResponseFiles !== false,
    precompiledHeadersEnabled: value?.precompiledHeadersEnabled === true,
    cPrecompiledHeader: String(value?.cPrecompiledHeader ?? ''),
    cppPrecompiledHeader: String(value?.cppPrecompiledHeader ?? ''),
    unityBuildEnabled: value?.unityBuildEnabled === true,
    unityBatchSize: normalizeUnityBatchSize(value?.unityBatchSize),
    customBuildActions: normalizeActions(nativeActions?.customBuildActions ?? value?.customBuildActions),
    postBuildActions: normalizeActions(nativeActions?.postBuildActions ?? value?.postBuildActions),
    dependencies: Array.isArray(value?.dependencies) ? value.dependencies.map(String) : [],
    externalDependencies: normalizeExternalDependencies(value?.externalDependencies),
    remoteLinux: normalizeRemoteLinux(value?.remoteLinux),
    run: {
      arguments: String(fallbackRun?.arguments ?? value?.run?.arguments ?? EMPTY_RUN_SETTINGS.arguments),
      workingDirectory: String(fallbackRun?.workingDirectory ?? value?.run?.workingDirectory ?? EMPTY_RUN_SETTINGS.workingDirectory),
      environmentOptions: String(fallbackRun?.environmentOptions ?? value?.run?.environmentOptions ?? EMPTY_RUN_SETTINGS.environmentOptions),
      externalProcessPath: String(fallbackRun?.externalProcessPath ?? value?.run?.externalProcessPath ?? EMPTY_RUN_SETTINGS.externalProcessPath)
    },
    nativeBuildActions: nativeBuildActions || value?.nativeBuildActions === true
  };
}


function normalizeCMakeConfiguration(value: unknown): CpmCMakeConfiguration {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<CpmCMakeConfiguration> : {};
  return {
    executable: String(raw.executable ?? DEFAULT_CMAKE_CONFIGURATION.executable).trim() || DEFAULT_CMAKE_CONFIGURATION.executable,
    generator: String(raw.generator ?? DEFAULT_CMAKE_CONFIGURATION.generator).trim() || DEFAULT_CMAKE_CONFIGURATION.generator,
    generatorPlatform: String(raw.generatorPlatform ?? ''),
    generatorToolset: String(raw.generatorToolset ?? ''),
    ninjaExecutable: String(raw.ninjaExecutable ?? DEFAULT_CMAKE_CONFIGURATION.ninjaExecutable).trim() || DEFAULT_CMAKE_CONFIGURATION.ninjaExecutable,
    sourceDirectory: String(raw.sourceDirectory ?? DEFAULT_CMAKE_CONFIGURATION.sourceDirectory).trim() || DEFAULT_CMAKE_CONFIGURATION.sourceDirectory,
    buildDirectory: String(raw.buildDirectory ?? DEFAULT_CMAKE_CONFIGURATION.buildDirectory).trim() || DEFAULT_CMAKE_CONFIGURATION.buildDirectory,
    target: String(raw.target ?? '').trim(),
    configureBeforeBuild: raw.configureBeforeBuild !== false,
    exportCompileCommands: raw.exportCompileCommands !== false,
    inheritCpmCompilers: raw.inheritCpmCompilers !== false,
    useDependencyToolchain: raw.useDependencyToolchain !== false,
    toolchainFile: String(raw.toolchainFile ?? '').trim(),
    cacheVariables: normalizeActions(raw.cacheVariables),
    configureArguments: normalizeActions(raw.configureArguments),
    buildArguments: normalizeActions(raw.buildArguments)
  };
}

function normalizeRemoteLinux(value: unknown): CpmRemoteLinuxConfiguration {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<CpmRemoteLinuxConfiguration> : {};
  const port = normalizePort(raw.sshPort, DEFAULT_REMOTE_LINUX.sshPort);
  const gdbPort = normalizePort(raw.gdbServerPort, DEFAULT_REMOTE_LINUX.gdbServerPort);
  return {
    enabled: raw.enabled === true,
    sshHost: String(raw.sshHost ?? '').trim(),
    sshUser: String(raw.sshUser ?? '').trim(),
    sshPort: port,
    sshExecutable: String(raw.sshExecutable ?? DEFAULT_REMOTE_LINUX.sshExecutable).trim() || DEFAULT_REMOTE_LINUX.sshExecutable,
    scpExecutable: String(raw.scpExecutable ?? DEFAULT_REMOTE_LINUX.scpExecutable).trim() || DEFAULT_REMOTE_LINUX.scpExecutable,
    rsyncExecutable: String(raw.rsyncExecutable ?? DEFAULT_REMOTE_LINUX.rsyncExecutable).trim() || DEFAULT_REMOTE_LINUX.rsyncExecutable,
    useRsync: raw.useRsync !== false,
    remoteProjectDirectory: String(raw.remoteProjectDirectory ?? DEFAULT_REMOTE_LINUX.remoteProjectDirectory).trim() || DEFAULT_REMOTE_LINUX.remoteProjectDirectory,
    remoteBuildDirectory: String(raw.remoteBuildDirectory ?? DEFAULT_REMOTE_LINUX.remoteBuildDirectory).trim() || DEFAULT_REMOTE_LINUX.remoteBuildDirectory,
    syncBeforeBuild: raw.syncBeforeBuild !== false,
    syncBeforeRun: raw.syncBeforeRun !== false,
    remoteBuildCommand: String(raw.remoteBuildCommand ?? '').trim(),
    remoteRunCommand: String(raw.remoteRunCommand ?? '').trim(),
    cCompiler: String(raw.cCompiler ?? DEFAULT_REMOTE_LINUX.cCompiler).trim() || DEFAULT_REMOTE_LINUX.cCompiler,
    cppCompiler: String(raw.cppCompiler ?? DEFAULT_REMOTE_LINUX.cppCompiler).trim() || DEFAULT_REMOTE_LINUX.cppCompiler,
    archiver: String(raw.archiver ?? DEFAULT_REMOTE_LINUX.archiver).trim() || DEFAULT_REMOTE_LINUX.archiver,
    additionalCompilerFlags: normalizeActions(raw.additionalCompilerFlags),
    additionalLinkerFlags: normalizeActions(raw.additionalLinkerFlags),
    additionalIncludeDirectories: normalizeActions(raw.additionalIncludeDirectories),
    additionalLibraryDirectories: normalizeActions(raw.additionalLibraryDirectories),
    additionalLibraries: normalizeActions(raw.additionalLibraries),
    pkgConfigPackages: normalizeActions(raw.pkgConfigPackages),
    environment: normalizeActions(raw.environment),
    gdbServerPort: gdbPort,
    gdbServerExecutable: String(raw.gdbServerExecutable ?? DEFAULT_REMOTE_LINUX.gdbServerExecutable).trim() || DEFAULT_REMOTE_LINUX.gdbServerExecutable,
    remoteDebuggerExecutable: String(raw.remoteDebuggerExecutable ?? DEFAULT_REMOTE_LINUX.remoteDebuggerExecutable).trim() || DEFAULT_REMOTE_LINUX.remoteDebuggerExecutable,
    startGdbServerAutomatically: raw.startGdbServerAutomatically !== false
  };
}

function normalizePort(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : fallback;
}

function normalizeExternalDependencies(value: unknown): CpmExternalDependenciesConfiguration {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<CpmExternalDependenciesConfiguration> : {};
  const vcpkg = raw.vcpkg && typeof raw.vcpkg === 'object' ? raw.vcpkg : {} as Partial<CpmExternalDependenciesConfiguration['vcpkg']>;
  const conan = raw.conan && typeof raw.conan === 'object' ? raw.conan : {} as Partial<CpmExternalDependenciesConfiguration['conan']>;
  const pkgConfig = raw.pkgConfig && typeof raw.pkgConfig === 'object' ? raw.pkgConfig : {} as Partial<CpmExternalDependenciesConfiguration['pkgConfig']>;
  return {
    enabled: raw.enabled === true,
    autoInstallBeforeBuild: raw.autoInstallBeforeBuild === true,
    outputDirectory: String(raw.outputDirectory ?? DEFAULT_EXTERNAL_DEPENDENCIES.outputDirectory).trim() || DEFAULT_EXTERNAL_DEPENDENCIES.outputDirectory,
    additionalIncludeDirectories: normalizeActions(raw.additionalIncludeDirectories),
    additionalLibraryDirectories: normalizeActions(raw.additionalLibraryDirectories),
    additionalLibraries: normalizeActions(raw.additionalLibraries),
    additionalCompilerFlags: normalizeActions(raw.additionalCompilerFlags),
    additionalLinkerFlags: normalizeActions(raw.additionalLinkerFlags),
    vcpkg: {
      enabled: vcpkg.enabled === true, executable: String(vcpkg.executable ?? ''), root: String(vcpkg.root ?? ''),
      manifestFile: String(vcpkg.manifestFile ?? DEFAULT_EXTERNAL_DEPENDENCIES.vcpkg.manifestFile).trim() || DEFAULT_EXTERNAL_DEPENDENCIES.vcpkg.manifestFile,
      installRoot: String(vcpkg.installRoot ?? DEFAULT_EXTERNAL_DEPENDENCIES.vcpkg.installRoot).trim() || DEFAULT_EXTERNAL_DEPENDENCIES.vcpkg.installRoot,
      triplet: String(vcpkg.triplet ?? ''), hostTriplet: String(vcpkg.hostTriplet ?? ''), baseline: String(vcpkg.baseline ?? ''),
      dependencies: normalizeActions(vcpkg.dependencies), overlayPorts: normalizeActions(vcpkg.overlayPorts), overlayTriplets: normalizeActions(vcpkg.overlayTriplets), additionalArguments: normalizeActions(vcpkg.additionalArguments)
    },
    conan: {
      enabled: conan.enabled === true, executable: String(conan.executable ?? ''),
      manifestFile: String(conan.manifestFile ?? DEFAULT_EXTERNAL_DEPENDENCIES.conan.manifestFile).trim() || DEFAULT_EXTERNAL_DEPENDENCIES.conan.manifestFile,
      outputDirectory: String(conan.outputDirectory ?? DEFAULT_EXTERNAL_DEPENDENCIES.conan.outputDirectory).trim() || DEFAULT_EXTERNAL_DEPENDENCIES.conan.outputDirectory,
      requires: normalizeActions(conan.requires), toolRequires: normalizeActions(conan.toolRequires), options: normalizeActions(conan.options),
      profileHost: String(conan.profileHost ?? 'default').trim() || 'default', profileBuild: String(conan.profileBuild ?? 'default').trim() || 'default',
      buildMissing: conan.buildMissing !== false, lockfile: String(conan.lockfile ?? ''), additionalArguments: normalizeActions(conan.additionalArguments)
    },
    pkgConfig: {
      enabled: pkgConfig.enabled === true, executable: String(pkgConfig.executable ?? ''), packages: normalizeActions(pkgConfig.packages),
      searchPaths: normalizeActions(pkgConfig.searchPaths), staticLink: pkgConfig.staticLink === true, additionalArguments: normalizeActions(pkgConfig.additionalArguments)
    }
  };
}

function normalizeActions(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((entry) => entry.trim()).filter(Boolean) : [];
}


function normalizeLinkageMode(value: unknown): CpmLinkageMode {
  return value === 'static-runtime' || value === 'static' ? value : 'dynamic';
}

function normalizeParallelJobs(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(256, Math.trunc(numeric)));
}

function normalizeUnityBatchSize(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 8;
  return Math.max(2, Math.min(128, Math.trunc(parsed)));
}
