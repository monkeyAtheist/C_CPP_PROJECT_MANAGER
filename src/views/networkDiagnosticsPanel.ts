import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CpmInstrumentService, FrameEncoding, LineEnding } from '../services/cpmInstrumentService';
import { CpmProjectSettingsService } from '../services/cpmProjectSettingsService';
import { CpmWorkspaceService } from '../services/cpmWorkspaceService';
import {
  deleteSshAlias,
  listEditableSshAliases,
  loadSshDeviceManagerData,
  quoteTerminalArg,
  saveSshAlias,
  sendSshTerminalCommand,
  SshAliasRecord,
  SshDeviceManagerData,
  validateSshTerminalTarget
} from '../services/cpmSshDeviceManager';
import {
  CpmNetworkDiagnosticsService,
  NetworkDiscoveryResult,
  NetworkSessionEvent,
  NetworkSessionState,
  NetworkTransport,
  TcpCommunicationSettings,
  TcpServerSettings,
  UdpCommunicationSettings,
  WirelessDiscoveryResult,
  ServiceDiscoveryResult,
  BleGattInspectionResult,
  BleGattValueResult
} from '../services/cpmNetworkDiagnosticsService';
import { CpmDeviceEndpoint, CpmDeviceEndpointKind, CpmDeviceProfile, CpmDeviceRegistry, pickOrCreateDevice } from '../services/cpmDeviceRegistry';

interface NetworkPanelState {
  transport: NetworkTransport;
  tcp: TcpCommunicationSettings;
  udp: UdpCommunicationSettings;
  tcpServer: TcpServerSettings;
  frameMode: 'text' | 'hex';
  frameEncoding: FrameEncoding;
  lineEnding: LineEnding;
  frameText: string;
  diagnosticHost: string;
  diagnosticPort: number;
  diagnosticTimeoutMs: number;
  wirelessScanDurationMs: number;
}

export type NetworkDiagnosticsPage = 'network' | 'terminal' | 'wireless' | 'ssh' | 'devices';

const STATE_KEY = 'cpm.networkDiagnostics.settings.v1';
const DEFAULT_STATE: NetworkPanelState = {
  transport: 'tcp',
  tcp: { host: '127.0.0.1', port: 5025, connectTimeoutMs: 2500, encoding: 'ascii', lineEnding: 'lf' },
  udp: { host: '127.0.0.1', remotePort: 5000, localPort: 0, encoding: 'ascii', lineEnding: 'none' },
  tcpServer: { bindAddress: '0.0.0.0', port: 5000, encoding: 'ascii', lineEnding: 'none' },
  frameMode: 'text',
  frameEncoding: 'ascii',
  lineEnding: 'lf',
  frameText: '',
  diagnosticHost: '127.0.0.1',
  diagnosticPort: 80,
  diagnosticTimeoutMs: 2000,
  wirelessScanDurationMs: 5000
};

