import * as path from 'path';
import * as vscode from 'vscode';
import { CpmParser } from './model/cpmParser';
import { CpmTreeProvider, FileNode, FolderNode, ProjectNode } from './providers/cpmTreeProvider';
import { CpmFileSymbolsProvider } from './providers/cpmFileSymbolsProvider';
import { CpmBuildService } from './services/cpmBuildService';
import { CpmCppToolsService } from './services/cpmCppToolsService';
import { CpmInstallationService } from './services/cpmInstallationService';
import { CpmWorkspaceService } from './services/cpmWorkspaceService';
import { HomePanel } from './views/homePanel';
import { activate as activateCpmLibraryExplorer } from './jcLibEmbedded';
import { ensureBundledCppLibraryPack } from './services/cpmLibraryPackService';
import { CpmTemplateService } from './services/cpmTemplateService';
import { CpmProjectSettingsService } from './services/cpmProjectSettingsService';
import { BuildSettingsPanel } from './views/buildSettingsPanel';
import { QuickActionsView } from './views/quickActionsView';
import { CpmCompletionProvider, CpmSourceSymbol, CpmSymbolService, isSourceOrHeader } from './services/cpmSymbolService';
import { CpmFunctionPanelService } from './services/cpmFunctionPanelService';
import { CpmWorkspace } from './model/types';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('C/C++ Project Manager');
  await migrateLegacyConfiguration(output);
  const parser = new CpmParser();
  const installations = new CpmInstallationService(output);
  const cppTools = new CpmCppToolsService(installations, parser, output);
  const templates = new CpmTemplateService(context, installations, output);
  const workspaces = new CpmWorkspaceService(context, parser, installations, templates, output);
  const projectSettings = new CpmProjectSettingsService(workspaces, parser, output);
  const builds = new CpmBuildService(parser, workspaces, installations, projectSettings, undefined, output);
  const treeProvider = new CpmTreeProvider(workspaces);
  const treeView = vscode.window.createTreeView('cpm.workspaceExplorer', { treeDataProvider: treeProvider, showCollapseAll: true });
  const symbols = new CpmSymbolService(context.extensionPath, workspaces);
  const fileSymbolsProvider = new CpmFileSymbolsProvider(symbols);
  const fileSymbolsView = vscode.window.createTreeView('cpm.fileSymbols', { treeDataProvider: fileSymbolsProvider });
  fileSymbolsProvider.attachView(fileSymbolsView);
  const completionProvider = new CpmCompletionProvider(symbols);
  const functionPanels = new CpmFunctionPanelService();
  const completionRegistration = vscode.languages.registerCompletionItemProvider(
    [{ language: 'c', scheme: 'file' }, { language: 'cpp', scheme: 'file' }],
    completionProvider
  );
  const home = new HomePanel(context, workspaces, builds, installations);
  const buildSettings = new BuildSettingsPanel(workspaces, parser, projectSettings);
  const quickActions = new QuickActionsView(workspaces, builds, projectSettings);
  const quickActionsRegistration = vscode.window.registerTreeDataProvider('cpm.quickActions', quickActions);

  const statusBarItems = [
    createStatusBarAction('$(home)', 'C/C++ Project Manager home', 'cpm.openHome', 99),
    createStatusBarAction('$(folder-opened)', 'Open a C/C++ workspace or project', 'cpm.openWorkspace', 98),
    createStatusBarAction('$(tools)', 'Build / rebuild / clean the active C/C++ project', 'cpm.chooseBuildAction', 97),
    createStatusBarAction('$(play)', 'Build and run the active C/C++ target', 'cpm.run', 96),
    createStatusBarAction('$(list-selection)', 'Advanced C/C++ run options', 'cpm.chooseRunAction', 95),
    createStatusBarAction('$(debug-alt-small)', 'Build and debug with GDB/cppdbg', 'cpm.debugWithGdb', 94.5),
    createStatusBarAction('D32', 'Select the C/C++ build mode', 'cpm.selectBuildMode', 94),
    createStatusBarAction('EXE', 'Select the C/C++ target type', 'cpm.selectTargetType', 93)
  ];

  const updateToolbarContexts = (): void => {
    const activeRef = workspaces.activeProjectRef;
    const targetType = activeRef?.exists ? workspaces.getProject(activeRef)?.targetType : undefined;
    const targetKey = targetType === 'Dynamic Link Library' ? 'dll' : targetType === 'Static Library' ? 'lib' : targetType === 'Executable' ? 'exe' : 'none';
    void vscode.commands.executeCommand('setContext', 'cpm.buildMode', builds.buildMode);
    void vscode.commands.executeCommand('setContext', 'cpm.targetType', targetKey);
  };

  const updateStatusBar = (): void => {
    const targetType = workspaces.activeProject?.targetType;
    const modeText = builds.buildMode === 'debug64' ? 'D64' : builds.buildMode === 'release64' ? 'R64' : builds.buildMode === 'release' ? 'REL' : 'DBG';
    const targetText = targetType === 'Dynamic Link Library' ? 'DLL' : targetType === 'Static Library' ? 'LIB' : targetType === 'Executable' ? 'EXE' : '---';
    statusBarItems[5].text = '$(debug-alt-small) Debug';
    statusBarItems[5].tooltip = 'Build and debug the active executable with VS Code cppdbg/GDB.';
    statusBarItems[6].text = modeText;
    statusBarItems[6].tooltip = `C/C++ build mode: ${modeText}. Click to change.`;
    statusBarItems[7].text = targetText;
    statusBarItems[7].tooltip = `C/C++ target type: ${targetText}. Click to change.`;
    const show = vscode.workspace.getConfiguration('cpm').get<boolean>('showPersistentStatusBarActions', true);
    for (const item of statusBarItems) {
      if (show) item.show(); else item.hide();
    }
    updateToolbarContexts();
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

  context.subscriptions.push(
    output,
    workspaces,
    home,
    buildSettings,
    quickActions,
    quickActionsRegistration,
    cppTools,
    treeView,
    fileSymbolsView,
    completionRegistration,
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
      updateStatusBar();
      void scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('cpm')) {
        updateStatusBar();
        home.update();
        quickActions.update();
      }
      if (event.affectsConfiguration('cpm.activeInstallation') || event.affectsConfiguration('cpm.autoConfigureCppTools') || event.affectsConfiguration('cpm.autoAddCpmFolderToWorkspace') || event.affectsConfiguration('cpm.useCppToolsConfigurationProvider') || event.affectsConfiguration('cpm.intelliSenseCompilerPath') || event.affectsConfiguration('cpm.additionalIncludePaths')) {
        void scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace);
      }
    }),
    register('cpm.openHome', () => home.show()),
    register('cpm.openWorkspace', () => workspaces.openWorkspace()),
    register('cpm.createWorkspaceProject', () => workspaces.createWorkspaceProject()),
    register('cpm.refresh', () => workspaces.refresh()),
    register('cpm.configureInstallation', async () => {
      const installation = await installations.selectInstallation(workspaces.currentWorkspace?.cpmDir);
      if (installation) {
        await cppTools.sync(workspaces.currentWorkspace);
        home.update();
      }
    }),
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
    register('cpm.chooseBuildAction', () => builds.chooseBuildAction()),
    register('cpm.build', () => builds.build(false)),
    register('cpm.rebuild', () => builds.build(true)),
    register('cpm.clean', () => builds.clean()),
    register('cpm.run', () => builds.buildAndRun()),
    register('cpm.chooseRunAction', () => builds.chooseRunAction()),
    register('cpm.runWithoutBuild', () => builds.runWithoutBuild()),
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
    register('cpm.debugProjectWithGdb', async (node?: ProjectNode) => { if (node?.ref) await workspaces.setActiveProject(node.ref); return await runGdbDebug(); }),
    register('cpm.editProjectFile', (node?: ProjectNode) => node ? builds.openProjectFile(node.ref.absolutePath) : undefined),
    register('cpm.openProjectFile', (node?: ProjectNode) => node ? workspaces.openPath(node.ref.absolutePath) : undefined),
    register('cpm.createProjectInWorkspace', () => workspaces.createProjectInWorkspace()),
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
    register('cpm.compileFile', (node?: FileNode) => node ? builds.compileFile(node.file.absolutePath, node.ref) : undefined),
    register('cpm.generatePrototypes', (node?: FileNode) => node ? workspaces.generatePrototypes(node.ref, node.file) : undefined),
    register('cpm.prepareDllImportLibraryGeneration', (node?: FileNode) => node ? builds.prepareDllImportLibraryGeneration(node.file.absolutePath) : undefined),
    register('cpm.refreshFileSymbols', () => fileSymbolsProvider.refresh()),
    register('cpm.revealFileSymbol', (symbol?: CpmSourceSymbol) => symbol ? fileSymbolsProvider.reveal(symbol) : undefined),
    register('cpm.saveFile', (node?: FileNode) => node ? workspaces.saveFile(node.file.absolutePath) : undefined),
    register('cpm.openPanelFile', (node?: FileNode) => node ? builds.openPanelFile(node.file.absolutePath) : undefined),
    register('cpm.openPanelPathFile', (filePath?: string) => filePath ? builds.openPanelFile(filePath) : undefined),
    register('cpm.openFunctionPanel', (node?: FileNode) => node ? functionPanels.open(node.file.absolutePath) : undefined),
    register('cpm.insertSnippet', () => templates.insertSnippet()),
    register('cpm.insertFileHeader', () => templates.insertFileDescriptionHeader()),
    register('cpm.insertHeaderChangeEntry', () => templates.insertHeaderChangeEntry()),
    register('cpm.insertCommentSection', () => templates.insertCommentSection()),
    register('cpm.insertSpecialCharacterText', () => templates.insertSpecialCharacterText()),
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
  'deployRuntimeDlls',
  'useLocalBuildCacheForOneDrive'
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
