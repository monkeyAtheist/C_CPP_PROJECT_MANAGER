import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync, spawn } from 'child_process';
import * as vscode from 'vscode';
import { CpmBuildMode, CpmProjectFile, CpmWorkspaceProjectRef } from '../model/types';
import { CpmParser } from '../model/cpmParser';
import { CpmWorkspaceService } from './cpmWorkspaceService';
import { CpmProjectSettingsService } from './cpmProjectSettingsService';
import { normalizeRuntimePath } from '../utils/pathUtils';

interface GenericCompilerConfiguration {
  cCompilerPath: string;
  cppCompilerPath: string;
  archiverPath: string;
  debuggerPath: string;
  outputDirectory: string;
  cStandard: string;
  cppStandard: string;
  warningLevel: string;
  optimizationLevel: string;
  debugInformation: string;
  architectureMode: string;
  compilerFlags: string[];
  cCompilerFlags: string[];
  cppCompilerFlags: string[];
  linkerFlags: string[];
  includePaths: string[];
  libraryPaths: string[];
  libraries: string[];
  defineSymbols: string[];
  useBuildModeArchitectureFlags: boolean;
  deployRuntimeDlls: string;
  cleanRuntimeDllsOnDeploy: boolean;
  useLocalBuildCacheForOneDrive: boolean;
}


interface BuildArtifacts {
  targetPath: string;
  objectDirectory: string;
  objectFiles: string[];
}

export class CpmBuildService {
  constructor(
    private readonly parser: CpmParser,
    private readonly workspaces: CpmWorkspaceService,
    _installations: unknown,
    private readonly projectSettings: CpmProjectSettingsService,
    _breakpoints: unknown,
    private readonly output: vscode.OutputChannel
  ) {}

  get buildMode(): CpmBuildMode {
    return vscode.workspace.getConfiguration('cpm').get<CpmBuildMode>('buildMode', 'debug');
  }

  async chooseBuildAction(projectRef?: CpmWorkspaceProjectRef): Promise<void> {
    const selected = await vscode.window.showQuickPick([
      { label: '$(tools) Build', value: 'build', description: 'Compile and link the selected C/C++ target' },
      { label: '$(sync) Rebuild', value: 'rebuild', description: 'Delete generated objects before compiling' },
      { label: '$(trash) Clean generated target', value: 'clean', description: 'Delete generated objects and target files without touching sources' }
    ], { title: 'C/C++ build action' });
    if (!selected) {
      return;
    }
    if (selected.value === 'clean') {
      await this.clean(projectRef);
    } else {
      await this.build(selected.value === 'rebuild', projectRef);
    }
  }

  async chooseRunAction(projectRef?: CpmWorkspaceProjectRef): Promise<void> {
    const selected = await vscode.window.showQuickPick([
      { label: '$(play) Build and run', value: 'buildRun', description: 'Build the active executable and launch it' },
      { label: '$(run) Run without build', value: 'runOnly', description: 'Launch the existing executable target' },
      { label: '$(debug-alt) Build and debug', value: 'debug', description: 'Build, then start a VS Code C/C++ debugger session' }
    ], { title: 'C/C++ run action' });
    if (!selected) {
      return;
    }
    if (selected.value === 'runOnly') {
      await this.runWithoutBuild(projectRef);
    } else if (selected.value === 'debug') {
      await this.debugWithGdb(projectRef);
    } else {
      await this.buildAndRun(projectRef);
    }
  }

  async selectBuildMode(): Promise<void> {
    const selected = await vscode.window.showQuickPick([
      { label: 'Debug', value: 'debug' as CpmBuildMode, description: 'Adds -g -O0' },
      { label: 'Release', value: 'release' as CpmBuildMode, description: 'Adds -O2' },
      { label: 'Debug x64', value: 'debug64' as CpmBuildMode, description: 'Adds -g -O0 and optionally -m64' },
      { label: 'Release x64', value: 'release64' as CpmBuildMode, description: 'Adds -O2 and optionally -m64' }
    ], { title: 'Select the C/C++ build mode' });
    if (!selected) {
      return;
    }
    await vscode.workspace.getConfiguration('cpm').update('buildMode', selected.value, vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage(`C/C++ build mode: ${selected.label}.`);
  }

  async build(rebuild = false, projectRef?: CpmWorkspaceProjectRef): Promise<boolean> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing active C/C++ project is available for build.');
      return false;
    }

    this.beginOutput(`${rebuild ? 'Rebuild' : 'Build'} ${ref.name}`);
    const order = this.projectSettings.getBuildOrder(ref);
    this.output.appendLine(`[C/C++] Build order: ${order.map((item) => item.name).join(' -> ')}`);
    this.output.appendLine('');

    for (const item of order) {
      const cwd = path.dirname(item.absolutePath);
      const settings = this.projectSettings.getSettings(item);
      if (!await this.projectSettings.runActions(settings.preBuildActions, `Pre-build actions — ${item.name}`, cwd)) {
        return false;
      }
      if (!await this.projectSettings.runActions(settings.customBuildActions, `Custom build actions — ${item.name}`, cwd)) {
        return false;
      }
      const success = await this.buildOneProject(item, rebuild);
      if (!success) {
        return false;
      }
      if (!await this.projectSettings.runActions(settings.postBuildActions, `Post-build actions — ${item.name}`, cwd)) {
        return false;
      }
    }

