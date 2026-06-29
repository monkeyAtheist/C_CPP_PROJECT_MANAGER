import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const CONFIG_SECTION = 'cpm';

export type CpmSdlEnabledMode = 'off' | 'auto' | 'on';
export type CpmSdlRuntimeMode = 'copy-dlls' | 'path-only' | 'static-link';
export type CpmSdlSubsystem = 'console' | 'windows';
export type CpmSdlArchitecture = 'x86' | 'x64' | 'arm64';
export type CpmSdlVersion = 'auto' | 'SDL2' | 'SDL3';
export type CpmSdlResolvedVersion = 'SDL2' | 'SDL3';

export interface CpmSdlInstallation {
  root: string;
  label: string;
  includeDirectories: string[];
  libraryDirectory?: string;
  binaryDirectory?: string;
  packages: string[];
  versions: CpmSdlResolvedVersion[];
  architecture?: CpmSdlArchitecture;
  source: 'configured' | 'scan' | 'manual';
}

export interface CpmSdlConfiguration {
  enabled: CpmSdlEnabledMode;
  version: CpmSdlVersion;
  rootPath: string;
  packages: string[];
  runtimeMode: CpmSdlRuntimeMode;
  subsystem: CpmSdlSubsystem;
  copyAllRuntimeDlls: boolean;
}

export interface CpmSdlBuildPlan {
  version: CpmSdlResolvedVersion;
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
  version: CpmSdlResolvedVersion;
  label: string;
  headerNames: string[];
  lib: string;
  dll: string;
  core?: boolean;
}

