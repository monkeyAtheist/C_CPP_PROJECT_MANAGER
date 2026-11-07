import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { CpmBuildMode, CpmWorkspaceProjectRef } from '../model/types';
import { CpmParser } from '../model/cpmParser';
import { CpmBuildService } from './cpmBuildService';
import { CpmProjectSettingsService, CpmRemoteLinuxConfiguration, DEFAULT_REMOTE_LINUX } from './cpmProjectSettingsService';
import { CpmWorkspaceService } from './cpmWorkspaceService';

export interface CpmRemoteLinuxStatus {
  projectName: string;
  enabled: boolean;
  state: 'disabled' | 'ready' | 'warning' | 'error';
  message: string;
  destination: string;
  sshPath?: string;
  scpPath?: string;
  rsyncPath?: string;
  remoteProjectDirectory: string;
  remoteTargetPath: string;
  buildMode: CpmBuildMode;
}

interface ProcessResult {
  success: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

export class CpmRemoteLinuxService implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private _status?: CpmRemoteLinuxStatus;
  private gdbServerProcesses = new Set<ReturnType<typeof spawn>>();

  constructor(
    private readonly workspaces: CpmWorkspaceService,
    private readonly parser: CpmParser,
    private readonly settings: CpmProjectSettingsService,
    private readonly builds: CpmBuildService,
    private readonly output: vscode.OutputChannel,
    private readonly programOutput: vscode.OutputChannel
  ) {
    workspaces.onDidChange(() => this.refresh());
    this.refresh();
  }

  get status(): CpmRemoteLinuxStatus | undefined { return this._status; }
  get activeProjectRef(): CpmWorkspaceProjectRef | undefined { return this.workspaces.activeProjectRef; }

  dispose(): void {
    for (const child of this.gdbServerProcesses) {
      try { child.kill(); } catch { /* best effort */ }
    }
    this.gdbServerProcesses.clear();
    this.emitter.dispose();
  }

  refresh(): void {
    this._status = this.computeStatus();
    this.emitter.fire();
  }

  async configure(): Promise<void> {
    await vscode.commands.executeCommand('cpm.editBuildSettings');
  }

  async testConnection(ref?: CpmWorkspaceProjectRef): Promise<boolean> {
    const context = this.requireContext(ref);
    if (!context) return false;
    const { config, destination } = context;
    const result = await this.runSsh(config, destination, 'printf CPM_REMOTE_OK', 'Test SSH connection', false);
    if (result.success && result.stdout.includes('CPM_REMOTE_OK')) {
      vscode.window.showInformationMessage(`CPM Remote Linux: SSH connection to ${destination} is ready.`);
      this.refresh();
      return true;
    }
    vscode.window.showErrorMessage(`CPM Remote Linux: unable to connect to ${destination}. Open the C/C++ Project Manager output channel.`);
    this.refresh();
    return false;
  }

  async syncProject(ref?: CpmWorkspaceProjectRef): Promise<boolean> {
    const context = this.requireContext(ref);
    if (!context) return false;
    const { projectRef, config, destination, remoteProjectDirectory } = context;
    const root = path.dirname(projectRef.absolutePath);
    const generated = this.generateRemoteBuildScript(projectRef, config);
    if (!generated.success) return false;

    const prepare = await this.runSsh(config, destination, `mkdir -p ${remotePathArg(remoteProjectDirectory)}`, 'Prepare remote project directory', false);
    if (!prepare.success) return false;

    const rsync = resolveExecutable(config.rsyncExecutable);
    if (config.useRsync && rsync) {
      const sshTool = resolveExecutable(config.sshExecutable) ?? config.sshExecutable;
      const sshCommand = `${shellQuote(sshTool)} -p ${config.sshPort}`;
      const source = `${root.replace(/\\/g, '/')}/`;
      const args = ['-az', '--delete', '--exclude', '.git', '--exclude', 'build', '--exclude', '.cpm-remote-build', '--exclude', '.cpm/remote/artifacts', '-e', sshCommand, source, `${destination}:${remoteProjectDirectory.replace(/\/$/, '')}/`];
      const result = await this.runProcess(rsync, args, root, undefined, 'Synchronize project with rsync', false);
      if (result.success) this.refresh();
      return result.success;
    }

    const scp = resolveExecutable(config.scpExecutable) ?? config.scpExecutable;
    if (!resolveExecutable(scp) && !path.isAbsolute(scp)) {
      vscode.window.showErrorMessage('CPM Remote Linux: neither rsync nor scp is available for project synchronization.');
      return false;
    }
    this.output.appendLine('[CPM Remote] rsync is unavailable or disabled; falling back to scp. The fallback copies the whole project directory and cannot apply rsync exclusions.');
    const localContents = path.join(root, '.');
    const args = ['-P', String(config.sshPort), '-r', localContents, `${destination}:${remoteProjectDirectory.replace(/\/$/, '')}/`];
    const result = await this.runProcess(scp, args, path.dirname(root), undefined, 'Synchronize project with scp', false);
    if (result.success) this.refresh();
    return result.success;
  }

