import * as vscode from 'vscode';
import { CpmBuildMode } from '../model/types';
import { CpmBuildService } from '../services/cpmBuildService';
import { CpmProjectSettingsService } from '../services/cpmProjectSettingsService';
import { CpmWorkspaceService } from '../services/cpmWorkspaceService';

interface QuickActionsSummary {
  workspaceName: string;
  projectCount: number;
  projectName: string;
  projectPath: string;
  buildMode: CpmBuildMode;
  targetType: string;
  commandLine: string;
  workingDirectory: string;
  environment: string;
  buildSteps: string;
  dependencies: string;
  files: string;
  hasMissingFiles: boolean;
}

interface QuickActionNode {
  label: string;
  description?: string;
  tooltip?: string;
  icon?: string;
  command?: vscode.Command;
  contextValue?: string;
}

/**
 * Native summary view used instead of a WebviewView.
 *
 * A contributed WebviewView starts a Chromium service worker as soon as the
 * side bar is restored. On affected VS Code installations, a stale Chromium
 * state can make every webview fail with InvalidStateError. A native tree view
 * avoids that failure path during extension activation while preserving the
 * useful project summary.
 */
export class QuickActionsView implements vscode.TreeDataProvider<QuickActionNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<QuickActionNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly workspaces: CpmWorkspaceService,
    private readonly builds: CpmBuildService,
    private readonly projectSettings: CpmProjectSettingsService
  ) {
    this.disposables.push(this.workspaces.onDidChange(() => this.update()));
  }

  update(): void {
    this.emitter.fire();
  }

  getTreeItem(element: QuickActionNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.description = element.description;
    item.tooltip = element.tooltip ?? [element.label, element.description].filter(Boolean).join(' — ');
    item.contextValue = element.contextValue ?? 'cpmQuickActionSummary';
    if (element.icon) {
      item.iconPath = new vscode.ThemeIcon(element.icon);
    }
    item.command = element.command;
    return item;
  }

  getChildren(): QuickActionNode[] {
    const workspace = this.workspaces.currentWorkspace;
    const ref = this.workspaces.activeProjectRef;
    if (!workspace) {
      return [
        info('No workspace loaded', 'Open or create a C/C++ workspace to display the active target summary.', 'info'),
        action('Open workspace or project…', 'cpm.openWorkspace', 'folder-opened'),
        action('Create workspace and project…', 'cpm.createWorkspaceProject', 'new-folder'),
        action('Create SDL workspace and project…', 'cpm.createSdlWorkspaceProject', 'window')
      ];
    }
    if (!ref?.exists) {
      return [
        info('No active project', 'Select an existing project in the workspace tree.', 'info'),
        action('Open workspace or project…', 'cpm.openWorkspace', 'folder-opened')
      ];
    }

    const summary = this.createSummary();
    if (!summary) {
      return [];
    }
    return [
      info(summary.projectName, `${summary.workspaceName} · ${summary.projectCount} project${summary.projectCount === 1 ? '' : 's'}`, 'project'),
      info('Target type', summary.targetType, 'symbol-enum'),
      info('Build mode', modeDescription(summary.buildMode), 'settings-gear'),
      info('Command line', summary.commandLine, 'terminal'),
      info('Working directory', summary.workingDirectory, 'folder'),
      info('Environment', summary.environment, 'symbol-key'),
      info('Build steps', summary.buildSteps, 'list-ordered'),
      info('Dependencies', summary.dependencies, 'references'),
      info('Project files', summary.files, summary.hasMissingFiles ? 'warning' : 'pass'),
      action('Open project build settings…', 'cpm.editBuildSettings', 'settings-gear'),
      action('Configure SDL SDK…', 'cpm.configureSdl', 'window'),
      action('Create SDL project…', 'cpm.createSdlProjectInWorkspace', 'new-folder'),
      action('Open build settings in safe mode…', 'cpm.editBuildSettingsSafeMode', 'shield'),
      action('Enable automatic suggestions', 'cpm.enableAutomaticSuggestions', 'sparkle'),
      action('Build & Debug', 'cpm.debugInCpm', 'debug-alt-small'),
      action('Build & Run', 'cpm.run', 'play'),
      action('Run without build', 'cpm.runWithoutBuild', 'run')
    ];
  }

  dispose(): void {
    this.emitter.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }

  private createSummary(): QuickActionsSummary | undefined {
    const workspace = this.workspaces.currentWorkspace;
    const ref = this.workspaces.activeProjectRef;
    if (!workspace || !ref?.exists) {
      return undefined;
    }
    const project = this.workspaces.getProject(ref);
    const settings = this.projectSettings.getSettings(ref);
    const actionCounts = [settings.preBuildActions.length, settings.customBuildActions.length, settings.postBuildActions.length];
    const actionTotal = actionCounts.reduce((sum, count) => sum + count, 0);
    const missingFiles = project?.files.filter((file) => !file.exists).length ?? 0;
    const totalFiles = project?.files.length ?? 0;
    return {
      workspaceName: workspace.name,
      projectCount: workspace.projects.length,
      projectName: ref.name,
      projectPath: ref.absolutePath,
      buildMode: this.builds.buildMode,
      targetType: project?.targetType || 'Unknown',
      commandLine: configuredLabel(settings.run.arguments),
      workingDirectory: configuredLabel(settings.run.workingDirectory),
      environment: configuredLabel(settings.run.environmentOptions),
      buildSteps: actionTotal === 0 ? 'Empty' : `Pre ${actionCounts[0]} · Custom ${actionCounts[1]} · Post ${actionCounts[2]}`,
      dependencies: settings.dependencies.length === 0 ? 'None' : String(settings.dependencies.length),
      files: missingFiles === 0 ? `${totalFiles} · no missing file` : `${totalFiles} · ${missingFiles} missing`,
      hasMissingFiles: missingFiles > 0
    };
  }
}

function info(label: string, description: string, icon: string): QuickActionNode {
  return { label, description, icon };
}

function action(label: string, command: string, icon: string): QuickActionNode {
  return { label, icon, contextValue: 'cpmQuickActionCommand', command: { command, title: label } };
}

function configuredLabel(value: string): string { return value.trim() ? 'Configured' : 'Empty'; }
function modeDescription(mode: CpmBuildMode): string {
  switch (mode) {
    case 'release': return 'Release x86';
    case 'debug64': return 'Debug x64';
    case 'release64': return 'Release x64';
    default: return 'Debug x86';
  }
}
