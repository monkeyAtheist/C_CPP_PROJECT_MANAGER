import * as fs from 'fs';
import * as path from 'path';
import { ChildProcessWithoutNullStreams, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

export type InstrumentTransport = 'serial' | 'visa';
export type SerialParity = 'None' | 'Odd' | 'Even' | 'Mark' | 'Space';
export type SerialStopBits = 'One' | 'OnePointFive' | 'Two';
export type SerialHandshake = 'None' | 'XOnXOff' | 'RequestToSend' | 'RequestToSendXOnXOff';
export type FrameEncoding = 'ascii' | 'utf8' | 'latin1';
export type LineEnding = 'none' | 'lf' | 'cr' | 'crlf';

export interface SerialInstrumentDevice {
  portName: string;
  name: string;
  description: string;
  manufacturer: string;
  pnpDeviceId: string;
  status: string;
}

export interface UsbInstrumentDevice {
  name: string;
  manufacturer: string;
  pnpDeviceId: string;
  service: string;
  status: string;
  vid?: string;
  pid?: string;
}

export interface VisaInstrumentResource {
  resource: string;
}

export interface InstrumentDiscoveryResult {
  serial: SerialInstrumentDevice[];
  usb: UsbInstrumentDevice[];
  visa: VisaInstrumentResource[];
  visaAvailable: boolean;
  warnings: string[];
}

export interface SerialCommunicationSettings {
  portName: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  parity: SerialParity;
  stopBits: SerialStopBits;
  handshake: SerialHandshake;
  readTimeoutMs: number;
  writeTimeoutMs: number;
  dtrEnable: boolean;
  rtsEnable: boolean;
  encoding: FrameEncoding;
  lineEnding: LineEnding;
}

export interface VisaCommunicationSettings {
  resource: string;
  timeoutMs: number;
  lineEnding: LineEnding;
}

export interface InstrumentExchangeResult {
  bytesWritten: number;
  bytesRead: number;
  elapsedMs: number;
  responseText: string;
  responseHex: string;
}


export interface InstrumentSessionState {
  connected: boolean;
  transport?: InstrumentTransport;
  target?: string;
  openedAt?: number;
}

export interface InstrumentSessionEvent {
  type: 'connected' | 'disconnected' | 'rx' | 'error' | 'tx';
  transport?: InstrumentTransport;
  target?: string;
  bytes?: number;
  text?: string;
  hex?: string;
  message?: string;
  timestamp: number;
}

interface InstrumentSessionProcess {
  child: ChildProcessWithoutNullStreams;
  transport: InstrumentTransport;
  target: string;
  encoding: FrameEncoding;
  lineEnding: LineEnding;
  openedAt: number;
  stdoutBuffer: string;
  stderrBuffer: string;
  connected: boolean;
  closing: boolean;
}

export interface ScpiPreset {
  label: string;
  command: string;
  description: string;
  expectsResponse: boolean;
}

export const SCPI_PRESETS: readonly ScpiPreset[] = [
  { label: 'Identify instrument', command: '*IDN?', description: 'IEEE 488.2 identification query.', expectsResponse: true },
  { label: 'Clear status', command: '*CLS', description: 'Clear standard event/status registers and error queue where supported.', expectsResponse: false },
  { label: 'Reset instrument', command: '*RST', description: 'Reset the instrument to its device-defined default state.', expectsResponse: false },
  { label: 'Operation complete?', command: '*OPC?', description: 'Return 1 after all pending operations complete.', expectsResponse: true },
  { label: 'Self-test', command: '*TST?', description: 'Run/query the IEEE 488.2 self-test where implemented.', expectsResponse: true },
  { label: 'System error', command: 'SYST:ERR?', description: 'Read one entry from the SCPI system error queue.', expectsResponse: true },
  { label: 'SCPI version', command: 'SYST:VERS?', description: 'Query the implemented SCPI version.', expectsResponse: true },
  { label: 'Event status register', command: '*ESR?', description: 'Read and clear the Standard Event Status Register.', expectsResponse: true },
  { label: 'Status byte', command: '*STB?', description: 'Read the IEEE 488.2 status byte.', expectsResponse: true }
] as const;

export class CpmInstrumentService implements vscode.Disposable {
  private disposed = false;
  private visaBackend: 'visa64' | 'visa32' | undefined;
  private session?: InstrumentSessionProcess;
  private readonly sessionEventEmitter = new vscode.EventEmitter<InstrumentSessionEvent>();
  readonly onDidSessionEvent = this.sessionEventEmitter.event;

  constructor(private readonly output: vscode.OutputChannel) {}

  dispose(): void {
    this.disposed = true;
    void this.closeSession();
    this.sessionEventEmitter.dispose();
  }

  getSessionState(): InstrumentSessionState {
    const session = this.session;
    return session?.connected
      ? { connected: true, transport: session.transport, target: session.target, openedAt: session.openedAt }
      : { connected: false };
  }

  async openSerialSession(settings: SerialCommunicationSettings): Promise<InstrumentSessionState> {
    validateSerialSettings(settings);
    if (process.platform !== 'win32') throw new Error('Persistent serial sessions are currently supported on Windows COM ports.');
    await this.closeSession();
    const script = buildSerialSessionScript(settings);
    const child = spawnPowerShell(script, false);
    await this.attachSession(child, 'serial', settings.portName.trim(), settings.encoding, settings.lineEnding);
    return this.getSessionState();
  }

  async openVisaSession(settings: VisaCommunicationSettings, encoding: FrameEncoding): Promise<InstrumentSessionState> {
    if (process.platform !== 'win32') throw new Error('Persistent VISA sessions are currently supported on Windows.');
    if (!settings.resource.trim()) throw new Error('Select or enter a VISA resource.');
    if (!Number.isFinite(settings.timeoutMs) || settings.timeoutMs < 1 || settings.timeoutMs > 120000) throw new Error('VISA timeout must be between 1 and 120000 ms.');
    await this.closeSession();
    const attempts: Array<'visa64' | 'visa32'> = this.visaBackend ? [this.visaBackend, this.visaBackend === 'visa64' ? 'visa32' : 'visa64'] : ['visa64', 'visa32'];
    let lastError: unknown;
    for (const backend of attempts) {
      try {
        const child = spawnPowerShell(buildVisaSessionScript(settings, backend), backend === 'visa32');
        await this.attachSession(child, 'visa', settings.resource.trim(), encoding, settings.lineEnding);
        this.visaBackend = backend;
        return this.getSessionState();
      } catch (error) {
        lastError = error;
        await this.closeSession();
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Unable to open VISA session.');
  }

  async closeSession(): Promise<void> {
    const session = this.session;
    if (!session) return;
    session.closing = true;
    this.session = undefined;
    try {
      if (!session.child.killed && session.child.stdin.writable) session.child.stdin.write('C\n');
    } catch { /* process may already be gone */ }
    await new Promise<void>((resolve) => {
      if (session.child.exitCode !== null || session.child.killed) { resolve(); return; }
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      session.child.once('exit', finish);
      setTimeout(() => {
        if (session.child.exitCode === null && !session.child.killed) session.child.kill();
        finish();
      }, 750);
    });
    if (session.connected) this.emitSessionEvent({ type: 'disconnected', transport: session.transport, target: session.target, timestamp: Date.now() });
  }

  updateSessionFraming(encoding: FrameEncoding, lineEnding: LineEnding): void {
    if (!this.session?.connected) return;
    this.session.encoding = encoding;
    this.session.lineEnding = lineEnding;
  }

  async writeSession(payload: Buffer): Promise<number> {
    const session = this.session;
    if (!session?.connected) throw new Error('No instrument session is connected.');
    if (!payload.length) throw new Error('The frame is empty.');
    const framed = appendLineEnding(payload, session.lineEnding);
    if (!session.child.stdin.writable) throw new Error('Instrument session input stream is closed.');
    session.child.stdin.write(`W:${framed.toString('base64')}\n`);
    this.emitSessionEvent({ type: 'tx', transport: session.transport, target: session.target, bytes: framed.length, timestamp: Date.now() });
    return framed.length;
  }

  private async attachSession(child: ChildProcessWithoutNullStreams, transport: InstrumentTransport, target: string, encoding: FrameEncoding, lineEnding: LineEnding): Promise<void> {
    const session: InstrumentSessionProcess = {
      child, transport, target, encoding, lineEnding, openedAt: Date.now(), stdoutBuffer: '', stderrBuffer: '', connected: false, closing: false
    };
    this.session = session;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string | Buffer) => this.consumeSessionStdout(session, String(chunk)));
    child.stderr.on('data', (chunk: string | Buffer) => {
      session.stderrBuffer = (session.stderrBuffer + String(chunk)).slice(-8000);
    });
    child.on('exit', (code) => {
      const wasCurrent = this.session === session;
      if (wasCurrent) this.session = undefined;
      if (!session.closing && session.connected) {
        this.emitSessionEvent({ type: 'disconnected', transport, target, message: code === 0 ? undefined : `Backend exited with code ${code ?? 'unknown'}.`, timestamp: Date.now() });
      }
    });
    await new Promise<void>((resolve, reject) => {
      let subscription: vscode.Disposable | undefined;
      const deadline = setTimeout(() => {
        if (!session.connected) {
          subscription?.dispose();
          reject(new Error(session.stderrBuffer.trim() || `Timed out while opening ${target}.`));
        }
      }, 7000);
      subscription = this.onDidSessionEvent((event) => {
        if (event.target !== target || event.transport !== transport) return;
        if (event.type === 'connected') {
          clearTimeout(deadline); subscription?.dispose(); resolve();
        } else if (event.type === 'error' && !session.connected) {
          clearTimeout(deadline); subscription?.dispose(); reject(new Error(event.message || `Failed to open ${target}.`));
        }
      });
      child.once('exit', (code) => {
        if (!session.connected) {
          clearTimeout(deadline); subscription?.dispose(); reject(new Error(session.stderrBuffer.trim() || `Backend exited while opening ${target} (code ${code ?? 'unknown'}).`));
        }
      });
    });
  }

  private consumeSessionStdout(session: InstrumentSessionProcess, chunk: string): void {
    session.stdoutBuffer += chunk;
    for (;;) {
      const index = session.stdoutBuffer.indexOf('\n');
      if (index < 0) break;
      const line = session.stdoutBuffer.slice(0, index).trim();
      session.stdoutBuffer = session.stdoutBuffer.slice(index + 1);
      if (!line) continue;
      let event: any;
      try { event = JSON.parse(line); } catch {
        this.output.appendLine(`[Instrument Diagnostics] Session backend: ${line}`);
        continue;
      }
      const type = String(event?.event ?? '');
      if (type === 'connected') {
        session.connected = true;
        this.emitSessionEvent({ type: 'connected', transport: session.transport, target: session.target, timestamp: Date.now() });
      } else if (type === 'rx') {
        const data = Buffer.from(String(event?.data ?? ''), 'base64');
        if (data.length) this.emitSessionEvent({
          type: 'rx', transport: session.transport, target: session.target, bytes: data.length,
          text: decodeFrame(data, session.encoding), hex: formatHex(data), timestamp: Date.now()
        });
      } else if (type === 'error') {
        const message = event?.messageBase64 ? Buffer.from(String(event.messageBase64), 'base64').toString('utf8') : String(event?.message ?? 'Instrument backend error.');
        this.emitSessionEvent({ type: 'error', transport: session.transport, target: session.target, message, timestamp: Date.now() });
      } else if (type === 'disconnected') {
        session.connected = false;
        this.emitSessionEvent({ type: 'disconnected', transport: session.transport, target: session.target, timestamp: Date.now() });
      }
    }
  }

  private emitSessionEvent(event: InstrumentSessionEvent): void {
    if (!this.disposed) this.sessionEventEmitter.fire(event);
  }

  async discover(): Promise<InstrumentDiscoveryResult> {
    const result: InstrumentDiscoveryResult = { serial: [], usb: [], visa: [], visaAvailable: false, warnings: [] };
    if (process.platform === 'win32') {
      const [pnp, visa] = await Promise.allSettled([this.discoverWindowsPnP(), this.discoverWindowsVisa()]);
      if (pnp.status === 'fulfilled') {
        result.serial = pnp.value.serial;
        result.usb = pnp.value.usb;
      } else {
        result.warnings.push(`Windows device enumeration failed: ${errorMessage(pnp.reason)}`);
      }
      if (visa.status === 'fulfilled') {
        result.visa = visa.value.resources.map((resource) => ({ resource }));
        result.visaAvailable = visa.value.available;
        this.visaBackend = visa.value.backend;
        if (visa.value.warning) result.warnings.push(visa.value.warning);
      } else {
        result.warnings.push(`VISA discovery failed: ${errorMessage(visa.reason)}`);
      }
    } else {
      result.serial = await this.discoverUnixSerial();
      result.usb = await this.discoverUnixUsb();
      result.warnings.push('Serial transmission from Instrument Diagnostics is currently implemented for Windows COM ports. Device enumeration remains available on this platform.');
    }
    return result;
  }

  async exchangeSerial(settings: SerialCommunicationSettings, payload: Buffer, expectResponse: boolean): Promise<InstrumentExchangeResult> {
    validateSerialSettings(settings);
    if (process.platform !== 'win32') {
      throw new Error('Serial transmission is currently supported by CPM Instrument Diagnostics on Windows COM ports.');
    }
    if (payload.length === 0) throw new Error('The frame is empty.');

    const request = {
      ...settings,
      payloadBase64: payload.toString('base64'),
      expectResponse
    };
    const requestBase64 = Buffer.from(JSON.stringify(request), 'utf8').toString('base64');
    const script = buildSerialExchangeScript(requestBase64);
    const started = Date.now();
    const stdout = await runPowerShell(script, Math.max(5000, settings.readTimeoutMs + settings.writeTimeoutMs + 3000));
    const parsed = parseJsonOutput<{ bytesWritten: number; responseBase64: string; elapsedMs: number }>(stdout);
    const response = Buffer.from(parsed.responseBase64 || '', 'base64');
    const elapsedMs = Number.isFinite(parsed.elapsedMs) ? parsed.elapsedMs : Date.now() - started;
    return {
      bytesWritten: parsed.bytesWritten ?? payload.length,
      bytesRead: response.length,
      elapsedMs,
      responseText: decodeFrame(response, settings.encoding),
      responseHex: formatHex(response)
    };
  }

  async exchangeVisa(settings: VisaCommunicationSettings, payload: Buffer, expectResponse: boolean, encoding: FrameEncoding): Promise<InstrumentExchangeResult> {
    if (process.platform !== 'win32') throw new Error('VISA communication from CPM Instrument Diagnostics is currently supported on Windows.');
    if (!settings.resource.trim()) throw new Error('Select or enter a VISA resource.');
    if (!Number.isFinite(settings.timeoutMs) || settings.timeoutMs < 1 || settings.timeoutMs > 120000) throw new Error('VISA timeout must be between 1 and 120000 ms.');
    if (payload.length === 0) throw new Error('The frame is empty.');

    const request = {
      resource: settings.resource.trim(),
      timeoutMs: Math.round(settings.timeoutMs),
      lineEnding: settings.lineEnding,
      payloadBase64: payload.toString('base64'),
      expectResponse
    };
    const requestBase64 = Buffer.from(JSON.stringify(request), 'utf8').toString('base64');
    const started = Date.now();
    const attempts: Array<'visa64' | 'visa32'> = this.visaBackend ? [this.visaBackend, this.visaBackend === 'visa64' ? 'visa32' : 'visa64'] : ['visa64', 'visa32'];
    let stdout = '';
    let lastError: unknown;
    for (const backend of attempts) {
      try {
        stdout = await runPowerShell(buildVisaExchangeScript(requestBase64, backend), Math.max(5000, settings.timeoutMs + 5000), backend === 'visa32');
        this.visaBackend = backend;
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    const parsed = parseJsonOutput<{ bytesWritten: number; responseBase64: string; elapsedMs: number }>(stdout);
    const response = Buffer.from(parsed.responseBase64 || '', 'base64');
    return {
      bytesWritten: parsed.bytesWritten ?? payload.length,
      bytesRead: response.length,
      elapsedMs: Number.isFinite(parsed.elapsedMs) ? parsed.elapsedMs : Date.now() - started,
      responseText: decodeFrame(response, encoding),
      responseHex: formatHex(response)
    };
  }

  encodeFrame(text: string, mode: 'text' | 'hex', encoding: FrameEncoding): Buffer {
    if (mode === 'hex') return parseHex(text);
    switch (encoding) {
      case 'ascii': return Buffer.from(text, 'ascii');
      case 'latin1': return Buffer.from(text, 'latin1');
      default: return Buffer.from(text, 'utf8');
    }
  }

  private async discoverWindowsPnP(): Promise<{ serial: SerialInstrumentDevice[]; usb: UsbInstrumentDevice[] }> {
    const script = String.raw`
$ErrorActionPreference = 'Continue'
function Nz($v) { if ($null -eq $v) { return '' } return [string]$v }
$serialByPort = @{}
try {
  [System.IO.Ports.SerialPort]::GetPortNames() | ForEach-Object {
    $port = [string]$_
    if ($port) {
      $serialByPort[$port] = [pscustomobject]@{ portName=$port; name=$port; description='Serial / COM port'; manufacturer=''; pnpDeviceId=''; status='' }
    }
  }
} catch {}
try {
  Get-CimInstance Win32_SerialPort -ErrorAction Stop | ForEach-Object {
    $port = Nz $_.DeviceID
    if ($port) {
      $serialByPort[$port] = [pscustomobject]@{
        portName = $port
        name = Nz $_.Name
        description = Nz $_.Description
        manufacturer = Nz $_.Manufacturer
        pnpDeviceId = Nz $_.PNPDeviceID
        status = Nz $_.Status
      }
    }
  }
} catch {}
try {
  Get-CimInstance Win32_PnPEntity -ErrorAction Stop | Where-Object { $_.Name -match '\(COM\d+\)' } | ForEach-Object {
    if ((Nz $_.Name) -match '\((COM\d+)\)') {
      $port = $Matches[1]
      if (-not $serialByPort.ContainsKey($port)) {
        $serialByPort[$port] = [pscustomobject]@{
          portName = $port
          name = Nz $_.Name
          description = Nz $_.Description
          manufacturer = Nz $_.Manufacturer
          pnpDeviceId = Nz $_.PNPDeviceID
          status = Nz $_.Status
        }
      }
    }
  }
} catch {}
$usb = @()
try {
  $usb = @(Get-CimInstance Win32_PnPEntity -ErrorAction Stop | Where-Object {
    (Nz $_.PNPDeviceID) -like 'USB\*' -or (Nz $_.PNPDeviceID) -like 'USBSTOR\*'
  } | ForEach-Object {
    [pscustomobject]@{
      name = Nz $_.Name
      manufacturer = Nz $_.Manufacturer
      pnpDeviceId = Nz $_.PNPDeviceID
      service = Nz $_.Service
      status = Nz $_.Status
    }
  } | Sort-Object name, pnpDeviceId -Unique)
} catch {}
[pscustomobject]@{ serial = @($serialByPort.Values | Sort-Object portName); usb = $usb } | ConvertTo-Json -Depth 5 -Compress
`;
    const stdout = await runPowerShell(script, 15000);
    const parsed = parseJsonOutput<{ serial?: unknown; usb?: unknown }>(stdout);
    const serial = asArray<any>(parsed.serial).map((item) => ({
      portName: String(item?.portName ?? ''),
      name: String(item?.name ?? ''),
      description: String(item?.description ?? ''),
      manufacturer: String(item?.manufacturer ?? ''),
      pnpDeviceId: String(item?.pnpDeviceId ?? ''),
      status: String(item?.status ?? '')
    })).filter((item) => item.portName);
    const usb = asArray<any>(parsed.usb).map((item) => {
      const pnpDeviceId = String(item?.pnpDeviceId ?? '');
      const ids = extractVidPid(pnpDeviceId);
      return {
        name: String(item?.name ?? 'USB device'),
        manufacturer: String(item?.manufacturer ?? ''),
        pnpDeviceId,
        service: String(item?.service ?? ''),
        status: String(item?.status ?? ''),
        ...ids
      } satisfies UsbInstrumentDevice;
    }).filter((item) => item.pnpDeviceId);
    return { serial, usb };
  }

  private async discoverWindowsVisa(): Promise<{ available: boolean; resources: string[]; warning?: string; backend?: 'visa64' | 'visa32' }> {
    const errors: string[] = [];
    for (const backend of ['visa64', 'visa32'] as const) {
      try {
        const stdout = await runPowerShell(buildVisaDiscoveryScript(backend), 12000, backend === 'visa32');
        const parsed = parseJsonOutput<{ available?: boolean; resources?: unknown; warning?: string }>(stdout);
        if (parsed.available === true) {
          return {
            available: true,
            resources: asArray<unknown>(parsed.resources).map(String).filter(Boolean),
            warning: backend === 'visa32' ? 'CPM is using the 32-bit VISA runtime through Windows PowerShell x86.' : (parsed.warning ? String(parsed.warning) : undefined),
            backend
          };
        }
        if (parsed.warning) errors.push(`${backend}: ${String(parsed.warning)}`);
      } catch (error) {
        errors.push(`${backend}: ${errorMessage(error)}`);
      }
    }
    if (errors.length) this.output.appendLine(`[Instrument Diagnostics] VISA runtime probe details: ${errors.join(' | ')}`);
    return { available: false, resources: [], warning: 'No usable VISA runtime was detected. COM diagnostics remain available. Install/configure NI-VISA, Keysight VISA or another compatible runtime only if VISA/USBTMC access is required.' };
  }

  private async discoverUnixSerial(): Promise<SerialInstrumentDevice[]> {
    const dev = '/dev';
    if (!fs.existsSync(dev)) return [];
    const patterns = [/^ttyUSB\d+$/, /^ttyACM\d+$/, /^ttyS\d+$/, /^cu\./];
    return fs.readdirSync(dev)
      .filter((name) => patterns.some((pattern) => pattern.test(name)))
      .sort()
      .map((name) => ({ portName: path.join(dev, name), name, description: 'Serial device', manufacturer: '', pnpDeviceId: '', status: '' }));
  }

  private async discoverUnixUsb(): Promise<UsbInstrumentDevice[]> {
    try {
      const { stdout } = await execFileAsync('lsusb', [], { timeout: 5000, maxBuffer: 1024 * 1024 });
      return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
        const match = line.match(/ID\s+([0-9a-f]{4}):([0-9a-f]{4})\s*(.*)$/i);
        return {
          name: match?.[3] || line,
          manufacturer: '',
          pnpDeviceId: line,
          service: '',
          status: '',
          vid: match?.[1]?.toUpperCase(),
          pid: match?.[2]?.toUpperCase()
        };
      });
    } catch {
      return [];
    }
  }
}

export function parseHex(text: string): Buffer {
  const normalized = text
    .replace(/0x/gi, '')
    .replace(/[\s,;:_-]+/g, '')
    .trim();
  if (!normalized) return Buffer.alloc(0);
  if (!/^[0-9a-f]+$/i.test(normalized)) throw new Error('HEX frame contains a non-hexadecimal character.');
  if (normalized.length % 2 !== 0) throw new Error('HEX frame must contain a whole number of bytes (two hexadecimal digits per byte).');
  return Buffer.from(normalized, 'hex');
}

export function formatHex(buffer: Buffer): string {
  return Array.from(buffer).map((value) => value.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function decodeFrame(buffer: Buffer, encoding: FrameEncoding): string {
  if (!buffer.length) return '';
  switch (encoding) {
    case 'ascii': return buffer.toString('ascii');
    case 'latin1': return buffer.toString('latin1');
    default: return buffer.toString('utf8');
  }
}

function validateSerialSettings(settings: SerialCommunicationSettings): void {
  if (!/^COM\d+$/i.test(settings.portName.trim())) throw new Error('Select a valid Windows COM port.');
  if (!Number.isFinite(settings.baudRate) || settings.baudRate < 1 || settings.baudRate > 12000000) throw new Error('Baud rate must be between 1 and 12000000 bit/s.');
  if (![5, 6, 7, 8].includes(settings.dataBits)) throw new Error('Data bits must be 5, 6, 7 or 8.');
  if (!Number.isFinite(settings.readTimeoutMs) || settings.readTimeoutMs < 1 || settings.readTimeoutMs > 120000) throw new Error('Read timeout must be between 1 and 120000 ms.');
  if (!Number.isFinite(settings.writeTimeoutMs) || settings.writeTimeoutMs < 1 || settings.writeTimeoutMs > 120000) throw new Error('Write timeout must be between 1 and 120000 ms.');
}


function appendLineEnding(payload: Buffer, ending: LineEnding): Buffer {
  const suffix = ending === 'lf' ? Buffer.from([10]) : ending === 'cr' ? Buffer.from([13]) : ending === 'crlf' ? Buffer.from([13, 10]) : Buffer.alloc(0);
  return suffix.length ? Buffer.concat([payload, suffix]) : Buffer.from(payload);
}

function buildSerialSessionScript(settings: SerialCommunicationSettings): string {
  const csharp = String.raw`using System;
using System.IO.Ports;
using System.Text;

public static class CpmSerialSessionRunner {
  private static readonly object Sync = new object();
  private static SerialPort Port;

  private static string B64(string value) {
    return Convert.ToBase64String(Encoding.UTF8.GetBytes(value ?? String.Empty));
  }

  private static void Emit(string json) {
    lock (Sync) {
      Console.Out.WriteLine(json);
      Console.Out.Flush();
    }
  }

  private static void EmitError(Exception ex) {
    Emit("{\"event\":\"error\",\"messageBase64\":\"" + B64(ex == null ? "Unknown serial error." : ex.Message) + "\"}");
  }

  private static void OnData(object sender, SerialDataReceivedEventArgs args) {
    try {
      int available = Port == null ? 0 : Port.BytesToRead;
      if (available <= 0) return;
      byte[] data = new byte[available];
      int read = Port.Read(data, 0, data.Length);
      if (read <= 0) return;
      if (read != data.Length) Array.Resize(ref data, read);
      Emit("{\"event\":\"rx\",\"data\":\"" + Convert.ToBase64String(data) + "\"}");
    } catch (Exception ex) {
      EmitError(ex);
    }
  }

  public static void Run(string portName, int baudRate, int dataBits, string parity, string stopBits, string handshake, int readTimeout, int writeTimeout, bool dtr, bool rts) {
    try {
      Port = new SerialPort(portName, baudRate, (Parity)Enum.Parse(typeof(Parity), parity, true), dataBits, (StopBits)Enum.Parse(typeof(StopBits), stopBits, true));
      Port.Handshake = (Handshake)Enum.Parse(typeof(Handshake), handshake, true);
      Port.ReadTimeout = readTimeout;
      Port.WriteTimeout = writeTimeout;
      Port.DtrEnable = dtr;
      if (Port.Handshake != Handshake.RequestToSend && Port.Handshake != Handshake.RequestToSendXOnXOff) Port.RtsEnable = rts;
      Port.DataReceived += OnData;
      Port.Open();
      Emit("{\"event\":\"connected\"}");
      string line;
      while ((line = Console.In.ReadLine()) != null) {
        if (line == "C") break;
        if (!line.StartsWith("W:", StringComparison.Ordinal)) continue;
        try {
          byte[] data = Convert.FromBase64String(line.Substring(2));
          Port.Write(data, 0, data.Length);
          Port.BaseStream.Flush();
        } catch (Exception ex) {
          EmitError(ex);
        }
      }
    } catch (Exception ex) {
      EmitError(ex);
    } finally {
      try {
        if (Port != null) {
          Port.DataReceived -= OnData;
          if (Port.IsOpen) Port.Close();
          Port.Dispose();
        }
      } catch {}
      Emit("{\"event\":\"disconnected\"}");
    }
  }
}`;
  return String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${csharp}
'@
[CpmSerialSessionRunner]::Run(${psString(settings.portName.trim())}, ${Math.round(settings.baudRate)}, ${settings.dataBits}, ${psString(settings.parity)}, ${psString(settings.stopBits)}, ${psString(settings.handshake)}, ${Math.round(settings.readTimeoutMs)}, ${Math.round(settings.writeTimeoutMs)}, $${settings.dtrEnable ? 'true' : 'false'}, $${settings.rtsEnable ? 'true' : 'false'})
`;
}

function buildVisaSessionScript(settings: VisaCommunicationSettings, backend: 'visa64' | 'visa32'): string {
  const dll = backend === 'visa32' ? 'visa32.dll' : 'visa64.dll';
  const attrStateType = backend === 'visa32' ? 'UInt32' : 'UInt64';
  const csharp = String.raw`using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;

public static class CpmVisaSessionRunner {
  private const UInt32 VI_ATTR_TMO_VALUE = 0x3FFF001A;
  private const int VI_ERROR_TMO = unchecked((int)0xBFFF0015);
  private static readonly object IoSync = new object();
  private static readonly object OutSync = new object();
  private static volatile bool Running;
  private static UInt32 Rm;
  private static UInt32 Vi;

  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  private static extern int viOpenDefaultRM(out UInt32 sesn);
  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  private static extern int viOpen(UInt32 sesn, string name, UInt32 mode, UInt32 timeout, out UInt32 vi);
  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall)]
  private static extern int viWrite(UInt32 vi, [In] byte[] buffer, UInt32 count, out UInt32 retCount);
  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall)]
  private static extern int viRead(UInt32 vi, [Out] byte[] buffer, UInt32 count, out UInt32 retCount);
  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall)]
  private static extern int viSetAttribute(UInt32 vi, UInt32 attribute, ${attrStateType} state);
  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall)]
  private static extern int viClose(UInt32 vi);

  private static string B64(string value) { return Convert.ToBase64String(Encoding.UTF8.GetBytes(value ?? String.Empty)); }
  private static void Emit(string json) { lock (OutSync) { Console.Out.WriteLine(json); Console.Out.Flush(); } }
  private static void EmitError(string message) { Emit("{\"event\":\"error\",\"messageBase64\":\"" + B64(message) + "\"}"); }
  private static string Status(int value) { return "0x" + unchecked((UInt32)value).ToString("X8"); }

  private static void Reader() {
    byte[] buffer = new byte[65536];
    while (Running) {
      try {
        UInt32 read = 0;
        int status;
        lock (IoSync) { status = viRead(Vi, buffer, (UInt32)buffer.Length, out read); }
        if (read > 0) {
          byte[] data = new byte[read];
          Array.Copy(buffer, data, (int)read);
          Emit("{\"event\":\"rx\",\"data\":\"" + Convert.ToBase64String(data) + "\"}");
        } else if (status < 0 && status != VI_ERROR_TMO) {
          EmitError("viRead failed: " + Status(status));
          Thread.Sleep(100);
        }
      } catch (Exception ex) {
        if (Running) EmitError(ex.Message);
        Thread.Sleep(100);
      }
    }
  }

  public static void Run(string resource, UInt32 openTimeoutMs) {
    Thread reader = null;
    try {
      int status = viOpenDefaultRM(out Rm);
      if (status < 0) throw new Exception("viOpenDefaultRM failed: " + Status(status));
      status = viOpen(Rm, resource, 0, openTimeoutMs, out Vi);
      if (status < 0) throw new Exception("viOpen failed for " + resource + ": " + Status(status));
      viSetAttribute(Vi, VI_ATTR_TMO_VALUE, (${attrStateType})100);
      Running = true;
      reader = new Thread(Reader);
      reader.IsBackground = true;
      reader.Start();
      Emit("{\"event\":\"connected\"}");
      string line;
      while ((line = Console.In.ReadLine()) != null) {
        if (line == "C") break;
        if (!line.StartsWith("W:", StringComparison.Ordinal)) continue;
        try {
          byte[] data = Convert.FromBase64String(line.Substring(2));
          UInt32 written = 0;
          lock (IoSync) { status = viWrite(Vi, data, (UInt32)data.Length, out written); }
          if (status < 0) EmitError("viWrite failed: " + Status(status));
        } catch (Exception ex) { EmitError(ex.Message); }
      }
    } catch (Exception ex) {
      EmitError(ex.Message);
    } finally {
      Running = false;
      try { if (reader != null && reader.IsAlive) reader.Join(500); } catch {}
      try { if (Vi != 0) viClose(Vi); } catch {}
      try { if (Rm != 0) viClose(Rm); } catch {}
      Emit("{\"event\":\"disconnected\"}");
    }
  }
}`;
  return String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${csharp}
'@
[CpmVisaSessionRunner]::Run(${psString(settings.resource.trim())}, [uint32]${Math.round(settings.timeoutMs)})
`;
}

