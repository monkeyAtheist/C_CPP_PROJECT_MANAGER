import * as vscode from 'vscode';
import {
  CpmInstrumentService,
  FrameEncoding,
  InstrumentDiscoveryResult,
  InstrumentSessionEvent,
  LineEnding,
  SCPI_PRESETS,
  SerialCommunicationSettings,
  VisaCommunicationSettings
} from '../services/cpmInstrumentService';
import { CpmDeviceEndpoint, CpmDeviceRegistry, pickOrCreateDevice } from '../services/cpmDeviceRegistry';

interface InstrumentPanelState {
  transport: 'serial' | 'visa';
  serial: SerialCommunicationSettings;
  visa: VisaCommunicationSettings;
  frameMode: 'text' | 'hex';
  frameEncoding: FrameEncoding;
  frameText: string;
  expectResponse: boolean;
}

interface InstrumentProfile {
  id: string;
  name: string;
  state: InstrumentPanelState;
}

interface SavedInstrumentCommand {
  id: string;
  name: string;
  command: string;
  frameMode: 'text' | 'hex';
  frameEncoding: FrameEncoding;
  expectResponse: boolean;
}

interface InstrumentCommandHistoryEntry {
  id: string;
  timestamp: number;
  transport: 'serial' | 'visa';
  target: string;
  command: string;
  frameMode: 'text' | 'hex';
  frameEncoding: FrameEncoding;
}

type DiagnosticMatchMode = 'any' | 'contains' | 'equals' | 'regex';

interface DiagnosticSequenceStep {
  id: string;
  name: string;
  command: string;
  frameMode: 'text' | 'hex';
  frameEncoding: FrameEncoding;
  expectResponse: boolean;
  timeoutMs: number;
  delayAfterMs: number;
  matchMode: DiagnosticMatchMode;
  expected: string;
}

interface DiagnosticSequence {
  id: string;
  name: string;
  stopOnFailure: boolean;
  steps: DiagnosticSequenceStep[];
}

interface DiagnosticSequenceRun {
  id: string;
  name: string;
  cancelled: boolean;
  cancelPending?: () => void;
}

interface PendingSequenceResponse {
  runId: string;
  stepId: string;
  step: DiagnosticSequenceStep;
  text: string;
  hex: string;
  startedAt: number;
  finish: (result: SequenceResponseResult) => void;
}

interface SequenceResponseResult {
  status: 'pass' | 'fail' | 'cancelled';
  responseText: string;
  responseHex: string;
  message: string;
  elapsedMs: number;
}

const STATE_KEY = 'cpm.instrumentDiagnostics.settings.v1';
const PROFILE_KEY = 'cpm.instrumentDiagnostics.profiles.v1';
const COMMAND_KEY = 'cpm.instrumentDiagnostics.savedCommands.v1';
const HISTORY_KEY = 'cpm.instrumentDiagnostics.history.v1';
const SEQUENCE_KEY = 'cpm.instrumentDiagnostics.sequences.v1';
const MAX_PROFILES = 32;
const MAX_COMMANDS = 64;
const MAX_HISTORY = 100;
const MAX_SEQUENCES = 32;
const MAX_SEQUENCE_STEPS = 64;

const DEFAULT_STATE: InstrumentPanelState = {
  transport: 'serial',
  serial: {
    portName: '',
    baudRate: 9600,
    dataBits: 8,
    parity: 'None',
    stopBits: 'One',
    handshake: 'None',
    readTimeoutMs: 1500,
    writeTimeoutMs: 1500,
    dtrEnable: false,
    rtsEnable: false,
    encoding: 'ascii',
    lineEnding: 'lf'
  },
  visa: {
    resource: '',
    timeoutMs: 2000,
    lineEnding: 'lf'
  },
  frameMode: 'text',
  frameEncoding: 'ascii',
  frameText: '*IDN?',
  expectResponse: true
};

export class InstrumentDiagnosticsPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private discovery: InstrumentDiscoveryResult = { serial: [], usb: [], visa: [], visaAvailable: false, warnings: [] };
  private state: InstrumentPanelState;
  private profiles: InstrumentProfile[];
  private savedCommands: SavedInstrumentCommand[];
  private history: InstrumentCommandHistoryEntry[];
  private sequences: DiagnosticSequence[];
  private activeSequenceRun?: DiagnosticSequenceRun;
  private pendingSequenceResponse?: PendingSequenceResponse;
  private disposed = false;
  private readonly sessionSubscription: vscode.Disposable;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly instruments: CpmInstrumentService,
    private readonly output: vscode.OutputChannel,
    private readonly devices: CpmDeviceRegistry
  ) {
    this.state = normalizeState(context.globalState.get<Partial<InstrumentPanelState>>(STATE_KEY));
    this.profiles = normalizeProfiles(context.globalState.get<unknown>(PROFILE_KEY));
    this.savedCommands = normalizeSavedCommands(context.globalState.get<unknown>(COMMAND_KEY));
    this.history = normalizeHistory(context.globalState.get<unknown>(HISTORY_KEY));
    this.sequences = normalizeSequences(context.globalState.get<unknown>(SEQUENCE_KEY));
    this.sessionSubscription = instruments.onDidSessionEvent((event) => void this.forwardSessionEvent(event));
  }

  show(endpoint?: CpmDeviceEndpoint): void {
    if (this.disposed) return;
    if (endpoint?.kind === 'serial' || endpoint?.kind === 'visa') {
      void this.instruments.closeSession();
      this.applyDeviceEndpoint(endpoint);
    }
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'cpm.instrumentDiagnostics',
        'Instrument Diagnostics',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.stopSequence();
        void this.instruments.closeSession();
      });
      this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message));
      this.panel.webview.html = this.render(this.panel.webview);
    }
    this.panel.reveal(vscode.ViewColumn.Active);
    if (endpoint) void this.postState();
  }

  dispose(): void {
    this.disposed = true;
    this.stopSequence();
    this.sessionSubscription.dispose();
    void this.instruments.closeSession();
    this.panel?.dispose();
    this.panel = undefined;
  }

  private async handleMessage(message: any): Promise<void> {
    if (!this.panel || this.disposed) return;
    try {
      switch (String(message?.type ?? '')) {
        case 'ready':
          await this.postState();
          await this.refreshDevices();
          return;
        case 'refreshDevices':
          await this.refreshDevices();
          return;
        case 'saveState':
          await this.saveState(message.state);
          return;
        case 'connect':
          await this.connect(message.state);
          return;
        case 'disconnect':
          this.stopSequence();
          await this.instruments.closeSession();
          await this.postSessionState();
          return;
        case 'sendFrame':
          await this.sendFrame(message.state);
          return;
        case 'saveProfile':
          await this.saveProfile(String(message.name ?? ''), message.state);
          return;
        case 'saveToDevice':
          await this.saveCurrentEndpointToDevice(message.state);
          return;
        case 'applyProfile':
          await this.applyProfile(String(message.id ?? ''));
          return;
        case 'profileToDevice':
          await this.profileToDevice(String(message.id ?? ''));
          return;
        case 'deleteProfile':
          await this.deleteProfile(String(message.id ?? ''));
          return;
        case 'saveCommand':
          await this.saveCommand(String(message.name ?? ''), message.state);
          return;
        case 'deleteCommand':
          await this.deleteCommand(String(message.id ?? ''));
          return;
        case 'saveSequence':
          await this.saveSequence(String(message.name ?? ''), Boolean(message.stopOnFailure), message.steps);
          return;
        case 'deleteSequence':
          await this.deleteSequence(String(message.id ?? ''));
          return;
        case 'runSequence':
          await this.runSequence(String(message.name ?? ''), Boolean(message.stopOnFailure), message.steps);
          return;
        case 'stopSequence':
          this.stopSequence();
          return;
        case 'clearHistory':
          this.history = [];
          await this.context.globalState.update(HISTORY_KEY, this.history);
          await this.postCollections();
          return;
        case 'copyText':
          await vscode.env.clipboard.writeText(String(message.text ?? ''));
          return;
        case 'openHelp':
          await vscode.env.openExternal(vscode.Uri.parse('https://www.ivifoundation.org/About-IVI/scpi.html'));
          return;
        case 'openNetworkDiagnostics':
          await vscode.commands.executeCommand('cpm.openNetworkDiagnostics');
          return;
        case 'openDeviceManager':
          await vscode.commands.executeCommand('cpm.openDeviceManager');
          return;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`[Instrument Diagnostics] ${detail}`);
      await this.panel.webview.postMessage({ type: 'error', message: detail });
      await this.postSessionState();
    }
  }

  private async saveState(rawState: unknown): Promise<void> {
    this.state = normalizeState(rawState);
    await this.context.globalState.update(STATE_KEY, this.state);
  }

  private async postState(): Promise<void> {
    if (!this.panel) return;
    await this.panel.webview.postMessage({
      type: 'state',
      state: this.state,
      presets: SCPI_PRESETS,
      profiles: this.profiles,
      savedCommands: this.savedCommands,
      history: this.history,
      sequences: this.sequences,
      session: this.instruments.getSessionState()
    });
  }

  private async postCollections(): Promise<void> {
    if (!this.panel) return;
    await this.panel.webview.postMessage({
      type: 'collections',
      profiles: this.profiles,
      savedCommands: this.savedCommands,
      history: this.history,
      sequences: this.sequences
    });
  }

  private async postSessionState(): Promise<void> {
    await this.panel?.webview.postMessage({ type: 'sessionState', session: this.instruments.getSessionState() });
  }

  private async refreshDevices(): Promise<void> {
    if (!this.panel) return;
    await this.panel.webview.postMessage({ type: 'busy', operation: 'discover', busy: true });
    try {
      this.discovery = await this.instruments.discover();
      if (!this.state.serial.portName && this.discovery.serial.length) this.state.serial.portName = this.discovery.serial[0].portName;
      if (!this.state.visa.resource && this.discovery.visa.length) this.state.visa.resource = this.discovery.visa[0].resource;
      await this.context.globalState.update(STATE_KEY, this.state);
      await this.panel.webview.postMessage({ type: 'devices', discovery: this.discovery, state: this.state });
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'discover', busy: false });
    }
  }

  private async connect(rawState: unknown): Promise<void> {
    if (!this.panel) return;
    this.state = normalizeState(rawState);
    await this.context.globalState.update(STATE_KEY, this.state);
    await this.panel.webview.postMessage({ type: 'busy', operation: 'connect', busy: true });
    try {
      if (this.state.transport === 'serial') {
        await this.instruments.openSerialSession({ ...this.state.serial, encoding: this.state.frameEncoding });
      } else {
        await this.instruments.openVisaSession(this.state.visa, this.state.frameEncoding);
      }
      this.instruments.updateSessionFraming(this.state.frameEncoding, this.activeLineEnding());
      await this.postSessionState();
    } finally {
      await this.panel?.webview.postMessage({ type: 'busy', operation: 'connect', busy: false });
    }
  }

  private async sendFrame(rawState: unknown): Promise<void> {
    if (!this.panel) return;
    this.state = normalizeState(rawState);
    await this.context.globalState.update(STATE_KEY, this.state);
    const session = this.instruments.getSessionState();
    if (!session.connected) throw new Error('Connect to an instrument before sending a frame.');
    if (session.transport !== this.state.transport) throw new Error('The selected transport differs from the active session. Disconnect and reconnect first.');
    const selectedTarget = this.state.transport === 'serial' ? this.state.serial.portName.trim() : this.state.visa.resource.trim();
    if (session.target !== selectedTarget) throw new Error('The selected instrument differs from the active session. Disconnect and reconnect first.');

    this.instruments.updateSessionFraming(this.state.frameEncoding, this.activeLineEnding());
    const payload = this.instruments.encodeFrame(this.state.frameText, this.state.frameMode, this.state.frameEncoding);
    const bytesWritten = await this.instruments.writeSession(payload);
    await this.recordHistory(this.state.frameText, this.state.frameMode, this.state.frameEncoding, this.state.transport, selectedTarget);
    await this.panel.webview.postMessage({ type: 'frameSent', bytesWritten, history: this.history });
  }

  private activeLineEnding(): LineEnding {
    return this.state.transport === 'serial' ? this.state.serial.lineEnding : this.state.visa.lineEnding;
  }

  private async saveProfile(nameRaw: string, rawState: unknown): Promise<void> {
    const name = nameRaw.trim();
    if (!name) throw new Error('Enter a profile name.');
    const state = normalizeState(rawState);
    const existing = this.profiles.find((item) => item.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0);
    if (existing) {
      existing.name = name;
      existing.state = cloneState(state);
    } else {
      this.profiles.unshift({ id: createId(), name, state: cloneState(state) });
      this.profiles = this.profiles.slice(0, MAX_PROFILES);
    }
    await this.context.globalState.update(PROFILE_KEY, this.profiles);
    await this.postCollections();
  }

  private async applyProfile(id: string): Promise<void> {
    const profile = this.profiles.find((item) => item.id === id);
    if (!profile) throw new Error('Instrument profile not found.');
    if (this.instruments.getSessionState().connected) await this.instruments.closeSession();
    this.state = cloneState(profile.state);
    await this.context.globalState.update(STATE_KEY, this.state);
    await this.postState();
  }

  private async deleteProfile(id: string): Promise<void> {
    this.profiles = this.profiles.filter((item) => item.id !== id);
    await this.context.globalState.update(PROFILE_KEY, this.profiles);
    await this.postCollections();
  }

  private async saveCommand(nameRaw: string, rawState: unknown): Promise<void> {
    const state = normalizeState(rawState);
    const name = nameRaw.trim() || state.frameText.trim().slice(0, 48);
    if (!name) throw new Error('Enter a command before saving it.');
    if (!state.frameText.trim()) throw new Error('Cannot save an empty command.');
    const existing = this.savedCommands.find((item) => item.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0);
    const value: SavedInstrumentCommand = {
      id: existing?.id ?? createId(),
      name,
      command: state.frameText,
      frameMode: state.frameMode,
      frameEncoding: state.frameEncoding,
      expectResponse: state.expectResponse
    };
    if (existing) Object.assign(existing, value);
    else {
      this.savedCommands.unshift(value);
      this.savedCommands = this.savedCommands.slice(0, MAX_COMMANDS);
    }
    await this.context.globalState.update(COMMAND_KEY, this.savedCommands);
    await this.postCollections();
  }

  private async deleteCommand(id: string): Promise<void> {
    this.savedCommands = this.savedCommands.filter((item) => item.id !== id);
    await this.context.globalState.update(COMMAND_KEY, this.savedCommands);
    await this.postCollections();
  }

  private async saveSequence(nameRaw: string, stopOnFailureRaw: boolean, rawSteps: unknown): Promise<void> {
    const name = nameRaw.trim();
    if (!name) throw new Error('Enter a sequence name.');
    const steps = normalizeSequenceSteps(rawSteps);
    validateSequenceSteps(steps);
    const existing = this.sequences.find((item) => item.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0);
    const value: DiagnosticSequence = {
      id: existing?.id ?? createId(),
      name,
      stopOnFailure: stopOnFailureRaw,
      steps: cloneSequenceSteps(steps)
    };
    if (existing) Object.assign(existing, value);
    else {
      this.sequences.unshift(value);
      this.sequences = this.sequences.slice(0, MAX_SEQUENCES);
    }
    await this.context.globalState.update(SEQUENCE_KEY, this.sequences);
    await this.postCollections();
  }

  private async deleteSequence(id: string): Promise<void> {
    this.sequences = this.sequences.filter((item) => item.id !== id);
    await this.context.globalState.update(SEQUENCE_KEY, this.sequences);
    await this.postCollections();
  }

  private stopSequence(): void {
    const run = this.activeSequenceRun;
    if (!run) return;
    run.cancelled = true;
    run.cancelPending?.();
    run.cancelPending = undefined;
    void this.panel?.webview.postMessage({ type: 'sequenceStopping', runId: run.id });
  }

  private async runSequence(nameRaw: string, stopOnFailureRaw: boolean, rawSteps: unknown): Promise<void> {
    if (!this.panel) return;
    if (this.activeSequenceRun) throw new Error('A diagnostic sequence is already running.');
    const session = this.instruments.getSessionState();
    if (!session.connected || !session.transport || !session.target) throw new Error('Connect to an instrument before running a diagnostic sequence.');

    const steps = normalizeSequenceSteps(rawSteps);
    validateSequenceSteps(steps);
    const run: DiagnosticSequenceRun = { id: createId(), name: nameRaw.trim() || 'Diagnostic sequence', cancelled: false };
    this.activeSequenceRun = run;
    let passed = 0;
    let failed = 0;
    await this.panel.webview.postMessage({ type: 'sequenceRunStarted', runId: run.id, name: run.name, stepCount: steps.length });

    try {
      for (let index = 0; index < steps.length; index++) {
        const step = steps[index];
        if (run.cancelled) break;
        const startedAt = Date.now();
        await this.panel.webview.postMessage({ type: 'sequenceStepStarted', runId: run.id, index, step });
        this.instruments.updateSessionFraming(step.frameEncoding, this.activeLineEnding());

        let responsePromise: Promise<SequenceResponseResult> | undefined;
        if (step.expectResponse) responsePromise = this.waitForSequenceResponse(run, step);

        let result: SequenceResponseResult;
        let bytesWritten = 0;
        try {
          const payload = this.instruments.encodeFrame(step.command, step.frameMode, step.frameEncoding);
          bytesWritten = await this.instruments.writeSession(payload);
          await this.recordHistory(step.command, step.frameMode, step.frameEncoding, session.transport, session.target);
          await this.panel.webview.postMessage({ type: 'sequenceStepTx', runId: run.id, index, bytesWritten });
          if (step.expectResponse && responsePromise) {
            result = await responsePromise;
          } else {
            result = {
              status: run.cancelled ? 'cancelled' : 'pass', responseText: '', responseHex: '',
              message: run.cancelled ? 'Sequence cancelled.' : 'Frame sent; no response expected.', elapsedMs: Date.now() - startedAt
            };
          }
        } catch (error) {
          run.cancelPending?.();
          run.cancelPending = undefined;
          result = {
            status: run.cancelled ? 'cancelled' : 'fail', responseText: '', responseHex: '',
            message: run.cancelled ? 'Sequence cancelled.' : (error instanceof Error ? error.message : String(error)), elapsedMs: Date.now() - startedAt
          };
        }

        if (result.status === 'pass') passed++;
        else if (result.status === 'fail') failed++;
        await this.panel.webview.postMessage({ type: 'sequenceStepResult', runId: run.id, index, step, result, bytesWritten });

        if (result.status === 'cancelled' || run.cancelled) break;
        if (result.status === 'fail' && stopOnFailureRaw) break;
        if (step.delayAfterMs > 0) await this.sequenceDelay(step.delayAfterMs, run);
      }
    } finally {
      const cancelled = run.cancelled;
      run.cancelPending?.();
      run.cancelPending = undefined;
      this.pendingSequenceResponse = undefined;
      if (this.instruments.getSessionState().connected) this.instruments.updateSessionFraming(this.state.frameEncoding, this.activeLineEnding());
      if (this.activeSequenceRun === run) this.activeSequenceRun = undefined;
      await this.panel?.webview.postMessage({ type: 'sequenceRunFinished', runId: run.id, name: run.name, passed, failed, cancelled });
    }
  }

  private waitForSequenceResponse(run: DiagnosticSequenceRun, step: DiagnosticSequenceStep): Promise<SequenceResponseResult> {
    return new Promise<SequenceResponseResult>((resolve) => {
      const startedAt = Date.now();
      let finished = false;
      let timer: NodeJS.Timeout;
      const finish = (result: SequenceResponseResult) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (this.pendingSequenceResponse?.runId === run.id && this.pendingSequenceResponse.stepId === step.id) this.pendingSequenceResponse = undefined;
        if (run.cancelPending === cancel) run.cancelPending = undefined;
        resolve(result);
      };
      const cancel = () => finish({ status: 'cancelled', responseText: this.pendingSequenceResponse?.text ?? '', responseHex: this.pendingSequenceResponse?.hex ?? '', message: 'Sequence cancelled.', elapsedMs: Date.now() - startedAt });
      this.pendingSequenceResponse = { runId: run.id, stepId: step.id, step, text: '', hex: '', startedAt, finish };
      run.cancelPending = cancel;
      timer = setTimeout(() => {
        const pending = this.pendingSequenceResponse;
        const responseText = pending?.runId === run.id && pending.stepId === step.id ? pending.text : '';
        const responseHex = pending?.runId === run.id && pending.stepId === step.id ? pending.hex : '';
        finish({
          status: 'fail', responseText, responseHex,
          message: step.matchMode === 'any' ? `No response received within ${step.timeoutMs} ms.` : `Expected response was not matched within ${step.timeoutMs} ms.`,
          elapsedMs: Date.now() - startedAt
        });
      }, step.timeoutMs);
    });
  }

  private consumeSequenceRx(event: InstrumentSessionEvent): void {
    const pending = this.pendingSequenceResponse;
    const run = this.activeSequenceRun;
    if (!pending || !run || pending.runId !== run.id || run.cancelled || event.type !== 'rx' || event.timestamp < pending.startedAt) return;
    pending.text += event.text ?? '';
    pending.hex = [pending.hex, event.hex ?? ''].filter(Boolean).join(' ').trim();
    const step = pending.step;
    if (!sequenceResponseMatches(step, pending.text, Number(event.bytes ?? 0))) return;
    pending.finish({
      status: 'pass', responseText: pending.text, responseHex: pending.hex,
      message: step.matchMode === 'any' ? 'Response received.' : 'Expected response matched.', elapsedMs: Date.now() - pending.startedAt
    });
  }

  private async sequenceDelay(milliseconds: number, run: DiagnosticSequenceRun): Promise<void> {
    const deadline = Date.now() + milliseconds;
    while (!run.cancelled && Date.now() < deadline) await new Promise<void>((resolve) => setTimeout(resolve, Math.min(50, Math.max(1, deadline - Date.now()))));
  }

  private applyDeviceEndpoint(endpoint: CpmDeviceEndpoint): void {
    if (endpoint.kind === 'serial') {
      this.state = normalizeState({ ...this.state, transport: 'serial', serial: { ...endpoint.settings }, frameEncoding: endpoint.settings.encoding });
    } else if (endpoint.kind === 'visa') {
      this.state = normalizeState({ ...this.state, transport: 'visa', visa: { ...endpoint.settings } });
    } else {
      return;
    }
    void this.context.globalState.update(STATE_KEY, this.state);
  }

  private async profileToDevice(id: string): Promise<void> {
    const profile = this.profiles.find((item) => item.id === id);
    if (!profile) throw new Error('Instrument profile not found.');
    const endpoint: CpmDeviceEndpoint = profile.state.transport === 'serial'
      ? { kind: 'serial', settings: { ...profile.state.serial } }
      : { kind: 'visa', settings: { ...profile.state.visa } };
    const device = await pickOrCreateDevice(this.devices, 'Promote instrument profile to CPM device', profile.name);
    if (!device) return;
    await this.devices.upsertEndpoint(device.id, endpoint);
    void vscode.window.showInformationMessage(`${profile.name} added to ${device.name}.`);
  }

  private async saveCurrentEndpointToDevice(rawState: unknown): Promise<void> {
    this.state = normalizeState(rawState as Partial<InstrumentPanelState>);
    await this.context.globalState.update(STATE_KEY, this.state);
    const endpoint: CpmDeviceEndpoint = this.state.transport === 'serial'
      ? { kind: 'serial', settings: { ...this.state.serial } }
      : { kind: 'visa', settings: { ...this.state.visa } };
    const suggested = this.state.transport === 'serial'
      ? (this.state.serial.portName || 'Serial instrument')
      : (this.state.visa.resource || 'VISA instrument');
    const device = await pickOrCreateDevice(this.devices, 'Add instrument endpoint to CPM device', suggested);
    if (!device) return;
    await this.devices.upsertEndpoint(device.id, endpoint);
    void vscode.window.showInformationMessage(`${this.state.transport === 'serial' ? 'COM' : 'VISA'} endpoint saved to ${device.name}.`);
  }

  private async recordHistory(command: string, frameMode: 'text' | 'hex', frameEncoding: FrameEncoding, transport: 'serial' | 'visa', target: string): Promise<void> {
    this.history.unshift({ id: createId(), timestamp: Date.now(), transport, target, command, frameMode, frameEncoding });
    this.history = this.history.slice(0, MAX_HISTORY);
    await this.context.globalState.update(HISTORY_KEY, this.history);
    await this.panel?.webview.postMessage({ type: 'historyUpdated', history: this.history });
  }

  private async forwardSessionEvent(event: InstrumentSessionEvent): Promise<void> {
    if (event.type === 'rx') this.consumeSequenceRx(event);
    if (event.type === 'error') this.output.appendLine(`[Instrument Diagnostics] ${event.transport ?? 'session'} ${event.target ?? ''}: ${event.message ?? 'Unknown error'}`);
    if (event.type === 'disconnected' && this.activeSequenceRun) this.stopSequence();
    await this.panel?.webview.postMessage({ type: 'sessionEvent', event });
    if (event.type === 'connected' || event.type === 'disconnected') await this.postSessionState();
  }

  private render(webview: vscode.Webview): string {
    const nonce = createNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>Instrument Diagnostics</title>
<style nonce="${nonce}">
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 22px 26px 44px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: 13px; }
  h1 { margin: 0 0 6px; font-size: 25px; font-weight: 650; }
  h2 { margin: 0; font-size: 15px; }
  h3 { margin: 0 0 9px; font-size: 13px; }
  p { margin: 7px 0; }
  code { font-family: var(--vscode-editor-font-family); }
  .muted { color: var(--vscode-descriptionForeground); }
  .toolbar, .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .toolbar { margin: 16px 0 10px; }
  .toolbar .spacer { flex: 1 1 auto; }
  .external-link { display: inline-flex; align-items: center; gap: 6px; }
  .external-link svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; }
  .tool-nav { position: sticky; top: 0; z-index: 8; display: grid; grid-template-columns: minmax(220px,1fr) minmax(220px,340px); gap: 10px; padding: 10px 0 12px; margin-bottom: 10px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); }
  .tool-nav input, .tool-nav select { min-height: 32px; }
  .filter-hidden { display: none !important; }
  button { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); padding: 7px 12px; border-radius: 4px; cursor: pointer; font: inherit; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.danger { background: transparent; color: var(--vscode-errorForeground); border-color: var(--vscode-panel-border); }
  button:disabled { opacity: .5; cursor: default; }
  .summary { display: grid; grid-template-columns: repeat(4,minmax(150px,1fr)); gap: 10px; margin-bottom: 14px; }
  .summary-card, .panel { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); border-radius: 6px; }
  .summary-card { padding: 12px 14px; }
  .summary-card strong { display: block; font-size: 21px; margin-top: 3px; }
  .panel { margin: 12px 0; overflow: hidden; }
  .panel-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 11px 14px; border-bottom: 1px solid var(--vscode-panel-border); }
  .panel-body { padding: 14px; }
  .grid { display: grid; grid-template-columns: repeat(4,minmax(120px,1fr)); gap: 10px 12px; }
  .grid.two { grid-template-columns: repeat(2,minmax(180px,1fr)); }
  .grid.three { grid-template-columns: repeat(3,minmax(150px,1fr)); }
  label { display: grid; gap: 5px; color: var(--vscode-descriptionForeground); }
  input, select, textarea { width: 100%; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); background: var(--vscode-input-background); color: var(--vscode-input-foreground); padding: 6px 8px; font: inherit; border-radius: 3px; }
  textarea { min-height: 82px; resize: vertical; font-family: var(--vscode-editor-font-family); }
  input:focus, select:focus, textarea:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
  .transport { display: flex; gap: 8px; }
  .transport button { background: transparent; color: var(--vscode-foreground); border-color: var(--vscode-panel-border); }
  .transport button.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
  .checkbox { display: inline-flex; align-items: center; gap: 6px; color: var(--vscode-foreground); }
  .checkbox input { width: auto; }
  .preset-list, .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .preset-list button { padding: 5px 9px; font-family: var(--vscode-editor-font-family); }
  .hidden { display: none !important; }
  .warning { margin: 7px 0; padding: 8px 10px; border-left: 3px solid var(--vscode-editorWarning-foreground); background: var(--vscode-textBlockQuote-background); font-family: var(--vscode-font-family); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  .status { min-height: 20px; color: var(--vscode-descriptionForeground); }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border: 1px solid var(--vscode-panel-border); border-radius: 999px; font-size: 12px; }
  .badge.connected { color: var(--vscode-testing-iconPassed); }
  .badge.disconnected { color: var(--vscode-descriptionForeground); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .console { min-height: 280px; max-height: 520px; overflow: auto; padding: 10px 12px; margin: 0; background: var(--vscode-textCodeBlock-background); font-family: var(--vscode-editor-font-family); line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
  .console .tx { color: var(--vscode-terminal-ansiCyan); }
  .console .rx { color: var(--vscode-terminal-ansiGreen); }
  .console .err { color: var(--vscode-errorForeground); }
  .console .meta { color: var(--vscode-descriptionForeground); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
  th { color: var(--vscode-descriptionForeground); font-weight: 600; }
  .scroll { overflow: auto; max-height: 270px; }
  .small { font-size: 11px; }
  .collection { display: grid; gap: 7px; margin-top: 10px; }
  .collection-item { display: grid; grid-template-columns: minmax(120px,1fr) auto; gap: 10px; align-items: center; border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px 9px; }
  .collection-item .title { font-weight: 600; }
  .collection-item .detail { color: var(--vscode-descriptionForeground); font-size: 11px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .collection-actions { display: flex; gap: 5px; }
  .collection-actions button { padding: 4px 8px; }
  .history-item { cursor: pointer; }
  .history-item:hover { background: var(--vscode-list-hoverBackground); }
  .sequence-steps { display: grid; gap: 7px; margin-top: 10px; }
  .sequence-step { display: grid; grid-template-columns: 34px minmax(160px,1fr) minmax(130px,.8fr) auto; gap: 9px; align-items: center; border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px 9px; }
  .sequence-step .index { color: var(--vscode-descriptionForeground); text-align: center; }
  .sequence-step .command { font-family: var(--vscode-editor-font-family); overflow-wrap: anywhere; }
  .sequence-step .criteria { color: var(--vscode-descriptionForeground); font-size: 11px; overflow-wrap: anywhere; }
  .sequence-step .actions { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  .sequence-step .actions button { padding: 4px 7px; }
  .sequence-status { display: inline-flex; align-items: center; padding: 2px 7px; border: 1px solid var(--vscode-panel-border); border-radius: 999px; font-size: 11px; font-weight: 600; }
  .sequence-status.pass { color: var(--vscode-testing-iconPassed); }
  .sequence-status.fail { color: var(--vscode-testing-iconFailed, var(--vscode-errorForeground)); }
  .sequence-status.running { color: var(--vscode-progressBar-background); }
  .sequence-status.cancelled { color: var(--vscode-descriptionForeground); }
  .sequence-results { margin-top: 12px; }
  .sequence-results td { overflow-wrap: anywhere; }
  fieldset:disabled { opacity: .65; }
  fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
  @media (max-width: 900px) { .summary { grid-template-columns: repeat(2,1fr); } .grid, .grid.three { grid-template-columns: repeat(2,1fr); } .sequence-step { grid-template-columns: 30px minmax(140px,1fr) auto; } .sequence-step .criteria { grid-column:2/3; } }
  @media (max-width: 600px) { body { padding: 16px; } .tool-nav { grid-template-columns: 1fr; } .summary, .grid, .grid.two, .grid.three { grid-template-columns: 1fr; } .sequence-step { grid-template-columns: 1fr; } .sequence-step .index,.sequence-step .criteria { grid-column:auto; text-align:left; } .sequence-step .actions { justify-content:flex-start; } }
</style>
</head>
<body>
  <h1>Instrument Diagnostics</h1>
  <p class="muted">Persistent COM/VISA terminal, asynchronous RX monitoring, SCPI presets, saved commands and reusable instrument profiles.</p>

  <div class="toolbar">
    <button id="refresh">Refresh devices</button>
    <button id="openNetworkDiagnostics" class="secondary">Network / Wi-Fi / BLE diagnostics</button>
    <button id="openDeviceManager" class="secondary">CPM Devices</button>
    <span id="status" class="status"></span>
    <span class="spacer"></span>
    <button id="openHelp" class="secondary external-link" title="Open the SCPI reference website in your browser" aria-label="Open external SCPI reference website"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"></circle><path d="M2.5 8h11M8 2c1.7 1.7 2.6 3.7 2.6 6S9.7 12.3 8 14M8 2C6.3 3.7 5.4 5.7 5.4 8S6.3 12.3 8 14"></path></svg><span>SCPI reference</span><span aria-hidden="true">↗</span></button>
  </div>

  <div class="tool-nav" aria-label="Instrument Diagnostics navigation">
    <input id="toolFilter" type="search" placeholder="Filter sections on this page…" aria-label="Filter Instrument Diagnostics sections">
    <select id="toolSectionNav" aria-label="Jump to an Instrument Diagnostics section"><option value="">Jump to a section…</option></select>
  </div>

  <div class="summary">
    <div class="summary-card"><span class="muted">COM interfaces</span><strong id="serialCount">0</strong></div>
    <div class="summary-card"><span class="muted">VISA resources</span><strong id="visaCount">0</strong></div>
    <div class="summary-card"><span class="muted">USB/PnP devices</span><strong id="usbCount">0</strong></div>
    <div class="summary-card"><span class="muted">Terminal session</span><strong id="sessionSummary">Offline</strong></div>
  </div>

  <div id="warnings"></div>

  <section class="panel">
    <div class="panel-head">
      <div><h2>Connection</h2><div class="muted small">Select a transport and keep the resource open while diagnosing the instrument.</div></div>
      <span id="sessionBadge" class="badge disconnected"><span class="dot"></span><span id="sessionText">Disconnected</span></span>
    </div>
    <div class="panel-body">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <div class="transport">
          <button id="transportSerial" class="active">Serial / COM</button>
          <button id="transportVisa">VISA / USBTMC</button>
        </div>
        <div class="row">
          <button id="connect">Connect</button>
          <button id="disconnect" class="secondary" disabled>Disconnect</button>
        </div>
      </div>

      <fieldset id="connectionFields">
        <div id="serialSettings" class="grid">
          <label>Port<select id="portName"></select></label>
          <label>Baud rate<input id="baudRate" type="number" min="1" max="12000000"></label>
          <label>Data bits<select id="dataBits"><option>5</option><option>6</option><option>7</option><option selected>8</option></select></label>
          <label>Parity<select id="parity"><option>None</option><option>Odd</option><option>Even</option><option>Mark</option><option>Space</option></select></label>
          <label>Stop bits<select id="stopBits"><option value="One">1</option><option value="OnePointFive">1.5</option><option value="Two">2</option></select></label>
          <label>Handshake<select id="handshake"><option>None</option><option>XOnXOff</option><option>RequestToSend</option><option>RequestToSendXOnXOff</option></select></label>
          <label>Read timeout (ms)<input id="readTimeoutMs" type="number" min="1" max="120000"></label>
          <label>Write timeout (ms)<input id="writeTimeoutMs" type="number" min="1" max="120000"></label>
          <label class="checkbox"><input id="dtrEnable" type="checkbox"> DTR enabled</label>
          <label class="checkbox"><input id="rtsEnable" type="checkbox"> RTS enabled</label>
        </div>
        <div id="visaSettings" class="grid two hidden">
          <label>VISA resource<input id="visaResource" list="visaResourceList" placeholder="USB0::...::INSTR"><datalist id="visaResourceList"></datalist></label>
          <label>Open timeout (ms)<input id="visaTimeoutMs" type="number" min="1" max="120000"></label>
          <div class="muted" id="visaHint" style="grid-column:1/-1"></div>
        </div>
      </fieldset>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><div><h2>Instrument profiles</h2><div class="muted small">Save the transport and communication settings for each instrument.</div></div></div>
    <div class="panel-body">
      <div class="row">
        <input id="profileName" style="max-width:320px" placeholder="e.g. GPT-9801 bench #1">
        <button id="saveProfile" class="secondary">Save current profile</button>
        <button id="saveToDevice" class="secondary">Add endpoint to CPM device</button>
      </div>
      <div id="profileList" class="collection"></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><div><h2>Persistent terminal</h2><div class="muted small">RX remains active while the session is connected; replies and unsolicited frames are logged asynchronously.</div></div></div>
    <div class="panel-body">
      <div class="grid three">
        <label>Frame format<select id="frameMode"><option value="text">Text</option><option value="hex">HEX bytes</option></select></label>
        <label>Text / RX encoding<select id="frameEncoding"><option value="ascii">ASCII</option><option value="utf8">UTF-8</option><option value="latin1">Latin-1</option></select></label>
        <label>TX line ending<select id="lineEnding"><option value="none">None</option><option value="lf">LF (\\n)</option><option value="cr">CR (\\r)</option><option value="crlf">CRLF (\\r\\n)</option></select></label>
      </div>
      <label style="margin-top:10px">Frame<textarea id="frameText" spellcheck="false"></textarea></label>
      <div class="row" style="margin-top:10px">
        <button id="send" disabled>Send frame</button>
        <label class="checkbox" title="Stored with presets/history as metadata. RX is always monitored in persistent mode."><input id="expectResponse" type="checkbox"> Query / response expected</label>
      </div>

      <h3 style="margin-top:16px">SCPI / IEEE 488.2 presets</h3>
      <div id="presetList" class="preset-list"></div>

      <h3 style="margin-top:16px">Saved commands</h3>
      <div class="row">
        <input id="commandName" style="max-width:320px" placeholder="Command name">
        <button id="saveCommand" class="secondary">Save current command</button>
      </div>
      <div id="savedCommandList" class="collection"></div>

      <h3 style="margin-top:16px">Recent command history</h3>
      <div class="row"><span class="muted small">Click an entry to recall it.</span><button id="clearHistory" class="secondary">Clear history</button></div>
      <div id="historyList" class="collection"></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <div><h2>Diagnostic sequences</h2><div class="muted small">Chain SCPI or raw frames and validate each response with timeout-based PASS/FAIL criteria.</div></div>
      <span id="sequenceRunStatus" class="sequence-status cancelled">Idle</span>
    </div>
    <div class="panel-body">
      <div class="row">
        <input id="sequenceName" style="max-width:320px" placeholder="e.g. GPT-9801 startup check">
        <label class="checkbox"><input id="sequenceStopOnFailure" type="checkbox" checked> Stop on first failure</label>
        <button id="saveSequence" class="secondary">Save sequence</button>
        <button id="runSequence" disabled>Run sequence</button>
        <button id="stopSequence" class="secondary" disabled>Stop</button>
      </div>

      <div class="settings-subsection" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--vscode-panel-border)">
        <h3>Step editor</h3>
        <div class="grid three">
          <label>Step label<input id="sequenceStepName" placeholder="Identification"></label>
          <label>Frame format<select id="sequenceStepFrameMode"><option value="text">Text</option><option value="hex">HEX bytes</option></select></label>
          <label>Encoding<select id="sequenceStepEncoding"><option value="ascii">ASCII</option><option value="utf8">UTF-8</option><option value="latin1">Latin-1</option></select></label>
        </div>
        <label style="margin-top:10px">Command<textarea id="sequenceStepCommand" spellcheck="false" placeholder="*IDN?"></textarea></label>
        <div class="grid" style="margin-top:10px">
          <label class="checkbox"><input id="sequenceStepExpectResponse" type="checkbox" checked> Response expected</label>
          <label>Validation<select id="sequenceStepMatchMode"><option value="any">Any response</option><option value="contains">Contains</option><option value="equals">Equals</option><option value="regex">Regular expression</option></select></label>
          <label>Expected decoded text<input id="sequenceStepExpected" placeholder="e.g. GW INSTEK"></label>
          <label>Response timeout (ms)<input id="sequenceStepTimeout" type="number" min="50" max="120000" value="2000"></label>
          <label>Delay after step (ms)<input id="sequenceStepDelay" type="number" min="0" max="120000" value="0"></label>
        </div>
        <div class="row" style="margin-top:10px">
          <button id="sequenceAddStep" class="secondary">Add step</button>
          <button id="sequenceUseTerminal" class="secondary">Use terminal command</button>
          <button id="sequenceCancelEdit" class="secondary hidden">Cancel edit</button>
        </div>
      </div>

      <h3 style="margin-top:16px">Sequence steps</h3>
      <div id="sequenceStepList" class="sequence-steps"></div>

      <h3 style="margin-top:16px">Saved sequences</h3>
      <div id="savedSequenceList" class="collection"></div>

      <h3 style="margin-top:16px">Last run</h3>
      <div class="scroll sequence-results"><table><thead><tr><th>#</th><th>Step</th><th>Command</th><th>Status</th><th>Response / result</th><th>Time</th></tr></thead><tbody id="sequenceResultTable"><tr><td colspan="6" class="muted">No sequence run yet.</td></tr></tbody></table></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <div><h2>TX / RX log</h2><div class="muted small">The log remains active while this page is hidden. Closing the page closes the instrument session.</div></div>
      <div class="row"><button id="copyLog" class="secondary">Copy log</button><button id="clearLog" class="secondary">Clear</button></div>
    </div>
    <div id="console" class="console"></div>
  </section>

  <section class="panel">
    <div class="panel-head"><div><h2>Detected interfaces</h2><div class="muted small">USB enumeration is diagnostic only unless the device exposes COM or a VISA/USBTMC resource.</div></div></div>
    <div class="panel-body">
      <h3>Serial / COM</h3>
      <div class="scroll"><table><thead><tr><th>Port</th><th>Name</th><th>Manufacturer</th><th>Status</th><th>PnP ID</th></tr></thead><tbody id="serialTable"></tbody></table></div>
      <h3 style="margin-top:18px">USB / PnP</h3>
      <div class="scroll"><table><thead><tr><th>Name</th><th>VID:PID</th><th>Manufacturer</th><th>Service</th><th>Status</th><th>PnP ID</th></tr></thead><tbody id="usbTable"></tbody></table></div>
    </div>
  </section>

<script nonce="${nonce}">
(() => {
  const vscode = acquireVsCodeApi();
  const initialState = ${safeJson(this.state)};
  let state = initialState;
  let discovery = {serial:[],usb:[],visa:[],visaAvailable:false,warnings:[]};
  let presets = ${safeJson(SCPI_PRESETS)};
  let profiles = ${safeJson(this.profiles)};
  let savedCommands = ${safeJson(this.savedCommands)};
  let history = ${safeJson(this.history)};
  let sequences = ${safeJson(this.sequences)};
  let sequenceDraft = [];
  let sequenceEditingIndex = -1;
  let sequenceRun = {running:false, results:[]};
  let session = ${safeJson(this.instruments.getSessionState())};
  let logLines = [];
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const now = ts => new Date(ts || Date.now()).toLocaleTimeString();
  const printable = value => String(value ?? '').replace(/\\r/g,'\\\\r').replace(/\\n/g,'\\\\n');
  const setValue = (id,value) => { const el=$(id); if(el) el.value = value ?? ''; };
  const setChecked = (id,value) => { const el=$(id); if(el) el.checked = !!value; };

  function applyState(next) {
    state = next || state;
    setValue('baudRate',state.serial.baudRate); setValue('dataBits',state.serial.dataBits); setValue('parity',state.serial.parity);
    setValue('stopBits',state.serial.stopBits); setValue('handshake',state.serial.handshake); setValue('readTimeoutMs',state.serial.readTimeoutMs);
    setValue('writeTimeoutMs',state.serial.writeTimeoutMs); setChecked('dtrEnable',state.serial.dtrEnable); setChecked('rtsEnable',state.serial.rtsEnable);
    setValue('visaResource',state.visa.resource); setValue('visaTimeoutMs',state.visa.timeoutMs); setValue('frameMode',state.frameMode);
    setValue('frameEncoding',state.frameEncoding); setValue('frameText',state.frameText); setChecked('expectResponse',state.expectResponse);
    selectTransport(state.transport,false); renderPortOptions(); renderSession();
  }

  function collectState(save=true) {
    const lineEnding = $('lineEnding').value;
    const next = {
      transport: state.transport,
      serial: {
        portName: $('portName').value,
        baudRate: Number($('baudRate').value || 9600), dataBits: Number($('dataBits').value || 8), parity: $('parity').value,
        stopBits: $('stopBits').value, handshake: $('handshake').value, readTimeoutMs: Number($('readTimeoutMs').value || 1500),
        writeTimeoutMs: Number($('writeTimeoutMs').value || 1500), dtrEnable: $('dtrEnable').checked, rtsEnable: $('rtsEnable').checked,
        encoding: $('frameEncoding').value, lineEnding: state.transport === 'serial' ? lineEnding : state.serial.lineEnding
      },
      visa: {
        resource: $('visaResource').value.trim(), timeoutMs: Number($('visaTimeoutMs').value || 2000),
        lineEnding: state.transport === 'visa' ? lineEnding : state.visa.lineEnding
      },
      frameMode: $('frameMode').value, frameEncoding: $('frameEncoding').value, frameText: $('frameText').value,
      expectResponse: $('expectResponse').checked
    };
    state = next;
    if (save) vscode.postMessage({type:'saveState', state:next});
    return next;
  }

  function selectTransport(transport, save=true) {
    if (session.connected && transport !== session.transport) return;
    state.transport = transport;
    $('transportSerial').classList.toggle('active', transport === 'serial');
    $('transportVisa').classList.toggle('active', transport === 'visa');
    $('serialSettings').classList.toggle('hidden', transport !== 'serial');
    $('visaSettings').classList.toggle('hidden', transport !== 'visa');
    setValue('lineEnding', transport === 'visa' ? state.visa.lineEnding : state.serial.lineEnding);
    if (save) collectState();
  }

  function renderPortOptions() {
    const select = $('portName');
    const current = state.serial.portName || select.value;
    select.innerHTML = '';
    if (!discovery.serial.length) select.insertAdjacentHTML('beforeend','<option value="">No COM port detected</option>');
    for (const item of discovery.serial) select.insertAdjacentHTML('beforeend', '<option value="'+esc(item.portName)+'">'+esc(item.portName + ' — ' + (item.name || item.description || 'Serial device'))+'</option>');
    if (current && !Array.from(select.options).some(o => o.value === current)) select.insertAdjacentHTML('beforeend','<option value="'+esc(current)+'">'+esc(current)+'</option>');
    select.value = current || (discovery.serial[0]?.portName ?? '');
  }

  function renderDevices() {
    $('serialCount').textContent = String(discovery.serial.length);
    $('visaCount').textContent = String(discovery.visa.length);
    $('usbCount').textContent = String(discovery.usb.length);
    renderPortOptions();
    $('visaResourceList').innerHTML = discovery.visa.map(v => '<option value="'+esc(v.resource)+'"></option>').join('');
    $('visaHint').textContent = discovery.visaAvailable
      ? (discovery.visa.length ? 'VISA runtime detected. Select a resource or enter one manually.' : 'VISA runtime detected, but no ?*INSTR resource was found.')
      : 'No usable VISA runtime detected. Install/configure NI-VISA, Keysight VISA or another compatible runtime for USBTMC/VISA communication.';
    $('serialTable').innerHTML = discovery.serial.length ? discovery.serial.map(d => '<tr><td><code>'+esc(d.portName)+'</code></td><td>'+esc(d.name || d.description)+'</td><td>'+esc(d.manufacturer)+'</td><td>'+esc(d.status)+'</td><td class="small"><code>'+esc(d.pnpDeviceId)+'</code></td></tr>').join('') : '<tr><td colspan="5" class="muted">No serial interface detected.</td></tr>';
    $('usbTable').innerHTML = discovery.usb.length ? discovery.usb.map(d => '<tr><td>'+esc(d.name)+'</td><td><code>'+esc((d.vid && d.pid) ? d.vid+':'+d.pid : '')+'</code></td><td>'+esc(d.manufacturer)+'</td><td>'+esc(d.service)+'</td><td>'+esc(d.status)+'</td><td class="small"><code>'+esc(d.pnpDeviceId)+'</code></td></tr>').join('') : '<tr><td colspan="6" class="muted">No USB/PnP device detected.</td></tr>';
    $('warnings').innerHTML = (discovery.warnings || []).map(w => '<div class="warning">'+esc(w)+'</div>').join('');
    applyToolFilter();
  }

  function renderSession() {
    const connected = !!session.connected;
    $('sessionBadge').classList.toggle('connected', connected);
    $('sessionBadge').classList.toggle('disconnected', !connected);
    $('sessionText').textContent = connected ? ('Connected — ' + (session.target || 'instrument')) : 'Disconnected';
    $('sessionSummary').textContent = connected ? (session.transport === 'serial' ? 'COM' : 'VISA') : 'Offline';
    $('connect').disabled = connected;
    $('disconnect').disabled = !connected;
    $('send').disabled = !connected;
    $('connectionFields').disabled = connected;
    $('transportSerial').disabled = connected;
    $('transportVisa').disabled = connected;
    renderSequenceControls();
  }

  function renderPresets() {
    $('presetList').innerHTML = presets.map((p,i) => '<button class="secondary" data-preset="'+i+'" title="'+esc(p.description)+'">'+esc(p.command)+'</button>').join('');
    document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
      const p = presets[Number(button.dataset.preset)]; if (!p) return;
      $('frameText').value = p.command; $('frameMode').value = 'text'; $('expectResponse').checked = !!p.expectsResponse; collectState();
    }));
  }

  function renderProfiles() {
    $('profileList').innerHTML = profiles.length ? profiles.map(p => {
      const target = p.state.transport === 'serial' ? p.state.serial.portName : p.state.visa.resource;
      return '<div class="collection-item"><div><div class="title">'+esc(p.name)+'</div><div class="detail">'+esc(p.state.transport.toUpperCase()+' — '+target)+'</div></div><div class="collection-actions"><button class="secondary" data-load-profile="'+esc(p.id)+'">Load</button><button class="secondary" data-profile-device="'+esc(p.id)+'">CPM device</button><button class="danger" data-delete-profile="'+esc(p.id)+'">Delete</button></div></div>';
    }).join('') : '<div class="muted">No saved instrument profile.</div>';
    document.querySelectorAll('[data-load-profile]').forEach(b => b.addEventListener('click', () => vscode.postMessage({type:'applyProfile', id:b.dataset.loadProfile})));
    document.querySelectorAll('[data-profile-device]').forEach(b => b.addEventListener('click', () => vscode.postMessage({type:'profileToDevice', id:b.dataset.profileDevice})));
    document.querySelectorAll('[data-delete-profile]').forEach(b => b.addEventListener('click', () => vscode.postMessage({type:'deleteProfile', id:b.dataset.deleteProfile})));
  }

  function renderSavedCommands() {
    $('savedCommandList').innerHTML = savedCommands.length ? savedCommands.map(c => '<div class="collection-item"><div><div class="title">'+esc(c.name)+'</div><div class="detail"><code>'+esc(printable(c.command))+'</code> · '+esc(c.frameMode.toUpperCase())+'</div></div><div class="collection-actions"><button class="secondary" data-use-command="'+esc(c.id)+'">Use</button><button class="danger" data-delete-command="'+esc(c.id)+'">Delete</button></div></div>').join('') : '<div class="muted">No saved command.</div>';
    document.querySelectorAll('[data-use-command]').forEach(b => b.addEventListener('click', () => {
      const c = savedCommands.find(x => x.id === b.dataset.useCommand); if (!c) return;
      $('frameText').value=c.command; $('frameMode').value=c.frameMode; $('frameEncoding').value=c.frameEncoding; $('expectResponse').checked=!!c.expectResponse; collectState();
    }));
    document.querySelectorAll('[data-delete-command]').forEach(b => b.addEventListener('click', () => vscode.postMessage({type:'deleteCommand', id:b.dataset.deleteCommand})));
  }

  function renderHistory() {
    $('historyList').innerHTML = history.length ? history.slice(0,30).map(h => '<div class="collection-item history-item" data-history="'+esc(h.id)+'"><div><div class="title"><code>'+esc(printable(h.command))+'</code></div><div class="detail">'+esc(new Date(h.timestamp).toLocaleString()+' · '+h.transport.toUpperCase()+' '+h.target+' · '+h.frameMode.toUpperCase())+'</div></div><div></div></div>').join('') : '<div class="muted">No command has been sent yet.</div>';
    document.querySelectorAll('[data-history]').forEach(b => b.addEventListener('click', () => {
      const h = history.find(x => x.id === b.dataset.history); if (!h) return;
      $('frameText').value=h.command; $('frameMode').value=h.frameMode; $('frameEncoding').value=h.frameEncoding; collectState();
    }));
  }

  function clientId() { return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10); }

  function sequenceCriteriaLabel(step) {
    if (!step.expectResponse) return 'No response expected · delay '+step.delayAfterMs+' ms';
    const criterion = step.matchMode === 'any' ? 'Any response' : (step.matchMode.toUpperCase() + ': ' + printable(step.expected));
    return criterion + ' · timeout '+step.timeoutMs+' ms · delay '+step.delayAfterMs+' ms';
  }

  function collectSequenceStep() {
    const existing = sequenceEditingIndex >= 0 ? sequenceDraft[sequenceEditingIndex] : null;
    return {
      id: existing?.id || clientId(),
      name: $('sequenceStepName').value.trim() || ('Step '+(sequenceEditingIndex >= 0 ? sequenceEditingIndex + 1 : sequenceDraft.length + 1)),
      command: $('sequenceStepCommand').value,
      frameMode: $('sequenceStepFrameMode').value,
      frameEncoding: $('sequenceStepEncoding').value,
      expectResponse: $('sequenceStepExpectResponse').checked,
      timeoutMs: Math.max(50, Math.min(120000, Number($('sequenceStepTimeout').value || 2000))),
      delayAfterMs: Math.max(0, Math.min(120000, Number($('sequenceStepDelay').value || 0))),
      matchMode: $('sequenceStepMatchMode').value,
      expected: $('sequenceStepExpected').value
    };
  }

  function resetSequenceStepEditor() {
    sequenceEditingIndex = -1;
    setValue('sequenceStepName',''); setValue('sequenceStepCommand',''); setValue('sequenceStepFrameMode','text'); setValue('sequenceStepEncoding',state.frameEncoding || 'ascii');
    setChecked('sequenceStepExpectResponse',true); setValue('sequenceStepMatchMode','any'); setValue('sequenceStepExpected',''); setValue('sequenceStepTimeout','2000'); setValue('sequenceStepDelay','0');
    $('sequenceAddStep').textContent='Add step'; $('sequenceCancelEdit').classList.add('hidden'); updateSequenceStepControls();
  }

  function updateSequenceStepControls() {
    const expects = $('sequenceStepExpectResponse').checked;
    $('sequenceStepMatchMode').disabled = !expects;
    $('sequenceStepTimeout').disabled = !expects;
    $('sequenceStepExpected').disabled = !expects || $('sequenceStepMatchMode').value === 'any';
  }

  function renderSequenceDraft() {
    $('sequenceStepList').innerHTML = sequenceDraft.length ? sequenceDraft.map((step,index) =>
      '<div class="sequence-step"><div class="index">'+(index+1)+'</div><div><div class="title">'+esc(step.name)+'</div><div class="command">'+esc(printable(step.command))+'</div></div><div class="criteria">'+esc(sequenceCriteriaLabel(step))+'</div><div class="actions"><button class="secondary" data-seq-up="'+index+'" '+(index===0?'disabled':'')+'>↑</button><button class="secondary" data-seq-down="'+index+'" '+(index===sequenceDraft.length-1?'disabled':'')+'>↓</button><button class="secondary" data-seq-edit="'+index+'">Edit</button><button class="danger" data-seq-delete="'+index+'">Delete</button></div></div>'
    ).join('') : '<div class="muted">No step in the current sequence.</div>';
    document.querySelectorAll('[data-seq-up]').forEach(b => b.addEventListener('click', () => { const i=Number(b.dataset.seqUp); if(i>0){[sequenceDraft[i-1],sequenceDraft[i]]=[sequenceDraft[i],sequenceDraft[i-1]]; renderSequenceDraft();} }));
    document.querySelectorAll('[data-seq-down]').forEach(b => b.addEventListener('click', () => { const i=Number(b.dataset.seqDown); if(i>=0&&i<sequenceDraft.length-1){[sequenceDraft[i+1],sequenceDraft[i]]=[sequenceDraft[i],sequenceDraft[i+1]]; renderSequenceDraft();} }));
    document.querySelectorAll('[data-seq-delete]').forEach(b => b.addEventListener('click', () => { const i=Number(b.dataset.seqDelete); sequenceDraft.splice(i,1); if(sequenceEditingIndex===i) resetSequenceStepEditor(); else if(sequenceEditingIndex>i) sequenceEditingIndex--; renderSequenceDraft(); renderSequenceControls(); }));
    document.querySelectorAll('[data-seq-edit]').forEach(b => b.addEventListener('click', () => {
      const i=Number(b.dataset.seqEdit), step=sequenceDraft[i]; if(!step) return; sequenceEditingIndex=i;
      setValue('sequenceStepName',step.name); setValue('sequenceStepCommand',step.command); setValue('sequenceStepFrameMode',step.frameMode); setValue('sequenceStepEncoding',step.frameEncoding);
      setChecked('sequenceStepExpectResponse',step.expectResponse); setValue('sequenceStepMatchMode',step.matchMode); setValue('sequenceStepExpected',step.expected); setValue('sequenceStepTimeout',step.timeoutMs); setValue('sequenceStepDelay',step.delayAfterMs);
      $('sequenceAddStep').textContent='Update step'; $('sequenceCancelEdit').classList.remove('hidden'); updateSequenceStepControls();
    }));
    renderSequenceControls();
  }

  function renderSavedSequences() {
    $('savedSequenceList').innerHTML = sequences.length ? sequences.map(seq => '<div class="collection-item"><div><div class="title">'+esc(seq.name)+'</div><div class="detail">'+seq.steps.length+' step(s) · '+(seq.stopOnFailure?'stop on failure':'continue on failure')+'</div></div><div class="collection-actions"><button class="secondary" data-load-sequence="'+esc(seq.id)+'">Load</button><button class="danger" data-delete-sequence="'+esc(seq.id)+'">Delete</button></div></div>').join('') : '<div class="muted">No saved diagnostic sequence.</div>';
    document.querySelectorAll('[data-load-sequence]').forEach(b => b.addEventListener('click', () => {
      const seq=sequences.find(x=>x.id===b.dataset.loadSequence); if(!seq) return;
      setValue('sequenceName',seq.name); setChecked('sequenceStopOnFailure',seq.stopOnFailure); sequenceDraft=JSON.parse(JSON.stringify(seq.steps)); resetSequenceStepEditor(); renderSequenceDraft();
    }));
    document.querySelectorAll('[data-delete-sequence]').forEach(b => b.addEventListener('click', () => vscode.postMessage({type:'deleteSequence',id:b.dataset.deleteSequence})));
  }

  function renderSequenceControls() {
    $('runSequence').disabled = !session.connected || !sequenceDraft.length || sequenceRun.running;
    $('stopSequence').disabled = !sequenceRun.running;
    $('saveSequence').disabled = !sequenceDraft.length || sequenceRun.running;
    $('sequenceAddStep').disabled = sequenceRun.running;
  }

  function setSequenceStatus(label, cls) {
    const badge=$('sequenceRunStatus'); badge.textContent=label; badge.className='sequence-status '+cls;
  }

  function renderSequenceResults() {
    const results=sequenceRun.results || [];
    if (!results.length) { $('sequenceResultTable').innerHTML='<tr><td colspan="6" class="muted">No sequence run yet.</td></tr>'; return; }
    $('sequenceResultTable').innerHTML = results.map((entry,index) => {
      if (!entry) return '<tr><td>'+(index+1)+'</td><td colspan="5" class="muted">Pending</td></tr>';
      const step=entry.step||{}, result=entry.result||{}; const status=result.status||entry.status||'running';
      const text=result.responseText ? printable(result.responseText) : (result.message||'');
      return '<tr><td>'+(index+1)+'</td><td>'+esc(step.name||('Step '+(index+1)))+'</td><td><code>'+esc(printable(step.command||''))+'</code></td><td><span class="sequence-status '+esc(status)+'">'+esc(status.toUpperCase())+'</span></td><td>'+esc(text)+(result.message&&result.responseText?'<div class="muted small">'+esc(result.message)+'</div>':'')+'</td><td>'+esc(result.elapsedMs===undefined?'':result.elapsedMs+' ms')+'</td></tr>';
    }).join('');
  }

  function renderCollections() { renderProfiles(); renderSavedCommands(); renderHistory(); renderSavedSequences(); }

  function appendLog(kind, text, detail='') {
    const line = '['+now()+'] ' + text + (detail ? '\\n             '+detail : '');
    logLines.push(line);
    if (logLines.length > 2000) logLines = logLines.slice(-2000);
    const div = document.createElement('div'); div.className = kind; div.textContent = line;
    $('console').appendChild(div); $('console').scrollTop = $('console').scrollHeight;
  }

  const toolSections = () => Array.from(document.querySelectorAll('section.panel'));
  function populateToolSections() {
    const select = $('toolSectionNav'); if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Jump to a section…</option>';
    toolSections().filter(section => !section.classList.contains('filter-hidden')).forEach((section, index) => {
      if (!section.id) section.id = 'instrument-section-' + index;
      const option = document.createElement('option'); option.value = section.id;
      option.textContent = section.querySelector('h2')?.textContent?.trim() || ('Section ' + (index + 1));
      select.appendChild(option);
    });
    if (Array.from(select.options).some(option => option.value === current)) select.value = current;
  }
  function applyToolFilter() {
    const query = String($('toolFilter')?.value || '').trim().toLocaleLowerCase();
    toolSections().forEach(section => section.classList.toggle('filter-hidden', !!query && !String(section.textContent || '').toLocaleLowerCase().includes(query)));
    populateToolSections();
  }

  function busy(operation, value) {
    if (operation === 'discover') { $('refresh').disabled = value; $('status').textContent = value ? 'Enumerating interfaces…' : ''; }
    if (operation === 'connect') { $('connect').disabled = value || session.connected; $('connect').textContent = value ? 'Connecting…' : 'Connect'; }
  }

  $('toolFilter').addEventListener('input', applyToolFilter);
  $('toolSectionNav').addEventListener('change', () => {
    const id = $('toolSectionNav').value; if (!id) return;
    const target = document.getElementById(id); target?.scrollIntoView({behavior:'smooth', block:'start'});
  });
  populateToolSections();

  $('transportSerial').addEventListener('click', () => selectTransport('serial'));
  $('transportVisa').addEventListener('click', () => selectTransport('visa'));
  $('refresh').addEventListener('click', () => vscode.postMessage({type:'refreshDevices'}));
  $('openHelp').addEventListener('click', () => vscode.postMessage({type:'openHelp'}));
  $('openNetworkDiagnostics').addEventListener('click', () => vscode.postMessage({type:'openNetworkDiagnostics'}));
  $('openDeviceManager').addEventListener('click', () => vscode.postMessage({type:'openDeviceManager'}));
  $('connect').addEventListener('click', () => vscode.postMessage({type:'connect', state:collectState(false)}));
  $('disconnect').addEventListener('click', () => vscode.postMessage({type:'disconnect'}));
  $('send').addEventListener('click', () => {
    const next = collectState(false);
    const target = session.target || (next.transport === 'serial' ? next.serial.portName : next.visa.resource);
    appendLog('tx', 'TX ['+next.transport.toUpperCase()+' '+target+'] ' + printable(next.frameText));
    vscode.postMessage({type:'sendFrame', state:next});
  });
  $('saveProfile').addEventListener('click', () => vscode.postMessage({type:'saveProfile', name:$('profileName').value, state:collectState(false)}));
  $('saveToDevice').addEventListener('click', () => vscode.postMessage({type:'saveToDevice', state:collectState(false)}));
  $('saveCommand').addEventListener('click', () => vscode.postMessage({type:'saveCommand', name:$('commandName').value, state:collectState(false)}));
  $('sequenceStepExpectResponse').addEventListener('change', updateSequenceStepControls);
  $('sequenceStepMatchMode').addEventListener('change', updateSequenceStepControls);
  $('sequenceUseTerminal').addEventListener('click', () => {
    const terminal=collectState(false); setValue('sequenceStepCommand',terminal.frameText); setValue('sequenceStepFrameMode',terminal.frameMode); setValue('sequenceStepEncoding',terminal.frameEncoding); setChecked('sequenceStepExpectResponse',terminal.expectResponse); setValue('sequenceStepMatchMode','any'); setValue('sequenceStepExpected',''); updateSequenceStepControls();
  });
  $('sequenceCancelEdit').addEventListener('click', resetSequenceStepEditor);
  $('sequenceAddStep').addEventListener('click', () => {
    const step=collectSequenceStep();
    if (!step.command.trim()) { appendLog('err','ERROR: Sequence step command is empty.'); return; }
    if (step.expectResponse && step.matchMode !== 'any' && !step.expected.length) { appendLog('err','ERROR: Enter expected response text for this validation mode.'); return; }
    if (step.expectResponse && step.matchMode === 'regex') { try { new RegExp(step.expected); } catch (error) { appendLog('err','ERROR: Invalid regular expression — '+error.message); return; } }
    if (sequenceEditingIndex >= 0) sequenceDraft[sequenceEditingIndex]=step; else sequenceDraft.push(step);
    resetSequenceStepEditor(); renderSequenceDraft();
  });
  $('saveSequence').addEventListener('click', () => vscode.postMessage({type:'saveSequence',name:$('sequenceName').value,stopOnFailure:$('sequenceStopOnFailure').checked,steps:sequenceDraft}));
  $('runSequence').addEventListener('click', () => vscode.postMessage({type:'runSequence',name:$('sequenceName').value,stopOnFailure:$('sequenceStopOnFailure').checked,steps:sequenceDraft}));
  $('stopSequence').addEventListener('click', () => vscode.postMessage({type:'stopSequence'}));
  $('clearHistory').addEventListener('click', () => vscode.postMessage({type:'clearHistory'}));
  $('clearLog').addEventListener('click', () => { logLines=[]; $('console').textContent=''; });
  $('copyLog').addEventListener('click', () => vscode.postMessage({type:'copyText', text:logLines.join('\\n')}));
  document.querySelectorAll('input,select,textarea').forEach(el => el.addEventListener('change', () => collectState()));
  $('frameText').addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && session.connected) { event.preventDefault(); $('send').click(); }
  });

  window.addEventListener('message', event => {
    const msg = event.data || {};
    if (msg.type === 'state') {
      presets = msg.presets || presets; profiles = msg.profiles || []; savedCommands = msg.savedCommands || []; history = msg.history || []; sequences = msg.sequences || [];
      session = msg.session || {connected:false}; renderPresets(); applyState(msg.state); renderCollections(); renderSession();
    } else if (msg.type === 'devices') {
      discovery = msg.discovery || discovery; if (msg.state) applyState(msg.state); renderDevices();
    } else if (msg.type === 'collections') {
      profiles=msg.profiles||[]; savedCommands=msg.savedCommands||[]; history=msg.history||[]; sequences=msg.sequences||[]; renderCollections();
    } else if (msg.type === 'sessionState') {
      session=msg.session||{connected:false}; renderSession();
    } else if (msg.type === 'sessionEvent') {
      const e=msg.event||{};
      if (e.type === 'connected') appendLog('meta','CONNECTED ['+(e.transport||'').toUpperCase()+' '+(e.target||'')+']');
      else if (e.type === 'disconnected') appendLog('meta','DISCONNECTED ['+(e.transport||'').toUpperCase()+' '+(e.target||'')+']'+(e.message?' — '+e.message:''));
      else if (e.type === 'rx') appendLog('rx','RX ['+(e.transport||'').toUpperCase()+' '+(e.target||'')+'] '+(e.bytes||0)+' B: '+(printable(e.text)||'<binary/empty>'), e.hex ? 'HEX: '+e.hex : '');
      else if (e.type === 'error') appendLog('err','ERROR ['+(e.transport||'').toUpperCase()+' '+(e.target||'')+']: '+(e.message||'Unknown error'));
    } else if (msg.type === 'frameSent') {
      history=msg.history||history; renderHistory(); appendLog('meta','Write complete: '+msg.bytesWritten+' B');
    } else if (msg.type === 'historyUpdated') {
      history=msg.history||history; renderHistory();
    } else if (msg.type === 'sequenceRunStarted') {
      sequenceRun={running:true,runId:msg.runId,results:new Array(Number(msg.stepCount||0))}; setSequenceStatus('Running','running'); renderSequenceResults(); renderSequenceControls(); appendLog('meta','SEQUENCE START: '+(msg.name||'Diagnostic sequence'));
    } else if (msg.type === 'sequenceStepStarted') {
      sequenceRun.results[msg.index]={step:msg.step,status:'running',result:{status:'running',message:'Waiting…'}}; renderSequenceResults(); appendLog('tx','SEQ '+(Number(msg.index)+1)+' TX: '+printable(msg.step?.command||''));
    } else if (msg.type === 'sequenceStepResult') {
      sequenceRun.results[msg.index]={step:msg.step,result:msg.result}; renderSequenceResults(); const r=msg.result||{}; appendLog(r.status==='pass'?'meta':(r.status==='fail'?'err':'meta'),'SEQ '+(Number(msg.index)+1)+' '+String(r.status||'').toUpperCase()+': '+(r.message||''),r.responseText?'RX: '+printable(r.responseText):'');
    } else if (msg.type === 'sequenceStopping') {
      setSequenceStatus('Stopping…','cancelled');
    } else if (msg.type === 'sequenceRunFinished') {
      sequenceRun.running=false; if(msg.cancelled) setSequenceStatus('Cancelled','cancelled'); else if(Number(msg.failed||0)>0) setSequenceStatus('FAIL','fail'); else setSequenceStatus('PASS','pass'); renderSequenceControls(); appendLog(msg.cancelled?'meta':(Number(msg.failed||0)>0?'err':'meta'),'SEQUENCE '+(msg.cancelled?'CANCELLED':(Number(msg.failed||0)>0?'FAIL':'PASS'))+' — '+Number(msg.passed||0)+' passed, '+Number(msg.failed||0)+' failed');
    } else if (msg.type === 'busy') busy(msg.operation,!!msg.busy);
    else if (msg.type === 'error') appendLog('err','ERROR: '+msg.message);
  });

  renderPresets(); applyState(state); resetSequenceStepEditor(); renderSequenceDraft(); renderSequenceResults(); renderCollections(); renderDevices(); renderSession();
  vscode.postMessage({type:'ready'});
})();
</script>
</body>
</html>`;
  }
}

function normalizeState(raw?: any): InstrumentPanelState {
  const serial = raw?.serial ?? {};
  const visa = raw?.visa ?? {};
  const transport = raw?.transport === 'visa' ? 'visa' : 'serial';
  const frameEncoding: FrameEncoding = raw?.frameEncoding === 'utf8' || raw?.frameEncoding === 'latin1' ? raw.frameEncoding : 'ascii';
  return {
    transport,
    serial: {
      portName: String(serial.portName ?? DEFAULT_STATE.serial.portName),
      baudRate: clampNumber(serial.baudRate, 1, 12000000, DEFAULT_STATE.serial.baudRate),
      dataBits: ([5, 6, 7, 8].includes(Number(serial.dataBits)) ? Number(serial.dataBits) : 8) as 5 | 6 | 7 | 8,
      parity: ['None', 'Odd', 'Even', 'Mark', 'Space'].includes(serial.parity) ? serial.parity : 'None',
      stopBits: ['One', 'OnePointFive', 'Two'].includes(serial.stopBits) ? serial.stopBits : 'One',
      handshake: ['None', 'XOnXOff', 'RequestToSend', 'RequestToSendXOnXOff'].includes(serial.handshake) ? serial.handshake : 'None',
      readTimeoutMs: clampNumber(serial.readTimeoutMs, 1, 120000, DEFAULT_STATE.serial.readTimeoutMs),
      writeTimeoutMs: clampNumber(serial.writeTimeoutMs, 1, 120000, DEFAULT_STATE.serial.writeTimeoutMs),
      dtrEnable: Boolean(serial.dtrEnable),
      rtsEnable: Boolean(serial.rtsEnable),
      encoding: frameEncoding,
      lineEnding: normalizeLineEnding(serial.lineEnding)
    },
    visa: {
      resource: String(visa.resource ?? DEFAULT_STATE.visa.resource),
      timeoutMs: clampNumber(visa.timeoutMs, 1, 120000, DEFAULT_STATE.visa.timeoutMs),
      lineEnding: normalizeLineEnding(visa.lineEnding)
    },
    frameMode: raw?.frameMode === 'hex' ? 'hex' : 'text',
    frameEncoding,
    frameText: String(raw?.frameText ?? DEFAULT_STATE.frameText),
    expectResponse: raw?.expectResponse === undefined ? DEFAULT_STATE.expectResponse : Boolean(raw.expectResponse)
  };
}

function normalizeProfiles(raw: unknown): InstrumentProfile[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_PROFILES).map((item: any) => ({
    id: String(item?.id || createId()),
    name: String(item?.name || 'Instrument profile').slice(0, 120),
    state: normalizeState(item?.state)
  }));
}

function normalizeSavedCommands(raw: unknown): SavedInstrumentCommand[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_COMMANDS).map((item: any): SavedInstrumentCommand => ({
    id: String(item?.id || createId()),
    name: String(item?.name || item?.command || 'Command').slice(0, 120),
    command: String(item?.command ?? ''),
    frameMode: (item?.frameMode === 'hex' ? 'hex' : 'text') as 'hex' | 'text',
    frameEncoding: (item?.frameEncoding === 'utf8' || item?.frameEncoding === 'latin1' ? item.frameEncoding : 'ascii') as FrameEncoding,
    expectResponse: item?.expectResponse === undefined ? true : Boolean(item.expectResponse)
  })).filter((item) => item.command.length > 0);
}

function normalizeHistory(raw: unknown): InstrumentCommandHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_HISTORY).map((item: any): InstrumentCommandHistoryEntry => ({
    id: String(item?.id || createId()),
    timestamp: Number.isFinite(Number(item?.timestamp)) ? Number(item.timestamp) : Date.now(),
    transport: (item?.transport === 'visa' ? 'visa' : 'serial') as 'visa' | 'serial',
    target: String(item?.target ?? ''),
    command: String(item?.command ?? ''),
    frameMode: (item?.frameMode === 'hex' ? 'hex' : 'text') as 'hex' | 'text',
    frameEncoding: (item?.frameEncoding === 'utf8' || item?.frameEncoding === 'latin1' ? item.frameEncoding : 'ascii') as FrameEncoding
  })).filter((item) => item.command.length > 0);
}

function normalizeSequences(raw: unknown): DiagnosticSequence[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_SEQUENCES).map((item: any): DiagnosticSequence => ({
    id: String(item?.id || createId()),
    name: String(item?.name || 'Diagnostic sequence').slice(0, 120),
    stopOnFailure: item?.stopOnFailure === undefined ? true : Boolean(item.stopOnFailure),
    steps: normalizeSequenceSteps(item?.steps)
  })).filter((item) => item.steps.length > 0);
}

function normalizeSequenceSteps(raw: unknown): DiagnosticSequenceStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_SEQUENCE_STEPS).map((item: any, index): DiagnosticSequenceStep => {
    const expectResponse = item?.expectResponse === undefined ? true : Boolean(item.expectResponse);
    const matchMode: DiagnosticMatchMode = ['contains', 'equals', 'regex'].includes(String(item?.matchMode)) ? item.matchMode : 'any';
    return {
      id: String(item?.id || createId()),
      name: String(item?.name || `Step ${index + 1}`).slice(0, 120),
      command: String(item?.command ?? ''),
      frameMode: item?.frameMode === 'hex' ? 'hex' : 'text',
      frameEncoding: item?.frameEncoding === 'utf8' || item?.frameEncoding === 'latin1' ? item.frameEncoding : 'ascii',
      expectResponse,
      timeoutMs: clampNumber(item?.timeoutMs, 50, 120000, 2000),
      delayAfterMs: clampNumber(item?.delayAfterMs, 0, 120000, 0),
      matchMode,
      expected: String(item?.expected ?? '')
    };
  }).filter((item) => item.command.trim().length > 0);
}

function validateSequenceSteps(steps: DiagnosticSequenceStep[]): void {
  if (!steps.length) throw new Error('Add at least one step to the diagnostic sequence.');
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (!step.command.trim()) throw new Error(`Sequence step ${index + 1} has an empty command.`);
    if (step.expectResponse && step.matchMode !== 'any' && !step.expected.length) throw new Error(`Sequence step ${index + 1} requires expected response text.`);
    if (step.expectResponse && step.matchMode === 'regex') {
      try { new RegExp(step.expected); } catch (error) { throw new Error(`Sequence step ${index + 1} has an invalid regular expression: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }
}

function cloneSequenceSteps(steps: DiagnosticSequenceStep[]): DiagnosticSequenceStep[] {
  return normalizeSequenceSteps(JSON.parse(JSON.stringify(steps)));
}

function sequenceResponseMatches(step: DiagnosticSequenceStep, responseText: string, latestBytes: number): boolean {
  if (!step.expectResponse) return true;
  if (step.matchMode === 'any') return latestBytes > 0 || responseText.length > 0;
  if (step.matchMode === 'contains') return responseText.includes(step.expected);
  if (step.matchMode === 'equals') return responseText.trim() === step.expected.trim();
  try { return new RegExp(step.expected).test(responseText); } catch { return false; }
}

function cloneState(state: InstrumentPanelState): InstrumentPanelState {
  return normalizeState(JSON.parse(JSON.stringify(state)));
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

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
