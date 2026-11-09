import * as vscode from 'vscode';
import { SerialCommunicationSettings, VisaCommunicationSettings } from './cpmInstrumentService';
import { TcpCommunicationSettings, UdpCommunicationSettings } from './cpmNetworkDiagnosticsService';

export type CpmDeviceEndpointKind = 'serial' | 'visa' | 'tcp' | 'udp' | 'ssh';

export interface CpmSerialEndpoint {
  kind: 'serial';
  settings: SerialCommunicationSettings;
}

export interface CpmVisaEndpoint {
  kind: 'visa';
  settings: VisaCommunicationSettings;
}

export interface CpmTcpEndpoint {
  kind: 'tcp';
  settings: TcpCommunicationSettings;
}

export interface CpmUdpEndpoint {
  kind: 'udp';
  settings: UdpCommunicationSettings;
}

export interface CpmSshEndpoint {
  kind: 'ssh';
  alias: string;
  hostName: string;
  user?: string;
  port: number;
  identityFile?: string;
  proxyJump?: string;
}

export type CpmDeviceEndpoint = CpmSerialEndpoint | CpmVisaEndpoint | CpmTcpEndpoint | CpmUdpEndpoint | CpmSshEndpoint;

export interface CpmDeviceProfile {
  id: string;
  name: string;
  description: string;
  tags: string[];
  endpoints: Partial<Record<CpmDeviceEndpointKind, CpmDeviceEndpoint>>;
  createdAt: number;
  updatedAt: number;
}

const STATE_KEY = 'cpm.deviceRegistry.v1';
const MAX_DEVICES = 128;

export class CpmDeviceRegistry implements vscode.Disposable {
  private devices: CpmDeviceProfile[];
  private readonly changeEmitter = new vscode.EventEmitter<readonly CpmDeviceProfile[]>();
  readonly onDidChange = this.changeEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.devices = normalizeDevices(context.globalState.get<unknown>(STATE_KEY));
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  list(): CpmDeviceProfile[] {
    return this.devices.map(cloneDevice);
  }

  get(id: string): CpmDeviceProfile | undefined {
    const device = this.devices.find((item) => item.id === id);
    return device ? cloneDevice(device) : undefined;
  }

  async create(name: string, description = '', tags: string[] = []): Promise<CpmDeviceProfile> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Device name is required.');
    const now = Date.now();
    const device: CpmDeviceProfile = {
      id: createId(),
      name: trimmed,
      description: description.trim(),
      tags: normalizeTags(tags),
      endpoints: {},
      createdAt: now,
      updatedAt: now
    };
    this.devices.unshift(device);
    this.devices = this.devices.slice(0, MAX_DEVICES);
    await this.persist();
    return cloneDevice(device);
  }

  async updateMetadata(id: string, values: { name?: string; description?: string; tags?: string[] }): Promise<CpmDeviceProfile> {
    const device = this.requireMutable(id);
    if (values.name !== undefined) {
      const name = values.name.trim();
      if (!name) throw new Error('Device name is required.');
      device.name = name;
    }
    if (values.description !== undefined) device.description = values.description.trim();
    if (values.tags !== undefined) device.tags = normalizeTags(values.tags);
    device.updatedAt = Date.now();
    await this.persist();
    return cloneDevice(device);
  }

  async upsertEndpoint(id: string, endpoint: CpmDeviceEndpoint): Promise<CpmDeviceProfile> {
    const device = this.requireMutable(id);
    device.endpoints[endpoint.kind] = cloneEndpoint(endpoint);
    device.updatedAt = Date.now();
    await this.persist();
    return cloneDevice(device);
  }

  async removeEndpoint(id: string, kind: CpmDeviceEndpointKind): Promise<CpmDeviceProfile> {
    const device = this.requireMutable(id);
    delete device.endpoints[kind];
    device.updatedAt = Date.now();
    await this.persist();
    return cloneDevice(device);
  }

  async delete(id: string): Promise<boolean> {
    const before = this.devices.length;
    this.devices = this.devices.filter((item) => item.id !== id);
    if (this.devices.length === before) return false;
    await this.persist();
    return true;
  }

  async replaceAll(devices: CpmDeviceProfile[]): Promise<void> {
    this.devices = normalizeDevices(devices).slice(0, MAX_DEVICES);
    await this.persist();
  }

  async merge(devices: CpmDeviceProfile[]): Promise<void> {
    const incoming = normalizeDevices(devices);
    const byId = new Map(this.devices.map((item) => [item.id, item]));
    for (const candidate of incoming) {
      const existing = byId.get(candidate.id);
      if (!existing) {
        this.devices.push(candidate);
        byId.set(candidate.id, candidate);
        continue;
      }
      if (candidate.updatedAt >= existing.updatedAt) Object.assign(existing, candidate);
    }
    this.devices.sort((a, b) => b.updatedAt - a.updatedAt);
    this.devices = this.devices.slice(0, MAX_DEVICES);
    await this.persist();
  }

  private requireMutable(id: string): CpmDeviceProfile {
    const device = this.devices.find((item) => item.id === id);
    if (!device) throw new Error('The selected device no longer exists.');
    return device;
  }

  private async persist(): Promise<void> {
    await this.context.globalState.update(STATE_KEY, this.devices);
    this.changeEmitter.fire(this.list());
  }
}

