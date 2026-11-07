import * as vscode from 'vscode';
import { CpmDependencyService, CpmDependencyStatus } from '../services/cpmDependencyService';

interface DependencyNode { id: string; label: string; description?: string; icon: string; command?: string; tooltip?: string; }

export class CpmDependencyProvider implements vscode.TreeDataProvider<DependencyNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly dependencies: CpmDependencyService) {
    this.disposables.push(dependencies.onDidChange(() => this.emitter.fire()));
  }

  attachView(view: vscode.TreeView<DependencyNode>): void {
    this.disposables.push(view.onDidChangeVisibility((event) => { if (event.visible) void this.dependencies.refresh(); }));
    if (view.visible) void this.dependencies.refresh();
  }

  dispose(): void { for (const disposable of this.disposables) disposable.dispose(); this.emitter.dispose(); }
  refresh(): void { this.emitter.fire(); }

  getTreeItem(node: DependencyNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label);
    item.id = node.id;
    item.description = node.description;
    item.tooltip = node.tooltip ?? [node.label, node.description].filter(Boolean).join(' — ');
    item.iconPath = new vscode.ThemeIcon(node.icon);
    if (node.command) item.command = { command: node.command, title: node.label };
    return item;
  }

  getChildren(): DependencyNode[] {
    if (!this.dependencies.activeProjectRef) return [{ id: 'none', label: 'No active C/C++ project', description: 'Open or select a project', icon: 'info' }];
    const status = this.dependencies.status;
    if (!status) {
      void this.dependencies.refresh();
      return [{ id: 'loading', label: 'Inspecting dependency managers…', icon: 'sync~spin' }];
    }
    return nodes(status);
  }
}

function nodes(status: CpmDependencyStatus): DependencyNode[] {
  const icon = status.state === 'ready' ? 'pass-filled' : status.state === 'disabled' ? 'circle-slash' : status.state === 'error' ? 'error' : 'warning';
  return [
    { id: 'project', label: status.projectName, description: `${status.configuredPackages} package declaration(s)`, icon: 'package', tooltip: status.projectPath },
    { id: 'state', label: 'State', description: status.state, icon, tooltip: status.message },
    { id: 'managers', label: 'Managers', description: status.managers.join(' + ') || 'none', icon: 'extensions' },
    { id: 'vcpkg', label: 'vcpkg', description: status.vcpkgPath || 'not found', icon: status.vcpkgPath ? 'pass' : 'warning' },
    { id: 'conan', label: 'Conan 2', description: status.conanPath || 'not found', icon: status.conanPath ? 'pass' : 'warning' },
    { id: 'pkg', label: 'pkg-config', description: status.pkgConfigPath || 'not found', icon: status.pkgConfigPath ? 'pass' : 'warning' },
    { id: 'configure', label: 'Configure dependency managers', description: 'Enable vcpkg, Conan 2 or pkg-config', icon: 'settings-gear', command: 'cpm.dependencies.configure' },
    { id: 'settings', label: 'Open dependency settings', description: 'Edit packages, triplets, profiles and search paths', icon: 'settings', command: 'cpm.editBuildSettings' },
    { id: 'detect', label: 'Detect dependency tools', description: 'Refresh executable readiness', icon: 'search', command: 'cpm.dependencies.detectTools' },
    { id: 'generate', label: 'Generate dependency manifests', description: 'vcpkg.json, conanfile.txt and integration metadata', icon: 'file-code', command: 'cpm.dependencies.generateManifests' },
    { id: 'install', label: 'Install / synchronize dependencies', description: 'Run enabled package managers', icon: 'cloud-download', command: 'cpm.dependencies.install' },
    { id: 'report', label: 'Open dependency report', description: status.lastSync ? `Last sync ${status.lastSync}` : 'No integration generated yet', icon: 'preview', command: 'cpm.dependencies.openReport' },
    { id: 'reveal', label: 'Reveal dependency output', description: status.outputDirectory, icon: 'folder-opened', command: 'cpm.dependencies.revealOutput' },
    { id: 'clean', label: 'Clean dependency output', description: 'Remove generated integration and package-manager output', icon: 'trash', command: 'cpm.dependencies.clean' }
  ];
}
