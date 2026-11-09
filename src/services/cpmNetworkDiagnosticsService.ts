import * as dgram from 'dgram';
import * as dns from 'dns';
import * as net from 'net';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { FrameEncoding, LineEnding } from './cpmInstrumentService';

const execFileAsync = promisify(execFile);

export type NetworkTransport = 'tcp' | 'udp' | 'tcp-server';

export interface NetworkAdapterInfo {
  name: string;
  description: string;
  status: string;
  macAddress: string;
  linkSpeed: string;
  ipv4: string[];
  ipv6: string[];
  gateways: string[];
  dnsServers: string[];
}

export interface NetworkNeighborInfo {
  interfaceAlias: string;
  ipAddress: string;
  linkLayerAddress: string;
  state: string;
}

export interface NetworkDiscoveryResult {
  adapters: NetworkAdapterInfo[];
  neighbors: NetworkNeighborInfo[];
  warnings: string[];
}

export interface WifiNetworkInfo {
  ssid: string;
  bssid: string;
  signalPercent?: number;
  channel?: number;
  authentication: string;
  encryption: string;
  radioType: string;
  lastSeen?: number;
}

export interface BleAdvertisementInfo {
  address: string;
  name: string;
  rssi?: number;
  connectable?: boolean;
  timestamp?: number;
}

export interface BluetoothDeviceInfo {
  name: string;
  instanceId: string;
  status: string;
  className: string;
  address?: string;
  rssi?: number;
  rssiSource?: 'ble-advertisement';
  lastSeen?: number;
}

export interface WirelessDiscoveryResult {
  wifi: WifiNetworkInfo[];
  ble: BleAdvertisementInfo[];
  bluetooth: BluetoothDeviceInfo[];
  warnings: string[];
}

export interface TcpCommunicationSettings {
  host: string;
  port: number;
  connectTimeoutMs: number;
  encoding: FrameEncoding;
  lineEnding: LineEnding;
}

export interface UdpCommunicationSettings {
  host: string;
  remotePort: number;
  localPort: number;
  encoding: FrameEncoding;
  lineEnding: LineEnding;
}

export interface TcpServerSettings {
  bindAddress: string;
  port: number;
  encoding: FrameEncoding;
  lineEnding: LineEnding;
}

export interface NetworkSessionState {
  tcpConnected: boolean;
  tcpTarget?: string;
  tcpOpenedAt?: number;
  udpBound: boolean;
  udpTarget?: string;
  udpLocalPort?: number;
  udpOpenedAt?: number;
  tcpServerListening: boolean;
  tcpServerTarget?: string;
  tcpServerOpenedAt?: number;
  tcpServerClients: number;
}

export interface NetworkSessionEvent {
  type: 'tcp-connected' | 'tcp-disconnected' | 'udp-bound' | 'udp-closed' | 'tcp-server-started' | 'tcp-server-stopped' | 'tcp-client-connected' | 'tcp-client-disconnected' | 'rx' | 'tx' | 'error';
  transport?: NetworkTransport;
  target?: string;
  bytes?: number;
  text?: string;
  hex?: string;
  message?: string;
  timestamp: number;
}


export interface MdnsRecordInfo {
  name: string;
  recordType: string;
  data: string;
  ttl: number;
  remoteAddress?: string;
}

export interface SsdpDeviceInfo {
  location: string;
  searchTarget: string;
  usn: string;
  server: string;
  cacheControl: string;
  remoteAddress: string;
}

export interface ServiceDiscoveryResult {
  mdns: MdnsRecordInfo[];
  ssdp: SsdpDeviceInfo[];
  warnings: string[];
}

export interface BleGattCharacteristicInfo {
  uuid: string;
  handle?: number;
  properties: string[];
}

export interface BleGattServiceInfo {
  uuid: string;
  handle?: number;
  characteristics: BleGattCharacteristicInfo[];
}

export interface BleGattInspectionResult {
  address: string;
  name: string;
  connectionStatus: string;
  services: BleGattServiceInfo[];
}

export interface BleGattValueResult {
  address: string;
  serviceUuid: string;
  characteristicUuid: string;
  status: string;
  hex: string;
  text: string;
  samples?: Array<{ timestamp: number; hex: string; text: string }>;
}

export interface HostDiagnosticResult {
  kind: 'ping' | 'dns' | 'tcp-test';
  ok: boolean;
  summary: string;
  detail: string;
  elapsedMs: number;
}

export class CpmNetworkDiagnosticsService implements vscode.Disposable {
  private disposed = false;
  private tcpSocket?: net.Socket;
  private tcpSettings?: TcpCommunicationSettings;
  private tcpOpenedAt?: number;
  private udpSocket?: dgram.Socket;
  private udpSettings?: UdpCommunicationSettings;
  private udpOpenedAt?: number;
  private tcpServer?: net.Server;
  private tcpServerSettings?: TcpServerSettings;
  private tcpServerOpenedAt?: number;
  private readonly tcpServerClients = new Set<net.Socket>();
  private readonly eventEmitter = new vscode.EventEmitter<NetworkSessionEvent>();
  readonly onDidSessionEvent = this.eventEmitter.event;

  constructor(private readonly output: vscode.OutputChannel) {}

  dispose(): void {
    this.disposed = true;
    void this.closeAll();
    this.eventEmitter.dispose();
  }

  getSessionState(): NetworkSessionState {
    return {
      tcpConnected: Boolean(this.tcpSocket && !this.tcpSocket.destroyed && this.tcpSettings),
      tcpTarget: this.tcpSettings ? `${this.tcpSettings.host}:${this.tcpSettings.port}` : undefined,
      tcpOpenedAt: this.tcpOpenedAt,
      udpBound: Boolean(this.udpSocket && this.udpSettings),
      udpTarget: this.udpSettings ? `${this.udpSettings.host}:${this.udpSettings.remotePort}` : undefined,
      udpLocalPort: this.udpSettings?.localPort,
      udpOpenedAt: this.udpOpenedAt,
      tcpServerListening: Boolean(this.tcpServer?.listening && this.tcpServerSettings),
      tcpServerTarget: this.tcpServerSettings ? `${this.tcpServerSettings.bindAddress}:${this.tcpServerSettings.port}` : undefined,
      tcpServerOpenedAt: this.tcpServerOpenedAt,
      tcpServerClients: this.tcpServerClients.size
    };
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled([this.closeTcpSession(), this.closeUdpSession(), this.stopTcpServer()]);
  }

  async discoverNetwork(): Promise<NetworkDiscoveryResult> {
    const result: NetworkDiscoveryResult = { adapters: [], neighbors: [], warnings: [] };
    if (process.platform === 'win32') {
      try { result.adapters = await this.discoverWindowsAdapters(); }
      catch (error) { result.warnings.push(`Windows adapter discovery failed: ${errorMessage(error)}`); }
      try { result.neighbors = await this.discoverWindowsNeighbors(); }
      catch (error) { result.warnings.push(`Neighbor-table discovery failed: ${errorMessage(error)}`); }
    }
    if (!result.adapters.length) result.adapters = discoverNodeAdapters();
    return result;
  }

