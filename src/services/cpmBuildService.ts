import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync, spawn } from 'child_process';
import * as vscode from 'vscode';
import { CpmBuildMode, CpmProjectFile, CpmWorkspaceProjectRef } from '../model/types';
import { CpmNativeTargetSettings, CpmParser } from '../model/cpmParser';
import { CpmWorkspaceService } from './cpmWorkspaceService';
import { CpmLinkageMode, CpmProjectSettingsService } from './cpmProjectSettingsService';
import { normalizeRuntimePath } from '../utils/pathUtils';
import { CpmSdlConfiguration, createSdlBuildPlan } from './cpmSdlService';
import { createGnuResponseFileArguments, estimateGnuArgumentLength, shouldUseGnuResponseFile } from './cpmGnuResponseFile';
import { cleanCpmBuildDirectory, removePathWithRetries } from './cpmBuildCleanup';
import { CpmDependencyService } from './cpmDependencyService';
import { CpmCMakeService } from './cpmCMakeService';
import { emptyDependencyIntegration } from './cpmDependencyModel';

type CpmRuntimeDependencyMode = 'copy-dlls' | 'path-only' | 'static-link';

type CpmBuildLogDetail = 'compact' | 'normal' | 'verbose';
type CpmRunOutputMode = 'integrated-terminal' | 'output-channel' | 'detached';

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

interface ApplicationIconGeneration {
  success: boolean;
  forceIncludeHeader?: string;
  generatedSource?: string;
}

