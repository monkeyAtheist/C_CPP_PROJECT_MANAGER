import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * OpenSSH device/alias manager ported from JC Lib.
 *
 * CPM keeps this manager independent from project build settings so it can be used
 * to prepare Raspberry Pi / Linux targets before a project-specific Remote Linux
 * configuration exists. The manager edits only the current user's ~/.ssh/config
 * and never stores private-key material in CPM global storage.
 */
export interface SshAliasRecord {
  blockIndex: number;
  host: string;
  hostName: string;
  user: string;
  port: string;
  identityFile: string;
  identitiesOnly: string;
  proxyJump: string;
  editable: boolean;
}

export interface SshNeighborRecord {
  address: string;
  name?: string;
  mac?: string;
  source: string;
}

export interface SshDeviceManagerData {
  configPath: string;
  aliases: SshAliasRecord[];
  hosts: SshNeighborRecord[];
  neighbors: SshNeighborRecord[];
}

export function sshConfigPath(): string {
  return path.join(os.homedir(), '.ssh', 'config');
}

function ensureUserSshConfigFile(): string {
  const filePath = sshConfigPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  return filePath;
}

function readTextFileIfPresent(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function locateSshHostBlocks(text: string): { blockIndex: number; start: number; end: number; patterns: string[]; lines: string[] }[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const starts: { start: number; patterns: string[] }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s*Host\s+(.+?)\s*$/i);
    if (match) {
      starts.push({ start: i, patterns: match[1].trim().split(/\s+/).filter(Boolean) });
    }
  }
  return starts.map((entry, blockIndex) => {
    const end = blockIndex + 1 < starts.length ? starts[blockIndex + 1].start : lines.length;
    return { blockIndex, start: entry.start, end, patterns: entry.patterns, lines: lines.slice(entry.start, end) };
  });
}

function parseSshAliasRecords(text: string): SshAliasRecord[] {
  return locateSshHostBlocks(text).map((block) => {
    const values: Record<string, string> = {};
    for (const line of block.lines.slice(1)) {
      const match = line.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s+(.+?)\s*$/);
      if (match && values[match[1].toLowerCase()] === undefined) {
        values[match[1].toLowerCase()] = match[2].trim();
      }
    }
    const editable = block.patterns.length === 1 && !/[!*?]/.test(block.patterns[0]);
    return {
      blockIndex: block.blockIndex,
      host: block.patterns.join(' '),
      hostName: values.hostname || '',
      user: values.user || '',
      port: values.port || '',
      identityFile: values.identityfile || '',
      identitiesOnly: values.identitiesonly || '',
      proxyJump: values.proxyjump || '',
      editable
    };
  });
}

function normalizeSshForm(rawForm: any): { host: string; hostName: string; user: string; port: string; identityFile: string; identitiesOnly: string; proxyJump: string } {
  const value = (name: string) => String(rawForm?.[name] ?? '').trim();
  const host = String(rawForm?.host ?? rawForm?.alias ?? '').trim();
  if (!host || !/^[A-Za-z0-9._-]+$/.test(host)) {
    throw new Error('Host alias must contain only letters, digits, dot, underscore, or dash.');
  }
  const port = value('port');
  if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) {
    throw new Error('Port must be an integer between 1 and 65535.');
  }
  const rawIdentitiesOnly = rawForm?.identitiesOnly;
  const identitiesOnly = typeof rawIdentitiesOnly === 'boolean' ? (rawIdentitiesOnly ? 'yes' : 'no') : String(rawIdentitiesOnly ?? '').trim();
  if (identitiesOnly && !/^(yes|no)$/i.test(identitiesOnly)) {
    throw new Error('IdentitiesOnly must be yes, no, or empty.');
  }
  return {
    host,
    hostName: value('hostName'),
    user: value('user'),
    port,
    identityFile: value('identityFile'),
    identitiesOnly,
    proxyJump: value('proxyJump')
  };
}

function renderSshAliasBlock(form: ReturnType<typeof normalizeSshForm>): string[] {
  const lines = [`Host ${form.host}`];
  const add = (key: string, value: string) => { if (value) lines.push(`    ${key} ${value}`); };
  add('HostName', form.hostName);
  add('User', form.user);
  add('Port', form.port);
  add('IdentityFile', form.identityFile);
  add('IdentitiesOnly', form.identitiesOnly);
  add('ProxyJump', form.proxyJump);
  return lines;
}