    vscode.window.showInformationMessage(`${rebuild ? 'Rebuild' : 'Build'} completed successfully.`);
    return true;
  }

  async clean(projectRef?: CpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing active C/C++ project is available to clean.');
      return;
    }
    this.beginOutput(`Clean ${ref.name}`);
    const artifacts = this.resolveArtifacts(ref);
    const candidates = new Set<string>([artifacts.targetPath]);
    if (path.extname(artifacts.targetPath).toLowerCase() === '.exe') {
      candidates.add(replaceExtension(artifacts.targetPath, '.pdb'));
    }
    let removed = 0;
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) {
        continue;
      }
      try {
        fs.rmSync(candidate, { force: true });
        this.output.appendLine(`[C/C++] Deleted: ${candidate}`);
        removed += 1;
      } catch (error) {
        this.output.appendLine(`[C/C++] Unable to delete ${candidate}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (fs.existsSync(artifacts.objectDirectory)) {
      try {
        fs.rmSync(artifacts.objectDirectory, { recursive: true, force: true });
        this.output.appendLine(`[C/C++] Deleted object directory: ${artifacts.objectDirectory}`);
        removed += 1;
      } catch (error) {
        this.output.appendLine(`[C/C++] Unable to delete ${artifacts.objectDirectory}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const fallbackObjectDirectory = this.resolveLocalObjectDirectory(ref, this.getCompilerConfiguration());
    if (fallbackObjectDirectory && fs.existsSync(fallbackObjectDirectory)) {
      try {
        fs.rmSync(fallbackObjectDirectory, { recursive: true, force: true });
        this.output.appendLine(`[C/C++] Deleted local object directory: ${fallbackObjectDirectory}`);
        removed += 1;
      } catch (error) {
        this.output.appendLine(`[C/C++] Unable to delete ${fallbackObjectDirectory}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (removed === 0) {
      this.output.appendLine('[C/C++] No generated target or object directory was found.');
    }
    vscode.window.showInformationMessage(`Clean completed for ${ref.name}: ${removed} generated item(s) removed.`);
  }

  async compileFile(filePath: string, projectRef?: CpmWorkspaceProjectRef): Promise<boolean> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing C/C++ project is available to provide compiler options.');
      return false;
    }
    if (!isSource(filePath)) {
      vscode.window.showErrorMessage('Compile File is available only for C/C++ source files.');
      return false;
    }
    if (!fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`Source file not found: ${filePath}`);
      return false;
    }
    this.beginOutput(`Compile ${path.basename(filePath)}`);
    const config = this.getCompilerConfiguration();
    const project = this.workspaces.getProject(ref);
    const artifacts = this.resolveArtifacts(ref);
    if (!await this.ensureDirectory(artifacts.objectDirectory, 'object directory', false)) {
      const fallbackObjectDirectory = this.resolveLocalObjectDirectory(ref, config);
      if (!fallbackObjectDirectory || !await this.ensureDirectory(fallbackObjectDirectory, 'local object directory')) {
        return false;
      }
      this.output.appendLine(`[C/C++] Falling back to local object directory: ${fallbackObjectDirectory}`);
      artifacts.objectDirectory = fallbackObjectDirectory;
    }
    const objectPath = this.objectPathForSource(filePath, ref.absolutePath, artifacts.objectDirectory);
    const args = this.compileArguments(filePath, objectPath, ref, project?.files ?? [], config);
    return await this.spawnTool(this.compilerForSource(filePath, config), args, path.dirname(ref.absolutePath), `Compile ${path.basename(filePath)}`);
  }

  async run(projectRef?: CpmWorkspaceProjectRef): Promise<void> {
    await this.buildAndRun(projectRef);
  }

  async buildAndRun(projectRef?: CpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing C/C++ project is available to build and run.');
      return;
    }
    const success = await this.build(false, ref);
    if (!success) {
      return;
    }
    await this.runWithoutBuild(ref);
  }

  async runWithoutBuild(projectRef?: CpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing C/C++ project is available to run.');
      return;
    }
    const project = this.workspaces.getProject(ref);
    if (project?.targetType !== 'Executable' && project?.targetType !== 'Dynamic Link Library') {
      vscode.window.showErrorMessage('Run is available only for executable targets, or for DLL targets with an external host configured.');
      return;
    }

    const run = this.projectSettings.getSettings(ref).run;
    const targetPath = this.resolveTargetPath(ref, project?.targetType);
    const useExternalHost = project?.targetType === 'Dynamic Link Library' && run.externalProcessPath.trim().length > 0;
    const rawExecutablePath = useExternalHost ? run.externalProcessPath.trim() : targetPath;
    if (!rawExecutablePath) {
      vscode.window.showErrorMessage(`The output target for ${ref.name} could not be resolved.`);
      return;
    }
    const executablePath = normalizeRuntimePath(rawExecutablePath);
    if (path.extname(executablePath).toLowerCase() !== '.exe') {
      vscode.window.showErrorMessage(`The selected target is ${path.basename(executablePath)}, not an executable. Configure an external executable for DLL debugging in Project Build Settings.`);
      return;
    }
    if (!fs.existsSync(executablePath)) {
      vscode.window.showErrorMessage(`The executable does not exist: ${executablePath}. Build the target before launching it.`);
      return;
    }
    const fallbackArgs = vscode.workspace.getConfiguration('cpm').get<string[]>('runArguments', []);
    const args = run.arguments.trim() ? this.projectSettings.parseArguments(run.arguments) : fallbackArgs;
    const cwd = run.workingDirectory.trim() ? normalizeRuntimePath(run.workingDirectory.trim()) : path.dirname(executablePath);
    if (!fs.existsSync(cwd)) {
      vscode.window.showErrorMessage(`The configured working directory does not exist: ${cwd}`);
      return;
    }
    const config = this.getCompilerConfiguration();
    this.deployToolchainRuntimeDlls(executablePath, config);
    const env = this.createRuntimeEnvironment(this.projectSettings.parseEnvironment(run.environmentOptions), config, executablePath);
    const child = spawn(executablePath, args, { cwd, env, detached: true, shell: false, stdio: 'ignore' });
    child.unref();
    this.output.appendLine(`[C/C++] Started ${executablePath} ${args.map(renderArgument).join(' ')}`);
    this.output.appendLine(`[C/C++] Runtime PATH prepended with: ${this.runtimeSearchDirectories(config, executablePath).join(path.delimiter)}`);
  }

  async debugWithGdb(projectRef?: CpmWorkspaceProjectRef): Promise<boolean> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing C/C++ project is available for debugging.');
      return false;
    }
    const project = this.workspaces.getProject(ref);
    if (project?.targetType !== 'Executable') {
      vscode.window.showErrorMessage('VS Code debugger launch is available only for executable targets.');
      return false;
    }
    if (this.buildMode === 'release' || this.buildMode === 'release64') {
      const debugMode: CpmBuildMode = this.buildMode === 'release64' ? 'debug64' : 'debug';
      const answer = await vscode.window.showWarningMessage(`The active build mode is ${this.buildMode}. Switch to ${debugMode}, build and debug?`, 'Switch, build and debug', 'Continue current mode', 'Cancel');
      if (answer === 'Cancel' || !answer) {
        return false;
      }
      if (answer === 'Switch, build and debug') {
        await vscode.workspace.getConfiguration('cpm').update('buildMode', debugMode, vscode.ConfigurationTarget.Workspace);
      }
    }
    const success = await this.build(false, ref);
    if (!success) {
      return false;
    }
    const targetPath = this.resolveTargetPath(ref, project?.targetType);
    if (!targetPath || !fs.existsSync(targetPath)) {
      vscode.window.showErrorMessage(`Debug target not found: ${targetPath || ref.name}`);
      return false;
    }
    const runSettings = this.projectSettings.getSettings(ref).run;
    const config = this.getCompilerConfiguration();
    this.deployToolchainRuntimeDlls(targetPath, config);
    const args = runSettings.arguments.trim() ? this.projectSettings.parseArguments(runSettings.arguments) : [];
    const cwd = runSettings.workingDirectory.trim() ? normalizeRuntimePath(runSettings.workingDirectory.trim()) : path.dirname(targetPath);
    const debugEnvironment = this.debugEnvironmentFromProcessEnv(this.createRuntimeEnvironment(this.projectSettings.parseEnvironment(runSettings.environmentOptions), config, targetPath));
    const debugConfig: vscode.DebugConfiguration = {
      name: `Debug ${ref.name}`,
      type: 'cppdbg',
      request: 'launch',
      program: targetPath,
      args,
      cwd,
      stopAtEntry: false,
      externalConsole: false,
      MIMode: 'gdb',
      miDebuggerPath: config.debuggerPath || 'gdb',
      environment: debugEnvironment
    };
    const started = await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(vscode.Uri.file(ref.absolutePath)), debugConfig);
    if (!started) {
      vscode.window.showErrorMessage('Unable to start the VS Code C/C++ debug session. Check that the Microsoft C/C++ extension and gdb are installed.');
    }
    return started;
  }

  async openWorkspaceFile(): Promise<void> {
    const workspace = this.workspaces.currentWorkspace;
    if (!workspace) {
      vscode.window.showErrorMessage('No C/C++ workspace is loaded.');
      return;
    }
    await this.workspaces.openPath(workspace.path);
  }

  async openProjectFile(projectPath: string): Promise<void> {
    await this.workspaces.openPath(projectPath);
  }

  async prepareDllImportLibraryGeneration(headerPath: string): Promise<void> {
    await vscode.env.clipboard.writeText(headerPath);
    vscode.window.showInformationMessage('The header path was copied. Use your compiler toolchain or dlltool to generate an import library if required.');
  }

  async openPanelFile(panelPath: string): Promise<void> {
    await this.workspaces.openPath(panelPath);
  }

  private async buildOneProject(ref: CpmWorkspaceProjectRef, rebuild: boolean): Promise<boolean> {
    const project = this.workspaces.getProject(ref);
    if (!project) {
      vscode.window.showErrorMessage(`Unable to parse project: ${ref.name}`);
      return false;
    }
    const config = this.getCompilerConfiguration();
    const artifacts = this.resolveArtifacts(ref, project.targetType);
    const sourceFiles = project.files.filter((file) => !file.excluded && isSource(file.absolutePath));
    if (sourceFiles.length === 0) {
      vscode.window.showErrorMessage(`${ref.name} has no C/C++ source file included in the build.`);
      return false;
    }
    if (rebuild && fs.existsSync(artifacts.objectDirectory)) {
      try {
        fs.rmSync(artifacts.objectDirectory, { recursive: true, force: true });
      } catch (error) {
        this.output.appendLine(`[C/C++] Warning: unable to remove previous object directory before rebuild: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!await this.ensureDirectory(artifacts.objectDirectory, 'object directory', false)) {
      const fallbackObjectDirectory = this.resolveLocalObjectDirectory(ref, config);
      if (!fallbackObjectDirectory || !await this.ensureDirectory(fallbackObjectDirectory, 'local object directory')) {
        return false;
      }
      this.output.appendLine(`[C/C++] Falling back to local object directory: ${fallbackObjectDirectory}`);
      artifacts.objectDirectory = fallbackObjectDirectory;
    }
    if (!await this.ensureDirectory(path.dirname(artifacts.targetPath), 'target directory')) {
      return false;
    }

    const objectFiles: string[] = [];
    for (const source of sourceFiles) {
      const objectPath = this.objectPathForSource(source.absolutePath, ref.absolutePath, artifacts.objectDirectory);
      const shouldCompile = rebuild || !fs.existsSync(objectPath) || fs.statSync(source.absolutePath).mtimeMs > fs.statSync(objectPath).mtimeMs;
      if (shouldCompile) {
        const args = this.compileArguments(source.absolutePath, objectPath, ref, project.files, config);
        const success = await this.spawnTool(this.compilerForSource(source.absolutePath, config), args, path.dirname(ref.absolutePath), `Compile ${path.basename(source.absolutePath)}`);
        if (!success) {
          return false;
        }
      } else {
        this.output.appendLine(`[C/C++] Up to date: ${path.basename(source.absolutePath)}`);
      }
      objectFiles.push(objectPath);
    }

    artifacts.objectFiles = objectFiles;
    const linkSuccess = await this.linkArtifacts(ref, project.targetType, artifacts, project.files, config);
    return linkSuccess;
  }

  private async linkArtifacts(ref: CpmWorkspaceProjectRef, targetType: string, artifacts: BuildArtifacts, files: CpmProjectFile[], config: GenericCompilerConfiguration): Promise<boolean> {
    if (targetType === 'Static Library') {
      const args = ['rcs', artifacts.targetPath, ...artifacts.objectFiles];
      return await this.spawnTool(config.archiverPath || 'ar', args, path.dirname(ref.absolutePath), `Archive ${path.basename(artifacts.targetPath)}`);
    }

    const fileLibraries = files.filter((file) => !file.excluded && isLibrary(file.absolutePath)).map((file) => file.absolutePath);
    const diagnostics = this.diagnoseLinkedLibraries(fileLibraries, artifacts.objectFiles, config);
    if (!diagnostics.compatible) {
      diagnostics.messages.forEach((message) => this.output.appendLine(message));
      this.output.appendLine('');
      vscode.window.showErrorMessage('Linked library architecture mismatch detected. Open the C/C++ Project Manager output channel for details.');
      return false;
    }
    diagnostics.messages.forEach((message) => this.output.appendLine(message));
    if (diagnostics.messages.length > 0) {
      this.output.appendLine('');
    }

    const args = [
      ...this.modeFlags(config),
      ...(targetType === 'Dynamic Link Library' ? ['-shared'] : []),
      ...artifacts.objectFiles,
      ...fileLibraries,
      ...config.libraryPaths.flatMap((value) => ['-L', resolveAgainstProject(value, ref.absolutePath)]),
      ...config.libraries.map((name) => name.startsWith('-l') ? name : `-l${name}`),
      ...config.linkerFlags,
      '-o', artifacts.targetPath
    ];
    const success = await this.spawnTool(config.cppCompilerPath || 'g++', args, path.dirname(ref.absolutePath), `Link ${path.basename(artifacts.targetPath)}`);
    if (success) {
      this.deployToolchainRuntimeDlls(artifacts.targetPath, config);
    }
    return success;
  }

  private diagnoseLinkedLibraries(libraryPaths: string[], objectPaths: string[], config: GenericCompilerConfiguration): { compatible: boolean; messages: string[] } {
    const messages: string[] = [];
    const objectArch = objectPaths.map((value) => inspectBinaryArchitecture(value).arch).find(Boolean);
    let expectedArch = objectArch
      ? { ...objectArch, reason: 'compiled object file architecture' }
      : inferRequestedArchitecture(config.cppCompilerPath || 'g++', this.modeFlags(config));
    if (expectedArch) {
      messages.push(`[C/C++] Link target architecture: ${expectedArch.label} (${expectedArch.reason}).`);
    }

    let compatible = true;
    for (const libraryPath of libraryPaths) {
      const libraryInfo = inspectBinaryArchitecture(libraryPath);
      if (!libraryInfo.arch) {
        if (path.extname(libraryPath).toLowerCase() === '.lib') {
          messages.push(`[C/C++] Note: ${path.basename(libraryPath)} is a .lib file. If it is an MSVC import library, MinGW may require a matching architecture or a MinGW import library generated with dlltool.`);
        }
        continue;
      }

      messages.push(`[C/C++] Linked library: ${path.basename(libraryPath)} -> ${libraryInfo.arch.label}${libraryInfo.kind ? ` ${libraryInfo.kind}` : ''}.`);
      if (expectedArch && libraryInfo.arch.id !== expectedArch.id) {
        compatible = false;
        messages.push(`[C/C++] ERROR: ${path.basename(libraryPath)} is ${libraryInfo.arch.label}, but the active linker/toolchain targets ${expectedArch.label}.`);
        messages.push(`[C/C++]        Use a ${libraryInfo.arch.label} compiler/toolchain and build mode, or rebuild the DLL/import library for ${expectedArch.label}.`);
      }
    }

    if (compatible && expectedArch?.id === 'x86') {
      const hasLib = libraryPaths.some((value) => path.extname(value).toLowerCase() === '.lib');
      if (hasLib) {
        messages.push('[C/C++] Note: 32-bit MinGW expects 32-bit import symbols. A 64-bit or MSVC-only .lib can produce undefined references such as _imp__FunctionName.');
      }
    }
    return { compatible, messages };
  }

  private compileArguments(sourcePath: string, objectPath: string, ref: CpmWorkspaceProjectRef, projectFiles: CpmProjectFile[], config: GenericCompilerConfiguration): string[] {
    const includePaths = unique([
      path.dirname(ref.absolutePath),
      ...projectFiles.filter((file) => isHeader(file.absolutePath)).map((file) => path.dirname(file.absolutePath)),
      ...config.includePaths.map((value) => resolveAgainstProject(value, ref.absolutePath))
    ]);
    const standard = isCSource(sourcePath) ? config.cStandard : config.cppStandard;
    return [
      '-c', sourcePath,
      ...this.modeFlags(config),
      ...this.warningFlags(config),
      ...(standard && standard !== 'auto' ? [`-std=${standard}`] : []),
      ...config.defineSymbols.map((name) => `-D${name}`),
      ...includePaths.flatMap((value) => ['-I', value]),
      ...config.compilerFlags,
      ...(isCSource(sourcePath) ? config.cCompilerFlags : config.cppCompilerFlags),
      '-o', objectPath
    ];
  }

  private modeFlags(config: GenericCompilerConfiguration): string[] {
    const flags: string[] = [];
    const debugMode = this.buildMode === 'debug' || this.buildMode === 'debug64';

    if (config.debugInformation === 'mode-default') {
      if (debugMode) {
        flags.push('-g');
      }
    } else if (config.debugInformation === 'g') {
      flags.push('-g');
    } else if (config.debugInformation === 'g3') {
      flags.push('-g3');
    }

    if (config.optimizationLevel === 'mode-default') {
      flags.push(debugMode ? '-O0' : '-O2');
    } else if (config.optimizationLevel && config.optimizationLevel !== 'none') {
      flags.push(`-${config.optimizationLevel}`);
    }

    const architecture = config.architectureMode || (config.useBuildModeArchitectureFlags ? 'from-build-mode' : 'auto');
    const isExplicit64Mode = this.buildMode === 'debug64' || this.buildMode === 'release64';
    if (architecture === 'from-build-mode') {
      flags.push(isExplicit64Mode ? '-m64' : '-m32');
    } else if (architecture === 'm32' || architecture === 'm64') {
      flags.push(`-${architecture}`);
    } else if (architecture === 'auto' && isExplicit64Mode) {
      // A build mode named Debug x64 / Release x64 must produce a 64-bit target
      // even when the compiler path is entered as a plain command such as gcc/g++.
      // Without this, VS Code can still resolve gcc/g++ from an older 32-bit PATH.
      flags.push('-m64');
    }
    return flags;
  }

  private warningFlags(config: GenericCompilerConfiguration): string[] {
    switch (config.warningLevel) {
      case 'wall':
        return ['-Wall'];
      case 'wall-extra':
        return ['-Wall', '-Wextra'];
      case 'wall-extra-pedantic':
        return ['-Wall', '-Wextra', '-Wpedantic'];
      case 'all':
        return ['-Wall', '-Wextra', '-Wpedantic', '-Wconversion'];
      default:
        return [];
    }
  }

  private compilerForSource(sourcePath: string, config: GenericCompilerConfiguration): string {
    return isCSource(sourcePath) ? config.cCompilerPath || 'gcc' : config.cppCompilerPath || 'g++';
  }

  private resolveArtifacts(ref: CpmWorkspaceProjectRef, targetType?: string): BuildArtifacts {
    const objectDirectory = path.join(path.dirname(ref.absolutePath), this.getCompilerConfiguration().outputDirectory || 'build', ref.name, this.buildMode, 'obj');
    return { targetPath: this.resolveTargetPath(ref, targetType), objectDirectory, objectFiles: [] };
  }

  private resolveTargetPath(ref: CpmWorkspaceProjectRef, targetType?: string): string {
    const configured = this.parser.getTargetPath(ref.absolutePath, this.buildMode);
    if (configured) {
      return normalizeRuntimePath(configured);
    }
    const extension = targetType === 'Dynamic Link Library' ? '.dll' : targetType === 'Static Library' ? '.a' : '.exe';
    return path.join(path.dirname(ref.absolutePath), this.getCompilerConfiguration().outputDirectory || 'build', `${ref.name}${extension}`);
  }

  private objectPathForSource(sourcePath: string, projectPath: string, objectDirectory: string): string {
    const relative = path.relative(path.dirname(projectPath), sourcePath).replace(/[^A-Za-z0-9_.-]+/g, '_');
    const hash = crypto.createHash('sha1').update(path.resolve(sourcePath).toLowerCase()).digest('hex').slice(0, 8);
    return path.join(objectDirectory, `${relative}.${hash}.o`);
  }

  private beginOutput(label: string): void {
    this.output.clear();
    this.output.show(true);
    this.output.appendLine(`[C/C++] ${label} started`);
    this.output.appendLine(`[C/C++] Build mode: ${this.buildMode}`);
    this.output.appendLine('');
  }

  private async spawnTool(executable: string, args: string[], cwd: string, label: string): Promise<boolean> {
    const launch = resolveToolLaunch(executable);
    this.output.appendLine(`[C/C++] ${label}`);
    this.output.appendLine(`[C/C++] Tool: ${executable}`);
    if (launch.note) {
      this.output.appendLine(`[C/C++] ${launch.note}`);
    }
    if (launch.warning) {
      this.output.appendLine(`[C/C++] ${launch.warning}`);
    }
    this.output.appendLine(`[C/C++] Arguments: ${args.map(renderArgument).join(' ')}`);
    this.output.appendLine('');
    return await new Promise<boolean>((resolve) => {
      const child = spawn(launch.executable, args, { cwd, windowsHide: true, shell: false, env: launch.env });
      child.stdout.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.stderr.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.on('error', (error) => {
        this.output.appendLine(`\n[C/C++] Unable to start ${executable}: ${error.message}`);
        vscode.window.showErrorMessage(`Unable to start ${executable}: ${error.message}`);
        resolve(false);
      });
      child.on('close', (code) => {
        this.output.appendLine('');
        this.output.appendLine(`[C/C++] ${path.basename(executable)} exited with code ${String(code)}.`);
        if (code !== 0) {
          vscode.window.showErrorMessage(`${label} failed. Open the C/C++ Project Manager output channel for details.`);
        }
        resolve(code === 0);
      });
    });
  }


  private async ensureDirectory(directoryPath: string, label: string, showUserMessage = true): Promise<boolean> {
    const normalized = normalizeRuntimePath(directoryPath);
    const blockingPath = findBlockingPathSegment(normalized);
    if (blockingPath) {
      const message = `Cannot create ${label}: a file already exists in the directory path: ${blockingPath}`;
      this.output.appendLine(`[C/C++] ERROR: ${message}`);
      if (showUserMessage) {
        vscode.window.showErrorMessage(message);
      }
      return false;
    }

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        fs.mkdirSync(normalized, { recursive: true });
        return true;
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        const code = nodeError.code || 'ERROR';
        const message = nodeError.message || String(error);
        if (attempt < 5 && (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY')) {
          this.output.appendLine(`[C/C++] ${code} while creating ${label}; retry ${attempt}/5: ${normalized}`);
          await delay(180 * attempt);
          continue;
        }
        this.output.appendLine(`[C/C++] ERROR: unable to create ${label}: ${normalized}`);
        this.output.appendLine(`[C/C++] ${code}: ${message}`);
        if (/\\OneDrive\\|\/OneDrive\//i.test(normalized)) {
          this.output.appendLine('[C/C++] Hint: the build directory is inside OneDrive. If Windows locks the directory, move the project/build output to a local non-synchronized folder or pause OneDrive synchronization during the build.');
        }
        if (showUserMessage) {
          vscode.window.showErrorMessage(`Unable to create ${label}. Open the C/C++ Project Manager output channel for details.`);
        }
        return false;
      }
    }
    return false;
  }

  private resolveLocalObjectDirectory(ref: CpmWorkspaceProjectRef, config: GenericCompilerConfiguration): string | undefined {
    if (!config.useLocalBuildCacheForOneDrive && !isInsideOneDrive(path.dirname(ref.absolutePath))) {
      return undefined;
    }
    const base = process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'CpmProjectManager', 'BuildCache')
      : path.join(os.tmpdir(), 'cpm-build-cache');
    const projectHash = crypto.createHash('sha1').update(path.resolve(ref.absolutePath).toLowerCase()).digest('hex').slice(0, 16);
    return path.join(base, projectHash, ref.name.replace(/[^A-Za-z0-9_.-]+/g, '_'), this.buildMode, 'obj');
  }

  private createRuntimeEnvironment(base: NodeJS.ProcessEnv, config: GenericCompilerConfiguration, executablePath: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...base };
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
    const existing = env[pathKey] ?? '';
    const directories = this.runtimeSearchDirectories(config, executablePath);
    if (directories.length > 0) {
      env[pathKey] = `${directories.join(path.delimiter)}${path.delimiter}${existing}`;
    }
    return env;
  }

  private debugEnvironmentFromProcessEnv(env: NodeJS.ProcessEnv): Array<{ name: string; value: string }> {
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
    return [{ name: pathKey, value: env[pathKey] ?? '' }];
  }

  private runtimeSearchDirectories(config: GenericCompilerConfiguration, executablePath: string): string[] {
    return unique([
      path.dirname(executablePath),
      ...this.toolchainBinDirectories(config),
      ...this.linkedDllDirectories(path.dirname(executablePath))
    ]);
  }

  private linkedDllDirectories(projectDirectory: string): string[] {
    try {
      return fs.readdirSync(projectDirectory)
        .filter((name) => /\.dll$/i.test(name))
        .map(() => projectDirectory);
    } catch {
      return [];
    }
  }

  private toolchainBinDirectories(config: GenericCompilerConfiguration): string[] {
    const candidates = [config.cppCompilerPath, config.cCompilerPath, config.debuggerPath]
      .map((value) => resolveExecutableFromPath(value || ''))
      .filter(Boolean)
      .map((value) => path.dirname(normalizeRuntimePath(value)))
      .filter((value) => fs.existsSync(value));
    return unique(candidates);
  }

  private deployToolchainRuntimeDlls(targetPath: string, config: GenericCompilerConfiguration): void {
    if (config.deployRuntimeDlls === 'never' || process.platform !== 'win32') {
      return;
    }
    const targetDirectory = path.dirname(targetPath);
    if (!fs.existsSync(targetDirectory)) {
      return;
    }

    const runtimeSources = new Map<string, string>();
    for (const binDirectory of this.toolchainBinDirectories(config)) {
      for (const name of listMinGwRuntimeDlls(binDirectory)) {
        const sourcePath = path.join(binDirectory, name);
        runtimeSources.set(name.toLowerCase(), sourcePath);
      }
    }

    if (config.cleanRuntimeDllsOnDeploy) {
      this.cleanStaleRuntimeDlls(targetDirectory, runtimeSources);
    }

    let copied = 0;
    let unchanged = 0;
    for (const sourcePath of runtimeSources.values()) {
      const destinationPath = path.join(targetDirectory, path.basename(sourcePath));
      try {
        if (shouldCopyRuntimeDll(sourcePath, destinationPath)) {
          fs.copyFileSync(sourcePath, destinationPath);
          copied++;
        } else {
          unchanged++;
        }
      } catch (error) {
        this.output.appendLine(`[C/C++] Warning: unable to deploy runtime DLL ${path.basename(sourcePath)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (runtimeSources.size > 0) {
      this.output.appendLine(`[C/C++] MinGW runtime DLL deployment: ${copied} copied, ${unchanged} already up to date.`);
    }
  }

  private cleanStaleRuntimeDlls(targetDirectory: string, runtimeSources: Map<string, string>): void {
    let removed = 0;
    let refreshed = 0;
    try {
      for (const name of fs.readdirSync(targetDirectory)) {
        if (!isMinGwRuntimeDllName(name)) {
          continue;
        }
        const destinationPath = path.join(targetDirectory, name);
        const sourcePath = runtimeSources.get(name.toLowerCase());
        if (!sourcePath) {
          fs.rmSync(destinationPath, { force: true });
          removed++;
          continue;
        }
        const sourceArch = inspectBinaryArchitecture(sourcePath).arch;
        const destinationArch = inspectBinaryArchitecture(destinationPath).arch;
        if (sourceArch && destinationArch && sourceArch.id !== destinationArch.id) {
          fs.rmSync(destinationPath, { force: true });
          refreshed++;
        }
      }
    } catch (error) {
      this.output.appendLine(`[C/C++] Warning: unable to clean deployed MinGW runtime DLLs: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (removed > 0 || refreshed > 0) {
      this.output.appendLine(`[C/C++] MinGW runtime DLL cleanup: ${removed} stale removed, ${refreshed} architecture-mismatched removed before redeploy.`);
    }
  }

  private getCompilerConfiguration(): GenericCompilerConfiguration {
    const config = vscode.workspace.getConfiguration('cpm');
    return {
      cCompilerPath: config.get<string>('cCompilerPath', 'gcc'),
      cppCompilerPath: config.get<string>('cppCompilerPath', 'g++'),
      archiverPath: config.get<string>('archiverPath', 'ar'),
      debuggerPath: config.get<string>('debuggerPath', 'gdb'),
      outputDirectory: config.get<string>('outputDirectory', 'build'),
      cStandard: config.get<string>('cStandard', 'auto'),
      cppStandard: config.get<string>('cppStandard', 'c++17'),
      warningLevel: config.get<string>('warningLevel', 'wall-extra'),
      optimizationLevel: config.get<string>('optimizationLevel', 'mode-default'),
      debugInformation: config.get<string>('debugInformation', 'mode-default'),
      architectureMode: config.get<string>('architectureMode', config.get<boolean>('useBuildModeArchitectureFlags', false) ? 'from-build-mode' : 'auto'),
      compilerFlags: config.get<string[]>('compilerFlags', []),
      cCompilerFlags: config.get<string[]>('cCompilerFlags', []),
      cppCompilerFlags: config.get<string[]>('cppCompilerFlags', []),
      linkerFlags: config.get<string[]>('linkerFlags', []),
      includePaths: config.get<string[]>('includePaths', []),
      libraryPaths: config.get<string[]>('libraryPaths', []),
      libraries: config.get<string[]>('libraries', []),
      defineSymbols: config.get<string[]>('defineSymbols', []),
      useBuildModeArchitectureFlags: config.get<boolean>('useBuildModeArchitectureFlags', false),
      deployRuntimeDlls: config.get<string>('deployRuntimeDlls', 'auto'),
      cleanRuntimeDllsOnDeploy: config.get<boolean>('cleanRuntimeDllsOnDeploy', true),
      useLocalBuildCacheForOneDrive: config.get<boolean>('useLocalBuildCacheForOneDrive', true)
    };
  }
}


interface ToolLaunch {
  executable: string;
  env?: NodeJS.ProcessEnv;
  note?: string;
  warning?: string;
}

const toolLaunchCache = new Map<string, ToolLaunch>();

function resolveToolLaunch(executable: string): ToolLaunch {
  if (process.platform !== 'win32' || !/\s/.test(executable) || !isGccLikeTool(executable)) {
    return { executable };
  }

  const normalized = normalizeRuntimePath(executable);
  if (toolLaunchCache.has(normalized)) {
    return toolLaunchCache.get(normalized) ?? { executable };
  }

  const shortened = getWindowsShortPath(normalized);
  if (shortened && shortened !== normalized && !/\s/.test(shortened) && fs.existsSync(shortened)) {
    const launch = { executable: shortened, note: `Windows no-space tool path: ${shortened}` };
    toolLaunchCache.set(normalized, launch);
    return launch;
  }

  const aliased = createNoSpaceToolchainAlias(normalized);
  if (aliased && !/\s/.test(aliased) && fs.existsSync(aliased)) {
    const launch = { executable: aliased, note: `Windows no-space toolchain alias: ${aliased}` };
    toolLaunchCache.set(normalized, launch);
    return launch;
  }

  const binDirectory = path.dirname(normalized);
  const basename = path.basename(normalized);
  const env = makePathPrependedEnvironment(binDirectory);
  const launch = {
    executable: basename,
    env,
    note: `Windows PATH launch for space-containing GCC path: ${basename} with ${binDirectory} prepended to PATH.`,
    warning: 'Warning: no short path or junction alias could be created for this MinGW/GCC installation. If ld still reports C:/Program Files split into two paths, move or reinstall the toolchain to a path without spaces such as C:\\mingw64 or C:\\msys64\\mingw64.'
  };
  toolLaunchCache.set(normalized, launch);
  return launch;
}

function makePathPrependedEnvironment(directory: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = `${directory}${path.delimiter}${env[pathKey] ?? ''}`;
  return env;
}

function getWindowsShortPath(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const command = `for %I in ("${filePath.replace(/"/g, '""')}") do @echo %~sI`;
    const output = execFileSync('cmd.exe', ['/d', '/s', '/c', command], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 2000
    }).trim();
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop();
  } catch {
    return undefined;
  }
}


