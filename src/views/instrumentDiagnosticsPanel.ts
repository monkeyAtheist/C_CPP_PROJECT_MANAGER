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
  /** How many times this exact frame has been sent (history is de-duplicated). */
  count?: number;
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
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')] }
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
    // Shell-like history: re-sending an identical frame moves it to the top instead of piling up duplicates.
    const previous = this.history.find((item) => item.command === command && item.frameMode === frameMode && item.frameEncoding === frameEncoding);
    this.history = this.history.filter((item) => item !== previous);
    this.history.unshift({ id: previous?.id ?? createId(), timestamp: Date.now(), transport, target, command, frameMode, frameEncoding, count: (previous?.count ?? 1) + (previous ? 1 : 0) });
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
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview');
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'cpm-webview.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'instrumentDiagnostics.js'));
    const init = {
      state: this.state,
      presets: SCPI_PRESETS,
      profiles: this.profiles,
      savedCommands: this.savedCommands,
      history: this.history,
      sequences: this.sequences,
      session: this.instruments.getSessionState()
    };
    const encodingOptions = '<option value="ascii">ASCII</option><option value="utf8">UTF-8</option><option value="latin1">Latin-1</option>';
    const frameModeOptions = '<option value="text">Text</option><option value="hex">HEX bytes</option>';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src ${webview.cspSource} 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}">
<title>Instrument Diagnostics</title>
</head>
<body class="cpm-app">
<header class="app-header">
  <h1>Instrument Diagnostics</h1>
  <span id="sessionBadge" class="badge disconnected"><span class="dot"></span><span id="sessionText">Disconnected</span></span>
  <span class="counters" title="Interfaces detected during the last refresh"><span>COM <b id="serialCount">0</b></span><span>VISA <b id="visaCount">0</b></span><span>USB <b id="usbCount">0</b></span></span>
  <span id="status" class="busy-text"></span>
  <span class="spacer"></span>
  <div class="header-actions">
    <button id="refresh" class="ghost" title="Re-enumerate COM, VISA and USB interfaces">⟳ Refresh</button>
    <button id="openNetworkDiagnostics" class="ghost" title="Open Network / Wi-Fi / BLE diagnostics">Network / BLE</button>
    <button id="openDeviceManager" class="ghost" title="Open the CPM device registry">CPM Devices</button>
    <button id="openHelp" class="ghost" title="Open the SCPI reference website in your browser">SCPI ↗</button>
  </div>
</header>

<div class="connection-bar">
  <div class="seg" role="group" aria-label="Transport"><button id="transportSerial" class="active">Serial / COM</button><button id="transportVisa">VISA / USBTMC</button></div>
  <fieldset id="connectionQuick" class="quick">
    <span id="serialQuick" class="quick">
      <label class="inline-field">Port <select id="portName"></select></label>
      <label class="inline-field">Baud <input id="baudRate" type="number" min="1" max="12000000" list="baudList"></label>
      <span id="serialSummary" class="summary-text" title="Data bits / parity / stop bits · flow control"></span>
    </span>
    <span id="visaQuick" class="quick hidden">
      <label class="inline-field">Resource <input id="visaResource" list="visaResourceList" placeholder="USB0::0x0000::0x0000::SERIAL::INSTR" spellcheck="false"></label>
    </span>
  </fieldset>
  <button id="toggleAdvanced" class="ghost small" aria-expanded="false" aria-controls="advancedSettings">⚙ Settings ▾</button>
  <select id="profileQuick" title="Load a saved instrument profile"><option value="">Load profile…</option></select>
  <span class="spacer"></span>
  <div class="connection-actions">
    <button id="connect">Connect</button>
    <button id="disconnect" class="secondary" disabled>Disconnect</button>
  </div>
  <datalist id="baudList"><option value="1200"><option value="2400"><option value="4800"><option value="9600"><option value="19200"><option value="38400"><option value="57600"><option value="115200"><option value="230400"><option value="460800"><option value="921600"></datalist>
  <datalist id="visaResourceList"></datalist>
