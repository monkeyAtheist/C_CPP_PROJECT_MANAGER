import * as path from 'path';
import * as vscode from 'vscode';
import { CpmParser } from './model/cpmParser';
import { CpmTreeProvider, FileNode, FolderNode, ProjectNode } from './providers/cpmTreeProvider';
import { CpmFileSymbolsProvider } from './providers/cpmFileSymbolsProvider';
import { CpmProjectHealthProvider } from './providers/cpmProjectHealthProvider';
import { CpmDependencyProvider } from './providers/cpmDependencyProvider';
import { CpmRemoteLinuxProvider } from './providers/cpmRemoteLinuxProvider';
import { CpmBuildService } from './services/cpmBuildService';
import { CpmCppToolsService } from './services/cpmCppToolsService';
import { CpmInstallationService } from './services/cpmInstallationService';
import { CpmWorkspaceService } from './services/cpmWorkspaceService';
import { HomePanel } from './views/homePanel';
import { activate as activateCpmLibraryExplorer } from './jcLibEmbedded';
import { ensureBundledCppLibraryPack } from './services/cpmLibraryPackService';
import { CpmTemplateService } from './services/cpmTemplateService';
import { CpmProjectSettingsService } from './services/cpmProjectSettingsService';
import { CpmSdlService } from './services/cpmSdlService';
import { BuildSettingsPanel } from './views/buildSettingsPanel';
import { QuickActionsView } from './views/quickActionsView';
import { CpmAutocompleteProfile, CpmCompletionProvider, CpmSignatureHelpProvider, CpmSourceSymbol, CpmSymbolService, getCpmAutocompleteSettings, isSourceOrHeader } from './services/cpmSymbolService';
import { CpmFunctionPanelService } from './services/cpmFunctionPanelService';
import { CpmWorkspace } from './model/types';
import { CpmColorValueService } from './services/cpmColorValueService';
import { CpmEditorUtilitiesService } from './services/cpmEditorUtilitiesService';
import { CpmDependencyService } from './services/cpmDependencyService';
import { CpmRemoteLinuxService } from './services/cpmRemoteLinuxService';
import { openSshDeviceManager } from './services/cpmSshDeviceManager';
import { CpmCMakeService } from './services/cpmCMakeService';
import { CpmToolchainInstallerService } from './services/cpmToolchainInstallerService';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('C/C++ Project Manager');
  const buildTraceOutput = vscode.window.createOutputChannel('C/C++ Project Manager - Build Trace');
  const programOutput = vscode.window.createOutputChannel('C/C++ Project Manager - Program Output');
  const buildDiagnostics = vscode.languages.createDiagnosticCollection('CPM Build');
  await migrateLegacyConfiguration(output);
  const parser = new CpmParser();
  const installations = new CpmInstallationService(output);
  const toolchainInstaller = new CpmToolchainInstallerService(context, output);
  const cppTools = new CpmCppToolsService(installations, parser, output);
  const templates = new CpmTemplateService(context, installations, output);
  const sdl = new CpmSdlService(output);
  const workspaces = new CpmWorkspaceService(context, parser, installations, templates, sdl, output);
  const projectSettings = new CpmProjectSettingsService(workspaces, parser, output);
  const dependencies = new CpmDependencyService(workspaces, projectSettings, output);
  const cmake = new CpmCMakeService(workspaces, projectSettings, output);
  cppTools.setExternalIncludePathsProvider(() => { const ref = workspaces.activeProjectRef; return ref?.exists ? dependencies.getIntegration(ref).includeDirectories : []; });
  const builds = new CpmBuildService(parser, workspaces, installations, projectSettings, undefined, output, buildTraceOutput, programOutput, buildDiagnostics, dependencies, cmake);
  const remoteLinux = new CpmRemoteLinuxService(workspaces, parser, projectSettings, builds, output, programOutput);
  const treeProvider = new CpmTreeProvider(workspaces);
  const treeView = vscode.window.createTreeView('cpm.workspaceExplorer', { treeDataProvider: treeProvider, dragAndDropController: treeProvider, showCollapseAll: true, canSelectMany: true });
  const symbols = new CpmSymbolService(context.extensionPath, workspaces);
  const fileSymbolsProvider = new CpmFileSymbolsProvider(symbols);
  const fileSymbolsView = vscode.window.createTreeView('cpm.fileSymbols', { treeDataProvider: fileSymbolsProvider });
  fileSymbolsProvider.attachView(fileSymbolsView);
  const projectHealthProvider = new CpmProjectHealthProvider(workspaces, parser, installations, builds, projectSettings, cppTools, dependencies, remoteLinux, cmake);
  const projectHealthView = vscode.window.createTreeView('cpm.projectHealth', { treeDataProvider: projectHealthProvider });
  projectHealthProvider.attachView(projectHealthView);
  const dependencyProvider = new CpmDependencyProvider(dependencies);
  const dependencyView = vscode.window.createTreeView('cpm.dependencies', { treeDataProvider: dependencyProvider });
  dependencyProvider.attachView(dependencyView);
  const remoteLinuxProvider = new CpmRemoteLinuxProvider(remoteLinux);
  const remoteLinuxView = vscode.window.createTreeView('cpm.remoteLinux', { treeDataProvider: remoteLinuxProvider });
  remoteLinuxProvider.attachView(remoteLinuxView);
  const completionProvider = new CpmCompletionProvider(symbols);
  const functionPanels = new CpmFunctionPanelService();
  const colorValues = new CpmColorValueService();
  const editorUtilities = new CpmEditorUtilitiesService();
  const completionRegistration = vscode.languages.registerCompletionItemProvider(
    [{ language: 'c', scheme: 'file' }, { language: 'cpp', scheme: 'file' }],
    completionProvider
  );
  const signatureHelpProvider = new CpmSignatureHelpProvider(symbols);
  const signatureHelpRegistration = vscode.languages.registerSignatureHelpProvider(
    [{ language: 'c', scheme: 'file' }, { language: 'cpp', scheme: 'file' }],
    signatureHelpProvider,
    '(', ','
  );
  const home = new HomePanel(context, workspaces, builds, installations);
  const buildSettings = new BuildSettingsPanel(workspaces, parser, projectSettings);
  const quickActions = new QuickActionsView(workspaces, builds, projectSettings);
  const quickActionsRegistration = vscode.window.registerTreeDataProvider('cpm.quickActions', quickActions);

  const statusBarItems = [
    createStatusBarAction('$(home)', 'C/C++ Project Manager home', 'cpm.openHome', 99),
    createStatusBarAction('$(folder-opened)', 'Open a C/C++ workspace or project', 'cpm.openWorkspace', 98),
    createStatusBarAction('$(tools)', 'Build / rebuild / clean', 'cpm.chooseBuildAction', 97),
    createStatusBarAction('$(play)', 'Run active target', 'cpm.run', 96),
    createStatusBarAction('$(list-selection)', 'Advanced run options', 'cpm.chooseRunAction', 95),
    createStatusBarAction('$(debug-alt)', 'Run Debug', 'cpm.runDebug', 94.5),
    createStatusBarAction('D32', 'Select build mode', 'cpm.selectBuildMode', 94),
    createStatusBarAction('EXE', 'Select target type', 'cpm.selectTargetType', 93),
    createStatusBarAction('DYN', 'Select linkage mode', 'cpm.selectLinkageMode', 92)
  ];

  const updateToolbarContexts = (): void => {
    const activeRef = workspaces.activeProjectRef;
    const targetType = activeRef?.exists ? workspaces.getProject(activeRef)?.targetType : undefined;
    const targetKey = targetType === 'Dynamic Link Library' ? 'dll' : targetType === 'Static Library' ? 'lib' : targetType === 'Executable' ? 'exe' : 'none';
    void vscode.commands.executeCommand('setContext', 'cpm.buildMode', builds.buildMode);
    void vscode.commands.executeCommand('setContext', 'cpm.targetType', targetKey);
    void vscode.commands.executeCommand('setContext', 'cpm.linkageMode', builds.getLinkageMode());
    void vscode.commands.executeCommand('setContext', 'cpm.buildBackend', activeRef?.exists ? projectSettings.getSettings(activeRef).buildBackend : 'direct');
  };

  const updateStatusBar = (): void => {
    const targetType = workspaces.activeProject?.targetType;
    const modeText = builds.buildMode === 'debug64' ? 'D64' : builds.buildMode === 'release64' ? 'R64' : builds.buildMode === 'release' ? 'REL' : 'DBG';
    const targetText = targetType === 'Dynamic Link Library' ? 'DLL' : targetType === 'Static Library' ? 'LIB' : targetType === 'Executable' ? 'EXE' : '---';
    statusBarItems[5].text = '$(debug-alt) Debug';
    statusBarItems[5].tooltip = 'Run the existing active executable, or DLL host, under VS Code cppdbg/GDB without rebuilding.';
    statusBarItems[6].text = modeText;
    statusBarItems[6].tooltip = `C/C++ build mode: ${modeText}. Click to change.`;
    statusBarItems[7].text = targetText;
    statusBarItems[7].tooltip = `C/C++ target type: ${targetText}. Click to change.`;
    const linkageMode = builds.getLinkageMode();
    statusBarItems[8].text = linkageMode === 'static' ? 'STA' : linkageMode === 'static-runtime' ? 'RTS' : 'DYN';
    statusBarItems[8].tooltip = `C/C++ linkage: ${linkageMode === 'static' ? 'Fully static when available' : linkageMode === 'static-runtime' ? 'Static compiler runtime' : 'Dynamic'}. Click to change.`;
    const show = vscode.workspace.getConfiguration('cpm').get<boolean>('showPersistentStatusBarActions', true);
    for (const item of statusBarItems) {
      if (show) item.show(); else item.hide();
    }
    updateToolbarContexts();
  };

  const selectAutocompleteProfile = async (): Promise<void> => {
    const current = getCpmAutocompleteSettings().profile;
    const items: Array<vscode.QuickPickItem & { value: CpmAutocompleteProfile }> = [
      { label: '$(combine) Hybrid', description: 'CPM + native C/C++ provider', detail: 'Project symbols + standard-library assist + immediate CPM Signature Help.', value: 'hybrid' },
      { label: '$(symbol-method) Native', description: 'Native C/C++ provider only', detail: 'CPM withdraws its completion and Signature Help providers without changing Microsoft C/C++ settings.', value: 'native' },
      { label: '$(info) Native + CPM Signature Help', description: 'Native completion, immediate parameter hints', detail: 'Avoid duplicate completion entries while keeping immediate parameter hints after ( and ,.', value: 'nativeSignature' },
      { label: '$(library) Standard Library Assist', description: 'Native project completion + CPM standard-library fallback', detail: 'CPM contributes missing-header standard-library completion plus Signature Help.', value: 'standardAssist' },
      { label: '$(settings-gear) Custom', description: 'Use advanced CPM completion toggles', detail: 'Uses project, standard-library and Signature Help switches from CPM settings.', value: 'custom' }
    ];
    const selected = await vscode.window.showQuickPick(items, {
      title: 'C/C++ Project Manager Autocompletion Profile',
      placeHolder: `Current profile: ${current}`
    });
    if (!selected) return;
    const config = vscode.workspace.getConfiguration('cpm');
    const target = vscode.workspace.workspaceFolders?.length ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await config.update('autocompleteProfile', selected.value, target);
    output.appendLine(`[C/C++] Autocompletion profile changed to ${selected.value}.`);
    const action = await vscode.window.showInformationMessage(
      `CPM autocompletion profile: ${selected.label.replace(/^\$\([^)]*\)\s*/, '')}`,
      ...(selected.value === 'custom' ? ['Open Autocompletion Settings'] : [])
    );
    if (action === 'Open Autocompletion Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'cpm autocomplete');
    }
  };

  const register = (command: string, handler: (...args: any[]) => unknown): vscode.Disposable => vscode.commands.registerCommand(command, async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`[C/C++] ${command} failed: ${message}`);
      vscode.window.showErrorMessage(`C/C++ Project Manager: ${message}`);
      return undefined;
    }
  });

  const focusTreeThen = async (command: string): Promise<void> => {
    await vscode.commands.executeCommand('cpm.workspaceExplorer.focus');
    await vscode.commands.executeCommand(command);
  };

  const runGdbDebug = async (): Promise<boolean> => builds.debugWithGdb();
  const runDebugWithoutBuild = async (): Promise<boolean> => builds.debugWithoutBuild();

  context.subscriptions.push(
    output,
    buildTraceOutput,
    programOutput,
    buildDiagnostics,
    workspaces,
    home,
    buildSettings,
    sdl,
    quickActions,
    quickActionsRegistration,
    cppTools,
    treeView,
    fileSymbolsView,
    projectHealthProvider,
    projectHealthView,
    dependencies,
    dependencyProvider,
    dependencyView,
    remoteLinux,
    remoteLinuxProvider,
    remoteLinuxView,
    completionRegistration,
    signatureHelpRegistration,
    ...statusBarItems,
    treeView.onDidChangeSelection((event) => {
      const selected = event.selection[0];
      if (selected?.kind === 'file' && isSourceOrHeader(selected.file.absolutePath)) {
        fileSymbolsProvider.setSelectedFile(selected.file.absolutePath);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.uri.scheme === 'file' && isSourceOrHeader(editor.document.uri.fsPath)) {
        fileSymbolsProvider.setSelectedFile(editor.document.uri.fsPath);
      }
    }),
    workspaces.onDidChange(() => {
      symbols.invalidateProjectCache();
      fileSymbolsProvider.refresh();
      projectHealthProvider.refresh();
      dependencyProvider.refresh();
      remoteLinuxProvider.refresh();
      remoteLinux.refresh();
      void dependencies.refresh();
      updateStatusBar();
      void scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('cpm')) {
        updateStatusBar();
        home.update();
        quickActions.update();
        projectHealthProvider.refresh();
        dependencyProvider.refresh();
        remoteLinuxProvider.refresh();
        remoteLinux.refresh();
      }
      if (event.affectsConfiguration('cpm.activeInstallation') || event.affectsConfiguration('cpm.autoConfigureCppTools') || event.affectsConfiguration('cpm.autoAddCpmFolderToWorkspace') || event.affectsConfiguration('cpm.useCppToolsConfigurationProvider') || event.affectsConfiguration('cpm.intelliSenseCompilerPath') || event.affectsConfiguration('cpm.additionalIncludePaths') || event.affectsConfiguration('cpm.sdlRootPath') || event.affectsConfiguration('cpm.sdlEnabled') || event.affectsConfiguration('cpm.sdlPackages')) {
        void scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace);
      }
    }),
    register('cpm.openHome', () => home.show()),
    register('cpm.openWorkspace', () => workspaces.openWorkspace()),
    register('cpm.createWorkspaceProject', () => workspaces.createWorkspaceProject()),
    register('cpm.createSdlWorkspaceProject', () => workspaces.createSdlWorkspaceProject()),
    register('cpm.refresh', () => workspaces.refresh()),
    register('cpm.refreshProjectHealth', () => projectHealthProvider.refresh()),
    register('cpm.openProjectHealthReport', () => projectHealthProvider.openReport()),
    register('cpm.repairProjectHealth', () => projectHealthProvider.repair()),
    register('cpm.repairWorkspaceCompatibility', () => workspaces.repairNativeWorkspaceCompatibility()),
    register('cpm.dependencies.configure', () => dependencies.configure()),
    register('cpm.dependencies.detectTools', () => dependencies.detectTools()),
    register('cpm.dependencies.generateManifests', () => dependencies.generateManifests()),
    register('cpm.dependencies.install', () => dependencies.install()),
    register('cpm.dependencies.openReport', () => dependencies.openReport()),
    register('cpm.dependencies.revealOutput', () => dependencies.revealOutput()),
    register('cpm.dependencies.clean', () => dependencies.clean()),
    register('cpm.openSshDeviceManager', () => openSshDeviceManager(context)),
    register('cpm.remote.configure', () => remoteLinux.configure()),
    register('cpm.remote.testConnection', () => remoteLinux.testConnection()),
    register('cpm.remote.sync', () => remoteLinux.syncProject()),
    register('cpm.remote.build', () => remoteLinux.remoteBuild()),
    register('cpm.remote.run', () => remoteLinux.remoteRun()),
    register('cpm.remote.buildRun', () => remoteLinux.remoteBuildAndRun()),
    register('cpm.remote.debug', () => remoteLinux.debugRemote()),
    register('cpm.remote.openTerminal', () => remoteLinux.openTerminal()),
    register('cpm.remote.openReport', () => remoteLinux.openReport()),

    register('cpm.openActiveProjectFile', () => { const ref = workspaces.activeProjectRef; return ref?.exists ? workspaces.openPath(ref.absolutePath) : undefined; }),
    register('cpm.installSupportedToolchains', () => toolchainInstaller.openInstaller()),
    register('cpm.configureInstallation', async () => {
      const installation = await installations.selectInstallation(workspaces.currentWorkspace?.cpmDir);
      if (installation) {
        await cppTools.sync(workspaces.currentWorkspace);
        home.update();
      }
    }),
    register('cpm.configureSdl', async () => {
      await sdl.selectInstallation();
      await cppTools.sync(workspaces.currentWorkspace, true);
      home.update();
      quickActions.update();
    }),
    register('cpm.selectAutocompleteProfile', () => selectAutocompleteProfile()),
    register('cpm.syncCppTools', () => cppTools.sync(workspaces.currentWorkspace, true)),
    register('cpm.diagnoseCppTools', () => cppTools.diagnose(workspaces.currentWorkspace)),
    register('cpm.repairCppToolsProvider', () => cppTools.repairCppToolsProviderSelection(workspaces.currentWorkspace)),
    register('cpm.enableAutomaticSuggestions', () => cppTools.enableAutomaticSuggestions(workspaces.currentWorkspace)),
    register('cpm.addWorkspaceFolderForIntelliSense', () => cppTools.addConfigurationRootToWorkspace(workspaces.currentWorkspace)),
    register('cpm.selectBuildMode', () => builds.selectBuildMode()),
    register('cpm.selectBuildModeD32', () => builds.selectBuildMode()),
    register('cpm.selectBuildModeR32', () => builds.selectBuildMode()),
    register('cpm.selectBuildModeD64', () => builds.selectBuildMode()),
    register('cpm.selectBuildModeR64', () => builds.selectBuildMode()),
    register('cpm.selectBuildBackend', (node?: ProjectNode) => cmake.selectBackend(node?.ref)),
    register('cpm.cmake.configure', (node?: ProjectNode) => cmake.configure(node?.ref, true)),
    register('cpm.cmake.openReport', (node?: ProjectNode) => cmake.openReport(node?.ref)),
    register('cpm.selectLinkageMode', (node?: ProjectNode) => builds.selectLinkageMode(node?.ref)),
    register('cpm.inspectRuntimeDependencies', (node?: ProjectNode) => builds.inspectRuntimeDependencies(node?.ref)),
    register('cpm.chooseBuildAction', () => builds.chooseBuildAction()),
    register('cpm.showBuildProblems', () => builds.showBuildProblems()),
    register('cpm.showFullBuildTrace', () => builds.showFullBuildTrace()),
    register('cpm.build', () => builds.build(false)),
    register('cpm.rebuild', () => builds.build(true)),
    register('cpm.clean', () => builds.clean()),
    register('cpm.run', () => builds.runWithoutBuild()),
    register('cpm.buildAndRun', () => builds.buildAndRun()),
    register('cpm.chooseRunAction', () => builds.chooseRunAction()),
    register('cpm.runWithoutBuild', () => builds.runWithoutBuild()),
    register('cpm.runDebug', () => runDebugWithoutBuild()),
    register('cpm.debugWithGdb', () => runGdbDebug()),
    register('cpm.openWorkspaceFile', () => builds.openWorkspaceFile()),
    register('cpm.setActiveProject', (node?: ProjectNode) => workspaces.setActiveProject(node?.ref)),
    register('cpm.buildProject', (node?: ProjectNode) => node ? builds.build(false, node.ref) : undefined),
    register('cpm.rebuildProject', (node?: ProjectNode) => node ? builds.build(true, node.ref) : undefined),
    register('cpm.cleanProject', (node?: ProjectNode) => node ? builds.clean(node.ref) : undefined),
    register('cpm.selectTargetType', (node?: ProjectNode) => workspaces.selectTargetType(node?.ref)),
    register('cpm.selectTargetTypeEXE', () => workspaces.selectTargetType()),
    register('cpm.selectTargetTypeDLL', () => workspaces.selectTargetType()),
    register('cpm.selectTargetTypeLIB', () => workspaces.selectTargetType()),
    register('cpm.editBuildSettings', (node?: ProjectNode) => buildSettings.show(node?.ref)),
    register('cpm.editBuildSettingsSafeMode', (node?: ProjectNode) => buildSettings.showSafeMode(node?.ref)),
    register('cpm.executeProject', (node?: ProjectNode) => node ? builds.buildAndRun(node.ref) : undefined),
    register('cpm.runDebugProject', async (node?: ProjectNode) => { if (node?.ref) await workspaces.setActiveProject(node.ref); return await runDebugWithoutBuild(); }),
    register('cpm.debugProjectWithGdb', async (node?: ProjectNode) => { if (node?.ref) await workspaces.setActiveProject(node.ref); return await runGdbDebug(); }),
    register('cpm.editProjectFile', (node?: ProjectNode) => node ? builds.openProjectFile(node.ref.absolutePath) : undefined),
    register('cpm.openProjectFile', (node?: ProjectNode) => node ? workspaces.openPath(node.ref.absolutePath) : undefined),
    register('cpm.createProjectInWorkspace', () => workspaces.createProjectInWorkspace()),
    register('cpm.createSdlProjectInWorkspace', () => workspaces.createSdlProjectInWorkspace()),
    register('cpm.addExistingProject', () => workspaces.addExistingProject()),
    register('cpm.removeProject', (node?: ProjectNode) => node ? workspaces.removeProject(node.ref) : undefined),
    register('cpm.addFiles', (node?: ProjectNode | FolderNode) => {
      if (node?.kind === 'folder') {
        return workspaces.addFiles(node.ref, node.folderPath);
      }
      return workspaces.addFiles(node?.ref);
    }),
    register('cpm.createNewFile', (node?: ProjectNode | FolderNode) => {
      if (node?.kind === 'folder') {
        return workspaces.createNewFile(node.ref, node.folderPath);
      }
      return workspaces.createNewFile(node?.ref);
    }),
    register('cpm.addFolder', (node?: ProjectNode | FolderNode) => {
      if (node?.kind === 'folder') {
        return workspaces.addFolder(node.ref, node.folderPath);
      }
      return workspaces.addFolder(node?.ref);
    }),
    register('cpm.renameFolder', (node?: FolderNode) => node ? workspaces.renameFolder(node.ref, node.folderPath) : undefined),
    register('cpm.removeFolder', (node?: FolderNode) => node ? workspaces.removeFolder(node.ref, node.folderPath) : undefined),
    register('cpm.removeFile', (node?: FileNode) => node ? workspaces.removeFile(node.ref, node.file.sectionName, node.file.absolutePath) : undefined),
    register('cpm.excludeFile', (node?: FileNode) => node ? workspaces.setFileExcluded(node.ref, node.file, true) : undefined),
    register('cpm.includeFile', (node?: FileNode) => node ? workspaces.setFileExcluded(node.ref, node.file, false) : undefined),
    register('cpm.toggleObjOption', (node?: FileNode) => node ? workspaces.toggleCompileIntoObjectFile(node.ref, node.file) : undefined),
    register('cpm.replaceFile', (node?: FileNode) => node ? workspaces.replaceFile(node.ref, node.file) : undefined),
    register('cpm.renameFile', (node?: FileNode) => node ? workspaces.renameFile(node.ref, node.file) : undefined),
    register('cpm.moveFileToFolder', (node?: FileNode) => node ? workspaces.moveFileToFolder(node.ref, node.file) : undefined),
    register('cpm.compileFile', (node?: FileNode) => node ? builds.compileFile(node.file.absolutePath, node.ref) : undefined),
    register('cpm.generatePrototypes', (node?: FileNode) => node ? workspaces.generatePrototypes(node.ref, node.file) : undefined),
    register('cpm.prepareDllImportLibraryGeneration', (node?: FileNode) => node ? builds.prepareDllImportLibraryGeneration(node.file.absolutePath) : undefined),
    register('cpm.refreshFileSymbols', () => fileSymbolsProvider.refresh()),
    register('cpm.revealFileSymbol', (symbol?: CpmSourceSymbol) => symbol ? fileSymbolsProvider.reveal(symbol) : undefined),
    register('cpm.copyFileSymbol', (symbol?: CpmSourceSymbol) => fileSymbolsProvider.copySymbol(symbol)),
    register('cpm.copyFileSymbolDeclaration', (symbol?: CpmSourceSymbol) => fileSymbolsProvider.copySymbolDeclaration(symbol)),
    register('cpm.copyFileSymbols', () => fileSymbolsProvider.copyAllSymbols(false)),
    register('cpm.copyFileSymbolDeclarations', () => fileSymbolsProvider.copyAllSymbols(true)),
    register('cpm.exportFileSymbols', () => fileSymbolsProvider.exportSymbols()),
    register('cpm.generateFileSymbolsHeader', () => fileSymbolsProvider.generateHeader()),
    register('cpm.generateFileSymbolsSource', () => fileSymbolsProvider.generateSource()),
    register('cpm.saveFile', (node?: FileNode) => node ? workspaces.saveFile(node.file.absolutePath) : undefined),
    register('cpm.openPanelFile', (node?: FileNode) => node ? builds.openPanelFile(node.file.absolutePath) : undefined),
    register('cpm.openPanelPathFile', (filePath?: string) => filePath ? builds.openPanelFile(filePath) : undefined),
    register('cpm.openFunctionPanel', (node?: FileNode) => node ? functionPanels.open(node.file.absolutePath) : undefined),
    register('cpm.insertSnippet', () => templates.insertSnippet()),
    register('cpm.insertFileHeader', () => templates.insertFileDescriptionHeader()),
    register('cpm.insertHeaderChangeEntry', () => templates.insertHeaderChangeEntry()),
    register('cpm.insertCommentSection', () => templates.insertCommentSection()),
    register('cpm.insertSpecialCharacterText', () => templates.insertSpecialCharacterText()),
    register('cpm.insertColorValue', () => colorValues.openColorValuePicker()),
    register('cpm.openCharacterTable', () => editorUtilities.openCharacterTable()),
    register('cpm.convertSelectedTextToDecimalValues', () => editorUtilities.convertSelectedTextToDecimalValues()),
    register('cpm.convertSelectedNumbersToText', () => editorUtilities.convertSelectedNumbersToText()),
    register('cpm.openNumberConverter', () => editorUtilities.openNumberConverter()),
    register('cpm.openTruthTableDesigner', () => editorUtilities.openTruthTableDesigner()),
    register('cpm.openDigitalFilterDesigner', () => editorUtilities.openDigitalFilterDesigner()),
    register('cpm.saveSelectionAsSnippet', () => templates.saveSelectionAsSnippet()),
    register('cpm.manageSnippets', () => templates.manageSnippets()),
    register('cpm.saveFileAsTemplate', (node?: FileNode) => templates.saveCurrentFileAsTemplate(node?.file.absolutePath)),
    register('cpm.importFileTemplate', () => templates.importFileTemplate()),
    register('cpm.manageFileTemplates', () => templates.manageFileTemplates()),
    register('cpm.openFile', (node?: FileNode) => node ? workspaces.openPath(node.file.absolutePath) : undefined),
    register('cpm.revealProjectFile', (node?: ProjectNode) => node ? workspaces.revealInExplorer(node.ref.absolutePath) : undefined),
    register('cpm.revealFile', (node?: FileNode) => node ? workspaces.revealInExplorer(node.file.absolutePath) : undefined),
    register('cpm.copyFilePath', (node?: FileNode) => node ? workspaces.copyFilePath(node.file.absolutePath) : undefined),
    register('cpm.copyRelativeFilePath', (node?: FileNode) => node ? workspaces.copyRelativeFilePath(node.ref, node.file.absolutePath) : undefined),
    register('cpm.convertSelectedIntegerToDecimal', () => convertSelectedIntegerLiteral('decimal')),
    register('cpm.convertSelectedIntegerToHexadecimal', () => convertSelectedIntegerLiteral('hexadecimal')),
    register('cpm.convertSelectedIntegerToBinary', () => convertSelectedIntegerLiteral('binary')),
    register('cpm.exploreProjectDirectory', (node?: ProjectNode) => node ? workspaces.revealInExplorer(path.dirname(node.ref.absolutePath)) : undefined),
    register('cpm.exploreFolderDirectory', (node?: FolderNode) => node ? workspaces.revealInExplorer(workspaces.directoryForLogicalFolder(node.ref, node.folderPath)) : undefined),
    register('cpm.exploreFileDirectory', (node?: FileNode) => node ? workspaces.revealInExplorer(path.dirname(node.file.absolutePath)) : undefined),
    register('cpm.findProject', (node?: ProjectNode) => node ? workspaces.findInDirectory(path.dirname(node.ref.absolutePath)) : undefined),
    register('cpm.findFolder', (node?: FolderNode) => node ? workspaces.findInDirectory(workspaces.directoryForLogicalFolder(node.ref, node.folderPath)) : undefined),
    register('cpm.findFile', (node?: FileNode) => node ? workspaces.findInDirectory(path.dirname(node.file.absolutePath)) : undefined),
    register('cpm.saveAll', () => vscode.commands.executeCommand('workbench.action.files.saveAll')),
    register('cpm.expandAll', () => focusTreeThen('list.expandAll')),
    register('cpm.collapseAll', () => focusTreeThen('list.collapseAll'))
  );

  ensureBundledCppLibraryPack(context, output);
  activateCpmLibraryExplorer(context);

  await workspaces.restoreOrAutoLoad();

  // Keep activation deterministic and short. Toolchain discovery and C/C++
  // IntelliSense synchronization can touch many PATH entries on Windows; running
  // it inline keeps VS Code in the "Activating Extensions..." state for too
  // long when no compiler has been selected yet.
  void runPostActivationSetup(cppTools, workspaces, output);

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document.uri.scheme === 'file' && isSourceOrHeader(activeEditor.document.uri.fsPath)) {
    fileSymbolsProvider.setSelectedFile(activeEditor.document.uri.fsPath);
  }
  updateStatusBar();
}