function createNoSpaceToolchainAlias(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const binDirectory = path.dirname(filePath);
  const rootDirectory = path.basename(binDirectory).toLowerCase() === 'bin' ? path.dirname(binDirectory) : binDirectory;
  if (!/\s/.test(rootDirectory)) {
    return undefined;
  }

  const aliasBase = path.join(os.tmpdir(), 'cpm-toolchain-aliases');
  if (/\s/.test(aliasBase)) {
    return undefined;
  }

  const safeName = path.basename(rootDirectory).replace(/[^A-Za-z0-9_.-]+/g, '_') || 'toolchain';
  const hash = crypto.createHash('sha1').update(rootDirectory.toLowerCase()).digest('hex').slice(0, 12);
  const aliasRoot = path.join(aliasBase, `${safeName}_${hash}`);
  const relativeToolPath = path.relative(rootDirectory, filePath);
  const aliasToolPath = path.join(aliasRoot, relativeToolPath);

  try {
    fs.mkdirSync(aliasBase, { recursive: true });
    if (!fs.existsSync(aliasRoot)) {
      try {
        fs.symlinkSync(rootDirectory, aliasRoot, 'junction');
      } catch {
        const command = `mklink /J "${aliasRoot.replace(/"/g, '""')}" "${rootDirectory.replace(/"/g, '""')}"`;
        execFileSync('cmd.exe', ['/d', '/c', command], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 5000
        });
      }
    }
    if (fs.existsSync(aliasToolPath)) {
      return aliasToolPath;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isGccLikeTool(executable: string): boolean {
  const name = path.basename(executable).toLowerCase();
  return /^(?:gcc|g\+\+|c\+\+|cc|clang|clang\+\+)(?:\.exe)?$/.test(name);
}


function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findBlockingPathSegment(directoryPath: string): string | undefined {
  const parsed = path.parse(directoryPath);
  const parts = path.resolve(directoryPath).slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const part of parts) {
    current = path.join(current, part);
    if (fs.existsSync(current)) {
      try {
        if (!fs.statSync(current).isDirectory()) {
          return current;
        }
      } catch {
        return current;
      }
    }
  }
  return undefined;
}

interface ArchitectureInfo {
  id: 'x86' | 'x64' | 'arm64';
  label: string;
  reason?: string;
}

function inferRequestedArchitecture(compilerPath: string, flags: string[]): ArchitectureInfo | undefined {
  if (flags.includes('-m32')) {
    return { id: 'x86', label: 'x86 / 32-bit', reason: '-m32' };
  }
  if (flags.includes('-m64')) {
    return { id: 'x64', label: 'x64 / 64-bit', reason: '-m64' };
  }
  const resolved = resolveExecutableFromPath(compilerPath);
  const lower = resolved.toLowerCase().replace(/\\/g, '/');
  if (/(^|[/_-])(x86_64|amd64|mingw64|ucrt64|clang64|msvc[^/]*_64|win64)([/_.-]|$)/.test(lower)) {
    return { id: 'x64', label: 'x64 / 64-bit', reason: `compiler path ${resolved}` };
  }
  if (/(^|[/_-])(i686|mingw32|win32)([/_.-]|$)/.test(lower)) {
    return { id: 'x86', label: 'x86 / 32-bit', reason: `compiler path ${resolved}` };
  }
  if (/(^|[/_-])(aarch64|arm64)([/_.-]|$)/.test(lower)) {
    return { id: 'arm64', label: 'ARM64', reason: `compiler path ${resolved}` };
  }
  return undefined;
}

function resolveExecutableFromPath(executable: string): string {
  if (executable.includes('/') || executable.includes('\\')) {
    return normalizeRuntimePath(executable);
  }
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];
  const names = process.platform === 'win32' && !path.extname(executable)
    ? extensions.map((extension) => `${executable}${extension.toLowerCase()}`)
    : [executable];
  for (const entry of pathEntries) {
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return executable;
}

function inspectBinaryArchitecture(filePath: string): { arch?: ArchitectureInfo; kind?: string } {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length >= 0x40 && buffer.toString('ascii', 0, 2) === 'MZ') {
      const peOffset = buffer.readUInt32LE(0x3c);
      if (peOffset > 0 && peOffset + 6 <= buffer.length && buffer.toString('ascii', peOffset, peOffset + 4) === 'PE\u0000\u0000') {
        return { arch: machineToArchitecture(buffer.readUInt16LE(peOffset + 4)), kind: 'PE/DLL' };
      }
    }
    if (buffer.length >= 8 && buffer.toString('ascii', 0, 8) === '!<arch>\n') {
      return inspectArchiveArchitecture(buffer);
    }
    if (buffer.length >= 20) {
      const arch = machineToArchitecture(buffer.readUInt16LE(0));
      if (arch) {
        return { arch, kind: 'COFF object' };
      }
    }
  } catch {
    // Best-effort diagnostics only.
  }
  return {};
}

