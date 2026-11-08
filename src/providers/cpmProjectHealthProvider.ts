import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CpmParser } from '../model/cpmParser';
import { CpmWorkspaceProjectRef } from '../model/types';
import { CpmBuildService } from '../services/cpmBuildService';
import { CpmCppToolsService } from '../services/cpmCppToolsService';
import { CpmDependencyService } from '../services/cpmDependencyService';
import { CpmInstallationService } from '../services/cpmInstallationService';
import { CpmProjectSettingsService, DEFAULT_EXTERNAL_DEPENDENCIES } from '../services/cpmProjectSettingsService';
import { CpmRemoteLinuxService } from '../services/cpmRemoteLinuxService';
import { CpmCMakeService } from '../services/cpmCMakeService';
import { CpmWorkspaceService } from '../services/cpmWorkspaceService';

export type CpmHealthSeverity = 'ok' | 'info' | 'warning' | 'error';

export interface CpmHealthItem {
  id: string;
  label: string;
  description: string;
  severity: CpmHealthSeverity;
  detail?: string;
  command?: vscode.Command;
}

export class CpmProjectHealthProvider implements vscode.TreeDataProvider<CpmHealthItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<CpmHealthItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private view?: vscode.TreeView<CpmHealthItem>;

  constructor(
    private readonly workspaces: CpmWorkspaceService,
    private readonly parser: CpmParser,
    private readonly installations: CpmInstallationService,
    private readonly builds: CpmBuildService,
    private readonly projectSettings: CpmProjectSettingsService,
    private readonly cppTools: CpmCppToolsService,
    private readonly dependencies?: CpmDependencyService,
    private readonly remoteLinux?: CpmRemoteLinuxService,
    private readonly cmake?: CpmCMakeService
  ) {
    this.disposables.push(this.workspaces.onDidChange(() => this.refresh()));
  }

  attachView(view: vscode.TreeView<CpmHealthItem>): void {
    this.view = view;
    this.updateDescription();
  }

  refresh(): void {
    this.updateDescription();
    this.emitter.fire();
  }

  getTreeItem(element: CpmHealthItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.id = element.id;
    item.description = element.description;
    item.tooltip = element.detail ?? `${element.label}: ${element.description}`;
    item.contextValue = `cpmProjectHealth.${element.severity}`;
    item.iconPath = new vscode.ThemeIcon(iconForSeverity(element.severity));
    item.command = element.command;
    return item;
  }

  getChildren(): CpmHealthItem[] {
    return this.collect();
  }

  async openReport(): Promise<void> {
    const ref = this.workspaces.activeProjectRef;
    const workspace = this.workspaces.currentWorkspace;
    const items = this.collect();
    const counts = countSeverities(items);
    const lines = [
      '# C/C++ Project Health',
      '',
      `Workspace: ${workspace?.path ?? 'none'}`,
      `Project: ${ref?.name ?? 'none'}`,
      `Manifest: ${ref?.absolutePath ?? 'none'}`,
      `Build mode: ${this.builds.buildMode}`,
      `Summary: ${counts.error} error(s) · ${counts.warning} warning(s) · ${counts.info} info · ${counts.ok} OK`,
      '',
      '| Status | Check | Result |',
      '|---|---|---|',
      ...items.map((item) => `| ${item.severity.toUpperCase()} | ${escapeTable(item.label)} | ${escapeTable(item.description)} |`),
      '',
      ...items.filter((item) => item.detail).flatMap((item) => [`## ${item.label}`, '', item.detail!, ''])
    ];
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async repair(): Promise<void> {
    const repairable = this.collect().filter((item) => item.severity !== 'ok' && item.command);
    if (!repairable.length) {
      vscode.window.showInformationMessage('CPM Project Health found no repair action to apply.');
      return;
    }
    const choice = await vscode.window.showQuickPick(
      repairable.map((item) => ({
        label: `${severityGlyph(item.severity)} ${item.label}`,
        description: item.description,
        detail: item.detail,
        item
      })),
      { title: 'Repair C/C++ Project Health', placeHolder: 'Select a finding to open its repair or configuration action' }
    );
    if (!choice?.item.command) return;
    await vscode.commands.executeCommand(choice.item.command.command, ...(choice.item.command.arguments ?? []));
    this.refresh();
  }

  dispose(): void {
    this.emitter.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }

  private updateDescription(): void {
    if (!this.view) return;
    const items = this.collect();
    const counts = countSeverities(items);
    this.view.description = counts.error || counts.warning
      ? `${counts.error} error · ${counts.warning} warning`
      : items.length ? 'Healthy' : undefined;
  }

  private collect(): CpmHealthItem[] {
    const workspace = this.workspaces.currentWorkspace;
    const ref = this.workspaces.activeProjectRef;
    if (!workspace) {
      return [health('workspace', 'Active workspace', 'No C/C++ workspace loaded', 'warning', 'Open a .cws workspace or .prj project.', 'cpm.openWorkspace')];
    }
    if (!ref) {
      return [health('project', 'Active project', 'No active project selected', 'error', workspace.path, 'cpm.openWorkspace')];
    }
    if (!ref.exists) {
      return [health('project', 'Active project', 'Project file is missing', 'error', ref.absolutePath, 'cpm.openWorkspace')];
    }

    const project = this.workspaces.getProject(ref);
    if (!project) {
      return [health('project', 'Active project', 'Project cannot be parsed', 'error', ref.absolutePath, 'cpm.openActiveProjectFile')];
    }

    const root = path.dirname(ref.absolutePath);
    const build = this.builds.getHealthSnapshot(ref);
    const settings = this.projectSettings.getSettings(ref);
    const items: CpmHealthItem[] = [];

    items.push(health('project', 'Active project', `${ref.name} · ${project.targetType}`, 'ok', ref.absolutePath, 'cpm.openActiveProjectFile'));

    const missingWorkspaceRefs = workspace.projects.filter((entry) => !entry.exists);
    items.push(health(
      'workspace-projects',
      'Workspace projects',
      missingWorkspaceRefs.length ? `${missingWorkspaceRefs.length} missing / ${workspace.projects.length}` : `${workspace.projects.length} project(s) available`,
      missingWorkspaceRefs.length ? 'error' : 'ok',
      missingWorkspaceRefs.length ? missingWorkspaceRefs.map((entry) => entry.absolutePath).join('\n') : workspace.path,
      missingWorkspaceRefs.length ? 'cpm.openWorkspaceFile' : undefined
    ));

    if (path.extname(workspace.path).toLowerCase() === '.cws') {
      const compatibilityIssues = this.parser.inspectWorkspaceCompatibility(workspace.path);
      items.push(health(
        'workspace-compatibility',
        'Workspace compatibility',
        compatibilityIssues.length ? `${compatibilityIssues.length} compatibility issue(s)` : 'Native workspace format compatible',
        compatibilityIssues.length ? 'warning' : 'ok',
        compatibilityIssues.length ? compatibilityIssues.join('\n') : 'No native CPM compatibility issue detected.',
        compatibilityIssues.length ? 'cpm.repairWorkspaceCompatibility' : 'cpm.openWorkspaceFile'
      ));
    }

    const allFiles = project.files;
    const missingFiles = allFiles.filter((file) => !file.exists);
    const sourceFiles = allFiles.filter((file) => !file.excluded && file.compileIntoObjectFile && isCompilableSource(file.absolutePath));
    const cppSources = sourceFiles.filter((file) => isCppSource(file.absolutePath));
    const cSources = sourceFiles.filter((file) => isCSource(file.absolutePath));
    items.push(health(
      'files',
      'Project files',
      missingFiles.length ? `${missingFiles.length} missing / ${allFiles.length}` : `${allFiles.length} registered · ${sourceFiles.length} compiled`,
      missingFiles.length ? 'error' : sourceFiles.length ? 'ok' : 'warning',
      missingFiles.length ? missingFiles.map((file) => file.absolutePath).join('\n') : `${cSources.length} C source(s)\n${cppSources.length} C++ source(s)\n${allFiles.filter((file) => file.excluded).length} excluded file(s)`,
      missingFiles.length || !sourceFiles.length ? 'cpm.openActiveProjectFile' : undefined
    ));

    try {
      const order = this.projectSettings.getBuildOrder(ref);
      const knownDependencies = new Set(workspace.projects.map((entry) => this.projectSettings.dependencyKey(entry)));
      const missingDependencies = settings.dependencies.filter((key) => !knownDependencies.has(key));
      items.push(health(
        'dependencies',
        'Build dependencies',
        missingDependencies.length ? `${missingDependencies.length} unresolved` : `${Math.max(0, order.length - 1)} dependency project(s)`,
        missingDependencies.length ? 'warning' : 'ok',
        missingDependencies.length ? `Unresolved dependency keys:\n${missingDependencies.join('\n')}` : `Build order: ${order.map((entry) => entry.name).join(' -> ')}`,
        missingDependencies.length ? 'cpm.editBuildSettings' : undefined
      ));
    } catch (error) {
      items.push(health('dependencies', 'Build dependencies', 'Circular dependency detected', 'error', error instanceof Error ? error.message : String(error), 'cpm.editBuildSettings'));
    }

    const externalDependencies = settings.externalDependencies ?? DEFAULT_EXTERNAL_DEPENDENCIES;
    const dependencyStatus = this.dependencies?.status;
    if (!externalDependencies.enabled) {
      items.push(health('external-dependencies', 'External dependencies', 'Disabled', 'info', 'Enable vcpkg, Conan 2 or pkg-config from the Packages page when the project needs external packages.', 'cpm.dependencies.configure'));
    } else if (dependencyStatus && dependencyStatus.projectPath === ref.absolutePath) {
      const severity = dependencyStatus.state === 'error' ? 'error' : dependencyStatus.state === 'missing-tool' || dependencyStatus.state === 'needs-sync' ? 'warning' : 'ok';
      items.push(health(
        'external-dependencies',
        'External dependencies',
        `${dependencyStatus.state} · ${dependencyStatus.configuredPackages} package declaration(s)`,
        severity,
        `${dependencyStatus.message}\nManagers: ${dependencyStatus.managers.join(' + ') || 'none'}\nvcpkg: ${dependencyStatus.vcpkgPath || 'not found'}\nConan 2: ${dependencyStatus.conanPath || 'not found'}\npkg-config: ${dependencyStatus.pkgConfigPath || 'not found'}\nIntegration: ${dependencyStatus.integrationFile}`,
        dependencyStatus.state === 'missing-tool' ? 'cpm.dependencies.detectTools' : dependencyStatus.state === 'needs-sync' ? 'cpm.dependencies.install' : 'cpm.dependencies.openReport'
      ));
    } else {
      items.push(health('external-dependencies', 'External dependencies', 'Enabled · status pending', 'info', 'Open the C/C++ Dependencies view or refresh Project Health.', 'cpm.dependencies.detectTools'));
    }

    const remoteConfig = settings.remoteLinux;
    const remoteStatus = this.remoteLinux?.status;
    if (!remoteConfig?.enabled) {
      items.push(health('remote-linux', 'Remote Linux / Raspberry Pi', 'Disabled', 'info', 'Enable the Remote Linux page to synchronize, build, run and debug on a Linux or Raspberry Pi target.', 'cpm.remote.configure'));
    } else if (remoteStatus && remoteStatus.projectName === ref.name) {
      const severity: CpmHealthSeverity = remoteStatus.state === 'error' ? 'error' : remoteStatus.state === 'warning' ? 'warning' : remoteStatus.state === 'ready' ? 'ok' : 'info';
      items.push(health(
        'remote-linux',
        'Remote Linux / Raspberry Pi',
        `${remoteStatus.destination || '<endpoint missing>'} · ${remoteStatus.state}`,
        severity,
        `${remoteStatus.message}\nRemote project: ${remoteStatus.remoteProjectDirectory}\nRemote target: ${remoteStatus.remoteTargetPath}\nSSH: ${remoteStatus.sshPath || 'not found'}\nSCP: ${remoteStatus.scpPath || 'not found'}\nrsync: ${remoteStatus.rsyncPath || 'not found / optional'}`,
        remoteStatus.state === 'ready' ? 'cpm.remote.openReport' : remoteStatus.state === 'warning' ? 'cpm.remote.testConnection' : 'cpm.remote.configure'
      ));
    } else {
      items.push(health('remote-linux', 'Remote Linux / Raspberry Pi', 'Enabled · status pending', 'info', 'Refresh Project Health or open the Remote Linux view.', 'cpm.remote.testConnection'));
    }

    const cmakeHealth = this.cmake?.getHealthSnapshot(ref);
    if (settings.buildBackend === 'cmake') {
      const cmakeProblems: string[] = [];
      if (!cmakeHealth?.cmakeResolved) cmakeProblems.push(`CMake executable not found: ${cmakeHealth?.cmakeExecutable ?? settings.cmake.executable}`);
      if (!cmakeHealth?.cmakeListsExists) cmakeProblems.push(`CMakeLists.txt not found: ${cmakeHealth?.cmakeListsPath ?? '<unknown>'}`);
      if ((settings.cmake.generator === 'Ninja' || settings.cmake.generator === 'Ninja Multi-Config') && !cmakeHealth?.ninjaResolved) cmakeProblems.push(`Ninja executable not found: ${settings.cmake.ninjaExecutable}`);
      const ambiguous = cmakeHealth?.cacheExists && !settings.cmake.target && !cmakeHealth.resolvedArtifact && (cmakeHealth.discoveredTargets?.length ?? 0) > 1;
      if (ambiguous) cmakeProblems.push('Multiple CMake targets were discovered and CPM could not infer a unique target. Configure the CMake target name.');
      items.push(health(
        'build-backend',
        'Build backend',
        cmakeProblems.length ? `CMake / Ninja · ${cmakeProblems.length} issue(s)` : `CMake / Ninja · ${cmakeHealth?.activeGenerator ?? settings.cmake.generator}`,
        cmakeProblems.length ? 'warning' : 'ok',
        [
          `CMake: ${cmakeHealth?.cmakeResolved ?? cmakeHealth?.cmakeExecutable ?? settings.cmake.executable}`,
          `Generator: ${cmakeHealth?.activeGenerator ?? settings.cmake.generator}`,
          `Source: ${cmakeHealth?.sourceDirectory ?? settings.cmake.sourceDirectory}`,
          `Build: ${cmakeHealth?.buildDirectory ?? settings.cmake.buildDirectory}`,
          `Target: ${settings.cmake.target || '<automatic>'}`,
          `Artifact: ${cmakeHealth?.resolvedArtifact ?? '<not resolved>'}`,
          `Toolchain: ${cmakeHealth?.dependencyToolchain ?? '<CMake/default>'}`,
          ...(cmakeProblems.length ? ['', ...cmakeProblems] : [])
        ].join('\n'),
        cmakeProblems.length ? 'cpm.editBuildSettings' : 'cpm.cmake.openReport'
      ));
    } else {
      items.push(health('build-backend', 'Build backend', 'Direct GCC / Clang', 'ok', 'CPM native build engine with .d incremental tracking, parallel compilation, response files, PCH and Unity Build.', 'cpm.editBuildSettings'));
    }

    const installation = this.installations.getActiveInstallation(workspace.cpmDir, false);
    const cCompiler = resolveExecutable(build?.cCompilerPath || installation?.cCompilerExe || installation?.compileExe || 'gcc');
    const cppCompiler = resolveExecutable(build?.cppCompilerPath || installation?.cppCompilerExe || 'g++');
    const archiver = resolveExecutable(build?.archiverPath || installation?.archiverExe || 'ar');
    const debuggerPath = resolveExecutable(build?.debuggerPath || installation?.debuggerExe || 'gdb');
    const compilerFailures: string[] = [];
    if (cSources.length && !cCompiler) compilerFailures.push(`C compiler not found: ${build?.cCompilerPath || 'gcc'}`);
    if (cppSources.length && !cppCompiler) compilerFailures.push(`C++ compiler not found: ${build?.cppCompilerPath || 'g++'}`);
    if (project.targetType === 'Static Library' && !archiver) compilerFailures.push(`Archiver not found: ${build?.archiverPath || 'ar'}`);
    if (project.targetType === 'Static Library' && settings.staticLibraryFormat === 'windows-lib') {
      const selectedBase = path.basename(archiver ?? build?.archiverPath ?? '').toLowerCase();
      const compatible = selectedBase === 'lib.exe' || selectedBase === 'lib' || selectedBase === 'llvm-lib.exe' || selectedBase === 'llvm-lib';
      if (!compatible && !resolveExecutable('llvm-lib') && !resolveExecutable('lib')) compilerFailures.push('Static .lib format requires lib.exe or llvm-lib; neither was detected.');
    }
    const compilerDetail = [
      `Selected installation: ${installation?.label ?? 'none'}`,
      `C compiler: ${cCompiler ?? build?.cCompilerPath ?? 'not configured'}`,
      `C++ compiler: ${cppCompiler ?? build?.cppCompilerPath ?? 'not configured'}`,
      `Archiver: ${archiver ?? build?.archiverPath ?? 'not configured'}`,
      `Debugger: ${debuggerPath ?? build?.debuggerPath ?? 'not configured'}`
    ].join('\n');
    items.push(health(
      'toolchain',
      'Compiler toolchain',
      compilerFailures.length ? `${compilerFailures.length} required tool(s) missing` : installation ? installation.label : 'Compiler commands available from configuration/PATH',
      compilerFailures.length ? 'error' : 'ok',
      compilerFailures.length ? `${compilerFailures.join('\n')}\n\n${compilerDetail}` : compilerDetail,
      compilerFailures.length ? 'cpm.configureInstallation' : undefined
    ));

    if (build) {
      const archWarning = architectureWarning(build.buildMode, build.architectureMode, cppCompiler ?? cCompiler ?? build.cppCompilerPath ?? build.cCompilerPath);
      items.push(health(
        'architecture',
        'Target architecture',
        archWarning ?? `${build.buildMode} · ${build.architectureMode}`,
        archWarning ? 'warning' : 'ok',
        `Build mode: ${build.buildMode}\nArchitecture mode: ${build.architectureMode}\nCompiler: ${cppCompiler ?? cCompiler ?? 'not resolved'}`,
        archWarning ? 'cpm.editBuildSettings' : undefined
      ));

      const missingIncludes = build.includePaths.map((entry) => resolveConfiguredPath(entry, root)).filter((entry) => entry && !fs.existsSync(entry));
      const missingLibraryPaths = build.libraryPaths.map((entry) => resolveConfiguredPath(entry, root)).filter((entry) => entry && !fs.existsSync(entry));
      items.push(health(
        'search-paths',
        'Include / library paths',
        missingIncludes.length || missingLibraryPaths.length
          ? `${missingIncludes.length} include + ${missingLibraryPaths.length} library path(s) missing`
          : `${build.includePaths.length} include + ${build.libraryPaths.length} library path(s)`,
        missingIncludes.length ? 'error' : missingLibraryPaths.length ? 'warning' : 'ok',
        [
          ...(missingIncludes.length ? ['Missing include paths:', ...missingIncludes] : []),
          ...(missingLibraryPaths.length ? ['Missing library paths:', ...missingLibraryPaths] : []),
          `Libraries: ${build.libraries.length ? build.libraries.join(', ') : '<none>'}`
        ].join('\n') || 'No additional search path configured.',
        missingIncludes.length || missingLibraryPaths.length ? 'cpm.editBuildSettings' : undefined
      ));

      items.push(settings.buildBackend === 'cmake' ? health(
        'build-engine',
        'Build engine',
        `${settings.parallelJobs > 0 ? `${settings.parallelJobs} job(s)` : 'automatic jobs'} · CMake ${build.cmakeGenerator ?? settings.cmake.generator}`,
        'ok',
        `CMake build directory: ${build.cmakeBuildDirectory ?? settings.cmake.buildDirectory}\nTarget: ${build.cmakeTarget || settings.cmake.target || '<automatic>'}\nCPM delegates incremental rebuild decisions to CMake and its selected generator.`,
        'cpm.cmake.openReport'
      ) : health(
        'build-engine',
        'Build engine',
        `${settings.parallelJobs > 0 ? `${settings.parallelJobs} job(s)` : 'automatic jobs'} · ${settings.useResponseFiles ? 'response files enabled' : 'response files disabled'}`,
        settings.useResponseFiles ? 'ok' : 'info',
        `Object directory: ${build.objectDirectory}\nOutput directory: ${build.outputDirectory}\nExact GCC/Clang .d dependency tracking is enabled by the CPM build engine.`,
        'cpm.editBuildSettings'
      ));

      const pchConfigured = [settings.cPrecompiledHeader, settings.cppPrecompiledHeader].filter(Boolean);
      const missingPch = pchConfigured.filter((value) => !fs.existsSync(path.isAbsolute(value) ? value : path.resolve(path.dirname(ref.absolutePath), value)));
      items.push(settings.buildBackend === 'cmake' ? health(
        'build-acceleration',
        'Build acceleration',
        'Managed by CMake project',
        'info',
        'CPM PCH/Unity settings apply only to the Direct GCC/Clang backend. For CMake, use target_precompile_headers() and UNITY_BUILD/CMAKE_UNITY_BUILD in CMakeLists.txt.',
        'cpm.cmake.openReport'
      ) : health(
        'build-acceleration',
        'Build acceleration',
        `${settings.precompiledHeadersEnabled ? `PCH ${pchConfigured.length ? 'configured' : 'enabled without header'}` : 'PCH off'} · ${settings.unityBuildEnabled ? `Unity batch ${settings.unityBatchSize}` : 'Unity off'}`,
        missingPch.length ? 'warning' : settings.precompiledHeadersEnabled && !pchConfigured.length ? 'info' : 'ok',
        [`C PCH: ${settings.cPrecompiledHeader || '<none>'}`, `C++ PCH: ${settings.cppPrecompiledHeader || '<none>'}`, `Unity Build: ${settings.unityBuildEnabled ? `enabled, batch size ${settings.unityBatchSize}` : 'disabled'}`, ...(missingPch.length ? ['Missing PCH header(s):', ...missingPch] : [])].join('\n'),
        'cpm.editBuildSettings'
      ));

      const linkageDetail = [
        `Mode: ${build.linkageMode}`,
        `Built target: ${build.targetPath}`,
        `External DLL imports: ${build.externalRuntimeDlls.length ? build.externalRuntimeDlls.join(', ') : build.targetExists ? '<none detected>' : '<target not built>'}`
      ].join('\n');
      if (project.targetType === 'Static Library') {
        items.push(health('linkage', 'Linkage', `Static-library target (${settings.staticLibraryFormat === 'windows-lib' ? '.lib' : settings.staticLibraryFormat === 'gnu-a' ? '.a' : 'automatic .a/.lib'})`, 'ok', `${linkageDetail}\nStatic library format: ${settings.staticLibraryFormat}`, 'cpm.editBuildSettings'));
      } else if (build.linkageMode === 'static' && build.targetExists && build.externalRuntimeDlls.length) {
        items.push(health('linkage', 'Linkage', `${build.externalRuntimeDlls.length} non-system DLL dependency/dependencies remain`, 'warning', linkageDetail, 'cpm.inspectRuntimeDependencies'));
      } else if (build.linkageMode === 'static-runtime' && build.targetExists && build.externalRuntimeDlls.some(isKnownCompilerRuntimeDll)) {
        items.push(health('linkage', 'Linkage', 'Compiler runtime DLL dependency remains', 'warning', linkageDetail, 'cpm.inspectRuntimeDependencies'));
      } else {
        items.push(health('linkage', 'Linkage', linkageLabel(build.linkageMode), build.linkageMode === 'dynamic' ? 'info' : 'ok', linkageDetail, 'cpm.selectLinkageMode'));
      }

      if (project.targetType === 'Dynamic Link Library') {
        const importLabel = settings.dllImportLibraryFormat === 'gnu-a' ? '.a' : settings.dllImportLibraryFormat === 'gnu-dll-a' ? '.dll.a' : settings.dllImportLibraryFormat === 'windows-lib' ? '.lib' : settings.dllImportLibraryFormat === 'gnu-both' ? '.dll.a + .a' : settings.dllImportLibraryFormat === 'both' ? '.dll.a + .lib' : settings.dllImportLibraryFormat === 'gnu-a-windows-lib' ? '.a + .lib' : settings.dllImportLibraryFormat === 'all' ? '.dll.a + .a + .lib' : settings.dllImportLibraryFormat === 'none' ? 'disabled' : 'automatic';
        items.push(health('dll-import-library', 'DLL import library', importLabel, settings.dllImportLibraryFormat === 'none' ? 'info' : 'ok', `Configured output: ${settings.dllImportLibraryFormat}\nThe DLL remains the runtime binary; .dll.a/.a/.lib are link-time import libraries.`, 'cpm.editBuildSettings'));
      }

      items.push(health(
        'artifact',
        'Built target',
        build.targetExists ? path.basename(build.targetPath) : 'Not built yet',
        build.targetExists ? 'ok' : 'info',
        build.targetPath,
        build.targetExists && project.targetType !== 'Static Library' ? 'cpm.inspectRuntimeDependencies' : 'cpm.chooseBuildAction'
      ));
    }

    const run = settings.run;
    if (project.targetType === 'Dynamic Link Library') {
      const host = run.externalProcessPath.trim() ? resolveConfiguredPath(run.externalProcessPath, root) : '';
      const validHost = Boolean(host && fs.existsSync(host) && fs.statSync(host).isFile());
      items.push(health(
        'run-profile',
        'DLL host program',
        validHost ? path.basename(host) : run.externalProcessPath.trim() ? 'Configured host not found' : 'Program name not configured',
        validHost ? 'ok' : 'warning',
        `Program name: ${host || '<not configured>'}\nArguments: ${run.arguments || '<none>'}\nWorking directory: ${run.workingDirectory || '<project directory>'}`,
        validHost ? 'cpm.chooseRunAction' : 'cpm.editBuildSettings'
      ));
    } else if (project.targetType === 'Static Library') {
      items.push(health('run-profile', 'Run profile', 'Not applicable to static libraries', 'info', 'Static libraries are linked into another executable or DLL.', 'cpm.editBuildSettings'));
    } else {
      items.push(health('run-profile', 'Run profile', run.arguments || run.workingDirectory || run.environmentOptions ? 'Configured' : 'Default', 'ok', `Arguments: ${run.arguments || '<none>'}\nWorking directory: ${run.workingDirectory || '<target/project directory>'}\nEnvironment: ${run.environmentOptions || '<inherit>'}`, 'cpm.editBuildSettings'));
    }

    items.push(health(
      'debugger',
      'Debugger',
      debuggerPath ? path.basename(debuggerPath) : 'GDB/LLDB not found',
      debuggerPath ? 'ok' : 'warning',
      debuggerPath ?? `Configured debugger: ${build?.debuggerPath ?? 'gdb'}`,
      debuggerPath ? undefined : 'cpm.configureInstallation'
    ));

    const cppHealth = this.cppTools.getHealthSnapshot(workspace);
    if (cppHealth) {
      const cppProblems: string[] = [];
      if (!cppHealth.cppToolsExtensionInstalled) cppProblems.push('Microsoft C/C++ extension is not installed.');
      if (!cppHealth.configurationExists || !cppHealth.managedConfigurationPresent) cppProblems.push('Managed c_cpp_properties.json configuration is missing or incomplete.');
      if (cppHealth.staleProviderReference) cppProblems.push('A stale dynamic CPM configuration provider reference is still selected.');
      if (!cppHealth.configurationRootInWorkspace) cppProblems.push('The CPM configuration root is not an active VS Code workspace folder.');
      const severity: CpmHealthSeverity = !cppHealth.cppToolsExtensionInstalled ? 'warning' : cppHealth.staleProviderReference ? 'warning' : (!cppHealth.configurationExists || !cppHealth.managedConfigurationPresent) ? 'warning' : 'ok';
      const repairCommand = cppHealth.staleProviderReference
        ? 'cpm.repairCppToolsProvider'
        : (!cppHealth.configurationExists || !cppHealth.managedConfigurationPresent)
          ? 'cpm.syncCppTools'
          : !cppHealth.configurationRootInWorkspace
            ? 'cpm.addWorkspaceFolderForIntelliSense'
            : undefined;
      items.push(health(
        'intellisense',
        'C/C++ IntelliSense',
        cppProblems.length ? `${cppProblems.length} issue(s)` : 'Configuration synchronized',
        severity,
        `${cppProblems.join('\n')}${cppProblems.length ? '\n\n' : ''}Configuration: ${cppHealth.configurationPath}\nCompiler: ${cppHealth.compilerPath ?? cppCompiler ?? cCompiler ?? 'not resolved'}\nAutocomplete profile: ${vscode.workspace.getConfiguration('cpm').get<string>('autocompleteProfile', 'hybrid')}`,
        repairCommand
      ));
    }

    const nativeTarget = this.parser.getNativeTargetSettings(ref.absolutePath, this.builds.buildMode);
    const iconCandidates = [nativeTarget.iconFile, nativeTarget.windowIconFile].map((entry) => entry?.trim()).filter((entry): entry is string => Boolean(entry));
    const missingIcons = iconCandidates.map((entry) => resolveConfiguredPath(entry, root)).filter((entry) => !fs.existsSync(entry));
    if (iconCandidates.length) {
      items.push(health(
        'branding',
        'Application icons',
        missingIcons.length ? `${missingIcons.length} configured icon file(s) missing` : `${iconCandidates.length} icon file(s) available`,
        missingIcons.length ? 'warning' : 'ok',
        (missingIcons.length ? missingIcons : iconCandidates.map((entry) => resolveConfiguredPath(entry, root))).join('\n'),
        missingIcons.length ? 'cpm.editBuildSettings' : undefined
      ));
    }

    return items;
  }
}