const LEGACY_CONFIGURATION_SECTION = 'labwindowsCvi';

const CPM_CONFIGURATION_KEYS = [
  'installations',
  'activeInstallation',
  'buildMode',
  'runArguments',
  'runOutputMode',
  'buildLogDetail',
  'projectFormatVersion',
  'autoLoadWorkspace',
  'autoConfigureCppTools',
  'autoAddCpmFolderToWorkspace',
  'intelliSenseCompilerPath',
  'additionalIncludePaths',
  'enableSupplementalCompletionProvider',
  'enableStandardLibraryCompletionProvider',
  'standardLibraryCompletionAutoInclude',
  'showPersistentStatusBarActions',
  'cCompilerPath',
  'cppCompilerPath',
  'archiverPath',
  'debuggerPath',
  'outputDirectory',
  'cStandard',
  'cppStandard',
  'warningLevel',
  'optimizationLevel',
  'debugInformation',
  'architectureMode',
  'compilerFlags',
  'cCompilerFlags',
  'cppCompilerFlags',
  'linkerFlags',
  'includePaths',
  'libraryPaths',
  'libraries',
  'defineSymbols',
  'useBuildModeArchitectureFlags',
  'runtimeDependencyMode',
  'deployRuntimeDlls',
  'useLocalBuildCacheForOneDrive',
  'cleanRuntimeDllsOnDeploy',
  'sdlInstallations',
  'sdlRootPath',
  'sdlEnabled',
  'sdlPackages',
  'sdlRuntimeMode',
  'sdlSubsystem',
  'sdlCopyAllRuntimeDlls'
];