function inspectArchiveArchitecture(buffer: Buffer): { arch?: ArchitectureInfo; kind?: string } {
  let offset = 8;
  while (offset + 60 <= buffer.length) {
    const header = buffer.toString('ascii', offset, offset + 60);
    const sizeText = header.slice(48, 58).trim();
    const size = Number.parseInt(sizeText, 10);
    if (!Number.isFinite(size) || size < 0) {
      break;
    }
    const dataStart = offset + 60;
    const dataEnd = Math.min(dataStart + size, buffer.length);
    const data = buffer.subarray(dataStart, dataEnd);
    if (data.length >= 20) {
      const importArch = inspectCoffImportObject(data);
      if (importArch) {
        return { arch: importArch, kind: 'import library' };
      }
      const objectArch = machineToArchitecture(data.readUInt16LE(0));
      if (objectArch) {
        return { arch: objectArch, kind: 'archive object library' };
      }
    }
    offset = dataEnd + (size % 2);
  }
  return { kind: 'archive library' };
}

function inspectCoffImportObject(data: Buffer): ArchitectureInfo | undefined {
  if (data.length < 20) {
    return undefined;
  }
  const sig1 = data.readUInt16LE(0);
  const sig2 = data.readUInt16LE(2);
  if (sig1 === 0x0000 && sig2 === 0xffff) {
    return machineToArchitecture(data.readUInt16LE(6));
  }
  return undefined;
}