  async scanWireless(durationMs = 3500): Promise<WirelessDiscoveryResult> {
    const result: WirelessDiscoveryResult = { wifi: [], ble: [], bluetooth: [], warnings: [] };
    if (process.platform !== 'win32') {
      result.warnings.push('Wi-Fi/BLE/Bluetooth discovery is currently implemented for Windows. Network-interface diagnostics remain available on this platform.');
      return result;
    }
    const [wifi, ble, bluetooth] = await Promise.allSettled([
      this.scanWindowsWifi(),
      this.scanWindowsBle(Math.max(1000, Math.min(15000, Math.round(durationMs)))),
      this.discoverWindowsBluetooth()
    ]);
    const scanTimestamp = Date.now();
    if (wifi.status === 'fulfilled') result.wifi = wifi.value.map((item) => ({ ...item, lastSeen: scanTimestamp })); else result.warnings.push(`Wi-Fi scan failed: ${shortDiagnosticError(wifi.reason)}`);
    if (ble.status === 'fulfilled') result.ble = ble.value; else result.warnings.push(`BLE advertisement scan failed: ${shortDiagnosticError(ble.reason)}`);
    if (bluetooth.status === 'fulfilled') result.bluetooth = bluetooth.value; else result.warnings.push(`Bluetooth discovery failed: ${shortDiagnosticError(bluetooth.reason)}`);

    const bleByAddress = new Map(result.ble.map((item) => [normalizeBluetoothAddress(item.address), item]));
    const bleByName = new Map(result.ble.filter((item) => item.name.trim()).map((item) => [item.name.trim().toLocaleLowerCase(), item]));
    result.bluetooth = result.bluetooth.map((item) => {
      const match = (item.address ? bleByAddress.get(normalizeBluetoothAddress(item.address)) : undefined)
        ?? (item.name ? bleByName.get(item.name.trim().toLocaleLowerCase()) : undefined);
      return match?.rssi === undefined ? item : { ...item, rssi: match.rssi, rssiSource: 'ble-advertisement' as const, lastSeen: match.timestamp ?? scanTimestamp };
    });
    if (ble.status === 'fulfilled' && result.ble.length === 0) {
      result.warnings.push(`No BLE advertisement was captured during the ${Math.max(1000, Math.min(15000, Math.round(durationMs)))} ms scan. This can be normal if nearby devices are not advertising; try a longer scan and verify that Bluetooth is enabled.`);
    }
    return result;
  }