async function migrateLegacyConfiguration(output: vscode.OutputChannel): Promise<void> {
  const legacy = vscode.workspace.getConfiguration(LEGACY_CONFIGURATION_SECTION);
  const current = vscode.workspace.getConfiguration('cpm');
  const aliases = new Map<string, string>([['autoAddCpmFolderToWorkspace', 'autoAddCviFolderToWorkspace']]);
  let migrated = 0;

  for (const key of CPM_CONFIGURATION_KEYS) {
    const legacyKey = aliases.get(key) ?? key;
    const legacyInspect = legacy.inspect<unknown>(legacyKey);
    const currentInspect = current.inspect<unknown>(key);
    if (!legacyInspect) {
      continue;
    }

    const legacyWorkspaceValue = legacyInspect.workspaceValue;
    if (legacyWorkspaceValue !== undefined && currentInspect?.workspaceValue === undefined) {
      await current.update(key, legacyWorkspaceValue, vscode.ConfigurationTarget.Workspace);
      migrated++;
    }

    const legacyGlobalValue = legacyInspect.globalValue;
    if (legacyGlobalValue !== undefined && currentInspect?.globalValue === undefined && currentInspect?.workspaceValue === undefined) {
      await current.update(key, legacyGlobalValue, vscode.ConfigurationTarget.Global);
      migrated++;
    }

    if (legacyWorkspaceValue !== undefined) {
      await legacy.update(legacyKey, undefined, vscode.ConfigurationTarget.Workspace);
    }
  }

  if (migrated > 0) {
    output.appendLine(`[C/C++] Migrated ${migrated} legacy setting(s) to cpm.*.`);
  }
}

