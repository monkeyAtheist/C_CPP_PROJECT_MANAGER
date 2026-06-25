export type CpmBuildMode = 'debug' | 'release' | 'debug64' | 'release64';

export interface CpmRunOptions {
  arguments: string;
  workingDirectory: string;
  environmentOptions: string;
  externalProcessPath: string;
}

export interface CpmWorkspaceProjectRef {
  index: number;
  relativePath: string;
  absolutePath: string;
  name: string;
  exists: boolean;
}

export interface CpmWorkspace {
  path: string;
  name: string;
  activeProjectIndex: number;
  projects: CpmWorkspaceProjectRef[];
  cpmDir?: string;
}

export interface CpmProjectFile {
  sectionName: string;
  id: number;
  type: string;
  folder: string;
  relativePath?: string;
  absolutePath: string;
  excluded: boolean;
  compileIntoObjectFile: boolean;
  exists: boolean;
}

export interface CpmProject {
  path: string;
  name: string;
  targetType: string;
  cpmDir?: string;
  folders: string[];
  files: CpmProjectFile[];
}

export interface CpmInstallation {
  root: string;
  label: string;
  compileExe?: string;
  ideExe?: string;
  clangCcExe?: string;
  cCompilerExe?: string;
  cppCompilerExe?: string;
  archiverExe?: string;
  debuggerExe?: string;
  source: 'configured' | 'workspace' | 'scan' | 'manual';
}
