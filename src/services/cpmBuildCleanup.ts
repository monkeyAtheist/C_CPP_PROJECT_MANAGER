import * as fs from 'fs';
import * as path from 'path';

export interface CpmDirectoryCleanResult {
  success: boolean;
  strategy: 'absent' | 'rename' | 'in-place';
  pendingDirectory?: string;
  warnings: string[];
}

export async function cleanCpmBuildDirectory(directory: string, retryCount = 8, retryDelayMs = 120): Promise<CpmDirectoryCleanResult> {
  const normalized = path.normalize(directory);
  const warnings: string[] = [];

  for (const pending of findPendingDirectories(normalized)) {
    if (!await removePathWithRetries(pending, Math.max(2, Math.ceil(retryCount / 2)), retryDelayMs)) {
      warnings.push(`A previous pending clean directory is still locked: ${pending}`);
    }
  }

  if (!fs.existsSync(normalized)) return { success: true, strategy: 'absent', warnings };

  const pendingDirectory = createPendingDirectoryName(normalized);
  let lastRenameError: unknown;
  for (let attempt = 1; attempt <= Math.max(1, retryCount); attempt++) {
    try {
      fs.renameSync(normalized, pendingDirectory);
      const removed = await removePathWithRetries(pendingDirectory, Math.max(3, Math.ceil(retryCount / 2)), retryDelayMs);
      if (!removed) warnings.push(`The previous build was moved to ${pendingDirectory}, but a Windows process still has a handle open. CPM will retry removal during the next clean.`);
      return { success: true, strategy: 'rename', pendingDirectory: removed ? undefined : pendingDirectory, warnings };
    } catch (error) {
      lastRenameError = error;
      if (!isRetryableFileSystemError(error) || attempt === retryCount) break;
      await delay(retryDelayMs * attempt);
    }
  }

  warnings.push(`Atomic clean rename was unavailable: ${formatError(lastRenameError)}. Falling back to in-place cleanup.`);
  const success = await clearDirectoryContents(normalized, retryCount, retryDelayMs);
  if (!success) warnings.push(`Some locked build items could not be removed from ${normalized}.`);
  return { success, strategy: 'in-place', warnings };
}

export async function removePathWithRetries(targetPath: string, retryCount = 8, retryDelayMs = 120): Promise<boolean> {
  for (let attempt = 1; attempt <= Math.max(1, retryCount); attempt++) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 0 });
      if (!fs.existsSync(targetPath)) return true;
    } catch (error) {
      if (!isRetryableFileSystemError(error) || attempt === retryCount) return !fs.existsSync(targetPath);
    }
    await delay(Math.max(10, retryDelayMs) * attempt);
  }
  return !fs.existsSync(targetPath);
}

export function createPendingDirectoryName(directory: string, now = Date.now(), processId = process.pid): string {
  const parent = path.dirname(directory);
  const base = path.basename(directory);
  let candidate = path.join(parent, `.${base}.cpm-clean-pending-${processId}-${now}`);
  let suffix = 1;
  while (fs.existsSync(candidate)) candidate = path.join(parent, `.${base}.cpm-clean-pending-${processId}-${now}-${suffix++}`);
  return candidate;
}

async function clearDirectoryContents(directory: string, retryCount: number, retryDelayMs: number): Promise<boolean> {
  let entries: string[];
  try { entries = fs.readdirSync(directory); } catch { return !fs.existsSync(directory); }
  let success = true;
  for (const entry of entries) if (!await removePathWithRetries(path.join(directory, entry), retryCount, retryDelayMs)) success = false;
  return success;
}

function findPendingDirectories(directory: string): string[] {
  const parent = path.dirname(directory);
  const prefix = `.${path.basename(directory)}.cpm-clean-pending-`;
  try { return fs.readdirSync(parent).filter((entry) => entry.startsWith(prefix)).map((entry) => path.join(parent, entry)); } catch { return []; }
}

function isRetryableFileSystemError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'ENOENT';
}

function formatError(error: unknown): string { return error instanceof Error ? error.message : String(error ?? 'unknown error'); }
function delay(milliseconds: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
