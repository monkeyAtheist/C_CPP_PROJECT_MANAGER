import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const CONFIG_SECTION = 'cpm';

export type CpmSdlEnabledMode = 'off' | 'auto' | 'on';
export type CpmSdlRuntimeMode = 'copy-dlls' | 'path-only' | 'static-link';
export type CpmSdlSubsystem = 'console' | 'windows';
export type CpmSdlArchitecture = 'x86' | 'x64' | 'arm64';

export interface CpmSdlInstallation {
  root: string;
  label: string;
  includeDirectories: string[];
  libraryDirectory?: string;
  binaryDirectory?: string;
  packages: string[];
  architecture?: CpmSdlArchitecture;
  source: 'configured' | 'scan' | 'manual';
}

export interface CpmSdlConfiguration {
  enabled: CpmSdlEnabledMode;
  rootPath: string;
  packages: string[];
  runtimeMode: CpmSdlRuntimeMode;
  subsystem: CpmSdlSubsystem;
  copyAllRuntimeDlls: boolean;
}

export interface CpmSdlBuildPlan {
  rootPath: string;
  includeDirectories: string[];
  libraryDirectory?: string;
  binaryDirectory?: string;
  packages: string[];
  compileFlags: string[];
  linkArgs: string[];
  runtimeDlls: string[];
  architecture?: CpmSdlArchitecture;
  runtimeMode: CpmSdlRuntimeMode;
}

interface SdlPackageDefinition {
  id: string;
  label: string;
  header: string;
  lib: string;
  dll: string;
}

const SDL_PACKAGES: SdlPackageDefinition[] = [
  { id: 'SDL2', label: 'SDL2 core', header: 'SDL.h', lib: 'SDL2', dll: 'SDL2.dll' },
  { id: 'SDL2_image', label: 'SDL2_image', header: 'SDL_image.h', lib: 'SDL2_image', dll: 'SDL2_image.dll' },
  { id: 'SDL2_mixer', label: 'SDL2_mixer', header: 'SDL_mixer.h', lib: 'SDL2_mixer', dll: 'SDL2_mixer.dll' },
  { id: 'SDL2_ttf', label: 'SDL2_ttf', header: 'SDL_ttf.h', lib: 'SDL2_ttf', dll: 'SDL2_ttf.dll' },
  { id: 'SDL2_net', label: 'SDL2_net', header: 'SDL_net.h', lib: 'SDL2_net', dll: 'SDL2_net.dll' },
  { id: 'SDL2_gfx', label: 'SDL2_gfx', header: 'SDL2_gfxPrimitives.h', lib: 'SDL2_gfx', dll: 'SDL2_gfx.dll' }
];

export class CpmSdlService implements vscode.Disposable {
  constructor(private readonly output: vscode.OutputChannel) {}

  dispose(): void {}

