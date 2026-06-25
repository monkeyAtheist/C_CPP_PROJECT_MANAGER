import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CpmProject, CpmProjectFile, CpmWorkspaceProjectRef } from '../model/types';
import { CpmWorkspaceService } from '../services/cpmWorkspaceService';

export type CpmTreeNode = WorkspaceNode | ProjectNode | FolderNode | FileNode | PlaceholderNode;

export interface WorkspaceNode { kind: 'workspace'; }
export interface ProjectNode { kind: 'project'; ref: CpmWorkspaceProjectRef; }
export interface FolderNode { kind: 'folder'; ref: CpmWorkspaceProjectRef; project: CpmProject; folderPath: string; }
export interface FileNode { kind: 'file'; ref: CpmWorkspaceProjectRef; file: CpmProjectFile; }
export interface PlaceholderNode { kind: 'placeholder'; label: string; }

export class CpmTreeProvider implements vscode.TreeDataProvider<CpmTreeNode> {
  private readonly changeEmitter = new vscode.EventEmitter<CpmTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly workspaces: CpmWorkspaceService) {
    this.workspaces.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(element: CpmTreeNode): vscode.TreeItem {
    switch (element.kind) {
      case 'workspace': return this.workspaceItem();
      case 'project': return this.projectItem(element);
      case 'folder': return this.folderItem(element);
      case 'file': return this.fileItem(element);
      case 'placeholder': return this.placeholderItem(element);
    }
  }

  getChildren(element?: CpmTreeNode): CpmTreeNode[] {
    const workspace = this.workspaces.currentWorkspace;
    if (!workspace) {
      return [];
    }
    if (!element) {
      return [{ kind: 'workspace' }];
    }

    switch (element.kind) {
      case 'workspace':
        return workspace.projects.map((ref) => ({ kind: 'project', ref }));
      case 'project': {
        const project = this.workspaces.getProject(element.ref);
        if (!project) {
          return [{ kind: 'placeholder', label: element.ref.exists ? 'Unable to parse project' : 'Project file not found' }];
        }
        return this.childrenForFolder(element.ref, project, '');
      }
      case 'folder':
        return this.childrenForFolder(element.ref, element.project, element.folderPath);
      case 'file':
      case 'placeholder':
        return [];
    }
  }

  private childrenForFolder(ref: CpmWorkspaceProjectRef, project: CpmProject, parentFolder: string): CpmTreeNode[] {
    const directFolders = new Set<string>();
    const directFiles: FileNode[] = [];

    for (const file of project.files) {
      const folder = normalizeLogicalFolder(file.folder);
      if (folder === parentFolder) {
        directFiles.push({ kind: 'file', ref, file });
      }
      if (folder.startsWith(parentFolder ? `${parentFolder}/` : '')) {
        const remainder = parentFolder ? folder.slice(parentFolder.length + 1) : folder;
        const nextSegment = remainder.split('/')[0];
        if (nextSegment && `${parentFolder ? `${parentFolder}/` : ''}${nextSegment}` !== parentFolder) {
          directFolders.add(`${parentFolder ? `${parentFolder}/` : ''}${nextSegment}`);
        }
      }
    }

    for (const declared of project.folders) {
      const folder = normalizeLogicalFolder(declared);
      if (folder.startsWith(parentFolder ? `${parentFolder}/` : '')) {
        const remainder = parentFolder ? folder.slice(parentFolder.length + 1) : folder;
        const nextSegment = remainder.split('/')[0];
        if (nextSegment) {
          directFolders.add(`${parentFolder ? `${parentFolder}/` : ''}${nextSegment}`);
        }
      }
    }

    const folders: FolderNode[] = [...directFolders]
      .filter((folder) => folder !== parentFolder)
      .sort((a, b) => a.localeCompare(b))
      .map((folderPath) => ({ kind: 'folder', ref, project, folderPath }));

    directFiles.sort((a, b) => path.basename(a.file.absolutePath).localeCompare(path.basename(b.file.absolutePath)));
    return [...folders, ...directFiles];
  }

  private workspaceItem(): vscode.TreeItem {
    const workspace = this.workspaces.currentWorkspace!;
    const item = new vscode.TreeItem(workspace.name, vscode.TreeItemCollapsibleState.Expanded);
    item.description = path.extname(workspace.path).toLowerCase() === '.cws' ? `${workspace.projects.length} project(s)` : 'standalone project';
    item.tooltip = workspace.path;
    item.contextValue = 'cpmWorkspace';
    item.iconPath = new vscode.ThemeIcon('root-folder');
    return item;
  }

  private projectItem(node: ProjectNode): vscode.TreeItem {
    const workspace = this.workspaces.currentWorkspace!;
    const active = node.ref.index === workspace.activeProjectIndex;
    const project = this.workspaces.getProject(node.ref);
    const item = new vscode.TreeItem(node.ref.name, vscode.TreeItemCollapsibleState.Collapsed);
    item.description = `${active ? 'active · ' : ''}${project?.targetType ?? (node.ref.exists ? 'project' : 'missing')}`;
    item.tooltip = node.ref.absolutePath;
    item.contextValue = 'cpmProject';
    item.iconPath = new vscode.ThemeIcon(active ? 'star-full' : node.ref.exists ? 'project' : 'warning');
    return item;
  }

  private folderItem(node: FolderNode): vscode.TreeItem {
    const label = node.folderPath.split('/').pop() ?? node.folderPath;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
    item.contextValue = 'cpmFolder';
    item.tooltip = `Logical folder: ${node.folderPath}`;
    item.iconPath = new vscode.ThemeIcon('folder');
    return item;
  }

  private fileItem(node: FileNode): vscode.TreeItem {
    const item = new vscode.TreeItem(`└─ ${path.basename(node.file.absolutePath)}`, vscode.TreeItemCollapsibleState.None);
    item.description = statusDescription(node.file);
    item.tooltip = [
      node.file.type,
      node.file.absolutePath,
      node.file.excluded ? 'Excluded from build' : 'Included in build',
      node.file.type === 'CSource' ? `.Obj option: ${node.file.compileIntoObjectFile ? 'enabled' : 'disabled'}` : undefined
    ].filter(Boolean).join('\n');
    item.contextValue = contextValueForFile(node.file);
    item.iconPath = new vscode.ThemeIcon(iconForFile(node.file));
    item.resourceUri = vscode.Uri.file(node.file.absolutePath);
    item.command = isPanel(node.file)
      ? { command: 'cpm.openFile', title: 'Open File', arguments: [node] }
      : isFunctionPanel(node.file)
        ? { command: 'cpm.openFunctionPanel', title: 'Open Function Panel', arguments: [node] }
        : { command: 'cpm.openFile', title: 'Open File', arguments: [node] };
    return item;
  }

  private placeholderItem(node: PlaceholderNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('warning');
    return item;
  }
}

