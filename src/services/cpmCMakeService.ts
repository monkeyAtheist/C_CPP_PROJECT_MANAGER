import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync, spawn } from 'child_process';
import * as vscode from 'vscode';
import { CpmBuildMode, CpmWorkspaceProjectRef } from '../model/types';
import { CpmProjectSettingsService, CpmCMakeConfiguration } from './cpmProjectSettingsService';
import { CpmWorkspaceService } from './cpmWorkspaceService';

export interface CpmCMakeTargetInfo {
  name: string;
  type: string;
  artifacts: string[];
}

export interface CpmCMakeHealthSnapshot {
  enabled: boolean;
  cmakeExecutable: string;
  cmakeResolved?: string;
  ninjaResolved?: string;
  sourceDirectory: string;
  buildDirectory: string;
  cmakeListsPath: string;
  cmakeListsExists: boolean;
  cacheExists: boolean;
  configuredGenerator: string;
  activeGenerator?: string;
  selectedTarget: string;
  discoveredTargets: CpmCMakeTargetInfo[];
  resolvedArtifact?: string;
  configureBeforeBuild: boolean;
  inheritCpmCompilers: boolean;
  dependencyToolchain?: string;
}

export class CpmCMakeService {
  constructor(
    private readonly workspaces: CpmWorkspaceService,
    private readonly settings: CpmProjectSettingsService,
    private readonly output: vscode.OutputChannel
  ) {}

  isCMakeBackend(ref?: CpmWorkspaceProjectRef): boolean {
    const target = ref ?? this.workspaces.activeProjectRef;
    return Boolean(target?.exists && this.settings.getSettings(target).buildBackend === 'cmake');
  }