</div>

<div id="advancedSettings" class="advanced-settings hidden">
  <fieldset id="connectionFields">
    <div id="serialSettings" class="form-grid">
      <label class="field">Data bits<select id="dataBits"><option>5</option><option>6</option><option>7</option><option selected>8</option></select></label>
      <label class="field">Parity<select id="parity"><option>None</option><option>Odd</option><option>Even</option><option>Mark</option><option>Space</option></select></label>
      <label class="field">Stop bits<select id="stopBits"><option value="One">1</option><option value="OnePointFive">1.5</option><option value="Two">2</option></select></label>
      <label class="field">Handshake<select id="handshake"><option value="None">None</option><option value="XOnXOff">XON / XOFF</option><option value="RequestToSend">RTS / CTS</option><option value="RequestToSendXOnXOff">RTS / CTS + XON / XOFF</option></select></label>
      <label class="field">Read timeout (ms)<input id="readTimeoutMs" type="number" min="1" max="120000"></label>
      <label class="field">Write timeout (ms)<input id="writeTimeoutMs" type="number" min="1" max="120000"></label>
      <label class="check"><input id="dtrEnable" type="checkbox"> DTR enabled</label>
      <label class="check"><input id="rtsEnable" type="checkbox"> RTS enabled</label>
    </div>
    <div id="visaSettings" class="form-grid hidden">
      <label class="field">Open timeout (ms)<input id="visaTimeoutMs" type="number" min="1" max="120000"></label>
      <div class="muted small span-all" id="visaHint"></div>
    </div>
  </fieldset>
</div>

<div id="warningsBar" class="notices-bar hidden"><details class="notices"><summary id="warningsSummary"></summary><div id="warnings"></div></details></div>

