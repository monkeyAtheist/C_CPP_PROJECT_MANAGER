import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CviWorkspaceService } from './cviWorkspaceService';

export interface CviSourceSymbol {
  name: string;
  signature: string;
  filePath: string;
  line: number;
  character: number;
  kind: vscode.SymbolKind;
  source: 'document' | 'fallback';
}

export interface CviCompletionSymbol {
  name: string;
  signature: string;
  description?: string;
  origin: 'project' | 'standard';
  header?: string;
  insertText?: string;
}

const FUNCTION_KINDS = new Set<vscode.SymbolKind>([
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Constructor
]);

interface StandardCompletionDefinition {
  name: string;
  header: string;
  signature: string;
  insertText: string;
  description: string;
  languages?: Array<'c' | 'cpp'>;
}

const STANDARD_COMPLETIONS: StandardCompletionDefinition[] = [
  { name: 'printf', header: 'stdio.h', signature: 'int printf(const char *format, ...);', insertText: 'printf(${1:"%s\\n"}, ${2:value})', description: 'Formatted output to stdout.' },
  { name: 'fprintf', header: 'stdio.h', signature: 'int fprintf(FILE *stream, const char *format, ...);', insertText: 'fprintf(${1:stream}, ${2:"%s\\n"}, ${3:value})', description: 'Formatted output to a file stream.' },
  { name: 'snprintf', header: 'stdio.h', signature: 'int snprintf(char *buffer, size_t size, const char *format, ...);', insertText: 'snprintf(${1:buffer}, sizeof(${1:buffer}), ${2:"%s"}, ${3:value})', description: 'Bounded formatted output into a character buffer.' },
  { name: 'scanf', header: 'stdio.h', signature: 'int scanf(const char *format, ...);', insertText: 'scanf(${1:"%d"}, &${2:value})', description: 'Formatted input from stdin.' },
  { name: 'fopen', header: 'stdio.h', signature: 'FILE *fopen(const char *filename, const char *mode);', insertText: 'fopen(${1:"file.txt"}, ${2:"r"})', description: 'Open a file stream.' },
  { name: 'fclose', header: 'stdio.h', signature: 'int fclose(FILE *stream);', insertText: 'fclose(${1:file})', description: 'Close a file stream.' },
  { name: 'fputs', header: 'stdio.h', signature: 'int fputs(const char *str, FILE *stream);', insertText: 'fputs(${1:"text"}, ${2:file})', description: 'Write a string to a file stream.' },
  { name: 'fgets', header: 'stdio.h', signature: 'char *fgets(char *str, int count, FILE *stream);', insertText: 'fgets(${1:buffer}, sizeof(${1:buffer}), ${2:file})', description: 'Read a string from a file stream.' },
  { name: 'malloc', header: 'stdlib.h', signature: 'void *malloc(size_t size);', insertText: 'malloc(${1:size})', description: 'Allocate memory from the heap.' },
  { name: 'calloc', header: 'stdlib.h', signature: 'void *calloc(size_t count, size_t size);', insertText: 'calloc(${1:count}, sizeof(${2:*ptr}))', description: 'Allocate zero-initialized memory from the heap.' },
  { name: 'realloc', header: 'stdlib.h', signature: 'void *realloc(void *ptr, size_t new_size);', insertText: 'realloc(${1:ptr}, ${2:newSize})', description: 'Resize a heap allocation.' },
  { name: 'free', header: 'stdlib.h', signature: 'void free(void *ptr);', insertText: 'free(${1:ptr})', description: 'Release heap memory.' },
  { name: 'atoi', header: 'stdlib.h', signature: 'int atoi(const char *str);', insertText: 'atoi(${1:text})', description: 'Convert a string to an int.' },
  { name: 'strtol', header: 'stdlib.h', signature: 'long strtol(const char *str, char **endptr, int base);', insertText: 'strtol(${1:text}, ${2:NULL}, ${3:10})', description: 'Convert a string to a long with explicit base and end pointer.' },
  { name: 'memset', header: 'string.h', signature: 'void *memset(void *dest, int ch, size_t count);', insertText: 'memset(${1:buffer}, ${2:0}, sizeof(${1:buffer}))', description: 'Fill a memory region with a byte value.' },
  { name: 'memcpy', header: 'string.h', signature: 'void *memcpy(void *dest, const void *src, size_t count);', insertText: 'memcpy(${1:dest}, ${2:src}, ${3:size})', description: 'Copy a memory region.' },
  { name: 'strlen', header: 'string.h', signature: 'size_t strlen(const char *str);', insertText: 'strlen(${1:text})', description: 'Return the length of a null-terminated string.' },
  { name: 'strcmp', header: 'string.h', signature: 'int strcmp(const char *lhs, const char *rhs);', insertText: 'strcmp(${1:left}, ${2:right})', description: 'Compare two null-terminated strings.' },
  { name: 'strncpy', header: 'string.h', signature: 'char *strncpy(char *dest, const char *src, size_t count);', insertText: 'strncpy(${1:dest}, ${2:src}, sizeof(${1:dest}) - 1)', description: 'Copy a bounded number of characters.' },
  { name: 'time', header: 'time.h', signature: 'time_t time(time_t *arg);', insertText: 'time(${1:NULL})', description: 'Read the current calendar time.' },
  { name: 'clock', header: 'time.h', signature: 'clock_t clock(void);', insertText: 'clock()', description: 'Read process CPU time.' },
  { name: 'assert', header: 'assert.h', signature: 'void assert(scalar expression);', insertText: 'assert(${1:condition})', description: 'Abort in debug builds if the expression is false.' },
  { name: 'std::cout', header: 'iostream', signature: 'std::ostream std::cout;', insertText: 'std::cout << ${1:value} << std::endl', description: 'Write to the standard C++ output stream.', languages: ['cpp'] },
  { name: 'std::cerr', header: 'iostream', signature: 'std::ostream std::cerr;', insertText: 'std::cerr << ${1:value} << std::endl', description: 'Write to the standard C++ error stream.', languages: ['cpp'] },
  { name: 'std::vector', header: 'vector', signature: 'template<class T> class std::vector;', insertText: 'std::vector<${1:int}> ${2:items}', description: 'Dynamic contiguous sequence container.', languages: ['cpp'] },
  { name: 'std::string', header: 'string', signature: 'class std::string;', insertText: 'std::string ${1:text}', description: 'Standard C++ string type.', languages: ['cpp'] }
];

