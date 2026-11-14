import * as fs from 'fs';
import * as path from 'path';

/** Result of checking a configured tool or file path (used by Settings validation and the Home page). */
export interface PathStatus { status: 'ok' | 'missing' | 'unresolved'; message: string }

export function toolLabel(value: string): string {
  const trimmed = String(value ?? '').trim();
  return trimmed ? path.basename(trimmed) : 'not set';
}

/** Explicit paths must exist; bare names are looked up in the active CPM toolchain and on PATH. */
export function resolveToolStatus(value: string, baseDir: string | undefined, activeInstallation: string): PathStatus {
  const tool = String(value ?? '').trim();
  if (!tool || tool.includes('${')) return { status: 'ok', message: '' };
  const extensions = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  const exists = (candidate: string) => extensions.some((extension) => { try { return fs.statSync(candidate + extension).isFile(); } catch { return false; } });
  if (path.isAbsolute(tool) || /[\\/]/.test(tool)) {
    const resolved = path.isAbsolute(tool) ? tool : path.resolve(baseDir ?? process.cwd(), tool);
    return exists(resolved) ? { status: 'ok', message: '' } : { status: 'missing', message: `Not found: ${resolved}` };
  }
  const directories = [activeInstallation, activeInstallation ? path.join(activeInstallation, 'bin') : '', ...String(process.env.PATH ?? '').split(path.delimiter)].filter(Boolean);
  return directories.some((directory) => exists(path.join(directory, tool)))
    ? { status: 'ok', message: '' }
    : { status: 'unresolved', message: `${tool} is not in the active toolchain or on PATH` };
}

export function resolveFileStatus(value: string, baseDir: string | undefined): PathStatus {
  const file = String(value ?? '').trim();
  if (!file || file.includes('${')) return { status: 'ok', message: '' };
  const resolved = path.isAbsolute(file) ? file : path.resolve(baseDir ?? process.cwd(), file);
  return fs.existsSync(resolved) ? { status: 'ok', message: '' } : { status: 'missing', message: `File not found: ${resolved}` };
}