function machineToArchitecture(machine: number): ArchitectureInfo | undefined {
  switch (machine) {
    case 0x014c:
      return { id: 'x86', label: 'x86 / 32-bit' };
    case 0x8664:
      return { id: 'x64', label: 'x64 / 64-bit' };
    case 0xaa64:
      return { id: 'arm64', label: 'ARM64' };
    default:
      return undefined;
  }
}


function isInsideOneDrive(value: string): boolean {
  const normalized = path.resolve(value).replace(/\\/g, '/').toLowerCase();
  return /(^|\/)onedrive(\/|$)/i.test(normalized) || /\/onedrive[ -]/i.test(normalized);
}

function listMinGwRuntimeDlls(binDirectory: string): string[] {
  try {
    return fs.readdirSync(binDirectory).filter(isMinGwRuntimeDllName);
  } catch {
    return [];
  }
}

function isMinGwRuntimeDllName(name: string): boolean {
  const lower = name.toLowerCase();
  return /^libgcc_s_.*\.dll$/.test(lower)
    || lower === 'libstdc++-6.dll'
    || lower === 'libwinpthread-1.dll'
    || lower === 'libgomp-1.dll'
    || lower === 'libquadmath-0.dll'
    || lower === 'libssp-0.dll'
    || lower === 'libatomic-1.dll'
    || /^libgfortran-.*\.dll$/.test(lower);
}