  async remoteBuild(ref?: CpmWorkspaceProjectRef): Promise<boolean> {
    const context = this.requireContext(ref);
    if (!context) return false;
    const { projectRef, config, destination, remoteProjectDirectory } = context;
    if (config.syncBeforeBuild && !await this.syncProject(projectRef)) return false;
    else if (!config.syncBeforeBuild) {
      const generated = this.generateRemoteBuildScript(projectRef, config);
      if (!generated.success) return false;
    }
    const command = config.remoteBuildCommand.trim()
      ? expandRemoteTemplate(config.remoteBuildCommand, projectRef.name, this.builds.buildMode, remoteProjectDirectory, this.remoteBuildDirectory(projectRef, config), this.remoteTargetPath(projectRef, config))
      : `cd ${remotePathArg(remoteProjectDirectory)} && chmod +x .cpm/remote/cpm_remote_build.sh && ./.cpm/remote/cpm_remote_build.sh`;
    const result = await this.runSsh(config, destination, this.withRemoteEnvironment(command, config), 'Remote build', false);
    if (result.success) {
      this.output.appendLine(`[CPM Remote] Built target: ${this.remoteTargetPath(projectRef, config)}`);
      this.refresh();
    }
    return result.success;
  }

  async remoteBuildAndRun(ref?: CpmWorkspaceProjectRef): Promise<void> {
    const context = this.requireContext(ref);
    if (!context) return;
    if (!await this.remoteBuild(context.projectRef)) return;
    await this.remoteRun(context.projectRef, false);
  }

  async remoteRun(ref?: CpmWorkspaceProjectRef, synchronize = true): Promise<boolean> {
    const context = this.requireContext(ref);
    if (!context) return false;
    const { projectRef, config, destination, remoteProjectDirectory } = context;
    const project = this.workspaces.getProject(projectRef);
    if (project?.targetType !== 'Executable') {
      vscode.window.showErrorMessage('CPM Remote Run currently requires an Executable target. DLL/shared-library and static-library projects can still be built remotely.');
      return false;
    }
    if (synchronize && config.syncBeforeRun && !await this.syncProject(projectRef)) return false;
    const target = this.remoteTargetPath(projectRef, config);
    const run = this.settings.getSettings(projectRef).run;
    const args = this.settings.parseArguments(run.arguments);
    const defaultCommand = `cd ${remotePathArg(path.posix.dirname(target))} && chmod +x ${shellQuote(path.posix.basename(target))} && ./${shellQuote(path.posix.basename(target))}${args.length ? ` ${args.map(shellQuote).join(' ')}` : ''}`;
    const command = this.withRemoteEnvironment(config.remoteRunCommand.trim()
      ? expandRemoteTemplate(config.remoteRunCommand, projectRef.name, this.builds.buildMode, remoteProjectDirectory, this.remoteBuildDirectory(projectRef, config), target)
      : defaultCommand, config);
    const outputMode = this.settings.getCpmConfigurationValue<string>('runOutputMode', 'integrated-terminal');
    if (outputMode === 'integrated-terminal') {
      const ssh = resolveExecutable(config.sshExecutable) ?? config.sshExecutable;
      const terminal = vscode.window.createTerminal({ name: `CPM Remote: ${projectRef.name}`, shellPath: ssh, shellArgs: ['-p', String(config.sshPort), destination, command], cwd: path.dirname(projectRef.absolutePath) });
      terminal.show(false);
      this.output.appendLine(`[CPM Remote] Started in integrated terminal on ${destination}: ${target}`);
      return true;
    }
    if (outputMode === 'detached') {
      const detachedCommand = `nohup sh -lc ${shellQuote(command)} >/dev/null 2>&1 </dev/null &`;
      return (await this.runSsh(config, destination, detachedCommand, 'Start remote target detached', false)).success;
    }
    this.programOutput.clear();
    this.programOutput.appendLine(`=== Remote ${projectRef.name} @ ${destination} ===`);
    this.programOutput.appendLine(`> ${command}`);
    this.programOutput.appendLine('');
    this.programOutput.show(true);
    const result = await this.runSsh(config, destination, command, 'Run remote target', true, this.programOutput);
    this.programOutput.appendLine(`\n[CPM Remote] Process finished (exit code ${String(result.code)}).`);
    return result.success;
  }

