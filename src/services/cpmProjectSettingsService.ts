import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { CpmParser } from '../model/cpmParser';
import { CpmBuildMode, CpmWorkspaceProjectRef } from '../model/types';
import { CpmWorkspaceService } from './cpmWorkspaceService';

export interface CpmRunSettings {
  arguments: string;
  workingDirectory: string;
  environmentOptions: string;
  externalProcessPath: string;
}

export interface CpmProjectBuildSettings {
  preBuildActions: string[];
  customBuildActions: string[];
  postBuildActions: string[];
  dependencies: string[];
  run: CpmRunSettings;
  nativeBuildActions: boolean;
}

interface CpmProjectBuildSettingsStore {
  version: number;
  projects: Record<string, CpmProjectBuildSettings>;
}

const EMPTY_RUN_SETTINGS: CpmRunSettings = {
  arguments: '',
  workingDirectory: '',
  environmentOptions: '',
  externalProcessPath: ''
};

export class CpmProjectSettingsService {
  constructor(
    private readonly workspaces: CpmWorkspaceService,
    private readonly parser: CpmParser,
    private readonly output: vscode.OutputChannel
  ) {}

  getConfigurationPath(): string | undefined {
    const root = this.getConfigurationRoot();
    return root ? path.join(root, '.vscode', 'cpm-build.json') : undefined;
  }

  getSettings(projectRef: CpmWorkspaceProjectRef, mode: CpmBuildMode = this.buildMode): CpmProjectBuildSettings {
    const store = this.loadStore();
    const stored = store.projects[this.projectKey(projectRef.absolutePath)];
    const cwsRun = this.getCwsRunSettings(projectRef, mode);
    const nativeActions = this.parser.getProjectBuildActions(projectRef.absolutePath, mode);
    return normalizeSettings(stored, cwsRun, nativeActions.nativeSectionsPresent ? nativeActions : undefined, nativeActions.nativeSectionsPresent);
  }

  setSettings(projectRef: CpmWorkspaceProjectRef, settings: CpmProjectBuildSettings, mode: CpmBuildMode = this.buildMode): void {
    const store = this.loadStore();
    const normalized = normalizeSettings(settings);
    this.parser.setProjectBuildActions(projectRef.absolutePath, mode, normalized);
    normalized.nativeBuildActions = true;
    store.projects[this.projectKey(projectRef.absolutePath)] = normalized;
    this.saveStore(store);
    this.setCwsRunSettings(projectRef, normalized.run, mode);
    this.output.appendLine(`[CPM] Project build settings saved: ${projectRef.name}`);
  }

  getBuildOrder(projectRef: CpmWorkspaceProjectRef): CpmWorkspaceProjectRef[] {
    const workspace = this.workspaces.currentWorkspace;
    if (!workspace) {
      return [projectRef];
    }
    const byKey = new Map(workspace.projects.map((ref) => [this.projectKey(ref.absolutePath), ref]));
    const result: CpmWorkspaceProjectRef[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (ref: CpmWorkspaceProjectRef): void => {
      const key = this.projectKey(ref.absolutePath);
      if (visited.has(key)) {
        return;
      }
      if (visiting.has(key)) {
        throw new Error(`Circular C/C++ build dependency detected at ${ref.name}.`);
      }
      visiting.add(key);
      for (const dependencyKey of this.getSettings(ref).dependencies) {
        const dependency = byKey.get(dependencyKey);
        if (dependency?.exists) {
          visit(dependency);
        }
      }
      visiting.delete(key);
      visited.add(key);
      result.push(ref);
    };

    visit(projectRef);
    return result;
  }

  hasNativeBuildActions(projectRef: CpmWorkspaceProjectRef): boolean {
    return this.parser.getProjectBuildActions(projectRef.absolutePath, this.buildMode).nativeSectionsPresent;
  }

  dependencyKey(projectRef: CpmWorkspaceProjectRef): string {
    return this.projectKey(projectRef.absolutePath);
  }

  async runActions(actions: string[], label: string, cwd: string): Promise<boolean> {
    const commands = actions.map((entry) => entry.trim()).filter((entry) => entry && !entry.startsWith('#'));
    if (!commands.length) {
      return true;
    }
    this.output.appendLine(`[CPM] ${label}`);
    for (const command of commands) {
      this.output.appendLine(`[CPM] > ${command}`);
      const success = await this.runShellCommand(command, cwd);
      if (!success) {
        this.output.appendLine(`[CPM] ${label} failed.`);
        return false;
      }
    }
    return true;
  }

  parseArguments(value: string): string[] {
    const result: string[] = [];
    const pattern = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      result.push(match[1] ?? match[2] ?? match[3]);
    }
    return result;
  }