  get configuration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
  }

  getConfiguration(): CpmSdlConfiguration {
    return getSdlConfigurationFromWorkspace();
  }

  describe(root: string, source: CpmSdlInstallation['source']): CpmSdlInstallation | undefined {
    return describeSdlRoot(root, source);
  }

  getKnownInstallations(): CpmSdlInstallation[] {
    const configuredRoots = this.configuration.get<string[]>('sdlInstallations', []);
    const activeRoot = this.configuration.get<string>('sdlRootPath', '').trim();
    const roots = unique([
      activeRoot,
      ...configuredRoots,
      ...environmentSdlRoots(),
      ...commonSdlRoots()
    ]);
    const result: CpmSdlInstallation[] = [];
    const seen = new Set<string>();
    for (const root of roots) {
      const installation = describeSdlRoot(root, configuredRoots.includes(root) || samePath(root, activeRoot) ? 'configured' : 'scan');
      if (!installation) {
        continue;
      }
      const key = installation.root.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(installation);
      }
    }
    return result;
  }

  async selectInstallation(): Promise<CpmSdlInstallation | undefined> {
    const current = this.getConfiguration();
    const installations = this.getKnownInstallations();
    const choices: Array<vscode.QuickPickItem & { installation?: CpmSdlInstallation; manual?: boolean; disable?: boolean }> = installations.map((installation) => ({
      label: `$(window) SDL ${installation.architecture ? installation.architecture.toUpperCase() : 'SDK'}`,
      description: installation.root,
      detail: `${installation.packages.join(', ')} · ${installation.source}${installation.libraryDirectory ? ` · lib: ${installation.libraryDirectory}` : ''}`,
      installation
    }));
    choices.push({
      label: '$(folder-opened) Add SDL SDK from folder...',
      description: 'Choose a root such as C:\\Program Files\\SDL64 containing include, lib and bin folders.',
      manual: true
    });
    choices.push({
      label: '$(circle-slash) Disable SDL integration',
      description: 'Keep SDL settings but do not inject SDL include/link/runtime options during builds.',
      disable: true
    });

    const selected = await vscode.window.showQuickPick(choices, {
      title: 'Select SDL SDK',
      placeHolder: 'Detected SDL2 / SDL2_* SDK roots are listed first.'
    });
    if (!selected) {
      return undefined;
    }
    if (selected.disable) {
      await this.configuration.update('sdlEnabled', 'off', vscode.ConfigurationTarget.Workspace);
      this.output.appendLine('[C/C++ SDL] SDL integration disabled for this workspace.');
      vscode.window.showInformationMessage('SDL integration disabled for this workspace.');
      return undefined;
    }

    let installation = selected.installation;
    if (selected.manual) {
      const folder = await vscode.window.showOpenDialog({
        title: 'Select the SDL SDK root directory',
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false
      });
      if (!folder?.[0]) {
        return undefined;
      }
      installation = describeSdlRoot(folder[0].fsPath, 'manual');
      if (!installation) {
        vscode.window.showErrorMessage('The selected folder does not look like an SDL2 SDK. Expected SDL.h under include/ or include/SDL2, and SDL2 libraries under lib/.');
        return undefined;
      }
    }
    if (!installation) {
      return undefined;
    }

    const packages = await this.selectPackages(installation, current.packages);
    if (!packages) {
      return undefined;
    }

    const runtime = await vscode.window.showQuickPick([
      { label: 'Copy DLLs beside executable', value: 'copy-dlls' as CpmSdlRuntimeMode, description: 'Recommended on Windows. Copies SDL*.dll and optional dependency DLLs after build.' },
      { label: 'Use PATH only', value: 'path-only' as CpmSdlRuntimeMode, description: 'Do not copy DLLs; prepend the SDL bin folder to PATH when running/debugging.' },
      { label: 'Static link', value: 'static-link' as CpmSdlRuntimeMode, description: 'Experimental. Uses libSDL2.a and SDL system libraries when available.' }
    ], { title: 'SDL runtime handling' });
    if (!runtime) {
      return undefined;
    }

    await this.persist(installation, packages, runtime.value);
    this.output.appendLine(`[C/C++ SDL] Selected SDL SDK: ${installation.root}`);
    this.output.appendLine(`[C/C++ SDL] Packages: ${packages.join(', ')}`);
    this.output.appendLine(`[C/C++ SDL] Runtime mode: ${runtime.value}`);
    vscode.window.showInformationMessage(`SDL SDK selected: ${path.basename(installation.root)} (${packages.join(', ')}).`);
    return installation;
  }

  async selectPackages(installation: CpmSdlInstallation, currentPackages?: string[]): Promise<string[] | undefined> {
    const available = new Set(installation.packages);
    const current = new Set(normalizeSdlPackages(currentPackages?.length ? currentPackages : ['SDL2']));
    const choices = SDL_PACKAGES
      .filter((definition) => available.has(definition.id))
      .map((definition) => ({
        label: definition.id,
        description: definition.label,
        picked: current.has(definition.id) || definition.id === 'SDL2'
      }));
    if (choices.length === 0) {
      vscode.window.showErrorMessage('No supported SDL package was found in the selected SDK.');
      return undefined;
    }
    const selected = await vscode.window.showQuickPick(choices, {
      title: 'SDL packages',
      placeHolder: 'Select SDL2 extension packages to link. SDL2 core is always kept.',
      canPickMany: true
    });
    if (!selected) {
      return undefined;
    }
    return normalizeSdlPackages(['SDL2', ...selected.map((item) => item.label)]);
  }

  async persist(installation: CpmSdlInstallation, packages: string[], runtimeMode: CpmSdlRuntimeMode = 'copy-dlls'): Promise<void> {
    await this.persistToTarget(installation, packages, runtimeMode, vscode.ConfigurationTarget.Global);
    await this.persistToTarget(installation, packages, runtimeMode, vscode.ConfigurationTarget.Workspace);
  }

  private async persistToTarget(installation: CpmSdlInstallation, packages: string[], runtimeMode: CpmSdlRuntimeMode, target: vscode.ConfigurationTarget): Promise<void> {
    await this.configuration.update('sdlEnabled', 'on', target);
    await this.configuration.update('sdlRootPath', installation.root, target);
    await this.configuration.update('sdlPackages', normalizeSdlPackages(packages), target);
    await this.configuration.update('sdlRuntimeMode', runtimeMode, target);
    const configured = this.configuration.get<string[]>('sdlInstallations', []);
    if (!configured.some((root) => samePath(root, installation.root))) {
      await this.configuration.update('sdlInstallations', [...configured, installation.root], target);
    }
  }
}