async function scheduleOptionalCppToolsSync(cppTools: CpmCppToolsService, workspace: CpmWorkspace | undefined): Promise<void> {
  const config = vscode.workspace.getConfiguration('cpm');
  const shouldAddFolder = config.get<boolean>('autoAddCpmFolderToWorkspace', false);
  const shouldSync = config.get<boolean>('autoConfigureCppTools', false);
  if (!shouldAddFolder && !shouldSync) {
    return;
  }
  if (shouldAddFolder) {
    await cppTools.ensureConfigurationRootInWorkspace(workspace);
  }
  if (shouldSync) {
    cppTools.requestSync(workspace);
  }
}

async function runPostActivationSetup(cppTools: CpmCppToolsService, workspaces: CpmWorkspaceService, output: vscode.OutputChannel): Promise<void> {
  try {
    const repairedProvider = await cppTools.autoRepairStaleProviderSelection(workspaces.currentWorkspace);
    // Do not force an immediate IntelliSense regeneration during activation.
    // The workspace change event already schedules a lightweight, debounced sync.
    // Keeping this path passive prevents VS Code/cpptools from staying in a
    // long "Loading..." state when a project is opened.
    if (repairedProvider) {
      void vscode.window.showWarningMessage(
        'C/C++ Project Manager removed an obsolete C/C++ configuration provider reference that could disable normal completion outside managed projects. Reload VS Code, then run C/C++: Reset IntelliSense Database once.',
        'Reload Window'
      ).then((action) => action === 'Reload Window' ? vscode.commands.executeCommand('workbench.action.reloadWindow') : undefined);
    }
  } catch (error) {
    output.appendLine(`[C/C++] Post-activation setup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createStatusBarAction(text: string, tooltip: string, command: string, priority: number): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
  item.text = text;
  item.tooltip = tooltip;
  item.command = command;
  return item;
}

type IntegerLiteralTarget = 'decimal' | 'hexadecimal' | 'binary';

async function convertSelectedIntegerLiteral(target: IntegerLiteralTarget): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showInformationMessage('Select an integer literal before converting it.');
    return;
  }
  const selectedText = editor.document.getText(editor.selection);
  const leadingWhitespace = selectedText.match(/^\s*/)?.[0] ?? '';
  const trailingWhitespace = selectedText.match(/\s*$/)?.[0] ?? '';
  const literal = selectedText.trim();
  const converted = formatIntegerLiteral(literal, target);
  if (!converted) {
    vscode.window.showErrorMessage('The selected text is not a supported decimal, hexadecimal (0x...) or binary (0b...) integer literal.');
    return;
  }
  await editor.edit((builder) => builder.replace(editor.selection, `${leadingWhitespace}${converted}${trailingWhitespace}`));
}

function formatIntegerLiteral(literal: string, target: IntegerLiteralTarget): string | undefined {
  const match = literal.match(/^([+-]?)(0[xX][0-9a-fA-F]+|0[bB][01]+|[0-9]+)([uUlL]*)$/);
  if (!match) {
    return undefined;
  }
  const [, sign, digits, suffix] = match;
  const unsignedDigits = digits.replace(/^0[xX]/, '').replace(/^0[bB]/, '');
  const base = /^0[xX]/.test(digits) ? 16 : /^0[bB]/.test(digits) ? 2 : 10;
  let value: bigint;
  try {
    value = BigInt(base === 16 ? `0x${unsignedDigits}` : base === 2 ? `0b${unsignedDigits}` : unsignedDigits);
  } catch {
    return undefined;
  }
  const body = target === 'hexadecimal'
    ? `0x${value.toString(16).toUpperCase()}`
    : target === 'binary'
      ? `0b${value.toString(2)}`
      : value.toString(10);
  return `${sign}${body}${suffix}`;
}

export function deactivate(): void {
  // Resources are disposed through context.subscriptions.
}