  async selectBackend(projectRef?: CpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing C/C++ project is available to configure the build backend.');
      return;
    }
    const current = this.settings.getSettings(ref).buildBackend;
    const selected = await vscode.window.showQuickPick([
      {
        label: '$(terminal) Direct GCC / Clang',
        value: 'direct' as const,
        description: 'CPM native build engine',
        detail: 'Incremental .d tracking, parallel compilation, response files, PCH and Unity Build are managed directly by CPM.'
      },
      {
        label: '$(symbol-namespace) CMake / Ninja',
        value: 'cmake' as const,
        description: 'Configure and build an existing CMakeLists.txt',
        detail: 'CPM runs CMake configure/build/clean, queries the CMake File API and reuses the resolved target for Run and Debug.'
      }
    ], { title: `Build backend — ${ref.name}`, placeHolder: `Current: ${current === 'cmake' ? 'CMake / Ninja' : 'Direct GCC / Clang'}` });
    if (!selected) return;
    const projectSettings = this.settings.getSettings(ref);
    projectSettings.buildBackend = selected.value;
    this.settings.setSettings(ref, projectSettings);
    this.output.appendLine(`[CPM] Build backend for ${ref.name}: ${selected.value}`);
    this.workspaces.refresh();
  }

  async configure(projectRef?: CpmWorkspaceProjectRef, force = false): Promise<boolean> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing C/C++ project is available for CMake configure.');
      return false;
    }
    const projectSettings = this.settings.getSettings(ref);
    const config = projectSettings.cmake;
    const paths = this.resolvePaths(ref, config);
    if (!fs.existsSync(paths.cmakeListsPath)) {
      vscode.window.showErrorMessage(`CMakeLists.txt not found: ${paths.cmakeListsPath}`);
      return false;
    }
    const requestedGenerator = config.generator.trim();
    const cachedGenerator = this.readCacheValue(paths.buildDirectory, 'CMAKE_GENERATOR');
    if (cachedGenerator && requestedGenerator && requestedGenerator !== 'auto' && cachedGenerator !== requestedGenerator) {
      this.output.appendLine(`[C/C++][CMake] Generator changed from ${cachedGenerator} to ${requestedGenerator}; resetting CMake cache metadata.`);
      for (const candidate of [path.join(paths.buildDirectory, 'CMakeCache.txt'), path.join(paths.buildDirectory, 'CMakeFiles'), path.join(paths.buildDirectory, '.cmake', 'api', 'v1', 'reply')]) {
        try { fs.rmSync(candidate, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    }
    fs.mkdirSync(paths.buildDirectory, { recursive: true });
    this.writeFileApiQuery(paths.buildDirectory);

    const cmake = resolveExecutable(config.executable) ?? config.executable;
    const args: string[] = ['-S', paths.sourceDirectory, '-B', paths.buildDirectory];
    const generator = requestedGenerator;
    if (generator && generator !== 'auto') {
      args.push('-G', generator);
    }
    if (/^Ninja(?: Multi-Config)?$/i.test(generator)) {
      const ninja = resolveExecutable(config.ninjaExecutable) ?? (path.isAbsolute(config.ninjaExecutable) ? config.ninjaExecutable : '');
      if (ninja) args.push(`-DCMAKE_MAKE_PROGRAM=${ninja}`);
    }
    if (config.generatorPlatform.trim()) args.push('-A', config.generatorPlatform.trim());
    if (config.generatorToolset.trim()) args.push('-T', config.generatorToolset.trim());

    const multiConfig = isMultiConfigGenerator(generator || this.readCacheValue(paths.buildDirectory, 'CMAKE_GENERATOR') || '');
    if (!multiConfig) {
      args.push(`-DCMAKE_BUILD_TYPE=${cmakeConfiguration(this.buildMode)}`);
    }
    if (config.exportCompileCommands) args.push('-DCMAKE_EXPORT_COMPILE_COMMANDS=ON');
    if (config.inheritCpmCompilers) {
      const cCompiler = this.settings.getCpmConfigurationValue<string>('cCompilerPath', 'gcc').trim();
      const cppCompiler = this.settings.getCpmConfigurationValue<string>('cppCompilerPath', 'g++').trim();
      if (cCompiler) args.push(`-DCMAKE_C_COMPILER=${cCompiler}`);
      if (cppCompiler) args.push(`-DCMAKE_CXX_COMPILER=${cppCompiler}`);
    }
    const dependencyToolchain = this.resolveDependencyToolchain(ref, config);
    const explicitToolchain = this.resolveProjectPath(ref, config.toolchainFile);
    const toolchain = explicitToolchain || dependencyToolchain;
    if (toolchain) args.push(`-DCMAKE_TOOLCHAIN_FILE=${toolchain}`);
    for (const entry of config.cacheVariables) {
      const trimmed = entry.trim();
      if (trimmed) args.push(trimmed.startsWith('-D') ? trimmed : `-D${trimmed}`);
    }
    args.push(...config.configureArguments);

    this.output.appendLine(`[C/C++][CMake] Configure ${ref.name}`);
    this.output.appendLine(`[C/C++][CMake] Source : ${paths.sourceDirectory}`);
    this.output.appendLine(`[C/C++][CMake] Build  : ${paths.buildDirectory}`);
    if (toolchain) this.output.appendLine(`[C/C++][CMake] Toolchain: ${toolchain}`);
    if (force && fs.existsSync(path.join(paths.buildDirectory, 'CMakeCache.txt'))) {
      this.output.appendLine('[C/C++][CMake] Reconfigure requested; existing CMake cache will be reused unless CMake invalidates it.');
    }
    const ok = await this.runTool(cmake, args, path.dirname(ref.absolutePath), 'Configure');
    if (ok) {
      this.writeFileApiQuery(paths.buildDirectory);
      this.output.appendLine(`[C/C++][CMake] Configure completed. Targets discovered: ${this.readTargets(ref).map((target) => target.name).join(', ') || '<none yet>'}`);
    }
    return ok;
  }

  async build(projectRef: CpmWorkspaceProjectRef, rebuild = false): Promise<boolean> {
    const settings = this.settings.getSettings(projectRef);
    const config = settings.cmake;
    const paths = this.resolvePaths(projectRef, config);
    if (config.configureBeforeBuild || !fs.existsSync(path.join(paths.buildDirectory, 'CMakeCache.txt'))) {
      if (!await this.configure(projectRef, rebuild)) return false;
    }
    const cmake = resolveExecutable(config.executable) ?? config.executable;
    const args = ['--build', paths.buildDirectory];
    const configuration = cmakeConfiguration(this.buildMode);
    const activeGenerator = this.readCacheValue(paths.buildDirectory, 'CMAKE_GENERATOR') || config.generator;
    if (isMultiConfigGenerator(activeGenerator)) args.push('--config', configuration);
    const jobs = settings.parallelJobs > 0 ? settings.parallelJobs : Math.max(1, os.cpus()?.length || 1);
    args.push('--parallel', String(jobs));
    if (config.target.trim()) args.push('--target', config.target.trim());
    if (rebuild) args.push('--clean-first');
    if (config.buildArguments.length) args.push(...config.buildArguments);

    this.output.appendLine(`[C/C++][CMake] Build ${projectRef.name}${config.target.trim() ? ` target ${config.target.trim()}` : ''}`);
    const ok = await this.runTool(cmake, args, path.dirname(projectRef.absolutePath), rebuild ? 'Rebuild' : 'Build');
    if (ok) {
      const artifact = this.resolveArtifact(projectRef, this.workspaces.getProject(projectRef)?.targetType);
      if (artifact) this.output.appendLine(`[C/C++][CMake] Resolved target artifact: ${artifact}`);
      else this.output.appendLine('[C/C++][CMake] Build completed, but CPM could not resolve a unique runnable artifact. Configure the CMake target name in Build Settings if Run/Debug is needed.');
    }
    return ok;
  }

  async clean(projectRef?: CpmWorkspaceProjectRef): Promise<boolean> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) return false;
    const config = this.settings.getSettings(ref).cmake;
    const paths = this.resolvePaths(ref, config);
    if (!fs.existsSync(path.join(paths.buildDirectory, 'CMakeCache.txt'))) {
      this.output.appendLine(`[C/C++][CMake] Nothing to clean: ${paths.buildDirectory} is not configured.`);
      return true;
    }
    const cmake = resolveExecutable(config.executable) ?? config.executable;
    const args = ['--build', paths.buildDirectory, '--target', 'clean'];
    const activeGenerator = this.readCacheValue(paths.buildDirectory, 'CMAKE_GENERATOR') || config.generator;
    if (isMultiConfigGenerator(activeGenerator)) args.push('--config', cmakeConfiguration(this.buildMode));
    this.output.appendLine(`[C/C++][CMake] Clean ${ref.name}`);
    return this.runTool(cmake, args, path.dirname(ref.absolutePath), 'Clean');
  }

  resolveArtifact(projectRef: CpmWorkspaceProjectRef, targetType?: string): string | undefined {
    const settings = this.settings.getSettings(projectRef);
    if (settings.buildBackend !== 'cmake') return undefined;
    const targets = this.readTargets(projectRef);
    if (!targets.length) return undefined;
    const configured = settings.cmake.target.trim();
    let selected = configured ? targets.find((target) => target.name === configured) : undefined;
    if (!selected && configured) selected = targets.find((target) => target.name.toLowerCase() === configured.toLowerCase());
    if (!selected) {
      const desired = cmakeTargetType(targetType);
      const candidates = desired ? targets.filter((target) => target.type === desired) : targets.filter((target) => target.artifacts.length);
      selected = candidates.find((target) => target.name.toLowerCase() === projectRef.name.toLowerCase()) ?? (candidates.length === 1 ? candidates[0] : undefined);
    }
    const artifact = selected?.artifacts.find(Boolean);
    return artifact && fs.existsSync(artifact) ? artifact : artifact;
  }

  readTargets(projectRef: CpmWorkspaceProjectRef): CpmCMakeTargetInfo[] {
    const config = this.settings.getSettings(projectRef).cmake;
    const paths = this.resolvePaths(projectRef, config);
    const replyDir = path.join(paths.buildDirectory, '.cmake', 'api', 'v1', 'reply');
    if (!fs.existsSync(replyDir)) return [];
    try {
      const indexFiles = fs.readdirSync(replyDir).filter((name) => /^index-.*\.json$/i.test(name)).sort().reverse();
      if (!indexFiles.length) return [];
      const index = JSON.parse(fs.readFileSync(path.join(replyDir, indexFiles[0]), 'utf8')) as any;
      const client = index?.reply?.['client-cpm']?.['query.json'];
      const response = client?.responses?.find((item: any) => item?.kind === 'codemodel' && item?.jsonFile);
      const codemodelFile = response?.jsonFile ?? index?.objects?.find((item: any) => item?.kind === 'codemodel' && item?.jsonFile)?.jsonFile;
      if (!codemodelFile) return [];
      const codemodel = JSON.parse(fs.readFileSync(path.join(replyDir, codemodelFile), 'utf8')) as any;
      const desiredName = cmakeConfiguration(this.buildMode).toLowerCase();
      const configurations = Array.isArray(codemodel?.configurations) ? codemodel.configurations : [];
      const cmakeConfig = configurations.find((item: any) => String(item?.name ?? '').toLowerCase() === desiredName) ?? configurations[0];
      const targetRefs = Array.isArray(cmakeConfig?.targets) ? cmakeConfig.targets : [];
      const result: CpmCMakeTargetInfo[] = [];
      for (const targetRef of targetRefs) {
        if (!targetRef?.jsonFile) continue;
        const targetJson = JSON.parse(fs.readFileSync(path.join(replyDir, targetRef.jsonFile), 'utf8')) as any;
        const artifacts = (Array.isArray(targetJson?.artifacts) ? targetJson.artifacts : [])
          .map((entry: any) => String(entry?.path ?? '').trim())
          .filter(Boolean)
          .map((entry: string) => path.isAbsolute(entry) ? entry : path.resolve(paths.buildDirectory, entry));
        result.push({ name: String(targetJson?.name ?? targetRef?.name ?? ''), type: String(targetJson?.type ?? ''), artifacts });
      }
      return result;
    } catch (error) {
      this.output.appendLine(`[C/C++][CMake] Warning: unable to read CMake File API reply: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  getHealthSnapshot(projectRef?: CpmWorkspaceProjectRef): CpmCMakeHealthSnapshot | undefined {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) return undefined;
    const settings = this.settings.getSettings(ref);
    const config = settings.cmake;
    const paths = this.resolvePaths(ref, config);
    const targets = settings.buildBackend === 'cmake' ? this.readTargets(ref) : [];
    return {
      enabled: settings.buildBackend === 'cmake',
      cmakeExecutable: config.executable,
      cmakeResolved: resolveExecutable(config.executable),
      ninjaResolved: config.generator === 'Ninja' || config.generator === 'Ninja Multi-Config' ? resolveExecutable(config.ninjaExecutable || 'ninja') : undefined,
      sourceDirectory: paths.sourceDirectory,
      buildDirectory: paths.buildDirectory,
      cmakeListsPath: paths.cmakeListsPath,
      cmakeListsExists: fs.existsSync(paths.cmakeListsPath),
      cacheExists: fs.existsSync(path.join(paths.buildDirectory, 'CMakeCache.txt')),
      configuredGenerator: config.generator,
      activeGenerator: this.readCacheValue(paths.buildDirectory, 'CMAKE_GENERATOR') || undefined,
      selectedTarget: config.target,
      discoveredTargets: targets,
      resolvedArtifact: this.resolveArtifact(ref, this.workspaces.getProject(ref)?.targetType),
      configureBeforeBuild: config.configureBeforeBuild,
      inheritCpmCompilers: config.inheritCpmCompilers,
      dependencyToolchain: this.resolveProjectPath(ref, config.toolchainFile) || this.resolveDependencyToolchain(ref, config) || undefined
    };
  }

  async openReport(projectRef?: CpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) return;
    const snapshot = this.getHealthSnapshot(ref);
    if (!snapshot) return;
    const lines = [
      '# CPM CMake Backend', '',
      `Project: ${ref.name}`,
      `Backend enabled: ${snapshot.enabled ? 'yes' : 'no'}`,
      `CMake: ${snapshot.cmakeResolved ?? snapshot.cmakeExecutable}`,
      `Generator: ${snapshot.activeGenerator ?? snapshot.configuredGenerator}`,
      `Source directory: ${snapshot.sourceDirectory}`,
      `Build directory: ${snapshot.buildDirectory}`,
      `CMakeLists.txt: ${snapshot.cmakeListsExists ? 'found' : 'missing'}`,
      `Configured cache: ${snapshot.cacheExists ? 'yes' : 'no'}`,
      `Selected target: ${snapshot.selectedTarget || '<automatic>'}`,
      `Resolved artifact: ${snapshot.resolvedArtifact ?? '<none>'}`,
      `Dependency toolchain: ${snapshot.dependencyToolchain ?? '<none>'}`,
      '', '## Targets', '',
      ...(snapshot.discoveredTargets.length ? snapshot.discoveredTargets.map((target) => `- ${target.name} (${target.type})${target.artifacts.length ? ` -> ${target.artifacts.join(', ')}` : ''}`) : ['- No targets discovered. Run Configure first.'])
    ];
    const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
    await vscode.window.showTextDocument(doc, { preview: true });
  }

  private resolvePaths(ref: CpmWorkspaceProjectRef, config: CpmCMakeConfiguration): { sourceDirectory: string; buildDirectory: string; cmakeListsPath: string } {
    const root = path.dirname(ref.absolutePath);
    const sourceDirectory = this.resolveTemplatePath(root, config.sourceDirectory || '.', ref.name);
    const buildDirectory = this.resolveTemplatePath(root, config.buildDirectory || '.cpm/cmake/${buildMode}', ref.name);
    return { sourceDirectory, buildDirectory, cmakeListsPath: path.join(sourceDirectory, 'CMakeLists.txt') };
  }

  private resolveTemplatePath(root: string, value: string, projectName: string): string {
    const expanded = value
      .replace(/\$\{projectName\}/g, projectName)
      .replace(/\$\{buildMode\}/g, this.buildMode)
      .replace(/\$\{config\}/g, cmakeConfiguration(this.buildMode));
    return path.normalize(path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded));
  }

  private resolveProjectPath(ref: CpmWorkspaceProjectRef, value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return path.normalize(path.isAbsolute(trimmed) ? trimmed : path.resolve(path.dirname(ref.absolutePath), trimmed));
  }

  private resolveDependencyToolchain(ref: CpmWorkspaceProjectRef, config: CpmCMakeConfiguration): string {
    if (!config.useDependencyToolchain) return '';
    const deps = this.settings.getSettings(ref).externalDependencies;
    const root = path.dirname(ref.absolutePath);
    if (deps.conan.enabled) {
      const conanDir = path.isAbsolute(deps.conan.outputDirectory) ? deps.conan.outputDirectory : path.resolve(root, deps.conan.outputDirectory);
      const conanToolchain = path.join(conanDir, 'conan_toolchain.cmake');
      if (fs.existsSync(conanToolchain)) return conanToolchain;
    }
    if (deps.vcpkg.enabled) {
      const candidates = [deps.vcpkg.root, deps.vcpkg.executable ? path.dirname(deps.vcpkg.executable) : ''].filter(Boolean);
      for (const candidate of candidates) {
        const toolchain = path.join(candidate, 'scripts', 'buildsystems', 'vcpkg.cmake');
        if (fs.existsSync(toolchain)) return toolchain;
      }
    }
    return '';
  }

  private writeFileApiQuery(buildDirectory: string): void {
    const queryDir = path.join(buildDirectory, '.cmake', 'api', 'v1', 'query', 'client-cpm');
    fs.mkdirSync(queryDir, { recursive: true });
    fs.writeFileSync(path.join(queryDir, 'query.json'), `${JSON.stringify({ requests: [{ kind: 'codemodel', version: 2 }] }, null, 2)}\n`, 'utf8');
  }

  private readCacheValue(buildDirectory: string, key: string): string {
    const cache = path.join(buildDirectory, 'CMakeCache.txt');
    if (!fs.existsSync(cache)) return '';
    try {
      const pattern = new RegExp(`^${escapeRegExp(key)}:[^=]*=(.*)$`, 'm');
      return fs.readFileSync(cache, 'utf8').match(pattern)?.[1]?.trim() ?? '';
    } catch {
      return '';
    }
  }

  private async runTool(executable: string, args: string[], cwd: string, label: string): Promise<boolean> {
    this.output.appendLine(`[C/C++][CMake] > ${renderCommand(executable, args)}`);
    return await new Promise<boolean>((resolve) => {
      const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, env: { ...process.env } });
      child.stdout.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.stderr.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.once('error', (error) => {
        this.output.appendLine(`[C/C++][CMake] ${label} failed to start: ${error.message}`);
        resolve(false);
      });
      child.once('close', (code) => {
        const ok = code === 0;
        this.output.appendLine(`[C/C++][CMake] ${label} finished with exit code ${code ?? 'unknown'}.`);
        resolve(ok);
      });
    });
  }

  private get buildMode(): CpmBuildMode {
    return this.settings.getCpmConfigurationValue<CpmBuildMode>('buildMode', 'debug');
  }
}

function cmakeConfiguration(mode: CpmBuildMode): 'Debug' | 'Release' {
  return mode === 'release' || mode === 'release64' ? 'Release' : 'Debug';
}

function cmakeTargetType(targetType?: string): string {
  if (targetType === 'Dynamic Link Library') return 'SHARED_LIBRARY';
  if (targetType === 'Static Library') return 'STATIC_LIBRARY';
  if (targetType === 'Executable') return 'EXECUTABLE';
  return '';
}

function isMultiConfigGenerator(generator: string): boolean {
  return /visual studio|xcode|ninja multi-config/i.test(generator);
}

function resolveExecutable(command: string): string | undefined {
  const value = command.trim();
  if (!value) return undefined;
  if (path.isAbsolute(value)) return fs.existsSync(value) ? value : undefined;
  try {
    const tool = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(tool, [value], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).map((entry) => entry.trim()).find(Boolean);
    return result || undefined;
  } catch {
    return undefined;
  }
}

function renderCommand(executable: string, args: string[]): string {
  return [executable, ...args].map((entry) => /\s|["']/g.test(entry) ? JSON.stringify(entry) : entry).join(' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
