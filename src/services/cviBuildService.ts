import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { CviBuildMode, CviProjectFile, CviWorkspaceProjectRef } from '../model/types';
import { CviParser } from '../model/cviParser';
import { CviWorkspaceService } from './cviWorkspaceService';
import { CviProjectSettingsService } from './cviProjectSettingsService';
import { normalizeRuntimePath } from '../utils/pathUtils';

interface GenericCompilerConfiguration {
  cCompilerPath: string;
  cppCompilerPath: string;
  archiverPath: string;
  debuggerPath: string;
  outputDirectory: string;
  cStandard: string;
  cppStandard: string;
  compilerFlags: string[];
  cCompilerFlags: string[];
  cppCompilerFlags: string[];
  linkerFlags: string[];
  includePaths: string[];
  libraryPaths: string[];
  libraries: string[];
  defineSymbols: string[];
  useBuildModeArchitectureFlags: boolean;
}

interface BuildArtifacts {
  targetPath: string;
  objectDirectory: string;
  objectFiles: string[];
}

export class CviBuildService {
  constructor(
    private readonly parser: CviParser,
    private readonly workspaces: CviWorkspaceService,
    _installations: unknown,
    private readonly projectSettings: CviProjectSettingsService,
    _breakpoints: unknown,
    private readonly output: vscode.OutputChannel
  ) {}

  get buildMode(): CviBuildMode {
    return vscode.workspace.getConfiguration('labwindowsCvi').get<CviBuildMode>('buildMode', 'debug');
  }

  async chooseBuildAction(projectRef?: CviWorkspaceProjectRef): Promise<void> {
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

  async chooseRunAction(projectRef?: CviWorkspaceProjectRef): Promise<void> {
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
      await this.debugInCvi(projectRef);
    } else {
      await this.buildAndRun(projectRef);
    }
  }