function shouldCopyRuntimeDll(sourcePath: string, destinationPath: string): boolean {
  if (!fs.existsSync(destinationPath)) {
    return true;
  }
  try {
    const sourceArch = inspectBinaryArchitecture(sourcePath).arch;
    const destinationArch = inspectBinaryArchitecture(destinationPath).arch;
    if (sourceArch && destinationArch && sourceArch.id !== destinationArch.id) {
      return true;
    }
    const sourceStat = fs.statSync(sourcePath);
    const destinationStat = fs.statSync(destinationPath);
    return sourceStat.size !== destinationStat.size || Math.abs(sourceStat.mtimeMs - destinationStat.mtimeMs) > 2000;
  } catch {
    return true;
  }
}

function isCSource(filePath: string): boolean { return path.extname(filePath).toLowerCase() === '.c'; }
function isSource(filePath: string): boolean { return /\.(?:c|cc|cpp|cxx)$/i.test(filePath); }
function isHeader(filePath: string): boolean { return /\.(?:h|hh|hpp|hxx)$/i.test(filePath); }
function isLibrary(filePath: string): boolean { return /\.(?:a|lib)$/i.test(filePath); }
function renderArgument(value: string): string { return /\s/.test(value) ? `"${value}"` : value; }
function replaceExtension(filePath: string, extension: string): string { return path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}${extension}`); }
function unique(values: string[]): string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
function resolveAgainstProject(value: string, projectPath: string): string { return path.isAbsolute(value) ? value : path.resolve(path.dirname(projectPath), value); }
