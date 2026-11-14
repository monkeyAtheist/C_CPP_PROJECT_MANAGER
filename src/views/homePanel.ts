import * as path from 'path';
import * as vscode from 'vscode';
import { executeWebviewCommand, hardenHtml, mediaUri, safeJson } from './webviewKit';
import { CpmBuildService, CpmLastBuildResult } from '../services/cpmBuildService';
import { CpmInstallationService } from '../services/cpmInstallationService';
import { CpmWorkspaceService } from '../services/cpmWorkspaceService';
import { resolveToolStatus } from '../utils/toolStatus';

const BUILD_MODE_SHORT: Record<string, string> = { debug: 'D32', release: 'R32', debug64: 'D64', release64: 'R64' };
const BUILD_MODE_LONG: Record<string, string> = { debug: 'Debug, 32-bit', release: 'Release, 32-bit', debug64: 'Debug, 64-bit', release64: 'Release, 64-bit' };
const TARGET_SHORT: Record<string, string> = { 'Executable': 'EXE', 'Dynamic Link Library': 'DLL', 'Static Library': 'LIB' };

interface HomeToolState { role: string; label: string; path: string; status: 'ok' | 'missing' | 'unresolved'; message: string }

export interface HomeState {
  workspace?: { name: string; path: string; projectCount: number };
  project?: { name: string; path: string; targetType: string; targetShort: string };
  mode: string;
  modeShort: string;
  modeLong: string;
  toolchain: { root?: string; source?: string; configuredCount: number; tools: HomeToolState[] };
  lastBuild?: CpmLastBuildResult;
  problems: { errors: number; warnings: number };
  recents: Array<{ name: string; path: string; lastOpened: number; exists: boolean; current: boolean }>;
}

/**
 * Home page. The HTML skeleton is rendered once; every later change (workspace, configuration, build result,
 * problems, recents) is pushed with postMessage and drawn by media/webview/home.js, so the page never reloads.
 */
export class HomePanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private updateTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly workspaces: CpmWorkspaceService,
    private readonly builds: CpmBuildService,
    private readonly installations: CpmInstallationService,
    private readonly diagnostics?: vscode.DiagnosticCollection
  ) {
    this.disposables.push(
      this.workspaces.onDidChange(() => this.update()),
      this.builds.onDidFinishBuild(() => this.update()),
      vscode.languages.onDidChangeDiagnostics(() => this.scheduleUpdate())
    );
  }

  dispose(): void {
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.panel?.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.update();
      return;
    }
    this.panel = vscode.window.createWebviewPanel('cpm.home', 'C/C++ Project Manager', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
    });
    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'cpm.svg');
    this.panel.onDidDispose(() => { this.panel = undefined; });
    this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message));
    this.panel.webview.html = this.renderSkeleton(this.panel.webview);
  }

  /** Pushes fresh state to an open page (no reload). */
  update(): void {
    if (!this.panel) return;
    void this.panel.webview.postMessage({ type: 'state', state: this.collectState() });
  }

  private scheduleUpdate(): void {
    if (!this.panel) return;
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => this.update(), 250);
  }

  private async handleMessage(message: any): Promise<void> {
    try {
      switch (String(message?.type ?? '')) {
        case 'ready':
          this.update();
          return;
        case 'command':
          await executeWebviewCommand(message.command);
          return;
        case 'openRecent': {
          const target = String(message.path ?? '');
          const known = this.workspaces.getRecentWorkspaces().find((entry) => entry.path === target);
          if (!known) return;
          if (!known.exists) {
            const answer = await vscode.window.showWarningMessage(`${known.name} no longer exists at ${known.path}.`, 'Remove from recents');
            if (answer) await this.workspaces.forgetRecentWorkspace(known.path);
            return;
          }
          await this.workspaces.load(known.path);
          return;
        }
        case 'forgetRecent':
          await this.workspaces.forgetRecentWorkspace(String(message.path ?? ''));
          return;
        case 'revealRecent': {
          const target = String(message.path ?? '');
          if (this.workspaces.getRecentWorkspaces().some((entry) => entry.path === target)) await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(target));
          return;
        }
      }
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      this.update();
    }
  }

  private collectState(): HomeState {
    const workspace = this.workspaces.currentWorkspace;
    const activeProject = this.workspaces.activeProjectRef;
    const project = activeProject?.exists ? this.workspaces.getProject(activeProject) : undefined;
    const toolchain = this.installations.getActiveInstallation(workspace?.cpmDir, false);
    const root = toolchain?.root ?? '';
    const tool = (role: string, label: string, executable: string | undefined): HomeToolState => {
      if (!executable) return { role, label, path: '', status: 'missing', message: `${label} is not configured` };
      const result = resolveToolStatus(executable, workspace?.cpmDir, root);
      return { role, label, path: executable, status: result.status, message: result.message };
    };
    let errors = 0;
    let warnings = 0;
    this.diagnostics?.forEach((_uri, items) => {
      for (const item of items) {
        if (item.severity === vscode.DiagnosticSeverity.Error) errors++;
        else if (item.severity === vscode.DiagnosticSeverity.Warning) warnings++;
      }
    });
    const mode = this.builds.buildMode;
    const targetType = project?.targetType ?? '';
    return {
      workspace: workspace ? { name: workspace.name, path: workspace.path, projectCount: workspace.projects.length } : undefined,
      project: activeProject?.exists ? { name: activeProject.name, path: activeProject.absolutePath, targetType, targetShort: TARGET_SHORT[targetType] ?? targetType } : undefined,
      mode,
      modeShort: BUILD_MODE_SHORT[mode] ?? mode,
      modeLong: BUILD_MODE_LONG[mode] ?? mode,
      toolchain: {
        root: toolchain?.root,
        source: toolchain?.source,
        configuredCount: this.installations.getConfiguredInstallations().length,
        tools: toolchain ? [
          tool('C compiler', 'gcc', toolchain.cCompilerExe ?? toolchain.compileExe),
          tool('C++ compiler', 'g++', toolchain.cppCompilerExe),
          tool('Archiver', 'ar', toolchain.archiverExe),
          tool('Debugger', 'gdb', toolchain.debuggerExe)
        ] : []
      },
      lastBuild: this.builds.lastBuild,
      problems: { errors, warnings },
      recents: this.workspaces.getRecentWorkspaces().map((entry) => ({ ...entry, current: Boolean(workspace && path.resolve(workspace.path) === path.resolve(entry.path)) }))
    };
  }

  private renderSkeleton(webview: vscode.Webview): string {
    const style = mediaUri(webview, 'home.css');
    const script = mediaUri(webview, 'home.js');
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>C/C++ Project Manager</title>
${style ? `<link rel="stylesheet" href="${style.toString()}">` : ''}
</head>
<body class="home">
<div id="app" class="home-shell" aria-live="polite"></div>
<script>window.CPM_HOME_INIT = ${safeJson(this.collectState())};</script>
${script ? `<script src="${script.toString()}"></script>` : ''}
</body>
</html>`;
    return hardenHtml(html, webview, { sharedStyles: true });
  }
}
