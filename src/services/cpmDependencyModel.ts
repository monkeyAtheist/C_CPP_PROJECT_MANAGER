import * as fs from 'fs';
import * as path from 'path';

export interface CpmDependencyIntegration {
  includeDirectories: string[];
  libraryDirectories: string[];
  libraries: string[];
  compilerFlags: string[];
  linkerFlags: string[];
  environment: Record<string, string>;
  generatedAt?: string;
}

export function emptyDependencyIntegration(): CpmDependencyIntegration {
  return {
    includeDirectories: [],
    libraryDirectories: [],
    libraries: [],
    compilerFlags: [],
    linkerFlags: [],
    environment: {}
  };
}

export function dependencyIntegrationPath(projectRoot: string, outputDirectory = '.cpm/dependencies'): string {
  return path.resolve(projectRoot, outputDirectory, 'integration.json');
}

export function readDependencyIntegration(projectRoot: string, outputDirectory = '.cpm/dependencies'): CpmDependencyIntegration {
  const file = dependencyIntegrationPath(projectRoot, outputDirectory);
  if (!fs.existsSync(file)) return emptyDependencyIntegration();
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<CpmDependencyIntegration>;
    return {
      includeDirectories: strings(raw.includeDirectories),
      libraryDirectories: strings(raw.libraryDirectories),
      libraries: strings(raw.libraries),
      compilerFlags: strings(raw.compilerFlags),
      linkerFlags: strings(raw.linkerFlags),
      environment: objectStrings(raw.environment),
      generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined
    };
  } catch {
    return emptyDependencyIntegration();
  }
}

export function writeDependencyIntegration(file: string, integration: CpmDependencyIntegration): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ ...integration, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

function objectStrings(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') result[key] = entry;
  }
  return result;
}