  async debugRemote(ref?: CpmWorkspaceProjectRef): Promise<boolean> {
    const context = this.requireContext(ref);
    if (!context) return false;
    const { projectRef, config, destination, remoteProjectDirectory } = context;
    const project = this.workspaces.getProject(projectRef);
    if (project?.targetType !== 'Executable') {
      vscode.window.showErrorMessage('CPM Remote Debug currently requires an Executable target.');
      return false;
    }
    if (!await this.remoteBuild(projectRef)) return false;
    const target = this.remoteTargetPath(projectRef, config);
    const run = this.settings.getSettings(projectRef).run;
    const args = this.settings.parseArguments(run.arguments);
    if (config.startGdbServerAutomatically) {
      const startCommand = `cd ${remotePathArg(path.posix.dirname(target))} && chmod +x ${shellQuote(path.posix.basename(target))} && nohup ${shellQuote(config.gdbServerExecutable)} :${config.gdbServerPort} ./${shellQuote(path.posix.basename(target))}${args.length ? ` ${args.map(shellQuote).join(' ')}` : ''} > .cpm_gdbserver.log 2>&1 < /dev/null & echo $!`;
      const started = await this.runSsh(config, destination, this.withRemoteEnvironment(startCommand, config), 'Start remote gdbserver', false);
      if (!started.success) return false;
      await delay(350);
    }

    const ssh = resolveExecutable(config.sshExecutable) ?? config.sshExecutable;
    const localRoot = path.dirname(projectRef.absolutePath);
    const remoteRoot = await this.resolveRemoteAbsolutePath(config, destination, remoteProjectDirectory);
    const remoteTarget = await this.resolveRemoteAbsolutePath(config, destination, target);
    const debugConfig: vscode.DebugConfiguration = {
      name: `Remote Debug ${projectRef.name} @ ${destination}`,
      type: 'cppdbg',
      request: 'launch',
      program: remoteTarget,
      args: [],
      cwd: path.posix.dirname(remoteTarget),
      stopAtEntry: false,
      externalConsole: false,
      internalConsoleOptions: 'neverOpen',
      MIMode: 'gdb',
      miDebuggerServerAddress: `127.0.0.1:${config.gdbServerPort}`,
      sourceFileMap: { [remoteRoot]: localRoot },
      pipeTransport: {
        pipeProgram: ssh,
        pipeArgs: ['-T', '-p', String(config.sshPort), destination],
        debuggerPath: config.remoteDebuggerExecutable,
        pipeCwd: localRoot
      },
      setupCommands: [{ description: 'Enable GDB pretty printing', text: '-enable-pretty-printing', ignoreFailures: true }]
    };
    this.output.appendLine(`[CPM Remote] Starting cppdbg through SSH pipe transport. Remote program: ${remoteTarget}`);
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectRef.absolutePath));
    const ok = await vscode.debug.startDebugging(folder, debugConfig);
    if (!ok) vscode.window.showErrorMessage('CPM Remote Debug could not start. Verify Microsoft C/C++, SSH, remote gdb and gdbserver.');
    return ok;
  }

  private async resolveRemoteAbsolutePath(config: CpmRemoteLinuxConfiguration, destination: string, remotePath: string): Promise<string> {
    const rendered = remotePathArg(remotePath);
    const command = `p=${rendered}; if [ -d "$p" ]; then cd "$p" && pwd -P; else d=$(dirname "$p"); b=$(basename "$p"); cd "$d" && printf '%s/%s\n' "$(pwd -P)" "$b"; fi`;
    const result = await this.runSsh(config, destination, command, 'Resolve remote path', false);
    const resolved = result.stdout.trim().split(/\r?\n/).filter(Boolean).pop();
    if (result.success && resolved?.startsWith('/')) return resolved;
    this.output.appendLine(`[CPM Remote] Could not resolve an absolute path for ${remotePath}; using the configured path.`);
    return remotePath;
  }

  async openTerminal(ref?: CpmWorkspaceProjectRef): Promise<void> {
    const context = this.requireContext(ref);
    if (!context) return;
    const ssh = resolveExecutable(context.config.sshExecutable) ?? context.config.sshExecutable;
    const terminal = vscode.window.createTerminal({ name: `CPM SSH — ${context.projectRef.name}`, shellPath: ssh, shellArgs: ['-p', String(context.config.sshPort), context.destination] });
    terminal.show(true);
  }

  async openReport(ref?: CpmWorkspaceProjectRef): Promise<void> {
    const context = this.requireContext(ref, false);
    const status = this.computeStatus(ref);
    const lines = ['# CPM Remote Linux / Raspberry Pi', ''];
    if (!status || !context) {
      lines.push('No active C/C++ project.');
    } else {
      const cfg = context.config;
      lines.push(`Project: ${status.projectName}`, `State: ${status.state}`, `Endpoint: ${status.destination || '<not configured>'}`, `Remote project: ${status.remoteProjectDirectory}`, `Remote target: ${status.remoteTargetPath}`, `Build mode: ${status.buildMode}`, '', '## Tooling', '', `SSH: ${status.sshPath || '<not found>'}`, `SCP: ${status.scpPath || '<not found>'}`, `rsync: ${status.rsyncPath || '<not found / optional>'}`, `Remote C compiler: ${cfg.cCompiler}`, `Remote C++ compiler: ${cfg.cppCompiler}`, `Remote archiver: ${cfg.archiver}`, `Remote debugger: ${cfg.remoteDebuggerExecutable}`, `gdbserver: ${cfg.gdbServerExecutable}:${cfg.gdbServerPort}`, '', '## Workflow', '', `Sync before build: ${cfg.syncBeforeBuild}`, `Sync before run: ${cfg.syncBeforeRun}`, `Transfer: ${cfg.useRsync ? 'rsync preferred, scp fallback' : 'scp'}`, `Custom build command: ${cfg.remoteBuildCommand || '<generated direct GCC/G++ build script>'}`, `Custom run command: ${cfg.remoteRunCommand || '<generated target command>'}`);
    }
    const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
    await vscode.window.showTextDocument(doc, { preview: true });
  }

  private computeStatus(ref?: CpmWorkspaceProjectRef): CpmRemoteLinuxStatus | undefined {
    const projectRef = ref ?? this.workspaces.activeProjectRef;
    if (!projectRef?.exists) return undefined;
    const config = this.settings.getSettings(projectRef).remoteLinux ?? DEFAULT_REMOTE_LINUX;
    const destination = sshDestination(config);
    const sshPath = resolveExecutable(config.sshExecutable);
    const scpPath = resolveExecutable(config.scpExecutable);
    const rsyncPath = resolveExecutable(config.rsyncExecutable);
    let state: CpmRemoteLinuxStatus['state'] = 'ready';
    let message = 'Remote Linux configuration is ready.';
    if (!config.enabled) { state = 'disabled'; message = 'Remote Linux is disabled for this project.'; }
    else if (!config.sshHost) { state = 'error'; message = 'SSH host or alias is not configured.'; }
    else if (!sshPath) { state = 'error'; message = `SSH executable not found: ${config.sshExecutable}`; }
    else if (!scpPath && !(config.useRsync && rsyncPath)) { state = 'error'; message = 'No usable scp/rsync synchronization tool was found.'; }
    else if (config.useRsync && !rsyncPath) { state = 'warning'; message = 'rsync is unavailable; CPM will fall back to scp.'; }
    return {
      projectName: projectRef.name,
      enabled: config.enabled,
      state,
      message,
      destination,
      sshPath,
      scpPath,
      rsyncPath,
      remoteProjectDirectory: this.remoteProjectDirectory(projectRef, config),
      remoteTargetPath: this.remoteTargetPath(projectRef, config),
      buildMode: this.builds.buildMode
    };
  }

  private requireContext(ref?: CpmWorkspaceProjectRef, requireEnabled = true): { projectRef: CpmWorkspaceProjectRef; config: CpmRemoteLinuxConfiguration; destination: string; remoteProjectDirectory: string } | undefined {
    const projectRef = ref ?? this.workspaces.activeProjectRef;
    if (!projectRef?.exists) { vscode.window.showErrorMessage('No active C/C++ project is available for Remote Linux.'); return undefined; }
    const config = this.settings.getSettings(projectRef).remoteLinux ?? DEFAULT_REMOTE_LINUX;
    if (requireEnabled && !config.enabled) { vscode.window.showErrorMessage('Remote Linux is disabled for this project. Enable it on the Remote Linux settings page.'); return undefined; }
    const destination = sshDestination(config);
    if (!destination) { vscode.window.showErrorMessage('Configure an SSH host or OpenSSH alias before using Remote Linux.'); return undefined; }
    if (!resolveExecutable(config.sshExecutable)) { vscode.window.showErrorMessage(`SSH executable not found: ${config.sshExecutable}`); return undefined; }
    return { projectRef, config, destination, remoteProjectDirectory: this.remoteProjectDirectory(projectRef, config) };
  }

  private remoteProjectDirectory(ref: CpmWorkspaceProjectRef, config: CpmRemoteLinuxConfiguration): string {
    return expandBasicTemplate(config.remoteProjectDirectory, ref.name, this.builds.buildMode).replace(/\\/g, '/').replace(/\/$/, '');
  }

  private remoteBuildDirectory(ref: CpmWorkspaceProjectRef, config: CpmRemoteLinuxConfiguration): string {
    const root = this.remoteProjectDirectory(ref, config);
    const configured = expandBasicTemplate(config.remoteBuildDirectory, ref.name, this.builds.buildMode).replace(/\\/g, '/');
    const base = configured.startsWith('/') || configured.startsWith('~') ? configured.replace(/\/$/, '') : path.posix.join(root, configured);
    return path.posix.basename(base) === this.builds.buildMode ? base : path.posix.join(base, this.builds.buildMode);
  }

  private remoteTargetPath(ref: CpmWorkspaceProjectRef, config: CpmRemoteLinuxConfiguration): string {
    const project = this.workspaces.getProject(ref);
    const safe = sanitizeTargetName(ref.name);
    const name = project?.targetType === 'Static Library' ? `lib${safe}.a` : project?.targetType === 'Dynamic Link Library' ? `lib${safe}.so` : safe;
    return path.posix.join(this.remoteBuildDirectory(ref, config), name);
  }

  private generateRemoteBuildScript(ref: CpmWorkspaceProjectRef, config: CpmRemoteLinuxConfiguration): { success: boolean; path?: string } {
    const project = this.workspaces.getProject(ref);
    if (!project) { vscode.window.showErrorMessage(`Unable to parse project ${ref.name}.`); return { success: false }; }
    const root = path.dirname(ref.absolutePath);
    const sources = project.files.filter((file) => !file.excluded && file.compileIntoObjectFile && isSource(file.absolutePath));
    if (!sources.length) { vscode.window.showErrorMessage('No C/C++ source file is enabled for the remote build.'); return { success: false }; }
    const externalSources = sources.filter((file) => !isInside(root, file.absolutePath));
    if (externalSources.length) {
      this.output.appendLine('[CPM Remote] Remote direct build cannot safely map source files located outside the project directory:');
      externalSources.forEach((file) => this.output.appendLine(`  ${file.absolutePath}`));
      vscode.window.showErrorMessage('Remote direct build found source files outside the project directory. Move them into the project or configure a custom Remote build command.');
      return { success: false };
    }

    const get = <T,>(key: string, fallback: T): T => this.settings.getCpmConfigurationValue<T>(key, fallback);
    const commonFlags = [...get<string[]>('compilerFlags', []), ...config.additionalCompilerFlags];
    const cFlags = get<string[]>('cCompilerFlags', []);
    const cppFlags = get<string[]>('cppCompilerFlags', []);
    const defines = get<string[]>('defineSymbols', []).map((value) => value.startsWith('-D') ? value : `-D${value}`);
    const warnings = warningFlags(get<string>('warningLevel', 'wall-extra'));
    const mode = this.builds.buildMode;
    const optimization = optimizationFlags(get<string>('optimizationLevel', 'mode-default'), mode);
    const debug = debugFlags(get<string>('debugInformation', 'mode-default'), mode);
    const includeMapping = mapLocalPathsToRemote(get<string[]>('includePaths', []), root, '$PROJECT_DIR');
    const libraryMapping = mapLocalPathsToRemote(get<string[]>('libraryPaths', []), root, '$PROJECT_DIR');
    includeMapping.skipped.forEach((value) => this.output.appendLine(`[CPM Remote] Skipping non-portable local include path: ${value}`));
    libraryMapping.skipped.forEach((value) => this.output.appendLine(`[CPM Remote] Skipping non-portable local library path: ${value}`));
    const includeFlags = [...includeMapping.mapped.map((value) => renderMappedSearchPath('-I', value)), ...config.additionalIncludeDirectories.map((value) => renderRawSearchPath('-I', value))];
    const libraryFlags = [...libraryMapping.mapped.map((value) => renderMappedSearchPath('-L', value)), ...config.additionalLibraryDirectories.map((value) => renderRawSearchPath('-L', value))];
    const localLibraries = get<string[]>('libraries', []).filter((value) => {
      if (isNonPortableWindowsAbsolutePath(value)) {
        this.output.appendLine(`[CPM Remote] Skipping non-portable local library path: ${value}`);
        return false;
      }
      return true;
    });
    const libraries = [...localLibraries, ...config.additionalLibraries].map(normalizeLibraryFlag);
    const linkerFlags = [...get<string[]>('linkerFlags', []), ...config.additionalLinkerFlags];
    const linkage = this.settings.getSettings(ref).linkageMode;
    if (linkage === 'static') linkerFlags.unshift('-static');
    const target = this.remoteTargetPath(ref, config);
    const buildDir = path.posix.dirname(target);
    const objectDir = path.posix.join(buildDir, 'obj');
    const projectDir = this.remoteProjectDirectory(ref, config);
    const hasCpp = sources.some((file) => isCppSource(file.absolutePath));
    if (linkage === 'static-runtime') linkerFlags.unshift('-static-libgcc', ...(hasCpp ? ['-static-libstdc++'] : []));
    const lines = ['#!/usr/bin/env sh', 'set -eu', `PROJECT_DIR=${remotePathArg(projectDir)}`, `BUILD_DIR=${remotePathArg(buildDir)}`, `OBJ_DIR=${remotePathArg(objectDir)}`, `TARGET=${remotePathArg(target)}`, `CC=${shellQuote(config.cCompiler)}`, `CXX=${shellQuote(config.cppCompiler)}`, `AR=${shellQuote(config.archiver)}`, 'mkdir -p "$OBJ_DIR"', 'cd "$PROJECT_DIR"', ''];
    if (config.pkgConfigPackages.length) {
      lines.push(`PKG_CFLAGS="$(pkg-config --cflags ${config.pkgConfigPackages.map(shellQuote).join(' ')})"`, `PKG_LIBS="$(pkg-config --libs ${config.pkgConfigPackages.map(shellQuote).join(' ')})"`, '');
    } else {
      lines.push('PKG_CFLAGS=""', 'PKG_LIBS=""', '');
    }
    const objects: string[] = [];
    sources.forEach((file, index) => {
      const rel = path.relative(root, file.absolutePath).replace(/\\/g, '/');
      const obj = `$OBJ_DIR/${String(index).padStart(4, '0')}_${sanitizeObjectName(rel)}.o`;
      objects.push(obj);
      const isCpp = isCppSource(file.absolutePath);
      const compiler = isCpp ? '$CXX' : '$CC';
      const standard = standardFlag(isCpp ? get<string>('cppStandard', 'c++17') : get<string>('cStandard', 'auto'));
      const perLanguage = isCpp ? cppFlags : cFlags;
      const pic = project.targetType === 'Dynamic Link Library' ? ['-fPIC'] : [];
      const flags = [...warnings, ...optimization, ...debug, ...defines, ...includeFlags, ...commonFlags, ...perLanguage, ...pic, ...(standard ? [standard] : [])];
      lines.push(`echo "[CPM Remote] Compile ${escapeDoubleQuoted(rel)}"`, `${compiler} ${flags.map(renderShellToken).join(' ')} $PKG_CFLAGS -MMD -MP -MF ${shellWord(`${obj}.d`)} -c ${shellQuote(rel)} -o ${shellWord(obj)}`, '');
    });
    if (project.targetType === 'Static Library') {
      lines.push(`echo "[CPM Remote] Archive $(basename \"$TARGET\")"`, `$AR rcs "$TARGET" ${objects.map(shellWord).join(' ')}`);
    } else {
      const shared = project.targetType === 'Dynamic Link Library' ? ['-shared'] : [];
      lines.push(`echo "[CPM Remote] Link $(basename \"$TARGET\")"`, `${hasCpp ? '$CXX' : '$CC'} ${shared.join(' ')} ${objects.map(shellWord).join(' ')} ${libraryFlags.map(renderShellToken).join(' ')} ${libraries.map(renderShellToken).join(' ')} ${linkerFlags.map(renderShellToken).join(' ')} $PKG_LIBS -o "$TARGET"`);
    }
    lines.push('echo "[CPM Remote] Build complete: $TARGET"', '');
    const generatedDir = path.join(root, '.cpm', 'remote');
    fs.mkdirSync(generatedDir, { recursive: true });
    const scriptPath = path.join(generatedDir, 'cpm_remote_build.sh');
    fs.writeFileSync(scriptPath, lines.join('\n'), 'utf8');
    this.output.appendLine(`[CPM Remote] Generated direct Linux build script: ${scriptPath}`);
    return { success: true, path: scriptPath };
  }

  private withRemoteEnvironment(command: string, config: CpmRemoteLinuxConfiguration): string {
    const env = config.environment.map((entry) => entry.trim()).filter((entry) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(entry));
    return env.length ? `env ${env.map(shellQuote).join(' ')} sh -lc ${shellQuote(command)}` : command;
  }

  private async runSsh(config: CpmRemoteLinuxConfiguration, destination: string, command: string, label: string, captureProgramOutput: boolean, channel?: vscode.OutputChannel): Promise<ProcessResult> {
    const ssh = resolveExecutable(config.sshExecutable) ?? config.sshExecutable;
    return this.runProcess(ssh, ['-p', String(config.sshPort), destination, command], process.cwd(), undefined, label, captureProgramOutput, channel);
  }

  private async runProcess(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv | undefined, label: string, captureProgramOutput: boolean, channel?: vscode.OutputChannel): Promise<ProcessResult> {
    this.output.appendLine(`[CPM Remote] ${label}`);
    this.output.appendLine(`[CPM Remote] Tool: ${executable}`);
    this.output.appendLine(`[CPM Remote] Arguments: ${args.map(renderArgument).join(' ')}`);
    return await new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      const child = spawn(executable, args, { cwd, env: env ?? process.env, windowsHide: true, shell: false });
      child.stdout?.on('data', (data: Buffer) => { const text = data.toString(); stdout += text; (channel ?? this.output).append(text); });
      child.stderr?.on('data', (data: Buffer) => { const text = data.toString(); stderr += text; (channel ?? this.output).append(text); });
      child.on('error', (error) => { this.output.appendLine(`[CPM Remote] ${label} failed: ${error.message}`); resolve({ success: false, code: null, stdout, stderr: `${stderr}${error.message}` }); });
      child.on('close', (code) => { const success = code === 0; this.output.appendLine(`[CPM Remote] ${label} exited with code ${String(code)}.`); resolve({ success, code, stdout, stderr }); });
      if (captureProgramOutput) this.gdbServerProcesses.add(child);
      child.on('close', () => this.gdbServerProcesses.delete(child));
    });
  }
}