  async selectBuildMode(): Promise<void> {
    const selected = await vscode.window.showQuickPick([
      { label: 'Debug', value: 'debug' as CviBuildMode, description: 'Adds -g -O0' },
      { label: 'Release', value: 'release' as CviBuildMode, description: 'Adds -O2' },
      { label: 'Debug x64', value: 'debug64' as CviBuildMode, description: 'Adds -g -O0 and optionally -m64' },
      { label: 'Release x64', value: 'release64' as CviBuildMode, description: 'Adds -O2 and optionally -m64' }
    ], { title: 'Select the C/C++ build mode' });
    if (!selected) {
      return;
    }
    await vscode.workspace.getConfiguration('labwindowsCvi').update('buildMode', selected.value, vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage(`C/C++ build mode: ${selected.label}.`);
  }

  async build(rebuild = false, projectRef?: CviWorkspaceProjectRef): Promise<boolean> {
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

  async clean(projectRef?: CviWorkspaceProjectRef): Promise<void> {
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
    if (removed === 0) {
      this.output.appendLine('[C/C++] No generated target or object directory was found.');
    }
    vscode.window.showInformationMessage(`Clean completed for ${ref.name}: ${removed} generated item(s) removed.`);
  }

  async compileFile(filePath: string, projectRef?: CviWorkspaceProjectRef): Promise<boolean> {
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
    fs.mkdirSync(artifacts.objectDirectory, { recursive: true });
    const objectPath = this.objectPathForSource(filePath, ref.absolutePath, artifacts.objectDirectory);
    const args = this.compileArguments(filePath, objectPath, ref, project?.files ?? [], config);
    return await this.spawnTool(this.compilerForSource(filePath, config), args, path.dirname(ref.absolutePath), `Compile ${path.basename(filePath)}`);
  }

  async run(projectRef?: CviWorkspaceProjectRef): Promise<void> {
    await this.buildAndRun(projectRef);
  }

  async buildAndRun(projectRef?: CviWorkspaceProjectRef): Promise<void> {
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

  async runWithoutBuild(projectRef?: CviWorkspaceProjectRef): Promise<void> {
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
    const fallbackArgs = vscode.workspace.getConfiguration('labwindowsCvi').get<string[]>('runArguments', []);
    const args = run.arguments.trim() ? this.projectSettings.parseArguments(run.arguments) : fallbackArgs;
    const cwd = run.workingDirectory.trim() ? normalizeRuntimePath(run.workingDirectory.trim()) : path.dirname(executablePath);
    if (!fs.existsSync(cwd)) {
      vscode.window.showErrorMessage(`The configured working directory does not exist: ${cwd}`);
      return;
    }
    const child = spawn(executablePath, args, { cwd, env: this.projectSettings.parseEnvironment(run.environmentOptions), detached: true, shell: false, stdio: 'ignore' });
    child.unref();
    this.output.appendLine(`[C/C++] Started ${executablePath} ${args.map(renderArgument).join(' ')}`);
  }

  async debugInCvi(projectRef?: CviWorkspaceProjectRef): Promise<boolean> {
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
      const debugMode: CviBuildMode = this.buildMode === 'release64' ? 'debug64' : 'debug';
      const answer = await vscode.window.showWarningMessage(`The active build mode is ${this.buildMode}. Switch to ${debugMode}, build and debug?`, 'Switch, build and debug', 'Continue current mode', 'Cancel');
      if (answer === 'Cancel' || !answer) {
        return false;
      }
      if (answer === 'Switch, build and debug') {
        await vscode.workspace.getConfiguration('labwindowsCvi').update('buildMode', debugMode, vscode.ConfigurationTarget.Workspace);
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
    const args = runSettings.arguments.trim() ? this.projectSettings.parseArguments(runSettings.arguments) : [];
    const cwd = runSettings.workingDirectory.trim() ? normalizeRuntimePath(runSettings.workingDirectory.trim()) : path.dirname(targetPath);
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
      miDebuggerPath: config.debuggerPath || 'gdb'
    };
    const started = await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(vscode.Uri.file(ref.absolutePath)), debugConfig);
    if (!started) {
      vscode.window.showErrorMessage('Unable to start the VS Code C/C++ debug session. Check that the Microsoft C/C++ extension and gdb are installed.');
    }
    return started;
  }

  async openWorkspaceInCvi(): Promise<void> {
    const workspace = this.workspaces.currentWorkspace;
    if (!workspace) {
      vscode.window.showErrorMessage('No C/C++ workspace is loaded.');
      return;
    }
    await this.workspaces.openPath(workspace.path);
  }

  async openProjectInCvi(projectPath: string): Promise<void> {
    await this.workspaces.openPath(projectPath);
  }

  async prepareDllImportLibraryGeneration(headerPath: string): Promise<void> {
    await vscode.env.clipboard.writeText(headerPath);
    vscode.window.showInformationMessage('The header path was copied. Use your compiler toolchain or dlltool to generate an import library if required.');
  }

  async openPanelInCvi(panelPath: string): Promise<void> {
    await this.workspaces.openPath(panelPath);
  }

  private async buildOneProject(ref: CviWorkspaceProjectRef, rebuild: boolean): Promise<boolean> {
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
      fs.rmSync(artifacts.objectDirectory, { recursive: true, force: true });
    }
    fs.mkdirSync(artifacts.objectDirectory, { recursive: true });
    fs.mkdirSync(path.dirname(artifacts.targetPath), { recursive: true });

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

  private async linkArtifacts(ref: CviWorkspaceProjectRef, targetType: string, artifacts: BuildArtifacts, files: CviProjectFile[], config: GenericCompilerConfiguration): Promise<boolean> {
    if (targetType === 'Static Library') {
      const args = ['rcs', artifacts.targetPath, ...artifacts.objectFiles];
      return await this.spawnTool(config.archiverPath || 'ar', args, path.dirname(ref.absolutePath), `Archive ${path.basename(artifacts.targetPath)}`);
    }

    const fileLibraries = files.filter((file) => !file.excluded && isLibrary(file.absolutePath)).map((file) => file.absolutePath);
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
    return await this.spawnTool(config.cppCompilerPath || 'g++', args, path.dirname(ref.absolutePath), `Link ${path.basename(artifacts.targetPath)}`);
  }

  private compileArguments(sourcePath: string, objectPath: string, ref: CviWorkspaceProjectRef, projectFiles: CviProjectFile[], config: GenericCompilerConfiguration): string[] {
    const includePaths = unique([
      path.dirname(ref.absolutePath),
      ...projectFiles.filter((file) => isHeader(file.absolutePath)).map((file) => path.dirname(file.absolutePath)),
      ...config.includePaths.map((value) => resolveAgainstProject(value, ref.absolutePath))
    ]);
    const standard = isCSource(sourcePath) ? config.cStandard : config.cppStandard;
    return [
      '-c', sourcePath,
      ...this.modeFlags(config),
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
    if (this.buildMode === 'debug' || this.buildMode === 'debug64') {
      flags.push('-g', '-O0');
    } else {
      flags.push('-O2');
    }
    if (config.useBuildModeArchitectureFlags) {
      if (this.buildMode === 'debug64' || this.buildMode === 'release64') {
        flags.push('-m64');
      } else {
        flags.push('-m32');
      }
    }
    return flags;
  }

  private compilerForSource(sourcePath: string, config: GenericCompilerConfiguration): string {
    return isCSource(sourcePath) ? config.cCompilerPath || 'gcc' : config.cppCompilerPath || 'g++';
  }

  private resolveArtifacts(ref: CviWorkspaceProjectRef, targetType?: string): BuildArtifacts {
    const objectDirectory = path.join(path.dirname(ref.absolutePath), this.getCompilerConfiguration().outputDirectory || 'build', ref.name, this.buildMode, 'obj');
    return { targetPath: this.resolveTargetPath(ref, targetType), objectDirectory, objectFiles: [] };
  }

  private resolveTargetPath(ref: CviWorkspaceProjectRef, targetType?: string): string {
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
    this.output.appendLine(`[C/C++] ${label}`);
    this.output.appendLine(`[C/C++] Tool: ${executable}`);
    this.output.appendLine(`[C/C++] Arguments: ${args.map(renderArgument).join(' ')}`);
    this.output.appendLine('');
    return await new Promise<boolean>((resolve) => {
      const child = spawn(executable, args, { cwd, windowsHide: true, shell: false });
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

  private getCompilerConfiguration(): GenericCompilerConfiguration {
    const config = vscode.workspace.getConfiguration('labwindowsCvi');
    return {
      cCompilerPath: config.get<string>('cCompilerPath', 'gcc'),
      cppCompilerPath: config.get<string>('cppCompilerPath', 'g++'),
      archiverPath: config.get<string>('archiverPath', 'ar'),
      debuggerPath: config.get<string>('debuggerPath', 'gdb'),
      outputDirectory: config.get<string>('outputDirectory', 'build'),
      cStandard: config.get<string>('cStandard', 'auto'),
      cppStandard: config.get<string>('cppStandard', 'c++17'),
      compilerFlags: config.get<string[]>('compilerFlags', []),
      cCompilerFlags: config.get<string[]>('cCompilerFlags', []),
      cppCompilerFlags: config.get<string[]>('cppCompilerFlags', []),
      linkerFlags: config.get<string[]>('linkerFlags', []),
      includePaths: config.get<string[]>('includePaths', []),
      libraryPaths: config.get<string[]>('libraryPaths', []),
      libraries: config.get<string[]>('libraries', []),
      defineSymbols: config.get<string[]>('defineSymbols', []),
      useBuildModeArchitectureFlags: config.get<boolean>('useBuildModeArchitectureFlags', false)
    };
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