  async openTcpSession(settings: TcpCommunicationSettings): Promise<NetworkSessionState> {
    validateTcpSettings(settings);
    await this.closeTcpSession();
    const socket = new net.Socket();
    this.tcpSocket = socket;
    this.tcpSettings = { ...settings };
    const target = `${settings.host}:${settings.port}`;
    socket.setNoDelay(true);
    socket.on('data', (data) => this.emit({ type: 'rx', transport: 'tcp', target, bytes: data.length, text: decodeFrame(data, settings.encoding), hex: formatHex(data), timestamp: Date.now() }));
    socket.on('error', (error) => this.emit({ type: 'error', transport: 'tcp', target, message: error.message, timestamp: Date.now() }));
    socket.on('close', () => {
      const wasCurrent = this.tcpSocket === socket;
      if (wasCurrent) {
        this.tcpSocket = undefined; this.tcpSettings = undefined; this.tcpOpenedAt = undefined;
        this.emit({ type: 'tcp-disconnected', transport: 'tcp', target, timestamp: Date.now() });
      }
    });
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new Error(`TCP connection to ${target} timed out after ${settings.connectTimeoutMs} ms.`));
      }, settings.connectTimeoutMs);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.off('error', initialError);
        if (error) reject(error); else resolve();
      };
      const initialError = (error: Error) => finish(error);
      socket.once('error', initialError);
      socket.connect(settings.port, settings.host, () => finish());
    });
    this.tcpOpenedAt = Date.now();
    this.emit({ type: 'tcp-connected', transport: 'tcp', target, timestamp: this.tcpOpenedAt });
    return this.getSessionState();
  }

  async closeTcpSession(): Promise<void> {
    const socket = this.tcpSocket;
    const settings = this.tcpSettings;
    if (!socket) { this.tcpSettings = undefined; this.tcpOpenedAt = undefined; return; }
    this.tcpSocket = undefined;
    this.tcpSettings = undefined;
    this.tcpOpenedAt = undefined;
    const target = settings ? `${settings.host}:${settings.port}` : undefined;
    await new Promise<void>((resolve) => {
      if (socket.destroyed) { resolve(); return; }
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      socket.once('close', finish);
      socket.end();
      setTimeout(() => { if (!socket.destroyed) socket.destroy(); finish(); }, 500);
    });
    if (target) this.emit({ type: 'tcp-disconnected', transport: 'tcp', target, timestamp: Date.now() });
  }

  async writeTcp(payload: Buffer): Promise<number> {
    const socket = this.tcpSocket;
    const settings = this.tcpSettings;
    if (!socket || socket.destroyed || !settings) throw new Error('No TCP session is connected.');
    const framed = appendLineEnding(payload, settings.lineEnding);
    if (!framed.length) throw new Error('The TCP frame is empty.');
    await new Promise<void>((resolve, reject) => socket.write(framed, (error) => error ? reject(error) : resolve()));
    this.emit({ type: 'tx', transport: 'tcp', target: `${settings.host}:${settings.port}`, bytes: framed.length, timestamp: Date.now() });
    return framed.length;
  }

  async openUdpSession(settings: UdpCommunicationSettings): Promise<NetworkSessionState> {
    validateUdpSettings(settings);
    await this.closeUdpSession();
    const socket = dgram.createSocket('udp4');
    this.udpSocket = socket;
    this.udpSettings = { ...settings };
    const target = `${settings.host}:${settings.remotePort}`;
    socket.on('message', (data, remote) => this.emit({
      type: 'rx', transport: 'udp', target: `${remote.address}:${remote.port}`, bytes: data.length,
      text: decodeFrame(data, settings.encoding), hex: formatHex(data), timestamp: Date.now()
    }));
    socket.on('error', (error) => this.emit({ type: 'error', transport: 'udp', target, message: error.message, timestamp: Date.now() }));
    socket.on('close', () => {
      if (this.udpSocket === socket) {
        this.udpSocket = undefined; this.udpSettings = undefined; this.udpOpenedAt = undefined;
        this.emit({ type: 'udp-closed', transport: 'udp', target, timestamp: Date.now() });
      }
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => { socket.off('listening', onListening); reject(error); };
        const onListening = () => { socket.off('error', onError); resolve(); };
        socket.once('error', onError);
        socket.once('listening', onListening);
        socket.bind(settings.localPort, '0.0.0.0');
      });
    } catch (error) {
      if (this.udpSocket === socket) { this.udpSocket = undefined; this.udpSettings = undefined; }
      try { socket.close(); } catch { /* socket may not have reached the bound state */ }
      throw error;
    }
    socket.setBroadcast(true);
    const address = socket.address();
    this.udpSettings.localPort = typeof address === 'object' ? address.port : settings.localPort;
    this.udpOpenedAt = Date.now();
    this.emit({ type: 'udp-bound', transport: 'udp', target, message: `Local UDP port ${this.udpSettings.localPort}`, timestamp: this.udpOpenedAt });
    return this.getSessionState();
  }

  async closeUdpSession(): Promise<void> {
    const socket = this.udpSocket;
    const settings = this.udpSettings;
    if (!socket) { this.udpSettings = undefined; this.udpOpenedAt = undefined; return; }
    this.udpSocket = undefined;
    this.udpSettings = undefined;
    this.udpOpenedAt = undefined;
    const target = settings ? `${settings.host}:${settings.remotePort}` : undefined;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      socket.once('close', finish);
      try { socket.close(); } catch { finish(); }
      setTimeout(finish, 400);
    });
    if (target) this.emit({ type: 'udp-closed', transport: 'udp', target, timestamp: Date.now() });
  }

  async writeUdp(payload: Buffer): Promise<number> {
    const socket = this.udpSocket;
    const settings = this.udpSettings;
    if (!socket || !settings) throw new Error('No UDP socket is open.');
    const framed = appendLineEnding(payload, settings.lineEnding);
    if (!framed.length) throw new Error('The UDP frame is empty.');
    await new Promise<void>((resolve, reject) => socket.send(framed, settings.remotePort, settings.host, (error) => error ? reject(error) : resolve()));
    this.emit({ type: 'tx', transport: 'udp', target: `${settings.host}:${settings.remotePort}`, bytes: framed.length, timestamp: Date.now() });
    return framed.length;
  }

  async startTcpServer(settings: TcpServerSettings): Promise<NetworkSessionState> {
    validateTcpServerSettings(settings);
    await this.stopTcpServer();
    const server = net.createServer((socket) => {
      this.tcpServerClients.add(socket);
      const peer = formatSocketPeer(socket);
      this.emit({ type: 'tcp-client-connected', transport: 'tcp-server', target: peer, message: `${this.tcpServerClients.size} client(s) connected`, timestamp: Date.now() });
      socket.setNoDelay(true);
      socket.on('data', (data) => {
        const active = this.tcpServerSettings;
        this.emit({ type: 'rx', transport: 'tcp-server', target: peer, bytes: data.length, text: decodeFrame(data, active?.encoding ?? settings.encoding), hex: formatHex(data), timestamp: Date.now() });
      });
      socket.on('error', (error) => this.emit({ type: 'error', transport: 'tcp-server', target: peer, message: error.message, timestamp: Date.now() }));
      socket.on('close', () => {
        this.tcpServerClients.delete(socket);
        this.emit({ type: 'tcp-client-disconnected', transport: 'tcp-server', target: peer, message: `${this.tcpServerClients.size} client(s) connected`, timestamp: Date.now() });
      });
    });
    this.tcpServer = server;
    this.tcpServerSettings = { ...settings };
    server.on('error', (error) => this.emit({ type: 'error', transport: 'tcp-server', target: `${settings.bindAddress}:${settings.port}`, message: error.message, timestamp: Date.now() }));
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => { server.off('listening', onListening); reject(error); };
        const onListening = () => { server.off('error', onError); resolve(); };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(settings.port, settings.bindAddress);
      });
    } catch (error) {
      this.tcpServer = undefined;
      this.tcpServerSettings = undefined;
      try { server.close(); } catch { /* not listening */ }
      throw error;
    }
    const address = server.address();
    if (typeof address === 'object' && address) this.tcpServerSettings.port = address.port;
    this.tcpServerOpenedAt = Date.now();
    this.emit({ type: 'tcp-server-started', transport: 'tcp-server', target: `${this.tcpServerSettings.bindAddress}:${this.tcpServerSettings.port}`, timestamp: this.tcpServerOpenedAt });
    return this.getSessionState();
  }

  async stopTcpServer(): Promise<void> {
    const server = this.tcpServer;
    const settings = this.tcpServerSettings;
    for (const client of this.tcpServerClients) {
      try { client.destroy(); } catch { /* ignore */ }
    }
    this.tcpServerClients.clear();
    this.tcpServer = undefined;
    this.tcpServerSettings = undefined;
    this.tcpServerOpenedAt = undefined;
    if (!server) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      try { server.close(finish); } catch { finish(); }
      setTimeout(finish, 500);
    });
    if (settings) this.emit({ type: 'tcp-server-stopped', transport: 'tcp-server', target: `${settings.bindAddress}:${settings.port}`, timestamp: Date.now() });
  }

  async writeTcpServer(payload: Buffer): Promise<{ bytesPerClient: number; clients: number }> {
    const settings = this.tcpServerSettings;
    if (!this.tcpServer?.listening || !settings) throw new Error('TCP listener is not running.');
    const clients = Array.from(this.tcpServerClients).filter((socket) => !socket.destroyed && socket.writable);
    if (!clients.length) throw new Error('TCP listener has no connected clients.');
    const framed = appendLineEnding(payload, settings.lineEnding);
    if (!framed.length) throw new Error('The TCP server frame is empty.');
    await Promise.all(clients.map((socket) => new Promise<void>((resolve, reject) => socket.write(framed, (error) => error ? reject(error) : resolve()))));
    this.emit({ type: 'tx', transport: 'tcp-server', target: `${clients.length} client(s)`, bytes: framed.length * clients.length, message: `${framed.length} B per client`, timestamp: Date.now() });
    return { bytesPerClient: framed.length, clients: clients.length };
  }

  async discoverServices(durationMs = 1800): Promise<ServiceDiscoveryResult> {
    const duration = Math.max(500, Math.min(10000, Math.round(durationMs)));
    const result: ServiceDiscoveryResult = { mdns: [], ssdp: [], warnings: [] };
    const [mdns, ssdp] = await Promise.allSettled([this.discoverMdns(duration), this.discoverSsdp(duration)]);
    if (mdns.status === 'fulfilled') result.mdns = mdns.value; else result.warnings.push(`mDNS discovery failed: ${shortDiagnosticError(mdns.reason)}`);
    if (ssdp.status === 'fulfilled') result.ssdp = ssdp.value; else result.warnings.push(`SSDP discovery failed: ${shortDiagnosticError(ssdp.reason)}`);
    return result;
  }

  async discoverMdns(durationMs = 1800): Promise<MdnsRecordInfo[]> {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const records = new Map<string, MdnsRecordInfo>();
    socket.on('message', (message, remote) => {
      try {
        for (const record of parseDnsRecords(message)) {
          const item: MdnsRecordInfo = { ...record, remoteAddress: remote.address };
          records.set(`${item.name}|${item.recordType}|${item.data}`, item);
        }
      } catch (error) {
        this.output.appendLine(`[Network Diagnostics] mDNS packet parse warning: ${errorMessage(error)}`);
      }
    });
    await bindUdpSocket(socket, 0, '0.0.0.0');
    try {
      socket.setMulticastTTL(255);
      const query = buildDnsQuery('_services._dns-sd._udp.local', 12);
      await sendUdp(socket, query, 5353, '224.0.0.251');
      await delay(durationMs);
    } finally {
      await closeDgramSocket(socket);
    }
    return Array.from(records.values()).sort((a, b) => a.recordType.localeCompare(b.recordType) || a.name.localeCompare(b.name));
  }

  async discoverSsdp(durationMs = 1800): Promise<SsdpDeviceInfo[]> {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const devices = new Map<string, SsdpDeviceInfo>();
    socket.on('message', (message, remote) => {
      const headers = parseHttpLikeHeaders(message.toString('utf8'));
      const location = headers.get('location') ?? '';
      const st = headers.get('st') ?? headers.get('nt') ?? '';
      const usn = headers.get('usn') ?? '';
      const key = usn || location || `${remote.address}|${st}`;
      devices.set(key, {
        location,
        searchTarget: st,
        usn,
        server: headers.get('server') ?? '',
        cacheControl: headers.get('cache-control') ?? '',
        remoteAddress: remote.address
      });
    });
    await bindUdpSocket(socket, 0, '0.0.0.0');
    try {
      socket.setBroadcast(true);
      socket.setMulticastTTL(2);
      const request = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 1\r\nST: ssdp:all\r\n\r\n', 'ascii');
      await sendUdp(socket, request, 1900, '239.255.255.250');
      await delay(durationMs);
    } finally {
      await closeDgramSocket(socket);
    }
    return Array.from(devices.values()).sort((a, b) => a.remoteAddress.localeCompare(b.remoteAddress) || a.searchTarget.localeCompare(b.searchTarget));
  }

  async inspectBleGatt(address: string): Promise<BleGattInspectionResult> {
    if (process.platform !== 'win32') throw new Error('BLE GATT inspection is currently available on Windows only.');
    const clean = normalizeBluetoothAddress(address);
    if (clean.length !== 12) throw new Error('Enter a valid 48-bit Bluetooth address.');
    const script = buildBleGattPowerShell(clean, 'inspect');
    const stdout = await runPowerShell(script, 20000);
    const item: any = parseJson(stdout);
    return {
      address: formatBluetoothAddress(String(item?.address ?? clean)),
      name: String(item?.name ?? ''),
      connectionStatus: String(item?.connectionStatus ?? ''),
      services: normalizeArray<any>(item?.services).map((service) => ({
        uuid: String(service?.uuid ?? ''),
        handle: Number.isFinite(Number(service?.handle)) ? Number(service.handle) : undefined,
        characteristics: normalizeArray<any>(service?.characteristics).map((characteristic) => ({
          uuid: String(characteristic?.uuid ?? ''),
          handle: Number.isFinite(Number(characteristic?.handle)) ? Number(characteristic.handle) : undefined,
          properties: normalizeStringArray(characteristic?.properties)
        })).filter((characteristic) => characteristic.uuid)
      })).filter((service) => service.uuid)
    };
  }

  async readBleGatt(address: string, serviceUuid: string, characteristicUuid: string): Promise<BleGattValueResult> {
    return this.runBleGattValueOperation(address, serviceUuid, characteristicUuid, 'read');
  }

  async writeBleGatt(address: string, serviceUuid: string, characteristicUuid: string, hexPayload: string): Promise<BleGattValueResult> {
    const cleanHex = String(hexPayload ?? '').replace(/0x/gi, '').replace(/[\s,;:_-]+/g, '');
    if (!cleanHex || !/^[0-9a-f]+$/i.test(cleanHex) || cleanHex.length % 2) throw new Error('BLE GATT write data must contain complete hexadecimal byte pairs.');
    return this.runBleGattValueOperation(address, serviceUuid, characteristicUuid, 'write', cleanHex.toUpperCase());
  }

  async monitorBleGatt(address: string, serviceUuid: string, characteristicUuid: string, durationMs = 5000): Promise<BleGattValueResult> {
    return this.runBleGattValueOperation(address, serviceUuid, characteristicUuid, 'monitor', undefined, Math.max(500, Math.min(30000, Math.round(durationMs))));
  }

  private async runBleGattValueOperation(address: string, serviceUuid: string, characteristicUuid: string, operation: 'read' | 'write' | 'monitor', hexPayload?: string, durationMs = 5000): Promise<BleGattValueResult> {
    if (process.platform !== 'win32') throw new Error('BLE GATT operations are currently available on Windows only.');
    const clean = normalizeBluetoothAddress(address);
    if (clean.length !== 12) throw new Error('Enter a valid 48-bit Bluetooth address.');
    const script = buildBleGattPowerShell(clean, operation, serviceUuid, characteristicUuid, hexPayload, durationMs);
    const stdout = await runPowerShell(script, operation === 'monitor' ? durationMs + 18000 : 22000);
    const item: any = parseJson(stdout);
    return {
      address: formatBluetoothAddress(String(item?.address ?? clean)),
      serviceUuid: String(item?.serviceUuid ?? serviceUuid),
      characteristicUuid: String(item?.characteristicUuid ?? characteristicUuid),
      status: String(item?.status ?? ''),
      hex: String(item?.hex ?? ''),
      text: String(item?.text ?? ''),
      samples: normalizeArray<any>(item?.samples).map((sample) => ({ timestamp: Number(sample?.timestamp ?? Date.now()), hex: String(sample?.hex ?? ''), text: String(sample?.text ?? '') }))
    };
  }

  encodeFrame(text: string, mode: 'text' | 'hex', encoding: FrameEncoding): Buffer {
    if (mode === 'hex') {
      const clean = text.replace(/0x/gi, '').replace(/[\s,;:_-]+/g, '');
      if (!clean) return Buffer.alloc(0);
      if (!/^[0-9a-f]+$/i.test(clean) || clean.length % 2 !== 0) throw new Error('HEX frame must contain complete hexadecimal byte pairs.');
      return Buffer.from(clean, 'hex');
    }
    return Buffer.from(text, encoding === 'latin1' ? 'latin1' : encoding === 'ascii' ? 'ascii' : 'utf8');
  }

  async ping(host: string, timeoutMs = 2500, count = 4): Promise<HostDiagnosticResult> {
    const safeHost = validateHost(host);
    const safeCount = Math.max(1, Math.min(10, Math.round(count)));
    const safeTimeout = Math.max(250, Math.min(30000, Math.round(timeoutMs)));
    const started = Date.now();
    const args = process.platform === 'win32'
      ? ['-n', String(safeCount), '-w', String(safeTimeout), safeHost]
      : ['-c', String(safeCount), '-W', String(Math.max(1, Math.ceil(safeTimeout / 1000))), safeHost];
    try {
      const { stdout, stderr } = await execFileAsync('ping', args, { timeout: safeCount * safeTimeout + 3000, windowsHide: true, maxBuffer: 512 * 1024 });
      return { kind: 'ping', ok: true, summary: `Ping ${safeHost}: reachable`, detail: String(stdout || stderr).trim(), elapsedMs: Date.now() - started };
    } catch (error: any) {
      const detail = String(error?.stdout || error?.stderr || error?.message || error).trim();
      return { kind: 'ping', ok: false, summary: `Ping ${safeHost}: failed`, detail, elapsedMs: Date.now() - started };
    }
  }

  async dnsLookup(host: string): Promise<HostDiagnosticResult> {
    const safeHost = validateHost(host);
    const started = Date.now();
    try {
      const addresses = await dns.promises.lookup(safeHost, { all: true, verbatim: true });
      const lines = addresses.map((item) => `${item.family === 6 ? 'IPv6' : 'IPv4'}  ${item.address}`);
      return { kind: 'dns', ok: addresses.length > 0, summary: `${addresses.length} address(es) resolved for ${safeHost}`, detail: lines.join('\n'), elapsedMs: Date.now() - started };
    } catch (error) {
      return { kind: 'dns', ok: false, summary: `DNS lookup failed for ${safeHost}`, detail: errorMessage(error), elapsedMs: Date.now() - started };
    }
  }

  async testTcpPort(host: string, port: number, timeoutMs = 2000): Promise<HostDiagnosticResult> {
    const safeHost = validateHost(host);
    const safePort = validatePort(port, 'TCP port');
    const safeTimeout = Math.max(100, Math.min(30000, Math.round(timeoutMs)));
    const started = Date.now();
    return await new Promise<HostDiagnosticResult>((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const finish = (ok: boolean, detail: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve({
          kind: 'tcp-test', ok,
          summary: `TCP ${safeHost}:${safePort} — ${ok ? 'open/reachable' : 'not reachable'}`,
          detail, elapsedMs: Date.now() - started
        });
      };
      socket.setTimeout(safeTimeout);
      socket.once('connect', () => finish(true, 'TCP three-way handshake completed.'));
      socket.once('timeout', () => finish(false, `Connection timed out after ${safeTimeout} ms.`));
      socket.once('error', (error) => finish(false, error.message));
      socket.connect(safePort, safeHost);
    });
  }

  private emit(event: NetworkSessionEvent): void {
    if (!this.disposed) this.eventEmitter.fire(event);
  }

  private async discoverWindowsAdapters(): Promise<NetworkAdapterInfo[]> {
    const script = String.raw`
$ErrorActionPreference='Stop'
function Nz($v) { if ($null -eq $v) { return '' } return [string]$v }
function StatusName($value) {
  switch ([int]$value) {
    0 {'Disconnected'} 1 {'Connecting'} 2 {'Connected'} 3 {'Disconnecting'} 4 {'Hardware not present'}
    5 {'Hardware disabled'} 6 {'Hardware malfunction'} 7 {'Media disconnected'} 8 {'Authenticating'}
    9 {'Authentication succeeded'} 10 {'Authentication failed'} 11 {'Invalid address'} 12 {'Credentials required'}
    default {'Unknown'}
  }
}
function FormatSpeed($value) {
  if ($null -eq $value) { return '' }
  $n = [double]$value
  if ($n -ge 1000000000) { return ('{0:0.##} Gbps' -f ($n / 1000000000)) }
  if ($n -ge 1000000) { return ('{0:0.##} Mbps' -f ($n / 1000000)) }
  if ($n -ge 1000) { return ('{0:0.##} Kbps' -f ($n / 1000)) }
  return ('{0:0} bps' -f $n)
}
$adapters = @(Get-CimInstance Win32_NetworkAdapter -ErrorAction Stop | Where-Object { $_.NetConnectionID -or $_.PhysicalAdapter })
$configs = @(Get-CimInstance Win32_NetworkAdapterConfiguration -ErrorAction Stop)
$items = @()
foreach ($a in $adapters) {
  $cfg = $configs | Where-Object { [int]$_.Index -eq [int]$a.Index } | Select-Object -First 1
  $ips = @($cfg.IPAddress | ForEach-Object { [string]$_ })
  $items += [PSCustomObject]@{
    name = if ($a.NetConnectionID) { [string]$a.NetConnectionID } else { [string]$a.Name }
    description = Nz $a.Description
    status = StatusName $a.NetConnectionStatus
    macAddress = if ($a.MACAddress) { [string]$a.MACAddress } else { Nz $cfg.MACAddress }
    linkSpeed = FormatSpeed $a.Speed
    ipv4 = @($ips | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' })
    ipv6 = @($ips | Where-Object { $_ -match ':' })
    gateways = @($cfg.DefaultIPGateway | ForEach-Object { [string]$_ })
    dnsServers = @($cfg.DNSServerSearchOrder | ForEach-Object { [string]$_ })
  }
}
$items | Sort-Object name | ConvertTo-Json -Depth 5 -Compress
`;
    const stdout = await runPowerShell(script, 12000);
    return normalizeArray<any>(parseJson(stdout)).map((item) => ({
      name: String(item?.name ?? ''), description: String(item?.description ?? ''), status: String(item?.status ?? ''),
      macAddress: String(item?.macAddress ?? ''), linkSpeed: String(item?.linkSpeed ?? ''),
      ipv4: normalizeStringArray(item?.ipv4), ipv6: normalizeStringArray(item?.ipv6),
      gateways: normalizeStringArray(item?.gateways), dnsServers: normalizeStringArray(item?.dnsServers)
    })).filter((item) => item.name.length > 0);
  }

  private async discoverWindowsNeighbors(): Promise<NetworkNeighborInfo[]> {
    const script = String.raw`
$ErrorActionPreference='Stop'
$items = Get-NetNeighbor -ErrorAction Stop | Where-Object { $_.State -ne 'Unreachable' -and $_.IPAddress -notmatch '^ff|^224\.' } | Select-Object -First 256 InterfaceAlias,IPAddress,LinkLayerAddress,State
$items | ConvertTo-Json -Depth 4 -Compress
`;
    try {
      const stdout = await runPowerShell(script, 10000);
      return normalizeArray<any>(parseJson(stdout)).map((item) => ({
        interfaceAlias: String(item?.InterfaceAlias ?? ''), ipAddress: String(item?.IPAddress ?? ''),
        linkLayerAddress: String(item?.LinkLayerAddress ?? ''), state: String(item?.State ?? '')
      })).filter((item) => item.ipAddress.length > 0);
    } catch (error) {
      this.output.appendLine(`[Network Diagnostics] Get-NetNeighbor unavailable, falling back to arp.exe: ${errorMessage(error)}`);
      try {
        const { stdout } = await execFileAsync('arp.exe', ['-a'], { windowsHide: true, timeout: 6000, maxBuffer: 512 * 1024 });
        return parseWindowsArp(String(stdout));
      } catch (fallbackError) {
        throw new Error(`Neighbor discovery unavailable: ${shortDiagnosticError(fallbackError)}`);
      }
    }
  }

  private async scanWindowsWifi(): Promise<WifiNetworkInfo[]> {
    const { stdout } = await execFileAsync('netsh.exe', ['wlan', 'show', 'networks', 'mode=bssid'], { windowsHide: true, timeout: 12000, maxBuffer: 1024 * 1024 });
    return parseNetshWifi(String(stdout));
  }

  private async scanWindowsBle(durationMs: number): Promise<BleAdvertisementInfo[]> {
    const script = String.raw`
$ErrorActionPreference='Stop'
[Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
$watcher = New-Object Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher
$watcher.ScanningMode = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEScanningMode]::Active
$items = [System.Collections.Concurrent.ConcurrentDictionary[string,object]]::new()
$handler = {
  param($sender,$eventArgs)
  try {
    $address = ('{0:X12}' -f [UInt64]$eventArgs.BluetoothAddress)
    $name = [string]$eventArgs.Advertisement.LocalName
    $connectable = $null
    try { $connectable = [bool]$eventArgs.IsConnectable } catch {}
    $items[$address] = [PSCustomObject]@{
      address = $address
      name = $name
      rssi = [int]$eventArgs.RawSignalStrengthInDBm
      connectable = $connectable
      timestamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    }
  } catch {}
}.GetNewClosure()
$token = $watcher.add_Received($handler)
try {
  $watcher.Start()
  Start-Sleep -Milliseconds ${durationMs}
} finally {
  try { $watcher.Stop() } catch {}
  try { if ($null -ne $token) { $watcher.remove_Received($token) } } catch {}
}
@($items.Values | Sort-Object rssi -Descending) | ConvertTo-Json -Depth 5 -Compress | Write-Output
`;
    const stdout = await runPowerShell(script, durationMs + 8000);
    return normalizeArray<any>(parseJson(stdout)).map((item) => ({
      address: formatBluetoothAddress(String(item?.address ?? '')),
      name: String(item?.name ?? ''),
      rssi: Number.isFinite(Number(item?.rssi)) ? Number(item.rssi) : undefined,
      connectable: typeof item?.connectable === 'boolean' ? item.connectable : undefined,
      timestamp: Number.isFinite(Number(item?.timestamp)) ? Number(item.timestamp) : undefined
    })).filter((item) => item.address.length > 0);
  }

  private async discoverWindowsBluetooth(): Promise<BluetoothDeviceInfo[]> {
    const script = String.raw`
$ErrorActionPreference='Stop'
$items = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match '^(BTHENUM|BTHLEDEVICE|BTHPORT)\\' } | Select-Object FriendlyName,InstanceId,Status,Class
$items | ConvertTo-Json -Depth 4 -Compress
`;
    const stdout = await runPowerShell(script, 10000);
    const genericServicePattern = /(?:generic attribute|profil d['’]attribut g.n.rique|service d['’]attribut g.n.rique|00001800|00001801)/i;
    const devices = normalizeArray<any>(parseJson(stdout)).map((item) => {
      const instanceId = String(item?.InstanceId ?? '');
      const address = extractBluetoothAddress(instanceId);
      return {
        name: String(item?.FriendlyName ?? ''), instanceId,
        status: String(item?.Status ?? ''), className: String(item?.Class ?? 'Bluetooth'),
        address
      } satisfies BluetoothDeviceInfo;
    }).filter((item) => (item.name.length > 0 || item.instanceId.length > 0) && !genericServicePattern.test(`${item.name} ${item.instanceId}`));
    const deduped = new Map<string, BluetoothDeviceInfo>();
    for (const item of devices) {
      const key = item.address ? normalizeBluetoothAddress(item.address) : `${item.name}|${item.instanceId}`.toLocaleLowerCase();
      const previous = deduped.get(key);
      if (!previous || (item.name && item.name.length > previous.name.length)) deduped.set(key, item);
    }
    return Array.from(deduped.values());
  }
}

