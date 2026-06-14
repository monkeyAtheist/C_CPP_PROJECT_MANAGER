import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface PackIdentity {
  id?: string;
  name?: string;
  version?: string;
}

function readPackIdentity(filePath: string): PackIdentity | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PackIdentity;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeVersion(version: string | undefined): string {
  return String(version || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '_');
}

function createBackupPath(targetDirectory: string, fileName: string, previousVersion: string | undefined): string {
  const backupDirectory = path.join(targetDirectory, 'backups');
  fs.mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = sanitizeVersion(previousVersion);
  return path.join(backupDirectory, `${fileName}.backup-${suffix}-${timestamp}.json`);
}

function isBundledLegacyCviPack(identity: PackIdentity | undefined, rawContent = ''): boolean {
  const id = String(identity?.id || '').toLowerCase();
  const name = String(identity?.name || '').toLowerCase();
  const haystack = `${id} ${name} ${rawContent.slice(0, 250000).toLowerCase()}`;
  return id === 'cvi-structured-pack'
    || name.includes('labwindows/cvi')
    || /\b(labwindows|cvi|cvifunc|cvicallback|messagepopup|loadpanel|setctrlval|getctrlval|installctrlcallback)\b/i.test(haystack);
}

function quarantineLegacyCviPackIfNeeded(targetDirectory: string, output: vscode.OutputChannel): void {
  const legacyNames = fs.existsSync(targetDirectory)
    ? fs.readdirSync(targetDirectory).filter((entry) => entry.toLowerCase().endsWith('.json'))
    : [];

  for (const legacyName of legacyNames) {
    if (legacyName.toLowerCase() === 'cpm_core_pack.json') {
      continue;
    }
    const legacyPath = path.join(targetDirectory, legacyName);
    let raw = '';
    try {
      raw = fs.readFileSync(legacyPath, 'utf8');
    } catch {
      raw = '';
    }
    const identity = readPackIdentity(legacyPath);
    if (!isBundledLegacyCviPack(identity, raw)) {
      continue;
    }
    const backup = createBackupPath(targetDirectory, legacyName.replace(/\.json$/i, ''), identity?.version);
    fs.renameSync(legacyPath, backup);
    output.appendLine(`[C/C++ Libraries] Disabled legacy CVI library pack. Backup: ${backup}`);
  }
}

/**
 * Seed or upgrade the writable C/C++ core library pack used by the embedded explorer.
 *
 * Earlier CVI-derived builds seeded cvi_pack.json into global storage. That pack is
 * now quarantined when it is the bundled LabWindows/CVI pack, otherwise it would keep
 * polluting the C/C++ Libraries view with CVI-only APIs.
 */
export function ensureBundledCppLibraryPack(context: vscode.ExtensionContext, output: vscode.OutputChannel): void {
  const source = vscode.Uri.joinPath(context.extensionUri, 'data', 'cpm_core_pack.json').fsPath;
  const targetDirectory = path.join(context.globalStorageUri.fsPath, 'packs');
  const target = path.join(targetDirectory, 'cpm_core_pack.json');

  if (!fs.existsSync(source)) {
    output.appendLine(`[C/C++ Libraries] Bundled core pack not found: ${source}`);
    return;
  }

  fs.mkdirSync(targetDirectory, { recursive: true });
  quarantineLegacyCviPackIfNeeded(targetDirectory, output);

  if (!fs.existsSync(target)) {
    fs.copyFileSync(source, target);
    output.appendLine(`[C/C++ Libraries] Seeded C/C++ core library pack: ${target}`);
    return;
  }

  const bundled = readPackIdentity(source);
  const installed = readPackIdentity(target);
  const bundledVersion = String(bundled?.version || '');
  const installedVersion = String(installed?.version || '');
  const samePack = !installed?.id || !bundled?.id || installed.id === bundled.id;

  if (samePack && bundledVersion && bundledVersion !== installedVersion) {
    const backup = createBackupPath(targetDirectory, 'cpm_core_pack', installedVersion);
    fs.copyFileSync(target, backup);
    fs.copyFileSync(source, target);
    output.appendLine(`[C/C++ Libraries] Upgraded C/C++ core library pack ${installedVersion || 'unknown'} -> ${bundledVersion}.`);
    output.appendLine(`[C/C++ Libraries] Previous writable pack backed up to: ${backup}`);
    return;
  }

  if (!samePack) {
    const backup = createBackupPath(targetDirectory, 'cpm_core_pack-different-id', installedVersion);
    fs.copyFileSync(target, backup);
    fs.copyFileSync(source, target);
    output.appendLine(`[C/C++ Libraries] Replaced incompatible core pack id with bundled C/C++ core pack. Backup: ${backup}`);
  }
}

// Backward-compatible exported name for older imports inside the extension.
export const ensureBundledCviLibraryPack = ensureBundledCppLibraryPack;