export class CviSymbolService {
  private projectCache?: { key: string; symbols: CviCompletionSymbol[] };

  constructor(
    private readonly extensionPath: string,
    private readonly workspaces: CviWorkspaceService
  ) {}

  async symbolsForFile(filePath: string): Promise<CviSourceSymbol[]> {
    if (!isSourceOrHeader(filePath) || !fs.existsSync(filePath)) {
      return [];
    }

    // Keep this provider independent from Microsoft cpptools. Calling
    // vscode.executeDocumentSymbolProvider here can force cpptools to parse the
    // active translation unit while the user is typing, which is what produced
    // long "Loading..." states on small managed C/C++ projects.
    return scanCFunctions(fs.readFileSync(filePath, 'utf8'), filePath);
  }

  completionSymbols(): CviCompletionSymbol[] {
    // Do not inject bundled API-pack symbols into normal C/C++ IntelliSense.
    // The Microsoft C/C++ extension remains responsible for standard-library
    // symbols such as FILE, printf, std::vector, etc. This provider only adds
    // lightweight symbols parsed from the active project files.
    return this.projectCompletionSymbols();
  }

  isCviWorkspaceFile(filePath: string): boolean {
    const workspace = this.workspaces.currentWorkspace;
    if (!workspace || !filePath) {
      return false;
    }
    const candidate = path.resolve(filePath).toLowerCase();
    const workspaceDirectory = path.dirname(workspace.path).toLowerCase();
    if (isPathInside(candidate, workspaceDirectory)) {
      return true;
    }
    for (const projectRef of workspace.projects) {
      if (!projectRef.exists) continue;
      const projectDirectory = path.dirname(projectRef.absolutePath).toLowerCase();
      if (isPathInside(candidate, projectDirectory)) {
        return true;
      }
      const project = this.workspaces.getProject(projectRef);
      if (project?.files.some((entry) => path.resolve(entry.absolutePath).toLowerCase() === candidate)) {
        return true;
      }
    }
    return false;
  }