<main class="workspace" id="workspace">
  <aside class="sidebar" aria-label="Commands, sequences, profiles and interfaces">
    <nav class="tabs" role="tablist">
      <button data-tab="commands" class="active" role="tab">Commands</button>
      <button data-tab="sequences" role="tab">Sequences <span id="seqTabCount" class="pill hidden"></span></button>
      <button data-tab="profiles" role="tab">Profiles</button>
      <button data-tab="interfaces" role="tab">Interfaces</button>
    </nav>

    <div class="tab-panel flex-col" data-panel="commands">
      <section class="pane-section">
        <h3 class="pane-title">SCPI / IEEE 488.2 presets</h3>
        <div id="presetList" class="chips"></div>
        <div class="muted small" style="margin-top:6px">Click to load in the input box · double-click to send.</div>
      </section>
      <section class="pane-section">
        <h3 class="pane-title">Saved commands <span id="savedCount" class="pill hidden"></span></h3>
        <div class="row" style="flex-wrap:nowrap;margin-bottom:6px"><input id="commandName" placeholder="Name for the current frame (optional)" style="flex:1"><button id="saveCommand" class="secondary small">Save</button></div>
        <div id="savedCommandList" class="list scroll-list capped"></div>
        <div id="savedCommandEmpty" class="empty-state">No saved command yet.</div>
      </section>
      <section class="pane-section grow">
        <h3 class="pane-title">History <span id="historyCount" class="pill hidden"></span><span class="spacer"></span><button id="clearHistory" class="ghost small">Clear</button></h3>
        <input id="historyFilter" type="search" placeholder="Filter history…" style="width:100%;margin-bottom:6px">
        <div id="historyList" class="list scroll-list"></div>
        <div id="historyEmpty" class="empty-state">No command sent yet.</div>
      </section>
    </div>

    <div class="tab-panel hidden" data-panel="sequences">
      <section class="pane-section">
        <div class="row" style="flex-wrap:nowrap"><input id="sequenceName" placeholder="Sequence name, e.g. startup check" style="flex:1"><span id="sequenceRunStatus" class="status-tag idle">Idle</span></div>
        <div class="row" style="margin-top:8px">
          <button id="runSequence" disabled>▶ Run</button>
          <button id="stopSequence" class="secondary" disabled>■ Stop</button>
          <button id="saveSequence" class="secondary">Save</button>
          <label class="check"><input id="sequenceStopOnFailure" type="checkbox" checked> Stop on first failure</label>
        </div>
      </section>
      <section class="pane-section">
        <h3 class="pane-title">Steps <span id="stepCount" class="pill hidden"></span></h3>
        <div id="sequenceStepList" class="list"></div>
        <div id="sequenceStepEmpty" class="empty-state">No step yet — fill in the editor below or reuse the frame currently in the input box.</div>
      </section>
      <details class="card pane-section" id="stepEditor" open>
        <summary id="stepEditorTitle">Add a step</summary>
        <div class="form-grid">
          <label class="field">Step label<input id="sequenceStepName" placeholder="Identification"></label>
          <label class="field">Frame format<select id="sequenceStepFrameMode">${frameModeOptions}</select></label>
          <label class="field">Encoding<select id="sequenceStepEncoding">${encodingOptions}</select></label>
          <label class="field span-all">Command<textarea id="sequenceStepCommand" rows="2" spellcheck="false" placeholder="*IDN?"></textarea></label>
          <label class="check span-all"><input id="sequenceStepExpectResponse" type="checkbox" checked> Response expected</label>
          <label class="field">Validation<select id="sequenceStepMatchMode"><option value="any">Any response</option><option value="contains">Contains</option><option value="equals">Equals</option><option value="regex">Regular expression</option></select></label>
          <label class="field">Expected decoded text<input id="sequenceStepExpected" placeholder="e.g. GW INSTEK"></label>
          <label class="field">Response timeout (ms)<input id="sequenceStepTimeout" type="number" min="50" max="120000" value="2000"></label>
          <label class="field">Delay after step (ms)<input id="sequenceStepDelay" type="number" min="0" max="120000" value="0"></label>
        </div>
        <div class="row" style="margin-top:10px">
          <button id="sequenceAddStep" class="secondary">Add step</button>
          <button id="sequenceUseTerminal" class="ghost">Use input-box frame</button>
          <button id="sequenceCancelEdit" class="ghost hidden">Cancel edit</button>
        </div>
      </details>
      <section class="pane-section">
        <h3 class="pane-title">Last run</h3>
        <div class="table-wrap"><table><thead><tr><th>#</th><th>Step / response</th><th>Status</th><th>Time</th></tr></thead><tbody id="sequenceResultTable"></tbody></table></div>
      </section>
      <section class="pane-section">
        <h3 class="pane-title">Saved sequences</h3>
        <div id="savedSequenceList" class="list"></div>
        <div id="savedSequenceEmpty" class="empty-state">No saved diagnostic sequence.</div>
      </section>
    </div>

    <div class="tab-panel hidden" data-panel="profiles">
      <section class="pane-section">
        <h3 class="pane-title">Save current connection</h3>
        <div class="row" style="flex-wrap:nowrap"><input id="profileName" placeholder="e.g. GPT-9801 bench #1" style="flex:1"><button id="saveProfile" class="secondary small">Save profile</button></div>
        <button id="saveToDevice" class="ghost small" style="margin-top:6px">+ Add this endpoint to a CPM device…</button>
      </section>
      <section class="pane-section">
        <h3 class="pane-title">Instrument profiles <span id="profileCount" class="pill hidden"></span></h3>
        <div id="profileList" class="list"></div>
        <div id="profileEmpty" class="empty-state">No saved instrument profile.</div>
      </section>
    </div>

    <div class="tab-panel hidden" data-panel="interfaces">
      <section class="pane-section">
        <h3 class="pane-title">Serial / COM<span class="spacer"></span><span class="small" style="text-transform:none;letter-spacing:0;font-weight:400">click a row to use the port</span></h3>
        <div class="table-wrap"><table><thead><tr><th>Port</th><th>Name</th><th>Manufacturer</th><th>Status</th></tr></thead><tbody id="serialTable"></tbody></table></div>
      </section>
      <section class="pane-section">
        <h3 class="pane-title">VISA resources</h3>
        <div class="table-wrap"><table><thead><tr><th>Resource</th></tr></thead><tbody id="visaTable"></tbody></table></div>
      </section>
      <section class="pane-section">
        <h3 class="pane-title">USB / PnP</h3>
        <div class="muted small" style="margin-bottom:6px">Diagnostic only, unless the device exposes a COM port or a VISA/USBTMC resource. Hover a row for its PnP ID.</div>
        <div class="table-wrap"><table><thead><tr><th>Name</th><th>VID:PID</th><th>Manufacturer</th><th>Status</th></tr></thead><tbody id="usbTable"></tbody></table></div>
      </section>
    </div>
  </aside>

  <div class="splitter" id="splitter" role="separator" aria-orientation="vertical" aria-label="Resize side panel" tabindex="0" title="Drag to resize · double-click to reset"></div>

  <section class="terminal" aria-label="Terminal">
    <div class="term-toolbar">
      <span class="term-title">TX / RX log</span>
      <span id="termStats" class="term-stats"></span>
      <span class="spacer"></span>
      <input id="logFilter" type="search" placeholder="Filter log…" aria-label="Filter log lines">
      <label class="check" title="Show timestamps"><input id="optTime" type="checkbox"> Time</label>
      <label class="check" title="Show the HEX dump under each frame"><input id="optHex" type="checkbox"> HEX</label>
      <label class="check" title="Keep the newest line visible"><input id="optScroll" type="checkbox"> Auto-scroll</label>
      <button id="copyLog" class="ghost small" title="Copy the whole log to the clipboard">Copy</button>
      <button id="clearLog" class="ghost small" title="Clear the log">Clear</button>
    </div>
    <div id="console" class="console" role="log" aria-live="polite"></div>
    <button id="jumpLatest" class="jump-latest hidden">↓ New messages</button>
    <div class="composer">
      <div class="composer-options">
        <label class="inline-field">Format <select id="frameMode">${frameModeOptions}</select></label>
        <label class="inline-field">Encoding <select id="frameEncoding">${encodingOptions}</select></label>
        <label class="inline-field">Line ending <select id="lineEnding"><option value="none">None</option><option value="lf">LF (\\n)</option><option value="cr">CR (\\r)</option><option value="crlf">CRLF (\\r\\n)</option></select></label>
        <label class="check" title="Stored with saved commands and history as metadata. RX is always monitored while connected."><input id="expectResponse" type="checkbox"> Query (response expected)</label>
      </div>
      <div class="composer-input">
        <textarea id="frameText" rows="1" spellcheck="false" placeholder="Type a command, e.g. *IDN?" aria-label="Frame to send"></textarea>
        <button id="send" class="send-btn" disabled title="Send (Enter)">Send ⏎</button>
      </div>
      <div class="composer-hint"><span><kbd>Enter</kbd> send</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> new line</span><span><kbd>↑</kbd> <kbd>↓</kbd> history</span><span>Click a TX line to recall it</span></div>
    </div>
  </section>
</main>

<script nonce="${nonce}">window.CPM_INSTRUMENT_INIT = ${safeJson(init)};</script>
<script nonce="${nonce}" src="${scriptUri}"></script>
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
    frameEncoding: (item?.frameEncoding === 'utf8' || item?.frameEncoding === 'latin1' ? item.frameEncoding : 'ascii') as FrameEncoding,
    count: Number.isFinite(Number(item?.count)) && Number(item.count) > 1 ? Math.round(Number(item.count)) : 1
  })).filter((item) => item.command.length > 0)
    // Collapse duplicates left by earlier versions (keep the most recent occurrence, add up counts).
    .reduce<InstrumentCommandHistoryEntry[]>((acc, item) => {
      const existing = acc.find((other) => other.command === item.command && other.frameMode === item.frameMode && other.frameEncoding === item.frameEncoding);
      if (existing) existing.count = (existing.count ?? 1) + (item.count ?? 1);
      else acc.push(item);
      return acc;
    }, []);
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