export class NetworkDiagnosticsPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private state: NetworkPanelState;
  private networkDiscovery: NetworkDiscoveryResult = { adapters: [], neighbors: [], warnings: [] };
  private wirelessDiscovery: WirelessDiscoveryResult = { wifi: [], ble: [], bluetooth: [], warnings: [] };
  private serviceDiscovery: ServiceDiscoveryResult = { mdns: [], ssdp: [], warnings: [] };
  private bleGattInspection?: BleGattInspectionResult;
  private wirelessContinuous = false;
  private wirelessLoopGeneration = 0;
  private sshData: SshDeviceManagerData = { configPath: '', aliases: [], hosts: [], neighbors: [] };
  private deviceProfiles: CpmDeviceProfile[] = [];
  private requestedPage: NetworkDiagnosticsPage = 'network';
  private readonly sessionSubscription: vscode.Disposable;
  private readonly deviceSubscription: vscode.Disposable;
  private disposed = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly network: CpmNetworkDiagnosticsService,
    private readonly instruments: CpmInstrumentService,
    private readonly output: vscode.OutputChannel,
    private readonly workspaces: CpmWorkspaceService,
    private readonly projectSettings: CpmProjectSettingsService,
    private readonly deviceRegistry: CpmDeviceRegistry
  ) {
    this.state = normalizeState(context.globalState.get<Partial<NetworkPanelState>>(STATE_KEY));
    this.deviceProfiles = deviceRegistry.list();
    this.sessionSubscription = network.onDidSessionEvent((event) => void this.forwardSessionEvent(event));
    this.deviceSubscription = deviceRegistry.onDidChange((devices) => { this.deviceProfiles = devices.map((device) => ({ ...device, tags: [...device.tags], endpoints: { ...device.endpoints } })); void this.panel?.webview.postMessage({ type: 'deviceProfiles', devices: this.deviceProfiles }); });
  }

  show(page: NetworkDiagnosticsPage = 'network'): void {
    if (this.disposed) return;
    this.requestedPage = page;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'cpm.networkDiagnostics',
        'Network & Wireless Diagnostics',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      this.panel.onDidDispose(() => {
        this.stopContinuousWireless();
        this.panel = undefined;
        void this.network.closeAll();
      });
      this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message));
      this.panel.webview.html = this.render(this.panel.webview);
    }
    this.panel.reveal(vscode.ViewColumn.Active);
    void this.panel.webview.postMessage({ type: 'navigate', page: this.requestedPage });
  }

  dispose(): void {
    this.disposed = true;
    this.wirelessContinuous = false;
    this.wirelessLoopGeneration++;
    this.sessionSubscription.dispose();
    this.deviceSubscription.dispose();
    void this.network.closeAll();
    this.panel?.dispose();
    this.panel = undefined;
  }

  private async handleMessage(message: any): Promise<void> {
    if (!this.panel || this.disposed) return;
    try {
      switch (String(message?.type ?? '')) {
        case 'ready':
          await this.postState();
          await Promise.all([this.refreshNetwork(), this.refreshSsh()]);
          await this.panel?.webview.postMessage({ type: 'navigate', page: this.requestedPage });
          return;
        case 'saveState':
          this.state = normalizeState(message.state);
          await this.context.globalState.update(STATE_KEY, this.state);
          return;
        case 'refreshNetwork':
          await this.refreshNetwork();
          return;
        case 'scanWireless':
          this.state = normalizeState(message.state);
          await this.context.globalState.update(STATE_KEY, this.state);
          await this.scanWireless(false);
          return;
        case 'startContinuousWireless':
          this.state = normalizeState(message.state);
          await this.context.globalState.update(STATE_KEY, this.state);
          await this.startContinuousWireless();
          return;
        case 'stopContinuousWireless':
          this.stopContinuousWireless();
          return;
        case 'discoverServices':
          await this.discoverServices();
          return;
        case 'inspectBleGatt':
          await this.inspectBleGatt(String(message.address || ''));
          return;
        case 'readBleGatt':
          await this.readBleGatt(String(message.address || ''), String(message.serviceUuid || ''), String(message.characteristicUuid || ''));
          return;
        case 'writeBleGatt':
          await this.writeBleGatt(String(message.address || ''), String(message.serviceUuid || ''), String(message.characteristicUuid || ''));
          return;
        case 'monitorBleGatt':
          await this.monitorBleGatt(String(message.address || ''), String(message.serviceUuid || ''), String(message.characteristicUuid || ''));
          return;
        case 'connectNetwork':
          await this.connectNetwork(message.state);
          return;
        case 'disconnectNetwork':
          await this.disconnectNetwork(String(message.transport ?? this.state.transport) as NetworkTransport);
          return;
        case 'startTcpServer':
          await this.startTcpServer(message.state);
          return;
        case 'stopTcpServer':
          await this.network.stopTcpServer();
          await this.postSessionState();
          return;
        case 'sendTcpServer':
          await this.sendTcpServerFrame(message.state);
          return;
        case 'sendNetworkFrame':
          await this.sendNetworkFrame(message.state);
          return;
        case 'ping':
          await this.runHostDiagnostic('ping', message.state);
          return;
        case 'dns':
          await this.runHostDiagnostic('dns', message.state);
          return;
        case 'tcpTest':
          await this.runHostDiagnostic('tcpTest', message.state);
          return;
        case 'copyText':
          await vscode.env.clipboard.writeText(String(message.text ?? ''));
          return;
        case 'openInstrumentDiagnostics':
          await vscode.commands.executeCommand('cpm.openInstrumentDiagnostics');
          return;
        case 'refreshSsh':
          await this.refreshSsh();
          return;
        case 'saveSshAlias':
          saveSshAlias(message.form, Number(message.blockIndex));
          await this.refreshSsh();
          await vscode.window.showInformationMessage(`SSH alias ${String(message.form?.host || '')} saved.`);
          return;
        case 'deleteSshAlias': {
          const host = String(message.host || 'alias');
          const answer = await vscode.window.showWarningMessage(`Delete SSH alias ${host}?`, { modal: true }, 'Delete');
          if (answer === 'Delete') {
            deleteSshAlias(Number(message.blockIndex));
            await this.refreshSsh();
          }
          return;
        }
        case 'sshConnect':
          sendSshTerminalCommand(`ssh ${validateSshTerminalTarget(message.target)}`);
          return;
        case 'sshInspect':
          sendSshTerminalCommand(`ssh -G ${validateSshTerminalTarget(message.target)}`);
          return;
        case 'sshTestKey':
          sendSshTerminalCommand(`ssh -o BatchMode=yes -o ConnectTimeout=5 ${validateSshTerminalTarget(message.target)} exit`);
          return;
        case 'sshPickIdentity': {
          const selected = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, openLabel: 'Use identity file', defaultUri: vscode.Uri.file(path.join(os.homedir(), '.ssh')) });
          if (selected?.[0]) await this.panel?.webview.postMessage({ type: 'identitySelected', path: selected[0].fsPath });
          return;
        }
        case 'sshGenerateKey': {
          const uri = await vscode.window.showSaveDialog({ title: 'Choose private-key path', defaultUri: vscode.Uri.file(path.join(os.homedir(), '.ssh', 'id_ed25519')), saveLabel: 'Generate here' });
          if (uri) sendSshTerminalCommand(`ssh-keygen -t ed25519 -f ${quoteTerminalArg(uri.fsPath)}`);
          return;
        }
        case 'sshEnrollKey':
          await this.enrollPublicKey(message.target ? String(message.target) : undefined);
          return;
        case 'sshPing':
          await this.runSshDiagnostic('ping', String(message.target || ''));
          return;
        case 'sshTcpTest':
          await this.runSshDiagnostic('tcp', String(message.target || ''), Number(message.port || 22));
          return;
        case 'sshUseInDiagnostics':
          await this.useSshInDiagnostics(String(message.target || ''), Number(message.port || 22));
          return;
        case 'sshUseAsRemoteTarget':
          await this.useSshAsRemoteTarget(String(message.target || ''));
          return;
        case 'createUnifiedDevice':
          await this.createUnifiedDevice();
          return;
        case 'editUnifiedDevice':
          await this.editUnifiedDevice(String(message.id || ''));
          return;
        case 'deleteUnifiedDevice':
          await this.deleteUnifiedDevice(String(message.id || ''));
          return;
        case 'removeDeviceEndpoint':
          await this.deviceRegistry.removeEndpoint(String(message.id || ''), String(message.kind || '') as CpmDeviceEndpointKind);
          return;
        case 'saveCurrentNetworkToDevice':
          await this.saveCurrentNetworkToDevice(message.state);
          return;
        case 'saveSshToDevice':
          await this.saveSshToDevice(String(message.target || ''));
          return;
        case 'openDeviceEndpoint':
          await this.openDeviceEndpoint(String(message.id || ''), String(message.kind || '') as CpmDeviceEndpointKind);
          return;
        case 'diagnoseUnifiedDevice':
          await this.diagnoseUnifiedDevice(String(message.id || ''));
          return;
        case 'diagnoseAllDevices':
          await this.diagnoseAllDevices();
          return;
        case 'exportDevices':
          await this.exportDevices();
          return;
        case 'importDevices':
          await this.importDevices();
          return;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`[Network Diagnostics] ${detail}`);
      await this.panel?.webview.postMessage({ type: 'error', message: detail });
      await this.postSessionState();
    }
  }

  private async postState(): Promise<void> {
    await this.panel?.webview.postMessage({
      type: 'state',
      state: this.state,
      network: this.networkDiscovery,
      wireless: this.wirelessDiscovery,
      serviceDiscovery: this.serviceDiscovery,
      bleGatt: this.bleGattInspection,
      wirelessContinuous: this.wirelessContinuous,
      ssh: this.sshData,
      devices: this.deviceProfiles,
      session: this.network.getSessionState()
    });
  }

  private async postSessionState(): Promise<void> {
    await this.panel?.webview.postMessage({ type: 'sessionState', session: this.network.getSessionState() });
  }

  private async refreshNetwork(): Promise<void> {
    if (!this.panel) return;
    await this.panel.webview.postMessage({ type: 'busy', operation: 'network', busy: true });
    try {
      this.networkDiscovery = await this.network.discoverNetwork();
      await this.panel.webview.postMessage({ type: 'networkDiscovery', network: this.networkDiscovery });
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'network', busy: false });
    }
  }

  private async scanWireless(merge: boolean): Promise<void> {
    if (!this.panel) return;
    await this.panel.webview.postMessage({ type: 'busy', operation: 'wireless', busy: true });
    try {
      const fresh = await this.network.scanWireless(this.state.wirelessScanDurationMs);
      this.wirelessDiscovery = merge ? mergeWirelessDiscovery(this.wirelessDiscovery, fresh, 20000) : fresh;
      await this.panel.webview.postMessage({ type: 'wirelessDiscovery', wireless: this.wirelessDiscovery, continuous: this.wirelessContinuous });
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'wireless', busy: false });
    }
  }

  private async startContinuousWireless(): Promise<void> {
    if (this.wirelessContinuous) return;
    this.wirelessContinuous = true;
    const generation = ++this.wirelessLoopGeneration;
    await this.panel?.webview.postMessage({ type: 'wirelessContinuousState', active: true });
    while (this.wirelessContinuous && !this.disposed && this.panel && generation === this.wirelessLoopGeneration) {
      try {
        await this.scanWireless(true);
      } catch (error) {
        this.output.appendLine(`[Network Diagnostics] Continuous wireless scan: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!this.wirelessContinuous || generation !== this.wirelessLoopGeneration) break;
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }

  private stopContinuousWireless(): void {
    this.wirelessContinuous = false;
    this.wirelessLoopGeneration++;
    void this.panel?.webview.postMessage({ type: 'wirelessContinuousState', active: false });
  }

  private async discoverServices(): Promise<void> {
    if (!this.panel) return;
    await this.panel.webview.postMessage({ type: 'busy', operation: 'serviceDiscovery', busy: true });
    try {
      this.serviceDiscovery = await this.network.discoverServices(1800);
      await this.panel.webview.postMessage({ type: 'serviceDiscovery', discovery: this.serviceDiscovery });
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'serviceDiscovery', busy: false });
    }
  }

  private async inspectBleGatt(address: string): Promise<void> {
    await this.panel?.webview.postMessage({ type: 'busy', operation: 'gatt', busy: true });
    try {
      this.bleGattInspection = await this.network.inspectBleGatt(address);
      await this.panel?.webview.postMessage({ type: 'bleGattInspection', inspection: this.bleGattInspection });
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'gatt', busy: false });
    }
  }

  private async readBleGatt(address: string, serviceUuid: string, characteristicUuid: string): Promise<void> {
    await this.panel?.webview.postMessage({ type: 'busy', operation: 'gatt', busy: true });
    try {
      const result = await this.network.readBleGatt(address, serviceUuid, characteristicUuid);
      await this.panel?.webview.postMessage({ type: 'bleGattValue', operation: 'read', result });
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'gatt', busy: false });
    }
  }

  private async writeBleGatt(address: string, serviceUuid: string, characteristicUuid: string): Promise<void> {
    const value = await vscode.window.showInputBox({ title: 'BLE GATT write', prompt: `${characteristicUuid} — hexadecimal bytes`, placeHolder: '01 02 A0 FF', validateInput: (text) => {
      const clean = text.replace(/0x/gi, '').replace(/[\s,;:_-]+/g, '');
      return clean && /^[0-9a-f]+$/i.test(clean) && clean.length % 2 === 0 ? undefined : 'Enter complete hexadecimal byte pairs.';
    } });
    if (!value) return;
    const confirmation = await vscode.window.showWarningMessage(`Write BLE GATT characteristic ${characteristicUuid} on ${address}? This can change device state.`, { modal: true, detail: `HEX payload: ${value}` }, 'Write');
    if (confirmation !== 'Write') return;
    await this.panel?.webview.postMessage({ type: 'busy', operation: 'gatt', busy: true });
    try {
      const result = await this.network.writeBleGatt(address, serviceUuid, characteristicUuid, value);
      await this.panel?.webview.postMessage({ type: 'bleGattValue', operation: 'write', result });
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'gatt', busy: false });
    }
  }

  private async monitorBleGatt(address: string, serviceUuid: string, characteristicUuid: string): Promise<void> {
    await this.panel?.webview.postMessage({ type: 'busy', operation: 'gatt', busy: true });
    try {
      const result = await this.network.monitorBleGatt(address, serviceUuid, characteristicUuid, 5000);
      await this.panel?.webview.postMessage({ type: 'bleGattValue', operation: 'monitor', result });
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'gatt', busy: false });
    }
  }

  private async refreshSsh(): Promise<void> {
    if (!this.panel) return;
    await this.panel.webview.postMessage({ type: 'busy', operation: 'ssh', busy: true });
    try {
      this.sshData = await loadSshDeviceManagerData();
      await this.panel.webview.postMessage({ type: 'sshData', ssh: this.sshData });
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'ssh', busy: false });
    }
  }

  private async runSshDiagnostic(kind: 'ping' | 'tcp', targetRaw: string, port = 22): Promise<void> {
    const target = validateSshTerminalTarget(targetRaw);
    const alias = this.sshData.aliases.find((entry) => entry.host === target);
    const host = alias?.hostName || target;
    const sshPort = alias?.port ? Number(alias.port) : port;
    await this.panel?.webview.postMessage({ type: 'busy', operation: 'sshDiagnostic', busy: true });
    try {
      const result = kind === 'ping'
        ? await this.network.ping(host, this.state.diagnosticTimeoutMs, 4)
        : await this.network.testTcpPort(host, sshPort || 22, this.state.diagnosticTimeoutMs);
      await this.panel?.webview.postMessage({ type: 'sshDiagnosticResult', target, result });
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'sshDiagnostic', busy: false });
    }
  }

  private async useSshInDiagnostics(targetRaw: string, port = 22): Promise<void> {
    const target = validateSshTerminalTarget(targetRaw);
    const alias = this.sshData.aliases.find((entry) => entry.host === target);
    this.state = {
      ...this.state,
      diagnosticHost: alias?.hostName || target,
      diagnosticPort: alias?.port ? Number(alias.port) : port || 22
    };
    await this.context.globalState.update(STATE_KEY, this.state);
    await this.postState();
    await this.panel?.webview.postMessage({ type: 'navigate', page: 'network' });
  }

  private async useSshAsRemoteTarget(targetRaw: string): Promise<void> {
    const target = validateSshTerminalTarget(targetRaw);
    const alias = this.sshData.aliases.find((entry) => entry.host === target);
    if (!alias) throw new Error(`SSH alias ${target} was not found in ~/.ssh/config.`);
    const projectRef = this.workspaces.activeProjectRef;
    if (!projectRef?.exists) throw new Error('No active CPM project. The SSH alias remains available globally, but Remote Linux settings require an active project.');
    const settings = this.projectSettings.getSettings(projectRef);
    settings.remoteLinux = {
      ...settings.remoteLinux,
      enabled: true,
      sshHost: alias.host,
      sshUser: alias.user || settings.remoteLinux.sshUser,
      sshPort: alias.port ? Number(alias.port) : settings.remoteLinux.sshPort
    };
    this.projectSettings.setSettings(projectRef, settings);
    await this.panel?.webview.postMessage({ type: 'remoteTargetResult', target: alias.host, project: projectRef.name });
    void vscode.window.showInformationMessage(`Remote Linux target for ${projectRef.name}: ${alias.host}`);
  }

  private async createUnifiedDevice(): Promise<void> {
    const name = await vscode.window.showInputBox({ title: 'New CPM device', prompt: 'Device name', validateInput: (value) => value.trim() ? undefined : 'A name is required.' });
    if (!name) return;
    const description = await vscode.window.showInputBox({ title: `New CPM device — ${name}`, prompt: 'Description (optional)' });
    const tagsRaw = await vscode.window.showInputBox({ title: `New CPM device — ${name}`, prompt: 'Tags separated by commas (optional)' });
    await this.deviceRegistry.create(name, description ?? '', splitTags(tagsRaw));
  }

  private async editUnifiedDevice(id: string): Promise<void> {
    const device = this.deviceRegistry.get(id);
    if (!device) throw new Error('Device not found.');
    const name = await vscode.window.showInputBox({ title: 'Edit CPM device', prompt: 'Device name', value: device.name, validateInput: (value) => value.trim() ? undefined : 'A name is required.' });
    if (!name) return;
    const description = await vscode.window.showInputBox({ title: `Edit CPM device — ${name}`, prompt: 'Description', value: device.description });
    if (description === undefined) return;
    const tagsRaw = await vscode.window.showInputBox({ title: `Edit CPM device — ${name}`, prompt: 'Tags separated by commas', value: device.tags.join(', ') });
    if (tagsRaw === undefined) return;
    await this.deviceRegistry.updateMetadata(id, { name, description, tags: splitTags(tagsRaw) });
  }

  private async deleteUnifiedDevice(id: string): Promise<void> {
    const device = this.deviceRegistry.get(id);
    if (!device) return;
    const answer = await vscode.window.showWarningMessage(`Delete CPM device "${device.name}" and its saved endpoints?`, { modal: true }, 'Delete');
    if (answer === 'Delete') await this.deviceRegistry.delete(id);
  }

  private async saveCurrentNetworkToDevice(rawState: unknown): Promise<void> {
    this.state = normalizeState(rawState);
    await this.context.globalState.update(STATE_KEY, this.state);
    const endpoint: CpmDeviceEndpoint = this.state.transport === 'tcp'
      ? { kind: 'tcp', settings: { ...this.state.tcp } }
      : { kind: 'udp', settings: { ...this.state.udp } };
    const suggested = this.state.transport === 'tcp'
      ? `${this.state.tcp.host}:${this.state.tcp.port}`
      : `${this.state.udp.host}:${this.state.udp.remotePort}`;
    const device = await pickOrCreateDevice(this.deviceRegistry, 'Add network endpoint to CPM device', suggested);
    if (!device) return;
    await this.deviceRegistry.upsertEndpoint(device.id, endpoint);
    void vscode.window.showInformationMessage(`${this.state.transport.toUpperCase()} endpoint saved to ${device.name}.`);
  }

  private async saveSshToDevice(targetRaw: string): Promise<void> {
    const target = validateSshTerminalTarget(targetRaw);
    const alias = this.sshData.aliases.find((entry) => entry.host === target);
    if (!alias) throw new Error(`SSH alias ${target} was not found in ~/.ssh/config.`);
    const device = await pickOrCreateDevice(this.deviceRegistry, 'Add SSH endpoint to CPM device', alias.host);
    if (!device) return;
    await this.deviceRegistry.upsertEndpoint(device.id, {
      kind: 'ssh',
      alias: alias.host,
      hostName: alias.hostName || alias.host,
      user: alias.user || undefined,
      port: alias.port ? Number(alias.port) : 22,
      identityFile: alias.identityFile || undefined,
      proxyJump: alias.proxyJump || undefined
    });
    void vscode.window.showInformationMessage(`SSH endpoint saved to ${device.name}.`);
  }

  private async openDeviceEndpoint(id: string, kind: CpmDeviceEndpointKind): Promise<void> {
    const device = this.deviceRegistry.get(id);
    const endpoint = device?.endpoints[kind];
    if (!device || !endpoint) throw new Error('The selected device endpoint is no longer available.');
    if (endpoint.kind === 'serial' || endpoint.kind === 'visa') {
      await vscode.commands.executeCommand('cpm.openInstrumentDiagnostics', endpoint);
      return;
    }
    if (endpoint.kind === 'tcp') {
      await this.network.closeAll();
      this.state = normalizeState({ ...this.state, transport: 'tcp', tcp: endpoint.settings, frameEncoding: endpoint.settings.encoding, lineEnding: endpoint.settings.lineEnding });
      await this.context.globalState.update(STATE_KEY, this.state);
      await this.postState();
      await this.panel?.webview.postMessage({ type: 'navigate', page: 'terminal' });
      return;
    }
    if (endpoint.kind === 'udp') {
      await this.network.closeAll();
      this.state = normalizeState({ ...this.state, transport: 'udp', udp: endpoint.settings, frameEncoding: endpoint.settings.encoding, lineEnding: endpoint.settings.lineEnding });
      await this.context.globalState.update(STATE_KEY, this.state);
      await this.postState();
      await this.panel?.webview.postMessage({ type: 'navigate', page: 'terminal' });
      return;
    }
    this.state = normalizeState({ ...this.state, diagnosticHost: endpoint.hostName, diagnosticPort: endpoint.port });
    await this.context.globalState.update(STATE_KEY, this.state);
    await this.postState();
    await this.panel?.webview.postMessage({ type: 'navigate', page: 'ssh' });
  }

  private async diagnoseUnifiedDevice(id: string): Promise<void> {
    const device = this.deviceRegistry.get(id);
    if (!device) throw new Error('Device not found.');
    await this.panel?.webview.postMessage({ type: 'busy', operation: 'deviceDiagnostic', busy: true });
    try {
      const instrumentDiscovery = await this.instruments.discover();
      const result = await this.runUnifiedDeviceDiagnostic(device, instrumentDiscovery);
      await this.panel?.webview.postMessage({ type: 'deviceDiagnosticResult', id, result });
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'deviceDiagnostic', busy: false });
    }
  }

  private async diagnoseAllDevices(): Promise<void> {
    await this.panel?.webview.postMessage({ type: 'busy', operation: 'deviceDiagnostic', busy: true });
    try {
      const instrumentDiscovery = await this.instruments.discover();
      for (const device of this.deviceRegistry.list()) {
        const result = await this.runUnifiedDeviceDiagnostic(device, instrumentDiscovery);
        await this.panel?.webview.postMessage({ type: 'deviceDiagnosticResult', id: device.id, result });
      }
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'deviceDiagnostic', busy: false });
    }
  }

  private async runUnifiedDeviceDiagnostic(device: CpmDeviceProfile, instrumentDiscovery: Awaited<ReturnType<CpmInstrumentService['discover']>>): Promise<{ status: 'pass' | 'warn' | 'fail'; items: Array<{ endpoint: string; status: 'pass' | 'warn' | 'fail'; summary: string }> }> {
    const items: Array<{ endpoint: string; status: 'pass' | 'warn' | 'fail'; summary: string }> = [];
    const serial = device.endpoints.serial;
    if (serial?.kind === 'serial') {
      const found = instrumentDiscovery.serial.some((item) => item.portName.toLocaleLowerCase() === serial.settings.portName.toLocaleLowerCase());
      items.push({ endpoint: 'COM', status: found ? 'pass' : 'fail', summary: found ? `${serial.settings.portName} is present.` : `${serial.settings.portName} was not enumerated.` });
    }
    const visa = device.endpoints.visa;
    if (visa?.kind === 'visa') {
      const found = instrumentDiscovery.visa.some((item) => item.resource.toLocaleLowerCase() === visa.settings.resource.toLocaleLowerCase());
      items.push({ endpoint: 'VISA', status: found ? 'pass' : instrumentDiscovery.visaAvailable ? 'fail' : 'warn', summary: found ? `${visa.settings.resource} is visible.` : instrumentDiscovery.visaAvailable ? `${visa.settings.resource} was not enumerated.` : 'No VISA runtime is currently available.' });
    }
    const tcp = device.endpoints.tcp;
    if (tcp?.kind === 'tcp') {
      const result = await this.network.testTcpPort(tcp.settings.host, tcp.settings.port, Math.min(4000, Math.max(500, tcp.settings.connectTimeoutMs)));
      items.push({ endpoint: 'TCP', status: result.ok ? 'pass' : 'fail', summary: result.summary });
    }
    const udp = device.endpoints.udp;
    if (udp?.kind === 'udp') {
      const result = await this.network.dnsLookup(udp.settings.host);
      items.push({ endpoint: 'UDP', status: result.ok ? 'warn' : 'fail', summary: result.ok ? `${udp.settings.host}:${udp.settings.remotePort} resolves; UDP has no connection handshake to validate.` : result.summary });
    }
    const ssh = device.endpoints.ssh;
    if (ssh?.kind === 'ssh') {
      const result = await this.network.testTcpPort(ssh.hostName, ssh.port, 3000);
      items.push({ endpoint: 'SSH', status: result.ok ? 'pass' : 'fail', summary: result.ok ? `SSH ${ssh.hostName}:${ssh.port} is reachable.` : result.summary });
    }
    if (!items.length) items.push({ endpoint: 'Device', status: 'warn', summary: 'No communication endpoint is configured.' });
    const status = items.some((item) => item.status === 'fail') ? 'fail' : items.some((item) => item.status === 'warn') ? 'warn' : 'pass';
    return { status, items };
  }

  private async exportDevices(): Promise<void> {
    const uri = await vscode.window.showSaveDialog({ title: 'Export CPM devices', saveLabel: 'Export devices', filters: { JSON: ['json'] }, defaultUri: vscode.Uri.file(path.join(os.homedir(), 'cpm-devices.json')) });
    if (!uri) return;
    const payload = JSON.stringify({ format: 'cpm-devices', version: 1, exportedAt: new Date().toISOString(), devices: this.deviceRegistry.list() }, null, 2);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(payload, 'utf8'));
    void vscode.window.showInformationMessage(`Exported ${this.deviceRegistry.list().length} CPM device(s).`);
  }

  private async importDevices(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({ title: 'Import CPM devices', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { JSON: ['json'] } });
    const uri = uris?.[0];
    if (!uri) return;
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    const parsed = JSON.parse(raw);
    const devices = Array.isArray(parsed) ? parsed : parsed?.devices;
    if (!Array.isArray(devices)) throw new Error('The selected file does not contain a CPM device list.');
    const mode = await vscode.window.showQuickPick([
      { label: 'Merge', description: 'Keep existing devices and merge imported entries by ID', value: 'merge' },
      { label: 'Replace all', description: 'Replace the current CPM device registry', value: 'replace' }
    ], { title: `Import ${devices.length} CPM device(s)` });
    if (!mode) return;
    if (mode.value === 'replace') await this.deviceRegistry.replaceAll(devices as CpmDeviceProfile[]);
    else await this.deviceRegistry.merge(devices as CpmDeviceProfile[]);
  }

  private async enrollPublicKey(preferredTarget?: string): Promise<void> {
    const aliases = listEditableSshAliases();
    let target = preferredTarget ? aliases.find((entry) => entry.host === preferredTarget) : undefined;
    if (!target) {
      const selectedAlias = await vscode.window.showQuickPick(
        aliases.map((entry) => ({ label: entry.host, description: entry.hostName })),
        { title: 'Install public key on which SSH alias?' }
      );
      if (!selectedAlias) return;
      target = aliases.find((entry) => entry.host === selectedAlias.label);
    }
    if (!target) throw new Error('No editable SSH alias is available.');
    const selected = await vscode.window.showOpenDialog({
      title: 'Select the public key to install',
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'OpenSSH public keys': ['pub'], 'All files': ['*'] },
      defaultUri: vscode.Uri.file(path.join(os.homedir(), '.ssh'))
    });
    if (!selected?.[0]) return;
    const alias = validateSshTerminalTarget(target.host);
    const publicKeyPath = quoteTerminalArg(selected[0].fsPath);
    const remote = 'umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys; cat >> ~/.ssh/authorized_keys';
    const command = process.platform === 'win32'
      ? `type ${publicKeyPath} | ssh ${alias} ${quoteTerminalArg(remote)}`
      : `cat ${publicKeyPath} | ssh ${alias} ${quoteTerminalArg(remote)}`;
    const answer = await vscode.window.showWarningMessage(
      `Append ${path.basename(selected[0].fsPath)} to ${alias}:~/.ssh/authorized_keys? Only the public key will be sent.`,
      { modal: true },
      'Install key'
    );
    if (answer === 'Install key') sendSshTerminalCommand(command);
  }

  private async connectNetwork(rawState: unknown): Promise<void> {
    this.state = normalizeState(rawState);
    await this.context.globalState.update(STATE_KEY, this.state);
    await this.panel?.webview.postMessage({ type: 'busy', operation: 'connect', busy: true });
    try {
      if (this.state.transport === 'tcp') {
        await this.network.openTcpSession({ ...this.state.tcp, encoding: this.state.frameEncoding, lineEnding: this.state.lineEnding });
      } else {
        await this.network.openUdpSession({ ...this.state.udp, encoding: this.state.frameEncoding, lineEnding: this.state.lineEnding });
      }
      await this.postSessionState();
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'connect', busy: false });
    }
  }

  private async startTcpServer(rawState: unknown): Promise<void> {
    this.state = normalizeState(rawState);
    this.state.tcpServer = { ...this.state.tcpServer, encoding: this.state.frameEncoding, lineEnding: this.state.lineEnding };
    await this.context.globalState.update(STATE_KEY, this.state);
    await this.panel?.webview.postMessage({ type: 'busy', operation: 'tcpServer', busy: true });
    try {
      await this.network.startTcpServer(this.state.tcpServer);
      await this.postSessionState();
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'tcpServer', busy: false });
    }
  }

  private async sendTcpServerFrame(rawState: unknown): Promise<void> {
    this.state = normalizeState(rawState);
    await this.context.globalState.update(STATE_KEY, this.state);
    const payload = this.network.encodeFrame(this.state.frameText, this.state.frameMode, this.state.frameEncoding);
    const result = await this.network.writeTcpServer(payload);
    await this.panel?.webview.postMessage({ type: 'serverFrameSent', ...result });
  }

  private async disconnectNetwork(transport: NetworkTransport): Promise<void> {
    if (transport === 'udp') await this.network.closeUdpSession(); else await this.network.closeTcpSession();
    await this.postSessionState();
  }

  private async sendNetworkFrame(rawState: unknown): Promise<void> {
    this.state = normalizeState(rawState);
    await this.context.globalState.update(STATE_KEY, this.state);
    const payload = this.network.encodeFrame(this.state.frameText, this.state.frameMode, this.state.frameEncoding);
    const bytes = this.state.transport === 'tcp' ? await this.network.writeTcp(payload) : await this.network.writeUdp(payload);
    await this.panel?.webview.postMessage({ type: 'frameSent', bytesWritten: bytes });
  }

  private async runHostDiagnostic(kind: 'ping' | 'dns' | 'tcpTest', rawState: unknown): Promise<void> {
    this.state = normalizeState(rawState);
    await this.context.globalState.update(STATE_KEY, this.state);
    await this.panel?.webview.postMessage({ type: 'busy', operation: 'diagnostic', busy: true });
    try {
      const result = kind === 'ping'
        ? await this.network.ping(this.state.diagnosticHost, this.state.diagnosticTimeoutMs, 4)
        : kind === 'dns'
          ? await this.network.dnsLookup(this.state.diagnosticHost)
          : await this.network.testTcpPort(this.state.diagnosticHost, this.state.diagnosticPort, this.state.diagnosticTimeoutMs);
      await this.panel?.webview.postMessage({ type: 'diagnosticResult', result });
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'diagnostic', busy: false });
    }
  }

  private async forwardSessionEvent(event: NetworkSessionEvent): Promise<void> {
    if (!this.panel) return;
    if (event.type === 'error') this.output.appendLine(`[Network Diagnostics] ${event.transport ?? 'network'} ${event.target ?? ''}: ${event.message ?? 'Unknown error'}`);
    await this.panel.webview.postMessage({ type: 'networkSessionEvent', event });
    if (event.type === 'tcp-connected' || event.type === 'tcp-disconnected' || event.type === 'udp-bound' || event.type === 'udp-closed' || event.type === 'tcp-server-started' || event.type === 'tcp-server-stopped' || event.type === 'tcp-client-connected' || event.type === 'tcp-client-disconnected') {
      await this.postSessionState();
    }
  }

  private render(webview: vscode.Webview): string {
    const nonce = createNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>Network & Wireless Diagnostics</title>
<style nonce="${nonce}">
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;padding:22px 26px 44px;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:13px var(--vscode-font-family)}
h1{margin:0 0 6px;font-size:25px;font-weight:650}h2{margin:0;font-size:15px}h3{margin:0 0 9px;font-size:13px}p{margin:7px 0}.muted{color:var(--vscode-descriptionForeground)}code,.console,textarea{font-family:var(--vscode-editor-font-family)}
.toolbar,.row,.tabs{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.toolbar{margin:16px 0}.tabs{border-bottom:1px solid var(--vscode-panel-border);margin:12px 0 8px}.tabs button{border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--vscode-foreground);padding:9px 12px}.tabs button.active{border-bottom-color:var(--vscode-focusBorder);background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}
.tool-nav{position:sticky;top:0;z-index:8;display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,340px) minmax(160px,auto);gap:10px;align-items:center;padding:10px 0 12px;margin-bottom:8px;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border)}.tool-nav-context{min-width:0;color:var(--vscode-descriptionForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.filter-hidden{display:none!important}
button{border:1px solid var(--vscode-button-border,transparent);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:7px 12px;border-radius:4px;cursor:pointer;font:inherit}button:hover{background:var(--vscode-button-hoverBackground)}button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}button:disabled{opacity:.5;cursor:default}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-bottom:14px}.summary-card,.panel{border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);border-radius:6px}.summary-card{padding:12px 14px}.summary-card strong{display:block;font-size:21px;margin-top:3px}.panel{margin:12px 0;overflow:hidden}.panel-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:11px 14px;border-bottom:1px solid var(--vscode-panel-border)}.panel-body{padding:14px}
.grid{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px 12px}.grid.two{grid-template-columns:repeat(2,minmax(180px,1fr))}.grid.three{grid-template-columns:repeat(3,minmax(150px,1fr))}label{display:grid;gap:5px;color:var(--vscode-descriptionForeground)}input,select,textarea{width:100%;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));background:var(--vscode-input-background);color:var(--vscode-input-foreground);padding:6px 8px;font:inherit;border-radius:3px}textarea{min-height:90px;resize:vertical}.hidden{display:none!important}.page.hidden{display:none!important}
.transport button{background:transparent;color:var(--vscode-foreground);border-color:var(--vscode-panel-border)}.transport button.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:transparent}.warning{margin:7px 0;padding:8px 10px;border-left:3px solid var(--vscode-editorWarning-foreground);background:var(--vscode-textBlockQuote-background);font-family:var(--vscode-font-family);font-size:12px;line-height:1.45;overflow-wrap:anywhere}
.badge{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--vscode-panel-border);border-radius:999px;font-size:12px}.badge.connected{color:var(--vscode-testing-iconPassed)}.dot{width:7px;height:7px;border-radius:50%;background:currentColor}.console{min-height:260px;max-height:480px;overflow:auto;padding:10px 12px;background:var(--vscode-textCodeBlock-background);line-height:1.45;white-space:pre-wrap;word-break:break-word}.tx{color:var(--vscode-terminal-ansiCyan)}.rx{color:var(--vscode-terminal-ansiGreen)}.err{color:var(--vscode-errorForeground)}.meta{color:var(--vscode-descriptionForeground)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top}th{color:var(--vscode-descriptionForeground);font-weight:600}td code{overflow-wrap:anywhere;word-break:break-word}.scroll{overflow:auto;max-height:360px}.small{font-size:11px}.device-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}.device-card{border:1px solid var(--vscode-panel-border);border-radius:5px;padding:11px;background:var(--vscode-editor-background)}.device-card strong{display:block;margin-bottom:5px}.device-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.device-actions button{padding:5px 8px}.endpoint-list{display:grid;gap:7px;margin-top:9px}.endpoint-row{border-top:1px solid var(--vscode-panel-border);padding-top:7px}.endpoint-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.endpoint-kind{font-weight:600}.tag-row{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.tag{display:inline-flex;padding:2px 6px;border:1px solid var(--vscode-panel-border);border-radius:999px;color:var(--vscode-descriptionForeground);font-size:11px}.diag-pass{color:var(--vscode-testing-iconPassed)}.diag-warn{color:var(--vscode-editorWarning-foreground)}.diag-fail{color:var(--vscode-errorForeground)}.gatt-service{border-top:1px solid var(--vscode-panel-border);padding:9px 0}.gatt-char{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:6px 0 6px 14px;border-top:1px dashed var(--vscode-panel-border)}.stale{opacity:.62}.result{white-space:pre-wrap;word-break:break-word;min-height:48px;padding:10px;background:var(--vscode-textCodeBlock-background);border-radius:4px}.signal{min-width:72px}.safety-note{padding:9px 11px;border:1px solid var(--vscode-panel-border);border-radius:5px;background:var(--vscode-textBlockQuote-background)}
@media(max-width:900px){.summary{grid-template-columns:repeat(2,1fr)}.grid,.grid.three{grid-template-columns:repeat(2,1fr)}.tool-nav{grid-template-columns:1fr 1fr}.tool-nav-context{grid-column:1/-1}}@media(max-width:600px){body{padding:16px}.tool-nav{grid-template-columns:1fr}.tool-nav-context{grid-column:auto}.summary,.grid,.grid.two,.grid.three{grid-template-columns:1fr}}
</style>
</head>
<body>
<h1>Network & Wireless Diagnostics</h1>
<p class="muted">Local Ethernet/Wi-Fi diagnostics, TCP/UDP client/server tools, wireless discovery, BLE GATT inspection and integrated OpenSSH device management.</p>
<div class="safety-note"><strong>Diagnostic scope:</strong> CPM discovers local radio/network metadata and communicates only with endpoints you explicitly select. It does not passively capture third-party payload traffic, credentials, protected handshakes or decrypted frames.</div>
<div class="toolbar"><button id="refreshNetwork">Refresh network</button><button id="scanWireless">Scan wireless</button><button id="openInstrument" class="secondary">Open COM / VISA diagnostics</button><span id="status" class="muted"></span></div>
<div class="summary">
  <div class="summary-card"><span class="muted">Network adapters</span><strong id="adapterCount">0</strong></div>
  <div class="summary-card"><span class="muted">Wi-Fi BSSIDs</span><strong id="wifiCount">0</strong></div>
  <div class="summary-card"><span class="muted">BLE advertisements</span><strong id="bleCount">0</strong></div>
  <div class="summary-card"><span class="muted">Bluetooth devices</span><strong id="btCount">0</strong></div>
  <div class="summary-card"><span class="muted">SSH aliases</span><strong id="sshAliasCount">0</strong></div>
  <div class="summary-card"><span class="muted">CPM devices</span><strong id="deviceCount">0</strong></div>
  <div class="summary-card"><span class="muted">Discovered services</span><strong id="serviceCount">0</strong></div>
</div>
<div class="tabs"><button data-page="network" class="active">Network</button><button data-page="terminal">TCP / UDP terminal</button><button data-page="wireless">Wi-Fi / BLE / Bluetooth</button><button data-page="ssh">SSH Devices</button><button data-page="devices">Devices</button></div>
<div class="tool-nav" aria-label="Network diagnostics navigation"><input id="toolFilter" type="search" placeholder="Filter sections in this tool…" aria-label="Filter sections in the current network diagnostics page"><select id="toolSectionNav" aria-label="Jump to a section"><option value="">Jump to a section…</option></select><div id="toolNavContext" class="tool-nav-context">Network</div></div>

<div id="networkPage" class="page">
<section class="panel"><div class="panel-head"><div><h2>Host diagnostics</h2><div class="muted small">Single-target checks: ICMP ping, DNS lookup and TCP connection test.</div></div></div><div class="panel-body">
  <div class="grid"><label>Host / IP<input id="diagnosticHost"></label><label>TCP port<input id="diagnosticPort" type="number" min="1" max="65535"></label><label>Timeout (ms)<input id="diagnosticTimeout" type="number" min="100" max="30000"></label><div class="row" style="align-self:end"><button id="ping">Ping</button><button id="dns" class="secondary">DNS</button><button id="tcpTest" class="secondary">Test TCP</button></div></div>
  <div id="diagnosticResult" class="result muted" style="margin-top:12px">No diagnostic run yet.</div>
</div></section>
<section class="panel"><div class="panel-head"><div><h2>Service discovery</h2><div class="muted small">Discover local services using mDNS/Bonjour and SSDP/UPnP without sweeping arbitrary TCP ports.</div></div><button id="discoverServices">Discover services</button></div><div class="panel-body"><div id="serviceWarnings"></div><h3>mDNS / Bonjour records</h3><div class="scroll"><table><thead><tr><th>Name</th><th>Type</th><th>Data</th><th>TTL</th><th>Responder</th></tr></thead><tbody id="mdnsTable"></tbody></table></div><h3 style="margin-top:14px">SSDP / UPnP devices</h3><div class="scroll"><table><thead><tr><th>Address</th><th>Search target</th><th>Location</th><th>Server</th><th>USN</th></tr></thead><tbody id="ssdpTable"></tbody></table></div></div></section>
<section class="panel"><div class="panel-head"><div><h2>Network interfaces</h2><div class="muted small">IP addresses, gateway, DNS, MAC address and link status.</div></div></div><div class="panel-body"><div id="networkWarnings"></div><div class="scroll"><table><thead><tr><th>Adapter</th><th>Status</th><th>MAC / speed</th><th>IPv4</th><th>IPv6</th><th>Gateway</th><th>DNS</th></tr></thead><tbody id="adapterTable"></tbody></table></div></div></section>
<section class="panel"><div class="panel-head"><div><h2>Local neighbor table</h2><div class="muted small">Existing ARP/ND neighbor-cache entries only; CPM does not actively sweep the subnet.</div></div></div><div class="panel-body"><div class="scroll"><table><thead><tr><th>Interface</th><th>IP address</th><th>Link-layer address</th><th>State</th></tr></thead><tbody id="neighborTable"></tbody></table></div></div></section>
</div>

<div id="terminalPage" class="page hidden">
<section class="panel"><div class="panel-head"><div><h2>Network session</h2><div class="muted small">Persistent TCP client or UDP socket for instrument/server diagnostics.</div></div><span id="networkBadge" class="badge"><span class="dot"></span><span id="networkBadgeText">Disconnected</span></span></div><div class="panel-body">
  <div class="row" style="justify-content:space-between;margin-bottom:12px"><div class="transport row"><button id="transportTcp" class="active">TCP client</button><button id="transportUdp">UDP</button></div><div class="row"><button id="saveNetworkToDevice" class="secondary">Add endpoint to CPM device</button><button id="networkConnect">Connect / Open</button><button id="networkDisconnect" class="secondary">Disconnect / Close</button></div></div>
  <div id="tcpSettings" class="grid three"><label>Remote host<input id="tcpHost"></label><label>Remote port<input id="tcpPort" type="number" min="1" max="65535"></label><label>Connect timeout (ms)<input id="tcpTimeout" type="number" min="100" max="120000"></label></div>
  <div id="udpSettings" class="grid three hidden"><label>Remote host<input id="udpHost"></label><label>Remote port<input id="udpRemotePort" type="number" min="1" max="65535"></label><label>Local port (0 = automatic)<input id="udpLocalPort" type="number" min="0" max="65535"></label></div>
</div></section>
<section class="panel"><div class="panel-head"><div><h2>TCP listener / server</h2><div class="muted small">Accept incoming TCP clients from instruments or embedded devices. RX is logged in the same console; TX broadcasts the current frame to every connected client.</div></div><span id="tcpServerBadge" class="badge"><span class="dot"></span><span id="tcpServerBadgeText">Stopped</span></span></div><div class="panel-body"><div class="grid three"><label>Bind address<input id="tcpServerBind" placeholder="0.0.0.0"></label><label>Listen port (0 = automatic)<input id="tcpServerPort" type="number" min="0" max="65535"></label><div class="row" style="align-self:end"><button id="startTcpServer">Start listener</button><button id="stopTcpServer" class="secondary">Stop</button><button id="sendTcpServer" class="secondary">Broadcast current frame</button></div></div><div id="tcpServerInfo" class="muted small" style="margin-top:9px">No TCP listener is active.</div></div></section>
<section class="panel"><div class="panel-head"><div><h2>TX / RX terminal</h2><div class="muted small">Text or raw HEX frames. Incoming TCP bytes and UDP datagrams are logged asynchronously.</div></div></div><div class="panel-body">
  <div class="grid three"><label>Frame format<select id="frameMode"><option value="text">Text</option><option value="hex">HEX bytes</option></select></label><label>Encoding<select id="frameEncoding"><option value="ascii">ASCII</option><option value="utf8">UTF-8</option><option value="latin1">Latin-1</option></select></label><label>TX line ending<select id="lineEnding"><option value="none">None</option><option value="lf">LF (\\n)</option><option value="cr">CR (\\r)</option><option value="crlf">CRLF (\\r\\n)</option></select></label></div>
  <label style="margin-top:10px">Frame<textarea id="frameText" spellcheck="false"></textarea></label><div class="row" style="margin-top:10px"><button id="networkSend">Send frame</button><button id="copyNetworkLog" class="secondary">Copy log</button><button id="clearNetworkLog" class="secondary">Clear log</button></div>
  <div id="networkConsole" class="console" style="margin-top:12px"></div>
</div></section>
</div>

<div id="wirelessPage" class="page hidden">
<section class="panel"><div class="panel-head"><div><h2>Wireless scanner</h2><div class="muted small">Wi-Fi visibility and BLE advertisement discovery. Continuous mode keeps devices for about 20 s and updates their Last seen timestamp.</div></div><span id="wirelessModeBadge" class="badge"><span class="dot"></span><span id="wirelessModeText">Single scan</span></span></div><div class="panel-body"><div class="row"><label style="max-width:220px">BLE scan duration (ms)<input id="wirelessDuration" type="number" min="1000" max="15000"></label><button id="scanWirelessInner">Scan now</button><button id="startWirelessContinuous" class="secondary">Start continuous</button><button id="stopWirelessContinuous" class="secondary">Stop continuous</button></div><div id="wirelessWarnings"></div></div></section>
<section class="panel"><div class="panel-head"><div><h2>Visible Wi-Fi networks</h2></div></div><div class="panel-body"><div class="scroll"><table><thead><tr><th>SSID</th><th>BSSID</th><th>Signal</th><th>Channel</th><th>Authentication</th><th>Encryption</th><th>Radio</th><th>Last seen</th></tr></thead><tbody id="wifiTable"></tbody></table></div></div></section>
<section class="panel"><div class="panel-head"><div><h2>BLE advertisements</h2><div class="muted small">Passive/active Windows BLE advertisement watcher; no GATT connection is performed.</div></div></div><div class="panel-body"><div class="scroll"><table><thead><tr><th>Name</th><th>Address</th><th>RSSI</th><th>Connectable</th><th>Seen</th><th>GATT</th></tr></thead><tbody id="bleTable"></tbody></table></div></div></section>
<section class="panel"><div class="panel-head"><div><h2>BLE GATT Inspector</h2><div class="muted small">Inspect services/characteristics for a selected BLE address. Read, write and bounded 5 s notification monitoring are available when the characteristic exposes the corresponding property. GATT Write can change device state; use it only on equipment you are authorized to test.</div></div><span id="gattStatus" class="muted small">No BLE device selected.</span></div><div class="panel-body"><div id="gattTree" class="muted">Select GATT on a BLE device to inspect it.</div><div id="gattResult" class="result muted" style="margin-top:12px">No GATT operation run yet.</div></div></section>
<section class="panel"><div class="panel-head"><div><h2>Bluetooth devices known to Windows</h2><div class="muted small">Physical/known devices are de-duplicated where possible. RSSI is available only when CPM can correlate the device with a BLE advertisement captured during this scan.</div></div></div><div class="panel-body"><div class="scroll"><table><thead><tr><th>Name</th><th>Address</th><th>RSSI</th><th>Status</th><th>Class</th><th>Last seen</th><th>Instance ID</th><th>GATT</th></tr></thead><tbody id="btTable"></tbody></table></div></div></section>
</div>

<div id="sshPage" class="page hidden">
<section class="panel"><div class="panel-head"><div><h2>OpenSSH Device Manager</h2><div class="muted small">Shared with CPM Remote Linux. Configuration remains in the current user's <code>~/.ssh/config</code>.</div></div><span id="sshStatus" class="muted small"></span></div><div class="panel-body">
  <div class="row"><button id="refreshSsh">Refresh SSH</button><button id="newSshAlias">New alias</button><button id="generateSshKey" class="secondary">Generate Ed25519 key</button><button id="enrollSshKey" class="secondary">Install public key</button></div>
  <div class="muted small" style="margin-top:9px">Config: <code id="sshConfigPath"></code></div>
</div></section>
<section class="panel"><div class="panel-head"><div><h2>Alias editor</h2><div class="muted small">Create or edit a simple OpenSSH Host block. Wildcard and multi-host blocks stay read-only.</div></div></div><div class="panel-body">
  <input id="sshBlockIndex" type="hidden" value="-1">
  <div class="grid three"><label>Host alias<input id="sshHost" placeholder="raspberry-test"></label><label>HostName / IP<input id="sshHostName" placeholder="192.168.1.42"></label><label>User<input id="sshUser" placeholder="pi"></label><label>Port<input id="sshPort" placeholder="22"></label><label>IdentityFile<input id="sshIdentityFile" placeholder="~/.ssh/id_ed25519"></label><label>IdentitiesOnly<select id="sshIdentitiesOnly"><option value=""></option><option value="yes">yes</option><option value="no">no</option></select></label><label>ProxyJump<input id="sshProxyJump" placeholder="jump-host"></label></div>
  <div class="row" style="margin-top:10px"><button id="saveSshAlias">Save alias</button><button id="pickSshIdentity" class="secondary">Browse identity…</button><button id="clearSshEditor" class="secondary">Clear</button></div>
</div></section>
<section class="panel"><div class="panel-head"><div><h2>Configured SSH devices</h2><div class="muted small">Connect, inspect effective OpenSSH configuration, test key authentication, run network checks or select a device for Remote Linux.</div></div></div><div class="panel-body"><div id="sshAliases" class="device-grid"></div></div></section>
<section class="panel"><div class="panel-head"><div><h2>Local resolver aliases</h2><div class="muted small">Names read from the local hosts file.</div></div></div><div class="panel-body"><div id="sshHosts" class="device-grid"></div></div></section>
<section class="panel"><div class="panel-head"><div><h2>Discovered local neighbours</h2><div class="muted small">ARP/ND cache entries. Add a visible device to <code>~/.ssh/config</code> without actively sweeping the subnet.</div></div></div><div class="panel-body"><div id="sshNeighbors" class="device-grid"></div><div id="sshDiagnosticResult" class="result muted" style="margin-top:12px">No SSH/network diagnostic run yet.</div></div></section>
</div>

<div id="devicesPage" class="page hidden">
<section class="panel"><div class="panel-head"><div><h2>Unified CPM Devices</h2><div class="muted small">One equipment profile can contain COM, VISA, TCP, UDP and SSH endpoints. Endpoints reuse the existing diagnostic engines instead of duplicating communication settings.</div></div><div class="row"><button id="newUnifiedDevice">New device</button><button id="diagnoseAllDevices" class="secondary">Diagnose all</button><button id="importDevices" class="secondary">Import JSON</button><button id="exportDevices" class="secondary">Export JSON</button></div></div><div class="panel-body"><div id="unifiedDevices" class="device-grid"></div></div></section>
</div>

<script nonce="${nonce}">
(() => {
const vscode=acquireVsCodeApi();
let state=${safeJson(this.state)};
let network=${safeJson(this.networkDiscovery)};
let wireless=${safeJson(this.wirelessDiscovery)};
let serviceDiscovery=${safeJson(this.serviceDiscovery)};
let bleGatt=${safeJson(this.bleGattInspection ?? null)};
let wirelessContinuous=${safeJson(this.wirelessContinuous)};
let deviceDiagnostics={};
let ssh=${safeJson(this.sshData)};
let devices=${safeJson(this.deviceProfiles)};
let session=${safeJson(this.network.getSessionState())};
let logLines=[];
const $=id=>document.getElementById(id);const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));const printable=v=>String(v??'').replace(/\\r/g,'\\\\r').replace(/\\n/g,'\\\\n');
const setValue=(id,v)=>{const e=$(id);if(e)e.value=v??''};
const pageLabels={network:'Network',terminal:'TCP / UDP terminal',wireless:'Wi-Fi / BLE / Bluetooth',ssh:'SSH Devices',devices:'Unified Devices'};
function currentPageElement(){return document.querySelector('.page:not(.hidden)')}
function currentToolSections(){const page=currentPageElement();return page?Array.from(page.querySelectorAll('section.panel')):[]}
function populateToolSections(){const select=$('toolSectionNav');if(!select)return;const current=select.value;select.innerHTML='<option value="">Jump to a section…</option>';currentToolSections().filter(section=>!section.classList.contains('filter-hidden')).forEach((section,index)=>{if(!section.id)section.id='network-tool-section-'+(section.closest('.page')?.id||'page')+'-'+index;const option=document.createElement('option');option.value=section.id;option.textContent=section.querySelector('h2')?.textContent?.trim()||('Section '+(index+1));select.appendChild(option)});if(Array.from(select.options).some(option=>option.value===current))select.value=current}
function applyToolFilter(){const query=String($('toolFilter')?.value||'').trim().toLocaleLowerCase();currentToolSections().forEach(section=>section.classList.toggle('filter-hidden',!!query&&!String(section.textContent||'').toLocaleLowerCase().includes(query)));populateToolSections()}
function switchPage(name){document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));['network','terminal','wireless','ssh','devices'].forEach(p=>$(p+'Page').classList.toggle('hidden',p!==name));$('toolNavContext').textContent=pageLabels[name]||name;applyToolFilter();}
function selectTransport(t,save=true){state.transport=t;$('transportTcp').classList.toggle('active',t==='tcp');$('transportUdp').classList.toggle('active',t==='udp');$('tcpSettings').classList.toggle('hidden',t!=='tcp');$('udpSettings').classList.toggle('hidden',t!=='udp');if(t==='tcp'){setValue('lineEnding',state.tcp.lineEnding)}else{setValue('lineEnding',state.udp.lineEnding)}if(save)collectState();renderSession();}
function applyState(s){state=s||state;setValue('tcpHost',state.tcp.host);setValue('tcpPort',state.tcp.port);setValue('tcpTimeout',state.tcp.connectTimeoutMs);setValue('udpHost',state.udp.host);setValue('udpRemotePort',state.udp.remotePort);setValue('udpLocalPort',state.udp.localPort);setValue('tcpServerBind',state.tcpServer?.bindAddress||'0.0.0.0');setValue('tcpServerPort',state.tcpServer?.port??5000);setValue('frameMode',state.frameMode);setValue('frameEncoding',state.frameEncoding);setValue('frameText',state.frameText);setValue('diagnosticHost',state.diagnosticHost);setValue('diagnosticPort',state.diagnosticPort);setValue('diagnosticTimeout',state.diagnosticTimeoutMs);setValue('wirelessDuration',state.wirelessScanDurationMs);selectTransport(state.transport,false)}
function collectState(save=true){const le=$('lineEnding').value;state={transport:state.transport,tcp:{host:$('tcpHost').value.trim(),port:Number($('tcpPort').value||5025),connectTimeoutMs:Number($('tcpTimeout').value||2500),encoding:$('frameEncoding').value,lineEnding:state.transport==='tcp'?le:state.tcp.lineEnding},udp:{host:$('udpHost').value.trim(),remotePort:Number($('udpRemotePort').value||5000),localPort:Number($('udpLocalPort').value||0),encoding:$('frameEncoding').value,lineEnding:state.transport==='udp'?le:state.udp.lineEnding},tcpServer:{bindAddress:$('tcpServerBind').value.trim()||'0.0.0.0',port:Number($('tcpServerPort').value||0),encoding:$('frameEncoding').value,lineEnding:le},frameMode:$('frameMode').value,frameEncoding:$('frameEncoding').value,lineEnding:le,frameText:$('frameText').value,diagnosticHost:$('diagnosticHost').value.trim(),diagnosticPort:Number($('diagnosticPort').value||80),diagnosticTimeoutMs:Number($('diagnosticTimeout').value||2000),wirelessScanDurationMs:Number($('wirelessDuration').value||5000)};if(save)vscode.postMessage({type:'saveState',state});return state;}
function renderNetwork(){const a=network.adapters||[],n=network.neighbors||[];$('adapterCount').textContent=String(a.length);$('networkWarnings').innerHTML=(network.warnings||[]).map(w=>'<div class="warning">'+esc(w)+'</div>').join('');$('adapterTable').innerHTML=a.length?a.map(x=>'<tr><td><strong>'+esc(x.name)+'</strong><div class="muted small">'+esc(x.description)+'</div></td><td>'+esc(x.status)+'</td><td><code>'+esc(x.macAddress)+'</code><div class="muted small">'+esc(x.linkSpeed)+'</div></td><td>'+(x.ipv4||[]).map(esc).join('<br>')+'</td><td>'+(x.ipv6||[]).map(esc).join('<br>')+'</td><td>'+(x.gateways||[]).map(esc).join('<br>')+'</td><td>'+(x.dnsServers||[]).map(esc).join('<br>')+'</td></tr>').join(''):'<tr><td colspan="7" class="muted">No network adapter detected.</td></tr>';$('neighborTable').innerHTML=n.length?n.map(x=>'<tr><td>'+esc(x.interfaceAlias)+'</td><td><code>'+esc(x.ipAddress)+'</code></td><td><code>'+esc(x.linkLayerAddress)+'</code></td><td>'+esc(x.state)+'</td></tr>').join(''):'<tr><td colspan="4" class="muted">No local neighbor-cache entry.</td></tr>';applyToolFilter();}
function ageText(ts){if(!ts)return '—';const sec=Math.max(0,Math.round((Date.now()-Number(ts))/1000));return sec<2?'now':sec+' s ago'}
function renderServiceDiscovery(){const mdns=serviceDiscovery.mdns||[],ssdp=serviceDiscovery.ssdp||[];$('serviceCount').textContent=String(mdns.length+ssdp.length);$('serviceWarnings').innerHTML=(serviceDiscovery.warnings||[]).map(x=>'<div class="warning">'+esc(x)+'</div>').join('');$('mdnsTable').innerHTML=mdns.length?mdns.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.recordType)+'</td><td><code>'+esc(x.data)+'</code></td><td>'+esc(x.ttl)+'</td><td><code>'+esc(x.remoteAddress||'')+'</code></td></tr>').join(''):'<tr><td colspan="5" class="muted">No mDNS record collected yet.</td></tr>';$('ssdpTable').innerHTML=ssdp.length?ssdp.map(x=>'<tr><td><code>'+esc(x.remoteAddress)+'</code></td><td>'+esc(x.searchTarget)+'</td><td><code>'+esc(x.location)+'</code></td><td>'+esc(x.server)+'</td><td class="small"><code>'+esc(x.usn)+'</code></td></tr>').join(''):'<tr><td colspan="5" class="muted">No SSDP response collected yet.</td></tr>';applyToolFilter();}
function makeGattButton(address){const button=document.createElement('button');button.textContent='GATT';button.className='secondary';button.disabled=!address;button.addEventListener('click',()=>vscode.postMessage({type:'inspectBleGatt',address}));return button}
function renderWireless(){const w=wireless.wifi||[],b=wireless.ble||[],bt=wireless.bluetooth||[];$('wifiCount').textContent=String(w.length);$('bleCount').textContent=String(b.length);$('btCount').textContent=String(bt.length);$('wirelessWarnings').innerHTML=(wireless.warnings||[]).map(x=>'<div class="warning">'+esc(x)+'</div>').join('');$('wifiTable').innerHTML=w.length?w.map(x=>'<tr class="'+(x.lastSeen&&Date.now()-x.lastSeen>12000?'stale':'')+'"><td>'+esc(x.ssid)+'</td><td><code>'+esc(x.bssid)+'</code></td><td class="signal">'+esc(x.signalPercent===undefined?'':x.signalPercent+'%')+'</td><td>'+esc(x.channel??'')+'</td><td>'+esc(x.authentication)+'</td><td>'+esc(x.encryption)+'</td><td>'+esc(x.radioType)+'</td><td>'+esc(ageText(x.lastSeen))+'</td></tr>').join(''):'<tr><td colspan="8" class="muted">Run a wireless scan to list visible Wi-Fi networks.</td></tr>';
const bleBody=$('bleTable');bleBody.innerHTML='';if(b.length){for(const x of b){const tr=document.createElement('tr');if(x.timestamp&&Date.now()-x.timestamp>12000)tr.className='stale';const vals=[x.name||'<unnamed>',x.address,x.rssi===undefined?'':x.rssi+' dBm',x.connectable===undefined?'':(x.connectable?'Yes':'No'),ageText(x.timestamp)];vals.forEach((value,index)=>{const td=document.createElement('td');if(index===1){const code=document.createElement('code');code.textContent=value;td.appendChild(code)}else td.textContent=value;tr.appendChild(td)});const action=document.createElement('td');action.appendChild(makeGattButton(x.address));tr.appendChild(action);bleBody.appendChild(tr)}}else bleBody.innerHTML='<tr><td colspan="6" class="muted">No BLE advertisement captured yet. Run a scan; an empty result can be normal if nearby devices are not currently advertising.</td></tr>';
const btBody=$('btTable');btBody.innerHTML='';if(bt.length){for(const x of bt){const tr=document.createElement('tr');if(x.lastSeen&&Date.now()-x.lastSeen>12000)tr.className='stale';const vals=[x.name,x.address||'—',x.rssi===undefined?'—':x.rssi+' dBm',x.status,x.className,ageText(x.lastSeen),x.instanceId];vals.forEach((value,index)=>{const td=document.createElement('td');if(index===1||index===6){const code=document.createElement('code');code.textContent=value;td.appendChild(code);if(index===6)td.className='small'}else td.textContent=value;tr.appendChild(td)});const action=document.createElement('td');action.appendChild(makeGattButton(x.address||''));tr.appendChild(action);btBody.appendChild(tr)}}else btBody.innerHTML='<tr><td colspan="8" class="muted">No Bluetooth device reported by Windows.</td></tr>';renderWirelessMode();applyToolFilter();}
function renderWirelessMode(){const active=!!wirelessContinuous;$('wirelessModeBadge').classList.toggle('connected',active);$('wirelessModeText').textContent=active?'Continuous scan':'Single scan';$('startWirelessContinuous').disabled=active;$('stopWirelessContinuous').disabled=!active;}
function renderGatt(){const root=$('gattTree');root.innerHTML='';if(!bleGatt){$('gattStatus').textContent='No BLE device selected.';root.className='muted';root.textContent='Select GATT on a BLE device to inspect it.';return}$('gattStatus').textContent=(bleGatt.name||bleGatt.address)+' — '+(bleGatt.connectionStatus||'');root.className='';for(const service of bleGatt.services||[]){const block=document.createElement('div');block.className='gatt-service';const title=document.createElement('strong');title.textContent='Service '+service.uuid;block.appendChild(title);for(const characteristic of service.characteristics||[]){const row=document.createElement('div');row.className='gatt-char';const info=document.createElement('div');const id=document.createElement('code');id.textContent=characteristic.uuid;const props=document.createElement('div');props.className='muted small';props.textContent=(characteristic.properties||[]).join(', ')||'No properties';info.append(id,props);const actions=document.createElement('div');actions.className='device-actions';const plist=(characteristic.properties||[]).join(',').toLowerCase();if(plist.includes('read'))actions.appendChild(gattAction('Read','readBleGatt',service.uuid,characteristic.uuid));if(plist.includes('write'))actions.appendChild(gattAction('Write…','writeBleGatt',service.uuid,characteristic.uuid));if(plist.includes('notify')||plist.includes('indicate'))actions.appendChild(gattAction('Monitor 5 s','monitorBleGatt',service.uuid,characteristic.uuid));row.append(info,actions);block.appendChild(row)}root.appendChild(block)}if(!(bleGatt.services||[]).length){root.className='muted';root.textContent='No GATT service was returned by Windows.'}applyToolFilter();}
function gattAction(label,type,serviceUuid,characteristicUuid){const button=document.createElement('button');button.textContent=label;button.className='secondary';button.addEventListener('click',()=>vscode.postMessage({type,address:bleGatt?.address||'',serviceUuid,characteristicUuid}));return button}
function sshForm(){return {host:$('sshHost').value.trim(),hostName:$('sshHostName').value.trim(),user:$('sshUser').value.trim(),port:$('sshPort').value.trim(),identityFile:$('sshIdentityFile').value.trim(),identitiesOnly:$('sshIdentitiesOnly').value,proxyJump:$('sshProxyJump').value.trim()};}
function clearSshEditor(){setValue('sshBlockIndex','-1');['sshHost','sshHostName','sshUser','sshPort','sshIdentityFile','sshProxyJump'].forEach(id=>setValue(id,''));setValue('sshIdentitiesOnly','');$('sshHost').focus();}
function editSshAlias(a){setValue('sshBlockIndex',String(a.blockIndex));setValue('sshHost',a.host);setValue('sshHostName',a.hostName);setValue('sshUser',a.user);setValue('sshPort',a.port);setValue('sshIdentityFile',a.identityFile);setValue('sshIdentitiesOnly',a.identitiesOnly);setValue('sshProxyJump',a.proxyJump);switchPage('ssh');$('sshHost').focus();}
function suggestedAlias(name,address){let base=String(name||'').trim()||('device-'+String(address||'').replace(/[^A-Za-z0-9]+/g,'-'));base=base.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');return base||'ssh-device';}
function prepareSshAlias(address,name){clearSshEditor();setValue('sshHost',suggestedAlias(name,address));setValue('sshHostName',address||'');setValue('sshPort','22');switchPage('ssh');}
function sshAction(label,type,target,extra,klass){const b=document.createElement('button');b.textContent=label;b.className=klass||'secondary';b.addEventListener('click',()=>vscode.postMessage(Object.assign({type,target},extra||{})));return b;}
function sshCard(title,lines,actions){const d=document.createElement('div');d.className='device-card';const h=document.createElement('strong');h.textContent=title;d.appendChild(h);for(const line of lines.filter(Boolean)){const m=document.createElement('div');m.className='muted small';m.textContent=line;d.appendChild(m);}if(actions&&actions.length){const row=document.createElement('div');row.className='device-actions';for(const a of actions)row.appendChild(a);d.appendChild(row);}return d;}
function renderSsh(){const aliases=ssh.aliases||[],hosts=ssh.hosts||[],neighbors=ssh.neighbors||[];$('sshAliasCount').textContent=String(aliases.length);$('sshConfigPath').textContent=ssh.configPath||'~/.ssh/config';const ac=$('sshAliases');ac.innerHTML='';for(const a of aliases){const port=Number(a.port||22);const actions=a.editable?[sshAction('Connect','sshConnect',a.host),sshAction('Ping','sshPing',a.host),sshAction('Test :'+port,'sshTcpTest',a.host,{port}),sshAction('Inspect','sshInspect',a.host),sshAction('Test key','sshTestKey',a.host),sshAction('Use diagnostics','sshUseInDiagnostics',a.host,{port}),sshAction('Remote Linux target','sshUseAsRemoteTarget',a.host),sshAction('Add to CPM device','saveSshToDevice',a.host),sshAction('Install key','sshEnrollKey',a.host)]:[];if(a.editable){const edit=document.createElement('button');edit.textContent='Edit';edit.className='secondary';edit.onclick=()=>editSshAlias(a);actions.push(edit);actions.push(sshAction('Delete','deleteSshAlias',a.host,{blockIndex:a.blockIndex},'secondary'));}ac.appendChild(sshCard(a.host,[a.hostName||'(HostName inherited)',a.user?'User '+a.user:'',a.port?'Port '+a.port:'',a.identityFile?'Identity '+a.identityFile:'',a.proxyJump?'ProxyJump '+a.proxyJump:'',a.editable?'':'Wildcard/multi-host block: read only'],actions));}if(!aliases.length)ac.appendChild(sshCard('No explicit SSH aliases',['Use New alias or add a discovered neighbour.'],[]));const hc=$('sshHosts');hc.innerHTML='';for(const h of hosts){const target=h.name||h.address;const add=document.createElement('button');add.textContent='Add SSH device';add.className='secondary';add.onclick=()=>prepareSshAlias(h.address,h.name);hc.appendChild(sshCard(target,[h.address,h.source],[sshAction('Connect','sshConnect',target),sshAction('Ping','sshPing',target),add]));}if(!hosts.length)hc.appendChild(sshCard('No custom hosts aliases',['No non-localhost entries found.'],[]));const nc=$('sshNeighbors');nc.innerHTML='';for(const n of neighbors){const add=document.createElement('button');add.textContent='Add SSH device';add.className='secondary';add.onclick=()=>prepareSshAlias(n.address,n.name);nc.appendChild(sshCard(n.name||n.address,[n.address,n.mac||'',n.source],[sshAction('Ping','sshPing',n.address),sshAction('Test :22','sshTcpTest',n.address,{port:22}),sshAction('Connect','sshConnect',n.address),add]));}if(!neighbors.length)nc.appendChild(sshCard('No neighbours discovered',['ARP/ND cache is empty or unavailable.'],[]));}
function endpointDetail(endpoint){if(!endpoint)return'';if(endpoint.kind==='serial'){const s=endpoint.settings||{};return (s.portName||'COM')+' · '+(s.baudRate||'')+' baud · '+(s.dataBits||'')+(s.parity?' '+s.parity:'')+(s.stopBits?' '+s.stopBits:'')}if(endpoint.kind==='visa'){const s=endpoint.settings||{};return s.resource||'VISA resource'}if(endpoint.kind==='tcp'){const s=endpoint.settings||{};return (s.host||'host')+':'+(s.port||'')}if(endpoint.kind==='udp'){const s=endpoint.settings||{};return (s.host||'host')+':'+(s.remotePort||'')+(s.localPort?' · local '+s.localPort:'')}if(endpoint.kind==='ssh'){return (endpoint.user?endpoint.user+'@':'')+(endpoint.hostName||endpoint.alias||'SSH')+':'+(endpoint.port||22)}return endpoint.kind||''}
function endpointLabel(kind){return kind==='serial'?'COM':kind==='visa'?'VISA':kind.toUpperCase()}
function renderDeviceDiagnostic(container,result){if(!result)return;const box=document.createElement('div');box.className='result small '+(result.status==='pass'?'diag-pass':result.status==='fail'?'diag-fail':'diag-warn');box.style.marginTop='9px';for(const item of result.items||[]){const line=document.createElement('div');line.textContent=(item.status==='pass'?'✓ ':item.status==='fail'?'✗ ':'⚠ ')+item.endpoint+' — '+item.summary;line.className=item.status==='pass'?'diag-pass':item.status==='fail'?'diag-fail':'diag-warn';box.appendChild(line)}container.appendChild(box)}
function renderDevices(){const root=$('unifiedDevices');$('deviceCount').textContent=String((devices||[]).length);root.innerHTML='';for(const d of devices||[]){const card=document.createElement('div');card.className='device-card';const title=document.createElement('strong');title.textContent=d.name;card.appendChild(title);if(d.description){const desc=document.createElement('div');desc.className='muted small';desc.textContent=d.description;card.appendChild(desc)}if((d.tags||[]).length){const tags=document.createElement('div');tags.className='tag-row';for(const t of d.tags){const el=document.createElement('span');el.className='tag';el.textContent=t;tags.appendChild(el)}card.appendChild(tags)}const list=document.createElement('div');list.className='endpoint-list';const entries=Object.entries(d.endpoints||{}).filter(([,e])=>!!e);if(!entries.length){const empty=document.createElement('div');empty.className='muted small';empty.textContent='No endpoint yet. Add one from Instrument Diagnostics, TCP/UDP terminal or SSH Devices.';list.appendChild(empty)}for(const [kind,endpoint] of entries){const row=document.createElement('div');row.className='endpoint-row';const head=document.createElement('div');head.className='endpoint-head';const info=document.createElement('div');const label=document.createElement('div');label.className='endpoint-kind';label.textContent=endpointLabel(kind);const detail=document.createElement('div');detail.className='muted small';detail.textContent=endpointDetail(endpoint);info.append(label,detail);const actions=document.createElement('div');actions.className='device-actions';const open=document.createElement('button');open.textContent='Open';open.addEventListener('click',()=>vscode.postMessage({type:'openDeviceEndpoint',id:d.id,kind}));const remove=document.createElement('button');remove.textContent='Remove';remove.className='secondary';remove.addEventListener('click',()=>vscode.postMessage({type:'removeDeviceEndpoint',id:d.id,kind}));actions.append(open,remove);head.append(info,actions);row.appendChild(head);list.appendChild(row)}card.appendChild(list);renderDeviceDiagnostic(card,deviceDiagnostics[d.id]);const actions=document.createElement('div');actions.className='device-actions';const diagnose=document.createElement('button');diagnose.textContent='Diagnose';diagnose.addEventListener('click',()=>vscode.postMessage({type:'diagnoseUnifiedDevice',id:d.id}));const edit=document.createElement('button');edit.textContent='Edit';edit.className='secondary';edit.addEventListener('click',()=>vscode.postMessage({type:'editUnifiedDevice',id:d.id}));const del=document.createElement('button');del.textContent='Delete';del.className='secondary';del.addEventListener('click',()=>vscode.postMessage({type:'deleteUnifiedDevice',id:d.id}));actions.append(diagnose,edit,del);card.appendChild(actions);root.appendChild(card)}if(!(devices||[]).length)root.appendChild(sshCard('No unified CPM devices yet',['Create a device here, or use “Add endpoint to CPM device” from the COM/VISA or TCP/UDP tools.'],[]));applyToolFilter()}
function renderSession(){const active=state.transport==='tcp'?session.tcpConnected:session.udpBound;let target=state.transport==='tcp'?session.tcpTarget:session.udpTarget;if(state.transport==='udp'&&session.udpBound&&session.udpLocalPort)target='local :'+session.udpLocalPort+' → '+(target||'UDP');$('networkBadge').classList.toggle('connected',!!active);$('networkBadgeText').textContent=active?('Active — '+(target||state.transport.toUpperCase())):'Disconnected';$('networkSend').disabled=!active;$('networkDisconnect').disabled=!active;$('networkConnect').disabled=!!active;$('transportTcp').disabled=!!active;$('transportUdp').disabled=!!active;const server=!!session.tcpServerListening;$('tcpServerBadge').classList.toggle('connected',server);$('tcpServerBadgeText').textContent=server?'Listening':'Stopped';$('tcpServerInfo').textContent=server?((session.tcpServerTarget||'TCP listener')+' — '+Number(session.tcpServerClients||0)+' connected client(s)'):'No TCP listener is active.';$('startTcpServer').disabled=server;$('stopTcpServer').disabled=!server;$('sendTcpServer').disabled=!server||Number(session.tcpServerClients||0)===0;$('tcpServerBind').disabled=server;$('tcpServerPort').disabled=server;}
function appendLog(kind,line,detail=''){const text='['+new Date().toLocaleTimeString()+'] '+line+(detail?'\\n    '+detail:'');logLines.push(text);if(logLines.length>1000)logLines=logLines.slice(-1000);const div=document.createElement('div');div.className=kind;div.textContent=text;$('networkConsole').appendChild(div);$('networkConsole').scrollTop=$('networkConsole').scrollHeight;}
function busy(op,on){if(op==='network'){$('refreshNetwork').disabled=on;$('status').textContent=on?'Reading network configuration…':''}if(op==='wireless'){$('scanWireless').disabled=on||wirelessContinuous;$('scanWirelessInner').disabled=on||wirelessContinuous;$('status').textContent=on?'Scanning Wi-Fi / BLE / Bluetooth…':''}if(op==='diagnostic'){$('ping').disabled=on;$('dns').disabled=on;$('tcpTest').disabled=on}if(op==='connect'){$('networkConnect').disabled=on}if(op==='tcpServer'){$('startTcpServer').disabled=on||!!session.tcpServerListening}if(op==='serviceDiscovery'){$('discoverServices').disabled=on;$('status').textContent=on?'Discovering mDNS / SSDP services…':''}if(op==='gatt'){$('gattStatus').textContent=on?'Running BLE GATT operation…':(bleGatt?((bleGatt.name||bleGatt.address)+' — '+(bleGatt.connectionStatus||'')):'No BLE device selected.')}if(op==='deviceDiagnostic'){$('diagnoseAllDevices').disabled=on}if(op==='ssh'){$('refreshSsh').disabled=on;$('sshStatus').textContent=on?'Reading OpenSSH configuration…':''}if(op==='sshDiagnostic'){$('sshStatus').textContent=on?'Running SSH/network diagnostic…':''}}
function post(type){vscode.postMessage({type,state:collectState(false)})}
$('toolFilter').addEventListener('input',applyToolFilter);$('toolSectionNav').addEventListener('change',()=>{const id=$('toolSectionNav').value;if(!id)return;document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})});populateToolSections();document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>switchPage(b.dataset.page)));$('transportTcp').addEventListener('click',()=>selectTransport('tcp'));$('transportUdp').addEventListener('click',()=>selectTransport('udp'));$('refreshNetwork').addEventListener('click',()=>vscode.postMessage({type:'refreshNetwork'}));$('discoverServices').addEventListener('click',()=>vscode.postMessage({type:'discoverServices'}));$('scanWireless').addEventListener('click',()=>post('scanWireless'));$('scanWirelessInner').addEventListener('click',()=>post('scanWireless'));$('startWirelessContinuous').addEventListener('click',()=>post('startContinuousWireless'));$('stopWirelessContinuous').addEventListener('click',()=>vscode.postMessage({type:'stopContinuousWireless'}));$('saveNetworkToDevice').addEventListener('click',()=>post('saveCurrentNetworkToDevice'));$('networkConnect').addEventListener('click',()=>post('connectNetwork'));$('networkDisconnect').addEventListener('click',()=>vscode.postMessage({type:'disconnectNetwork',transport:state.transport}));$('networkSend').addEventListener('click',()=>post('sendNetworkFrame'));$('startTcpServer').addEventListener('click',()=>post('startTcpServer'));$('stopTcpServer').addEventListener('click',()=>vscode.postMessage({type:'stopTcpServer'}));$('sendTcpServer').addEventListener('click',()=>post('sendTcpServer'));$('ping').addEventListener('click',()=>post('ping'));$('dns').addEventListener('click',()=>post('dns'));$('tcpTest').addEventListener('click',()=>post('tcpTest'));$('openInstrument').addEventListener('click',()=>vscode.postMessage({type:'openInstrumentDiagnostics'}));$('copyNetworkLog').addEventListener('click',()=>vscode.postMessage({type:'copyText',text:logLines.join('\\n')}));$('clearNetworkLog').addEventListener('click',()=>{logLines=[];$('networkConsole').innerHTML=''});
$('newUnifiedDevice').addEventListener('click',()=>vscode.postMessage({type:'createUnifiedDevice'}));$('diagnoseAllDevices').addEventListener('click',()=>vscode.postMessage({type:'diagnoseAllDevices'}));$('importDevices').addEventListener('click',()=>vscode.postMessage({type:'importDevices'}));$('exportDevices').addEventListener('click',()=>vscode.postMessage({type:'exportDevices'}));$('refreshSsh').addEventListener('click',()=>vscode.postMessage({type:'refreshSsh'}));$('newSshAlias').addEventListener('click',clearSshEditor);$('clearSshEditor').addEventListener('click',clearSshEditor);$('saveSshAlias').addEventListener('click',()=>vscode.postMessage({type:'saveSshAlias',form:sshForm(),blockIndex:Number($('sshBlockIndex').value)}));$('pickSshIdentity').addEventListener('click',()=>vscode.postMessage({type:'sshPickIdentity'}));$('generateSshKey').addEventListener('click',()=>vscode.postMessage({type:'sshGenerateKey'}));$('enrollSshKey').addEventListener('click',()=>vscode.postMessage({type:'sshEnrollKey'}));
['tcpHost','tcpPort','tcpTimeout','udpHost','udpRemotePort','udpLocalPort','tcpServerBind','tcpServerPort','frameMode','frameEncoding','lineEnding','frameText','diagnosticHost','diagnosticPort','diagnosticTimeout','wirelessDuration'].forEach(id=>$(id).addEventListener('change',()=>collectState()));$('frameText').addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();if(!$('networkSend').disabled)post('sendNetworkFrame')}});
window.addEventListener('message',event=>{const m=event.data||{};if(m.type==='state'){if(m.state)applyState(m.state);network=m.network||network;wireless=m.wireless||wireless;serviceDiscovery=m.serviceDiscovery||serviceDiscovery;bleGatt=m.bleGatt??bleGatt;wirelessContinuous=!!m.wirelessContinuous;session=m.session||session;ssh=m.ssh||ssh;devices=m.devices||devices;renderNetwork();renderServiceDiscovery();renderWireless();renderGatt();renderSsh();renderDevices();renderSession()}else if(m.type==='networkDiscovery'){network=m.network||network;renderNetwork()}else if(m.type==='serviceDiscovery'){serviceDiscovery=m.discovery||serviceDiscovery;renderServiceDiscovery()}else if(m.type==='sshData'){ssh=m.ssh||ssh;renderSsh()}else if(m.type==='deviceProfiles'){devices=m.devices||[];renderDevices()}else if(m.type==='deviceDiagnosticResult'){deviceDiagnostics[m.id]=m.result;renderDevices()}else if(m.type==='wirelessDiscovery'){wireless=m.wireless||wireless;if(typeof m.continuous==='boolean')wirelessContinuous=m.continuous;renderWireless();switchPage('wireless')}else if(m.type==='wirelessContinuousState'){wirelessContinuous=!!m.active;renderWirelessMode()}else if(m.type==='bleGattInspection'){bleGatt=m.inspection||null;renderGatt();switchPage('wireless')}else if(m.type==='bleGattValue'){const r=m.result||{};const samples=r.samples||[];let text=(m.operation||'GATT')+' — '+(r.status||'')+'\\n'+(r.hex?'HEX: '+r.hex+'\\n':'')+(r.text?'Text: '+printable(r.text)+'\\n':'');if(samples.length)text+='Samples: '+samples.length+'\\n'+samples.map(x=>'['+new Date(x.timestamp).toLocaleTimeString()+'] '+(x.hex||'')+(x.text?'  '+printable(x.text):'')).join('\\n');$('gattResult').className='result rx';$('gattResult').textContent=text.trim()||'GATT operation completed.'}else if(m.type==='sessionState'){session=m.session||session;renderSession()}else if(m.type==='networkSessionEvent'){const e=m.event||{};if(e.type==='rx')appendLog('rx','RX ['+(e.transport||'').toUpperCase()+' '+(e.target||'')+'] '+(e.bytes||0)+' B: '+(printable(e.text)||'<binary/empty>'),e.hex?'HEX: '+e.hex:'');else if(e.type==='tx')appendLog('tx','TX ['+(e.transport||'').toUpperCase()+' '+(e.target||'')+'] '+(e.bytes||0)+' B',e.message||'');else if(e.type==='error')appendLog('err','ERROR ['+(e.transport||'').toUpperCase()+']: '+(e.message||'Unknown error'));else appendLog('meta',(e.type||'network')+' '+(e.target||'')+(e.message?' — '+e.message:''))}else if(m.type==='frameSent')appendLog('meta','Write complete: '+m.bytesWritten+' B');else if(m.type==='serverFrameSent')appendLog('meta','TCP server broadcast: '+m.bytesPerClient+' B × '+m.clients+' client(s)');else if(m.type==='diagnosticResult'){const r=m.result||{};$('diagnosticResult').className='result '+(r.ok?'rx':'err');$('diagnosticResult').textContent=(r.summary||'')+'\\n'+(r.detail||'')+'\\nElapsed: '+(r.elapsedMs||0)+' ms'}else if(m.type==='sshDiagnosticResult'){const r=m.result||{};$('sshDiagnosticResult').className='result '+(r.ok?'rx':'err');$('sshDiagnosticResult').textContent=(r.summary||'')+'\\n'+(r.detail||'')+'\\nElapsed: '+(r.elapsedMs||0)+' ms'}else if(m.type==='identitySelected'){setValue('sshIdentityFile',m.path||'')}else if(m.type==='remoteTargetResult'){$('sshDiagnosticResult').className='result rx';$('sshDiagnosticResult').textContent='Remote Linux target for '+(m.project||'project')+': '+(m.target||'')}else if(m.type==='navigate'){switchPage(m.page||'network')}else if(m.type==='busy')busy(m.operation,!!m.busy);else if(m.type==='error'){appendLog('err','ERROR: '+m.message);$('gattResult').className='result err';$('gattResult').textContent='ERROR: '+m.message;$('sshDiagnosticResult').className='result err';$('sshDiagnosticResult').textContent='ERROR: '+m.message}});
applyState(state);renderNetwork();renderServiceDiscovery();renderWireless();renderGatt();renderSsh();renderDevices();renderSession();vscode.postMessage({type:'ready'});
})();
</script>
</body></html>`;
  }
}


function mergeWirelessDiscovery(previous: WirelessDiscoveryResult, fresh: WirelessDiscoveryResult, ttlMs: number): WirelessDiscoveryResult {
  const now = Date.now();
  const wifi = new Map<string, any>();
  for (const item of previous.wifi ?? []) if (now - Number(item.lastSeen ?? 0) <= ttlMs) wifi.set(`${item.ssid}|${item.bssid}`.toLocaleLowerCase(), item);
  for (const item of fresh.wifi ?? []) wifi.set(`${item.ssid}|${item.bssid}`.toLocaleLowerCase(), { ...item, lastSeen: item.lastSeen ?? now });
  const ble = new Map<string, any>();
  for (const item of previous.ble ?? []) if (now - Number(item.timestamp ?? 0) <= ttlMs) ble.set(String(item.address).toLocaleLowerCase(), item);
  for (const item of fresh.ble ?? []) ble.set(String(item.address).toLocaleLowerCase(), { ...item, timestamp: item.timestamp ?? now });
  const bluetooth = new Map<string, any>();
  for (const item of previous.bluetooth ?? []) {
    const key = String(item.address || item.instanceId || item.name).toLocaleLowerCase();
    if (now - Number(item.lastSeen ?? 0) <= ttlMs) bluetooth.set(key, item);
  }
  for (const item of fresh.bluetooth ?? []) {
    const key = String(item.address || item.instanceId || item.name).toLocaleLowerCase();
    bluetooth.set(key, { ...item, lastSeen: item.lastSeen ?? now });
  }
  return {
    wifi: Array.from(wifi.values()).sort((a, b) => Number(b.signalPercent ?? -999) - Number(a.signalPercent ?? -999)),
    ble: Array.from(ble.values()).sort((a, b) => Number(b.rssi ?? -999) - Number(a.rssi ?? -999)),
    bluetooth: Array.from(bluetooth.values()),
    warnings: fresh.warnings ?? []
  };
}

function splitTags(value: unknown): string[] {
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function normalizeState(raw?: any): NetworkPanelState {
  const tcp = raw?.tcp ?? {};
  const udp = raw?.udp ?? {};
  const tcpServer = raw?.tcpServer ?? {};
  const frameEncoding: FrameEncoding = raw?.frameEncoding === 'utf8' || raw?.frameEncoding === 'latin1' ? raw.frameEncoding : 'ascii';
  const transport: NetworkTransport = raw?.transport === 'udp' ? 'udp' : 'tcp';
  const lineEnding = normalizeLineEnding(raw?.lineEnding ?? (transport === 'tcp' ? tcp.lineEnding : udp.lineEnding));
  return {
    transport,
    tcp: {
      host: String(tcp.host ?? DEFAULT_STATE.tcp.host),
      port: clampNumber(tcp.port, 1, 65535, DEFAULT_STATE.tcp.port),
      connectTimeoutMs: clampNumber(tcp.connectTimeoutMs, 100, 120000, DEFAULT_STATE.tcp.connectTimeoutMs),
      encoding: frameEncoding,
      lineEnding: normalizeLineEnding(tcp.lineEnding ?? DEFAULT_STATE.tcp.lineEnding)
    },
    udp: {
      host: String(udp.host ?? DEFAULT_STATE.udp.host),
      remotePort: clampNumber(udp.remotePort, 1, 65535, DEFAULT_STATE.udp.remotePort),
      localPort: clampNumber(udp.localPort, 0, 65535, DEFAULT_STATE.udp.localPort),
      encoding: frameEncoding,
      lineEnding: normalizeLineEnding(udp.lineEnding ?? DEFAULT_STATE.udp.lineEnding)
    },
    tcpServer: {
      bindAddress: String(tcpServer.bindAddress ?? DEFAULT_STATE.tcpServer.bindAddress),
      port: clampNumber(tcpServer.port, 0, 65535, DEFAULT_STATE.tcpServer.port),
      encoding: frameEncoding,
      lineEnding
    },
    frameMode: raw?.frameMode === 'hex' ? 'hex' : 'text',
    frameEncoding,
    lineEnding,
    frameText: String(raw?.frameText ?? DEFAULT_STATE.frameText),
    diagnosticHost: String(raw?.diagnosticHost ?? DEFAULT_STATE.diagnosticHost),
    diagnosticPort: clampNumber(raw?.diagnosticPort, 1, 65535, DEFAULT_STATE.diagnosticPort),
    diagnosticTimeoutMs: clampNumber(raw?.diagnosticTimeoutMs, 100, 30000, DEFAULT_STATE.diagnosticTimeoutMs),
    wirelessScanDurationMs: clampNumber(raw?.wirelessScanDurationMs, 1000, 15000, DEFAULT_STATE.wirelessScanDurationMs)
  };
}

function normalizeLineEnding(value: unknown): LineEnding {
  return value === 'none' || value === 'cr' || value === 'crlf' ? value : 'lf';
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let index = 0; index < 24; index++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}
