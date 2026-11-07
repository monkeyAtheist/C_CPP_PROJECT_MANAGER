import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CpmNativeTargetSettings, CpmParser } from '../model/cpmParser';
import { CpmBuildMode, CpmWorkspaceProjectRef } from '../model/types';
import { CpmLinkageMode, CpmProjectBuildSettings, CpmProjectSettingsService, DEFAULT_CMAKE_CONFIGURATION, DEFAULT_EXTERNAL_DEPENDENCIES, DEFAULT_REMOTE_LINUX } from '../services/cpmProjectSettingsService';
import { CpmAutocompleteProfile, getCpmAutocompleteSettings } from '../services/cpmSymbolService';
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
  buildLogDetail: string;
  runOutputMode: string;
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
        { id: 'buildBackend', label: '$(gear) Build backend', description: projectSettings.buildBackend === 'cmake' ? 'CMake / Ninja' : 'Direct GCC / Clang' },
        { id: 'linkageMode', label: '$(link) Linkage mode', description: linkageModeLabel(projectSettings.linkageMode) },
        { id: 'parallelJobs', label: '$(server-process) Parallel compile jobs', description: projectSettings.parallelJobs > 0 ? String(projectSettings.parallelJobs) : 'Automatic' },
        { id: 'useResponseFiles', label: '$(file-code) GNU linker response files', description: projectSettings.useResponseFiles ? 'Automatic when command is long' : 'Disabled' },
        { id: 'precompiledHeadersEnabled', label: '$(symbol-namespace) Precompiled headers', description: projectSettings.precompiledHeadersEnabled ? 'Enabled' : 'Disabled' },
        { id: 'cPrecompiledHeader', label: '$(file-code) C precompiled header', description: projectSettings.cPrecompiledHeader || 'Not configured' },
        { id: 'cppPrecompiledHeader', label: '$(file-code) C++ precompiled header', description: projectSettings.cppPrecompiledHeader || 'Not configured' },
        { id: 'unityBuildEnabled', label: '$(combine) Unity Build', description: projectSettings.unityBuildEnabled ? `Enabled · batch ${projectSettings.unityBatchSize}` : 'Disabled' },
        { id: 'outputPath', label: '$(file) Output file', description: target.outputPath || 'Empty' },
        { id: 'applicationTitle', label: '$(tag) Application title', description: target.applicationTitle || 'Empty' },
        { id: 'iconFile', label: '$(file-media) Executable icon file', description: target.iconFile || 'Empty' },
        { id: 'windowIconFile', label: '$(file-media) SDL window icon image', description: target.windowIconFile || 'Empty' },
        { id: 'applyWindowIconAutomatically', label: '$(symbol-boolean) Apply SDL window icon automatically', description: target.applyWindowIconAutomatically ? 'Enabled' : 'Disabled' },
        { id: 'arguments', label: '$(terminal) Command-line arguments', description: projectSettings.run.arguments || 'Empty' },
        { id: 'workingDirectory', label: '$(folder) Working directory', description: projectSettings.run.workingDirectory || 'Empty' },
        { id: 'environmentOptions', label: '$(symbol-key) Environment options', description: projectSettings.run.environmentOptions || 'Empty' },
        { id: 'externalProcessPath', label: '$(run) Program name (DLL host executable)', description: target.targetType === 'Dynamic Link Library' ? (projectSettings.run.externalProcessPath || 'Empty — required to run this DLL target') : target.outputPath || 'Built executable' },
        { id: 'remoteLinux', label: '$(remote) Remote Linux / Raspberry Pi', description: projectSettings.remoteLinux?.enabled ? `${projectSettings.remoteLinux.sshUser ? projectSettings.remoteLinux.sshUser + '@' : ''}${projectSettings.remoteLinux.sshHost || 'not configured'}` : 'Disabled' },
        { id: 'autocompleteProfile', label: '$(symbol-event) Autocompletion profile', description: autocompleteProfileLabel(getCpmAutocompleteSettings().profile) },
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
      if (choice.id === 'remoteLinux') {
        this.show(ref);
        return;
      }
      if (choice.id === 'autocompleteProfile') {
        await vscode.commands.executeCommand('cpm.selectAutocompleteProfile');
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
      if (choice.id === 'buildBackend') {
        const selected = await vscode.window.showQuickPick([
          { label: 'Direct GCC / Clang', value: 'direct' as const, description: 'CPM native build engine' },
          { label: 'CMake / Ninja', value: 'cmake' as const, description: 'Configure/build an existing CMakeLists.txt' }
        ], { title: 'Select C/C++ build backend' });
        if (selected) {
          projectSettings.buildBackend = selected.value;
          this.applyProjectSettings(ref, scope, projectSettings);
          this.workspaces.refresh();
        }
        continue;
      }
      if (choice.id === 'linkageMode') {
        const selected = await vscode.window.showQuickPick([
          { label: 'Dynamic', value: 'dynamic' as CpmLinkageMode, description: 'Normal DLL/runtime dependencies' },
          { label: 'Static compiler runtime', value: 'static-runtime' as CpmLinkageMode, description: 'Embed GCC/MinGW runtime where possible' },
          { label: 'Fully static when available', value: 'static' as CpmLinkageMode, description: 'Prefer .a libraries and force SDL static linkage' }
        ], { title: 'Select C/C++ linkage mode' });
        if (selected) {
          projectSettings.linkageMode = selected.value;
          this.applyProjectSettings(ref, scope, projectSettings);
          this.workspaces.refresh();
        }
        continue;
      }


      if (choice.id === 'parallelJobs') {
        const value = await vscode.window.showInputBox({ title: 'Parallel compile jobs', prompt: '0 = automatic (logical CPU count), 1 = sequential, maximum 256.', value: String(projectSettings.parallelJobs), validateInput: (input) => /^(?:0|[1-9]\d*)$/.test(input.trim()) && Number(input) <= 256 ? undefined : 'Enter an integer from 0 to 256.' });
        if (value !== undefined) {
          projectSettings.parallelJobs = Math.max(0, Math.min(256, Number(value)));
          this.applyProjectSettings(ref, scope, projectSettings);
        }
        continue;
      }
      if (choice.id === 'useResponseFiles') {
        projectSettings.useResponseFiles = !projectSettings.useResponseFiles;
        this.applyProjectSettings(ref, scope, projectSettings);
        continue;
      }
      if (choice.id === 'precompiledHeadersEnabled') {
        projectSettings.precompiledHeadersEnabled = !projectSettings.precompiledHeadersEnabled;
        this.applyProjectSettings(ref, scope, projectSettings);
        continue;
      }
      if (choice.id === 'unityBuildEnabled') {
        projectSettings.unityBuildEnabled = !projectSettings.unityBuildEnabled;
        if (projectSettings.unityBuildEnabled) {
          const batch = await vscode.window.showInputBox({ title: 'Unity Build batch size', prompt: 'Number of original translation units grouped into each generated unity source (2-128).', value: String(projectSettings.unityBatchSize), validateInput: (input) => /^(?:[2-9]|[1-9]\d|1[01]\d|12[0-8])$/.test(input.trim()) ? undefined : 'Enter an integer from 2 to 128.' });
          if (batch !== undefined) projectSettings.unityBatchSize = Number(batch);
        }
        this.applyProjectSettings(ref, scope, projectSettings);
        continue;
      }
      if (choice.id === 'cPrecompiledHeader' || choice.id === 'cppPrecompiledHeader') {
        const key = choice.id as 'cPrecompiledHeader' | 'cppPrecompiledHeader';
        const selected = await vscode.window.showOpenDialog({ title: key === 'cPrecompiledHeader' ? 'Select C precompiled header' : 'Select C++ precompiled header', defaultUri: vscode.Uri.file(path.dirname(ref.absolutePath)), canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { Headers: ['h','hh','hpp','hxx'], 'All files': ['*'] } });
        if (selected?.[0]) {
          projectSettings[key] = portableModulePath(selected[0].fsPath, path.dirname(ref.absolutePath));
          this.applyProjectSettings(ref, scope, projectSettings);
        }
        continue;
      }

      const nativeTextFields: Record<string, keyof Pick<CpmNativeTargetSettings, 'outputPath' | 'applicationTitle' | 'iconFile' | 'windowIconFile'>> = {
        outputPath: 'outputPath',
        applicationTitle: 'applicationTitle',
        iconFile: 'iconFile',
        windowIconFile: 'windowIconFile'
      };
      const runTextFields: Record<string, keyof CpmProjectBuildSettings['run']> = {
        arguments: 'arguments',
        workingDirectory: 'workingDirectory',
        environmentOptions: 'environmentOptions',
        externalProcessPath: 'externalProcessPath'
      };

      if (choice.id === 'applyWindowIconAutomatically') {
        target.applyWindowIconAutomatically = !target.applyWindowIconAutomatically;
        this.applyNativeTargetSettings(ref, scope, target);
        this.workspaces.refresh();
        continue;
      }

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
    if (message?.type === 'command') {
      const command = String(message.command ?? '');
      if (command) {
        await vscode.commands.executeCommand(command);
      }
      return;
    }
    if (message?.type === 'save') {
      try {
        const scope = parseScope(message.scope, this.selectedScope);
        this.selectedScope = scope;
        this.applyBuildParameterPayload(message, scope);
        await this.applyCompilerSettings(message.compilerSettings as Partial<GenericCompilerSettings> | undefined);
        await this.applyAutocompleteSettings(message.autocomplete);
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
      compilerSettings: message.compilerSettings,
      autocomplete: message.autocomplete
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
      const importedAutocomplete = payload?.autocomplete;
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
      await this.applyAutocompleteSettings(importedAutocomplete);
      this.workspaces.refresh();
      vscode.window.showInformationMessage(`Build parameters imported for ${this.projectRef.name} (${scopeLabel(scope)}).`);
      this.update();
    } catch (error) {
      vscode.window.showErrorMessage(`Unable to import build parameters: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async applyAutocompleteSettings(value: any): Promise<void> {
    if (!value || typeof value !== 'object') return;
    const profile = normalizeAutocompleteProfile(value.profile);
    await this.settings.updateCpmConfigurationValue('autocompleteProfile', profile);
    if (typeof value.completionEnabled === 'boolean') await this.settings.updateCpmConfigurationValue('enableSupplementalCompletionProvider', value.completionEnabled);
    if (typeof value.includeProjectCompletion === 'boolean') await this.settings.updateCpmConfigurationValue('enableSupplementalProjectCompletion', value.includeProjectCompletion);
    if (typeof value.includeStandardCompletion === 'boolean') await this.settings.updateCpmConfigurationValue('enableStandardLibraryCompletionProvider', value.includeStandardCompletion);
    if (typeof value.signatureHelpEnabled === 'boolean') await this.settings.updateCpmConfigurationValue('enableSupplementalSignatureHelp', value.signatureHelpEnabled);
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
      windowIconFile: target.windowIconFile,
      manifestPath: target.manifestPath,
      customDirectoryToCopyDll: target.customDirectoryToCopyDll,
      typeLibFpFile: target.typeLibFpFile,
      singleHeaderNiTypeInfoFile: target.singleHeaderNiTypeInfoFile,
      workingDirectory: projectSettings.run.workingDirectory,
      externalProcessPath: projectSettings.run.externalProcessPath,
      sdlRootPath: compilerSettings.sdlRootPath,
      cPrecompiledHeader: projectSettings.cPrecompiledHeader,
      cppPrecompiledHeader: projectSettings.cppPrecompiledHeader
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
    return this.settings.getCpmConfigurationValue<CpmBuildMode>('buildMode', 'debug');
  }

  private representativeMode(scope: BuildSettingsScope): CpmBuildMode {
    return scope === 'all' ? this.buildMode : scope;
  }

  private getCompilerSettings(): GenericCompilerSettings {
    const get = <T,>(key: string, fallback: T): T => this.settings.getCpmConfigurationValue<T>(key, fallback);
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
      runtimeDependencyMode: normalizeRuntimeDependencyMode(get<string>('runtimeDependencyMode', ''), get<string>('deployRuntimeDlls', 'auto')),
      cleanRuntimeDllsOnDeploy: get<boolean>('cleanRuntimeDllsOnDeploy', true),
      sdlEnabled: get<string>('sdlEnabled', 'auto'),
      sdlVersion: get<string>('sdlVersion', 'auto'),
      sdlRootPath: get<string>('sdlRootPath', ''),
      sdlPackages: get<string[]>('sdlPackages', ['SDL2']),
      sdlRuntimeMode: get<string>('sdlRuntimeMode', 'copy-dlls'),
      sdlSubsystem: get<string>('sdlSubsystem', 'windows'),
      sdlCopyAllRuntimeDlls: get<boolean>('sdlCopyAllRuntimeDlls', true),
      buildLogDetail: get<string>('buildLogDetail', 'normal'),
      runOutputMode: get<string>('runOutputMode', 'integrated-terminal')
    };
  }

  private async applyCompilerSettings(settings?: Partial<GenericCompilerSettings>): Promise<void> {
    if (!settings || typeof settings !== 'object') {
      return;
    }
    const stringKeys: Array<keyof GenericCompilerSettings> = ['cCompilerPath', 'cppCompilerPath', 'archiverPath', 'debuggerPath', 'outputDirectory', 'cStandard', 'cppStandard', 'warningLevel', 'optimizationLevel', 'debugInformation', 'architectureMode', 'runtimeDependencyMode', 'sdlEnabled', 'sdlVersion', 'sdlRootPath', 'sdlRuntimeMode', 'sdlSubsystem', 'buildLogDetail', 'runOutputMode'];
    const listKeys: Array<keyof GenericCompilerSettings> = ['compilerFlags', 'cCompilerFlags', 'cppCompilerFlags', 'linkerFlags', 'includePaths', 'libraryPaths', 'libraries', 'defineSymbols', 'sdlPackages'];
    for (const key of stringKeys) {
      const value = settings[key];
      if (typeof value === 'string') {
        await this.settings.updateCpmConfigurationValue(String(key), value);
      }
    }
    for (const key of listKeys) {
      const value = settings[key];
      if (Array.isArray(value)) {
        await this.settings.updateCpmConfigurationValue(String(key), value.map(String).map((entry) => entry.trim()).filter(Boolean));
      }
    }
    if (typeof settings.useBuildModeArchitectureFlags === 'boolean') {
      await this.settings.updateCpmConfigurationValue('useBuildModeArchitectureFlags', settings.useBuildModeArchitectureFlags);
    }
    if (typeof settings.cleanRuntimeDllsOnDeploy === 'boolean') {
      await this.settings.updateCpmConfigurationValue('cleanRuntimeDllsOnDeploy', settings.cleanRuntimeDllsOnDeploy);
    }
    if (typeof settings.runtimeDependencyMode === 'string') {
      await this.settings.updateCpmConfigurationValue('deployRuntimeDlls', settings.runtimeDependencyMode === 'copy-dlls' ? 'auto' : 'never');
    }
    if (typeof settings.sdlCopyAllRuntimeDlls === 'boolean') {
      await this.settings.updateCpmConfigurationValue('sdlCopyAllRuntimeDlls', settings.sdlCopyAllRuntimeDlls);
    }
    if (typeof settings.architectureMode === 'string') {
      await this.settings.updateCpmConfigurationValue('useBuildModeArchitectureFlags', settings.architectureMode === 'from-build-mode');
    }
  }

  private render(ref: CpmWorkspaceProjectRef): string {
    const representativeMode = this.representativeMode(this.selectedScope);
    const project = this.workspaces.getProject(ref);
    const settings = this.settings.getSettings(ref, representativeMode);
    if (!settings.cmake) settings.cmake = JSON.parse(JSON.stringify(DEFAULT_CMAKE_CONFIGURATION));
    if (!settings.buildBackend) settings.buildBackend = 'direct';
    if (!settings.externalDependencies) settings.externalDependencies = JSON.parse(JSON.stringify(DEFAULT_EXTERNAL_DEPENDENCIES));
    if (!settings.remoteLinux) settings.remoteLinux = JSON.parse(JSON.stringify(DEFAULT_REMOTE_LINUX));
    const target = this.parser.getNativeTargetSettings(ref.absolutePath, representativeMode);
    const compiler = this.getCompilerSettings();
    const autocomplete = getCpmAutocompleteSettings();
    const cpmConfig = vscode.workspace.getConfiguration('cpm');
    const autocompleteProfile = autocomplete.profile;
    const autocompleteCustom = {
      completionEnabled: cpmConfig.get<boolean>('enableSupplementalCompletionProvider', true),
      includeProjectCompletion: cpmConfig.get<boolean>('enableSupplementalProjectCompletion', true),
      includeStandardCompletion: cpmConfig.get<boolean>('enableStandardLibraryCompletionProvider', true),
      signatureHelpEnabled: cpmConfig.get<boolean>('enableSupplementalSignatureHelp', true)
    };
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
      ['path-only', 'PATH only when running/debugging from CPM']
    ];
    const linkageOptions: SelectOption[] = [
      ['dynamic', 'Dynamic — normal DLL/runtime dependencies'],
      ['static-runtime', 'Static compiler runtime — libgcc/libstdc++ embedded'],
      ['static', 'Fully static when available — prefer .a libraries']
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
    const runOutputModeOptions: SelectOption[] = [
      ['integrated-terminal', 'Integrated Terminal (recommended, supports stdin)'],
      ['output-channel', 'CPM Program Output (stdout/stderr capture)'],
      ['detached', 'Detached / no output capture (legacy)']
    ];

    const buildBackendOptions: SelectOption[] = [
      ['direct', 'Direct GCC / Clang — CPM native engine'],
      ['cmake', 'CMake / Ninja — existing CMakeLists.txt']
    ];
    const cmakeGeneratorOptions: SelectOption[] = [
      ['Ninja', 'Ninja'],
      ['Ninja Multi-Config', 'Ninja Multi-Config'],
      ['auto', 'CMake default generator'],
      ['MinGW Makefiles', 'MinGW Makefiles'],
      ['Unix Makefiles', 'Unix Makefiles']
    ];

    const logDetailOptions: SelectOption[] = [
      ['compact', 'Compact: phases, summary, warnings and errors'],
      ['normal', 'Normal: phases, compiled files, durations, structured diagnostics'],
      ['verbose', 'Verbose: normal report plus commands and successful tool output']
    ];
    const settingsPages = [
      { id: 'overview', label: 'Overview', description: 'Project status and common CPM actions.' },
      { id: 'project', label: 'Project', description: 'Target identity, output path and project file behaviour.' },
      { id: 'toolchain', label: 'Toolchain', description: 'Compilers, architecture, standards and runtime dependencies.' },
      { id: 'build', label: 'Build', description: 'Compiler inputs, linker inputs, flags and build steps.' },
      { id: 'run', label: 'Run & Debug', description: 'Command-line execution, working directory and DLL host program.' },
      { id: 'autocomplete', label: 'Autocompletion', description: 'CPM completion profiles, project symbols, standard-library assist and Signature Help.' },
      { id: 'sdl', label: 'SDL', description: 'SDL2 / SDL3 SDK, packages, subsystem and runtime deployment.' },
      { id: 'packages', label: 'Packages', description: 'vcpkg, Conan 2, pkg-config and normalized build integration.' },
      { id: 'remote', label: 'Remote Linux', description: 'SSH synchronization, Raspberry Pi/Linux build, run and gdbserver debug.' },
      { id: 'dependencies', label: 'Project Graph', description: 'Project-to-project dependencies and build order.' },
      { id: 'diagnostics', label: 'Diagnostics', description: 'Build log detail, Problems integration and trace access.' }
    ];
    const pageNavigation = settingsPages.map((page, index) => `<button type="button" class="page-tab ${index === 0 ? 'active' : ''}" data-settings-page-target="${escapeHtml(page.id)}" title="${escapeHtml(page.description)}">${escapeHtml(page.label)}</button>`).join('');
    const settingsPageMetadata = safeScriptJson(settingsPages);
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>C/C++ Project Settings</title>
<style>
:root{color-scheme:light dark;--cpm-sticky-offset:184px}
*{box-sizing:border-box}
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px;max-width:1440px;margin:auto}
h1{margin:0 0 4px;font-size:26px}h2{font-size:17px;margin:0 0 13px;display:flex;align-items:center;gap:7px}h3{font-size:14px;margin:0 0 10px}.muted,.subtitle{color:var(--vscode-descriptionForeground);line-height:1.45}.path{font-family:var(--vscode-editor-font-family);font-size:12px;overflow-wrap:anywhere;margin-top:4px;color:var(--vscode-descriptionForeground)}code{font-family:var(--vscode-editor-font-family)}
.settings-sticky-header{position:sticky;top:0;z-index:8;background:var(--vscode-editor-background);isolation:isolate;margin-bottom:14px;border-bottom:1px solid var(--vscode-panel-border);box-shadow:0 5px 12px rgba(0,0,0,.08)}
.toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:10px 0;background:var(--vscode-editor-background)}.toolbar .actions,.actions{display:flex;gap:8px;flex-wrap:wrap}.toolbar .field{min-width:230px}.actions.bottom{justify-content:flex-end;margin-top:16px}
.page-nav{display:flex;gap:4px;overflow-x:auto;overflow-y:hidden;padding:6px 0 8px;scrollbar-width:thin;background:var(--vscode-editor-background)}.page-tab{flex:0 0 auto;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--vscode-descriptionForeground);padding:8px 11px;border-radius:4px 4px 0 0;font-weight:600}.page-tab:hover{background:var(--vscode-toolbar-hoverBackground);color:var(--vscode-foreground)}.page-tab.active{border-bottom-color:var(--vscode-textLink-foreground);background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}
.settings-nav{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,340px) minmax(180px,auto);gap:10px;align-items:center;padding:8px 0 12px;background:var(--vscode-editor-background)}.page-context{display:flex;flex-direction:column;gap:2px;min-width:0}.page-context strong{font-size:13px}.page-context span{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dirty{font-size:12px;color:var(--vscode-descriptionForeground);white-space:nowrap}.dirty.changed{color:var(--vscode-editorWarning-foreground);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.card{grid-column:1/-1;border:1px solid var(--vscode-panel-border);border-radius:7px;background:var(--vscode-sideBar-background);padding:16px;min-width:0;scroll-margin-top:var(--cpm-sticky-offset)}.card.page-hidden,.card.filter-hidden{display:none!important}.wide{grid-column:1/-1}.fields,.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:flex;flex-direction:column;gap:5px;margin-top:0;font-weight:600}.field.wide{grid-column:1/-1}.section-body{padding-top:0}.settings-subsection{border-top:1px solid var(--vscode-panel-border);margin-top:14px;padding-top:12px}.settings-subsection:first-child{border-top:0;margin-top:0;padding-top:0}
.control-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.control-group{border:1px solid var(--vscode-panel-border);border-radius:5px;padding:11px;background:var(--vscode-editorWidget-background)}.control-group h3{font-size:13px;margin:0 0 9px}.control-group .actions{gap:6px}.control-group button{font-size:12px;padding:6px 9px}
textarea,input,select{width:100%;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,transparent);padding:7px 8px;font:inherit;border-radius:2px}textarea{min-height:92px;resize:vertical;font-family:var(--vscode-editor-font-family);font-size:12px}input:focus,select:focus,textarea:focus,button:focus{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}
.backend-disabled{opacity:.72}.backend-disabled:after{content:'Managed by the CMake backend';display:block;margin-top:10px;color:var(--vscode-descriptionForeground);font-size:12px}.dependency{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;padding:7px 0;border-bottom:1px solid var(--vscode-panel-border)}.dependency input,.check input{width:auto;grid-row:1/3;margin:0 6px 0 0}.dependency small{color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}.check{display:block;margin:7px 0;font-weight:400}.notice{margin-top:12px;border:1px solid var(--vscode-panel-border);background:var(--vscode-textBlockQuote-background);padding:10px;border-radius:5px;color:var(--vscode-descriptionForeground);line-height:1.45}.pill-row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.pill{border:1px solid var(--vscode-panel-border);border-radius:999px;padding:4px 9px;font-size:12px;color:var(--vscode-descriptionForeground)}
button{border:1px solid var(--vscode-button-border,transparent);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:7px 11px;border-radius:3px;cursor:pointer;font:inherit}button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}button:not(.page-tab):hover{background:var(--vscode-button-hoverBackground)}.path-control{display:grid;grid-template-columns:minmax(0,1fr) 34px;gap:5px;align-items:end}.path-control input{min-width:0}.path-list-control{display:grid;grid-template-columns:minmax(0,1fr) 34px;gap:5px;align-items:start}.path-list-control textarea{min-width:0}.path-list-control .browse{margin-top:0}.browse{display:flex;align-items:center;justify-content:center;padding:6px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border-color:var(--vscode-button-border,transparent)}.browse svg{width:16px;height:16px;fill:currentColor}
body:not(.settings-js-ready) [data-settings-section]:not([data-settings-page="overview"]){display:none!important}
.target-dll,.target-exe-only,.target-linkable-only,.target-runable-only,.target-static-only,.target-nonstatic-only{display:none}body[data-target="Dynamic Link Library"] .target-dll{display:block}body[data-target="Executable"] .target-exe-only{display:block}body[data-target="Executable"] .target-linkable-only,body[data-target="Dynamic Link Library"] .target-linkable-only{display:block}body[data-target="Executable"] .target-runable-only,body[data-target="Dynamic Link Library"] .target-runable-only{display:block}body[data-target="Static Library"] .target-static-only{display:block}body[data-target="Executable"] .target-nonstatic-only,body[data-target="Dynamic Link Library"] .target-nonstatic-only{display:block}.target-note{margin-top:8px;padding:8px 10px;border-left:3px solid var(--vscode-textLink-foreground);background:var(--vscode-textBlockQuote-background);color:var(--vscode-descriptionForeground);line-height:1.45}.hidden{display:none!important}
@media(max-width:900px){body{padding:14px}.grid,.fields,.two{grid-template-columns:1fr}.wide{grid-column:auto}.settings-sticky-header{position:static;box-shadow:none}.toolbar{align-items:flex-start;flex-direction:column}.settings-nav{grid-template-columns:1fr}.page-context span{white-space:normal}}
</style></head>
<body data-target="${escapeHtml(target.targetType)}">
<h1>C/C++ Project Settings</h1><div class="subtitle">${escapeHtml(ref.name)} · edited configuration: <strong>${escapeHtml(scopeLabel(mode))}</strong></div><div class="path">${escapeHtml(ref.absolutePath)}</div>
<div id="settingsStickyHeader" class="settings-sticky-header">
  <div class="toolbar"><div><label class="field">Edited build configuration<select id="configurationScope">${scopeOptions(mode)}</select></label><div class="muted">${mode === 'all' ? 'The entered values will be applied to Debug, Release, Debug64 and Release64.' : `Only ${escapeHtml(scopeLabel(mode))} will be modified.`}</div></div><div class="actions"><button id="save" type="button">Save CPM settings</button><button id="importBuildParameters" class="secondary" type="button">Import build parameters</button><button id="exportBuildParameters" class="secondary" type="button">Export build parameters</button></div></div>
  <nav id="pageNav" class="page-nav" aria-label="Settings pages">${pageNavigation}</nav>
  <div id="settingsNavigation" class="settings-nav"><input id="settingsFilter" type="search" placeholder="Filter settings on this page…" aria-label="Filter current settings page"><select id="sectionNav" aria-label="Jump to a section"><option value="">Jump to a section…</option></select><div class="page-context"><strong id="pageTitle">Overview</strong><span id="pageDescription">Project status and common CPM actions.</span><span id="dirtyState" class="dirty">Saved state</span></div></div>
</div>
<div class="grid">
<section id="section-control" data-settings-section data-settings-page="overview" data-settings-title="Control center" class="card wide"><h2>Project control center</h2><div class="control-grid"><div class="control-group"><h3>Build and run</h3><div class="actions"><button data-command="cpm.build">Build</button><button data-command="cpm.rebuild">Rebuild</button><button data-command="cpm.clean">Clean</button><button data-command="cpm.run">Run</button></div></div><div class="control-group"><h3>Toolchain and IntelliSense</h3><div class="actions"><button data-command="cpm.configureInstallation">Toolchain</button><button data-command="cpm.installSupportedToolchains">Install toolchains</button><button data-command="cpm.syncCppTools">IntelliSense</button><button data-command="cpm.diagnoseCppTools">Diagnose</button></div></div><div class="control-group"><h3>SDL</h3><div class="actions"><button data-command="cpm.configureSdl">Detect / select SDK</button><button data-settings-page-target="sdl">SDL settings</button></div></div><div class="control-group"><h3>External dependencies</h3><div class="actions"><button data-command="cpm.dependencies.detectTools">Detect tools</button><button data-command="cpm.dependencies.install">Synchronize</button><button data-settings-page-target="packages">Package settings</button></div></div><div class="control-group"><h3>Remote Linux / Raspberry Pi</h3><div class="actions"><button data-command="cpm.remote.testConnection">Test SSH</button><button data-command="cpm.remote.buildRun">Build & Run remote</button><button data-command="cpm.openSshDeviceManager">SSH devices</button><button data-settings-page-target="remote">Remote settings</button></div></div><div class="control-group"><h3>Diagnostics</h3><div class="actions"><button data-command="cpm.showBuildProblems">Problems</button><button data-command="cpm.showFullBuildTrace">Build Trace</button></div></div></div><div class="notice">This editor is now organized by thematic pages. Use the page bar for broad areas and <code>Jump to a section...</code> for local navigation.</div></section>
<section id="section-target" data-settings-section data-settings-page="project" data-settings-title="Target and output" class="card wide"><h2>Target and output</h2><div class="fields"><label class="field">Target type<select id="targetType"><option ${target.targetType === 'Executable' ? 'selected' : ''}>Executable</option><option ${target.targetType === 'Dynamic Link Library' ? 'selected' : ''}>Dynamic Link Library</option><option ${target.targetType === 'Static Library' ? 'selected' : ''}>Static Library</option></select></label>${pathField('Output file', 'outputPath', target.outputPath)}</div><p class="muted">For generic builds, the output path is passed to GCC/G++/ar as the final target path. Target type and output path are stored in the project <code>.prj</code>.</p><div class="target-note target-exe-only">Executable target: compiler/linker settings, libraries and run/debug command-line options are active.</div><div class="target-note target-dll">DLL target: shared-library linking is active. Run options are used only when an external host executable is configured.</div><div class="target-note target-static-only">Static library target: sources are compiled to objects then archived with <code>ar</code>. Linker, runtime and debugger options are hidden because no executable is produced.</div></section>
<section id="section-icons" data-settings-section data-settings-page="project" data-settings-title="Application icons" class="card wide target-nonstatic-only"><h2>Application icons</h2><div class="fields">${pathField('Executable icon (Windows .ico)', 'iconFile', target.iconFile)}${pathField('SDL window / application icon image', 'windowIconFile', target.windowIconFile)}<label class="check wide"><input id="applyWindowIconAutomatically" type="checkbox" ${checked(target.applyWindowIconAutomatically)}> Apply SDL window icon automatically when SDL_CreateWindow is used</label></div><p class="muted">The executable icon is embedded into Windows <code>.exe</code> targets through a generated resource object when a MinGW-compatible <code>windres</code> tool is available. The SDL window icon is copied beside the executable; when automatic application is enabled, CPM generates a small SDL wrapper and force-includes it during compilation. BMP works with SDL alone; PNG/JPG/WebP require the SDL_image package for the selected SDL version.</p></section>
<section id="section-storage" data-settings-section data-settings-page="project" data-settings-title="Settings storage" class="card wide"><h2>Settings storage</h2><p class="muted">Run options, build actions, project dependencies and external package-manager configuration are stored in <code>.vscode/cpm-build.json</code>. Legacy <code>.vscode/labwindows-cpm-build.json</code> files are still read for migration. If no VS Code workspace folder is open, CPM writes settings next to the loaded <code>.cws</code>/<code>.prj</code> through the detached-workspace fallback.</p><div class="pill-row"><span class="pill">Project: ${escapeHtml(ref.name)}</span><span class="pill">Scope: ${escapeHtml(scopeLabel(mode))}</span><span class="pill">Target: ${escapeHtml(target.targetType)}</span></div></section>
<section id="section-toolchain" data-settings-section data-settings-page="toolchain" data-settings-title="Compilers and predefined options" class="card wide"><h2>Compilers and predefined options</h2><div class="section-body two">${pathField('C compiler', 'cCompilerPath', compiler.cCompilerPath)}${pathField('C++ compiler / linker', 'cppCompilerPath', compiler.cppCompilerPath)}<div class="target-static-only">${pathField('Static library archiver', 'archiverPath', compiler.archiverPath)}</div><div class="target-exe-only">${pathField('Debugger', 'debuggerPath', compiler.debuggerPath)}</div>${pathField('Output directory', 'outputDirectory', compiler.outputDirectory)}${selectField('Architecture', 'architectureMode', compiler.architectureMode, architectureOptions)}${selectField('C standard', 'cStandard', compiler.cStandard, cStandardOptions)}${selectField('C++ standard', 'cppStandard', compiler.cppStandard, cppStandardOptions)}${selectField('Warnings', 'warningLevel', compiler.warningLevel, warningLevelOptions)}${selectField('Optimization', 'optimizationLevel', compiler.optimizationLevel, optimizationOptions)}${selectField('Debug information', 'debugInformation', compiler.debugInformation, debugInfoOptions)}<label class="check hidden"><input id="useBuildModeArchitectureFlags" type="checkbox" ${checked(compiler.architectureMode === 'from-build-mode' || compiler.useBuildModeArchitectureFlags)}></label></div></section>
<section id="section-build-backend" data-settings-section data-settings-page="build" data-settings-title="Build backend and CMake/Ninja" class="card wide"><h2>Build backend</h2><div class="fields">${selectField('Backend','buildBackend',settings.buildBackend,buildBackendOptions)}${selectField('CMake generator','cmakeGenerator',settings.cmake.generator,cmakeGeneratorOptions)}${textField('CMake executable','cmakeExecutable',settings.cmake.executable,'cmake')}${textField('Ninja executable','cmakeNinjaExecutable',settings.cmake.ninjaExecutable,'ninja')}${textField('CMake source directory','cmakeSourceDirectory',settings.cmake.sourceDirectory,'.')}${textField('CMake build directory','cmakeBuildDirectory',settings.cmake.buildDirectory,'.cpm/cmake/\${buildMode}')}${textField('CMake target','cmakeTarget',settings.cmake.target,'empty = infer from CPM target type')}${textField('Generator platform (-A)','cmakeGeneratorPlatform',settings.cmake.generatorPlatform,'optional')}${textField('Generator toolset (-T)','cmakeGeneratorToolset',settings.cmake.generatorToolset,'optional')}${textField('CMake toolchain file','cmakeToolchainFile',settings.cmake.toolchainFile,'optional; relative to project')}</div><div class="control-grid"><label class="control-group check"><input id="cmakeConfigureBeforeBuild" type="checkbox" ${checked(settings.cmake.configureBeforeBuild)}> <strong>Configure before build</strong><div class="muted">Keeps CMake cache and File API metadata synchronized with CMakeLists changes.</div></label><label class="control-group check"><input id="cmakeExportCompileCommands" type="checkbox" ${checked(settings.cmake.exportCompileCommands)}> <strong>Export compile_commands.json</strong><div class="muted">Useful for tooling and diagnostics; supported by Ninja/Makefile generators.</div></label><label class="control-group check"><input id="cmakeInheritCpmCompilers" type="checkbox" ${checked(settings.cmake.inheritCpmCompilers)}> <strong>Inherit CPM C/C++ compilers</strong><div class="muted">Passes CMAKE_C_COMPILER and CMAKE_CXX_COMPILER from the CPM Toolchain page.</div></label><label class="control-group check"><input id="cmakeUseDependencyToolchain" type="checkbox" ${checked(settings.cmake.useDependencyToolchain)}> <strong>Use dependency-manager toolchain automatically</strong><div class="muted">Uses Conan conan_toolchain.cmake or vcpkg.cmake when available and no explicit toolchain file is set.</div></label></div><div class="fields">${textAreaField('CMake cache variables (NAME=value)','cmakeCacheVariables',settings.cmake.cacheVariables)}${textAreaField('Additional configure arguments','cmakeConfigureArguments',settings.cmake.configureArguments)}${textAreaField('Additional cmake --build arguments (use -- before native tool args)','cmakeBuildArguments',settings.cmake.buildArguments)}</div><div class="actions"><button data-command="cpm.selectBuildBackend">Choose backend…</button><button data-command="cpm.cmake.configure">Configure CMake</button><button data-command="cpm.cmake.openReport" class="secondary">Open CMake report</button></div><p class="muted"><strong>Direct GCC/Clang</strong> keeps CPM's native .d/PCH/Unity/link engine. <strong>CMake/Ninja</strong> delegates dependency tracking, PCH/Unity and link rules to CMake and the selected generator. CPM queries the CMake File API to locate the actual executable/DLL/static-library artifact for Run and Debug.</p></section>
<section id="section-build-engine" data-direct-backend-only data-settings-section data-settings-page="build" data-settings-title="Incremental build and parallel compilation" class="card wide"><h2>Build engine</h2><div class="fields"><label class="field">Parallel jobs (0 = automatic)<input id="parallelJobs" type="number" min="0" max="256" value="${settings.parallelJobs}"></label><label class="check" style="align-self:end"><input id="useResponseFiles" type="checkbox" ${checked(settings.useResponseFiles)}> Use GNU response files automatically for long linker command lines</label></div><div class="settings-subsection"><h3>Exact header dependency tracking</h3><p class="muted">Enabled automatically. CPM compiles with <code>-MMD -MP</code> and stores one <code>.d</code> file beside each object. A source is rebuilt only when its source file or one of its actual included headers is newer, missing, or its dependency file is unavailable.</p></div><div class="notice"><strong>Parallel jobs:</strong> 0 uses the available logical CPU count; 1 forces sequential compilation. <strong>Response files:</strong> CPM keeps normal linker arguments for small projects and switches to <code>cpm_link.rsp</code> only when the command line approaches the platform limit.</div></section>
<section id="section-build-acceleration" data-direct-backend-only data-settings-section data-settings-page="build" data-settings-title="Precompiled headers and Unity Build" class="card wide"><h2>Build acceleration</h2><div class="settings-subsection"><h3>Precompiled Headers (PCH)</h3><label class="check"><input id="precompiledHeadersEnabled" type="checkbox" ${checked(settings.precompiledHeadersEnabled)}> Enable CPM-managed precompiled headers</label><div class="fields">${pathField('C PCH header', 'cPrecompiledHeader', settings.cPrecompiledHeader)}${pathField('C++ PCH header', 'cppPrecompiledHeader', settings.cppPrecompiledHeader)}</div><p class="muted">CPM creates generated wrapper headers and <code>.gch</code> files inside the active object directory. Configure the C and C++ PCH independently; leave one empty when the project does not use that language.</p></div><div class="settings-subsection"><h3>Unity Build</h3><div class="fields"><label class="check"><input id="unityBuildEnabled" type="checkbox" ${checked(settings.unityBuildEnabled)}> Group translation units into generated unity sources</label><label class="field">Unity batch size<input id="unityBatchSize" type="number" min="2" max="128" value="${settings.unityBatchSize}"></label></div><p class="muted">Unity Build can substantially reduce compile time on large projects by including several original <code>.c/.cpp</code> files into one generated translation unit. It can expose collisions between file-local macros, anonymous symbols or static names, so it is opt-in and disabled by default.</p></div></section>
<section id="section-linkage" data-direct-backend-only data-settings-section data-settings-page="build" data-settings-title="Linkage mode" class="card wide target-linkable-only"><h2>Linkage</h2><div class="settings-subsection"><h3>Executable / DLL dependency model</h3><div class="fields">${selectField('Linkage mode', 'linkageMode', settings.linkageMode, linkageOptions)}</div></div><p class="muted"><strong>Dynamic</strong> keeps the normal compiler and third-party DLL model. <strong>Static compiler runtime</strong> adds <code>-static-libgcc</code>/<code>-static-libstdc++</code> while leaving third-party libraries configurable. <strong>Fully static</strong> adds <code>-static</code>, forces SDL to static libraries and verifies the resulting PE imports after link. Windows system DLLs such as <code>kernel32.dll</code> remain normal operating-system dependencies.</p><div class="actions"><button data-command="cpm.selectLinkageMode">Choose linkage mode…</button><button data-command="cpm.inspectRuntimeDependencies">Inspect built DLL dependencies</button></div></section>
<section id="section-runtime" data-settings-section data-settings-page="toolchain" data-settings-title="Runtime dependencies" class="card wide target-linkable-only"><h2>Dynamic runtime deployment</h2><div class="section-body two">${selectField('Runtime handling', 'runtimeDependencyMode', compiler.runtimeDependencyMode === 'static-link' ? 'path-only' : compiler.runtimeDependencyMode, runtimeDependencyOptions)}<label class="check"><input id="cleanRuntimeDllsOnDeploy" type="checkbox" ${checked(compiler.cleanRuntimeDllsOnDeploy)}> Remove stale or architecture-mismatched copied runtime DLLs before redeploy</label></div><p class="muted">This controls deployment only when the project linkage mode is <strong>Dynamic</strong>. <code>copy-dlls</code> copies detected GCC/MinGW/MSYS2 and LLVM/Clang runtime DLLs beside the target. <code>path-only</code> keeps the output directory clean and prepends the selected toolchain <code>bin</code> directory to PATH for CPM run/debug. Static linkage is configured separately on the Build page.</p></section>
<section id="section-inputs" data-settings-section data-settings-page="build" data-settings-title="Compiler and linker inputs" class="card wide"><h2>Compiler and linker inputs</h2><div class="settings-subsection"><h3>Preprocessor and includes</h3><div class="fields">${textAreaField('Define symbols (-D)', 'defineSymbols', compiler.defineSymbols)}${pathListField('Include paths (-I)', 'includePaths', compiler.includePaths)}</div></div><div class="settings-subsection target-linkable-only"><h3>Linkage</h3><div class="fields">${pathListField('Library paths (-L)', 'libraryPaths', compiler.libraryPaths)}${textAreaField('Libraries (-l)', 'libraries', compiler.libraries)}</div></div><div class="settings-subsection"><h3>Compiler flags</h3><div class="fields">${textAreaField('Common compiler flags', 'compilerFlags', compiler.compilerFlags)}${textAreaField('C-only compiler flags', 'cCompilerFlags', compiler.cCompilerFlags)}${textAreaField('C++-only compiler flags', 'cppCompilerFlags', compiler.cppCompilerFlags)}<div class="target-linkable-only">${textAreaField('Linker flags', 'linkerFlags', compiler.linkerFlags)}</div></div></div><p class="muted target-linkable-only">Use one value per line. Linker inputs are active only for executable and DLL targets.</p><p class="muted target-static-only">Static libraries do not use linker flags, library paths or <code>-l</code> entries. Use compiler flags and include paths for object compilation, and the archiver path for final archive creation.</p></section>
<section id="section-steps" data-settings-section data-settings-page="build" data-settings-title="Build steps" class="card wide"><h2>Build steps</h2><div class="section-body two"><label class="field">Pre-build actions<textarea id="preBuildActions">${escapeHtml(settings.preBuildActions.join('\n'))}</textarea></label><label class="field">Custom build actions<textarea id="customBuildActions">${escapeHtml(settings.customBuildActions.join('\n'))}</textarea></label><label class="field wide">Post-build actions<textarea id="postBuildActions">${escapeHtml(settings.postBuildActions.join('\n'))}</textarea></label></div></section>
<section id="runOptionsSection" data-settings-section data-settings-page="run" data-settings-title="Run and debug command line" class="card wide target-runable-only"><h2>Run and debug command line</h2><div class="fields">${selectField('Program output', 'runOutputMode', compiler.runOutputMode, runOutputModeOptions)}<div id="externalProcessPathRow">${pathField('Program name', 'externalProcessPath', target.targetType === 'Dynamic Link Library' ? settings.run.externalProcessPath : target.outputPath)}</div><label class="field">Command line arguments<input id="arguments" value="${escapeHtml(settings.run.arguments)}" placeholder="--option value"></label>${pathField('Working directory', 'workingDirectory', settings.run.workingDirectory)}<label class="field">Environment options<input id="environmentOptions" value="${escapeHtml(settings.run.environmentOptions)}" placeholder="NAME=value;OTHER=value"></label></div><p class="muted"><strong>Integrated Terminal</strong> displays <code>printf</code>, <code>std::cout</code>, <code>stderr</code> and supports interactive input such as <code>scanf</code>/<code>std::cin</code>. <strong>CPM Program Output</strong> captures stdout/stderr in an Output channel but does not provide interactive stdin. Debug sessions use the VS Code integrated terminal through cppdbg/GDB.</p><p class="muted target-exe-only">Executable target: Program name is the built output executable and is read-only.</p><p class="muted target-dll">DLL target: Program name is editable and selects the executable that loads or uses the DLL. Run builds the DLL, then launches this host with the configured arguments. Debug builds the DLL and launches the same host under GDB/cppdbg.</p></section>
<section id="section-autocomplete-profile" data-settings-section data-settings-page="autocomplete" data-settings-title="Autocompletion profile" class="card wide"><h2>Autocompletion profile</h2><p class="muted">These settings apply to the current VS Code workspace and are independent from Debug/Release. CPM never disables or rewrites the Microsoft C/C++ provider; Native modes simply withdraw CPM contributions.</p><div class="two"><label class="field">Profile<select id="autocompleteProfile">${selectOptions([['hybrid','Hybrid — CPM + native provider'],['native','Native — native C/C++ provider only'],['nativeSignature','Native + CPM Signature Help'],['standardAssist','Standard Library Assist'],['custom','Custom']],autocompleteProfile)}</select></label><div class="control-group"><h3>Effective behavior</h3><div id="autocompleteEffective" class="pill-row"></div><div id="autocompleteProfileDescription" class="muted"></div></div></div><div class="actions"><button id="saveAutocomplete" type="button">Save settings</button><button id="resetAutocompleteHybrid" class="secondary" type="button">Reset to Hybrid</button><button data-command="cpm.syncCppTools" class="secondary" type="button">Sync IntelliSense</button><button data-command="cpm.diagnoseCppTools" class="secondary" type="button">Diagnose IntelliSense</button></div></section>
<section id="section-autocomplete-custom" data-settings-section data-settings-page="autocomplete" data-settings-title="Custom autocompletion components" class="card wide"><h2>Custom components</h2><p class="muted">These switches are used only when the profile is <strong>Custom</strong>.</p><div id="autocompleteCustomOptions" class="control-grid"><label class="control-group check"><input id="autocompleteCompletionEnabled" type="checkbox" ${checked(autocompleteCustom.completionEnabled)}> <strong>CPM completion provider</strong><div class="muted">Master switch for CPM completion items.</div></label><label class="control-group check"><input id="autocompleteProjectSymbols" type="checkbox" ${checked(autocompleteCustom.includeProjectCompletion)}> <strong>Project symbols</strong><div class="muted">Functions discovered in the active CPM project headers and sources.</div></label><label class="control-group check"><input id="autocompleteStandardLibrary" type="checkbox" ${checked(autocompleteCustom.includeStandardCompletion)}> <strong>Standard-library assist</strong><div class="muted">Fallback completion for common C/C++ symbols when the matching standard header is not already included.</div></label><label class="control-group check"><input id="autocompleteSignatureHelp" type="checkbox" ${checked(autocompleteCustom.signatureHelpEnabled)}> <strong>Immediate Signature Help</strong><div class="muted">Show prototypes and active parameters immediately after <code>(</code> and <code>,</code>.</div></label></div><div class="notice">Recommended when Microsoft C/C++ already indexes the project correctly: <strong>Native + CPM Signature Help</strong>. It avoids duplicate project completion entries while retaining immediate parameter hints.</div></section>
<section id="section-sdl" data-settings-section data-settings-page="sdl" data-settings-title="SDL integration" class="card wide target-linkable-only"><h2>SDL integration</h2><div class="section-body two">${selectField('SDL integration', 'sdlEnabled', compiler.sdlEnabled, sdlEnabledOptions)}${selectField('SDL version', 'sdlVersion', compiler.sdlVersion, sdlVersionOptions)}${pathField('SDL SDK root', 'sdlRootPath', compiler.sdlRootPath)}${textAreaField('SDL packages', 'sdlPackages', compiler.sdlPackages)}${selectField('SDL runtime handling', 'sdlRuntimeMode', compiler.sdlRuntimeMode, sdlRuntimeOptions)}${selectField('SDL Windows subsystem', 'sdlSubsystem', compiler.sdlSubsystem, sdlSubsystemOptions)}<label class="check"><input id="sdlCopyAllRuntimeDlls" type="checkbox" ${checked(compiler.sdlCopyAllRuntimeDlls)}> Copy every DLL from SDL bin directory</label></div><p class="muted">Use packages such as SDL2, SDL2_image, SDL2_ttf, SDL2_mixer, SDL2_net, SDL2_gfx, SDL3, SDL3_image, SDL3_ttf, SDL3_mixer or SDL3_net, one per line. Short aliases such as image, mixer, ttf or net are accepted. During build, CPM also auto-adds installed SDL add-on packages when it detects calls such as IMG_*, Mix_* or TTF_* in the project sources.</p></section>
<section id="section-package-general" data-settings-section data-settings-page="packages" data-settings-title="External dependency management" class="card wide"><h2>External dependency management</h2><div class="fields"><label class="check"><input id="externalDependenciesEnabled" type="checkbox" ${checked(settings.externalDependencies.enabled)}> Enable project-scoped dependency management</label><label class="check"><input id="externalDependenciesAutoInstall" type="checkbox" ${checked(settings.externalDependencies.autoInstallBeforeBuild)}> Synchronize enabled managers automatically before each build</label>${textField('Generated integration directory','externalDependenciesOutputDirectory',settings.externalDependencies.outputDirectory)}</div><p class="muted">CPM normalizes package-manager output into <code>.cpm/dependencies/integration.json</code>. The direct GCC/Clang build consumes its include directories, library directories, libraries and compiler/linker flags automatically.</p><div class="actions"><button data-command="cpm.dependencies.detectTools">Detect tools</button><button data-command="cpm.dependencies.generateManifests">Generate manifests</button><button data-command="cpm.dependencies.install">Install / synchronize</button><button data-command="cpm.dependencies.openReport">Open report</button><button data-command="cpm.dependencies.revealOutput">Reveal output</button><button data-command="cpm.dependencies.clean">Clean generated dependency output</button></div></section>
<section id="section-package-manual" data-settings-section data-settings-page="packages" data-settings-title="Manual build integration" class="card wide"><h2>Manual build integration</h2><div class="fields">${textAreaField('Additional include directories','externalDependenciesIncludeDirectories',settings.externalDependencies.additionalIncludeDirectories)}${textAreaField('Additional library directories','externalDependenciesLibraryDirectories',settings.externalDependencies.additionalLibraryDirectories)}${textAreaField('Additional libraries','externalDependenciesLibraries',settings.externalDependencies.additionalLibraries)}${textAreaField('Additional compiler flags','externalDependenciesCompilerFlags',settings.externalDependencies.additionalCompilerFlags)}${textAreaField('Additional linker flags','externalDependenciesLinkerFlags',settings.externalDependencies.additionalLinkerFlags)}</div><p class="muted">Use these fields for package managers or SDKs whose metadata cannot be fully resolved automatically. Paths are resolved relative to the project when they are not absolute.</p></section>
<section id="section-package-vcpkg" data-settings-section data-settings-page="packages" data-settings-title="vcpkg manifest mode" class="card wide"><h2>vcpkg</h2><label class="check"><input id="externalDependenciesVcpkgEnabled" type="checkbox" ${checked(settings.externalDependencies.vcpkg.enabled)}> Enable vcpkg manifest mode</label><div class="fields">${textField('vcpkg executable','externalDependenciesVcpkgExecutable',settings.externalDependencies.vcpkg.executable,'auto-detect on PATH')}${textField('VCPKG_ROOT','externalDependenciesVcpkgRoot',settings.externalDependencies.vcpkg.root,'optional')}${textField('Manifest file','externalDependenciesVcpkgManifestFile',settings.externalDependencies.vcpkg.manifestFile)}${textField('Installed tree','externalDependenciesVcpkgInstallRoot',settings.externalDependencies.vcpkg.installRoot)}${textField('Target triplet','externalDependenciesVcpkgTriplet',settings.externalDependencies.vcpkg.triplet,'auto: x86/x64-windows[-static] from build mode')}${textField('Host triplet','externalDependenciesVcpkgHostTriplet',settings.externalDependencies.vcpkg.hostTriplet,'optional')}${textField('Builtin baseline','externalDependenciesVcpkgBaseline',settings.externalDependencies.vcpkg.baseline,'optional')}${textAreaField('Dependencies (one per line; features: fmt[core])','externalDependenciesVcpkgPackages',settings.externalDependencies.vcpkg.dependencies)}${textAreaField('Overlay ports','externalDependenciesVcpkgOverlayPorts',settings.externalDependencies.vcpkg.overlayPorts)}${textAreaField('Overlay triplets','externalDependenciesVcpkgOverlayTriplets',settings.externalDependencies.vcpkg.overlayTriplets)}${textAreaField('Additional vcpkg arguments','externalDependenciesVcpkgArguments',settings.externalDependencies.vcpkg.additionalArguments)}</div><p class="muted">When the triplet is empty CPM infers it from the active Debug/Release 32/64-bit mode. Fully-static Windows linkage selects the corresponding <code>-static</code> triplet by default.</p></section>
<section id="section-package-conan" data-settings-section data-settings-page="packages" data-settings-title="Conan 2" class="card wide"><h2>Conan 2</h2><label class="check"><input id="externalDependenciesConanEnabled" type="checkbox" ${checked(settings.externalDependencies.conan.enabled)}> Enable Conan 2</label><div class="fields">${textField('Conan executable','externalDependenciesConanExecutable',settings.externalDependencies.conan.executable,'auto-detect on PATH')}${textField('Manifest file','externalDependenciesConanManifestFile',settings.externalDependencies.conan.manifestFile)}${textField('Output directory','externalDependenciesConanOutputDirectory',settings.externalDependencies.conan.outputDirectory)}${textField('Host profile','externalDependenciesConanProfileHost',settings.externalDependencies.conan.profileHost)}${textField('Build profile','externalDependenciesConanProfileBuild',settings.externalDependencies.conan.profileBuild)}${textField('Lockfile','externalDependenciesConanLockfile',settings.externalDependencies.conan.lockfile,'optional')}${textAreaField('Requires','externalDependenciesConanRequires',settings.externalDependencies.conan.requires)}${textAreaField('Tool requires','externalDependenciesConanToolRequires',settings.externalDependencies.conan.toolRequires)}${textAreaField('Options','externalDependenciesConanOptions',settings.externalDependencies.conan.options)}${textAreaField('Additional Conan arguments','externalDependenciesConanArguments',settings.externalDependencies.conan.additionalArguments)}</div><label class="check"><input id="externalDependenciesConanBuildMissing" type="checkbox" ${checked(settings.externalDependencies.conan.buildMissing)}> Build missing Conan packages</label><p class="muted">CPM generates <code>PkgConfigDeps</code>, <code>CMakeDeps</code> and <code>CMakeToolchain</code>. For the direct CPM build, enable pkg-config and list the generated package names below when you want Conan-generated <code>.pc</code> metadata to feed compiler/linker flags automatically.</p></section>
<section id="section-package-pkgconfig" data-settings-section data-settings-page="packages" data-settings-title="pkg-config and pkgconf" class="card wide"><h2>pkg-config / pkgconf</h2><div class="fields"><label class="check"><input id="externalDependenciesPkgConfigEnabled" type="checkbox" ${checked(settings.externalDependencies.pkgConfig.enabled)}> Enable pkg-config / pkgconf</label><label class="check"><input id="externalDependenciesPkgConfigStatic" type="checkbox" ${checked(settings.externalDependencies.pkgConfig.staticLink)}> Resolve static flags with <code>--static</code></label>${textField('Executable','externalDependenciesPkgConfigExecutable',settings.externalDependencies.pkgConfig.executable,'pkg-config or pkgconf')}${textAreaField('Packages','externalDependenciesPkgConfigPackages',settings.externalDependencies.pkgConfig.packages)}${textAreaField('PKG_CONFIG_PATH entries','externalDependenciesPkgConfigSearchPaths',settings.externalDependencies.pkgConfig.searchPaths)}${textAreaField('Additional pkg-config arguments','externalDependenciesPkgConfigArguments',settings.externalDependencies.pkgConfig.additionalArguments)}</div><p class="muted">The returned <code>-I</code>, <code>-L</code>, <code>-l</code>, compiler flags and linker flags are parsed and merged into CPM's direct build. Conan generator directories are added to the pkg-config search path automatically when Conan is enabled.</p></section>
<section id="section-remote-general" data-settings-section data-settings-page="remote" data-settings-title="Remote Linux endpoint" class="card wide"><h2>Remote Linux / Raspberry Pi</h2><label class="check"><input id="remoteLinuxEnabled" type="checkbox" ${checked(settings.remoteLinux.enabled)}> Enable Remote Linux for this project</label><div class="fields">${textField('SSH host / OpenSSH alias','remoteLinuxSshHost',settings.remoteLinux.sshHost,'raspberrypi or 192.168.1.50')}${textField('SSH user','remoteLinuxSshUser',settings.remoteLinux.sshUser,'pi')}${textField('SSH port','remoteLinuxSshPort',String(settings.remoteLinux.sshPort))}${textField('Remote project directory','remoteLinuxProjectDirectory',settings.remoteLinux.remoteProjectDirectory,'~/cpm-projects/${projectName}')}${textField('SSH executable','remoteLinuxSshExecutable',settings.remoteLinux.sshExecutable)}${textField('SCP executable','remoteLinuxScpExecutable',settings.remoteLinux.scpExecutable)}${textField('rsync executable','remoteLinuxRsyncExecutable',settings.remoteLinux.rsyncExecutable)}</div><div class="control-grid"><label class="control-group check"><input id="remoteLinuxUseRsync" type="checkbox" ${checked(settings.remoteLinux.useRsync)}> <strong>Prefer rsync</strong><div class="muted">Uses rsync with exclusions when available; CPM falls back to scp.</div></label><label class="control-group check"><input id="remoteLinuxSyncBeforeBuild" type="checkbox" ${checked(settings.remoteLinux.syncBeforeBuild)}> <strong>Synchronize before remote build</strong></label><label class="control-group check"><input id="remoteLinuxSyncBeforeRun" type="checkbox" ${checked(settings.remoteLinux.syncBeforeRun)}> <strong>Synchronize before remote run-only</strong></label></div><div class="actions"><button data-command="cpm.remote.testConnection">Test SSH connection</button><button data-command="cpm.remote.sync">Synchronize project</button><button data-command="cpm.remote.openTerminal">Open SSH terminal</button><button data-command="cpm.openSshDeviceManager" class="secondary">OpenSSH Device Manager</button></div><p class="muted">The SSH host field accepts either a host name/IP address or an alias from <code>~/.ssh/config</code>. Private keys remain managed by OpenSSH; CPM never stores private-key material.</p></section>
<section id="section-remote-build" data-settings-section data-settings-page="remote" data-settings-title="Remote GCC/G++ build" class="card wide"><h2>Remote GCC/G++ build</h2><div class="fields">${textField('Remote build directory','remoteLinuxBuildDirectory',settings.remoteLinux.remoteBuildDirectory,'.cpm-remote-build')}${textField('Remote C compiler','remoteLinuxCCompiler',settings.remoteLinux.cCompiler,'gcc')}${textField('Remote C++ compiler','remoteLinuxCppCompiler',settings.remoteLinux.cppCompiler,'g++')}${textField('Remote archiver','remoteLinuxArchiver',settings.remoteLinux.archiver,'ar')}${textAreaField('Additional remote compiler flags','remoteLinuxCompilerFlags',settings.remoteLinux.additionalCompilerFlags)}${textAreaField('Additional remote linker flags','remoteLinuxLinkerFlags',settings.remoteLinux.additionalLinkerFlags)}${textAreaField('Additional remote include directories','remoteLinuxIncludeDirectories',settings.remoteLinux.additionalIncludeDirectories)}${textAreaField('Additional remote library directories','remoteLinuxLibraryDirectories',settings.remoteLinux.additionalLibraryDirectories)}${textAreaField('Additional remote libraries','remoteLinuxLibraries',settings.remoteLinux.additionalLibraries)}${textAreaField('Remote pkg-config packages','remoteLinuxPkgConfigPackages',settings.remoteLinux.pkgConfigPackages)}${textAreaField('Remote environment (NAME=value)','remoteLinuxEnvironment',settings.remoteLinux.environment)}<label class="field wide">Custom remote build command<textarea id="remoteLinuxBuildCommand" placeholder="Leave empty for CPM-generated direct GCC/G++ build">${escapeHtml(settings.remoteLinux.remoteBuildCommand)}</textarea></label></div><p class="muted">When the custom build command is empty, CPM generates <code>.cpm/remote/cpm_remote_build.sh</code>. It carries portable project standards, defines, warning/optimization/debug flags, project-relative include/library paths and linkage mode to Linux. Absolute local Windows paths outside the project are deliberately skipped and reported. Templates available in custom commands: <code>\${projectName}</code>, <code>\${buildMode}</code>, <code>\${projectDir}</code>, <code>\${buildDir}</code>, <code>\${target}</code>.</p><div class="actions"><button data-command="cpm.remote.build">Build on Remote Linux</button><button data-command="cpm.remote.buildRun">Build & Run remote</button></div></section>
<section id="section-remote-run-debug" data-settings-section data-settings-page="remote" data-settings-title="Remote run and gdbserver" class="card wide"><h2>Remote run and gdbserver debug</h2><div class="fields"><label class="field wide">Custom remote run command<textarea id="remoteLinuxRunCommand" placeholder="Leave empty to execute the generated target">${escapeHtml(settings.remoteLinux.remoteRunCommand)}</textarea></label>${textField('gdbserver port','remoteLinuxGdbServerPort',String(settings.remoteLinux.gdbServerPort))}${textField('Remote gdbserver executable','remoteLinuxGdbServerExecutable',settings.remoteLinux.gdbServerExecutable,'gdbserver')}${textField('Remote GDB executable','remoteLinuxDebuggerExecutable',settings.remoteLinux.remoteDebuggerExecutable,'gdb')}<label class="check"><input id="remoteLinuxStartGdbServer" type="checkbox" ${checked(settings.remoteLinux.startGdbServerAutomatically)}> Start gdbserver automatically before cppdbg</label></div><p class="muted">Remote debugging uses the Microsoft C/C++ <code>cppdbg</code> adapter with SSH <code>pipeTransport</code>. GDB itself runs on the Linux/Raspberry Pi target and connects to <code>gdbserver</code> on localhost, so a Windows host does not need a cross-architecture GDB. CPM maps the remote project directory back to the local source tree for breakpoints.</p><div class="actions"><button data-command="cpm.remote.debug">Build & Debug with gdbserver</button><button data-command="cpm.remote.openReport" class="secondary">Open Remote Linux report</button></div></section>
<section id="section-dependencies" data-settings-section data-settings-page="dependencies" data-settings-title="Project dependencies and build order" class="card wide"><h2>Project dependencies and build order</h2><p class="muted">Checked projects are built before ${escapeHtml(ref.name)}.</p>${dependencies}</section>
<section id="section-log" data-settings-section data-settings-page="diagnostics" data-settings-title="Build logs and Problems" class="card wide"><h2>Build logs and Problems</h2><div class="fields">${selectField('Build log detail', 'buildLogDetail', compiler.buildLogDetail, logDetailOptions)}</div><p class="muted">The main <code>C/C++ Project Manager</code> channel is a structured human-readable build report. The full raw commands, stdout, stderr, exit codes and timings remain available in <code>C/C++ Project Manager - Build Trace</code>. Build diagnostics are also sent to <code>View → Problems</code> when the compiler output can be parsed.</p><div class="actions"><button data-command="cpm.showBuildProblems">Show Build Problems</button><button data-command="cpm.showFullBuildTrace">Show Full Build Trace</button></div></section>
</div><div class="actions bottom"><button id="importBuildParametersBottom" class="secondary" type="button">Import build parameters</button><button id="exportBuildParametersBottom" class="secondary" type="button">Export build parameters</button><button id="saveBottom" type="button">Save CPM settings</button></div>
<script>
const vscode=acquireVsCodeApi();document.body.classList.add('settings-js-ready');const nativeTargetDefaults=${nativeDefaults};const settingsPages=${settingsPageMetadata};let dllProgramName=${safeScriptJson(settings.run.externalProcessPath)};
const el=(id)=>document.getElementById(id);const val=(id)=>el(id)?.value??'';const flag=(id)=>!!el(id)?.checked;const lines=(id)=>val(id).replaceAll(String.fromCharCode(13),'').split(String.fromCharCode(10)).flatMap(x=>x.split(';')).map(x=>x.trim()).filter(Boolean);const disableField=(id,disabled)=>{const node=el(id);if(node)node.disabled=disabled;};const disableBrowse=(field,disabled)=>{const button=document.querySelector('[data-browse-field="'+field+'"]');if(button)button.disabled=disabled;};const setDisplay=(selector,visible)=>document.querySelectorAll(selector).forEach(node=>{node.style.display=visible?'':'none';});
const sectionNav=el('sectionNav');const settingsFilter=el('settingsFilter');const pageTitle=el('pageTitle');const pageDescription=el('pageDescription');const dirtyState=el('dirtyState');const pageButtons=[...document.querySelectorAll('[data-settings-page-target]')];const sections=[...document.querySelectorAll('[data-settings-section]')];let webviewState=vscode.getState?.()||{};let activePage=settingsPages.some(page=>page.id===webviewState.activePage)?webviewState.activePage:'overview';
const markDirty=()=>{if(dirtyState){dirtyState.textContent='Unsaved changes';dirtyState.classList.add('changed');}};
const markSaved=()=>{if(dirtyState){dirtyState.textContent='Saved state';dirtyState.classList.remove('changed');}};
const populateSections=()=>{if(!sectionNav)return;sectionNav.innerHTML='<option value="">Jump to a section…</option>';sections.filter(section=>section.dataset.settingsPage===activePage&&!section.classList.contains('page-hidden')).forEach(section=>{const option=document.createElement('option');option.value=section.id;option.textContent=section.dataset.settingsTitle||section.id;sectionNav.appendChild(option);});};
const applyFilter=()=>{const query=(settingsFilter?.value||'').trim().toLowerCase();sections.forEach(section=>{const belongs=section.dataset.settingsPage===activePage;section.classList.toggle('page-hidden',!belongs);const text=(section.dataset.settingsTitle+' '+section.textContent).toLowerCase();section.classList.toggle('filter-hidden',belongs&&!!query&&!text.includes(query));});populateSections();};
const activatePage=(pageId,scrollToTop=false)=>{const meta=settingsPages.find(page=>page.id===pageId)||settingsPages[0];activePage=meta.id;pageButtons.forEach(button=>{const selected=button.dataset.settingsPageTarget===activePage;button.classList.toggle('active',selected);button.setAttribute('aria-current',selected?'page':'false');});if(pageTitle)pageTitle.textContent=meta.label;if(pageDescription)pageDescription.textContent=meta.description;vscode.setState?.({...webviewState,activePage});webviewState=vscode.getState?.()||webviewState;applyFilter();if(scrollToTop)document.getElementById('settingsStickyHeader')?.scrollIntoView({block:'start'});};
const autocompleteProfiles={hybrid:{completion:true,project:true,standard:true,signature:true,description:'CPM adds project symbols, lightweight standard-library assistance and immediate parameter hints. Other C/C++ providers can also contribute completion entries.'},native:{completion:false,project:false,standard:false,signature:false,description:'CPM withdraws completion and Signature Help. The installed native C/C++ provider remains untouched.'},nativeSignature:{completion:false,project:false,standard:false,signature:true,description:'Completion stays native while CPM provides immediate function prototypes and parameter hints.'},standardAssist:{completion:true,project:false,standard:true,signature:true,description:'Project completion stays native; CPM adds missing-header standard-library assistance plus immediate Signature Help.'}};
const autocompleteEffectiveState=()=>{const profile=val('autocompleteProfile')||'hybrid';if(profile==='custom')return{completion:flag('autocompleteCompletionEnabled'),project:flag('autocompleteProjectSymbols'),standard:flag('autocompleteStandardLibrary'),signature:flag('autocompleteSignatureHelp'),description:'Custom profile: the switches below define exactly what CPM contributes.'};return autocompleteProfiles[profile]||autocompleteProfiles.hybrid;};
const updateAutocompleteControls=()=>{const profile=val('autocompleteProfile')||'hybrid';const custom=profile==='custom';const host=el('autocompleteCustomOptions');if(host){host.querySelectorAll('input').forEach(input=>input.disabled=!custom);host.style.opacity=custom?'1':'.62';}const state=autocompleteEffectiveState();const pills=[];pills.push('<span class="pill">CPM completion: '+(state.completion?'On':'Off')+'</span>');pills.push('<span class="pill">Project symbols: '+(state.completion&&state.project?'On':'Off')+'</span>');pills.push('<span class="pill">Standard library: '+(state.completion&&state.standard?'On':'Off')+'</span>');pills.push('<span class="pill">Signature Help: '+(state.signature?'On':'Off')+'</span>');if(el('autocompleteEffective'))el('autocompleteEffective').innerHTML=pills.join('');if(el('autocompleteProfileDescription'))el('autocompleteProfileDescription').textContent=state.description;};
const updateLinkageControls=()=>{const linkage=val('linkageMode')||'dynamic';disableField('runtimeDependencyMode',linkage!=='dynamic');const sdlRuntime=el('sdlRuntimeMode');if(sdlRuntime){if(linkage==='static'){sdlRuntime.dataset.previousValue=sdlRuntime.dataset.previousValue||sdlRuntime.value;sdlRuntime.value='static-link';sdlRuntime.disabled=true;}else{sdlRuntime.disabled=false;if(sdlRuntime.dataset.previousValue){sdlRuntime.value=sdlRuntime.dataset.previousValue;delete sdlRuntime.dataset.previousValue;}}}};
const updateTargetControls=()=>{const target=val('targetType');document.body.dataset.target=target;const exe=target==='Executable';const dll=target==='Dynamic Link Library';const stat=target==='Static Library';setDisplay('.target-exe-only',exe);setDisplay('.target-dll',dll);setDisplay('.target-static-only',stat);setDisplay('.target-linkable-only',exe||dll);setDisplay('.target-runable-only',exe||dll);setDisplay('.target-nonstatic-only',exe||dll);disableField('archiverPath',!stat);disableBrowse('archiverPath',!stat);disableField('debuggerPath',stat);disableBrowse('debuggerPath',stat);disableField('libraryPaths',stat);disableBrowse('libraryPaths',stat);disableField('libraries',stat);disableField('linkerFlags',stat);disableField('arguments',stat);disableField('workingDirectory',stat);disableBrowse('workingDirectory',stat);disableField('environmentOptions',stat);if(exe&&el('externalProcessPath'))el('externalProcessPath').value=val('outputPath');if(dll&&el('externalProcessPath'))el('externalProcessPath').value=dllProgramName;disableField('externalProcessPath',!dll);disableBrowse('externalProcessPath',!dll);disableField('iconFile',stat);disableBrowse('iconFile',stat);disableField('windowIconFile',stat);disableBrowse('windowIconFile',stat);disableField('applyWindowIconAutomatically',stat);updateLinkageControls();applyFilter();};
document.querySelectorAll('[data-browse-field]').forEach(button=>button.addEventListener('click',()=>vscode.postMessage({type:'browse',field:button.dataset.browseField})));pageButtons.forEach(button=>button.addEventListener('click',()=>{const page=button.dataset.settingsPageTarget;if(page)activatePage(page,true);}));document.querySelectorAll('[data-command]').forEach(button=>button.addEventListener('click',()=>vscode.postMessage({type:'command',command:button.dataset.command})));sectionNav?.addEventListener('change',()=>{const id=sectionNav.value;if(id)document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});sectionNav.value='';});settingsFilter?.addEventListener('input',applyFilter);document.querySelectorAll('input,select,textarea').forEach(node=>node.addEventListener('input',markDirty));
const updateBackendControls=()=>{const cmake=val('buildBackend')==='cmake';document.querySelectorAll('[data-direct-backend-only]').forEach(node=>node.classList.toggle('backend-disabled',cmake));};
el('linkageMode')?.addEventListener('change',()=>{updateLinkageControls();markDirty();});el('buildBackend')?.addEventListener('change',()=>{updateBackendControls();markDirty();});el('autocompleteProfile')?.addEventListener('change',()=>{updateAutocompleteControls();markDirty();});['autocompleteCompletionEnabled','autocompleteProjectSymbols','autocompleteStandardLibrary','autocompleteSignatureHelp'].forEach(id=>el(id)?.addEventListener('change',()=>{updateAutocompleteControls();markDirty();}));el('resetAutocompleteHybrid')?.addEventListener('click',()=>{if(el('autocompleteProfile'))el('autocompleteProfile').value='hybrid';updateAutocompleteControls();markDirty();});
el('configurationScope')?.addEventListener('change',()=>vscode.postMessage({type:'changeScope',scope:val('configurationScope')}));el('targetType')?.addEventListener('change',()=>{if(document.body.dataset.target==='Dynamic Link Library')dllProgramName=val('externalProcessPath');updateTargetControls();});el('outputPath')?.addEventListener('input',()=>{if(val('targetType')==='Executable'&&el('externalProcessPath'))el('externalProcessPath').value=val('outputPath');});el('externalProcessPath')?.addEventListener('input',()=>{if(val('targetType')==='Dynamic Link Library')dllProgramName=val('externalProcessPath');});el('architectureMode')?.addEventListener('change',()=>{const legacy=el('useBuildModeArchitectureFlags');if(legacy)legacy.checked=val('architectureMode')==='from-build-mode';});
window.addEventListener('message',(event)=>{const message=event.data;if(message?.type==='setField'&&el(message.field)){el(message.field).value=message.value||'';markDirty();}if(message?.type==='appendLines'&&el(message.field)){const node=el(message.field);const existing=node.value.trim();const values=[...(message.values||[])].map(String).map(x=>x.trim()).filter(Boolean);node.value=[existing,...values].filter(Boolean).join(String.fromCharCode(10));markDirty();}});
const collectBuildParameters=()=>({scope:val('configurationScope'),targetType:val('targetType'),autocomplete:{profile:val('autocompleteProfile'),completionEnabled:flag('autocompleteCompletionEnabled'),includeProjectCompletion:flag('autocompleteProjectSymbols'),includeStandardCompletion:flag('autocompleteStandardLibrary'),signatureHelpEnabled:flag('autocompleteSignatureHelp')},settings:{preBuildActions:lines('preBuildActions'),buildBackend:val('buildBackend')==='cmake'?'cmake':'direct',cmake:{executable:val('cmakeExecutable')||'cmake',generator:val('cmakeGenerator')||'Ninja',generatorPlatform:val('cmakeGeneratorPlatform'),generatorToolset:val('cmakeGeneratorToolset'),ninjaExecutable:val('cmakeNinjaExecutable')||'ninja',sourceDirectory:val('cmakeSourceDirectory')||'.',buildDirectory:val('cmakeBuildDirectory')||'.cpm/cmake/\${buildMode}',target:val('cmakeTarget'),configureBeforeBuild:flag('cmakeConfigureBeforeBuild'),exportCompileCommands:flag('cmakeExportCompileCommands'),inheritCpmCompilers:flag('cmakeInheritCpmCompilers'),useDependencyToolchain:flag('cmakeUseDependencyToolchain'),toolchainFile:val('cmakeToolchainFile'),cacheVariables:lines('cmakeCacheVariables'),configureArguments:lines('cmakeConfigureArguments'),buildArguments:lines('cmakeBuildArguments')},linkageMode:val('linkageMode')||'dynamic',parallelJobs:Math.max(0,Math.min(256,Number.parseInt(val('parallelJobs')||'0',10)||0)),useResponseFiles:flag('useResponseFiles'),precompiledHeadersEnabled:flag('precompiledHeadersEnabled'),cPrecompiledHeader:val('cPrecompiledHeader'),cppPrecompiledHeader:val('cppPrecompiledHeader'),unityBuildEnabled:flag('unityBuildEnabled'),unityBatchSize:Math.max(2,Math.min(128,Number.parseInt(val('unityBatchSize')||'8',10)||8)),customBuildActions:lines('customBuildActions'),postBuildActions:lines('postBuildActions'),dependencies:[...document.querySelectorAll('[data-dependency]:checked')].map(e=>e.dataset.dependency),externalDependencies:{enabled:flag('externalDependenciesEnabled'),autoInstallBeforeBuild:flag('externalDependenciesAutoInstall'),outputDirectory:val('externalDependenciesOutputDirectory'),additionalIncludeDirectories:lines('externalDependenciesIncludeDirectories'),additionalLibraryDirectories:lines('externalDependenciesLibraryDirectories'),additionalLibraries:lines('externalDependenciesLibraries'),additionalCompilerFlags:lines('externalDependenciesCompilerFlags'),additionalLinkerFlags:lines('externalDependenciesLinkerFlags'),vcpkg:{enabled:flag('externalDependenciesVcpkgEnabled'),executable:val('externalDependenciesVcpkgExecutable'),root:val('externalDependenciesVcpkgRoot'),manifestFile:val('externalDependenciesVcpkgManifestFile'),installRoot:val('externalDependenciesVcpkgInstallRoot'),triplet:val('externalDependenciesVcpkgTriplet'),hostTriplet:val('externalDependenciesVcpkgHostTriplet'),baseline:val('externalDependenciesVcpkgBaseline'),dependencies:lines('externalDependenciesVcpkgPackages'),overlayPorts:lines('externalDependenciesVcpkgOverlayPorts'),overlayTriplets:lines('externalDependenciesVcpkgOverlayTriplets'),additionalArguments:lines('externalDependenciesVcpkgArguments')},conan:{enabled:flag('externalDependenciesConanEnabled'),executable:val('externalDependenciesConanExecutable'),manifestFile:val('externalDependenciesConanManifestFile'),outputDirectory:val('externalDependenciesConanOutputDirectory'),requires:lines('externalDependenciesConanRequires'),toolRequires:lines('externalDependenciesConanToolRequires'),options:lines('externalDependenciesConanOptions'),profileHost:val('externalDependenciesConanProfileHost'),profileBuild:val('externalDependenciesConanProfileBuild'),buildMissing:flag('externalDependenciesConanBuildMissing'),lockfile:val('externalDependenciesConanLockfile'),additionalArguments:lines('externalDependenciesConanArguments')},pkgConfig:{enabled:flag('externalDependenciesPkgConfigEnabled'),executable:val('externalDependenciesPkgConfigExecutable'),packages:lines('externalDependenciesPkgConfigPackages'),searchPaths:lines('externalDependenciesPkgConfigSearchPaths'),staticLink:flag('externalDependenciesPkgConfigStatic'),additionalArguments:lines('externalDependenciesPkgConfigArguments')}},remoteLinux:{enabled:flag('remoteLinuxEnabled'),sshHost:val('remoteLinuxSshHost'),sshUser:val('remoteLinuxSshUser'),sshPort:Math.max(1,Math.min(65535,Number.parseInt(val('remoteLinuxSshPort')||'22',10)||22)),sshExecutable:val('remoteLinuxSshExecutable'),scpExecutable:val('remoteLinuxScpExecutable'),rsyncExecutable:val('remoteLinuxRsyncExecutable'),useRsync:flag('remoteLinuxUseRsync'),remoteProjectDirectory:val('remoteLinuxProjectDirectory'),remoteBuildDirectory:val('remoteLinuxBuildDirectory'),syncBeforeBuild:flag('remoteLinuxSyncBeforeBuild'),syncBeforeRun:flag('remoteLinuxSyncBeforeRun'),remoteBuildCommand:val('remoteLinuxBuildCommand'),remoteRunCommand:val('remoteLinuxRunCommand'),cCompiler:val('remoteLinuxCCompiler'),cppCompiler:val('remoteLinuxCppCompiler'),archiver:val('remoteLinuxArchiver'),additionalCompilerFlags:lines('remoteLinuxCompilerFlags'),additionalLinkerFlags:lines('remoteLinuxLinkerFlags'),additionalIncludeDirectories:lines('remoteLinuxIncludeDirectories'),additionalLibraryDirectories:lines('remoteLinuxLibraryDirectories'),additionalLibraries:lines('remoteLinuxLibraries'),pkgConfigPackages:lines('remoteLinuxPkgConfigPackages'),environment:lines('remoteLinuxEnvironment'),gdbServerPort:Math.max(1,Math.min(65535,Number.parseInt(val('remoteLinuxGdbServerPort')||'2345',10)||2345)),gdbServerExecutable:val('remoteLinuxGdbServerExecutable'),remoteDebuggerExecutable:val('remoteLinuxDebuggerExecutable'),startGdbServerAutomatically:flag('remoteLinuxStartGdbServer')},run:{arguments:val('arguments'),workingDirectory:val('workingDirectory'),environmentOptions:val('environmentOptions'),externalProcessPath:val('targetType')==='Dynamic Link Library'?val('externalProcessPath'):''}},compilerSettings:{cCompilerPath:val('cCompilerPath'),cppCompilerPath:val('cppCompilerPath'),archiverPath:val('archiverPath'),debuggerPath:val('debuggerPath'),outputDirectory:val('outputDirectory'),cStandard:val('cStandard'),cppStandard:val('cppStandard'),warningLevel:val('warningLevel'),optimizationLevel:val('optimizationLevel'),debugInformation:val('debugInformation'),architectureMode:val('architectureMode'),compilerFlags:lines('compilerFlags'),cCompilerFlags:lines('cCompilerFlags'),cppCompilerFlags:lines('cppCompilerFlags'),linkerFlags:lines('linkerFlags'),includePaths:lines('includePaths'),libraryPaths:lines('libraryPaths'),libraries:lines('libraries'),defineSymbols:lines('defineSymbols'),useBuildModeArchitectureFlags:flag('useBuildModeArchitectureFlags'),runtimeDependencyMode:val('runtimeDependencyMode'),cleanRuntimeDllsOnDeploy:flag('cleanRuntimeDllsOnDeploy'),sdlEnabled:val('sdlEnabled'),sdlVersion:val('sdlVersion'),sdlRootPath:val('sdlRootPath'),sdlPackages:lines('sdlPackages'),sdlRuntimeMode:val('sdlRuntimeMode'),sdlSubsystem:val('sdlSubsystem'),sdlCopyAllRuntimeDlls:flag('sdlCopyAllRuntimeDlls'),buildLogDetail:val('buildLogDetail'),runOutputMode:val('runOutputMode')},nativeTarget:{...nativeTargetDefaults,targetType:val('targetType'),outputPath:val('outputPath'),iconFile:val('iconFile'),windowIconFile:val('windowIconFile'),applyWindowIconAutomatically:flag('applyWindowIconAutomatically')}});
const saveNow=()=>{markSaved();vscode.postMessage({type:'save',...collectBuildParameters()});};const exportNow=()=>vscode.postMessage({type:'exportBuildParameters',...collectBuildParameters()});const importNow=()=>vscode.postMessage({type:'importBuildParameters',scope:val('configurationScope')});
el('save')?.addEventListener('click',saveNow);el('saveBottom')?.addEventListener('click',saveNow);el('saveAutocomplete')?.addEventListener('click',saveNow);el('exportBuildParameters')?.addEventListener('click',exportNow);el('exportBuildParametersBottom')?.addEventListener('click',exportNow);el('importBuildParameters')?.addEventListener('click',importNow);el('importBuildParametersBottom')?.addEventListener('click',importNow);
updateTargetControls();updateAutocompleteControls();updateBackendControls();activatePage(activePage,false);
</script></body></html>`;
  }
}

type SelectOption = readonly [value: string, label: string];

function normalizeAutocompleteProfile(value: unknown): CpmAutocompleteProfile { return value === 'native' || value === 'nativeSignature' || value === 'standardAssist' || value === 'custom' ? value : 'hybrid'; }
function autocompleteProfileLabel(profile: CpmAutocompleteProfile): string { return ({ hybrid: 'Hybrid', native: 'Native', nativeSignature: 'Native + CPM Signature Help', standardAssist: 'Standard Library Assist', custom: 'Custom' } as const)[profile]; }

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
function browseTitle(field: string): string { return ({ cCompilerPath: 'Select C compiler executable', cppCompilerPath: 'Select C++ compiler/linker executable', archiverPath: 'Select static library archiver executable', debuggerPath: 'Select debugger executable', outputDirectory: 'Select output directory', includePaths: 'Add include directory', libraryPaths: 'Add library directory', outputPath: 'Select output file', iconFile: 'Select executable icon file', windowIconFile: 'Select SDL window/application icon image', manifestPath: 'Select manifest file', customDirectoryToCopyDll: 'Select DLL copy directory', typeLibFpFile: 'Select function-panel file', singleHeaderNiTypeInfoFile: 'Select NI type-information header', workingDirectory: 'Select working directory', externalProcessPath: 'Select Program Name executable for DLL target', sdlRootPath: 'Select SDL SDK root directory', cPrecompiledHeader: 'Select C precompiled header', cppPrecompiledHeader: 'Select C++ precompiled header' } as Record<string, string>)[field] ?? 'Select file'; }
function outputFilters(targetType: string): Record<string, string[]> { if (targetType === 'Dynamic Link Library') { return { 'Dynamic-link libraries': ['dll'], 'All files': ['*'] }; } if (targetType === 'Static Library') { return { 'Static libraries': ['lib'], 'All files': ['*'] }; } return { Executables: ['exe'], 'All files': ['*'] }; }
function openFilters(field: string): Record<string, string[]> { switch (field) { case 'iconFile': return { 'Windows icons': ['ico'], 'All files': ['*'] }; case 'windowIconFile': return { Images: ['png', 'bmp', 'jpg', 'jpeg', 'webp', 'ico'], 'All files': ['*'] }; case 'manifestPath': return { Manifest: ['manifest', 'xml'], 'All files': ['*'] }; case 'typeLibFpFile': return { 'Function panel files': ['fp'], 'All files': ['*'] }; case 'singleHeaderNiTypeInfoFile': return { Headers: ['h', 'hpp'], 'All files': ['*'] }; case 'externalProcessPath': return { Executables: ['exe'], 'All files': ['*'] }; case 'cPrecompiledHeader': case 'cppPrecompiledHeader': return { Headers: ['h', 'hh', 'hpp', 'hxx'], 'All files': ['*'] }; case 'cCompilerPath': case 'cppCompilerPath': case 'archiverPath': case 'debuggerPath': return { Executables: ['exe', 'cmd', 'bat', 'sh'], 'All files': ['*'] }; default: return { 'All files': ['*'] }; } }

function portableModulePath(filePath: string, projectDirectory: string): string { const relative = path.relative(projectDirectory, filePath); if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) { return relative.replace(/\//g, '\\'); } return filePath; }

function safeScriptJson(value: unknown): string { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }


function linkageModeLabel(value: CpmLinkageMode): string {
  return value === 'static'
    ? 'Fully static when available'
    : value === 'static-runtime'
      ? 'Static compiler runtime'
      : 'Dynamic';
}