  parseEnvironment(value: string): NodeJS.ProcessEnv {
    const result: NodeJS.ProcessEnv = { ...process.env };
    for (const entry of value.split(';')) {
      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }
      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      const val = trimmed.slice(separator + 1).trim();
      if (key) {
        result[key] = val;
      }
    }
    return result;
  }

  private getCwsRunSettings(projectRef: CpmWorkspaceProjectRef, mode: CpmBuildMode = this.buildMode): CpmRunSettings | undefined {
    const workspace = this.workspaces.currentWorkspace;
    if (!workspace || path.extname(workspace.path).toLowerCase() !== '.cws') {
      return undefined;
    }
    return this.parser.getWorkspaceRunOptions(workspace.path, projectRef.index, mode);
  }

  private setCwsRunSettings(projectRef: CpmWorkspaceProjectRef, run: CpmRunSettings, mode: CpmBuildMode = this.buildMode): void {
    const workspace = this.workspaces.currentWorkspace;
    if (!workspace || path.extname(workspace.path).toLowerCase() !== '.cws') {
      return;
    }
    this.parser.setWorkspaceRunOptions(workspace.path, projectRef.index, mode, run);
  }

  private get buildMode(): CpmBuildMode {
    return vscode.workspace.getConfiguration('cpm').get<CpmBuildMode>('buildMode', 'debug');
  }

  private getConfigurationRoot(): string | undefined {
    const workspace = this.workspaces.currentWorkspace;
    if (workspace) {
      return path.dirname(workspace.path);
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private projectKey(projectPath: string): string {
    const root = this.getConfigurationRoot();
    if (!root) {
      return path.normalize(projectPath).replace(/\\/g, '/').toLowerCase();
    }
    return path.relative(root, projectPath).replace(/\\/g, '/').toLowerCase();
  }

  private loadStore(): CpmProjectBuildSettingsStore {
    const filePath = this.getConfigurationPath();
    let effectivePath = filePath;
    if (!effectivePath || !fs.existsSync(effectivePath)) {
      const root = this.getConfigurationRoot();
      const legacyPath = root ? path.join(root, '.vscode', 'labwindows-cpm-build.json') : undefined;
      if (!legacyPath || !fs.existsSync(legacyPath)) {
        return { version: 1, projects: {} };
      }
      effectivePath = legacyPath;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(effectivePath, 'utf8')) as Partial<CpmProjectBuildSettingsStore>;
      return { version: 1, projects: raw.projects && typeof raw.projects === 'object' ? raw.projects : {} };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to read ${effectivePath}: ${message}`);
    }
  }

  private saveStore(store: CpmProjectBuildSettingsStore): void {
    const filePath = this.getConfigurationPath();
    if (!filePath) {
      throw new Error('No C/C++ workspace directory is available to store build settings.');
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  }

  private async runShellCommand(command: string, cwd: string): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      const child = spawn(command, { cwd, shell: true, windowsHide: true });
      child.stdout.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.stderr.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.on('error', (error) => {
        this.output.appendLine(`[CPM] Unable to run action: ${error.message}`);
        resolve(false);
      });
      child.on('close', (code) => {
        this.output.appendLine(`[CPM] Action exited with code ${String(code)}.`);
        resolve(code === 0);
      });
    });
  }
}

function normalizeSettings(value?: Partial<CpmProjectBuildSettings>, fallbackRun?: Partial<CpmRunSettings>, nativeActions?: Partial<CpmProjectBuildSettings>, nativeBuildActions = false): CpmProjectBuildSettings {
  return {
    preBuildActions: normalizeActions(nativeActions?.preBuildActions ?? value?.preBuildActions),
    customBuildActions: normalizeActions(nativeActions?.customBuildActions ?? value?.customBuildActions),
    postBuildActions: normalizeActions(nativeActions?.postBuildActions ?? value?.postBuildActions),
    dependencies: Array.isArray(value?.dependencies) ? value.dependencies.map(String) : [],
    run: {
      arguments: String(fallbackRun?.arguments ?? value?.run?.arguments ?? EMPTY_RUN_SETTINGS.arguments),
      workingDirectory: String(fallbackRun?.workingDirectory ?? value?.run?.workingDirectory ?? EMPTY_RUN_SETTINGS.workingDirectory),
      environmentOptions: String(fallbackRun?.environmentOptions ?? value?.run?.environmentOptions ?? EMPTY_RUN_SETTINGS.environmentOptions),
      externalProcessPath: String(fallbackRun?.externalProcessPath ?? value?.run?.externalProcessPath ?? EMPTY_RUN_SETTINGS.externalProcessPath)
    },
    nativeBuildActions: nativeBuildActions || value?.nativeBuildActions === true
  };
}

function normalizeActions(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((entry) => entry.trim()).filter(Boolean) : [];
}