export function getSdlConfigurationFromWorkspace(): CpmSdlConfiguration {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    enabled: normalizeEnabled(config.get<string>('sdlEnabled', 'auto')),
    rootPath: config.get<string>('sdlRootPath', '').trim(),
    packages: normalizeSdlPackages(config.get<string[]>('sdlPackages', ['SDL2'])),
    runtimeMode: normalizeRuntimeMode(config.get<string>('sdlRuntimeMode', 'copy-dlls')),
    subsystem: normalizeSubsystem(config.get<string>('sdlSubsystem', 'windows')),
    copyAllRuntimeDlls: config.get<boolean>('sdlCopyAllRuntimeDlls', true)
  };
}

export function createSdlBuildPlan(config: CpmSdlConfiguration, projectDirectory: string, filePaths: string[], targetType: string): CpmSdlBuildPlan | undefined {
  if (config.enabled === 'off') {
    return undefined;
  }
  if (!config.rootPath.trim()) {
    return undefined;
  }
  if (config.enabled === 'auto' && !projectLooksLikeSdl(filePaths)) {
    return undefined;
  }

  const installation = describeSdlRoot(config.rootPath, 'configured');
  if (!installation) {
    return undefined;
  }

  const packages = normalizeSdlPackages(config.packages.filter((id) => installation.packages.includes(id)));
  const compileFlags = [
    ...(process.platform === 'win32' ? ['-Dmain=SDL_main'] : []),
    ...buildSdlPackageDefines(packages)
  ];
  const linkArgs = targetType === 'Static Library'
    ? []
    : buildSdlLinkArgs(installation, packages, config.runtimeMode, config.subsystem);
  const runtimeDlls = config.runtimeMode === 'copy-dlls'
    ? getSdlRuntimeDlls(installation, packages, config.copyAllRuntimeDlls)
    : [];

  return {
    rootPath: installation.root,
    includeDirectories: installation.includeDirectories,
    libraryDirectory: installation.libraryDirectory,
    binaryDirectory: installation.binaryDirectory,
    packages,
    compileFlags,
    linkArgs,
    runtimeDlls,
    architecture: installation.architecture,
    runtimeMode: config.runtimeMode
  };
}

export function describeSdlRoot(root: string, source: CpmSdlInstallation['source']): CpmSdlInstallation | undefined {
  const normalizedRoot = normalizeExistingDirectory(root);
  if (!normalizedRoot) {
    return undefined;
  }
  const includeDirectories = findSdlIncludeDirectories(normalizedRoot);
  const libraryDirectory = findSdlLibraryDirectory(normalizedRoot);
  const binaryDirectory = findSdlBinaryDirectory(normalizedRoot);
  const packages = detectSdlPackages(normalizedRoot, includeDirectories, libraryDirectory, binaryDirectory);
  if (!includeDirectories.length || !packages.includes('SDL2')) {
    return undefined;
  }
  const architecture = detectSdlArchitecture(normalizedRoot, binaryDirectory, libraryDirectory);
  return {
    root: normalizedRoot,
    label: `${path.basename(normalizedRoot) || normalizedRoot}${architecture ? ` ${architecture}` : ''}`,
    includeDirectories,
    libraryDirectory,
    binaryDirectory,
    packages,
    architecture,
    source
  };
}

export function findSdlIncludeDirectories(root: string): string[] {
  const candidates = [
    path.join(root, 'include'),
    path.join(root, 'include', 'SDL2'),
    path.join(root, 'x86_64-w64-mingw32', 'include'),
    path.join(root, 'x86_64-w64-mingw32', 'include', 'SDL2'),
    path.join(root, 'i686-w64-mingw32', 'include'),
    path.join(root, 'i686-w64-mingw32', 'include', 'SDL2')
  ];
  return unique(candidates.filter((candidate) => directoryContainsAny(candidate, ['SDL.h', path.join('SDL2', 'SDL.h')])));
}

export function normalizeSdlPackages(packages: string[]): string[] {
  const valid = new Set(SDL_PACKAGES.map((definition) => definition.id));
  const result = unique(['SDL2', ...packages].map((entry) => entry.trim()).filter((entry) => valid.has(entry)));
  return result.includes('SDL2') ? result : ['SDL2', ...result];
}

export function getSdlPackageDefinitions(): ReadonlyArray<SdlPackageDefinition> {
  return SDL_PACKAGES;
}