function validateTcpSettings(settings: TcpCommunicationSettings): void {
  settings.host = validateHost(settings.host);
  settings.port = validatePort(settings.port, 'TCP port');
  if (!Number.isFinite(settings.connectTimeoutMs) || settings.connectTimeoutMs < 100 || settings.connectTimeoutMs > 120000) throw new Error('TCP connection timeout must be between 100 and 120000 ms.');
}

function validateUdpSettings(settings: UdpCommunicationSettings): void {
  settings.host = validateHost(settings.host);
  settings.remotePort = validatePort(settings.remotePort, 'UDP remote port');
  const local = Number(settings.localPort);
  if (!Number.isFinite(local) || local < 0 || local > 65535) throw new Error('UDP local port must be between 0 and 65535 (0 = automatic).');
  settings.localPort = Math.round(local);
}

function validateTcpServerSettings(settings: TcpServerSettings): void {
  const bind = String(settings.bindAddress ?? '').trim();
  if (!bind || !/^[A-Za-z0-9_.:\-]+$/.test(bind)) throw new Error('Enter a valid TCP listener bind address (for example 0.0.0.0 or 127.0.0.1).');
  settings.bindAddress = bind;
  const port = Number(settings.port);
  if (!Number.isFinite(port) || port < 0 || port > 65535) throw new Error('TCP listener port must be between 0 and 65535 (0 = automatic).');
  settings.port = Math.round(port);
}

