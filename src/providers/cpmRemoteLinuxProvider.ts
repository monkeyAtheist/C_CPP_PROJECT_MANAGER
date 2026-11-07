import * as vscode from 'vscode';
import { CpmRemoteLinuxService, CpmRemoteLinuxStatus } from '../services/cpmRemoteLinuxService';

interface RemoteNode {
  id: string;
  label: string;
  description?: string;
  detail?: string;
  icon: string;
  command?: string;
}

export class CpmRemoteLinuxProvider implements vscode.TreeDataProvider<RemoteNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<RemoteNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposable: vscode.Disposable;
  private view?: vscode.TreeView<RemoteNode>;

  constructor(private readonly remote: CpmRemoteLinuxService) {
    this.disposable = remote.onDidChange(() => this.refresh());
  }

  attachView(view: vscode.TreeView<RemoteNode>): void { this.view = view; this.updateDescription(); }
  refresh(): void { this.updateDescription(); this.emitter.fire(); }
  dispose(): void { this.disposable.dispose(); this.emitter.dispose(); }

  getTreeItem(element: RemoteNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.id = element.id;
    item.description = element.description;
    item.tooltip = element.detail ?? [element.label, element.description].filter(Boolean).join(' — ');
    item.iconPath = new vscode.ThemeIcon(element.icon);
    item.contextValue = element.command ? 'cpmRemote.action' : 'cpmRemote.info';
    if (element.command) item.command = { command: element.command, title: element.label };
    return item;
  }

  getChildren(): RemoteNode[] {
    const status = this.remote.status;
    if (!status) return [{ id: 'none', label: 'No active C/C++ project', description: 'Open or select a project', icon: 'info' }];
    return nodes(status);
  }

  private updateDescription(): void {
    if (!this.view) return;
    const status = this.remote.status;
    this.view.description = status ? (status.enabled ? status.state : 'disabled') : undefined;
  }
}

function nodes(status: CpmRemoteLinuxStatus): RemoteNode[] {
  const stateIcon = status.state === 'ready' ? 'pass-filled' : status.state === 'error' ? 'error' : status.state === 'warning' ? 'warning' : 'circle-slash';
  const base: RemoteNode[] = [
    { id: 'project', label: status.projectName, description: status.enabled ? 'Remote Linux enabled' : 'Remote Linux disabled', icon: 'remote' },
    { id: 'state', label: 'State', description: status.state, detail: status.message, icon: stateIcon },
    { id: 'endpoint', label: 'SSH endpoint', description: status.destination || 'not configured', icon: 'vm-connect' },
    { id: 'projectDir', label: 'Remote project', description: status.remoteProjectDirectory, icon: 'folder' },
    { id: 'target', label: 'Remote target', description: status.remoteTargetPath, icon: 'file-binary' },
    { id: 'configure', label: 'Configure Remote Linux', description: 'SSH, remote build, run and gdbserver', icon: 'settings-gear', command: 'cpm.remote.configure' },
    { id: 'manager', label: 'OpenSSH Device Manager', description: '~/.ssh/config, keys and aliases', icon: 'server-environment', command: 'cpm.openSshDeviceManager' },
    { id: 'test', label: 'Test SSH connection', description: status.destination || 'Configure an endpoint first', icon: 'debug-disconnect', command: 'cpm.remote.testConnection' },
    { id: 'terminal', label: 'Open SSH terminal', description: status.destination || 'Remote shell', icon: 'terminal', command: 'cpm.remote.openTerminal' },
    { id: 'sync', label: 'Synchronize project', description: 'rsync preferred, scp fallback', icon: 'sync', command: 'cpm.remote.sync' },
    { id: 'build', label: 'Build on Remote Linux', description: status.buildMode, icon: 'tools', command: 'cpm.remote.build' },
    { id: 'run', label: 'Build & Run on Remote Linux', description: 'Streams stdout/stderr using CPM run-output mode', icon: 'play', command: 'cpm.remote.buildRun' },
    { id: 'debug', label: 'Build & Debug with gdbserver', description: 'cppdbg over SSH pipe transport', icon: 'debug-alt-small', command: 'cpm.remote.debug' },
    { id: 'report', label: 'Open Remote Linux report', description: 'Resolved tools, paths and workflow', icon: 'preview', command: 'cpm.remote.openReport' }
  ];
  return base;
}
