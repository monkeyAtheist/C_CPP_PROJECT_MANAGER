import * as fs from 'fs';
import * as path from 'path';

/** Keep a safety margin below the Windows CreateProcess command-line limit. */
export const WINDOWS_GNU_RESPONSE_FILE_THRESHOLD = 24_000;
export const POSIX_GNU_RESPONSE_FILE_THRESHOLD = 100_000;

export function estimateGnuArgumentLength(argumentsList: readonly string[]): number {
  return argumentsList.reduce((total, value) => total + quoteGnuResponseArgument(value).length + 1, 0);
}

export function shouldUseGnuResponseFile(argumentsList: readonly string[], platform: NodeJS.Platform = process.platform): boolean {
  const threshold = platform === 'win32' ? WINDOWS_GNU_RESPONSE_FILE_THRESHOLD : POSIX_GNU_RESPONSE_FILE_THRESHOLD;
  return estimateGnuArgumentLength(argumentsList) >= threshold;
}

export function normalizeGnuResponseArgument(value: string): string {
  const containsWindowsPath = /[A-Za-z]:[\\/]/.test(value) || /(?:^|[=,:])\\\\/.test(value);
  return containsWindowsPath ? value.replace(/\\/g, '/') : value;
}

export function quoteGnuResponseArgument(value: string): string {
  const normalized = normalizeGnuResponseArgument(value);
  if (normalized.length === 0) return '""';
  if (!/[\s"\\]/.test(normalized)) return normalized;
  const escaped = normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function createGnuResponseFileArguments(argumentsList: readonly string[], responseFilePath: string): string[] {
  fs.mkdirSync(path.dirname(responseFilePath), { recursive: true });
  const content = argumentsList.map(quoteGnuResponseArgument).join('\n');
  fs.writeFileSync(responseFilePath, `${content}\n`, 'utf8');
  return [`@${responseFilePath}`];
}