function formatSocketPeer(socket: net.Socket): string {
  return `${socket.remoteAddress ?? '?'}:${socket.remotePort ?? 0}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bindUdpSocket(socket: dgram.Socket, port: number, address: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => { socket.off('listening', onListening); reject(error); };
    const onListening = () => { socket.off('error', onError); resolve(); };
    socket.once('error', onError);
    socket.once('listening', onListening);
    socket.bind(port, address);
  });
}

function sendUdp(socket: dgram.Socket, payload: Buffer, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => socket.send(payload, port, host, (error) => error ? reject(error) : resolve()));
}

function closeDgramSocket(socket: dgram.Socket): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    socket.once('close', finish);
    try { socket.close(); } catch { finish(); }
    setTimeout(finish, 300);
  });
}

function buildDnsQuery(name: string, type: number): Buffer {
  const labels = name.split('.').filter(Boolean);
  const encoded: Buffer[] = [];
  for (const label of labels) {
    const data = Buffer.from(label, 'utf8');
    if (data.length > 63) throw new Error('mDNS label is too long.');
    encoded.push(Buffer.from([data.length]), data);
  }
  encoded.push(Buffer.from([0]));
  const question = Buffer.concat(encoded);
  const suffix = Buffer.alloc(4);
  suffix.writeUInt16BE(type, 0);
  suffix.writeUInt16BE(0x8001, 2);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(1, 4);
  return Buffer.concat([header, question, suffix]);
}

function parseDnsRecords(packet: Buffer): Array<Omit<MdnsRecordInfo, 'remoteAddress'>> {
  if (packet.length < 12) return [];
  const qd = packet.readUInt16BE(4);
  const an = packet.readUInt16BE(6);
  const ns = packet.readUInt16BE(8);
  const ar = packet.readUInt16BE(10);
  let offset = 12;
  for (let i = 0; i < qd; i++) {
    const name = readDnsName(packet, offset);
    offset = name.next + 4;
    if (offset > packet.length) return [];
  }
  const records: Array<Omit<MdnsRecordInfo, 'remoteAddress'>> = [];
  const count = an + ns + ar;
  for (let i = 0; i < count && offset < packet.length; i++) {
    const owner = readDnsName(packet, offset);
    offset = owner.next;
    if (offset + 10 > packet.length) break;
    const type = packet.readUInt16BE(offset);
    const ttl = packet.readUInt32BE(offset + 4);
    const length = packet.readUInt16BE(offset + 8);
    const dataOffset = offset + 10;
    const end = dataOffset + length;
    if (end > packet.length) break;
    const data = formatDnsRdata(packet, type, dataOffset, length);
    if (data !== undefined) records.push({ name: owner.name, recordType: dnsTypeName(type), data, ttl });
    offset = end;
  }
  return records;
}

function readDnsName(packet: Buffer, start: number, seen = new Set<number>()): { name: string; next: number } {
  const labels: string[] = [];
  let offset = start;
  let next = start;
  let jumped = false;
  while (offset < packet.length) {
    if (seen.has(offset)) break;
    seen.add(offset);
    const length = packet[offset];
    if (length === 0) {
      if (!jumped) next = offset + 1;
      break;
    }
    if ((length & 0xc0) === 0xc0) {
      if (offset + 1 >= packet.length) break;
      const pointer = ((length & 0x3f) << 8) | packet[offset + 1];
      if (!jumped) next = offset + 2;
      jumped = true;
      const suffix = readDnsName(packet, pointer, seen);
      if (suffix.name) labels.push(suffix.name);
      break;
    }
    const end = offset + 1 + length;
    if (end > packet.length) break;
    labels.push(packet.subarray(offset + 1, end).toString('utf8'));
    offset = end;
    if (!jumped) next = offset;
  }
  return { name: labels.join('.'), next };
}

function formatDnsRdata(packet: Buffer, type: number, offset: number, length: number): string | undefined {
  if (type === 1 && length === 4) return Array.from(packet.subarray(offset, offset + 4)).join('.');
  if (type === 28 && length === 16) {
    const groups: string[] = [];
    for (let i = 0; i < 16; i += 2) groups.push(packet.readUInt16BE(offset + i).toString(16));
    return groups.join(':');
  }
  if (type === 12 || type === 5 || type === 2) return readDnsName(packet, offset).name;
  if (type === 33 && length >= 6) {
    const port = packet.readUInt16BE(offset + 4);
    const target = readDnsName(packet, offset + 6).name;
    return `${target}:${port}`;
  }
  if (type === 16) {
    const parts: string[] = [];
    let pos = offset;
    const end = offset + length;
    while (pos < end) {
      const size = packet[pos++];
      if (pos + size > end) break;
      parts.push(packet.subarray(pos, pos + size).toString('utf8'));
      pos += size;
    }
    return parts.join(' | ');
  }
  return undefined;
}

function dnsTypeName(type: number): string {
  switch (type) {
    case 1: return 'A';
    case 2: return 'NS';
    case 5: return 'CNAME';
    case 12: return 'PTR';
    case 16: return 'TXT';
    case 28: return 'AAAA';
    case 33: return 'SRV';
    default: return `TYPE${type}`;
  }
}

function parseHttpLikeHeaders(text: string): Map<string, string> {
  const headers = new Map<string, string>();
  for (const line of text.split(/\r?\n/).slice(1)) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    headers.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim());
  }
  return headers;
}

function validateUuid(value: string): string {
  const uuid = String(value ?? '').trim();
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid)) throw new Error('Invalid BLE GATT UUID.');
  return uuid;
}

function buildBleGattPowerShell(addressHex: string, operation: 'inspect' | 'read' | 'write' | 'monitor', serviceUuid = '', characteristicUuid = '', hexPayload = '', durationMs = 5000): string {
  const safeService = serviceUuid ? validateUuid(serviceUuid) : '';
  const safeCharacteristic = characteristicUuid ? validateUuid(characteristicUuid) : '';
  const safeHex = String(hexPayload ?? '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  const prelude = String.raw`
$ErrorActionPreference='Stop'
[System.Reflection.Assembly]::LoadWithPartialName('System.Runtime.WindowsRuntime') | Out-Null
[Windows.Devices.Bluetooth.BluetoothLEDevice,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.BluetoothCacheMode,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.GenericAttributeProfile.GattDeviceServicesResult,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicsResult,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.GenericAttributeProfile.GattReadResult,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.GenericAttributeProfile.GattWriteResult,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.GenericAttributeProfile.GattCommunicationStatus,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.GenericAttributeProfile.GattClientCharacteristicConfigurationDescriptorValue,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataWriter,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
function Await($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
  if ($null -eq $method) { throw 'Unable to resolve WinRT AsTask helper.' }
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}
function BufferToData($buffer) {
  if ($null -eq $buffer -or $buffer.Length -eq 0) { return [PSCustomObject]@{ hex=''; text='' } }
  $reader = [Windows.Storage.Streams.DataReader]::FromBuffer($buffer)
  $bytes = New-Object byte[] ([int]$buffer.Length)
  $reader.ReadBytes($bytes)
  $hex = (($bytes | ForEach-Object { $_.ToString('X2') }) -join ' ')
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  return [PSCustomObject]@{ hex=$hex; text=$text }
}
$address = [Convert]::ToUInt64('${addressHex}',16)
$device = Await ([Windows.Devices.Bluetooth.BluetoothLEDevice]::FromBluetoothAddressAsync($address)) ([Windows.Devices.Bluetooth.BluetoothLEDevice])
if ($null -eq $device) { throw 'Unable to open BLE device.' }
`;
  if (operation === 'inspect') return prelude + String.raw`
$servicesResult = Await ($device.GetGattServicesAsync([Windows.Devices.Bluetooth.BluetoothCacheMode]::Uncached)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattDeviceServicesResult])
$services = @()
foreach ($service in @($servicesResult.Services)) {
  $charsResult = Await ($service.GetCharacteristicsAsync([Windows.Devices.Bluetooth.BluetoothCacheMode]::Uncached)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicsResult])
  $chars = @()
  foreach ($characteristic in @($charsResult.Characteristics)) {
    $props = ([string]$characteristic.CharacteristicProperties).Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    $chars += [PSCustomObject]@{ uuid=[string]$characteristic.Uuid; handle=[int]$characteristic.AttributeHandle; properties=@($props) }
  }
  $services += [PSCustomObject]@{ uuid=[string]$service.Uuid; handle=[int]$service.AttributeHandle; characteristics=@($chars) }
}
[PSCustomObject]@{ address=('${addressHex}' -replace '(.{2})(?=.)','$1:'); name=[string]$device.Name; connectionStatus=[string]$device.ConnectionStatus; services=@($services) } | ConvertTo-Json -Depth 8 -Compress
`;
  const locate = String.raw`