function normalizeLogicalFolder(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function isPanel(file: CpmProjectFile): boolean {
  return file.type === 'User Interface Resource' || path.extname(file.absolutePath).toLowerCase() === '.uir';
}

function isFunctionPanel(file: CpmProjectFile): boolean {
  return file.type === 'Function Panel' || path.extname(file.absolutePath).toLowerCase() === '.fp';
}

function contextValueForFile(file: CpmProjectFile): string {
  const kind = file.type === 'CSource' ? 'source'
    : isPanel(file) ? 'panel'
      : isFunctionPanel(file) ? 'functionPanel'
        : file.type === 'Include' ? 'header'
        : file.type === 'Library' ? 'library'
          : 'other';
  const build = file.excluded ? 'excluded' : 'included';
  const obj = file.type === 'CSource' ? (file.compileIntoObjectFile ? 'objOn' : 'objOff') : 'objNA';
  return `cpmFile.${kind}.${build}.${obj}`;
}

function statusDescription(file: CpmProjectFile): string | undefined {
  const parts: string[] = [];
  if (file.excluded) {
    parts.push('excluded');
  }
  if (!file.exists) {
    parts.push('missing');
  }
  if (file.type === 'CSource' && file.compileIntoObjectFile) {
    parts.push('.obj');
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function iconForFile(file: CpmProjectFile): string {
  if (!fs.existsSync(file.absolutePath)) {
    return 'warning';
  }
  switch (path.extname(file.absolutePath).toLowerCase()) {
    case '.c':
    case '.cc':
    case '.cpp':
    case '.cxx': return 'file-code';
    case '.h':
    case '.hh':
    case '.hpp':
    case '.hxx': return 'symbol-interface';
    case '.uir': return 'preview';
    case '.lib':
    case '.a': return 'library';
    case '.fp': return 'symbol-method';
    default: return 'file';
  }
}
