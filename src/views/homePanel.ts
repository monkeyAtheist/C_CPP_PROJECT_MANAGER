import * as path from 'path';
import * as vscode from 'vscode';
import { CviBuildService } from '../services/cviBuildService';
import { CviInstallationService } from '../services/cviInstallationService';
import { CviWorkspaceService } from '../services/cviWorkspaceService';

export class HomePanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly workspaces: CviWorkspaceService,
    private readonly builds: CviBuildService,
    private readonly installations: CviInstallationService
  ) {
    this.disposables.push(this.workspaces.onDidChange(() => this.update()));
  }

  dispose(): void {
    this.panel?.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.update();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'labwindowsCvi.home',
      'C/C++ Project Manager',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'cpm.svg');
    this.panel.onDidDispose(() => { this.panel = undefined; });
    this.panel.webview.onDidReceiveMessage(async (message: { command?: string }) => {
      if (!message.command) {
        return;
      }
      await vscode.commands.executeCommand(message.command);
      this.update();
    });
    this.update();
  }

  update(): void {
    if (!this.panel) {
      return;
    }
    const workspace = this.workspaces.currentWorkspace;
    const activeProject = this.workspaces.activeProjectRef;
    const project = activeProject ? this.workspaces.getProject(activeProject) : undefined;
    const toolchain = this.installations.getActiveInstallation(workspace?.cviDir);
    const detectedToolchainCount = this.installations.getKnownInstallations(workspace?.cviDir).length;
    const mode = this.builds.buildMode;
    this.panel.webview.html = renderHtml({
      workspace: workspace?.path,
      workspaceName: workspace?.name,
      projectCount: workspace?.projects.length ?? 0,
      projectName: activeProject?.name,
      projectPath: activeProject?.absolutePath,
      targetType: project?.targetType,
      cCompiler: toolchain?.cCompilerExe ?? toolchain?.compileExe,
      cppCompiler: toolchain?.cppCompilerExe,
      archiver: toolchain?.archiverExe,
      debuggerPath: toolchain?.debuggerExe,
      toolchainRoot: toolchain?.root,
      toolchainSource: toolchain?.source,
      detectedToolchainCount,
      mode
    });
  }
}

interface HomeState {
  workspace?: string;
  workspaceName?: string;
  projectCount: number;
  projectName?: string;
  projectPath?: string;
  targetType?: string;
  cCompiler?: string;
  cppCompiler?: string;
  archiver?: string;
  debuggerPath?: string;
  toolchainRoot?: string;
  toolchainSource?: string;
  detectedToolchainCount: number;
  mode: string;
}