  invalidateProjectCache(): void {
    this.projectCache = undefined;
  }

  private projectCompletionSymbols(): CviCompletionSymbol[] {
    const ref = this.workspaces.activeProjectRef;
    const project = ref?.exists ? this.workspaces.getProject(ref) : undefined;
    if (!project) {
      return [];
    }

    const candidateFiles = project.files
      .map((file) => file.absolutePath)
      .filter((filePath) => isSourceOrHeader(filePath) && fs.existsSync(filePath));
    const key = candidateFiles
      .map((filePath) => `${filePath}:${safeMtime(filePath)}`)
      .join('|');
    if (this.projectCache?.key === key) {
      return this.projectCache.symbols;
    }

    const symbols: CviCompletionSymbol[] = [];
    for (const filePath of candidateFiles) {
      const parsed = scanCFunctions(fs.readFileSync(filePath, 'utf8'), filePath);
      for (const symbol of parsed) {
        symbols.push({
          name: symbol.name,
          signature: symbol.signature,
          description: `Project symbol · ${path.basename(filePath)}`,
          origin: 'project'
        });
      }
    }
    this.projectCache = { key, symbols: dedupeCompletionSymbols(symbols) };
    return this.projectCache.symbols;
  }
}

export class CviCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly symbols: CviSymbolService) {}

  provideCompletionItems(document: vscode.TextDocument): vscode.CompletionItem[] | undefined {
    const configuration = vscode.workspace.getConfiguration('labwindowsCvi');
    const projectEnabled = configuration.get<boolean>('enableSupplementalCompletionProvider', false);
    const standardEnabled = configuration.get<boolean>('enableStandardLibraryCompletionProvider', true);

    if (document.uri.scheme !== 'file' || !this.symbols.isCviWorkspaceFile(document.uri.fsPath)) {
      return undefined;
    }

    const result: vscode.CompletionItem[] = [];
    if (standardEnabled) {
      result.push(...createStandardCompletionItems(document, configuration.get<boolean>('standardLibraryCompletionAutoInclude', true)));
    }
    if (projectEnabled) {
      result.push(...this.symbols.completionSymbols().map((symbol) => {
        const item = new vscode.CompletionItem(symbol.name, vscode.CompletionItemKind.Function);
        item.detail = symbol.signature;
        item.documentation = new vscode.MarkdownString(symbol.description || 'Project symbol.');
        item.insertText = symbol.name;
        item.sortText = `1_${symbol.name.toLowerCase()}`;
        return item;
      }));
    }
    return result.length ? result : undefined;
  }
}

function createStandardCompletionItems(document: vscode.TextDocument, autoInclude: boolean): vscode.CompletionItem[] {
  const language = document.languageId === 'cpp' ? 'cpp' : 'c';
  const documentText = document.getText();
  return STANDARD_COMPLETIONS
    .filter((definition) => !definition.languages || definition.languages.includes(language))
    // Keep the fallback provider restricted to missing headers. Once the user
    // has included the matching standard header, Microsoft C/C++ IntelliSense
    // already provides the real symbol with full semantic information. Keeping
    // the CPM fallback active in that case produces duplicate entries such as
    // two printf suggestions.
    .filter((definition) => !hasHeaderInclude(documentText, definition.header))
    .map((definition) => {
      const item = new vscode.CompletionItem(definition.name, vscode.CompletionItemKind.Function);
      item.detail = `${definition.signature}  <${definition.header}>`;
      item.documentation = new vscode.MarkdownString(`${definition.description}

Header: \`#include <${definition.header}>\``);
      item.insertText = new vscode.SnippetString(definition.insertText);
      item.sortText = `0_${definition.name.toLowerCase()}`;
      if (autoInclude) {
        const insertion = getHeaderIncludeInsertion(document, definition.header);
        if (insertion) {
          item.additionalTextEdits = [insertion];
          item.detail = `${item.detail} · auto-include`;
        }
      }
      return item;
    });
}

