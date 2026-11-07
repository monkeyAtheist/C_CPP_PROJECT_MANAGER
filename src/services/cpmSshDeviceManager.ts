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
interface SshAliasRecord {
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

interface SshNeighborRecord {
  address: string;
  name?: string;
  mac?: string;
  source: string;
}

interface SshDeviceManagerData {
  configPath: string;
  aliases: SshAliasRecord[];
  hosts: SshNeighborRecord[];
  neighbors: SshNeighborRecord[];
}

let cpmSshDeviceManagerPanel: vscode.WebviewPanel | undefined;

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sshConfigPath(): string {
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

function parseSshConfigDocument(text: string): { blockIndex: number; alias: string; hostName: string; user: string; port: string; identityFile: string; identitiesOnly: string; proxyJump: string; editable: boolean }[] {
  return parseSshAliasRecords(text).map((entry) => ({ ...entry, alias: entry.host }));
}

function listSshAliases(): ReturnType<typeof parseSshConfigDocument> {
  return parseSshConfigDocument(readTextFileIfPresent(sshConfigPath()));
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

function saveSshAlias(rawForm: any, requestedBlockIndex: number): void {
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

function deleteSshAlias(blockIndex: number): void {
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

async function loadSshDeviceManagerData(): Promise<SshDeviceManagerData> {
  const configPath = sshConfigPath();
  const [neighbors] = await Promise.all([scanLocalSshNeighbors()]);
  return {
    configPath,
    aliases: parseSshAliasRecords(readTextFileIfPresent(configPath)),
    hosts: readLocalHostsRecords(),
    neighbors
  };
}

function renderSshDeviceManagerHtml(data: SshDeviceManagerData): string {
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 18px; }
  h1,h2 { margin-top: 0; }
  .toolbar { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
  button { border:1px solid var(--vscode-button-border, transparent); background:var(--vscode-button-background); color:var(--vscode-button-foreground); border-radius:5px; padding:7px 11px; cursor:pointer; }
  button.secondary { background:var(--vscode-button-secondaryBackground); color:var(--vscode-button-secondaryForeground); }
  button.danger { background:var(--vscode-inputValidation-errorBackground, #5a1d1d); }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:12px; }
  .card { border:1px solid var(--vscode-panel-border); border-radius:8px; padding:12px; background:var(--vscode-sideBar-background); }
  .meta { opacity:.78; font-size:12px; overflow-wrap:anywhere; }
  .actions { display:flex; gap:6px; flex-wrap:wrap; margin-top:9px; }
  label { display:block; margin-top:8px; font-size:12px; opacity:.9; }
  input,select { box-sizing:border-box; width:100%; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border, var(--vscode-panel-border)); padding:7px; border-radius:4px; }
  details { border:1px solid var(--vscode-panel-border); border-radius:8px; padding:10px; margin:14px 0; }
  summary { cursor:pointer; font-weight:600; }
  .readonly { opacity:.7; }
  code { font-family:var(--vscode-editor-font-family); }
</style>
</head>
<body>
<h1>OpenSSH Device Manager</h1>
<div class="meta">Config: <code>${escapeHtml(data.configPath)}</code></div>
<div class="toolbar">
  <button id="refresh">Refresh</button>
  <button id="newAlias">New alias</button>
  <button id="generateKey" class="secondary">Generate Ed25519 key</button>
  <button id="enrollKey" class="secondary">Install public key</button>
</div>

<details id="editor">
  <summary>Alias editor</summary>
  <input id="blockIndex" type="hidden" value="-1" />
  <div class="grid">
    <div><label>Host alias</label><input id="host" placeholder="lab-pc" /></div>
    <div><label>HostName / IP</label><input id="hostName" placeholder="192.168.1.50" /></div>
    <div><label>User</label><input id="user" placeholder="operator" /></div>
    <div><label>Port</label><input id="port" placeholder="22" /></div>
    <div><label>IdentityFile</label><input id="identityFile" placeholder="~/.ssh/id_ed25519" /><button id="pickIdentity" class="secondary" style="margin-top:5px">Browse…</button></div>
    <div><label>IdentitiesOnly</label><select id="identitiesOnly"><option value=""></option><option value="yes">yes</option><option value="no">no</option></select></div>
    <div><label>ProxyJump</label><input id="proxyJump" placeholder="jump-host" /></div>
  </div>
  <div class="actions"><button id="saveAlias">Save alias</button><button id="clearEditor" class="secondary">Clear</button></div>
</details>

<h2>OpenSSH aliases</h2>
<div class="grid" id="aliases"></div>

<h2 style="margin-top:18px">Local resolver aliases</h2>
<div class="grid" id="hosts"></div>

<h2 style="margin-top:18px">Known local neighbours</h2>
<div class="grid" id="neighbors"></div>

<script>
const vscode = acquireVsCodeApi();
const data = ${payload};
const byId = id => document.getElementById(id);
function formValue(){ return {host:byId('host').value,hostName:byId('hostName').value,user:byId('user').value,port:byId('port').value,identityFile:byId('identityFile').value,identitiesOnly:byId('identitiesOnly').value,proxyJump:byId('proxyJump').value}; }
function clearEditor(){ byId('blockIndex').value='-1'; ['host','hostName','user','port','identityFile','proxyJump'].forEach(id=>byId(id).value=''); byId('identitiesOnly').value=''; byId('editor').open=true; }
function editAlias(a){ byId('blockIndex').value=String(a.blockIndex); ['host','hostName','user','port','identityFile','identitiesOnly','proxyJump'].forEach(id=>byId(id).value=a[id]||''); byId('editor').open=true; byId('host').focus(); }
function card(title,lines,actions){ const d=document.createElement('div'); d.className='card'; const h=document.createElement('strong'); h.textContent=title; d.appendChild(h); lines.forEach(line=>{const m=document.createElement('div');m.className='meta';m.textContent=line;d.appendChild(m);}); if(actions?.length){const a=document.createElement('div');a.className='actions';actions.forEach(spec=>{const b=document.createElement('button');b.textContent=spec[0];b.className=spec[2]||'secondary';b.onclick=spec[1];a.appendChild(b);});d.appendChild(a);} return d; }
for(const a of data.aliases){ const actions=[[ 'Connect',()=>vscode.postMessage({type:'connect',target:a.host}) ],['Inspect',()=>vscode.postMessage({type:'inspect',target:a.host})],['Test key',()=>vscode.postMessage({type:'testKey',target:a.host})]]; if(a.editable){actions.push(['Edit',()=>editAlias(a),'secondary']);actions.push(['Delete',()=>vscode.postMessage({type:'deleteAlias',blockIndex:a.blockIndex,host:a.host}),'danger']);} byId('aliases').appendChild(card(a.host,[a.hostName||'(HostName inherited)',a.user?('User '+a.user):'',a.port?('Port '+a.port):'',a.identityFile?('Identity '+a.identityFile):'',a.editable?'':'Wildcard/multi-host block: read only'].filter(Boolean),actions)); }
if(!data.aliases.length) byId('aliases').appendChild(card('No explicit aliases',['Use New alias to create ~/.ssh/config entries.'],[]));
for(const h of data.hosts){ byId('hosts').appendChild(card(h.name||h.address,[h.address,h.source],[[ 'Connect',()=>vscode.postMessage({type:'connect',target:h.name||h.address}) ]])); }
if(!data.hosts.length) byId('hosts').appendChild(card('No custom hosts entries',['No non-localhost aliases found.'],[]));
for(const n of data.neighbors){ byId('neighbors').appendChild(card(n.address,[n.mac||'',n.source].filter(Boolean),[[ 'Connect',()=>vscode.postMessage({type:'connect',target:n.address}) ]])); }
if(!data.neighbors.length) byId('neighbors').appendChild(card('No neighbours discovered',['ARP/neighbour cache is currently empty or unavailable.'],[]));
byId('refresh').onclick=()=>vscode.postMessage({type:'refresh'});
byId('newAlias').onclick=clearEditor;
byId('clearEditor').onclick=clearEditor;
byId('saveAlias').onclick=()=>vscode.postMessage({type:'saveAlias',form:formValue(),blockIndex:Number(byId('blockIndex').value)});
byId('pickIdentity').onclick=()=>vscode.postMessage({type:'pickIdentity'});
byId('generateKey').onclick=()=>vscode.postMessage({type:'generateKey'});
byId('enrollKey').onclick=()=>vscode.postMessage({type:'enrollKey'});
window.addEventListener('message',event=>{ if(event.data?.type==='identitySelected') byId('identityFile').value=event.data.path||''; });
</script>
</body>
</html>`;
}

function quoteTerminalArg(value: string): string {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function validateSshTerminalTarget(target: string): string {
  const value = String(target || '').trim();
  if (!value || !/^[A-Za-z0-9._:@%+\-\[\]]+$/.test(value)) {
    throw new Error('Unsafe or invalid SSH target.');
  }
  return value;
}

function sendSshTerminalCommand(command: string): void {
  let terminal = vscode.window.terminals.find((entry) => entry.name === 'CPM SSH');
  if (!terminal) terminal = vscode.window.createTerminal({ name: 'CPM SSH' });
  terminal.show(true);
  terminal.sendText(command, true);
}

export async function openSshDeviceManager(context: vscode.ExtensionContext): Promise<void> {
  if (cpmSshDeviceManagerPanel) {
    cpmSshDeviceManagerPanel.reveal(vscode.ViewColumn.Active, false);
  } else {
    cpmSshDeviceManagerPanel = vscode.window.createWebviewPanel('cpmSshDeviceManager', 'CPM: OpenSSH Device Manager', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
    cpmSshDeviceManagerPanel.onDidDispose(() => { cpmSshDeviceManagerPanel = undefined; }, null, context.subscriptions);
    cpmSshDeviceManagerPanel.webview.onDidReceiveMessage(async (message) => {
      if (!cpmSshDeviceManagerPanel) return;
      try {
        if (message?.type === 'refresh') {
          cpmSshDeviceManagerPanel.webview.html = renderSshDeviceManagerHtml(await loadSshDeviceManagerData());
          return;
        }
        if (message?.type === 'saveAlias') {
          saveSshAlias(message.form, Number(message.blockIndex));
          void vscode.window.showInformationMessage(`SSH alias ${String(message.form?.host || '')} saved.`);
          cpmSshDeviceManagerPanel.webview.html = renderSshDeviceManagerHtml(await loadSshDeviceManagerData());
          return;
        }
        if (message?.type === 'deleteAlias') {
          const host = String(message.host || 'alias');
          const answer = await vscode.window.showWarningMessage(`Delete SSH alias ${host}?`, { modal: true }, 'Delete');
          if (answer === 'Delete') {
            deleteSshAlias(Number(message.blockIndex));
            cpmSshDeviceManagerPanel.webview.html = renderSshDeviceManagerHtml(await loadSshDeviceManagerData());
          }
          return;
        }
        if (message?.type === 'connect') {
          const target = validateSshTerminalTarget(message.target);
          sendSshTerminalCommand(`ssh ${target}`);
          return;
        }
        if (message?.type === 'inspect') {
          const target = validateSshTerminalTarget(message.target);
          sendSshTerminalCommand(`ssh -G ${target}`);
          return;
        }
        if (message?.type === 'testKey') {
          const target = validateSshTerminalTarget(message.target);
          sendSshTerminalCommand(`ssh -o BatchMode=yes -o ConnectTimeout=5 ${target} exit`);
          return;
        }
        if (message?.type === 'pickIdentity') {
          const selected = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, openLabel: 'Use identity file', defaultUri: vscode.Uri.file(path.join(os.homedir(), '.ssh')) });
          if (selected?.[0]) void cpmSshDeviceManagerPanel.webview.postMessage({ type: 'identitySelected', path: selected[0].fsPath });
          return;
        }
        if (message?.type === 'generateKey') {
          const uri = await vscode.window.showSaveDialog({ title: 'Choose private-key path', defaultUri: vscode.Uri.file(path.join(os.homedir(), '.ssh', 'id_ed25519')), saveLabel: 'Generate here' });
          if (uri) sendSshTerminalCommand(`ssh-keygen -t ed25519 -f ${quoteTerminalArg(uri.fsPath)}`);
          return;
        }
        if (message?.type === 'enrollKey') {
          const aliases = parseSshAliasRecords(readTextFileIfPresent(sshConfigPath())).filter((entry) => entry.editable);
          const target = await vscode.window.showQuickPick(aliases.map((entry) => ({ label: entry.host, description: entry.hostName })), { title: 'Install public key on which SSH alias?' });
          if (!target) return;
          const selected = await vscode.window.showOpenDialog({ title: 'Select the public key to install', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'OpenSSH public keys': ['pub'], 'All files': ['*'] }, defaultUri: vscode.Uri.file(path.join(os.homedir(), '.ssh')) });
          if (!selected?.[0]) return;
          const alias = validateSshTerminalTarget(target.label);
          const publicKeyPath = quoteTerminalArg(selected[0].fsPath);
          const remote = 'umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys; cat >> ~/.ssh/authorized_keys';
          const command = process.platform === 'win32'
            ? `type ${publicKeyPath} | ssh ${alias} ${quoteTerminalArg(remote)}`
            : `cat ${publicKeyPath} | ssh ${alias} ${quoteTerminalArg(remote)}`;
          const answer = await vscode.window.showWarningMessage(`Append ${path.basename(selected[0].fsPath)} to ${alias}:~/.ssh/authorized_keys? Only the public key will be sent.`, { modal: true }, 'Install key');
          if (answer === 'Install key') sendSshTerminalCommand(command);
          return;
        }
      } catch (error) {
        void vscode.window.showErrorMessage(`CPM SSH Device Manager: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, undefined, context.subscriptions);
  }
  if (cpmSshDeviceManagerPanel) cpmSshDeviceManagerPanel.webview.html = renderSshDeviceManagerHtml(await loadSshDeviceManagerData());
}