function renderHtml(state: HomeState): string {
  const nonce = makeNonce();
  const hasWorkspace = Boolean(state.workspace);
  const hasProject = Boolean(state.projectPath);
  const workspaceName = escapeHtml(state.workspaceName ?? 'No workspace loaded');
  const workspacePath = escapeHtml(state.workspace ?? 'Open an existing .cws/.prj file or create a new C/C++ workspace.');
  const projectName = escapeHtml(state.projectName ?? 'No project loaded');
  const projectPath = escapeHtml(state.projectPath ?? 'Load or create a C/C++ project to enable build, run and file-generation actions.');
  const mode = escapeHtml(state.mode);
  const targetType = escapeHtml(state.targetType ?? 'No target');
  const projectCountLabel = `${state.projectCount} project${state.projectCount === 1 ? '' : 's'}`;
  const toolchainRoot = escapeHtml(state.toolchainRoot ?? 'No C/C++ toolchain selected');
  const compilerLine = escapeHtml([
    state.cCompiler ? `C: ${compactPath(state.cCompiler)}` : 'C: not configured',
    state.cppCompiler ? `C++: ${compactPath(state.cppCompiler)}` : 'C++: not configured',
    state.archiver ? `AR: ${compactPath(state.archiver)}` : 'AR: not configured',
    state.debuggerPath ? `DBG: ${compactPath(state.debuggerPath)}` : 'DBG: not configured'
  ].join(' · '));
  const detectedLabel = `${state.detectedToolchainCount} detected toolchain${state.detectedToolchainCount === 1 ? '' : 's'}`;
  const sourceLabel = escapeHtml(state.toolchainSource ?? 'auto');

  const emptyState = !hasProject ? `
      <div class="empty-state">
        <div class="empty-icon">CPM</div>
        <div>
          <h3>No project loaded</h3>
          <p>Open an existing C/C++ workspace or create a starter project. The selected project folder can be synchronized with the standard VS Code C/C++ IntelliSense configuration.</p>
          <div class="actions primary-row">
            <button data-command="labwindowsCvi.openWorkspace">Open workspace</button>
            <button data-command="labwindowsCvi.createWorkspaceProject">Create workspace and project</button>
            <button data-command="labwindowsCvi.configureInstallation">Select toolchain</button>
          </div>
        </div>
      </div>` : '';

  const workspaceActions = hasWorkspace ? `
        <div class="actions">
          <button data-command="labwindowsCvi.openWorkspace">Open another workspace</button>
          <button class="secondary" data-command="labwindowsCvi.createWorkspaceProject">Create</button>
          <button class="secondary" data-command="labwindowsCvi.openWorkspaceInCvi">Open workspace file</button>
        </div>` : '';

  const projectActions = hasProject ? `
        <div class="actions project-actions">
          <button data-command="labwindowsCvi.chooseBuildAction">Build / rebuild / clean</button>
          <button class="secondary" data-command="labwindowsCvi.run">Build + run</button>
          <button class="secondary" data-command="labwindowsCvi.debugInCvi">Build + debug</button>
          <button class="secondary" data-command="labwindowsCvi.chooseRunAction">Run options</button>
          <button class="secondary" data-command="labwindowsCvi.selectBuildMode">Build mode</button>
          <button class="secondary" data-command="labwindowsCvi.selectTargetType">Target type</button>
          <button class="secondary" data-command="labwindowsCvi.editBuildSettings">Build settings</button>
          <button class="secondary" data-command="labwindowsCvi.createNewFile">Create file</button>
        </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>C/C++ Project Manager</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 28px 28px 46px; max-width: 1240px; margin: auto; }
    h1 { font-size: 28px; margin: 0 0 6px; letter-spacing: .1px; }
    h2 { font-size: 18px; margin: 0; }
    h3 { font-size: 16px; margin: 0 0 7px; }
    p { margin: 0; line-height: 1.55; }
    .muted { color: var(--vscode-descriptionForeground); }
    .section { margin-top: 24px; }
    .section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .section-heading span { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .overview-grid, .tools-grid { display: grid; gap: 12px; }
    .overview-grid { grid-template-columns: repeat(auto-fit, minmax(390px, 1fr)); }
    .tools-grid { grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); }
    .card { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); padding: 17px; border-radius: 8px; min-width: 0; }
    .card-header { display: flex; align-items: center; gap: 11px; margin-bottom: 12px; }
    .tile-icon { display: grid; place-items: center; flex: 0 0 auto; width: 38px; height: 38px; border-radius: 9px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); font-size: 11px; font-weight: 800; letter-spacing: .3px; }
    .title-stack { min-width: 0; }
    .title-stack strong { display: block; font-size: 15px; overflow-wrap: anywhere; }
    .title-stack small { color: var(--vscode-descriptionForeground); }
    .path { font-family: var(--vscode-editor-font-family); font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; color: var(--vscode-descriptionForeground); background: var(--vscode-textCodeBlock-background); border-radius: 4px; padding: 8px 9px; margin: 9px 0 13px; }
    .tag { display: inline-block; border: 1px solid var(--vscode-panel-border); padding: 3px 8px; border-radius: 999px; font-size: 12px; margin-right: 5px; color: var(--vscode-descriptionForeground); }
    .actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 13px; }
    button { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); padding: 7px 11px; cursor: pointer; border-radius: 3px; font: inherit; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .empty-state { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: start; border: 1px dashed var(--vscode-panel-border); background: var(--vscode-sideBar-background); padding: 19px; border-radius: 8px; margin-bottom: 12px; }
    .empty-state p { color: var(--vscode-descriptionForeground); max-width: 840px; }
    .empty-icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); font-size: 15px; font-weight: 800; letter-spacing: .5px; }
    .primary-row button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .toolchain-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: center; }
    .toolchain-card .actions { margin-top: 0; justify-content: flex-end; }
    @media (max-width: 760px) {
      body { padding: 20px 18px 36px; }
      .overview-grid, .tools-grid { grid-template-columns: 1fr; }
      .toolchain-card { grid-template-columns: 1fr; }
      .toolchain-card .actions { justify-content: flex-start; }
      .empty-state { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <h1>C/C++ Project Manager</h1>
  <div class="muted">Create, organize, build, run and debug C/C++ workspaces with GCC, MinGW, Clang or another configurable compiler.</div>

  <section class="section">
    <div class="section-heading">
      <h2>Workspace and active project</h2>
      <span>${escapeHtml(projectCountLabel)}</span>
    </div>
    ${emptyState}
    <div class="overview-grid">
      <article class="card">
        <div class="card-header">
          <div class="tile-icon">WS</div>
          <div class="title-stack">
            <small>Workspace</small>
            <strong>${workspaceName}</strong>
          </div>
        </div>
        <div class="path">${workspacePath}</div>
        ${workspaceActions}
      </article>

      <article class="card">
        <div class="card-header">
          <div class="tile-icon">PRJ</div>
          <div class="title-stack">
            <small>Active project</small>
            <strong>${projectName}</strong>
          </div>
        </div>
        <div class="path">${projectPath}</div>
        <span class="tag">${mode}</span><span class="tag">${targetType}</span>
        ${projectActions}
      </article>
    </div>
  </section>

  <section class="section">
    <div class="section-heading">
      <h2>Libraries, templates and reusable code</h2>
      <span>C/C++ symbols, templates and snippets</span>
    </div>
    <div class="tools-grid">
      <article class="card">
        <div class="card-header">
          <div class="tile-icon">LIB</div>
          <div class="title-stack">
            <small>Libraries</small>
            <strong>Embedded C/C++ symbol explorer</strong>
          </div>
        </div>
        <p class="muted">Browse C/C++ API packs, search symbols and insert parameterized calls from the Libraries view.</p>
        <div class="actions">
          <button data-command="labwindowsCvi.library.findFunction">Find symbol</button>
          <button class="secondary" data-command="labwindowsCvi.library.reloadPacks">Reload packs</button>
        </div>
      </article>

      <article class="card">
        <div class="card-header">
          <div class="tile-icon">TPL</div>
          <div class="title-stack">
            <small>Templates and snippets</small>
            <strong>C/C++ starter files and reusable fragments</strong>
          </div>
        </div>
        <p class="muted">Create .c, .cpp, .h, .hpp, DLL and class starters, or insert snippets at the active cursor position.</p>
        <div class="actions">
          <button data-command="labwindowsCvi.createNewFile">Create file</button>
          <button class="secondary" data-command="labwindowsCvi.insertSnippet">Insert snippet</button>
          <button class="secondary" data-command="labwindowsCvi.manageFileTemplates">Manage templates</button>
          <button class="secondary" data-command="labwindowsCvi.manageSnippets">Manage snippets</button>
        </div>
      </article>
    </div>
  </section>

  <section class="section">
    <div class="section-heading">
      <h2>C/C++ toolchain</h2>
      <span>${escapeHtml(detectedLabel)}</span>
    </div>
    <article class="card toolchain-card">
      <div>
        <div class="card-header">
          <div class="tile-icon">CFG</div>
          <div class="title-stack">
            <small>Selected toolchain · ${sourceLabel}</small>
            <strong>${toolchainRoot}</strong>
          </div>
        </div>
        <div class="path">${compilerLine}</div>
      </div>
      <div class="actions">
        <button data-command="labwindowsCvi.configureInstallation">Detect / select toolchain</button>
        <button class="secondary" data-command="labwindowsCvi.syncCppTools">Sync IntelliSense</button>
        <button class="secondary" data-command="labwindowsCvi.diagnoseCppTools">Diagnose IntelliSense</button>
        <button class="secondary" data-command="labwindowsCvi.repairCppToolsProvider">Repair provider</button>
      </div>
    </article>
  </section>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-command]').forEach((button) => {
      button.addEventListener('click', () => vscode.postMessage({ command: button.dataset.command }));
    });
  </script>
</body>
</html>`;
}

function compactPath(value: string): string {
  const parent = path.basename(path.dirname(value));
  const base = path.basename(value);
  return parent ? `${parent}/${base}` : base;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function makeNonce(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let index = 0; index < 32; index += 1) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