$serviceUuid = [Guid]'${safeService}'
$characteristicUuid = [Guid]'${safeCharacteristic}'
$servicesResult = Await ($device.GetGattServicesForUuidAsync($serviceUuid, [Windows.Devices.Bluetooth.BluetoothCacheMode]::Uncached)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattDeviceServicesResult])
$service = @($servicesResult.Services) | Select-Object -First 1
if ($null -eq $service) { throw 'GATT service was not found.' }
$charsResult = Await ($service.GetCharacteristicsForUuidAsync($characteristicUuid, [Windows.Devices.Bluetooth.BluetoothCacheMode]::Uncached)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicsResult])
$characteristic = @($charsResult.Characteristics) | Select-Object -First 1
if ($null -eq $characteristic) { throw 'GATT characteristic was not found.' }
`;
  if (operation === 'read') return prelude + locate + String.raw`
$result = Await ($characteristic.ReadValueAsync([Windows.Devices.Bluetooth.BluetoothCacheMode]::Uncached)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattReadResult])
$data = BufferToData $result.Value
[PSCustomObject]@{ address=('${addressHex}' -replace '(.{2})(?=.)','$1:'); serviceUuid='${safeService}'; characteristicUuid='${safeCharacteristic}'; status=[string]$result.Status; hex=$data.hex; text=$data.text } | ConvertTo-Json -Depth 5 -Compress
`;
  if (operation === 'write') return prelude + locate + String.raw`
