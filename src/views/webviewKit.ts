import * as vscode from 'vscode';

/**
 * Shared helpers for every CPM webview: strict Content-Security-Policy with a per-render nonce,
 * the shared design-system stylesheet and a command allowlist for webview → extension messages.
 *
 * Call {@link initWebviewKit} once from `activate()` so that stylesheet/script URIs can be resolved.
 */

let extensionRoot: vscode.Uri | undefined;

export function initWebviewKit(context: vscode.ExtensionContext): void {
  extensionRoot = context.extensionUri;
}

export function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let index = 0; index < 32; index++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

/** URI of a file under `media/webview/` as seen from the given webview (undefined before initWebviewKit). */
export function mediaUri(webview: vscode.Webview, fileName: string): vscode.Uri | undefined {
  return extensionRoot ? webview.asWebviewUri(vscode.Uri.joinPath(extensionRoot, 'media', 'webview', fileName)) : undefined;
}

/**
 * Strict policy: scripts only with the nonce (or from the extension's own media files), no eval, no remote content.
 * Inline styles stay allowed because many generated pages use `style="…"` attributes; style injection cannot run code.
 */
export function cspContent(webview: vscode.Webview, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `font-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`
  ].join('; ');
}

export interface HardenOptions {
  /** Link `media/webview/cpm-webview.css` before the page's own styles (opt-in: a page adopts it when it is redesigned). */
  sharedStyles?: boolean;
  /** Link `media/webview/cpm-harmonize.css` after the page's own styles (typography, headings, controls, focus). */
  harmonize?: boolean;
}

/**
 * Makes a generated HTML document safe to assign to `webview.html`:
 * removes any existing CSP meta tag, injects the strict nonce-based policy, adds the nonce to every
 * `<script>` tag and links optionally the shared stylesheet (design system).
 */
export function hardenHtml(html: string, webview: vscode.Webview, options: HardenOptions = {}): string {
  const nonce = createNonce();
  const csp = `<meta http-equiv="Content-Security-Policy" content="${cspContent(webview, nonce)}">`;
  const style = options.sharedStyles ? mediaUri(webview, 'cpm-webview.css') : undefined;
  const headExtras = csp + (style ? `<link rel="stylesheet" href="${style.toString()}">` : '');
  let out = html.replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
  // Re-key every script with this render's nonce (pages may carry a nonce of their own from an older template).
  out = out.replace(/(<script\b[^>]*?)\s+nonce=(["'])[^"']*\2/gi, '$1');
  out = out.replace(/<script\b/gi, `<script nonce="${nonce}"`);
  if (/<head[^>]*>/i.test(out)) {
    // Right after <meta charset> when present, otherwise first thing in <head>, so page styles still override.
    if (/<meta\s+charset=[^>]*>/i.test(out)) out = out.replace(/<meta\s+charset=[^>]*>/i, (match) => match + headExtras);
    else out = out.replace(/<head[^>]*>/i, (match) => match + headExtras);
  } else {
    out = headExtras + out;
  }
  const harmonize = options.harmonize ? mediaUri(webview, 'cpm-harmonize.css') : undefined;
  if (harmonize) {
    const link = `<link rel="stylesheet" href="${harmonize.toString()}">`;
    out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${link}</head>`) : link + out;
  }
  return out;
}

/** Only CPM's own contributed commands may be triggered from a webview message. */
export function isAllowedWebviewCommand(command: unknown): command is string {
  return typeof command === 'string' && /^cpm\.[A-Za-z0-9_.-]+$/.test(command);
}

export async function executeWebviewCommand(command: unknown, ...args: unknown[]): Promise<void> {
  if (!isAllowedWebviewCommand(command)) {
    void vscode.window.showWarningMessage(`CPM blocked a command request from a webview: ${String(command).slice(0, 80)}`);
    return;
  }
  await vscode.commands.executeCommand(command, ...args);
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}

/** JSON for embedding inside a <script> block. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value ?? null).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