function sshDestination(config: CpmRemoteLinuxConfiguration): string {
  return config.sshHost ? `${config.sshUser ? `${config.sshUser}@` : ''}${config.sshHost}` : '';
}

function resolveExecutable(command: string): string | undefined {
  const raw = String(command || '').trim();
  if (!raw) return undefined;
  if (path.isAbsolute(raw) && fs.existsSync(raw)) return raw;
  if ((raw.includes('/') || raw.includes('\\')) && fs.existsSync(raw)) return path.resolve(raw);
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const ext of extensions) {
      const candidate = path.join(dir, process.platform === 'win32' && !path.extname(raw) ? `${raw}${ext}` : raw);
      try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* ignore */ }
    }
  }
  return undefined;
}

function shellQuote(value: string): string { return `'${String(value).replace(/'/g, `'"'"'`)}'`; }
function shellWord(value: string): string { return value.startsWith('$') ? `"${value}"` : shellQuote(value); }
function remotePathArg(value: string): string {
  const raw = String(value || '').replace(/\\/g, '/');
  if (raw === '~') return '"$HOME"';
  if (raw.startsWith('~/')) return `"$HOME/${escapeDoubleQuoted(raw.slice(2))}"`;
  if (raw.startsWith('$HOME/')) return `"$HOME/${escapeDoubleQuoted(raw.slice(6))}"`;
  return shellQuote(raw);
}
function renderMappedSearchPath(prefix: '-I' | '-L', value: string): string {
  if (value === '$PROJECT_DIR') return `${prefix}"$PROJECT_DIR"`;
  if (value.startsWith('$PROJECT_DIR/')) return `${prefix}"$PROJECT_DIR/${escapeDoubleQuoted(value.slice('$PROJECT_DIR/'.length))}"`;
  return `${prefix}${shellQuote(value)}`;
}
function renderRawSearchPath(prefix: '-I' | '-L', value: string): string { return `${prefix}${remotePathArg(value)}`; }
function renderShellToken(value: string): string {
  if (/^-I(?:"?\$PROJECT_DIR|')/.test(value) || /^-L(?:"?\$PROJECT_DIR|')/.test(value)) return value;
  if (/^-I"\$HOME|^-L"\$HOME/.test(value)) return value;
  if (/^-I'|^-L'/.test(value)) return value;
  return shellWord(value);
}
function renderArgument(value: string): string { return /\s/.test(value) ? JSON.stringify(value) : value; }
function escapeDoubleQuoted(value: string): string { return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`'); }
function sanitizeTargetName(value: string): string { return (value || 'app').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '') || 'app'; }
function sanitizeObjectName(value: string): string { return value.replace(/[^A-Za-z0-9._-]+/g, '_'); }
function isSource(filePath: string): boolean { return ['.c', '.cc', '.cpp', '.cxx', '.c++'].includes(path.extname(filePath).toLowerCase()); }
function isCppSource(filePath: string): boolean { return ['.cc', '.cpp', '.cxx', '.c++'].includes(path.extname(filePath).toLowerCase()); }
function isInside(root: string, filePath: string): boolean { const rel = path.relative(root, filePath); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); }
function isNonPortableWindowsAbsolutePath(value: string): boolean { const v = value.trim(); return /^[A-Za-z]:[\\/]/.test(v) || /^\\\\/.test(v); }
function normalizeLibraryFlag(value: string): string { const v = value.trim(); return !v || v.startsWith('-') || v.includes('/') || v.includes('\\') ? v : `-l${v}`; }
function standardFlag(value: string): string { return value && value !== 'auto' ? `-std=${value}` : ''; }
function warningFlags(value: string): string[] { if (value === 'wall') return ['-Wall']; if (value === 'wall-extra') return ['-Wall','-Wextra']; if (value === 'wall-extra-pedantic') return ['-Wall','-Wextra','-Wpedantic']; if (value === 'all') return ['-Wall','-Wextra','-Wpedantic','-Wconversion']; return []; }
function optimizationFlags(value: string, mode: CpmBuildMode): string[] { if (value === 'none') return []; if (value && value !== 'mode-default') return [`-${value}`]; return mode === 'release' || mode === 'release64' ? ['-O2'] : ['-O0']; }
function debugFlags(value: string, mode: CpmBuildMode): string[] { if (value === 'none') return []; if (value && value !== 'mode-default') return [`-${value}`]; return mode === 'debug' || mode === 'debug64' ? ['-g'] : []; }
function mapLocalPathsToRemote(values: string[], localRoot: string, remoteRootToken: string): { mapped: string[]; skipped: string[] } {
  const mapped: string[] = [], skipped: string[] = [];
  for (const raw of values) {
    const value = raw.trim(); if (!value) continue;
    const resolved = path.isAbsolute(value) || path.win32.isAbsolute(value) ? value : path.resolve(localRoot, value);
    if (isInside(localRoot, resolved)) {
      const rel = path.relative(localRoot, resolved).replace(/\\/g, '/');
      mapped.push(rel ? `${remoteRootToken}/${rel}` : remoteRootToken);
    } else skipped.push(value);
  }
  return { mapped, skipped };
}
function expandBasicTemplate(value: string, projectName: string, mode: CpmBuildMode): string { return value.replace(/\$\{projectName\}/g, sanitizeTargetName(projectName)).replace(/\$\{buildMode\}/g, mode); }
function expandRemoteTemplate(value: string, projectName: string, mode: CpmBuildMode, projectDir: string, buildDir: string, target: string): string { return expandBasicTemplate(value, projectName, mode).replace(/\$\{projectDir\}/g, projectDir).replace(/\$\{buildDir\}/g, buildDir).replace(/\$\{target\}/g, target); }
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