function buildSdlPackageDefines(packages: string[]): string[] {
  const result: string[] = [];
  const mapping: Record<string, string[]> = {
    SDL2_image: ['CPM_USE_SDL2_IMAGE', 'CPM_USE_SDL_IMAGE'],
    SDL2_mixer: ['CPM_USE_SDL2_MIXER', 'CPM_USE_SDL_MIXER'],
    SDL2_ttf: ['CPM_USE_SDL2_TTF', 'CPM_USE_SDL_TTF'],
    SDL2_net: ['CPM_USE_SDL2_NET', 'CPM_USE_SDL_NET'],
    SDL2_gfx: ['CPM_USE_SDL2_GFX', 'CPM_USE_SDL_GFX']
  };
  for (const packageId of packages) {
    if (packageId === 'SDL2') {
      continue;
    }
    const symbols = mapping[packageId] ?? [`CPM_USE_${packageId.toUpperCase()}`];
    for (const symbol of symbols) {
      result.push(`-D${symbol}`);
    }
  }
  return unique(result);
}

function buildSdlLinkArgs(installation: CpmSdlInstallation, packages: string[], runtimeMode: CpmSdlRuntimeMode, subsystem: CpmSdlSubsystem): string[] {
  const args: string[] = [];
  if (installation.libraryDirectory) {
    args.push('-L', installation.libraryDirectory);
  }

  if (process.platform === 'win32') {
    args.push('-lmingw32', '-lSDL2main');
  }

  const extensionLibs = packages
    .filter((id) => id !== 'SDL2')
    .map((id) => SDL_PACKAGES.find((definition) => definition.id === id)?.lib)
    .filter((value): value is string => !!value);
  for (const lib of extensionLibs) {
    args.push(`-l${lib}`);
  }

  if (runtimeMode === 'static-link' && installation.libraryDirectory) {
    const staticLib = path.join(installation.libraryDirectory, 'libSDL2.a');
    args.push(fs.existsSync(staticLib) ? staticLib : '-lSDL2');
    if (process.platform === 'win32') {
      args.push('-lm', '-ldinput8', '-ldxguid', '-ldxerr8', '-luser32', '-lgdi32', '-lwinmm', '-limm32', '-lole32', '-loleaut32', '-lshell32', '-lsetupapi', '-lversion', '-luuid');
    }
  } else {
    args.push('-lSDL2');
  }

  if (process.platform === 'win32') {
    args.push(subsystem === 'windows' ? '-mwindows' : '-mconsole');
  }
  return args;
}

function getSdlRuntimeDlls(installation: CpmSdlInstallation, packages: string[], copyAll: boolean): string[] {
  const bin = installation.binaryDirectory;
  if (!bin || !fs.existsSync(bin)) {
    return [];
  }
  if (copyAll) {
    return fs.readdirSync(bin)
      .filter((name) => /\.dll$/i.test(name))
      .map((name) => path.join(bin, name));
  }
  const selected = new Set(packages);
  return SDL_PACKAGES
    .filter((definition) => selected.has(definition.id))
    .map((definition) => path.join(bin, definition.dll))
    .filter((candidate) => fs.existsSync(candidate));
}

function detectSdlPackages(root: string, includeDirectories: string[], libraryDirectory?: string, binaryDirectory?: string): string[] {
  const result: string[] = [];
  for (const definition of SDL_PACKAGES) {
    const hasHeader = includeDirectories.some((directory) => fs.existsSync(path.join(directory, definition.header)) || fs.existsSync(path.join(directory, 'SDL2', definition.header)));
    const hasLibrary = !!libraryDirectory && [
      `lib${definition.lib}.a`,
      `lib${definition.lib}.dll.a`,
      `${definition.lib}.lib`,
      `${definition.lib}.dll.a`
    ].some((name) => fs.existsSync(path.join(libraryDirectory, name)));
    const hasDll = !!binaryDirectory && fs.existsSync(path.join(binaryDirectory, definition.dll));
    if (hasHeader || hasLibrary || hasDll || (definition.id === 'SDL2' && fs.existsSync(path.join(root, 'bin', 'SDL2.dll')))) {
      result.push(definition.id);
    }
  }
  return normalizeSdlPackages(result).filter((id) => result.includes(id) || id === 'SDL2');
}

function findSdlLibraryDirectory(root: string): string | undefined {
  const candidates = [
    path.join(root, 'lib'),
    path.join(root, 'lib', 'x64'),
    path.join(root, 'lib', 'x86'),
    path.join(root, 'x86_64-w64-mingw32', 'lib'),
    path.join(root, 'i686-w64-mingw32', 'lib')
  ];
  return candidates.find((candidate) => directoryContainsAny(candidate, ['libSDL2.a', 'libSDL2.dll.a', 'SDL2.lib']));
}