export function saveSshAlias(rawForm: any, requestedBlockIndex: number): void {
  const form = normalizeSshForm(rawForm);
  const filePath = ensureUserSshConfigFile();
  const original = readTextFileIfPresent(filePath).replace(/\r\n/g, '\n');
  const lines = original ? original.split('\n') : [];
  const blocks = locateSshHostBlocks(original);
  const newBlock = renderSshAliasBlock(form);

  let target = Number.isInteger(requestedBlockIndex) && requestedBlockIndex >= 0
    ? blocks.find((block) => block.blockIndex === requestedBlockIndex)
    : undefined;
  if (!target) {
    target = blocks.find((block) => block.patterns.length === 1 && block.patterns[0].toLowerCase() === form.host.toLowerCase());
  }

  if (target) {
    if (target.patterns.length !== 1 || /[!*?]/.test(target.patterns[0])) {
      throw new Error('Wildcard or multi-host blocks are read-only in the visual manager. Edit ~/.ssh/config directly for this block.');
    }
    lines.splice(target.start, target.end - target.start, ...newBlock);
  } else {
    const wildcard = blocks.find((block) => block.patterns.some((pattern) => /[!*?]/.test(pattern)));
    const insertAt = wildcard ? wildcard.start : lines.length;
    const prefix = insertAt > 0 && lines[insertAt - 1]?.trim() ? [''] : [];
    const suffix = insertAt < lines.length && lines[insertAt]?.trim() ? [''] : [];
    lines.splice(insertAt, 0, ...prefix, ...newBlock, ...suffix);
  }
  const output = lines.join(os.EOL).replace(/(?:\r?\n)*$/, os.EOL);
  fs.writeFileSync(filePath, output, 'utf8');
}

export function deleteSshAlias(blockIndex: number): void {
  const filePath = sshConfigPath();
  const original = readTextFileIfPresent(filePath).replace(/\r\n/g, '\n');
  const lines = original.split('\n');
  const block = locateSshHostBlocks(original).find((entry) => entry.blockIndex === blockIndex);
  if (!block) throw new Error('SSH alias block not found.');
  if (block.patterns.length !== 1 || /[!*?]/.test(block.patterns[0])) {
    throw new Error('Wildcard or multi-host blocks are read-only in the visual manager.');
  }
  lines.splice(block.start, block.end - block.start);
  while (lines.length && !lines[0].trim()) lines.shift();
  const output = lines.join(os.EOL).replace(/(?:\r?\n)*$/, os.EOL);
  fs.writeFileSync(filePath, output, 'utf8');
}

function execFileCapture(file: string, args: string[]): Promise<string> {
  const childProcess = require('child_process') as typeof import('child_process');
  return new Promise((resolve) => {
    childProcess.execFile(file, args, { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (_error, stdout) => {
      resolve(String(stdout || ''));
    });
  });
}

async function scanLocalSshNeighbors(): Promise<SshNeighborRecord[]> {
  const results: SshNeighborRecord[] = [];
  const seen = new Set<string>();
  const add = (entry: SshNeighborRecord) => {
    if (!entry.address || seen.has(entry.address)) return;
    seen.add(entry.address);
    results.push(entry);
  };

  if (process.platform === 'win32') {
    const output = await execFileCapture('arp.exe', ['-a']);
    for (const line of output.split(/\r?\n/)) {
      const match = line.match(/^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f-]{11,17})\s+/i);
      if (match) add({ address: match[1], mac: match[2], source: 'arp -a' });
    }
  } else {
    let output = await execFileCapture('ip', ['neigh', 'show']);
    if (!output.trim()) output = await execFileCapture('arp', ['-an']);
    for (const line of output.split(/\r?\n/)) {
      let match = line.match(/^([^\s]+)\s+.*?lladdr\s+([0-9a-f:]{11,17})/i);
      if (match) {
        add({ address: match[1], mac: match[2], source: 'ip neigh' });
        continue;
      }
      match = line.match(/\(([^)]+)\)\s+at\s+([0-9a-f:]{11,17})/i);
      if (match) add({ address: match[1], mac: match[2], source: 'arp -an' });
    }
  }
  return results;
}

function readLocalHostsRecords(): SshNeighborRecord[] {
  const hostsPath = process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
    : '/etc/hosts';
  const text = readTextFileIfPresent(hostsPath);
  const out: SshNeighborRecord[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const address = parts.shift() || '';
    for (const name of parts) {
      if (name && name.toLowerCase() !== 'localhost') out.push({ address, name, source: 'hosts' });
    }
  }
  return out;
}

export function listEditableSshAliases(): SshAliasRecord[] {
  return parseSshAliasRecords(readTextFileIfPresent(sshConfigPath())).filter((entry) => entry.editable);
}

export async function loadSshDeviceManagerData(): Promise<SshDeviceManagerData> {
  const configPath = sshConfigPath();
  const [neighbors] = await Promise.all([scanLocalSshNeighbors()]);
  return {
    configPath,
    aliases: parseSshAliasRecords(readTextFileIfPresent(configPath)),
    hosts: readLocalHostsRecords(),
    neighbors
  };
}

export function quoteTerminalArg(value: string): string {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

export function validateSshTerminalTarget(target: string): string {
  const value = String(target || '').trim();
  if (!value || !/^[A-Za-z0-9._:@%+\-\[\]]+$/.test(value)) {
    throw new Error('Unsafe or invalid SSH target.');
  }
  return value;
}

export function sendSshTerminalCommand(command: string): void {
  let terminal = vscode.window.terminals.find((entry) => entry.name === 'CPM SSH');
  if (!terminal) terminal = vscode.window.createTerminal({ name: 'CPM SSH' });
  terminal.show(true);
  terminal.sendText(command, true);
}
