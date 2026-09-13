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
import { CpmSdlConfiguration, createSdlBuildPlan } from './cpmSdlService';

type CpmRuntimeDependencyMode = 'copy-dlls' | 'path-only' | 'static-link';

type CpmBuildLogDetail = 'compact' | 'normal' | 'verbose';

interface ParsedToolDiagnostic {
  severity: 'error' | 'warning' | 'note';
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  sourceLine?: string;
  hint?: string;
  toolLabel: string;
  rawLine: string;
}

interface ToolRunResult {
  success: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  diagnostics: ParsedToolDiagnostic[];
}

interface CpmBuildReport {
  label: string;
  startedAt: Date;
  startedMs: number;
  toolRuns: number;
  errors: ParsedToolDiagnostic[];
  warnings: ParsedToolDiagnostic[];
  notes: ParsedToolDiagnostic[];
  failedAt?: string;
  sourceTotal: number;
  compileRun: number;
  compileCached: number;
  linkRun: number;
}


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
  runtimeDependencyMode: CpmRuntimeDependencyMode;
  cleanRuntimeDllsOnDeploy: boolean;
  useLocalBuildCacheForOneDrive: boolean;
  sdl: CpmSdlConfiguration;
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
    private readonly output: vscode.OutputChannel,
    private readonly traceOutput: vscode.OutputChannel,
    private readonly diagnostics: vscode.DiagnosticCollection
  ) {}

  private currentReport: CpmBuildReport | undefined;

  get buildMode(): CpmBuildMode {
    return this.projectSettings.getCpmConfigurationValue<CpmBuildMode>('buildMode', 'debug');
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
    await this.projectSettings.updateCpmConfigurationValue('buildMode', selected.value);
    vscode.window.showInformationMessage(`C/C++ build mode: ${selected.label}.`);
  }

  async build(rebuild = false, projectRef?: CpmWorkspaceProjectRef): Promise<boolean> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing active C/C++ project is available for build.');
      return false;
    }

    const report = this.beginOutput(`${rebuild ? 'Rebuild' : 'Build'} ${ref.name}`);
    let success = false;
    let failedAt = '';
    try {
      const order = this.projectSettings.getBuildOrder(ref);
      this.appendSection('BUILD ORDER');
      for (const item of order) {
        this.output.appendLine(`  ${item.name}`);
      }
      this.output.appendLine('');
      this.traceOutput.appendLine(`[C/C++] Build order: ${order.map((item) => item.name).join(' -> ')}`);
      this.traceOutput.appendLine('');

      for (const item of order) {
        const cwd = path.dirname(item.absolutePath);
        const settings = this.projectSettings.getSettings(item);
        if (!await this.projectSettings.runActions(settings.preBuildActions, `Pre-build actions — ${item.name}`, cwd)) {
          failedAt = `Pre-build actions — ${item.name}`;
          return false;
        }
        if (!await this.projectSettings.runActions(settings.customBuildActions, `Custom build actions — ${item.name}`, cwd)) {
          failedAt = `Custom build actions — ${item.name}`;
          return false;
        }
        const itemSuccess = await this.buildOneProject(item, rebuild);
        if (!itemSuccess) {
          failedAt = this.currentReport?.failedAt ?? `Build ${item.name}`;
          return false;
        }
        if (!await this.projectSettings.runActions(settings.postBuildActions, `Post-build actions — ${item.name}`, cwd)) {
          failedAt = `Post-build actions — ${item.name}`;
          return false;
        }
      }

      success = true;
      vscode.window.showInformationMessage(`${rebuild ? 'Rebuild' : 'Build'} completed successfully.`);
      return true;
    } finally {
      this.finishOutput(report, success, failedAt);
    }
  }

  async clean(projectRef?: CpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing active C/C++ project is available to clean.');
      return;
    }
    const report = this.beginOutput(`Clean ${ref.name}`);
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
    this.finishOutput(report, true);
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
    const report = this.beginOutput(`Compile ${path.basename(filePath)}`);
    const config = this.getCompilerConfiguration();
    const project = this.workspaces.getProject(ref);
    const artifacts = this.resolveArtifacts(ref);
    if (!await this.ensureDirectory(artifacts.objectDirectory, 'object directory', false)) {
      const fallbackObjectDirectory = this.resolveLocalObjectDirectory(ref, config);
      if (!fallbackObjectDirectory || !await this.ensureDirectory(fallbackObjectDirectory, 'local object directory')) {
        this.finishOutput(report, false, 'Create object directory');
        return false;
      }
      this.output.appendLine(`[C/C++] Falling back to local object directory: ${fallbackObjectDirectory}`);
      artifacts.objectDirectory = fallbackObjectDirectory;
    }
    const objectPath = this.objectPathForSource(filePath, ref.absolutePath, artifacts.objectDirectory);
    const args = this.compileArguments(filePath, objectPath, ref, project?.files ?? [], config);
    const result = await this.spawnTool(this.compilerForSource(filePath, config), args, path.dirname(ref.absolutePath), `Compile ${path.basename(filePath)}`);
    this.finishOutput(report, result, result ? '' : `Compile ${path.basename(filePath)}`);
    return result;
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
    const fallbackArgs = this.projectSettings.getCpmConfigurationValue<string[]>('runArguments', []);
    const args = run.arguments.trim() ? this.projectSettings.parseArguments(run.arguments) : fallbackArgs;
    const cwd = run.workingDirectory.trim() ? normalizeRuntimePath(run.workingDirectory.trim()) : path.dirname(executablePath);
    if (!fs.existsSync(cwd)) {
      vscode.window.showErrorMessage(`The configured working directory does not exist: ${cwd}`);
      return;
    }
    const config = this.getCompilerConfiguration();
    this.deployToolchainRuntimeDlls(executablePath, config);
    const sdlPlan = project ? this.resolveSdlPlan(ref, project.files, project.targetType) : undefined;
    this.deploySdlRuntimeDlls(executablePath, sdlPlan);
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
        await this.projectSettings.updateCpmConfigurationValue('buildMode', debugMode);
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
    const sdlPlan = project ? this.resolveSdlPlan(ref, project.files, project.targetType) : undefined;
    this.deploySdlRuntimeDlls(targetPath, sdlPlan);
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

    const compilePlan = sourceFiles.map((source) => {
      const objectPath = this.objectPathForSource(source.absolutePath, ref.absolutePath, artifacts.objectDirectory);
      const shouldCompile = rebuild || !fs.existsSync(objectPath) || fs.statSync(source.absolutePath).mtimeMs > fs.statSync(objectPath).mtimeMs;
      return { source, objectPath, shouldCompile };
    });
    const compileCount = compilePlan.filter((item) => item.shouldCompile).length;
    const cachedCount = compilePlan.length - compileCount;
    if (this.currentReport) {
      this.currentReport.sourceTotal += compilePlan.length;
      this.currentReport.compileRun += compileCount;
      this.currentReport.compileCached += cachedCount;
    }

    this.appendSection('PROJECT / TOOLCHAIN');
    this.output.appendLine(`  Project   : ${ref.name}`);
    this.output.appendLine(`  Target    : ${artifacts.targetPath}`);
    this.output.appendLine(`  C compiler: ${config.cCompilerPath || 'gcc'}`);
    this.output.appendLine(`  C++ linker: ${config.cppCompilerPath || 'g++'}`);
    this.output.appendLine(`  Sources   : ${sourceFiles.length}`);
    this.output.appendLine('');

    this.appendSection('C/C++ COMPILATION');
    this.output.appendLine(`  Sources: ${compilePlan.length} | Compile: ${compileCount} | Cached: ${cachedCount}`);
    this.output.appendLine('');
    if (compileCount === 0) {
      this.output.appendLine('  [OK] All object files are up to date.');
      this.output.appendLine('');
    }

    const objectFiles: string[] = [];
    for (const item of compilePlan) {
      if (item.shouldCompile) {
        const args = this.compileArguments(item.source.absolutePath, item.objectPath, ref, project.files, config);
        const success = await this.spawnTool(this.compilerForSource(item.source.absolutePath, config), args, path.dirname(ref.absolutePath), `Compile ${path.basename(item.source.absolutePath)}`);
        if (!success) {
          this.output.appendLine('  [SKIP] Link step skipped because compilation failed.');
          return false;
        }
      } else if (this.logDetail() === 'verbose') {
        this.output.appendLine(`  [CACHE] ${path.basename(item.source.absolutePath)}`);
      }
      objectFiles.push(item.objectPath);
    }

    artifacts.objectFiles = objectFiles;
    const linkSuccess = await this.linkArtifacts(ref, project.targetType, artifacts, project.files, config);
    return linkSuccess;
  }

  private async linkArtifacts(ref: CpmWorkspaceProjectRef, targetType: string, artifacts: BuildArtifacts, files: CpmProjectFile[], config: GenericCompilerConfiguration): Promise<boolean> {
    this.appendSection(targetType === 'Static Library' ? 'ARCHIVE' : 'LINK');
    if (this.currentReport) {
      this.currentReport.linkRun += 1;
    }
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

    const sdlPlan = this.resolveSdlPlan(ref, files, targetType);
    if (sdlPlan) {
      this.output.appendLine(`[C/C++ SDL] SDK: ${sdlPlan.rootPath}`);
      this.output.appendLine(`[C/C++ SDL] Version: ${sdlPlan.version} · Packages: ${sdlPlan.packages.join(', ')} · runtime: ${sdlPlan.runtimeMode}`);
      if (sdlPlan.architecture) {
        this.output.appendLine(`[C/C++ SDL] SDK architecture: ${sdlPlan.architecture}`);
      }
      this.output.appendLine('');
    }

    const args = [
      ...this.modeFlags(config),
      ...this.runtimeLinkFlags(config, targetType, sdlPlan),
      ...(targetType === 'Dynamic Link Library' ? ['-shared'] : []),
      ...artifacts.objectFiles,
      ...fileLibraries,
      ...config.libraryPaths.flatMap((value) => ['-L', resolveAgainstProject(value, ref.absolutePath)]),
      ...(sdlPlan?.linkArgs ?? []),
      ...config.libraries.map((name) => name.startsWith('-l') ? name : `-l${name}`),
      ...config.linkerFlags,
      '-o', artifacts.targetPath
    ];
    const success = await this.spawnTool(config.cppCompilerPath || 'g++', args, path.dirname(ref.absolutePath), `Link ${path.basename(artifacts.targetPath)}`);
    if (success) {
      this.deployToolchainRuntimeDlls(artifacts.targetPath, config);
      this.deploySdlRuntimeDlls(artifacts.targetPath, sdlPlan);
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
    const sdlPlan = this.resolveSdlPlan(ref, projectFiles, 'Executable');
    const includePaths = unique([
      path.dirname(ref.absolutePath),
      ...projectFiles.filter((file) => isHeader(file.absolutePath)).map((file) => path.dirname(file.absolutePath)),
      ...config.includePaths.map((value) => resolveAgainstProject(value, ref.absolutePath)),
      ...(sdlPlan?.includeDirectories ?? [])
    ]);
    const standard = isCSource(sourcePath) ? config.cStandard : config.cppStandard;
    return [
      '-c', sourcePath,
      ...this.modeFlags(config),
      ...this.warningFlags(config),
      ...(standard && standard !== 'auto' ? [`-std=${standard}`] : []),
      ...config.defineSymbols.map((name) => `-D${name}`),
      ...includePaths.flatMap((value) => ['-I', value]),
      ...(sdlPlan?.compileFlags ?? []),
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

  private beginOutput(label: string): CpmBuildReport {
    const report: CpmBuildReport = {
      label,
      startedAt: new Date(),
      startedMs: Date.now(),
      toolRuns: 0,
      errors: [],
      warnings: [],
      notes: [],
      sourceTotal: 0,
      compileRun: 0,
      compileCached: 0,
      linkRun: 0
    };
    this.currentReport = report;
    this.diagnostics.clear();
    this.output.clear();
    this.traceOutput.clear();
    this.output.show(true);

    const detail = this.logDetail();
    this.output.appendLine('='.repeat(80));
    this.output.appendLine(` CPM BUILD  |  ${label}`);
    this.output.appendLine('='.repeat(80));
    this.output.appendLine(`  Mode      : ${this.buildMode}`);
    this.output.appendLine(`  Started   : ${formatDateTime(report.startedAt)}`);
    this.output.appendLine(`  Log detail: ${detail}`);
    this.output.appendLine('');
    this.output.appendLine('  Full compiler commands and raw tool output are available in:');
    this.output.appendLine('  Output -> C/C++ Project Manager - Build Trace');
    this.output.appendLine('');

    this.traceOutput.appendLine('='.repeat(80));
    this.traceOutput.appendLine(` CPM BUILD TRACE  |  ${label}`);
    this.traceOutput.appendLine('='.repeat(80));
    this.traceOutput.appendLine(`Mode    : ${this.buildMode}`);
    this.traceOutput.appendLine(`Started : ${formatDateTime(report.startedAt)}`);
    this.traceOutput.appendLine('');
    return report;
  }

  private finishOutput(report: CpmBuildReport, success: boolean, failedAt?: string): void {
    if (this.currentReport !== report) {
      return;
    }
    const durationMs = Date.now() - report.startedMs;
    this.output.appendLine('');
    this.output.appendLine('='.repeat(80));
    this.output.appendLine(success ? ' BUILD SUCCEEDED' : ' BUILD FAILED');
    this.output.appendLine('='.repeat(80));
    this.output.appendLine(`  Duration   : ${formatDuration(durationMs)}`);
    this.output.appendLine(`  Tool runs  : ${report.toolRuns}`);
    this.output.appendLine(`  Errors     : ${report.errors.length}`);
    this.output.appendLine(`  Warnings   : ${report.warnings.length}`);
    if (!success) {
      const firstError = report.errors[0];
      this.output.appendLine(`  Failed at  : ${failedAt || report.failedAt || 'unknown step'}`);
      if (firstError) {
        this.output.appendLine('  First error:');
        const location = formatDiagnosticLocation(firstError);
        if (location) {
          this.output.appendLine(`      ${location}`);
        }
        this.output.appendLine(`      ${firstError.message}`);
      }
      this.output.appendLine('');
      this.output.appendLine('  Next steps:');
      this.output.appendLine('    1. Fix the first ERROR block above; later diagnostics may be consequences.');
      this.output.appendLine('    2. Open View -> Problems for clickable CPM build diagnostics.');
      this.output.appendLine('    3. Use Output -> C/C++ Project Manager - Build Trace for full commands/raw output.');
    }
    this.output.appendLine('='.repeat(80));

    this.traceOutput.appendLine('');
    this.traceOutput.appendLine('='.repeat(80));
    this.traceOutput.appendLine(success ? ' BUILD TRACE ENDED: SUCCESS' : ' BUILD TRACE ENDED: FAILURE');
    this.traceOutput.appendLine(`Duration: ${formatDuration(durationMs)}`);
    this.traceOutput.appendLine('='.repeat(80));
    this.currentReport = undefined;
  }

  private appendSection(title: string): void {
    const line = `--- ${title} ${'-'.repeat(Math.max(1, 76 - title.length))}`;
    this.output.appendLine(line);
  }

  private logDetail(): CpmBuildLogDetail {
    const value = this.projectSettings.getCpmConfigurationValue<string>('buildLogDetail', 'normal');
    return value === 'compact' || value === 'normal' || value === 'verbose' ? value : 'normal';
  }

  showBuildProblems(): void {
    void vscode.commands.executeCommand('workbench.actions.view.problems');
  }

  showFullBuildTrace(): void {
    this.traceOutput.show(true);
  }

  private async spawnTool(executable: string, args: string[], cwd: string, label: string): Promise<boolean> {
    const result = await this.runTool(executable, args, cwd, label);
    return result.success;
  }

  private async runTool(executable: string, args: string[], cwd: string, label: string): Promise<ToolRunResult> {
    const launch = resolveToolLaunch(executable);
    const started = Date.now();
    const detail = this.logDetail();

    this.traceOutput.appendLine(`--- ${label} ${'-'.repeat(Math.max(1, 76 - label.length))}`);
    this.traceOutput.appendLine(`Tool             : ${executable}`);
    this.traceOutput.appendLine(`Working directory: ${cwd}`);
    if (launch.note) {
      this.traceOutput.appendLine(`Launch note      : ${launch.note}`);
    }
    if (launch.warning) {
      this.traceOutput.appendLine(`Launch warning   : ${launch.warning}`);
    }
    this.traceOutput.appendLine(`Arguments        : ${args.map(renderArgument).join(' ')}`);
    this.traceOutput.appendLine('');

    if (detail === 'verbose') {
      this.output.appendLine(`  [RUN] ${label}`);
      this.output.appendLine(`      Tool: ${executable}`);
      if (launch.note) {
        this.output.appendLine(`      ${launch.note}`);
      }
      if (launch.warning) {
        this.output.appendLine(`      ${launch.warning}`);
      }
      this.output.appendLine(`      Arguments: ${args.map(renderArgument).join(' ')}`);
      this.output.appendLine('');
    }

    return await new Promise<ToolRunResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      const child = spawn(launch.executable, args, { cwd, windowsHide: true, shell: false, env: launch.env });
      child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
      child.on('error', (error) => {
        const durationMs = Date.now() - started;
        const diagnostic: ParsedToolDiagnostic = {
          severity: 'error',
          message: `Unable to start ${executable}: ${error.message}`,
          toolLabel: label,
          rawLine: error.message,
          hint: 'Check that the compiler path exists and that the executable can be launched from VS Code.'
        };
        const result: ToolRunResult = { success: false, code: null, stdout, stderr, durationMs, diagnostics: [diagnostic] };
        this.recordToolResult(label, executable, args, cwd, result);
        vscode.window.showErrorMessage(`Unable to start ${executable}: ${error.message}`);
        resolve(result);
      });
      child.on('close', (code) => {
        const durationMs = Date.now() - started;
        const combinedOutput = `${stdout}${stdout && stderr ? '\n' : ''}${stderr}`;
        const diagnostics = parseToolDiagnostics(combinedOutput, label);
        const result: ToolRunResult = { success: code === 0, code, stdout, stderr, durationMs, diagnostics };
        this.recordToolResult(label, executable, args, cwd, result);
        if (code !== 0) {
          vscode.window.showErrorMessage(`${label} failed. Open the C/C++ Project Manager output channel for details.`);
        }
        resolve(result);
      });
    });
  }

  private recordToolResult(label: string, executable: string, args: string[], cwd: string, result: ToolRunResult): void {
    const report = this.currentReport;
    if (report) {
      report.toolRuns += 1;
      const errors = result.diagnostics.filter((item) => item.severity === 'error');
      const warnings = result.diagnostics.filter((item) => item.severity === 'warning');
      const notes = result.diagnostics.filter((item) => item.severity === 'note');
      report.errors.push(...errors);
      report.warnings.push(...warnings);
      report.notes.push(...notes);
      if (!result.success && !report.failedAt) {
        report.failedAt = label;
      }
      this.publishCurrentDiagnostics(report);
    }

    this.traceOutput.appendLine('stdout:');
    this.traceOutput.appendLine(result.stdout.trimEnd() || '  <empty>');
    this.traceOutput.appendLine('');
    this.traceOutput.appendLine('stderr:');
    this.traceOutput.appendLine(result.stderr.trimEnd() || '  <empty>');
    this.traceOutput.appendLine('');
    this.traceOutput.appendLine(`Exit code: ${String(result.code)}`);
    this.traceOutput.appendLine(`Duration : ${formatDuration(result.durationMs)}`);
    this.traceOutput.appendLine('');

    const status = result.success ? '[OK]' : '[X]';
    const detail = result.code !== 0 && result.code !== null ? `exit code ${result.code}, ${formatDuration(result.durationMs)}` : formatDuration(result.durationMs);
    const line = `  ${status} ${label}${result.success ? '' : ' FAILED'} (${detail})`;
    if (!result.success || this.logDetail() !== 'compact') {
      this.output.appendLine(line);
    }

    if (this.logDetail() === 'verbose') {
      const raw = `${result.stdout}${result.stderr}`.trimEnd();
      if (raw.length > 0) {
        this.output.appendLine('      Raw output:');
        this.output.appendLine(indentBlock(raw, '      '));
      }
    }

    if (!result.success) {
      this.renderDiagnostics(result.diagnostics, result.stdout, result.stderr);
    } else if (result.diagnostics.some((item) => item.severity === 'warning') && this.logDetail() !== 'compact') {
      this.renderDiagnostics(result.diagnostics.filter((item) => item.severity === 'warning'), result.stdout, result.stderr);
    }
  }

  private renderDiagnostics(diagnostics: ParsedToolDiagnostic[], stdout: string, stderr: string): void {
    const errors = diagnostics.filter((item) => item.severity === 'error');
    const warnings = diagnostics.filter((item) => item.severity === 'warning');
    const relevant = [...errors, ...warnings];
    if (relevant.length === 0) {
      const raw = `${stdout}${stderr}`.trim();
      if (raw.length > 0) {
        this.output.appendLine('  ------------------------------------------------------------------------------');
        this.output.appendLine('  Raw tool output excerpt:');
        this.output.appendLine(indentBlock(raw.split(/\r?\n/).slice(0, 20).join('\n'), '      '));
      }
      this.output.appendLine('');
      return;
    }

    this.output.appendLine('  ------------------------------------------------------------------------------');
    relevant.forEach((diagnostic, index) => {
      const tag = diagnostic.severity === 'warning' ? 'WARNING' : 'ERROR';
      this.output.appendLine(`  [X] ${tag} ${index + 1}/${relevant.length}`);
      const location = formatDiagnosticLocation(diagnostic);
      if (location) {
        this.output.appendLine(`      Location : ${location}`);
      }
      if (diagnostic.code) {
        this.output.appendLine(`      Code     : ${diagnostic.code}`);
      }
      this.output.appendLine(`      Message  : ${diagnostic.message}`);
      if (diagnostic.sourceLine) {
        this.output.appendLine(`      Source   : ${diagnostic.sourceLine.trim()}`);
      }
      if (diagnostic.hint) {
        this.output.appendLine('      Hint     : ' + diagnostic.hint.replace(/\n/g, '\n                 '));
      }
      this.output.appendLine('');
    });
    this.output.appendLine('  Full command and unfiltered output:');
    this.output.appendLine('  Output -> C/C++ Project Manager - Build Trace');
    this.output.appendLine('');
  }

  private publishCurrentDiagnostics(report: CpmBuildReport): void {
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const item of [...report.errors, ...report.warnings]) {
      if (!item.file) {
        continue;
      }
      const normalizedFile = normalizeRuntimePath(item.file);
      const zeroLine = Math.max(0, (item.line ?? 1) - 1);
      const zeroColumn = Math.max(0, (item.column ?? 1) - 1);
      const range = new vscode.Range(zeroLine, zeroColumn, zeroLine, Math.max(zeroColumn + 1, zeroColumn + (item.sourceLine?.trim().length ?? 1)));
      const severity = item.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
      const diagnostic = new vscode.Diagnostic(range, item.hint ? `${item.message}\n\nHint: ${item.hint}` : item.message, severity);
      diagnostic.source = 'CPM Build';
      if (item.code) {
        diagnostic.code = item.code;
      }
      const existing = byFile.get(normalizedFile) ?? [];
      existing.push(diagnostic);
      byFile.set(normalizedFile, existing);
    }
    this.diagnostics.clear();
    for (const [filePath, values] of byFile) {
      this.diagnostics.set(vscode.Uri.file(filePath), values);
    }
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
    const ref = this.workspaces.activeProjectRef;
    const project = ref?.exists ? this.workspaces.getProject(ref) : undefined;
    const sdlPlan = ref?.exists && project ? this.resolveSdlPlan(ref, project.files, project.targetType) : undefined;
    return unique([
      path.dirname(executablePath),
      ...this.toolchainBinDirectories(config),
      ...(sdlPlan?.binaryDirectory ? [sdlPlan.binaryDirectory] : []),
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

  private runtimeLinkFlags(config: GenericCompilerConfiguration, targetType: string, sdlPlan?: ReturnType<typeof createSdlBuildPlan>): string[] {
    if (config.runtimeDependencyMode !== 'static-link' || targetType === 'Static Library') {
      return [];
    }

    const flags = ['-static-libgcc', '-static-libstdc++'];
    if (!sdlPlan || sdlPlan.runtimeMode === 'static-link') {
      flags.push('-static');
    } else {
      const winpthreadStatic = this.findToolchainStaticLibrary(config, 'libwinpthread.a');
      if (winpthreadStatic) {
        flags.push('-Wl,-Bstatic', '-lwinpthread', '-Wl,-Bdynamic');
      }
    }
    this.output.appendLine(`[C/C++] Toolchain runtime handling: static-link flags ${flags.join(' ')}.`);
    return flags;
  }

  private findToolchainStaticLibrary(config: GenericCompilerConfiguration, libraryName: string): string | undefined {
    for (const binDirectory of this.toolchainBinDirectories(config)) {
      const rootDirectory = path.basename(binDirectory).toLowerCase() === 'bin' ? path.dirname(binDirectory) : binDirectory;
      const candidates = [
        path.join(rootDirectory, 'lib', libraryName),
        path.join(rootDirectory, 'x86_64-w64-mingw32', 'lib', libraryName),
        path.join(rootDirectory, 'i686-w64-mingw32', 'lib', libraryName)
      ];
      const found = candidates.find((candidate) => fs.existsSync(candidate));
      if (found) {
        return found;
      }
    }
    return undefined;
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
    if (process.platform !== 'win32') {
      return;
    }
    const targetDirectory = path.dirname(targetPath);
    if (!fs.existsSync(targetDirectory)) {
      return;
    }

    const runtimeSources = this.collectToolchainRuntimeDlls(targetPath, config);

    if (config.runtimeDependencyMode !== 'copy-dlls') {
      if (config.cleanRuntimeDllsOnDeploy) {
        this.cleanStaleRuntimeDlls(targetDirectory, new Map());
      }
      this.output.appendLine(`[C/C++] Toolchain runtime DLL deployment: disabled (${config.runtimeDependencyMode}).`);
      return;
    }

    if (config.cleanRuntimeDllsOnDeploy) {
      this.cleanStaleRuntimeDlls(targetDirectory, runtimeSources);
    }

    let copied = 0;
    let unchanged = 0;
    const deployedNames: string[] = [];
    for (const sourcePath of runtimeSources.values()) {
      const destinationPath = path.join(targetDirectory, path.basename(sourcePath));
      try {
        if (shouldCopyRuntimeDll(sourcePath, destinationPath)) {
          fs.copyFileSync(sourcePath, destinationPath);
          copied++;
        } else {
          unchanged++;
        }
        deployedNames.push(path.basename(sourcePath));
      } catch (error) {
        this.output.appendLine(`[C/C++] Warning: unable to deploy toolchain runtime DLL ${path.basename(sourcePath)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    writeRuntimeDeployManifest(targetDirectory, deployedNames);
    if (runtimeSources.size > 0) {
      this.output.appendLine(`[C/C++] Toolchain runtime DLL deployment: ${copied} copied, ${unchanged} already up to date.`);
      this.output.appendLine(`[C/C++] Toolchain runtime DLLs: ${[...runtimeSources.values()].map((value) => path.basename(value)).join(', ')}`);
    } else {
      this.output.appendLine('[C/C++] Toolchain runtime DLL deployment: no compiler/runtime DLL detected beside the selected toolchain.');
    }
  }

  private collectToolchainRuntimeDlls(targetPath: string, config: GenericCompilerConfiguration): Map<string, string> {
    const binDirectories = this.toolchainBinDirectories(config);
    const availableDlls = indexToolchainDlls(binDirectories);
    const runtimeSources = new Map<string, string>();

    const addRuntimeSource = (dllName: string): boolean => {
      const key = dllName.toLowerCase();
      if (runtimeSources.has(key) || !isToolchainRuntimeImportCandidate(dllName)) {
        return false;
      }
      const sourcePath = availableDlls.get(key);
      if (!sourcePath) {
        return false;
      }
      runtimeSources.set(key, sourcePath);
      return true;
    };

    for (const [name, sourcePath] of availableDlls) {
      if (isKnownToolchainRuntimeDllName(name)) {
        runtimeSources.set(name, sourcePath);
      }
    }

    const queue = fs.existsSync(targetPath) ? [targetPath] : [];
    const visited = new Set<string>();
    while (queue.length > 0 && visited.size < 96) {
      const current = queue.shift()!;
      const normalized = normalizeRuntimePath(current).toLowerCase();
      if (visited.has(normalized)) {
        continue;
      }
      visited.add(normalized);
      for (const importedName of readImportedDllNames(current)) {
        if (addRuntimeSource(importedName)) {
          const dependencySource = runtimeSources.get(importedName.toLowerCase());
          if (dependencySource) {
            queue.push(dependencySource);
          }
        }
      }
    }

    return runtimeSources;
  }

  private deploySdlRuntimeDlls(targetPath: string, sdlPlan: ReturnType<typeof createSdlBuildPlan> | undefined): void {
    if (!sdlPlan || sdlPlan.runtimeMode !== 'copy-dlls' || sdlPlan.runtimeDlls.length === 0) {
      return;
    }
    const targetDirectory = path.dirname(targetPath);
    let copied = 0;
    let unchanged = 0;
    for (const sourcePath of sdlPlan.runtimeDlls) {
      const destinationPath = path.join(targetDirectory, path.basename(sourcePath));
      try {
        if (shouldCopyRuntimeDll(sourcePath, destinationPath)) {
          fs.copyFileSync(sourcePath, destinationPath);
          copied++;
        } else {
          unchanged++;
        }
      } catch (error) {
        this.output.appendLine(`[C/C++ SDL] Warning: unable to deploy SDL runtime DLL ${path.basename(sourcePath)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.output.appendLine(`[C/C++ SDL] Runtime DLL deployment: ${copied} copied, ${unchanged} already up to date.`);
  }

  private resolveSdlPlan(ref: CpmWorkspaceProjectRef, files: CpmProjectFile[], targetType: string): ReturnType<typeof createSdlBuildPlan> | undefined {
    const config = this.getCompilerConfiguration();
    const preferredArchitecture = inferRequestedArchitecture(config.cppCompilerPath || config.cCompilerPath || 'g++', this.modeFlags(config))?.id;
    return createSdlBuildPlan(config.sdl, path.dirname(ref.absolutePath), files.map((file) => file.absolutePath), targetType, preferredArchitecture);
  }

  private cleanStaleRuntimeDlls(targetDirectory: string, runtimeSources: Map<string, string>): void {
    let removed = 0;
    let refreshed = 0;
    try {
      const manifestNames = readRuntimeDeployManifest(targetDirectory);
      for (const name of fs.readdirSync(targetDirectory)) {
        const lower = name.toLowerCase();
        const wasManaged = manifestNames.has(lower) || isKnownToolchainRuntimeDllName(name);
        if (!wasManaged) {
          continue;
        }
        const destinationPath = path.join(targetDirectory, name);
        const sourcePath = runtimeSources.get(lower);
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
      this.output.appendLine(`[C/C++] Warning: unable to clean deployed toolchain runtime DLLs: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (removed > 0 || refreshed > 0) {
      this.output.appendLine(`[C/C++] Toolchain runtime DLL cleanup: ${removed} stale removed, ${refreshed} architecture-mismatched removed before redeploy.`);
    }
  }

  private getCompilerConfiguration(): GenericCompilerConfiguration {
    const get = <T,>(key: string, fallback: T): T => this.projectSettings.getCpmConfigurationValue<T>(key, fallback);
    return {
      cCompilerPath: get<string>('cCompilerPath', 'gcc'),
      cppCompilerPath: get<string>('cppCompilerPath', 'g++'),
      archiverPath: get<string>('archiverPath', 'ar'),
      debuggerPath: get<string>('debuggerPath', 'gdb'),
      outputDirectory: get<string>('outputDirectory', 'build'),
      cStandard: get<string>('cStandard', 'auto'),
      cppStandard: get<string>('cppStandard', 'c++17'),
      warningLevel: get<string>('warningLevel', 'wall-extra'),
      optimizationLevel: get<string>('optimizationLevel', 'mode-default'),
      debugInformation: get<string>('debugInformation', 'mode-default'),
      architectureMode: get<string>('architectureMode', get<boolean>('useBuildModeArchitectureFlags', false) ? 'from-build-mode' : 'auto'),
      compilerFlags: get<string[]>('compilerFlags', []),
      cCompilerFlags: get<string[]>('cCompilerFlags', []),
      cppCompilerFlags: get<string[]>('cppCompilerFlags', []),
      linkerFlags: get<string[]>('linkerFlags', []),
      includePaths: get<string[]>('includePaths', []),
      libraryPaths: get<string[]>('libraryPaths', []),
      libraries: get<string[]>('libraries', []),
      defineSymbols: get<string[]>('defineSymbols', []),
      useBuildModeArchitectureFlags: get<boolean>('useBuildModeArchitectureFlags', false),
      deployRuntimeDlls: get<string>('deployRuntimeDlls', 'auto'),
      runtimeDependencyMode: normalizeRuntimeDependencyMode(get<string>('runtimeDependencyMode', ''), get<string>('deployRuntimeDlls', 'auto')),
      cleanRuntimeDllsOnDeploy: get<boolean>('cleanRuntimeDllsOnDeploy', true),
      useLocalBuildCacheForOneDrive: get<boolean>('useLocalBuildCacheForOneDrive', true),
      sdl: {
        enabled: normalizeSdlEnabled(get<string>('sdlEnabled', 'auto')),
        version: normalizeSdlVersion(get<string>('sdlVersion', 'auto')),
        rootPath: get<string>('sdlRootPath', '').trim(),
        packages: get<string[]>('sdlPackages', ['SDL2']),
        runtimeMode: normalizeSdlRuntimeMode(get<string>('sdlRuntimeMode', 'copy-dlls')),
        subsystem: normalizeSdlSubsystem(get<string>('sdlSubsystem', 'windows')),
        copyAllRuntimeDlls: get<boolean>('sdlCopyAllRuntimeDlls', true)
      }
    };
  }
}


function normalizeRuntimeDependencyMode(value: string | undefined, legacyValue: string | undefined): CpmRuntimeDependencyMode {
  if (value === 'copy-dlls' || value === 'path-only' || value === 'static-link') {
    return value;
  }
  if (legacyValue === 'never') {
    return 'path-only';
  }
  if (legacyValue === 'static-link') {
    return 'static-link';
  }
  return 'copy-dlls';
}

function normalizeSdlEnabled(value: string | undefined): CpmSdlConfiguration['enabled'] {
  return value === 'on' || value === 'off' || value === 'auto' ? value : 'auto';
}

function normalizeSdlVersion(value: string | undefined): CpmSdlConfiguration['version'] {
  return value === 'SDL2' || value === 'SDL3' || value === 'auto' ? value : 'auto';
}

function normalizeSdlRuntimeMode(value: string | undefined): CpmSdlConfiguration['runtimeMode'] {
  return value === 'copy-dlls' || value === 'path-only' || value === 'static-link' ? value : 'copy-dlls';
}

function normalizeSdlSubsystem(value: string | undefined): CpmSdlConfiguration['subsystem'] {
  return value === 'console' || value === 'windows' ? value : 'windows';
}



function formatDateTime(date: Date): string {
  return date.toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatDurationWithComma(ms: number): string {
  return `, ${formatDuration(ms)}`;
}

function indentBlock(text: string, prefix: string): string {
  return text.split(/\r?\n/).map((line) => `${prefix}${line}`).join('\n');
}

function formatDiagnosticLocation(diagnostic: ParsedToolDiagnostic): string {
  if (!diagnostic.file) {
    return '';
  }
  if (diagnostic.line !== undefined && diagnostic.column !== undefined) {
    return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`;
  }
  if (diagnostic.line !== undefined) {
    return `${diagnostic.file}:${diagnostic.line}`;
  }
  return diagnostic.file;
}

function parseToolDiagnostics(output: string, toolLabel: string): ParsedToolDiagnostic[] {
  const diagnostics: ParsedToolDiagnostic[] = [];
  const lines = output.split(/\r?\n/);
  const gccLocation = /^(.+?):(\d+):(\d+):\s*(fatal error|error|warning|note):\s*(.+)$/;
  const gccLocationNoColumn = /^(.+?):(\d+):\s*(fatal error|error|warning|note):\s*(.+)$/;
  const msvcLocation = /^(.+?)\((\d+)(?:,(\d+))?\):\s*(fatal error|error|warning)\s*([A-Z]+\d+)?\s*:\s*(.+)$/;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    let match = line.match(gccLocation);
    if (match) {
      const message = match[5].trim();
      diagnostics.push({
        severity: normalizeSeverity(match[4]),
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        message,
        sourceLine: findLikelySourceLine(lines, index + 1),
        hint: hintForDiagnostic(message),
        toolLabel,
        rawLine: line
      });
      continue;
    }
    match = line.match(gccLocationNoColumn);
    if (match) {
      const message = match[4].trim();
      diagnostics.push({
        severity: normalizeSeverity(match[3]),
        file: match[1],
        line: Number(match[2]),
        message,
        sourceLine: findLikelySourceLine(lines, index + 1),
        hint: hintForDiagnostic(message),
        toolLabel,
        rawLine: line
      });
      continue;
    }
    match = line.match(msvcLocation);
    if (match) {
      const message = match[6].trim();
      diagnostics.push({
        severity: normalizeSeverity(match[4]),
        file: match[1],
        line: Number(match[2]),
        column: match[3] ? Number(match[3]) : undefined,
        code: match[5]?.trim(),
        message,
        sourceLine: findLikelySourceLine(lines, index + 1),
        hint: hintForDiagnostic(message),
        toolLabel,
        rawLine: line
      });
      continue;
    }

    const linkerDiagnostic = parseLinkerDiagnostic(line, toolLabel);
    if (linkerDiagnostic) {
      diagnostics.push(linkerDiagnostic);
    }
  }

  return coalesceDiagnostics(diagnostics);
}

function normalizeSeverity(value: string): ParsedToolDiagnostic['severity'] {
  if (/warning/i.test(value)) {
    return 'warning';
  }
  if (/note/i.test(value)) {
    return 'note';
  }
  return 'error';
}

function findLikelySourceLine(lines: string[], start: number): string | undefined {
  for (let index = start; index < Math.min(lines.length, start + 3); index++) {
    const candidate = lines[index]?.trimEnd();
    if (!candidate || /^\s*\^/.test(candidate) || /^\s*~/.test(candidate)) {
      continue;
    }
    if (/^(?:In file included from|from )/.test(candidate)) {
      continue;
    }
    if (/^.+?:\d+(:\d+)?:\s*(fatal error|error|warning|note):/.test(candidate)) {
      continue;
    }
    return candidate;
  }
  return undefined;
}

function parseLinkerDiagnostic(line: string, toolLabel: string): ParsedToolDiagnostic | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }
  const patterns: Array<{ regex: RegExp; message?: (match: RegExpMatchArray) => string }> = [
    { regex: /undefined reference to [`'](.+?)[`']/i, message: (match) => `undefined reference to ${match[1]}` },
    { regex: /cannot find\s+(-l\S+)/i, message: (match) => `cannot find ${match[1]}` },
    { regex: /multiple definition of [`'](.+?)[`']/i, message: (match) => `multiple definition of ${match[1]}` },
    { regex: /ld(?:\.exe)?:\s+cannot find\s+(.+)/i, message: (match) => `cannot find ${match[1]}` },
    { regex: /collect2(?:\.exe)?: error: ld returned \d+ exit status/i }
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern.regex);
    if (match) {
      const message = pattern.message ? pattern.message(match) : trimmed;
      return {
        severity: 'error',
        message,
        hint: hintForDiagnostic(message),
        toolLabel,
        rawLine: line
      };
    }
  }
  return undefined;
}

function hintForDiagnostic(message: string): string | undefined {
  const lower = message.toLowerCase();
  if (lower.includes('not declared in this scope') || lower.includes('undeclared identifier')) {
    return 'The identifier is used without a visible declaration. Check the variable name, include the declaring header, or use the correct object/member scope.';
  }
  if (lower.includes('incomplete type')) {
    return 'A forward declaration is visible but the complete type is required here. Include the full header defining the type.';
  }
  if (lower.includes('no matching function for call') || lower.includes('no instance of overloaded function')) {
    return 'The call does not match any available overload. Check argument count, constness, pointer/reference usage and implicit conversions.';
  }
  if (lower.includes('undefined reference')) {
    return 'This is a linker error. Add the source/object/library that defines the symbol, or add the missing library in Project Build Settings.';
  }
  if (lower.includes('cannot find -l')) {
    return 'The linker cannot locate the requested library. Check library paths, architecture x86/x64, and the library name without the lib prefix or extension.';
  }
  if (lower.includes('no such file or directory') || lower.includes('cannot open include file')) {
    return 'A header or file path is missing. Check include paths, generated files and external SDK installation paths.';
  }
  if (lower.includes('multiple definition')) {
    return 'The same symbol is defined in more than one translation unit. Move definitions to one .c/.cpp file, or mark header-only definitions inline/static where appropriate.';
  }
  if (lower.includes('winmain@16') || lower.includes('undefined reference to winmain')) {
    return 'The Windows subsystem expects WinMain. For SDL2, ensure SDL2main/SDL2 are linked; otherwise use a console subsystem or provide the expected entry point.';
  }
  return undefined;
}

function coalesceDiagnostics(diagnostics: ParsedToolDiagnostic[]): ParsedToolDiagnostic[] {
  const seen = new Set<string>();
  const result: ParsedToolDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = [diagnostic.severity, diagnostic.file ?? '', diagnostic.line ?? '', diagnostic.column ?? '', diagnostic.message].join('|');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
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

const RUNTIME_DEPLOY_MANIFEST = '.cpm-runtime-dlls.json';

function indexToolchainDlls(binDirectories: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const binDirectory of binDirectories) {
    try {
      for (const name of fs.readdirSync(binDirectory)) {
        if (!/\.dll$/i.test(name)) {
          continue;
        }
        const key = name.toLowerCase();
        if (!result.has(key)) {
          result.set(key, path.join(binDirectory, name));
        }
      }
    } catch {
      // Ignore unreadable toolchain directories.
    }
  }
  return result;
}

function isKnownToolchainRuntimeDllName(name: string): boolean {
  const lower = name.toLowerCase();
  return /^libgcc_s_.*\.dll$/.test(lower)
    || lower === 'libstdc++-6.dll'
    || lower === 'libwinpthread-1.dll'
    || lower === 'libgomp-1.dll'
    || lower === 'libquadmath-0.dll'
    || lower === 'libssp-0.dll'
    || lower === 'libatomic-1.dll'
    || /^libgfortran-.*\.dll$/.test(lower)
    || lower === 'libc++.dll'
    || lower === 'libc++abi.dll'
    || lower === 'libunwind.dll'
    || lower === 'libomp.dll'
    || lower === 'libiomp5md.dll'
    || /^clang_rt\..*\.dll$/.test(lower)
    || lower === 'msys-2.0.dll'
    || /^msys-gcc_s_.*\.dll$/.test(lower)
    || lower === 'msys-stdc++-6.dll'
    || lower === 'msys-winpthread-1.dll';
}

function isToolchainRuntimeImportCandidate(name: string): boolean {
  const lower = path.basename(name).toLowerCase();
  if (!/\.dll$/.test(lower)) {
    return false;
  }
  if (/^(?:api-ms-win-|ext-ms-)/.test(lower)) {
    return false;
  }
  return !WINDOWS_SYSTEM_DLLS.has(lower);
}

const WINDOWS_SYSTEM_DLLS = new Set([
  'advapi32.dll', 'bcrypt.dll', 'cfgmgr32.dll', 'combase.dll', 'comctl32.dll', 'comdlg32.dll',
  'crypt32.dll', 'dwmapi.dll', 'gdi32.dll', 'gdi32full.dll', 'imm32.dll', 'iphlpapi.dll',
  'kernel32.dll', 'msvcrt.dll', 'netapi32.dll', 'ntdll.dll', 'ole32.dll', 'oleaut32.dll',
  'rpcrt4.dll', 'secur32.dll', 'setupapi.dll', 'shell32.dll', 'shlwapi.dll', 'ucrtbase.dll',
  'user32.dll', 'userenv.dll', 'version.dll', 'winhttp.dll', 'wininet.dll', 'winmm.dll',
  'winspool.drv', 'ws2_32.dll'
]);

function readRuntimeDeployManifest(targetDirectory: string): Set<string> {
  const manifestPath = path.join(targetDirectory, RUNTIME_DEPLOY_MANIFEST);
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { dlls?: string[] };
    return new Set((parsed.dlls ?? []).map((name) => path.basename(name).toLowerCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeRuntimeDeployManifest(targetDirectory: string, dllNames: string[]): void {
  const manifestPath = path.join(targetDirectory, RUNTIME_DEPLOY_MANIFEST);
  const normalized = unique(dllNames.map((name) => path.basename(name))).sort((a, b) => a.localeCompare(b));
  try {
    if (normalized.length === 0) {
      fs.rmSync(manifestPath, { force: true });
      return;
    }
    fs.writeFileSync(manifestPath, `${JSON.stringify({ generatedBy: 'cpm', dlls: normalized }, null, 2)}
`, 'utf8');
  } catch {
    // Manifest is a cleanup aid only. Runtime deployment must not fail because of it.
  }
}

function readImportedDllNames(filePath: string): string[] {
  const fromPe = readPeImportedDllNames(filePath);
  if (fromPe.length > 0) {
    return fromPe;
  }
  return readImportedDllNamesWithObjdump(filePath);
}

function readPeImportedDllNames(filePath: string): string[] {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 0x100 || buffer.toString('ascii', 0, 2) !== 'MZ') {
      return [];
    }
    const peOffset = buffer.readUInt32LE(0x3c);
    if (peOffset <= 0 || peOffset + 24 > buffer.length || buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\u0000\u0000') {
      return [];
    }
    const sectionCount = buffer.readUInt16LE(peOffset + 6);
    const optionalHeaderSize = buffer.readUInt16LE(peOffset + 20);
    const optionalHeaderOffset = peOffset + 24;
    if (optionalHeaderOffset + optionalHeaderSize > buffer.length) {
      return [];
    }
    const magic = buffer.readUInt16LE(optionalHeaderOffset);
    const dataDirectoryOffset = magic === 0x20b ? optionalHeaderOffset + 0x70 : optionalHeaderOffset + 0x60;
    if (dataDirectoryOffset + 16 > optionalHeaderOffset + optionalHeaderSize) {
      return [];
    }
    const importRva = buffer.readUInt32LE(dataDirectoryOffset + 8);
    if (importRva === 0) {
      return [];
    }
    const sections = [] as Array<{ virtualAddress: number; virtualSize: number; rawSize: number; rawPointer: number }>;
    const sectionOffset = optionalHeaderOffset + optionalHeaderSize;
    for (let index = 0; index < sectionCount; index++) {
      const offset = sectionOffset + index * 40;
      if (offset + 40 > buffer.length) {
        break;
      }
      sections.push({
        virtualSize: buffer.readUInt32LE(offset + 8),
        virtualAddress: buffer.readUInt32LE(offset + 12),
        rawSize: buffer.readUInt32LE(offset + 16),
        rawPointer: buffer.readUInt32LE(offset + 20)
      });
    }
    const rvaToOffset = (rva: number): number | undefined => {
      for (const section of sections) {
        const size = Math.max(section.virtualSize, section.rawSize);
        if (rva >= section.virtualAddress && rva < section.virtualAddress + size) {
          return section.rawPointer + (rva - section.virtualAddress);
        }
      }
      return undefined;
    };
    const readCString = (offset: number): string => {
      let end = offset;
      while (end < buffer.length && buffer[end] !== 0) {
        end++;
      }
      return buffer.toString('ascii', offset, end).trim();
    };
    const importOffset = rvaToOffset(importRva);
    if (importOffset === undefined) {
      return [];
    }
    const names: string[] = [];
    for (let offset = importOffset; offset + 20 <= buffer.length; offset += 20) {
      const originalFirstThunk = buffer.readUInt32LE(offset);
      const nameRva = buffer.readUInt32LE(offset + 12);
      const firstThunk = buffer.readUInt32LE(offset + 16);
      if (originalFirstThunk === 0 && nameRva === 0 && firstThunk === 0) {
        break;
      }
      const nameOffset = rvaToOffset(nameRva);
      if (nameOffset !== undefined) {
        const name = readCString(nameOffset);
        if (name) {
          names.push(name);
        }
      }
    }
    return unique(names);
  } catch {
    return [];
  }
}

function readImportedDllNamesWithObjdump(filePath: string): string[] {
  const tools = unique([
    path.join(path.dirname(filePath), 'objdump.exe'),
    path.join(path.dirname(filePath), 'llvm-objdump.exe'),
    resolveExecutableFromPath('objdump'),
    resolveExecutableFromPath('llvm-objdump')
  ]).filter((candidate) => fs.existsSync(candidate));
  for (const tool of tools) {
    try {
      const output = execFileSync(tool, ['-p', filePath], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      const matches = [...output.matchAll(/DLL Name:\s*([^\r\n]+)/gi)].map((match) => match[1].trim()).filter(Boolean);
      if (matches.length > 0) {
        return unique(matches);
      }
    } catch {
      // Try the next tool.
    }
  }
  return [];
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