function findSdlBinaryDirectory(root: string): string | undefined {
  const candidates = [
    path.join(root, 'bin'),
    path.join(root, 'lib'),
    path.join(root, 'x86_64-w64-mingw32', 'bin'),
    path.join(root, 'i686-w64-mingw32', 'bin')
  ];
  return candidates.find((candidate) => directoryContainsAny(candidate, ['SDL2.dll']));
}

function directoryContainsAny(directory: string, names: string[]): boolean {
  return fs.existsSync(directory) && names.some((name) => fs.existsSync(path.join(directory, name)));
}

function detectSdlArchitecture(root: string, binaryDirectory?: string, libraryDirectory?: string): CpmSdlArchitecture | undefined {
  const candidates = [
    binaryDirectory ? path.join(binaryDirectory, 'SDL2.dll') : '',
    libraryDirectory ? path.join(libraryDirectory, 'libSDL2.dll.a') : '',
    libraryDirectory ? path.join(libraryDirectory, 'libSDL2.a') : '',
    root
  ].filter(Boolean);
  for (const candidate of candidates) {
    const arch = inspectPeArchitecture(candidate);
    if (arch) {
      return arch;
    }
  }
  const text = root.toLowerCase();
  if (/(x64|64|mingw64|ucrt64|x86_64)/.test(text)) return 'x64';
  if (/(x86|32|mingw32|i686)/.test(text)) return 'x86';
  return undefined;
}

function inspectPeArchitecture(filePath: string): CpmSdlArchitecture | undefined {
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return undefined;
    }
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 0x40 || buffer.toString('ascii', 0, 2) !== 'MZ') {
      return undefined;
    }
    const peOffset = buffer.readUInt32LE(0x3c);
    if (peOffset + 6 > buffer.length || buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
      return undefined;
    }
    const machine = buffer.readUInt16LE(peOffset + 4);
    if (machine === 0x8664) return 'x64';
    if (machine === 0x014c) return 'x86';
    if (machine === 0xaa64) return 'arm64';
  } catch {
    return undefined;
  }
  return undefined;
}

function projectLooksLikeSdl(filePaths: string[]): boolean {
  const candidates = filePaths.filter((filePath) => /\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx)$/i.test(filePath)).slice(0, 80);
  for (const filePath of candidates) {
    try {
      const data = fs.readFileSync(filePath, 'utf8').slice(0, 65536);
      if (/SDL\.h|SDL2\/SDL\.h|SDL_Init|SDL_CreateWindow|SDL_Renderer|SDL_Window|IMG_Load|TTF_Init|Mix_OpenAudio/i.test(data)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function environmentSdlRoots(): string[] {
  return ['SDL2_DIR', 'SDL_DIR', 'SDL_HOME', 'SDL2_HOME', 'SDL_ROOT']
    .map((name) => process.env[name])
    .filter((value): value is string => !!value?.trim());
}

function commonSdlRoots(): string[] {
  if (process.platform !== 'win32') {
    return ['/usr', '/usr/local', '/opt/homebrew', '/opt/local'];
  }
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  return [
    path.join(programFiles, 'SDL64'),
    path.join(programFiles, 'SDL32'),
    path.join(programFiles, 'SDL2'),
    path.join(programFilesX86, 'SDL32'),
    path.join(programFilesX86, 'SDL2'),
    'C:\\SDL64',
    'C:\\SDL32',
    'C:\\SDL2',
    'C:\\msys64\\mingw64',
    'C:\\msys64\\mingw32',
    'C:\\msys64\\ucrt64'
  ];
}

function normalizeExistingDirectory(value: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = path.normalize(trimmed);
  if (fs.existsSync(normalized) && fs.statSync(normalized).isDirectory()) {
    return normalized;
  }
  return undefined;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value?.trim()) {
      continue;
    }
    const normalized = path.normalize(value.trim());
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result;
}

function samePath(a: string, b: string): boolean {
  return path.normalize(a || '').toLowerCase() === path.normalize(b || '').toLowerCase();
}

function normalizeEnabled(value: string | undefined): CpmSdlEnabledMode {
  return value === 'on' || value === 'off' || value === 'auto' ? value : 'auto';
}

function normalizeRuntimeMode(value: string | undefined): CpmSdlRuntimeMode {
  return value === 'copy-dlls' || value === 'path-only' || value === 'static-link' ? value : 'copy-dlls';
}

function normalizeSubsystem(value: string | undefined): CpmSdlSubsystem {
  return value === 'console' || value === 'windows' ? value : 'windows';
}