function health(id: string, label: string, description: string, severity: CpmHealthSeverity, detail?: string, command?: string): CpmHealthItem {
  return {
    id,
    label,
    description,
    severity,
    detail,
    command: command ? { command, title: label } : undefined
  };
}

function iconForSeverity(severity: CpmHealthSeverity): string {
  switch (severity) {
    case 'error': return 'error';
    case 'warning': return 'warning';
    case 'info': return 'info';
    default: return 'pass';
  }
}

function severityGlyph(severity: CpmHealthSeverity): string {
  return severity === 'error' ? '$(error)' : severity === 'warning' ? '$(warning)' : severity === 'info' ? '$(info)' : '$(pass)';
}

function countSeverities(items: CpmHealthItem[]): Record<CpmHealthSeverity, number> {
  return items.reduce<Record<CpmHealthSeverity, number>>((result, item) => {
    result[item.severity] += 1;
    return result;
  }, { ok: 0, info: 0, warning: 0, error: 0 });
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function isCompilableSource(filePath: string): boolean {
  return ['.c', '.cc', '.cpp', '.cxx'].includes(path.extname(filePath).toLowerCase());
}

function isCSource(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.c';
}

function isCppSource(filePath: string): boolean {
  return ['.cc', '.cpp', '.cxx'].includes(path.extname(filePath).toLowerCase());
}

export function resolveConfiguredPath(value: string, baseDirectory: string): string {
  const expanded = expandEnvironment(value.trim());
  if (!expanded) return '';
  if (path.isAbsolute(expanded) || path.win32.isAbsolute(expanded)) return path.normalize(expanded);
  return path.resolve(baseDirectory, expanded);
}

function expandEnvironment(value: string): string {
  let result = value;
  if (result.startsWith('~')) result = path.join(os.homedir(), result.slice(1));
  result = result.replace(/%([^%]+)%/g, (_match, name: string) => process.env[name] ?? process.env[name.toUpperCase()] ?? _match);
  result = result.replace(/\$\{([^}]+)\}/g, (_match, name: string) => process.env[name] ?? _match);
  result = result.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => process.env[name] ?? _match);
  return result;
}