$clean = '${safeHex}'
$bytes = New-Object byte[] ($clean.Length / 2)
for ($i=0; $i -lt $bytes.Length; $i++) { $bytes[$i] = [Convert]::ToByte($clean.Substring($i*2,2),16) }
$writer = [Windows.Storage.Streams.DataWriter]::new()
$writer.WriteBytes($bytes)
$buffer = $writer.DetachBuffer()
$result = Await ($characteristic.WriteValueWithResultAsync($buffer)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattWriteResult])
[PSCustomObject]@{ address=('${addressHex}' -replace '(.{2})(?=.)','$1:'); serviceUuid='${safeService}'; characteristicUuid='${safeCharacteristic}'; status=[string]$result.Status; hex=(($bytes | ForEach-Object { $_.ToString('X2') }) -join ' '); text='' } | ConvertTo-Json -Depth 5 -Compress
`;
  return prelude + locate + String.raw`
$samples = [System.Collections.Concurrent.ConcurrentQueue[object]]::new()
$handler = {
  param($sender,$eventArgs)
  try {
    $data = BufferToData $eventArgs.CharacteristicValue
    $samples.Enqueue([PSCustomObject]@{ timestamp=[DateTimeOffset]::Now.ToUnixTimeMilliseconds(); hex=$data.hex; text=$data.text })
  } catch {}
}.GetNewClosure()
$token = $characteristic.add_ValueChanged($handler)
$mode = if (([string]$characteristic.CharacteristicProperties) -match 'Notify') { [Windows.Devices.Bluetooth.GenericAttributeProfile.GattClientCharacteristicConfigurationDescriptorValue]::Notify } else { [Windows.Devices.Bluetooth.GenericAttributeProfile.GattClientCharacteristicConfigurationDescriptorValue]::Indicate }
try {
  $enable = Await ($characteristic.WriteClientCharacteristicConfigurationDescriptorAsync($mode)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCommunicationStatus])
  Start-Sleep -Milliseconds ${durationMs}
} finally {
  try { $characteristic.remove_ValueChanged($token) } catch {}
  try { $null = Await ($characteristic.WriteClientCharacteristicConfigurationDescriptorAsync([Windows.Devices.Bluetooth.GenericAttributeProfile.GattClientCharacteristicConfigurationDescriptorValue]::None)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCommunicationStatus]) } catch {}
}
[PSCustomObject]@{ address=('${addressHex}' -replace '(.{2})(?=.)','$1:'); serviceUuid='${safeService}'; characteristicUuid='${safeCharacteristic}'; status=[string]$enable; hex=''; text=''; samples=@($samples.ToArray()) } | ConvertTo-Json -Depth 6 -Compress
`;
}

function validateHost(host: string): string {
  const value = String(host ?? '').trim();
  if (!value || value.length > 253 || value.startsWith('-') || !/^[A-Za-z0-9_.:\-]+$/.test(value)) throw new Error('Enter a valid host name or IP address.');
  return value;
}

function validatePort(value: number, label: string): number {
  const port = Number(value);
  if (!Number.isFinite(port) || port < 1 || port > 65535) throw new Error(`${label} must be between 1 and 65535.`);
  return Math.round(port);
}

function appendLineEnding(payload: Buffer, lineEnding: LineEnding): Buffer {
  const suffix = lineEnding === 'lf' ? Buffer.from('\n') : lineEnding === 'cr' ? Buffer.from('\r') : lineEnding === 'crlf' ? Buffer.from('\r\n') : Buffer.alloc(0);
  return suffix.length ? Buffer.concat([payload, suffix]) : payload;
}

function decodeFrame(data: Buffer, encoding: FrameEncoding): string {
  return data.toString(encoding === 'latin1' ? 'latin1' : encoding === 'ascii' ? 'ascii' : 'utf8');
}

function formatHex(data: Buffer): string {
  return Array.from(data.values()).map((value) => value.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function discoverNodeAdapters(): NetworkAdapterInfo[] {
  const entries = os.networkInterfaces();
  return Object.entries(entries).map(([name, values]) => {
    const active = (values ?? []).filter(Boolean) as os.NetworkInterfaceInfo[];
    const first = active[0];
    return {
      name,
      description: '',
      status: active.length ? 'Up/available' : 'Unknown',
      macAddress: first?.mac ?? '',
      linkSpeed: '',
      ipv4: active.filter((item) => item.family === 'IPv4').map((item) => item.address),
      ipv6: active.filter((item) => item.family === 'IPv6').map((item) => item.address),
      gateways: [],
      dnsServers: dns.getServers()
    };
  }).filter((item) => item.ipv4.length > 0 || item.ipv6.length > 0);
}

function parseNetshWifi(text: string): WifiNetworkInfo[] {
  const networks: WifiNetworkInfo[] = [];
  let ssid = '';
  let authentication = '';
  let encryption = '';
  let current: WifiNetworkInfo | undefined;
  const flush = () => { if (current) { networks.push(current); current = undefined; } };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    let match = line.match(/^SSID\s+\d+\s*:\s*(.*)$/i);
    if (match) { flush(); ssid = match[1].trim(); authentication = ''; encryption = ''; continue; }
    match = line.match(/^(Authentication|Authentification)\s*:\s*(.*)$/i);
    if (match) { authentication = match[2].trim(); if (current) current.authentication = authentication; continue; }
    match = line.match(/^(Encryption|Chiffrement)\s*:\s*(.*)$/i);
    if (match) { encryption = match[2].trim(); if (current) current.encryption = encryption; continue; }
    match = line.match(/^BSSID\s+\d+\s*:\s*([0-9A-Fa-f:-]+)$/i);
    if (match) {
      flush();
      current = { ssid: ssid || '<hidden>', bssid: match[1].toUpperCase(), authentication, encryption, radioType: '' };
      continue;
    }
    match = line.match(/^Signal\s*:\s*(\d+)\s*%$/i);
    if (match && current) { current.signalPercent = Number(match[1]); continue; }
    match = line.match(/^(Channel|Canal)\s*:\s*(\d+)$/i);
    if (match && current) { current.channel = Number(match[2]); continue; }
    match = line.match(/^(Radio type|Type de radio)\s*:\s*(.*)$/i);
    if (match && current) { current.radioType = match[2].trim(); continue; }
  }
  flush();
  const deduped = new Map<string, WifiNetworkInfo>();
  for (const item of networks) deduped.set(`${item.ssid}|${item.bssid}`, item);
  return Array.from(deduped.values()).sort((a, b) => (b.signalPercent ?? -999) - (a.signalPercent ?? -999));
}

function formatBluetoothAddress(value: string): string {
  const clean = value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().padStart(12, '0').slice(-12);
  return clean.length === 12 ? clean.match(/.{2}/g)?.join(':') ?? clean : value;
}

async function runPowerShell(script: string, timeoutMs: number): Promise<string> {
  const executable = process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` : 'powershell.exe';
  const wrapped = powerShellUtf8Prelude() + script;
  const encoded = Buffer.from(wrapped, 'utf16le').toString('base64');
  try {
    const { stdout } = await execFileAsync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'utf8'
    });
    return String(stdout ?? '').trim();
  } catch (error: any) {
    const detail = String(error?.stderr || error?.stdout || error?.message || error).trim();
    throw new Error(shortDiagnosticText(detail));
  }
}