export async function pickOrCreateDevice(registry: CpmDeviceRegistry, title: string, suggestedName = ''): Promise<CpmDeviceProfile | undefined> {
  const devices = registry.list();
  const CREATE = '__create__';
  const selected = await vscode.window.showQuickPick(
    [
      { label: '$(add) Create new device…', description: suggestedName || 'Create a new unified CPM device', id: CREATE },
      ...devices.map((device) => ({
        label: `$(device-desktop) ${device.name}`,
        description: endpointSummary(device),
        detail: device.description || (device.tags.length ? device.tags.join(', ') : undefined),
        id: device.id
      }))
    ],
    { title, placeHolder: 'Choose a unified device profile' }
  );
  if (!selected) return undefined;
  if (selected.id !== CREATE) return registry.get(selected.id);
  const name = await vscode.window.showInputBox({ title: 'New CPM device', prompt: 'Device name', value: suggestedName, validateInput: (value) => value.trim() ? undefined : 'A name is required.' });
  if (!name) return undefined;
  return registry.create(name);
}

export function endpointSummary(device: CpmDeviceProfile): string {
  const kinds = (Object.keys(device.endpoints) as CpmDeviceEndpointKind[]).filter((kind) => !!device.endpoints[kind]);
  return kinds.length ? kinds.map(endpointKindLabel).join(' · ') : 'No communication endpoint yet';
}

export function endpointKindLabel(kind: CpmDeviceEndpointKind): string {
  switch (kind) {
    case 'serial': return 'COM';
    case 'visa': return 'VISA';
    case 'tcp': return 'TCP';
    case 'udp': return 'UDP';
    case 'ssh': return 'SSH';
  }
}

function normalizeDevices(raw: unknown): CpmDeviceProfile[] {
  if (!Array.isArray(raw)) return [];
  const out: CpmDeviceProfile[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const value = item as any;
    const name = String(value.name ?? '').trim();
    if (!name) continue;
    const now = Date.now();
    const endpoints: Partial<Record<CpmDeviceEndpointKind, CpmDeviceEndpoint>> = {};
    for (const kind of ['serial', 'visa', 'tcp', 'udp', 'ssh'] as CpmDeviceEndpointKind[]) {
      const endpoint = normalizeEndpoint(kind, value.endpoints?.[kind]);
      if (endpoint) endpoints[kind] = endpoint;
    }
    out.push({
      id: String(value.id ?? createId()),
      name,
      description: String(value.description ?? '').trim(),
      tags: normalizeTags(Array.isArray(value.tags) ? value.tags : []),
      endpoints,
      createdAt: finiteTimestamp(value.createdAt, now),
      updatedAt: finiteTimestamp(value.updatedAt, now)
    });
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out.slice(0, MAX_DEVICES);
}

function normalizeEndpoint(kind: CpmDeviceEndpointKind, raw: any): CpmDeviceEndpoint | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  if (kind === 'serial' && raw.settings) return { kind, settings: { ...raw.settings } } as CpmSerialEndpoint;
  if (kind === 'visa' && raw.settings) return { kind, settings: { ...raw.settings } } as CpmVisaEndpoint;
  if (kind === 'tcp' && raw.settings) return { kind, settings: { ...raw.settings } } as CpmTcpEndpoint;
  if (kind === 'udp' && raw.settings) return { kind, settings: { ...raw.settings } } as CpmUdpEndpoint;
  if (kind === 'ssh') {
    const alias = String(raw.alias ?? '').trim();
    const hostName = String(raw.hostName ?? alias).trim();
    if (!alias && !hostName) return undefined;
    return {
      kind,
      alias: alias || hostName,
      hostName: hostName || alias,
      user: String(raw.user ?? '').trim() || undefined,
      port: clampPort(raw.port, 22),
      identityFile: String(raw.identityFile ?? '').trim() || undefined,
      proxyJump: String(raw.proxyJump ?? '').trim() || undefined
    };
  }
  return undefined;
}

function cloneDevice(device: CpmDeviceProfile): CpmDeviceProfile {
  const endpoints: Partial<Record<CpmDeviceEndpointKind, CpmDeviceEndpoint>> = {};
  for (const [kind, endpoint] of Object.entries(device.endpoints) as Array<[CpmDeviceEndpointKind, CpmDeviceEndpoint]>) {
    if (endpoint) endpoints[kind] = cloneEndpoint(endpoint);
  }
  return { ...device, tags: [...device.tags], endpoints };
}

function cloneEndpoint(endpoint: CpmDeviceEndpoint): CpmDeviceEndpoint {
  if (endpoint.kind === 'ssh') return { ...endpoint };
  return { kind: endpoint.kind, settings: { ...endpoint.settings } } as CpmDeviceEndpoint;
}

function normalizeTags(tags: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = String(raw ?? '').trim();
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 16) break;
  }
  return out;
}

function finiteTimestamp(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function clampPort(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(65535, Math.round(number))) : fallback;
}

function createId(): string {
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