const SDL_PACKAGES: SdlPackageDefinition[] = [
  { id: 'SDL2', version: 'SDL2', label: 'SDL2 core', headerNames: [path.join('SDL2', 'SDL.h')], lib: 'SDL2', dll: 'SDL2.dll', core: true },
  { id: 'SDL2_image', version: 'SDL2', label: 'SDL2_image', headerNames: [path.join('SDL2', 'SDL_image.h')], lib: 'SDL2_image', dll: 'SDL2_image.dll' },
  { id: 'SDL2_mixer', version: 'SDL2', label: 'SDL2_mixer', headerNames: [path.join('SDL2', 'SDL_mixer.h')], lib: 'SDL2_mixer', dll: 'SDL2_mixer.dll' },
  { id: 'SDL2_ttf', version: 'SDL2', label: 'SDL2_ttf', headerNames: [path.join('SDL2', 'SDL_ttf.h')], lib: 'SDL2_ttf', dll: 'SDL2_ttf.dll' },
  { id: 'SDL2_net', version: 'SDL2', label: 'SDL2_net', headerNames: [path.join('SDL2', 'SDL_net.h')], lib: 'SDL2_net', dll: 'SDL2_net.dll' },
  { id: 'SDL2_gfx', version: 'SDL2', label: 'SDL2_gfx', headerNames: [path.join('SDL2', 'SDL2_gfxPrimitives.h')], lib: 'SDL2_gfx', dll: 'SDL2_gfx.dll' },
  { id: 'SDL3', version: 'SDL3', label: 'SDL3 core', headerNames: [path.join('SDL3', 'SDL.h')], lib: 'SDL3', dll: 'SDL3.dll', core: true },
  { id: 'SDL3_image', version: 'SDL3', label: 'SDL3_image', headerNames: [path.join('SDL3_image', 'SDL_image.h')], lib: 'SDL3_image', dll: 'SDL3_image.dll' },
  { id: 'SDL3_mixer', version: 'SDL3', label: 'SDL3_mixer', headerNames: [path.join('SDL3_mixer', 'SDL_mixer.h')], lib: 'SDL3_mixer', dll: 'SDL3_mixer.dll' },
  { id: 'SDL3_ttf', version: 'SDL3', label: 'SDL3_ttf', headerNames: [path.join('SDL3_ttf', 'SDL_ttf.h')], lib: 'SDL3_ttf', dll: 'SDL3_ttf.dll' },
  { id: 'SDL3_net', version: 'SDL3', label: 'SDL3_net', headerNames: [path.join('SDL3_net', 'SDL_net.h')], lib: 'SDL3_net', dll: 'SDL3_net.dll' }
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
      label: `$(window) ${installation.versions.join('/')} ${installation.architecture ? installation.architecture.toUpperCase() : 'SDK'}`,
      description: installation.root,
      detail: `${installation.packages.join(', ')} · ${installation.source}${installation.libraryDirectory ? ` · lib: ${installation.libraryDirectory}` : ''}`,
      installation
    }));
    choices.push({
      label: '$(folder-opened) Add SDL SDK from folder...',
      description: 'Choose a root such as C:\\Program Files\\SDL64, C:\\Program Files\\SDL3 or an MSYS2 prefix.',
      manual: true
    });
    choices.push({
      label: '$(circle-slash) Disable SDL integration',
      description: 'Keep SDL settings but do not inject SDL include/link/runtime options during builds.',
      disable: true
    });

    const selected = await vscode.window.showQuickPick(choices, {
      title: 'Select SDL SDK',
      placeHolder: 'Detected SDL2 / SDL3 SDK roots are listed first.'
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
        vscode.window.showErrorMessage('The selected folder does not look like an SDL2/SDL3 SDK. Expected SDL.h under include/SDL2 or include/SDL3, plus SDL libraries under lib/.');
        return undefined;
      }
    }
    if (!installation) {
      return undefined;
    }

    const version = await this.selectVersion(installation, current.version, current.packages);
    if (!version) {
      return undefined;
    }

    const packages = await this.selectPackages(installation, version, current.packages);
    if (!packages) {
      return undefined;
    }

    const runtime = await vscode.window.showQuickPick([
      { label: 'Copy DLLs beside executable', value: 'copy-dlls' as CpmSdlRuntimeMode, description: 'Recommended on Windows. Copies SDL*.dll and optional dependency DLLs after build.' },
      { label: 'Use PATH only', value: 'path-only' as CpmSdlRuntimeMode, description: 'Do not copy DLLs; prepend the SDL bin folder to PATH when running/debugging.' },
      { label: 'Static link', value: 'static-link' as CpmSdlRuntimeMode, description: `Experimental. Uses static ${version} libraries when available.` }
    ], { title: 'SDL runtime handling' });
    if (!runtime) {
      return undefined;
    }

    await this.persist(installation, version, packages, runtime.value);
    this.output.appendLine(`[C/C++ SDL] Selected SDL SDK: ${installation.root}`);
    this.output.appendLine(`[C/C++ SDL] Version: ${version}`);
    this.output.appendLine(`[C/C++ SDL] Packages: ${packages.join(', ')}`);
    this.output.appendLine(`[C/C++ SDL] Runtime mode: ${runtime.value}`);
    vscode.window.showInformationMessage(`${version} SDK selected: ${path.basename(installation.root)} (${packages.join(', ')}).`);
    return installation;
  }

  async selectVersion(installation: CpmSdlInstallation, preferredVersion: CpmSdlVersion = 'auto', currentPackages?: string[]): Promise<CpmSdlResolvedVersion | undefined> {
    if (installation.versions.length === 0) {
      vscode.window.showErrorMessage('No supported SDL2 or SDL3 core package was found in the selected SDK.');
      return undefined;
    }
    if (installation.versions.length === 1) {
      return installation.versions[0];
    }
    const inferred = resolveRequestedVersion(preferredVersion, currentPackages ?? [], installation.versions);
    const selected = await vscode.window.showQuickPick(installation.versions.map((version) => ({
      label: version,
      description: version === 'SDL3' ? 'Current SDL major version; uses SDL3 headers and -lSDL3.' : 'Legacy SDL2 workflow; uses SDL2 headers and -lSDL2/-lSDL2main.',
      picked: version === inferred,
      value: version
    })), {
      title: 'SDL major version',
      placeHolder: 'The selected SDK contains both SDL2 and SDL3 artifacts.'
    });
    return selected?.value;
  }

  async selectPackages(installation: CpmSdlInstallation, version: CpmSdlResolvedVersion, currentPackages?: string[]): Promise<string[] | undefined> {
    const available = new Set(installation.packages);
    const current = new Set(normalizeSdlPackages(currentPackages?.length ? currentPackages : [version], version));
    const choices = SDL_PACKAGES
      .filter((definition) => definition.version === version && available.has(definition.id))
      .map((definition) => ({
        label: definition.id,
        description: definition.label,
        picked: current.has(definition.id) || !!definition.core
      }));
    if (choices.length === 0) {
      vscode.window.showErrorMessage(`No supported ${version} package was found in the selected SDK.`);
      return undefined;
    }
    const selected = await vscode.window.showQuickPick(choices, {
      title: `${version} packages`,
      placeHolder: `Select ${version} extension packages to link. ${version} core is always kept.`,
      canPickMany: true
    });
    if (!selected) {
      return undefined;
    }
    return normalizeSdlPackages([version, ...selected.map((item) => item.label)], version);
  }

  async persist(installation: CpmSdlInstallation, version: CpmSdlResolvedVersion, packages: string[], runtimeMode: CpmSdlRuntimeMode = 'copy-dlls'): Promise<void> {
    await this.persistToTarget(installation, version, packages, runtimeMode, vscode.ConfigurationTarget.Global);
    await this.persistToTarget(installation, version, packages, runtimeMode, vscode.ConfigurationTarget.Workspace);
  }

  private async persistToTarget(installation: CpmSdlInstallation, version: CpmSdlResolvedVersion, packages: string[], runtimeMode: CpmSdlRuntimeMode, target: vscode.ConfigurationTarget): Promise<void> {
    await this.configuration.update('sdlEnabled', 'on', target);
    await this.configuration.update('sdlVersion', version, target);
    await this.configuration.update('sdlRootPath', installation.root, target);
    await this.configuration.update('sdlPackages', normalizeSdlPackages(packages, version), target);
    await this.configuration.update('sdlRuntimeMode', runtimeMode, target);
    const configured = this.configuration.get<string[]>('sdlInstallations', []);
    if (!configured.some((root) => samePath(root, installation.root))) {
      await this.configuration.update('sdlInstallations', [...configured, installation.root], target);
    }
  }
}