function powerShellUtf8Prelude(): string {
  return `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)\n[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)\n$OutputEncoding = [Console]::OutputEncoding\n$ProgressPreference = 'SilentlyContinue'\n`;
}

function parseJson(stdout: string): unknown {
  if (!stdout.trim()) return [];
  const lines = stdout.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index--) {
    try { return JSON.parse(lines[index]); } catch { /* skip diagnostic noise */ }
  }
  throw new Error(`Unable to parse diagnostic output: ${shortDiagnosticText(stdout).slice(0, 240)}`);
}

function normalizeArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return value && typeof value === 'object' ? [value as T] : [];
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return value === undefined || value === null || value === '' ? [] : [String(value)];
}

function parseWindowsArp(text: string): NetworkNeighborInfo[] {
  const result: NetworkNeighborInfo[] = [];
  let interfaceAlias = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const header = rawLine.match(/^\s*(?:Interface|Interface)\s*:\s*([^\s]+).*$/i);
    if (header) { interfaceAlias = header[1]; continue; }
    const match = rawLine.match(/^\s*([0-9.]+)\s+([0-9a-f:-]{11,})\s+([^\s]+)\s*$/i);
    if (!match) continue;
    result.push({ interfaceAlias, ipAddress: match[1], linkLayerAddress: match[2].toUpperCase(), state: match[3] });
  }
  return result;
}

function normalizeBluetoothAddress(value: string): string {
  return String(value ?? '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
}

function extractBluetoothAddress(instanceId: string): string | undefined {
  const match = String(instanceId ?? '').match(/(?:DEV_|DEVICE_)([0-9A-F]{12})(?:\\|&|$)/i)
    ?? String(instanceId ?? '').match(/([0-9A-F]{12})(?:\\|&|$)/i);
  return match ? formatBluetoothAddress(match[1]) : undefined;
}

function shortDiagnosticText(value: string): string {
  let text = String(value ?? '').replace(/^#< CLIXML\s*/i, '').trim();
  text = text.replace(/_x000D__x000A_/gi, '\n').replace(/_x0009_/gi, '\t');
  text = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  text = text.replace(/^Command failed:[\s\S]*?-EncodedCommand\s+\S+\s*/i, '').trim();
  if (text.length > 520) text = text.slice(0, 517) + '…';
  return text || 'PowerShell diagnostic backend failed.';
}

function shortDiagnosticError(error: unknown): string {
  return shortDiagnosticText(errorMessage(error));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