export function resolveExecutable(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (fs.existsSync(trimmed)) return path.resolve(trimmed);
  if (path.isAbsolute(trimmed) || trimmed.includes('/') || trimmed.includes('\\')) return undefined;
  const suffixes = process.platform === 'win32' && !path.extname(trimmed) ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const directory of (process.env.PATH ?? process.env.Path ?? '').split(path.delimiter).filter(Boolean)) {
    for (const suffix of suffixes) {
      const candidate = path.join(directory, `${trimmed}${suffix}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

export function architectureWarning(buildMode: string, architectureMode: string, compilerPath: string | undefined): string | undefined {
  const compiler = (compilerPath ?? '').replace(/\\/g, '/').toLowerCase();
  const wants64 = architectureMode === 'm64' || (architectureMode === 'from-build-mode' && /64$/.test(buildMode));
  const wants32 = architectureMode === 'm32' || (architectureMode === 'from-build-mode' && !/64$/.test(buildMode));
  const compilerLooks32 = /(?:^|[/_.-])(i[3-6]86|mingw32|win32)(?:[/_.-]|$)/.test(compiler);
  const compilerLooks64 = /(?:^|[/_.-])(x86_64|amd64|mingw64|ucrt64|clang64|win64)(?:[/_.-]|$)/.test(compiler);
  if (wants64 && compilerLooks32) return '64-bit build requested with an apparently 32-bit compiler';
  if (wants32 && compilerLooks64 && architectureMode === 'm32') return 'Explicit -m32 requested with a 64-bit toolchain; multilib support is required';
  return undefined;
}

function linkageLabel(value: string): string {
  if (value === 'static') return 'Fully static when available';
  if (value === 'static-runtime') return 'Static compiler runtime';
  return 'Dynamic linkage';
}

function isKnownCompilerRuntimeDll(name: string): boolean {
  const lower = path.basename(name).toLowerCase();
  return /^libgcc_s_.*\.dll$/.test(lower) || lower === 'libstdc++-6.dll' || lower === 'libwinpthread-1.dll';
}
