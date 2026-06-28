import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CpmNativeTargetSettings, CpmParser } from '../model/cpmParser';
import { CpmBuildMode, CpmWorkspaceProjectRef } from '../model/types';
import { CpmProjectBuildSettings, CpmProjectSettingsService } from '../services/cpmProjectSettingsService';
import { CpmWorkspaceService } from '../services/cpmWorkspaceService';
import { normalizeRuntimePath } from '../utils/pathUtils';

type BuildSettingsScope = CpmBuildMode | 'all';

interface GenericCompilerSettings {
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
  runtimeDependencyMode: string;
  cleanRuntimeDllsOnDeploy: boolean;
  sdlEnabled: string;
  sdlVersion: string;
  sdlRootPath: string;
  sdlPackages: string[];
  sdlRuntimeMode: string;
  sdlSubsystem: string;
  sdlCopyAllRuntimeDlls: boolean;
}

const ALL_BUILD_MODES: CpmBuildMode[] = ['debug', 'release', 'debug64', 'release64'];

const RUNTIME_SUPPORT_OPTIONS: SelectOption[] = [
  ['Full Runtime Support', 'Full run-time engine'],
  ['Instrument Driver Support Only', 'Instrument driver only']
];

const EXE_RUNTIME_BINDING_OPTIONS: SelectOption[] = [
  ['Shared', 'Shared'],
  ['Side-by-side For Application', 'Side-by-side for entire application'],
  ['Side-by-side', 'Side-by-side for executable only']
];

const DLL_RUNTIME_BINDING_OPTIONS: SelectOption[] = [
  ['Shared', 'Shared'],
  ['Side-by-side', 'Side-by-side']
];

const SOURCE_DOCUMENTATION_OPTIONS: SelectOption[] = [
  ['None', 'None'],
  ['XML', 'XML'],
  ['HTML', 'HTML'],
  ['XML & HTML', 'XML & HTML']
];

const DLL_COPY_OPTIONS: SelectOption[] = [
  ['Do not copy', 'Do not copy'],
  ['Windows system directory', 'Windows system directory'],
  ['IVI standard root directory', 'IVI standard root directory'],
  ['VXIplug&play directory', 'VXIplug&play directory'],
  ['IVI standard root directory + VXIplug&play directory', 'IVI standard root directory + VXIplug&play directory'],
  ['Custom directory', 'Custom directory']
];

const DLL_EXPORT_OPTIONS: SelectOption[] = [
  ['Include File Symbols', 'Include file symbols'],
  ['Symbols Marked As Export', 'Symbols marked for export'],
  ['Include File and Marked Symbols', 'Include file and marked symbols']
];

const TLB_HELP_STYLE_OPTIONS: SelectOption[] = [
  ['HLP', 'HLP'],
  ['CHM', 'CHM']
];