export function getSdlConfigurationFromWorkspace(): CpmSdlConfiguration {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const version = normalizeSdlVersion(config.get<string>('sdlVersion', 'auto'));
  return {
    enabled: normalizeEnabled(config.get<string>('sdlEnabled', 'auto')),
    version,
    rootPath: config.get<string>('sdlRootPath', '').trim(),
    packages: normalizeSdlPackages(config.get<string[]>('sdlPackages', ['SDL2']), version),
    runtimeMode: normalizeRuntimeMode(config.get<string>('sdlRuntimeMode', 'copy-dlls')),
    subsystem: normalizeSubsystem(config.get<string>('sdlSubsystem', 'windows')),
    copyAllRuntimeDlls: config.get<boolean>('sdlCopyAllRuntimeDlls', true)
  };
}

export function createSdlBuildPlan(config: CpmSdlConfiguration, projectDirectory: string, filePaths: string[], targetType: string, preferredArchitecture?: CpmSdlArchitecture): CpmSdlBuildPlan | undefined {
  if (config.enabled === 'off') {
    return undefined;
  }
  const looksLikeSdl = projectLooksLikeSdl(filePaths);
  if (config.enabled === 'auto' && !looksLikeSdl) {
    return undefined;
  }

  const installation = resolveSdlInstallationForBuild(config, filePaths, preferredArchitecture);
  if (!installation) {
    return undefined;
  }

  const version = resolveRequestedVersion(config.version, config.packages, installation.versions, filePaths);
  if (!installation.versions.includes(version)) {
    return undefined;
  }

  const configuredPackages = normalizeSdlPackages(config.packages, version);
  const inferredPackages = inferSdlPackagesFromSources(filePaths, version);
  const packages = normalizeSdlPackages([
    ...configuredPackages,
    ...inferredPackages
  ], version).filter((id) => installation.packages.includes(id));
  if (!packages.includes(version)) {
    return undefined;
  }

  const compileFlags = [
    ...(version === 'SDL2' && process.platform === 'win32' ? ['-Dmain=SDL_main'] : []),
    `-DCPM_USE_${version}`,
    ...buildSdlPackageDefines(packages, version)
  ];
  const linkArgs = targetType === 'Static Library'
    ? []
    : buildSdlLinkArgs(installation, packages, version, config.runtimeMode, config.subsystem);
  const runtimeDlls = config.runtimeMode === 'copy-dlls'
    ? getSdlRuntimeDlls(installation, packages, config.copyAllRuntimeDlls)
    : [];

  return {
    version,
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

function resolveSdlInstallationForBuild(config: CpmSdlConfiguration, filePaths: string[], preferredArchitecture?: CpmSdlArchitecture): CpmSdlInstallation | undefined {
  const configuredRoot = config.rootPath.trim();
  const roots = configuredRoot
    ? [configuredRoot]
    : unique([...environmentSdlRoots(), ...commonSdlRoots()]);

  for (const root of roots) {
    const installation = describeSdlRoot(root, configuredRoot ? 'configured' : 'scan', preferredArchitecture);
    if (!installation) {
      continue;
    }
    const version = resolveRequestedVersion(config.version, config.packages, installation.versions, filePaths);
    if (installation.versions.includes(version)) {
      return installation;
    }
  }

  if (preferredArchitecture && configuredRoot) {
    return describeSdlRoot(configuredRoot, 'configured');
  }
  return undefined;
}

export function describeSdlRoot(root: string, source: CpmSdlInstallation['source'], preferredArchitecture?: CpmSdlArchitecture): CpmSdlInstallation | undefined {
  const normalizedRoot = normalizeExistingDirectory(root);
  if (!normalizedRoot) {
    return undefined;
  }

  for (const candidateRoot of deriveSdlRootCandidates(normalizedRoot)) {
    const includeDirectories = findSdlIncludeDirectories(candidateRoot, preferredArchitecture);
    const libraryDirectory = findSdlLibraryDirectory(candidateRoot, preferredArchitecture);
    const binaryDirectory = findSdlBinaryDirectory(candidateRoot, preferredArchitecture);
    const packages = detectSdlPackages(candidateRoot, includeDirectories, libraryDirectory, binaryDirectory);
    const versions = detectSdlVersions(packages);
    if (!includeDirectories.length || versions.length === 0) {
      continue;
    }
    const architecture = detectSdlArchitecture(candidateRoot, binaryDirectory, libraryDirectory, versions);
    return {
      root: candidateRoot,
      label: `${path.basename(candidateRoot) || candidateRoot}${versions.length ? ` ${versions.join('/')}` : ''}${architecture ? ` ${architecture}` : ''}`,
      includeDirectories,
      libraryDirectory,
      binaryDirectory,
      packages,
      versions,
      architecture,
      source
    };
  }

  return undefined;
}

export function findSdlIncludeDirectories(root: string, preferredArchitecture?: CpmSdlArchitecture): string[] {
  const preferredTriplets = preferredArchitecture ? tripletsForArchitecture(preferredArchitecture) : [];
  const baseCandidates = unique([
    ...preferredTriplets.map((triplet) => path.join(root, triplet)),
    root,
    ...orderedSdlTriplets(preferredArchitecture).map((triplet) => path.join(root, triplet))
  ]);

  for (const base of baseCandidates) {
    const group = sdlIncludeCandidateGroup(base).filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
    if (groupHasSdlCoreHeader(group)) {
      return unique(group);
    }
  }

  return [];
}

function sdlIncludeCandidateGroup(base: string): string[] {
  return [
    path.join(base, 'include'),
    path.join(base, 'include', 'SDL2'),
    path.join(base, 'include', 'SDL3'),
    path.join(base, 'include', 'SDL3_image'),
    path.join(base, 'include', 'SDL3_mixer'),
    path.join(base, 'include', 'SDL3_ttf'),
    path.join(base, 'include', 'SDL3_net')
  ];
}

function groupHasSdlCoreHeader(group: string[]): boolean {
  return group.some((candidate) => directoryContainsAny(candidate, ['SDL.h', path.join('SDL2', 'SDL.h'), path.join('SDL3', 'SDL.h')]));
}

export function normalizeSdlPackages(packages: string[], version: CpmSdlVersion = 'auto'): string[] {
  const normalizedEntries = packages.flatMap((entry) => splitSdlPackageEntry(entry))
    .map((entry) => normalizeSdlPackageId(entry, version))
    .filter((entry): entry is string => !!entry);
  const selected = unique(normalizedEntries);
  const resolved = resolvePackageVersion(version, selected);
  const core = corePackageId(resolved);
  const result = [core, ...selected.filter((id) => packageVersion(id) === resolved && id !== core)];
  return unique(result);
}

export function getSdlPackageDefinitions(): ReadonlyArray<SdlPackageDefinition> {
  return SDL_PACKAGES;
}

function splitSdlPackageEntry(entry: string): string[] {
  return entry
    .split(/[;,|\s]+/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeSdlPackageId(entry: string, version: CpmSdlVersion): string | undefined {
  const exact = SDL_PACKAGES.find((definition) => definition.id === entry);
  if (exact) {
    return exact.id;
  }

  const key = entry.trim().toLowerCase().replace(/[-\s]+/g, '_');
  const aliasMap: Record<string, string> = {
    sdl2: 'SDL2',
    sdl_2: 'SDL2',
    sdl3: 'SDL3',
    sdl_3: 'SDL3',
    sdl2_image: 'SDL2_image',
    sdl_image: resolveVersionedSdlPackage('image', version),
    image: resolveVersionedSdlPackage('image', version),
    img: resolveVersionedSdlPackage('image', version),
    sdl2_mixer: 'SDL2_mixer',
    sdl_mixer: resolveVersionedSdlPackage('mixer', version),
    mixer: resolveVersionedSdlPackage('mixer', version),
    mix: resolveVersionedSdlPackage('mixer', version),
    sdl2_ttf: 'SDL2_ttf',
    sdl_ttf: resolveVersionedSdlPackage('ttf', version),
    ttf: resolveVersionedSdlPackage('ttf', version),
    font: resolveVersionedSdlPackage('ttf', version),
    fonts: resolveVersionedSdlPackage('ttf', version),
    sdl2_net: 'SDL2_net',
    sdl_net: resolveVersionedSdlPackage('net', version),
    net: resolveVersionedSdlPackage('net', version),
    network: resolveVersionedSdlPackage('net', version),
    sdl2_gfx: 'SDL2_gfx',
    sdl_gfx: version === 'SDL3' ? '' : 'SDL2_gfx',
    gfx: version === 'SDL3' ? '' : 'SDL2_gfx',
    sdl3_image: 'SDL3_image',
    sdl3_mixer: 'SDL3_mixer',
    sdl3_ttf: 'SDL3_ttf',
    sdl3_net: 'SDL3_net'
  };
  const resolved = aliasMap[key];
  return resolved && SDL_PACKAGES.some((definition) => definition.id === resolved) ? resolved : undefined;
}

function resolveVersionedSdlPackage(kind: 'image' | 'mixer' | 'ttf' | 'net', version: CpmSdlVersion): string {
  const resolvedVersion = version === 'SDL3' ? 'SDL3' : 'SDL2';
  return `${resolvedVersion}_${kind}`;
}

function inferSdlPackagesFromSources(filePaths: string[], version: CpmSdlResolvedVersion): string[] {
  const inferred = new Set<string>([version]);
  const candidates = filePaths.filter((filePath) => /\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx)$/i.test(filePath)).slice(0, 120);
  for (const filePath of candidates) {
    let data = '';
    try {
      data = fs.readFileSync(filePath, 'utf8').slice(0, 131072);
    } catch {
      continue;
    }
    if (/SDL_image\.h|IMG_\w+/i.test(data)) inferred.add(`${version}_image`);
    if (/SDL_mixer\.h|Mix_\w+/i.test(data)) inferred.add(`${version}_mixer`);
    if (/SDL_ttf\.h|TTF_\w+/i.test(data)) inferred.add(`${version}_ttf`);
    if (/SDL_net\.h|\bSDLNet_\w+/i.test(data)) inferred.add(`${version}_net`);
    if (version === 'SDL2' && /SDL2_gfx|SDL_gfx|gfxPrimitives|\b(?:aaline|box|circle|ellipse|filledCircle|string)Color\s*\(/i.test(data)) {
      inferred.add('SDL2_gfx');
    }
  }
  return Array.from(inferred);
}

function buildSdlPackageDefines(packages: string[], version: CpmSdlResolvedVersion): string[] {
  const result: string[] = [];
  const mapping: Record<string, string[]> = {
    SDL2_image: ['CPM_USE_SDL2_IMAGE', 'CPM_USE_SDL_IMAGE'],
    SDL2_mixer: ['CPM_USE_SDL2_MIXER', 'CPM_USE_SDL_MIXER'],
    SDL2_ttf: ['CPM_USE_SDL2_TTF', 'CPM_USE_SDL_TTF'],
    SDL2_net: ['CPM_USE_SDL2_NET', 'CPM_USE_SDL_NET'],
    SDL2_gfx: ['CPM_USE_SDL2_GFX', 'CPM_USE_SDL_GFX'],
    SDL3_image: ['CPM_USE_SDL3_IMAGE', 'CPM_USE_SDL_IMAGE'],
    SDL3_mixer: ['CPM_USE_SDL3_MIXER', 'CPM_USE_SDL_MIXER'],
    SDL3_ttf: ['CPM_USE_SDL3_TTF', 'CPM_USE_SDL_TTF'],
    SDL3_net: ['CPM_USE_SDL3_NET', 'CPM_USE_SDL_NET']
  };
  for (const packageId of packages) {
    if (packageId === version) {
      continue;
    }
    const symbols = mapping[packageId] ?? [`CPM_USE_${packageId.toUpperCase()}`];
    for (const symbol of symbols) {
      result.push(`-D${symbol}`);
    }
  }
  return unique(result);
}

function buildSdlLinkArgs(installation: CpmSdlInstallation, packages: string[], version: CpmSdlResolvedVersion, runtimeMode: CpmSdlRuntimeMode, subsystem: CpmSdlSubsystem): string[] {
  const args: string[] = [];
  if (installation.libraryDirectory) {
    args.push('-L', installation.libraryDirectory);
  }

  if (version === 'SDL2' && process.platform === 'win32') {
    args.push('-lmingw32', '-lSDL2main');
  }

  const extensionLibs = packages
    .filter((id) => id !== version)
    .map((id) => SDL_PACKAGES.find((definition) => definition.id === id))
    .filter((value): value is SdlPackageDefinition => !!value);
  for (const definition of extensionLibs) {
    args.push(resolveSdlLibraryArgument(installation.libraryDirectory, definition.lib, runtimeMode));
  }

  if (runtimeMode === 'static-link' && installation.libraryDirectory) {
    args.push(resolveSdlLibraryArgument(installation.libraryDirectory, version, runtimeMode));
    if (version === 'SDL2' && process.platform === 'win32') {
      args.push('-lm', '-ldinput8', '-ldxguid', '-ldxerr8', '-luser32', '-lgdi32', '-lwinmm', '-limm32', '-lole32', '-loleaut32', '-lshell32', '-lsetupapi', '-lversion', '-luuid');
    }
    args.push(...staticSdlPackagePrivateLibraries(packages, version));
  } else {
    args.push(`-l${version}`);
  }

  if (process.platform === 'win32') {
    args.push(subsystem === 'windows' ? '-mwindows' : '-mconsole');
  }
  return uniquePreserveOrder(args);
}

function resolveSdlLibraryArgument(libraryDirectory: string | undefined, libraryName: string, runtimeMode: CpmSdlRuntimeMode): string {
  if (runtimeMode === 'static-link' && libraryDirectory) {
    const staticLib = path.join(libraryDirectory, `lib${libraryName}.a`);
    if (fs.existsSync(staticLib)) {
      return staticLib;
    }
  }
  return `-l${libraryName}`;
}

function staticSdlPackagePrivateLibraries(packages: string[], version: CpmSdlResolvedVersion): string[] {
  const privateLibs: Record<string, string[]> = {
    SDL2_ttf: ['-lusp10', '-lrpcrt4', '-lgdi32'],
    SDL2_mixer: ['-lwinmm'],
    SDL2_net: ['-lws2_32'],
    SDL2_gfx: ['-lm'],
    SDL3_ttf: ['-lusp10', '-lrpcrt4', '-lgdi32'],
    SDL3_mixer: ['-lwinmm'],
    SDL3_net: ['-lws2_32']
  };
  return uniquePreserveOrder(packages
    .filter((id) => id !== version)
    .flatMap((id) => privateLibs[id] ?? []));
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
    const hasHeader = includeDirectories.some((directory) => definition.headerNames.some((headerName) => fs.existsSync(path.join(directory, headerName))));
    const hasLibrary = !!libraryDirectory && [
      `lib${definition.lib}.a`,
      `lib${definition.lib}.dll.a`,
      `${definition.lib}.lib`,
      `${definition.lib}.dll.a`
    ].some((name) => fs.existsSync(path.join(libraryDirectory, name)));
    const hasDll = !!binaryDirectory && fs.existsSync(path.join(binaryDirectory, definition.dll));
    if (hasHeader || hasLibrary || hasDll || (definition.core && fs.existsSync(path.join(root, 'bin', definition.dll)))) {
      result.push(definition.id);
    }
  }
  return unique(result).sort((a, b) => packageSortIndex(a) - packageSortIndex(b));
}

function tripletsForArchitecture(architecture: CpmSdlArchitecture): string[] {
  const byArchitecture: Record<CpmSdlArchitecture, string[]> = {
    x86: ['i686-w64-mingw32', 'mingw32'],
    x64: ['x86_64-w64-mingw32', 'mingw64', 'ucrt64', 'clang64'],
    arm64: ['aarch64-w64-mingw32', 'arm64']
  };
  return byArchitecture[architecture];
}

function orderedSdlTriplets(preferredArchitecture?: CpmSdlArchitecture): string[] {
  const byArchitecture: Record<CpmSdlArchitecture, string[]> = {
    x86: ['i686-w64-mingw32', 'mingw32'],
    x64: ['x86_64-w64-mingw32', 'mingw64', 'ucrt64', 'clang64'],
    arm64: ['aarch64-w64-mingw32', 'arm64']
  };
  const all = ['x86_64-w64-mingw32', 'i686-w64-mingw32', 'aarch64-w64-mingw32', 'mingw64', 'mingw32', 'ucrt64', 'clang64'];
  return unique([...(preferredArchitecture ? byArchitecture[preferredArchitecture] : []), ...all]);
}

function orderedSdlLibArchNames(preferredArchitecture?: CpmSdlArchitecture): string[] {
  const byArchitecture: Record<CpmSdlArchitecture, string[]> = {
    x86: ['x86', 'Win32', 'win32'],
    x64: ['x64', 'x86_64', 'Win64', 'win64'],
    arm64: ['arm64', 'ARM64', 'aarch64']
  };
  const all = ['x64', 'x86', 'arm64', 'Win64', 'Win32'];
  return unique([...(preferredArchitecture ? byArchitecture[preferredArchitecture] : []), ...all]);
}

function findSdlLibraryDirectory(root: string, preferredArchitecture?: CpmSdlArchitecture): string | undefined {
  const candidates = [
    ...orderedSdlTriplets(preferredArchitecture).map((triplet) => path.join(root, triplet, 'lib')),
    ...orderedSdlLibArchNames(preferredArchitecture).map((archName) => path.join(root, 'lib', archName)),
    path.join(root, 'lib')
  ];
  return unique(candidates).find((candidate) => directoryContainsAny(candidate, ['libSDL2.a', 'libSDL2.dll.a', 'SDL2.lib', 'libSDL3.a', 'libSDL3.dll.a', 'SDL3.lib']));
}

function findSdlBinaryDirectory(root: string, preferredArchitecture?: CpmSdlArchitecture): string | undefined {
  const candidates = [
    ...orderedSdlTriplets(preferredArchitecture).map((triplet) => path.join(root, triplet, 'bin')),
    ...orderedSdlLibArchNames(preferredArchitecture).map((archName) => path.join(root, 'lib', archName)),
    path.join(root, 'bin'),
    path.join(root, 'lib')
  ];
  return unique(candidates).find((candidate) => directoryContainsAny(candidate, ['SDL2.dll', 'SDL3.dll']));
}

function directoryContainsAny(directory: string, names: string[]): boolean {
  return fs.existsSync(directory) && names.some((name) => fs.existsSync(path.join(directory, name)));
}

function detectSdlArchitecture(root: string, binaryDirectory?: string, libraryDirectory?: string, versions: CpmSdlResolvedVersion[] = ['SDL2', 'SDL3']): CpmSdlArchitecture | undefined {
  const candidates = versions.flatMap((version) => [
    binaryDirectory ? path.join(binaryDirectory, `${version}.dll`) : '',
    libraryDirectory ? path.join(libraryDirectory, `lib${version}.dll.a`) : '',
    libraryDirectory ? path.join(libraryDirectory, `lib${version}.a`) : ''
  ]).concat(root).filter(Boolean);
  for (const candidate of candidates) {
    const arch = inspectPeArchitecture(candidate);
    if (arch) {
      return arch;
    }
  }
  const text = root.toLowerCase();
  if (/(x64|64|mingw64|ucrt64|clang64|x86_64)/.test(text)) return 'x64';
  if (/(x86|32|mingw32|i686)/.test(text)) return 'x86';
  if (/(arm64|aarch64)/.test(text)) return 'arm64';
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
      if (/SDL\.h|SDL2\/SDL\.h|SDL3\/SDL\.h|SDL_Init|SDL_CreateWindow|SDL_Renderer|SDL_Window|SDL_EVENT_|SDL_QUIT|IMG_Load|TTF_Init|Mix_OpenAudio/i.test(data)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function environmentSdlRoots(): string[] {
  return ['SDL3_DIR', 'SDL3_HOME', 'SDL3_ROOT', 'SDL2_DIR', 'SDL_DIR', 'SDL_HOME', 'SDL2_HOME', 'SDL_ROOT']
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
    path.join(programFiles, 'SDL3'),
    path.join(programFiles, 'SDL3-64'),
    path.join(programFiles, 'SDL2'),
    path.join(programFiles, 'SDL2', 'x86_64-w64-mingw32'),
    path.join(programFiles, 'SDL2', 'i686-w64-mingw32'),
    path.join(programFilesX86, 'SDL32'),
    path.join(programFilesX86, 'SDL3'),
    path.join(programFilesX86, 'SDL2'),
    path.join(programFilesX86, 'SDL2', 'i686-w64-mingw32'),
    path.join(programFilesX86, 'SDL2', 'x86_64-w64-mingw32'),
    'C:\\SDL64',
    'C:\\SDL32',
    'C:\\SDL3',
    'C:\\SDL2',
    'C:\\SDL2\\i686-w64-mingw32',
    'C:\\SDL2\\x86_64-w64-mingw32',
    'C:\\msys64\\mingw64',
    'C:\\msys64\\mingw32',
    'C:\\msys64\\ucrt64',
    'C:\\msys64\\clang64'
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

function deriveSdlRootCandidates(root: string): string[] {
  const candidates: string[] = [root];
  const leaf = path.basename(root).toLowerCase();
  const parent = path.dirname(root);
  const parentLeaf = path.basename(parent).toLowerCase();

  if (['bin', 'lib', 'include', 'share'].includes(leaf)) {
    candidates.push(parent);
  }

  if (['sdl2', 'sdl3', 'sdl3_image', 'sdl3_mixer', 'sdl3_ttf', 'sdl3_net'].includes(leaf) && parentLeaf === 'include') {
    candidates.push(path.dirname(parent));
  }

  if (['pkgconfig', 'cmake'].includes(leaf) && parentLeaf === 'lib') {
    candidates.push(path.dirname(parent));
  }

  if (parentLeaf === 'cmake' && path.basename(path.dirname(parent)).toLowerCase() === 'lib') {
    candidates.push(path.dirname(path.dirname(parent)));
  }

  return unique(candidates);
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

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
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

function normalizeSdlVersion(value: string | undefined): CpmSdlVersion {
  return value === 'SDL2' || value === 'SDL3' || value === 'auto' ? value : 'auto';
}

function resolvePackageVersion(version: CpmSdlVersion, packages: string[]): CpmSdlResolvedVersion {
  if (version === 'SDL2' || version === 'SDL3') {
    return version;
  }
  if (packages.some((id) => packageVersion(id) === 'SDL3')) {
    return 'SDL3';
  }
  return 'SDL2';
}

function resolveRequestedVersion(preferred: CpmSdlVersion, packages: string[], availableVersions: CpmSdlResolvedVersion[], filePaths?: string[]): CpmSdlResolvedVersion {
  if ((preferred === 'SDL2' || preferred === 'SDL3') && availableVersions.includes(preferred)) {
    return preferred;
  }
  if (filePaths?.some((filePath) => fileLooksLikeSdl3(filePath)) && availableVersions.includes('SDL3')) {
    return 'SDL3';
  }
  const packageVersionGuess = packages.some((id) => packageVersion(id) === 'SDL3') ? 'SDL3' : packages.some((id) => packageVersion(id) === 'SDL2') ? 'SDL2' : undefined;
  if (packageVersionGuess && availableVersions.includes(packageVersionGuess)) {
    return packageVersionGuess;
  }
  if (availableVersions.includes('SDL2')) {
    return 'SDL2';
  }
  return availableVersions.includes('SDL3') ? 'SDL3' : 'SDL2';
}

function fileLooksLikeSdl3(filePath: string): boolean {
  try {
    const data = fs.readFileSync(filePath, 'utf8').slice(0, 65536);
    return /SDL3\/SDL\.h|SDL3\/SDL_main\.h|SDL_EVENT_|CPM_USE_SDL3/.test(data);
  } catch {
    return false;
  }
}

function packageVersion(packageId: string): CpmSdlResolvedVersion | undefined {
  return SDL_PACKAGES.find((definition) => definition.id === packageId)?.version;
}

function corePackageId(version: CpmSdlResolvedVersion): string {
  return version;
}

function detectSdlVersions(packages: string[]): CpmSdlResolvedVersion[] {
  const versions: CpmSdlResolvedVersion[] = [];
  if (packages.includes('SDL2')) {
    versions.push('SDL2');
  }
  if (packages.includes('SDL3')) {
    versions.push('SDL3');
  }
  return versions;
}

function packageSortIndex(packageId: string): number {
  const index = SDL_PACKAGES.findIndex((definition) => definition.id === packageId);
  return index >= 0 ? index : 1000;
}
