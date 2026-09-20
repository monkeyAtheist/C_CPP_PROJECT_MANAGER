import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CpmWorkspaceService } from './cpmWorkspaceService';

export interface CpmSourceSymbol {
  name: string;
  qualifiedName?: string;
  signature: string;
  declaration?: string;
  filePath: string;
  line: number;
  character: number;
  kind: vscode.SymbolKind;
  source: 'document' | 'fallback';
}

export interface CpmCompletionSymbol {
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

export class CpmSymbolService {
  private projectCache?: { key: string; symbols: CpmCompletionSymbol[] };

  constructor(
    private readonly extensionPath: string,
    private readonly workspaces: CpmWorkspaceService
  ) {}

  async symbolsForFile(filePath: string): Promise<CpmSourceSymbol[]> {
    if (!isSourceOrHeader(filePath) || !fs.existsSync(filePath)) {
      return [];
    }

    // Keep this provider independent from Microsoft cpptools. Calling
    // vscode.executeDocumentSymbolProvider here can force cpptools to parse the
    // active translation unit while the user is typing, which is what produced
    // long "Loading..." states on small managed C/C++ projects.
    return scanCFunctions(fs.readFileSync(filePath, 'utf8'), filePath);
  }

  completionSymbols(): CpmCompletionSymbol[] {
    // Do not inject bundled API-pack symbols into normal Qt/C++ IntelliSense.
    // The Microsoft Qt/C++ extension remains responsible for standard-library
    // symbols such as FILE, printf, std::vector, etc. This provider only adds
    // lightweight symbols parsed from the active project files.
    return this.projectCompletionSymbols();
  }