function hasHeaderInclude(documentText: string, header: string): boolean {
  const escaped = escapeRegExp(header);
  const pattern = new RegExp(`^\\s*#\\s*include\\s*[<"]${escaped}[>"]`, 'm');
  return pattern.test(documentText);
}

function getHeaderIncludeInsertion(document: vscode.TextDocument, header: string): vscode.TextEdit | undefined {
  let lastIncludeLine = -1;
  let firstCodeLine = 0;
  for (let line = 0; line < document.lineCount; line += 1) {
    const text = document.lineAt(line).text;
    if (/^\s*#\s*include\b/.test(text)) {
      lastIncludeLine = line;
      firstCodeLine = line + 1;
      continue;
    }
    if (lastIncludeLine >= 0) {
      break;
    }
    if (/^\s*(?:\/\/.*|\/\*.*|\*.*|\*\/\s*)?$/.test(text)) {
      firstCodeLine = line + 1;
      continue;
    }
    break;
  }

  const insertionLine = lastIncludeLine >= 0 ? lastIncludeLine + 1 : Math.min(firstCodeLine, document.lineCount);
  const needsBlankLine = lastIncludeLine < 0 && insertionLine < document.lineCount && document.lineAt(insertionLine).text.trim().length > 0;
  const includeText = `#include <${header}>\n${needsBlankLine ? '\n' : ''}`;
  return vscode.TextEdit.insert(new vscode.Position(insertionLine, 0), includeText);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectPackFunctions(value: unknown, result: CviCompletionSymbol[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectPackFunctions(entry, result));
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  const record = value as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const signature = typeof record.signature === 'string'
    ? record.signature.trim()
    : typeof record.declaration === 'string'
      ? record.declaration.trim()
      : '';
  const symbolKind = typeof record.symbolKind === 'string' ? record.symbolKind : '';
  if (name && signature.includes('(') && (!symbolKind || ['function', 'method', 'macro', 'metamethod'].includes(symbolKind))) {
    result.push({
      name,
      signature,
      description: typeof record.description === 'string' ? record.description : 'C/C++ API symbol.',
      origin: 'project'
    });
  }
  Object.values(record).forEach((entry) => collectPackFunctions(entry, result));
}

function flattenDocumentSymbols(entries: Array<vscode.DocumentSymbol | vscode.SymbolInformation>, fallbackPath: string): CviSourceSymbol[] {
  const result: CviSourceSymbol[] = [];
  const visit = (entry: vscode.DocumentSymbol | vscode.SymbolInformation): void => {
    if ('location' in entry) {
      if (FUNCTION_KINDS.has(entry.kind)) {
        result.push({
          name: entry.name,
          signature: entry.name,
          filePath: entry.location.uri.fsPath || fallbackPath,
          line: entry.location.range.start.line,
          character: entry.location.range.start.character,
          kind: entry.kind,
          source: 'document'
        });
      }
      return;
    }
    if (FUNCTION_KINDS.has(entry.kind)) {
      result.push({
        name: entry.name,
        signature: entry.detail ? `${entry.name} ${entry.detail}`.trim() : entry.name,
        filePath: fallbackPath,
        line: entry.selectionRange.start.line,
        character: entry.selectionRange.start.character,
        kind: entry.kind,
        source: 'document'
      });
    }
    entry.children.forEach(visit);
  };
  entries.forEach(visit);
  return result;
}

export function scanCFunctions(source: string, filePath: string): CviSourceSymbol[] {
  const masked = maskCommentsAndStrings(source);
  const pattern = /(^|\n)\s*((?:(?:extern|static|inline|const|volatile|unsigned|signed|long|short|struct|enum|union|__declspec\s*\([^)]*\)|__stdcall|__cdecl|CVIFUNC(?:_C)?|CVICALLBACK|[A-Za-z_]\w*)\s+|\*\s*)+)([A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*(?=;|\{)/gm;
  const result: CviSourceSymbol[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(masked)) !== null) {
    const name = match[3];
    if (['if', 'for', 'while', 'switch', 'return', 'sizeof'].includes(name)) {
      continue;
    }
    const nameOffset = match.index + match[0].lastIndexOf(name);
    const before = source.slice(0, nameOffset);
    const line = before.split('\n').length - 1;
    const lineStart = before.lastIndexOf('\n') + 1;
    const character = nameOffset - lineStart;
    const raw = source.slice(match.index + match[1].length, pattern.lastIndex).trim();
    const signature = raw.replace(/\s+/g, ' ').replace(/\s*\{\s*$/, '').trim();
    result.push({ name, signature, filePath, line, character, kind: vscode.SymbolKind.Function, source: 'fallback' });
  }
  return dedupeSourceSymbols(result);
}

function maskCommentsAndStrings(source: string): string {
  let result = '';
  let state: 'code' | 'line-comment' | 'block-comment' | 'string' | 'char' = 'code';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (state === 'code') {
      if (current === '/' && next === '/') {
        result += '  '; index += 1; state = 'line-comment'; continue;
      }
      if (current === '/' && next === '*') {
        result += '  '; index += 1; state = 'block-comment'; continue;
      }
      if (current === '"') { result += ' '; state = 'string'; escaped = false; continue; }
      if (current === "'") { result += ' '; state = 'char'; escaped = false; continue; }
      result += current;
      continue;
    }
    if (state === 'line-comment') {
      if (current === '\n') { result += '\n'; state = 'code'; } else { result += ' '; }
      continue;
    }
    if (state === 'block-comment') {
      if (current === '*' && next === '/') { result += '  '; index += 1; state = 'code'; }
      else { result += current === '\n' ? '\n' : ' '; }
      continue;
    }
    result += current === '\n' ? '\n' : ' ';
    if (escaped) { escaped = false; continue; }
    if (current === '\\') { escaped = true; continue; }
    if ((state === 'string' && current === '"') || (state === 'char' && current === "'")) { state = 'code'; }
  }
  return result;
}

function dedupeSourceSymbols(symbols: CviSourceSymbol[]): CviSourceSymbol[] {
  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    const key = `${symbol.filePath.toLowerCase()}:${symbol.name.toLowerCase()}:${symbol.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => left.line - right.line || left.name.localeCompare(right.name));
}

function dedupeCompletionSymbols(symbols: CviCompletionSymbol[]): CviCompletionSymbol[] {
  const map = new Map<string, CviCompletionSymbol>();
  for (const symbol of symbols) {
    const key = symbol.name.toLowerCase();
    const current = map.get(key);
    if (!current || (symbol.origin === 'project' && current.origin !== 'project')) {
      map.set(key, symbol);
    }
  }
  return [...map.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function isPathInside(candidate: string, parent: string): boolean {
  const normalizedCandidate = path.resolve(candidate).toLowerCase();
  const normalizedParent = path.resolve(parent).toLowerCase();
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}${path.sep}`);
}

function safeMtime(filePath: string): number {
  try { return fs.statSync(filePath).mtimeMs; } catch { return 0; }
}

export function isSourceOrHeader(filePath: string): boolean {
  return ['.c', '.h', '.cpp', '.hpp', '.cc', '.cxx', '.hh', '.hxx'].includes(path.extname(filePath).toLowerCase());
}