export class BuildSettingsPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private projectRef?: CpmWorkspaceProjectRef;
  private selectedScope: BuildSettingsScope = 'debug';

  constructor(
    private readonly workspaces: CpmWorkspaceService,
    private readonly parser: CpmParser,
    private readonly settings: CpmProjectSettingsService
  ) {}

  show(projectRef?: CpmWorkspaceProjectRef): void {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing C/C++ project is selected.');
      return;
    }
    this.projectRef = ref;
    if (!this.panel) {
      this.selectedScope = this.buildMode;
      this.panel = vscode.window.createWebviewPanel('cpm.buildSettings', 'C/C++ Project Build Settings', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
      this.panel.onDidDispose(() => { this.panel = undefined; this.projectRef = undefined; });
      this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message));
    }
    this.panel.title = `C/C++ Build Settings — ${ref.name}`;
    this.panel.webview.html = this.render(ref);
    this.panel.reveal(vscode.ViewColumn.Active);
  }

  update(): void {
    if (this.panel && this.projectRef?.exists) {
      this.panel.webview.html = this.render(this.projectRef);
    }
  }

  /**
   * Native VS Code fallback for machines where Chromium's webview service
   * worker is temporarily unavailable. It intentionally covers the settings
   * most often changed during a build workflow and uses the exact same parser
   * and backup path as the full HTML editor.
   */
  async showSafeMode(projectRef?: CpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing C/C++ project is selected.');
      return;
    }
    let scope = this.selectedScope;

    while (true) {
      const representativeMode = this.representativeMode(scope);
      const target = this.parser.getNativeTargetSettings(ref.absolutePath, representativeMode);
      const projectSettings = this.settings.getSettings(ref, representativeMode);
      const choice = await vscode.window.showQuickPick([
        { id: 'full', label: '$(globe) Open full build-settings page', description: 'Use the HTML editor when VS Code webviews are available.' },
        { id: 'scope', label: '$(settings) Configuration scope', description: scopeLabel(scope) },
        { id: 'targetType', label: '$(symbol-enum) Target type', description: target.targetType },
        { id: 'outputPath', label: '$(file) Output file', description: target.outputPath || 'Empty' },
        { id: 'applicationTitle', label: '$(tag) Application title', description: target.applicationTitle || 'Empty' },
        { id: 'iconFile', label: '$(file-media) Application icon file', description: target.iconFile || 'Empty' },
        { id: 'arguments', label: '$(terminal) Command-line arguments', description: projectSettings.run.arguments || 'Empty' },
        { id: 'workingDirectory', label: '$(folder) Working directory', description: projectSettings.run.workingDirectory || 'Empty' },
        { id: 'environmentOptions', label: '$(symbol-key) Environment options', description: projectSettings.run.environmentOptions || 'Empty' },
        { id: 'externalProcessPath', label: '$(debug-start) External executable for DLL debugging', description: projectSettings.run.externalProcessPath || 'Empty' },
        { id: 'preBuildActions', label: '$(list-ordered) Pre-build actions', description: `${projectSettings.preBuildActions.length} action(s)` },
        { id: 'customBuildActions', label: '$(list-ordered) Custom build actions', description: `${projectSettings.customBuildActions.length} action(s)` },
        { id: 'postBuildActions', label: '$(list-ordered) Post-build actions', description: `${projectSettings.postBuildActions.length} action(s)` },
        { id: 'close', label: '$(close) Close safe-mode editor' }
      ], { title: `C/C++ Build Settings (Safe Mode) — ${ref.name}`, placeHolder: 'Select a setting to edit' });

      if (!choice || choice.id === 'close') {
        this.selectedScope = scope;
        return;
      }
      if (choice.id === 'full') {
        this.selectedScope = scope;
        this.show(ref);
        return;
      }
      if (choice.id === 'scope') {
        const selected = await vscode.window.showQuickPick(scopeChoices(), { title: 'Select configuration scope' });
        if (selected) {
          scope = selected.id;
          this.selectedScope = scope;
        }
        continue;
      }
      if (choice.id === 'targetType') {
        const selected = await vscode.window.showQuickPick(['Executable', 'Dynamic Link Library', 'Static Library'], { title: 'Select C/C++ target type' });
        if (selected) {
          target.targetType = selected;
          this.applyNativeTargetSettings(ref, scope, target);
          this.workspaces.refresh();
        }
        continue;
      }


      const nativeTextFields: Record<string, keyof Pick<CpmNativeTargetSettings, 'outputPath' | 'applicationTitle' | 'iconFile'>> = {
        outputPath: 'outputPath',
        applicationTitle: 'applicationTitle',
        iconFile: 'iconFile'
      };
      const runTextFields: Record<string, keyof CpmProjectBuildSettings['run']> = {
        arguments: 'arguments',
        workingDirectory: 'workingDirectory',
        environmentOptions: 'environmentOptions',
        externalProcessPath: 'externalProcessPath'
      };

      if (choice.id in nativeTextFields) {
        const key = nativeTextFields[choice.id];
        const value = await vscode.window.showInputBox({ title: stripCodicon(choice.label), value: String(target[key] ?? ''), ignoreFocusOut: true });
        if (value !== undefined) {
          target[key] = value;
          this.applyNativeTargetSettings(ref, scope, target);
          this.workspaces.refresh();
        }
        continue;
      }
      if (choice.id in runTextFields) {
        const key = runTextFields[choice.id];
        const value = await vscode.window.showInputBox({ title: stripCodicon(choice.label), value: projectSettings.run[key], ignoreFocusOut: true });
        if (value !== undefined) {
          projectSettings.run[key] = value;
          this.applyProjectSettings(ref, scope, projectSettings);
          this.workspaces.refresh();
        }
        continue;
      }

      const actionFields: Record<string, keyof Pick<CpmProjectBuildSettings, 'preBuildActions' | 'customBuildActions' | 'postBuildActions'>> = {
        preBuildActions: 'preBuildActions',
        customBuildActions: 'customBuildActions',
        postBuildActions: 'postBuildActions'
      };
      if (choice.id in actionFields) {
        const key = actionFields[choice.id];
        const value = await vscode.window.showInputBox({
          title: stripCodicon(choice.label),
          prompt: 'Enter one action per line or separate actions with semicolons.',
          value: projectSettings[key].join('; '),
          ignoreFocusOut: true
        });
        if (value !== undefined) {
          projectSettings[key] = splitSafeList(value);
          this.applyProjectSettings(ref, scope, projectSettings);
          this.workspaces.refresh();
        }
        continue;
      }
    }
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private async handleMessage(message: any): Promise<void> {
    if (!this.projectRef) {
      return;
    }
    if (message?.type === 'changeScope') {
      this.selectedScope = parseScope(message.scope, this.buildMode);
      this.update();
      return;
    }
    if (message?.type === 'browse') {
      await this.browseForField(String(message.field ?? ''));
      return;
    }
    if (message?.type === 'browseForcedModules') {
      await this.browseForForcedModules();
      return;
    }
    if (message?.type === 'promptForcedModuleName') {
      await this.promptForForcedModuleName();
      return;
    }
    if (message?.type === 'save') {
      try {
        const scope = parseScope(message.scope, this.selectedScope);
        this.selectedScope = scope;
        this.applyBuildParameterPayload(message, scope);
        await this.applyCompilerSettings(message.compilerSettings as Partial<GenericCompilerSettings> | undefined);
        this.workspaces.refresh();
        vscode.window.showInformationMessage(`Build settings saved for ${this.projectRef.name} (${scopeLabel(scope)}).`);
        this.update();
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (message?.type === 'exportBuildParameters') {
      await this.exportBuildParameters(message);
      return;
    }
    if (message?.type === 'importBuildParameters') {
      await this.importBuildParameters(parseScope(message.scope, this.selectedScope));
      return;
    }
  }

  private applyBuildParameterPayload(message: any, scope: BuildSettingsScope): void {
    if (!this.projectRef) {
      return;
    }
    const settings = message.settings as CpmProjectBuildSettings;
    const targetSettings = message.nativeTarget as CpmNativeTargetSettings;
    if (targetSettings && typeof message.targetType === 'string') {
      targetSettings.targetType = message.targetType;
    }
    if (targetSettings) {
      this.applyNativeTargetSettings(this.projectRef, scope, targetSettings);
    }
    if (settings) {
      this.applyProjectSettings(this.projectRef, scope, settings);
    }
  }

  private async exportBuildParameters(message: any): Promise<void> {
    if (!this.projectRef) {
      return;
    }
    const scope = parseScope(message.scope, this.selectedScope);
    const projectDirectory = path.dirname(this.projectRef.absolutePath);
    const defaultName = `${sanitizeFileName(this.projectRef.name)}-${scope}-build-parameters.cpm-build.json`;
    const destination = await vscode.window.showSaveDialog({
      title: 'Export C/C++ build parameters',
      defaultUri: vscode.Uri.file(path.join(projectDirectory, defaultName)),
      saveLabel: 'Export build parameters',
      filters: { 'CPM build parameters': ['cpm-build.json', 'json'], JSON: ['json'], 'All files': ['*'] }
    });
    if (!destination) {
      return;
    }

    const payload = {
      schema: 'cpm.buildParameters',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      projectName: this.projectRef.name,
      scope,
      targetType: message.targetType,
      nativeTarget: message.nativeTarget,
      projectSettings: message.settings,
      compilerSettings: message.compilerSettings
    };
    await fs.promises.writeFile(destination.fsPath, JSON.stringify(payload, null, 2), 'utf8');
    vscode.window.showInformationMessage(`Build parameters exported to ${path.basename(destination.fsPath)}.`);
  }

  private async importBuildParameters(scope: BuildSettingsScope): Promise<void> {
    if (!this.projectRef) {
      return;
    }
    const source = (await vscode.window.showOpenDialog({
      title: 'Import C/C++ build parameters',
      defaultUri: vscode.Uri.file(path.dirname(this.projectRef.absolutePath)),
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Import build parameters',
      filters: { 'CPM build parameters': ['cpm-build.json', 'json'], JSON: ['json'], 'All files': ['*'] }
    }))?.[0];
    if (!source) {
      return;
    }

    try {
      const payload = JSON.parse(await fs.promises.readFile(source.fsPath, 'utf8'));
      const importedSettings = payload?.projectSettings ?? payload?.settings;
      const importedCompilerSettings = payload?.compilerSettings;
      const importedNativeTarget = payload?.nativeTarget;
      if (!importedSettings && !importedCompilerSettings && !importedNativeTarget) {
        throw new Error('The selected JSON file does not contain CPM build parameters.');
      }

      this.selectedScope = scope;
      this.applyBuildParameterPayload({
        settings: importedSettings,
        compilerSettings: importedCompilerSettings,
        nativeTarget: importedNativeTarget,
        targetType: payload?.targetType ?? importedNativeTarget?.targetType
      }, scope);
      await this.applyCompilerSettings(importedCompilerSettings as Partial<GenericCompilerSettings> | undefined);
      this.workspaces.refresh();
      vscode.window.showInformationMessage(`Build parameters imported for ${this.projectRef.name} (${scopeLabel(scope)}).`);
      this.update();
    } catch (error) {
      vscode.window.showErrorMessage(`Unable to import build parameters: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private applyNativeTargetSettings(ref: CpmWorkspaceProjectRef, scope: BuildSettingsScope, target: CpmNativeTargetSettings): void {
    this.parser.setTargetType(ref.absolutePath, target.targetType);
    for (const mode of scopeModes(scope)) {
      this.parser.setNativeTargetSettings(ref.absolutePath, mode, target);
    }
  }

  private applyProjectSettings(ref: CpmWorkspaceProjectRef, scope: BuildSettingsScope, settings: CpmProjectBuildSettings): void {
    for (const mode of scopeModes(scope)) {
      this.settings.setSettings(ref, settings, mode);
    }
  }

  private async browseForField(field: string): Promise<void> {
    const ref = this.projectRef;
    if (!ref) {
      return;
    }
    const mode = this.representativeMode(this.selectedScope);
    const target = this.parser.getNativeTargetSettings(ref.absolutePath, mode);
    const projectSettings = this.settings.getSettings(ref, mode);
    const compilerSettings = this.getCompilerSettings();
    const projectDirectory = path.dirname(ref.absolutePath);
    const currentValues: Record<string, string> = {
      cCompilerPath: compilerSettings.cCompilerPath,
      cppCompilerPath: compilerSettings.cppCompilerPath,
      archiverPath: compilerSettings.archiverPath,
      debuggerPath: compilerSettings.debuggerPath,
      outputDirectory: compilerSettings.outputDirectory,
      includePaths: compilerSettings.includePaths.join('\n'),
      libraryPaths: compilerSettings.libraryPaths.join('\n'),
      outputPath: target.outputPath,
      iconFile: target.iconFile,
      manifestPath: target.manifestPath,
      customDirectoryToCopyDll: target.customDirectoryToCopyDll,
      typeLibFpFile: target.typeLibFpFile,
      singleHeaderNiTypeInfoFile: target.singleHeaderNiTypeInfoFile,
      workingDirectory: projectSettings.run.workingDirectory,
      externalProcessPath: projectSettings.run.externalProcessPath,
      sdlRootPath: compilerSettings.sdlRootPath
    };
    if (!(field in currentValues)) {
      return;
    }
    const currentValue = currentValues[field];
    const defaultUri = defaultDialogUri(currentValue, projectDirectory);
    let selected: vscode.Uri | undefined;

    if (field === 'workingDirectory' || field === 'customDirectoryToCopyDll' || field === 'outputDirectory' || field === 'sdlRootPath') {
      selected = (await vscode.window.showOpenDialog({
        title: browseTitle(field),
        defaultUri,
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select folder'
      }))?.[0];
    } else if (field === 'includePaths' || field === 'libraryPaths') {
      const selectedFolders = await vscode.window.showOpenDialog({
        title: browseTitle(field),
        defaultUri,
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: true,
        openLabel: 'Add folder(s)'
      });
      if (selectedFolders?.length) {
        await this.panel?.webview.postMessage({ type: 'appendLines', field, values: selectedFolders.map((uri) => portableModulePath(uri.fsPath, projectDirectory)) });
      }
      return;
    } else if (field === 'outputPath') {
      selected = await vscode.window.showSaveDialog({
        title: browseTitle(field),
        defaultUri,
        saveLabel: 'Select output file',
        filters: outputFilters(target.targetType)
      });
    } else {
      selected = (await vscode.window.showOpenDialog({
        title: browseTitle(field),
        defaultUri,
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Select file',
        filters: openFilters(field)
      }))?.[0];
    }

    if (selected) {
      await this.panel?.webview.postMessage({ type: 'setField', field, value: selected.fsPath });
    }
  }

  private async browseForForcedModules(): Promise<void> {
    const ref = this.projectRef;
    if (!ref) {
      return;
    }
    const projectDirectory = path.dirname(ref.absolutePath);
    const selected = await vscode.window.showOpenDialog({
      title: 'Add files to executable or DLL',
      defaultUri: vscode.Uri.file(projectDirectory),
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: 'Add selected modules',
      filters: { 'Libraries and object files': ['lib', 'obj'], 'All files': ['*'] }
    });
    if (!selected?.length) {
      return;
    }
    const values = selected.map((uri) => portableModulePath(uri.fsPath, projectDirectory));
    await this.panel?.webview.postMessage({ type: 'appendForcedModules', values });
  }

  private async promptForForcedModuleName(): Promise<void> {
    const value = await vscode.window.showInputBox({
      title: 'Add object or library entry',
      prompt: 'Enter a library or object module name, for example module.obj or libname.a.',
      placeHolder: 'module.lib or module.obj',
      ignoreFocusOut: true,
      validateInput: (input) => input.trim() ? undefined : 'Enter a module name.'
    });
    if (!value?.trim()) {
      return;
    }
    await this.panel?.webview.postMessage({ type: 'appendForcedModules', values: [value.trim()] });
  }

  private get buildMode(): CpmBuildMode {
    return vscode.workspace.getConfiguration('cpm').get<CpmBuildMode>('buildMode', 'debug');
  }

  private representativeMode(scope: BuildSettingsScope): CpmBuildMode {
    return scope === 'all' ? this.buildMode : scope;
  }

  private getCompilerSettings(): GenericCompilerSettings {
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
      runtimeDependencyMode: normalizeRuntimeDependencyMode(config.get<string>('runtimeDependencyMode', ''), config.get<string>('deployRuntimeDlls', 'auto')),
      cleanRuntimeDllsOnDeploy: config.get<boolean>('cleanRuntimeDllsOnDeploy', true),
      sdlEnabled: config.get<string>('sdlEnabled', 'auto'),
      sdlVersion: config.get<string>('sdlVersion', 'auto'),
      sdlRootPath: config.get<string>('sdlRootPath', ''),
      sdlPackages: config.get<string[]>('sdlPackages', ['SDL2']),
      sdlRuntimeMode: config.get<string>('sdlRuntimeMode', 'copy-dlls'),
      sdlSubsystem: config.get<string>('sdlSubsystem', 'windows'),
      sdlCopyAllRuntimeDlls: config.get<boolean>('sdlCopyAllRuntimeDlls', true)
    };
  }

  private async applyCompilerSettings(settings?: Partial<GenericCompilerSettings>): Promise<void> {
    if (!settings || typeof settings !== 'object') {
      return;
    }
    const config = vscode.workspace.getConfiguration('cpm');
    const target = vscode.ConfigurationTarget.Workspace;
    const stringKeys: Array<keyof GenericCompilerSettings> = ['cCompilerPath', 'cppCompilerPath', 'archiverPath', 'debuggerPath', 'outputDirectory', 'cStandard', 'cppStandard', 'warningLevel', 'optimizationLevel', 'debugInformation', 'architectureMode', 'runtimeDependencyMode', 'sdlEnabled', 'sdlVersion', 'sdlRootPath', 'sdlRuntimeMode', 'sdlSubsystem'];
    const listKeys: Array<keyof GenericCompilerSettings> = ['compilerFlags', 'cCompilerFlags', 'cppCompilerFlags', 'linkerFlags', 'includePaths', 'libraryPaths', 'libraries', 'defineSymbols', 'sdlPackages'];
    for (const key of stringKeys) {
      const value = settings[key];
      if (typeof value === 'string') {
        await config.update(key, value, target);
      }
    }
    for (const key of listKeys) {
      const value = settings[key];
      if (Array.isArray(value)) {
        await config.update(key, value.map(String).map((entry) => entry.trim()).filter(Boolean), target);
      }
    }
    if (typeof settings.useBuildModeArchitectureFlags === 'boolean') {
      await config.update('useBuildModeArchitectureFlags', settings.useBuildModeArchitectureFlags, target);
    }
    if (typeof settings.cleanRuntimeDllsOnDeploy === 'boolean') {
      await config.update('cleanRuntimeDllsOnDeploy', settings.cleanRuntimeDllsOnDeploy, target);
    }
    if (typeof settings.runtimeDependencyMode === 'string') {
      await config.update('deployRuntimeDlls', settings.runtimeDependencyMode === 'copy-dlls' ? 'auto' : 'never', target);
    }
    if (typeof settings.sdlCopyAllRuntimeDlls === 'boolean') {
      await config.update('sdlCopyAllRuntimeDlls', settings.sdlCopyAllRuntimeDlls, target);
    }
    if (typeof settings.architectureMode === 'string') {
      await config.update('useBuildModeArchitectureFlags', settings.architectureMode === 'from-build-mode', target);
    }
  }

  private render(ref: CpmWorkspaceProjectRef): string {
    const representativeMode = this.representativeMode(this.selectedScope);
    const project = this.workspaces.getProject(ref);
    const settings = this.settings.getSettings(ref, representativeMode);
    const target = this.parser.getNativeTargetSettings(ref.absolutePath, representativeMode);
    const compiler = this.getCompilerSettings();
    const workspace = this.workspaces.currentWorkspace;
    const mode = this.selectedScope;
    const dependencies = workspace?.projects.filter((candidate) => candidate.index !== ref.index).map((candidate) => {
      const key = this.settings.dependencyKey(candidate);
      return `<label class="dependency"><input type="checkbox" data-dependency="${escapeHtml(key)}" ${settings.dependencies.includes(key) ? 'checked' : ''}> <span>${escapeHtml(candidate.name)}</span><small>${escapeHtml(candidate.relativePath)}</small></label>`;
    }).join('') || '<div class="muted">No other project is available in the current C/C++ workspace.</div>';
    const nativeDefaults = safeScriptJson(target);
    const cStandardOptions: SelectOption[] = [
      ['auto', 'auto'], ['c89', 'c89'], ['c90', 'c90'], ['c99', 'c99'], ['c11', 'c11'], ['c17', 'c17'], ['gnu89', 'gnu89'], ['gnu99', 'gnu99'], ['gnu11', 'gnu11'], ['gnu17', 'gnu17']
    ];
    const cppStandardOptions: SelectOption[] = [
      ['auto', 'auto'], ['c++98', 'c++98'], ['c++03', 'c++03'], ['c++11', 'c++11'], ['c++14', 'c++14'], ['c++17', 'c++17'], ['c++20', 'c++20'], ['c++23', 'c++23'], ['gnu++11', 'gnu++11'], ['gnu++14', 'gnu++14'], ['gnu++17', 'gnu++17'], ['gnu++20', 'gnu++20'], ['gnu++23', 'gnu++23']
    ];
    const warningLevelOptions: SelectOption[] = [
      ['none', 'No warning flag'],
      ['wall', '-Wall'],
      ['wall-extra', '-Wall -Wextra'],
      ['wall-extra-pedantic', '-Wall -Wextra -Wpedantic'],
      ['all', '-Wall -Wextra -Wpedantic -Wconversion']
    ];
    const optimizationOptions: SelectOption[] = [
      ['mode-default', 'Mode default: Debug=-O0, Release=-O2'],
      ['none', 'No optimization flag'],
      ['O0', '-O0'],
      ['Og', '-Og'],
      ['O1', '-O1'],
      ['O2', '-O2'],
      ['O3', '-O3'],
      ['Os', '-Os'],
      ['Ofast', '-Ofast']
    ];
    const debugInfoOptions: SelectOption[] = [
      ['mode-default', 'Mode default: Debug=-g, Release=none'],
      ['none', 'No debug information flag'],
      ['g', '-g'],
      ['g3', '-g3']
    ];
    const architectureOptions: SelectOption[] = [
      ['auto', 'Auto / selected compiler default'],
      ['from-build-mode', 'From build mode: Debug/Release=-m32, Debug64/Release64=-m64'],
      ['m32', 'Force 32-bit (-m32)'],
      ['m64', 'Force 64-bit (-m64)']
    ];
    const runtimeDependencyOptions: SelectOption[] = [
      ['copy-dlls', 'Copy toolchain runtime DLLs beside target'],
      ['path-only', 'PATH only when running/debugging from CPM'],
      ['static-link', 'Static-link toolchain runtime when possible']
    ];
    const sdlEnabledOptions: SelectOption[] = [
      ['off', 'Off'],
      ['auto', 'Auto: only projects that use SDL'],
      ['on', 'On: inject SDL flags for builds']
    ];
    const sdlVersionOptions: SelectOption[] = [
      ['auto', 'Auto: infer from selected packages / source'],
      ['SDL2', 'SDL2'],
      ['SDL3', 'SDL3']
    ];
    const sdlRuntimeOptions: SelectOption[] = [
      ['copy-dlls', 'Copy SDL DLLs beside executable'],
      ['path-only', 'Use PATH only when running/debugging'],
      ['static-link', 'Static link, when SDK/static libs allow it']
    ];
    const sdlSubsystemOptions: SelectOption[] = [
      ['windows', 'Windows GUI subsystem (-mwindows)'],
      ['console', 'Console subsystem (-mconsole)']
    ];

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>C/C++ Project Build Settings</title>
<style>
*{box-sizing:border-box}body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:22px;max-width:1220px;margin:auto}h1{margin:0 0 5px;font-size:24px}h2{font-size:16px;margin:0 0 11px}h3{font-size:14px;margin:15px 0 5px}.muted{color:var(--vscode-descriptionForeground);line-height:1.45}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:12px;margin-top:16px}.card{border:1px solid var(--vscode-panel-border);border-radius:7px;background:var(--vscode-sideBar-background);padding:15px}.wide{grid-column:1/-1}label.field{display:block;margin-top:10px;font-weight:600}textarea,input,select{width:100%;margin-top:5px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,transparent);padding:7px;font:inherit;border-radius:3px}textarea{min-height:74px;resize:vertical;font-family:var(--vscode-editor-font-family)}.dependency{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;padding:7px 0;border-bottom:1px solid var(--vscode-panel-border)}.dependency input,.check input{width:auto;grid-row:1/3;margin:0 6px 0 0}.dependency small{color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}.check{display:block;margin:7px 0}.notice{margin-top:12px;border:1px solid var(--vscode-panel-border);background:var(--vscode-textBlockQuote-background);padding:10px;border-radius:5px;color:var(--vscode-descriptionForeground);line-height:1.45}.actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:16px}button{border:1px solid var(--vscode-button-border,transparent);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:8px 14px;border-radius:3px;cursor:pointer}button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}.path{font-family:var(--vscode-editor-font-family);font-size:12px;overflow-wrap:anywhere;margin-top:5px;color:var(--vscode-descriptionForeground)}details{margin:0}summary{cursor:pointer;font-weight:700;font-size:16px;list-style-position:outside}.section-body{padding-top:11px}.target-dll{display:none}body[data-target="Dynamic Link Library"] .target-dll{display:block}.target-exe-only,.target-linkable-only,.target-runable-only,.target-static-only,.target-nonstatic-only{display:none}body[data-target="Executable"] .target-exe-only{display:block}body[data-target="Executable"] .target-linkable-only,body[data-target="Dynamic Link Library"] .target-linkable-only{display:block}body[data-target="Executable"] .target-runable-only,body[data-target="Dynamic Link Library"] .target-runable-only{display:block}body[data-target="Static Library"] .target-static-only{display:block}body[data-target="Executable"] .target-nonstatic-only,body[data-target="Dynamic Link Library"] .target-nonstatic-only{display:block}.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.inline{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px}.inline .check{margin:0}.path-control{display:grid;grid-template-columns:minmax(0,1fr) 34px;gap:5px;align-items:end}.path-control input{min-width:0}.path-list-control{display:grid;grid-template-columns:minmax(0,1fr) 34px;gap:5px;align-items:start}.path-list-control textarea{min-width:0}.path-list-control .browse{margin-top:5px}.target-note{margin-top:8px;padding:8px 10px;border-left:3px solid var(--vscode-textLink-foreground);background:var(--vscode-textBlockQuote-background);color:var(--vscode-descriptionForeground);line-height:1.45}.browse{display:flex;align-items:center;justify-content:center;margin-top:5px;padding:6px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border-color:var(--vscode-button-border,transparent)}.browse:hover{background:var(--vscode-button-secondaryHoverBackground)}.browse svg{width:16px;height:16px;fill:currentColor}.scope{margin-top:12px;max-width:420px}.scope-note{margin-top:7px;color:var(--vscode-descriptionForeground)}.disabled-control-zone{opacity:.58}.hidden{display:none!important}@media(max-width:760px){.two{grid-template-columns:1fr}}
</style></head>
<body data-target="${escapeHtml(target.targetType)}">
<h1>C/C++ Project Build Settings</h1><div class="muted">${escapeHtml(ref.name)} · edited configuration: <strong>${escapeHtml(scopeLabel(mode))}</strong></div><div class="path">${escapeHtml(ref.absolutePath)}</div>
<label class="field scope">Configuration scope<select id="configurationScope">${scopeOptions(mode)}</select></label><div class="scope-note">${mode === 'all' ? 'The entered values will be applied to Debug, Release, Debug64 and Release64.' : `Only ${escapeHtml(scopeLabel(mode))} will be modified.`}</div>
<div class="notice">This page edits the generic CPM build workflow. Target type and output path are stored in the project <code>.prj</code>; run options, build actions and dependencies are stored in <code>.vscode/cpm-build.json</code>. Legacy <code>.vscode/labwindows-cpm-build.json</code> files are still read for migration.</div>
<div class="grid">
<section class="card wide"><details open><summary>Target</summary><div class="section-body"><label class="field">Target type<select id="targetType"><option ${target.targetType === 'Executable' ? 'selected' : ''}>Executable</option><option ${target.targetType === 'Dynamic Link Library' ? 'selected' : ''}>Dynamic Link Library</option><option ${target.targetType === 'Static Library' ? 'selected' : ''}>Static Library</option></select></label>${pathField('Output file', 'outputPath', target.outputPath)}<p class="muted">For generic builds, the output path is passed to GCC/G++/ar as the final target path.</p><div class="target-note target-exe-only">Executable target: compiler/linker settings, libraries and run/debug command-line options are active.</div><div class="target-note target-dll">DLL target: shared-library linking is active. Run options are used only when an external host executable is configured.</div><div class="target-note target-static-only">Static library target: sources are compiled to objects then archived with <code>ar</code>. Linker, runtime and debugger options are hidden because no executable is produced.</div></div></details></section>
<section class="card wide"><details open><summary>Toolchain and predefined compiler options</summary><div class="section-body two">${pathField('C compiler', 'cCompilerPath', compiler.cCompilerPath)}${pathField('C++ compiler / linker', 'cppCompilerPath', compiler.cppCompilerPath)}<div class="target-static-only">${pathField('Static library archiver', 'archiverPath', compiler.archiverPath)}</div><div class="target-exe-only">${pathField('Debugger', 'debuggerPath', compiler.debuggerPath)}</div>${pathField('Output directory', 'outputDirectory', compiler.outputDirectory)}${selectField('Architecture', 'architectureMode', compiler.architectureMode, architectureOptions)}${selectField('C standard', 'cStandard', compiler.cStandard, cStandardOptions)}${selectField('C++ standard', 'cppStandard', compiler.cppStandard, cppStandardOptions)}${selectField('Warnings', 'warningLevel', compiler.warningLevel, warningLevelOptions)}${selectField('Optimization', 'optimizationLevel', compiler.optimizationLevel, optimizationOptions)}${selectField('Debug information', 'debugInformation', compiler.debugInformation, debugInfoOptions)}<label class="check hidden"><input id="useBuildModeArchitectureFlags" type="checkbox" ${checked(compiler.architectureMode === 'from-build-mode' || compiler.useBuildModeArchitectureFlags)}></label></div></details></section>
<section class="card wide target-linkable-only"><details open><summary>Generic toolchain runtime dependencies</summary><div class="section-body two">${selectField('Runtime handling', 'runtimeDependencyMode', compiler.runtimeDependencyMode, runtimeDependencyOptions)}<label class="check"><input id="cleanRuntimeDllsOnDeploy" type="checkbox" ${checked(compiler.cleanRuntimeDllsOnDeploy)}> Remove stale or architecture-mismatched copied runtime DLLs before redeploy</label></div><p class="muted"><code>copy-dlls</code> copies detected toolchain runtime DLLs beside the target, including GCC/MinGW/MSYS2 and LLVM/Clang runtimes when they are imported by the executable or present in the selected toolchain. <code>path-only</code> keeps the output directory clean and prepends the selected toolchain <code>bin</code> directory to PATH only for CPM run/debug. <code>static-link</code> injects GCC/Clang static runtime flags when the selected toolchain supports them.</p></details></section>
<section class="card wide target-linkable-only"><details open><summary>SDL integration</summary><div class="section-body two">${selectField('SDL integration', 'sdlEnabled', compiler.sdlEnabled, sdlEnabledOptions)}${selectField('SDL version', 'sdlVersion', compiler.sdlVersion, sdlVersionOptions)}${pathField('SDL SDK root', 'sdlRootPath', compiler.sdlRootPath)}${textAreaField('SDL packages', 'sdlPackages', compiler.sdlPackages)}${selectField('SDL runtime handling', 'sdlRuntimeMode', compiler.sdlRuntimeMode, sdlRuntimeOptions)}${selectField('SDL Windows subsystem', 'sdlSubsystem', compiler.sdlSubsystem, sdlSubsystemOptions)}<label class="check"><input id="sdlCopyAllRuntimeDlls" type="checkbox" ${checked(compiler.sdlCopyAllRuntimeDlls)}> Copy every DLL from SDL bin directory</label></div><p class="muted">Use packages such as SDL2, SDL2_image, SDL2_ttf, SDL2_mixer, SDL2_net, SDL2_gfx, SDL3, SDL3_image, SDL3_ttf, SDL3_mixer or SDL3_net, one per line. The dedicated SDL SDK command can auto-detect C:\Program Files\SDL64 and fill this section.</p></details></section>
<section class="card wide"><details><summary>Advanced compiler and linker flags</summary><div class="section-body two">${textAreaField('Define symbols (-D)', 'defineSymbols', compiler.defineSymbols)}${pathListField('Include paths (-I)', 'includePaths', compiler.includePaths)}<div class="target-linkable-only">${pathListField('Library paths (-L)', 'libraryPaths', compiler.libraryPaths)}</div><div class="target-linkable-only">${textAreaField('Libraries (-l)', 'libraries', compiler.libraries)}</div>${textAreaField('Common compiler flags', 'compilerFlags', compiler.compilerFlags)}${textAreaField('C-only compiler flags', 'cCompilerFlags', compiler.cCompilerFlags)}${textAreaField('C++-only compiler flags', 'cppCompilerFlags', compiler.cppCompilerFlags)}<div class="target-linkable-only">${textAreaField('Linker flags', 'linkerFlags', compiler.linkerFlags)}</div></div><p class="muted target-linkable-only">Use one value per line. Library paths, libraries and linker flags are used only for executable and DLL targets.</p><p class="muted target-static-only">Static libraries do not use linker flags, library paths or <code>-l</code> entries. Use compiler flags and include paths for object compilation, and the archiver path for final archive creation.</p></details></section>
<section class="card wide"><details open><summary>Project dependencies and build order</summary><div class="section-body"><p class="muted">Checked projects are built before ${escapeHtml(ref.name)}.</p>${dependencies}</div></details></section>
<section id="runOptionsSection" class="card wide target-runable-only"><details open><summary>Run / debug command line</summary><div class="section-body"><label class="field">Command line arguments<input id="arguments" value="${escapeHtml(settings.run.arguments)}" placeholder="--option value"></label>${pathField('Working directory', 'workingDirectory', settings.run.workingDirectory)}<label class="field">Environment options<input id="environmentOptions" value="${escapeHtml(settings.run.environmentOptions)}" placeholder="NAME=value;OTHER=value"></label><div id="externalProcessPathRow" class="target-dll">${pathField('External executable for DLL debugging', 'externalProcessPath', settings.run.externalProcessPath)}</div><p class="muted target-dll">DLL targets are not launched directly. These fields are used when an external host executable loads the DLL.</p></div></details></section>
<section class="card wide"><details open><summary>Build steps</summary><div class="section-body two"><label class="field">Pre-build actions<textarea id="preBuildActions">${escapeHtml(settings.preBuildActions.join('\n'))}</textarea></label><label class="field">Custom build actions<textarea id="customBuildActions">${escapeHtml(settings.customBuildActions.join('\n'))}</textarea></label><label class="field wide">Post-build actions<textarea id="postBuildActions">${escapeHtml(settings.postBuildActions.join('\n'))}</textarea></label></div></details></section>
</div><div class="actions"><button id="importBuildParameters" class="secondary" type="button">Import build parameters</button><button id="exportBuildParameters" class="secondary" type="button">Export build parameters</button><button id="save" type="button">Save project build settings</button></div>
<script>
const vscode=acquireVsCodeApi();const nativeTargetDefaults=${nativeDefaults};
const el=(id)=>document.getElementById(id);const val=(id)=>el(id)?.value??'';const flag=(id)=>!!el(id)?.checked;const lines=(id)=>val(id).split(/(?:\\r?\\n|;)/).map(x=>x.trim()).filter(Boolean);const chosen=(selector)=>[...document.querySelectorAll(selector+':checked')].map(e=>e.value);const disableField=(id,disabled)=>{const node=el(id);if(node)node.disabled=disabled;};const disableBrowse=(field,disabled)=>{const button=document.querySelector('[data-browse-field="'+field+'"]');if(button)button.disabled=disabled;};const setDisplay=(selector,visible)=>document.querySelectorAll(selector).forEach(node=>{node.style.display=visible?'':'none';});const updateTargetControls=()=>{const target=val('targetType');document.body.dataset.target=target;const exe=target==='Executable';const dll=target==='Dynamic Link Library';const stat=target==='Static Library';setDisplay('.target-exe-only',exe);setDisplay('.target-dll',dll);setDisplay('.target-static-only',stat);setDisplay('.target-linkable-only',exe||dll);setDisplay('.target-runable-only',exe||dll);setDisplay('.target-nonstatic-only',exe||dll);disableField('archiverPath',!stat);disableBrowse('archiverPath',!stat);disableField('debuggerPath',!exe);disableBrowse('debuggerPath',!exe);disableField('libraryPaths',stat);disableBrowse('libraryPaths',stat);disableField('libraries',stat);disableField('linkerFlags',stat);disableField('arguments',stat);disableField('workingDirectory',stat);disableBrowse('workingDirectory',stat);disableField('environmentOptions',stat);disableField('externalProcessPath',!dll);disableBrowse('externalProcessPath',!dll);};
document.querySelectorAll('[data-browse-field]').forEach(button=>button.addEventListener('click',()=>vscode.postMessage({type:'browse',field:button.dataset.browseField})));
el('configurationScope')?.addEventListener('change',()=>vscode.postMessage({type:'changeScope',scope:val('configurationScope')}));el('targetType')?.addEventListener('change',updateTargetControls);el('architectureMode')?.addEventListener('change',()=>{const legacy=el('useBuildModeArchitectureFlags');if(legacy)legacy.checked=val('architectureMode')==='from-build-mode';});
window.addEventListener('message',(event)=>{const message=event.data;if(message?.type==='setField'&&el(message.field))el(message.field).value=message.value||'';if(message?.type==='appendLines'&&el(message.field)){const node=el(message.field);const existing=node.value.trim();const values=[...(message.values||[])].map(String).map(x=>x.trim()).filter(Boolean);node.value=[existing,...values].filter(Boolean).join(String.fromCharCode(10));}});
updateTargetControls();
const collectBuildParameters=()=>({scope:val('configurationScope'),targetType:val('targetType'),settings:{preBuildActions:lines('preBuildActions'),customBuildActions:lines('customBuildActions'),postBuildActions:lines('postBuildActions'),dependencies:[...document.querySelectorAll('[data-dependency]:checked')].map(e=>e.dataset.dependency),run:{arguments:val('arguments'),workingDirectory:val('workingDirectory'),environmentOptions:val('environmentOptions'),externalProcessPath:val('externalProcessPath')}},compilerSettings:{cCompilerPath:val('cCompilerPath'),cppCompilerPath:val('cppCompilerPath'),archiverPath:val('archiverPath'),debuggerPath:val('debuggerPath'),outputDirectory:val('outputDirectory'),cStandard:val('cStandard'),cppStandard:val('cppStandard'),warningLevel:val('warningLevel'),optimizationLevel:val('optimizationLevel'),debugInformation:val('debugInformation'),architectureMode:val('architectureMode'),compilerFlags:lines('compilerFlags'),cCompilerFlags:lines('cCompilerFlags'),cppCompilerFlags:lines('cppCompilerFlags'),linkerFlags:lines('linkerFlags'),includePaths:lines('includePaths'),libraryPaths:lines('libraryPaths'),libraries:lines('libraries'),defineSymbols:lines('defineSymbols'),useBuildModeArchitectureFlags:flag('useBuildModeArchitectureFlags'),runtimeDependencyMode:val('runtimeDependencyMode'),cleanRuntimeDllsOnDeploy:flag('cleanRuntimeDllsOnDeploy'),sdlEnabled:val('sdlEnabled'),sdlVersion:val('sdlVersion'),sdlRootPath:val('sdlRootPath'),sdlPackages:lines('sdlPackages'),sdlRuntimeMode:val('sdlRuntimeMode'),sdlSubsystem:val('sdlSubsystem'),sdlCopyAllRuntimeDlls:flag('sdlCopyAllRuntimeDlls')},nativeTarget:{...nativeTargetDefaults,targetType:val('targetType'),outputPath:val('outputPath')}});
el('save').addEventListener('click',()=>vscode.postMessage({type:'save',...collectBuildParameters()}));
el('exportBuildParameters').addEventListener('click',()=>vscode.postMessage({type:'exportBuildParameters',...collectBuildParameters()}));
el('importBuildParameters').addEventListener('click',()=>vscode.postMessage({type:'importBuildParameters',scope:val('configurationScope')}));
</script></body></html>`;
  }
}

type SelectOption = readonly [value: string, label: string];

function normalizeRuntimeDependencyMode(value: string | undefined, legacyValue: string | undefined): string {
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

function targetOption(value: string, selected?: string): string { return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`; }
function checked(value: boolean): string { return value ? 'checked' : ''; }
function textField(label: string, id: string, value: string, placeholder = ''): string { return `<label class="field">${escapeHtml(label)}<input id="${escapeHtml(id)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"></label>`; }
function textAreaField(label: string, id: string, values: string[]): string { return `<label class="field">${escapeHtml(label)}<textarea id="${escapeHtml(id)}">${escapeHtml(values.join('\n'))}</textarea></label>`; }
function pathListField(label: string, id: string, values: string[]): string { return `<label class="field">${escapeHtml(label)}<span class="path-list-control"><textarea id="${escapeHtml(id)}">${escapeHtml(values.join('\n'))}</textarea><button class="browse" type="button" data-browse-field="${escapeHtml(id)}" title="Add folder…" aria-label="Add ${escapeHtml(label)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.25A1.25 1.25 0 0 1 2.75 2h3.1c.4 0 .77.19 1 .5l.6.8h5.8a1.25 1.25 0 0 1 1.25 1.25v6.7a1.25 1.25 0 0 1-1.25 1.25H2.75a1.25 1.25 0 0 1-1.25-1.25v-8Zm1.25-.1a.1.1 0 0 0-.1.1v1h10.7v-.7a.1.1 0 0 0-.1-.1H6.88l-.95-1.27a.1.1 0 0 0-.08-.03h-3.1Zm-.1 2.25v5.85c0 .06.04.1.1.1h10.5a.1.1 0 0 0 .1-.1V5.4H2.65Z"/></svg></button></span></label>`; }
function pathField(label: string, id: string, value: string): string { return `<label class="field">${escapeHtml(label)}<span class="path-control"><input id="${escapeHtml(id)}" value="${escapeHtml(value)}"><button class="browse" type="button" data-browse-field="${escapeHtml(id)}" title="Browse…" aria-label="Browse ${escapeHtml(label)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.25A1.25 1.25 0 0 1 2.75 2h3.1c.4 0 .77.19 1 .5l.6.8h5.8a1.25 1.25 0 0 1 1.25 1.25v6.7a1.25 1.25 0 0 1-1.25 1.25H2.75a1.25 1.25 0 0 1-1.25-1.25v-8Zm1.25-.1a.1.1 0 0 0-.1.1v1h10.7v-.7a.1.1 0 0 0-.1-.1H6.88l-.95-1.27a.1.1 0 0 0-.08-.03h-3.1Zm-.1 2.25v5.85c0 .06.04.1.1.1h10.5a.1.1 0 0 0 .1-.1V5.4H2.65Z"/></svg></button></span></label>`; }
function selectField(label: string, id: string, selected: string, options: SelectOption[]): string { return `<label class="field">${escapeHtml(label)}<select id="${escapeHtml(id)}">${selectOptions(options, selected)}</select></label>`; }
function selectOptions(options: SelectOption[], selected: string): string { const values = [...options]; if (selected && !values.some(([value]) => value === selected)) { values.push([selected, `${selected} (existing value)`]); } return values.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join(''); }
function splitSafeList(value: string): string[] { return value.split(/(?:\r?\n|;)/).map((entry) => entry.trim()).filter(Boolean); }
function escapeHtml(value: string): string { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function stripCodicon(value: string): string { return value.replace(/^\$\([^)]*\)\s*/, ''); }
function sanitizeFileName(value: string): string { return (value || 'project').replace(/[<>:\"/\\|?*]+/g, '_').replace(/\s+/g, '-').replace(/^-+|-+$/g, '') || 'project'; }
function scopeModes(scope: BuildSettingsScope): CpmBuildMode[] { return scope === 'all' ? [...ALL_BUILD_MODES] : [scope]; }
function scopeLabel(scope: BuildSettingsScope): string { return ({ debug: 'Debug', release: 'Release', debug64: 'Debug64', release64: 'Release64', all: 'All Configurations' } as const)[scope]; }
function scopeOptions(selected: BuildSettingsScope): string { return scopeChoices().map((entry) => `<option value="${entry.id}" ${entry.id === selected ? 'selected' : ''}>${escapeHtml(entry.label)}</option>`).join(''); }
function scopeChoices(): Array<{ id: BuildSettingsScope; label: string; description?: string }> { return [
  { id: 'debug', label: 'Debug', description: '32-bit debug configuration' },
  { id: 'release', label: 'Release', description: '32-bit release configuration' },
  { id: 'debug64', label: 'Debug64', description: '64-bit debug configuration' },
  { id: 'release64', label: 'Release64', description: '64-bit release configuration' },
  { id: 'all', label: 'All Configurations', description: 'Apply entered values to every build configuration' }
]; }
function parseScope(value: unknown, fallback: BuildSettingsScope): BuildSettingsScope { return value === 'debug' || value === 'release' || value === 'debug64' || value === 'release64' || value === 'all' ? value : fallback; }
async function pickStoredValue(title: string, options: SelectOption[], selected: string): Promise<string | undefined> { const list = [...options]; if (selected && !list.some(([value]) => value === selected)) { list.push([selected, `${selected} (existing value)`]); } const picked = await vscode.window.showQuickPick(list.map(([value, label]) => ({ value, label, description: value === label ? undefined : value })), { title }); return picked?.value; }
function defaultDialogUri(currentValue: string, projectDirectory: string): vscode.Uri { if (!currentValue) { return vscode.Uri.file(projectDirectory); } const normalizedValue = normalizeRuntimePath(currentValue); const resolved = path.isAbsolute(normalizedValue) || path.win32.isAbsolute(normalizedValue) ? normalizedValue : path.resolve(projectDirectory, normalizedValue); if (fs.existsSync(resolved)) { return vscode.Uri.file(resolved); } const directory = path.dirname(resolved); return vscode.Uri.file(fs.existsSync(directory) ? directory : projectDirectory); }
function browseTitle(field: string): string { return ({ cCompilerPath: 'Select C compiler executable', cppCompilerPath: 'Select C++ compiler/linker executable', archiverPath: 'Select static library archiver executable', debuggerPath: 'Select debugger executable', outputDirectory: 'Select output directory', includePaths: 'Add include directory', libraryPaths: 'Add library directory', outputPath: 'Select output file', iconFile: 'Select application icon file', manifestPath: 'Select manifest file', customDirectoryToCopyDll: 'Select DLL copy directory', typeLibFpFile: 'Select function-panel file', singleHeaderNiTypeInfoFile: 'Select NI type-information header', workingDirectory: 'Select working directory', externalProcessPath: 'Select external executable for DLL debugging', sdlRootPath: 'Select SDL SDK root directory' } as Record<string, string>)[field] ?? 'Select file'; }
function outputFilters(targetType: string): Record<string, string[]> { if (targetType === 'Dynamic Link Library') { return { 'Dynamic-link libraries': ['dll'], 'All files': ['*'] }; } if (targetType === 'Static Library') { return { 'Static libraries': ['lib'], 'All files': ['*'] }; } return { Executables: ['exe'], 'All files': ['*'] }; }
function openFilters(field: string): Record<string, string[]> { switch (field) { case 'iconFile': return { Icons: ['ico'], 'All files': ['*'] }; case 'manifestPath': return { Manifest: ['manifest', 'xml'], 'All files': ['*'] }; case 'typeLibFpFile': return { 'Function panel files': ['fp'], 'All files': ['*'] }; case 'singleHeaderNiTypeInfoFile': return { Headers: ['h', 'hpp'], 'All files': ['*'] }; case 'externalProcessPath': case 'cCompilerPath': case 'cppCompilerPath': case 'archiverPath': case 'debuggerPath': return { Executables: ['exe', 'cmd', 'bat', 'sh'], 'All files': ['*'] }; default: return { 'All files': ['*'] }; } }

function portableModulePath(filePath: string, projectDirectory: string): string { const relative = path.relative(projectDirectory, filePath); if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) { return relative.replace(/\//g, '\\'); } return filePath; }

function safeScriptJson(value: unknown): string { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