function psString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function resolvePowerShell(prefer32Bit: boolean): string {
  const windowsRoot = process.env.SystemRoot || 'C:\\Windows';
  const primary = path.join(windowsRoot, prefer32Bit ? 'SysWOW64' : 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const fallback = path.join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return fs.existsSync(primary) ? primary : (fs.existsSync(fallback) ? fallback : 'powershell.exe');
}

function spawnPowerShell(script: string, prefer32Bit: boolean): ChildProcessWithoutNullStreams {
  if (process.platform !== 'win32') throw new Error('PowerShell instrument sessions are only available on Windows.');
  const command = resolvePowerShell(prefer32Bit);
  const encoded = Buffer.from(powerShellUtf8Prelude() + script, 'utf16le').toString('base64');
  return spawn(command, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

function buildSerialExchangeScript(requestBase64: string): string {
  return String.raw`
$ErrorActionPreference = 'Stop'
$cfg = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${requestBase64}')) | ConvertFrom-Json
$port = New-Object System.IO.Ports.SerialPort
try {
  $port.PortName = [string]$cfg.portName
  $port.BaudRate = [int]$cfg.baudRate
  $port.DataBits = [int]$cfg.dataBits
  $port.Parity = [System.Enum]::Parse([System.IO.Ports.Parity], [string]$cfg.parity, $true)
  $port.StopBits = [System.Enum]::Parse([System.IO.Ports.StopBits], [string]$cfg.stopBits, $true)
  $port.Handshake = [System.Enum]::Parse([System.IO.Ports.Handshake], [string]$cfg.handshake, $true)
  $port.ReadTimeout = [int]$cfg.readTimeoutMs
  $port.WriteTimeout = [int]$cfg.writeTimeoutMs
  $port.DtrEnable = [bool]$cfg.dtrEnable
  $payload = [Convert]::FromBase64String([string]$cfg.payloadBase64)
  [byte[]]$ending = switch ([string]$cfg.lineEnding) {
    'lf' { 10 }
    'cr' { 13 }
    'crlf' { 13,10 }
    default { @() }
  }
  if ($port.Handshake -ne [System.IO.Ports.Handshake]::RequestToSend -and $port.Handshake -ne [System.IO.Ports.Handshake]::RequestToSendXOnXOff) {
    $port.RtsEnable = [bool]$cfg.rtsEnable
  }
  if ($ending.Length -gt 0) {
    [byte[]]$combined = New-Object byte[] ($payload.Length + $ending.Length)
    [Array]::Copy($payload, 0, $combined, 0, $payload.Length)
    [Array]::Copy($ending, 0, $combined, $payload.Length, $ending.Length)
    $payload = $combined
  }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $port.Open()
  $port.DiscardInBuffer()
  $port.Write($payload, 0, $payload.Length)
  $port.BaseStream.Flush()
  $response = New-Object System.Collections.Generic.List[byte]
  if ([bool]$cfg.expectResponse) {
    $deadline = [DateTime]::UtcNow.AddMilliseconds([int]$cfg.readTimeoutMs)
    $lastData = [DateTime]::UtcNow
    $receivedAny = $false
    while ([DateTime]::UtcNow -lt $deadline) {
      $available = $port.BytesToRead
      if ($available -gt 0) {
        [byte[]]$chunk = New-Object byte[] $available
        $read = $port.Read($chunk, 0, $chunk.Length)
        for ($i = 0; $i -lt $read; $i++) { $response.Add($chunk[$i]) }
        $receivedAny = $true
        $lastData = [DateTime]::UtcNow
      } elseif ($receivedAny -and (([DateTime]::UtcNow - $lastData).TotalMilliseconds -ge 120)) {
        break
      } else {
        Start-Sleep -Milliseconds 15
      }
    }
  }
  $sw.Stop()
  [pscustomobject]@{
    bytesWritten = $payload.Length
    responseBase64 = [Convert]::ToBase64String($response.ToArray())
    elapsedMs = [int]$sw.ElapsedMilliseconds
  } | ConvertTo-Json -Compress
} finally {
  if ($port.IsOpen) { $port.Close() }
  $port.Dispose()
}
`;
}

function buildVisaDiscoveryScript(backend: 'visa64' | 'visa32'): string {
  const csharp = visaCSharpInterop(backend);
  return String.raw`
$ErrorActionPreference = 'Stop'
try {
  Add-Type -TypeDefinition @'
${csharp}
'@
  [uint32]$rm = 0
  $status = [CpmVisaNative]::viOpenDefaultRM([ref]$rm)
  if ($status -lt 0) { throw ('viOpenDefaultRM failed: 0x{0:X8}' -f ([uint32]$status)) }
  try {
    [uint32]$find = 0
    [uint32]$count = 0
    $desc = New-Object Text.StringBuilder 1024
    $resources = New-Object System.Collections.Generic.List[string]
    $findStatus = [CpmVisaNative]::viFindRsrc($rm, '?*INSTR', [ref]$find, [ref]$count, $desc)
    if ($findStatus -ge 0 -and $count -gt 0) {
      $resources.Add($desc.ToString())
      for ($i = 1; $i -lt $count; $i++) {
        $desc.Clear() | Out-Null
        $nextStatus = [CpmVisaNative]::viFindNext($find, $desc)
        if ($nextStatus -lt 0) { break }
        $resources.Add($desc.ToString())
      }
      if ($find -ne 0) { [CpmVisaNative]::viClose($find) | Out-Null }
    }
    [pscustomobject]@{ available = $true; resources = @($resources); warning = '' } | ConvertTo-Json -Depth 4 -Compress
  } finally {
    if ($rm -ne 0) { [CpmVisaNative]::viClose($rm) | Out-Null }
  }
} catch {
  [pscustomobject]@{ available = $false; resources = @(); warning = $_.Exception.Message } | ConvertTo-Json -Depth 4 -Compress
}
`;
}

function buildVisaExchangeScript(requestBase64: string, backend: 'visa64' | 'visa32'): string {
  const csharp = visaCSharpInterop(backend);
  return String.raw`
$ErrorActionPreference = 'Stop'
$cfg = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${requestBase64}')) | ConvertFrom-Json
Add-Type -TypeDefinition @'
${csharp}
'@
[uint32]$rm = 0
[uint32]$vi = 0
$sw = [Diagnostics.Stopwatch]::StartNew()
try {
  $status = [CpmVisaNative]::viOpenDefaultRM([ref]$rm)
  if ($status -lt 0) { throw ('viOpenDefaultRM failed: 0x{0:X8}' -f ([uint32]$status)) }
  $status = [CpmVisaNative]::viOpen($rm, [string]$cfg.resource, 0, [uint32]$cfg.timeoutMs, [ref]$vi)
  if ($status -lt 0) { throw ('viOpen failed for ' + [string]$cfg.resource + ': 0x{0:X8}' -f ([uint32]$status)) }
  [CpmVisaNative]::viSetAttribute($vi, [uint32]0x3FFF001A, [uint32]$cfg.timeoutMs) | Out-Null
  $payload = [Convert]::FromBase64String([string]$cfg.payloadBase64)
  [byte[]]$ending = switch ([string]$cfg.lineEnding) {
    'lf' { 10 }
    'cr' { 13 }
    'crlf' { 13,10 }
    default { @() }
  }
  if ($ending.Length -gt 0) {
    [byte[]]$combined = New-Object byte[] ($payload.Length + $ending.Length)
    [Array]::Copy($payload, 0, $combined, 0, $payload.Length)
    [Array]::Copy($ending, 0, $combined, $payload.Length, $ending.Length)
    $payload = $combined
  }
  [uint32]$written = 0
  $status = [CpmVisaNative]::viWrite($vi, $payload, [uint32]$payload.Length, [ref]$written)
  if ($status -lt 0) { throw ('viWrite failed: 0x{0:X8}' -f ([uint32]$status)) }
  [byte[]]$response = @()
  if ([bool]$cfg.expectResponse) {
    [byte[]]$buffer = New-Object byte[] 65536
    [uint32]$read = 0
    $status = [CpmVisaNative]::viRead($vi, $buffer, [uint32]$buffer.Length, [ref]$read)
    if ($status -lt 0) { throw ('viRead failed: 0x{0:X8}' -f ([uint32]$status)) }
    if ($read -gt 0) {
      $response = New-Object byte[] $read
      [Array]::Copy($buffer, 0, $response, 0, $read)
    }
  }
  $sw.Stop()
  [pscustomobject]@{
    bytesWritten = [int]$written
    responseBase64 = [Convert]::ToBase64String($response)
    elapsedMs = [int]$sw.ElapsedMilliseconds
  } | ConvertTo-Json -Compress
} finally {
  if ($vi -ne 0) { [CpmVisaNative]::viClose($vi) | Out-Null }
  if ($rm -ne 0) { [CpmVisaNative]::viClose($rm) | Out-Null }
}
`;
}

function visaCSharpInterop(backend: 'visa64' | 'visa32'): string {
  const dll = backend === 'visa32' ? 'visa32.dll' : 'visa64.dll';
  const attrStateType = backend === 'visa32' ? 'UInt32' : 'UInt64';
  return String.raw`using System;
using System.Text;
using System.Runtime.InteropServices;
public static class CpmVisaNative {
  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int viOpenDefaultRM(out UInt32 sesn);
  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int viFindRsrc(UInt32 sesn, string expr, out UInt32 findList, out UInt32 retCnt, StringBuilder desc);
  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int viFindNext(UInt32 findList, StringBuilder desc);
  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
  public static extern int viOpen(UInt32 sesn, string name, UInt32 mode, UInt32 timeout, out UInt32 vi);
  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall)]
  public static extern int viWrite(UInt32 vi, [In] byte[] buffer, UInt32 count, out UInt32 retCount);
  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall)]
  public static extern int viRead(UInt32 vi, [Out] byte[] buffer, UInt32 count, out UInt32 retCount);
  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall)]
  public static extern int viSetAttribute(UInt32 vi, UInt32 attribute, ${attrStateType} state);
  [DllImport("${dll}", CallingConvention = CallingConvention.StdCall)]
  public static extern int viClose(UInt32 vi);
}`;
}

async function runPowerShell(script: string, timeoutMs: number, prefer32Bit = false): Promise<string> {
  if (process.platform !== 'win32') throw new Error('PowerShell transport is only used on Windows.');
  const command = resolvePowerShell(prefer32Bit);
  const encoded = Buffer.from(powerShellUtf8Prelude() + script, 'utf16le').toString('base64');
  try {
    const { stdout, stderr } = await execFileAsync(command, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      encoding: 'utf8'
    });
    if (stderr.trim()) {
      // PowerShell can write harmless native-loader diagnostics to stderr. Keep
      // them in the CPM log while still accepting a valid JSON result.
      // eslint-style logging is intentionally avoided because CPM has its own channel.
    }
    return stdout.trim();
  } catch (error: any) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    const detail = stderr || stdout || errorMessage(error);
    throw new Error(shortPowerShellDiagnostic(detail));
  }
}

function powerShellUtf8Prelude(): string {
  return `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)\n[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)\n$OutputEncoding = [Console]::OutputEncoding\n$ProgressPreference = 'SilentlyContinue'\n`;
}

function shortPowerShellDiagnostic(value: string): string {
  let text = String(value ?? '').replace(/^#< CLIXML\s*/i, '').trim();
  text = text.replace(/_x000D__x000A_/gi, '\n').replace(/_x0009_/gi, '\t');
  text = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > 700) text = text.slice(0, 697) + '…';
  return text || 'PowerShell instrument backend failed.';
}

function parseJsonOutput<T>(stdout: string): T {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index--) {
    try { return JSON.parse(lines[index]) as T; } catch { /* try prior line */ }
  }
  throw new Error(stdout ? `Unexpected diagnostic backend output: ${stdout.slice(-1000)}` : 'Diagnostic backend returned no data.');
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === undefined || value === null) return [];
  return [value as T];
}

function extractVidPid(pnpDeviceId: string): { vid?: string; pid?: string } {
  const match = pnpDeviceId.match(/VID_([0-9A-F]{4}).*PID_([0-9A-F]{4})/i);
  return match ? { vid: match[1].toUpperCase(), pid: match[2].toUpperCase() } : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