export interface CpmBuildHealthSnapshot {
  buildMode: CpmBuildMode;
  linkageMode: CpmLinkageMode;
  targetPath: string;
  targetExists: boolean;
  objectDirectory: string;
  cCompilerPath: string;
  cppCompilerPath: string;
  archiverPath: string;
  debuggerPath: string;
  outputDirectory: string;
  architectureMode: string;
  includePaths: string[];
  libraryPaths: string[];
  libraries: string[];
  parallelJobs: number;
  useResponseFiles: boolean;
  precompiledHeadersEnabled: boolean;
  cPrecompiledHeader: string;
  cppPrecompiledHeader: string;
  unityBuildEnabled: boolean;
  unityBatchSize: number;
  externalRuntimeDlls: string[];
  systemRuntimeDlls: string[];
  buildBackend: 'direct' | 'cmake';
  cmakeGenerator?: string;
  cmakeTarget?: string;
  cmakeBuildDirectory?: string;
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
    private readonly programOutput: vscode.OutputChannel,
    private readonly diagnostics: vscode.DiagnosticCollection,
    private readonly dependencies?: CpmDependencyService,
    private readonly cmake?: CpmCMakeService
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
      { label: '$(play) Run', value: 'runOnly', description: 'Launch the existing executable target or configured DLL host without building' },
      { label: '$(debug-alt) Debug', value: 'debugOnly', description: 'Start a VS Code C/C++ debugger session with the existing binary, without building' },
      { label: '$(run-all) Build & Run', value: 'buildRun', description: 'Build the active target, then launch the executable or configured DLL host' },
      { label: '$(debug-alt) Build & Debug', value: 'debug', description: 'Build the active target, then start a VS Code C/C++ debugger session' }
    ], { title: 'C/C++ run action' });
    if (!selected) {
      return;
    }
    if (selected.value === 'runOnly') {
      await this.runWithoutBuild(projectRef);
    } else if (selected.value === 'debugOnly') {
      await this.debugWithoutBuild(projectRef);
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


  getHealthSnapshot(projectRef?: CpmWorkspaceProjectRef): CpmBuildHealthSnapshot | undefined {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) return undefined;
    const project = this.workspaces.getProject(ref);
    if (!project) return undefined;
    const config = this.getCompilerConfiguration();
    const artifacts = this.resolveArtifacts(ref, project.targetType);
    const settings = this.projectSettings.getSettings(ref);
    let imported: string[] = [];
    const settingsForHealth = this.projectSettings.getSettings(ref);
    const healthTargetPath = settingsForHealth.buildBackend === 'cmake' ? (this.cmake?.resolveArtifact(ref, project.targetType) ?? artifacts.targetPath) : artifacts.targetPath;
    if (project.targetType !== 'Static Library' && fs.existsSync(healthTargetPath) && process.platform === 'win32') {
      imported = unique(readImportedDllNames(healthTargetPath)).sort((a, b) => a.localeCompare(b));
    }
    const projectSettings = this.projectSettings.getSettings(ref);
    const cmakeHealth = projectSettings.buildBackend === 'cmake' ? this.cmake?.getHealthSnapshot(ref) : undefined;
    const effectiveTarget = projectSettings.buildBackend === 'cmake' ? (cmakeHealth?.resolvedArtifact ?? artifacts.targetPath) : artifacts.targetPath;
    return {
      buildMode: this.buildMode,
      linkageMode: this.getLinkageMode(ref),
      targetPath: effectiveTarget,
      targetExists: fs.existsSync(effectiveTarget),
      objectDirectory: artifacts.objectDirectory,
      cCompilerPath: config.cCompilerPath,
      cppCompilerPath: config.cppCompilerPath,
      archiverPath: config.archiverPath,
      debuggerPath: config.debuggerPath,
      outputDirectory: config.outputDirectory,
      architectureMode: config.architectureMode,
      includePaths: [...config.includePaths],
      libraryPaths: [...config.libraryPaths],
      libraries: [...config.libraries],
      parallelJobs: settings.parallelJobs,
      useResponseFiles: settings.useResponseFiles,
      precompiledHeadersEnabled: settings.precompiledHeadersEnabled,
      cPrecompiledHeader: settings.cPrecompiledHeader,
      cppPrecompiledHeader: settings.cppPrecompiledHeader,
      unityBuildEnabled: settings.unityBuildEnabled,
      unityBatchSize: settings.unityBatchSize,
      externalRuntimeDlls: imported.filter((name) => !isWindowsSystemImport(name)),
      systemRuntimeDlls: imported.filter((name) => isWindowsSystemImport(name)),
      buildBackend: projectSettings.buildBackend,
      cmakeGenerator: cmakeHealth?.activeGenerator ?? cmakeHealth?.configuredGenerator,
      cmakeTarget: cmakeHealth?.selectedTarget,
      cmakeBuildDirectory: cmakeHealth?.buildDirectory
    };
  }

  getLinkageMode(projectRef?: CpmWorkspaceProjectRef): CpmLinkageMode {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) return 'dynamic';
    return this.projectSettings.getSettings(ref).linkageMode;
  }

  async selectLinkageMode(projectRef?: CpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing active C/C++ project is available to configure linkage.');
      return;
    }
    const project = this.workspaces.getProject(ref);
    if (project?.targetType === 'Static Library') {
      vscode.window.showInformationMessage('Linkage mode applies to executable and DLL targets. A static-library target is already archived as .a.');
      return;
    }
    const current = this.getLinkageMode(ref);
    const selected = await vscode.window.showQuickPick([
      {
        label: '$(debug-disconnect) Dynamic',
        value: 'dynamic' as CpmLinkageMode,
        description: 'Normal dynamic runtime/dependency linkage',
        detail: 'Compiler and third-party DLLs may be copied beside the target or resolved through PATH.'
      },
      {
        label: '$(package) Static compiler runtime',
        value: 'static-runtime' as CpmLinkageMode,
        description: 'Embed GCC/MinGW runtime where possible',
        detail: 'Adds -static-libgcc/-static-libstdc++ while leaving third-party libraries such as SDL dynamic unless configured otherwise.'
      },
      {
        label: '$(archive) Fully static when available',
        value: 'static' as CpmLinkageMode,
        description: 'Prefer .a libraries and remove non-system DLL dependencies',
        detail: 'Adds -static and static compiler-runtime flags. SDL is forced to static linkage. Libraries without static archives will make the link fail or remain reported as external dependencies.'
      }
    ], {
      title: `Linkage mode — ${ref.name}`,
      placeHolder: `Current: ${linkageModeLabel(current)}`
    });
    if (!selected) return;
    const settings = this.projectSettings.getSettings(ref);
    settings.linkageMode = selected.value;
    this.projectSettings.setSettings(ref, settings);
    this.output.appendLine(`[C/C++] Linkage mode for ${ref.name}: ${selected.value}`);
    vscode.window.showInformationMessage(`${ref.name}: linkage mode set to ${linkageModeLabel(selected.value)}.`);
    this.workspaces.refresh();
  }

  async inspectRuntimeDependencies(projectRef?: CpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing active C/C++ project is available for dependency inspection.');
      return;
    }
    const project = this.workspaces.getProject(ref);
    if (!project || project.targetType === 'Static Library') {
      vscode.window.showInformationMessage('Runtime DLL inspection applies to executable and DLL targets.');
      return;
    }
    const targetPath = this.resolveTargetPath(ref, project.targetType);
    if (!fs.existsSync(targetPath)) {
      vscode.window.showErrorMessage(`Built target not found: ${targetPath}`);
      return;
    }
    this.reportRuntimeDependencies(targetPath, this.getLinkageMode(ref), true);
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
        if (this.dependencies && !await this.dependencies.prepareForBuild(item)) {
          failedAt = `Dependency synchronization — ${item.name}`;
          return false;
        }
        if (!await this.projectSettings.runActions(settings.preBuildActions, `Pre-build actions — ${item.name}`, cwd)) {
          failedAt = `Pre-build actions — ${item.name}`;
          return false;
        }
        if (!await this.projectSettings.runActions(settings.customBuildActions, `Custom build actions — ${item.name}`, cwd)) {
          failedAt = `Custom build actions — ${item.name}`;
          return false;
        }
        const itemSuccess = settings.buildBackend === 'cmake'
          ? await (this.cmake?.build(item, rebuild) ?? Promise.resolve(false))
          : await this.buildOneProject(item, rebuild);
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
    if (this.projectSettings.getSettings(ref).buildBackend === 'cmake') {
      const ok = await (this.cmake?.clean(ref) ?? Promise.resolve(false));
      this.finishOutput(report, ok, ok ? '' : 'CMake clean');
      if (ok) vscode.window.showInformationMessage(`CMake clean completed for ${ref.name}.`);
      return;
    }
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
      if (await removePathWithRetries(candidate)) {
        this.output.appendLine(`[C/C++] Deleted: ${candidate}`);
        removed += 1;
      } else {
        this.output.appendLine(`[C/C++] Unable to delete locked generated file: ${candidate}`);
      }
    }
    const modeDirectory = path.dirname(artifacts.objectDirectory);
    if (fs.existsSync(modeDirectory)) {
      const cleanResult = await cleanCpmBuildDirectory(modeDirectory);
      cleanResult.warnings.forEach((warning) => this.output.appendLine(`[C/C++] Warning: ${warning}`));
      if (cleanResult.success) {
        this.output.appendLine(`[C/C++] Deleted build-mode directory (${cleanResult.strategy}): ${modeDirectory}`);
        removed += 1;
      } else {
        this.output.appendLine(`[C/C++] Unable to completely clean build-mode directory: ${modeDirectory}`);
      }
    }
    const fallbackObjectDirectory = this.resolveLocalObjectDirectory(ref, this.getCompilerConfiguration());
    if (fallbackObjectDirectory) {
      const fallbackModeDirectory = path.dirname(fallbackObjectDirectory);
      if (fs.existsSync(fallbackModeDirectory)) {
        const cleanResult = await cleanCpmBuildDirectory(fallbackModeDirectory);
        cleanResult.warnings.forEach((warning) => this.output.appendLine(`[C/C++] Warning: ${warning}`));
        if (cleanResult.success) {
          this.output.appendLine(`[C/C++] Deleted local build-mode directory (${cleanResult.strategy}): ${fallbackModeDirectory}`);
          removed += 1;
        } else {
          this.output.appendLine(`[C/C++] Unable to completely clean local build-mode directory: ${fallbackModeDirectory}`);
        }
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
    if (this.projectSettings.getSettings(ref).buildBackend === 'cmake') {
      vscode.window.showInformationMessage('Compile File is managed by the CMake backend. Use Build to let CMake/Ninja rebuild the affected translation unit.');
      return false;
    }
    if (!fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`Source file not found: ${filePath}`);
      return false;
    }
    const report = this.beginOutput(`Compile ${path.basename(filePath)}`);
    if (this.dependencies && !await this.dependencies.prepareForBuild(ref)) {
      this.finishOutput(report, false, `Dependency synchronization — ${ref.name}`);
      return false;
    }
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
    await this.runWithoutBuild(projectRef);
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
    const targetType = project?.targetType ?? 'Unknown';
    if (targetType === 'Static Library') {
      vscode.window.showErrorMessage('A static library cannot be run. Select an executable project, or use a DLL project with a Program name host executable.');
      return;
    }
    if (targetType !== 'Executable' && targetType !== 'Dynamic Link Library') {
      vscode.window.showErrorMessage(`Unsupported run target type: ${targetType}.`);
      return;
    }

    const run = this.projectSettings.getSettings(ref).run;
    const targetPath = this.resolveTargetPath(ref, targetType);
    const useExternalHost = targetType === 'Dynamic Link Library';
    let rawExecutablePath: string | undefined;
    if (useExternalHost) {
      rawExecutablePath = run.externalProcessPath.trim();
      if (!rawExecutablePath) {
        const action = await vscode.window.showErrorMessage(
          'This project builds a DLL, so the DLL cannot be launched directly. Configure Program name with the executable that loads the DLL.',
          'Open Run Settings'
        );
        if (action === 'Open Run Settings') {
          await vscode.commands.executeCommand('cpm.editBuildSettings', { kind: 'project', ref });
        }
        return;
      }
    } else {
      rawExecutablePath = targetPath;
      if (!rawExecutablePath) {
        vscode.window.showErrorMessage(`The executable target for ${ref.name} could not be resolved.`);
        return;
      }
    }

    const projectDirectory = path.dirname(ref.absolutePath);
    const executablePath = this.resolveRuntimeReference(rawExecutablePath, projectDirectory);
    if (path.extname(executablePath).toLowerCase() !== '.exe') {
      vscode.window.showErrorMessage(useExternalHost
        ? `Program name must point to an executable (.exe). Current value: ${executablePath}`
        : `The built target is ${path.basename(executablePath)}, not an executable.`);
      return;
    }
    if (!fs.existsSync(executablePath)) {
      vscode.window.showErrorMessage(useExternalHost
        ? `The Program name executable configured for this DLL project does not exist: ${executablePath}`
        : `The executable does not exist: ${executablePath}. Use Build and Run to create the target before launching it.`);
      return;
    }
    try {
      if (!fs.statSync(executablePath).isFile()) {
        vscode.window.showErrorMessage(`The configured executable path is not a regular file: ${executablePath}`);
        return;
      }
    } catch (error) {
      vscode.window.showErrorMessage(`The executable cannot be accessed: ${executablePath}. ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const fallbackArgs = this.projectSettings.getCpmConfigurationValue<string[]>('runArguments', []);
    const args = run.arguments.trim() ? this.projectSettings.parseArguments(run.arguments) : fallbackArgs;
    const configuredCwd = run.workingDirectory.trim();
    const cwd = configuredCwd ? this.resolveRuntimeReference(configuredCwd, projectDirectory) : path.dirname(executablePath);
    if (!fs.existsSync(cwd)) {
      vscode.window.showErrorMessage(`The configured working directory does not exist: ${cwd}`);
      return;
    }
    try {
      if (!fs.statSync(cwd).isDirectory()) {
        vscode.window.showErrorMessage(`The configured working directory is not a directory: ${cwd}`);
        return;
      }
    } catch (error) {
      vscode.window.showErrorMessage(`The configured working directory cannot be accessed: ${cwd}. ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const config = this.getCompilerConfiguration();
    if (targetPath && fs.existsSync(targetPath)) {
      const linkageMode = this.getLinkageMode(ref);
      this.deployToolchainRuntimeDlls(targetPath, config, linkageMode);
      const sdlPlan = project ? this.resolveSdlPlan(ref, project.files, project.targetType, linkageMode) : undefined;
      this.deploySdlRuntimeDlls(targetPath, sdlPlan, linkageMode);
      this.deployApplicationIconAssets(ref, targetPath, this.parser.getNativeTargetSettings(ref.absolutePath, this.buildMode));
    }
    const env = this.createRuntimeEnvironment(this.projectSettings.parseEnvironment(run.environmentOptions), config, executablePath, targetPath);
    const outputMode = normalizeRunOutputMode(this.projectSettings.getCpmConfigurationValue<string>('runOutputMode', 'integrated-terminal'));
    const renderedCommand = [executablePath, ...args].map(renderArgument).join(' ');

    if (outputMode === 'integrated-terminal') {
      const terminal = vscode.window.createTerminal({ name: `CPM: ${ref.name}`, shellPath: executablePath, shellArgs: args, cwd, env });
      terminal.show(false);
      this.output.appendLine(`[C/C++] Started in integrated terminal: ${renderedCommand}`);
    } else if (outputMode === 'output-channel') {
      this.programOutput.clear();
      this.programOutput.appendLine(`=== ${ref.name} ===`);
      this.programOutput.appendLine(`> ${renderedCommand}`);
      this.programOutput.appendLine(`Working directory: ${cwd}`);
      this.programOutput.appendLine('');
      this.programOutput.show(true);
      const child = spawn(executablePath, args, { cwd, env, detached: false, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout?.on('data', (data: Buffer) => this.programOutput.append(data.toString()));
      child.stderr?.on('data', (data: Buffer) => this.programOutput.append(data.toString()));
      child.on('error', (error) => this.programOutput.appendLine(`\n[CPM] Failed to start process: ${error.message}`));
      child.on('close', (code, signal) => this.programOutput.appendLine(`\n[CPM] Process finished (${signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`}).`));
      this.output.appendLine(`[C/C++] Started with captured output: ${renderedCommand}`);
    } else {
      const child = spawn(executablePath, args, { cwd, env, detached: true, shell: false, stdio: 'ignore' });
      child.once('error', (error) => void vscode.window.showErrorMessage(`Unable to start ${executablePath}: ${error.message}`));
      child.unref();
      this.output.appendLine(`[C/C++] Started detached: ${renderedCommand}`);
    }
    this.output.appendLine(`[C/C++] Runtime PATH prepended with: ${this.runtimeSearchDirectories(config, executablePath, targetPath).join(path.delimiter)}`);
  }

  async debugWithGdb(projectRef?: CpmWorkspaceProjectRef): Promise<boolean> {
    return this.startGdbDebug(projectRef, true);
  }

  async debugWithoutBuild(projectRef?: CpmWorkspaceProjectRef): Promise<boolean> {
    return this.startGdbDebug(projectRef, false);
  }

  private async startGdbDebug(projectRef: CpmWorkspaceProjectRef | undefined, buildFirst: boolean): Promise<boolean> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing C/C++ project is available for debugging.');
      return false;
    }
    const project = this.workspaces.getProject(ref);
    const targetType = project?.targetType ?? 'Unknown';
    if (targetType === 'Static Library') {
      vscode.window.showErrorMessage('A static library cannot be debug-launched. Select an executable project, or configure a DLL host Program name.');
      return false;
    }
    if (targetType !== 'Executable' && targetType !== 'Dynamic Link Library') {
      vscode.window.showErrorMessage(`Unsupported debug target type: ${targetType}.`);
      return false;
    }
    if (buildFirst && (this.buildMode === 'release' || this.buildMode === 'release64')) {
      const debugMode: CpmBuildMode = this.buildMode === 'release64' ? 'debug64' : 'debug';
      const answer = await vscode.window.showWarningMessage(`The active build mode is ${this.buildMode}. Switch to ${debugMode}, build and debug?`, 'Switch, build and debug', 'Continue current mode', 'Cancel');
      if (answer === 'Cancel' || !answer) return false;
      if (answer === 'Switch, build and debug') await this.projectSettings.updateCpmConfigurationValue('buildMode', debugMode);
    }
    if (buildFirst) {
      const success = await this.build(false, ref);
      if (!success) return false;
    }

    const builtTargetPath = this.resolveTargetPath(ref, targetType);
    if (!buildFirst && (!builtTargetPath || !fs.existsSync(builtTargetPath))) {
      const action = await vscode.window.showErrorMessage(`No existing ${targetType === 'Dynamic Link Library' ? 'DLL' : 'executable'} was found for ${this.buildMode}. Build the project first, or use Build & Debug.`, 'Build & Debug');
      if (action === 'Build & Debug') return this.startGdbDebug(ref, true);
      return false;
    }
    const runSettings = this.projectSettings.getSettings(ref).run;
    const projectDirectory = path.dirname(ref.absolutePath);
    let program = builtTargetPath;
    if (targetType === 'Dynamic Link Library') {
      if (!runSettings.externalProcessPath.trim()) {
        const action = await vscode.window.showErrorMessage(
          'This project builds a DLL. Configure Program name with the executable that loads the DLL before starting a debug session.',
          'Open Run Settings'
        );
        if (action === 'Open Run Settings') await vscode.commands.executeCommand('cpm.editBuildSettings', { kind: 'project', ref });
        return false;
      }
      program = this.resolveRuntimeReference(runSettings.externalProcessPath, projectDirectory);
    }
    if (!program || !fs.existsSync(program)) {
      vscode.window.showErrorMessage(`Debug host not found: ${program || ref.name}`);
      return false;
    }
    if (path.extname(program).toLowerCase() !== '.exe') {
      vscode.window.showErrorMessage(`Debug Program name must point to an executable (.exe): ${program}`);
      return false;
    }
    try {
      if (!fs.statSync(program).isFile()) {
        vscode.window.showErrorMessage(`The debug Program name is not a regular file: ${program}`);
        return false;
      }
    } catch (error) {
      vscode.window.showErrorMessage(`The debug Program name cannot be accessed: ${program}. ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }

    const config = this.getCompilerConfiguration();
    if (builtTargetPath && fs.existsSync(builtTargetPath)) {
      const linkageMode = this.getLinkageMode(ref);
      this.deployToolchainRuntimeDlls(builtTargetPath, config, linkageMode);
      const sdlPlan = project ? this.resolveSdlPlan(ref, project.files, project.targetType, linkageMode) : undefined;
      this.deploySdlRuntimeDlls(builtTargetPath, sdlPlan, linkageMode);
      this.deployApplicationIconAssets(ref, builtTargetPath, this.parser.getNativeTargetSettings(ref.absolutePath, this.buildMode));
    }
    const fallbackArgs = this.projectSettings.getCpmConfigurationValue<string[]>('runArguments', []);
    const args = runSettings.arguments.trim() ? this.projectSettings.parseArguments(runSettings.arguments) : fallbackArgs;
    const cwd = runSettings.workingDirectory.trim() ? this.resolveRuntimeReference(runSettings.workingDirectory, projectDirectory) : path.dirname(program);
    if (!fs.existsSync(cwd)) {
      vscode.window.showErrorMessage(`The configured debug working directory does not exist: ${cwd}`);
      return false;
    }
    try {
      if (!fs.statSync(cwd).isDirectory()) {
        vscode.window.showErrorMessage(`The configured debug working directory is not a directory: ${cwd}`);
        return false;
      }
    } catch (error) {
      vscode.window.showErrorMessage(`The configured debug working directory cannot be accessed: ${cwd}. ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
    const debugEnvironment = this.debugEnvironmentFromProcessEnv(this.createRuntimeEnvironment(this.projectSettings.parseEnvironment(runSettings.environmentOptions), config, program, builtTargetPath));
    const debugConfig: vscode.DebugConfiguration = {
      name: `${buildFirst ? 'Build & Debug' : 'Debug'} ${targetType === 'Dynamic Link Library' ? `${ref.name} via ${path.basename(program)}` : ref.name}`,
      type: 'cppdbg', request: 'launch', program, args, cwd, stopAtEntry: false,
      externalConsole: false, avoidWindowsConsoleRedirection: false, internalConsoleOptions: 'neverOpen',
      logging: { programOutput: true }, MIMode: 'gdb', miDebuggerPath: config.debuggerPath || 'gdb', environment: debugEnvironment
    };
    const started = await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(vscode.Uri.file(ref.absolutePath)), debugConfig);
    if (!started) vscode.window.showErrorMessage('Unable to start the VS Code C/C++ debug session. Check that the Microsoft C/C++ extension and gdb are installed.');
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
    const buildModeDirectory = path.dirname(artifacts.objectDirectory);
    if (rebuild && fs.existsSync(buildModeDirectory)) {
      const cleanResult = await cleanCpmBuildDirectory(buildModeDirectory);
      cleanResult.warnings.forEach((warning) => this.output.appendLine(`[C/C++] Warning: ${warning}`));
      if (!cleanResult.success) {
        this.output.appendLine(`[C/C++] ERROR: unable to remove previous build-mode directory before rebuild: ${buildModeDirectory}`);
        return false;
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

    const iconGeneration = await this.prepareApplicationIconGeneration(ref, project.targetType, artifacts, project.files, config);
    if (!iconGeneration.success) {
      return false;
    }
    const forceIncludeHeaders = iconGeneration.forceIncludeHeader ? [iconGeneration.forceIncludeHeader] : [];
    const buildSettings = this.projectSettings.getSettings(ref);
    const projectDirectory = path.dirname(ref.absolutePath);
    const effectiveSourceFiles = buildSettings.unityBuildEnabled
      ? this.createUnitySourceFiles(sourceFiles, artifacts.objectDirectory, buildSettings.unityBatchSize)
      : sourceFiles;

    const compilePlan = effectiveSourceFiles.map((source) => {
      const objectPath = this.objectPathForSource(source.absolutePath, ref.absolutePath, artifacts.objectDirectory);
      const shouldCompile = sourceNeedsCompilation(source.absolutePath, objectPath, projectDirectory, rebuild);
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
    this.output.appendLine(`  Build units: ${effectiveSourceFiles.length}${buildSettings.unityBuildEnabled ? ` (Unity Build batch ${buildSettings.unityBatchSize})` : ''}`);
    this.output.appendLine(`  PCH       : ${buildSettings.precompiledHeadersEnabled ? 'enabled' : 'disabled'}`);
    this.output.appendLine(`  Linkage   : ${linkageModeLabel(this.getLinkageMode(ref))}`);
    this.output.appendLine('');

    this.appendSection('C/C++ COMPILATION');
    const parallelJobs = buildSettings.parallelJobs > 0 ? buildSettings.parallelJobs : Math.max(1, os.cpus().length);
    this.output.appendLine(`  Sources: ${compilePlan.length} | Compile: ${compileCount} | Cached: ${cachedCount} | Parallel jobs: ${parallelJobs}`);
    this.output.appendLine('  Dependency tracking: GCC/Clang .d files (-MMD/-MP)');
    this.output.appendLine('');
    if (compileCount === 0) {
      this.output.appendLine('  [OK] All object files are up to date.');
      this.output.appendLine('');
    }

    const pchHeaders = await this.preparePrecompiledHeaders(ref, project.files, config, buildSettings, artifacts.objectDirectory, projectDirectory, rebuild);
    if (!pchHeaders) {
      this.output.appendLine('  [SKIP] Compilation skipped because precompiled-header generation failed.');
      return false;
    }

    const objectFiles = compilePlan.map((item) => item.objectPath);
    if (this.logDetail() === 'verbose') {
      for (const item of compilePlan.filter((entry) => !entry.shouldCompile)) {
        this.output.appendLine(`  [CACHE] ${path.basename(item.source.absolutePath)}`);
      }
    }
    const compileItems = compilePlan.filter((item) => item.shouldCompile);
    const compiled = await runWithConcurrency(compileItems, parallelJobs, async (item) => {
      const pchHeader = isCSource(item.source.absolutePath) ? pchHeaders.c : pchHeaders.cpp;
      const includeHeaders = [...(pchHeader ? [pchHeader] : []), ...forceIncludeHeaders];
      const args = this.compileArguments(item.source.absolutePath, item.objectPath, ref, project.files, config, includeHeaders);
      const success = await this.spawnTool(this.compilerForSource(item.source.absolutePath, config), args, projectDirectory, `Compile ${path.basename(item.source.absolutePath)}`);
      return success && fs.existsSync(item.objectPath);
    });
    if (!compiled) {
      this.output.appendLine('  [SKIP] Link step skipped because compilation failed.');
      return false;
    }

    if (iconGeneration.generatedSource) {
      const iconObjectPath = this.objectPathForSource(iconGeneration.generatedSource, ref.absolutePath, artifacts.objectDirectory);
      if (sourceNeedsCompilation(iconGeneration.generatedSource, iconObjectPath, projectDirectory, rebuild)) {
        const args = this.compileArguments(iconGeneration.generatedSource, iconObjectPath, ref, project.files, config);
        const success = await this.spawnTool(this.compilerForSource(iconGeneration.generatedSource, config), args, projectDirectory, `Compile ${path.basename(iconGeneration.generatedSource)}`);
        if (!success) {
          this.output.appendLine('  [SKIP] Link step skipped because application-icon helper compilation failed.');
          return false;
        }
      } else if (this.logDetail() === 'verbose') {
        this.output.appendLine(`  [CACHE] ${path.basename(iconGeneration.generatedSource)}`);
      }
      objectFiles.push(iconObjectPath);
    }

    artifacts.objectFiles = objectFiles;
    const linkSuccess = await this.linkArtifacts(ref, project.targetType, artifacts, project.files, config, buildSettings);
    return linkSuccess;
  }

  private createUnitySourceFiles(sourceFiles: CpmProjectFile[], objectDirectory: string, batchSize: number): CpmProjectFile[] {
    const clampedBatch = Math.max(2, Math.min(128, Math.trunc(batchSize || 8)));
    const result: CpmProjectFile[] = [];
    let generatedId = -100000;
    for (const language of ['c', 'cpp'] as const) {
      const matching = sourceFiles.filter((source) => language === 'c' ? isCSource(source.absolutePath) : !isCSource(source.absolutePath));
      let unityIndex = 0;
      for (let offset = 0; offset < matching.length; offset += clampedBatch) {
        const chunk = matching.slice(offset, offset + clampedBatch);
        if (chunk.length < 2) {
          result.push(...chunk);
          continue;
        }
        unityIndex += 1;
        const extension = language === 'c' ? '.c' : '.cpp';
        const unityPath = path.join(objectDirectory, `cpm_unity_${language}_${String(unityIndex).padStart(3, '0')}${extension}`);
        const body = [
          '/* Generated by C/C++ Project Manager Unity Build. Do not edit. */',
          `/* Batch contains ${chunk.length} original translation units. */`,
          '',
          ...chunk.map((source) => `#include "${escapeIncludePath(source.absolutePath)}"`),
          ''
        ].join('\n');
        writeTextFileIfChanged(unityPath, body);
        result.push({
          sectionName: 'CPM Unity Build', id: generatedId--, type: language === 'c' ? 'CSource' : 'CPPSource', folder: '',
          relativePath: path.basename(unityPath), absolutePath: unityPath, excluded: false, compileIntoObjectFile: true, exists: true
        });
        if (this.logDetail() === 'verbose') {
          this.output.appendLine(`  [UNITY] ${path.basename(unityPath)} <= ${chunk.map((source) => path.basename(source.absolutePath)).join(', ')}`);
        }
      }
    }
    return result.length ? result : sourceFiles;
  }

  private async preparePrecompiledHeaders(
    ref: CpmWorkspaceProjectRef,
    projectFiles: CpmProjectFile[],
    config: GenericCompilerConfiguration,
    buildSettings: { precompiledHeadersEnabled: boolean; cPrecompiledHeader: string; cppPrecompiledHeader: string },
    objectDirectory: string,
    projectDirectory: string,
    rebuild: boolean
  ): Promise<{ c?: string; cpp?: string } | undefined> {
    if (!buildSettings.precompiledHeadersEnabled) return {};
    const result: { c?: string; cpp?: string } = {};
    const entries = [
      { language: 'c' as const, configured: buildSettings.cPrecompiledHeader.trim(), compiler: config.cCompilerPath || 'gcc', extension: '.h', xlang: 'c-header' as const },
      { language: 'cpp' as const, configured: buildSettings.cppPrecompiledHeader.trim(), compiler: config.cppCompilerPath || 'g++', extension: '.hpp', xlang: 'c++-header' as const }
    ];
    for (const entry of entries) {
      if (!entry.configured) continue;
      const sourceHeader = resolveAgainstProject(entry.configured, ref.absolutePath);
      if (!fs.existsSync(sourceHeader)) {
        this.output.appendLine(`  [PCH] ERROR: configured ${entry.language.toUpperCase()} header does not exist: ${sourceHeader}`);
        vscode.window.showErrorMessage(`Configured ${entry.language.toUpperCase()} precompiled header does not exist: ${sourceHeader}`);
        return undefined;
      }
      const wrapperPath = path.join(objectDirectory, `cpm_pch_${entry.language}${entry.extension}`);
      const pchPath = `${wrapperPath}.gch`;
      const args = this.precompiledHeaderArguments(wrapperPath, pchPath, entry.xlang, ref, projectFiles, config, entry.language);
      const signature = crypto.createHash('sha1').update(JSON.stringify([entry.compiler, args])).digest('hex').slice(0, 16);
      const content = [
        '/* Generated by C/C++ Project Manager. Do not edit. */',
        `/* Build signature: ${signature} */`,
        '#pragma once',
        `#include "${escapeIncludePath(sourceHeader)}"`,
        ''
      ].join('\n');
      writeTextFileIfChanged(wrapperPath, content);
      if (sourceNeedsCompilation(wrapperPath, pchPath, projectDirectory, rebuild)) {
        const success = await this.spawnTool(entry.compiler, args, projectDirectory, `Precompile ${path.basename(sourceHeader)}`);
        if (!success || !fs.existsSync(pchPath)) return undefined;
        this.output.appendLine(`  [PCH] Generated ${path.basename(pchPath)} from ${path.basename(sourceHeader)}`);
      } else if (this.logDetail() === 'verbose') {
        this.output.appendLine(`  [PCH CACHE] ${path.basename(sourceHeader)}`);
      }
      result[entry.language] = wrapperPath;
    }
    return result;
  }

  private precompiledHeaderArguments(
    wrapperPath: string,
    pchPath: string,
    xlang: 'c-header' | 'c++-header',
    ref: CpmWorkspaceProjectRef,
    projectFiles: CpmProjectFile[],
    config: GenericCompilerConfiguration,
    language: 'c' | 'cpp'
  ): string[] {
    const sdlPlan = this.resolveSdlPlan(ref, projectFiles, 'Executable');
    const dependencyIntegration = this.dependencies?.getIntegration(ref, this.buildMode) ?? emptyDependencyIntegration();
    const includePaths = unique([
      path.dirname(ref.absolutePath),
      ...projectFiles.filter((file) => isHeader(file.absolutePath)).map((file) => path.dirname(file.absolutePath)),
      ...config.includePaths.map((value) => resolveAgainstProject(value, ref.absolutePath)),
      ...dependencyIntegration.includeDirectories,
      ...(sdlPlan?.includeDirectories ?? [])
    ]);
    const standard = language === 'c' ? config.cStandard : config.cppStandard;
    return [
      '-x', xlang, wrapperPath,
      '-MMD', '-MP', '-MF', dependencyPathForObject(pchPath), '-MT', pchPath,
      ...this.modeFlags(config),
      ...this.warningFlags(config),
      ...(standard && standard !== 'auto' ? [`-std=${standard}`] : []),
      ...config.defineSymbols.map((name) => `-D${name}`),
      ...includePaths.flatMap((value) => ['-I', value]),
      ...(sdlPlan?.compileFlags ?? []),
      ...config.compilerFlags,
      ...dependencyIntegration.compilerFlags,
      ...(language === 'c' ? config.cCompilerFlags : config.cppCompilerFlags),
      '-o', pchPath
    ];
  }

  private async linkArtifacts(ref: CpmWorkspaceProjectRef, targetType: string, artifacts: BuildArtifacts, files: CpmProjectFile[], config: GenericCompilerConfiguration, buildSettings: { useResponseFiles: boolean }): Promise<boolean> {
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

    const targetSettings = this.parser.getNativeTargetSettings(ref.absolutePath, this.buildMode);
    const windowsResourceObjects = await this.compileWindowsApplicationIconResource(ref, targetType, artifacts, targetSettings, config);
    if (windowsResourceObjects === undefined) {
      return false;
    }

    const linkageMode = this.getLinkageMode(ref);
    const dependencyIntegration = this.dependencies?.getIntegration(ref, this.buildMode) ?? emptyDependencyIntegration();
    const sdlPlan = this.resolveSdlPlan(ref, files, targetType, linkageMode);
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
      ...this.runtimeLinkFlags(config, targetType, sdlPlan, linkageMode),
      ...(targetType === 'Dynamic Link Library' ? ['-shared'] : []),
      ...artifacts.objectFiles,
      ...windowsResourceObjects,
      ...fileLibraries,
      ...config.libraryPaths.flatMap((value) => ['-L', resolveAgainstProject(value, ref.absolutePath)]),
      ...dependencyIntegration.libraryDirectories.flatMap((value) => ['-L', value]),
      ...(sdlPlan?.linkArgs ?? []),
      ...config.libraries.map((name) => name.startsWith('-l') ? name : `-l${name}`),
      ...dependencyIntegration.libraries.map((name) => name.startsWith('-l') || path.isAbsolute(name) ? name : `-l${name}`),
      ...config.linkerFlags,
      ...dependencyIntegration.linkerFlags,
      '-o', artifacts.targetPath
    ];
    const responseFilePath = path.join(artifacts.objectDirectory, 'cpm_link.rsp');
    const useResponseFile = buildSettings.useResponseFiles && shouldUseGnuResponseFile(args);
    let linkArgs = args;
    if (useResponseFile) {
      linkArgs = createGnuResponseFileArguments(args, responseFilePath);
      if (this.logDetail() !== 'compact') {
        this.output.appendLine(`  Link response file: ${responseFilePath} (${estimateGnuArgumentLength(args)} characters)`);
      }
    } else if (fs.existsSync(responseFilePath)) {
      await removePathWithRetries(responseFilePath, 3, 40);
    }
    const success = await this.spawnTool(config.cppCompilerPath || 'g++', linkArgs, path.dirname(ref.absolutePath), `Link ${path.basename(artifacts.targetPath)}`);
    if (success) {
      this.deployToolchainRuntimeDlls(artifacts.targetPath, config, linkageMode);
      this.deploySdlRuntimeDlls(artifacts.targetPath, sdlPlan, linkageMode);
      this.deployApplicationIconAssets(ref, artifacts.targetPath, targetSettings);
      this.reportRuntimeDependencies(artifacts.targetPath, linkageMode, false);
    }
    return success;
  }


  private async prepareApplicationIconGeneration(ref: CpmWorkspaceProjectRef, targetType: string, artifacts: BuildArtifacts, files: CpmProjectFile[], config: GenericCompilerConfiguration): Promise<ApplicationIconGeneration> {
    const targetSettings = this.parser.getNativeTargetSettings(ref.absolutePath, this.buildMode);
    if (targetType === 'Static Library' || !targetSettings.windowIconFile || !targetSettings.applyWindowIconAutomatically) {
      return { success: true };
    }
    const sdlPlan = this.resolveSdlPlan(ref, files, targetType, this.getLinkageMode(ref));
    if (!sdlPlan) {
      return { success: true };
    }
    const iconPath = resolveAgainstProject(targetSettings.windowIconFile, ref.absolutePath);
    if (!fs.existsSync(iconPath)) {
      this.output.appendLine(`[C/C++] ERROR: configured SDL window icon image not found: ${iconPath}`);
      vscode.window.showErrorMessage('Configured SDL window icon image not found. Open the C/C++ Project Manager output channel for details.');
      return { success: false };
    }

    const extension = path.extname(iconPath).toLowerCase();
    const needsSdlImage = extension !== '.bmp';
    const hasSdlImage = sdlPlan.packages.includes(`${sdlPlan.version}_image`);
    if (needsSdlImage && !hasSdlImage) {
      this.output.appendLine(`[C/C++] ERROR: SDL window icon image ${path.basename(iconPath)} is not a BMP file. Add ${sdlPlan.version}_image to SDL packages or use a BMP icon.`);
      vscode.window.showErrorMessage(`SDL window icon images other than BMP require ${sdlPlan.version}_image.`);
      return { success: false };
    }

    const generatedDirectory = path.join(path.dirname(artifacts.objectDirectory), 'generated');
    if (!await this.ensureDirectory(generatedDirectory, 'generated application-icon directory')) {
      return { success: false };
    }
    const headerPath = path.join(generatedDirectory, 'cpm_application_icon_autoload.h');
    const sourcePath = path.join(generatedDirectory, 'cpm_application_icon_autoload.c');
    const deployedIconName = `cpm_app_icon${extension || '.bmp'}`;
    const deployedIconPath = path.join(path.dirname(artifacts.targetPath), deployedIconName);
    const fallbackPath = fs.existsSync(deployedIconPath) ? deployedIconPath : iconPath;

    writeTextFileIfChanged(headerPath, renderSdlIconAutoloadHeader(sdlPlan.version));
    writeTextFileIfChanged(sourcePath, renderSdlIconAutoloadSource(sdlPlan.version, deployedIconName, fallbackPath, hasSdlImage));
    this.output.appendLine(`[C/C++] SDL window icon autoload: ${path.basename(targetSettings.windowIconFile)}.`);
    return { success: true, forceIncludeHeader: headerPath, generatedSource: sourcePath };
  }

  private async compileWindowsApplicationIconResource(ref: CpmWorkspaceProjectRef, targetType: string, artifacts: BuildArtifacts, targetSettings: CpmNativeTargetSettings, config: GenericCompilerConfiguration): Promise<string[] | undefined> {
    if (targetType !== 'Executable' || !targetSettings.iconFile) {
      return [];
    }
    const iconPath = resolveAgainstProject(targetSettings.iconFile, ref.absolutePath);
    if (!fs.existsSync(iconPath)) {
      this.output.appendLine(`[C/C++] ERROR: configured executable icon not found: ${iconPath}`);
      vscode.window.showErrorMessage('Configured executable icon not found. Open the C/C++ Project Manager output channel for details.');
      return undefined;
    }
    if (path.extname(iconPath).toLowerCase() !== '.ico') {
      this.output.appendLine(`[C/C++] ERROR: executable icon must be a Windows .ico file: ${iconPath}`);
      vscode.window.showErrorMessage('Executable icon embedding requires a Windows .ico file.');
      return undefined;
    }
    const windres = findWindresExecutable(config);
    if (!windres) {
      this.output.appendLine('[C/C++] ERROR: unable to find windres.exe or llvm-windres.exe near the selected toolchain or in PATH.');
      vscode.window.showErrorMessage('Unable to embed executable icon: windres.exe was not found.');
      return undefined;
    }
    const generatedDirectory = path.join(path.dirname(artifacts.objectDirectory), 'generated');
    if (!await this.ensureDirectory(generatedDirectory, 'generated resource directory')) {
      return undefined;
    }
    const rcPath = path.join(generatedDirectory, 'cpm_application_icon.rc');
    const resObjectPath = path.join(artifacts.objectDirectory, 'cpm_application_icon.res.o');
    fs.writeFileSync(rcPath, renderWindowsIconResource(iconPath), 'utf8');
    const arch = inferRequestedArchitecture(config.cppCompilerPath || config.cCompilerPath || 'g++', this.modeFlags(config));
    const targetArg = arch?.id === 'x64' ? ['--target=pe-x86-64'] : arch?.id === 'x86' ? ['--target=pe-i386'] : [];
    const args = ['-i', rcPath, '-o', resObjectPath, ...targetArg];
    const success = await this.spawnTool(windres, args, path.dirname(ref.absolutePath), `Compile application icon resource`);
    if (!success) {
      return undefined;
    }
    this.output.appendLine(`[C/C++] Windows executable icon embedded: ${path.basename(iconPath)}.`);
    return [resObjectPath];
  }

  private deployApplicationIconAssets(ref: CpmWorkspaceProjectRef, targetPath: string, targetSettings: CpmNativeTargetSettings): void {
    if (!targetSettings.windowIconFile) {
      return;
    }
    const sourcePath = normalizeRuntimePath(targetSettings.windowIconFile);
    const absoluteSource = path.isAbsolute(sourcePath) || path.win32.isAbsolute(sourcePath) ? sourcePath : path.resolve(path.dirname(ref.absolutePath), sourcePath);
    if (!fs.existsSync(absoluteSource)) {
      return;
    }
    const extension = path.extname(absoluteSource).toLowerCase() || '.bmp';
    const destinationPath = path.join(path.dirname(targetPath), `cpm_app_icon${extension}`);
    try {
      fs.copyFileSync(absoluteSource, destinationPath);
      this.output.appendLine(`[C/C++] Application icon asset copied: ${destinationPath}`);
    } catch (error) {
      this.output.appendLine(`[C/C++] Warning: unable to copy application icon asset: ${error instanceof Error ? error.message : String(error)}`);
    }
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

  private compileArguments(sourcePath: string, objectPath: string, ref: CpmWorkspaceProjectRef, projectFiles: CpmProjectFile[], config: GenericCompilerConfiguration, forceIncludeHeaders: string[] = []): string[] {
    const sdlPlan = this.resolveSdlPlan(ref, projectFiles, 'Executable');
    const dependencyIntegration = this.dependencies?.getIntegration(ref, this.buildMode) ?? emptyDependencyIntegration();
    const includePaths = unique([
      path.dirname(ref.absolutePath),
      ...projectFiles.filter((file) => isHeader(file.absolutePath)).map((file) => path.dirname(file.absolutePath)),
      ...config.includePaths.map((value) => resolveAgainstProject(value, ref.absolutePath)),
      ...dependencyIntegration.includeDirectories,
      ...(sdlPlan?.includeDirectories ?? [])
    ]);
    const standard = isCSource(sourcePath) ? config.cStandard : config.cppStandard;
    const dependencyPath = dependencyPathForObject(objectPath);
    return [
      '-c', sourcePath,
      '-MMD', '-MP', '-MF', dependencyPath, '-MT', objectPath,
      ...this.modeFlags(config),
      ...this.warningFlags(config),
      ...(standard && standard !== 'auto' ? [`-std=${standard}`] : []),
      ...config.defineSymbols.map((name) => `-D${name}`),
      ...includePaths.flatMap((value) => ['-I', value]),
      ...(sdlPlan?.compileFlags ?? []),
      ...forceIncludeHeaders.flatMap((headerPath) => ['-include', headerPath]),
      ...config.compilerFlags,
      ...dependencyIntegration.compilerFlags,
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
    if (this.projectSettings.getSettings(ref).buildBackend === 'cmake') {
      const cmakeArtifact = this.cmake?.resolveArtifact(ref, targetType);
      if (cmakeArtifact) return cmakeArtifact;
    }
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

  private resolveRuntimeReference(value: string, baseDirectory: string): string {
    const normalized = normalizeRuntimePath(value);
    if (!normalized) return '';
    return path.isAbsolute(normalized) || path.win32.isAbsolute(normalized) ? normalized : path.resolve(baseDirectory, normalized);
  }

  private createRuntimeEnvironment(base: NodeJS.ProcessEnv, config: GenericCompilerConfiguration, executablePath: string, builtTargetPath?: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...base };
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
    const existing = env[pathKey] ?? '';
    const directories = this.runtimeSearchDirectories(config, executablePath, builtTargetPath);
    if (directories.length > 0) {
      env[pathKey] = `${directories.join(path.delimiter)}${path.delimiter}${existing}`;
    }
    return env;
  }

  private debugEnvironmentFromProcessEnv(env: NodeJS.ProcessEnv): Array<{ name: string; value: string }> {
    // cppdbg normally inherits the extension-host environment. Emit only the
    // entries CPM actually changed, plus PATH which contains the host/DLL and
    // toolchain runtime directories. This preserves project Run environment
    // options without serializing the entire process environment.
    const result: Array<{ name: string; value: string }> = [];
    const processEntries = new Map(Object.entries(process.env).map(([key, value]) => [key.toLowerCase(), value]));
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) continue;
      const inherited = processEntries.get(name.toLowerCase());
      if (name.toLowerCase() === 'path' || inherited !== value) {
        result.push({ name, value });
      }
    }
    return result;
  }

  private runtimeSearchDirectories(config: GenericCompilerConfiguration, executablePath: string, builtTargetPath?: string): string[] {
    const ref = this.workspaces.activeProjectRef;
    const project = ref?.exists ? this.workspaces.getProject(ref) : undefined;
    const sdlPlan = ref?.exists && project ? this.resolveSdlPlan(ref, project.files, project.targetType, this.getLinkageMode(ref)) : undefined;
    return unique([
      path.dirname(executablePath),
      ...(builtTargetPath ? [path.dirname(builtTargetPath)] : []),
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

  private runtimeLinkFlags(config: GenericCompilerConfiguration, targetType: string, sdlPlan: ReturnType<typeof createSdlBuildPlan> | undefined, linkageMode: CpmLinkageMode): string[] {
    if (linkageMode === 'dynamic' || targetType === 'Static Library') {
      return [];
    }

    const flags = ['-static-libgcc', '-static-libstdc++'];
    if (linkageMode === 'static') {
      // Full static mode deliberately asks the linker to resolve -l entries as
      // static archives. Windows system DLLs remain normal OS dependencies.
      flags.unshift('-static');
    } else {
      const winpthreadStatic = this.findToolchainStaticLibrary(config, 'libwinpthread.a');
      if (winpthreadStatic) {
        flags.push('-Wl,-Bstatic', '-lwinpthread', '-Wl,-Bdynamic');
      }
    }
    this.output.appendLine(`[C/C++] Linkage flags (${linkageMode}): ${flags.join(' ')}.`);
    if (linkageMode === 'static' && sdlPlan && sdlPlan.runtimeMode !== 'static-link') {
      this.output.appendLine('[C/C++] Warning: fully-static linkage requested but SDL did not resolve to static mode.');
    }
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

  private deployToolchainRuntimeDlls(targetPath: string, config: GenericCompilerConfiguration, linkageMode: CpmLinkageMode = 'dynamic'): void {
    if (process.platform !== 'win32') {
      return;
    }
    const targetDirectory = path.dirname(targetPath);
    if (!fs.existsSync(targetDirectory)) {
      return;
    }

    const runtimeSources = this.collectToolchainRuntimeDlls(targetPath, config);

    if (linkageMode !== 'dynamic') {
      if (config.cleanRuntimeDllsOnDeploy) {
        this.cleanStaleRuntimeDlls(targetDirectory, new Map());
      }
      this.output.appendLine(`[C/C++] Toolchain runtime DLL deployment: disabled by ${linkageMode} linkage.`);
      return;
    }

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

  private deploySdlRuntimeDlls(targetPath: string, sdlPlan: ReturnType<typeof createSdlBuildPlan> | undefined, linkageMode: CpmLinkageMode = 'dynamic'): void {
    const targetDirectory = path.dirname(targetPath);
    if (linkageMode === 'static') {
      this.cleanLegacySdlRuntimeDlls(targetDirectory);
      return;
    }
    if (!sdlPlan || sdlPlan.runtimeMode !== 'copy-dlls' || sdlPlan.runtimeDlls.length === 0) {
      if (sdlPlan && sdlPlan.runtimeMode !== 'copy-dlls') {
        this.cleanLegacySdlRuntimeDlls(targetDirectory);
      }
      return;
    }
    let copied = 0;
    let unchanged = 0;
    const deployedNames: string[] = [];
    for (const sourcePath of sdlPlan.runtimeDlls) {
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
        this.output.appendLine(`[C/C++ SDL] Warning: unable to deploy SDL runtime DLL ${path.basename(sourcePath)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    mergeRuntimeDeployManifest(targetDirectory, deployedNames);
    this.output.appendLine(`[C/C++ SDL] Runtime DLL deployment: ${copied} copied, ${unchanged} already up to date.`);
  }

  private resolveSdlPlan(ref: CpmWorkspaceProjectRef, files: CpmProjectFile[], targetType: string, linkageMode: CpmLinkageMode = this.getLinkageMode(ref)): ReturnType<typeof createSdlBuildPlan> | undefined {
    const config = this.getCompilerConfiguration();
    const preferredArchitecture = inferRequestedArchitecture(config.cppCompilerPath || config.cCompilerPath || 'g++', this.modeFlags(config))?.id;
    const sdlConfig = linkageMode === 'static'
      ? { ...config.sdl, runtimeMode: 'static-link' as const }
      : config.sdl;
    return createSdlBuildPlan(sdlConfig, path.dirname(ref.absolutePath), files.map((file) => file.absolutePath), targetType, preferredArchitecture);
  }

  private cleanLegacySdlRuntimeDlls(targetDirectory: string): void {
    if (!fs.existsSync(targetDirectory)) return;
    let removed = 0;
    try {
      for (const name of fs.readdirSync(targetDirectory)) {
        if (!/^SDL(?:2|3)(?:_[A-Za-z0-9]+)?\.dll$/i.test(name)) continue;
        fs.rmSync(path.join(targetDirectory, name), { force: true });
        removed++;
      }
    } catch (error) {
      this.output.appendLine(`[C/C++ SDL] Warning: unable to clean previous SDL runtime DLLs: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (removed > 0) {
      this.output.appendLine(`[C/C++ SDL] Fully-static linkage cleanup: removed ${removed} previously deployed SDL DLL(s).`);
    }
  }

  private reportRuntimeDependencies(targetPath: string, linkageMode: CpmLinkageMode, interactive: boolean): void {
    const imported = unique(readImportedDllNames(targetPath)).sort((a, b) => a.localeCompare(b));
    const system = imported.filter((name) => isWindowsSystemImport(name));
    const external = imported.filter((name) => !isWindowsSystemImport(name));
    this.output.appendLine('');
    this.output.appendLine('[C/C++] Runtime dependency inspection');
    this.output.appendLine(`  Target    : ${targetPath}`);
    this.output.appendLine(`  Linkage   : ${linkageModeLabel(linkageMode)}`);
    this.output.appendLine(`  System DLLs: ${system.length ? system.join(', ') : '<none detected>'}`);
    this.output.appendLine(`  External DLLs: ${external.length ? external.join(', ') : '<none detected>'}`);
    if (linkageMode === 'static') {
      if (external.length === 0) {
        this.output.appendLine('  [OK] Fully-static goal reached for non-system DLL dependencies.');
      } else {
        this.output.appendLine(`  [WARN] ${external.length} non-system DLL dependency/dependencies remain. Provide static .a versions or adjust linker flags/libraries.`);
      }
    } else if (linkageMode === 'static-runtime') {
      const runtimeImports = external.filter((name) => isKnownToolchainRuntimeDllName(name));
      if (runtimeImports.length === 0) {
        this.output.appendLine('  [OK] GCC/MinGW toolchain runtime DLLs are not imported.');
      } else {
        this.output.appendLine(`  [WARN] Toolchain runtime DLL imports remain: ${runtimeImports.join(', ')}`);
      }
    }
    this.output.appendLine('');
    this.output.show(true);
    if (interactive) {
      const summary = external.length
        ? `${external.length} non-system DLL dependency/dependencies: ${external.join(', ')}`
        : 'No non-system DLL dependency detected.';
      if (linkageMode === 'static' && external.length > 0) {
        void vscode.window.showWarningMessage(`Static dependency check: ${summary}`);
      } else {
        void vscode.window.showInformationMessage(`Runtime dependency check: ${summary}`);
      }
    }
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


function normalizeRunOutputMode(value: string | undefined): CpmRunOutputMode {
  if (value === 'output-channel' || value === 'detached') {
    return value;
  }
  return 'integrated-terminal';
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


function findWindresExecutable(config: GenericCompilerConfiguration): string | undefined {
  const compilerDirectories = unique([config.cppCompilerPath, config.cCompilerPath]
    .map((value) => value ? resolveExecutableFromPath(value) : '')
    .filter(Boolean)
    .map((value) => path.dirname(normalizeRuntimePath(value)))
    .filter((value) => fs.existsSync(value)));
  const names = ['windres.exe', 'windres', 'llvm-windres.exe', 'llvm-windres'];
  const candidates = unique([
    ...compilerDirectories.flatMap((directory) => names.map((name) => path.join(directory, name))),
    resolveExecutableFromPath('windres'),
    resolveExecutableFromPath('llvm-windres'),
    resolveExecutableFromPath('windres.exe'),
    resolveExecutableFromPath('llvm-windres.exe')
  ]);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function renderWindowsIconResource(iconPath: string): string {
  return `#include <windows.h>\n\n#define IDI_CPM_APPLICATION_ICON 101\nIDI_CPM_APPLICATION_ICON ICON \"${escapeRcString(iconPath)}\"\n`;
}

function renderSdlIconAutoloadHeader(version: string): string {
  if (version === 'SDL3') {
    return `#pragma once\n\n#if defined(CPM_USE_SDL3)\n#include <SDL3/SDL.h>\n\n#ifdef __cplusplus\nextern \"C\" {\n#endif\n\nSDL_Window *cpm_sdl3_create_window_with_icon(const char *title, int w, int h, SDL_WindowFlags flags);\n\n#ifdef __cplusplus\n}\n#endif\n\n#if !defined(CPM_DISABLE_SDL_WINDOW_ICON_AUTOWRAP)\n#define SDL_CreateWindow(title, w, h, flags) cpm_sdl3_create_window_with_icon((title), (w), (h), (flags))\n#endif\n#endif\n`;
  }
  return `#pragma once\n\n#if defined(CPM_USE_SDL2)\n#include <SDL.h>\n\n#ifdef __cplusplus\nextern \"C\" {\n#endif\n\nSDL_Window *cpm_sdl2_create_window_with_icon(const char *title, int x, int y, int w, int h, Uint32 flags);\n\n#ifdef __cplusplus\n}\n#endif\n\n#if !defined(CPM_DISABLE_SDL_WINDOW_ICON_AUTOWRAP)\n#define SDL_CreateWindow(title, x, y, w, h, flags) cpm_sdl2_create_window_with_icon((title), (x), (y), (w), (h), (flags))\n#endif\n#endif\n`;
}

function renderSdlIconAutoloadSource(version: string, deployedIconName: string, fallbackIconPath: string, useSdlImage: boolean): string {
  const imageInclude = useSdlImage
    ? version === 'SDL3'
      ? '#include <SDL3_image/SDL_image.h>\n'
      : '#include <SDL_image.h>\n'
    : '';
  const loadExpression = useSdlImage ? 'IMG_Load(path)' : 'SDL_LoadBMP(path)';
  const destroySurface = version === 'SDL3' ? 'SDL_DestroySurface(surface);' : 'SDL_FreeSurface(surface);';
  const sdlWindowFactory = version === 'SDL3'
    ? `SDL_Window *cpm_sdl3_create_window_with_icon(const char *title, int w, int h, SDL_WindowFlags flags)\n{\n    SDL_Window *window = SDL_CreateWindow(title, w, h, flags);\n    cpm_apply_window_icon(window);\n    return window;\n}\n`
    : `SDL_Window *cpm_sdl2_create_window_with_icon(const char *title, int x, int y, int w, int h, Uint32 flags)\n{\n    SDL_Window *window = SDL_CreateWindow(title, x, y, w, h, flags);\n    cpm_apply_window_icon(window);\n    return window;\n}\n`;
  return `#define CPM_DISABLE_SDL_WINDOW_ICON_AUTOWRAP\n#include \"cpm_application_icon_autoload.h\"\n${imageInclude}\n#include <stddef.h>\n#include <string.h>\n\nstatic const char *CPM_APPLICATION_ICON_FILE = \"${escapeCString(deployedIconName)}\";\nstatic const char *CPM_APPLICATION_ICON_FALLBACK = \"${escapeCString(fallbackIconPath)}\";\n\nstatic char *cpm_build_base_icon_path(void)\n{\n    char *base = SDL_GetBasePath();\n    if (base == NULL)\n    {\n        return NULL;\n    }\n    const size_t baseLen = strlen(base);\n    const size_t nameLen = strlen(CPM_APPLICATION_ICON_FILE);\n    char *fullPath = (char *)SDL_malloc(baseLen + nameLen + 1U);\n    if (fullPath == NULL)\n    {\n        SDL_free(base);\n        return NULL;\n    }\n    memcpy(fullPath, base, baseLen);\n    memcpy(fullPath + baseLen, CPM_APPLICATION_ICON_FILE, nameLen + 1U);\n    SDL_free(base);\n    return fullPath;\n}\n\nstatic SDL_Surface *cpm_load_icon_surface(const char *path)\n{\n    if (path == NULL || path[0] == '\\0')\n    {\n        return NULL;\n    }\n    return ${loadExpression};\n}\n\nstatic void cpm_apply_window_icon(SDL_Window *window)\n{\n    if (window == NULL)\n    {\n        return;\n    }\n    SDL_Surface *surface = NULL;\n    char *baseIconPath = cpm_build_base_icon_path();\n    surface = cpm_load_icon_surface(baseIconPath);\n    if (surface == NULL)\n    {\n        surface = cpm_load_icon_surface(CPM_APPLICATION_ICON_FALLBACK);\n    }\n    SDL_free(baseIconPath);\n    if (surface != NULL)\n    {\n        SDL_SetWindowIcon(window, surface);\n        ${destroySurface}\n    }\n}\n\n${sdlWindowFactory}`;
}

function escapeRcString(value: string): string {
  return normalizeRuntimePath(value).replace(/\\/g, '\\\\').replace(/\"/g, '\\\"');
}

function escapeCString(value: string): string {
  return normalizeRuntimePath(value).replace(/\\/g, '\\\\').replace(/\"/g, '\\\"');
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

function mergeRuntimeDeployManifest(targetDirectory: string, dllNames: string[]): void {
  const existing = [...readRuntimeDeployManifest(targetDirectory)];
  writeRuntimeDeployManifest(targetDirectory, [...existing, ...dllNames]);
}

function isWindowsSystemImport(name: string): boolean {
  const lower = path.basename(name).toLowerCase();
  return /^(?:api-ms-win-|ext-ms-)/.test(lower) || WINDOWS_SYSTEM_DLLS.has(lower);
}

function linkageModeLabel(value: CpmLinkageMode): string {
  return value === 'static'
    ? 'Fully static when available'
    : value === 'static-runtime'
      ? 'Static compiler runtime'
      : 'Dynamic';
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

function escapeIncludePath(filePath: string): string { return path.resolve(filePath).replace(/\\/g, '/').replace(/"/g, '\"'); }
function isCSource(filePath: string): boolean { return path.extname(filePath).toLowerCase() === '.c'; }
function isSource(filePath: string): boolean { return /\.(?:c|cc|cpp|cxx)$/i.test(filePath); }
function isHeader(filePath: string): boolean { return /\.(?:h|hh|hpp|hxx)$/i.test(filePath); }
function isLibrary(filePath: string): boolean { return /\.(?:a|lib)$/i.test(filePath); }
function writeTextFileIfChanged(filePath: string, content: string): void {
  try {
    if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) return;
  } catch { /* rewrite below */ }
  fs.writeFileSync(filePath, content, 'utf8');
}

export function dependencyPathForObject(objectPath: string): string {
  return `${objectPath}.d`;
}

/** Parse a GCC/Clang Makefile dependency file generated by -MMD/-MF. */
export function readGnuDependencyFile(dependencyPath: string, workingDirectory = path.dirname(dependencyPath)): string[] {
  try {
    const content = fs.readFileSync(dependencyPath, 'utf8').replace(/\\\r?\n/g, ' ');
    // -MP appends phony header targets on following lines. Only the first
    // dependency rule belongs to the object being inspected.
    const firstRule = content.split(/\r?\n/, 1)[0] ?? '';
    const separator = firstRule.search(/:\s/);
    if (separator < 0) return [];
    const body = firstRule.slice(separator + 1).trim();
    const tokens: string[] = [];
    let current = '';
    let escaping = false;
    for (const char of body) {
      if (escaping) {
        if (/\s/.test(char) || char === '\\' || char === '#' || char === ':') current += char;
        else current += `\\${char}`;
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (/\s/.test(char)) {
        if (current) { tokens.push(current); current = ''; }
      } else {
        current += char;
      }
    }
    if (escaping) current += '\\';
    if (current) tokens.push(current);
    return unique(tokens.filter(Boolean).map((entry) => path.isAbsolute(entry) || /^[A-Za-z]:[\\/]/.test(entry) ? path.normalize(entry) : path.resolve(workingDirectory, entry)));
  } catch {
    return [];
  }
}

export function sourceNeedsCompilation(sourcePath: string, objectPath: string, workingDirectory: string, rebuild = false): boolean {
  if (rebuild || !fs.existsSync(objectPath)) return true;
  const objectTime = fs.statSync(objectPath).mtimeMs;
  if (!fs.existsSync(sourcePath) || fs.statSync(sourcePath).mtimeMs > objectTime) return true;
  const dependencyPath = dependencyPathForObject(objectPath);
  if (!fs.existsSync(dependencyPath)) return true;
  const dependencies = readGnuDependencyFile(dependencyPath, workingDirectory);
  if (dependencies.length === 0) return true;
  return dependencies.some((dependency) => !fs.existsSync(dependency) || fs.statSync(dependency).mtimeMs > objectTime);
}

export async function runWithConcurrency<T>(items: readonly T[], concurrency: number, worker: (item: T, index: number) => Promise<boolean>): Promise<boolean> {
  if (items.length === 0) return true;
  const limit = Math.max(1, Math.min(Math.trunc(concurrency) || 1, items.length));
  let nextIndex = 0;
  let failed = false;
  const runners = Array.from({ length: limit }, async () => {
    while (!failed) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        if (!await worker(items[index], index)) { failed = true; return; }
      } catch {
        failed = true;
        return;
      }
    }
  });
  await Promise.all(runners);
  return !failed;
}

function renderArgument(value: string): string { return /\s/.test(value) ? `"${value}"` : value; }
function replaceExtension(filePath: string, extension: string): string { return path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}${extension}`); }
function unique(values: string[]): string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
function resolveAgainstProject(value: string, projectPath: string): string { return path.isAbsolute(value) ? value : path.resolve(path.dirname(projectPath), value); }