  isCpmWorkspaceFile(filePath: string): boolean {
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

  private projectCompletionSymbols(): CpmCompletionSymbol[] {
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

    const symbols: CpmCompletionSymbol[] = [];
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

export class CpmCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly symbols: CpmSymbolService) {}

  provideCompletionItems(document: vscode.TextDocument): vscode.CompletionItem[] | undefined {
    const configuration = vscode.workspace.getConfiguration('cpm');
    const projectEnabled = configuration.get<boolean>('enableSupplementalCompletionProvider', false);
    const standardEnabled = configuration.get<boolean>('enableStandardLibraryCompletionProvider', true);

    if (document.uri.scheme !== 'file' || !this.symbols.isCpmWorkspaceFile(document.uri.fsPath)) {
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
    // has included the matching standard header, Microsoft Qt/C++ IntelliSense
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

function collectPackFunctions(value: unknown, result: CpmCompletionSymbol[]): void {
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

function flattenDocumentSymbols(entries: Array<vscode.DocumentSymbol | vscode.SymbolInformation>, fallbackPath: string): CpmSourceSymbol[] {
  const result: CpmSourceSymbol[] = [];
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

export function scanCFunctions(source: string, filePath: string): CpmSourceSymbol[] {
  const masked = maskCommentsAndStrings(source);
  const functionBodyRanges = [...collectFunctionBodyRanges(masked), ...collectScopedConstructorBodyRanges(masked)];
  const result: CpmSourceSymbol[] = [];
  const controlOrStatementPrefixes = /^(?:return|co_return|throw|emit|case|else|do|goto|break|continue|new|delete|using|typedef|static_assert)\b/;

  const pattern = /(^|\n)\s*((?:(?:extern|static|inline|constexpr|consteval|constinit|virtual|explicit|friend|const|volatile|unsigned|signed|long|short|struct|enum|union|typename|auto|CPMFUNC(?:_C)?|CPMCALLBACK|__stdcall|__cdecl|__fastcall|WINAPI|CALLBACK|APIENTRY|NTAPI|__declspec\s*\([^)]*\)|[A-Za-z_]\w*)\s+|[*&]\s*)+)(((?:[A-Za-z_]\w*::)*)~?[A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*((?:(?:const|override|final)\b\s*|noexcept(?:\s*\([^)]*\))?\s*|[&]{1,2}\s*)*)(?=;|\{|:|=\s*(?:default|delete))/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(masked)) !== null) {
    const prefix = match[2].trim();
    const qualifiedName = match[3].trim();
    const name = qualifiedName.split('::').pop() || qualifiedName;
    if (controlOrStatementPrefixes.test(prefix) || ['if', 'for', 'while', 'switch', 'return', 'sizeof', 'catch'].includes(name)) {
      continue;
    }
    const nameOffset = match.index + match[0].lastIndexOf(qualifiedName);
    if (isOffsetInsideRanges(nameOffset, functionBodyRanges)) {
      continue;
    }
    const before = source.slice(0, nameOffset);
    const line = before.split('\n').length - 1;
    const lineStart = before.lastIndexOf('\n') + 1;
    const character = nameOffset - lineStart;
    const raw = source.slice(match.index + match[1].length, pattern.lastIndex).trim();
    const signature = raw.replace(/\s+/g, ' ').replace(/\s*\{\s*$/, '').trim();
    const owner = qualifiedName.includes('::') ? qualifiedName.slice(0, qualifiedName.lastIndexOf('::')) : '';
    const ownerLeaf = owner ? owner.split('::').pop() || owner : '';
    const kind = owner && (name === ownerLeaf || name === `~${ownerLeaf}`)
      ? vscode.SymbolKind.Constructor
      : owner ? vscode.SymbolKind.Method : vscode.SymbolKind.Function;
    result.push({
      name,
      qualifiedName,
      signature,
      declaration: normalizeSourceSymbolDeclaration(signature),
      filePath,
      line,
      character,
      kind,
      source: 'fallback'
    });
  }

  // Out-of-class constructors and destructors have no return type. Parse
  // their first parameter list with balanced parentheses so initializer-list
  // calls such as QMainWindow(parent) or std::make_unique<T>() cannot become
  // false symbols.
  const ctorStartPattern = /(^|\n)\s*((?:[A-Za-z_]\w*::)+~?[A-Za-z_]\w*)\s*\(/gm;
  while ((match = ctorStartPattern.exec(masked)) !== null) {
    const qualifiedName = match[2].trim();
    const parts = qualifiedName.split('::');
    const name = parts[parts.length - 1] || qualifiedName;
    const ownerLeaf = parts.length > 1 ? parts[parts.length - 2] : '';
    if (name.replace(/^~/, '') !== ownerLeaf) continue;
    const openParen = match.index + match[0].lastIndexOf('(');
    const closeParen = findMatchingCloseParen(masked, openParen);
    if (closeParen < 0) continue;
    const following = masked.slice(closeParen + 1, Math.min(masked.length, closeParen + 800));
    if (!/^\s*(?:(?:noexcept(?:\s*\([^)]*\))?|override|final)\s*)*(?:;|\{|:|=\s*(?:default|delete))/.test(following)) continue;
    const nameOffset = match.index + match[0].indexOf(qualifiedName);
    if (isOffsetInsideRanges(nameOffset, functionBodyRanges)) continue;
    const before = source.slice(0, nameOffset);
    const line = before.split('\n').length - 1;
    const lineStart = before.lastIndexOf('\n') + 1;
    const character = nameOffset - lineStart;
    const declarationStart = match.index + match[1].length;
    const raw = source.slice(declarationStart, closeParen + 1).trim();
    const signature = raw.replace(/\s+/g, ' ').trim();
    result.push({
      name,
      qualifiedName,
      signature,
      declaration: normalizeSourceSymbolDeclaration(signature),
      filePath,
      line,
      character,
      kind: vscode.SymbolKind.Constructor,
      source: 'fallback'
    });
  }

  return dedupeSourceSymbols(result);
}

interface SourceOffsetRange {
  start: number;
  end: number;
}

function collectFunctionBodyRanges(masked: string): SourceOffsetRange[] {
  const ranges: SourceOffsetRange[] = [];
  const controlNames = new Set(['if', 'for', 'while', 'switch', 'catch']);
  for (let brace = 0; brace < masked.length; brace += 1) {
    if (masked[brace] !== '{') continue;
    const contextStart = Math.max(
      masked.lastIndexOf(';', brace - 1),
      masked.lastIndexOf('{', brace - 1),
      masked.lastIndexOf('}', brace - 1)
    ) + 1;
    const context = masked.slice(contextStart, brace);
    const closeParenInContext = context.lastIndexOf(')');
    if (closeParenInContext < 0) continue;
    const closeParen = contextStart + closeParenInContext;
    const openParen = findMatchingOpenParen(masked, closeParen);
    if (openParen < 0) continue;
    const beforeParen = masked.slice(contextStart, openParen).trimEnd();
    const nameMatch = /((?:[A-Za-z_]\w*::)*~?[A-Za-z_]\w*)\s*$/.exec(beforeParen);
    if (!nameMatch) continue;
    const leaf = (nameMatch[1].split('::').pop() || nameMatch[1]).replace(/^~/, '');
    if (controlNames.has(leaf)) continue;
    const closingBrace = findMatchingBrace(masked, brace);
    if (closingBrace > brace) {
      ranges.push({ start: brace + 1, end: closingBrace });
    }
  }
  return ranges.sort((a, b) => a.start - b.start || a.end - b.end);
}

function collectScopedConstructorBodyRanges(masked: string): SourceOffsetRange[] {
  const ranges: SourceOffsetRange[] = [];
  const pattern = /(^|\n)\s*((?:[A-Za-z_]\w*::)+~?[A-Za-z_]\w*)\s*\(/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(masked)) !== null) {
    const qualifiedName = match[2];
    const parts = qualifiedName.split('::');
    const name = parts[parts.length - 1] || '';
    const ownerLeaf = parts.length > 1 ? parts[parts.length - 2] : '';
    if (name.replace(/^~/, '') !== ownerLeaf) continue;
    const openParen = match.index + match[0].lastIndexOf('(');
    const closeParen = findMatchingCloseParen(masked, openParen);
    if (closeParen < 0) continue;
    const bodyBrace = findDefinitionBodyBrace(masked, closeParen + 1);
    if (bodyBrace < 0) continue;
    const closingBrace = findMatchingBrace(masked, bodyBrace);
    if (closingBrace > bodyBrace) ranges.push({ start: bodyBrace + 1, end: closingBrace });
  }
  return ranges;
}

function findDefinitionBodyBrace(text: string, startIndex: number): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let index = startIndex; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '[') bracketDepth += 1;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (parenDepth === 0 && bracketDepth === 0 && ch === ';') return -1;
    else if (parenDepth === 0 && bracketDepth === 0 && ch === '{') return index;
  }
  return -1;
}

function findMatchingCloseParen(text: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findMatchingOpenParen(text: string, closeIndex: number): number {
  let depth = 0;
  for (let index = closeIndex; index >= 0; index -= 1) {
    if (text[index] === ')') depth += 1;
    else if (text[index] === '(') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function isOffsetInsideRanges(offset: number, ranges: SourceOffsetRange[]): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

export function normalizeSourceSymbolDeclaration(signature: string): string {
  const compact = String(signature || '').replace(/\s+/g, ' ').trim().replace(/\s*\{\s*$/, '').trim();
  if (!compact) return '';
  return compact.endsWith(';') ? compact : `${compact};`;
}

export function formatSourceSymbolList(symbols: CpmSourceSymbol[], filePath: string, format: 'text' | 'markdown' | 'json' = 'text'): string {
  const ordered = [...symbols].sort((a, b) => a.line - b.line || a.name.localeCompare(b.name));
  if (format === 'json') {
    return JSON.stringify({
      file: filePath,
      symbols: ordered.map((symbol) => ({
        name: symbol.name,
        qualifiedName: symbol.qualifiedName || symbol.name,
        line: symbol.line + 1,
        kind: vscode.SymbolKind[symbol.kind] || 'Function',
        signature: symbol.signature,
        declaration: symbol.declaration || normalizeSourceSymbolDeclaration(symbol.signature)
      }))
    }, null, 2) + '\n';
  }
  if (format === 'markdown') {
    const lines = [`# C/C++ File Symbols — ${path.basename(filePath)}`, '', `Source: \`${filePath}\``, '', '| Line | Symbol | Declaration |', '| ---: | --- | --- |'];
    for (const symbol of ordered) {
      const declaration = (symbol.declaration || normalizeSourceSymbolDeclaration(symbol.signature)).replace(/\|/g, '\\|');
      lines.push(`| ${symbol.line + 1} | \`${symbol.qualifiedName || symbol.name}\` | \`${declaration.replace(/`/g, '\\`')}\` |`);
    }
    lines.push('');
    return lines.join('\n');
  }
  return ordered.map((symbol) => `L${symbol.line + 1}\t${symbol.qualifiedName || symbol.name}\t${symbol.declaration || normalizeSourceSymbolDeclaration(symbol.signature)}`).join('\n') + (ordered.length ? '\n' : '');
}

export function buildHeaderFromSourceSymbols(symbols: CpmSourceSymbol[], sourceFilePath: string): string {
  const isC = path.extname(sourceFilePath).toLowerCase() === '.c';
  const ordered = [...symbols].sort((a, b) => a.line - b.line || a.name.localeCompare(b.name));
  const publicDeclarations: string[] = [];
  const internalDeclarations: string[] = [];
  const memberDeclarations: string[] = [];
  const seen = new Set<string>();

  for (const symbol of ordered) {
    const declaration = symbol.declaration || normalizeSourceSymbolDeclaration(symbol.signature);
    if (!declaration || seen.has(declaration)) continue;
    seen.add(declaration);
    const qualified = symbol.qualifiedName || symbol.name;
    if (qualified.includes('::')) {
      memberDeclarations.push(declaration);
    } else if (/^static\b/.test(declaration)) {
      internalDeclarations.push(declaration);
    } else {
      publicDeclarations.push(declaration);
    }
  }

  const lines: string[] = [
    '#pragma once',
    '',
    `// Generated by C/C++ Project Manager from ${path.basename(sourceFilePath)}.`,
    '// Review generated declarations before using this header as a public API.',
    ''
  ];
  if (isC && publicDeclarations.length) {
    lines.push('#ifdef __cplusplus', 'extern "C" {', '#endif', '');
  }
  if (publicDeclarations.length) {
    lines.push('// Free/public function declarations', ...publicDeclarations, '');
  }
  if (isC && publicDeclarations.length) {
    lines.push('#ifdef __cplusplus', '}', '#endif', '');
  }
  if (internalDeclarations.length) {
    lines.push('// Internal source-file functions are intentionally not declared as active header API:', ...internalDeclarations.map((line) => `// ${line}`), '');
  }
  if (memberDeclarations.length) {
    lines.push('// Scoped member definitions must be copied into their owning class declaration:', ...memberDeclarations.map((line) => `// ${line}`), '');
  }
  if (!publicDeclarations.length && !internalDeclarations.length && !memberDeclarations.length) {
    lines.push('// No function declarations were detected.', '');
  }
  return lines.join('\n');
}

export function buildSourceFromSourceSymbols(symbols: CpmSourceSymbol[], sourceFilePath: string): string {
  const sourceExt = path.extname(sourceFilePath).toLowerCase();
  const isC = sourceExt === '.c';
  const ordered = [...symbols].sort((a, b) => a.line - b.line || a.name.localeCompare(b.name));
  const seen = new Set<string>();
  const definitions: string[] = [];
  let needsAbort = false;

  for (const symbol of ordered) {
    const declaration = symbol.declaration || normalizeSourceSymbolDeclaration(symbol.signature);
    if (!declaration) continue;
    const definitionSignature = sourceDefinitionSignature(declaration, symbol);
    if (!definitionSignature || seen.has(definitionSignature)) continue;
    seen.add(definitionSignature);

    const bodyKind = sourceDefinitionBodyKind(definitionSignature, symbol);
    const body: string[] = ['{', '    // TODO: implement generated stub.'];
    if (bodyKind === 'abort') {
      needsAbort = true;
      body.push(isC ? '    abort();' : '    std::abort();');
    }
    body.push('}');
    definitions.push(`${definitionSignature}\n${body.join('\n')}`);
  }

  const lines: string[] = [
    `// Generated by C/C++ Project Manager from File Symbols in ${path.basename(sourceFilePath)}.`,
    '// Review generated stubs before adding them to a build.',
    ''
  ];

  const includes = sourceGeneratorIncludes(sourceFilePath);
  if (needsAbort) {
    const abortInclude = isC ? '#include <stdlib.h>' : '#include <cstdlib>';
    if (!includes.includes(abortInclude)) includes.push(abortInclude);
  }
  if (includes.length) {
    lines.push(...includes, '');
  }

  if (definitions.length) {
    lines.push(...definitions.flatMap((definition, index) => index === 0 ? [definition] : ['', definition]), '');
  } else {
    lines.push('// No function/method symbols were available for source generation.', '');
  }

  if (['.h', '.hh', '.hpp', '.hxx'].includes(sourceExt)) {
    lines.splice(2, 0, '// Note: class ownership may need review for unqualified declarations parsed from headers.');
  }
  return lines.join('\n');
}

function sourceGeneratorIncludes(sourceFilePath: string): string[] {
  const ext = path.extname(sourceFilePath).toLowerCase();
  const headerExtensions = new Set(['.h', '.hh', '.hpp', '.hxx']);
  if (headerExtensions.has(ext)) {
    return [`#include "${path.basename(sourceFilePath)}"`];
  }
  try {
    const source = fs.readFileSync(sourceFilePath, 'utf8');
    const includes: string[] = source.match(/^\s*#\s*include\s*[<"][^>"\r\n]+[>"]\s*$/gm) || [];
    return [...new Set<string>(includes.map((line: string) => line.trim()))];
  } catch {
    return [];
  }
}

function sourceDefinitionSignature(declaration: string, symbol: CpmSourceSymbol): string {
  let signature = String(declaration || '').trim().replace(/;\s*$/, '').trim();
  if (!signature) return '';

  // Specifiers that are valid on a class declaration but not on an out-of-class definition.
  signature = signature.replace(/^(?:(?:virtual|explicit|friend)\s+)+/, '');
  if ((symbol.qualifiedName || symbol.name).includes('::')) {
    signature = signature.replace(/^static\s+/, '');
  }

  const qualifiedName = symbol.qualifiedName || symbol.name;
  const nameIndex = signature.lastIndexOf(qualifiedName);
  if (nameIndex < 0) return signature.replace(/\s+(?:override|final)(?=\s|$)/g, '').trim();
  const openParen = signature.indexOf('(', nameIndex + qualifiedName.length);
  if (openParen < 0) return signature.replace(/\s+(?:override|final)(?=\s|$)/g, '').trim();
  const closeParen = findMatchingCloseParen(signature, openParen);
  if (closeParen < 0) return signature.replace(/\s+(?:override|final)(?=\s|$)/g, '').trim();

  const parameters = signature.slice(openParen + 1, closeParen);
  const withoutDefaults = stripParameterDefaultArguments(parameters);
  const suffix = signature.slice(closeParen + 1).replace(/\b(?:override|final)\b/g, '').replace(/\s+/g, ' ').trim();
  const prefix = signature.slice(0, openParen + 1);
  return `${prefix}${withoutDefaults})${suffix ? ` ${suffix}` : ''}`.replace(/\s+$/g, '').trim();
}

function stripParameterDefaultArguments(parameters: string): string {
  const result: string[] = [];
  let current = '';
  let skippingDefault = false;
  let paren = 0, bracket = 0, brace = 0, angle = 0;
  let quote: string | undefined;
  let escaped = false;
  const flush = () => {
    result.push(current.trim());
    current = '';
    skippingDefault = false;
  };
  for (let index = 0; index < parameters.length; index += 1) {
    const ch = parameters[index];
    if (quote) {
      if (!skippingDefault) current += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; if (!skippingDefault) current += ch; continue; }
    if (ch === '(') paren += 1;
    else if (ch === ')') paren = Math.max(0, paren - 1);
    else if (ch === '[') bracket += 1;
    else if (ch === ']') bracket = Math.max(0, bracket - 1);
    else if (ch === '{') brace += 1;
    else if (ch === '}') brace = Math.max(0, brace - 1);
    else if (ch === '<') angle += 1;
    else if (ch === '>' && angle > 0) angle -= 1;

    const topLevel = paren === 0 && bracket === 0 && brace === 0 && angle === 0;
    if (topLevel && ch === '=' && !skippingDefault) { skippingDefault = true; continue; }
    if (topLevel && ch === ',') { flush(); continue; }
    if (!skippingDefault) current += ch;
  }
  if (current.trim() || parameters.trim()) flush();
  return result.join(', ');
}

function sourceDefinitionBodyKind(signature: string, symbol: CpmSourceSymbol): 'empty' | 'abort' {
  const qualifiedName = symbol.qualifiedName || symbol.name;
  const leaf = symbol.name.replace(/^~/, '');
  const ownerLeaf = qualifiedName.includes('::')
    ? qualifiedName.slice(0, qualifiedName.lastIndexOf('::')).split('::').pop() || ''
    : '';
  if (symbol.kind === vscode.SymbolKind.Constructor || leaf === ownerLeaf || symbol.name.startsWith('~')) return 'empty';

  const nameIndex = signature.lastIndexOf(qualifiedName);
  if (nameIndex < 0) return 'abort';
  const prefix = signature.slice(0, nameIndex).trim();
  if (/(?:^|\s)void$/.test(prefix)) return 'empty';
  return 'abort';
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

function dedupeSourceSymbols(symbols: CpmSourceSymbol[]): CpmSourceSymbol[] {
  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    const key = `${symbol.filePath.toLowerCase()}:${symbol.name.toLowerCase()}:${symbol.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => left.line - right.line || left.name.localeCompare(right.name));
}

function dedupeCompletionSymbols(symbols: CpmCompletionSymbol[]): CpmCompletionSymbol[] {
  const map = new Map<string, CpmCompletionSymbol>();
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
