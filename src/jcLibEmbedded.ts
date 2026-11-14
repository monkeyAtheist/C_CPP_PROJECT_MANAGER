// @ts-nocheck --

// @ts-nocheck --

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { hardenHtml } from './views/webviewKit';

type NodeKind = 'environment' | 'library' | 'category' | 'group' | 'function';
type ParamEditorType = 'text' | 'boolean' | 'enum' | 'pathFile' | 'pathFolder' | 'handle';

type ChoiceInput = string | ChoiceSpec;

interface ChoiceSpec {
  value: string;
  description?: string;
  detail?: string;
}

interface StructuredPickerItem {
  value: string;
  label?: string;
  description?: string;
  detail?: string;
  defaultValue?: string;
  sourceTypes?: string[];
  /** Contextual data type expected by a CPM Set*Attribute value argument. */
  valueKind?: string;
  /** Suggested values shown after an attribute constant has been selected. */
  valueOptions?: StructuredPickerItem[];
  /** Editable placeholder for a CPM Set*Attribute value argument. */
  valuePlaceholder?: string;
}

interface StructuredPickerGroup {
  label?: string;
  description?: string;
  items?: StructuredPickerItem[];
}

interface StructuredPickerSection {
  label?: string;
  description?: string;
  groups?: StructuredPickerGroup[];
  items?: StructuredPickerItem[];
}

interface StructuredPickerConfig {
  title?: string;
  selectionLabel?: string;
  subtitle?: string;
  sourceTypes?: string[];
  sections?: StructuredPickerSection[];
  targetIndex?: number;
  defaultTargetIndex?: number;
  applyDefaultIfEmpty?: boolean;
  /** Allow the advanced picker to combine several constants into one bitmask expression. */
  multiSelect?: boolean;
  /** Separator used when several picker constants are combined. Defaults to the C/C++ bitwise OR operator. */
  valueSeparator?: string;
  /** Value inserted when a multi-selection is empty, for example 0 or BLUETOOTH_GATT_FLAG_NONE. */
  emptyValue?: string;
  /** Allow Apply with zero selected items. Defaults to false unless explicitly enabled by the pack. */
  allowEmptySelection?: boolean;
}

interface CpmParameter {
  name: string;
  type: string;
  description?: string;
  editorType?: ParamEditorType;
  defaultValue?: string;
  placeholder?: string;
  presets?: ChoiceInput[];
  options?: ChoiceInput[];
  presetDescriptions?: Record<string, string>;
  presetDetails?: Record<string, string>;
  optionDescriptions?: Record<string, string>;
  optionDetails?: Record<string, string>;
  /** Optional value-to-template mapping used when one UI choice expands to syntax fragments. */
  insertValueMap?: Record<string, string>;
  pickerConfig?: StructuredPickerConfig;
}

interface CpmStructField {
  name: string;
  type: string;
  description?: string;
  declaration?: string;
  access?: 'public' | 'private' | 'protected';
}

interface CpmEnumValue {
  name: string;
  value?: string;
  description?: string;
}

interface CppMethod {
  name: string;
  returnType?: string;
  signature: string;
  declaration?: string;
  description?: string;
  access?: 'public' | 'private' | 'protected';
  qualifiers?: string[];
  paramsText?: string;
  methodKind?: 'method' | 'constructor' | 'destructor' | 'operator';
}

interface CpmFunction {
  name: string;
  returnType: string;
  signature: string;
  insertText: string;
  header?: string;
  environment?: string;
  library: string;
  category: string;
  description?: string;
  longDescription?: string;
  returnDescription?: string;
  notes?: string[];
  warnings?: string[];
  parameters?: CpmParameter[];
  fields?: CpmStructField[];
  enumValues?: CpmEnumValue[];
  methods?: CppMethod[];
  symbolKind?: SymbolKind;
  declaration?: string;
  isStatic?: boolean;
}

interface CpmGroup {
  name: string;
  description?: string;
  functions?: CpmFunction[];
  groups?: CpmGroup[];
}

interface CpmCategory {
  name: string;
  functions: CpmFunction[];
  groups?: CpmGroup[];
}

interface CpmLibrary {
  name: string;
  categories: CpmCategory[];
}

interface CpmEnvironment {
  name: string;
  libraries: CpmLibrary[];
}

interface CpmDatabase {
  environments: CpmEnvironment[];
  libraries: CpmLibrary[];
}

interface LibraryPackFile {
  id?: string;
  name?: string;
  language?: string;
  version?: string;
  readOnly?: boolean;
  environments: CpmEnvironment[];
  libraries?: CpmLibrary[];
}

type PackSource = 'workspace' | 'global';

interface LoadedPack {
  id: string;
  name: string;
  language?: string;
  version?: string;
  readOnly?: boolean;
  environments: CpmEnvironment[];
  libraries: CpmLibrary[];
  filePath: string;
  source: PackSource;
  writable: boolean;
}

interface ExtensionData {
  db: CpmDatabase;
  packs: LoadedPack[];
}


interface StoredFunctionState {
  values: string[];
  returnTarget: string;
}

interface WebviewMessage {
  type: 'insertCall' | 'copyCall' | 'pickValue' | 'persistState';
  text?: string;
  index?: number;
  editorType?: ParamEditorType;
  currentValue?: string;
  values?: string[];
  state?: StoredFunctionState;
}

interface PackEditorMessage {
  type: 'savePack' | 'openJson' | 'showInput' | 'showConfirm' | 'showPick' | 'runPackTool';
  pack?: LibraryPackFile;
  operation?: string;
  title?: string;
  prompt?: string;
  value?: string;
  placeHolder?: string;
  message?: string;
  confirmLabel?: string;
  payload?: any;
}


interface PickItemSpec {
  label: string;
  description?: string;
  detail?: string;
  value: string;
}

interface FunctionSearchEntry {
  fn: CpmFunction;
  environment?: string;
  library: string;
  category: string;
}

interface FunctionQuickPickItem extends vscode.QuickPickItem {
  fn: CpmFunction;
  entry: FunctionSearchEntry;
}

interface ResolvedParameter extends Omit<CpmParameter, 'presets' | 'options'> {
  index: number;
  editorType: ParamEditorType;
  defaultValue: string;
  placeholder: string;
  presets: ChoiceSpec[];
  options: ChoiceSpec[];
}


type ImportedSymbolKind = 'function' | 'struct' | 'typedef' | 'enum' | 'enum_class' | 'class';
type SymbolKind = ImportedSymbolKind | 'keyword' | 'snippet' | 'table' | 'property' | 'variable' | 'reference' | 'method' | 'operator' | 'constant' | 'metamethod' | 'pitfall' | 'macro' | 'command' | 'concept' | 'attribute';

interface ParsedDocInfo {
  brief?: string;
  description?: string;
  longDescription?: string;
  returnDescription?: string;
  paramDescriptions?: Record<string, string>;
  notes?: string[];
  warnings?: string[];
}

interface ParsedImportedSymbol {
  kind: ImportedSymbolKind;
  name: string;
  declaration: string;
  returnType?: string;
  parameters?: CpmParameter[];
  description?: string;
  longDescription?: string;
  returnDescription?: string;
  notes?: string[];
  warnings?: string[];
  fields?: CpmStructField[];
  enumValues?: CpmEnumValue[];
  methods?: CppMethod[];
  isStatic?: boolean;
}

const SYMBOL_CATEGORY_LABELS: Record<ImportedSymbolKind, string> = {
  function: 'Functions',
  struct: 'Structs',
  typedef: 'Typedefs',
  enum: 'Enums',
  enum_class: 'Enum Classes',
  class: 'Classes'
};

const CUSTOM_ICON_SVGS = {
  environment: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="#E3A93B" d="M1.5 4.25A1.75 1.75 0 0 1 3.25 2.5h3.05l1.15 1.35h5.3A1.75 1.75 0 0 1 14.5 5.6v5.15a2 2 0 0 1-2 2H3.5a2 2 0 0 1-2-2z"/><path fill="#F6C45A" d="M1.5 5.35h13v.55a2 2 0 0 1-2 2H3.5a2 2 0 0 1-2-2z" opacity=".6"/><circle cx="11.7" cy="10.1" r="2.35" fill="#FFF4D8"/><path fill="#D98B00" d="M11.7 8.35l.55 1.2 1.3.12-.98.86.28 1.26-1.15-.66-1.16.66.28-1.26-.98-.86 1.3-.12z"/></svg>`,
  library: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="3" width="5.2" height="8.5" rx="1" fill="#56C85D"/><rect x="5.2" y="2.1" width="5.2" height="8.8" rx="1" fill="#8D65FF"/><rect x="8.4" y="4.1" width="5.2" height="8.2" rx="1" fill="#39B8F2"/><path d="M2.8 10.9h9.9" stroke="#D8E6FF" stroke-width="1" stroke-linecap="round" opacity=".85"/><path d="M6.1 10.2h7" stroke="#D8E6FF" stroke-width="1" stroke-linecap="round" opacity=".75"/></svg>`,
  category: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="#2F8DFF" d="M1.5 4.25A1.75 1.75 0 0 1 3.25 2.5h3.05l1.15 1.35h5.3A1.75 1.75 0 0 1 14.5 5.6v5.15a2 2 0 0 1-2 2H3.5a2 2 0 0 1-2-2z"/><path fill="#7CC8FF" d="M1.5 5.35h13v.55a2 2 0 0 1-2 2H3.5a2 2 0 0 1-2-2z" opacity=".7"/><path d="M5.1 8.25h5.8M5.1 10.35h3.9" stroke="#EAF6FF" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  group: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="#A96CFF" d="M1.5 4.25A1.75 1.75 0 0 1 3.25 2.5h3.05l1.15 1.35h5.3A1.75 1.75 0 0 1 14.5 5.6v5.15a2 2 0 0 1-2 2H3.5a2 2 0 0 1-2-2z"/><path fill="#D2B1FF" d="M1.5 5.35h13v.55a2 2 0 0 1-2 2H3.5a2 2 0 0 1-2-2z" opacity=".72"/><path d="M5 8.25h6M5 10.35h4.2" stroke="#F7F1FF" stroke-width="1.1" stroke-linecap="round"/></svg>`
} as const;

let customTreeIcons: Record<'environment' | 'library' | 'category' | 'group', { light: vscode.Uri; dark: vscode.Uri }> | undefined;

function svgToDataUri(svg: string): string {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg).replace(/%0A/g, '').replace(/%20/g, ' ');
}

function ensureCustomTreeIcons(context: vscode.ExtensionContext): void {
  customTreeIcons = {
    environment: { light: vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-environment.svg'), dark: vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-environment.svg') },
    library: { light: vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-library.svg'), dark: vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-library.svg') },
    category: { light: vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-category.svg'), dark: vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-category.svg') },
    group: { light: vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-group.svg'), dark: vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-group.svg') }
  };
}

function getCustomTreeIcon(kind: 'environment' | 'library' | 'category' | 'group'): { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon {
  return customTreeIcons?.[kind] ?? new vscode.ThemeIcon(kind === 'library' ? 'library' : 'folder');
}

const DEFAULT_ENVIRONMENT_NAME = 'General';

function getImportedCategoryName(symbol: ParsedImportedSymbol): string {
  if (symbol.kind === 'function' && symbol.isStatic) return 'Static Functions';
  return SYMBOL_CATEGORY_LABELS[symbol.kind];
}

function cleanDocLine(line: string): string {
  return line
    .replace(/^\s*\/\/\/\/?\s?/, '')
    .replace(/^\s*\*+\s?/, '')
    .trim();
}

function normalizeDocText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function pushDocEntry(list: string[], text: string): void {
  const normalized = normalizeDocText(text);
  if (normalized) list.push(normalized);
}

function isSeparatorCommentBlock(raw: string | undefined): boolean {
  if (!raw) return true;
  const body = raw
    .replace(/^\s*\/\*+!?/, '')
    .replace(/^\s*\/\/\/?/gm, '')
    .replace(/\*\/\s*$/, '');
  const lines = body.split(/\r?\n/).map(cleanDocLine).filter(Boolean);
  if (!lines.length) return true;
  const joined = lines.join(' ').trim();
  if (!joined) return true;
  if (!/[A-Za-z0-9]/.test(joined)) return true;
  if (lines.every((line) => /^[=\-_*\/#~`:+|.]+$/.test(line))) return true;
  return false;
}

function parseDoxygenBlock(raw: string | undefined): ParsedDocInfo {
  if (!raw) return {};
  const body = raw
    .replace(/^\s*\/\*\*?!?/, '')
    .replace(/^\s*\/\/\/?/gm, '')
    .replace(/\*\/\s*$/, '');

  const lines = body.split(/\r?\n/).map(cleanDocLine);
  const paramDescriptions: Record<string, string> = {};
  const notes: string[] = [];
  const warnings: string[] = [];
  const detailParts: string[] = [];
  const returnParts: string[] = [];
  let brief = '';
  let current: { kind: 'brief' | 'description' | 'details' | 'return' | 'param' | 'note' | 'warning'; name?: string } | undefined;

  const append = (text: string) => {
    const normalized = normalizeDocText(text);
    if (!normalized) return;
    if (!current) {
      detailParts.push(normalized);
      return;
    }
    switch (current.kind) {
      case 'brief':
        brief = [brief, normalized].filter(Boolean).join(' ').trim();
        break;
      case 'description':
      case 'details':
        detailParts.push(normalized);
        break;
      case 'return':
        returnParts.push(normalized);
        break;
      case 'param':
        if (current.name) {
          paramDescriptions[current.name] = [paramDescriptions[current.name] || '', normalized].filter(Boolean).join(' ').trim();
        }
        break;
      case 'note':
        pushDocEntry(notes, normalized);
        break;
      case 'warning':
        pushDocEntry(warnings, normalized);
        break;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^\*+$/.test(line)) continue;
    let match: RegExpMatchArray | null = null;

    if ((match = line.match(/^@(brief|short)\s+(.*)$/i))) {
      current = { kind: 'brief' };
      append(match[2]);
      continue;
    }
    if ((match = line.match(/^@(details|remark|remarks)\s*(.*)$/i))) {
      current = { kind: 'details' };
      append(match[2]);
      continue;
    }
    if ((match = line.match(/^@param(?:\[[^\]]+\])?\s+([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/i))) {
      current = { kind: 'param', name: match[1] };
      append(match[2]);
      continue;
    }
    if ((match = line.match(/^@(returns?|retval)\s+(.*)$/i))) {
      current = { kind: 'return' };
      append(match[2]);
      continue;
    }
    if ((match = line.match(/^@note\s*(.*)$/i))) {
      current = { kind: 'note' };
      append(match[1]);
      continue;
    }
    if ((match = line.match(/^@warning\s*(.*)$/i))) {
      current = { kind: 'warning' };
      append(match[1]);
      continue;
    }
    if ((match = line.match(/^@(see|since|author|authors|version|throws?|exception|tparam|sa)\s+(.*)$/i))) {
      current = { kind: 'details' };
      append(match[0]);
      continue;
    }
    if (/^@/.test(line)) {
      current = undefined;
      continue;
    }

    if (!current) current = brief ? { kind: 'details' } : { kind: 'description' };
    append(line);
  }

  const description = normalizeDocText(brief || detailParts[0] || '');
  const longDescriptionSource = brief ? detailParts.join(' ') : detailParts.slice(1).join(' ');
  const longDescription = normalizeDocText(longDescriptionSource);
  const returnDescription = normalizeDocText(returnParts.join(' '));

  return {
    brief: brief || undefined,
    description: description || undefined,
    longDescription: longDescription || undefined,
    returnDescription: returnDescription || undefined,
    paramDescriptions,
    notes: notes.length ? notes : undefined,
    warnings: warnings.length ? warnings : undefined
  };
}

function findNearestDocBlock(sourceText: string, index: number): string | undefined {
  const before = sourceText.slice(0, index);
  const candidates: Array<{ end: number; text: string }> = [];

  const isAdjacent = (end: number) => /^[\s;]*$/.test(before.slice(end));

  const blockRegex = /\/\*\*?[\s\S]*?\*\//g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(before)) !== null) {
    const end = match.index + match[0].length;
    if (isAdjacent(end) && !isSeparatorCommentBlock(match[0])) candidates.push({ end, text: match[0] });
  }

  const lineRegex = /(?:^|\n)\s*\/\/\/.*(?:\n\s*\/\/\/.*)*/g;
  while ((match = lineRegex.exec(before)) !== null) {
    const raw = match[0].replace(/^\n/, '');
    const end = match.index + match[0].length;
    if (isAdjacent(end) && !isSeparatorCommentBlock(raw)) candidates.push({ end, text: raw });
  }

  if (!candidates.length) return undefined;
  candidates.sort((a, b) => a.end - b.end);
  return candidates[candidates.length - 1].text;
}

function makeImportedEntry(symbol: ParsedImportedSymbol, libraryName: string, headerHint?: string): CpmFunction {
  const category = getImportedCategoryName(symbol);
  const parameters = Array.isArray(symbol.parameters) ? symbol.parameters.map((param) => ({ ...param })) : undefined;
  const fields = Array.isArray(symbol.fields) ? symbol.fields.map((field) => ({ ...field })) : undefined;
  const enumValues = Array.isArray(symbol.enumValues) ? symbol.enumValues.map((value) => ({ ...value })) : undefined;
  const methods = Array.isArray(symbol.methods) ? symbol.methods.map((method) => ({ ...method, qualifiers: Array.isArray(method.qualifiers) ? [...method.qualifiers] : undefined })) : undefined;
  const signature = symbol.declaration.trim().endsWith(';') ? symbol.declaration.trim() : `${symbol.declaration.trim()};`;
  let insertText = symbol.name;
  if (symbol.kind === 'function') {
    insertText = buildFunctionInsertText(symbol.name, parameters || []);
  } else if (symbol.kind === 'struct' || symbol.kind === 'class' || symbol.kind === 'enum' || symbol.kind === 'enum_class' || symbol.kind === 'typedef') {
    insertText = signature;
  }
  return {
    name: symbol.name,
    returnType: symbol.kind === 'function' ? (symbol.returnType || 'void') : symbol.kind.replace(/_/g, ' '),
    signature,
    insertText,
    header: headerHint || undefined,
    library: libraryName,
    category,
    description: symbol.description,
    longDescription: symbol.longDescription,
    returnDescription: symbol.returnDescription,
    notes: symbol.notes,
    warnings: symbol.warnings,
    parameters,
    fields,
    enumValues,
    methods,
    symbolKind: symbol.kind,
    declaration: signature,
    isStatic: symbol.isStatic
  };
}


function replaceRangeWithSpaces(source: string, start: number, end: number): string {
  if (start < 0 || end <= start || start >= source.length) return source;
  const safeEnd = Math.min(end, source.length);
  return source.slice(0, start) + ' '.repeat(safeEnd - start) + source.slice(safeEnd);
}

function buildTopLevelScanText(sourceText: string): string {
  let masked = sourceText;
  const patterns: RegExp[] = [
    /enum\s+class\s+[A-Za-z_][A-Za-z0-9_]*\s*\{[\s\S]*?\}\s*;/g,
    /class\s+[A-Za-z_][A-Za-z0-9_]*[^;{]*\{[\s\S]*?\}\s*;/g,
    /(?:typedef\s+)?struct\s+[A-Za-z_][A-Za-z0-9_]*?\s*\{[\s\S]*?\}\s*[A-Za-z_][A-Za-z0-9_]*?\s*;/g,
    /(?:typedef\s+)?struct\s+[A-Za-z_][A-Za-z0-9_]*\s*\{[\s\S]*?\}\s*;/g,
    /(?:typedef\s+)?enum\s+[A-Za-z_][A-Za-z0-9_]*?\s*\{[\s\S]*?\}\s*[A-Za-z_][A-Za-z0-9_]*?\s*;/g,
    /(?:typedef\s+)?enum\s+[A-Za-z_][A-Za-z0-9_]*\s*\{[\s\S]*?\}\s*;/g,
    /(?:typedef\s+)?union\s+[A-Za-z_][A-Za-z0-9_]*?\s*\{[\s\S]*?\}\s*[A-Za-z_][A-Za-z0-9_]*?\s*;/g,
    /(?:typedef\s+)?union\s+[A-Za-z_][A-Za-z0-9_]*\s*\{[\s\S]*?\}\s*;/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sourceText)) !== null) {
      masked = replaceRangeWithSpaces(masked, match.index, match.index + match[0].length);
    }
  }
  return masked;
}

function computeBraceDepths(text: string): number[] {
  const depths: number[] = new Array(text.length).fill(0);
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    depths[i] = depth;
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
  }
  return depths;
}

function parseImportedFunctionCandidates(sourceText: string, headerHint?: string): ParsedImportedSymbol[] {
  const results: ParsedImportedSymbol[] = [];
  const maskedComments = maskCommentsPreserveLength(sourceText);
  const scanText = buildTopLevelScanText(maskedComments);
  const braceDepths = computeBraceDepths(scanText);
  const seen = new Set<string>();
  const pointerPattern = /([A-Za-z_][\w\s:*&<>\[\],\t\r\n]*?)\(\s*\*\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*\(([^;{}]*)\)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = pointerPattern.exec(scanText)) !== null) {
    if (braceDepths[Math.max(0, match.index)] !== 0) continue;
    const rawMatch = sourceText.slice(match.index, match.index + match[0].length);
    const staticInfo = normalizeStaticQualifier(match[1]);
    const returnType = staticInfo.text;
    const name = match[2];
    const paramsText = normalizePrototypeWhitespace(match[3]);
    const key = `fp:${name}:${paramsText}:${staticInfo.isStatic ? 'static' : 'normal'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const doc = parseDoxygenBlock(findNearestDocBlock(sourceText, match.index));
    const parameters = paramsText && paramsText !== 'void' ? splitTopLevel(paramsText).map((part, index) => parsePrototypeParameter(part, index)).filter(Boolean) : [];
    for (const param of parameters) {
      if (doc.paramDescriptions && doc.paramDescriptions[param.name]) param.description = doc.paramDescriptions[param.name];
    }
    results.push({
      kind: 'function',
      name,
      declaration: `${normalizePrototypeWhitespace(rawMatch)}`,
      returnType: (returnType ? `${returnType} (*)` : 'void (*)').trim(),
      parameters,
      description: doc.brief || doc.description || 'Imported function pointer declaration.',
      longDescription: doc.longDescription || doc.description,
      returnDescription: doc.returnDescription,
      notes: doc.notes,
      warnings: doc.warnings,
      isStatic: staticInfo.isStatic
    });
  }

  const funcPattern = /([A-Za-z_~][\w\s:*&<>\[\],\t\r\n]*?)\b([A-Za-z_~][A-Za-z0-9_:~]*)\s*\(([^{};]*)\)\s*(;|\{)/g;
  const blockedNames = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof']);
  while ((match = funcPattern.exec(scanText)) !== null) {
    if (braceDepths[Math.max(0, match.index)] !== 0) continue;
    const rawMatch = sourceText.slice(match.index, match.index + match[0].length);
    const staticInfo = normalizeStaticQualifier(match[1]);
    const returnType = staticInfo.text;
    const name = match[2].trim();
    if (!name || blockedNames.has(name)) continue;
    if (/^(public|private|protected)\s*:?$/i.test(returnType)) continue;
    const paramsText = normalizePrototypeWhitespace(match[3]);
    const decl = `${returnType} ${name}(${paramsText})`;
    const key = `fn:${decl}:${staticInfo.isStatic ? 'static' : 'normal'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const doc = parseDoxygenBlock(findNearestDocBlock(sourceText, match.index));
    const parameters = paramsText && paramsText !== 'void' ? splitTopLevel(paramsText).map((part, index) => parsePrototypeParameter(part, index)).filter(Boolean) : [];
    for (const param of parameters) {
      if (doc.paramDescriptions && doc.paramDescriptions[param.name]) param.description = doc.paramDescriptions[param.name];
    }
    const normalizedRaw = normalizePrototypeWhitespace(rawMatch.replace(/\{$/, '').trim());
    const declaration = normalizedRaw.endsWith(';') ? normalizedRaw : `${normalizedRaw};`;
    results.push({
      kind: 'function',
      name,
      declaration,
      returnType: returnType || 'void',
      parameters,
      description: doc.brief || doc.description,
      longDescription: doc.longDescription || doc.description,
      returnDescription: doc.returnDescription,
      notes: doc.notes,
      warnings: doc.warnings,
      isStatic: staticInfo.isStatic
    });
  }
  return results;
}

function cleanInlineDocText(text: string): string {
  return normalizeDocText(String(text || '')
    .replace(/^\s*\/\/\/?<?\s*/, '')
    .replace(/^\s*\/\*+\s*/, '')
    .replace(/\s*\*\/$/, '')
    .replace(/^\s*\*+\s?/, ''));
}

function stripCommentsPreserveSpace(text: string): string {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

function maskCommentsPreserveLength(text: string): string {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, (match) => match.replace(/[^\n]/g, ' '));
}

function normalizeStaticQualifier(text: string): { isStatic: boolean; text: string } {
  const normalized = normalizePrototypeWhitespace(text);
  if (/^static\b/.test(normalized)) {
    return { isStatic: true, text: normalized.replace(/^static\b\s*/, '').trim() };
  }
  return { isStatic: false, text: normalized };
}

function extractTopLevelBody(block: string): string {
  const start = block.indexOf('{');
  const end = block.lastIndexOf('}');
  if (start < 0 || end <= start) return '';
  return block.slice(start + 1, end);
}

function parseStructLikeFields(block: string): CpmStructField[] {
  const body = extractTopLevelBody(block);
  if (!body.trim()) return [];
  const statements = splitTopLevel(body, ';');
  const fields: CpmStructField[] = [];
  for (const rawStatement of statements) {
    const statement = String(rawStatement || '').trim();
    if (!statement) continue;
    const descriptionParts: string[] = [];
    const trailingLine = statement.match(/\/\/\/?<?\s*(.+)$/);
    if (trailingLine) descriptionParts.push(cleanInlineDocText(trailingLine[1]));
    const trailingBlock = statement.match(/\/\*+\s*([\s\S]*?)\s*\*\/$/);
    if (trailingBlock) descriptionParts.push(cleanInlineDocText(trailingBlock[1]));
    const withoutComments = normalizePrototypeWhitespace(stripCommentsPreserveSpace(statement));
    if (!withoutComments) continue;
    if (/^(public|private|protected)\s*:\s*$/i.test(withoutComments)) continue;
    if (/^(friend|using|template)\b/i.test(withoutComments)) continue;
    if (/^static_assert\b/i.test(withoutComments)) continue;
    if (withoutComments.includes('(') && withoutComments.includes(')')) continue;
    const parsed = parsePrototypeParameter(withoutComments, fields.length);
    if (!parsed) continue;
    fields.push({
      name: parsed.name,
      type: parsed.type,
      description: descriptionParts.filter(Boolean).join(' ').trim() || undefined,
      declaration: withoutComments.endsWith(';') ? withoutComments : `${withoutComments};`
    });
  }
  return fields;
}

function parseEnumValuesFromBlock(block: string): CpmEnumValue[] {
  const body = extractTopLevelBody(block);
  if (!body.trim()) return [];
  const values: CpmEnumValue[] = [];
  for (const rawItem of splitTopLevel(body, ',')) {
    const item = String(rawItem || '').trim();
    if (!item) continue;
    const descriptionParts: string[] = [];
    const trailingLine = item.match(/\/\/\/?<?\s*(.+)$/);
    if (trailingLine) descriptionParts.push(cleanInlineDocText(trailingLine[1]));
    const trailingBlock = item.match(/\/\*+\s*([\s\S]*?)\s*\*\/$/);
    if (trailingBlock) descriptionParts.push(cleanInlineDocText(trailingBlock[1]));
    const cleaned = normalizePrototypeWhitespace(stripCommentsPreserveSpace(item));
    if (!cleaned) continue;
    const parts = splitTopLevel(cleaned, '=');
    const name = normalizePrototypeWhitespace(parts[0] || '');
    if (!name) continue;
    const value = parts.length > 1 ? normalizePrototypeWhitespace(parts.slice(1).join('=')) : undefined;
    values.push({
      name,
      value: value || undefined,
      description: descriptionParts.filter(Boolean).join(' ').trim() || undefined
    });
  }
  return values;
}


function normalizeAccessLabel(value: string | undefined, fallback: 'public' | 'private' | 'protected' = 'private'): 'public' | 'private' | 'protected' {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'public' || raw === 'private' || raw === 'protected') return raw as any;
  return fallback;
}

function extractCompositeTypeName(headerText: string, kind: 'class' | 'struct' | 'enum' | 'enum_class'): string | undefined {
  let header = normalizePrototypeWhitespace(stripCommentsPreserveSpace(headerText || ''));
  if (!header) return undefined;
  const braceIndex = header.indexOf('{');
  if (braceIndex >= 0) header = header.slice(0, braceIndex);
  if (kind === 'enum_class') header = header.replace(/^\s*enum\s+class\b/i, '');
  else if (kind === 'class') header = header.replace(/^\s*class\b/i, '');
  else if (kind === 'struct') header = header.replace(/^\s*(?:typedef\s+)?struct\b/i, '');
  else header = header.replace(/^\s*(?:typedef\s+)?enum\b/i, '');
  header = header.replace(/\[\[[\s\S]*?\]\]/g, ' ');
  header = header.replace(/__declspec\s*\([^)]*\)/g, ' ');
  header = header.replace(/\balignas\s*\([^)]*\)/g, ' ');
  header = header.replace(/\b(final|sealed)\b/g, ' ');
  const colonIndex = header.indexOf(':');
  if (colonIndex >= 0) header = header.slice(0, colonIndex);
  const match = header.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/);
  return match ? match[1] : undefined;
}

function extractTrailingAliasName(blockText: string): string | undefined {
  const closeIndex = blockText.lastIndexOf('}');
  if (closeIndex < 0) return undefined;
  const trailing = normalizePrototypeWhitespace(blockText.slice(closeIndex + 1).replace(/;+$/g, ''));
  if (!trailing) return undefined;
  const match = trailing.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/);
  return match ? match[1] : undefined;
}


function escapeRegexLiteral(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitBeforeParen(statement: string): { before: string; params: string; after: string } | null {
  const open = statement.indexOf('(');
  if (open < 0) return null;
  let depth = 0;
  let close = -1;
  for (let i = open; i < statement.length; i += 1) {
    const ch = statement[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) { close = i; break; }
    }
  }
  if (close < 0) return null;
  return {
    before: statement.slice(0, open).trim(),
    params: normalizePrototypeWhitespace(statement.slice(open + 1, close)),
    after: normalizePrototypeWhitespace(statement.slice(close + 1))
  };
}

function parseCppMethod(statement: string, className: string, access: 'public' | 'private' | 'protected', description?: string): CppMethod | null {
  const normalized = normalizePrototypeWhitespace(stripCommentsPreserveSpace(statement)).replace(/;$/, '').trim();
  if (!normalized || !normalized.includes('(') || !normalized.includes(')')) return null;
  if (/\(\s*\*\s*[A-Za-z_]/.test(normalized)) return null;
  const parts = splitBeforeParen(normalized);
  if (!parts) return null;
  let before = parts.before;
  const after = parts.after;
  if (!before) return null;

  const prefixKeywords = ['virtual', 'static', 'inline', 'constexpr', 'explicit', 'friend', 'extern', 'mutable'];
  const qualifiers: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const keyword of prefixKeywords) {
      if (before.startsWith(keyword + ' ')) {
        qualifiers.push(keyword);
        before = before.slice(keyword.length).trim();
        changed = true;
      }
    }
  }

  const bareClass = className.replace(/^.*::/, '');
    const ctorRe = new RegExp('(?:^|::)' + escapeRegexLiteral(bareClass) + '$');
    const dtorRe = new RegExp('(?:^|::)~' + escapeRegexLiteral(bareClass) + '$');

  let name = '';
  let returnType = '';
  let methodKind: 'method' | 'constructor' | 'destructor' | 'operator' = 'method';

  if (dtorRe.test(before)) {
    name = before;
    methodKind = 'destructor';
  } else if (ctorRe.test(before)) {
    name = before;
    methodKind = 'constructor';
  } else {
    const methodMatch = before.match(/^(.*?)([~A-Za-z_][A-Za-z0-9_:~]*|operator\s*[^\s(]+)\s*$/);
    if (!methodMatch) return null;
    returnType = normalizePrototypeWhitespace(methodMatch[1]);
    name = normalizePrototypeWhitespace(methodMatch[2]);
    if (!name) return null;
    if (/^operator\\b/.test(name)) methodKind = 'operator';
  }

  const suffixQualifiers = after.split(/\s+/).filter(Boolean);
  const allQualifiers = [...qualifiers, ...suffixQualifiers].filter(Boolean);
  return {
    name,
    returnType: returnType || undefined,
    signature: normalized.endsWith(';') ? normalized : `${normalized};`,
    declaration: normalized.endsWith(';') ? normalized : `${normalized};`,
    description: description || undefined,
    access,
    qualifiers: allQualifiers.length ? allQualifiers : undefined,
    paramsText: parts.params || '',
    methodKind
  };
}

function parseCppClassDetails(block: string, className: string): { fields: CpmStructField[]; methods: CppMethod[] } {
  const body = extractTopLevelBody(block);
  if (!body.trim()) return { fields: [], methods: [] };
  const statements = splitTopLevel(body, ';');
  const fields: CpmStructField[] = [];
  const methods: CppMethod[] = [];
  let access: 'public' | 'private' | 'protected' = 'private';
  for (const rawStatement of statements) {
    let statement = String(rawStatement || '').trim();
    if (!statement) continue;
    const descriptionParts: string[] = [];
    const trailingLine = statement.match(/\/\/\/?<?\s*(.+)$/);
    if (trailingLine) descriptionParts.push(cleanInlineDocText(trailingLine[1]));
    const trailingBlock = statement.match(/\/\*+\s*([\s\S]*?)\s*\*\/$/);
    if (trailingBlock) descriptionParts.push(cleanInlineDocText(trailingBlock[1]));
    const withoutComments = normalizePrototypeWhitespace(stripCommentsPreserveSpace(statement));
    if (!withoutComments) continue;
    const accessMatch = withoutComments.match(/^(public|private|protected)\s*:\s*(.*)$/i);
    if (accessMatch) {
      access = normalizeAccessLabel(accessMatch[1], access);
      statement = String(accessMatch[2] || '').trim();
      if (!statement) continue;
    } else if (/^(public|private|protected)\s*:\s*$/i.test(withoutComments)) {
      access = normalizeAccessLabel(withoutComments.split(':')[0], access);
      continue;
    } else {
      statement = withoutComments;
    }
    if (/^(friend|using|template)\b/i.test(statement)) continue;
    if (/^static_assert\b/i.test(statement)) continue;
    const method = parseCppMethod(statement, className, access, descriptionParts.filter(Boolean).join(' ').trim());
    if (method) {
      methods.push(method);
      continue;
    }
    const parsed = parsePrototypeParameter(statement, fields.length);
    if (!parsed) continue;
    fields.push({
      name: parsed.name,
      type: parsed.type,
      description: descriptionParts.filter(Boolean).join(' ').trim() || undefined,
      declaration: statement.endsWith(';') ? statement : `${statement};`,
      access
    });
  }
  return { fields, methods };
}

function parseImportedTypeCandidates(sourceText: string): ParsedImportedSymbol[] {
  const results: ParsedImportedSymbol[] = [];
  const seen = new Set<string>();
  const scanText = maskCommentsPreserveLength(sourceText);
  let match: RegExpExecArray | null;

  const enumClassPattern = /enum\s+class\b[^;{]*\{[\s\S]*?\}\s*;/g;
  while ((match = enumClassPattern.exec(scanText)) !== null) {
    const rawBlock = sourceText.slice(match.index, match.index + match[0].length);
    const header = rawBlock.slice(0, rawBlock.indexOf('{'));
    const name = extractCompositeTypeName(header, 'enum_class');
    if (!name) continue;
    if (seen.has(`enumclass:${name}`)) continue;
    seen.add(`enumclass:${name}`);
    const doc = parseDoxygenBlock(findNearestDocBlock(sourceText, match.index));
    results.push({ kind: 'enum_class', name, declaration: normalizePrototypeWhitespace(rawBlock), description: doc.brief || doc.description, longDescription: doc.longDescription || doc.description, notes: doc.notes, warnings: doc.warnings, enumValues: parseEnumValuesFromBlock(rawBlock) });
  }

  const classPattern = /class\b[^;{]*\{[\s\S]*?\}\s*;/g;
  while ((match = classPattern.exec(scanText)) !== null) {
    const rawBlock = sourceText.slice(match.index, match.index + match[0].length);
    const header = rawBlock.slice(0, rawBlock.indexOf('{'));
    const name = extractCompositeTypeName(header, 'class');
    if (!name) continue;
    if (seen.has(`class:${name}`)) continue;
    seen.add(`class:${name}`);
    const doc = parseDoxygenBlock(findNearestDocBlock(sourceText, match.index));
    const classDetails = parseCppClassDetails(rawBlock, name);
    results.push({ kind: 'class', name, declaration: normalizePrototypeWhitespace(rawBlock), description: doc.brief || doc.description, longDescription: doc.longDescription || doc.description, notes: doc.notes, warnings: doc.warnings, fields: classDetails.fields, methods: classDetails.methods });
  }

  const structPattern = /(?:typedef\s+)?struct\b[^;{]*\{[\s\S]*?\}\s*(?:[A-Za-z_][A-Za-z0-9_]*)?\s*;/g;
  while ((match = structPattern.exec(scanText)) !== null) {
    const rawBlock = sourceText.slice(match.index, match.index + match[0].length);
    const header = rawBlock.slice(0, rawBlock.indexOf('{'));
    const aliasName = extractTrailingAliasName(rawBlock);
    const name = (aliasName || extractCompositeTypeName(header, 'struct') || 'anonymous_struct').trim();
    if (seen.has(`struct:${name}`)) continue;
    seen.add(`struct:${name}`);
    const doc = parseDoxygenBlock(findNearestDocBlock(sourceText, match.index));
    results.push({ kind: 'struct', name, declaration: normalizePrototypeWhitespace(rawBlock), description: doc.brief || doc.description, longDescription: doc.longDescription || doc.description, notes: doc.notes, warnings: doc.warnings, fields: parseStructLikeFields(rawBlock) });
  }

  const enumPattern = /(?:typedef\s+)?enum\b[^;{]*\{[\s\S]*?\}\s*(?:[A-Za-z_][A-Za-z0-9_]*)?\s*;/g;
  while ((match = enumPattern.exec(scanText)) !== null) {
    const rawBlock = sourceText.slice(match.index, match.index + match[0].length);
    const header = rawBlock.slice(0, rawBlock.indexOf('{'));
    const aliasName = extractTrailingAliasName(rawBlock);
    const name = (aliasName || extractCompositeTypeName(header, 'enum') || 'anonymous_enum').trim();
    if (seen.has(`enum:${name}`) || seen.has(`enumclass:${name}`)) continue;
    seen.add(`enum:${name}`);
    const doc = parseDoxygenBlock(findNearestDocBlock(sourceText, match.index));
    results.push({ kind: 'enum', name, declaration: normalizePrototypeWhitespace(rawBlock), description: doc.brief || doc.description, longDescription: doc.longDescription || doc.description, notes: doc.notes, warnings: doc.warnings, enumValues: parseEnumValuesFromBlock(rawBlock) });
  }

  const typedefPattern = /typedef\s+(?!struct\b|enum\b|union\b)([^;{}]+?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g;
  while ((match = typedefPattern.exec(scanText)) !== null) {
    const rawBlock = sourceText.slice(match.index, match.index + match[0].length);
    const name = match[2].trim();
    if (seen.has(`typedef:${name}`)) continue;
    seen.add(`typedef:${name}`);
    const doc = parseDoxygenBlock(findNearestDocBlock(sourceText, match.index));
    results.push({ kind: 'typedef', name, declaration: normalizePrototypeWhitespace(rawBlock), description: doc.brief || doc.description, longDescription: doc.longDescription || doc.description, notes: doc.notes, warnings: doc.warnings });
  }

  return results;
}

function parseSymbolsFromSourceText(sourceText: string): ParsedImportedSymbol[] {
  const functions = parseImportedFunctionCandidates(sourceText);
  const types = parseImportedTypeCandidates(sourceText);
  const merged = [...functions, ...types];
  const dedup = new Map<string, ParsedImportedSymbol>();
  for (const symbol of merged) {
    const key = `${symbol.kind}:${symbol.name}:${symbol.declaration}`;
    if (!dedup.has(key)) dedup.set(key, symbol);
  }
  return Array.from(dedup.values());
}

async function importSymbolsToPackFile(pack: LoadedPack, target?: { environmentName?: string; libraryName?: string; categoryName?: string }): Promise<{ imported: number; skipped: number; filePath: string } | undefined> {
  const picked = await vscode.window.showOpenDialog({
    title: `Import symbols into ${pack.name}`,
    canSelectMany: false,
    filters: { 'C / C++ source and headers': ['h', 'hpp', 'hh', 'hxx', 'c', 'cpp', 'cc', 'cxx', 'txt'] }
  });
  const sourceUri = picked?.[0];
  if (!sourceUri) return undefined;

  const packFile = readPackFile(pack.filePath);
  const environmentName = target?.environmentName || await chooseTargetEnvironment(packFile, `Choose the target environment for imported symbols — ${pack.name}`);
  if (!environmentName) return undefined;
  const libraryName = target?.libraryName || await chooseTargetLibrary(packFile, `Choose the target library for imported symbols — ${pack.name}`, environmentName);
  if (!libraryName) return undefined;
  const categoryName = target?.categoryName;

  const defaultHeader = prototypeHeaderDefaultName(sourceUri.fsPath);
  const headerHint = await promptForOptionalText('Imported symbol header', 'Optional header field stored on imported symbols', defaultHeader, 'my_library.h');
  if (headerHint === undefined) return undefined;

  const raw = fs.readFileSync(sourceUri.fsPath, 'utf8');
  const parsed = parseSymbolsFromSourceText(raw);
  if (!parsed.length) {
    void vscode.window.showWarningMessage('No supported function, struct, typedef, enum, or class was found in the selected file.');
    return undefined;
  }

  const duplicatePolicy = await vscode.window.showQuickPick([
    { label: 'Skip duplicates', description: 'Keep existing entries and ignore imported duplicates', value: 'skip' },
    { label: 'Replace duplicates', description: 'Overwrite entries with the same name in the target category', value: 'replace' }
  ], { title: 'How should duplicate symbol names be handled?', ignoreFocusOut: true });
  if (!duplicatePolicy) return undefined;

  let imported = 0;
  let skipped = 0;
  const grouped = new Map<string, ParsedImportedSymbol[]>();
  for (const symbol of parsed) {
    const cat = getImportedCategoryName(symbol);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(symbol);
  }

  for (const [autoCategoryName, symbols] of grouped.entries()) {
    const resolvedCategoryName = categoryName || autoCategoryName;
    const { category } = ensureEnvironmentLibraryCategory(packFile, environmentName, libraryName, resolvedCategoryName);
    for (const symbol of symbols) {
      const entry = { ...makeImportedEntry(symbol, libraryName, headerHint || undefined), environment: environmentName };
      const existingIndex = category.functions.findIndex((fn) => fn.name === entry.name);
      if (existingIndex >= 0) {
        if (duplicatePolicy.value === 'replace') {
          category.functions.splice(existingIndex, 1, entry);
          imported += 1;
        } else {
          skipped += 1;
        }
      } else {
        category.functions.push(entry);
        imported += 1;
      }
    }
  }

  writePackFile(pack.filePath, packFile);
  return { imported, skipped, filePath: sourceUri.fsPath };
}



type LanguagePackMode = 'c_core' | 'c_dll' | 'cpp_core' | 'cpp_dll' | 'preprocessor_core' | 'cvi_core' | 'qt_core' | 'qt_pyside_core' | 'opencv_core' | 'qt_widgets_adv' | 'qml_core' | 'opencv_vision' | 'cmake_core' | 'gcc_core' | 'gpp_core' | 'mingw_core' | 'clang_core' | 'msvc_core' | 'make_ninja_core' | 'meson_core' | 'deps_core' | 'cross_toolchain_core' | 'build_quality_core' | 'system_automation_core' | 'powershell_core' | 'batch_core' | 'bash_core' | 'linux_admin_core' | 'devops_core' | 'python_core' | 'java_core' | 'web_core' | 'csharp_core' | 'php_core' | 'kotlin_core' | 'typescript_core' | 'vba_core' | 'database_core' | 'sqlite_core' | 'postgres_core' | 'mysql_core' | 'sqlserver_core' | 'duckdb_core' | 'mongodb_core' | 'redis_core' | 'sqlite_c_core' | 'libpq_core' | 'mysql_capi_core' | 'odbc_core' | 'sqlalchemy_core' | 'hiredis_core' | 'dbops_core' | 'embedded_core' | 'raspi_core' | 'arduino_core' | 'arduino_mega_core' | 'esp32_core' | 'stm32_core' | 'pic_core' | 'msp_core' | 'opencv_robotics_example' | 'win32_hooks_example' | 'uart_protocol_example' | 'instrumentation_example';

interface StarterEntryDefinition {
  category: string;
  library?: string;
  name: string;
  description: string;
  insertText: string;
  signature?: string;
  longDescription?: string;
  symbolKind?: SymbolKind;
  returnType?: string;
  header?: string;
  declaration?: string;
}

const STARTER_SNIPPET_CATEGORIES = new Set([
  'Snippets',
  'Snippets & Project Skeletons',
  'Keywords & Preprocessor',
  'Types, Structures & Binary Layout',
  'Pointers, Arrays & Strings',
  'Functions, Callbacks & Variadics',
  'Collections & Algorithms',
  'Files, Streams & Configuration',
  'Time, Timers & Reliability',
  'Threads, Atomics & Synchronization',
  'Processes, IPC & Signals',
  'Networking & Web',
  'Device I/O: Serial, USB & Buses',
  'Diagnostics, Logging & Testing',
  'Build, Portability & Interop',
  'Architecture & Patterns',
  'DLL Helpers',
  'OOP & Inheritance',
  'Operator Overloading',
  'Basic',
  'Iteration & Containers',
  'Containers',
  'Iterators & Traversal',
  'Algorithms & Ranges',
  'Templates & Generic Code',
  'Files & Streams',
  'Device I/O: Serial & USB',
  'Web & Ethernet',
  'Communication & Connectivity',
  'Pipes & IPC',
  'Concurrency',
  'Threading & Synchronization',
  'Concurrency & Atomics',
  'Concurrency & Coordination',
  'Memory & Ownership',
  'Java Equivalents & RTTI',
  'Pointers, References & Smart Pointers',
  'Input & Events',
  'Errors & Utilities',
  'Callbacks & Lambdas',
  'Algorithms & STL',
  'Filesystem & Paths',
  'Time & Chrono',
  'Time, Timers & Delays',
  'Networking & Sockets',
  'Serialization & Parsing',
  'Platform Threads',
  'Processes & System',
  'Qt Core',
  'Signals & Slots',
  'Qt Widgets',
  'Qt Models & Views',
  'Qt I/O & Concurrency',
  'Qt Networking',
  'Qt File & JSON',
  'OpenCV Basics',
  'OpenCV Image Processing',
  'OpenCV Drawing & UI',
  'OpenCV Video & Camera',
  'OpenCV Features & Geometry',
  'OpenCV DNN & Advanced',
  'Qt Widgets Advanced',
  'Qt State & UI Patterns',
  'Qt QML',
  'OpenCV Vision Pipelines',
  'OpenCV Calibration & Pose',
  'OpenCV ML & Tracking',
  'Build Systems & CMake',
  'GCC & G++',
  'MinGW Build',
  'Win32 Windows & Messages',
  'Win32 Resources & Controls',
  'Win32 Input & Hooks',
  'Serial & UART',
  'Cross-platform Serial',
  'UART Protocols',
  'Diagnostics & Logging',
  'OpenCV Robotics & Camera',
  'Instrumentation & Test Benches',
  'Embedded GPIO & Timing',
  'Embedded Buses & Peripherals',
  'Embedded RTOS & ISR',
  'Raspberry Pi GPIO',
  'Raspberry Pi I/O',
  'Arduino Core',
  'Arduino Peripherals',
  'PowerShell Basics',
  'PowerShell Files & Paths',
  'PowerShell Processes & Services',
  'PowerShell JSON & Web',
  'PowerShell Build & Deployment',
  'PowerShell Registry & System',
  'Windows Batch Basics',
  'Windows Batch Files & Paths',
  'Windows Batch Build & Deployment',
  'Windows Batch Processes & Logs',
  'Bash Basics',
  'Bash Files & Paths',
  'Bash Build & Deployment',
  'Bash Processes & Services',
  'Bash Text & Parsing',
  'Bash SSH & Networking',
  'Language Fundamentals',
  'Functions, Callables & Decorators',
  'Typing, OOP & Data Models',
  'Collections, Iterators & Algorithms',
  'Files, Paths & Configuration',
  'Serialization, Databases & Persistence',
  'Time, Scheduling & Reliability',
  'Concurrency, Async & Processes',
  'Networking, Web & APIs',
  'Device I/O: Serial, USB & Buses',
  'Linux, System & Services',
  'Interop, Native Libraries & ABI',
  'Testing, Logging & Quality',
  'Packaging, Environments & Deployment',
  'Numerical Computing & Scientific Python',
  'Signal Processing, Control & Instrumentation',
  'Data Analysis, Visualization & Notebooks',
  'AI, Vision & Model Deployment',
  'GUI, HMI & Dashboards',
  'Automation, Test Benches & Robotics',
  'Python Basics',
  'Python OOP',
  'Python Files & Paths',
  'Python Data & Parsing',
  'Python Concurrency',
  'Python System & Networking',
  'Language Fundamentals',
  'OOP, Interfaces & Modern Types',
  'Generics, Reflection & Annotations',
  'Collections, Iterators & Streams',
  'Files, Paths & Configuration',
  'Serialization, Databases & Persistence',
  'Time, Scheduling & Reliability',
  'Concurrency, Virtual Threads & Async',
  'Networking, Web & Realtime',
  'Device I/O: Serial, USB, Bluetooth & Buses',
  'JVM, Modules, Native Interop & Linux',
  'Testing, Logging & Quality',
  'Build, Packaging & Deployment',
  'Desktop UI: Swing, JavaFX & WebView',
  'Backend Services: Spring Boot & REST',
  'Automation, Instrumentation & Robotics',
  'Java Basics',
  'Java OOP',
  'Java Collections & Streams',
  'Java Files & JSON',
  'Java Concurrency',
  'Java Exceptions',
  'JavaScript Basics',
  'JavaScript DOM & Browser',
  'JavaScript Async & Fetch',
  'HTML & CSS',
  'OOP, Types & Data Models',
  'Generics, Reflection & Attributes',
  'Collections, LINQ & Iterators',
  'Files, Streams & Configuration',
  'Serialization, Databases & Persistence',
  'Time, Timers & Reliability',
  'Concurrency, Async & Parallelism',
  'Networking, Web & Realtime',
  'Device I/O: Serial, USB, Bluetooth & Buses',
  '.NET Runtime, Native Interop & Linux',
  'Testing, Logging & Quality',
  'Build, Packaging & Deployment',
  'Desktop UI: WPF, WinForms, MAUI & WebView',
  'ASP.NET Core, Razor Pages, MVC & APIs',
  'Automation, Instrumentation & Robotics',
  'C# Basics',
  'C# LINQ & Collections',
  'C# Files & JSON',
  'C# Async & Tasks',
  'C# Exceptions & Disposal'
]);

function inferStarterSymbolKind(category: string, explicit?: SymbolKind): SymbolKind {
  if (explicit) return explicit;
  return STARTER_SNIPPET_CATEGORIES.has(category) ? 'snippet' : 'keyword';
}

function makeStarterEntry(libraryName: string, entry: StarterEntryDefinition): CpmFunction {
  const targetLibraryName = entry.library || libraryName;
  const kind = inferStarterSymbolKind(entry.category, entry.symbolKind);
  const signature = entry.signature || entry.insertText;
  return {
    name: entry.name,
    returnType: entry.returnType || (kind === 'snippet' ? 'snippet' : 'keyword'),
    signature,
    insertText: entry.insertText,
    library: targetLibraryName,
    category: entry.category,
    description: entry.description,
    longDescription: entry.longDescription || '',
    parameters: [],
    symbolKind: kind,
    declaration: entry.declaration || signature,
    header: entry.header || ''
  };
}


interface EmbeddedStarterPackFile {
  label?: string;
  libraryName?: string;
  entries?: StarterEntryDefinition[];
}

function loadEmbeddedStarterPackFile(fileName: string): EmbeddedStarterPackFile | undefined {
  const candidatePaths = [
    path.join(__dirname, '..', 'data', fileName),
    path.join(__dirname, 'data', fileName),
    path.join(process.cwd(), 'data', fileName)
  ];

  for (const candidatePath of candidatePaths) {
    try {
      if (!fs.existsSync(candidatePath)) {
        continue;
      }
      const rawText = fs.readFileSync(candidatePath, 'utf8');
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        return { entries: parsed };
      }
      if (parsed && Array.isArray(parsed.entries)) {
        return parsed as EmbeddedStarterPackFile;
      }
    } catch {
      // ignore and continue to the next candidate path
    }
  }

  return undefined;
}

interface StarterCatalogPack { libraryName: string; label: string; entries: Array<StarterEntryDefinition & { $libraryContext?: string }> }
let starterCatalogCache: Record<string, StarterCatalogPack> | undefined;

/** Built-in language/tool starter entries, stored in data/starter_catalog.json (generated from the former inline catalog). */
function loadStarterCatalog(): Record<string, StarterCatalogPack> {
  if (starterCatalogCache) return starterCatalogCache;
  const catalogPath = path.join(__dirname, '..', 'data', 'starter_catalog.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    starterCatalogCache = parsed && typeof parsed.packs === 'object' ? parsed.packs as Record<string, StarterCatalogPack> : {};
  } catch (error) {
    console.error(`C/C++ Libraries: failed to load the starter catalog from ${catalogPath}`, error);
    starterCatalogCache = {};
  }
  return starterCatalogCache;
}

function createLanguagePackEntries(mode: LanguagePackMode): { libraryName: string; entries: CpmFunction[]; label: string } {
  // An installed data/web_language_pack.json still takes precedence over the built-in web entries.
  if (mode === 'web_core') {
    const embeddedWebPack = loadEmbeddedStarterPackFile('web_language_pack.json');
    if (embeddedWebPack?.entries?.length) {
      const webLibraryName = embeddedWebPack.libraryName || 'JavaScript / HTML / CSS';
      return { libraryName: webLibraryName, entries: embeddedWebPack.entries.map((entry) => makeStarterEntry(webLibraryName, entry)), label: embeddedWebPack.label || 'JavaScript / HTML / CSS V7 ultra + Node.js backend pro + DB SQL backend pack' };
    }
  }
  const catalog = loadStarterCatalog();
  const pack = catalog[mode] ?? catalog.__default;
  if (!pack) return { libraryName: '', entries: [], label: '' };
  let entries = pack.entries.map(({ $libraryContext, ...entry }) => makeStarterEntry($libraryContext ?? pack.libraryName, entry as StarterEntryDefinition));
  if (mode === 'cpp_core') {
    entries = entries.filter((entry) => !CPP_REMOVED_INDUSTRIAL_NAME_PATTERN.test(String(entry.category || ''))
      && !CPP_REMOVED_INDUSTRIAL_NAME_PATTERN.test(String(entry.library || '')));
  }
  return { libraryName: pack.libraryName, entries, label: pack.label };
}

async function addContentIntoPackFile(pack: LoadedPack, target?: { environmentName?: string; libraryName?: string; categoryName?: string }): Promise<{ message: string } | undefined> {
  const options: { label: string; description: string; value: string }[] = [];
  if (!target?.environmentName) {
    options.push({ label: 'Add environment', description: 'Create a new environment inside this pack', value: 'addEnvironment' });
  }
  if (!target?.libraryName) {
    options.push({ label: 'Add library', description: target?.environmentName ? 'Create a new library inside this environment' : 'Create a new library inside this pack', value: 'addLibrary' });
  }
  options.push(
    { label: 'Add function', description: 'Create a function through a guided wizard', value: 'addFunction' },
    { label: 'Import source/header', description: 'Parse prototypes, functions, structs, typedefs, enums, and classes from a source or header file', value: 'importSymbols' },
    { label: 'Add language pack / DLL helpers', description: 'Add grouped C, C++, Lua, SDL2/SDL3, Qt, OpenCV, Win32, Windows Devices, build, platform, embedded, and example packs, with family-level Add all actions', value: 'starter' },
    { label: 'Import file as snippet', description: 'Import a code or text file directly as a reusable snippet symbol', value: 'snippet' }
  );

  const choice = await vscode.window.showQuickPick(options, {
    title: 'Add content',
    placeHolder: 'Choose the type of content to add'
  });

  if (!choice) {
    return;
  }

  if (choice.value === 'addEnvironment') {
    const environmentName = await addEnvironmentToPackFile(pack);
    if (!environmentName) return undefined;
    return { message: `Added environment ${environmentName} to ${pack.name}.` };
  }

  if (choice.value === 'addLibrary') {
    const location = await addLibraryToPackFile(pack, target?.environmentName);
    if (!location) return undefined;
    return { message: `Added library ${location.libraryName} to ${location.environmentName}.` };
  }

  if (choice.value === 'addFunction') {
    const fn = await addFunctionToPackFile(pack, target);
    if (!fn) return undefined;
    const environmentPrefix = fn.environment ? `${fn.environment} / ` : '';
    return { message: `Added ${fn.name} to ${environmentPrefix}${fn.library} / ${fn.category}.` };
  }

  if (choice.value === 'importSymbols') {
    const result = await importSymbolsToPackFile(pack, target);
    if (!result) return undefined;
    const message = result.skipped > 0
      ? `Imported ${result.imported} symbol(s) and skipped ${result.skipped} duplicate(s). Source: ${result.filePath}`
      : `Imported ${result.imported} symbol(s). Source: ${result.filePath}`;
    return { message };
  }

  if (choice.value === 'starter') {
    const result = await importLanguageStarterIntoPackFile(pack, target);
    if (!result) {
      return;
    }
    const environmentPrefix = result.environmentName ? `${result.environmentName} / ` : '';
    return { message: `Added ${result.added} item(s) from ${result.label} to ${environmentPrefix}${result.libraryName}.` };
  }

  const result = await importSnippetFileIntoPackFile(pack, target);
  if (!result) {
    return;
  }
  const environmentPrefix = result.environmentName ? `${result.environmentName} / ` : '';
  return { message: `Imported snippet into ${environmentPrefix}${result.libraryName} / ${result.categoryName}. Source: ${result.filePath}` };
}

async function exportContentFromPackFile(pack: LoadedPack, target?: { environmentName?: string; libraryName?: string; categoryName?: string }): Promise<{ message: string; openPath?: string } | undefined> {
  const options = [
    { label: 'Generate header', description: 'Generate a .h file from the current pack or scoped selection', value: 'generateHeader' },
    { label: 'Export pack', description: 'Copy this pack to another JSON file', value: 'exportPack' }
  ];
  const choice = await vscode.window.showQuickPick(options, { title: 'Export content', placeHolder: 'Choose what to export or generate' });
  if (!choice) return undefined;
  if (choice.value === 'generateHeader') {
    const generatedPath = await generateHeaderForPack(pack, target);
    if (!generatedPath) return undefined;
    return { message: `Generated header: ${generatedPath}`, openPath: generatedPath };
  }
  await exportPackToFile(pack);
  return { message: `Exported ${pack.name}.` };
}

interface StarterPackSelection {
  id: string;
  label: string;
  libraryName?: string;
  entries: StarterPackEntry[];
  preserveLibraries?: boolean;
  preserveEnvironments?: boolean;
  forceCanonicalHierarchy?: boolean;
}

function canonicalStarterEnvironmentName(id: string): string | undefined {
  if (id === 'cvi_core') return 'CVI';
  if (id === 'c_core' || id === 'c_dll' || id === 'c_all') return 'C';
  if (id === 'cpp_core' || id === 'cpp_dll' || id === 'cpp_all') return 'C++';
  if (id === 'preprocessor_core') return 'C / C++ Preprocessor';
  if (id.startsWith('qt_') || id === 'qml_core') return 'QT';
  if (id.startsWith('opencv_')) return 'OpenCV';
  if (['cmake_core', 'gcc_core', 'gpp_core', 'mingw_core', 'clang_core', 'msvc_core', 'make_ninja_core', 'meson_core', 'deps_core', 'cross_toolchain_core', 'build_quality_core', 'build_all'].includes(id)) return 'Build & Toolchains';
  if (['system_automation_core', 'powershell_core', 'batch_core', 'bash_core', 'linux_admin_core', 'devops_core', 'scripting_all'].includes(id)) return 'Scripting / System';
  if (id === 'python_core') return 'Python';
  if (id === 'java_core') return 'Java';
  if (id === 'web_core') return 'Web';
  if (id === 'csharp_core') return 'C# / .NET';
  if (id === 'php_core') return 'PHP';
  if (id === 'kotlin_core') return 'Kotlin';
  if (id === 'typescript_core') return 'TypeScript';
  if (id === 'vba_core') return 'Visual Basic / VBA';
  if (id.includes('database') || ['sqlite_core', 'postgres_core', 'mysql_core', 'sqlserver_core', 'duckdb_core', 'mongodb_core', 'redis_core', 'sqlite_c_core', 'libpq_core', 'mysql_capi_core', 'odbc_core', 'sqlalchemy_core', 'hiredis_core', 'dbops_core'].includes(id)) return 'Databases';
  if (id.startsWith('embedded_') || ['raspi_core', 'arduino_core', 'arduino_mega_core', 'esp32_core', 'stm32_core', 'pic_core', 'msp_core'].includes(id)) return 'Embedded';
  if (id.includes('asm') || id.startsWith('assembly_')) return 'Assembly';
  if (id.startsWith('lua_')) return 'Lua';
  if (id.startsWith('sdl')) return 'SDL';
  if (id.startsWith('win32_') || id.startsWith('windows_')) return 'Windows API / Devices';
  if (['uart_protocol_example', 'instrumentation_example'].includes(id)) return 'Examples';
  return undefined;
}

interface StarterPackEntry extends CpmFunction {
  /** Internal import-only path. Removed before writing the destination pack. */
  __jcGroupPath?: string[];
}

function buildStarterPackSelection(id: string): StarterPackSelection {
  const cloneEntries = (entries: StarterPackEntry[]): StarterPackEntry[] => entries.map((entry) => ({
    ...entry,
    parameters: entry.parameters?.map((param) => ({
      ...param,
      pickerConfig: param.pickerConfig ? JSON.parse(JSON.stringify(param.pickerConfig)) : undefined,
      presets: param.presets ? JSON.parse(JSON.stringify(param.presets)) : undefined,
      options: param.options ? JSON.parse(JSON.stringify(param.options)) : undefined,
      presetDescriptions: param.presetDescriptions ? { ...param.presetDescriptions } : undefined,
      presetDetails: param.presetDetails ? { ...param.presetDetails } : undefined,
      optionDescriptions: param.optionDescriptions ? { ...param.optionDescriptions } : undefined,
      optionDetails: param.optionDetails ? { ...param.optionDetails } : undefined
    })),
    fields: entry.fields?.map((field) => ({ ...field })),
    enumValues: entry.enumValues?.map((value) => ({ ...value })),
    methods: entry.methods?.map((method) => ({
      ...method,
      qualifiers: method.qualifiers ? [...method.qualifiers] : undefined,
      declaration: method.declaration
    })),
    notes: entry.notes ? [...entry.notes] : undefined,
    warnings: entry.warnings ? [...entry.warnings] : undefined
  }));

  const direct = (mode: LanguagePackMode): StarterPackSelection => {
    const starter = createLanguagePackEntries(mode);
    const environmentName = canonicalStarterEnvironmentName(mode);
    const entries = cloneEntries(starter.entries).map((entry) => environmentName && !entry.environment
      ? { ...entry, environment: environmentName }
      : entry);
    return {
      id: mode,
      label: starter.label,
      libraryName: starter.libraryName,
      entries,
      preserveEnvironments: !!environmentName
    };
  };

  const combineSingleLibrary = (selectionId: string, label: string, libraryName: string, ids: string[]): StarterPackSelection => {
    const childSelections = ids.map((entryId) => buildStarterPackSelection(entryId));
    const environmentName = canonicalStarterEnvironmentName(selectionId);
    const entries = childSelections.flatMap((selection) => selection.entries).map((entry) => ({
      ...entry,
      environment: entry.environment || environmentName,
      library: libraryName
    }));
    return { id: selectionId, label, libraryName, entries, preserveEnvironments: entries.some((entry) => !!entry.environment) };
  };

  const combinePreservingLibraries = (selectionId: string, label: string, ids: string[]): StarterPackSelection => {
    const childSelections = ids.map((entryId) => buildStarterPackSelection(entryId));
    const environmentName = canonicalStarterEnvironmentName(selectionId);
    const entries = childSelections.flatMap((selection) => selection.entries).map((entry) => entry.environment || !environmentName
      ? entry
      : { ...entry, environment: environmentName });
    return {
      id: selectionId,
      label,
      entries,
      preserveLibraries: true,
      preserveEnvironments: entries.some((entry) => !!entry.environment)
    };
  };

  const bundledEnvironmentSelection = (selectionId: string, label: string, environmentNames: string[]): StarterPackSelection => {
    try {
      const defaultPackPath = path.join(__dirname, '..', 'data', 'default_pack.json');
      const raw = JSON.parse(fs.readFileSync(defaultPackPath, 'utf8')) as LibraryPackFile;
      const environments = normalizeEnvironments(Array.isArray(raw.environments) ? raw.environments : undefined, Array.isArray((raw as any).libraries) ? (raw as any).libraries : undefined)
        .filter((environment) => environmentNames.includes(environment.name));
      const entries = environments.flatMap((environment) =>
        (environment.libraries || []).flatMap((library) =>
          (library.categories || []).flatMap((category) =>
            collectCategoryEntriesWithGroupPath(category).map(({ entry, groupPath }) => ({
              ...JSON.parse(JSON.stringify(entry)),
              environment: environment.name,
              library: library.name,
              // The container category is the canonical hierarchy for bundled structured packs.
              // Individual entry.category metadata may be historical and must not flatten or reroute the tree.
              category: category.name,
              __jcGroupPath: [...groupPath]
            } as StarterPackEntry))
          )
        )
      );
      if (entries.length) {
        return { id: selectionId, label, entries, preserveLibraries: true, preserveEnvironments: true };
      }
    } catch {
      // Fall through to the hard-coded packs when the bundled default pack is unavailable.
    }
    return { id: selectionId, label, entries: [], preserveLibraries: true, preserveEnvironments: true };
  };


  const bundledPackFileSelection = (selectionId: string, label: string, fileName: string, environmentNames?: string[]): StarterPackSelection => {
    try {
      const packPath = path.join(__dirname, '..', 'data', fileName);
      const raw = JSON.parse(fs.readFileSync(packPath, 'utf8')) as LibraryPackFile;
      let environments = normalizeEnvironments(Array.isArray(raw.environments) ? raw.environments : undefined, Array.isArray((raw as any).libraries) ? (raw as any).libraries : undefined);
      if (environmentNames?.length) {
        environments = environments.filter((environment) => environmentNames.includes(environment.name));
      }
      const entries = environments.flatMap((environment) =>
        (environment.libraries || []).flatMap((library) =>
          (library.categories || []).flatMap((category) =>
            collectCategoryEntriesWithGroupPath(category).map(({ entry, groupPath }) => ({
              ...JSON.parse(JSON.stringify(entry)),
              environment: environment.name,
              library: library.name,
              // The container category is the canonical hierarchy for bundled structured packs.
              // Individual entry.category metadata may be historical and must not flatten or reroute the tree.
              category: category.name,
              __jcGroupPath: [...groupPath]
            } as StarterPackEntry))
          )
        )
      );
      if (entries.length) {
        return { id: selectionId, label, entries, preserveLibraries: true, preserveEnvironments: true };
      }
    } catch {
      // Bundled external pack unavailable or invalid.
    }
    return { id: selectionId, label, entries: [], preserveLibraries: true, preserveEnvironments: true };
  };


  const bundledLibrarySelection = (selectionId: string, label: string, environmentName: string, libraryNames: string[]): StarterPackSelection => {
    try {
      const defaultPackPath = path.join(__dirname, '..', 'data', 'default_pack.json');
      const raw = JSON.parse(fs.readFileSync(defaultPackPath, 'utf8')) as LibraryPackFile;
      const environment = normalizeEnvironments(Array.isArray(raw.environments) ? raw.environments : undefined, Array.isArray((raw as any).libraries) ? (raw as any).libraries : undefined)
        .find((entry) => entry.name === environmentName);
      const entries = (environment?.libraries || [])
        .filter((library) => libraryNames.includes(library.name))
        .flatMap((library) =>
          (library.categories || []).flatMap((category) =>
            collectCategoryEntriesWithGroupPath(category).map(({ entry, groupPath }) => ({
              ...JSON.parse(JSON.stringify(entry)),
              environment: environment.name,
              library: library.name,
              // The container category is the canonical hierarchy for bundled structured packs.
              // Individual entry.category metadata may be historical and must not flatten or reroute the tree.
              category: category.name,
              __jcGroupPath: [...groupPath]
            } as StarterPackEntry))
          )
        );
      if (entries.length) {
        return { id: selectionId, label, entries, preserveLibraries: true, preserveEnvironments: true };
      }
    } catch {
      // Fall through to the hard-coded pack when the bundled default pack is unavailable.
    }
    return direct(selectionId as LanguagePackMode);
  };


  const bundledPackLibrarySelection = (selectionId: string, label: string, fileName: string, environmentName: string, libraryNames: string[]): StarterPackSelection => {
    try {
      const packPath = path.join(__dirname, '..', 'data', fileName);
      const raw = JSON.parse(fs.readFileSync(packPath, 'utf8')) as LibraryPackFile;
      const environment = normalizeEnvironments(Array.isArray(raw.environments) ? raw.environments : undefined, Array.isArray((raw as any).libraries) ? (raw as any).libraries : undefined)
        .find((entry) => entry.name === environmentName);
      const entries = (environment?.libraries || [])
        .filter((library) => libraryNames.includes(library.name))
        .flatMap((library) =>
          (library.categories || []).flatMap((category) =>
            collectCategoryEntriesWithGroupPath(category).map(({ entry, groupPath }) => ({
              ...JSON.parse(JSON.stringify(entry)),
              environment: environment.name,
              library: library.name,
              // The container category is the canonical hierarchy for bundled structured packs.
              // Individual entry.category metadata may be historical and must not flatten or reroute the tree.
              category: category.name,
              __jcGroupPath: [...groupPath]
            } as StarterPackEntry))
          )
        );
      if (entries.length) {
        return { id: selectionId, label, entries, preserveLibraries: true, preserveEnvironments: true };
      }
    } catch {
      // Fall through to the hard-coded starter when the bundled pack is unavailable.
    }
    return direct(selectionId as LanguagePackMode);
  };


  const bundledPackLibraryEnvironmentSelection = (selectionId: string, label: string, fileName: string, environmentName: string, libraryNames: string[]): StarterPackSelection => {
    try {
      const packPath = path.join(__dirname, '..', 'data', fileName);
      const raw = JSON.parse(fs.readFileSync(packPath, 'utf8')) as LibraryPackFile;
      const environment = normalizeEnvironments(Array.isArray(raw.environments) ? raw.environments : undefined, Array.isArray((raw as any).libraries) ? (raw as any).libraries : undefined)
        .find((entry) => entry.name === environmentName);
      const entries = (environment?.libraries || [])
        .filter((library) => libraryNames.includes(library.name))
        .flatMap((library) =>
          (library.categories || []).flatMap((category) =>
            collectCategoryEntriesWithGroupPath(category).map(({ entry, groupPath }) => ({
              ...JSON.parse(JSON.stringify(entry)),
              environment: environment.name,
              library: library.name,
              // The container category is the canonical hierarchy for bundled structured packs.
              // Individual entry.category metadata may be historical and must not flatten or reroute the tree.
              category: category.name,
              __jcGroupPath: [...groupPath]
            } as StarterPackEntry))
          )
        );
      if (entries.length) {
        return { id: selectionId, label, entries, preserveLibraries: true, preserveEnvironments: true };
      }
    } catch {
      // Fall through to the hard-coded starter when the bundled pack is unavailable.
    }
    return direct(selectionId as LanguagePackMode);
  };

  switch (id) {
    case 'c_core':
      return bundledPackLibrarySelection('c_core', 'C complete structured pack', 'c_language_pack.json', 'C', ['C Language']);
    case 'cvi_core': {
      const selection = bundledPackFileSelection('cvi_core', 'LabWindows/CVI', 'cvi_pack.json', ['CVI']);
      selection.forceCanonicalHierarchy = true;
      return selection;
    }
    case 'cpp_core':
      return bundledPackLibrarySelection('cpp_core', 'C++ complete structured pack', 'cpp_language_pack.json', 'C++', ['C++ Language']);
    case 'python_core':
      return bundledPackLibrarySelection('python_core', 'Python complete structured pack', 'python_pack.json', 'Python', ['Python Language']);
    case 'web_core':
      return bundledPackLibrarySelection('web_core', 'JavaScript / HTML / CSS complete structured pack', 'web_language_pack.json', 'Web', ['JavaScript', 'HTML', 'CSS']);
    case 'java_core':
      return bundledPackLibrarySelection('java_core', 'Java complete structured pack', 'java_language_pack.json', 'Java', ['Java Language']);
    case 'csharp_core':
      return bundledPackLibrarySelection('csharp_core', 'C# .NET ASP.NET Core complete structured pack', 'csharp_language_pack.json', 'C# / .NET', ['C# Language']);
    case 'php_core':
      return bundledPackLibrarySelection('php_core', 'PHP 8.5 web frameworks complete structured pack', 'php_language_pack.json', 'PHP', ['PHP Language']);
    case 'kotlin_core':
      return bundledPackLibrarySelection('kotlin_core', 'Kotlin 2.4 JVM Android Ktor Compose Multiplatform structured pack', 'kotlin_language_pack.json', 'Kotlin', ['Kotlin Language']);
    case 'typescript_core':
      return bundledPackLibrarySelection('typescript_core', 'TypeScript structured language, types, Web, Node.js, backend and tooling pack', 'typescript_language_pack.json', 'TypeScript', ['TypeScript Language']);
    case 'vba_core':
      return bundledPackLibrarySelection('vba_core', 'Visual Basic / VBA structured pack for Excel macros and Office automation', 'vba_language_pack.json', 'Visual Basic / VBA', ['VBA Language', 'Excel VBA', 'Office Automation']);
    case 'database_core':
      return bundledPackLibrarySelection('database_core', 'SQL fundamentals and relational design pack', 'database_pack.json', 'Databases', ['SQL Fundamentals & Relational Design']);
    case 'sqlite_core':
      return bundledPackLibrarySelection('sqlite_core', 'SQLite local database pack', 'database_pack.json', 'Databases', ['SQLite Local Database']);
    case 'postgres_core':
      return bundledPackLibrarySelection('postgres_core', 'PostgreSQL pack', 'database_pack.json', 'Databases', ['PostgreSQL']);
    case 'mysql_core':
      return bundledPackLibrarySelection('mysql_core', 'MySQL and MariaDB pack', 'database_pack.json', 'Databases', ['MySQL & MariaDB']);
    case 'sqlserver_core':
      return bundledPackLibrarySelection('sqlserver_core', 'SQL Server and T-SQL pack', 'database_pack.json', 'Databases', ['SQL Server & T-SQL']);
    case 'duckdb_core':
      return bundledPackLibrarySelection('duckdb_core', 'DuckDB local analytics pack', 'database_pack.json', 'Databases', ['DuckDB Local Analytics']);
    case 'mongodb_core':
      return bundledPackLibrarySelection('mongodb_core', 'MongoDB document database pack', 'database_pack.json', 'Databases', ['MongoDB Document Database']);
    case 'redis_core':
      return bundledPackLibrarySelection('redis_core', 'Redis cache queues and streams pack', 'database_pack.json', 'Databases', ['Redis Cache, Queues & Streams']);
    case 'sqlite_c_core':
      return bundledPackLibrarySelection('sqlite_c_core', 'SQLite3 C API pack', 'database_pack.json', 'Databases', ["SQLite3 C API"]);
    case 'libpq_core':
      return bundledPackLibrarySelection('libpq_core', 'PostgreSQL libpq C API pack', 'database_pack.json', 'Databases', ["PostgreSQL libpq C API"]);
    case 'mysql_capi_core':
      return bundledPackLibrarySelection('mysql_capi_core', 'MySQL client C API pack', 'database_pack.json', 'Databases', ["MySQL Client C API"]);
    case 'odbc_core':
      return bundledPackLibrarySelection('odbc_core', 'ODBC C API pack', 'database_pack.json', 'Databases', ["ODBC C API"]);
    case 'sqlalchemy_core':
      return bundledPackLibrarySelection('sqlalchemy_core', 'SQLAlchemy and Alembic pack', 'database_pack.json', 'Databases', ["SQLAlchemy & Alembic"]);
    case 'hiredis_core':
      return bundledPackLibrarySelection('hiredis_core', 'Redis hiredis C API pack', 'database_pack.json', 'Databases', ["Redis hiredis C API"]);
    case 'dbops_core':
      return bundledPackLibrarySelection('dbops_core', 'Database operations backup and replication pack', 'database_pack.json', 'Databases', ["Database Operations, Backup & Replication"]);
    case 'database_all':
      return combinePreservingLibraries('database_all', 'All database pack', ['database_core', 'sqlite_core', 'postgres_core', 'mysql_core', 'sqlserver_core', 'duckdb_core', 'mongodb_core', 'redis_core', 'sqlite_c_core', 'libpq_core', 'mysql_capi_core', 'odbc_core', 'sqlalchemy_core', 'hiredis_core', 'dbops_core']);
    case 'qt_full':
      return bundledPackLibrarySelection('qt_full', 'Qt C++ complete structured pack', 'qt_pack.json', 'QT', ['Qt Language', 'Qt QML', 'Qt Multimedia', 'Qt SQL & Test']);
    case 'qt_pyside_core':
      return bundledPackLibrarySelection('qt_pyside_core', 'Qt for Python PySide6 structured pack', 'qt_python_pack.json', 'QT', ['Qt for Python (PySide6)']);
    case 'opencv_full':
      return combineSingleLibrary('opencv_full', 'OpenCV language pack', 'OpenCV Language', ['opencv_core', 'opencv_vision']);
    case 'c_all':
      return combinePreservingLibraries('c_all', 'All C pack', ['c_core', 'c_dll']);
    case 'cpp_all':
      return combinePreservingLibraries('cpp_all', 'All C++ pack', ['cpp_core', 'cpp_dll']);
    case 'qt_all':
      return combinePreservingLibraries('qt_all', 'All Qt pack', ['qt_full', 'qt_pyside_core']);
    case 'opencv_all':
      return combinePreservingLibraries('opencv_all', 'All OpenCV pack', ['opencv_full', 'opencv_robotics_example']);
    case 'cmake_core':
      return bundledPackLibrarySelection('cmake_core', 'CMake CTest CPack structured pack', 'build_pack.json', 'Build & Toolchains', ['CMake, CTest & CPack']);
    case 'gcc_core':
      return bundledPackLibrarySelection('gcc_core', 'GCC structured build pack', 'build_pack.json', 'Build & Toolchains', ['GCC & G++']);
    case 'gpp_core':
      return bundledPackLibrarySelection('gpp_core', 'G++ structured build pack', 'build_pack.json', 'Build & Toolchains', ['GCC & G++']);
    case 'clang_core':
      return bundledPackLibrarySelection('clang_core', 'Clang LLVM structured build pack', 'build_pack.json', 'Build & Toolchains', ['Clang & LLVM']);
    case 'mingw_core':
      return bundledPackLibrarySelection('mingw_core', 'MinGW structured build pack', 'build_pack.json', 'Build & Toolchains', ['MinGW & Windows Resources']);
    case 'msvc_core':
      return bundledPackLibrarySelection('msvc_core', 'MSVC Build Tools structured pack', 'build_pack.json', 'Build & Toolchains', ['MSVC Build Tools']);
    case 'make_ninja_core':
      return bundledPackLibrarySelection('make_ninja_core', 'Make Ninja structured build pack', 'build_pack.json', 'Build & Toolchains', ['Make, Ninja & Compilation Databases']);
    case 'meson_core':
      return bundledPackLibrarySelection('meson_core', 'Meson structured build pack', 'build_pack.json', 'Build & Toolchains', ['Meson Build System']);
    case 'deps_core':
      return bundledPackLibrarySelection('deps_core', 'C C++ dependency managers structured pack', 'build_pack.json', 'Build & Toolchains', ['C/C++ Dependency Managers']);
    case 'cross_toolchain_core':
      return bundledPackLibrarySelection('cross_toolchain_core', 'Cross compilation and binary utilities pack', 'build_pack.json', 'Build & Toolchains', ['Cross-Compilation & Binary Utilities']);
    case 'build_quality_core':
      return bundledPackLibrarySelection('build_quality_core', 'Debugging coverage documentation and CI pack', 'build_pack.json', 'Build & Toolchains', ['Debugging, Coverage & Documentation']);
    case 'build_all':
      return combinePreservingLibraries('build_all', 'All build pack', ['cmake_core', 'gcc_core', 'clang_core', 'mingw_core', 'msvc_core', 'make_ninja_core', 'meson_core', 'deps_core', 'cross_toolchain_core', 'build_quality_core']);
    case 'system_automation_core':
      return bundledPackLibrarySelection('system_automation_core', 'Cross-platform automation pack', 'system_scripting_pack.json', 'Scripting / System', ['Cross-Platform Automation']);
    case 'powershell_core':
      return bundledPackLibrarySelection('powershell_core', 'PowerShell 7 structured automation pack', 'system_scripting_pack.json', 'Scripting / System', ['PowerShell 7']);
    case 'batch_core':
      return bundledPackLibrarySelection('batch_core', 'Windows CMD and Batch structured pack', 'system_scripting_pack.json', 'Scripting / System', ['Windows CMD & Batch']);
    case 'bash_core':
      return bundledPackLibrarySelection('bash_core', 'Bash and POSIX shell structured pack', 'system_scripting_pack.json', 'Scripting / System', ['Bash & POSIX Shell']);
    case 'linux_admin_core':
      return bundledPackLibrarySelection('linux_admin_core', 'Linux systemd and administration pack', 'system_scripting_pack.json', 'Scripting / System', ['Linux systemd & Administration']);
    case 'devops_core':
      return bundledPackLibrarySelection('devops_core', 'Git SSH Docker and DevOps pack', 'system_scripting_pack.json', 'Scripting / System', ['Git Version Control', 'OpenSSH & Secure Remote Access', 'Docker & Containers', 'DevOps, CI & Release Automation']);
    case 'scripting_all':
      return combinePreservingLibraries('scripting_all', 'All scripting and system pack', ['system_automation_core', 'powershell_core', 'batch_core', 'bash_core', 'linux_admin_core', 'devops_core']);
    case 'additional_all':
      return combinePreservingLibraries('additional_all', 'Curated additional language packs', ['python_core', 'web_core', 'typescript_core', 'php_core']);
    case 'assembly_core':
      return bundledPackFileSelection('assembly_core', 'Assembly complete structured pack', 'assembly_language_pack.json', ['Assembly']);
    case 'assembly_fundamentals':
      return bundledPackLibrarySelection('assembly_fundamentals', 'Assembly fundamentals and toolchains pack', 'assembly_language_pack.json', 'Assembly', ['Assembly Fundamentals & Toolchains']);
    case 'x86_asm_core':
      return bundledPackLibrarySelection('x86_asm_core', 'x86 and x86-64 assembly pack', 'assembly_language_pack.json', 'Assembly', ['x86 / x86-64 Assembly']);
    case 'arm_asm_core':
      return bundledPackLibrarySelection('arm_asm_core', 'ARM Cortex-M and Thumb assembly pack', 'assembly_language_pack.json', 'Assembly', ['ARM Cortex-M / Thumb Assembly']);
    case 'avr_asm_core':
      return bundledPackLibrarySelection('avr_asm_core', 'AVR 8-bit assembly pack', 'assembly_language_pack.json', 'Assembly', ['AVR 8-bit Assembly (ATmega328P / ATmega2560)']);
    case 'riscv_asm_core':
      return bundledPackLibrarySelection('riscv_asm_core', 'RISC-V assembly pack', 'assembly_language_pack.json', 'Assembly', ['RISC-V Assembly']);
    case 'mcu_asm_core':
      return bundledPackLibrarySelection('mcu_asm_core', 'Microcontroller assembly workflows pack', 'assembly_language_pack.json', 'Assembly', ['Microcontroller Assembly Workflows']);
    case 'assembly_all':
      return bundledPackFileSelection('assembly_all', 'All assembly pack', 'assembly_language_pack.json', ['Assembly']);
    case 'embedded_core':
      return bundledPackLibrarySelection('embedded_core', 'Embedded systems patterns pack', 'embedded_language_pack.json', 'Embedded', ['Embedded Systems']);
    case 'arduino_core':
      return bundledPackLibrarySelection('arduino_core', 'Arduino AVR UNO Nano ATmega328P pack', 'embedded_language_pack.json', 'Embedded', ['Arduino AVR (UNO / Nano ATmega328P)']);
    case 'arduino_mega_core':
      return bundledPackLibrarySelection('arduino_mega_core', 'Arduino Mega 2560 ATmega2560 pack', 'embedded_language_pack.json', 'Embedded', ['Arduino Mega 2560 (ATmega2560)']);
    case 'esp32_core':
      return bundledPackLibrarySelection('esp32_core', 'ESP32 Arduino pack', 'embedded_language_pack.json', 'Embedded', ['ESP32 Arduino']);
    case 'raspi_core':
      return bundledPackLibrarySelection('raspi_core', 'Raspberry Pi Linux embedded pack', 'embedded_language_pack.json', 'Embedded', ['Raspberry Pi Linux Embedded']);
    case 'stm32_core':
      return bundledPackLibrarySelection('stm32_core', 'STM32 HAL and CubeProgrammer pack', 'embedded_language_pack.json', 'Embedded', ['STM32 HAL & CubeProgrammer']);
    case 'pic_core':
      return bundledPackLibrarySelection('pic_core', 'Microchip PIC embedded pack', 'embedded_language_pack.json', 'Embedded', ['PIC XC8 / XC16 / XC32 Bare Metal', 'MPLAB X / Microchip Toolchain']);
    case 'msp_core':
      return bundledPackLibrarySelection('msp_core', 'Texas Instruments MSP embedded pack', 'embedded_language_pack.json', 'Embedded', ['MSP430 Bare Metal / DriverLib', 'TI MSP Toolchain & Flashing']);
    case 'embedded_all':
      return bundledPackFileSelection('embedded_all', 'All embedded pack', 'embedded_language_pack.json', ['Embedded']);
    case 'sdl_all':
      return bundledPackFileSelection('sdl_all', 'SDL2 / SDL3 structured pack', 'sdl_pack.json', ['SDL']);
    case 'sdl2_all':
      return bundledPackFileSelection('sdl2_all', 'SDL2 structured pack', 'sdl2_language_pack.json', ['SDL']);
    case 'sdl3_all':
      return bundledPackFileSelection('sdl3_all', 'SDL3 structured pack', 'sdl3_language_pack.json', ['SDL']);
    case 'win32_gui_all':
      return bundledPackLibrarySelection('win32_gui_all', 'Win32 GUI structured pack', 'windows_api_device_pack.json', 'Windows API / Devices', ['User32', 'GDI32', 'Comdlg32', 'Comctl32', 'Kernel32', 'Shell32', 'Wtsapi32', 'Advapi32', 'DbgHelp', 'Winsock2', 'Iphlpapi', 'Psapi']);
    case 'windows_devices_all':
      return bundledPackLibrarySelection('windows_devices_all', 'Windows Devices structured pack', 'windows_api_device_pack.json', 'Windows API / Devices', ['WinMM', 'Core Audio', 'XInput', 'Raw Input', 'Media Foundation', 'DirectShow', 'HID & SetupAPI', 'Bluetooth', 'Serial Ports', 'WinUSB', 'SetupAPI Advanced', 'Bluetooth LE', 'Media Foundation Advanced']);
    case 'windows_all':
      return bundledPackFileSelection('windows_all', 'Windows API / Devices structured pack', 'windows_api_device_pack.json', ['Windows API / Devices']);
    case 'lua_all':
      return bundledPackFileSelection('lua_all', 'Lua pack', 'lua_pack.json', ['Lua']);
    case 'lua_standard':
      return bundledPackLibraryEnvironmentSelection('lua_standard', 'Lua standard 5.4 pack', 'lua_pack.json', 'Lua', ['Lua standard 5.4']);
    case 'lua_industrial':
      return bundledPackLibraryEnvironmentSelection('lua_industrial', 'Lua industriel / banc de test pack', 'lua_pack.json', 'Lua', ['Lua industriel / banc de test']);
    case 'lua_stormworks':
      return bundledPackLibraryEnvironmentSelection('lua_stormworks', 'Stormworks Lua microcontroller pack', 'lua_pack.json', 'Lua', ['Stormworks Lua microcontroller']);
    case 'examples_all':
      return combinePreservingLibraries('examples_all', 'All example packs', ['opencv_robotics_example', 'win32_hooks_example', 'uart_protocol_example', 'instrumentation_example']);
    case 'all_packs':
      return combinePreservingLibraries('all_packs', 'Curated CPM packs', ['c_all', 'cpp_all', 'preprocessor_core', 'opencv_all', 'build_all', 'sdl_all', 'windows_all', 'scripting_all', 'python_core', 'web_core', 'typescript_core', 'database_all', 'php_core', 'embedded_all', 'lua_all']);
    default:
      return direct(id as LanguagePackMode);
  }
}

async function chooseGroupedStarterPack(packName: string): Promise<StarterPackSelection | undefined> {
  const families = [
    { label: 'Add all curated CPM packs', description: 'Insert the reduced Marketplace-safe CPM pack set in one operation', value: 'all' },
    { label: 'C pack', description: 'Modern C language and DLL helpers, with LabWindows/CVI available as a dedicated CVI environment', value: 'c' },
    { label: 'C++ pack', description: 'Structured C++ pack loaded from cpp_language_pack.json: types, parametric API calls, STL, concurrency, files, interop, Qt helpers, and DLL patterns', value: 'cpp' },
    { label: 'Preprocessor pack', description: 'Shared C/C++ preprocessor content: macros, variadic macros, pragmas, #if, # and ##', value: 'preprocessor' },
    { label: 'OpenCV pack', description: 'OpenCV language pack with camera and vision helpers', value: 'opencv' },
    { label: 'Build pack', description: 'CMake, CTest, CPack, GCC, G++, Clang, LLVM, MinGW, MSVC, Make, Ninja, and C/C++ dependency helpers', value: 'build' },
    { label: 'SDL pack', description: 'Audited SDL2 and SDL3 structured content with documented advanced pickers and migration helpers', value: 'sdl' },
    { label: 'Windows API / Devices pack', description: 'Win32 GUI plus Windows device APIs including audio, input, camera, HID, Bluetooth, serial, and USB helpers', value: 'windows' },
    { label: 'Scripting / System pack', description: 'Cross-platform automation, PowerShell 7, Windows CMD/Batch, Bash/POSIX shell, Linux systemd administration, Git, SSH, Docker, and DevOps helpers', value: 'scripting' },
    { label: 'Python language pack', description: 'Complete structured Python pack: language, typing, collections, files/configuration, persistence, asyncio, HTTP/FastAPI, Linux, serial, USB, BLE, scientific computing, AI, GUI, automation, and robotics', value: 'python_core' },
    { label: 'JavaScript / HTML / CSS pack', description: 'Curated structured web pack: functional JavaScript groups, DOM, Fetch, storage, Service Workers, IndexedDB, Canvas, WebGL, HTML, CSS, React, Vue, Svelte, Electron, VS Code webviews, Node.js, Express, tooling and retained architectural recipes', value: 'web_core' },
    { label: 'PHP language pack', description: 'Complete structured PHP 8.5 pack: language, callables, OOP, SPL, files/configuration, PDO, security, HTTP, Composer, PHPUnit, Twig, Laravel, Symfony, WordPress, workers, and Linux deployment', value: 'php_core' },
    { label: 'TypeScript language pack', description: 'Structured TypeScript pack: declarations, narrowing, generics, modules, typed DOM, frameworks, Node.js, validation, tests, TSConfig, desktop bridges and device I/O', value: 'typescript_core' },
    { label: 'Database pack', description: 'Structured SQL, NoSQL, client C APIs, ODBC, SQLAlchemy/Alembic, hiredis and operations pack with parameterized direct cards and retained recipes', value: 'database' },
    { label: 'Lua pack', description: 'Lua standard, industrial/test-bench Lua, LuaFileSystem, and Stormworks microcontroller Lua content', value: 'lua' },
    { label: 'Embedded pack', description: 'Embedded-specific patterns, Arduino AVR registers and ISR vectors, ESP32 Arduino peripherals/connectivity, and Raspberry Pi Linux hardware interfaces', value: 'embedded' },
  ];

  const family = await vscode.window.showQuickPick(families, {
    title: `Choose a pack family — ${packName}`,
    placeHolder: 'Choose a pack family'
  });
  if (!family) return undefined;
  if (family.value === 'all') {
    return buildStarterPackSelection('all_packs');
  }
  if (['python_core', 'web_core', 'php_core', 'typescript_core'].includes(family.value)) {
    return buildStarterPackSelection(family.value);
  }

  const groupedChoices: Record<string, { label: string; description: string; value: string }[]> = {
    c: [
      { label: 'Add all C pack', description: 'Add C language pack and C DLL helpers at once', value: 'c_all' },
      { label: 'C language pack', description: 'Unified structured ISO C and systems C pack: Standard Library, language basics, C23 keywords, preprocessor, pointers, callbacks, memory, files/configuration, POSIX and Windows APIs, threads, sockets, HTTP, serial, USB, buses, diagnostics, CMake, portability, and ABI patterns', value: 'c_core' },
      { label: 'C DLL helpers', description: 'Windows DLL helpers and manual loading patterns for C', value: 'c_dll' },
      { label: 'LabWindows/CVI', description: 'Add the complete LabWindows/CVI catalog under the dedicated CVI environment', value: 'cvi_core' },
    ],
    cpp: [
      { label: 'Add all C++ pack', description: 'Add the complete C++ language pack and C++ DLL helpers together', value: 'cpp_all' },
      { label: 'C++ language pack', description: 'Structured C++ pack loaded from cpp_language_pack.json, with parametric STL, files, concurrency, serial, USB, networking, IPC, DLL and Qt APIs', value: 'cpp_core' },
      { label: 'C++ DLL helpers', description: 'Windows DLL helpers and runtime loading patterns for C++', value: 'cpp_dll' }
    ],
    preprocessor: [
      { label: 'C/C++ preprocessor pack', description: 'Macros, variadic macros, conditional compilation, pragmas, #, ##, and X-macros', value: 'preprocessor_core' }
    ],
    qt: [
      { label: 'Add all Qt pack', description: 'Add Qt C++ libraries and the complete Qt for Python / PySide6 library together', value: 'qt_all' },
      { label: 'Qt C++ pack', description: 'Structured Qt C++ pack loaded from qt_pack.json: QObject, signals, timers, Widgets dialogs, declarative QML templates, multimedia, SQL, tests, plugins, CMake, networking, serial, and threading', value: 'qt_full' },
      { label: 'Qt for Python / PySide6 pack', description: 'Structured PySide6 pack: QObject, Signal, Slot, event loop, processEvents, QTimer, widgets, Designer, models, files, settings, processes, serial, networking, QThread, thread pool, painting, QLibrary, plugins, QML, and deployment tools', value: 'qt_pyside_core' },
      { label: 'Qt QML pack', description: 'Qt Quick, bindings, loaders, Connections, and C++ backend integration', value: 'qml_core' },
    ],
    opencv: [
      { label: 'Add all OpenCV pack', description: 'Add OpenCV language content and camera/vision helpers together', value: 'opencv_all' },
      { label: 'OpenCV language pack', description: 'OpenCV core + vision premium merged into one richer pack', value: 'opencv_full' },
      { label: 'OpenCV camera and robotics example pack', description: 'Camera loops, overlays, tracking, state machines, and vision-to-command patterns', value: 'opencv_robotics_example' }
    ],
    build: [
      { label: 'Add all build pack', description: 'Add compilation, packaging, dependency, cross-compilation, binary inspection, debugging, coverage, documentation, and CI helpers at once', value: 'build_all' },
      { label: 'CMake, CTest and CPack pack', description: 'Structured configure, build, install, workflow, language, test, package, and preset cards', value: 'cmake_core' },
      { label: 'GCC and G++ build pack', description: 'Structured GCC, G++, ar, nm, objdump, sanitizer, warning, standard, and optimization cards', value: 'gcc_core' },
      { label: 'G++ build pack', description: 'Compatibility route for the structured GCC and G++ library', value: 'gpp_core' },
      { label: 'Clang and LLVM pack', description: 'Structured clang, clang++, clang-tidy, clang-format, and llvm-nm cards', value: 'clang_core' },
      { label: 'MinGW build pack', description: 'Structured Windows GCC, G++, DLL, import-library, and windres cards', value: 'mingw_core' },
      { label: 'MSVC Build Tools pack', description: 'Structured cl.exe, MSBuild, DLL, object, and dumpbin cards', value: 'msvc_core' },
      { label: 'Make and Ninja pack', description: 'Structured GNU Make, mingw32-make, Ninja, clean, and compilation-database cards', value: 'make_ninja_core' },
      { label: 'Meson build system pack', description: 'Structured Meson setup, configure, compile, test, install, introspection, cross-file, wrap dependency, and Ninja backend cards', value: 'meson_core' },
      { label: 'C/C++ dependency managers pack', description: 'Structured pkg-config, vcpkg manifest-mode, and Conan cards', value: 'deps_core' },
      { label: 'Cross-compilation and binary utilities pack', description: 'CMake toolchain files, linker scripts, objcopy, readelf, objdump, size, strip, addr2line, strings, archives, and Arm GNU toolchain helpers', value: 'cross_toolchain_core' },
      { label: 'Debugging, coverage, documentation and CI pack', description: 'GDB, LLDB, gcov, gcovr, LCOV, LLVM coverage, sanitizers, cppcheck, Doxygen, MSBuild diagnostics, and CI skeletons', value: 'build_quality_core' }
    ],
    sdl: [
      { label: 'Add all SDL2 / SDL3 pack', description: 'Add both SDL2 extension libraries and the SDL3 modern API pack', value: 'sdl_all' },
      { label: 'SDL2 complete pack', description: 'Add SDL2, SDL2_image, SDL2_ttf, SDL2_mixer and SDL2_net structured content', value: 'sdl2_all' },
      { label: 'SDL3 complete pack', description: 'Add SDL3 windowing, renderer, events, properties, snippets and SDL2-to-SDL3 migration helpers', value: 'sdl3_all' }
    ],
    windows: [
      { label: 'Add Windows API / Devices structured pack', description: 'Add both Win32 GUI and Windows Devices with documented multi-select flag pickers', value: 'windows_all' },
      { label: 'Win32 GUI structured pack', description: 'Add User32, GDI32, Comdlg32, and Comctl32 with documented advanced flag selectors', value: 'win32_gui_all' },
      { label: 'Windows Devices structured pack', description: 'Add audio, input, camera, HID, Bluetooth, serial, WinUSB, SetupAPI and BLE helpers with documented flag selectors', value: 'windows_devices_all' }
    ],
    scripting: [
      { label: 'Add all scripting / system pack', description: 'Add cross-platform automation, PowerShell 7, Windows CMD/Batch, Bash/POSIX shell, Linux systemd administration, and Git/SSH/Docker/DevOps helpers together', value: 'scripting_all' },
      { label: 'Cross-platform automation pack', description: 'Portable script design, reliability, configuration, HTTP, network diagnostics, file transfer, build orchestration, packaging, and release metadata patterns', value: 'system_automation_core' },
      { label: 'PowerShell 7 pack', description: 'PowerShell language, modules, files, JSON, processes, jobs, remoting, Windows services, registry, network diagnostics, execution policies, CMake, Qt deployment, and VSIX packaging', value: 'powershell_core' },
      { label: 'Windows CMD / Batch pack', description: 'Batch syntax, variables, delayed expansion, file operations, robocopy, text processing, processes, services, scheduled tasks, network diagnostics, CMake, and VSIX packaging', value: 'batch_core' },
      { label: 'Bash & POSIX shell pack', description: 'Safe shell skeletons, parameters, arrays, text processing, files, locks, services, journalctl, SSH, rsync, network diagnostics, CMake, and deployment workflows', value: 'bash_core' },
      { label: 'Linux systemd & administration pack', description: 'systemd service, timer, path, and socket units; systemctl; journalctl; coredump diagnostics; host inspection; networking; users; permissions; and package-management helpers', value: 'linux_admin_core' },
      { label: 'Git, SSH, Docker & DevOps pack', description: 'Git daily workflows and recovery, OpenSSH keys and forwarding, Docker CLI, Dockerfiles, Compose, CI, environment files, and release automation helpers', value: 'devops_core' }
    ],
    additional: [
      { label: 'Add curated additional language packs', description: 'Add Python, JavaScript/HTML/CSS, TypeScript, and PHP packs together', value: 'additional_all' },
      { label: 'Python language pack', description: 'Complete structured Python pack: language, typing, collections, files/config, persistence, asyncio, processes, HTTP/FastAPI, Linux, serial, USB, BLE, native DLL interop, testing, packaging, scientific computing, DSP, AI, GUI, automation, and robotics', value: 'python_core' },
      { label: 'JavaScript / HTML / CSS pack', description: 'Curated structured JavaScript / HTML / CSS pack: organized operators, objects, arrays, strings, RegExp, DOM, Fetch, storage, Service Workers, IndexedDB, Canvas, WebGL, HTML, CSS, frameworks, desktop bridges, Node.js, Express and retained architectural recipes', value: 'web_core' },
      { label: 'PHP language pack', description: 'Complete structured PHP 8.5 pack: modern syntax, callables, OOP, enums, attributes, SPL, streams, JSON, PDO, web security, sessions, cURL, Composer, PHPUnit, Twig, Laravel, Symfony, WordPress, workers, FPM, Docker, and Linux deployment', value: 'php_core' },
      { label: 'TypeScript language pack', description: 'Structured TypeScript pack: type system, narrowing, classes, generics, modules, typed browser APIs, frameworks, Node.js, backend validation, build tools, desktop bridges and protocol helpers', value: 'typescript_core' },
    ],
    database: [
      { label: 'Add all database pack', description: 'Add structured SQL, NoSQL, C client APIs, ODBC, SQLAlchemy/Alembic, hiredis and database operations libraries together', value: 'database_all' },
      { label: 'SQL fundamentals & relational design', description: 'Portable SQL modeling, schema constraints, indexes, SELECT, joins, mutations, CTEs, windows, transactions, privileges, migrations, and performance diagnostics', value: 'database_core' },
      { label: 'SQLite local database', description: 'SQLite PRAGMA configuration, WAL, busy timeout, foreign keys, UPSERT, JSON, FTS5, indexes, CLI, backup, and CSV export', value: 'sqlite_core' },
      { label: 'PostgreSQL', description: 'PostgreSQL identity, UUID, arrays, JSONB, RETURNING, ON CONFLICT, advanced indexes, locking, LISTEN/NOTIFY, COPY, psql, backups, roles, and schemas', value: 'postgres_core' },
      { label: 'MySQL / MariaDB', description: 'InnoDB schema, AUTO_INCREMENT, foreign keys, ON DUPLICATE KEY UPDATE, JSON, generated columns, indexes, EXPLAIN, CLI, and backup patterns', value: 'mysql_core' },
      { label: 'SQL Server / T-SQL', description: 'SQL Server IDENTITY, NVARCHAR, OUTPUT, TRY/CATCH transactions, CTEs, temp tables, stored procedures, JSON, filtered indexes, query statistics, and sqlcmd', value: 'sqlserver_core' },
      { label: 'DuckDB local analytics', description: 'Embedded OLAP database, direct CSV/Parquet/JSON queries, COPY import/export, analytical aggregation, EXPLAIN ANALYZE, and extensions', value: 'duckdb_core' },
      { label: 'MongoDB document database', description: 'MongoDB document modeling, CRUD, validation, indexes, aggregation pipelines, transactions, TTL, text search, and change streams', value: 'mongodb_core' },
      { label: 'Redis cache, queues & streams', description: 'Redis strings, counters, TTL, hashes, sets, sorted sets, queues, streams, consumer groups, Pub/Sub, transactions, Lua scripts, ACLs, and diagnostics', value: 'redis_core' },
      { label: 'SQLite3 C API', description: 'SQLite3 C connections, prepared statements, bindings, row extraction, diagnostics and online backup lifecycle', value: 'sqlite_c_core' },
      { label: 'PostgreSQL libpq C API', description: 'Official PostgreSQL C client connections, parameterized queries, prepared statements, result ownership and asynchronous processing', value: 'libpq_core' },
      { label: 'MySQL client C API', description: 'libmysqlclient connection, buffered and streaming results, diagnostics and prepared statement lifecycle', value: 'mysql_capi_core' },
      { label: 'ODBC C API', description: 'Portable ODBC handle lifecycle, driver connections, statements, parameter bindings, row retrieval and diagnostics', value: 'odbc_core' },
      { label: 'SQLAlchemy and Alembic', description: 'SQLAlchemy 2.x Engine, Connection, Session and Alembic migration workflows', value: 'sqlalchemy_core' },
      { label: 'Redis hiredis C API', description: 'Redis hiredis connection, commands, reply ownership and pipelines', value: 'hiredis_core' },
      { label: 'Database operations, backup and replication', description: 'PostgreSQL, MySQL, SQLite, MongoDB and Redis operational backup, health-check and replication helpers', value: 'dbops_core' }
    ],
    lua: [
      { label: 'Add all Lua pack', description: 'Add one Lua environment containing Lua standard 5.4, industrial/test-bench Lua, LuaFileSystem, and Stormworks libraries', value: 'lua_all' },
      { label: 'Lua standard 5.4', description: 'Syntax, tables, functions, modules, errors, strings, patterns, math, IO, coroutines, versions, and pitfalls', value: 'lua_standard' },
      { label: 'Lua industriel / banc de test', description: 'External communication references and test-sequence/logging patterns', value: 'lua_industrial' },
      { label: 'Stormworks Lua microcontroller', description: 'onTick/onDraw lifecycle, composite I/O, screen drawing, map conversion, properties, async HTTP, and practical Stormworks snippets', value: 'lua_stormworks' }
    ],
    assembly: [
      { label: 'Add all assembly pack', description: 'Add x86/x64, ARM Cortex-M/Thumb, AVR, RISC-V and microcontroller assembly workflows together', value: 'assembly_all' },
      { label: 'Assembly fundamentals and toolchains', description: 'Common syntax, sections, directives, ABI notes, stack frames and toolchain commands', value: 'assembly_fundamentals' },
      { label: 'x86 / x86-64 assembly', description: 'Intel-syntax registers, addressing, instructions, SysV ABI, Windows x64 ABI, Linux syscalls and SIMD snippets', value: 'x86_asm_core' },
      { label: 'ARM Cortex-M / Thumb assembly', description: 'Cortex-M registers, Thumb instructions, vector table, Reset_Handler, exceptions, barriers and arm-none-eabi commands', value: 'arm_asm_core' },
      { label: 'AVR 8-bit assembly', description: 'AVR registers, I/O bit operations, vectors, ISR skeletons, bootloader jump and avr-gcc/avr-objcopy/avrdude workflows', value: 'avr_asm_core' },
      { label: 'RISC-V assembly', description: 'RISC-V ABI registers, instructions, CSRs, trap vectors, startup and riscv-none-elf workflows', value: 'riscv_asm_core' },
      { label: 'Microcontroller assembly workflows', description: 'ATmega328P and STM32 Cortex-M assembly recipes for GPIO, startup and low-level register work', value: 'mcu_asm_core' }
    ],
    embedded: [
      { label: 'Add all embedded pack', description: 'Add embedded architecture patterns, Arduino AVR registers, linker and bootloader templates, ESP32, STM32, Raspberry Pi, Microchip PIC, and Texas Instruments MSP helpers together', value: 'embedded_all' },
      { label: 'Embedded systems patterns', description: 'Bare-metal architecture plus structured FreeRTOS APIs, linker scripts, memory maps and bootloader workflows', value: 'embedded_core' },
      { label: 'Arduino AVR UNO / Nano pack', description: 'Structured Arduino Core plus complete ATmega328P register-configuration blocks, timers, GPIO, ADC, USART, SPI, TWI, EEPROM, watchdog, sleep and arduino-cli cards', value: 'arduino_core' },
      { label: 'Arduino Mega 2560 pack', description: 'Structured Arduino Mega pack with ATmega2560 board mapping, GPIO ports, Timer0/1/2/3/4/5, USART0..3, ADC, SPI, TWI, linker and bootloader cards', value: 'arduino_mega_core' },
      { label: 'ESP32 Arduino pack', description: 'Structured ESP32 Arduino LEDC, timer, Preferences, Wi-Fi, ESP-NOW, RMT, I2S, native USB CDC, ESP-Modbus v2, ESP-IDF TWAI, esptool, UART, I2C and deep-sleep cards', value: 'esp32_core' },
      { label: 'STM32 HAL and CubeProgrammer pack', description: 'Structured STM32 HAL GPIO, UART, I2C, SPI, DMA, bxCAN, FDCAN, USB CDC/HID, STM32CubeProgrammer, OpenOCD, dfu-util and stm32flash cards', value: 'stm32_core' },
      { label: 'Raspberry Pi Linux embedded pack', description: 'Structured libgpiod 2.x GPIO, i2c-tools, UART, libmodbus RTU and rpicam-apps commands plus Raspberry Pi deployment and MCU-coordination notes', value: 'raspi_core' },
      { label: 'Microchip PIC pack', description: 'PIC16/PIC18/PIC24/dsPIC33/PIC32 helpers for XC8/XC16/XC32 config bits, oscillator, GPIO, PPS, interrupts, peripherals, linker memory and bootloader workflows', value: 'pic_core' },
      { label: 'Texas Instruments MSP pack', description: 'MSP430 and MSP432-oriented helpers for watchdog, clocks, GPIO, Timer_A, ADC, USCI/eUSCI, interrupts, low-power modes, linker command files, BSL and flashing workflows', value: 'msp_core' }
    ],
    examples: [
      { label: 'Add all example packs', description: 'Add every premium example pack in one operation', value: 'examples_all' },
      { label: 'OpenCV camera and robotics example pack', description: 'OpenCV examples oriented to live camera, recovery, tracking, and robotics logic', value: 'opencv_robotics_example' },
      { label: 'Win32 hooks and input example pack', description: 'Global hotkeys, hooks, raw input, overlays, and low-level input helpers', value: 'win32_hooks_example' },
      { label: 'UART protocol example pack', description: 'Framing, ACK/NACK, CRC, state-machine parsing, and serial transactions', value: 'uart_protocol_example' },
      { label: 'Test bench and instrumentation example pack', description: 'Bench steps, limits, CSV logs, SCPI helpers, and settling-time patterns', value: 'instrumentation_example' }
    ]
  };

  const choice = await vscode.window.showQuickPick(groupedChoices[family.value] || [], {
    title: `Choose the pack to add — ${packName}`,
    placeHolder: 'Choose the specific pack or add the whole family'
  });
  if (!choice) return undefined;
  return buildStarterPackSelection(choice.value);
}

async function importLanguageStarterIntoPackFile(pack: LoadedPack, target?: { environmentName?: string; libraryName?: string; categoryName?: string }): Promise<{ added: number; environmentName: string; libraryName: string; label: string } | undefined> {
  const packFile = readPackFile(pack.filePath);
  const starter = await chooseGroupedStarterPack(pack.name);
  if (!starter) return undefined;

  const starterEnvironmentNames = [...new Set(starter.entries.map((entry) => entry.environment).filter((value): value is string => !!value))];
  const effectiveTarget = starter.forceCanonicalHierarchy ? undefined : target;
  const preserveStarterEnvironments = !effectiveTarget?.environmentName && !!starter.preserveEnvironments && starterEnvironmentNames.length > 0;

  let selectedEnvironmentName = effectiveTarget?.environmentName;
  if (!preserveStarterEnvironments) {
    selectedEnvironmentName = selectedEnvironmentName || await chooseTargetEnvironment(packFile, `Choose the target environment for starter content — ${pack.name}`);
    if (!selectedEnvironmentName) return undefined;
    ensureEnvironment(packFile, selectedEnvironmentName);
  }

  let added = 0;
  const touchedLibraries = new Set<string>();
  const touchedEnvironments = new Set<string>();

  for (const entry of starter.entries) {
    const targetEnvironmentName = selectedEnvironmentName || entry.environment || starterEnvironmentNames[0];
    if (!targetEnvironmentName) continue;
    const implicitDestination = !effectiveTarget?.categoryName
      ? starterNestedDestinationForEntry(entry.library || starter.libraryName, entry.category, entry)
      : undefined;
    const targetLibraryName = effectiveTarget?.libraryName || implicitDestination?.libraryName || entry.library || starter.libraryName;
    const categoryName = effectiveTarget?.categoryName || implicitDestination?.categoryName || entry.category;
    const { category } = ensureEnvironmentLibraryCategory(packFile, targetEnvironmentName, targetLibraryName, categoryName);
    if (getCategoryAllFunctions(category).some((fn) => fn.name === entry.name)) continue;
    const { __jcGroupPath: _discardedGroupPath, ...entryWithoutInternalMetadata } = entry;
    const normalizedEntry = { ...entryWithoutInternalMetadata, environment: targetEnvironmentName, library: targetLibraryName, category: categoryName };
    const targetGroup = implicitDestination ? ensureNestedGroup(category, implicitDestination.groupPath) : undefined;
    if (targetGroup) {
      targetGroup.functions = Array.isArray(targetGroup.functions) ? targetGroup.functions : [];
      targetGroup.functions.push(normalizedEntry);
    } else {
      category.functions.push(normalizedEntry);
    }
    touchedLibraries.add(targetLibraryName);
    touchedEnvironments.add(targetEnvironmentName);
    added += 1;
  }

  writePackFile(pack.filePath, packFile);

  const libraryName = touchedLibraries.size === 1
    ? [...touchedLibraries][0]
    : `${touchedLibraries.size} libraries`;
  const environmentName = touchedEnvironments.size === 1
    ? [...touchedEnvironments][0]
    : `${touchedEnvironments.size} environments`;

  return { added, environmentName, libraryName, label: starter.label };
}

async function importSnippetFileIntoPackFile(pack: LoadedPack, target?: { environmentName?: string; libraryName?: string; categoryName?: string }): Promise<{ added: number; environmentName: string; libraryName: string; categoryName: string; filePath: string } | undefined> {
  const picked = await vscode.window.showOpenDialog({
    title: 'Import file as snippet',
    canSelectMany: false,
    filters: {
      'Code / text': ['txt', 'c', 'h', 'cpp', 'hpp', 'cc', 'cxx', 'inl', 'ipp']
    }
  });
  const sourceUri = picked?.[0];
  if (!sourceUri) return undefined;
  const sourceText = fs.readFileSync(sourceUri.fsPath, 'utf8');
  const packFile = readPackFile(pack.filePath);

  const environmentName = target?.environmentName || await chooseTargetEnvironment(packFile, `Choose the target environment for snippet — ${pack.name}`);
  if (!environmentName) return undefined;

  let libraryName = target?.libraryName;
  if (!libraryName) {
    const existing = (ensureEnvironment(packFile, environmentName).libraries || []).map((item) => ({ label: item.name, value: item.name }));
    const choice = await vscode.window.showQuickPick([
      ...existing,
      { label: '$(add) Create new library', value: '__create__' }
    ], { title: `Choose the target library for snippet — ${pack.name}` });
    if (!choice) return undefined;
    if (choice.value === '__create__') {
      const created = await promptForText({ title: 'New library', prompt: 'Library name', placeHolder: 'Imported Snippets' });
      if (!created) return undefined;
      libraryName = created;
    } else {
      libraryName = choice.value;
    }
  }

  let categoryName = target?.categoryName;
  if (!categoryName) {
    const library = findLibraryAcrossEnvironments(packFile, libraryName, environmentName)?.library;
    const existingCats = library?.categories?.map((item) => ({ label: item.name, value: item.name })) || [];
    const choice = await vscode.window.showQuickPick([
      ...existingCats,
      { label: 'Snippets', value: 'Snippets' },
      { label: 'DLL Helpers', value: 'DLL Helpers' },
      { label: '$(add) Create new category', value: '__create__' }
    ], { title: `Choose the target category for snippet — ${libraryName}` });
    if (!choice) return undefined;
    if (choice.value === '__create__') {
      const created = await promptForText({ title: 'New category', prompt: 'Category name', placeHolder: 'Snippets' });
      if (!created) return undefined;
      categoryName = created;
    } else {
      categoryName = choice.value;
    }
  }

  const baseName = path.basename(sourceUri.fsPath, path.extname(sourceUri.fsPath));
  const snippetName = await promptForText({ title: 'Snippet name', prompt: 'Name for the imported snippet', value: baseName, placeHolder: 'MySnippet' });
  if (!snippetName) return undefined;
  const description = await promptForOptionalText('Snippet description', 'Optional description for this snippet', '', 'Describe what this snippet does');
  if (description === undefined) return undefined;

  const { category } = ensureEnvironmentLibraryCategory(packFile, environmentName, libraryName!, categoryName!);
  const finalName = uniqueName(snippetName, (category.functions || []).map((item) => item.name));
  category.functions.push({
    name: finalName,
    returnType: 'snippet',
    signature: finalName,
    declaration: sourceText,
    insertText: sourceText,
    description: description || `Imported from ${path.basename(sourceUri.fsPath)}.`,
    longDescription: '',
    header: path.basename(sourceUri.fsPath),
    returnDescription: '',
    parameters: [],
    symbolKind: 'snippet',
    environment: environmentName,
    library: libraryName,
    category: categoryName
  });

  writePackFile(pack.filePath, packFile);
  return { added: 1, environmentName, libraryName: libraryName!, categoryName: categoryName!, filePath: sourceUri.fsPath };
}

class CpmItem extends vscode.TreeItem {
  constructor(
    public readonly kind: NodeKind,
    public readonly labelText: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly functionData?: CpmFunction,
    public readonly parentLabel?: string,
    public readonly descriptionText?: string,
    public readonly stableId?: string,
    public readonly parentStableId?: string,
    public readonly refs?: { environmentName?: string; libraryName?: string; categoryName?: string; groupPath?: number[] }
  ) {
    super(labelText, collapsibleState);
    this.id = stableId ?? `${kind}:${parentLabel ?? 'root'}:${labelText}`;
    this.tooltip = labelText;

    if (kind === 'environment') {
      this.contextValue = 'cpmEnvironment';
      this.iconPath = getCustomTreeIcon('environment');
      this.description = descriptionText ?? 'Environment';
    } else if (kind === 'library') {
      this.contextValue = 'cpmLibrary';
      this.iconPath = getCustomTreeIcon('library');
      this.description = descriptionText ?? 'Library';
    } else if (kind === 'category') {
      this.contextValue = 'cpmCategory';
      this.iconPath = getCustomTreeIcon('category');
      this.description = descriptionText ?? parentLabel;
    } else if (kind === 'group') {
      this.contextValue = 'cpmGroup';
      this.iconPath = getCustomTreeIcon('group');
      this.description = descriptionText ?? 'Group';
    } else {
      this.contextValue = 'cpmFunction';
      this.iconPath = new vscode.ThemeIcon('symbol-function');
      this.description = descriptionText ?? functionData?.returnType;
    }
  }
}

class CpmTreeProvider implements vscode.TreeDataProvider<CpmItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CpmItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private filterTerm = '';
  private filteredItems: CpmItem[] = [];

  constructor(private db: CpmDatabase) {
    this.rebuildFilter();
  }

  setDatabase(db: CpmDatabase): void {
    this.db = db;
    this.refresh();
  }

  getDatabase(): CpmDatabase {
    return this.db;
  }

  refresh(): void {
    this.rebuildFilter();
    this._onDidChangeTreeData.fire();
  }

  setFilter(term: string): number {
    this.filterTerm = term.trim();
    this.refresh();
    return this.filteredItems.length;
  }

  clearFilter(): void {
    this.filterTerm = '';
    this.refresh();
  }

  getFilterTerm(): string {
    return this.filterTerm;
  }

  getMatchCount(): number {
    return this.filteredItems.length;
  }

  getTreeItem(element: CpmItem): vscode.TreeItem {
    return element;
  }

  // TreeView.reveal() requires a getParent implementation. The launcher only
  // reveals a top-level environment, whose parent is intentionally undefined.
  // Keeping the method explicit makes the public reveal API available without
  // changing the existing environment-first hierarchy.
  getParent(_element: CpmItem): CpmItem | undefined {
    return undefined;
  }

  getChildren(element?: CpmItem): Promise<CpmItem[]> {
    if (!element) {
      if (this.filterTerm) {
        return Promise.resolve(this.filteredItems);
      }
      return Promise.resolve((this.db.environments || []).map((env) => new CpmItem(
        'environment',
        env.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        undefined,
        'Environment',
        `environment:${env.name}`
      )));
    }
    if (element.kind === 'environment') {
      const environment = (this.db.environments || []).find((env) => env.name === element.labelText);
      if (!environment) return Promise.resolve([]);
      return Promise.resolve((environment.libraries || []).map((lib) => new CpmItem(
        'library',
        lib.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        environment.name,
        'Library',
        `library:${environment.name}:${lib.name}`,
        `environment:${environment.name}`
      )));
    }
    if (element.kind === 'library' && element.parentLabel) {
      const environment = (this.db.environments || []).find((env) => env.name === element.parentLabel);
      const library = environment?.libraries.find((lib) => lib.name === element.labelText);
      if (!library) return Promise.resolve([]);
      return Promise.resolve((library.categories || []).map((cat) => new CpmItem(
        'category',
        cat.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        library.name,
        `${environment?.name ?? ''}`,
        `category:${environment?.name ?? ''}:${library.name}:${cat.name}`,
        `library:${environment?.name ?? ''}:${library.name}`,
        { environmentName: environment?.name ?? '', libraryName: library.name, categoryName: cat.name, groupPath: [] }
      )));
    }
    if (element.kind === 'category') {
      const environmentName = element.refs?.environmentName ?? '';
      const libraryName = element.refs?.libraryName ?? '';
      const categoryName = element.refs?.categoryName ?? element.labelText;
      const environment = (this.db.environments || []).find((env) => env.name === environmentName);
      const library = environment?.libraries.find((lib) => lib.name === libraryName);
      const category = library?.categories.find((cat) => cat.name === categoryName);
      if (!category) return Promise.resolve([]);

      const groupItems = (Array.isArray(category.groups) ? category.groups : []).map((group, index) => new CpmItem(
        'group',
        group.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        category.name,
        `${environmentName} • ${libraryName} • ${categoryName} • ${countGroupSymbols(group)} symbol(s)`,
        `group:${environmentName}:${libraryName}:${categoryName}:${index}`,
        `category:${environmentName}:${libraryName}:${categoryName}`,
        { environmentName, libraryName, categoryName, groupPath: [index] }
      ));

      const rootFunctions = (Array.isArray(category.functions) ? category.functions : []).map((fn) => new CpmItem(
        'function',
        fn.name,
        vscode.TreeItemCollapsibleState.None,
        fn,
        category.name,
        `${environmentName} • ${libraryName} • ${categoryName} • ${fn.returnType}`,
        `function:${environmentName}:${libraryName}:${categoryName}:root:${fn.name}`,
        `category:${environmentName}:${libraryName}:${categoryName}`,
        { environmentName, libraryName, categoryName, groupPath: [] }
      ));

      return Promise.resolve([...groupItems, ...rootFunctions]);
    }
    if (element.kind === 'group') {
      const environmentName = element.refs?.environmentName ?? '';
      const libraryName = element.refs?.libraryName ?? '';
      const categoryName = element.refs?.categoryName ?? '';
      const groupPath = Array.isArray(element.refs?.groupPath) ? element.refs.groupPath : [];
      const environment = (this.db.environments || []).find((env) => env.name === environmentName);
      const library = environment?.libraries.find((lib) => lib.name === libraryName);
      const category = library?.categories.find((cat) => cat.name === categoryName);
      const group = getGroupAtPath(category, groupPath);
      if (!group) return Promise.resolve([]);

      const subgroupItems = (Array.isArray(group.groups) ? group.groups : []).map((child, index) => {
        const path = [...groupPath, index];
        return new CpmItem(
          'group',
          child.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          group.name,
          `${environmentName} • ${libraryName} • ${categoryName} • ${countGroupSymbols(child)} symbol(s)`,
          `group:${environmentName}:${libraryName}:${categoryName}:${path.join('.')}`,
          `group:${environmentName}:${libraryName}:${categoryName}:${groupPath.join('.')}`,
          { environmentName, libraryName, categoryName, groupPath: path }
        );
      });

      const functionItems = (Array.isArray(group.functions) ? group.functions : []).map((fn) => new CpmItem(
        'function',
        fn.name,
        vscode.TreeItemCollapsibleState.None,
        fn,
        group.name,
        `${environmentName} • ${libraryName} • ${categoryName} • ${group.name || 'Group'} • ${fn.returnType}`,
        `function:${environmentName}:${libraryName}:${categoryName}:${groupPath.join('.')}:${fn.name}`,
        `group:${environmentName}:${libraryName}:${categoryName}:${groupPath.join('.')}`,
        { environmentName, libraryName, categoryName, groupPath }
      ));

      return Promise.resolve([...subgroupItems, ...functionItems]);
    }
    return Promise.resolve([]);
  }

  private rebuildFilter(): void {
    if (!this.filterTerm) {
      this.filteredItems = [];
      return;
    }
    const query = this.filterTerm.toLowerCase();
    const matches: { score: number; item: CpmItem }[] = [];
    for (const environment of this.db.environments || []) {
      for (const lib of environment.libraries || []) {
        for (const cat of lib.categories || []) {
          for (const fn of getCategoryAllFunctions(cat)) {
            const haystack = [
              fn.name,
              environment.name,
              fn.library,
              fn.category,
              fn.header ?? '',
              fn.signature,
              fn.description ?? '',
              ...(fn.parameters ?? []).map((p) => `${p.name} ${p.type} ${p.description ?? ''}`)
            ].join(' | ').toLowerCase();

            if (!haystack.includes(query)) {
              continue;
            }

            let score = 0;
            const lowerName = fn.name.toLowerCase();
            if (lowerName === query) score += 100;
            if (lowerName.startsWith(query)) score += 50;
            if (lowerName.includes(query)) score += 20;
            if ((fn.description ?? '').toLowerCase().includes(query)) score += 5;
            if (fn.signature.toLowerCase().includes(query)) score += 3;
            const item = new CpmItem(
              'function',
              fn.name,
              vscode.TreeItemCollapsibleState.None,
              fn,
              cat.name,
              `${environment.name} • ${lib.name} • ${cat.name} • ${fn.returnType}`,
              `search:${environment.name}:${lib.name}:${cat.name}:${fn.name}`,
              `category:${environment.name}:${lib.name}:${cat.name}`,
              { environmentName: environment.name, libraryName: lib.name, categoryName: cat.name, groupPath: [] }
            );
            item.tooltip = new vscode.MarkdownString(`**${escapeMarkdown(fn.name)}**

${escapeMarkdown(fn.signature)}

${escapeMarkdown(environment.name)} → ${escapeMarkdown(lib.name)} → ${escapeMarkdown(cat.name)}`);
            matches.push({ score, item });
          }
        }
      }
    }
    matches.sort((a, b) => b.score - a.score || a.item.labelText.localeCompare(b.item.labelText));
    this.filteredItems = matches.map((m) => m.item);
  }
}


function ensureDirectory(dirPath: string | undefined): string | undefined {
  if (!dirPath) {
    return undefined;
  }
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'pack';
}

function uniqueName(baseName: string, existingNames: string[]): string {
  const cleaned = String(baseName || '').trim() || 'Item';
  const used = new Set((existingNames || []).map((name) => String(name || '').trim().toLowerCase()).filter(Boolean));
  if (!used.has(cleaned.toLowerCase())) return cleaned;
  let counter = 2;
  let candidate = `${cleaned} ${counter}`;
  while (used.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${cleaned} ${counter}`;
  }
  return candidate;
}


function normalizeGroup(group: CpmGroup, environmentName: string, libraryName: string, categoryName: string): CpmGroup {
  return {
    name: group?.name,
    description: (group as any)?.description,
    functions: (Array.isArray(group?.functions) ? group.functions : []).map((fn) => normalizeFunction(fn, environmentName, libraryName, categoryName)),
    groups: (Array.isArray(group?.groups) ? group.groups : []).map((child) => normalizeGroup(child, environmentName, libraryName, categoryName))
  };
}

function cloneGroup(group: CpmGroup): CpmGroup {
  return {
    name: group?.name,
    description: (group as any)?.description,
    functions: (Array.isArray(group?.functions) ? group.functions : []).map((fn) => ({ ...fn })),
    groups: (Array.isArray(group?.groups) ? group.groups : []).map((child) => cloneGroup(child))
  };
}

function collectGroupFunctions(groups: CpmGroup[] | undefined, acc: CpmFunction[] = []): CpmFunction[] {
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const fn of Array.isArray(group?.functions) ? group.functions : []) {
      acc.push(fn);
    }
    collectGroupFunctions(Array.isArray(group?.groups) ? group.groups : [], acc);
  }
  return acc;
}

function getCategoryAllFunctions(category: CpmCategory | undefined): CpmFunction[] {
  if (!category) return [];
  return [...(Array.isArray(category.functions) ? category.functions : []), ...collectGroupFunctions(Array.isArray(category.groups) ? category.groups : [])];
}

function countCategoryGroups(category: CpmCategory | undefined): number {
  if (!category) return 0;
  const visit = (groups: CpmGroup[] | undefined): number => (Array.isArray(groups) ? groups.reduce((sum, group) => sum + 1 + visit(group.groups), 0) : 0);
  return visit(category.groups);
}

function mapCategoryGroups<T>(category: CpmCategory | undefined, mapper: (group: CpmGroup, path: number[]) => T, prefix: number[] = []): T[] {
  const results: T[] = [];
  const walk = (groups: CpmGroup[] | undefined, pathPrefix: number[]) => {
    (Array.isArray(groups) ? groups : []).forEach((group, index) => {
      const path = [...pathPrefix, index];
      results.push(mapper(group, path));
      walk(group.groups, path);
    });
  };
  walk(category?.groups, prefix);
  return results;
}

function getGroupAtPath(category: CpmCategory | undefined, pathIndices: number[] | undefined): CpmGroup | undefined {
  if (!category || !Array.isArray(pathIndices) || pathIndices.length === 0) return undefined;
  let groups = Array.isArray(category.groups) ? category.groups : [];
  let current: CpmGroup | undefined;
  for (const index of pathIndices) {
    if (index < 0 || index >= groups.length) return undefined;
    current = groups[index];
    groups = Array.isArray(current?.groups) ? current.groups : [];
  }
  return current;
}

function countGroupSymbols(group: CpmGroup | undefined): number {
  if (!group) return 0;
  const own = Array.isArray(group.functions) ? group.functions.length : 0;
  const nested = (Array.isArray(group.groups) ? group.groups : []).reduce((sum, child) => sum + countGroupSymbols(child), 0);
  return own + nested;
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getWorkspacePacksDirectory(): string | undefined {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return undefined;
  }
  return path.join(workspaceRoot, '.vscode', 'cpm', 'libraries', 'packs');
}

function getGlobalPacksDirectory(context: vscode.ExtensionContext): string {
  return path.join(context.globalStorageUri.fsPath, 'packs');
}

interface RetiredPackCleanupStats {
  scannedFiles: number;
  deletedFiles: number;
  updatedFiles: number;
  removedEnvironments: number;
  removedLibraries: number;
}

function retiredCatalogMarkerParts(): { tokenPrefixes: string[]; compactSequences: string[] } {
  // One-way compatibility migration: character codes recognize retired catalog
  // identifiers without reintroducing their names in current sources or docs.
  const decode = (codes: number[]): string => String.fromCharCode(...codes);
  return {
    tokenPrefixes: [decode([77, 80, 84]), decode([72, 78, 70])],
    compactSequences: [decode([84, 78, 84, 69, 88, 69, 67])]
  };
}

function isRetiredCatalogIdentifier(value: unknown): boolean {
  const text = String(value ?? '').trim().toUpperCase();
  if (!text) return false;
  const { tokenPrefixes, compactSequences } = retiredCatalogMarkerParts();
  const tokens = text.split(/[^A-Z0-9]+/).filter(Boolean);
  const compact = tokens.join('');
  if (tokenPrefixes.some((prefix) => tokens.some((token) => token === prefix || token.startsWith(prefix)))) return true;
  return compactSequences.some((sequence) => compact.includes(sequence));
}

function purgeRetiredGlobalPackStorage(context: vscode.ExtensionContext): RetiredPackCleanupStats {
  const stats: RetiredPackCleanupStats = {
    scannedFiles: 0,
    deletedFiles: 0,
    updatedFiles: 0,
    removedEnvironments: 0,
    removedLibraries: 0
  };
  const directory = getGlobalPacksDirectory(context);
  if (!fs.existsSync(directory)) return stats;

  for (const fileName of fs.readdirSync(directory).filter((name) => name.toLowerCase().endsWith('.json')).sort()) {
    const filePath = path.join(directory, fileName);
    stats.scannedFiles += 1;
    let raw: any;
    try {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }

    if ([raw?.id, raw?.name, path.basename(fileName, path.extname(fileName))].some(isRetiredCatalogIdentifier)) {
      try {
        fs.unlinkSync(filePath);
        stats.deletedFiles += 1;
      } catch {
        // Keep activation resilient if a user file is locked or read-only.
      }
      continue;
    }

    let changed = false;
    const cleanLibraries = (libraries: any[]): any[] => {
      const source = Array.isArray(libraries) ? libraries : [];
      const kept = source.filter((library) => {
        const remove = isRetiredCatalogIdentifier(library?.name) || isRetiredCatalogIdentifier(library?.id);
        if (remove) stats.removedLibraries += 1;
        return !remove;
      });
      if (kept.length !== source.length) changed = true;
      return kept;
    };

    if (Array.isArray(raw?.environments)) {
      const environments: any[] = [];
      for (const environment of raw.environments) {
        if (isRetiredCatalogIdentifier(environment?.name) || isRetiredCatalogIdentifier(environment?.id)) {
          stats.removedEnvironments += 1;
          changed = true;
          continue;
        }
        const clone = { ...environment };
        clone.libraries = cleanLibraries(clone.libraries);
        environments.push(clone);
      }
      raw.environments = environments;
    }

    if (Array.isArray(raw?.libraries)) raw.libraries = cleanLibraries(raw.libraries);

    const environmentLibraryCount = Array.isArray(raw?.environments)
      ? raw.environments.reduce((sum: number, environment: any) => sum + (Array.isArray(environment?.libraries) ? environment.libraries.length : 0), 0)
      : 0;
    const legacyLibraryCount = Array.isArray(raw?.libraries) ? raw.libraries.length : 0;
    if (changed && environmentLibraryCount + legacyLibraryCount === 0) {
      try {
        fs.unlinkSync(filePath);
        stats.deletedFiles += 1;
      } catch {
        // Leave the empty file in place only when the OS refuses deletion.
      }
      continue;
    }

    if (changed) {
      try {
        fs.writeFileSync(filePath, JSON.stringify(raw, null, 2) + '\n', 'utf8');
        stats.updatedFiles += 1;
      } catch {
        // Keep activation resilient if global storage is temporarily read-only.
      }
    }
  }
  return stats;
}


function stripSnippetPlaceholders(text: string | undefined | null): string {
  let value = String(text ?? '');
  let previous = '';
  while (previous !== value) {
    previous = value;
    value = value
      .replace(/\$\{\d+:(\{[^{}]*\})\}/g, '$1')
      .replace(/\$\{\d+\|([^{}]*)\|\}/g, (_match, choices) => String(choices || '').split(',')[0] || '')
      .replace(/\$\{\d+:([^{}]*)\}/g, '$1')
      .replace(/\$\{\d+\}/g, '');
  }
  return value;
}

function cleanSnippetTextField<T>(value: T): T {
  return (typeof value === 'string' ? stripSnippetPlaceholders(value) : value) as T;
}

function cleanSnippetTextObject<T extends Record<string, any>>(obj: T): T {
  const copy: any = { ...obj };
  for (const key of ['name', 'type', 'description', 'detail', 'defaultValue', 'placeholder', 'returnType', 'returnDescription']) {
    if (typeof copy[key] === 'string') {
      copy[key] = stripSnippetPlaceholders(copy[key]);
    }
  }
  return copy as T;
}

function normalizeFunction(fn: CpmFunction, environmentName: string, libraryName: string, categoryName: string): CpmFunction {
  const parameters = Array.isArray(fn.parameters) ? fn.parameters.map((param) => cleanSnippetTextObject({ ...param })) : undefined;
  return {
    ...fn,
    name: cleanSnippetTextField(fn.name),
    signature: cleanSnippetTextField(fn.signature),
    insertText: cleanSnippetTextField(fn.insertText),
    declaration: cleanSnippetTextField(fn.declaration),
    returnType: cleanSnippetTextField(fn.returnType),
    returnDescription: cleanSnippetTextField(fn.returnDescription),
    description: cleanSnippetTextField(fn.description),
    longDescription: cleanSnippetTextField(fn.longDescription),
    environment: fn.environment || environmentName,
    library: fn.library || libraryName,
    category: fn.category || categoryName,
    parameters
  };
}

const CPP_POINTER_CATEGORY_NAME = 'Pointers, References & Smart Pointers';
const CPP_LEGACY_POINTER_MEMBER_CATEGORY_NAME = 'Pointers to Members';
const CPP_LEGACY_POINTER_REFERENCE_CATEGORY_NAME = 'Pointers & References';
const CPP_POINTER_SOURCE_CATEGORY_NAMES = new Set([
  CPP_POINTER_CATEGORY_NAME,
  CPP_LEGACY_POINTER_MEMBER_CATEGORY_NAME,
  CPP_LEGACY_POINTER_REFERENCE_CATEGORY_NAME
]);

function ensureNamedGroup(groups: CpmGroup[], name: string, description: string): CpmGroup {
  let group = groups.find((entry) => entry.name === name);
  if (!group) {
    group = { name, description, functions: [], groups: [] };
    groups.push(group);
  }
  group.description = group.description || description;
  group.functions = Array.isArray(group.functions) ? group.functions : [];
  group.groups = Array.isArray(group.groups) ? group.groups : [];
  return group;
}

function rewriteGroupCategory(group: CpmGroup, categoryName: string): void {
  group.functions = (Array.isArray(group.functions) ? group.functions : []).map((fn) => ({ ...fn, category: categoryName }));
  (Array.isArray(group.groups) ? group.groups : []).forEach((child) => rewriteGroupCategory(child, categoryName));
}

function cppPointerGroupForFunction(fn: CpmFunction): string {
  const name = String(fn?.name || '').toLowerCase();
  if (name.includes('member')) return 'Pointers to members';
  if (name.includes('unique_ptr') || name.includes('shared_ptr') || name.includes('weak_ptr') || name.includes('smart pointer')) return 'Smart pointers & ownership';
  if (name.includes('reference') || name.includes('observer')) return 'References & observers';
  return 'Raw pointers & const qualifiers';
}

function organizeCppPointerCategories(categories: CpmCategory[]): CpmCategory[] {
  const list = Array.isArray(categories) ? categories : [];
  const pointerCategories = list.filter((category) => CPP_POINTER_SOURCE_CATEGORY_NAMES.has(category.name));
  if (!pointerCategories.length) return list;

  const insertionIndex = list.findIndex((category) => CPP_POINTER_SOURCE_CATEGORY_NAMES.has(category.name));
  const unified: CpmCategory = { name: CPP_POINTER_CATEGORY_NAME, functions: [], groups: [] };
  const groups = unified.groups as CpmGroup[];
  const knownNames = new Set<string>();

  const descriptions: Record<string, string> = {
    'Raw pointers & const qualifiers': 'Raw pointers, double indirection, and const qualification rules.',
    'References & observers': 'References, rvalue references, and non-owning observer patterns.',
    'Smart pointers & ownership': 'RAII ownership with unique_ptr, shared_ptr, and weak_ptr.',
    'Pointers to members': 'Pointers to class data members and member functions.'
  };

  const addFunction = (fn: CpmFunction, forcedGroup?: string) => {
    const name = String(fn?.name || '');
    if (!name || knownNames.has(name)) return;
    const groupName = forcedGroup || cppPointerGroupForFunction(fn);
    const group = ensureNamedGroup(groups, groupName, descriptions[groupName] || 'Related pointer helpers.');
    group.functions!.push({ ...fn, category: CPP_POINTER_CATEGORY_NAME });
    knownNames.add(name);
  };

  for (const category of pointerCategories) {
    const legacy = category.name === CPP_LEGACY_POINTER_MEMBER_CATEGORY_NAME;
    for (const fn of Array.isArray(category.functions) ? category.functions : []) {
      addFunction(fn, legacy ? 'Pointers to members' : undefined);
    }
    for (const group of Array.isArray(category.groups) ? category.groups : []) {
      const targetName = legacy ? 'Pointers to members' : group.name;
      const target = ensureNamedGroup(groups, targetName, group.description || descriptions[targetName] || 'Related pointer helpers.');
      for (const fn of collectGroupFunctions([group])) {
        addFunction(fn, target.name);
      }
    }
  }

  for (const group of groups) rewriteGroupCategory(group, CPP_POINTER_CATEGORY_NAME);

  const remaining = list.filter((category) => !CPP_POINTER_SOURCE_CATEGORY_NAMES.has(category.name));
  remaining.splice(Math.max(0, insertionIndex), 0, unified);
  return remaining;
}


const CPP_DEDICATED_STL_LIBRARY_NAMES = [
  'STL Sequential Containers',
  'STL Ordered Associative Containers',
  'STL Unordered Associative Containers',
  'STL Container Adaptors',
  'STL Iterators & Traversal',
  'STL Algorithms & Ranges',
  'C++ Callbacks & Lambdas'
] as const;

const CPP_DEDICATED_IO_LIBRARY_NAMES = [
  'C++ Files & Configuration',
  'C++ Device I/O',
  'C++ Web & Ethernet',
  'C++ Communication & Connectivity'
] as const;

const CPP_CONTAINER_LIBRARY_NAMES = new Set([
  'STL Sequential Containers',
  'STL Ordered Associative Containers',
  'STL Unordered Associative Containers',
  'STL Container Adaptors'
]);

const CPP_LEGACY_STL_CATEGORY_NAMES = new Set([
  'Iteration & Containers',
  'STL Containers & Algorithms',
  'Algorithms & STL',
  'Callbacks & Lambdas',
  'Callbacks & Invocation'
]);

const CPP_FUNCTION_CATEGORY_NAME = 'Functions';
const CPP_FUNCTION_SOURCE_CATEGORY_NAMES = new Set([
  'Functions & Callables',
  'Callbacks & Lambdas',
  'Callbacks & Invocation',
  'Advanced Invocation & Functional'
]);

const CPP_REMOVED_INDUSTRIAL_NAME_PATTERN = /industrial/i;

const CPP_BASIC_CATEGORY_NAME = 'Basic';
const CPP_BASIC_SOURCE_CATEGORY_NAMES = new Set([
  'Keywords',
  'Snippets',
  'Operator Overloading'
]);

const CPP_BASIC_GROUP_DESCRIPTIONS: Record<string, string> = {
  'Keywords': 'Reserved words, contextual keywords, fundamental type names, and language-token references.',
  'Snippets': 'Small reusable language skeletons.',
  'Operator Overloading': 'Operator overload syntax, scope rules, member versus non-member design, friend declarations, and practical examples.'
};

function mergeCppBasicGroupTree(targetCategory: CpmCategory, prefix: string[], sourceGroup: CpmGroup): void {
  const path = [...prefix, sourceGroup.name];
  for (const fn of Array.isArray(sourceGroup.functions) ? sourceGroup.functions : []) {
    mergeFunctionIntoNestedCategory(targetCategory, fn, {
      libraryName: 'C++ Language',
      categoryName: CPP_BASIC_CATEGORY_NAME,
      groupPath: path
    });
  }
  for (const child of Array.isArray(sourceGroup.groups) ? sourceGroup.groups : []) {
    mergeCppBasicGroupTree(targetCategory, path, child);
  }
}

function organizeCppBasicCategories(cppLibrary: CpmLibrary): void {
  const categories = Array.isArray(cppLibrary.categories) ? cppLibrary.categories : [];
  const sources = categories.filter((category) => CPP_BASIC_SOURCE_CATEGORY_NAMES.has(category.name));
  if (!sources.length) return;

  const target = ensureNamedCategory(cppLibrary, CPP_BASIC_CATEGORY_NAME);
  for (const source of sources) {
    const rootGroupName = source.name;
    for (const fn of Array.isArray(source.functions) ? source.functions : []) {
      mergeFunctionIntoNestedCategory(target, fn, {
        libraryName: 'C++ Language',
        categoryName: CPP_BASIC_CATEGORY_NAME,
        groupPath: [rootGroupName]
      });
    }
    for (const child of Array.isArray(source.groups) ? source.groups : []) {
      mergeCppBasicGroupTree(target, [rootGroupName], child);
    }
    const rootGroup = ensureNestedGroup(target, [rootGroupName]);
    if (rootGroup) rootGroup.description = rootGroup.description || CPP_BASIC_GROUP_DESCRIPTIONS[rootGroupName] || 'Related C++ fundamentals.';
  }

  cppLibrary.categories = (Array.isArray(cppLibrary.categories) ? cppLibrary.categories : [])
    .filter((category) => !CPP_BASIC_SOURCE_CATEGORY_NAMES.has(category.name));
}


interface CppBasicFoundationRelocation {
  sourceCategoryName: string;
  targetGroupName: string;
  entryNames: Set<string>;
}

const CPP_BASIC_FOUNDATION_RELOCATIONS: CppBasicFoundationRelocation[] = [
  {
    sourceCategoryName: 'Errors, Diagnostics & Utilities',
    targetGroupName: 'Error handling & exceptions',
    entryNames: new Set(['try / catch', 'custom exception type'])
  },
  {
    sourceCategoryName: 'Functions',
    targetGroupName: 'Functions & overloading',
    entryNames: new Set(['free function declaration and definition', 'function overloads', 'default function argument', 'nodiscard return value'])
  },
  {
    sourceCategoryName: 'OOP & Inheritance',
    targetGroupName: 'Inheritance & polymorphism',
    entryNames: new Set(['Abstract interface', 'Single inheritance override', 'Protected inheritance helper', 'Composition over inheritance'])
  }
];

function takeCppFunctionsByName(groups: CpmGroup[] | undefined, names: Set<string>): CpmFunction[] {
  const found: CpmFunction[] = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    const retained: CpmFunction[] = [];
    for (const fn of Array.isArray(group.functions) ? group.functions : []) {
      if (names.has(fn.name)) found.push(fn);
      else retained.push(fn);
    }
    group.functions = retained;
    found.push(...takeCppFunctionsByName(group.groups, names));
    group.groups = (Array.isArray(group.groups) ? group.groups : [])
      .filter((child) => (child.functions?.length || 0) > 0 || (child.groups?.length || 0) > 0);
  }
  return found;
}

function organizeCppBasicFoundationEntries(cppLibrary: CpmLibrary): void {
  const basicCategory = ensureNamedCategory(cppLibrary, CPP_BASIC_CATEGORY_NAME);
  for (const relocation of CPP_BASIC_FOUNDATION_RELOCATIONS) {
    const sourceCategory = (Array.isArray(cppLibrary.categories) ? cppLibrary.categories : [])
      .find((category) => category.name === relocation.sourceCategoryName);
    if (!sourceCategory) continue;

    const moved: CpmFunction[] = [];
    const retained: CpmFunction[] = [];
    for (const fn of Array.isArray(sourceCategory.functions) ? sourceCategory.functions : []) {
      if (relocation.entryNames.has(fn.name)) moved.push(fn);
      else retained.push(fn);
    }
    sourceCategory.functions = retained;
    moved.push(...takeCppFunctionsByName(sourceCategory.groups, relocation.entryNames));

    for (const fn of moved) {
      mergeFunctionIntoNestedCategory(basicCategory, fn, {
        libraryName: 'C++ Language',
        categoryName: CPP_BASIC_CATEGORY_NAME,
        groupPath: [relocation.targetGroupName]
      });
    }
  }
}

const CPP_CONCURRENCY_CATEGORY_NAME = 'Concurrency';
const CPP_CONCURRENCY_SOURCE_CATEGORY_NAMES = new Set([
  'Threading & Synchronization',
  'Concurrency & Atomics',
  'Concurrency & Coordination'
]);

interface CppNestedDestination {
  libraryName: string;
  categoryName: string;
  groupPath: string[];
}

function ensureNamedLibrary(libraries: CpmLibrary[], name: string): CpmLibrary {
  let library = libraries.find((entry) => entry.name === name);
  if (!library) {
    library = { name, categories: [] };
    libraries.push(library);
  }
  library.categories = Array.isArray(library.categories) ? library.categories : [];
  return library;
}

function ensureNamedCategory(library: CpmLibrary, name: string): CpmCategory {
  let category = library.categories.find((entry) => entry.name === name);
  if (!category) {
    category = { name, functions: [], groups: [] };
    library.categories.push(category);
  }
  category.functions = Array.isArray(category.functions) ? category.functions : [];
  category.groups = Array.isArray(category.groups) ? category.groups : [];
  return category;
}

function ensureNestedGroup(category: CpmCategory, path: string[]): CpmGroup | undefined {
  let groups = Array.isArray(category.groups) ? category.groups : [];
  category.groups = groups;
  let current: CpmGroup | undefined;
  for (const name of path.filter((item) => !!item)) {
    current = ensureNamedGroup(groups, name, 'Related C++ helpers.');
    current.functions = Array.isArray(current.functions) ? current.functions : [];
    current.groups = Array.isArray(current.groups) ? current.groups : [];
    groups = current.groups;
  }
  return current;
}


function cppCallbackNestedPathForFunction(fn: CpmFunction): string[] {
  const name = String(fn?.name || '').toLowerCase();
  if (name.includes('capture') || name.includes('lambda syntax')) return ['Callbacks & Lambdas', 'Lambda syntax and captures'];
  if (name.includes('signature') || name.includes('noexcept') || name.includes('return type')) return ['Callbacks & Lambdas', 'Lambda signatures'];
  if (name.includes('recursive') || name.includes('immediately invoked') || name.includes('generic lambda') || name.includes('template lambda')) return ['Callbacks & Lambdas', 'Advanced lambdas'];
  if (name.includes('weak_ptr') || name.includes('thread') || name.includes('lifetime') || name.includes('jthread') || name.includes('async')) return ['Callbacks & Lambdas', 'Lifetime and async safety'];
  return ['Callbacks & Lambdas', 'Callback storage and invocation'];
}

function cppCallableNestedPathForFunction(fn: CpmFunction): string[] {
  const name = String(fn?.name || '').toLowerCase();
  if (name.includes('variadic') || name.includes('parameter pack') || name.includes('fold expression')) return ['Functions & Callables', 'Variadic & generic callables'];
  if (name.includes('invoke') || name.includes('mem_fn') || name.includes('bind_front') || name.includes('bind ')) return ['Functions & Callables', 'Invocation adapters'];
  if (name.includes('function pointer') || name.includes('free-function') || name.includes('callback parameter') || name.includes('handler')) return ['Functions & Callables', 'Function pointers'];
  return ['Functions & Callables', 'Declarations & overloads'];
}

function mergeGroupTreeIntoNestedCategory(targetCategory: CpmCategory, prefixPath: string[], sourceGroup: CpmGroup): void {
  const path = [...prefixPath, sourceGroup.name].filter((item) => !!item);
  for (const fn of Array.isArray(sourceGroup.functions) ? sourceGroup.functions : []) {
    mergeFunctionIntoNestedCategory(targetCategory, fn, {
      libraryName: 'C++ Language',
      categoryName: CPP_FUNCTION_CATEGORY_NAME,
      groupPath: path
    });
  }
  for (const child of Array.isArray(sourceGroup.groups) ? sourceGroup.groups : []) {
    mergeGroupTreeIntoNestedCategory(targetCategory, path, child);
  }
}

function pruneIndustrialCppGroups(groups: CpmGroup[] | undefined): CpmGroup[] {
  return (Array.isArray(groups) ? groups : [])
    .filter((group) => !CPP_REMOVED_INDUSTRIAL_NAME_PATTERN.test(String(group?.name || '')))
    .map((group) => ({
      ...group,
      groups: pruneIndustrialCppGroups(group.groups)
    }));
}

function pruneIndustrialCppCategories(categories: CpmCategory[] | undefined): CpmCategory[] {
  return (Array.isArray(categories) ? categories : [])
    .filter((category) => !CPP_REMOVED_INDUSTRIAL_NAME_PATTERN.test(String(category?.name || '')))
    .map((category) => ({
      ...category,
      groups: pruneIndustrialCppGroups(category.groups)
    }));
}

function organizeCppFunctionCategories(cppLibrary: CpmLibrary): void {
  const categories = Array.isArray(cppLibrary.categories) ? cppLibrary.categories : [];
  const sourceCategories = categories.filter((category) => CPP_FUNCTION_SOURCE_CATEGORY_NAMES.has(category.name));
  if (!sourceCategories.length) return;

  const functionsCategory = ensureNamedCategory(cppLibrary, CPP_FUNCTION_CATEGORY_NAME);

  for (const sourceCategory of sourceCategories) {
    if (sourceCategory.name === 'Callbacks & Lambdas' || sourceCategory.name === 'Callbacks & Invocation') {
      for (const fn of Array.isArray(sourceCategory.functions) ? sourceCategory.functions : []) {
        mergeFunctionIntoNestedCategory(functionsCategory, fn, {
          libraryName: 'C++ Language',
          categoryName: CPP_FUNCTION_CATEGORY_NAME,
          groupPath: cppCallbackNestedPathForFunction(fn)
        });
      }
      for (const group of Array.isArray(sourceCategory.groups) ? sourceCategory.groups : []) {
        mergeGroupTreeIntoNestedCategory(functionsCategory, ['Callbacks & Lambdas'], group);
      }
      continue;
    }

    for (const fn of getCategoryAllFunctions(sourceCategory)) {
      const groupPath = sourceCategory.name === 'Advanced Invocation & Functional'
        ? ['Functions & Callables', 'Invocation adapters']
        : cppCallableNestedPathForFunction(fn);
      mergeFunctionIntoNestedCategory(functionsCategory, fn, {
        libraryName: 'C++ Language',
        categoryName: CPP_FUNCTION_CATEGORY_NAME,
        groupPath
      });
    }
  }

  cppLibrary.categories = (Array.isArray(cppLibrary.categories) ? cppLibrary.categories : [])
    .filter((category) => !CPP_FUNCTION_SOURCE_CATEGORY_NAMES.has(category.name));
}


function cppConcurrencyGroupPathForFunction(fn: CpmFunction): string[] {
  const haystack = `${String(fn?.name || '')} ${String(fn?.description || '')} ${String(fn?.longDescription || '')}`.toLowerCase();
  if (['atomic', 'compare_exchange', 'memory order', 'memory_order', 'release / acquire', 'atomic_ref'].some((token) => haystack.includes(token))) {
    return ['Atomics & memory ordering'];
  }
  if (['semaphore', 'latch', 'barrier', 'manual-reset event', 'eventhandle', 'coordination'].some((token) => haystack.includes(token))) {
    return ['Coordination primitives'];
  }
  if (['condition_variable', 'condition variable', 'producer/consumer', 'producer-consumer'].some((token) => haystack.includes(token))) {
    return ['Condition variables & producer-consumer'];
  }
  if (['mutex', 'lock_guard', 'unique_lock', 'scoped_lock', 'critical_section', 'critical section'].some((token) => haystack.includes(token))) {
    return ['Mutexes & locking'];
  }
  if (['future', 'promise', 'packaged_task', 'std::async', 'async task'].some((token) => haystack.includes(token))) {
    return ['Tasks, futures & async'];
  }
  return ['Threads & lifecycle'];
}

function organizeCppConcurrencyCategories(cppLibrary: CpmLibrary): void {
  const categories = Array.isArray(cppLibrary.categories) ? cppLibrary.categories : [];
  const sourceCategories = categories.filter((category) => CPP_CONCURRENCY_SOURCE_CATEGORY_NAMES.has(category.name));
  if (!sourceCategories.length) return;

  const targetCategory = ensureNamedCategory(cppLibrary, CPP_CONCURRENCY_CATEGORY_NAME);
  for (const sourceCategory of sourceCategories) {
    for (const fn of getCategoryAllFunctions(sourceCategory)) {
      mergeFunctionIntoNestedCategory(targetCategory, fn, {
        libraryName: 'C++ Language',
        categoryName: CPP_CONCURRENCY_CATEGORY_NAME,
        groupPath: cppConcurrencyGroupPathForFunction(fn)
      });
    }
  }

  cppLibrary.categories = (Array.isArray(cppLibrary.categories) ? cppLibrary.categories : [])
    .filter((category) => !CPP_CONCURRENCY_SOURCE_CATEGORY_NAMES.has(category.name));
}

function cppLegacyContentRoute(fn: CpmFunction, legacyCategoryName: string): CppNestedDestination {
  const name = String(fn?.name || '').toLowerCase();
  if (legacyCategoryName === 'Callbacks & Lambdas' || legacyCategoryName === 'Callbacks & Invocation') {
    return { libraryName: 'C++ Language', categoryName: CPP_FUNCTION_CATEGORY_NAME, groupPath: cppCallbackNestedPathForFunction(fn) };
  }
  if (['find', 'transform', 'remove', 'sort', 'unique', 'count', 'partition', 'accumulate', 'algorithm'].some((token) => name.includes(token))) {
    return { libraryName: 'C++ Language', categoryName: 'Algorithms & Ranges', groupPath: ['Legacy algorithms'] };
  }
  if (['iterator', 'range-based', 'traversal', 'structured binding', 'reverse'].some((token) => name.includes(token))) {
    return { libraryName: 'C++ Language', categoryName: 'Iterators & Traversal', groupPath: ['Legacy traversal patterns'] };
  }
  if (name.includes('unordered')) return { libraryName: 'C++ Language', categoryName: 'Containers', groupPath: ['STL Unordered Associative Containers', 'Legacy unordered containers'] };
  if (name.includes('map') || name.includes('set')) return { libraryName: 'C++ Language', categoryName: 'Containers', groupPath: ['STL Ordered Associative Containers', 'Legacy ordered containers'] };
  if (['vector', 'deque', 'list', 'array', 'string', 'span'].some((token) => name.includes(token))) {
    return { libraryName: 'C++ Language', categoryName: 'Containers', groupPath: ['STL Sequential Containers', 'Legacy sequential containers'] };
  }
  return { libraryName: 'C++ Language', categoryName: 'Iterators & Traversal', groupPath: ['Legacy traversal patterns'] };
}

function cppNestedDestinationForEntry(libraryName: string | undefined, categoryName: string, fn?: CpmFunction): CppNestedDestination | undefined {
  const sourceLibrary = String(libraryName || '');
  if (sourceLibrary === 'C++ Files & Configuration') {
    return { libraryName: 'C++ Language', categoryName: 'Files & Streams', groupPath: [categoryName] };
  }
  if (sourceLibrary === 'C++ Device I/O') {
    return { libraryName: 'C++ Language', categoryName: 'Device I/O: Serial & USB', groupPath: [categoryName] };
  }
  if (sourceLibrary === 'C++ Web & Ethernet') {
    return { libraryName: 'C++ Language', categoryName: 'Web & Ethernet', groupPath: [categoryName] };
  }
  if (sourceLibrary === 'C++ Communication & Connectivity') {
    return { libraryName: 'C++ Language', categoryName: 'Communication & Connectivity', groupPath: [categoryName] };
  }
  if (CPP_CONTAINER_LIBRARY_NAMES.has(sourceLibrary)) {
    return { libraryName: 'C++ Language', categoryName: 'Containers', groupPath: [sourceLibrary, categoryName] };
  }
  if (sourceLibrary === 'STL Iterators & Traversal') {
    return { libraryName: 'C++ Language', categoryName: 'Iterators & Traversal', groupPath: [categoryName] };
  }
  if (sourceLibrary === 'STL Algorithms & Ranges') {
    return { libraryName: 'C++ Language', categoryName: 'Algorithms & Ranges', groupPath: [categoryName] };
  }
  if (sourceLibrary === 'C++ Callbacks & Lambdas') {
    return { libraryName: 'C++ Language', categoryName: CPP_FUNCTION_CATEGORY_NAME, groupPath: ['Callbacks & Lambdas', categoryName] };
  }
  if (sourceLibrary === 'C++ Language' && categoryName === 'Functions & Callables' && fn) {
    return { libraryName: 'C++ Language', categoryName: CPP_FUNCTION_CATEGORY_NAME, groupPath: cppCallableNestedPathForFunction(fn) };
  }
  if (sourceLibrary === 'C++ Language' && categoryName === 'Advanced Invocation & Functional' && fn) {
    return { libraryName: 'C++ Language', categoryName: CPP_FUNCTION_CATEGORY_NAME, groupPath: ['Functions & Callables', 'Invocation adapters'] };
  }
  if (sourceLibrary === 'C++ Language' && CPP_LEGACY_STL_CATEGORY_NAMES.has(categoryName) && fn) {
    return cppLegacyContentRoute(fn, categoryName);
  }
  return undefined;
}

function mergeFunctionIntoNestedCategory(category: CpmCategory, fn: CpmFunction, destination: CppNestedDestination): void {
  if (getCategoryAllFunctions(category).some((entry) => entry.name === fn.name)) return;
  const normalized = { ...fn, library: destination.libraryName, category: destination.categoryName };
  const group = ensureNestedGroup(category, destination.groupPath);
  if (group) {
    group.functions = Array.isArray(group.functions) ? group.functions : [];
    group.functions.push(normalized);
  } else {
    category.functions.push(normalized);
  }
}


function isCppDedicatedNestedLibrary(name: string): boolean {
  return CPP_DEDICATED_STL_LIBRARY_NAMES.includes(name as any)
    || CPP_DEDICATED_IO_LIBRARY_NAMES.includes(name as any);
}

function organizeCppStandardLibraries(libraries: CpmLibrary[]): CpmLibrary[] {
  const list = Array.isArray(libraries) ? libraries : [];
  const cppLibrary = list.find((library) => library.name === 'C++ Language');
  if (!cppLibrary) return list;

  cppLibrary.categories = pruneIndustrialCppCategories(cppLibrary.categories);

  for (const sourceLibrary of list) {
    if (!isCppDedicatedNestedLibrary(sourceLibrary.name)) continue;
    for (const sourceCategory of Array.isArray(sourceLibrary.categories) ? sourceLibrary.categories : []) {
      const destination = cppNestedDestinationForEntry(sourceLibrary.name, sourceCategory.name);
      if (!destination) continue;
      const targetCategory = ensureNamedCategory(cppLibrary, destination.categoryName);
      for (const fn of getCategoryAllFunctions(sourceCategory)) {
        mergeFunctionIntoNestedCategory(targetCategory, fn, destination);
      }
    }
  }

  organizeCppBasicCategories(cppLibrary);
  organizeCppFunctionCategories(cppLibrary);
  organizeCppBasicFoundationEntries(cppLibrary);
  organizeCppConcurrencyCategories(cppLibrary);

  const retainedCategories: CpmCategory[] = [];
  for (const category of Array.isArray(cppLibrary.categories) ? cppLibrary.categories : []) {
    if (!CPP_LEGACY_STL_CATEGORY_NAMES.has(category.name)) {
      retainedCategories.push(category);
      continue;
    }
    for (const fn of getCategoryAllFunctions(category)) {
      const destination = cppLegacyContentRoute(fn, category.name);
      const targetCategory = ensureNamedCategory(cppLibrary, destination.categoryName);
      mergeFunctionIntoNestedCategory(targetCategory, fn, destination);
    }
  }
  cppLibrary.categories = retainedCategories.filter((category) => !CPP_LEGACY_STL_CATEGORY_NAMES.has(category.name));

  const preferredOrder = [
    'Basic', 'OOP & Inheritance',
    'Containers', 'Iterators & Traversal', 'Algorithms & Ranges', 'Functions',
    'Templates & Generic Code', 'Files & Streams', 'Device I/O: Serial & USB',
    'Web & Ethernet', 'Communication & Connectivity', 'Pipes & IPC',
    'Concurrency', 'Time, Timers & Delays', 'Memory & Ownership',
    'Input & Events', 'Errors & Utilities', 'Pointers, References & Smart Pointers',
    'Java Equivalents & RTTI'
  ];
  cppLibrary.categories.sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left.name);
    const rightIndex = preferredOrder.indexOf(right.name);
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
      || left.name.localeCompare(right.name);
  });

  return list.filter((library) => !isCppDedicatedNestedLibrary(library.name));
}



const QT_LANGUAGE_LIBRARY_NAME = 'Qt Language';

function collectCategoryEntriesWithGroupPath(category: CpmCategory): Array<{ entry: CpmFunction; groupPath: string[] }> {
  const entries: Array<{ entry: CpmFunction; groupPath: string[] }> = [];
  for (const entry of Array.isArray(category.functions) ? category.functions : []) {
    entries.push({ entry, groupPath: [] });
  }
  const visitGroups = (groups: CpmGroup[] | undefined, prefix: string[]): void => {
    for (const group of Array.isArray(groups) ? groups : []) {
      const path = [...prefix, group.name];
      for (const entry of Array.isArray(group.functions) ? group.functions : []) {
        entries.push({ entry, groupPath: path });
      }
      visitGroups(group.groups, path);
    }
  };
  visitGroups(category.groups, []);
  return entries;
}


const C_LANGUAGE_LIBRARY_NAME = 'C Language';
const C_STRUCTURED_CATEGORY_ORDER = [
  'Basic',
  'Standard Library',
  'Types, Structures & Binary Layout',
  'Pointers, Arrays & Strings',
  'Functions, Callbacks & Variadics',
  'Memory & Lifetime',
  'Collections & Algorithms',
  'Files, Streams & Configuration',
  'Time, Timers & Delays',
  'Threads, Atomics & Synchronization',
  'Processes, IPC & Signals',
  'Networking & Web',
  'Device I/O: Serial, USB & Buses',
  'Diagnostics, Logging & Testing',
  'Build, Portability & Interop',
  'Architecture & Patterns'
] as const;

const C_LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  'Snippets & Project Skeletons': 'Basic',
  'Keywords & Preprocessor': 'Basic',
  'Time, Timers & Reliability': 'Time, Timers & Delays'
};

function canonicalCLanguageCategoryName(categoryName: string): string {
  return C_LEGACY_CATEGORY_ALIASES[categoryName] || categoryName;
}

function cLegacyBasicGroup(categoryName: string, fn: CpmFunction): string[] {
  const name = String(fn?.name || '').toLowerCase();
  if (categoryName === 'Keywords & Preprocessor' || categoryName === 'Keywords') {
    if (name.includes('include') || name.includes('define') || name.includes('pragma') || name.includes('attribute') || name.includes('has_')) {
      return ['Preprocessor, feature detection & attributes'];
    }
    return ['Core language keywords'];
  }
  if (categoryName === 'Snippets & Project Skeletons' || categoryName === 'Snippets') {
    return ['Project skeletons & translation units'];
  }
  return ['Legacy imported entries'];
}

function normalizeCLegacyGroupName(categoryName: string, groupName: string): string {
  if (categoryName === 'Snippets & Project Skeletons') {
    if (groupName === 'Translation units & headers') return 'Project skeletons & translation units';
    if (groupName === 'Error handling skeletons') return 'Error handling basics';
  }
  if (categoryName === 'Keywords & Preprocessor') {
    if (groupName === 'Preprocessor basics') return 'Preprocessor, feature detection & attributes';
  }
  return groupName;
}

function cLegacyRoute(categoryName: string, fn: CpmFunction): { categoryName: string; groupPath: string[] } {
  const name = String(fn?.name || '').toLowerCase();
  const canonicalCategoryName = canonicalCLanguageCategoryName(categoryName);
  const structuredNames = new Set<string>(C_STRUCTURED_CATEGORY_ORDER as readonly string[]);
  if (structuredNames.has(canonicalCategoryName)) {
    if (canonicalCategoryName === 'Basic' && categoryName !== 'Basic') {
      return { categoryName: 'Basic', groupPath: cLegacyBasicGroup(categoryName, fn) };
    }
    return { categoryName: canonicalCategoryName, groupPath: [] };
  }
  switch (categoryName) {
    case 'Keywords': return { categoryName: 'Basic', groupPath: cLegacyBasicGroup(categoryName, fn) };
    case 'Snippets': return { categoryName: 'Basic', groupPath: ['Project skeletons & translation units'] };
    case 'Memory & Ownership': return { categoryName: 'Memory & Lifetime', groupPath: ['Allocation strategies'] };
    case 'Memory & Lifetime': return { categoryName: 'Memory & Lifetime', groupPath: ['Ownership & copying patterns'] };
    case 'Files & Streams': return { categoryName: 'Files, Streams & Configuration', groupPath: ['Standard stdio'] };
    case 'Serialization & Parsing': return { categoryName: 'Files, Streams & Configuration', groupPath: ['Text parsing & configuration'] };
    case 'Filesystem & Paths': return { categoryName: 'Files, Streams & Configuration', groupPath: [name.includes('win32') ? 'Windows filesystem' : 'Linux POSIX filesystem'] };
    case 'Callbacks & Lambdas': return { categoryName: 'Functions, Callbacks & Variadics', groupPath: ['Advanced callback patterns'] };
    case 'Callbacks & API Design': return { categoryName: 'Functions, Callbacks & Variadics', groupPath: ['Advanced callback patterns'] };
    case 'Variadic Functions': return { categoryName: 'Functions, Callbacks & Variadics', groupPath: ['Variadic functions'] };
    case 'Pointers, Aliasing & ABI': return { categoryName: 'Pointers, Arrays & Strings', groupPath: ['Pointer aliasing, out-parameters & ABI patterns'] };
    case 'Algorithms & STL': return { categoryName: 'Collections & Algorithms', groupPath: ['Sorting & searching'] };
    case 'Iteration & Containers': return { categoryName: 'Collections & Algorithms', groupPath: ['Linked structures & traversal'] };
    case 'Pipes & IPC': return { categoryName: 'Processes, IPC & Signals', groupPath: ['Pipes, shared memory & local IPC'] };
    case 'Processes & System': return { categoryName: 'Processes, IPC & Signals', groupPath: ['Process creation & environment'] };
    case 'Threading & Synchronization': return { categoryName: 'Threads, Atomics & Synchronization', groupPath: [name.includes('win32') ? 'Windows threads' : 'POSIX pthreads'] };
    case 'Networking & Sockets': return { categoryName: 'Networking & Web', groupPath: ['Portable BSD socket direct API'] };
    case 'Time & Chrono': return { categoryName: 'Time, Timers & Delays', groupPath: ['POSIX clocks & sleep direct API'] };
    case 'Time & Reliability': return { categoryName: 'Time, Timers & Delays', groupPath: ['POSIX clocks & sleep direct API'] };
    case 'Input & Events': return { categoryName: 'Device I/O: Serial, USB & Buses', groupPath: ['Win32 console input direct API'] };
    case 'Serial & UART': return { categoryName: 'Device I/O: Serial, USB & Buses', groupPath: ['POSIX termios UART direct API'] };
    case 'Diagnostics & Logging': return { categoryName: 'Diagnostics, Logging & Testing', groupPath: ['Local logging & tracing helpers'] };
    case 'Structures & Copying': return { categoryName: 'Memory & Lifetime', groupPath: ['Ownership & copying patterns'] };
    case 'Generic Programming': return { categoryName: 'Types, Structures & Binary Layout', groupPath: ['Generic dispatch'] };
    case 'Layout, Alignment & Binary': return { categoryName: 'Types, Structures & Binary Layout', groupPath: ['Layout, alignment & representation'] };
    case 'Memory-Mapped I/O': return { categoryName: 'Device I/O: Serial, USB & Buses', groupPath: ['Memory-mapped register direct patterns'] };
    case 'Architecture & Layering': return { categoryName: 'Architecture & Patterns', groupPath: ['Layering & portability'] };
    case 'Industrial Protocols & Buses': return { categoryName: 'Device I/O: Serial, USB & Buses', groupPath: ['Bus frame & transaction descriptors'] };
    case 'DLL Helpers': return { categoryName: 'Build, Portability & Interop', groupPath: ['Shared libraries & ABI'] };
    case 'Interrupts & Concurrency': return { categoryName: 'Threads, Atomics & Synchronization', groupPath: ['ISR-safe flags & critical-section patterns'] };
    case 'C/C++ Interop': return { categoryName: 'Build, Portability & Interop', groupPath: ['C and C++ ABI boundaries'] };
    case 'Industrial Patterns': return { categoryName: 'Architecture & Patterns', groupPath: ['Test bench & state-machine patterns'] };
    default: return { categoryName: 'Basic', groupPath: ['Legacy imported entries'] };
  }
}

function mergeCFunction(category: CpmCategory, fn: CpmFunction, groupPath: string[]): void {
  const normalized = { ...fn, library: C_LANGUAGE_LIBRARY_NAME, category: category.name };
  const targetGroup = ensureNestedGroup(category, groupPath);
  const bucket = targetGroup ? targetGroup.functions! : category.functions;
  // Names may legitimately collide across different groups (for example json_object_get
  // in Jansson and json-c). Only suppress duplicates inside the exact destination group.
  if (bucket.some((entry) => entry.name === fn.name)) return;
  bucket.push(normalized);
}

function mergeCGroups(targetCategory: CpmCategory, groups: CpmGroup[] | undefined, prefix: string[] = [], sourceCategoryName = ''): void {
  for (const group of Array.isArray(groups) ? groups : []) {
    const mappedName = normalizeCLegacyGroupName(sourceCategoryName, group.name);
    const path = [...prefix, mappedName];
    for (const fn of Array.isArray(group.functions) ? group.functions : []) mergeCFunction(targetCategory, fn, path);
    mergeCGroups(targetCategory, group.groups, path, sourceCategoryName);
  }
}

function organizeCLanguageCategories(categories: CpmCategory[]): CpmCategory[] {
  const source = Array.isArray(categories) ? categories : [];
  const result: CpmLibrary = { name: C_LANGUAGE_LIBRARY_NAME, categories: [] };
  const targetNames = new Set<string>(C_STRUCTURED_CATEGORY_ORDER as readonly string[]);
  for (const category of source) {
    const canonicalCategoryName = canonicalCLanguageCategoryName(category.name);
    if (targetNames.has(canonicalCategoryName)) {
      const target = ensureNamedCategory(result, canonicalCategoryName);
      if (category.name === canonicalCategoryName) {
        for (const fn of Array.isArray(category.functions) ? category.functions : []) mergeCFunction(target, fn, []);
      } else {
        for (const fn of Array.isArray(category.functions) ? category.functions : []) {
          const destination = cLegacyRoute(category.name, fn);
          mergeCFunction(target, fn, destination.groupPath);
        }
      }
      mergeCGroups(target, category.groups, [], category.name);
      continue;
    }
    for (const fn of getCategoryAllFunctions(category)) {
      const destination = cLegacyRoute(category.name, fn);
      const target = ensureNamedCategory(result, destination.categoryName);
      mergeCFunction(target, fn, destination.groupPath);
    }
  }
  result.categories.sort((left, right) => {
    const li = C_STRUCTURED_CATEGORY_ORDER.indexOf(left.name as any);
    const ri = C_STRUCTURED_CATEGORY_ORDER.indexOf(right.name as any);
    return (li < 0 ? Number.MAX_SAFE_INTEGER : li) - (ri < 0 ? Number.MAX_SAFE_INTEGER : ri)
      || left.name.localeCompare(right.name);
  });
  return result.categories;
}


const PYTHON_LANGUAGE_LIBRARY_NAME = 'Python Language';
const PYTHON_STRUCTURED_CATEGORY_ORDER = [
  'Language Fundamentals',
  'Functions, Callables & Decorators',
  'Typing, OOP & Data Models',
  'Collections, Iterators & Algorithms',
  'Files, Paths & Configuration',
  'Serialization, Databases & Persistence',
  'Time, Scheduling & Reliability',
  'Concurrency, Async & Processes',
  'Networking, Web & APIs',
  'Device I/O: Serial, USB & Buses',
  'Linux, System & Services',
  'Interop, Native Libraries & ABI',
  'Testing, Logging & Quality',
  'Packaging, Environments & Deployment',
  'Numerical Computing & Scientific Python',
  'Signal Processing, Control & Instrumentation',
  'Data Analysis, Visualization & Notebooks',
  'AI, Vision & Model Deployment',
  'GUI, HMI & Dashboards',
  'Automation, Test Benches & Robotics'
] as const;

function pythonLegacyRoute(categoryName: string, fn: CpmFunction): { categoryName: string; groupPath: string[] } {
  const name = String(fn?.name || '').toLowerCase();
  const structuredNames = new Set<string>(PYTHON_STRUCTURED_CATEGORY_ORDER as readonly string[]);
  if (structuredNames.has(categoryName)) return { categoryName, groupPath: ['Legacy imported entries'] };
  if (categoryName === 'Keywords') return { categoryName: 'Language Fundamentals', groupPath: ['Syntax & keywords'] };
  if (categoryName === 'Python Basics') return { categoryName: 'Language Fundamentals', groupPath: ['Core syntax & idioms'] };
  if (categoryName === 'Python OOP & Typing') return { categoryName: 'Typing, OOP & Data Models', groupPath: ['Dataclasses, enums & protocols'] };
  if (categoryName === 'Python Files & Paths') {
    if (['json', 'toml', 'csv'].some((token) => name.includes(token))) return { categoryName: 'Files, Paths & Configuration', groupPath: ['JSON, TOML, INI & YAML'] };
    return { categoryName: 'Files, Paths & Configuration', groupPath: ['pathlib & filesystem'] };
  }
  if (categoryName === 'Python Data & Parsing') {
    if (name.includes('datetime')) return { categoryName: 'Time, Scheduling & Reliability', groupPath: ['Datetime, zones & timestamps'] };
    if (name.includes('statistics')) return { categoryName: 'Numerical Computing & Scientific Python', groupPath: ['Statistics & math'] };
    if (name.includes('itertools')) return { categoryName: 'Collections, Iterators & Algorithms', groupPath: ['Itertools & generators'] };
    return { categoryName: 'Language Fundamentals', groupPath: ['Text processing & regex'] };
  }
  if (categoryName === 'Python System & Networking') {
    if (name.includes('subprocess')) return { categoryName: 'Concurrency, Async & Processes', groupPath: ['Subprocesses'] };
    if (name.includes('socket') || name.includes('requests')) return { categoryName: 'Networking, Web & APIs', groupPath: [name.includes('request') ? 'HTTP clients' : 'TCP, UDP & TLS'] };
    return { categoryName: 'Language Fundamentals', groupPath: ['Exceptions & context managers'] };
  }
  if (categoryName === 'Python Concurrency') return { categoryName: 'Concurrency, Async & Processes', groupPath: [name.includes('asyncio') ? 'asyncio' : 'Threading & queues'] };
  if (categoryName === 'Python Testing & Quality') return { categoryName: 'Testing, Logging & Quality', groupPath: ['unittest & benchmarks'] };
  if (categoryName.startsWith('NumPy')) return { categoryName: 'Numerical Computing & Scientific Python', groupPath: [categoryName.toLowerCase().includes('fft') ? 'FFT & spectral analysis' : 'NumPy arrays & vectorization'] };
  if (categoryName.startsWith('SciPy Signal')) return { categoryName: 'Signal Processing, Control & Instrumentation', groupPath: ['Digital filtering & spectral analysis'] };
  if (categoryName === 'SciPy Math & Optimization' || categoryName === 'Control Systems, ODE & Optimization') return { categoryName: 'Signal Processing, Control & Instrumentation', groupPath: ['Control, ODE & optimization'] };
  if (categoryName.startsWith('SymPy')) return { categoryName: 'Numerical Computing & Scientific Python', groupPath: ['Symbolic mathematics'] };
  if (categoryName.startsWith('Pandas')) return { categoryName: 'Data Analysis, Visualization & Notebooks', groupPath: ['pandas & time series'] };
  if (categoryName.startsWith('Matplotlib')) return { categoryName: 'Data Analysis, Visualization & Notebooks', groupPath: ['Matplotlib'] };
  if (categoryName.startsWith('Jupyter') || categoryName.startsWith('Python Scientific Notebooks')) return { categoryName: 'Data Analysis, Visualization & Notebooks', groupPath: ['Notebooks & reproducibility'] };
  if (categoryName.startsWith('Data Science')) return { categoryName: 'Data Analysis, Visualization & Notebooks', groupPath: ['Scientific workflow'] };
  if (categoryName.startsWith('Python Data Engineering')) return { categoryName: 'Data Analysis, Visualization & Notebooks', groupPath: ['Columnar analytics & data engineering'] };
  if (categoryName.startsWith('scikit-learn')) return { categoryName: 'AI, Vision & Model Deployment', groupPath: ['scikit-learn'] };
  if (categoryName.startsWith('PyTorch')) return { categoryName: 'AI, Vision & Model Deployment', groupPath: ['PyTorch'] };
  if (categoryName.startsWith('TensorFlow')) return { categoryName: 'AI, Vision & Model Deployment', groupPath: ['TensorFlow & Keras'] };
  if (categoryName.startsWith('ONNX Runtime')) return { categoryName: 'AI, Vision & Model Deployment', groupPath: ['ONNX Runtime'] };
  if (categoryName.startsWith('OpenCV')) return { categoryName: 'AI, Vision & Model Deployment', groupPath: ['OpenCV computer vision'] };
  if (categoryName.startsWith('MLOps')) return { categoryName: 'AI, Vision & Model Deployment', groupPath: ['MLOps & experiments'] };
  if (categoryName.startsWith('Python Edge AI')) return { categoryName: 'AI, Vision & Model Deployment', groupPath: ['Edge AI deployment'] };
  if (categoryName.startsWith('Signal Processing')) return { categoryName: 'Signal Processing, Control & Instrumentation', groupPath: ['DSP & ML pipelines'] };
  if (categoryName.startsWith('Scientific Instrumentation')) return { categoryName: 'Signal Processing, Control & Instrumentation', groupPath: ['Instrumentation with PyVISA'] };
  if (categoryName.startsWith('Python GUI Tkinter')) return { categoryName: 'GUI, HMI & Dashboards', groupPath: ['Tkinter'] };
  if (categoryName.startsWith('Python GUI PySide6')) return { categoryName: 'GUI, HMI & Dashboards', groupPath: ['PySide6 / PyQt6'] };
  if (categoryName.startsWith('Python GUI Plotting')) return { categoryName: 'GUI, HMI & Dashboards', groupPath: ['Scientific plotting widgets'] };
  if (categoryName.startsWith('Python GUI Async')) return { categoryName: 'GUI, HMI & Dashboards', groupPath: ['GUI background work'] };
  if (categoryName.startsWith('Python Industrial Dashboards')) return { categoryName: 'GUI, HMI & Dashboards', groupPath: ['Dashboards & HMI'] };
  if (categoryName === 'Python Backend APIs') return { categoryName: 'Networking, Web & APIs', groupPath: ['FastAPI backend & frontend bridge'] };
  if (categoryName === 'Python Backend Data & Persistence') return { categoryName: 'Serialization, Databases & Persistence', groupPath: ['SQLAlchemy & repositories'] };
  if (categoryName === 'Python Automation & Operations') {
    if (name.includes('argparse')) return { categoryName: 'Language Fundamentals', groupPath: ['CLI & script entry points'] };
    if (name.includes('threadpool') || name.includes('subprocess')) return { categoryName: 'Concurrency, Async & Processes', groupPath: [name.includes('threadpool') ? 'Executors' : 'Subprocesses'] };
    if (name.includes('retry')) return { categoryName: 'Time, Scheduling & Reliability', groupPath: ['Retry & backoff'] };
    if (name.includes('logging')) return { categoryName: 'Testing, Logging & Quality', groupPath: ['Logging'] };
    return { categoryName: 'Files, Paths & Configuration', groupPath: ['JSON, TOML, INI & YAML'] };
  }
  if (categoryName === 'Python Packaging, Services & Deployment') return { categoryName: 'Packaging, Environments & Deployment', groupPath: ['Services & deployment'] };
  if (categoryName === 'Python GPIO, I2C, SPI & Serial Hardware' || categoryName === 'Python USB, HID, CAN & FTDI') {
    if (name.includes('usb') || name.includes('hid')) return { categoryName: 'Device I/O: Serial, USB & Buses', groupPath: [name.includes('usb') ? 'USB with PyUSB' : 'USB HID'] };
    if (name.includes('can')) return { categoryName: 'Device I/O: Serial, USB & Buses', groupPath: ['CAN & instrumentation'] };
    if (name.includes('serial')) return { categoryName: 'Device I/O: Serial, USB & Buses', groupPath: ['Serial ports with pySerial'] };
    return { categoryName: 'Device I/O: Serial, USB & Buses', groupPath: ['Linux hardware buses'] };
  }
  if (categoryName === 'Python Industrial I/O & Protocols') {
    if (name.includes('serial')) return { categoryName: 'Device I/O: Serial, USB & Buses', groupPath: ['Serial ports with pySerial'] };
    if (name.includes('visa') || name.includes('scpi')) return { categoryName: 'Device I/O: Serial, USB & Buses', groupPath: ['CAN & instrumentation'] };
    return { categoryName: 'Networking, Web & APIs', groupPath: ['Industrial protocols'] };
  }
  if (categoryName === 'Python Test Benches & Validation') return { categoryName: 'Automation, Test Benches & Robotics', groupPath: ['Test bench architecture'] };
  if (categoryName === 'Python Realtime Acquisition & Bench Patterns') return { categoryName: 'Automation, Test Benches & Robotics', groupPath: ['Realtime acquisition'] };
  if (categoryName === 'Python Lab Automation & Calibration Advanced') return { categoryName: 'Automation, Test Benches & Robotics', groupPath: ['Lab automation & calibration'] };
  if (categoryName === 'Python FPGA, HDL & Toolchain Automation') return { categoryName: 'Automation, Test Benches & Robotics', groupPath: ['FPGA & toolchain automation'] };
  if (categoryName === 'Python Robotics & ROS 2') return { categoryName: 'Automation, Test Benches & Robotics', groupPath: ['Robotics & ROS 2'] };
  if (categoryName === 'Python Distributed Acquisition & Orchestration') return { categoryName: 'Automation, Test Benches & Robotics', groupPath: ['Distributed acquisition & orchestration'] };
  return { categoryName: 'Language Fundamentals', groupPath: ['Legacy imported entries'] };
}

function mergePythonFunction(category: CpmCategory, fn: CpmFunction, groupPath: string[]): void {
  if (getCategoryAllFunctions(category).some((entry) => entry.name === fn.name)) return;
  const normalized = { ...fn, library: PYTHON_LANGUAGE_LIBRARY_NAME, category: category.name };
  const targetGroup = ensureNestedGroup(category, groupPath);
  if (targetGroup) targetGroup.functions!.push(normalized);
  else category.functions.push(normalized);
}

function mergePythonGroups(targetCategory: CpmCategory, groups: CpmGroup[] | undefined, prefix: string[] = []): void {
  for (const group of Array.isArray(groups) ? groups : []) {
    const path = [...prefix, group.name];
    for (const fn of Array.isArray(group.functions) ? group.functions : []) mergePythonFunction(targetCategory, fn, path);
    mergePythonGroups(targetCategory, group.groups, path);
  }
}

function organizePythonLanguageCategories(categories: CpmCategory[]): CpmCategory[] {
  const source = Array.isArray(categories) ? categories : [];
  const result: CpmLibrary = { name: PYTHON_LANGUAGE_LIBRARY_NAME, categories: [] };
  const targetNames = new Set<string>(PYTHON_STRUCTURED_CATEGORY_ORDER as readonly string[]);
  for (const category of source) {
    if (targetNames.has(category.name)) {
      const target = ensureNamedCategory(result, category.name);
      for (const fn of Array.isArray(category.functions) ? category.functions : []) mergePythonFunction(target, fn, ['Legacy imported entries']);
      mergePythonGroups(target, category.groups);
      continue;
    }
    for (const fn of getCategoryAllFunctions(category)) {
      const destination = pythonLegacyRoute(category.name, fn);
      const target = ensureNamedCategory(result, destination.categoryName);
      mergePythonFunction(target, fn, destination.groupPath);
    }
  }
  result.categories.sort((left, right) => {
    const li = PYTHON_STRUCTURED_CATEGORY_ORDER.indexOf(left.name as any);
    const ri = PYTHON_STRUCTURED_CATEGORY_ORDER.indexOf(right.name as any);
    return (li < 0 ? Number.MAX_SAFE_INTEGER : li) - (ri < 0 ? Number.MAX_SAFE_INTEGER : ri)
      || left.name.localeCompare(right.name);
  });
  return result.categories;
}


const WEB_LANGUAGE_LIBRARY_NAME = 'JavaScript / HTML / CSS';
const WEB_STRUCTURED_CATEGORY_ORDER = [
  'JavaScript Language & Modules',
  'DOM, Events & Browser APIs',
  'HTML Structure, Forms & Accessibility',
  'CSS Layout, Components & Responsive Design',
  'Graphics, Canvas, SVG & WebGL',
  'Async, Networking & Realtime',
  'Storage, Offline & Workers',
  'Frontend Components & State',
  'Backend Node.js & Express',
  'Databases, SQL & Persistence',
  'Desktop, Webviews & Native Bridges',
  'Security, Testing & Tooling',
  'Build, Packaging & Deployment'
] as const;

function webLegacyRoute(categoryName: string, fn: CpmFunction): { categoryName: string; groupPath: string[] } {
  const name = String(fn?.name || '').toLowerCase();
  if ((WEB_STRUCTURED_CATEGORY_ORDER as readonly string[]).includes(categoryName)) {
    return { categoryName, groupPath: ['Legacy imported entries'] };
  }
  if (categoryName.startsWith('CSS ')) return { categoryName: 'CSS Layout, Components & Responsive Design', groupPath: [categoryName] };
  if (categoryName.includes('Canvas') || categoryName.includes('SVG') || categoryName.includes('WebGL') || categoryName.includes('Three.js') || categoryName === 'HTML Graphics, Media & Animation') {
    return { categoryName: 'Graphics, Canvas, SVG & WebGL', groupPath: [categoryName] };
  }
  if (categoryName === 'JavaScript Basics' || categoryName === 'JavaScript Modules & Tooling') {
    return { categoryName: 'JavaScript Language & Modules', groupPath: [categoryName] };
  }
  if (categoryName === 'JavaScript DOM & Browser' || categoryName === 'JavaScript DOM Construction & Dynamic HTML' || categoryName === 'Dynamic HTML Rendering & Template Patterns') {
    return { categoryName: 'DOM, Events & Browser APIs', groupPath: [categoryName] };
  }
  if (categoryName === 'HTML & CSS') {
    const htmlLike = ['html', 'form', 'page', 'table', 'semantic', 'input'].some((token) => name.includes(token));
    return htmlLike
      ? { categoryName: 'HTML Structure, Forms & Accessibility', groupPath: ['HTML foundations'] }
      : { categoryName: 'CSS Layout, Components & Responsive Design', groupPath: ['Legacy HTML & CSS snippets'] };
  }
  if ([
    'JavaScript Async & Fetch',
    'Frontend ↔ Backend REST & JSON',
    'Frontend ↔ Backend Realtime',
    'Frontend ↔ Backend Streaming & Binary I/O',
    'Frontend ↔ Backend Streams & Workers',
    'Frontend ↔ Backend GraphQL & RPC',
    'Frontend ↔ Backend Forms & Uploads',
    'Frontend ↔ Backend Auth & Session',
    'Frontend ↔ Backend Advanced Patterns'
  ].includes(categoryName)) return { categoryName: 'Async, Networking & Realtime', groupPath: [categoryName] };
  if (categoryName === 'Service Workers & Offline Bridges') return { categoryName: 'Storage, Offline & Workers', groupPath: [categoryName] };
  if (categoryName.startsWith('React ') || categoryName.startsWith('Vue ') || categoryName.startsWith('Svelte ') || categoryName === 'Web Components & Custom Elements') {
    return { categoryName: 'Frontend Components & State', groupPath: [categoryName] };
  }
  if (categoryName.startsWith('Node.js') || categoryName.startsWith('Express ') || categoryName === 'Node.js API & Middleware' || categoryName === 'Node.js HTTP Backend' || categoryName === 'Node.js Realtime & Streaming Backend') {
    return { categoryName: 'Backend Node.js & Express', groupPath: [categoryName] };
  }
  if (['SQL ', 'PostgreSQL ', 'MySQL ', 'SQLite ', 'Node SQL '].some((prefix) => categoryName.startsWith(prefix))) {
    return { categoryName: 'Databases, SQL & Persistence', groupPath: [categoryName] };
  }
  if (categoryName.startsWith('Electron') || categoryName.includes('WebView2') || categoryName === 'Frontend ↔ Native/Desktop Bridges') {
    return { categoryName: 'Desktop, Webviews & Native Bridges', groupPath: [categoryName] };
  }
  if (categoryName === 'Fullstack Patterns, Sync & Deployment') return { categoryName: 'Build, Packaging & Deployment', groupPath: [categoryName] };
  return { categoryName: 'JavaScript Language & Modules', groupPath: ['Legacy imported entries', categoryName] };
}

function mergeWebFunction(category: CpmCategory, fn: CpmFunction, groupPath: string[]): void {
  if (getCategoryAllFunctions(category).some((entry) => entry.name === fn.name)) return;
  const normalized = { ...fn, library: WEB_LANGUAGE_LIBRARY_NAME, category: category.name };
  const targetGroup = ensureNestedGroup(category, groupPath);
  if (targetGroup) targetGroup.functions!.push(normalized);
  else category.functions.push(normalized);
}

function mergeWebGroups(targetCategory: CpmCategory, groups: CpmGroup[] | undefined, prefix: string[] = []): void {
  for (const group of Array.isArray(groups) ? groups : []) {
    const path = [...prefix, group.name];
    for (const fn of Array.isArray(group.functions) ? group.functions : []) mergeWebFunction(targetCategory, fn, path);
    mergeWebGroups(targetCategory, group.groups, path);
  }
}

function organizeWebLanguageCategories(categories: CpmCategory[]): CpmCategory[] {
  const source = Array.isArray(categories) ? categories : [];
  const result: CpmLibrary = { name: WEB_LANGUAGE_LIBRARY_NAME, categories: [] };
  const targetNames = new Set<string>(WEB_STRUCTURED_CATEGORY_ORDER as readonly string[]);
  for (const category of source) {
    if (targetNames.has(category.name)) {
      const target = ensureNamedCategory(result, category.name);
      for (const fn of Array.isArray(category.functions) ? category.functions : []) mergeWebFunction(target, fn, ['Legacy imported entries']);
      mergeWebGroups(target, category.groups);
      continue;
    }
    for (const fn of getCategoryAllFunctions(category)) {
      const destination = webLegacyRoute(category.name, fn);
      const target = ensureNamedCategory(result, destination.categoryName);
      mergeWebFunction(target, fn, destination.groupPath);
    }
  }
  result.categories.sort((left, right) => {
    const li = WEB_STRUCTURED_CATEGORY_ORDER.indexOf(left.name as any);
    const ri = WEB_STRUCTURED_CATEGORY_ORDER.indexOf(right.name as any);
    return (li < 0 ? Number.MAX_SAFE_INTEGER : li) - (ri < 0 ? Number.MAX_SAFE_INTEGER : ri)
      || left.name.localeCompare(right.name);
  });
  return result.categories;
}


const JAVA_LANGUAGE_LIBRARY_NAME = 'Java Language';
const JAVA_STRUCTURED_CATEGORY_ORDER = [
  'Language Fundamentals',
  'OOP, Interfaces & Modern Types',
  'Generics, Reflection & Annotations',
  'Collections, Iterators & Streams',
  'Files, Paths & Configuration',
  'Serialization, Databases & Persistence',
  'Time, Scheduling & Reliability',
  'Concurrency, Virtual Threads & Async',
  'Networking, Web & Realtime',
  'Device I/O: Serial, USB, Bluetooth & Buses',
  'JVM, Modules, Native Interop & Linux',
  'Testing, Logging & Quality',
  'Build, Packaging & Deployment',
  'Desktop UI: Swing, JavaFX & WebView',
  'Backend Services: Spring Boot & REST',
  'Automation, Instrumentation & Robotics'
] as const;

function javaLegacyRoute(categoryName: string, fn: CpmFunction): { categoryName: string; groupPath: string[] } {
  const name = String(fn?.name || '').toLowerCase();
  if ((JAVA_STRUCTURED_CATEGORY_ORDER as readonly string[]).includes(categoryName)) {
    return { categoryName, groupPath: ['Legacy imported entries'] };
  }
  if (categoryName === 'Keywords') return { categoryName: 'Language Fundamentals', groupPath: ['Keywords'] };
  if (categoryName === 'Java Basics') return { categoryName: 'Language Fundamentals', groupPath: ['Legacy Java Basics'] };
  if (categoryName === 'Java OOP') return { categoryName: 'OOP, Interfaces & Modern Types', groupPath: ['Legacy Java OOP'] };
  if (categoryName === 'Java Collections & Streams') return { categoryName: 'Collections, Iterators & Streams', groupPath: ['Legacy collections & streams'] };
  if (categoryName === 'Java Files & JSON') {
    if (name.includes('json')) return { categoryName: 'Serialization, Databases & Persistence', groupPath: ['Legacy JSON'] };
    return { categoryName: 'Files, Paths & Configuration', groupPath: ['Legacy files & paths'] };
  }
  if (categoryName === 'Java Concurrency') return { categoryName: 'Concurrency, Virtual Threads & Async', groupPath: ['Legacy concurrency'] };
  if (categoryName === 'Java Exceptions') return { categoryName: 'Language Fundamentals', groupPath: ['Exceptions & resource management'] };
  if (categoryName.includes('Spring') || categoryName.includes('REST')) return { categoryName: 'Backend Services: Spring Boot & REST', groupPath: [categoryName] };
  if (categoryName.includes('Serial') || categoryName.includes('USB') || categoryName.includes('Bluetooth') || categoryName.includes('GPIO')) {
    return { categoryName: 'Device I/O: Serial, USB, Bluetooth & Buses', groupPath: [categoryName] };
  }
  if (categoryName.includes('Maven') || categoryName.includes('Gradle') || categoryName.includes('Build')) {
    return { categoryName: 'Build, Packaging & Deployment', groupPath: [categoryName] };
  }
  return { categoryName: 'Language Fundamentals', groupPath: ['Legacy imported entries', categoryName] };
}

function mergeJavaFunction(category: CpmCategory, fn: CpmFunction, groupPath: string[]): void {
  if (getCategoryAllFunctions(category).some((entry) => entry.name === fn.name)) return;
  const normalized = { ...fn, library: JAVA_LANGUAGE_LIBRARY_NAME, category: category.name };
  const targetGroup = ensureNestedGroup(category, groupPath);
  if (targetGroup) targetGroup.functions!.push(normalized);
  else category.functions.push(normalized);
}

function mergeJavaGroups(targetCategory: CpmCategory, groups: CpmGroup[] | undefined, prefix: string[] = []): void {
  for (const group of Array.isArray(groups) ? groups : []) {
    const path = [...prefix, group.name];
    for (const fn of Array.isArray(group.functions) ? group.functions : []) mergeJavaFunction(targetCategory, fn, path);
    mergeJavaGroups(targetCategory, group.groups, path);
  }
}

function organizeJavaLanguageCategories(categories: CpmCategory[]): CpmCategory[] {
  const source = Array.isArray(categories) ? categories : [];
  const result: CpmLibrary = { name: JAVA_LANGUAGE_LIBRARY_NAME, categories: [] };
  const targetNames = new Set<string>(JAVA_STRUCTURED_CATEGORY_ORDER as readonly string[]);
  for (const category of source) {
    if (targetNames.has(category.name)) {
      const target = ensureNamedCategory(result, category.name);
      for (const fn of Array.isArray(category.functions) ? category.functions : []) mergeJavaFunction(target, fn, ['Legacy imported entries']);
      mergeJavaGroups(target, category.groups);
      continue;
    }
    for (const fn of getCategoryAllFunctions(category)) {
      const destination = javaLegacyRoute(category.name, fn);
      const target = ensureNamedCategory(result, destination.categoryName);
      mergeJavaFunction(target, fn, destination.groupPath);
    }
  }
  result.categories.sort((left, right) => {
    const li = JAVA_STRUCTURED_CATEGORY_ORDER.indexOf(left.name as any);
    const ri = JAVA_STRUCTURED_CATEGORY_ORDER.indexOf(right.name as any);
    return (li < 0 ? Number.MAX_SAFE_INTEGER : li) - (ri < 0 ? Number.MAX_SAFE_INTEGER : ri)
      || left.name.localeCompare(right.name);
  });
  return result.categories;
}


const CSHARP_LANGUAGE_LIBRARY_NAME = 'C# Language';
const CSHARP_STRUCTURED_CATEGORY_ORDER = [
  'Language Fundamentals',
  'OOP, Types & Data Models',
  'Generics, Reflection & Attributes',
  'Collections, LINQ & Iterators',
  'Files, Streams & Configuration',
  'Serialization, Databases & Persistence',
  'Time, Timers & Reliability',
  'Concurrency, Async & Parallelism',
  'Networking, Web & Realtime',
  'Device I/O: Serial, USB, Bluetooth & Buses',
  '.NET Runtime, Native Interop & Linux',
  'Testing, Logging & Quality',
  'Build, Packaging & Deployment',
  'Desktop UI: WPF, WinForms, MAUI & WebView',
  'ASP.NET Core, Razor Pages, MVC & APIs',
  'Automation, Instrumentation & Robotics'
] as const;

function csharpLegacyRoute(categoryName: string, fn: CpmFunction): { categoryName: string; groupPath: string[] } {
  const name = String(fn?.name || '').toLowerCase();
  if ((CSHARP_STRUCTURED_CATEGORY_ORDER as readonly string[]).includes(categoryName)) {
    return { categoryName, groupPath: ['Legacy imported entries'] };
  }
  if (categoryName === 'Keywords') return { categoryName: 'Language Fundamentals', groupPath: ['Keywords'] };
  if (categoryName === 'C# Basics') {
    if (name.includes('property') || name.includes('constructor') || name.includes('class')) return { categoryName: 'OOP, Types & Data Models', groupPath: ['Legacy classes & properties'] };
    return { categoryName: 'Language Fundamentals', groupPath: ['Legacy C# basics'] };
  }
  if (categoryName === 'C# LINQ & Collections') return { categoryName: 'Collections, LINQ & Iterators', groupPath: ['Legacy LINQ & collections'] };
  if (categoryName === 'C# Files & JSON') {
    if (name.includes('json')) return { categoryName: 'Serialization, Databases & Persistence', groupPath: ['Legacy JSON'] };
    return { categoryName: 'Files, Streams & Configuration', groupPath: ['Legacy files & streams'] };
  }
  if (categoryName === 'C# Async & Tasks') {
    if (name.includes('http')) return { categoryName: 'Networking, Web & Realtime', groupPath: ['Legacy HTTP client'] };
    return { categoryName: 'Concurrency, Async & Parallelism', groupPath: ['Legacy async & tasks'] };
  }
  if (categoryName === 'C# Exceptions & Disposal') return { categoryName: 'Language Fundamentals', groupPath: ['Exceptions & resource management'] };
  if (categoryName.includes('ASP.NET') || categoryName.includes('Razor') || categoryName.includes('MVC') || categoryName.includes('Blazor')) {
    return { categoryName: 'ASP.NET Core, Razor Pages, MVC & APIs', groupPath: [categoryName] };
  }
  if (categoryName.includes('Serial') || categoryName.includes('USB') || categoryName.includes('Bluetooth') || categoryName.includes('CAN')) {
    return { categoryName: 'Device I/O: Serial, USB, Bluetooth & Buses', groupPath: [categoryName] };
  }
  if (categoryName.includes('WPF') || categoryName.includes('WinForms') || categoryName.includes('MAUI') || categoryName.includes('WebView')) {
    return { categoryName: 'Desktop UI: WPF, WinForms, MAUI & WebView', groupPath: [categoryName] };
  }
  if (categoryName.includes('Build') || categoryName.includes('NuGet') || categoryName.includes('MSBuild')) {
    return { categoryName: 'Build, Packaging & Deployment', groupPath: [categoryName] };
  }
  return { categoryName: 'Language Fundamentals', groupPath: ['Legacy imported entries', categoryName] };
}

function mergeCsharpFunction(category: CpmCategory, fn: CpmFunction, groupPath: string[]): void {
  if (getCategoryAllFunctions(category).some((entry) => entry.name === fn.name)) return;
  const normalized = { ...fn, library: CSHARP_LANGUAGE_LIBRARY_NAME, category: category.name };
  const targetGroup = ensureNestedGroup(category, groupPath);
  if (targetGroup) targetGroup.functions!.push(normalized);
  else category.functions.push(normalized);
}

function mergeCsharpGroups(targetCategory: CpmCategory, groups: CpmGroup[] | undefined, prefix: string[] = []): void {
  for (const group of Array.isArray(groups) ? groups : []) {
    const path = [...prefix, group.name];
    for (const fn of Array.isArray(group.functions) ? group.functions : []) mergeCsharpFunction(targetCategory, fn, path);
    mergeCsharpGroups(targetCategory, group.groups, path);
  }
}

function organizeCsharpLanguageCategories(categories: CpmCategory[]): CpmCategory[] {
  const source = Array.isArray(categories) ? categories : [];
  const result: CpmLibrary = { name: CSHARP_LANGUAGE_LIBRARY_NAME, categories: [] };
  const targetNames = new Set<string>(CSHARP_STRUCTURED_CATEGORY_ORDER as readonly string[]);
  for (const category of source) {
    if (targetNames.has(category.name)) {
      const target = ensureNamedCategory(result, category.name);
      for (const fn of Array.isArray(category.functions) ? category.functions : []) mergeCsharpFunction(target, fn, ['Legacy imported entries']);
      mergeCsharpGroups(target, category.groups);
      continue;
    }
    for (const fn of getCategoryAllFunctions(category)) {
      const destination = csharpLegacyRoute(category.name, fn);
      const target = ensureNamedCategory(result, destination.categoryName);
      mergeCsharpFunction(target, fn, destination.groupPath);
    }
  }
  result.categories.sort((left, right) => {
    const li = CSHARP_STRUCTURED_CATEGORY_ORDER.indexOf(left.name as any);
    const ri = CSHARP_STRUCTURED_CATEGORY_ORDER.indexOf(right.name as any);
    return (li < 0 ? Number.MAX_SAFE_INTEGER : li) - (ri < 0 ? Number.MAX_SAFE_INTEGER : ri)
      || left.name.localeCompare(right.name);
  });
  return result.categories;
}

let qtBundledGroupPathIndex: Map<string, string[]> | undefined;

function qtGroupPathIndexKey(categoryName: string, functionName: string): string {
  return `${categoryName}\u0000${functionName}`;
}

function getQtBundledGroupPath(categoryName: string, functionName: string): string[] {
  if (!qtBundledGroupPathIndex) {
    qtBundledGroupPathIndex = new Map<string, string[]>();
    try {
      const defaultPackPath = path.join(__dirname, '..', 'data', 'default_pack.json');
      const raw = JSON.parse(fs.readFileSync(defaultPackPath, 'utf8')) as LibraryPackFile;
      const environments = Array.isArray(raw.environments) ? raw.environments : [];
      for (const environment of environments) {
        for (const library of Array.isArray(environment.libraries) ? environment.libraries : []) {
          if (library.name !== QT_LANGUAGE_LIBRARY_NAME) continue;
          for (const category of Array.isArray(library.categories) ? library.categories : []) {
            for (const { entry, groupPath } of collectCategoryEntriesWithGroupPath(category)) {
              if (!groupPath.length) continue;
              const key = qtGroupPathIndexKey(category.name, entry.name);
              if (!qtBundledGroupPathIndex.has(key)) qtBundledGroupPathIndex.set(key, [...groupPath]);
            }
          }
        }
      }
    } catch {
      // Keep an empty index when the bundled pack is unavailable.
    }
  }
  return [...(qtBundledGroupPathIndex.get(qtGroupPathIndexKey(categoryName, functionName)) || [])];
}

function qtStructuredGroupPath(categoryName: string, fn: CpmFunction): string[] {
  return getQtBundledGroupPath(categoryName, fn.name);
}

function starterNestedDestinationForEntry(sourceLibraryName: string | undefined, sourceCategoryName: string, entry: StarterPackEntry): { libraryName: string; categoryName: string; groupPath: string[] } | undefined {
  const libraryName = sourceLibraryName || entry.library;
  if (Array.isArray(entry.__jcGroupPath) && entry.__jcGroupPath.length) {
    return { libraryName, categoryName: sourceCategoryName, groupPath: [...entry.__jcGroupPath] };
  }
  if (libraryName === C_LANGUAGE_LIBRARY_NAME) {
    const destination = cLegacyRoute(sourceCategoryName, entry);
    return { libraryName: C_LANGUAGE_LIBRARY_NAME, categoryName: destination.categoryName, groupPath: destination.groupPath };
  }
  if (libraryName === PYTHON_LANGUAGE_LIBRARY_NAME) {
    const destination = pythonLegacyRoute(sourceCategoryName, entry);
    return { libraryName: PYTHON_LANGUAGE_LIBRARY_NAME, categoryName: destination.categoryName, groupPath: destination.groupPath };
  }
  if (libraryName === WEB_LANGUAGE_LIBRARY_NAME) {
    const destination = webLegacyRoute(sourceCategoryName, entry);
    return { libraryName: WEB_LANGUAGE_LIBRARY_NAME, categoryName: destination.categoryName, groupPath: destination.groupPath };
  }
  if (libraryName === JAVA_LANGUAGE_LIBRARY_NAME) {
    const destination = javaLegacyRoute(sourceCategoryName, entry);
    return { libraryName: JAVA_LANGUAGE_LIBRARY_NAME, categoryName: destination.categoryName, groupPath: destination.groupPath };
  }
  if (libraryName === CSHARP_LANGUAGE_LIBRARY_NAME) {
    const destination = csharpLegacyRoute(sourceCategoryName, entry);
    return { libraryName: CSHARP_LANGUAGE_LIBRARY_NAME, categoryName: destination.categoryName, groupPath: destination.groupPath };
  }
  if (libraryName === QT_LANGUAGE_LIBRARY_NAME) {
    const structuredPath = qtStructuredGroupPath(sourceCategoryName, entry);
    if (structuredPath.length) return { libraryName, categoryName: sourceCategoryName, groupPath: structuredPath };
    const destination = qtLegacyRoute(sourceCategoryName, entry);
    return { libraryName: QT_LANGUAGE_LIBRARY_NAME, categoryName: destination.categoryName, groupPath: destination.groupPath };
  }
  return cppNestedDestinationForEntry(libraryName, sourceCategoryName, entry);
}
const QT_STRUCTURED_CATEGORY_ORDER = [
  'Meta-Object & Core',
  'Signals, Slots & Events',
  'Event Loop, Refresh & Timers',
  'Widgets & Windows',
  'Designer & UI Forms',
  'Models, Views & Delegates',
  'Files, Settings & Processes',
  'Serial, Bus & Device I/O',
  'Networking, Web & IPC',
  'Threads, Concurrency & Async',
  'Painting, Graphics & Imaging',
  'Application Utilities, Plugins & Build'
] as const;

function qtLegacyRoute(categoryName: string, fn: CpmFunction): { categoryName: string; groupPath: string[] } {
  const name = String(fn?.name || '').toLowerCase();
  if (categoryName === 'Keywords') return { categoryName: 'Meta-Object & Core', groupPath: ['QObject, macros & properties'] };
  if (categoryName === 'Signals & Slots') return { categoryName: 'Signals, Slots & Events', groupPath: [name.includes('event') ? 'Events & filters' : 'Typed connections'] };
  if (categoryName === 'Qt Plugins & Dynamic Libraries') {
    if (name.includes('qpluginloader') || name.includes('plugin interface') || name.includes('qlibrary versus')) {
      return { categoryName: 'Application Utilities, Plugins & Build', groupPath: ['Qt plugins with QPluginLoader'] };
    }
    return { categoryName: 'Application Utilities, Plugins & Build', groupPath: ['Dynamic libraries with QLibrary'] };
  }
  if (categoryName === 'Qt CMake & Deployment') {
    if (['copy runtime', 'sidecar', 'install runtime', 'deploy qt runtime'].some((token) => name.includes(token))) {
      return { categoryName: 'Application Utilities, Plugins & Build', groupPath: ['Runtime DLL deployment'] };
    }
    if (['prefix path', 'configure build', 'cmakepresets'].some((token) => name.includes(token))) {
      return { categoryName: 'Application Utilities, Plugins & Build', groupPath: ['Build commands & Qt discovery'] };
    }
    return { categoryName: 'Application Utilities, Plugins & Build', groupPath: ['CMake project skeletons'] };
  }
    if (categoryName === 'Qt Object Creation & Wiring') return { categoryName: 'Widgets & Windows', groupPath: ['Runtime creation & wiring'] };
  if (categoryName === 'Qt Designer / UIR Wiring') return { categoryName: 'Designer & UI Forms', groupPath: ['Designer setupUi & wiring'] };
  if (categoryName === 'Qt Widgets & Windows' || categoryName === 'Qt Widgets') {
    if (name.includes('qapplication main')) return { categoryName: 'Widgets & Windows', groupPath: ['Application bootstrap'] };
    if (name.includes('dialog')) return { categoryName: 'Widgets & Windows', groupPath: ['Dialogs'] };
    if (['action', 'toolbar', 'menu', 'shortcut'].some((token) => name.includes(token))) return { categoryName: 'Widgets & Windows', groupPath: ['Actions, menus & shortcuts'] };
    if (['mainwindow', 'dock', 'splitter', 'tabwidget', 'stackedwidget'].some((token) => name.includes(token))) return { categoryName: 'Widgets & Windows', groupPath: ['Windows, docks & layouts'] };
    return { categoryName: 'Widgets & Windows', groupPath: ['Common widgets'] };
  }
  if (categoryName === 'Qt Model/View & Data' || categoryName === 'Qt Models & Views') {
    if (name.includes('proxy') || name.includes('filter')) return { categoryName: 'Models, Views & Delegates', groupPath: ['Proxy models & filtering'] };
    if (['selection', 'persistent', 'mapper'].some((token) => name.includes(token))) return { categoryName: 'Models, Views & Delegates', groupPath: ['Selection & data binding'] };
    if (name.includes('abstract') || name.includes('custom model')) return { categoryName: 'Models, Views & Delegates', groupPath: ['Custom models'] };
    return { categoryName: 'Models, Views & Delegates', groupPath: ['Ready-to-use models & views'] };
  }
  if (categoryName === 'Qt File & JSON') {
    if (name.includes('json')) return { categoryName: 'Files, Settings & Processes', groupPath: ['JSON'] };
    if (name.includes('settings')) return { categoryName: 'Files, Settings & Processes', groupPath: ['Settings & paths'] };
    return { categoryName: 'Files, Settings & Processes', groupPath: ['QFile & streams'] };
  }
  if (categoryName === 'Qt I/O & Concurrency') return { categoryName: 'Threads, Concurrency & Async', groupPath: ['Worker objects & QThread'] };
  if (categoryName === 'Qt Networking') {
    if (name.includes('local')) return { categoryName: 'Networking, Web & IPC', groupPath: ['Local IPC'] };
    if (name.includes('udp')) return { categoryName: 'Networking, Web & IPC', groupPath: ['UDP'] };
    if (name.includes('tcp')) return { categoryName: 'Networking, Web & IPC', groupPath: ['TCP'] };
    return { categoryName: 'Networking, Web & IPC', groupPath: ['HTTP & REST'] };
  }
  if (categoryName === 'Qt Painting, Graphics & Imaging') {
    if (name.includes('graphics')) return { categoryName: 'Painting, Graphics & Imaging', groupPath: ['Graphics View framework'] };
    if (name.includes('opengl')) return { categoryName: 'Painting, Graphics & Imaging', groupPath: ['OpenGL & accelerated widgets'] };
    if (['image', 'pixmap', 'movie', 'grab'].some((token) => name.includes(token))) return { categoryName: 'Painting, Graphics & Imaging', groupPath: ['Images & pixmaps'] };
    return { categoryName: 'Painting, Graphics & Imaging', groupPath: ['QPainter & custom widgets'] };
  }
  if (categoryName === 'Qt State & UI Patterns') {
    if (name.includes('paint')) return { categoryName: 'Painting, Graphics & Imaging', groupPath: ['QPainter & custom widgets'] };
    if (name.includes('process') || name.includes('filedialog')) return { categoryName: 'Files, Settings & Processes', groupPath: ['Processes & dialogs'] };
    return { categoryName: 'Widgets & Windows', groupPath: ['State & UI patterns'] };
  }
  if (categoryName === 'Qt Core') {
    if (['timer', 'elapsed', 'deadline', 'processevents', 'refresh', 'update', 'repaint'].some((token) => name.includes(token))) return { categoryName: 'Event Loop, Refresh & Timers', groupPath: ['Timers & pacing'] };
    if (['settings', 'savefile', 'standardpaths', 'process'].some((token) => name.includes(token))) return { categoryName: 'Files, Settings & Processes', groupPath: ['Settings & paths'] };
    if (['concurrent', 'future', 'invokemethod'].some((token) => name.includes(token))) return { categoryName: 'Threads, Concurrency & Async', groupPath: ['Queued invocation & futures'] };
    if (name.includes('eventfilter')) return { categoryName: 'Signals, Slots & Events', groupPath: ['Events & filters'] };
    if (name.includes('commandline')) return { categoryName: 'Application Utilities, Plugins & Build', groupPath: ['CLI & application metadata'] };
    return { categoryName: 'Meta-Object & Core', groupPath: ['Qt value types & utilities'] };
  }
  return { categoryName, groupPath: [] };
}

function mergeQtFunction(category: CpmCategory, fn: CpmFunction, groupPath: string[]): void {
  if (getCategoryAllFunctions(category).some((entry) => entry.name === fn.name)) return;
  const normalized = { ...fn, library: QT_LANGUAGE_LIBRARY_NAME, category: category.name };
  const targetGroup = ensureNestedGroup(category, groupPath);
  if (targetGroup) targetGroup.functions!.push(normalized);
  else category.functions.push(normalized);
}

function mergeQtGroups(targetCategory: CpmCategory, groups: CpmGroup[] | undefined, prefix: string[] = []): void {
  for (const group of Array.isArray(groups) ? groups : []) {
    const path = [...prefix, group.name];
    for (const fn of Array.isArray(group.functions) ? group.functions : []) mergeQtFunction(targetCategory, fn, path);
    mergeQtGroups(targetCategory, group.groups, path);
  }
}

function organizeQtLanguageCategories(categories: CpmCategory[]): CpmCategory[] {
  const source = Array.isArray(categories) ? categories : [];
  const result: CpmLibrary = { name: QT_LANGUAGE_LIBRARY_NAME, categories: [] };
  const targetNames = new Set<string>(QT_STRUCTURED_CATEGORY_ORDER as readonly string[]);
  for (const category of source) {
    if (targetNames.has(category.name)) {
      const target = ensureNamedCategory(result, category.name);
      for (const fn of Array.isArray(category.functions) ? category.functions : []) {
        mergeQtFunction(target, fn, qtStructuredGroupPath(category.name, fn));
      }
      mergeQtGroups(target, category.groups);
      continue;
    }
    for (const fn of getCategoryAllFunctions(category)) {
      const destination = qtLegacyRoute(category.name, fn);
      const target = ensureNamedCategory(result, destination.categoryName);
      mergeQtFunction(target, fn, destination.groupPath);
    }
  }
  result.categories.sort((left, right) => {
    const li = QT_STRUCTURED_CATEGORY_ORDER.indexOf(left.name as any);
    const ri = QT_STRUCTURED_CATEGORY_ORDER.indexOf(right.name as any);
    return (li < 0 ? Number.MAX_SAFE_INTEGER : li) - (ri < 0 ? Number.MAX_SAFE_INTEGER : ri)
      || left.name.localeCompare(right.name);
  });
  return result.categories;
}




const SYSTEM_SCRIPT_LIBRARY_CANONICAL_NAMES = new Map<string, string>([
  ['PowerShell Scripts', 'PowerShell 7'],
  ['PowerShell 7', 'PowerShell 7'],
  ['Windows CMD / Batch', 'Windows CMD & Batch'],
  ['Windows CMD & Batch', 'Windows CMD & Batch'],
  ['Linux Shell Scripts', 'Bash & POSIX Shell'],
  ['Bash & POSIX Shell', 'Bash & POSIX Shell'],
  ['Cross-Platform Automation', 'Cross-Platform Automation'],
  ['Linux systemd & Administration', 'Linux systemd & Administration'],
  ['Git, SSH, Docker & DevOps', 'Git, SSH, Docker & DevOps']
]);

const SYSTEM_SCRIPT_CATEGORY_ORDER: Record<string, readonly string[]> = {
  'Cross-Platform Automation': [
    'Script Design, Reliability & Portability',
    'Network, Transfer & Diagnostics',
    'Build, Packaging & Release Automation'
  ],
  'PowerShell 7': [
    'Language, Scripts & Modules',
    'Files, Data & Configuration',
    'Processes, Jobs & Remoting',
    'Windows Administration',
    'HTTP, Security & Developer Workflows'
  ],
  'Windows CMD & Batch': [
    'Batch Language & Script Structure',
    'Files, Text & Deployment',
    'Processes, Services, Tasks & Network',
    'Developer Workflows'
  ],
  'Bash & POSIX Shell': [
    'Shell Language, Reliability & Portability',
    'Files, Text & Structured Data',
    'Processes, Scheduling & Services',
    'SSH, Networking & Remote Deployment',
    'Build & Developer Workflows'
  ],
  'Linux systemd & Administration': [
    'systemd Services, Timers & Units',
    'Logs, Diagnostics & Operations',
    'Linux Network, Security & Packages'
  ],
  'Git, SSH, Docker & DevOps': [
    'Git Repository Workflows',
    'OpenSSH & Secure Remote Access',
    'Docker, Compose & Containers',
    'CI, Release & Environment Files'
  ]
};

function canonicalSystemScriptLibraryName(name: string): string {
  return SYSTEM_SCRIPT_LIBRARY_CANONICAL_NAMES.get(name) || name;
}

function systemScriptLegacyRoute(libraryName: string, categoryName: string): { categoryName: string; groupPath: string[] } {
  if (libraryName === 'PowerShell 7') {
    if (categoryName === 'Keywords') return { categoryName: 'Language, Scripts & Modules', groupPath: ['Legacy keywords'] };
    if (categoryName === 'PowerShell Basics') return { categoryName: 'Language, Scripts & Modules', groupPath: ['Legacy script basics'] };
    if (categoryName === 'PowerShell Variables & Syntax') return { categoryName: 'Language, Scripts & Modules', groupPath: ['Legacy variables & syntax'] };
    if (categoryName === 'PowerShell Loops & Flow') return { categoryName: 'Language, Scripts & Modules', groupPath: ['Legacy loops & flow'] };
    if (categoryName === 'PowerShell Files & Paths') return { categoryName: 'Files, Data & Configuration', groupPath: ['Legacy files & paths'] };
    if (categoryName === 'PowerShell JSON & Web') return { categoryName: 'Files, Data & Configuration', groupPath: ['Legacy JSON & web'] };
    if (categoryName === 'PowerShell Processes & Services') return { categoryName: 'Processes, Jobs & Remoting', groupPath: ['Legacy processes & services'] };
    if (categoryName === 'PowerShell Registry & System') return { categoryName: 'Windows Administration', groupPath: ['Legacy registry & system'] };
    if (categoryName === 'PowerShell Build & Deployment') return { categoryName: 'HTTP, Security & Developer Workflows', groupPath: ['Legacy build & deployment'] };
  }
  if (libraryName === 'Windows CMD & Batch') {
    if (categoryName === 'Keywords') return { categoryName: 'Batch Language & Script Structure', groupPath: ['Legacy keywords'] };
    if (categoryName === 'Windows Batch Basics') return { categoryName: 'Batch Language & Script Structure', groupPath: ['Legacy basics'] };
    if (categoryName === 'Windows Batch Variables & Syntax') return { categoryName: 'Batch Language & Script Structure', groupPath: ['Legacy variables & syntax'] };
    if (categoryName === 'Windows Batch Loops & Flow') return { categoryName: 'Batch Language & Script Structure', groupPath: ['Legacy loops & flow'] };
    if (categoryName === 'Windows Batch Files & Paths') return { categoryName: 'Files, Text & Deployment', groupPath: ['Legacy files & paths'] };
    if (categoryName === 'Windows Batch Processes & Logs') return { categoryName: 'Processes, Services, Tasks & Network', groupPath: ['Legacy processes & logs'] };
    if (categoryName === 'Windows Batch Build & Deployment') return { categoryName: 'Developer Workflows', groupPath: ['Legacy build & deployment'] };
  }
  if (libraryName === 'Bash & POSIX Shell') {
    if (categoryName === 'Keywords') return { categoryName: 'Shell Language, Reliability & Portability', groupPath: ['Legacy keywords'] };
    if (categoryName === 'Bash Basics') return { categoryName: 'Shell Language, Reliability & Portability', groupPath: ['Legacy basics'] };
    if (categoryName === 'Bash Files & Paths') return { categoryName: 'Files, Text & Structured Data', groupPath: ['Legacy files & paths'] };
    if (categoryName === 'Bash Text & Parsing') return { categoryName: 'Files, Text & Structured Data', groupPath: ['Legacy text & parsing'] };
    if (categoryName === 'Bash Processes & Services') return { categoryName: 'Processes, Scheduling & Services', groupPath: ['Legacy processes & services'] };
    if (categoryName === 'Bash SSH & Networking') return { categoryName: 'SSH, Networking & Remote Deployment', groupPath: ['Legacy SSH & networking'] };
    if (categoryName === 'Bash Build & Deployment') return { categoryName: 'Build & Developer Workflows', groupPath: ['Legacy build & deployment'] };
  }
  return { categoryName: SYSTEM_SCRIPT_CATEGORY_ORDER[libraryName]?.[0] || categoryName, groupPath: ['Legacy imported entries', categoryName] };
}

function mergeSystemScriptFunction(category: CpmCategory, fn: CpmFunction, libraryName: string, groupPath: string[]): void {
  if (getCategoryAllFunctions(category).some((entry) => entry.name === fn.name)) return;
  const normalized = { ...fn, library: libraryName, category: category.name };
  const targetGroup = ensureNestedGroup(category, groupPath);
  if (targetGroup) targetGroup.functions!.push(normalized);
  else category.functions.push(normalized);
}

function mergeSystemScriptGroups(targetCategory: CpmCategory, groups: CpmGroup[] | undefined, libraryName: string, prefix: string[] = []): void {
  for (const group of Array.isArray(groups) ? groups : []) {
    const path = [...prefix, group.name];
    for (const fn of Array.isArray(group.functions) ? group.functions : []) mergeSystemScriptFunction(targetCategory, fn, libraryName, path);
    mergeSystemScriptGroups(targetCategory, group.groups, libraryName, path);
  }
}

function organizeSystemScriptLibraryCategories(libraryName: string, categories: CpmCategory[]): CpmCategory[] {
  const order = SYSTEM_SCRIPT_CATEGORY_ORDER[libraryName];
  if (!order) return categories;
  const result: CpmLibrary = { name: libraryName, categories: [] };
  const targetNames = new Set<string>(order as readonly string[]);
  for (const category of Array.isArray(categories) ? categories : []) {
    if (targetNames.has(category.name)) {
      const target = ensureNamedCategory(result, category.name);
      for (const fn of Array.isArray(category.functions) ? category.functions : []) mergeSystemScriptFunction(target, fn, libraryName, ['Legacy imported entries']);
      mergeSystemScriptGroups(target, category.groups, libraryName);
      continue;
    }
    const destination = systemScriptLegacyRoute(libraryName, category.name);
    const target = ensureNamedCategory(result, destination.categoryName);
    for (const fn of getCategoryAllFunctions(category)) mergeSystemScriptFunction(target, fn, libraryName, destination.groupPath);
  }
  result.categories.sort((left, right) => {
    const li = order.indexOf(left.name);
    const ri = order.indexOf(right.name);
    return (li < 0 ? Number.MAX_SAFE_INTEGER : li) - (ri < 0 ? Number.MAX_SAFE_INTEGER : ri)
      || left.name.localeCompare(right.name);
  });
  return result.categories;
}

function mergeDuplicateSystemScriptLibraries(libraries: CpmLibrary[]): CpmLibrary[] {
  const output: CpmLibrary[] = [];
  const byName = new Map<string, CpmLibrary>();
  for (const library of libraries) {
    if (!SYSTEM_SCRIPT_CATEGORY_ORDER[library.name]) {
      output.push(library);
      continue;
    }
    const existing = byName.get(library.name);
    if (!existing) {
      const created = { name: library.name, categories: organizeSystemScriptLibraryCategories(library.name, library.categories || []) };
      byName.set(library.name, created);
      output.push(created);
      continue;
    }
    existing.categories = organizeSystemScriptLibraryCategories(library.name, [...(existing.categories || []), ...(library.categories || [])]);
  }
  return output;
}

const EMBEDDED_LIBRARY_CANONICAL_NAMES = new Map<string, string>([
  ['Embedded Systems', 'Embedded Systems'],
  ['Arduino', 'Arduino AVR (UNO / Nano ATmega328P)'],
  ['Arduino AVR (UNO / Nano ATmega328P)', 'Arduino AVR (UNO / Nano ATmega328P)'],
  ['ESP32 Arduino', 'ESP32 Arduino'],
  ['Raspberry Pi', 'Raspberry Pi Linux Embedded'],
  ['Raspberry Pi Linux Embedded', 'Raspberry Pi Linux Embedded']
]);

const EMBEDDED_CATEGORY_ORDER: Record<string, readonly string[]> = {
  'Embedded Systems': [
    'Architecture, Timing & Reliability',
    'ISR, Buffers & DMA',
    'RTOS & Low-Power',
    'Protocol & Driver Patterns'
  ],
  'Arduino AVR (UNO / Nano ATmega328P)': [
    'Arduino Core, GPIO & Scheduling',
    'AVR GPIO & Register Map',
    'Interrupts, Timers & PWM Registers',
    'ADC, Serial, SPI, TWI, EEPROM & Power',
    'Arduino Libraries, Tooling & Pitfalls'
  ],
  'ESP32 Arduino': [
    'ESP32 Core, GPIO & Analog',
    'ESP32 Timers, PWM & ISR Safety',
    'ESP32 FreeRTOS, NVS & Filesystems',
    'ESP32 Connectivity',
    'ESP32 Serial, I2C, SPI, RMT, I2S & USB',
    'ESP32 Build & Diagnostics'
  ],
  'Raspberry Pi Linux Embedded': [
    'GPIO with libgpiod',
    'Linux I2C, SPI, UART & PWM',
    'Services, Deployment & Diagnostics',
    'MCU Coordination & Camera'
  ]
};

function canonicalEmbeddedLibraryName(name: string): string {
  return EMBEDDED_LIBRARY_CANONICAL_NAMES.get(name) || name;
}

function embeddedLegacyRoute(libraryName: string, categoryName: string): { categoryName: string; groupPath: string[] } {
  if (libraryName === 'Embedded Systems') {
    if (categoryName === 'Embedded GPIO & Timing') return { categoryName: 'Architecture, Timing & Reliability', groupPath: ['Legacy GPIO & timing'] };
    if (categoryName === 'Embedded Buses & Peripherals') return { categoryName: 'Protocol & Driver Patterns', groupPath: ['Legacy buses & peripherals'] };
    if (categoryName === 'Embedded RTOS & ISR') return { categoryName: 'RTOS & Low-Power', groupPath: ['Legacy RTOS & ISR'] };
    return { categoryName: 'Architecture, Timing & Reliability', groupPath: ['Legacy imported entries', categoryName] };
  }
  if (libraryName === 'Arduino AVR (UNO / Nano ATmega328P)') {
    if (categoryName === 'Arduino Core') return { categoryName: 'Arduino Core, GPIO & Scheduling', groupPath: ['Legacy Arduino core'] };
    if (categoryName === 'Arduino Peripherals') return { categoryName: 'ADC, Serial, SPI, TWI, EEPROM & Power', groupPath: ['Legacy Arduino peripherals'] };
    return { categoryName: 'Arduino Libraries, Tooling & Pitfalls', groupPath: ['Legacy imported entries', categoryName] };
  }
  if (libraryName === 'Raspberry Pi Linux Embedded') {
    if (categoryName === 'Raspberry Pi GPIO') return { categoryName: 'GPIO with libgpiod', groupPath: ['Legacy GPIO'] };
    if (categoryName === 'Raspberry Pi I/O') return { categoryName: 'Linux I2C, SPI, UART & PWM', groupPath: ['Legacy Linux I/O'] };
    return { categoryName: 'MCU Coordination & Camera', groupPath: ['Legacy imported entries', categoryName] };
  }
  return { categoryName: 'ESP32 Core, GPIO & Analog', groupPath: ['Legacy imported entries', categoryName] };
}

function mergeEmbeddedFunction(category: CpmCategory, fn: CpmFunction, libraryName: string, groupPath: string[]): void {
  if (getCategoryAllFunctions(category).some((entry) => entry.name === fn.name)) return;
  const normalized = { ...fn, library: libraryName, category: category.name };
  const targetGroup = ensureNestedGroup(category, groupPath);
  if (targetGroup) targetGroup.functions!.push(normalized);
  else category.functions.push(normalized);
}

function mergeEmbeddedGroups(targetCategory: CpmCategory, groups: CpmGroup[] | undefined, libraryName: string, prefix: string[] = []): void {
  for (const group of Array.isArray(groups) ? groups : []) {
    const path = [...prefix, group.name];
    for (const fn of Array.isArray(group.functions) ? group.functions : []) mergeEmbeddedFunction(targetCategory, fn, libraryName, path);
    mergeEmbeddedGroups(targetCategory, group.groups, libraryName, path);
  }
}

function organizeEmbeddedLibraryCategories(libraryName: string, categories: CpmCategory[]): CpmCategory[] {
  const order = EMBEDDED_CATEGORY_ORDER[libraryName];
  if (!order) return categories;
  const result: CpmLibrary = { name: libraryName, categories: [] };
  const targetNames = new Set<string>(order as readonly string[]);
  for (const category of Array.isArray(categories) ? categories : []) {
    if (targetNames.has(category.name)) {
      const target = ensureNamedCategory(result, category.name);
      for (const fn of Array.isArray(category.functions) ? category.functions : []) mergeEmbeddedFunction(target, fn, libraryName, ['Legacy imported entries']);
      mergeEmbeddedGroups(target, category.groups, libraryName);
      continue;
    }
    const destination = embeddedLegacyRoute(libraryName, category.name);
    const target = ensureNamedCategory(result, destination.categoryName);
    for (const fn of getCategoryAllFunctions(category)) mergeEmbeddedFunction(target, fn, libraryName, destination.groupPath);
  }
  result.categories.sort((left, right) => {
    const li = order.indexOf(left.name);
    const ri = order.indexOf(right.name);
    return (li < 0 ? Number.MAX_SAFE_INTEGER : li) - (ri < 0 ? Number.MAX_SAFE_INTEGER : ri)
      || left.name.localeCompare(right.name);
  });
  return result.categories;
}

function mergeDuplicateEmbeddedLibraries(libraries: CpmLibrary[]): CpmLibrary[] {
  const output: CpmLibrary[] = [];
  const byName = new Map<string, CpmLibrary>();
  for (const library of libraries) {
    if (!EMBEDDED_CATEGORY_ORDER[library.name]) {
      output.push(library);
      continue;
    }
    const existing = byName.get(library.name);
    if (!existing) {
      const created = { name: library.name, categories: organizeEmbeddedLibraryCategories(library.name, library.categories || []) };
      byName.set(library.name, created);
      output.push(created);
      continue;
    }
    existing.categories = organizeEmbeddedLibraryCategories(library.name, [...(existing.categories || []), ...(library.categories || [])]);
  }
  return output;
}

function normalizeLibraries(libraries: CpmLibrary[], environmentName = DEFAULT_ENVIRONMENT_NAME): CpmLibrary[] {
  const normalized = (Array.isArray(libraries) ? libraries : []).map((library) => {
    const normalizedLibraryName = canonicalSystemScriptLibraryName(canonicalEmbeddedLibraryName(library.name));
    const categories = (Array.isArray(library.categories) ? library.categories : []).map((category) => ({
      name: category.name,
      functions: (Array.isArray(category.functions) ? category.functions : []).map((fn) => normalizeFunction(fn, environmentName, normalizedLibraryName, category.name)),
      groups: (Array.isArray((category as any).groups) ? (category as any).groups : []).map((group) => normalizeGroup(group, environmentName, normalizedLibraryName, category.name))
    }));
    return {
      name: normalizedLibraryName,
      categories: normalizedLibraryName === C_LANGUAGE_LIBRARY_NAME
        ? organizeCLanguageCategories(categories)
        : (normalizedLibraryName === 'C++ Language'
          ? organizeCppPointerCategories(categories)
          : (normalizedLibraryName === PYTHON_LANGUAGE_LIBRARY_NAME
            ? organizePythonLanguageCategories(categories)
            : (normalizedLibraryName === WEB_LANGUAGE_LIBRARY_NAME
              ? organizeWebLanguageCategories(categories)
              : (normalizedLibraryName === JAVA_LANGUAGE_LIBRARY_NAME
                ? organizeJavaLanguageCategories(categories)
                : (normalizedLibraryName === CSHARP_LANGUAGE_LIBRARY_NAME
                  ? organizeCsharpLanguageCategories(categories)
                  : (normalizedLibraryName === QT_LANGUAGE_LIBRARY_NAME
                    ? organizeQtLanguageCategories(categories)
                    : organizeEmbeddedLibraryCategories(normalizedLibraryName, organizeSystemScriptLibraryCategories(normalizedLibraryName, categories))))))))
    };
  });
  return mergeDuplicateSystemScriptLibraries(mergeDuplicateEmbeddedLibraries(organizeCppStandardLibraries(normalized)));
}

function normalizeEnvironments(environments: CpmEnvironment[] | undefined, legacyLibraries?: CpmLibrary[]): CpmEnvironment[] {
  const source = Array.isArray(environments) && environments.length
    ? environments
    : [{ name: DEFAULT_ENVIRONMENT_NAME, libraries: Array.isArray(legacyLibraries) ? legacyLibraries : [] } as CpmEnvironment];

  return source.map((environment, environmentIndex) => {
    const environmentName = environment?.name?.trim() || `Environment ${environmentIndex + 1}`;
    return {
      name: environmentName,
      libraries: normalizeLibraries(Array.isArray(environment?.libraries) ? environment.libraries : [], environmentName)
    };
  });
}

function flattenLibrariesFromEnvironments(environments: CpmEnvironment[]): CpmLibrary[] {
  const libraries: CpmLibrary[] = [];
  for (const environment of Array.isArray(environments) ? environments : []) {
    for (const library of Array.isArray(environment.libraries) ? environment.libraries : []) {
      libraries.push({
        name: library.name,
        categories: (Array.isArray(library.categories) ? library.categories : []).map((category) => ({
          name: category.name,
          functions: (Array.isArray(category.functions) ? category.functions : []).map((fn) => ({ ...fn })),
          groups: (Array.isArray((category as any).groups) ? (category as any).groups : []).map((group) => cloneGroup(group))
        }))
      });
    }
  }
  return libraries;
}

function getPackStorageEnvironmentName(environmentName: string, environments: CpmEnvironment[]): string {
  const trimmed = String(environmentName || '').trim() || DEFAULT_ENVIRONMENT_NAME;
  if ((environments || []).length <= 1 && (trimmed === DEFAULT_ENVIRONMENT_NAME || trimmed === 'Default')) {
    return '';
  }
  return trimmed;
}

function getDatabaseLibraryLabel(pack: LoadedPack, environmentName: string, libraryName: string): string {
  const environmentLabel = getPackStorageEnvironmentName(environmentName, pack.environments || []);
  return environmentLabel ? `${environmentLabel} / ${libraryName}` : libraryName;
}

function toPackStorageFile(packFile: LibraryPackFile): LibraryPackFile {
  const environments = normalizeEnvironments(Array.isArray(packFile.environments) ? packFile.environments : undefined, Array.isArray((packFile as any).libraries) ? (packFile as any).libraries : undefined);
  return {
    id: packFile.id,
    name: packFile.name,
    language: packFile.language,
    version: packFile.version,
    readOnly: packFile.readOnly,
    environments
  };
}

function findEnvironment(packFile: LibraryPackFile, environmentName: string): CpmEnvironment | undefined {
  return (packFile.environments || []).find((entry) => entry.name === environmentName);
}

function ensureEnvironment(packFile: LibraryPackFile, environmentName: string): CpmEnvironment {
  packFile.environments = normalizeEnvironments(Array.isArray(packFile.environments) ? packFile.environments : undefined, Array.isArray((packFile as any).libraries) ? (packFile as any).libraries : undefined);
  let environment = findEnvironment(packFile, environmentName);
  if (!environment) {
    environment = { name: environmentName, libraries: [] };
    packFile.environments.push(environment);
  }
  return environment;
}

function findLibraryAcrossEnvironments(packFile: LibraryPackFile, libraryName: string, environmentName?: string): { environment: CpmEnvironment; library: CpmLibrary } | undefined {
  const environments = normalizeEnvironments(Array.isArray(packFile.environments) ? packFile.environments : undefined, Array.isArray((packFile as any).libraries) ? (packFile as any).libraries : undefined);
  const selectedEnvironments = environmentName ? environments.filter((entry) => entry.name === environmentName) : environments;
  for (const environment of selectedEnvironments) {
    const library = (environment.libraries || []).find((entry) => entry.name === libraryName);
    if (library) {
      return { environment, library };
    }
  }
  return undefined;
}

function loadPackFromFile(filePath: string, source: PackSource, writable: boolean, fallbackName: string): LoadedPack | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<LibraryPackFile>;
    const environments = normalizeEnvironments(Array.isArray(raw.environments) ? raw.environments : undefined, Array.isArray(raw.libraries) ? raw.libraries : undefined);
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : fallbackName;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : slugify(name);
    const readOnly = !!raw.readOnly;
    return {
      id,
      name,
      language: typeof raw.language === 'string' ? raw.language : undefined,
      version: typeof raw.version === 'string' ? raw.version : undefined,
      readOnly,
      environments,
      libraries: flattenLibrariesFromEnvironments(environments),
      filePath,
      source,
      writable: writable && !readOnly
    };
  } catch (error) {
    void vscode.window.showWarningMessage(`Failed to load library pack "${fallbackName}": ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function mergeGroupCollections(targetGroups: CpmGroup[] | undefined, sourceGroups: CpmGroup[] | undefined): CpmGroup[] {
  const target = Array.isArray(targetGroups) ? targetGroups : [];
  for (const sourceGroup of Array.isArray(sourceGroups) ? sourceGroups : []) {
    const cloned = cloneGroup(sourceGroup);
    const existing = target.find((group) => group.name === cloned.name);
    if (!existing) {
      target.push(cloned);
      continue;
    }
    existing.description = existing.description || cloned.description;
    existing.functions = [
      ...(Array.isArray(existing.functions) ? existing.functions : []),
      ...(Array.isArray(cloned.functions) ? cloned.functions.map((fn) => ({ ...fn })) : [])
    ];
    existing.groups = mergeGroupCollections(existing.groups, cloned.groups);
  }
  return target;
}

function mergeLibrariesFromPacks(packs: LoadedPack[]): CpmDatabase {
  const environmentMap = new Map<string, Map<string, Map<string, CpmCategory>>>();
  const libraryMap = new Map<string, Map<string, CpmCategory>>();

  for (const pack of packs) {
    for (const environment of pack.environments || []) {
      const environmentLabel = getPackStorageEnvironmentName(environment.name, pack.environments || []);
      let envLibraryMap = environmentMap.get(environmentLabel);
      if (!envLibraryMap) {
        envLibraryMap = new Map<string, Map<string, CpmCategory>>();
        environmentMap.set(environmentLabel, envLibraryMap);
      }

      for (const library of environment.libraries || []) {
        const libraryLabel = getDatabaseLibraryLabel(pack, environment.name, library.name);
        let categoryMap = libraryMap.get(libraryLabel);
        if (!categoryMap) {
          categoryMap = new Map<string, CpmCategory>();
          libraryMap.set(libraryLabel, categoryMap);
        }

        let envCategoryMap = envLibraryMap.get(library.name);
        if (!envCategoryMap) {
          envCategoryMap = new Map<string, CpmCategory>();
          envLibraryMap.set(library.name, envCategoryMap);
        }

        for (const category of library.categories) {
          const existing = categoryMap.get(category.name) ?? { name: category.name, functions: [], groups: [] };
          existing.functions.push(...(Array.isArray(category.functions) ? category.functions.map((fn) => normalizeFunction({ ...fn, library: libraryLabel }, environment.name, libraryLabel, category.name)) : []));
          existing.groups = mergeGroupCollections(existing.groups, (Array.isArray(category.groups) ? category.groups : []).map((group) => normalizeGroup(group, environment.name, libraryLabel, category.name)));
          categoryMap.set(category.name, existing);

          const envExisting = envCategoryMap.get(category.name) ?? { name: category.name, functions: [], groups: [] };
          envExisting.functions.push(...(Array.isArray(category.functions) ? category.functions.map((fn) => normalizeFunction({ ...fn, library: library.name }, environment.name, library.name, category.name)) : []));
          envExisting.groups = mergeGroupCollections(envExisting.groups, (Array.isArray(category.groups) ? category.groups : []).map((group) => normalizeGroup(group, environment.name, library.name, category.name)));
          envCategoryMap.set(category.name, envExisting);
        }
      }
    }
  }

  const environments: CpmEnvironment[] = [];
  for (const [environmentName, envLibraryMap] of environmentMap.entries()) {
    const libraries: CpmLibrary[] = [];
    for (const [libraryName, categoryMap] of envLibraryMap.entries()) {
      const categories = Array.from(categoryMap.values()).map((category) => ({
        name: category.name,
        functions: Array.isArray(category.functions) ? category.functions.map((fn) => ({ ...fn })) : [],
        groups: Array.isArray(category.groups) ? category.groups.map((group) => cloneGroup(group)) : []
      }));
      libraries.push({ name: libraryName, categories });
    }
    environments.push({ name: environmentName || DEFAULT_ENVIRONMENT_NAME, libraries });
  }

  const libraries: CpmLibrary[] = [];
  for (const [libraryName, categoryMap] of libraryMap.entries()) {
    const categories = Array.from(categoryMap.values()).map((category) => ({
      name: category.name,
      functions: Array.isArray(category.functions) ? category.functions.map((fn) => ({ ...fn })) : [],
      groups: Array.isArray(category.groups) ? category.groups.map((group) => cloneGroup(group)) : []
    }));
    libraries.push({ name: libraryName, categories });
  }

  return { environments, libraries };
}

function loadExtensionData(context: vscode.ExtensionContext): ExtensionData {
  const packs: LoadedPack[] = [];

  const globalDir = ensureDirectory(getGlobalPacksDirectory(context));
  if (globalDir && fs.existsSync(globalDir)) {
    for (const entry of fs.readdirSync(globalDir).filter((name) => name.toLowerCase().endsWith('.json')).sort()) {
      const pack = loadPackFromFile(path.join(globalDir, entry), 'global', true, path.basename(entry, '.json'));
      if (pack) {
        packs.push(pack);
      }
    }
  }

  const workspaceDir = ensureDirectory(getWorkspacePacksDirectory());
  if (workspaceDir && fs.existsSync(workspaceDir)) {
    for (const entry of fs.readdirSync(workspaceDir).filter((name) => name.toLowerCase().endsWith('.json')).sort()) {
      const pack = loadPackFromFile(path.join(workspaceDir, entry), 'workspace', true, path.basename(entry, '.json'));
      if (pack) {
        packs.push(pack);
      }
    }
  }

  return {
    packs,
    db: mergeLibrariesFromPacks(packs)
  };
}

function createPackTemplate(name: string, language = 'c', readOnly = false): LibraryPackFile {
  return {
    id: slugify(name),
    name,
    language,
    version: '1.0.0',
    readOnly: !!readOnly,
    environments: [{ name: DEFAULT_ENVIRONMENT_NAME, libraries: [] }]
  };
}

function serializePackFile(packFile: LibraryPackFile): string {
  return JSON.stringify(toPackStorageFile(packFile), null, 2) + '\n';
}

function writePackFile(filePath: string, packFile: LibraryPackFile): void {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, serializePackFile(packFile), 'utf8');
}

function readPackFile(filePath: string): LibraryPackFile {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<LibraryPackFile>;
  const environments = normalizeEnvironments(Array.isArray(raw.environments) ? raw.environments : undefined, Array.isArray(raw.libraries) ? raw.libraries : undefined);
  return {
    id: typeof raw.id === 'string' ? raw.id : slugify(typeof raw.name === 'string' ? raw.name : path.basename(filePath, '.json')),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : path.basename(filePath, '.json'),
    language: typeof raw.language === 'string' ? raw.language : 'c',
    version: typeof raw.version === 'string' ? raw.version : '1.0.0',
    readOnly: !!raw.readOnly,
    environments
  };
}

function sourceLabel(source: PackSource): string {
  switch (source) {
    case 'workspace':
      return 'Workspace';
    case 'global':
      return 'Global';
  }
}

function countFunctions(pack: LoadedPack): number {
  return (pack.environments || []).reduce((total, environment) => total + (environment.libraries || []).reduce((libraryTotal, library) => libraryTotal + library.categories.reduce((catTotal, category) => catTotal + getCategoryAllFunctions(category).length, 0), 0), 0);
}

function makeUniqueFilePath(dirPath: string, baseName: string): string {
  ensureDirectory(dirPath);
  const ext = path.extname(baseName) || '.json';
  const stem = path.basename(baseName, ext) || 'pack';
  let candidate = path.join(dirPath, stem + ext);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dirPath, `${stem}-${index}${ext}`);
    index += 1;
  }
  return candidate;
}

async function choosePackScope(hasWorkspace: boolean): Promise<PackSource | undefined> {
  if (!hasWorkspace) {
    return 'global';
  }

  const selection = await vscode.window.showQuickPick([
    {
      label: 'Workspace pack',
      description: 'Stored inside this workspace',
      detail: '.vscode/jc-lib/packs/*.json',
      value: 'workspace' as PackSource
    },
    {
      label: 'Global pack',
      description: 'Available in all workspaces',
      detail: 'Stored in the extension global storage folder',
      value: 'global' as PackSource
    }
  ], {
    title: 'Choose where to store the library pack'
  });

  return selection?.value;
}

function getPackTargetDirectory(context: vscode.ExtensionContext, source: PackSource): string | undefined {
  if (source === 'workspace') {
    return getWorkspacePacksDirectory();
  }
  if (source === 'global') {
    return getGlobalPacksDirectory(context);
  }
  return undefined;
}

async function chooseWritablePack(packs: LoadedPack[], title: string): Promise<LoadedPack | undefined> {
  const writablePacks = packs.filter((pack) => pack.writable);
  if (writablePacks.length === 0) {
    void vscode.window.showWarningMessage('No writable library pack is available yet. Create or import a pack first.');
    return undefined;
  }

  const choice = await vscode.window.showQuickPick(
    writablePacks.map((pack) => ({
      label: pack.name,
      description: `${sourceLabel(pack.source)} • ${pack.language ?? 'c'}`,
      detail: `${pack.libraries.length} librar${pack.libraries.length === 1 ? 'y' : 'ies'} • ${countFunctions(pack)} function${countFunctions(pack) === 1 ? '' : 's'}`,
      pack
    })),
    { title }
  );

  return choice?.pack;
}

async function openPackFileInEditor(filePath: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active });
}

function buildFunctionSignature(name: string, returnType: string, parameters: CpmParameter[]): string {
  const parameterText = parameters.length === 0 ? 'void' : parameters.map((param) => `${param.type} ${param.name}`).join(', ');
  return `${returnType} ${name} (${parameterText});`;
}

function buildFunctionInsertText(name: string, parameters: CpmParameter[]): string {
  const args = parameters.map((param) => {
    const explicitDefault = typeof param.defaultValue === 'string' ? param.defaultValue.trim() : '';
    if (explicitDefault) {
      return explicitDefault;
    }
    return inferDefaultValue(param.name, param.type, param.editorType);
  });
  return `${name}(${args.join(', ')});`;
}

async function promptForText(options: {
  title: string;
  prompt: string;
  value?: string;
  placeHolder?: string;
  required?: boolean;
}): Promise<string | undefined> {
  const result = await vscode.window.showInputBox({
    title: options.title,
    prompt: options.prompt,
    value: options.value,
    placeHolder: options.placeHolder,
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (options.required !== false && !value.trim()) {
        return 'This value is required.';
      }
      return undefined;
    }
  });

  if (result === undefined) {
    return undefined;
  }
  const trimmed = result.trim();
  if (options.required === false) {
    return trimmed;
  }
  return trimmed || undefined;
}

async function promptForOptionalText(title: string, prompt: string, value = '', placeHolder = ''): Promise<string | undefined> {
  const result = await vscode.window.showInputBox({
    title,
    prompt,
    value,
    placeHolder,
    ignoreFocusOut: true
  });

  if (result === undefined) {
    return undefined;
  }
  return result.trim();
}

async function promptForEditorType(): Promise<ParamEditorType | undefined> {
  const selection = await vscode.window.showQuickPick(
    [
      { label: 'Text', value: 'text' as ParamEditorType, description: 'Free-form code or expression' },
      { label: 'Boolean', value: 'boolean' as ParamEditorType, description: '0 / 1 style flag' },
      { label: 'Enum', value: 'enum' as ParamEditorType, description: 'Quick pick from predefined options' },
      { label: 'File path', value: 'pathFile' as ParamEditorType, description: 'Path field. Add a structured picker only when you need one.' },
      { label: 'Folder path', value: 'pathFolder' as ParamEditorType, description: 'Folder field. Add a structured picker only when you need one.' },
      { label: 'Handle', value: 'handle' as ParamEditorType, description: 'Panel / resource / CPM handle field without automatic quick picks.' }
    ],
    { title: 'Choose a parameter editor type' }
  );

  return selection?.value;
}

async function promptForParameter(index: number): Promise<CpmParameter | undefined> {
  const name = await promptForText({
    title: `Parameter ${index + 1}`,
    prompt: 'Parameter name',
    placeHolder: 'panelHandle'
  });
  if (!name) {
    return undefined;
  }

  const type = await promptForText({
    title: `Parameter ${index + 1}`,
    prompt: 'Parameter type',
    placeHolder: 'int'
  });
  if (!type) {
    return undefined;
  }

  const description = await promptForOptionalText(`Parameter ${index + 1}`, 'Optional description', '', 'Describe what this parameter expects');
  if (description === undefined) {
    return undefined;
  }

  const editorType = await promptForEditorType();
  if (!editorType) {
    return undefined;
  }

  const defaultValue = await promptForOptionalText(`Parameter ${index + 1}`, 'Optional default value used in the generated call', '', '0, "${workspaceFolder}", &value ...');
  if (defaultValue === undefined) {
    return undefined;
  }

  return {
    name,
    type,
    description: description || undefined,
    editorType,
    defaultValue: defaultValue || undefined
  };
}

async function promptForFunctionDefinition(environments: CpmEnvironment[] = [], preset?: { environmentName?: string; libraryName?: string; categoryName?: string }): Promise<{
  environmentName: string;
  libraryName: string;
  categoryName: string;
  fn: CpmFunction;
} | undefined> {
  const environmentList = Array.isArray(environments) ? environments : [];
  let environmentName = preset?.environmentName || '';
  if (!environmentName && environmentList.length > 1) {
    const environmentChoice = await vscode.window.showQuickPick([
      ...environmentList.map((environment) => ({
        label: environment.name,
        description: 'Existing environment',
        value: environment.name
      })),
      {
        label: '$(add) Create a new environment',
        description: 'Add a new environment',
        value: '__create__'
      }
    ], {
      title: 'Choose the target environment'
    });

    if (!environmentChoice) {
      return undefined;
    }

    if (environmentChoice.value === '__create__') {
      const createdEnvironment = await promptForText({
        title: 'New environment',
        prompt: 'Environment name',
        placeHolder: 'CPM'
      });
      if (!createdEnvironment) {
        return undefined;
      }
      environmentName = createdEnvironment;
    } else {
      environmentName = environmentChoice.value;
    }
  } else if (!environmentName) {
    environmentName = environmentList[0]?.name || DEFAULT_ENVIRONMENT_NAME;
  }

  const existingEnvironment = environmentList.find((environment) => environment.name === environmentName);
  const existingLibraries = existingEnvironment?.libraries ?? [];

  let libraryName = preset?.libraryName || '';
  if (!libraryName && existingLibraries.length > 0) {
    const libraryChoice = await vscode.window.showQuickPick([
      ...existingLibraries.map((library) => ({
        label: library.name,
        description: 'Existing library',
        value: library.name
      })),
      {
        label: '$(add) Create a new library',
        description: 'Add a new library',
        value: '__create__'
      }
    ], {
      title: `Choose the target library for ${environmentName}`
    });

    if (!libraryChoice) {
      return undefined;
    }

    if (libraryChoice.value === '__create__') {
      const createdLibrary = await promptForText({
        title: 'New library',
        prompt: 'Library name',
        placeHolder: 'User Interface Library'
      });
      if (!createdLibrary) {
        return undefined;
      }
      libraryName = createdLibrary;
    } else {
      libraryName = libraryChoice.value;
    }
  } else if (!libraryName) {
    const createdLibrary = await promptForText({
      title: 'New library',
      prompt: 'Library name',
      placeHolder: 'User Interface Library'
    });
    if (!createdLibrary) {
      return undefined;
    }
    libraryName = createdLibrary;
  }

  const existingLibrary = existingLibraries.find((library) => library.name === libraryName);
  let categoryName = preset?.categoryName || '';
  const existingCategories = existingLibrary?.categories ?? [];

  if (!categoryName && existingCategories.length > 0) {
    const categoryChoice = await vscode.window.showQuickPick([
      ...existingCategories.map((category) => ({
        label: category.name,
        description: 'Existing category',
        value: category.name
      })),
      {
        label: '$(add) Create a new category',
        description: 'Add a new category under this library',
        value: '__create__'
      }
    ], {
      title: `Choose the target category for ${libraryName}`
    });

    if (!categoryChoice) {
      return undefined;
    }

    if (categoryChoice.value === '__create__') {
      const createdCategory = await promptForText({
        title: 'New category',
        prompt: 'Category name',
        placeHolder: 'Panels'
      });
      if (!createdCategory) {
        return undefined;
      }
      categoryName = createdCategory;
    } else {
      categoryName = categoryChoice.value;
    }
  } else if (!categoryName) {
    const createdCategory = await promptForText({
      title: 'New category',
      prompt: 'Category name',
      placeHolder: 'Panels'
    });
    if (!createdCategory) {
      return undefined;
    }
    categoryName = createdCategory;
  }

  const name = await promptForText({
    title: 'New function',
    prompt: 'Function name',
    placeHolder: 'LoadPanel'
  });
  if (!name) {
    return undefined;
  }

  const returnType = await promptForText({
    title: 'New function',
    prompt: 'Return type',
    value: 'int',
    placeHolder: 'int'
  });
  if (!returnType) {
    return undefined;
  }

  const header = await promptForOptionalText('New function', 'Optional header file', '', 'userint.h or toolbox/inifile.h');
  if (header === undefined) {
    return undefined;
  }

  const description = await promptForOptionalText('New function', 'Optional description', '', 'Describe what the function does');
  if (description === undefined) {
    return undefined;
  }

  const returnDescription = returnType.toLowerCase() === 'void'
    ? ''
    : await promptForOptionalText('New function', 'Optional return value description', '', 'Explain the meaning of the returned value');
  if (returnDescription === undefined) {
    return undefined;
  }

  const parameterCountText = await promptForOptionalText('New function', 'Number of parameters', '0', '0');
  if (parameterCountText === undefined) {
    return undefined;
  }
  const parameterCount = Math.max(0, Math.min(12, Number.parseInt(parameterCountText || '0', 10) || 0));

  const parameters: CpmParameter[] = [];
  for (let index = 0; index < parameterCount; index += 1) {
    const parameter = await promptForParameter(index);
    if (!parameter) {
      return undefined;
    }
    parameters.push(parameter);
  }

  const fn: CpmFunction = {
    name,
    returnType,
    signature: buildFunctionSignature(name, returnType, parameters),
    insertText: buildFunctionInsertText(name, parameters),
    header: header || undefined,
    environment: environmentName,
    library: libraryName,
    category: categoryName,
    description: description || undefined,
    returnDescription: returnDescription || undefined,
    parameters
  };

  return { environmentName, libraryName, categoryName, fn };
}

async function addEnvironmentToPackFile(pack: LoadedPack): Promise<string | undefined> {
  const packFile = readPackFile(pack.filePath);
  const environmentName = await promptForText({
    title: 'Add environment',
    prompt: `New environment name for ${pack.name}`,
    placeHolder: 'CPM'
  });
  if (!environmentName) {
    return undefined;
  }
  const existingNames = (packFile.environments || []).map((environment) => environment.name);
  const finalName = uniqueName(environmentName, existingNames);
  ensureEnvironment(packFile, finalName);
  writePackFile(pack.filePath, packFile);
  return finalName;
}

async function addLibraryToPackFile(pack: LoadedPack, presetEnvironmentName?: string): Promise<{ environmentName: string; libraryName: string } | undefined> {
  const packFile = readPackFile(pack.filePath);
  const environmentName = presetEnvironmentName || await chooseTargetEnvironment(packFile, `Choose the target environment for the new library — ${pack.name}`);
  if (!environmentName) {
    return undefined;
  }

  const libraryName = await promptForText({
    title: 'Add library',
    prompt: `New library name for ${pack.name}`,
    placeHolder: 'User Interface Library'
  });
  if (!libraryName) {
    return undefined;
  }

  const initialCategory = await promptForOptionalText('Add library', 'Optional first category name', '', 'Panels');
  if (initialCategory === undefined) {
    return undefined;
  }

  const environment = ensureEnvironment(packFile, environmentName);
  const existingNames = (environment.libraries || []).map((library) => library.name);
  const finalLibraryName = uniqueName(libraryName, existingNames);
  environment.libraries.push({
    name: finalLibraryName,
    categories: initialCategory ? [{ name: initialCategory, functions: [] }] : []
  });

  writePackFile(pack.filePath, packFile);
  return { environmentName, libraryName: finalLibraryName };
}

async function addFunctionToPackFile(pack: LoadedPack, target?: { environmentName?: string; libraryName?: string; categoryName?: string }): Promise<CpmFunction | undefined> {
  const packFile = readPackFile(pack.filePath);
  const definition = await promptForFunctionDefinition(packFile.environments, target);
  if (!definition) {
    return undefined;
  }

  const environment = ensureEnvironment(packFile, definition.environmentName);
  let library = environment.libraries.find((entry) => entry.name === definition.libraryName);
  if (!library) {
    library = { name: definition.libraryName, categories: [] };
    environment.libraries.push(library);
  }

  let category = library.categories.find((entry) => entry.name === definition.categoryName);
  if (!category) {
    category = { name: definition.categoryName, functions: [] };
    library.categories.push(category);
  }

  if (category.functions.some((fn) => fn.name === definition.fn.name)) {
    const overwrite = await vscode.window.showWarningMessage(
      `A function named "${definition.fn.name}" already exists in ${definition.environmentName} / ${definition.libraryName} / ${definition.categoryName}. Overwrite it?`,
      { modal: true },
      'Overwrite'
    );
    if (overwrite !== 'Overwrite') {
      return undefined;
    }
    category.functions = category.functions.filter((fn) => fn.name !== definition.fn.name);
  }

  category.functions.push(definition.fn);
  writePackFile(pack.filePath, packFile);
  return definition.fn;
}

async function chooseTargetSymbol(category: CpmCategory, title: string): Promise<string | undefined> {
  const picked = await vscode.window.showQuickPick(
    (category.functions || []).map((fn) => ({
      label: fn.name,
      description: getSymbolKindLabel(getSymbolKind(fn)),
      detail: fn.signature,
      value: fn.name
    })),
    { title, ignoreFocusOut: true }
  );
  return picked?.value;
}

async function deleteEnvironmentFromPackFile(pack: LoadedPack, presetEnvironmentName?: string): Promise<string | undefined> {
  const packFile = readPackFile(pack.filePath);
  const environmentName = presetEnvironmentName || await chooseTargetEnvironment(packFile, `Choose the environment to delete — ${pack.name}`);
  if (!environmentName) return undefined;
  const index = (packFile.environments || []).findIndex((environment) => environment.name === environmentName);
  if (index < 0) return undefined;
  const confirmed = await vscode.window.showWarningMessage(`Delete environment "${environmentName}" and all nested libraries, categories, and symbols?`, { modal: true }, 'Delete');
  if (confirmed !== 'Delete') return undefined;
  packFile.environments.splice(index, 1);
  writePackFile(pack.filePath, packFile);
  return environmentName;
}

async function deleteLibraryFromPackFile(pack: LoadedPack, preset?: { environmentName?: string; libraryName?: string }): Promise<{ environmentName: string; libraryName: string } | undefined> {
  const packFile = readPackFile(pack.filePath);
  const environmentName = preset?.environmentName || await chooseTargetEnvironment(packFile, `Choose the environment containing the library to delete — ${pack.name}`);
  if (!environmentName) return undefined;
  const environment = findEnvironment(packFile, environmentName);
  if (!environment) return undefined;
  const libraryName = preset?.libraryName || await chooseTargetLibrary(packFile, `Choose the library to delete — ${pack.name}`, environmentName);
  if (!libraryName) return undefined;
  const index = (environment.libraries || []).findIndex((library) => library.name === libraryName);
  if (index < 0) return undefined;
  const confirmed = await vscode.window.showWarningMessage(`Delete library "${libraryName}" from ${environmentName}?`, { modal: true }, 'Delete');
  if (confirmed !== 'Delete') return undefined;
  environment.libraries.splice(index, 1);
  writePackFile(pack.filePath, packFile);
  return { environmentName, libraryName };
}

async function deleteCategoryFromPackFile(pack: LoadedPack, preset?: { environmentName?: string; libraryName?: string; categoryName?: string }): Promise<{ environmentName: string; libraryName: string; categoryName: string } | undefined> {
  const packFile = readPackFile(pack.filePath);
  const environmentName = preset?.environmentName || await chooseTargetEnvironment(packFile, `Choose the environment containing the category to delete — ${pack.name}`);
  if (!environmentName) return undefined;
  const libraryName = preset?.libraryName || await chooseTargetLibrary(packFile, `Choose the library containing the category to delete — ${pack.name}`, environmentName);
  if (!libraryName) return undefined;
  const library = findLibraryAcrossEnvironments(packFile, libraryName, environmentName)?.library;
  if (!library) return undefined;
  const categoryName = preset?.categoryName || await chooseTargetCategory(library, `Choose the category to delete — ${pack.name}`);
  if (!categoryName) return undefined;
  const index = (library.categories || []).findIndex((category) => category.name === categoryName);
  if (index < 0) return undefined;
  const confirmed = await vscode.window.showWarningMessage(`Delete category "${categoryName}" from ${environmentName} / ${libraryName}?`, { modal: true }, 'Delete');
  if (confirmed !== 'Delete') return undefined;
  library.categories.splice(index, 1);
  writePackFile(pack.filePath, packFile);
  return { environmentName, libraryName, categoryName };
}

async function deleteSymbolFromPackFile(pack: LoadedPack, preset?: { environmentName?: string; libraryName?: string; categoryName?: string }): Promise<{ environmentName: string; libraryName: string; categoryName: string; symbolName: string } | undefined> {
  const packFile = readPackFile(pack.filePath);
  const environmentName = preset?.environmentName || await chooseTargetEnvironment(packFile, `Choose the environment containing the symbol to delete — ${pack.name}`);
  if (!environmentName) return undefined;
  const libraryName = preset?.libraryName || await chooseTargetLibrary(packFile, `Choose the library containing the symbol to delete — ${pack.name}`, environmentName);
  if (!libraryName) return undefined;
  const library = findLibraryAcrossEnvironments(packFile, libraryName, environmentName)?.library;
  if (!library) return undefined;
  const categoryName = preset?.categoryName || await chooseTargetCategory(library, `Choose the category containing the symbol to delete — ${pack.name}`);
  if (!categoryName) return undefined;
  const category = (library.categories || []).find((entry) => entry.name === categoryName);
  if (!category || !(category.functions || []).length) return undefined;
  const symbolName = await chooseTargetSymbol(category, `Choose the symbol to delete — ${pack.name}`);
  if (!symbolName) return undefined;
  const index = (category.functions || []).findIndex((fn) => fn.name === symbolName);
  if (index < 0) return undefined;
  const confirmed = await vscode.window.showWarningMessage(`Delete symbol "${symbolName}" from ${environmentName} / ${libraryName} / ${categoryName}?`, { modal: true }, 'Delete');
  if (confirmed !== 'Delete') return undefined;
  category.functions.splice(index, 1);
  writePackFile(pack.filePath, packFile);
  return { environmentName, libraryName, categoryName, symbolName };
}

async function deleteContentFromPackFile(pack: LoadedPack, target?: { environmentName?: string; libraryName?: string; categoryName?: string }): Promise<{ message: string } | undefined> {
  const options: { label: string; description: string; value: string }[] = [];
  if (!target?.environmentName) {
    options.push({ label: 'Delete environment', description: 'Remove an environment and everything it contains', value: 'deleteEnvironment' });
  }
  if (!target?.libraryName) {
    options.push({ label: 'Delete library', description: 'Remove a library and all its categories', value: 'deleteLibrary' });
  }
  if (!target?.categoryName) {
    options.push({ label: 'Delete category', description: 'Remove a category and all its symbols', value: 'deleteCategory' });
  }
  options.push({ label: 'Delete symbol', description: 'Remove a single symbol from a category', value: 'deleteSymbol' });

  const choice = await vscode.window.showQuickPick(options, {
    title: 'Delete content',
    placeHolder: 'Choose the type of content to delete'
  });
  if (!choice) return undefined;

  if (choice.value === 'deleteEnvironment') {
    const environmentName = await deleteEnvironmentFromPackFile(pack, target?.environmentName);
    return environmentName ? { message: `Deleted environment ${environmentName}.` } : undefined;
  }
  if (choice.value === 'deleteLibrary') {
    const result = await deleteLibraryFromPackFile(pack, target);
    return result ? { message: `Deleted library ${result.libraryName} from ${result.environmentName}.` } : undefined;
  }
  if (choice.value === 'deleteCategory') {
    const result = await deleteCategoryFromPackFile(pack, target);
    return result ? { message: `Deleted category ${result.categoryName} from ${result.environmentName} / ${result.libraryName}.` } : undefined;
  }
  const result = await deleteSymbolFromPackFile(pack, target);
  return result ? { message: `Deleted symbol ${result.symbolName} from ${result.environmentName} / ${result.libraryName} / ${result.categoryName}.` } : undefined;
}

async function exportPackToFile(pack: LoadedPack): Promise<void> {
  const saveUri = await vscode.window.showSaveDialog({
    title: `Export ${pack.name}`,
    filters: {
      'JSON': ['json']
    },
    defaultUri: vscode.Uri.file(path.join(path.dirname(pack.filePath), `${slugify(pack.name)}.json`))
  });

  if (!saveUri) {
    return;
  }

  const packFile = readPackFile(pack.filePath);
  fs.writeFileSync(saveUri.fsPath, serializePackFile(packFile), 'utf8');
  void vscode.window.showInformationMessage(`Exported ${pack.name} to ${saveUri.fsPath}`);
}


function prototypeHeaderDefaultName(sourceFilePath: string): string {
  const base = path.basename(sourceFilePath);
  const ext = path.extname(base);
  return ext ? base : `${base}.h`;
}

function stripPrototypeComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .replace(/^\s*#.*$/gm, ' ');
}

function normalizePrototypeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function splitTopLevel(text: string, separator = ','): string[] {
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (const ch of text) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }
    if (ch === '\'' && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (!inSingle && !inDouble) {
      if (ch === '(') parenDepth += 1;
      else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      else if (ch === '[') bracketDepth += 1;
      else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      else if (ch === '{') braceDepth += 1;
      else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
      else if (ch === '<') angleDepth += 1;
      else if (ch === '>') angleDepth = Math.max(0, angleDepth - 1);
      else if (ch === separator && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0 && angleDepth === 0) {
        const trimmed = current.trim();
        if (trimmed) parts.push(trimmed);
        current = '';
        continue;
      }
    }
    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
}

function splitPrototypeDeclarations(text: string): string[] {
  const cleaned = stripPrototypeComments(text);
  const parts = splitTopLevel(cleaned, ';');
  return parts.map((part) => normalizePrototypeWhitespace(part)).filter(Boolean);
}

function inferEditorTypeFromPrototype(paramName: string, paramType: string): ParamEditorType {
  const haystack = `${paramName} ${paramType}`.toLowerCase();
  if (haystack.includes('bool') || /^is[A-Z_]/.test(paramName) || haystack.includes('flag')) {
    return 'boolean';
  }
  if (haystack.includes('folder') || haystack.includes('dir') || haystack.includes('directory')) {
    return 'pathFolder';
  }
  if (haystack.includes('file') || haystack.includes('path') || haystack.includes('filename') || haystack.includes('filepath')) {
    return 'pathFile';
  }
  if (haystack.includes('handle') || haystack.includes('panel') || haystack.includes('menu') || haystack.includes('ctrl')) {
    return 'handle';
  }
  return 'text';
}

function parsePrototypeParameter(paramText: string, index: number): CpmParameter | undefined {
  const withoutDefault = splitTopLevel(paramText, '=')[0] ?? paramText;
  const cleaned = normalizePrototypeWhitespace(withoutDefault);
  if (!cleaned || cleaned === 'void') {
    return undefined;
  }

  const functionPointerMatch = cleaned.match(/^(.*?\(\s*\*\s*)([A-Za-z_][A-Za-z0-9_]*)\s*(\)\s*\([^)]*\).*)$/);
  if (functionPointerMatch) {
    return {
      name: functionPointerMatch[2],
      type: `${functionPointerMatch[1]}${functionPointerMatch[3]}`.trim(),
      editorType: 'text'
    };
  }

  const arrayMatch = cleaned.match(/^(.*?)([A-Za-z_][A-Za-z0-9_]*)\s*(\[[^\]]*\])$/);
  if (arrayMatch) {
    const type = normalizePrototypeWhitespace(`${arrayMatch[1]}${arrayMatch[3]}`);
    const name = arrayMatch[2];
    return { name, type, editorType: inferEditorTypeFromPrototype(name, type) };
  }

  const match = cleaned.match(/^(.*?)([A-Za-z_][A-Za-z0-9_]*)$/);
  if (match) {
    const name = match[2];
    let type = normalizePrototypeWhitespace(match[1]);
    if (!type) {
      type = 'int';
    }
    if (/[\*&]$/.test(type)) {
      type = `${type}`.trim();
    }
    return { name, type, editorType: inferEditorTypeFromPrototype(name, type) };
  }

  const fallbackName = `arg${index + 1}`;
  return {
    name: fallbackName,
    type: cleaned,
    editorType: inferEditorTypeFromPrototype(fallbackName, cleaned)
  };
}

function parseFunctionPrototype(prototypeText: string, libraryName: string, categoryName: string, headerHint?: string): CpmFunction | undefined {
  const cleaned = normalizePrototypeWhitespace(prototypeText).replace(/;+$/, '');
  if (!cleaned || !cleaned.includes('(') || !cleaned.includes(')')) {
    return undefined;
  }

  const functionPointerMatch = cleaned.match(/^(.*?)\(\s*\*\s*([A-Za-z_~][A-Za-z0-9_:~]*)\s*\)\s*\((.*)\)\s*(?:const|noexcept|override|final|=\s*0)?$/);
  if (functionPointerMatch) {
    const returnType = normalizePrototypeWhitespace(functionPointerMatch[1]);
    const name = functionPointerMatch[2].trim();
    const paramBlock = functionPointerMatch[3].trim();
    const parameters = paramBlock && paramBlock !== 'void'
      ? splitTopLevel(paramBlock).map((part, index) => parsePrototypeParameter(part, index)).filter(Boolean) as CpmParameter[]
      : [];

    return {
      name,
      returnType: (returnType ? `${returnType} (*)` : 'void (*)').trim(),
      signature: `${cleaned};`,
      insertText: buildFunctionInsertText(name, parameters),
      header: headerHint || undefined,
      library: libraryName,
      category: categoryName,
      description: 'Imported function pointer declaration.',
      returnDescription: undefined,
      parameters
    };
  }

  const match = cleaned.match(/^(.*?)([A-Za-z_~][A-Za-z0-9_:~]*)\s*\((.*)\)\s*(?:const|noexcept|override|final|=\s*0)?$/);
  if (!match) {
    return undefined;
  }

  const returnType = normalizePrototypeWhitespace(match[1]);
  const name = match[2].trim();
  const paramBlock = match[3].trim();
  const parameters = paramBlock && paramBlock !== 'void'
    ? splitTopLevel(paramBlock).map((part, index) => parsePrototypeParameter(part, index)).filter(Boolean) as CpmParameter[]
    : [];

  return {
    name,
    returnType: returnType || 'void',
    signature: `${cleaned};`,
    insertText: buildFunctionInsertText(name, parameters),
    header: headerHint || undefined,
    library: libraryName,
    category: categoryName,
    description: undefined,
    returnDescription: undefined,
    parameters
  };
}

async function chooseTargetEnvironment(packFile: LibraryPackFile, title: string): Promise<string | undefined> {
  const environments = normalizeEnvironments(Array.isArray(packFile.environments) ? packFile.environments : undefined, Array.isArray((packFile as any).libraries) ? (packFile as any).libraries : undefined);
  if (environments.length <= 1) {
    return environments[0]?.name || DEFAULT_ENVIRONMENT_NAME;
  }
  const choices = [
    ...environments.map((environment) => ({ label: environment.name, description: 'Existing environment', value: environment.name })),
    { label: '$(add) Create a new environment', description: 'Add a new environment to this pack', value: '__create__' }
  ];
  const picked = await vscode.window.showQuickPick(choices, { title, ignoreFocusOut: true });
  if (!picked) {
    return undefined;
  }
  if (picked.value === '__create__') {
    return promptForText({
      title: 'Create target environment',
      prompt: 'Environment name',
      placeHolder: 'CPM'
    });
  }
  return picked.value;
}

async function chooseTargetLibrary(packFile: LibraryPackFile, title: string, environmentName?: string): Promise<string | undefined> {
  const environment = environmentName ? ensureEnvironment(packFile, environmentName) : undefined;
  const existingLibraries = environment ? environment.libraries : flattenLibrariesFromEnvironments(normalizeEnvironments(Array.isArray(packFile.environments) ? packFile.environments : undefined, Array.isArray((packFile as any).libraries) ? (packFile as any).libraries : undefined));
  const seen = new Set<string>();
  const choices = [
    ...existingLibraries.filter((library) => {
      if (seen.has(library.name)) return false;
      seen.add(library.name);
      return true;
    }).map((library) => ({ label: library.name, description: 'Existing library', value: library.name })),
    { label: '$(add) Create a new library', description: 'Add a new library to this pack', value: '__create__' }
  ];
  const picked = await vscode.window.showQuickPick(choices, { title, ignoreFocusOut: true });
  if (!picked) {
    return undefined;
  }
  if (picked.value === '__create__') {
    return promptForText({
      title: 'Create target library',
      prompt: 'Library name',
      placeHolder: 'My Internal Library'
    });
  }
  return picked.value;
}

async function chooseTargetCategory(library: CpmLibrary, title: string): Promise<string | undefined> {
  const choices = [
    ...library.categories.map((category) => ({ label: category.name, description: 'Existing category', value: category.name })),
    { label: '$(add) Create a new category', description: 'Add a new category under this library', value: '__create__' }
  ];
  const picked = await vscode.window.showQuickPick(choices, { title, ignoreFocusOut: true });
  if (!picked) {
    return undefined;
  }
  if (picked.value === '__create__') {
    return promptForText({
      title: 'Create target category',
      prompt: 'Category name',
      placeHolder: 'Imported Prototypes'
    });
  }
  return picked.value;
}

function ensureEnvironmentLibraryCategory(packFile: LibraryPackFile, environmentName: string, libraryName: string, categoryName: string): { environment: CpmEnvironment; library: CpmLibrary; category: CpmCategory } {
  const environment = ensureEnvironment(packFile, environmentName);
  let library = environment.libraries.find((entry) => entry.name === libraryName);
  if (!library) {
    library = { name: libraryName, categories: [] };
    environment.libraries.push(library);
  }
  let category = library.categories.find((entry) => entry.name === categoryName);
  if (!category) {
    category = { name: categoryName, functions: [] };
    library.categories.push(category);
  }
  return { environment, library, category };
}

async function importPrototypesToPackFile(pack: LoadedPack, preset?: { environmentName?: string; libraryName?: string; categoryName?: string }): Promise<{ imported: number; skipped: number; filePath: string } | undefined> {
  const picked = await vscode.window.showOpenDialog({
    title: `Import source/header into ${pack.name}`,
    canSelectMany: false,
    filters: {
      'Header / source text': ['h', 'hpp', 'hh', 'hxx', 'inl', 'txt', 'c', 'cpp', 'cc', 'cxx']
    }
  });
  const sourceUri = picked?.[0];
  if (!sourceUri) {
    return undefined;
  }

  const packFile = readPackFile(pack.filePath);
  const environmentName = preset?.environmentName || await chooseTargetEnvironment(packFile, `Choose the target environment for imported prototypes — ${pack.name}`);
  if (!environmentName) {
    return undefined;
  }
  const libraryName = preset?.libraryName || await chooseTargetLibrary(packFile, `Choose the target library for imported prototypes — ${pack.name}`, environmentName);
  if (!libraryName) {
    return undefined;
  }

  const targetLibrary = findLibraryAcrossEnvironments(packFile, libraryName, environmentName)?.library ?? { name: libraryName, categories: [] };
  const categoryName = preset?.categoryName || await chooseTargetCategory(targetLibrary, `Choose the target category for ${libraryName}`);
  if (!categoryName) {
    return undefined;
  }

  const defaultHeader = prototypeHeaderDefaultName(sourceUri.fsPath);
  const headerHint = await promptForOptionalText(
    'Imported function header',
    'Optional header field stored on imported functions',
    defaultHeader,
    'my_library.h'
  );
  if (headerHint === undefined) {
    return undefined;
  }

  const raw = fs.readFileSync(sourceUri.fsPath, 'utf8');
  const declarations = splitPrototypeDeclarations(raw);
  if (declarations.length === 0) {
    void vscode.window.showWarningMessage('No function prototype was found in the selected file.');
    return undefined;
  }

  const parsedFunctions = declarations.map((decl) => ({ ...parseFunctionPrototype(decl, libraryName, categoryName, headerHint || undefined), environment: environmentName })).filter(Boolean) as CpmFunction[];
  if (parsedFunctions.length === 0) {
    void vscode.window.showWarningMessage('The selected file did not contain any prototype that could be parsed.');
    return undefined;
  }

  const duplicatePolicy = await vscode.window.showQuickPick([
    { label: 'Skip duplicates', description: 'Keep existing functions and ignore imported duplicates', value: 'skip' },
    { label: 'Replace duplicates', description: 'Overwrite functions with the same name in the target category', value: 'replace' }
  ], {
    title: 'How should duplicate function names be handled?',
    ignoreFocusOut: true
  });
  if (!duplicatePolicy) {
    return undefined;
  }

  const { category } = ensureEnvironmentLibraryCategory(packFile, environmentName, libraryName, categoryName);
  let imported = 0;
  let skipped = 0;

  for (const fn of parsedFunctions) {
    const existingIndex = category.functions.findIndex((entry) => entry.name === fn.name);
    if (existingIndex >= 0) {
      if (duplicatePolicy.value === 'replace') {
        category.functions.splice(existingIndex, 1, fn);
        imported += 1;
      } else {
        skipped += 1;
      }
      continue;
    }
    category.functions.push(fn);
    imported += 1;
  }

  writePackFile(pack.filePath, packFile);
  return { imported, skipped, filePath: sourceUri.fsPath };
}

function collectFunctionsForHeader(packFile: LibraryPackFile, environmentName?: string, libraryName?: string, categoryName?: string): CpmFunction[] {
  const environments = environmentName
    ? normalizeEnvironments(Array.isArray(packFile.environments) ? packFile.environments : undefined, Array.isArray((packFile as any).libraries) ? (packFile as any).libraries : undefined).filter((environment) => environment.name === environmentName)
    : normalizeEnvironments(Array.isArray(packFile.environments) ? packFile.environments : undefined, Array.isArray((packFile as any).libraries) ? (packFile as any).libraries : undefined);
  const functions: CpmFunction[] = [];
  for (const environment of environments) {
    const libraries = libraryName ? (environment.libraries || []).filter((library) => library.name === libraryName) : (environment.libraries || []);
    for (const library of libraries) {
      for (const category of library.categories) {
        if (categoryName && category.name !== categoryName) {
          continue;
        }
        for (const fn of getCategoryAllFunctions(category)) {
          functions.push({ ...fn, environment: environment.name, library: library.name, category: category.name });
        }
      }
    }
  }
  return functions;
}

function buildHeaderGuard(name: string): string {
  return slugify(name).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toUpperCase() + '_H';
}

function buildGeneratedHeaderText(options: {
  packFile: LibraryPackFile;
  title: string;
  guardName: string;
  environmentName?: string;
  libraryName?: string;
  categoryName?: string;
}): string {
  const functions = collectFunctionsForHeader(options.packFile, options.environmentName, options.libraryName, options.categoryName);
  const language = String(options.packFile.language || 'c').toLowerCase();
  const lines: string[] = [];
  lines.push(`/* Generated by C/C++ Libraries — ${options.title} */`);
  lines.push(`#ifndef ${options.guardName}`);
  lines.push(`#define ${options.guardName}`);
  lines.push('');
  if (language === 'c' || language === 'cvi') {
    lines.push('#ifdef __cplusplus');
    lines.push('extern "C" {');
    lines.push('#endif');
    lines.push('');
  }

  let currentEnvironment = '';
  let currentLibrary = '';
  let currentCategory = '';
  const seen = new Set<string>();
  for (const fn of functions) {
    const signature = (fn.signature && fn.signature.trim())
      ? (fn.signature.trim().endsWith(';') ? fn.signature.trim() : `${fn.signature.trim()};`)
      : buildFunctionSignature(fn.name, fn.returnType || 'void', Array.isArray(fn.parameters) ? fn.parameters : []);
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    if ((fn.environment || '') !== currentEnvironment) {
      if (lines[lines.length - 1] !== '') lines.push('');
      if (fn.environment) {
        lines.push(`/* Environment: ${fn.environment} */`);
      }
      currentEnvironment = fn.environment || '';
      currentLibrary = '';
      currentCategory = '';
    }
    if (fn.library !== currentLibrary) {
      if (lines[lines.length - 1] !== '') lines.push('');
      lines.push(`/* Library: ${fn.library} */`);
      currentLibrary = fn.library;
      currentCategory = '';
    }
    if (fn.category !== currentCategory) {
      lines.push(`/* Category: ${fn.category} */`);
      currentCategory = fn.category;
    }
    lines.push(signature);
  }

  if (language === 'c' || language === 'cvi') {
    lines.push('');
    lines.push('#ifdef __cplusplus');
    lines.push('}');
    lines.push('#endif');
  }
  lines.push('');
  lines.push(`#endif /* ${options.guardName} */`);
  lines.push('');
  return lines.join('\\n');
}

async function generateHeaderForPack(pack: LoadedPack, preset?: { environmentName?: string; libraryName?: string; categoryName?: string }): Promise<string | undefined> {
  const packFile = readPackFile(pack.filePath);
  const environments = normalizeEnvironments(Array.isArray(packFile.environments) ? packFile.environments : undefined, Array.isArray((packFile as any).libraries) ? (packFile as any).libraries : undefined);
  const totalLibraryCount = environments.reduce((count, environment) => count + (environment.libraries || []).length, 0);
  if (!totalLibraryCount) {
    void vscode.window.showWarningMessage(`The pack "${pack.name}" does not contain any library yet.`);
    return undefined;
  }

  let selectedEnvironmentName: string | undefined = preset?.environmentName;
  let selectedLibraryName: string | undefined = preset?.libraryName;
  let selectedCategoryName: string | undefined = preset?.categoryName;

  if (!selectedEnvironmentName && !selectedLibraryName && !selectedCategoryName) {
    const scopeChoice = await vscode.window.showQuickPick([
      { label: 'All libraries in the pack', description: `Generate one header for the whole pack (${pack.name})`, value: 'all' },
      { label: 'Single environment', description: 'Generate a header for one environment only', value: 'environment' },
      { label: 'Single library', description: 'Generate a header for one library only', value: 'library' }
    ], {
      title: `Generate prototypes header — ${pack.name}`,
      ignoreFocusOut: true
    });
    if (!scopeChoice) {
      return undefined;
    }

    if (scopeChoice.value === 'environment' || scopeChoice.value === 'library') {
      const environmentChoice = await vscode.window.showQuickPick(environments.map((environment) => ({
        label: environment.name,
        description: `${(environment.libraries || []).length} librar${(environment.libraries || []).length === 1 ? 'y' : 'ies'}`,
        detail: `${(environment.libraries || []).reduce((count, library) => count + library.categories.reduce((inner, category) => inner + category.functions.length, 0), 0)} symbol(s)`,
        value: environment.name
      })), {
        title: 'Choose the environment to export as a header',
        ignoreFocusOut: true
      });
      if (!environmentChoice) {
        return undefined;
      }
      selectedEnvironmentName = environmentChoice.value;

      if (scopeChoice.value === 'library') {
        const environment = environments.find((entry) => entry.name === selectedEnvironmentName);
        const libraryChoice = await vscode.window.showQuickPick((environment?.libraries || []).map((library) => ({
          label: library.name,
          description: `${library.categories.length} categor${library.categories.length === 1 ? 'y' : 'ies'}`,
          detail: `${library.categories.reduce((count, category) => count + category.functions.length, 0)} symbol(s)`,
          value: library.name
        })), {
          title: 'Choose the library to export as a header',
          ignoreFocusOut: true
        });
        if (!libraryChoice) {
          return undefined;
        }
        selectedLibraryName = libraryChoice.value;
      }
    }
  }

  const suggestedBase = selectedCategoryName
    ? `${selectedEnvironmentName || selectedLibraryName || pack.name}_${selectedLibraryName || ''}_${selectedCategoryName}`
    : (selectedLibraryName ? `${selectedEnvironmentName || pack.name}_${selectedLibraryName}` : (selectedEnvironmentName || pack.name));
  const suggestedName = `${slugify(suggestedBase)}.h`;
  const saveUri = await vscode.window.showSaveDialog({
    title: `Generate prototypes header — ${pack.name}`,
    filters: { 'Header': ['h', 'hpp'] },
    defaultUri: vscode.Uri.file(path.join(path.dirname(pack.filePath), suggestedName))
  });
  if (!saveUri) {
    return undefined;
  }

  const titleParts = [pack.name, selectedEnvironmentName, selectedLibraryName, selectedCategoryName].filter(Boolean) as string[];
  const title = titleParts.join(' / ');
  const headerText = buildGeneratedHeaderText({
    packFile,
    title,
    guardName: buildHeaderGuard(path.basename(saveUri.fsPath, path.extname(saveUri.fsPath))),
    environmentName: selectedEnvironmentName,
    libraryName: selectedLibraryName,
    categoryName: selectedCategoryName
  });

  fs.writeFileSync(saveUri.fsPath, headerText, 'utf8');
  return saveUri.fsPath;
}

function createEmptyQuickPickItem(label: string, description?: string): vscode.QuickPickItem {
  return { label, description };
}


function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/`/g, '&#96;');
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}\[\]()#+\-.!|>]/g, '\\$&');
}

function splitCallArguments(text: string): string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (const ch of text) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (ch === '\'' && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (!inSingle && !inDouble) {
      if (ch === '(' || ch === '[' || ch === '{') {
        depth++;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth = Math.max(0, depth - 1);
      } else if (ch === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
    }

    current += ch;
  }

  const last = current.trim();
  if (last.length > 0) {
    args.push(last);
  }

  return args;
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function normalizeChoices(
  choices: ChoiceInput[] | undefined,
  descriptions?: Record<string, string>,
  details?: Record<string, string>
): ChoiceSpec[] {
  const normalized: ChoiceSpec[] = [];
  for (const choice of choices ?? []) {
    if (typeof choice === 'string') {
      normalized.push({
        value: choice,
        description: descriptions?.[choice],
        detail: details?.[choice]
      });
    } else if (choice && typeof choice.value === 'string') {
      normalized.push({
        value: choice.value,
        description: choice.description ?? descriptions?.[choice.value],
        detail: choice.detail ?? details?.[choice.value]
      });
    }
  }

  const seen = new Set<string>();
  return normalized.filter((choice) => {
    const trimmed = choice.value.trim();
    if (!trimmed || seen.has(trimmed)) {
      return false;
    }
    seen.add(trimmed);
    choice.value = trimmed;
    return true;
  });
}

function inferEditorType(p: CpmParameter): ParamEditorType {
  if (p.editorType) {
    return p.editorType;
  }

  const lowerName = p.name.toLowerCase();
  const lowerType = p.type.toLowerCase();
  const lowerDesc = (p.description ?? '').toLowerCase();

  if (lowerName.includes('file') || lowerName.includes('filename') || lowerName.includes('uir')) {
    return 'pathFile';
  }
  if (lowerName.includes('folder') || lowerName.includes('directory') || lowerName.includes('dir')) {
    return 'pathFolder';
  }
  if (lowerName.includes('handle') || lowerType === 'initext' || lowerName.includes('panel')) {
    return 'handle';
  }
  if (lowerName.includes('bool') || lowerDesc.includes('boolean') || lowerName.startsWith('is') || lowerName.startsWith('enable') || lowerName.endsWith('flag')) {
    return 'boolean';
  }
  return 'text';
}

function inferDefaultValue(name: string, type: string, editorType?: ParamEditorType): string {
  const lowerType = type.toLowerCase();
  const lowerName = name.toLowerCase();

  if (editorType === 'boolean') {
    return '0';
  }
  if (editorType === 'pathFile' || editorType === 'pathFolder') {
    return '""';
  }
  if (editorType === 'handle') {
    if (lowerType === 'initext' || lowerName.includes('ini')) {
      return 'iniHandle';
    }
    if (lowerName.includes('parent')) {
      return '0';
    }
    return name;
  }
  if (lowerType.includes('char') && lowerType.includes('*')) {
    if (lowerName.includes('section')) {
      return '"SECTION"';
    }
    if (lowerName.includes('key')) {
      return '"KEY"';
    }
    return '""';
  }
  if (lowerType.includes('double') || lowerType.includes('float')) {
    return '0.0';
  }
  if (lowerType.includes('int') && lowerType.includes('*')) {
    if (lowerName.includes('result')) {
      return '&result';
    }
    return `&${name}`;
  }
  if (lowerType.includes('*')) {
    if (lowerName.includes('value')) {
      return '&value';
    }
    return name;
  }
  if (lowerName.includes('path') || lowerName.includes('file')) {
    return '""';
  }
  if (lowerName.endsWith('id')) {
    return name.toUpperCase();
  }
  return name;
}

function inferPlaceholder(p: CpmParameter, editorType: ParamEditorType): string {
  if (p.placeholder) {
    return p.placeholder;
  }
  if (editorType === 'pathFile') {
    return '"C:\\\\path\\\\file.uir"';
  }
  if (editorType === 'pathFolder') {
    return '"C:\\\\path\\\\folder"';
  }
  if (editorType === 'handle') {
    return p.name;
  }
  if (editorType === 'boolean') {
    return '0 or 1';
  }
  return p.name;
}

function inferChoiceDescription(value: string, p: CpmParameter, editorType: ParamEditorType): string | undefined {
  const lowerValue = value.toLowerCase();
  const lowerName = p.name.toLowerCase();
  if (editorType === 'boolean') {
    return value === '1' ? 'True / enabled / yes' : value === '0' ? 'False / disabled / no' : undefined;
  }
  if (editorType === 'pathFile') {
    if (lowerValue.includes('.uir')) return 'UIR file path';
    if (lowerValue.includes('${workspacefolder}')) return 'Path relative to the current workspace';
    if (value === '""') return 'Empty file path';
  }
  if (editorType === 'pathFolder') {
    if (lowerValue.includes('${workspacefolder}')) return 'Current workspace folder';
    if (value === '""') return 'Empty folder path';
  }
  if (editorType === 'handle') {
    if (value === '0' && lowerName.includes('parent')) return 'Top-level panel, no parent';
    if (lowerValue === 'panelhandle') return 'Common variable name for a panel handle';
    if (lowerValue === 'hpanel') return 'Short variable name for a panel handle';
    if (lowerValue === 'parentpanel') return 'Existing parent panel handle';
    if (lowerValue === 'inihandle' || lowerValue === 'handle') return 'INI file handle / toolbox handle';
  }
  if (lowerValue.startsWith('&')) {
    return 'Address of an output variable';
  }
  if (lowerName.endsWith('id')) {
    return 'Identifier constant generated by CPM';
  }
  return undefined;
}

function inferChoiceDetail(value: string, p: CpmParameter, editorType: ParamEditorType): string | undefined {
  const lowerValue = value.toLowerCase();
  if (editorType === 'pathFile' && lowerValue.endsWith('.uir"')) {
    return 'Used by functions that load CPM panels or resources from a UIR file.';
  }
  if (editorType === 'handle' && lowerValue === '0' && p.name.toLowerCase().includes('parent')) {
    return 'CPM uses 0 when the loaded panel should be top-level instead of attached to another panel.';
  }
  if (lowerValue === '&value') {
    return 'Typical output pointer used when a function fills a result variable.';
  }
  return undefined;
}

function inferPresets(p: CpmParameter, editorType: ParamEditorType): ChoiceSpec[] {
  const explicit = normalizeChoices(p.presets, p.presetDescriptions, p.presetDetails);
  if (explicit.length > 0) {
    return explicit.map((choice) => ({
      ...choice,
      description: choice.description ?? inferChoiceDescription(choice.value, p, editorType),
      detail: choice.detail ?? inferChoiceDetail(choice.value, p, editorType)
    }));
  }

  const lowerName = p.name.toLowerCase();
  const lowerType = p.type.toLowerCase();
  const presets: string[] = [];

  if (editorType === 'boolean') presets.push('0', '1');
  if (editorType === 'pathFile') presets.push('""', '"${workspaceFolder}"');
  if (editorType === 'pathFolder') presets.push('""', '"${workspaceFolder}"');
  if (lowerName.includes('section')) presets.push('"GENERAL"', '"SECTION"');
  if (lowerName.includes('key')) presets.push('"debug"', '"KEY"');
  if (lowerName.includes('value') && p.type.includes('*')) presets.push('&value', '&result');
  if (lowerName.endsWith('id')) presets.push(p.name.toUpperCase());

  return uniq(presets).map((value) => ({
    value,
    description: inferChoiceDescription(value, p, editorType),
    detail: inferChoiceDetail(value, p, editorType)
  }));
}

function inferOptions(p: CpmParameter, editorType: ParamEditorType): ChoiceSpec[] {
  const explicit = normalizeChoices(p.options, p.optionDescriptions, p.optionDetails);
  if (explicit.length > 0) {
    return explicit.map((choice) => ({
      ...choice,
      description: choice.description ?? inferChoiceDescription(choice.value, p, editorType),
      detail: choice.detail ?? inferChoiceDetail(choice.value, p, editorType)
    }));
  }
  if (editorType === 'boolean') {
    return ['0', '1'].map((value) => ({
      value,
      description: inferChoiceDescription(value, p, editorType)
    }));
  }
  return [];
}

function resolveParameter(p: CpmParameter, index: number): ResolvedParameter {
  const editorType = inferEditorType(p);
  return {
    ...p,
    index,
    editorType,
    defaultValue: p.defaultValue ?? inferDefaultValue(p.name, p.type, editorType),
    placeholder: inferPlaceholder(p, editorType),
    presets: inferPresets(p, editorType),
    options: inferOptions(p, editorType)
  };
}

function hasParameterizedInsertTemplate(fn: CpmFunction): boolean {
  return Array.isArray(fn.parameters) && fn.parameters.length > 0 && /\{\{[A-Za-z_][A-Za-z0-9_]*\}\}/.test(String(fn.insertText || ''));
}

function applyParameterizedInsertTemplate(fn: CpmFunction, values?: string[]): string {
  const resolved = (fn.parameters ?? []).map(resolveParameter);
  let output = String(fn.insertText || fn.signature || fn.name || '');

  // Resolve raw UI values once, then allow insertValueMap entries to inject placeholders
  // owned by other parameters. Bounded passes make nested expansions independent from
  // the display order of the parameter editors.
  const replacements = resolved.map((param, index) => {
    const hasExplicitValue = Array.isArray(values) && index < values.length && values[index] !== undefined && values[index] !== null;
    const rawReplacement = hasExplicitValue ? String(values![index] ?? '').trim() : param.defaultValue;
    const valueMap = param && typeof param.insertValueMap === 'object' && param.insertValueMap !== null ? param.insertValueMap : undefined;
    return valueMap && Object.prototype.hasOwnProperty.call(valueMap, rawReplacement)
      ? String(valueMap[rawReplacement] ?? '')
      : rawReplacement;
  });

  const maxPasses = Math.max(2, Math.min(12, resolved.length + 2));
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const before = output;
    resolved.forEach((param, index) => {
      output = output.replace(
        new RegExp('\\{\\{' + escapeRegexLiteral(param.name) + '\\}\\}', 'g'),
        replacements[index]
      );
    });
    if (output === before) break;
  }

  return (usesCmdBatchStatementStyle(fn) || usesGitCommandStyle(fn)) ? normalizeCmdBatchTemplateWhitespace(output) : output;
}

function extractDefaultArguments(fn: CpmFunction): string[] {
  const params = (fn.parameters ?? []).map(resolveParameter);
  if (hasParameterizedInsertTemplate(fn)) {
    return params.map((param) => param.defaultValue);
  }
  const start = fn.insertText.indexOf('(');
  const end = fn.insertText.lastIndexOf(')');
  if (start < 0 || end <= start) {
    return params.map((p) => p.defaultValue);
  }

  const rawArgs = fn.insertText.slice(start + 1, end).trim();
  if (!rawArgs) {
    return [];
  }

  const parsed = splitCallArguments(rawArgs);
  if (params.length > 0) {
    while (parsed.length < params.length) {
      parsed.push(params[parsed.length].defaultValue);
    }
  }
  return parsed;
}

function hasReturnValue(fn: CpmFunction): boolean {
  const normalized = fn.returnType.trim().toLowerCase();
  return normalized !== 'void' && normalized !== 'none';
}

function isSimpleCallableTemplateText(text: string): boolean {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.includes('\n')) {
    return false;
  }
  // Direct API templates are expressions such as fopen({{path}}, {{mode}}).
  // Declarative templates, blocks and definitions must remain untouched.
  return /^[A-Za-z_~][A-Za-z0-9_:.>\-]*\s*\(/.test(trimmed)
    || /^[A-Za-z_][A-Za-z0-9_]*\s*->\s*[A-Za-z_~][A-Za-z0-9_]*\s*\(/.test(trimmed)
    || /^[A-Za-z_][A-Za-z0-9_]*\s*\.\s*[A-Za-z_~][A-Za-z0-9_]*\s*\(/.test(trimmed);
}

function usesPythonStatementStyle(fn: CpmFunction): boolean {
  const haystack = `${fn.environment ?? ''} ${fn.library ?? ''}`.toLowerCase();
  return haystack.includes('python');
}

function usesCmdBatchStatementStyle(fn: CpmFunction): boolean {
  const library = String(fn.library ?? '').trim().toLowerCase();
  return library === 'windows cmd & batch';
}

function usesGitCommandStyle(fn: CpmFunction): boolean {
  const library = String(fn.library ?? '').trim().toLowerCase();
  return library === 'git version control';
}

function normalizeCmdBatchTemplateWhitespace(text: string): string {
  const input = String(text || '').trim();
  let output = '';
  let inQuotes = false;
  let pendingSpace = false;
  for (let index = 0; index < input.length; index += 1) {
    const ch = input[index];
    if (ch === '"') {
      if (pendingSpace && output && !output.endsWith(' ')) output += ' ';
      pendingSpace = false;
      output += ch;
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && /\s/.test(ch)) {
      pendingSpace = output.length > 0;
      continue;
    }
    if (pendingSpace && output && !output.endsWith(' ')) output += ' ';
    pendingSpace = false;
    output += ch;
  }
  return output.trim();
}

function ensureStatementTerminator(text: string, fn?: CpmFunction): string {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return trimmed;
  }
  if (fn && (usesPythonStatementStyle(fn) || usesCmdBatchStatementStyle(fn))) {
    return trimmed.replace(/;+$/, '');
  }
  if (/[;}]$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed};`;
}

function buildCallText(fn: CpmFunction, values?: string[], returnTarget?: string): string {
  if (hasParameterizedInsertTemplate(fn)) {
    const rendered = applyParameterizedInsertTemplate(fn, values);
    const kind = getGlobalSymbolKind(fn);
    const callableTemplate = isCallableSymbolKind(kind) && isSimpleCallableTemplateText(rendered);
    if (!callableTemplate) {
      return rendered;
    }
    const call = ensureStatementTerminator(rendered, fn);
    const target = returnTarget?.trim();
    if (hasReturnValue(fn) && target) {
      return `${target} = ${call}`;
    }
    return call;
  }
  const resolved = (fn.parameters ?? []).map(resolveParameter);
  const defaults = extractDefaultArguments(fn);
  const call = resolved.length === 0
    ? `${fn.name}()`
    : `${fn.name}(${resolved.map((p, index) => {
      const explicit = values?.[index]?.trim();
      if (explicit && explicit.length > 0) {
        return explicit;
      }
      return defaults[index] ?? p.defaultValue;
    }).join(', ')})`;

  const statement = usesPythonStatementStyle(fn)
    ? call
    : (getSymbolKind(fn) === 'command' ? call : `${call};`);
  if (hasReturnValue(fn)) {
    const target = returnTarget?.trim();
    if (target) {
      return `${target} = ${statement}`;
    }
  }
  return statement;
}

function defaultReturnDescription(fn: CpmFunction): string {
  if (!hasReturnValue(fn)) {
    return 'This function does not return a value.';
  }
  if (fn.returnDescription && fn.returnDescription.trim().length > 0) {
    return fn.returnDescription.trim();
  }
  return `Return type: ${fn.returnType}. You can optionally assign the result to a variable before insertion.`;
}

function getStateKey(fn: CpmFunction): string {
  return `jcLib:functionState:${fn.library}:${fn.category}:${fn.name}:${fn.signature}`;
}

function supportsPicker(param: ResolvedParameter, cviAttributeHelper?: any): boolean {
  if (cviAttributeHelper && ((typeof cviAttributeHelper.attributeIndex === 'number' && cviAttributeHelper.attributeIndex === param.index)
    || (typeof cviAttributeHelper.valueIndex === 'number' && cviAttributeHelper.valueIndex === param.index))) {
    return true;
  }
  if (param?.pickerConfig) {
    return true;
  }
  return param.editorType === 'enum' || param.presets.length > 0 || param.options.length > 0;
}

function collectEnumChoices(param: ResolvedParameter): ChoiceItem[] {
  const options = normalizeChoices(Array.isArray(param.options) ? param.options : []);
  if (options.length > 0) {
    return options;
  }
  const presets = normalizeChoices(Array.isArray(param.presets) ? param.presets : []);
  if (presets.length > 0) {
    return presets;
  }
  const pickerConfig = normalizeStructuredPickerConfig(param.pickerConfig, param.pickerConfig?.title);
  if (!pickerConfig || !Array.isArray(pickerConfig.sections) || pickerConfig.sections.length === 0) {
    return [];
  }
  const pickerChoices: ChoiceItem[] = [];
  pickerConfig.sections.forEach((section) => {
    (Array.isArray(section.groups) ? section.groups : []).forEach((group) => {
      (Array.isArray(group.items) ? group.items : []).forEach((item) => {
        const value = String(item?.value ?? item?.constant ?? '').trim();
        if (!value) {
          return;
        }
        pickerChoices.push({
          value,
          description: String(item?.description || item?.label || '').trim(),
          detail: String(item?.detail || '').trim()
        });
      });
    });
  });
  return normalizeChoices(pickerChoices);
}

function renderEditor(param: ResolvedParameter, currentValue: string): string {
  const safeValue = escapeHtml(currentValue);
  const safePlaceholder = escapeHtml(param.placeholder);
  const enumChoices = param.editorType === 'enum' ? collectEnumChoices(param) : [];

  if (param.editorType === 'boolean' || (param.editorType === 'enum' && enumChoices.length > 0)) {
    const options = normalizeChoices([
      ...(param.editorType === 'boolean' ? param.options : enumChoices),
      { value: currentValue }
    ]).filter((v) => v.value.length > 0);
    const optionHtml = options.map((option) => {
      const selected = option.value === currentValue ? ' selected' : '';
      const title = option.description ? ` title="${escapeAttr(option.description)}"` : '';
      return `<option value="${escapeHtml(option.value)}"${selected}${title}>${escapeHtml(option.value)}</option>`;
    }).join('');
    return `<select class="param-input" data-index="${param.index}">${optionHtml}</select>`;
  }

  return `<input class="param-input" data-index="${param.index}" type="text" value="${safeValue}" placeholder="${safePlaceholder}" spellcheck="false" />`;
}

function summarizeChoices(param: ResolvedParameter): string {
  const enumChoices = param.editorType === 'enum' ? collectEnumChoices(param) : [];
  const source = enumChoices.length > 0 ? enumChoices : param.presets;
  const choices = source.slice(0, 3).map((choice) => {
    const desc = choice.description ? ` — ${choice.description}` : '';
    return `${choice.value}${desc}`;
  });
  if (choices.length === 0) {
    return '';
  }
  return choices.join(' · ');
}

function renderParamRow(param: ResolvedParameter): string {
  const choices = param.presets.slice(0, 3).map((choice) => {
    const desc = choice.description ? ` — ${choice.description}` : '';
    return `${choice.value}${desc}`;
  });
  if (choices.length === 0) {
    return '';
  }
  return choices.join(' · ');
}

function renderParamRow(param: ResolvedParameter, currentValue: string, cviAttributeHelper?: any): string {
  const presetButtons = param.presets.slice(0, 4).map((preset) => {
    const title = preset.description ? ` title="${escapeHtml(preset.description)}"` : '';
    return `<button type="button" class="mini secondary preset-btn" data-index="${param.index}" data-value="${escapeHtml(preset.value)}"${title}>${escapeHtml(preset.value)}</button>`;
  }).join('');

  const pickerBtn = supportsPicker(param, cviAttributeHelper)
    ? `<button type="button" class="mini picker-btn" data-index="${param.index}" title="Show contextual suggestions and descriptions">...</button>`
    : '';

  const extras = (presetButtons || pickerBtn)
    ? `<div class="editor-actions">${presetButtons}${pickerBtn}</div>`
    : '';

  const helperText = summarizeChoices(param)
    ? `<div class="choice-hint">Quick picks: ${escapeHtml(summarizeChoices(param))}</div>`
    : '';

  return `
    <tr>
      <td><code>${escapeHtml(param.type)}</code></td>
      <td>
        <strong>${escapeHtml(param.name)}</strong>
        <div class="param-kind">${escapeHtml(param.editorType)}</div>
      </td>
      <td>${escapeHtml(param.description ?? '')}</td>
      <td>
        ${renderEditor(param, currentValue)}
        ${extras}
        ${helperText}
      </td>
    </tr>`;
}


function normalizeCpmAttributeConstant(label: string): string {
  const raw = String(label || '').trim();
  if (!raw) return 'ATTR_CUSTOM';
  return 'ATTR_' + raw.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

let cachedCpmUiAttributeCatalog: any | undefined;
let didTryLoadCpmUiAttributeCatalog = false;

function loadCpmUiAttributeCatalog(): any | undefined {
  if (didTryLoadCpmUiAttributeCatalog) {
    return cachedCpmUiAttributeCatalog;
  }
  didTryLoadCpmUiAttributeCatalog = true;
  const candidates = [
    path.join(__dirname, '..', 'data', 'metadata', 'cvi_ui_attribute_catalog.json'),
    path.join(__dirname, 'data', 'metadata', 'cvi_ui_attribute_catalog.json')
  ];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) {
        continue;
      }
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (parsed && typeof parsed === 'object' && parsed.helpers && typeof parsed.helpers === 'object') {
        cachedCpmUiAttributeCatalog = parsed;
        return cachedCpmUiAttributeCatalog;
      }
    } catch (error) {
      console.error(`C/C++ Libraries: failed to load CPM UI attribute catalog from ${candidate}`, error);
    }
  }
  return undefined;
}

function getExternalCpmAttributeHelper(name: string): any | undefined {
  const catalog = loadCpmUiAttributeCatalog();
  const helper = catalog?.helpers?.[String(name || '').trim()];
  return helper && typeof helper === 'object' ? JSON.parse(JSON.stringify(helper)) : undefined;
}

function normalizeCpmValueOptions(rawOptions: any): any[] {
  return (Array.isArray(rawOptions) ? rawOptions : []).map((entry: any) => {
    const value = String(entry?.value ?? entry?.constant ?? entry?.label ?? '').trim();
    if (!value) {
      return undefined;
    }
    return {
      value,
      constant: String(entry?.constant || value).trim() || value,
      label: String(entry?.label || value).trim() || value,
      description: String(entry?.description || '').trim(),
      detail: String(entry?.detail || '').trim(),
      defaultValue: String(entry?.defaultValue || '').trim(),
      sourceTypes: ['All']
    };
  }).filter(Boolean);
}

function inferCpmAttributeValueMetadata(constant: string, description?: string, defaultValue?: string): any {
  const name = String(constant || '').trim();
  const text = `${name} ${String(description || '')}`.toLowerCase();
  const explicitDefault = String(defaultValue || '').trim();
  const boolean = text.includes('boolean') || /(?:visible|dimmed|enabled|bold|italic|underline|strikeout|locked|checked|snappable|unique|editable|show|hide)/i.test(name);
  const color = /(?:color|bgcolor)/i.test(name) || text.includes('rgb value');
  const stringValue = /(?:text|title|name|font|caption)$/i.test(name) || text.includes('char *');
  const pointer = text.includes('void *') || text.includes('intptr_t') || text.includes('pointer') || text.includes('handle');
  const floatingPoint = text.includes('double') || text.includes('float') || /(?:scaling|xvalue|yvalue)$/i.test(name);
  const optionsFromDescription = Array.from(new Set((String(description || '').match(/\bVAL_[A-Za-z0-9_]+\b/g) || [])));
  if (boolean) {
    return { valueKind: 'boolean', valuePlaceholder: '1 or 0', defaultValue: explicitDefault || '1', valueOptions: [
      { value: '1', label: 'True (1)', description: 'Enable the selected boolean attribute.' },
      { value: '0', label: 'False (0)', description: 'Disable the selected boolean attribute.' }
    ] };
  }
  if (color) {
    return { valueKind: 'color', valuePlaceholder: 'VAL_WHITE or MakeColor(...)', defaultValue: explicitDefault || 'VAL_WHITE', valueOptions: [
      { value: 'VAL_BLACK', label: 'Black', description: 'Use the predefined black RGB value.' },
      { value: 'VAL_WHITE', label: 'White', description: 'Use the predefined white RGB value.' },
      { value: 'VAL_RED', label: 'Red', description: 'Use the predefined red RGB value.' },
      { value: 'VAL_GREEN', label: 'Green', description: 'Use the predefined green RGB value.' },
      { value: 'VAL_BLUE', label: 'Blue', description: 'Use the predefined blue RGB value.' },
      { value: 'VAL_YELLOW', label: 'Yellow', description: 'Use the predefined yellow RGB value.' },
      { value: 'VAL_CYAN', label: 'Cyan', description: 'Use the predefined cyan RGB value.' },
      { value: 'VAL_MAGENTA', label: 'Magenta', description: 'Use the predefined magenta RGB value.' },
      { value: 'VAL_TRANSPARENT', label: 'Transparent', description: 'Use a transparent background where supported.' }
    ] };
  }
  if (optionsFromDescription.length) {
    return { valueKind: 'enum', valuePlaceholder: optionsFromDescription[0], defaultValue: explicitDefault || optionsFromDescription[0], valueOptions: optionsFromDescription.map((value) => ({ value, label: value, description: `Insert the CPM constant ${value}.` })) };
  }
  if (stringValue) {
    return { valueKind: 'string', valuePlaceholder: '"text"', defaultValue: explicitDefault || '"text"', valueOptions: [
      { value: '"text"', label: 'Text literal', description: 'Insert an editable C string literal.' },
      { value: '""', label: 'Empty string', description: 'Insert an empty C string literal.' }
    ] };
  }
  if (pointer) {
    return { valueKind: 'pointer', valuePlaceholder: 'NULL or pointer expression', defaultValue: explicitDefault || 'NULL', valueOptions: [
      { value: 'NULL', label: 'NULL', description: 'Insert a null pointer or handle.' },
      { value: '&value', label: '&value', description: 'Insert an editable address expression.' }
    ] };
  }
  if (floatingPoint) {
    return { valueKind: 'floating-point', valuePlaceholder: '0.0', defaultValue: explicitDefault || '0.0', valueOptions: [
      { value: '0.0', label: '0.0', description: 'Insert a floating-point value.' },
      { value: '1.0', label: '1.0', description: 'Insert a floating-point value.' }
    ] };
  }
  return { valueKind: 'integer', valuePlaceholder: '0', defaultValue: explicitDefault || '0', valueOptions: [
    { value: '0', label: '0', description: 'Insert a numeric value.' },
    { value: '1', label: '1', description: 'Insert a numeric value.' }
  ] };
}

function flattenStructuredPickerItems(config: any): any[] {
  const output: any[] = [];
  (Array.isArray(config?.sections) ? config.sections : []).forEach((section: any) => {
    (Array.isArray(section?.items) ? section.items : []).forEach((item: any) => output.push(item));
    (Array.isArray(section?.groups) ? section.groups : []).forEach((group: any) => {
      (Array.isArray(group?.items) ? group.items : []).forEach((item: any) => output.push(item));
    });
  });
  return output;
}

function mergeCpmAttributeHelpers(primary: any, supplementary: any): any {
  if (!primary || !supplementary) {
    return primary;
  }
  const existing = new Set(flattenStructuredPickerItems(primary).map((item: any) => String(item?.value ?? item?.constant ?? '').trim()).filter(Boolean));
  const supplementarySections = (Array.isArray(supplementary.sections) ? supplementary.sections : []).map((section: any) => {
    const groups = (Array.isArray(section?.groups) ? section.groups : []).map((group: any) => {
      const items = (Array.isArray(group?.items) ? group.items : []).filter((item: any) => {
        const value = String(item?.value ?? item?.constant ?? '').trim();
        return value && !existing.has(value);
      });
      items.forEach((item: any) => existing.add(String(item?.value ?? item?.constant ?? '').trim()));
      return items.length ? { ...group, items } : undefined;
    }).filter(Boolean);
    return groups.length ? { ...section, label: 'Header-derived supplementary attributes', description: 'Additional settable User Interface attributes derived from userint.h. Applicability still depends on the concrete CPM control type.', groups } : undefined;
  }).filter(Boolean);
  if (!supplementarySections.length) {
    return primary;
  }
  return { ...primary, sections: [...(Array.isArray(primary.sections) ? primary.sections : []), ...supplementarySections] };
}

function buildCpmAttributeValuePickerConfig(fn: CpmFunction, helper: any, currentValues?: string[]): StructuredPickerConfig | undefined {
  const attributeIndex = typeof helper?.attributeIndex === 'number' ? helper.attributeIndex : -1;
  const valueIndex = typeof helper?.valueIndex === 'number' ? helper.valueIndex : -1;
  if (attributeIndex < 0 || valueIndex < 0) {
    return undefined;
  }
  const selectedConstant = String(currentValues?.[attributeIndex] || '').trim();
  const selectedItem = flattenStructuredPickerItems(helper).find((item: any) => String(item?.value ?? item?.constant ?? '').trim() === selectedConstant);
  const inferred = inferCpmAttributeValueMetadata(selectedConstant, selectedItem?.description, selectedItem?.defaultValue);
  const valueKind = String(selectedItem?.valueKind || inferred.valueKind || 'value').trim() || 'value';
  const valuePlaceholder = String(selectedItem?.valuePlaceholder || inferred.valuePlaceholder || '').trim();
  const options = normalizeCpmValueOptions(Array.isArray(selectedItem?.valueOptions) && selectedItem.valueOptions.length ? selectedItem.valueOptions : inferred.valueOptions);
  if (!options.length) {
    return undefined;
  }
  const attributeLabel = String(selectedItem?.label || selectedConstant || 'selected attribute').trim();
  return normalizeStructuredPickerConfig({
    title: `Select ${valueKind} value for ${selectedConstant || fn.name}`,
    selectionLabel: 'Selected value',
    subtitle: selectedConstant
      ? `${attributeLabel}: choose a suggested ${valueKind} value or edit the argument directly in the function card.${valuePlaceholder ? ` Placeholder: ${valuePlaceholder}.` : ''}`
      : 'Select an attribute constant first. Generic numeric suggestions are shown until an attribute is selected.',
    targetIndex: valueIndex,
    defaultTargetIndex: -1,
    applyDefaultIfEmpty: false,
    sections: [{
      label: selectedConstant || 'Generic value',
      description: String(selectedItem?.description || 'Contextual value suggestions for the selected CPM User Interface attribute.').trim(),
      groups: [{ label: `${valueKind} suggestions`, description: valuePlaceholder ? `Editable argument placeholder: ${valuePlaceholder}` : '', items: options }]
    }]
  }, `Select value for ${selectedConstant || fn.name}`);
}

function normalizeStructuredPickerConfig(raw: any, fallbackTitle?: string): StructuredPickerConfig | undefined {
  const sectionsInput = Array.isArray(raw?.sections) ? raw.sections : [];
  const normalizedSections = sectionsInput.map((section: any) => {
    const sectionLabel = String(section?.label || '').trim();
    const sectionDescription = String(section?.description || '').trim();
    const directItems = Array.isArray(section?.items) ? section.items : [];
    const groupsInput = Array.isArray(section?.groups) ? section.groups : [];
    const groups = groupsInput.map((group: any) => {
      const items = (Array.isArray(group?.items) ? group.items : []).map((item: any) => {
        const value = String(item?.value ?? item?.constant ?? item?.label ?? '').trim();
        if (!value) {
          return undefined;
        }
        const label = String(item?.label ?? value).trim() || value;
        const description = String(item?.description || '').trim();
        const detail = String(item?.detail || '').trim();
        const defaultValue = String(item?.defaultValue || '').trim();
        const sourceTypes = Array.isArray(item?.sourceTypes ?? item?.controlTypes)
          ? (item.sourceTypes ?? item.controlTypes).map((entry: any) => String(entry || '').trim()).filter(Boolean)
          : [];
        return {
          value,
          constant: String(item?.constant || value).trim() || value,
          label,
          description,
          detail,
          defaultValue,
          sourceTypes: sourceTypes.length ? sourceTypes : ['All'],
          valueKind: String(item?.valueKind || '').trim(),
          valuePlaceholder: String(item?.valuePlaceholder || '').trim(),
          valueOptions: normalizeCpmValueOptions(item?.valueOptions)
        };
      }).filter(Boolean);
      if (!items.length) {
        return undefined;
      }
      return {
        label: String(group?.label || '').trim() || 'Choices',
        description: String(group?.description || '').trim(),
        items
      };
    }).filter(Boolean);
    if (directItems.length) {
      groups.unshift({
        label: 'Choices',
        description: '',
        items: directItems.map((item: any) => {
          const value = String(item?.value ?? item?.constant ?? item?.label ?? '').trim();
          if (!value) {
            return undefined;
          }
          const label = String(item?.label ?? value).trim() || value;
          const description = String(item?.description || '').trim();
          const detail = String(item?.detail || '').trim();
          const defaultValue = String(item?.defaultValue || '').trim();
          const sourceTypes = Array.isArray(item?.sourceTypes ?? item?.controlTypes)
            ? (item.sourceTypes ?? item.controlTypes).map((entry: any) => String(entry || '').trim()).filter(Boolean)
            : [];
          return {
            value,
            constant: String(item?.constant || value).trim() || value,
            label,
            description,
            detail,
            defaultValue,
            sourceTypes: sourceTypes.length ? sourceTypes : ['All'],
            valueKind: String(item?.valueKind || '').trim(),
            valuePlaceholder: String(item?.valuePlaceholder || '').trim(),
            valueOptions: normalizeCpmValueOptions(item?.valueOptions)
          };
        }).filter(Boolean)
      });
    }
    if (!groups.length) {
      return undefined;
    }
    return {
      label: sectionLabel || 'Choices',
      description: sectionDescription,
      groups
    };
  }).filter(Boolean);

  const sourceTypes = Array.isArray(raw?.sourceTypes ?? raw?.controlTypes)
    ? (raw.sourceTypes ?? raw.controlTypes).map((entry: any) => String(entry || '').trim()).filter(Boolean)
    : [];

  if (!normalizedSections.length) {
    return undefined;
  }

  return {
    title: String(raw?.title || fallbackTitle || 'Select value').trim() || (fallbackTitle || 'Select value'),
    selectionLabel: String(raw?.selectionLabel || 'Selected value').trim() || 'Selected value',
    subtitle: String(raw?.subtitle || '').trim(),
    sourceTypes: sourceTypes.length ? sourceTypes : ['All'],
    sections: normalizedSections,
    targetIndex: typeof raw?.targetIndex === 'number' ? raw.targetIndex : -1,
    defaultTargetIndex: typeof raw?.defaultTargetIndex === 'number' ? raw.defaultTargetIndex : -1,
    applyDefaultIfEmpty: raw?.applyDefaultIfEmpty !== false,
    multiSelect: raw?.multiSelect === true,
    valueSeparator: typeof raw?.valueSeparator === 'string' && raw.valueSeparator.length > 0 ? raw.valueSeparator : ' | ',
    emptyValue: typeof raw?.emptyValue === 'string' ? raw.emptyValue : '',
    allowEmptySelection: raw?.allowEmptySelection === true
  };
}

function buildAutoStructuredPickerConfig(param: ResolvedParameter): StructuredPickerConfig | undefined {
  if (!param || param.editorType === 'pathFile' || param.editorType === 'pathFolder') {
    return undefined;
  }
  const rawChoices = normalizeChoices([...(Array.isArray(param.options) ? param.options : []), ...(Array.isArray(param.presets) ? param.presets : [])]);
  if (!rawChoices.length) {
    return undefined;
  }
  return normalizeStructuredPickerConfig({
    title: `Select value for ${param.name}`,
    selectionLabel: 'Selected value',
    targetIndex: param.index,
    defaultTargetIndex: -1,
    applyDefaultIfEmpty: false,
    sections: [
      {
        label: 'Choices',
        groups: [
          {
            label: param.name || 'Values',
            description: param.description || '',
            items: rawChoices.map((choice) => ({
              value: choice.value,
              label: choice.value,
              description: choice.description || '',
              detail: choice.detail || '',
              defaultValue: ''
            }))
          }
        ]
      }
    ]
  }, `Select value for ${param.name}`);
}

function getCpmAttributeHelperConfigForParameter(fn: CpmFunction, paramIndex: number, fallbackTitle?: string, currentValues?: string[]): StructuredPickerConfig | undefined {
  const helper = getCpmAttributeHelperConfig(fn);
  if (!helper) {
    return undefined;
  }
  if (typeof helper.attributeIndex === 'number' && helper.attributeIndex === paramIndex) {
    return normalizeStructuredPickerConfig(helper, helper.title || fallbackTitle || 'Select value');
  }
  if (typeof helper.valueIndex === 'number' && helper.valueIndex === paramIndex) {
    return buildCpmAttributeValuePickerConfig(fn, helper, currentValues);
  }
  return undefined;
}

function applyStructuredPickerOverrides(baseConfig: StructuredPickerConfig | undefined, overrideRaw: any, overrideConfig: StructuredPickerConfig | undefined, fallbackTitle: string): StructuredPickerConfig | undefined {
  if (!baseConfig && !overrideConfig) {
    return undefined;
  }
  const result: StructuredPickerConfig = JSON.parse(JSON.stringify(baseConfig || overrideConfig));
  if (!result) {
    return undefined;
  }
  const title = String(overrideRaw?.title || '').trim();
  if (title) {
    result.title = title;
  } else if (!String(result.title || '').trim()) {
    result.title = fallbackTitle;
  }
  const selectionLabel = String(overrideRaw?.selectionLabel || '').trim();
  if (selectionLabel) {
    result.selectionLabel = selectionLabel;
  } else if (!String(result.selectionLabel || '').trim()) {
    result.selectionLabel = 'Selected value';
  }
  if (overrideRaw && Object.prototype.hasOwnProperty.call(overrideRaw, 'subtitle')) {
    result.subtitle = String(overrideRaw?.subtitle || '').trim();
  }
  const sourceTypes = Array.isArray(overrideRaw?.sourceTypes)
    ? overrideRaw.sourceTypes.map((entry: any) => String(entry || '').trim()).filter(Boolean)
    : [];
  if (sourceTypes.length) {
    result.sourceTypes = sourceTypes;
  }
  if (typeof overrideRaw?.targetIndex === 'number') {
    result.targetIndex = overrideRaw.targetIndex;
  }
  if (typeof overrideRaw?.defaultTargetIndex === 'number') {
    result.defaultTargetIndex = overrideRaw.defaultTargetIndex;
  }
  if (typeof overrideRaw?.applyDefaultIfEmpty === 'boolean') {
    result.applyDefaultIfEmpty = overrideRaw.applyDefaultIfEmpty;
  }
  if (typeof overrideRaw?.multiSelect === 'boolean') {
    result.multiSelect = overrideRaw.multiSelect;
  }
  if (typeof overrideRaw?.valueSeparator === 'string' && overrideRaw.valueSeparator.length > 0) {
    result.valueSeparator = overrideRaw.valueSeparator;
  }
  if (typeof overrideRaw?.emptyValue === 'string') {
    result.emptyValue = overrideRaw.emptyValue;
  }
  if (typeof overrideRaw?.allowEmptySelection === 'boolean') {
    result.allowEmptySelection = overrideRaw.allowEmptySelection;
  }
  if (overrideConfig && Array.isArray(overrideConfig.sections) && overrideConfig.sections.length) {
    result.sections = overrideConfig.sections;
  }
  return result;
}

function getStructuredPickerConfigForParameter(fn: CpmFunction, param: ResolvedParameter, currentValues?: string[]): StructuredPickerConfig | undefined {
  const fallbackTitle = `Select value for ${param.name}`;
  const explicitRaw = { ...(param?.pickerConfig || {}), targetIndex: param.index };
  const explicitConfig = normalizeStructuredPickerConfig(explicitRaw, fallbackTitle);
  const helperConfig = getCpmAttributeHelperConfigForParameter(fn, param.index, fallbackTitle, currentValues);
  const mergedHelperConfig = applyStructuredPickerOverrides(helperConfig, explicitRaw, explicitConfig, fallbackTitle);
  if (mergedHelperConfig) {
    return mergedHelperConfig;
  }
  if (explicitConfig) {
    return explicitConfig;
  }
  const autoConfig = buildAutoStructuredPickerConfig(param);
  if (autoConfig && param?.pickerConfig) {
    autoConfig.title = String(param.pickerConfig.title || autoConfig.title || fallbackTitle).trim() || autoConfig.title;
    const sourceTypes = Array.isArray(param.pickerConfig.sourceTypes) ? param.pickerConfig.sourceTypes.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
    if (sourceTypes.length) {
      autoConfig.sourceTypes = sourceTypes;
      if (Array.isArray(autoConfig.sections)) {
        autoConfig.sections.forEach((section: any) => {
          (Array.isArray(section?.groups) ? section.groups : []).forEach((group: any) => {
            (Array.isArray(group?.items) ? group.items : []).forEach((item: any) => {
              if (!Array.isArray(item.sourceTypes) || !item.sourceTypes.length || (item.sourceTypes.length === 1 && item.sourceTypes[0] === 'All')) {
                item.sourceTypes = [...sourceTypes];
              }
            });
          });
        });
      }
    }
    autoConfig.applyDefaultIfEmpty = param.pickerConfig.applyDefaultIfEmpty === true;
  }
  return autoConfig;
}

function getCpmAttributeHelperConfig(fn: CpmFunction): any | undefined {
  const name = String(fn?.name || '').trim();
  if (!name) return undefined;
  const params = Array.isArray(fn.parameters) ? fn.parameters : [];
  const attributeIndex = params.findIndex((param) => String(param?.name || '').toLowerCase().includes('attribute'));
  const valueIndex = attributeIndex >= 0 ? params.findIndex((_param, index) => index > attributeIndex) : -1;
  const controlTypes = ['All', 'ActiveX', 'Binary Switch', 'Canvas', 'Color Numeric', 'Command Button', 'Decoration', 'Digital Graph', 'Graph', 'LED', 'List', 'Numeric', 'Numeric Slide', 'Picture', 'Picture Button', 'Picture Ring', 'Radio Button', 'Ring', 'Ring Slide', 'Splitter', 'String', 'Strip Chart', 'Tab', 'Table', 'Text Box', 'Text Button', 'Text Message', 'Timer', 'Toggle Button', 'Tree'];
  const buildLeaf = (label: string, description: string, defaultValue: string, types?: string[], constant?: string) => {
    const attributeConstant = constant || normalizeCpmAttributeConstant(label);
    return { kind: 'attribute', label, value: attributeConstant, constant: attributeConstant, description, defaultValue, sourceTypes: Array.isArray(types) && types.length ? types : ['All'], ...inferCpmAttributeValueMetadata(attributeConstant, description, defaultValue) };
  };
  if (name === 'SetCtrlAttribute') {
    const graphControls = ['Graph', 'Digital Graph', 'Strip Chart'];
    const textControls = ['String', 'Text Box', 'Text Message', 'Command Button', 'Text Button', 'Ring', 'Picture Ring', 'List', 'Table', 'Tree', 'Tab', 'Numeric', 'Color Numeric', 'Numeric Slide', 'Ring Slide', 'Toggle Button', 'Radio Button', 'Binary Switch'];
    const tableListTreeControls = ['Table', 'List', 'Tree'];
    const canvasControls = ['Canvas'];
    return mergeCpmAttributeHelpers({
      title: 'Select Control Attribute Constant',
      mode: 'control',
      attributeIndex,
      targetIndex: attributeIndex,
      valueIndex,
      defaultTargetIndex: valueIndex,
      applyDefaultIfEmpty: true,
      selectionLabel: 'Selected attribute',
      sourceTypes: controlTypes,
      sections: [
        {
          label: 'Control Appearance',
          description: 'Attributes related to the appearance of the control.',
          groups: [
            { label: 'Axis Names', description: 'Axis title font and style options commonly used on graphs and charts.', items: [
              buildLeaf('XY Name Bold', 'Toggle bold styling for XY axis names.', '1', graphControls, 'ATTR_XY_NAME_BOLD'),
              buildLeaf('XY Name Character Set', 'Choose the character set used when drawing the axis name.', 'VAL_ANSI_CHARSET', graphControls, 'ATTR_XY_NAME_CHARSET'),
              buildLeaf('XY Name Color', 'Set the text color of the XY axis names.', 'VAL_WHITE', graphControls, 'ATTR_XY_NAME_COLOR'),
              buildLeaf('XY Name Font', 'Choose the metafont used for XY axis names.', 'VAL_APP_META_FONT', graphControls, 'ATTR_XY_NAME_FONT'),
              buildLeaf('XY Name Font Name Length', 'Read the required buffer length for the XY axis font name.', '&fontNameLength', graphControls, 'ATTR_XY_NAME_FONT_NAME_LENGTH'),
              buildLeaf('XY Name Italic', 'Toggle italic styling for XY axis names.', '0', graphControls, 'ATTR_XY_NAME_ITALIC'),
              buildLeaf('XY Name Point Size', 'Change the point size used for XY axis names.', '12', graphControls, 'ATTR_XY_NAME_POINT_SIZE'),
              buildLeaf('XY Name Strikeout', 'Toggle strikeout styling for XY axis names.', '0', graphControls, 'ATTR_XY_NAME_STRIKEOUT'),
              buildLeaf('XY Name Underline', 'Toggle underline styling for XY axis names.', '0', graphControls, 'ATTR_XY_NAME_UNDERLINE') ] },
            { label: 'Show/Hide Parts', description: 'Visibility-related switches for common control sub-parts.', items: [
              buildLeaf('Visible', 'Show or hide the control.', '1', ['All'], 'ATTR_VISIBLE'),
              buildLeaf('Dimmed', 'Dim or undim the control.', '0', ['All'], 'ATTR_DIMMED'),
              buildLeaf('Border Visible', 'Show or hide the border.', '1', tableListTreeControls, 'ATTR_BORDER_VISIBLE'),
              buildLeaf('Column Labels Visible', 'Show or hide column labels.', '1', ['Table', 'List'], 'ATTR_COLUMN_LABELS_VISIBLE'),
              buildLeaf('Fill Option', 'Enable filled interior rendering when supported.', '1', ['Canvas', 'Graph', 'Digital Graph'], 'ATTR_FILL_OPTION'),
              buildLeaf('Frame Visible', 'Show or hide the frame around the control.', '1', ['Graph', 'Digital Graph', 'Canvas', 'Table', 'List'], 'ATTR_FRAME_VISIBLE'),
              buildLeaf('Inner Markers Visible', 'Show or hide inner plot markers.', '1', graphControls, 'ATTR_INNER_MARKERS_VISIBLE'),
              buildLeaf('Row Labels Visible', 'Show or hide row labels.', '1', ['Table'], 'ATTR_ROW_LABELS_VISIBLE'),
              buildLeaf('Scroll Bars', 'Control whether scroll bars are displayed.', 'VAL_BOTH_SCROLL_BARS', ['Table', 'List', 'Text Box', 'Tree'], 'ATTR_SCROLL_BARS'),
              buildLeaf('Show Digital Display', 'Show the digital readout associated with the control.', '1', ['Numeric', 'Numeric Slide', 'Ring Slide'], 'ATTR_SHOW_DIGITAL_DISPLAY'),
              buildLeaf('Show Inc/Dec Arrows', 'Show increment and decrement arrows.', '1', ['Numeric', 'Color Numeric', 'Numeric Slide'], 'ATTR_SHOW_INC_DEC_ARROWS'),
              buildLeaf('Show More Button', 'Show the extra expansion button when available.', '1', ['Tree', 'Text Box'], 'ATTR_SHOW_MORE_BUTTON'),
              buildLeaf('Show Raw', 'Show raw values instead of formatted text when supported.', '0', ['Numeric', 'Color Numeric', 'Graph', 'Digital Graph'], 'ATTR_SHOW_RAW'),
              buildLeaf('Show Transport', 'Display transport buttons or controls where applicable.', '1', ['Graph', 'Strip Chart'], 'ATTR_SHOW_TRANSPORT'),
              buildLeaf('Tabs Visible', 'Show or hide the tabs.', '1', ['Tab'], 'ATTR_TABS_VISIBLE'),
              buildLeaf('Visible Lines', 'Set the number of visible lines.', '8', ['List', 'Table', 'Text Box'], 'ATTR_VISIBLE_LINES'),
              buildLeaf('Show Images', 'Display associated images next to items.', '1', ['Tree', 'List'], 'ATTR_SHOW_IMAGES'),
              buildLeaf('Show Marks', 'Display marks or markers.', '1', ['Graph', 'Digital Graph', 'Strip Chart'], 'ATTR_SHOW_MARKS'),
              buildLeaf('Show Plus Minus', 'Display plus/minus expand glyphs.', '1', ['Tree'], 'ATTR_SHOW_PLUS_MINUS'),
              buildLeaf('Show Ring Arrow', 'Display the ring dropdown arrow.', '1', ['Ring', 'Picture Ring', 'Radio Button'], 'ATTR_SHOW_RING_ARROW') ] },
            { label: 'Size/Position', description: 'Geometry-related attributes for the control.', items: [
              buildLeaf('Top', 'Change the control top position in panel coordinates.', '10', ['All'], 'ATTR_TOP'),
              buildLeaf('Left', 'Change the control left position in panel coordinates.', '10', ['All'], 'ATTR_LEFT'),
              buildLeaf('Width', 'Change the control width.', '120', ['All'], 'ATTR_WIDTH'),
              buildLeaf('Height', 'Change the control height.', '24', ['All'], 'ATTR_HEIGHT'),
              buildLeaf('Digital Display Height', 'Set the height of the digital display region.', '20', ['Numeric', 'Numeric Slide', 'Ring Slide'], 'ATTR_DIGITAL_DISPLAY_HEIGHT'),
              buildLeaf('Digital Display Left', 'Set the left position of the digital display region.', '0', ['Numeric', 'Numeric Slide', 'Ring Slide'], 'ATTR_DIGITAL_DISPLAY_LEFT'),
              buildLeaf('Digital Display Top', 'Set the top position of the digital display region.', '0', ['Numeric', 'Numeric Slide', 'Ring Slide'], 'ATTR_DIGITAL_DISPLAY_TOP'),
              buildLeaf('Digital Display Width', 'Set the width of the digital display region.', '80', ['Numeric', 'Numeric Slide', 'Ring Slide'], 'ATTR_DIGITAL_DISPLAY_WIDTH'),
              buildLeaf('Grid Area Height', 'Set the graph grid area height.', '240', graphControls, 'ATTR_GRID_AREA_HEIGHT'),
              buildLeaf('Grid Area Left', 'Set the graph grid area left coordinate.', '40', graphControls, 'ATTR_GRID_AREA_LEFT'),
              buildLeaf('Grid Area Top', 'Set the graph grid area top coordinate.', '24', graphControls, 'ATTR_GRID_AREA_TOP'),
              buildLeaf('Grid Area Width', 'Set the graph grid area width.', '320', graphControls, 'ATTR_GRID_AREA_WIDTH'),
              buildLeaf('Plot Area Height', 'Set the plot area height.', '220', graphControls, 'ATTR_PLOT_AREA_HEIGHT'),
              buildLeaf('Plot Area Left', 'Set the plot area left coordinate.', '48', graphControls, 'ATTR_PLOT_AREA_LEFT'),
              buildLeaf('Plot Area Top', 'Set the plot area top coordinate.', '28', graphControls, 'ATTR_PLOT_AREA_TOP'),
              buildLeaf('Plot Area Width', 'Set the plot area width.', '300', graphControls, 'ATTR_PLOT_AREA_WIDTH'),
              buildLeaf('Slider Height', 'Set the slider height.', '24', ['Numeric Slide', 'Ring Slide'], 'ATTR_SLIDER_HEIGHT'),
              buildLeaf('Slider Left', 'Set the slider left coordinate.', '10', ['Numeric Slide', 'Ring Slide'], 'ATTR_SLIDER_LEFT'),
              buildLeaf('Slider Top', 'Set the slider top coordinate.', '10', ['Numeric Slide', 'Ring Slide'], 'ATTR_SLIDER_TOP'),
              buildLeaf('Slider Width', 'Set the slider width.', '160', ['Numeric Slide', 'Ring Slide'], 'ATTR_SLIDER_WIDTH') ] },
            { label: 'Text Style', description: 'Generic text styling attributes.', items: [
              buildLeaf('Text Angle', 'Set the text drawing angle.', '0', textControls, 'ATTR_TEXT_ANGLE'),
              buildLeaf('Text Background Color', 'Set the control text background color.', 'VAL_BLACK', textControls, 'ATTR_TEXT_BGCOLOR'),
              buildLeaf('Text Bold', 'Toggle bold text.', '0', textControls, 'ATTR_TEXT_BOLD'),
              buildLeaf('Text Character Set', 'Select the text character set.', 'VAL_ANSI_CHARSET', textControls, 'ATTR_TEXT_CHARSET'),
              buildLeaf('Text Color', 'Set the control text foreground color.', 'VAL_WHITE', textControls, 'ATTR_TEXT_COLOR'),
              buildLeaf('Text Font', 'Select the text font or metafont.', 'VAL_APP_META_FONT', textControls, 'ATTR_TEXT_FONT'),
              buildLeaf('Text Font Name Length', 'Read the required buffer length for the text font name.', '&fontNameLength', textControls, 'ATTR_TEXT_FONT_NAME_LENGTH'),
              buildLeaf('Text Italics', 'Toggle italic text.', '0', textControls, 'ATTR_TEXT_ITALIC'),
              buildLeaf('Text Justification', 'Change the text justification.', 'VAL_LEFT_JUSTIFIED', textControls, 'ATTR_TEXT_JUSTIFY'),
              buildLeaf('Text Point Size', 'Set the text point size.', '12', textControls, 'ATTR_TEXT_POINT_SIZE'),
              buildLeaf('Text Raised', 'Draw the text with a raised effect.', '0', ['Command Button', 'Text Button', 'Text Message'], 'ATTR_TEXT_RAISED'),
              buildLeaf('Text Strikeout', 'Toggle strikeout text.', '0', textControls, 'ATTR_TEXT_STRIKEOUT'),
              buildLeaf('Text Underline', 'Toggle underline text.', '0', textControls, 'ATTR_TEXT_UNDERLINE'),
              buildLeaf('Wrap Mode', 'Choose how text wraps.', 'VAL_WRAP_AT_WORD_BOUNDARY', ['Text Box', 'Text Message', 'String'], 'ATTR_WRAP_MODE'),
              buildLeaf('Mask Character', 'Set the masking character used for password-style controls.', "'*'", ['String'], 'ATTR_MASK_CHARACTER') ] },
            { label: 'Graph / Plot Appearance', description: 'Rendering, plotting, and graph-specific appearance options.', items: [
              buildLeaf('Chart Horizontal Scroll Offset', 'Adjust the horizontal scroll offset used by a chart.', '0', ['Strip Chart', 'Graph'], 'ATTR_CHART_HSCROLL_OFFSET'),
              buildLeaf('Color Ramp Interpolate', 'Enable interpolation in the color ramp.', '1', ['Graph', 'Digital Graph'], 'ATTR_COLOR_RAMP_INTERPOLATE'),
              buildLeaf('Color Ramp Width', 'Set the width of the color ramp.', '24', ['Graph', 'Digital Graph'], 'ATTR_COLOR_RAMP_WIDTH'),
              buildLeaf('Edge Style', 'Set the edge drawing style.', 'VAL_RAISED_EDGE', ['Graph', 'Digital Graph', 'Canvas', 'Command Button', 'Text Button'], 'ATTR_EDGE_STYLE'),
              buildLeaf('Enable Anti-Aliasing', 'Enable anti-aliased drawing when supported.', '1', ['Graph', 'Digital Graph', 'Canvas'], 'ATTR_ENABLE_ANTI_ALIASING'),
              buildLeaf('Enable Character Masking', 'Enable masking rules for overlaid text.', '1', ['Graph', 'Digital Graph', 'Canvas'], 'ATTR_ENABLE_CHARACTER_MASKING'),
              buildLeaf('Expanded Image Index', 'Select the image used when a node is expanded.', '1', ['Tree'], 'ATTR_EXPANDED_IMAGE_INDEX'),
              buildLeaf('Fill Color', 'Set the fill color.', 'VAL_BLUE', ['Canvas', 'Graph', 'Digital Graph', 'Binary Switch'], 'ATTR_FILL_COLOR'),
              buildLeaf('Fill Housing Color', 'Set the fill housing color.', 'VAL_DK_GRAY', ['LED', 'Binary Switch', 'Toggle Button'], 'ATTR_FILL_HOUSING_COLOR'),
              buildLeaf('Fixed Plot Area', 'Keep the plot area fixed when resizing.', '1', graphControls, 'ATTR_FIXED_PLOT_AREA'),
              buildLeaf('Frame Color', 'Set the frame color.', 'VAL_WHITE', ['All'], 'ATTR_FRAME_COLOR'),
              buildLeaf('Frame Thickness', 'Set the frame thickness.', '1', ['All'], 'ATTR_FRAME_THICKNESS'),
              buildLeaf('Graph Background Color', 'Set the graph background color.', 'VAL_BLACK', graphControls, 'ATTR_GRAPH_BGCOLOR'),
              buildLeaf('Grid Color', 'Set the grid color.', 'VAL_DK_GRAY', graphControls, 'ATTR_GRID_COLOR'),
              buildLeaf('Horizontal Grid Color', 'Set the horizontal grid color.', 'VAL_DK_GRAY', graphControls, 'ATTR_HORIZONTAL_GRID_COLOR'),
              buildLeaf('Horizontal Grid Visible', 'Show or hide horizontal grid lines.', '1', graphControls, 'ATTR_HORIZONTAL_GRID_VISIBLE'),
              buildLeaf('Horizontal Scroll Offset', 'Set the horizontal scroll offset.', '0', ['Table', 'Text Box', 'Tree', 'Graph'], 'ATTR_HORIZONTAL_SCROLL_OFFSET'),
              buildLeaf('Horizontal Scroll Offset Max', 'Read or set the maximum horizontal scroll offset.', '100', ['Table', 'Text Box', 'Tree', 'Graph'], 'ATTR_HORIZONTAL_SCROLL_OFFSET_MAX'),
              buildLeaf('Marker End Angle', 'Set the marker end angle.', '360', ['Canvas', 'Graph'], 'ATTR_MARKER_END_ANGLE'),
              buildLeaf('Marker Start Angle', 'Set the marker start angle.', '0', ['Canvas', 'Graph'], 'ATTR_MARKER_START_ANGLE'),
              buildLeaf('Marker Style', 'Set the marker style.', 'VAL_SOLID_SQUARE', ['Graph', 'Digital Graph', 'Canvas'], 'ATTR_MARKER_STYLE'),
              buildLeaf('Plot Background Color', 'Set the plot background color.', 'VAL_BLACK', graphControls, 'ATTR_PLOT_BGCOLOR'),
              buildLeaf('Use Progress Bar Visual Styles', 'Enable visual styles for progress-bar-like controls.', '1', ['Binary Switch', 'Toggle Button', 'Command Button'], 'ATTR_USE_PROGRESS_BAR_VISUAL_STYLES'),
              buildLeaf('Vertical Grid Color', 'Set the vertical grid color.', 'VAL_DK_GRAY', graphControls, 'ATTR_VERTICAL_GRID_COLOR'),
              buildLeaf('Vertical Grid Visible', 'Show or hide vertical grid lines.', '1', graphControls, 'ATTR_VERTICAL_GRID_VISIBLE'),
              buildLeaf('Vertical Scroll Offset', 'Set the vertical scroll offset.', '0', ['Table', 'Text Box', 'Tree', 'Graph'], 'ATTR_VERTICAL_SCROLL_OFFSET'),
              buildLeaf('Vertical Scroll Offset Max', 'Read or set the maximum vertical scroll offset.', '100', ['Table', 'Text Box', 'Tree', 'Graph'], 'ATTR_VERTICAL_SCROLL_OFFSET_MAX') ] },
            { label: 'Table / List / Tree / Ring Details', description: 'Common appearance settings for indexed and item-based controls.', items: [
              buildLeaf('Cell Frame Color', 'Set the frame color for table/list style cells.', 'VAL_WHITE', ['Table', 'List'], 'ATTR_CELL_FRAME_COLOR'),
              buildLeaf('Check Style', 'Change the check mark style for compatible controls.', 'VAL_CHECK', ['Tree', 'List'], 'ATTR_CHECK_STYLE'),
              buildLeaf('Collapsed Image Index', 'Select the image used when a node is collapsed.', '0', ['Tree'], 'ATTR_COLLAPSED_IMAGE_INDEX'),
              buildLeaf('Column Labels Color', 'Set the column label color.', 'VAL_WHITE', ['Table', 'List'], 'ATTR_COLUMN_LABELS_COLOR'),
              buildLeaf('Column Labels Height', 'Set the column label area height.', '18', ['Table', 'List'], 'ATTR_COLUMN_LABELS_HEIGHT'),
              buildLeaf('First Visible Column', 'Control the first visible column.', '0', ['Table', 'List'], 'ATTR_FIRST_VISIBLE_COLUMN'),
              buildLeaf('First Visible Line', 'Control the first visible line.', '0', ['List', 'Text Box'], 'ATTR_FIRST_VISIBLE_LINE'),
              buildLeaf('First Visible Row', 'Control the first visible row.', '0', ['Table', 'Tree'], 'ATTR_FIRST_VISIBLE_ROW'),
              buildLeaf('Hide Active Item', 'Hide the active item highlight.', '0', ['List', 'Tree', 'Ring', 'Picture Ring'], 'ATTR_HIDE_ACTIVE_ITEM'),
              buildLeaf('Hide Active Item Always', 'Always hide the active item highlight.', '0', ['List', 'Tree', 'Ring', 'Picture Ring'], 'ATTR_HIDE_ACTIVE_ITEM_ALWAYS'),
              buildLeaf('Hide Hilite', 'Hide the current highlight.', '0', ['List', 'Tree', 'Table'], 'ATTR_HIDE_HILITE'),
              buildLeaf('Hilite Only When Pane Active', 'Only show highlight when the control pane is active.', '1', ['List', 'Tree', 'Table'], 'ATTR_HILITE_ONLY_WHEN_PANE_ACTIVE'),
              buildLeaf('Inc/Dec Arrow Width', 'Set the width of increment/decrement arrows.', '14', ['Numeric', 'Color Numeric', 'Numeric Slide', 'Ring Slide'], 'ATTR_INC_DEC_ARROW_WIDTH'),
              buildLeaf('Indent Offset', 'Set the indentation offset for hierarchical items.', '16', ['Tree'], 'ATTR_INDENT_OFFSET'),
              buildLeaf('Menu Arrow Color', 'Set the menu-arrow color.', 'VAL_WHITE', ['Ring', 'Picture Ring', 'Radio Button', 'Tab'], 'ATTR_MENU_ARROW_COLOR'),
              buildLeaf('Menu Arrow Height', 'Set the menu-arrow height.', '8', ['Ring', 'Picture Ring', 'Radio Button', 'Tab'], 'ATTR_MENU_ARROW_HEIGHT'),
              buildLeaf('Menu Arrow Width', 'Set the menu-arrow width.', '8', ['Ring', 'Picture Ring', 'Radio Button', 'Tab'], 'ATTR_MENU_ARROW_WIDTH'),
              buildLeaf('Minimum Number of Lines Visible', 'Set the minimum number of visible lines.', '4', ['List', 'Text Box'], 'ATTR_MIN_NUM_LINES_VISIBLE'),
              buildLeaf('Number of Color Ramp Values', 'Set the number of values in the color ramp.', '16', ['Graph', 'Digital Graph'], 'ATTR_NUM_COLOR_RAMP_VALUES'),
              buildLeaf('Number of Divisions', 'Set the number of divisions or ticks.', '10', ['Numeric Slide', 'Ring Slide', 'Graph', 'Digital Graph'], 'ATTR_NUM_DIVISIONS'),
              buildLeaf('Number of Visible Columns', 'Set how many columns are visible.', '4', ['Table', 'List'], 'ATTR_NUM_VISIBLE_COLUMNS'),
              buildLeaf('Number of Visible Rows', 'Set how many rows are visible.', '8', ['Table', 'List', 'Tree'], 'ATTR_NUM_VISIBLE_ROWS'),
              buildLeaf('Off Color', 'Set the off state color.', 'VAL_DK_GRAY', ['Binary Switch', 'Toggle Button', 'LED'], 'ATTR_OFF_COLOR'),
              buildLeaf('Off Text', 'Set the text shown in the off state.', '"OFF"', ['Binary Switch', 'Toggle Button'], 'ATTR_OFF_TEXT'),
              buildLeaf('On Color', 'Set the on state color.', 'VAL_GREEN', ['Binary Switch', 'Toggle Button', 'LED'], 'ATTR_ON_COLOR'),
              buildLeaf('On Text', 'Set the text shown in the on state.', '"ON"', ['Binary Switch', 'Toggle Button'], 'ATTR_ON_TEXT'),
              buildLeaf('Overlapped', 'Allow the control to overlap with neighboring content.', '0', ['Splitter', 'Canvas', 'Picture', 'Picture Button'], 'ATTR_OVERLAPPED'),
              buildLeaf('Picture Background Color', 'Set the background color behind the picture.', 'VAL_BLACK', ['Picture', 'Picture Button', 'Picture Ring'], 'ATTR_PICTURE_BGCOLOR'),
              buildLeaf('Ring Arrow Location', 'Change the ring-arrow location.', 'VAL_RIGHT_SIDE', ['Ring', 'Picture Ring', 'Radio Button'], 'ATTR_RING_ARROW_LOCATION'),
              buildLeaf('Row Labels Color', 'Set the row label color.', 'VAL_WHITE', ['Table'], 'ATTR_ROW_LABELS_COLOR'),
              buildLeaf('Row Labels Width', 'Set the row label width.', '80', ['Table'], 'ATTR_ROW_LABELS_WIDTH'),
              buildLeaf('Scroll Bar Color', 'Set the scroll bar color.', 'VAL_LT_GRAY', ['Table', 'List', 'Text Box', 'Tree'], 'ATTR_SCROLL_BAR_COLOR'),
              buildLeaf('Scroll Bar Size', 'Set the scroll bar size.', '16', ['Table', 'List', 'Text Box', 'Tree'], 'ATTR_SCROLL_BAR_SIZE'),
              buildLeaf('Side Inc/Dec Arrow Length', 'Set the side increment/decrement arrow length.', '16', ['Numeric Slide', 'Ring Slide'], 'ATTR_SIDE_INC_DEC_ARROW_LENGTH'),
              buildLeaf('Slider Color', 'Set the slider color.', 'VAL_BLUE', ['Numeric Slide', 'Ring Slide'], 'ATTR_SLIDER_COLOR'),
              buildLeaf('Span Panel', 'Allow the control to span the panel area.', '0', ['Splitter', 'Canvas', 'Graph', 'Digital Graph'], 'ATTR_SPAN_PANEL'),
              buildLeaf('Table Background Color', 'Set the table background color.', 'VAL_BLACK', ['Table'], 'ATTR_TABLE_BGCOLOR'),
              buildLeaf('Tabs End Offset', 'Set the end offset of the tabs area.', '0', ['Tab'], 'ATTR_TABS_END_OFFSET'),
              buildLeaf('Tabs Mode', 'Set the tab display mode.', 'VAL_TOP_EDGE_TABS', ['Tab'], 'ATTR_TABS_MODE'),
              buildLeaf('Tabs Location', 'Set the tabs location.', 'VAL_TOP', ['Tab'], 'ATTR_TABS_LOCATION'),
              buildLeaf('Tabs Start Offset', 'Set the start offset of the tabs area.', '0', ['Tab'], 'ATTR_TABS_START_OFFSET'),
              buildLeaf('Tick Style', 'Set the tick style.', 'VAL_MAJOR_TICKS', ['Numeric Slide', 'Ring Slide', 'Graph', 'Digital Graph'], 'ATTR_TICK_STYLE'),
              buildLeaf('Tree Background Color', 'Set the tree background color.', 'VAL_BLACK', ['Tree'], 'ATTR_TREE_BGCOLOR'),
              buildLeaf('Unique Ring Items', 'Require ring items to be unique.', '1', ['Ring', 'Picture Ring'], 'ATTR_UNIQUE_RING_ITEMS'),
              buildLeaf('Upper Left Corner Color', 'Set the upper-left corner color.', 'VAL_DK_GRAY', ['Table'], 'ATTR_UPPER_LEFT_CORNER_COLOR') ] }
          ]
        },
        {
          label: 'Control Settings',
          description: 'Behavior, data binding, indexing, and callback-related control attributes.',
          groups: [
            { label: 'General', description: 'Typical runtime behavior settings.', items: [
              buildLeaf('Callback Data', 'Store a callback data pointer or handle.', 'callbackData', ['All'], 'ATTR_CALLBACK_DATA'),
              buildLeaf('Enabled', 'Enable or disable the control.', '1', ['All'], 'ATTR_ENABLED'),
              buildLeaf('Disable Panel Theme', 'Disable themed drawing for this control.', '0', ['All'], 'ATTR_DISABLE_PANEL_THEME'),
              buildLeaf('Command Button Color', 'Choose the main button color used by command-style controls.', 'VAL_DK_GRAY', ['Command Button', 'Text Button', 'Toggle Button'], 'ATTR_COMMAND_BUTTON_COLOR') ] },
            { label: 'DataSocket Settings', description: 'Representative data binding attributes used on data-aware controls.', items: [
              buildLeaf('DataSocket Enabled', 'Enable DataSocket binding.', '1', ['Graph', 'Digital Graph', 'Strip Chart', 'Numeric', 'Color Numeric'], 'ATTR_DATASOCKET_ENABLED'),
              buildLeaf('DataSocket Mode', 'Choose the DataSocket mode.', 'VAL_DS_READ', ['Graph', 'Digital Graph', 'Strip Chart', 'Numeric', 'Color Numeric'], 'ATTR_DATASOCKET_MODE'),
              buildLeaf('DataSocket Source', 'Set the DataSocket source URL.', '"dstp://localhost/item"', ['Graph', 'Digital Graph', 'Strip Chart', 'Numeric', 'Color Numeric'], 'ATTR_DATASOCKET_SOURCE'),
              buildLeaf('DataSocket Source Length', 'Read the required DataSocket source length.', '&sourceLength', ['Graph', 'Digital Graph', 'Strip Chart', 'Numeric', 'Color Numeric'], 'ATTR_DATASOCKET_SOURCE_LENGTH'),
              buildLeaf('Default DataBinding Line Style', 'Default line style for data-bound traces.', 'VAL_THIN_LINE', graphControls, 'ATTR_DEFAULT_DATABINDING_LINE_STYLE'),
              buildLeaf('Default DataBinding Plot Color', 'Default plot color for data-bound traces.', 'VAL_GREEN', graphControls, 'ATTR_DEFAULT_DATABINDING_PLOT_COLOR'),
              buildLeaf('Default DataBinding Plot Style', 'Default plot style for data-bound traces.', 'VAL_THIN_LINE', graphControls, 'ATTR_DEFAULT_DATABINDING_PLOT_STYLE'),
              buildLeaf('Default DataBinding Point Style', 'Default point style for data-bound traces.', 'VAL_SOLID_SQUARE', graphControls, 'ATTR_DEFAULT_DATABINDING_POINT_STYLE') ] },
            { label: 'Format and Precision', description: 'Numeric formatting helpers and precision settings.', items: [
              buildLeaf('Format', 'Set the numeric format.', 'VAL_FLOATING_PT_FORMAT', ['Numeric', 'Color Numeric', 'Numeric Slide'], 'ATTR_FORMAT'),
              buildLeaf('Padding', 'Set numeric padding.', '0', ['Numeric', 'Color Numeric', 'Numeric Slide'], 'ATTR_PADDING'),
              buildLeaf('Precision', 'Set displayed numeric precision.', '3', ['Numeric', 'Color Numeric', 'Numeric Slide'], 'ATTR_PRECISION') ] },
            { label: 'Index', description: 'Attributes related to selected indexes and starting offsets.', items: [
              buildLeaf('Default Index', 'Set the default selected index.', '0', ['Ring', 'Picture Ring', 'List', 'Tab', 'Tree'], 'ATTR_DFLT_INDEX'),
              buildLeaf('Index', 'Set the current index.', '0', ['Ring', 'Picture Ring', 'List', 'Tab', 'Tree'], 'ATTR_INDEX'),
              buildLeaf('Tabs Start Offset', 'Adjust the starting offset of the first visible tab.', '0', ['Tab'], 'ATTR_TABS_START_OFFSET') ] },
            { label: 'Origin and Scaling', description: 'Canvas and graph coordinate system settings.', items: [
              buildLeaf('X Coordinate at Origin', 'Set the X coordinate at the logical origin.', '0.0', ['Canvas', 'Graph', 'Digital Graph'], 'ATTR_XCOORD_AT_ORIGIN'),
              buildLeaf('X Scaling', 'Set the X scaling factor.', '1.0', ['Canvas', 'Graph', 'Digital Graph'], 'ATTR_XSCALING'),
              buildLeaf('Y Coordinate at Origin', 'Set the Y coordinate at the logical origin.', '0.0', ['Canvas', 'Graph', 'Digital Graph'], 'ATTR_YCOORD_AT_ORIGIN'),
              buildLeaf('Y Scaling', 'Set the Y scaling factor.', '1.0', ['Canvas', 'Graph', 'Digital Graph'], 'ATTR_YSCALING') ] },
            { label: 'Pen', description: 'Canvas drawing pen settings.', items: [
              buildLeaf('Pen Color', 'Set the pen color.', 'VAL_WHITE', canvasControls, 'ATTR_PEN_COLOR'),
              buildLeaf('Pen Fill Color', 'Set the pen fill color.', 'VAL_BLUE', canvasControls, 'ATTR_PEN_FILL_COLOR'),
              buildLeaf('Pen Mode', 'Set the pen drawing mode.', 'VAL_COPY_MODE', canvasControls, 'ATTR_PEN_MODE'),
              buildLeaf('Pen Pattern', 'Set the pen pattern.', 'VAL_SOLID', canvasControls, 'ATTR_PEN_PATTERN'),
              buildLeaf('Pen Style', 'Set the pen style.', 'VAL_SOLID', canvasControls, 'ATTR_PEN_STYLE'),
              buildLeaf('Pen Width', 'Set the pen width.', '1', canvasControls, 'ATTR_PEN_WIDTH') ] }
          ]
        },
        {
          label: 'Label Appearance',
          description: 'Visual properties for the control label.',
          groups: [
            { label: 'General', description: 'Frequently used label properties.', items: [
              buildLeaf('Label Text', 'Change the control label text.', '"My Control"', ['All'], 'ATTR_LABEL_TEXT'),
              buildLeaf('Label Color', 'Set the label foreground color.', 'VAL_WHITE', ['All'], 'ATTR_LABEL_COLOR'),
              buildLeaf('Label Background Color', 'Set the label background color.', 'VAL_TRANSPARENT', ['All'], 'ATTR_LABEL_BGCOLOR'),
              buildLeaf('Label Bold', 'Toggle bold label text.', '0', ['All'], 'ATTR_LABEL_BOLD'),
              buildLeaf('Label Justification', 'Change label justification.', 'VAL_LEFT_JUSTIFIED', ['All'], 'ATTR_LABEL_JUSTIFY'),
              buildLeaf('Label Point Size', 'Set label point size.', '12', ['All'], 'ATTR_LABEL_POINT_SIZE') ] }
          ]
        },
        {
          label: 'Legend',
          description: 'Legend settings commonly used with graph-like controls.',
          groups: [
            { label: 'General', description: 'Basic legend visibility and placement.', items: [
              buildLeaf('Legend Visible', 'Show or hide the legend.', '1', graphControls, 'ATTR_LEGEND_VISIBLE'),
              buildLeaf('Legend Position', 'Set the legend placement.', 'VAL_RIGHT', graphControls, 'ATTR_LEGEND_POSITION'),
              buildLeaf('Legend Text Color', 'Set the legend text color.', 'VAL_WHITE', graphControls, 'ATTR_LEGEND_TEXT_COLOR') ] }
          ]
        },
        {
          label: 'Source Code Connection',
          description: 'Attributes related to callbacks and generated code bindings.',
          groups: [
            { label: 'Callbacks', description: 'Hook generated code or callback names.', items: [
              buildLeaf('Callback Function Name', 'Store the callback function name used for generated code helpers.', '"OnControlEvent"', ['All'], 'ATTR_CALLBACK_FUNCTION_NAME'),
              buildLeaf('Callback Data Name', 'Store a symbolic callback data name.', '"callbackData"', ['All'], 'ATTR_CALLBACK_DATA_NAME') ] }
          ]
        }
      ]
    }, getExternalCpmAttributeHelper(name));
  }
  const catalogHelper = getExternalCpmAttributeHelper(name);
  if (catalogHelper) {
    return {
      ...catalogHelper,
      attributeIndex,
      targetIndex: attributeIndex,
      valueIndex,
      defaultTargetIndex: valueIndex,
      applyDefaultIfEmpty: catalogHelper.applyDefaultIfEmpty !== false
    };
  }
  if (name === 'SetPanelAttribute') {
    return {
      title: 'Select Panel Attribute Constant',
      mode: 'panel',
      attributeIndex,
      targetIndex: attributeIndex,
      valueIndex,
      defaultTargetIndex: valueIndex,
      applyDefaultIfEmpty: true,
      selectionLabel: 'Selected attribute',
      controlTypes: ['All'],
      sections: [{ label: 'Panel Appearance', description: 'Common panel-level appearance settings.', groups: [
        { label: 'Size/Position', description: 'Panel geometry and visibility.', items: [
          buildLeaf('Visible', 'Show or hide the panel.', '1', ['All']),
          buildLeaf('Top', 'Set the top coordinate of the panel.', '10', ['All']),
          buildLeaf('Left', 'Set the left coordinate of the panel.', '10', ['All']),
          buildLeaf('Width', 'Set the panel width.', '800', ['All']),
          buildLeaf('Height', 'Set the panel height.', '600', ['All']) ] },
        { label: 'Theme / Style', description: 'Theme and title related settings.', items: [
          buildLeaf('Disable Panel Theme', 'Disable themed drawing for the panel.', '1', ['All']),
          buildLeaf('Title', 'Set the panel title.', '"Main Panel"', ['All']) ] }
      ] }]
    };
  }
  if (name === 'SetCtrlArrayAttribute' || name === 'SetArrayAttribute') {
    return {
      title: 'Select Control Array Attribute Constant',
      mode: 'array',
      attributeIndex,
      targetIndex: attributeIndex,
      valueIndex,
      defaultTargetIndex: valueIndex,
      applyDefaultIfEmpty: true,
      selectionLabel: 'Selected attribute',
      controlTypes: ['All'],
      sections: [{ label: 'Array Settings', description: 'Common control-array attributes.', groups: [
        { label: 'General', description: 'Useful starting points for control arrays.', items: [
          buildLeaf('Visible', 'Show or hide all controls in the array.', '1', ['All']),
          buildLeaf('Dimmed', 'Dim or undim all controls in the array.', '0', ['All']),
          buildLeaf('Control Count', 'Representative placeholder for count-like array attributes.', 'count', ['All']) ] }
      ] }]
    };
  }
  return undefined;
}

function renderNotesWarningsCards(fn: CpmFunction): string {
  const cards: string[] = [];
  const notes = Array.isArray(fn.notes) ? fn.notes.filter(Boolean) : [];
  const warnings = Array.isArray(fn.warnings) ? fn.warnings.filter(Boolean) : [];
  if (notes.length) {
    cards.push(`
  <div class="card">
    <h2>Notes</h2>
    <ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>
  </div>`);
  }
  if (warnings.length) {
    cards.push(`
  <div class="card">
    <h2>Warnings</h2>
    <ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>
  </div>`);
  }
  return cards.join('');
}

function renderFieldDetailsCard(fn: CpmFunction, symbolLabel: string): string {
  const fields = Array.isArray(fn.fields) ? fn.fields : [];
  if (!fields.length) {
    return `
  <div class="card">
    <h2>${escapeHtml(symbolLabel === 'Class' ? 'Members' : 'Fields')}</h2>
    <p>No fields imported yet.</p>
  </div>`;
  }
  return `
  <div class="card">
    <h2>${escapeHtml(symbolLabel === 'Class' ? 'Members' : 'Fields')}</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Type</th>
          <th>Name</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${fields.map((field, index) => `<tr><td>${index + 1}</td><td><code>${escapeHtml(field.type || '')}</code></td><td><strong>${escapeHtml(field.name || '')}</strong></td><td>${escapeHtml(field.description || '')}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}


function renderMethodDetailsCard(fn: CpmFunction): string {
  const methods = Array.isArray(fn.methods) ? fn.methods : [];
  if (!methods.length) {
    return `
  <div class="card">
    <h2>Methods</h2>
    <p>No methods imported yet.</p>
  </div>`;
  }
  return `
  <div class="card">
    <h2>Methods</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Access</th>
          <th>Kind</th>
          <th>Name</th>
          <th>Return type</th>
          <th>Qualifiers</th>
        </tr>
      </thead>
      <tbody>
        ${methods.map((method, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(method.access || '')}</td><td>${escapeHtml(method.methodKind || 'method')}</td><td><strong>${escapeHtml(method.name || '')}</strong></td><td><code>${escapeHtml(method.returnType || '')}</code></td><td>${escapeHtml(Array.isArray(method.qualifiers) ? method.qualifiers.join(' ') : '')}</td></tr><tr><td></td><td colspan="5"><code>${escapeHtml(method.signature || '')}</code></td></tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderEnumDetailsCard(fn: CpmFunction): string {
  const values = Array.isArray(fn.enumValues) ? fn.enumValues : [];
  if (!values.length) {
    return `
  <div class="card">
    <h2>Enum values</h2>
    <p>No enum values imported yet.</p>
  </div>`;
  }
  return `
  <div class="card">
    <h2>Enum values</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Value</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${values.map((item, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(item.name || '')}</strong></td><td><code>${escapeHtml(item.value || '')}</code></td><td>${escapeHtml(item.description || '')}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function getGlobalSymbolKind(fn: CpmFunction): string {
  const raw = String(fn?.symbolKind || '').trim();
  if (raw) return raw;
  const category = String(fn?.category || '').trim().toLowerCase();
  const returnType = String(fn?.returnType || '').trim().toLowerCase();
  if (returnType === 'keyword' || category === 'keywords') return 'keyword';
  if (returnType === 'snippet' || category === 'snippets') return 'snippet';
  if (category === 'structs') return 'struct';
  if (category === 'typedefs') return 'typedef';
  if (category === 'enums') return 'enum';
  if (category === 'enum classes') return 'enum_class';
  if (category === 'classes') return 'class';
  return 'function';
}

function getGlobalSymbolKindLabel(kind: string): string {
  switch (kind) {
    case 'struct': return 'Struct';
    case 'typedef': return 'Typedef';
    case 'enum': return 'Enum';
    case 'enum_class': return 'Enum class';
    case 'class': return 'Class';
    case 'table': return 'Table';
    case 'property': return 'Property';
    case 'variable': return 'Variable';
    case 'reference': return 'Reference';
    case 'method': return 'Method';
    case 'operator': return 'Operator';
    case 'constant': return 'Constant';
    case 'metamethod': return 'Metamethod';
    case 'pitfall': return 'Pitfall';
    case 'macro': return 'Macro';
    case 'command': return 'Command';
    case 'concept': return 'Concept';
    case 'attribute': return 'Attribute';
    case 'keyword': return 'Keyword';
    case 'snippet': return 'Snippet';
    default: return 'Function';
  }
}

function isCallableSymbolKind(kind: string): boolean {
  return kind === 'function' || kind === 'method' || kind === 'metamethod' || kind === 'macro' || kind === 'command';
}

function getSymbolKind(fn: CpmFunction): string {
  return getGlobalSymbolKind(fn);
}

function getSymbolKindLabel(kind: string): string {
  return getGlobalSymbolKindLabel(kind);
}

function buildNonFunctionDetailsHtml(fn: CpmFunction): string {
  const symbolKind = getGlobalSymbolKind(fn);
  const symbolLabel = getGlobalSymbolKindLabel(symbolKind);
  const declaration = fn.declaration || fn.signature || fn.insertText || fn.name;
  const insertText = fn.insertText || fn.declaration || fn.signature || fn.name;
  const notesWarnings = renderNotesWarningsCards(fn);
  const longDescription = fn.longDescription && fn.longDescription !== fn.description
    ? `<div class="card"><h2>Details</h2><p>${escapeHtml(fn.longDescription)}</p></div>`
    : '';
  const fieldsCard = (symbolKind === 'struct' || symbolKind === 'class' || symbolKind === 'table') ? renderFieldDetailsCard(fn, symbolLabel) : '';
  const enumCard = (symbolKind === 'enum' || symbolKind === 'enum_class') ? renderEnumDetailsCard(fn) : '';
  const methodsCard = (symbolKind === 'class' || symbolKind === 'table') ? renderMethodDetailsCard(fn) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); }
    .meta { opacity: 0.8; margin-bottom: 12px; }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 14px; margin-bottom: 16px; }
    code, pre, textarea, input { font-family: var(--vscode-editor-font-family); }
    pre, textarea { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 6px; overflow-x: auto; }
    textarea { width: 100%; box-sizing: border-box; min-height: 84px; color: var(--vscode-editor-foreground); border: 1px solid var(--vscode-input-border, transparent); resize: vertical; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 8px 12px;
      cursor: pointer;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .btn-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; border-bottom: 1px solid var(--vscode-panel-border); padding: 8px 6px; vertical-align: top; }
    h1, h2 { margin-top: 0; }
    ul { margin: 0; padding-left: 20px; }
    .hint { opacity: 0.8; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(fn.name)}</h1>
    <div class="meta">${escapeHtml(fn.library)} → ${escapeHtml(fn.category)} → ${escapeHtml(symbolLabel)}</div>
    <pre>${escapeHtml(declaration)}</pre>
    <p>${escapeHtml(fn.description ?? 'No description yet.')}</p>
    <p><strong>Header:</strong> <code>${escapeHtml(fn.header ?? 'unknown')}</code></p>
  </div>

  ${longDescription}
  ${fieldsCard}
  ${methodsCard}
  ${enumCard}
  ${notesWarnings}

  <div class="card">
    <h2>Insert / copy</h2>
    <textarea id="preview" readonly>${escapeHtml(insertText)}</textarea>
    <div class="btn-row">
      <button id="insertBtn">Insert symbol</button>
      <button id="copyBtn" class="secondary">Copy symbol</button>
    </div>
    <div class="hint">The symbol inserts its declaration or custom insert text.</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const preview = document.getElementById('preview');
    const insertBtn = document.getElementById('insertBtn');
    const copyBtn = document.getElementById('copyBtn');

    insertBtn?.addEventListener('click', () => {
      vscode.postMessage({ type: 'insertCall', text: String(preview.value || '') });
    });

    copyBtn?.addEventListener('click', async () => {
      const text = String(preview.value || '');
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard API may be unavailable in the webview host.
      }
      vscode.postMessage({ type: 'copyCall', text });
    });
  </script>
</body>
</html>`;
}

function buildDetailsHtml(fn: CpmFunction, storedState?: StoredFunctionState): string {
  const symbolKind = getGlobalSymbolKind(fn);
  const isParameterizedTemplate = hasParameterizedInsertTemplate(fn);
  if (!isCallableSymbolKind(symbolKind) && !isParameterizedTemplate) {
    return buildNonFunctionDetailsHtml(fn);
  }
  const resolvedParams = (fn.parameters ?? []).map(resolveParameter);
  const cviAttributeHelper = getCpmAttributeHelperConfig(fn);
  const defaults = extractDefaultArguments(fn);
  const initialValues = resolvedParams.map((param, index) => {
    const saved = storedState?.values?.[index];
    if (saved !== undefined && saved !== null && String(saved).length > 0) {
      return String(saved);
    }
    return defaults[index] ?? param.defaultValue;
  });
  const editableRows = resolvedParams.map((param, index) => renderParamRow(param, initialValues[index], cviAttributeHelper)).join('');

  const initialPreview = buildCallText(fn, initialValues, storedState?.returnTarget ?? '');
  const callableTemplate = isParameterizedTemplate && isCallableSymbolKind(symbolKind) && isSimpleCallableTemplateText(fn.insertText);
  const showReturnEditor = hasReturnValue(fn) && (!isParameterizedTemplate || callableTemplate);
  const showReturnMetadata = hasReturnValue(fn) && !showReturnEditor;
  const returnEditorHtml = showReturnEditor
    ? `
    <div class="card">
      <h2>Return value</h2>
      <table>
        <thead>
          <tr>
            <th>Return type</th>
            <th>Variable / target</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>${escapeHtml(fn.returnType)}</code></td>
            <td><input id="returnTarget" type="text" value="${escapeHtml(storedState?.returnTarget ?? '')}" placeholder="resultVar" spellcheck="false" /></td>
            <td>${escapeHtml(defaultReturnDescription(fn))}</td>
          </tr>
        </tbody>
      </table>
      <div class="hint">Leave the variable field empty to generate only the function call.</div>
    </div>`
    : showReturnMetadata
    ? `
    <div class="card">
      <h2>Return value</h2>
      <p><code>${escapeHtml(fn.returnType)}</code></p>
      <div class="hint">${escapeHtml(defaultReturnDescription(fn))}</div>
      <div class="hint">Assignment is disabled because the inserted text is a declaration or a constant selector rather than a direct function call.</div>
    </div>`
    : `
    <div class="card">
      <h2>Return value</h2>
      <p><code>void</code></p>
      <div class="hint">This function does not return a value, so assignment is disabled.</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); }
    .meta { opacity: 0.8; margin-bottom: 12px; }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 14px; margin-bottom: 16px; }
    code, pre, textarea, input, select { font-family: var(--vscode-editor-font-family); }
    pre, textarea { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 6px; overflow-x: auto; }
    textarea { width: 100%; box-sizing: border-box; min-height: 84px; color: var(--vscode-editor-foreground); border: 1px solid var(--vscode-input-border, transparent); resize: vertical; }
    input, select {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      padding: 6px 8px;
      border-radius: 4px;
    }
    .btn-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 8px 12px;
      cursor: pointer;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .mini { padding: 3px 8px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; border-bottom: 1px solid var(--vscode-panel-border); padding: 8px 6px; vertical-align: top; }
    h1, h2, h3 { margin-top: 0; }
    .hint { opacity: 0.8; margin-top: 8px; }
    .param-kind {
      margin-top: 4px;
      display: inline-block;
      padding: 2px 6px;
      border-radius: 999px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 11px;
    }
    .editor-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .choice-hint { margin-top: 6px; opacity: 0.82; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(fn.name)}</h1>
    <div class="meta">${escapeHtml(fn.library)} → ${escapeHtml(fn.category)}</div>
    <pre>${escapeHtml(fn.signature)}</pre>
    <p>${escapeHtml(fn.description ?? 'No description yet.')}</p>
    <p><strong>Header:</strong> <code>${escapeHtml(fn.header ?? 'unknown')}</code></p>
  </div>

  ${returnEditorHtml}

  <div class="card">
    <h2>Parameters</h2>
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Name</th>
          <th>Description</th>
          <th>Value to insert</th>
        </tr>
      </thead>
      <tbody>${editableRows || '<tr><td colspan="4">No parameter metadata yet.</td></tr>'}</tbody>
    </table>
  </div>

  <div class="card">
    <h2>Preview before insertion</h2>
    <textarea id="preview" readonly>${escapeHtml(initialPreview)}</textarea>
    <div class="btn-row">
      <button id="insertBtn">Insert call</button>
      <button id="copyBtn" class="secondary">Copy call</button>
      <button id="resetBtn" class="secondary">Reset values</button>
    </div>
    <div class="hint">Use presets, the ... picker, or direct editing. The preview stays synchronized with your form values.</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const fnName = ${JSON.stringify(fn.name)};
    const parameterizedTemplate = ${JSON.stringify(hasParameterizedInsertTemplate(fn) ? fn.insertText : '')};
    const parameterizedTemplateCallable = ${JSON.stringify(callableTemplate)};
    const normalizeCommandWhitespace = ${JSON.stringify(usesCmdBatchStatementStyle(fn) || usesGitCommandStyle(fn))};
    const defaults = ${JSON.stringify(initialValues)};
    const paramMeta = ${JSON.stringify(resolvedParams)};
    const cviAttributeHelper = ${JSON.stringify(cviAttributeHelper ?? null)};
    const returnsValue = ${JSON.stringify(showReturnEditor)};
    const preview = document.getElementById('preview');
    const returnTargetInput = document.getElementById('returnTarget');
    const insertBtn = document.getElementById('insertBtn');
    const copyBtn = document.getElementById('copyBtn');
    const resetBtn = document.getElementById('resetBtn');

    function getInput(index) {
      return document.querySelector('.param-input[data-index="' + index + '"]');
    }

    function getValues() {
      return paramMeta.map((meta, index) => {
        const input = getInput(index);
        if (!input) {
          return defaults[index] || '';
        }
        return String(input.value || '');
      });
    }

    function resolveParameterizedInsertValue(meta, rawValue) {
      const value = String(rawValue ?? '');
      const map = meta && typeof meta.insertValueMap === 'object' && meta.insertValueMap !== null
        ? meta.insertValueMap
        : undefined;
      if (map && Object.prototype.hasOwnProperty.call(map, value)) {
        return String(map[value] ?? '');
      }
      return value;
    }

    function expandParameterizedTemplate(template, values) {
      let output = String(template || '');
      const replacements = paramMeta.map((meta, index) => resolveParameterizedInsertValue(meta, values[index] || ''));
      const maxPasses = Math.max(2, Math.min(12, paramMeta.length + 2));
      for (let pass = 0; pass < maxPasses; pass += 1) {
        const before = output;
        paramMeta.forEach((meta, index) => {
          const pattern = new RegExp('\\{\\{' + String(meta.name || '') + '\\}\\}', 'g');
          output = output.replace(pattern, replacements[index]);
        });
        if (output === before) break;
      }
      return output;
    }

    function buildPreviewText() {
      const values = getValues().map((value, index) => {
        const trimmed = value.trim();
        return parameterizedTemplate ? trimmed : (trimmed.length > 0 ? trimmed : (defaults[index] || ''));
      });
      if (parameterizedTemplate) {
        let output = expandParameterizedTemplate(parameterizedTemplate, values);
        if (!parameterizedTemplateCallable) {
          if (normalizeCommandWhitespace) {
            let normalized = '';
            let inQuotes = false;
            let pendingSpace = false;
            const input = String(output || '').trim();
            for (let i = 0; i < input.length; i += 1) {
              const ch = input[i];
              if (ch === '"') {
                if (pendingSpace && normalized && !normalized.endsWith(' ')) normalized += ' ';
                pendingSpace = false;
                normalized += ch;
                inQuotes = !inQuotes;
                continue;
              }
              if (!inQuotes && /\\s/.test(ch)) {
                pendingSpace = normalized.length > 0;
                continue;
              }
              if (pendingSpace && normalized && !normalized.endsWith(' ')) normalized += ' ';
              pendingSpace = false;
              normalized += ch;
            }
            output = normalized.trim();
          }
          return output;
        }
        output = String(output || '').trim();
        if (output && !/[;}]$/.test(output)) {
          output += ';';
        }
        if (returnsValue && returnTargetInput) {
          const returnTarget = returnTargetInput.value.trim();
          if (returnTarget.length > 0) {
            return returnTarget + ' = ' + output;
          }
        }
        return output;
      }
      const baseCall = values.length === 0
        ? (fnName + '()')
        : (fnName + '(' + values.join(', ') + ')');

      if (returnsValue && returnTargetInput) {
        const returnTarget = returnTargetInput.value.trim();
        if (returnTarget.length > 0) {
          return returnTarget + ' = ' + baseCall + ';';
        }
      }
      return baseCall + ';';
    }

    function persistState() {
      vscode.postMessage({
        type: 'persistState',
        state: {
          values: getValues(),
          returnTarget: returnTargetInput ? String(returnTargetInput.value || '') : ''
        }
      });
    }

    function updatePreview() {
      const text = buildPreviewText();
      preview.value = text;
      persistState();
      return text;
    }

    function setFieldValue(index, value) {
      const input = getInput(index);
      if (!input) {
        return;
      }
      const normalizedValue = String(value ?? '');
      if (input.tagName === 'SELECT') {
        const select = input;
        const hasOption = Array.from(select.options || []).some((option) => String(option.value) === normalizedValue);
        if (!hasOption && normalizedValue.length > 0) {
          const option = document.createElement('option');
          option.value = normalizedValue;
          option.textContent = normalizedValue;
          option.setAttribute('data-generated-multiselect', 'true');
          select.appendChild(option);
        }
      }
      input.value = normalizedValue;
      updatePreview();
    }

    document.querySelectorAll('.param-input').forEach((input) => {
      input.addEventListener('input', updatePreview);
      input.addEventListener('change', updatePreview);
    });

    document.querySelectorAll('.preset-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.getAttribute('data-index'));
        const value = String(button.getAttribute('data-value') || '');
        setFieldValue(index, value);
      });
    });

    document.querySelectorAll('.picker-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.getAttribute('data-index'));
        const meta = paramMeta[index];
        if (!meta) {
          return;
        }
        vscode.postMessage({
          type: 'pickValue',
          index,
          editorType: meta.editorType,
          currentValue: getValues()[index] || '',
          values: getValues()
        });
      });
    });

    if (returnTargetInput) {
      returnTargetInput.addEventListener('input', updatePreview);
      returnTargetInput.addEventListener('change', updatePreview);
    }

    insertBtn?.addEventListener('click', () => {
      vscode.postMessage({ type: 'insertCall', text: updatePreview() });
    });

    copyBtn?.addEventListener('click', async () => {
      const text = updatePreview();
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard API may be unavailable in the webview host.
      }
      vscode.postMessage({ type: 'copyCall', text });
    });

    resetBtn?.addEventListener('click', () => {
      paramMeta.forEach((meta, index) => {
        const input = getInput(index);
        if (input) {
          input.value = defaults[index] || '';
        }
      });
      if (returnTargetInput) {
        returnTargetInput.value = '';
      }
      updatePreview();
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || message.type !== 'setFieldValue') {
        return;
      }
      setFieldValue(Number(message.index), String(message.value || ''));
    });

    updatePreview();
  </script>
</body>
</html>`;
}


function buildCpmAttributeHelperHtml(fn: CpmFunction, config: any, currentValues?: string[]): string {
  const normalizedConfig = normalizeStructuredPickerConfig(config, `Select value for ${fn?.name || 'parameter'}`);
  if (!normalizedConfig) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 20px; font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 16px; }
  </style>
</head>
<body><div class="card"><h2>${escapeHtml(config?.title || 'Selection window')}</h2><p>No picker items are configured for this parameter yet.</p></div></body>
</html>`;
  }
  const sections = Array.isArray(normalizedConfig.sections) ? normalizedConfig.sections : [];
  const flatItems = sections.flatMap((section: any, sectionIndex: number) =>
    (Array.isArray(section?.groups) ? section.groups : []).flatMap((group: any, groupIndex: number) =>
      (Array.isArray(group?.items) ? group.items : []).map((item: any, itemIndex: number) => ({
        ...item,
        sectionLabel: String(section?.label || `Section ${sectionIndex + 1}`),
        groupLabel: String(group?.label || `Group ${groupIndex + 1}`),
        id: `${sectionIndex}:${groupIndex}:${itemIndex}`
      }))
    )
  );
  const targetIndex = typeof normalizedConfig?.targetIndex === 'number' ? normalizedConfig.targetIndex : -1;
  const selectedValue = typeof currentValues?.[targetIndex] === 'string'
    ? String(currentValues[targetIndex] || '').trim()
    : '';
  const multiSelect = normalizedConfig?.multiSelect === true;
  const valueSeparator = typeof normalizedConfig?.valueSeparator === 'string' && normalizedConfig.valueSeparator.length > 0 ? normalizedConfig.valueSeparator : ' | ';
  const emptyValue = typeof normalizedConfig?.emptyValue === 'string' ? normalizedConfig.emptyValue : '';
  const allowEmptySelection = normalizedConfig?.allowEmptySelection === true;
  const splitSelectedValues = (value: string): string[] => {
    const text = String(value || '').trim();
    if (!text || (emptyValue && text === emptyValue)) return [];
    if (!multiSelect) return [text];
    if (valueSeparator.trim() === '|') return text.split(/\s*\|\s*/).map((entry) => entry.trim()).filter(Boolean);
    return text.split(valueSeparator).map((entry) => entry.trim()).filter(Boolean);
  };
  const initialSelectedValues = splitSelectedValues(selectedValue);
  const initialSelectedIds = flatItems
    .filter((item: any) => initialSelectedValues.includes(String(item.value || item.constant || '').trim()))
    .map((item: any) => item.id);
  const initialSelectedId = initialSelectedIds[0] ?? (flatItems[0]?.id ?? '');
  const visibleSourceTypes = (Array.isArray(normalizedConfig.sourceTypes) ? normalizedConfig.sourceTypes : []).filter((entry: string) => String(entry || '').trim() && String(entry || '').trim() !== 'All');
  const showSourceTypes = visibleSourceTypes.length > 0;
  const selectionLabel = String(normalizedConfig.selectionLabel || 'Selected value').trim() || 'Selected value';
  const subtitle = String(normalizedConfig.subtitle || '').trim() || `${fn.name} · choose a value, then apply it back into the details form.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    html, body {
      height: 100%;
      overflow: hidden;
    }
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }
    .shell {
      --source-sidebar-width: 220px;
      --source-sidebar-min-width: 160px;
      --source-sidebar-max-width: min(520px, 46vw);
      --source-resizer-width: 8px;
      display: grid;
      grid-template-columns: minmax(var(--source-sidebar-min-width), var(--source-sidebar-width)) var(--source-resizer-width) minmax(0, 1fr);
      height: 100vh;
      min-height: 100vh;
      overflow: hidden;
    }
    .shell.no-sidebar {
      grid-template-columns: minmax(0, 1fr);
    }
    .sidebar {
      border-right: 1px solid var(--vscode-panel-border);
      padding: 14px;
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
    }
    .source-resizer {
      position: relative;
      cursor: col-resize;
      user-select: none;
      background: transparent;
    }
    .source-resizer::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: calc(50% - 1px);
      width: 2px;
      background: transparent;
      transition: background 120ms ease;
    }
    .source-resizer:hover::before,
    .source-resizer.dragging::before {
      background: var(--vscode-focusBorder, var(--vscode-button-background));
      opacity: 0.7;
    }
    .shell.no-sidebar .sidebar,
    .shell.no-sidebar .source-resizer {
      display: none;
    }
    .sidebar h3, .main h3, .main h2 {
      margin-top: 0;
    }
    .type-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding-right: 4px;
    }
    .type-btn, .item-btn, .secondary-btn, .primary-btn {
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 6px;
      cursor: pointer;
      font: inherit;
    }
    .type-btn {
      text-align: left;
      padding: 8px 10px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .type-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .main {
      padding: 16px;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      gap: 12px;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(220px, 360px) auto;
      gap: 12px;
      align-items: center;
    }
    input[type="search"] {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 6px;
      padding: 8px 10px;
      font: inherit;
    }
    .summary {
      opacity: 0.82;
    }
    .tree {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      overflow: auto;
      padding: 10px 12px;
      min-height: 0;
      height: 100%;
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    }
    details {
      border-bottom: 1px solid var(--vscode-panel-border);
      padding: 4px 0 10px;
    }
    details:last-child {
      border-bottom: none;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
      padding: 4px 0;
    }
    .group {
      margin: 8px 0 0 16px;
      border-left: 2px solid var(--vscode-panel-border);
      padding-left: 12px;
    }
    .group-title {
      font-weight: 600;
      margin: 10px 0 8px;
    }
    .group-desc, .section-desc {
      opacity: 0.78;
      margin: 4px 0 8px;
    }
    .item-list {
      display: grid;
      gap: 6px;
    }
    .item-btn {
      width: 100%;
      text-align: left;
      padding: 8px 10px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-foreground);
    }
    .item-btn.selected {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .item-btn.focused {
      outline: 1px solid var(--vscode-focusBorder, var(--vscode-button-background));
      outline-offset: 1px;
    }
    .flag-check {
      display: inline-block;
      width: 1.5em;
      margin-right: 4px;
      font-weight: 700;
    }
    .item-btn small {
      display: block;
      opacity: 0.8;
      margin-top: 2px;
    }
    .details-card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      padding: 14px;
      display: grid;
      gap: 8px;
      background: var(--vscode-editor-background);
    }
    .bottom-panel {
      display: grid;
      gap: 12px;
      min-height: 0;
    }
    .constant {
      font-family: var(--vscode-editor-font-family);
      padding: 6px 8px;
      border-radius: 6px;
      background: var(--vscode-textCodeBlock-background);
      display: inline-block;
    }
    .footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .secondary-btn, .primary-btn {
      padding: 8px 14px;
    }
    .secondary-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .primary-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
  </style>
</head>
<body>
  <div class="shell${showSourceTypes ? '' : ' no-sidebar'}" id="shellRoot">
    <aside class="sidebar" id="sourceSidebar">
      <h3>Source type</h3>
      <div class="type-list" id="typeList"></div>
    </aside>
    <div class="source-resizer" id="sourceResizer" title="Resize source type column"></div>
    <main class="main">
      <div>
        <h2 style="margin-bottom:4px;">${escapeHtml(normalizedConfig.title || 'Selection window')}</h2>
        <div class="summary">${escapeHtml(subtitle)}</div>
      </div>
      <div class="toolbar">
        <input id="filterInput" type="search" placeholder="Filter by label, value, or description" spellcheck="false" />
        <div class="summary" id="matchCount"></div>
      </div>
      <div class="tree" id="treeRoot"></div>
      <div class="bottom-panel">
        <div class="details-card">
          <div><strong>${escapeHtml(selectionLabel)}</strong></div>
          <div class="constant" id="selectedConstant">No selection</div>
          <div id="selectedDescription">Choose an item from the list to inspect its description and suggested default value.</div>
          <div class="summary" id="selectedMeta"></div>
        </div>
        <div class="footer">
          <button class="secondary-btn" id="clearBtn" type="button"${multiSelect ? '' : ' style="display:none"'}>Clear selection</button>
          <button class="secondary-btn" id="cancelBtn" type="button">Cancel</button>
          <button class="primary-btn" id="applyBtn" type="button">Apply</button>
        </div>
      </div>
    </main>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const config = ${JSON.stringify(normalizedConfig)};
    const allItems = ${JSON.stringify(flatItems)};
    const showSourceTypes = ${JSON.stringify(showSourceTypes)};
    const persistedState = vscode.getState && typeof vscode.getState === 'function' ? (vscode.getState() || {}) : {};
    const state = {
      sourceType: 'All',
      filter: '',
      selectedId: ${JSON.stringify(initialSelectedId)},
      selectedIds: ${JSON.stringify(initialSelectedIds)},
      multiSelect: ${JSON.stringify(multiSelect)},
      valueSeparator: ${JSON.stringify(valueSeparator)},
      emptyValue: ${JSON.stringify(emptyValue)},
      allowEmptySelection: ${JSON.stringify(allowEmptySelection)},
      sourceSidebarWidth: typeof persistedState.sourceSidebarWidth === 'number' ? persistedState.sourceSidebarWidth : 220
    };
    const shellRoot = document.getElementById('shellRoot');
    const sourceSidebar = document.getElementById('sourceSidebar');
    const sourceResizer = document.getElementById('sourceResizer');
    const filterInput = document.getElementById('filterInput');
    const treeRoot = document.getElementById('treeRoot');
    const typeList = document.getElementById('typeList');
    const selectedConstant = document.getElementById('selectedConstant');
    const selectedDescription = document.getElementById('selectedDescription');
    const selectedMeta = document.getElementById('selectedMeta');
    const matchCount = document.getElementById('matchCount');
    const applyBtn = document.getElementById('applyBtn');
    const clearBtn = document.getElementById('clearBtn');
    const cancelBtn = document.getElementById('cancelBtn');


    function persistUiState() {
      if (vscode.setState && typeof vscode.setState === 'function') {
        vscode.setState({ sourceSidebarWidth: state.sourceSidebarWidth });
      }
    }

    function clampSourceSidebarWidth(width) {
      const numericWidth = Number(width) || 220;
      const minWidth = 160;
      const maxWidth = Math.min(520, Math.max(minWidth, Math.floor(window.innerWidth * 0.46)));
      return Math.max(minWidth, Math.min(maxWidth, Math.round(numericWidth)));
    }

    function applySourceSidebarWidth(width, shouldPersist) {
      if (!showSourceTypes || !(shellRoot instanceof HTMLElement)) {
        return;
      }
      const nextWidth = clampSourceSidebarWidth(width);
      state.sourceSidebarWidth = nextWidth;
      shellRoot.style.setProperty('--source-sidebar-width', String(nextWidth) + 'px');
      shellRoot.style.setProperty('--source-sidebar-max-width', Math.max(nextWidth, clampSourceSidebarWidth(window.innerWidth * 0.46)) + 'px');
      if (shouldPersist) {
        persistUiState();
      }
    }

    function bindSourceResizer() {
      if (!showSourceTypes || !(sourceResizer instanceof HTMLElement) || !(shellRoot instanceof HTMLElement) || !(sourceSidebar instanceof HTMLElement)) {
        return;
      }
      applySourceSidebarWidth(state.sourceSidebarWidth, false);
      let dragState = null;
      sourceResizer.addEventListener('pointerdown', (event) => {
        dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: sourceSidebar.getBoundingClientRect().width
        };
        sourceResizer.classList.add('dragging');
        sourceResizer.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      sourceResizer.addEventListener('pointermove', (event) => {
        if (!dragState || event.pointerId !== dragState.pointerId) {
          return;
        }
        const delta = event.clientX - dragState.startX;
        applySourceSidebarWidth(dragState.startWidth + delta, false);
      });
      const stopDrag = (event) => {
        if (!dragState || (event && event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) {
          return;
        }
        const finalWidth = state.sourceSidebarWidth;
        dragState = null;
        sourceResizer.classList.remove('dragging');
        if (event && event.pointerId !== undefined && sourceResizer.hasPointerCapture && sourceResizer.hasPointerCapture(event.pointerId)) {
          sourceResizer.releasePointerCapture(event.pointerId);
        }
        persistUiState();
        applySourceSidebarWidth(finalWidth, false);
      };
      sourceResizer.addEventListener('pointerup', stopDrag);
      sourceResizer.addEventListener('pointercancel', stopDrag);
      window.addEventListener('resize', () => applySourceSidebarWidth(state.sourceSidebarWidth, false));
    }

    function matchesSourceType(item) {
      if (!showSourceTypes) {
        return true;
      }
      const allowed = Array.isArray(item.sourceTypes) ? item.sourceTypes : ['All'];
      return state.sourceType === 'All' || allowed.includes('All') || allowed.includes(state.sourceType);
    }

    function matchesFilter(item) {
      const needle = String(state.filter || '').trim().toLowerCase();
      if (!needle) {
        return true;
      }
      return [item.label, item.value, item.constant, item.description, item.detail, item.sectionLabel, item.groupLabel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    }

    function getVisibleItems() {
      return allItems.filter((item) => matchesSourceType(item) && matchesFilter(item));
    }

    function ensureSelection(visibleItems) {
      if (!visibleItems.length) {
        state.selectedId = '';
        return;
      }
      if (!visibleItems.some((item) => item.id === state.selectedId)) {
        state.selectedId = visibleItems[0].id;
      }
    }

    function renderTypeList() {
      if (!showSourceTypes) {
        typeList.innerHTML = '';
        return;
      }
      const types = Array.isArray(config.sourceTypes) && config.sourceTypes.length ? config.sourceTypes : ['All'];
      typeList.innerHTML = types.map((type) => {
        const active = type === state.sourceType ? ' active' : '';
        return '<button type="button" class="type-btn' + active + '" data-type="' + type + '" title="' + type + '">' + type + '</button>';
      }).join('');
      typeList.querySelectorAll('.type-btn').forEach((button) => {
        button.addEventListener('click', () => {
          state.sourceType = String(button.getAttribute('data-type') || 'All');
          render();
        });
      });
    }

    function getScrollContainer(element) {
      let current = element && element.parentElement ? element.parentElement : null;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
          return current;
        }
        current = current.parentElement;
      }
      return treeRoot;
    }

    function scrollItemIntoViewIfNeeded(element) {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      const container = getScrollContainer(element);
      if (!(container instanceof HTMLElement)) {
        return;
      }
      const margin = 10;
      const itemRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      if (itemRect.top < containerRect.top + margin) {
        container.scrollTop += itemRect.top - containerRect.top - margin;
      } else if (itemRect.bottom > containerRect.bottom - margin) {
        container.scrollTop += itemRect.bottom - containerRect.bottom + margin;
      }
    }

    function renderTree() {
      const visibleIds = new Set(getVisibleItems().map((item) => item.id));
      const sections = Array.isArray(config.sections) ? config.sections : [];
      let renderedCount = 0;
      treeRoot.innerHTML = sections.map((section, sectionIndex) => {
        const groups = (Array.isArray(section.groups) ? section.groups : []).map((group, groupIndex) => {
          const items = (Array.isArray(group.items) ? group.items : []).map((item, itemIndex) => {
            const flatId = String(sectionIndex) + ':' + String(groupIndex) + ':' + String(itemIndex);
            const flatItem = allItems.find((entry) => entry.id === flatId);
            if (!flatItem || !visibleIds.has(flatId)) {
              return '';
            }
            renderedCount += 1;
            const selected = state.multiSelect ? (state.selectedIds.includes(flatId) ? ' selected' : '') : (state.selectedId === flatId ? ' selected' : '');
            const focused = state.selectedId === flatId ? ' focused' : '';
            const check = state.multiSelect ? '<span class="flag-check">' + (state.selectedIds.includes(flatId) ? '☑' : '☐') + '</span>' : '';
            const detail = item.description ? '<small>' + item.description + '</small>' : '';
            const label = item.label && item.label !== item.value ? '<small>' + item.label + '</small>' : '';
            return '<button type="button" class="item-btn' + selected + focused + '" data-id="' + flatId + '">' + check + '<strong>' + (item.value || item.constant || item.label) + '</strong>' + label + detail + '</button>';
          }).filter(Boolean).join('');
          if (!items) {
            return '';
          }
          const groupTitle = group.label && group.label !== 'Choices' ? '<div class="group-title">' + group.label + '</div>' : '';
          const groupDesc = group.description ? '<div class="group-desc">' + group.description + '</div>' : '';
          return '<div class="group">' + groupTitle + groupDesc + '<div class="item-list">' + items + '</div></div>';
        }).filter(Boolean).join('');
        if (!groups) {
          return '';
        }
        const sectionTitle = section.label && section.label !== 'Choices' ? section.label : 'Choices';
        const sectionDesc = section.description ? '<div class="section-desc">' + section.description + '</div>' : '';
        return '<details open><summary>' + sectionTitle + '</summary>' + sectionDesc + groups + '</details>';
      }).filter(Boolean).join('');
      if (!treeRoot.innerHTML) {
        treeRoot.innerHTML = '<div class="summary">No choices match the current filter.</div>';
      }
      matchCount.textContent = renderedCount === 1 ? '1 match' : String(renderedCount) + ' matches';
      treeRoot.querySelectorAll('.item-btn').forEach((button) => {
        button.addEventListener('click', () => {
          const id = String(button.getAttribute('data-id') || '');
          state.selectedId = id;
          if (state.multiSelect) {
            if (state.selectedIds.includes(id)) state.selectedIds = state.selectedIds.filter((entry) => entry !== id);
            else state.selectedIds = [...state.selectedIds, id];
            renderTree();
            renderSelection();
            return;
          }
          renderSelection();
          treeRoot.querySelectorAll('.item-btn.selected').forEach((node) => node.classList.remove('selected'));
          button.classList.add('selected');
        });
        button.addEventListener('dblclick', () => {
          if (!state.multiSelect) applySelection();
        });
      });
    }

    function renderSelection() {
      const item = allItems.find((entry) => entry.id === state.selectedId);
      if (!item) {
        selectedConstant.textContent = 'No selection';
        selectedDescription.textContent = 'No visible item matches the current filter.';
        selectedMeta.textContent = '';
        applyBtn.disabled = true;
        return;
      }
      const selectedItems = state.multiSelect
        ? state.selectedIds.map((id) => allItems.find((entry) => entry.id === id)).filter(Boolean)
        : [item];
      const combinedValue = selectedItems.length
        ? selectedItems.map((entry) => String(entry.value || entry.constant || entry.label || '')).filter(Boolean).join(state.valueSeparator)
        : state.emptyValue;
      selectedConstant.textContent = combinedValue || (state.multiSelect ? '(none)' : 'No selection');
      selectedDescription.textContent = state.multiSelect && selectedItems.length === 0
        ? (state.allowEmptySelection ? 'No option selected. Apply will clear the optional multi-select field.' : 'Select at least one option before applying.')
        : String(item.description || item.detail || 'No description available.');
      const sourceTypes = Array.isArray(item.sourceTypes) ? item.sourceTypes.filter(Boolean).join(', ') : '';
      const bits = [];
      if (state.multiSelect) bits.push(String(selectedItems.length) + ' selected flag' + (selectedItems.length === 1 ? '' : 's'));
      if (item.sectionLabel) bits.push(String(item.sectionLabel));
      if (item.groupLabel && item.groupLabel !== 'Choices') bits.push(String(item.groupLabel));
      if (sourceTypes && sourceTypes !== 'All') bits.push('Applies to: ' + sourceTypes);
      if (item.defaultValue) bits.push('Suggested value: ' + item.defaultValue);
      if (item.valueKind) bits.push('Value type: ' + item.valueKind);
      selectedMeta.textContent = bits.join(' · ');
      applyBtn.disabled = state.multiSelect ? (!state.allowEmptySelection && !combinedValue && !state.emptyValue) : false;
    }

    function render() {
      renderTypeList();
      const visibleItems = getVisibleItems();
      const previousSelectedId = state.selectedId;
      ensureSelection(visibleItems);
      const selectionChanged = previousSelectedId !== state.selectedId;
      renderTree();
      renderSelection();
      if (selectionChanged) {
        const selectedButton = treeRoot.querySelector('.item-btn.selected');
        scrollItemIntoViewIfNeeded(selectedButton);
      }
    }

    function applySelection() {
      const item = allItems.find((entry) => entry.id === state.selectedId);
      if (!item && !state.multiSelect) {
        return;
      }
      if (state.multiSelect) {
        const items = state.selectedIds.map((id) => allItems.find((entry) => entry.id === id)).filter(Boolean);
        const value = items.length
          ? items.map((entry) => String(entry.value || entry.constant || entry.label || '')).filter(Boolean).join(state.valueSeparator)
          : state.emptyValue;
        vscode.postMessage({ type: 'applySelection', item: item || items[0] || {}, items, value });
        return;
      }
      vscode.postMessage({ type: 'applySelection', item });
    }

    filterInput.addEventListener('input', () => {
      state.filter = String(filterInput.value || '');
      render();
    });
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.selectedIds = [];
        renderTree();
        renderSelection();
      });
    }
    cancelBtn.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    applyBtn.addEventListener('click', () => applySelection());
    bindSourceResizer();
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && document.activeElement !== filterInput) {
        event.preventDefault();
        applySelection();
      }
      if (event.key === 'Escape') {
        vscode.postMessage({ type: 'cancel' });
      }
    });
    render();
  </script>
</body>
</html>`;
}


async function insertFunctionCallText(text: string): Promise<void> {
  text = stripSnippetPlaceholders(text);
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage('Open a C source file before inserting a function call.');
    return;
  }
  await editor.edit((editBuilder: vscode.TextEditorEdit) => {
    editBuilder.insert(editor.selection.active, text);
  });
}

async function insertFunctionCall(fn: CpmFunction): Promise<void> {
  const kind = getSymbolKind(fn);
  if (!isCallableSymbolKind(kind)) {
    const text = fn.insertText || fn.declaration || fn.signature || fn.name;
    const declarationKinds = new Set(['struct', 'typedef', 'enum', 'enum_class', 'class']);
    const shouldAppendSemicolon = declarationKinds.has(kind) && !text.endsWith(';') && !text.includes('\n');
    await insertFunctionCallText(shouldAppendSemicolon ? `${text};` : text);
    return;
  }
  await insertFunctionCallText(buildCallText(fn));
}

function normalizePathForCString(fsPath: string): string {
  return '"' + fsPath.replace(/\\/g, '\\\\') + '"';
}

function buildQuickPickItem(choice: ChoiceSpec): vscode.QuickPickItem {
  return {
    label: choice.value,
    description: choice.description,
    detail: choice.detail
  };
}

async function pickValueForParameter(param: ResolvedParameter, currentValue: string): Promise<string | undefined> {
  if (param.editorType === 'pathFile') {
    const selection = await vscode.window.showOpenDialog({
      canSelectMany: false,
      canSelectFiles: true,
      canSelectFolders: false,
      title: `Select a file for ${param.name}`,
      filters: {
        'CPM UI Resources': ['uir'],
        'All Files': ['*']
      }
    });
    return selection && selection[0] ? normalizePathForCString(selection[0].fsPath) : undefined;
  }

  if (param.editorType === 'pathFolder') {
    const selection = await vscode.window.showOpenDialog({
      canSelectMany: false,
      canSelectFiles: false,
      canSelectFolders: true,
      title: `Select a folder for ${param.name}`
    });
    return selection && selection[0] ? normalizePathForCString(selection[0].fsPath) : undefined;
  }

  const presets = param.presets;
  const options = param.options;
  const current = currentValue.trim()
    ? [{ value: currentValue.trim(), description: 'Current value' }]
    : [];

  const choiceMap = new Map<string, ChoiceSpec>();
  for (const choice of [...current, ...options, ...presets]) {
    if (!choiceMap.has(choice.value)) {
      choiceMap.set(choice.value, choice);
    }
  }
  const mergedChoices = [...choiceMap.values()];

  if (mergedChoices.length === 0) {
    const manual = await vscode.window.showInputBox({
      prompt: `Enter a value for ${param.name}`,
      value: currentValue,
      placeHolder: param.placeholder
    });
    return manual;
  }

  const items: vscode.QuickPickItem[] = [];
  if (current.length > 0) {
    items.push({ kind: vscode.QuickPickItemKind.Separator, label: 'Current value' });
    items.push(...current.map(buildQuickPickItem));
  }
  if (options.length > 0) {
    items.push({ kind: vscode.QuickPickItemKind.Separator, label: 'Recommended values' });
    items.push(...options.map(buildQuickPickItem));
  }
  if (presets.length > 0) {
    items.push({ kind: vscode.QuickPickItemKind.Separator, label: 'Presets and common variables' });
    items.push(...presets.map(buildQuickPickItem));
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Select a value for ${param.name}`,
    title: `${param.name} presets`,
    ignoreFocusOut: true
  });

  if (!picked || 'kind' in picked) {
    return undefined;
  }
  return picked.label;
}

function flattenFunctions(db: CpmDatabase): FunctionSearchEntry[] {
  const entries: FunctionSearchEntry[] = [];
  for (const environment of db.environments || []) {
    for (const library of environment.libraries || []) {
      for (const category of library.categories || []) {
        for (const fn of getCategoryAllFunctions(category)) {
          entries.push({
            fn: { ...fn, environment: environment.name, library: library.name, category: category.name },
            library: library.name,
            category: category.name
          });
        }
      }
    }
  }
  return entries;
}

function buildFunctionQuickPickItem(entry: FunctionSearchEntry): FunctionQuickPickItem {
  const fn = entry.fn;
  const paramSummary = (fn.parameters ?? [])
    .map((param) => `${param.type} ${param.name}`)
    .join(', ');

  const kind = getSymbolKind(fn);
  const typeDetail = isCallableSymbolKind(kind)
    ? `${fn.returnType} ${fn.name}(${paramSummary})`
    : `${getSymbolKindLabel(kind)} • ${(Array.isArray(fn.fields) ? fn.fields.length : Array.isArray(fn.enumValues) ? fn.enumValues.length : 0)} item(s)`;

  return {
    label: fn.name,
    description: `${entry.fn.environment || DEFAULT_ENVIRONMENT_NAME} • ${entry.library} • ${entry.category}`,
    detail: `${typeDetail}${fn.description ? ` — ${fn.description}` : ''}`,
    fn,
    entry
  };
}

function scoreFunctionMatch(entry: FunctionSearchEntry, query: string): number {
  const fn = entry.fn;
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return 1;
  }

  const haystack = [
    fn.name,
    entry.fn.environment ?? '',
    entry.library,
    entry.category,
    fn.header ?? '',
    fn.signature,
    fn.description ?? '',
    ...(fn.parameters ?? []).map((p) => `${p.name} ${p.type} ${p.description ?? ''}`),
    ...(fn.fields ?? []).map((f) => `${f.name} ${f.type} ${f.description ?? ''}`),
    ...(fn.enumValues ?? []).map((v) => `${v.name} ${v.value ?? ''} ${v.description ?? ''}`),
    ...(fn.methods ?? []).map((m) => `${m.name} ${m.returnType ?? ''} ${m.access ?? ''} ${(m.qualifiers ?? []).join(' ')} ${m.signature ?? ''}`)
  ].join(' | ').toLowerCase();

  if (!haystack.includes(normalized)) {
    return -1;
  }

  let score = 0;
  const lowerName = fn.name.toLowerCase();
  if (lowerName === normalized) score += 100;
  if (lowerName.startsWith(normalized)) score += 50;
  if (lowerName.includes(normalized)) score += 20;
  if ((fn.description ?? '').toLowerCase().includes(normalized)) score += 7;
  if (entry.library.toLowerCase().includes(normalized)) score += 5;
  if (entry.category.toLowerCase().includes(normalized)) score += 5;
  if (fn.signature.toLowerCase().includes(normalized)) score += 3;
  return score;
}

function buildFunctionFilterItems(entries: FunctionSearchEntry[], query: string, maxResults = 80): FunctionQuickPickItem[] {
  const scored = entries
    .map((entry) => ({ entry, score: scoreFunctionMatch(entry, query) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score || a.entry.fn.name.localeCompare(b.entry.fn.name))
    .slice(0, maxResults);

  return scored.map((row) => buildFunctionQuickPickItem(row.entry));
}

function createRevealItems(entry: FunctionSearchEntry): { environment: CpmItem; library: CpmItem; category: CpmItem; fn: CpmItem } {
  const environmentName = entry.fn.environment || DEFAULT_ENVIRONMENT_NAME;
  const libraryName = entry.fn.library || entry.library;
  const environmentItem = new CpmItem(
    'environment',
    environmentName,
    vscode.TreeItemCollapsibleState.Collapsed,
    undefined,
    undefined,
    'Environment',
    `environment:${environmentName}`
  );
  const libraryItem = new CpmItem(
    'library',
    libraryName,
    vscode.TreeItemCollapsibleState.Collapsed,
    undefined,
    environmentName,
    'Library',
    `library:${environmentName}:${libraryName}`,
    `environment:${environmentName}`
  );
  const categoryItem = new CpmItem(
    'category',
    entry.category,
    vscode.TreeItemCollapsibleState.Collapsed,
    undefined,
    libraryName,
    environmentName,
    `category:${environmentName}:${libraryName}:${entry.category}`,
    `library:${environmentName}:${libraryName}`,
    { environmentName, libraryName, categoryName: entry.category, groupPath: [] }
  );
  const functionItem = new CpmItem(
    'function',
    entry.fn.name,
    vscode.TreeItemCollapsibleState.None,
    entry.fn,
    entry.category,
    `${environmentName} • ${libraryName} • ${entry.category} • ${entry.fn.returnType}`,
    `function:${environmentName}:${libraryName}:${entry.category}:${entry.fn.name}`,
    `category:${environmentName}:${libraryName}:${entry.category}`,
    { environmentName, libraryName, categoryName: entry.category, groupPath: [] }
  );
  return { environment: environmentItem, library: libraryItem, category: categoryItem, fn: functionItem };
}

function updateViewMessage(treeView: vscode.TreeView<CpmItem>, provider: CpmTreeProvider): void {
  const term = provider.getFilterTerm();
  if (!term) {
    treeView.message = undefined;
    return;
  }
  const count = provider.getMatchCount();
  treeView.message = `Find filter active: "${term}" — ${count} match${count > 1 ? 'es' : ''}. Use Clear Find to restore the full library tree.`;
}



function sanitizePackFileForSave(packFile: LibraryPackFile): LibraryPackFile {
  const packName = typeof packFile.name === 'string' && packFile.name.trim() ? packFile.name.trim() : 'Untitled Pack';
  const language = typeof packFile.language === 'string' && packFile.language.trim() ? packFile.language.trim() : 'c';
  const version = typeof packFile.version === 'string' && packFile.version.trim() ? packFile.version.trim() : '1.0.0';
  const id = typeof packFile.id === 'string' && packFile.id.trim() ? packFile.id.trim() : slugify(packName);
  const readOnly = !!packFile.readOnly;

  const environments = normalizeEnvironments(Array.isArray(packFile.environments) ? packFile.environments : undefined, Array.isArray((packFile as any).libraries) ? (packFile as any).libraries : undefined).map((environment, environmentIndex) => {
    const environmentName = environment.name?.trim() || `Environment ${environmentIndex + 1}`;
    return {
      name: environmentName,
      libraries: normalizeLibraries(environment.libraries || [], environmentName).map((library, libraryIndex) => {
        const libraryName = library.name?.trim() || `Library ${libraryIndex + 1}`;
        return {
          name: libraryName,
          categories: (Array.isArray(library.categories) ? library.categories : []).map((category, categoryIndex) => {
            const categoryName = category.name?.trim() || `Category ${categoryIndex + 1}`;
            const sanitizeFunction = (fn, functionIndex) => {
              const name = fn.name?.trim() || `Function${functionIndex + 1}`;
              const returnType = fn.returnType?.trim() || 'void';
              const parameters = (Array.isArray(fn.parameters) ? fn.parameters : []).map((param, paramIndex) => {
                const pickerConfig = normalizeStructuredPickerConfig(param?.pickerConfig, String(param?.pickerConfig?.title || '').trim() || `Select value for ${param?.name?.trim() || `param${paramIndex + 1}`}`);
                return {
                  name: param.name?.trim() || `param${paramIndex + 1}`,
                  type: param.type?.trim() || 'int',
                  description: param.description?.trim() || undefined,
                  editorType: param.editorType || 'text',
                  defaultValue: typeof param.defaultValue === 'string' ? param.defaultValue : undefined,
                  placeholder: param.placeholder?.trim() || undefined,
                  presets: Array.isArray(param.presets) ? param.presets : undefined,
                  options: Array.isArray(param.options) ? param.options : undefined,
                  presetDescriptions: param.presetDescriptions,
                  presetDetails: param.presetDetails,
                  optionDescriptions: param.optionDescriptions,
                  optionDetails: param.optionDetails,
                  pickerConfig: pickerConfig && (Array.isArray(pickerConfig.sections) ? pickerConfig.sections.length : 0) > 0
                    ? pickerConfig
                    : (param?.pickerConfig && (String(param?.pickerConfig?.title || '').trim() || (Array.isArray(param?.pickerConfig?.sourceTypes) && param.pickerConfig.sourceTypes.length > 0) || param?.pickerConfig?.applyDefaultIfEmpty)
                      ? {
                          title: String(param?.pickerConfig?.title || '').trim() || `Select value for ${param.name?.trim() || `param${paramIndex + 1}`}`,
                          selectionLabel: String(param?.pickerConfig?.selectionLabel || 'Selected value').trim() || 'Selected value',
                          subtitle: String(param?.pickerConfig?.subtitle || '').trim() || undefined,
                          sourceTypes: Array.isArray(param?.pickerConfig?.sourceTypes) ? param.pickerConfig.sourceTypes.map((entry) => String(entry || '').trim()).filter(Boolean) : undefined,
                          sections: Array.isArray(pickerConfig?.sections) ? pickerConfig.sections : [],
                          applyDefaultIfEmpty: param?.pickerConfig?.applyDefaultIfEmpty === true,
                          multiSelect: param?.pickerConfig?.multiSelect === true,
                          valueSeparator: typeof param?.pickerConfig?.valueSeparator === 'string' && param.pickerConfig.valueSeparator.length > 0 ? param.pickerConfig.valueSeparator : undefined,
                          emptyValue: typeof param?.pickerConfig?.emptyValue === 'string' ? param.pickerConfig.emptyValue : undefined
                        }
                      : undefined)
                };
              });
              return {
                ...fn,
                name,
                returnType,
                signature: getSymbolKind(fn) === 'function' ? buildFunctionSignature(name, returnType, parameters) : (fn.signature || fn.declaration || ''),
                insertText: getSymbolKind(fn) === 'function' ? buildFunctionInsertText(name, parameters) : (fn.insertText || fn.signature || fn.declaration || name),
                header: fn.header?.trim() || undefined,
                environment: environmentName,
                library: libraryName,
                category: categoryName,
                description: fn.description?.trim() || undefined,
                longDescription: fn.longDescription?.trim() || undefined,
                returnDescription: fn.returnDescription?.trim() || undefined,
                parameters
              };
            };
            const sanitizeFunctionList = (functions: CpmFunction[] | undefined): CpmFunction[] => {
              const sanitized: CpmFunction[] = [];
              const exactKeys = new Set<string>();
              (Array.isArray(functions) ? functions : []).forEach((fn, functionIndex) => {
                const item = sanitizeFunction(fn, functionIndex) as CpmFunction;
                const exactKey = JSON.stringify({ ...item, name: String(item.name || '').trim() });
                if (exactKeys.has(exactKey)) {
                  return;
                }
                exactKeys.add(exactKey);
                sanitized.push(item);
              });
              return sanitized;
            };
            const sanitizeGroup = (group, groupIndex) => ({
              name: group?.name?.trim() || `Group ${groupIndex + 1}`,
              description: group?.description?.trim() || undefined,
              functions: sanitizeFunctionList(Array.isArray(group?.functions) ? group.functions : []),
              groups: (Array.isArray(group?.groups) ? group.groups : []).map((child, childIndex) => sanitizeGroup(child, childIndex))
            });
            return {
              name: categoryName,
              functions: sanitizeFunctionList(Array.isArray(category.functions) ? category.functions : []),
              groups: (Array.isArray((category as any).groups) ? (category as any).groups : []).map((group, groupIndex) => sanitizeGroup(group, groupIndex))
            };
          })
        };
      })
    };
  });

  return { id, name: packName, language, version, readOnly, environments };
}

function getBuiltInPickerTemplateKey(fnName: string | undefined, paramIndex: number): string {
  return `${String(fnName || '').trim().toLowerCase()}::${paramIndex}`;
}

function collectBuiltInPickerTemplatesFromGroups(groups: CpmGroup[] | undefined, acc: Record<string, StructuredPickerConfig>): void {
  if (!Array.isArray(groups)) {
    return;
  }
  groups.forEach((group) => {
    (Array.isArray(group?.functions) ? group.functions : []).forEach((fn) => {
      const parameters = Array.isArray(fn?.parameters) ? fn.parameters : [];
      parameters.forEach((param, paramIndex) => {
        const fallbackTitle = `Select value for ${param?.name || `param${paramIndex + 1}`}`;
        const helperConfig = getCpmAttributeHelperConfigForParameter(fn as CpmFunction, paramIndex, fallbackTitle);
        if (helperConfig) {
          acc[getBuiltInPickerTemplateKey(fn?.name, paramIndex)] = helperConfig;
        }
      });
    });
    collectBuiltInPickerTemplatesFromGroups(Array.isArray(group?.groups) ? group.groups : [], acc);
  });
}

function buildBuiltInPickerTemplateMapForPack(pack: LibraryPackFile): Record<string, StructuredPickerConfig> {
  const acc: Record<string, StructuredPickerConfig> = {};
  (Array.isArray(pack?.environments) ? pack.environments : []).forEach((environment) => {
    (Array.isArray(environment?.libraries) ? environment.libraries : []).forEach((library) => {
      (Array.isArray(library?.categories) ? library.categories : []).forEach((category) => {
        (Array.isArray(category?.functions) ? category.functions : []).forEach((fn) => {
          const parameters = Array.isArray(fn?.parameters) ? fn.parameters : [];
          parameters.forEach((param, paramIndex) => {
            const fallbackTitle = `Select value for ${param?.name || `param${paramIndex + 1}`}`;
            const helperConfig = getCpmAttributeHelperConfigForParameter(fn as CpmFunction, paramIndex, fallbackTitle);
            if (helperConfig) {
              acc[getBuiltInPickerTemplateKey(fn?.name, paramIndex)] = helperConfig;
            }
          });
        });
        collectBuiltInPickerTemplatesFromGroups(Array.isArray(category?.groups) ? category.groups : [], acc);
      });
    });
  });
  return acc;
}

function buildPackEditorHtml(pack: LibraryPackFile, loadedPack: LoadedPack): string {
  const initialPackBase64 = Buffer.from(JSON.stringify(sanitizePackFileForSave(pack)), 'utf8').toString('base64');
  const environmentIconUri = svgToDataUri(CUSTOM_ICON_SVGS.environment);
  const libraryIconUri = svgToDataUri(CUSTOM_ICON_SVGS.library);
  const categoryIconUri = svgToDataUri(CUSTOM_ICON_SVGS.category);
  const groupIconUri = svgToDataUri(CUSTOM_ICON_SVGS.group);
  const metaBase64 = Buffer.from(JSON.stringify({
    source: sourceLabel(loadedPack.source),
    writable: loadedPack.writable,
    filePath: loadedPack.filePath,
    language: loadedPack.language ?? pack.language ?? 'c',
    readOnly: !!pack.readOnly
  }), 'utf8').toString('base64');
  const builtInPickerTemplatesBase64 = Buffer.from(JSON.stringify(buildBuiltInPickerTemplateMapForPack(pack)), 'utf8').toString('base64');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Library Pack Editor</title>
<style>
  :root {
    color-scheme: dark;
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --muted: var(--vscode-descriptionForeground);
    --border: var(--vscode-panel-border);
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --button-bg: var(--vscode-button-background);
    --button-fg: var(--vscode-button-foreground);
    --button-secondary-bg: var(--vscode-button-secondaryBackground);
    --button-secondary-fg: var(--vscode-button-secondaryForeground);
    --success-bg: var(--vscode-testing-iconPassed, #2ea043);
    --success-fg: #ffffff;
    --danger-bg: var(--vscode-testing-iconFailed, #d73a49);
    --danger-fg: #ffffff;
    --list-active: var(--vscode-list-activeSelectionBackground);
    --list-active-fg: var(--vscode-list-activeSelectionForeground);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; font-family: var(--vscode-font-family); color: var(--fg); background: var(--bg); height: 100vh; overflow: hidden; }
  .layout { --sidebar-width: 330px; --sidebar-min-width: 260px; --sidebar-max-width: min(760px, calc(100vw - 360px)); --resizer-width: 8px; display: grid; grid-template-columns: minmax(var(--sidebar-min-width), var(--sidebar-width)) var(--resizer-width) minmax(0, 1fr); height: 100vh; min-height: 0; }
  .sidebar { border-right: 1px solid var(--border); display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
  .sidebar-resizer { position: relative; cursor: col-resize; user-select: none; }
  .sidebar-resizer::before { content: ''; position: absolute; top: 0; bottom: 0; left: calc(50% - 1px); width: 2px; background: transparent; }
  .sidebar-resizer:hover::before, .sidebar-resizer.dragging::before { background: var(--accent); opacity: 0.65; }
  .sidebar-header, .editor-header { padding: 10px 12px; border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .sidebar-header { align-content: flex-start; }
  .sidebar-header h2, .editor-header h2 { margin: 0; font-size: 14px; font-weight: 600; }
  .tree-filter { width: 100%; }
  .tree-toolbar { display: flex; gap: 8px; flex-wrap: wrap; width: 100%; }
  .tree { padding: 8px; overflow: auto; flex: 1; min-height: 0; scrollbar-gutter: stable both-edges; }
  .tree-row { display: flex; align-items: stretch; gap: 4px; margin-bottom: 2px; }
  .multi-check-wrap { display: inline-flex; align-items: center; justify-content: center; width: 22px; min-width: 22px; border: 1px solid transparent; border-radius: 6px; cursor: pointer; }
  .multi-check-wrap:hover { border-color: var(--border); }
  .multi-check { margin: 0; cursor: pointer; accent-color: var(--vscode-button-background); }
  .tree-indent-0 { padding-left: 0; }
  .tree-indent-1 { padding-left: 14px; }
  .tree-indent-2 { padding-left: 28px; }
  .tree-indent-3 { padding-left: 42px; }
  .tree-indent-4 { padding-left: 56px; }
  .tree button.toggle { width: 28px; min-width: 28px; background: transparent; border: 1px solid transparent; border-radius: 6px; color: inherit; cursor: pointer; font: inherit; }
  .tree button.toggle:hover { border-color: var(--border); }
  .tree button.node { flex: 1; text-align: left; background: transparent; border: 1px solid transparent; border-radius: 6px; color: inherit; padding: 6px 8px; cursor: pointer; font: inherit; }
  .tree button.node:hover { border-color: var(--border); }
  .tree button.node.active { background: var(--list-active); color: var(--list-active-fg); }
  .tree button.node .node-label { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; width: 100%; }
  .tree button.node .node-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-flex; align-items: center; gap: 8px; }
  .node-icon { width: 16px; height: 16px; flex: 0 0 16px; display: inline-block; background-position: center; background-repeat: no-repeat; background-size: 16px 16px; }
  .node-icon.environment { background-image: url('${environmentIconUri}'); }
  .node-icon.library { background-image: url('${libraryIconUri}'); }
  .node-icon.category { background-image: url('${categoryIconUri}'); }
  .node-icon.group { background-image: url('${groupIconUri}'); }
  .tree-empty { padding: 8px; color: var(--muted); }
  .muted { color: var(--muted); }
  .editor { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
  .editor-body { flex: 1; overflow: auto; padding: 16px; min-height: 0; }
  .card { border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .card h3 { margin: 0 0 12px; font-size: 18px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; }
  input[type="text"], textarea, select { width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: 8px; background: var(--input-bg); color: var(--input-fg); font: inherit; }
  textarea { min-height: 72px; resize: vertical; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  button.action { border: none; border-radius: 6px; padding: 8px 12px; background: var(--button-bg); color: var(--button-fg); cursor: pointer; font: inherit; }
  button.action.secondary { background: var(--button-secondary-bg); color: var(--button-secondary-fg); }
  button.action.positive { background: var(--success-bg); color: var(--success-fg); }
  button.action.danger { background: var(--danger-bg); color: var(--danger-fg); }
  button.action[disabled], input[disabled], textarea[disabled], select[disabled] { opacity: 0.6; cursor: not-allowed; }
  .meta-line { font-size: 12px; color: var(--muted); margin-bottom: 12px; }
  .table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .table th, .table td { border-bottom: 1px solid var(--border); padding: 8px 6px; text-align: left; vertical-align: top; }
  .table th { font-size: 12px; color: var(--muted); }
  .param-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .code { white-space: pre-wrap; font-family: var(--vscode-editor-font-family); background: rgba(127,127,127,0.08); border: 1px solid var(--border); border-radius: 8px; padding: 10px; }
  .pill { display: inline-block; border: 1px solid var(--border); border-radius: 999px; padding: 3px 8px; font-size: 11px; color: var(--muted); }
  .validation-card { border-color: #b36b00; background: rgba(179,107,0,0.08); }
  .validation-card ul { margin: 8px 0 0 18px; padding: 0; }
  .tiny { font-size: 11px; color: var(--muted); }
  .textarea-small { min-height: 56px; }
  .sublist { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px; }
  .sublist-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; }
  .sublist-item-main { min-width: 0; }
  .sublist-item-title { font-weight: 600; }
  .sublist-item-meta { font-size: 12px; color: var(--muted); }
  .sublist-item-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .summary-list { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px; display: grid; gap: 8px; }
  .summary-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; }
  .summary-main { min-width: 0; }
  .summary-title { font-weight: 600; }
  .summary-meta { font-size: 12px; color: var(--muted); }
  .tree-status { width: 100%; font-size: 12px; color: var(--muted); }
  .editor-subtitle { width: 100%; font-size: 12px; color: var(--muted); margin-top: -4px; }
  .breadcrumbs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .crumb { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; font-size: 11px; color: var(--muted); }
  .picker-builder-stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; margin-bottom: 10px; }
  .picker-builder-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; margin-bottom: 12px; }
  .picker-builder-layout-v3 { display: grid; grid-template-columns: minmax(240px, 0.72fr) minmax(340px, 0.95fr) minmax(360px, 1.15fr); gap: 12px; margin-top: 8px; align-items: start; }
  .picker-builder-panel { border: 1px solid var(--border); border-radius: 10px; padding: 12px; min-width: 0; background: rgba(127,127,127,0.03); display: flex; flex-direction: column; }
  .picker-builder-panel-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  .picker-builder-panel-scroll { width: 100%; max-height: clamp(340px, 62vh, 820px); overflow-y: auto; overflow-x: auto; padding-right: 4px; min-height: 0; }
  .picker-builder-panel-scroll.preview-scroll { max-height: clamp(360px, 68vh, 900px); }
  .picker-stat { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; }
  .picker-outline { display: flex; flex-direction: column; gap: 6px; width: max-content; min-width: 100%; }
  .picker-outline-node { width: max-content; min-width: 100%; border: 1px solid var(--border); background: transparent; color: inherit; border-radius: 8px; text-align: left; padding: 0; cursor: pointer; }
  .picker-outline-node:hover { background: rgba(127,127,127,0.06); }
  .picker-outline-node.active { border-color: var(--accent); background: rgba(0, 122, 204, 0.16); }
  .picker-outline-node-main { display: flex; flex-direction: column; gap: 4px; padding: 9px 10px; min-width: max-content; }
  .picker-outline-node-label { font-weight: 600; min-width: 0; white-space: nowrap; word-break: normal; }
  .picker-outline-node-meta { display: flex; flex-wrap: nowrap; gap: 6px; font-size: 11px; color: var(--muted); white-space: nowrap; }
  .picker-outline-title { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-top: 6px; margin-bottom: 2px; }
  .picker-outline-empty { border: 1px dashed var(--border); border-radius: 8px; padding: 10px; color: var(--muted); }
  .picker-inspector-title { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  .picker-inspector-subtitle { font-size: 12px; color: var(--muted); margin-bottom: 10px; }
  .picker-inspector-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .picker-path { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
  .picker-path-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 999px; padding: 3px 9px; font-size: 11px; color: var(--muted); }
  .picker-preview-window { width: 100%; border: 1px solid var(--border); border-radius: 10px; background: rgba(0,0,0,0.1); overflow: hidden; }
  .picker-preview-top { padding: 12px; border-bottom: 1px solid var(--border); }
  .picker-preview-title { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
  .picker-preview-subtitle { font-size: 12px; color: var(--muted); }
  .picker-preview-body { display: grid; grid-template-columns: minmax(110px, 160px) minmax(0, 1fr); min-height: 260px; min-width: 0; }
  .picker-preview-body.no-sidebar { grid-template-columns: 1fr; }
  .picker-preview-sidebar { border-right: 1px solid var(--border); padding: 10px; display: grid; gap: 8px; align-content: start; }
  .picker-preview-chip { border: 1px solid var(--border); border-radius: 999px; padding: 5px 9px; font-size: 11px; color: var(--muted); }
  .picker-preview-chip.active { border-color: var(--accent); color: var(--fg); background: rgba(0, 122, 204, 0.14); }
  .picker-preview-main { padding: 12px; display: grid; gap: 12px; align-content: start; }
  .picker-preview-section { border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: rgba(127,127,127,0.03); }
  .picker-preview-section.active { border-color: var(--accent); }
  .picker-preview-section-title { font-weight: 700; margin-bottom: 4px; }
  .picker-preview-section-desc { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
  .picker-preview-group { margin-top: 8px; }
  .picker-preview-group-title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
  .picker-preview-group-desc { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  .picker-preview-item-list { display: grid; gap: 6px; }
  .picker-preview-item { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; background: rgba(127,127,127,0.025); }
  .picker-preview-item.active { border-color: var(--accent); background: rgba(0, 122, 204, 0.16); }
  .picker-preview-item-value { font-weight: 600; }
  .picker-preview-item-label { font-size: 12px; color: var(--muted); }
  .picker-preview-item-desc { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .picker-preview-item-meta { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; }
  .picker-preview-empty { border: 1px dashed var(--border); border-radius: 8px; padding: 10px; color: var(--muted); }
  .picker-preview-footer { padding: 12px; border-top: 1px solid var(--border); display: grid; gap: 4px; }
  .picker-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
  .picker-summary-card { border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: rgba(127,127,127,0.03); }
  .picker-summary-card strong { display: block; font-size: 18px; margin-bottom: 2px; }
  .picker-card-empty { border: 1px dashed var(--border); border-radius: 8px; padding: 10px; }
  .picker-advanced-summary { cursor: pointer; user-select: none; }
  @media (max-width: 1400px) {
    .picker-builder-layout-v3 { grid-template-columns: minmax(240px, 0.8fr) minmax(360px, 1fr); }
    .picker-builder-panel.preview-panel { grid-column: 1 / -1; }
  }
  @media (max-width: 1120px) {
    .picker-builder-layout-v3 { grid-template-columns: 1fr; }
    .picker-builder-panel.preview-panel { grid-column: auto; }
    .picker-preview-body { grid-template-columns: 1fr; }
    .picker-preview-sidebar { border-right: none; border-bottom: 1px solid var(--border); }
  }
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>Pack structure</h2>
      <div class="tree-toolbar">
        <button class="action secondary" data-action="expandAll">Expand all</button>
        <button class="action secondary" data-action="collapseAll">Collapse all</button>
        <button class="action secondary" data-action="clearMultiSelection">Clear multi-select</button>
      </div>
      <input class="tree-filter" type="text" id="treeFilter" placeholder="Filter libraries, categories, functions" />
      <div class="tree-status" id="treeStatus"></div>
    </div>
    <div class="tree" id="tree"></div>
  </aside>
  <div class="sidebar-resizer" id="sidebarResizer" title="Resize pack structure panel"></div>
  <main class="editor">
    <div class="editor-header">
      <h2>Visual Pack Editor</h2>
      <span class="pill" id="modeBadge"></span>
      <div class="actions">
        <button class="action" data-action="savePack" id="savePackBtn">Save pack</button>
        <button class="action secondary" data-action="openJson">Open JSON</button>
        <button class="action danger" data-action="deleteCurrentSelection" id="deleteSelectionBtn" disabled>Delete selection</button>
      </div>
      <div class="editor-subtitle" id="selectionPath"></div>
    </div>
    <div class="editor-body" id="editorBody"></div>
  </main>
</div>
<script>
(() => {
  const vscode = acquireVsCodeApi();
  const decodeInlineBase64Json = (value) => {
    const binary = atob(String(value || ''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  };
  const initialPack = decodeInlineBase64Json('${initialPackBase64}');
  const meta = decodeInlineBase64Json('${metaBase64}');
  const builtInPickerTemplates = decodeInlineBase64Json('${builtInPickerTemplatesBase64}');
  const writable = !!meta.writable;
  const safeClone = (value) => {
    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(value);
      }
    } catch {}
    return JSON.parse(JSON.stringify(value));
  };
  let pack = safeClone(initialPack);
  let selection = { kind: 'pack' };
  let previewReturnTarget = '';
  const PACK_EDITOR_UI_STATE_SCHEMA = 'v3';
  const PACK_EDITOR_SUMMARY_ITEM_LIMIT = 120;
  const uiStateKey = 'cpm.library.packEditorState:' + PACK_EDITOR_UI_STATE_SCHEMA + ':' + String(initialPack.id || initialPack.name || meta.filePath || 'default');
  function loadUiState() {
    try {
      const raw = localStorage.getItem(uiStateKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  const initialUiState = loadUiState();
  let treeFilter = typeof initialUiState.treeFilter === 'string' ? initialUiState.treeFilter : '';
  const expandedEnvironments = new Set(Array.isArray(initialUiState.expandedEnvironments) ? initialUiState.expandedEnvironments : []);
  const expandedLibraries = new Set(Array.isArray(initialUiState.expandedLibraries) ? initialUiState.expandedLibraries : []);
  const expandedCategories = new Set(Array.isArray(initialUiState.expandedCategories) ? initialUiState.expandedCategories : []);
  const expandedGroups = new Set(Array.isArray(initialUiState.expandedGroups) ? initialUiState.expandedGroups : []);
  const checkedNodes = new Set(Array.isArray(initialUiState.checkedNodes) ? initialUiState.checkedNodes : []);
  let pickerEditorSelection = initialUiState.pickerEditorSelection && typeof initialUiState.pickerEditorSelection === 'object'
    ? initialUiState.pickerEditorSelection
    : null;
  let sidebarWidth = Number.isFinite(Number(initialUiState.sidebarWidth)) ? Number(initialUiState.sidebarWidth) : 330;
  let pickerPanelScrollState = initialUiState.pickerPanelScrollState && typeof initialUiState.pickerPanelScrollState === 'object'
    ? initialUiState.pickerPanelScrollState
    : {};
  function saveUiState() {
    try {
      localStorage.setItem(uiStateKey, JSON.stringify({
        treeFilter: treeFilter,
        expandedEnvironments: Array.from(expandedEnvironments),
        expandedLibraries: Array.from(expandedLibraries),
        expandedCategories: Array.from(expandedCategories),
        expandedGroups: Array.from(expandedGroups),
        checkedNodes: Array.from(checkedNodes),
        selection: selection,
        pickerEditorSelection: pickerEditorSelection,
        sidebarWidth: sidebarWidth,
        pickerPanelScrollState: pickerPanelScrollState
      }));
    } catch {}
  }

  const layoutEl = document.querySelector('.layout');
  const treeEl = document.getElementById('tree');
  const editorBodyEl = document.getElementById('editorBody');
  const modeBadgeEl = document.getElementById('modeBadge');
  const savePackBtn = document.getElementById('savePackBtn');
  const deleteSelectionBtn = document.getElementById('deleteSelectionBtn');
  const sidebarResizerEl = document.getElementById('sidebarResizer');
  const treeStatusEl = document.getElementById('treeStatus');
  const selectionPathEl = document.getElementById('selectionPath');
  if (!writable) {
    savePackBtn.setAttribute('disabled', 'disabled');
    modeBadgeEl.textContent = 'Read-only';
  } else {
    modeBadgeEl.textContent = meta.source + ' • editable';
  }

  function clampSidebarWidth(width) {
    const min = 260;
    const max = Math.max(min, Math.min(760, window.innerWidth - 360));
    return Math.max(min, Math.min(max, Number(width) || 330));
  }

  function applySidebarWidth(width) {
    sidebarWidth = clampSidebarWidth(width);
    if (layoutEl instanceof HTMLElement) {
      layoutEl.style.setProperty('--sidebar-width', String(sidebarWidth) + 'px');
    }
  }

  applySidebarWidth(sidebarWidth);

  if (sidebarResizerEl instanceof HTMLElement) {
    sidebarResizerEl.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sidebarWidth;
      sidebarResizerEl.classList.add('dragging');
      const onMove = (moveEvent) => {
        applySidebarWidth(startWidth + (moveEvent.clientX - startX));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        sidebarResizerEl.classList.remove('dragging');
        saveUiState();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  window.addEventListener('resize', () => applySidebarWidth(sidebarWidth));

  function serializeCheckedNode(item) {
    return JSON.stringify(item);
  }

  function deserializeCheckedNode(value) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function getCheckedNodeContext(item) {
    if (!item || typeof item !== 'object') return '';
    switch (item.kind) {
      case 'environment':
        return 'environment';
      case 'library':
        return 'library:' + String(item.environmentIndex);
      case 'category':
        return 'category:' + String(item.environmentIndex) + ':' + String(item.libraryIndex);
      case 'group': {
        const parentPath = Array.isArray(item.groupPath) ? item.groupPath.slice(0, -1) : [];
        return 'group:' + String(item.environmentIndex) + ':' + String(item.libraryIndex) + ':' + String(item.categoryIndex) + ':' + parentPath.join('.');
      }
      case 'function': {
        const groupPath = Array.isArray(item.groupPath) ? item.groupPath : [];
        return 'function:' + String(item.environmentIndex) + ':' + String(item.libraryIndex) + ':' + String(item.categoryIndex) + ':' + groupPath.join('.');
      }
      default:
        return '';
    }
  }

  function getCheckedNodeIndex(item) {
    switch (item?.kind) {
      case 'environment': return Number(item.environmentIndex);
      case 'library': return Number(item.libraryIndex);
      case 'category': return Number(item.categoryIndex);
      case 'group': return Array.isArray(item.groupPath) && item.groupPath.length ? Number(item.groupPath[item.groupPath.length - 1]) : -1;
      case 'function': return Number(item.functionIndex);
      default: return -1;
    }
  }

  function descriptorExists(item) {
    if (!item || typeof item !== 'object') return false;
    if (item.kind === 'environment') return !!getEnvironment(Number(item.environmentIndex));
    if (item.kind === 'library') return !!getLibrary(Number(item.environmentIndex), Number(item.libraryIndex));
    if (item.kind === 'category') return !!getCategory({ kind: 'category', environmentIndex: Number(item.environmentIndex), libraryIndex: Number(item.libraryIndex), categoryIndex: Number(item.categoryIndex) });
    if (item.kind === 'group') return !!getGroup({ kind: 'group', environmentIndex: Number(item.environmentIndex), libraryIndex: Number(item.libraryIndex), categoryIndex: Number(item.categoryIndex), groupPath: Array.isArray(item.groupPath) ? item.groupPath : [] });
    if (item.kind === 'function') return !!getFunction({ kind: 'function', environmentIndex: Number(item.environmentIndex), libraryIndex: Number(item.libraryIndex), categoryIndex: Number(item.categoryIndex), functionIndex: Number(item.functionIndex), groupPath: Array.isArray(item.groupPath) ? item.groupPath : [] });
    return false;
  }

  function pruneCheckedNodes() {
    let changed = false;
    Array.from(checkedNodes).forEach((entry) => {
      const parsed = deserializeCheckedNode(entry);
      if (!parsed || !descriptorExists(parsed)) {
        checkedNodes.delete(entry);
        changed = true;
      }
    });
    if (changed) saveUiState();
  }

  function isNodeChecked(item) {
    return checkedNodes.has(serializeCheckedNode(item));
  }

  function setNodeChecked(item, checked) {
    if (!item || !item.kind) return;
    const serialized = serializeCheckedNode(item);
    const context = getCheckedNodeContext(item);
    if (checked) {
      const hasOtherContext = Array.from(checkedNodes).some((entry) => {
        const parsed = deserializeCheckedNode(entry);
        return parsed && getCheckedNodeContext(parsed) !== context;
      });
      if (hasOtherContext) checkedNodes.clear();
      checkedNodes.add(serialized);
    } else {
      checkedNodes.delete(serialized);
    }
    saveUiState();
  }

  function clearCheckedNodes() {
    if (!checkedNodes.size) return;
    checkedNodes.clear();
    saveUiState();
  }

  function syncSelectionToCheckedNodes(preferredItem) {
    const items = Array.from(checkedNodes)
      .map((entry) => deserializeCheckedNode(entry))
      .filter((item) => item && descriptorExists(item));
    if (!items.length) return false;
    const target = preferredItem && descriptorExists(preferredItem) ? preferredItem : items[0];
    if (!target) return false;
    const current = getSelectionDescriptor();
    const currentMatches = !!current
      && current.kind === target.kind
      && getCheckedNodeContext(current) === getCheckedNodeContext(target);
    if (currentMatches) return false;
    selection = target;
    ensureValidSelection();
    expandParentsForSelection();
    saveUiState();
    return true;
  }

  function getSelectionDescriptor() {
    if (selection.kind === 'environment') return { kind: 'environment', environmentIndex: selection.environmentIndex };
    if (selection.kind === 'library') return { kind: 'library', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex };
    if (selection.kind === 'category') return { kind: 'category', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex };
    if (selection.kind === 'group') return { kind: 'group', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, groupPath: Array.isArray(selection.groupPath) ? selection.groupPath.slice() : [] };
    if (selection.kind === 'function') return { kind: 'function', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, functionIndex: selection.functionIndex, groupPath: Array.isArray(selection.groupPath) ? selection.groupPath.slice() : [] };
    return null;
  }

  function getCheckedItemsForCurrentSelection() {
    const current = getSelectionDescriptor();
    if (!current) return [];
    const context = getCheckedNodeContext(current);
    return Array.from(checkedNodes)
      .map((entry) => deserializeCheckedNode(entry))
      .filter((item) => item && item.kind === current.kind && getCheckedNodeContext(item) === context)
      .sort((a, b) => getCheckedNodeIndex(a) - getCheckedNodeIndex(b));
  }

  function getCheckedSelectionPreferredIndex(items) {
    const current = getSelectionDescriptor();
    const currentSerialized = current ? serializeCheckedNode(current) : '';
    const index = currentSerialized ? (Array.isArray(items) ? items.findIndex((item) => serializeCheckedNode(item) === currentSerialized) : -1) : -1;
    return index >= 0 ? index : 0;
  }

  function applyCheckedMoveSelection(items, preferredIndex) {
    const nextItems = Array.isArray(items) ? items.filter(Boolean) : [];
    checkedNodes.clear();
    nextItems.forEach((item) => checkedNodes.add(serializeCheckedNode(item)));
    if (nextItems.length) {
      const safeIndex = Math.max(0, Math.min(Number(preferredIndex) || 0, nextItems.length - 1));
      selection = nextItems[safeIndex];
    }
    saveUiState();
  }

  function getBulkContainer(item) {
    if (!item) return null;
    if (item.kind === 'environment') return getEnvironments();
    if (item.kind === 'library') {
      const environment = getEnvironment(Number(item.environmentIndex));
      return environment ? (environment.libraries || []) : null;
    }
    if (item.kind === 'category') {
      const library = getLibrary(Number(item.environmentIndex), Number(item.libraryIndex));
      return library ? (library.categories || []) : null;
    }
    if (item.kind === 'group') {
      return getGroupContainer({ kind: 'group', environmentIndex: Number(item.environmentIndex), libraryIndex: Number(item.libraryIndex), categoryIndex: Number(item.categoryIndex), groupPath: Array.isArray(item.groupPath) ? item.groupPath : [] });
    }
    if (item.kind === 'function') {
      return getFunctionContainer({ kind: 'function', environmentIndex: Number(item.environmentIndex), libraryIndex: Number(item.libraryIndex), categoryIndex: Number(item.categoryIndex), functionIndex: Number(item.functionIndex), groupPath: Array.isArray(item.groupPath) ? item.groupPath : [] });
    }
    return null;
  }

  function descriptorWithIndex(item, nextIndex) {
    if (item.kind === 'environment') return { kind: 'environment', environmentIndex: nextIndex };
    if (item.kind === 'library') return { kind: 'library', environmentIndex: item.environmentIndex, libraryIndex: nextIndex };
    if (item.kind === 'category') return { kind: 'category', environmentIndex: item.environmentIndex, libraryIndex: item.libraryIndex, categoryIndex: nextIndex };
    if (item.kind === 'group') return { kind: 'group', environmentIndex: item.environmentIndex, libraryIndex: item.libraryIndex, categoryIndex: item.categoryIndex, groupPath: (Array.isArray(item.groupPath) ? item.groupPath.slice(0, -1) : []).concat(nextIndex) };
    if (item.kind === 'function') return { kind: 'function', environmentIndex: item.environmentIndex, libraryIndex: item.libraryIndex, categoryIndex: item.categoryIndex, functionIndex: nextIndex, groupPath: Array.isArray(item.groupPath) ? item.groupPath.slice() : [] };
    return item;
  }

  function tryMoveCheckedSelection(direction) {
    const items = getCheckedItemsForCurrentSelection();
    if (items.length <= 1) return false;
    const container = getBulkContainer(items[0]);
    if (!Array.isArray(container) || !container.length) return false;
    const indices = items.map((item) => getCheckedNodeIndex(item)).sort((a, b) => a - b);
    const selectedSet = new Set(indices);
    let moved = false;
    if (direction < 0) {
      indices.forEach((index) => {
        if (index > 0 && !selectedSet.has(index - 1)) {
          const temp = container[index - 1];
          container[index - 1] = container[index];
          container[index] = temp;
          selectedSet.delete(index);
          selectedSet.add(index - 1);
          moved = true;
        }
      });
    } else {
      indices.slice().sort((a, b) => b - a).forEach((index) => {
        if (index < container.length - 1 && !selectedSet.has(index + 1)) {
          const temp = container[index + 1];
          container[index + 1] = container[index];
          container[index] = temp;
          selectedSet.delete(index);
          selectedSet.add(index + 1);
          moved = true;
        }
      });
    }
    if (!moved) return true;
    const updatedIndices = Array.from(selectedSet).sort((a, b) => a - b);
    const updatedItems = items.map((item, idx) => descriptorWithIndex(item, updatedIndices[idx]));
    const current = getSelectionDescriptor();
    const currentSerialized = current ? serializeCheckedNode(current) : '';
    checkedNodes.clear();
    updatedItems.forEach((item) => checkedNodes.add(serializeCheckedNode(item)));
    const currentIndex = currentSerialized ? items.findIndex((item) => serializeCheckedNode(item) === currentSerialized) : -1;
    selection = currentIndex >= 0 ? updatedItems[currentIndex] : updatedItems[0];
    saveUiState();
    render();
    return true;
  }

  function renderMultiCheck(item, title) {
    return '<label class="multi-check-wrap" title="' + escapeAttr(title || 'Select for batch move') + '"><input class="multi-check" type="checkbox" data-multi="' + escapeAttr(JSON.stringify(item)) + '"' + (isNodeChecked(item) ? ' checked' : '') + ' /></label>';
  }

  function inferDefaultValue(name, type, editorType) {
    const n = (name || '').toLowerCase();
    const t = (type || '').toLowerCase();
    if (editorType === 'boolean') return '0';
    if (editorType === 'pathFile' || editorType === 'pathFolder') return '""';
    if (editorType === 'handle') {
      if (n.includes('ini')) return 'iniHandle';
      if (n.includes('panel')) return 'panelHandle';
      return '0';
    }
    if (t.includes('char') && t.includes('*')) return '""';
    if (t.includes('*')) return '&value';
    if (t.includes('double') || t.includes('float')) return '0.0';
    if (t.includes('int') || t.includes('size_t') || t.includes('long') || t.includes('short')) return '0';
    return 'value';
  }

  function getSymbolKind(fn) {
    const raw = String(fn?.symbolKind || '').trim();
    if (raw) return raw;
    const category = String(fn?.category || '').trim().toLowerCase();
    const returnType = String(fn?.returnType || '').trim().toLowerCase();
    if (returnType === 'keyword' || category === 'keywords') return 'keyword';
    if (returnType === 'snippet' || category === 'snippets') return 'snippet';
    if (category === 'structs') return 'struct';
    if (category === 'typedefs') return 'typedef';
    if (category === 'enums') return 'enum';
    if (category === 'enum classes') return 'enum_class';
    if (category === 'classes') return 'class';
    return 'function';
  }

  function getSymbolKindLabel(kind) {
    switch (kind) {
      case 'struct': return 'Struct';
      case 'typedef': return 'Typedef';
      case 'enum': return 'Enum';
      case 'enum_class': return 'Enum class';
      case 'class': return 'Class';
      case 'table': return 'Table';
      case 'property': return 'Property';
      case 'variable': return 'Variable';
      case 'reference': return 'Reference';
      case 'method': return 'Method';
      case 'operator': return 'Operator';
      case 'constant': return 'Constant';
      case 'metamethod': return 'Metamethod';
      case 'pitfall': return 'Pitfall';
      case 'keyword': return 'Keyword';
      case 'snippet': return 'Snippet';
      default: return 'Function';
    }
  }

  function isCallableSymbolKind(kind) {
    return kind === 'function' || kind === 'method' || kind === 'metamethod' || kind === 'macro' || kind === 'command';
  }

  function getSymbolKindIcon(kind) {
    switch (kind) {
      case 'struct': return '🏗️';
      case 'typedef': return '🔤';
      case 'enum': return '🔢';
      case 'enum_class': return '🧮';
      case 'class': return '🧱';
      case 'table': return '▦';
      case 'property': return '•';
      case 'variable': return '𝑥';
      case 'reference': return '↗';
      case 'method': return 'ƒ';
      case 'operator': return '±';
      case 'constant': return 'π';
      case 'metamethod': return '◆';
      case 'pitfall': return '⚠';
      case 'macro': return '#';
      case 'command': return '⌘';
      case 'concept': return '∀';
      case 'attribute': return '[@]';
      case 'keyword': return '🔑';
      case 'snippet': return '✂️';
      default: return 'ƒ';
    }
  }

  function symbolKindOptions(selected) {
    const kinds = ['function', 'method', 'macro', 'command', 'concept', 'attribute', 'table', 'property', 'variable', 'reference', 'constant', 'operator', 'metamethod', 'struct', 'typedef', 'enum', 'enum_class', 'class', 'keyword', 'snippet', 'pitfall'];
    return kinds.map((kind) => '<option value="' + escapeAttr(kind) + '"' + (kind === selected ? ' selected' : '') + '>' + escapeHtml(getSymbolKindLabel(kind)) + '</option>').join('');
  }

  function getCategoryItemLabel(categoryName) {
    const value = String(categoryName || '').trim().toLowerCase();
    if (value === 'functions') return 'functions';
    if (value === 'structs') return 'structs';
    if (value === 'typedefs') return 'typedefs';
    if (value === 'enums') return 'enums';
    if (value === 'enum classes') return 'enum classes';
    if (value === 'classes') return 'classes';
    if (value === 'tables') return 'tables';
    if (value === 'properties') return 'properties';
    if (value === 'variables') return 'variables';
    if (value === 'references') return 'references';
    if (value === 'constants') return 'constants';
    if (value === 'attributes') return 'attributes';
    if (value === 'keywords') return 'keywords';
    if (value === 'snippets') return 'snippets';
    return 'symbols';
  }

  function getDefaultEntryForCategory(categoryName, entryName) {
    const category = String(categoryName || '').trim().toLowerCase();
    const name = entryName || 'NewSymbol';
    if (category === 'structs') {
      const decl = 'typedef struct ' + name + ' {\\n    int value;\\n} ' + name + ';';
      return { name, returnType: 'struct', signature: decl, declaration: decl, insertText: decl, description: '', longDescription: '', header: '', returnDescription: '', parameters: [], fields: [{ name: 'value', type: 'int', description: '' }], symbolKind: 'struct' };
    }
    if (category === 'typedefs') {
      const decl = 'typedef int ' + name + ';';
      return { name, returnType: 'typedef', signature: decl, declaration: decl, insertText: decl, description: '', longDescription: '', header: '', returnDescription: '', parameters: [], symbolKind: 'typedef' };
    }
    if (category === 'enums') {
      const enumValue = name.toUpperCase() + '_VALUE';
      const decl = 'typedef enum ' + name + ' {\\n    ' + enumValue + '\\n} ' + name + ';';
      return { name, returnType: 'enum', signature: decl, declaration: decl, insertText: name, description: '', longDescription: '', header: '', returnDescription: '', parameters: [], enumValues: [{ name: enumValue, value: '', description: '' }], symbolKind: 'enum' };
    }
    if (category === 'enum classes') {
      const decl = 'enum class ' + name + ' {\\n    Value\\n};';
      return { name, returnType: 'enum class', signature: decl, declaration: decl, insertText: name, description: '', longDescription: '', header: '', returnDescription: '', parameters: [], enumValues: [{ name: 'Value', value: '', description: '' }], symbolKind: 'enum_class' };
    }
    if (category === 'classes') {
      const decl = 'class ' + name + ' {\\npublic:\\n    ' + name + '() = default;\\n};';
      return { name, returnType: 'class', signature: decl, declaration: decl, insertText: decl, description: '', longDescription: '', header: '', returnDescription: '', parameters: [], fields: [{ name: 'value_', type: 'int', description: '' }], symbolKind: 'class' };
    }
    if (category === 'tables') {
      return { name, returnType: 'table', signature: name, declaration: name, insertText: name, description: '', longDescription: '', header: '', returnDescription: '', parameters: [], fields: [], methods: [], symbolKind: 'table' };
    }
    if (category === 'properties') {
      return { name, returnType: 'any', signature: name, declaration: name, insertText: name, description: '', longDescription: '', header: '', returnDescription: '', parameters: [], symbolKind: 'property' };
    }
    if (category === 'variables') {
      return { name, returnType: 'any', signature: name, declaration: name, insertText: name, description: '', longDescription: '', header: '', returnDescription: '', parameters: [], symbolKind: 'variable' };
    }
    if (category === 'references') {
      return { name, returnType: 'reference', signature: name, declaration: name, insertText: name, description: '', longDescription: '', header: '', returnDescription: '', parameters: [], symbolKind: 'reference' };
    }
    if (category === 'constants') {
      return { name, returnType: 'constant', signature: name, declaration: name, insertText: name, description: '', longDescription: '', header: '', returnDescription: '', parameters: [], symbolKind: 'constant' };
    }
    if (category === 'attributes') {
      return { name, returnType: 'attribute', signature: '[[' + name + ']]', declaration: '[[' + name + ']]', insertText: '[[' + name + ']]', description: '', longDescription: '', header: '', returnDescription: '', parameters: [], symbolKind: 'attribute' };
    }
    if (category === 'keywords') {
      return { name, returnType: 'keyword', signature: name, declaration: name, insertText: name, description: '', longDescription: '', header: '', returnDescription: '', parameters: [], symbolKind: 'keyword' };
    }
    if (category === 'snippets') {
      return { name, returnType: 'snippet', signature: name, declaration: name, insertText: name + '\\n{\\n    \\n}', description: '', longDescription: '', header: '', returnDescription: '', parameters: [], symbolKind: 'snippet' };
    }
    return { name, returnType: 'void', signature: 'void ' + name + ' (void);', declaration: 'void ' + name + ' (void);', insertText: name + '();', description: '', longDescription: '', header: '', returnDescription: '', parameters: [], symbolKind: 'function' };
  }

  function usesPythonStatementStyleLocal(fn) {
    const haystack = String((fn && fn.environment) || '') + ' ' + String((fn && fn.library) || '');
    return haystack.toLowerCase().includes('python');
  }

  function ensureStatementTerminatorLocal(fn, text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return trimmed;
    if (usesPythonStatementStyleLocal(fn)) return trimmed.replace(/;+$/, '');
    return /[;}]$/.test(trimmed) ? trimmed : trimmed + ';';
  }

  function isSimpleCallableTemplateTextLocal(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed || trimmed.includes('\\n')) return false;
    return /^[A-Za-z_~][A-Za-z0-9_:.>\\-]*\\s*\\(/.test(trimmed)
      || /^[A-Za-z_][A-Za-z0-9_]*\\s*->\\s*[A-Za-z_~][A-Za-z0-9_]*\\s*\\(/.test(trimmed)
      || /^[A-Za-z_][A-Za-z0-9_]*\\s*\\.\\s*[A-Za-z_~][A-Za-z0-9_]*\\s*\\(/.test(trimmed);
  }

  function buildSignature(fn) {
    const kind = getSymbolKind(fn);
    if (!isCallableSymbolKind(kind)) {
      return (fn.declaration || fn.signature || fn.insertText || fn.name || '').trim();
    }
    const params = Array.isArray(fn.parameters) ? fn.parameters : [];
    if (usesPythonStatementStyleLocal(fn)) {
      const paramText = params.map((p) => (p.name || 'param') + ((p.type || '').trim() ? ': ' + p.type : '')).join(', ');
      const returnType = String(fn.returnType || '').trim();
      const returnSuffix = returnType && returnType.toLowerCase() !== 'none' && returnType.toLowerCase() !== 'void' ? ' -> ' + returnType : '';
      return (fn.name || 'function') + '(' + paramText + ')' + returnSuffix;
    }
    const paramText = params.length === 0 ? 'void' : params.map((p) => (p.type || 'int') + ' ' + (p.name || 'param')).join(', ');
    return (fn.returnType || 'void') + ' ' + (fn.name || 'Function') + ' (' + paramText + ');';
  }

  function buildPreview(fn) {
    const kind = getSymbolKind(fn);
    const templateText = String(fn.insertText || '');
    const templateParams = Array.isArray(fn.parameters) ? fn.parameters : [];
    if (/\{\{[A-Za-z_][A-Za-z0-9_]*\}\}/.test(templateText) && templateParams.length) {
      let output = templateText;
      templateParams.forEach((param) => {
        const value = (param.defaultValue && String(param.defaultValue).trim()) ? String(param.defaultValue).trim() : inferDefaultValue(param.name, param.type, param.editorType);
        const pattern = new RegExp('\\{\\{' + String(param.name || '') + '\\}\\}', 'g');
        output = output.replace(pattern, value);
      });
      const rendered = output.trim();
      if (isCallableSymbolKind(kind) && isSimpleCallableTemplateTextLocal(rendered)) {
        const call = ensureStatementTerminatorLocal(fn, rendered);
        const returnType = String(fn.returnType || 'void').trim().toLowerCase();
        const returnTarget = previewReturnTarget.trim();
        if (returnTarget && returnType && returnType !== 'void' && returnType !== 'none') {
          return returnTarget + ' = ' + call;
        }
        return call;
      }
      return rendered;
    }
    if (kind === 'snippet' || kind === 'keyword') {
      return String(fn.insertText || fn.signature || fn.name || '').trim();
    }
    if (!isCallableSymbolKind(kind)) {
      return String(fn.declaration || fn.signature || fn.insertText || fn.name || '').trim();
    }
    const params = Array.isArray(fn.parameters) ? fn.parameters : [];
    const args = params.map((p) => (p.defaultValue && p.defaultValue.trim()) ? p.defaultValue.trim() : inferDefaultValue(p.name, p.type, p.editorType));
    const call = ensureStatementTerminatorLocal(fn, (fn.name || 'Function') + '(' + args.join(', ') + ')');
    const returnType = (fn.returnType || 'void').trim().toLowerCase();
    const returnTarget = previewReturnTarget.trim();
    if (returnTarget && returnType && returnType !== 'void' && returnType !== 'none') {
      return returnTarget + ' = ' + call;
    }
    return call;
  }

  function getEnvironments() { pack.environments = Array.isArray(pack.environments) ? pack.environments : []; return pack.environments; }
  function getEnvironment(index) { return getEnvironments()[index]; }
  function getLibrary(environmentIndex, libraryIndex) { const environment = getEnvironment(environmentIndex); return environment && environment.libraries ? environment.libraries[libraryIndex] : undefined; }
  function getCategory(sel) { const lib = getLibrary(sel.environmentIndex, sel.libraryIndex); return lib && lib.categories ? lib.categories[sel.categoryIndex] : undefined; }
  function getCategoryRootFunctions(category) { if (!category) return []; category.functions = Array.isArray(category.functions) ? category.functions : []; return category.functions; }
  function getCategoryGroups(category) { if (!category) return []; category.groups = Array.isArray(category.groups) ? category.groups : []; return category.groups; }
  function getGroupChildren(group) { if (!group) return []; group.groups = Array.isArray(group.groups) ? group.groups : []; return group.groups; }
  function getGroupFunctions(group) { if (!group) return []; group.functions = Array.isArray(group.functions) ? group.functions : []; return group.functions; }
  function getGroup(sel) {
    const category = getCategory(sel);
    let groups = getCategoryGroups(category);
    let current;
    const path = Array.isArray(sel && sel.groupPath) ? sel.groupPath : [];
    for (const index of path) {
      current = groups[index];
      if (!current) return undefined;
      groups = getGroupChildren(current);
    }
    return current;
  }
  function getGroupContainer(sel) {
    const category = getCategory(sel);
    if (!category) return [];
    let groups = getCategoryGroups(category);
    const path = Array.isArray(sel && sel.groupPath) ? sel.groupPath : [];
    if (!path.length) return groups;
    for (let i = 0; i < path.length - 1; i += 1) {
      const current = groups[path[i]];
      if (!current) return [];
      groups = getGroupChildren(current);
    }
    return groups;
  }
  function getFunctionContainer(sel) {
    const path = Array.isArray(sel && sel.groupPath) ? sel.groupPath : [];
    if (path.length) {
      const group = getGroup(sel);
      return getGroupFunctions(group);
    }
    const category = getCategory(sel);
    return getCategoryRootFunctions(category);
  }
  function getFunction(sel) { const list = getFunctionContainer(sel); return list && list[sel.functionIndex]; }
  function flattenGroupFunctions(groups, acc) {
    (Array.isArray(groups) ? groups : []).forEach((group) => {
      getGroupFunctions(group).forEach((fn) => acc.push(fn));
      flattenGroupFunctions(getGroupChildren(group), acc);
    });
    return acc;
  }
  function getCategoryAllFunctionsLocal(category) {
    const acc = [];
    getCategoryRootFunctions(category).forEach((fn) => acc.push(fn));
    flattenGroupFunctions(getCategoryGroups(category), acc);
    return acc;
  }
  function countCategoryGroupsLocal(category) {
    const countGroups = (groups) => (Array.isArray(groups) ? groups.reduce((sum, group) => sum + 1 + countGroups(getGroupChildren(group)), 0) : 0);
    return countGroups(getCategoryGroups(category));
  }
  function countGroupSymbolsLocal(group) {
    return getGroupFunctions(group).length + getGroupChildren(group).reduce((sum, child) => sum + countGroupSymbolsLocal(child), 0);
  }
  function flattenCategoryGroupsLocal(category) {
    const items = [];
    const walk = (groups, path, depth) => {
      (Array.isArray(groups) ? groups : []).forEach((group, index) => {
        const nextPath = path.concat(index);
        items.push({ group: group, path: nextPath, depth: depth });
        walk(getGroupChildren(group), nextPath, depth + 1);
      });
    };
    walk(getCategoryGroups(category), [], 0);
    return items;
  }
  function syncGroupMetadata(group, environmentName, libraryName, categoryName) {
    if (!group) return;
    getGroupFunctions(group).forEach((fn) => {
      fn.environment = environmentName;
      fn.library = libraryName;
      fn.category = categoryName;
    });
    getGroupChildren(group).forEach((child) => syncGroupMetadata(child, environmentName, libraryName, categoryName));
  }
  function syncCategoryMetadata(category, environmentName, libraryName) {
    if (!category) return;
    getCategoryRootFunctions(category).forEach((fn) => {
      fn.environment = environmentName;
      fn.library = libraryName;
      fn.category = category.name || 'Category';
    });
    getCategoryGroups(category).forEach((group) => syncGroupMetadata(group, environmentName, libraryName, category.name || 'Category'));
  }

  function syncLibraryMetadata(library, environmentName) {
    if (!library) return;
    library.categories = Array.isArray(library.categories) ? library.categories : [];
    library.categories.forEach((category) => syncCategoryMetadata(category, environmentName, library.name || 'Library'));
  }

  function environmentKey(index) { return 'env:' + index; }
  function libraryKey(environmentIndex, libraryIndex) { return 'lib:' + environmentIndex + ':' + libraryIndex; }
  function categoryKey(environmentIndex, libraryIndex, categoryIndex) { return 'cat:' + environmentIndex + ':' + libraryIndex + ':' + categoryIndex; }
  function groupKey(environmentIndex, libraryIndex, categoryIndex, groupPath) { return 'grp:' + environmentIndex + ':' + libraryIndex + ':' + categoryIndex + ':' + (Array.isArray(groupPath) ? groupPath.join('.') : ''); }
  function normalize(value) { return String(value || '').toLowerCase(); }

  function ensureExpansionDefaults() {
    if (expandedEnvironments.size > 0 || expandedLibraries.size > 0 || expandedCategories.size > 0 || expandedGroups.size > 0) return;
    // Keep the initial render lightweight for large packs. Environments and
    // libraries are visible immediately, while categories and groups are
    // expanded only on demand or when a selected symbol needs to be revealed.
    getEnvironments().forEach((environment, environmentIndex) => {
      expandedEnvironments.add(environmentKey(environmentIndex));
      (environment.libraries || []).forEach((library, libraryIndex) => {
        expandedLibraries.add(libraryKey(environmentIndex, libraryIndex));
      });
    });
  }

  function expandParentsForSelection() {
    if (selection.kind === 'environment') {
      expandedEnvironments.add(environmentKey(selection.environmentIndex));
      return;
    }
    if (selection.kind === 'library') {
      expandedEnvironments.add(environmentKey(selection.environmentIndex));
      expandedLibraries.add(libraryKey(selection.environmentIndex, selection.libraryIndex));
      return;
    }
    if (selection.kind === 'category') {
      expandedEnvironments.add(environmentKey(selection.environmentIndex));
      expandedLibraries.add(libraryKey(selection.environmentIndex, selection.libraryIndex));
      expandedCategories.add(categoryKey(selection.environmentIndex, selection.libraryIndex, selection.categoryIndex));
      return;
    }
    if (selection.kind === 'group' || selection.kind === 'function') {
      expandedEnvironments.add(environmentKey(selection.environmentIndex));
      expandedLibraries.add(libraryKey(selection.environmentIndex, selection.libraryIndex));
      expandedCategories.add(categoryKey(selection.environmentIndex, selection.libraryIndex, selection.categoryIndex));
      const path = Array.isArray(selection.groupPath) ? selection.groupPath : [];
      const prefix = [];
      path.forEach((index) => {
        prefix.push(index);
        expandedGroups.add(groupKey(selection.environmentIndex, selection.libraryIndex, selection.categoryIndex, prefix));
      });
    }
  }

  function functionMatches(fn, query) {
    if (!query) return true;
    const haystack = [fn.name, fn.returnType, fn.description, fn.header, fn.returnDescription]
      .concat((fn.parameters || []).flatMap((param) => [param.name, param.type, param.description, param.defaultValue, param.placeholder]))
      .join(' ');
    return normalize(haystack).includes(query);
  }

  function groupMatches(group, query) {
    if (!query) return true;
    const selfMatch = normalize((group.name || '') + ' ' + (group.description || '')).includes(query);
    if (selfMatch) return true;
    if (getGroupFunctions(group).some((fn) => functionMatches(fn, query))) return true;
    return getGroupChildren(group).some((child) => groupMatches(child, query));
  }

  function categoryMatches(category, query) {
    if (!query) return true;
    const selfMatch = normalize((category.name || '') + ' ' + (category.description || '')).includes(query);
    if (selfMatch) return true;
    if (getCategoryRootFunctions(category).some((fn) => functionMatches(fn, query))) return true;
    return getCategoryGroups(category).some((group) => groupMatches(group, query));
  }

  function libraryMatches(library, query) {
    if (!query) return true;
    const selfMatch = normalize((library.name || '') + ' ' + (library.description || '')).includes(query);
    return selfMatch || (library.categories || []).some((category) => categoryMatches(category, query));
  }

  function environmentMatches(environment, query) {
    if (!query) return true;
    const selfMatch = normalize((environment.name || '') + ' ' + (environment.description || '')).includes(query);
    return selfMatch || (environment.libraries || []).some((library) => libraryMatches(library, query));
  }

  function ensureValidSelection() {
    if (selection.kind === 'environment' && !getEnvironment(selection.environmentIndex)) selection = { kind: 'pack' };
    if (selection.kind === 'library' && !getLibrary(selection.environmentIndex, selection.libraryIndex)) selection = { kind: 'pack' };
    if (selection.kind === 'category' && !getCategory(selection)) selection = { kind: 'pack' };
    if (selection.kind === 'group' && !getGroup(selection)) selection = { kind: 'category', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex };
    if (selection.kind === 'function' && !getFunction(selection)) selection = { kind: 'category', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex };
  }

  function setSelection(next) { selection = next; ensureValidSelection(); expandParentsForSelection(); saveUiState(); render(); }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escapeAttr(value) { return escapeHtml(value).split(String.fromCharCode(96)).join('&#96;'); }


  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function choiceTextToLine(choice) {
    if (typeof choice === 'string') return choice;
    const parts = [choice && choice.value ? choice.value : ''];
    if (choice && choice.description) parts.push(choice.description);
    if (choice && choice.detail) parts.push(choice.detail);
    return parts.join(' | ');
  }

  function parseChoiceText(text) {
    return String(text || '').split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const parts = line.split('|').map((part) => part.trim());
      if (parts.length <= 1) return parts[0];
      const result = { value: parts[0] };
      if (parts[1]) result.description = parts[1];
      if (parts[2]) result.detail = parts.slice(2).join(' | ');
      return result;
    });
  }

  function stringifyChoiceText(choices) {
    return (Array.isArray(choices) ? choices : []).map((choice) => choiceTextToLine(choice)).join('\\n');
  }


  function parsePickerSourceTypesText(text) {
    return String(text || '').split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);
  }

  function stringifyPickerSourceTypesText(config) {
    const values = Array.isArray(config && config.sourceTypes) ? config.sourceTypes : [];
    return values.filter(Boolean).join('\\n');
  }

  function parseStructuredPickerItemsText(text) {
    const lines = String(text || '').split(/\\r?\\n/);
    const sections = [];
    let currentSection = null;
    let currentGroup = null;

    function ensureSection() {
      if (!currentSection) {
        currentSection = { label: 'Choices', description: '', groups: [] };
        sections.push(currentSection);
      }
      return currentSection;
    }

    function ensureGroup() {
      const section = ensureSection();
      if (!currentGroup) {
        currentGroup = { label: 'Choices', description: '', items: [] };
        section.groups.push(currentGroup);
      }
      return currentGroup;
    }

    lines.forEach((rawLine) => {
      const line = String(rawLine || '').trim();
      if (!line) return;
      if (/^(?:#|\\/\\/)/.test(line)) return;
      if (/^\\[section\\]/i.test(line)) {
        const payload = line.replace(/^\\[section\\]\\s*/i, '');
        const parts = payload.split('|').map((part) => part.trim());
        currentSection = { label: parts[0] || 'Choices', description: parts[1] || '', groups: [] };
        sections.push(currentSection);
        currentGroup = null;
        return;
      }
      if (/^\\[group\\]/i.test(line) || /^\\{group\\}/i.test(line)) {
        const payload = line.replace(/^(?:\\[group\\]|\\{group\\})\\s*/i, '');
        const parts = payload.split('|').map((part) => part.trim());
        currentGroup = { label: parts[0] || 'Choices', description: parts[1] || '', items: [] };
        ensureSection().groups.push(currentGroup);
        return;
      }
      const parts = line.split('|').map((part) => part.trim());
      const value = parts[0] || '';
      if (!value) return;
      const label = parts[1] || value;
      const description = parts[2] || '';
      const defaultValue = parts[3] || '';
      const sourceTypes = parts[4] ? parts[4].split(',').map((part) => part.trim()).filter(Boolean) : [];
      ensureGroup().items.push({ value, label, description, defaultValue, sourceTypes });
    });

    return sections.filter((section) => Array.isArray(section.groups) && section.groups.some((group) => Array.isArray(group.items) && group.items.length));
  }

  function stringifyStructuredPickerItemsText(config) {
    const sections = Array.isArray(config && config.sections) ? config.sections : [];
    const lines = [];
    sections.forEach((section, sectionIndex) => {
      const sectionLabel = String(section && section.label || '').trim();
      const sectionDescription = String(section && section.description || '').trim();
      const groups = Array.isArray(section && section.groups) ? section.groups : [];
      const meaningfulSection = sectionLabel && sectionLabel !== 'Choices';
      if (meaningfulSection || sectionDescription || sectionIndex > 0) {
        lines.push('[Section] ' + (sectionLabel || 'Choices') + (sectionDescription ? ' | ' + sectionDescription : ''));
      }
      groups.forEach((group, groupIndex) => {
        const groupLabel = String(group && group.label || '').trim();
        const groupDescription = String(group && group.description || '').trim();
        const items = Array.isArray(group && group.items) ? group.items : [];
        const meaningfulGroup = groupLabel && groupLabel !== 'Choices';
        if (meaningfulGroup || groupDescription || groupIndex > 0 || lines.length > 0) {
          lines.push('[Group] ' + (groupLabel || 'Choices') + (groupDescription ? ' | ' + groupDescription : ''));
        }
        items.forEach((item) => {
          const parts = [item && item.value ? item.value : '', item && item.label ? item.label : '', item && item.description ? item.description : '', item && item.defaultValue ? item.defaultValue : '', Array.isArray(item && item.sourceTypes) ? item.sourceTypes.join(', ') : ''];
          while (parts.length > 1 && !parts[parts.length - 1]) parts.pop();
          lines.push(parts.join(' | '));
        });
      });
    });
    return lines.join('\\n');
  }

  function getBuiltInPickerTemplateKeyForEditor(fn, paramIndex) {
    const name = fn && fn.name ? String(fn.name).trim().toLowerCase() : '';
    return name + '::' + String(paramIndex);
  }

  function getBuiltInPickerTemplateForEditor(fn, paramIndex) {
    if (!fn || !Array.isArray(fn.parameters) || !fn.parameters[paramIndex]) return null;
    const template = builtInPickerTemplates[getBuiltInPickerTemplateKeyForEditor(fn, paramIndex)];
    return template ? clonePickerData(template) : null;
  }

  function ensureParamPickerConfig(param, fn, paramIndex) {
    if (!param.pickerConfig || typeof param.pickerConfig !== 'object') {
      const builtInTemplate = typeof paramIndex === 'number' ? getBuiltInPickerTemplateForEditor(fn, paramIndex) : null;
      param.pickerConfig = builtInTemplate || { title: '', selectionLabel: 'Selected value', sourceTypes: [], sections: [], applyDefaultIfEmpty: false };
    }
    if (!Array.isArray(param.pickerConfig.sourceTypes)) param.pickerConfig.sourceTypes = [];
    if (!Array.isArray(param.pickerConfig.sections)) param.pickerConfig.sections = [];
    if (!String(param.pickerConfig.selectionLabel || '').trim()) param.pickerConfig.selectionLabel = 'Selected value';
    if (typeof param.pickerConfig.multiSelect !== 'boolean') param.pickerConfig.multiSelect = false;
    if (!String(param.pickerConfig.valueSeparator || '').length) param.pickerConfig.valueSeparator = ' | ';
    if (typeof param.pickerConfig.emptyValue !== 'string') param.pickerConfig.emptyValue = '';
    return param.pickerConfig;
  }


  function buildPickerItemsFromChoiceList(choices) {
    const normalized = Array.isArray(choices) ? choices : [];
    if (!normalized.length) return [];
    return [{ label: 'Choices', description: '', groups: [{ label: 'Choices', description: '', items: normalized.map((choice) => ({
      value: String(choice && choice.value || '').trim(),
      label: String(choice && choice.value || '').trim(),
      description: String(choice && (choice.description || choice.detail) || '').trim(),
      defaultValue: '',
      sourceTypes: []
    })).filter((item) => item.value) }] }];
  }

  function loadPickerExample(paramIndex, mode) {
    const fn = getFunction(selection);
    if (!fn || !Array.isArray(fn.parameters) || !fn.parameters[paramIndex]) return;
    const param = fn.parameters[paramIndex];
    const config = ensureParamPickerConfig(param);
    config.title = String(config.title || '').trim() || ('Select value for ' + (param.name || ('param' + (paramIndex + 1))));
    if (mode === 'simple') {
      config.sourceTypes = [];
      config.sections = parseStructuredPickerItemsText('VAL_ONE | First choice | Short description\\nVAL_TWO | Second choice | Another description');
    } else if (mode === 'structured') {
      config.sourceTypes = ['Numeric', 'Graph'];
      config.sections = parseStructuredPickerItemsText('[Section] Common | Shared choices\\n[Group] Colors | Foreground and background\\nATTR_TEXT_COLOR | Text color | Change the text color | VAL_WHITE | Numeric, Graph\\nATTR_TEXT_BGCOLOR | Background color | Change the background color | VAL_BLACK | Numeric\\n[Group] Style | Font style options\\nATTR_BOLD | Bold | Toggle bold style | 1 | Numeric');
    } else if (mode === 'choices') {
      const imported = normalizeChoices([...(Array.isArray(param.presets) ? param.presets : []), ...(Array.isArray(param.options) ? param.options : [])]);
      if (!imported.length) {
        alert('This parameter does not have presets or options to import yet.');
        return;
      }
      config.sections = buildPickerItemsFromChoiceList(imported);
      config.sourceTypes = [];
    } else if (mode === 'builtIn') {
      const builtInTemplate = getBuiltInPickerTemplateForEditor(fn, paramIndex);
      if (!builtInTemplate) {
        alert('No built-in picker template is available for this parameter.');
        return;
      }
      param.pickerConfig = clonePickerData(builtInTemplate);
    }
    render();
    updateValidationUi();
  }

  function createEmptyPickerItem() {
    return { value: '', label: '', description: '', detail: '', defaultValue: '', sourceTypes: [] };
  }

  function createEmptyPickerGroup() {
    return { label: 'Choices', description: '', items: [createEmptyPickerItem()] };
  }

  function createEmptyPickerSection() {
    return { label: 'Choices', description: '', groups: [createEmptyPickerGroup()] };
  }

  function parseCsvChoiceList(text) {
    return String(text || '').split(',').map((part) => part.trim()).filter(Boolean);
  }

  function stringifyCsvChoiceList(values) {
    return Array.isArray(values) ? values.map((entry) => String(entry || '').trim()).filter(Boolean).join(', ') : '';
  }

  function clonePickerData(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function getPickerGroupCount(section) {
    return Array.isArray(section && section.groups) ? section.groups.length : 0;
  }

  function getPickerItemCountInGroup(group) {
    return Array.isArray(group && group.items) ? group.items.length : 0;
  }

  function getPickerItemCountInSection(section) {
    return (Array.isArray(section && section.groups) ? section.groups : []).reduce((total, group) => total + getPickerItemCountInGroup(group), 0);
  }

  function getPickerTotalGroupCount(config) {
    return (Array.isArray(config && config.sections) ? config.sections : []).reduce((total, section) => total + getPickerGroupCount(section), 0);
  }

  function getPickerTotalItemCount(config) {
    return (Array.isArray(config && config.sections) ? config.sections : []).reduce((total, section) => total + getPickerItemCountInSection(section), 0);
  }

  function buildPickerSummaryMeta(parts) {
    return parts.filter(Boolean).map((part) => '<span class="picker-stat">' + escapeHtml(String(part)) + '</span>').join('');
  }

  function buildPickerSectionSummary(section, sectionIndex) {
    const label = String(section && section.label || '').trim() || ('Section ' + (sectionIndex + 1));
    const description = String(section && section.description || '').trim();
    return '<span class="picker-card-title">Section ' + (sectionIndex + 1) + ' · ' + escapeHtml(label) + '</span>'
      + '<span class="picker-card-meta">' + buildPickerSummaryMeta([
        getPickerGroupCount(section) + ' group' + (getPickerGroupCount(section) === 1 ? '' : 's'),
        getPickerItemCountInSection(section) + ' item' + (getPickerItemCountInSection(section) === 1 ? '' : 's'),
        description || ''
      ]) + '</span>';
  }

  function buildPickerGroupSummary(group, groupIndex) {
    const label = String(group && group.label || '').trim() || ('Group ' + (groupIndex + 1));
    const description = String(group && group.description || '').trim();
    return '<span class="picker-card-title">Group ' + (groupIndex + 1) + ' · ' + escapeHtml(label) + '</span>'
      + '<span class="picker-card-meta">' + buildPickerSummaryMeta([
        getPickerItemCountInGroup(group) + ' item' + (getPickerItemCountInGroup(group) === 1 ? '' : 's'),
        description || ''
      ]) + '</span>';
  }

  function buildPickerItemSummary(item, itemIndex) {
    const value = String(item && item.value || '').trim();
    const label = String(item && item.label || '').trim();
    const description = String(item && item.description || '').trim();
    return '<span class="picker-card-title">Item ' + (itemIndex + 1) + ' · ' + escapeHtml(value || label || 'New item') + '</span>'
      + '<span class="picker-card-meta">' + buildPickerSummaryMeta([
        label && label !== value ? label : '',
        description || ''
      ]) + '</span>';
  }

  function getPickerConfigForEditor(fn, paramIndex) {
    if (!fn || !Array.isArray(fn.parameters) || !fn.parameters[paramIndex]) return null;
    return ensureParamPickerConfig(fn.parameters[paramIndex], fn, paramIndex);
  }

  function capturePickerPanelScrollState() {
    if (!editorBodyEl) return {};
    const next = {};
    editorBodyEl.querySelectorAll('[data-picker-scroll-id]').forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const key = String(node.getAttribute('data-picker-scroll-id') || '').trim();
      if (!key) return;
      next[key] = { top: node.scrollTop, left: node.scrollLeft };
    });
    pickerPanelScrollState = next;
    return clonePickerData(next) || {};
  }

  function restorePickerPanelScrollState(state) {
    const snapshot = state && typeof state === 'object' ? state : pickerPanelScrollState;
    if (!editorBodyEl || !snapshot || typeof snapshot !== 'object') return;
    const apply = () => {
      editorBodyEl.querySelectorAll('[data-picker-scroll-id]').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const key = String(node.getAttribute('data-picker-scroll-id') || '').trim();
        const saved = key ? snapshot[key] : null;
        if (!saved || typeof saved !== 'object') return;
        if (Number.isFinite(Number(saved.top))) node.scrollTop = Number(saved.top);
        if (Number.isFinite(Number(saved.left))) node.scrollLeft = Number(saved.left);
      });
    };
    window.requestAnimationFrame(() => {
      apply();
      window.requestAnimationFrame(apply);
    });
  }

  function setPickerEditorSelection(next, shouldRender) {
    const shouldRefresh = shouldRender !== false;
    const scrollState = shouldRefresh ? capturePickerPanelScrollState() : null;
    pickerEditorSelection = next && typeof next === 'object' ? clonePickerData(next) : null;
    saveUiState();
    if (shouldRefresh) {
      render();
      restorePickerPanelScrollState(scrollState);
    }
  }

  function normalizePickerEditorSelection(paramIndex, config, candidate) {
    const sourceTypes = Array.isArray(config && config.sourceTypes) ? config.sourceTypes : [];
    const sections = Array.isArray(config && config.sections) ? config.sections : [];
    const node = candidate && typeof candidate === 'object' ? candidate : {};
    const normalizedParamIndex = Number(paramIndex);
    if (Number(node.paramIndex) !== normalizedParamIndex) {
      return { paramIndex: normalizedParamIndex, nodeType: 'root' };
    }
    const base = { paramIndex: normalizedParamIndex, nodeType: 'root' };
    const sourceIndex = Number(node.sourceIndex);
    const sectionIndex = Number(node.sectionIndex);
    const groupIndex = Number(node.groupIndex);
    const itemIndex = Number(node.itemIndex);
    if (node.nodeType === 'source' && sourceIndex >= 0 && sourceIndex < sourceTypes.length) {
      return { paramIndex: normalizedParamIndex, nodeType: 'source', sourceIndex: sourceIndex };
    }
    if (node.nodeType === 'section' && sectionIndex >= 0 && sectionIndex < sections.length) {
      return { paramIndex: normalizedParamIndex, nodeType: 'section', sectionIndex: sectionIndex };
    }
    if ((node.nodeType === 'group' || node.nodeType === 'item') && sectionIndex >= 0 && sectionIndex < sections.length) {
      const section = sections[sectionIndex];
      const groups = Array.isArray(section && section.groups) ? section.groups : [];
      if (groupIndex >= 0 && groupIndex < groups.length) {
        if (node.nodeType === 'group') {
          return { paramIndex: normalizedParamIndex, nodeType: 'group', sectionIndex: sectionIndex, groupIndex: groupIndex };
        }
        const group = groups[groupIndex];
        const items = Array.isArray(group && group.items) ? group.items : [];
        if (itemIndex >= 0 && itemIndex < items.length) {
          return { paramIndex: normalizedParamIndex, nodeType: 'item', sectionIndex: sectionIndex, groupIndex: groupIndex, itemIndex: itemIndex };
        }
        return { paramIndex: normalizedParamIndex, nodeType: 'group', sectionIndex: sectionIndex, groupIndex: groupIndex };
      }
      return { paramIndex: normalizedParamIndex, nodeType: 'section', sectionIndex: sectionIndex };
    }
    return base;
  }

  function getPickerEditorSelection(paramIndex, config) {
    const normalized = normalizePickerEditorSelection(paramIndex, config, pickerEditorSelection);
    const current = pickerEditorSelection && typeof pickerEditorSelection === 'object' ? pickerEditorSelection : null;
    const sameParam = !!current && Number(current.paramIndex) === Number(paramIndex);
    const changed = JSON.stringify(normalized) !== JSON.stringify(current);
    if (sameParam && changed) {
      pickerEditorSelection = clonePickerData(normalized);
      saveUiState();
    }
    return normalized;
  }

  function buildPickerSelectionChips(selectionNode, config) {
    const chips = ['Popup'];
    const sourceTypes = Array.isArray(config && config.sourceTypes) ? config.sourceTypes : [];
    const sections = Array.isArray(config && config.sections) ? config.sections : [];
    if (selectionNode && selectionNode.nodeType === 'source') {
      chips.push('Source type');
      chips.push(String(sourceTypes[selectionNode.sourceIndex] || ('Source ' + (selectionNode.sourceIndex + 1))));
    }
    if (selectionNode && typeof selectionNode.sectionIndex === 'number' && selectionNode.sectionIndex >= 0 && selectionNode.sectionIndex < sections.length) {
      const section = sections[selectionNode.sectionIndex];
      chips.push(String(section && section.label || ('Section ' + (selectionNode.sectionIndex + 1))) || ('Section ' + (selectionNode.sectionIndex + 1)));
      const groups = Array.isArray(section && section.groups) ? section.groups : [];
      if (selectionNode && typeof selectionNode.groupIndex === 'number' && selectionNode.groupIndex >= 0 && selectionNode.groupIndex < groups.length) {
        const group = groups[selectionNode.groupIndex];
        chips.push(String(group && group.label || ('Group ' + (selectionNode.groupIndex + 1))) || ('Group ' + (selectionNode.groupIndex + 1)));
        const items = Array.isArray(group && group.items) ? group.items : [];
        if (selectionNode && typeof selectionNode.itemIndex === 'number' && selectionNode.itemIndex >= 0 && selectionNode.itemIndex < items.length) {
          const item = items[selectionNode.itemIndex];
          chips.push(String(item && (item.value || item.label) || ('Item ' + (selectionNode.itemIndex + 1))) || ('Item ' + (selectionNode.itemIndex + 1)));
        }
      }
    }
    return chips.map((chip) => '<span class="picker-path-chip">' + escapeHtml(String(chip || '')) + '</span>').join('');
  }

  function pickerItemMatchesSourceType(item, sourceType) {
    const filter = String(sourceType || '').trim();
    if (!filter) return true;
    const allowed = Array.isArray(item && item.sourceTypes) ? item.sourceTypes.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
    if (!allowed.length) return true;
    return allowed.includes('All') || allowed.includes(filter);
  }

  function addPickerSourceType(paramIndex) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    if (!config) return;
    config.sourceTypes = Array.isArray(config.sourceTypes) ? config.sourceTypes : [];
    config.sourceTypes.push('New source');
    setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'source', sourceIndex: config.sourceTypes.length - 1 });
  }

  function movePickerSourceType(paramIndex, sourceIndex, delta) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    if (!config || !Array.isArray(config.sourceTypes)) return;
    const nextIndex = sourceIndex + delta;
    if (sourceIndex < 0 || sourceIndex >= config.sourceTypes.length || nextIndex < 0 || nextIndex >= config.sourceTypes.length) return;
    const item = config.sourceTypes.splice(sourceIndex, 1)[0];
    config.sourceTypes.splice(nextIndex, 0, item);
    setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'source', sourceIndex: nextIndex });
  }

  function deletePickerSourceType(paramIndex, sourceIndex) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    if (!config || !Array.isArray(config.sourceTypes)) return;
    config.sourceTypes.splice(sourceIndex, 1);
    if (config.sourceTypes.length) {
      const nextIndex = Math.min(sourceIndex, config.sourceTypes.length - 1);
      setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'source', sourceIndex: nextIndex });
    } else {
      setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'root' });
    }
  }

  function addPickerSection(paramIndex) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    if (!config) return;
    config.sections = Array.isArray(config.sections) ? config.sections : [];
    config.sections.push(createEmptyPickerSection());
    setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'section', sectionIndex: config.sections.length - 1 });
  }

  function movePickerSection(paramIndex, sectionIndex, delta) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    if (!config || !Array.isArray(config.sections)) return;
    const nextIndex = sectionIndex + delta;
    if (sectionIndex < 0 || sectionIndex >= config.sections.length || nextIndex < 0 || nextIndex >= config.sections.length) return;
    const item = config.sections.splice(sectionIndex, 1)[0];
    config.sections.splice(nextIndex, 0, item);
    setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'section', sectionIndex: nextIndex });
  }

  function deletePickerSection(paramIndex, sectionIndex) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    if (!config || !Array.isArray(config.sections)) return;
    config.sections.splice(sectionIndex, 1);
    if (config.sections.length) {
      const nextIndex = Math.min(sectionIndex, config.sections.length - 1);
      setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'section', sectionIndex: nextIndex });
    } else {
      setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'root' });
    }
  }

  function duplicatePickerSection(paramIndex, sectionIndex) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    const section = config && Array.isArray(config.sections) ? config.sections[sectionIndex] : null;
    if (!section || !Array.isArray(config.sections)) return;
    config.sections.splice(sectionIndex + 1, 0, clonePickerData(section));
    setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'section', sectionIndex: sectionIndex + 1 });
  }

  function addPickerGroup(paramIndex, sectionIndex) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    if (!config || !Array.isArray(config.sections) || !config.sections[sectionIndex]) return;
    const section = config.sections[sectionIndex];
    section.groups = Array.isArray(section.groups) ? section.groups : [];
    section.groups.push(createEmptyPickerGroup());
    setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'group', sectionIndex: sectionIndex, groupIndex: section.groups.length - 1 });
  }

  function movePickerGroup(paramIndex, sectionIndex, groupIndex, delta) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    const section = config && Array.isArray(config.sections) ? config.sections[sectionIndex] : null;
    if (!section || !Array.isArray(section.groups)) return;
    const nextIndex = groupIndex + delta;
    if (groupIndex < 0 || groupIndex >= section.groups.length || nextIndex < 0 || nextIndex >= section.groups.length) return;
    const item = section.groups.splice(groupIndex, 1)[0];
    section.groups.splice(nextIndex, 0, item);
    setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'group', sectionIndex: sectionIndex, groupIndex: nextIndex });
  }

  function deletePickerGroup(paramIndex, sectionIndex, groupIndex) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    const section = config && Array.isArray(config.sections) ? config.sections[sectionIndex] : null;
    if (!section || !Array.isArray(section.groups)) return;
    section.groups.splice(groupIndex, 1);
    if (section.groups.length) {
      const nextIndex = Math.min(groupIndex, section.groups.length - 1);
      setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'group', sectionIndex: sectionIndex, groupIndex: nextIndex });
    } else {
      setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'section', sectionIndex: sectionIndex });
    }
  }

  function duplicatePickerGroup(paramIndex, sectionIndex, groupIndex) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    const section = config && Array.isArray(config.sections) ? config.sections[sectionIndex] : null;
    const group = section && Array.isArray(section.groups) ? section.groups[groupIndex] : null;
    if (!group || !Array.isArray(section.groups)) return;
    section.groups.splice(groupIndex + 1, 0, clonePickerData(group));
    setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'group', sectionIndex: sectionIndex, groupIndex: groupIndex + 1 });
  }

  function addPickerItem(paramIndex, sectionIndex, groupIndex) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    const section = config && Array.isArray(config.sections) ? config.sections[sectionIndex] : null;
    const group = section && Array.isArray(section.groups) ? section.groups[groupIndex] : null;
    if (!group) return;
    group.items = Array.isArray(group.items) ? group.items : [];
    group.items.push(createEmptyPickerItem());
    setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'item', sectionIndex: sectionIndex, groupIndex: groupIndex, itemIndex: group.items.length - 1 });
  }

  function movePickerItem(paramIndex, sectionIndex, groupIndex, itemIndex, delta) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    const section = config && Array.isArray(config.sections) ? config.sections[sectionIndex] : null;
    const group = section && Array.isArray(section.groups) ? section.groups[groupIndex] : null;
    if (!group || !Array.isArray(group.items)) return;
    const nextIndex = itemIndex + delta;
    if (itemIndex < 0 || itemIndex >= group.items.length || nextIndex < 0 || nextIndex >= group.items.length) return;
    const item = group.items.splice(itemIndex, 1)[0];
    group.items.splice(nextIndex, 0, item);
    setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'item', sectionIndex: sectionIndex, groupIndex: groupIndex, itemIndex: nextIndex });
  }

  function deletePickerItem(paramIndex, sectionIndex, groupIndex, itemIndex) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    const section = config && Array.isArray(config.sections) ? config.sections[sectionIndex] : null;
    const group = section && Array.isArray(section.groups) ? section.groups[groupIndex] : null;
    if (!group || !Array.isArray(group.items)) return;
    group.items.splice(itemIndex, 1);
    if (group.items.length) {
      const nextIndex = Math.min(itemIndex, group.items.length - 1);
      setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'item', sectionIndex: sectionIndex, groupIndex: groupIndex, itemIndex: nextIndex });
    } else {
      setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'group', sectionIndex: sectionIndex, groupIndex: groupIndex });
    }
  }

  function duplicatePickerItem(paramIndex, sectionIndex, groupIndex, itemIndex) {
    const fn = getFunction(selection);
    const config = getPickerConfigForEditor(fn, paramIndex);
    const section = config && Array.isArray(config.sections) ? config.sections[sectionIndex] : null;
    const group = section && Array.isArray(section.groups) ? section.groups[groupIndex] : null;
    const item = group && Array.isArray(group.items) ? group.items[itemIndex] : null;
    if (!item || !Array.isArray(group.items)) return;
    group.items.splice(itemIndex + 1, 0, clonePickerData(item));
    setPickerEditorSelection({ paramIndex: paramIndex, nodeType: 'item', sectionIndex: sectionIndex, groupIndex: groupIndex, itemIndex: itemIndex + 1 });
  }

  function renderPickerVisualBuilder(param, paramIndex) {
    const pickerEnabled = !!(param && param.pickerConfig);
    const config = param && param.pickerConfig ? param.pickerConfig : { sourceTypes: [], sections: [] };
    const sourceTypes = Array.isArray(config.sourceTypes) ? config.sourceTypes : [];
    const sections = Array.isArray(config.sections) ? config.sections : [];
    const totalGroups = getPickerTotalGroupCount(config);
    const totalItems = getPickerTotalItemCount(config);
    const selectedNode = getPickerEditorSelection(paramIndex, config);
    const selectedSectionIndex = typeof selectedNode.sectionIndex === 'number' ? selectedNode.sectionIndex : -1;
    const selectedGroupIndex = typeof selectedNode.groupIndex === 'number' ? selectedNode.groupIndex : -1;
    const canAddGroup = selectedSectionIndex >= 0 && selectedSectionIndex < sections.length;
    const canAddItem = canAddGroup && selectedGroupIndex >= 0 && selectedGroupIndex < (Array.isArray(sections[selectedSectionIndex] && sections[selectedSectionIndex].groups) ? sections[selectedSectionIndex].groups.length : 0);

    const outlineRows = [];
    const renderOutlineNode = (label, metaHtml, depth, active, attrs) => '<button type="button" class="picker-outline-node' + (active ? ' active' : '') + '" ' + attrs + '>'
      + '<span class="picker-outline-node-main" style="padding-left:' + String(10 + (depth * 18)) + 'px;">'
      + '<span class="picker-outline-node-label">' + escapeHtml(String(label || '')) + '</span>'
      + (metaHtml ? '<span class="picker-outline-node-meta">' + metaHtml + '</span>' : '')
      + '</span></button>';

    outlineRows.push('<div class="picker-outline-title">Popup</div>');
    outlineRows.push(renderOutlineNode(
      'Overview',
      buildPickerSummaryMeta([
        sections.length + ' section' + (sections.length === 1 ? '' : 's'),
        totalGroups + ' group' + (totalGroups === 1 ? '' : 's'),
        totalItems + ' item' + (totalItems === 1 ? '' : 's')
      ]),
      0,
      selectedNode.nodeType === 'root',
      'data-action="selectPickerNode" data-param-index="' + paramIndex + '" data-picker-node-type="root"'
    ));

    outlineRows.push('<div class="picker-outline-title">Source types</div>');
    if (sourceTypes.length) {
      sourceTypes.forEach((entry, sourceIndex) => {
        const count = sections.reduce((sum, section) => sum + (Array.isArray(section && section.groups) ? section.groups : []).reduce((groupTotal, group) => groupTotal + (Array.isArray(group && group.items) ? group.items.filter((item) => pickerItemMatchesSourceType(item, entry)).length : 0), 0), 0);
        outlineRows.push(renderOutlineNode(
          entry || ('Source ' + (sourceIndex + 1)),
          buildPickerSummaryMeta([count + ' matching item' + (count === 1 ? '' : 's')]),
          1,
          selectedNode.nodeType === 'source' && selectedNode.sourceIndex === sourceIndex,
          'data-action="selectPickerNode" data-param-index="' + paramIndex + '" data-picker-node-type="source" data-picker-source-index="' + sourceIndex + '"'
        ));
      });
    } else {
      outlineRows.push('<div class="picker-outline-empty">No source types yet. Leave this empty if the popup should not show a left filter column.</div>');
    }

    outlineRows.push('<div class="picker-outline-title">Sections, groups, items</div>');
    if (sections.length) {
      sections.forEach((section, sectionIndex) => {
        outlineRows.push(renderOutlineNode(
          'Section ' + (sectionIndex + 1) + ' · ' + (String(section && section.label || '').trim() || 'Untitled section'),
          buildPickerSummaryMeta([
            getPickerGroupCount(section) + ' group' + (getPickerGroupCount(section) === 1 ? '' : 's'),
            getPickerItemCountInSection(section) + ' item' + (getPickerItemCountInSection(section) === 1 ? '' : 's')
          ]),
          1,
          selectedNode.nodeType === 'section' && selectedNode.sectionIndex === sectionIndex,
          'data-action="selectPickerNode" data-param-index="' + paramIndex + '" data-picker-node-type="section" data-picker-section-index="' + sectionIndex + '"'
        ));
        (Array.isArray(section && section.groups) ? section.groups : []).forEach((group, groupIndex) => {
          outlineRows.push(renderOutlineNode(
            'Group ' + (groupIndex + 1) + ' · ' + (String(group && group.label || '').trim() || 'Untitled group'),
            buildPickerSummaryMeta([
              getPickerItemCountInGroup(group) + ' item' + (getPickerItemCountInGroup(group) === 1 ? '' : 's')
            ]),
            2,
            selectedNode.nodeType === 'group' && selectedNode.sectionIndex === sectionIndex && selectedNode.groupIndex === groupIndex,
            'data-action="selectPickerNode" data-param-index="' + paramIndex + '" data-picker-node-type="group" data-picker-section-index="' + sectionIndex + '" data-picker-group-index="' + groupIndex + '"'
          ));
          (Array.isArray(group && group.items) ? group.items : []).forEach((item, itemIndex) => {
            const itemLabel = String(item && (item.value || item.label) || '').trim() || ('Item ' + (itemIndex + 1));
            const itemMeta = [];
            if (String(item && item.label || '').trim() && String(item.label).trim() !== String(item && item.value || '').trim()) itemMeta.push(String(item.label).trim());
            if (String(item && item.description || '').trim()) itemMeta.push(String(item.description).trim());
            outlineRows.push(renderOutlineNode(
              itemLabel,
              buildPickerSummaryMeta(itemMeta),
              3,
              selectedNode.nodeType === 'item' && selectedNode.sectionIndex === sectionIndex && selectedNode.groupIndex === groupIndex && selectedNode.itemIndex === itemIndex,
              'data-action="selectPickerNode" data-param-index="' + paramIndex + '" data-picker-node-type="item" data-picker-section-index="' + sectionIndex + '" data-picker-group-index="' + groupIndex + '" data-picker-item-index="' + itemIndex + '"'
            ));
          });
        });
      });
    } else {
      outlineRows.push('<div class="picker-outline-empty">No sections yet. Add one section, then add groups and items inside it.</div>');
    }

    let inspectorTitle = 'Popup overview';
    let inspectorSubtitle = 'Select a node in the outline to edit it. This V3 builder separates structure, details, and preview.';
    let inspectorActions = '';
    let inspectorBody = '';
    const chips = buildPickerSelectionChips(selectedNode, config);

    if (selectedNode.nodeType === 'source' && sourceTypes[selectedNode.sourceIndex] != null) {
      inspectorTitle = 'Source type';
      inspectorSubtitle = 'This entry appears in the left filter column of the popup.';
      inspectorActions = '<button class="action secondary" data-action="movePickerSourceTypeUp" data-param-index="' + paramIndex + '" data-picker-source-index="' + selectedNode.sourceIndex + '" ' + ((writable && pickerEnabled && selectedNode.sourceIndex > 0) ? '' : 'disabled') + '>↑ Move up</button>'
        + '<button class="action secondary" data-action="movePickerSourceTypeDown" data-param-index="' + paramIndex + '" data-picker-source-index="' + selectedNode.sourceIndex + '" ' + ((writable && pickerEnabled && selectedNode.sourceIndex < sourceTypes.length - 1) ? '' : 'disabled') + '>↓ Move down</button>'
        + '<button class="action danger" data-action="deletePickerSourceType" data-param-index="' + paramIndex + '" data-picker-source-index="' + selectedNode.sourceIndex + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '>Delete source type</button>';
      inspectorBody = '<div class="grid">'
        + '<label>Source type name<input type="text" data-param-index="' + paramIndex + '" data-picker-source-index="' + selectedNode.sourceIndex + '" data-picker-source-field="value" value="' + escapeAttr(sourceTypes[selectedNode.sourceIndex] || '') + '" placeholder="Numeric, Graph, Table..." ' + ((writable && pickerEnabled) ? '' : 'disabled') + '></label>'
        + '</div>'
        + '<div class="tiny" style="margin-top:8px;">Items with matching source types are highlighted in the live preview. Leave item source types empty if they must remain visible for every source type.</div>';
    } else if (selectedNode.nodeType === 'section' && sections[selectedNode.sectionIndex]) {
      const section = sections[selectedNode.sectionIndex];
      inspectorTitle = 'Section ' + (selectedNode.sectionIndex + 1);
      inspectorSubtitle = 'Top-level block displayed in the popup. Each section contains one or more groups.';
      inspectorActions = '<button class="action secondary" data-action="movePickerSectionUp" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" ' + ((writable && pickerEnabled && selectedNode.sectionIndex > 0) ? '' : 'disabled') + '>↑ Move up</button>'
        + '<button class="action secondary" data-action="movePickerSectionDown" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" ' + ((writable && pickerEnabled && selectedNode.sectionIndex < sections.length - 1) ? '' : 'disabled') + '>↓ Move down</button>'
        + '<button class="action secondary" data-action="duplicatePickerSection" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '>Duplicate</button>'
        + '<button class="action secondary" data-action="addPickerGroup" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '>+ Group</button>'
        + '<button class="action danger" data-action="deletePickerSection" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '>Delete section</button>';
      inspectorBody = '<div class="grid">'
        + '<label>Section label<input type="text" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-section-field="label" value="' + escapeAttr(section && section.label || '') + '" placeholder="Control appearance" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '></label>'
        + '<label>Section description<input type="text" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-section-field="description" value="' + escapeAttr(section && section.description || '') + '" placeholder="Optional helper text for the section" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '></label>'
        + '</div>'
        + '<div class="picker-summary-grid" style="margin-top:10px;">'
        + '<div class="picker-summary-card"><strong>' + getPickerGroupCount(section) + '</strong>Groups</div>'
        + '<div class="picker-summary-card"><strong>' + getPickerItemCountInSection(section) + '</strong>Items</div>'
        + '</div>';
    } else if (selectedNode.nodeType === 'group' && sections[selectedNode.sectionIndex] && Array.isArray(sections[selectedNode.sectionIndex].groups) && sections[selectedNode.sectionIndex].groups[selectedNode.groupIndex]) {
      const group = sections[selectedNode.sectionIndex].groups[selectedNode.groupIndex];
      const section = sections[selectedNode.sectionIndex];
      inspectorTitle = 'Group ' + (selectedNode.groupIndex + 1);
      inspectorSubtitle = 'Second level inside the section. Use groups to cluster related choices.';
      inspectorActions = '<button class="action secondary" data-action="movePickerGroupUp" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" ' + ((writable && pickerEnabled && selectedNode.groupIndex > 0) ? '' : 'disabled') + '>↑ Move up</button>'
        + '<button class="action secondary" data-action="movePickerGroupDown" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" ' + ((writable && pickerEnabled && selectedNode.groupIndex < (Array.isArray(section && section.groups) ? section.groups.length - 1 : -1)) ? '' : 'disabled') + '>↓ Move down</button>'
        + '<button class="action secondary" data-action="duplicatePickerGroup" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '>Duplicate</button>'
        + '<button class="action secondary" data-action="addPickerItem" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '>+ Item</button>'
        + '<button class="action danger" data-action="deletePickerGroup" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '>Delete group</button>';
      inspectorBody = '<div class="grid">'
        + '<label>Group label<input type="text" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" data-picker-group-field="label" value="' + escapeAttr(group && group.label || '') + '" placeholder="Axis names" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '></label>'
        + '<label>Group description<input type="text" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" data-picker-group-field="description" value="' + escapeAttr(group && group.description || '') + '" placeholder="Optional helper text" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '></label>'
        + '</div>'
        + '<div class="picker-summary-grid" style="margin-top:10px;">'
        + '<div class="picker-summary-card"><strong>' + getPickerItemCountInGroup(group) + '</strong>Items in this group</div>'
        + '</div>';
    } else if (selectedNode.nodeType === 'item' && sections[selectedNode.sectionIndex] && Array.isArray(sections[selectedNode.sectionIndex].groups) && sections[selectedNode.sectionIndex].groups[selectedNode.groupIndex] && Array.isArray(sections[selectedNode.sectionIndex].groups[selectedNode.groupIndex].items) && sections[selectedNode.sectionIndex].groups[selectedNode.groupIndex].items[selectedNode.itemIndex]) {
      const group = sections[selectedNode.sectionIndex].groups[selectedNode.groupIndex];
      const item = group.items[selectedNode.itemIndex];
      inspectorTitle = 'Item ' + (selectedNode.itemIndex + 1);
      inspectorSubtitle = 'Final selectable choice. This is the constant/value sent back to the parameter form.';
      inspectorActions = '<button class="action secondary" data-action="movePickerItemUp" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" data-picker-item-index="' + selectedNode.itemIndex + '" ' + ((writable && pickerEnabled && selectedNode.itemIndex > 0) ? '' : 'disabled') + '>↑ Move up</button>'
        + '<button class="action secondary" data-action="movePickerItemDown" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" data-picker-item-index="' + selectedNode.itemIndex + '" ' + ((writable && pickerEnabled && selectedNode.itemIndex < group.items.length - 1) ? '' : 'disabled') + '>↓ Move down</button>'
        + '<button class="action secondary" data-action="duplicatePickerItem" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" data-picker-item-index="' + selectedNode.itemIndex + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '>Duplicate</button>'
        + '<button class="action danger" data-action="deletePickerItem" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" data-picker-item-index="' + selectedNode.itemIndex + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '>Delete item</button>';
      inspectorBody = '<div class="grid">'
        + '<label>Value / constant<input type="text" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" data-picker-item-index="' + selectedNode.itemIndex + '" data-picker-item-field="value" value="' + escapeAttr(item && item.value || '') + '" placeholder="ATTR_TEXT_COLOR" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '></label>'
        + '<label>Label<input type="text" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" data-picker-item-index="' + selectedNode.itemIndex + '" data-picker-item-field="label" value="' + escapeAttr(item && item.label || '') + '" placeholder="Text color" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '></label>'
        + '<label>Description<input type="text" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" data-picker-item-index="' + selectedNode.itemIndex + '" data-picker-item-field="description" value="' + escapeAttr(item && item.description || '') + '" placeholder="Shown in the lower description area" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '></label>'
        + '<label>Detail / context<input type="text" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" data-picker-item-index="' + selectedNode.itemIndex + '" data-picker-item-field="detail" value="' + escapeAttr(item && item.detail || '') + '" placeholder="Extra detail used by the popup filter or detail line" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '></label>'
        + '<label>Suggested value<input type="text" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" data-picker-item-index="' + selectedNode.itemIndex + '" data-picker-item-field="defaultValue" value="' + escapeAttr(item && item.defaultValue || '') + '" placeholder="Optional linked value" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '></label>'
        + '<label style="grid-column: 1 / -1;">Applies to source types<input type="text" placeholder="Numeric, Graph" data-param-index="' + paramIndex + '" data-picker-section-index="' + selectedNode.sectionIndex + '" data-picker-group-index="' + selectedNode.groupIndex + '" data-picker-item-index="' + selectedNode.itemIndex + '" data-picker-item-field="sourceTypesText" value="' + escapeAttr(stringifyCsvChoiceList(item && item.sourceTypes)) + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '></label>'
        + '</div>';
    } else {
      inspectorActions = '<button class="action secondary" data-action="addPickerSourceType" data-param-index="' + paramIndex + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '>+ Source type</button>'
        + '<button class="action secondary" data-action="addPickerSection" data-param-index="' + paramIndex + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '>+ Section</button>';
      inspectorBody = '<div class="picker-summary-grid">'
        + '<div class="picker-summary-card"><strong>' + sourceTypes.length + '</strong>Source type' + (sourceTypes.length === 1 ? '' : 's') + '</div>'
        + '<div class="picker-summary-card"><strong>' + sections.length + '</strong>Section' + (sections.length === 1 ? '' : 's') + '</div>'
        + '<div class="picker-summary-card"><strong>' + totalGroups + '</strong>Group' + (totalGroups === 1 ? '' : 's') + '</div>'
        + '<div class="picker-summary-card"><strong>' + totalItems + '</strong>Item' + (totalItems === 1 ? '' : 's') + '</div>'
        + '</div>'
        + '<div class="tiny" style="margin-top:10px;">Workflow: add a section, add one or more groups inside it, then add items. The preview on the right lets you check the resulting popup structure without leaving the editor.</div>';
    }

    const activeSourceType = selectedNode.nodeType === 'source' && sourceTypes[selectedNode.sourceIndex] ? String(sourceTypes[selectedNode.sourceIndex]) : '';
    const previewSections = sections.map((section, sectionIndex) => {
      const groups = (Array.isArray(section && section.groups) ? section.groups : []).map((group, groupIndex) => {
        const items = (Array.isArray(group && group.items) ? group.items : []).filter((item) => pickerItemMatchesSourceType(item, activeSourceType));
        if (!items.length) return '';
        const itemRows = items.map((item, itemIndex) => {
          const originalIndex = (Array.isArray(group && group.items) ? group.items : []).indexOf(item);
          const itemActive = selectedNode.nodeType === 'item' && selectedNode.sectionIndex === sectionIndex && selectedNode.groupIndex === groupIndex && selectedNode.itemIndex === originalIndex;
          const label = String(item && item.label || '').trim();
          const metaBits = [];
          if (item && item.defaultValue) metaBits.push('Suggested: ' + String(item.defaultValue));
          if (Array.isArray(item && item.sourceTypes) && item.sourceTypes.length) metaBits.push(String(item.sourceTypes.join(', ')));
          return '<div class="picker-preview-item' + (itemActive ? ' active' : '') + '">'
            + '<div class="picker-preview-item-value">' + escapeHtml(String(item && (item.value || item.label) || '')) + '</div>'
            + (label && label !== String(item && item.value || '').trim() ? '<div class="picker-preview-item-label">' + escapeHtml(label) + '</div>' : '')
            + ((item && (item.description || item.detail)) ? '<div class="picker-preview-item-desc">' + escapeHtml(String(item.description || item.detail || '')) + '</div>' : '')
            + (metaBits.length ? '<div class="picker-preview-item-meta">' + metaBits.map((bit) => '<span class="picker-stat">' + escapeHtml(String(bit)) + '</span>').join('') + '</div>' : '')
            + '</div>';
        }).join('');
        const groupActive = (selectedNode.nodeType === 'group' || selectedNode.nodeType === 'item') && selectedNode.sectionIndex === sectionIndex && selectedNode.groupIndex === groupIndex;
        return '<div class="picker-preview-group' + (groupActive ? ' active' : '') + '">'
          + '<div class="picker-preview-group-title">' + escapeHtml(String(group && group.label || 'Choices')) + '</div>'
          + (group && group.description ? '<div class="picker-preview-group-desc">' + escapeHtml(String(group.description)) + '</div>' : '')
          + '<div class="picker-preview-item-list">' + itemRows + '</div>'
          + '</div>';
      }).filter(Boolean).join('');
      if (!groups) return '';
      const sectionActive = (selectedNode.nodeType === 'section' || selectedNode.nodeType === 'group' || selectedNode.nodeType === 'item') && selectedNode.sectionIndex === sectionIndex;
      return '<div class="picker-preview-section' + (sectionActive ? ' active' : '') + '">'
        + '<div class="picker-preview-section-title">' + escapeHtml(String(section && section.label || 'Choices')) + '</div>'
        + (section && section.description ? '<div class="picker-preview-section-desc">' + escapeHtml(String(section.description)) + '</div>' : '')
        + groups
        + '</div>';
    }).filter(Boolean).join('');

    const previewSidebar = sourceTypes.length
      ? '<div class="picker-preview-sidebar">'
        + '<div class="picker-outline-title" style="margin-top:0;">Source types</div>'
        + sourceTypes.map((entry, sourceIndex) => '<div class="picker-preview-chip' + ((selectedNode.nodeType === 'source' && selectedNode.sourceIndex === sourceIndex) ? ' active' : '') + '">' + escapeHtml(entry || ('Source ' + (sourceIndex + 1))) + '</div>').join('')
        + '</div>'
      : '';

    const previewSelectionText = (() => {
      if (selectedNode.nodeType === 'item' && sections[selectedNode.sectionIndex] && Array.isArray(sections[selectedNode.sectionIndex].groups) && sections[selectedNode.sectionIndex].groups[selectedNode.groupIndex] && Array.isArray(sections[selectedNode.sectionIndex].groups[selectedNode.groupIndex].items) && sections[selectedNode.sectionIndex].groups[selectedNode.groupIndex].items[selectedNode.itemIndex]) {
        const item = sections[selectedNode.sectionIndex].groups[selectedNode.groupIndex].items[selectedNode.itemIndex];
        return '<strong>' + escapeHtml(String(config.selectionLabel || 'Selected value')) + '</strong><div>' + escapeHtml(String(item && (item.value || item.label) || '')) + '</div><div class="tiny">' + escapeHtml(String(item && (item.description || item.detail) || 'Choose an item to inspect it.')) + '</div>';
      }
      return '<strong>' + escapeHtml(String(config.selectionLabel || 'Selected value')) + '</strong><div>No item selected in the builder.</div><div class="tiny">Select an item in the outline to inspect the final returned constant.</div>';
    })();

    return '<div class="picker-builder-stats">'
      + buildPickerSummaryMeta([
        sourceTypes.length + ' source type' + (sourceTypes.length === 1 ? '' : 's'),
        sections.length + ' section' + (sections.length === 1 ? '' : 's'),
        totalGroups + ' group' + (totalGroups === 1 ? '' : 's'),
        totalItems + ' item' + (totalItems === 1 ? '' : 's')
      ])
      + '</div>'
      + '<div class="picker-builder-toolbar">'
      + '<button class="action secondary" data-action="addPickerSourceType" data-param-index="' + paramIndex + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '>+ Source type</button>'
      + '<button class="action secondary" data-action="addPickerSection" data-param-index="' + paramIndex + '" ' + ((writable && pickerEnabled) ? '' : 'disabled') + '>+ Section</button>'
      + '<button class="action secondary" data-action="addPickerGroup" data-param-index="' + paramIndex + '" data-picker-section-index="' + (canAddGroup ? selectedSectionIndex : 0) + '" ' + ((writable && pickerEnabled && canAddGroup) ? '' : 'disabled') + '>+ Group</button>'
      + '<button class="action secondary" data-action="addPickerItem" data-param-index="' + paramIndex + '" data-picker-section-index="' + (canAddGroup ? selectedSectionIndex : 0) + '" data-picker-group-index="' + (canAddItem ? selectedGroupIndex : 0) + '" ' + ((writable && pickerEnabled && canAddItem) ? '' : 'disabled') + '>+ Item</button>'
      + '<div class="tiny">V3 tree builder: select a node on the left, edit it in the center, and verify the resulting popup on the right.</div>'
      + '</div>'
      + '<div class="picker-builder-layout-v3">'
      + '<div class="picker-builder-panel"><div class="picker-builder-panel-header"><strong>Structure outline</strong></div><div class="tiny" style="margin-bottom:8px;">This is the popup hierarchy: source types on the left column, then sections, groups, and items.</div><div class="picker-builder-panel-scroll outline-scroll" data-picker-scroll-id="picker-outline-' + paramIndex + '"><div class="picker-outline">' + outlineRows.join('') + '</div></div></div>'
      + '<div class="picker-builder-panel"><div class="picker-builder-panel-header"><strong>Inspector</strong></div><div class="picker-builder-panel-scroll inspector-scroll" data-picker-scroll-id="picker-inspector-' + paramIndex + '"><div class="picker-path">' + chips + '</div><div class="picker-inspector-title">' + escapeHtml(inspectorTitle) + '</div><div class="picker-inspector-subtitle">' + escapeHtml(inspectorSubtitle) + '</div><div class="picker-inspector-actions">' + inspectorActions + '</div>' + inspectorBody + '</div></div>'
      + '<div class="picker-builder-panel preview-panel"><div class="picker-builder-panel-header"><strong>Popup preview</strong></div><div class="tiny" style="margin-bottom:8px;">Visual approximation of the final ... selection window. Selecting a source type in the outline filters this preview.</div><div class="picker-builder-panel-scroll preview-scroll" data-picker-scroll-id="picker-preview-' + paramIndex + '"><div class="picker-preview-window"><div class="picker-preview-top"><div class="picker-preview-title">' + escapeHtml(String(config.title || 'Selection window')) + '</div><div class="picker-preview-subtitle">' + escapeHtml(String(config.subtitle || 'Choose a value, then apply it back into the parameter form.')) + '</div></div><div class="picker-preview-body' + (sourceTypes.length ? '' : ' no-sidebar') + '">' + previewSidebar + '<div class="picker-preview-main">' + (previewSections || '<div class="picker-preview-empty">No visible sections yet. Add a section, then a group, then at least one item.</div>') + '</div></div><div class="picker-preview-footer">' + previewSelectionText + (activeSourceType ? '<div class="tiny">Preview filtered by source type: ' + escapeHtml(activeSourceType) + '</div>' : '') + '</div></div></div></div>'
      + '</div>';
  }



  function buildFieldDeclaration(field) {
    const type = String(field && field.type || '').trim() || 'int';
    const name = String(field && field.name || '').trim() || 'value';
    return type + ' ' + name + ';';
  }

  function buildEnumValueDeclaration(item) {
    const name = String(item && item.name || '').trim() || 'Value';
    const value = String(item && item.value || '').trim();
    return value ? (name + ' = ' + value) : name;
  }


  function methodAccessOptions(selected) {
    return ['public', 'protected', 'private'].map((value) => '<option value="' + value + '" ' + (selected === value ? 'selected' : '') + '>' + value + '</option>').join('');
  }

  function editorTypeOptions(selected) {
    return [
      { value: 'text', label: 'Text' },
      { value: 'boolean', label: 'Boolean' },
      { value: 'enum', label: 'Enum' },
      { value: 'pathFile', label: 'File path' },
      { value: 'pathFolder', label: 'Folder path' },
      { value: 'handle', label: 'Handle' }
    ].map((item) => '<option value="' + item.value + '" ' + (selected === item.value ? 'selected' : '') + '>' + item.label + '</option>').join('');
  }

  function methodKindOptions(selected) {
    return ['method', 'constructor', 'destructor', 'operator'].map((value) => '<option value="' + value + '" ' + (selected === value ? 'selected' : '') + '>' + value + '</option>').join('');
  }

  function normalizeMethodSignature(signature, method) {
    const raw = String(signature || method && (method.declaration || method.signature) || '').trim();
    if (!raw) return '';
    const normalized = normalizePrototypeWhitespace(raw).replace(/;+$/, '').trim();
    return normalized ? (normalized + ';') : '';
  }

  function splitMethodQualifiers(method) {
    const tokens = Array.isArray(method && method.qualifiers) ? method.qualifiers.map((item) => String(item || '').trim()).filter(Boolean) : [];
    const prefixKeywords = new Set(['virtual', 'static', 'inline', 'constexpr', 'explicit', 'friend', 'extern', 'mutable']);
    const prefix = [];
    const suffix = [];
    tokens.forEach((token) => {
      if (prefixKeywords.has(token) || /^__(?:declspec|attribute)\\b/.test(token) || /^\\[\\[/.test(token)) prefix.push(token);
      else suffix.push(token);
    });
    return { prefix, suffix };
  }

  function buildMethodSignatureFromMetadata(method, className) {
    if (!method) return '';
    const classBase = String(className || 'MyClass').trim().replace(/^.*::/, '') || 'MyClass';
    const kind = String(method.methodKind || 'method');
    let name = String(method.name || '').trim();
    let returnType = normalizePrototypeWhitespace(method.returnType || '');
    if (kind === 'constructor') {
      name = classBase;
      returnType = '';
    } else if (kind === 'destructor') {
      name = '~' + classBase;
      returnType = '';
    } else if (kind === 'operator') {
      if (!/^operator\\b/.test(name)) {
        name = name ? ('operator ' + name.replace(/^operator\\s*/, '')) : 'operator ==';
      }
      if (!returnType) returnType = 'auto';
    } else {
      if (!name || /^~/.test(name) || name === classBase) name = 'method';
      if (!returnType) returnType = 'void';
    }
    method.name = name;
    method.returnType = returnType || undefined;
    const params = normalizePrototypeWhitespace(method.paramsText || '');
    const split = splitMethodQualifiers(method);
    const parts = [];
    if (split.prefix.length) parts.push(split.prefix.join(' '));
    if (kind !== 'constructor' && kind !== 'destructor' && returnType) parts.push(returnType);
    parts.push(name + '(' + params + ')');
    let built = parts.filter(Boolean).join(' ');
    if (split.suffix.length) built += ' ' + split.suffix.join(' ');
    return normalizeMethodSignature(built, method);
  }

  function updateMethodMetadataFromSignature(method, className) {
    if (!method) return;
    const parsed = parseCppMethod(String(method.signature || method.declaration || ''), className, normalizeAccessLabel(method.access || 'public', 'public'), method.description || '');
    if (parsed) {
      method.name = parsed.name;
      method.returnType = parsed.returnType;
      method.qualifiers = parsed.qualifiers;
      method.paramsText = parsed.paramsText || '';
      method.methodKind = parsed.methodKind;
      method.declaration = parsed.declaration;
      method.signature = parsed.signature;
    } else {
      const normalized = normalizeMethodSignature(method.signature || method.declaration || '', method);
      method.signature = normalized;
      method.declaration = normalized;
      if (!method.name) method.name = 'method';
      if (typeof method.paramsText !== 'string') method.paramsText = '';
    }
  }

  function rebuildMethodFromMetadata(method, className) {
    if (!method) return;
    const signature = buildMethodSignatureFromMetadata(method, className);
    method.signature = signature;
    method.declaration = signature;
    updateMethodMetadataFromSignature(method, className);
  }

  function buildMethodDeclaration(method) {
    return normalizeMethodSignature(method && (method.declaration || method.signature) || '', method);
  }

  function syncCompositeDeclaration(fn) {
    if (!fn) return;
    const kind = getSymbolKind(fn);
    const name = String(fn.name || 'Symbol').trim() || 'Symbol';
    const existingDecl = String(fn.declaration || fn.signature || '').trim();
    if (kind === 'struct') {
      const useTypedef = /^\\s*typedef\\s+struct\\b/i.test(existingDecl) || !existingDecl;
      const fields = Array.isArray(fn.fields) ? fn.fields : [];
      const body = fields.length ? fields.map((field) => '    ' + buildFieldDeclaration(field)).join('\\n') : '    /* empty */';
      const decl = (useTypedef ? ('typedef struct ' + name) : ('struct ' + name)) + ' {\\n' + body + '\\n}' + (useTypedef ? (' ' + name + ';') : ';');
      fn.declaration = decl;
      fn.signature = decl;
      fn.insertText = decl;
      if (!fn.returnType || String(fn.returnType).trim().toLowerCase() === 'function') fn.returnType = 'struct';
      return;
    }
    if (kind === 'class') {
      const fields = Array.isArray(fn.fields) ? fn.fields : [];
      const methods = Array.isArray(fn.methods) ? fn.methods : [];
      const sections = ['public', 'protected', 'private'];
      const sectionLines = [];
      sections.forEach((access) => {
        const fieldLines = fields
          .filter((field) => String(field && field.access || 'private') === access)
          .map((field) => '    ' + buildFieldDeclaration(field));
        const methodLines = methods
          .filter((method) => String(method && method.access || 'public') === access)
          .map((method) => '    ' + buildMethodDeclaration(method));
        const lines = [...fieldLines, ...methodLines].filter(Boolean);
        if (lines.length) {
          sectionLines.push(access + ':');
          sectionLines.push(...lines);
        }
      });
      if (!sectionLines.length) {
        sectionLines.push('public:');
        sectionLines.push('    ' + name + '() = default;');
      }
      const body = sectionLines.join('\\n');
      const decl = 'class ' + name + ' {\\n' + body + '\\n};';
      fn.declaration = decl;
      fn.signature = decl;
      fn.insertText = decl;
      if (!fn.returnType || String(fn.returnType).trim().toLowerCase() === 'function') fn.returnType = 'class';
      return;
    }
    if (kind === 'enum') {
      const useTypedef = /^\\s*typedef\\s+enum\\b/i.test(existingDecl) || !existingDecl;
      const values = Array.isArray(fn.enumValues) ? fn.enumValues : [];
      const body = values.length ? values.map((item, index) => '    ' + buildEnumValueDeclaration(item) + (index < values.length - 1 ? ',' : '')).join('\\n') : '    VALUE';
      const decl = (useTypedef ? ('typedef enum ' + name) : ('enum ' + name)) + ' {\\n' + body + '\\n}' + (useTypedef ? (' ' + name + ';') : ';');
      fn.declaration = decl;
      fn.signature = decl;
      if (!fn.insertText || fn.insertText === fn.name || /^typedef\\s+enum\\b/i.test(String(fn.insertText || ''))) fn.insertText = name;
      if (!fn.returnType || String(fn.returnType).trim().toLowerCase() === 'function') fn.returnType = 'enum';
      return;
    }
    if (kind === 'enum_class') {
      const values = Array.isArray(fn.enumValues) ? fn.enumValues : [];
      const body = values.length ? values.map((item, index) => '    ' + buildEnumValueDeclaration(item) + (index < values.length - 1 ? ',' : '')).join('\\n') : '    Value';
      const decl = 'enum class ' + name + ' {\\n' + body + '\\n};';
      fn.declaration = decl;
      fn.signature = decl;
      if (!fn.insertText || fn.insertText === fn.name || /^enum\\s+class\\b/i.test(String(fn.insertText || ''))) fn.insertText = name;
      if (!fn.returnType || String(fn.returnType).trim().toLowerCase() === 'function') fn.returnType = 'enum class';
      return;
    }
  }

  function uniqueName(base, existingNames) {
    const existing = new Set((existingNames || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
    const cleanBase = String(base || 'Item').trim() || 'Item';
    if (!existing.has(cleanBase.toLowerCase())) return cleanBase;
    let index = 2;
    let candidate = cleanBase + ' ' + index;
    while (existing.has(candidate.toLowerCase())) {
      index += 1;
      candidate = cleanBase + ' ' + index;
    }
    return candidate;
  }

  function validatePack() {
    const messages = [];
    if (!String(pack.name || '').trim()) messages.push('Pack name is required.');

    function validateFunction(fn, functionIndex, scopeLabel, siblingNames) {
      const functionName = String(fn.name || '').trim();
      const functionLabel = functionName || ('Function #' + (functionIndex + 1));
      if (!functionName) messages.push('[' + scopeLabel + '] Function #' + (functionIndex + 1) + ' must have a name.');
      const functionKey = functionName;
      if (functionName && siblingNames.has(functionKey)) messages.push('[' + scopeLabel + '] Duplicate function name: ' + functionName + '.');
      if (functionName) siblingNames.add(functionKey);
      if (!String(fn.returnType || '').trim()) messages.push('[' + scopeLabel + ' / ' + functionLabel + '] Return type is required.');

      const parameterNames = new Set();
      (Array.isArray(fn.parameters) ? fn.parameters : []).forEach((param, paramIndex) => {
        const paramName = String(param.name || '').trim();
        if (!paramName) messages.push('[' + functionLabel + '] Parameter #' + (paramIndex + 1) + ' must have a name.');
        const paramKey = paramName.toLowerCase();
        if (paramName && parameterNames.has(paramKey)) messages.push('[' + functionLabel + '] Duplicate parameter name: ' + paramName + '.');
        if (paramName) parameterNames.add(paramKey);
        if (!String(param.type || '').trim()) messages.push('[' + functionLabel + '] Parameter ' + (paramName || ('#' + (paramIndex + 1))) + ' must have a type.');
      });
    }

    function validateGroup(group, groupIndex, scopeLabel, siblingNames) {
      const groupName = String(group?.name || '').trim();
      const groupLabel = groupName || ('Group #' + (groupIndex + 1));
      if (!groupName) messages.push('[' + scopeLabel + '] Group #' + (groupIndex + 1) + ' must have a name.');
      const groupKey = groupName.toLowerCase();
      if (groupName && siblingNames.has(groupKey)) messages.push('[' + scopeLabel + '] Duplicate group name: ' + groupName + '.');
      if (groupName) siblingNames.add(groupKey);

      const functionNames = new Set();
      (Array.isArray(group?.functions) ? group.functions : []).forEach((fn, functionIndex) => {
        validateFunction(fn, functionIndex, scopeLabel + ' / ' + groupLabel, functionNames);
      });

      const childGroupNames = new Set();
      (Array.isArray(group?.groups) ? group.groups : []).forEach((child, childIndex) => {
        validateGroup(child, childIndex, scopeLabel + ' / ' + groupLabel, childGroupNames);
      });
    }

    const environmentNames = new Set();
    getEnvironments().forEach((environment, environmentIndex) => {
      const environmentName = String(environment.name || '').trim();
      const environmentLabel = environmentName || ('Environment #' + (environmentIndex + 1));
      if (!environmentName) messages.push('Environment #' + (environmentIndex + 1) + ' must have a name.');
      const environmentKey = environmentName.toLowerCase();
      if (environmentName && environmentNames.has(environmentKey)) messages.push('Duplicate environment name: ' + environmentName + '.');
      if (environmentName) environmentNames.add(environmentKey);

      const libraryNames = new Set();
      (environment.libraries || []).forEach((library, libraryIndex) => {
        const libraryName = String(library.name || '').trim();
        const libraryLabel = libraryName || ('Library #' + (libraryIndex + 1));
        if (!libraryName) messages.push('[' + environmentLabel + '] Library #' + (libraryIndex + 1) + ' must have a name.');
        const libKey = libraryName.toLowerCase();
        if (libraryName && libraryNames.has(libKey)) messages.push('[' + environmentLabel + '] Duplicate library name: ' + libraryName + '.');
        if (libraryName) libraryNames.add(libKey);

        const categoryNames = new Set();
        (library.categories || []).forEach((category, categoryIndex) => {
          const categoryName = String(category.name || '').trim();
          const categoryLabel = categoryName || ('Category #' + (categoryIndex + 1));
          if (!categoryName) messages.push('[' + environmentLabel + ' / ' + libraryLabel + '] Category #' + (categoryIndex + 1) + ' must have a name.');
          const categoryKey = categoryName.toLowerCase();
          if (categoryName && categoryNames.has(categoryKey)) messages.push('[' + environmentLabel + ' / ' + libraryLabel + '] Duplicate category name: ' + categoryName + '.');
          if (categoryName) categoryNames.add(categoryKey);

          const functionNames = new Set();
          (Array.isArray(category.functions) ? category.functions : []).forEach((fn, functionIndex) => {
            validateFunction(fn, functionIndex, environmentLabel + ' / ' + libraryLabel + ' / ' + categoryLabel, functionNames);
          });

          const groupNames = new Set();
          (Array.isArray(category.groups) ? category.groups : []).forEach((group, groupIndex) => {
            validateGroup(group, groupIndex, environmentLabel + ' / ' + libraryLabel + ' / ' + categoryLabel, groupNames);
          });
        });
      });
    });
    return messages;
  }

  function getCurrentValidationMessages() {
    const messages = validatePack();
    return messages.slice(0, 12);
  }

  function renderValidationCard(messages) {
    if (!messages || messages.length === 0) return '';
    return '<div class="card validation-card"><h3>Validation</h3><div class="meta-line">Save is disabled while validation issues remain.</div><ul>'
      + messages.map((message) => '<li>' + escapeHtml(message) + '</li>').join('')
      + '</ul></div>';
  }

  function getSelectionPathParts() {
    if (selection.kind === 'pack') {
      return ['Pack'];
    }
    if (selection.kind === 'environment') {
      const environment = getEnvironment(selection.environmentIndex);
      return ['Pack', environment ? environment.name || 'Environment' : 'Environment'];
    }
    if (selection.kind === 'library') {
      const environment = getEnvironment(selection.environmentIndex);
      const library = getLibrary(selection.environmentIndex, selection.libraryIndex);
      return ['Pack', environment ? environment.name || 'Environment' : 'Environment', library ? library.name || 'Library' : 'Library'];
    }
    if (selection.kind === 'category') {
      const environment = getEnvironment(selection.environmentIndex);
      const library = getLibrary(selection.environmentIndex, selection.libraryIndex);
      const category = getCategory(selection);
      return ['Pack', environment ? environment.name || 'Environment' : 'Environment', library ? library.name || 'Library' : 'Library', category ? category.name || 'Category' : 'Category'];
    }
    if (selection.kind === 'group') {
      const environment = getEnvironment(selection.environmentIndex);
      const library = getLibrary(selection.environmentIndex, selection.libraryIndex);
      const category = getCategory(selection);
      const parts = ['Pack', environment ? environment.name || 'Environment' : 'Environment', library ? library.name || 'Library' : 'Library', category ? category.name || 'Category' : 'Category'];
      let path = [];
      (Array.isArray(selection.groupPath) ? selection.groupPath : []).forEach((index) => {
        path.push(index);
        const group = getGroup({ kind: 'group', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, groupPath: path.slice() });
        parts.push(group ? group.name || 'Group' : 'Group');
      });
      return parts;
    }
    const environment = getEnvironment(selection.environmentIndex);
    const library = getLibrary(selection.environmentIndex, selection.libraryIndex);
    const category = getCategory(selection);
    const fn = getFunction(selection);
    const parts = ['Pack', environment ? environment.name || 'Environment' : 'Environment', library ? library.name || 'Library' : 'Library', category ? category.name || 'Category' : 'Category'];
    let path = [];
    (Array.isArray(selection.groupPath) ? selection.groupPath : []).forEach((index) => {
      path.push(index);
      const group = getGroup({ kind: 'group', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, groupPath: path.slice() });
      parts.push(group ? group.name || 'Group' : 'Group');
    });
    parts.push(fn ? fn.name || 'Function' : 'Function');
    return parts;
  }

  function renderSelectionPath() {
    const parts = getSelectionPathParts();
    return '<div class="breadcrumbs">' + parts.map((part, index) => '<span class="crumb">' + escapeHtml(index === 0 ? '📦 ' + part : part) + '</span>').join('') + '</div>';
  }

  function updateSelectionPathUi() {
    if (selectionPathEl) {
      selectionPathEl.textContent = getSelectionPathParts().join(' › ');
    }
  }

  function getHeaderDeleteState() {
    if (!selection || selection.kind === 'pack') {
      return { enabled: false, label: 'Delete selection', deleteKind: '' };
    }
    const checked = getCheckedItemsForCurrentSelection();
    if (selection.kind === 'environment') {
      return { enabled: true, label: checked.length > 1 ? 'Delete selected environments (' + checked.length + ')' : 'Delete environment', deleteKind: 'deleteEnvironment' };
    }
    if (selection.kind === 'library') {
      return { enabled: true, label: checked.length > 1 ? 'Delete selected libraries (' + checked.length + ')' : 'Delete library', deleteKind: 'deleteLibrary' };
    }
    if (selection.kind === 'category') {
      return { enabled: true, label: checked.length > 1 ? 'Delete selected categories (' + checked.length + ')' : 'Delete category', deleteKind: 'deleteCategory' };
    }
    if (selection.kind === 'group') {
      return { enabled: true, label: checked.length > 1 ? 'Delete selected groups (' + checked.length + ')' : 'Delete group', deleteKind: 'deleteGroup' };
    }
    if (selection.kind === 'function') {
      const fn = getFunction(selection);
      const symbolLabel = getSymbolKindLabel(getSymbolKind(fn));
      return { enabled: true, label: checked.length > 1 ? 'Delete selected symbols (' + checked.length + ')' : 'Delete ' + symbolLabel.toLowerCase(), deleteKind: 'deleteFunction' };
    }
    return { enabled: false, label: 'Delete selection', deleteKind: '' };
  }

  function syncHeaderState() {
    updateSelectionPathUi();
    const validationErrors = validatePack();
    if (savePackBtn) {
      if (!writable || validationErrors.length > 0) savePackBtn.setAttribute('disabled', 'disabled');
      else savePackBtn.removeAttribute('disabled');
    }
    if (!writable) {
      modeBadgeEl.textContent = 'Read-only';
    } else {
      modeBadgeEl.textContent = meta.source + ' • editable' + (validationErrors.length ? ' • ' + validationErrors.length + ' issue(s)' : '');
    }
    if (deleteSelectionBtn instanceof HTMLButtonElement) {
      const deleteState = getHeaderDeleteState();
      deleteSelectionBtn.textContent = deleteState.label;
      if (!writable || !deleteState.enabled) deleteSelectionBtn.setAttribute('disabled', 'disabled');
      else deleteSelectionBtn.removeAttribute('disabled');
    }
  }

  function renameSelected() {
    if (selection.kind === 'pack') {
      requestInput('renamePack', { title: 'Rename pack', prompt: 'Pack name', value: pack.name || 'Untitled Pack' });
      return;
    }
    if (selection.kind === 'environment') {
      const environment = getEnvironment(selection.environmentIndex);
      if (!environment) return;
      requestInput('renameEnvironment', { title: 'Rename environment', prompt: 'Environment name', value: environment.name || 'Environment', payload: { environmentIndex: selection.environmentIndex } });
      return;
    }
    if (selection.kind === 'library') {
      const library = getLibrary(selection.environmentIndex, selection.libraryIndex);
      if (!library) return;
      requestInput('renameLibrary', { title: 'Rename library', prompt: 'Library name', value: library.name || 'Library', payload: { environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex } });
      return;
    }
    if (selection.kind === 'category') {
      const category = getCategory(selection);
      if (!category) return;
      requestInput('renameCategory', { title: 'Rename category', prompt: 'Category name', value: category.name || 'Category', payload: { environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex } });
      return;
    }
    if (selection.kind === 'group') {
      const group = getGroup(selection);
      if (!group) return;
      requestInput('renameGroup', { title: 'Rename group', prompt: 'Group name', value: group.name || 'Group', payload: { environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, groupPath: Array.isArray(selection.groupPath) ? selection.groupPath : [] } });
      return;
    }
    if (selection.kind === 'function') {
      const fn = getFunction(selection);
      if (!fn) return;
      requestInput('renameFunction', { title: 'Rename function', prompt: 'Function name', value: fn.name || 'Function', payload: { environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, functionIndex: selection.functionIndex, groupPath: Array.isArray(selection.groupPath) ? selection.groupPath : [] } });
    }
  }

  function duplicateSelected() {
    if (selection.kind === 'environment') {
      const environment = getEnvironment(selection.environmentIndex);
      if (!environment) return;
      const copy = cloneData(environment);
      copy.name = uniqueName((environment.name || 'Environment') + ' Copy', getEnvironments().map((item) => item.name));
      getEnvironments().splice(selection.environmentIndex + 1, 0, copy);
      selection = { kind: 'environment', environmentIndex: selection.environmentIndex + 1 };
      render();
      return;
    }
    if (selection.kind === 'library') {
      const environment = getEnvironment(selection.environmentIndex);
      const library = getLibrary(selection.environmentIndex, selection.libraryIndex);
      if (!environment || !library) return;
      const copy = cloneData(library);
      copy.name = uniqueName((library.name || 'Library') + ' Copy', (environment.libraries || []).map((item) => item.name));
      environment.libraries.splice(selection.libraryIndex + 1, 0, copy);
      selection = { kind: 'library', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex + 1 };
      render();
      return;
    }
    if (selection.kind === 'category') {
      const library = getLibrary(selection.environmentIndex, selection.libraryIndex);
      const category = getCategory(selection);
      if (!library || !category) return;
      const copy = cloneData(category);
      copy.name = uniqueName((category.name || 'Category') + ' Copy', (library.categories || []).map((item) => item.name));
      library.categories.splice(selection.categoryIndex + 1, 0, copy);
      selection = { kind: 'category', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex + 1 };
      render();
      return;
    }
    if (selection.kind === 'group') {
      const container = getGroupContainer(selection);
      const group = getGroup(selection);
      const path = Array.isArray(selection.groupPath) ? selection.groupPath : [];
      const groupIndex = path.length ? path[path.length - 1] : -1;
      if (!group || groupIndex < 0) return;
      const copy = cloneData(group);
      copy.name = uniqueName((group.name || 'Group') + ' Copy', container.map((item) => item.name));
      container.splice(groupIndex + 1, 0, copy);
      selection = { kind: 'group', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, groupPath: path.slice(0, -1).concat(groupIndex + 1) };
      render();
      return;
    }
    if (selection.kind === 'function') {
      const container = getFunctionContainer(selection);
      const fn = getFunction(selection);
      if (!fn) return;
      const copy = cloneData(fn);
      copy.name = uniqueName((fn.name || 'Function') + ' Copy', container.map((item) => item.name));
      container.splice(selection.functionIndex + 1, 0, copy);
      selection = { kind: 'function', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, functionIndex: selection.functionIndex + 1, groupPath: Array.isArray(selection.groupPath) ? selection.groupPath.slice() : [] };
      render();
    }
  }

  function moveSelected(direction) {
    if (tryMoveCheckedSelection(direction)) {
      return;
    }
    if (selection.kind === 'environment') {
      const nextIndex = selection.environmentIndex + direction;
      if (nextIndex < 0 || nextIndex >= getEnvironments().length) return;
      const temp = getEnvironments()[selection.environmentIndex];
      getEnvironments()[selection.environmentIndex] = getEnvironments()[nextIndex];
      getEnvironments()[nextIndex] = temp;
      selection = { kind: 'environment', environmentIndex: nextIndex };
      render();
      return;
    }
    if (selection.kind === 'library') {
      const environment = getEnvironment(selection.environmentIndex);
      if (!environment) return;
      const nextIndex = selection.libraryIndex + direction;
      if (nextIndex < 0 || nextIndex >= (environment.libraries || []).length) return;
      const temp = environment.libraries[selection.libraryIndex];
      environment.libraries[selection.libraryIndex] = environment.libraries[nextIndex];
      environment.libraries[nextIndex] = temp;
      selection = { kind: 'library', environmentIndex: selection.environmentIndex, libraryIndex: nextIndex };
      render();
      return;
    }
    if (selection.kind === 'category') {
      const library = getLibrary(selection.environmentIndex, selection.libraryIndex);
      if (!library) return;
      const nextIndex = selection.categoryIndex + direction;
      if (nextIndex < 0 || nextIndex >= (library.categories || []).length) return;
      const temp = library.categories[selection.categoryIndex];
      library.categories[selection.categoryIndex] = library.categories[nextIndex];
      library.categories[nextIndex] = temp;
      selection = { kind: 'category', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: nextIndex };
      render();
      return;
    }
    if (selection.kind === 'group') {
      const container = getGroupContainer(selection);
      const path = Array.isArray(selection.groupPath) ? selection.groupPath : [];
      const index = path.length ? path[path.length - 1] : -1;
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= container.length) return;
      const temp = container[index];
      container[index] = container[nextIndex];
      container[nextIndex] = temp;
      selection = { kind: 'group', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, groupPath: path.slice(0, -1).concat(nextIndex) };
      render();
      return;
    }
    if (selection.kind === 'function') {
      const container = getFunctionContainer(selection);
      const nextIndex = selection.functionIndex + direction;
      if (nextIndex < 0 || nextIndex >= container.length) return;
      const temp = container[selection.functionIndex];
      container[selection.functionIndex] = container[nextIndex];
      container[nextIndex] = temp;
      selection = { kind: 'function', environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, functionIndex: nextIndex, groupPath: Array.isArray(selection.groupPath) ? selection.groupPath.slice() : [] };
      render();
    }
  }


  function requestInput(operation, options) {
    vscode.postMessage({ type: 'showInput', operation, title: options && options.title || '', prompt: options && options.prompt || '', value: options && options.value || '', placeHolder: options && options.placeHolder || '', payload: options && options.payload });
  }

  function requestConfirm(operation, options) {
    vscode.postMessage({ type: 'showConfirm', operation, title: options && options.title || '', message: options && options.message || '', confirmLabel: options && options.confirmLabel || 'Confirm', payload: options && options.payload });
  }

  function requestPick(operation, options) {
    vscode.postMessage({ type: 'showPick', operation, title: options && options.title || '', placeHolder: options && options.placeHolder || '', items: options && options.items || [], payload: options && options.payload });
  }

  function moveLibraryToEnvironmentPrompt() {
    if (selection.kind !== 'library') return;
    const items = getEnvironments().map((environment, environmentIndex) => ({ label: environment.name || 'Environment', description: environmentIndex === selection.environmentIndex ? 'Current environment' : 'Move library here', detail: ((environment.libraries || []).length) + ' libraries', value: String(environmentIndex) })).filter((item) => Number(item.value) !== selection.environmentIndex);
    if (!items.length) { alert('No other environment is available for this library.'); return; }
    requestPick('moveLibraryToEnvironment', { title: 'Move library to another environment', placeHolder: 'Choose the target environment', items: items, payload: { environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex } });
  }

  function moveCheckedLibrariesToEnvironmentPrompt() {
    const checked = getCheckedItemsForCurrentSelection();
    if (selection.kind !== 'library' || checked.length <= 1) { moveLibraryToEnvironmentPrompt(); return; }
    const sourceEnvironmentIndex = Number(checked[0].environmentIndex);
    const items = getEnvironments().map((environment, environmentIndex) => ({ label: environment.name || 'Environment', description: environmentIndex === sourceEnvironmentIndex ? 'Current environment' : 'Move selected libraries here', detail: ((environment.libraries || []).length) + ' libraries', value: String(environmentIndex) })).filter((item) => Number(item.value) !== sourceEnvironmentIndex);
    if (!items.length) { alert('No other environment is available for the selected libraries.'); return; }
    requestPick('moveCheckedLibrariesToEnvironment', { title: 'Move selected libraries to another environment', placeHolder: 'Choose the target environment', items: items, payload: { items: checked } });
  }

  function moveCategoryToLibraryPrompt() {
    if (selection.kind !== 'category') return;
    const items = [];
    getEnvironments().forEach((environment, environmentIndex) => {
      (environment.libraries || []).forEach((library, libraryIndex) => {
        if (environmentIndex === selection.environmentIndex && libraryIndex === selection.libraryIndex) return;
        items.push({ label: library.name || 'Library', description: environment.name || 'Environment', detail: ((library.categories || []).length) + ' categories', value: String(environmentIndex) + ':' + String(libraryIndex) });
      });
    });
    if (!items.length) { alert('No other library is available for this category.'); return; }
    requestPick('moveCategoryToLibrary', { title: 'Move category to another library', placeHolder: 'Choose the target library', items: items, payload: { environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex } });
  }

  function moveCheckedCategoriesToLibraryPrompt() {
    const checked = getCheckedItemsForCurrentSelection();
    if (selection.kind !== 'category' || checked.length <= 1) { moveCategoryToLibraryPrompt(); return; }
    const sourceEnvironmentIndex = Number(checked[0].environmentIndex);
    const sourceLibraryIndex = Number(checked[0].libraryIndex);
    const items = [];
    getEnvironments().forEach((environment, environmentIndex) => {
      (environment.libraries || []).forEach((library, libraryIndex) => {
        if (environmentIndex === sourceEnvironmentIndex && libraryIndex === sourceLibraryIndex) return;
        items.push({ label: library.name || 'Library', description: environment.name || 'Environment', detail: ((library.categories || []).length) + ' categories', value: String(environmentIndex) + ':' + String(libraryIndex) });
      });
    });
    if (!items.length) { alert('No other library is available for the selected categories.'); return; }
    requestPick('moveCheckedCategoriesToLibrary', { title: 'Move selected categories to another library', placeHolder: 'Choose the target library', items: items, payload: { items: checked } });
  }

  function moveFunctionToCategoryPrompt() {
    if (selection.kind !== 'function') return;
    const items = [];
    getEnvironments().forEach((environment, environmentIndex) => {
      (environment.libraries || []).forEach((library, libraryIndex) => {
        (library.categories || []).forEach((category, categoryIndex) => {
          if (environmentIndex === selection.environmentIndex && libraryIndex === selection.libraryIndex && categoryIndex === selection.categoryIndex) return;
          items.push({ label: category.name || 'Category', description: String(environment.name || 'Environment') + ' / ' + String(library.name || 'Library'), detail: (getCategoryAllFunctionsLocal(category).length) + ' symbols', value: String(environmentIndex) + ':' + String(libraryIndex) + ':' + String(categoryIndex) });
        });
      });
    });
    if (!items.length) { alert('No other category is available for this symbol.'); return; }
    requestPick('moveFunctionToCategory', { title: 'Move symbol to another category', placeHolder: 'Choose the target category', items: items, payload: { environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, functionIndex: selection.functionIndex, groupPath: Array.isArray(selection.groupPath) ? selection.groupPath : [] } });
  }

  function moveCheckedFunctionsToCategoryPrompt() {
    const checked = getCheckedItemsForCurrentSelection();
    if (selection.kind !== 'function' || checked.length <= 1) { moveFunctionToCategoryPrompt(); return; }
    const sourceEnvironmentIndex = Number(checked[0].environmentIndex);
    const sourceLibraryIndex = Number(checked[0].libraryIndex);
    const sourceCategoryIndex = Number(checked[0].categoryIndex);
    const items = [];
    getEnvironments().forEach((environment, environmentIndex) => {
      (environment.libraries || []).forEach((library, libraryIndex) => {
        (library.categories || []).forEach((category, categoryIndex) => {
          if (environmentIndex === sourceEnvironmentIndex && libraryIndex === sourceLibraryIndex && categoryIndex === sourceCategoryIndex) return;
          items.push({ label: category.name || 'Category', description: String(environment.name || 'Environment') + ' / ' + String(library.name || 'Library'), detail: (getCategoryAllFunctionsLocal(category).length) + ' symbols', value: String(environmentIndex) + ':' + String(libraryIndex) + ':' + String(categoryIndex) });
        });
      });
    });
    if (!items.length) { alert('No other category is available for the selected symbols.'); return; }
    requestPick('moveCheckedFunctionsToCategory', { title: 'Move selected symbols to another category', placeHolder: 'Choose the target category', items: items, payload: { items: checked } });
  }

  function buildGroupPickItemsForCategory(category, options) {
    const items = [];
    const includeRoot = !options || options.includeRoot !== false;
    const excludePath = options && Array.isArray(options.excludePath) ? options.excludePath : undefined;
    const disablePrefixOf = options && Array.isArray(options.disablePrefixOf) ? options.disablePrefixOf : undefined;
    if (includeRoot) {
      items.push({ label: 'Category root', description: 'Move to the root of this category', detail: (getCategoryRootFunctions(category).length) + ' root symbols', value: 'root' });
    }
    flattenCategoryGroupsLocal(category).forEach((entry) => {
      if (excludePath && samePath(entry.path, excludePath)) return;
      if (disablePrefixOf && disablePrefixOf.length >= entry.path.length && samePath(disablePrefixOf.slice(0, entry.path.length), entry.path)) return;
      items.push({ label: entry.group.name || 'Group', description: entry.path.map((index) => String(index + 1)).join('.') || 'Group', detail: countGroupSymbolsLocal(entry.group) + ' symbols • ' + getGroupChildren(entry.group).length + ' subgroup(s)', value: entry.path.join('.') });
    });
    return items;
  }

  function moveGroupToParentPrompt() {
    if (selection.kind !== 'group') return;
    const category = getCategory(selection);
    if (!category) return;
    const items = buildGroupPickItemsForCategory(category, { includeRoot: true, excludePath: selection.groupPath || [], disablePrefixOf: selection.groupPath || [] }).filter((item) => item.value !== (Array.isArray(selection.groupPath) && selection.groupPath.length > 1 ? selection.groupPath.slice(0, -1).join('.') : 'root'));
    if (!items.length) { alert('No other target is available for this group.'); return; }
    requestPick('moveGroupToParent', { title: 'Move group', placeHolder: 'Choose the target parent', items: items, payload: { environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, groupPath: Array.isArray(selection.groupPath) ? selection.groupPath : [] } });
  }

  function moveCheckedGroupsToParentPrompt() {
    const checked = getCheckedItemsForCurrentSelection();
    if (selection.kind !== 'group' || checked.length <= 1) { moveGroupToParentPrompt(); return; }
    const category = getCategory(selection);
    if (!category) return;
    const currentParent = Array.isArray(checked[0].groupPath) && checked[0].groupPath.length > 1 ? checked[0].groupPath.slice(0, -1).join('.') : 'root';
    const excluded = new Set(checked.map((item) => Array.isArray(item.groupPath) && item.groupPath.length ? item.groupPath.join('.') : 'root'));
    const items = buildGroupPickItemsForCategory(category, { includeRoot: true }).filter((item) => item.value !== currentParent && !excluded.has(item.value));
    if (!items.length) { alert('No other target is available for the selected groups.'); return; }
    requestPick('moveCheckedGroupsToParent', { title: 'Move selected groups', placeHolder: 'Choose the target parent', items: items, payload: { items: checked } });
  }

  function moveFunctionToGroupPrompt() {
    if (selection.kind !== 'function') return;
    const category = getCategory(selection);
    if (!category) return;
    const current = Array.isArray(selection.groupPath) && selection.groupPath.length ? selection.groupPath.join('.') : 'root';
    const items = buildGroupPickItemsForCategory(category, { includeRoot: true }).filter((item) => item.value !== current);
    if (!items.length) { alert('No other target is available for this symbol in the current category.'); return; }
    requestPick('moveFunctionToGroup', { title: 'Move symbol inside category', placeHolder: 'Choose the target group or category root', items: items, payload: { environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, functionIndex: selection.functionIndex, groupPath: Array.isArray(selection.groupPath) ? selection.groupPath : [] } });
  }

  function moveCheckedFunctionsToGroupPrompt() {
    const checked = getCheckedItemsForCurrentSelection();
    if (selection.kind !== 'function' || checked.length <= 1) { moveFunctionToGroupPrompt(); return; }
    const category = getCategory(selection);
    if (!category) return;
    const current = Array.isArray(checked[0].groupPath) && checked[0].groupPath.length ? checked[0].groupPath.join('.') : 'root';
    const items = buildGroupPickItemsForCategory(category, { includeRoot: true }).filter((item) => item.value !== current);
    if (!items.length) { alert('No other target is available for the selected symbols in the current category.'); return; }
    requestPick('moveCheckedFunctionsToGroup', { title: 'Move selected symbols inside category', placeHolder: 'Choose the target group or category root', items: items, payload: { items: checked } });
  }

  function renderCategoryList(environmentIndex, libraryIndex) {
    const library = getLibrary(environmentIndex, libraryIndex);
    const categories = library && Array.isArray(library.categories) ? library.categories : [];
    if (!categories.length) return '<div class="meta-line">No categories yet.</div>';
    return '<div class="sublist"><h3>Categories in this library</h3>' + categories.map((category, index) => '<div class="sublist-item"><div class="sublist-item-main"><div class="sublist-item-title">' + escapeHtml(category.name || 'Category') + '</div><div class="sublist-item-meta">' + (getCategoryAllFunctionsLocal(category).length) + ' symbol(s) • ' + countCategoryGroupsLocal(category) + ' group(s)</div></div><div class="sublist-item-actions"><button class="action secondary" data-select="' + escapeAttr(JSON.stringify({ kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: index })) + '">Open</button><button class="action danger" data-action="deleteCategoryFromList" data-environment-index="' + environmentIndex + '" data-library-index="' + libraryIndex + '" data-category-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Delete</button></div></div>').join('') + '</div>';
  }

  function renderFunctionList(environmentIndex, libraryIndex, categoryIndex) {
    const category = getCategory({ kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex });
    const rootFunctions = getCategoryRootFunctions(category);
    const groups = flattenCategoryGroupsLocal(category);
    if (!rootFunctions.length && !groups.length) return '<div class="meta-line">No symbols yet.</div>';
    let html = '<div class="sublist"><h3>Content in this category</h3>';
    if (rootFunctions.length) {
      html += rootFunctions.map((fn, index) => '<div class="sublist-item"><div class="sublist-item-main"><div class="sublist-item-title">' + escapeHtml(fn.name || 'Function') + '</div><div class="sublist-item-meta">Category root • ' + escapeHtml(getSymbolKindLabel(getSymbolKind(fn))) + ' • ' + escapeHtml(fn.header || 'no header') + '</div></div><div class="sublist-item-actions"><button class="action secondary" data-select="' + escapeAttr(JSON.stringify({ kind: 'function', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: index, groupPath: [] })) + '">Open</button><button class="action danger" data-action="deleteFunctionFromList" data-environment-index="' + environmentIndex + '" data-library-index="' + libraryIndex + '" data-category-index="' + categoryIndex + '" data-function-index="' + index + '" data-group-path="" ' + (writable ? '' : 'disabled') + '>Delete</button></div></div>').join('');
    }
    if (groups.length) {
      html += groups.map((entry) => '<div class="sublist-item"><div class="sublist-item-main"><div class="sublist-item-title">' + escapeHtml((new Array(entry.depth + 1)).join('↳ ') + (entry.group.name || 'Group')) + '</div><div class="sublist-item-meta">Group • ' + countGroupSymbolsLocal(entry.group) + ' symbol(s) • ' + getGroupChildren(entry.group).length + ' subgroup(s)</div></div><div class="sublist-item-actions"><button class="action secondary" data-select="' + escapeAttr(JSON.stringify({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: entry.path })) + '">Open</button><button class="action danger" data-action="deleteGroupFromList" data-environment-index="' + environmentIndex + '" data-library-index="' + libraryIndex + '" data-category-index="' + categoryIndex + '" data-group-path="' + entry.path.join('.') + '" ' + (writable ? '' : 'disabled') + '>Delete</button></div></div>').join('');
    }
    html += '</div>';
    return html;
  }

  function renderEnvironmentLibraryList(environmentIndex) {
    const environment = getEnvironment(environmentIndex);
    const libraries = environment && Array.isArray(environment.libraries) ? environment.libraries : [];
    if (!libraries.length) return '<div class="meta-line">No libraries yet.</div>';
    return '<div class="sublist"><h3>Libraries in this environment</h3>' + libraries.map((library, index) => '<div class="sublist-item"><div class="sublist-item-main"><div class="sublist-item-title">' + escapeHtml(library.name || 'Library') + '</div><div class="sublist-item-meta">' + ((library.categories || []).length) + ' categories</div></div><div class="sublist-item-actions"><button class="action secondary" data-select="' + escapeAttr(JSON.stringify({ kind: 'library', environmentIndex: environmentIndex, libraryIndex: index })) + '">Open</button><button class="action danger" data-action="deleteLibraryFromEnvironment" data-environment-index="' + environmentIndex + '" data-library-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Delete</button></div></div>').join('') + '</div>';
  }

  function renderPackEnvironmentList() {
    const environments = getEnvironments();
    if (!environments.length) return '<div class="meta-line">No environments yet.</div>';
    return '<div class="summary-list"><h3>Environments in this pack</h3>' + environments.map((environment, index) => '<div class="summary-item"><div class="summary-main"><div class="summary-title">' + escapeHtml(environment.name || 'Environment') + '</div><div class="summary-meta">' + ((environment.libraries || []).length) + ' libraries</div></div><div class="sublist-item-actions"><button class="action secondary" data-select="' + escapeAttr(JSON.stringify({ kind: 'environment', environmentIndex: index })) + '">Open</button></div></div>').join('') + '</div>';
  }

  function renderPackCategoryList() {
    const items = [];
    getEnvironments().forEach((environment, environmentIndex) => {
      (environment.libraries || []).forEach((library, libraryIndex) => {
        (library.categories || []).forEach((category, categoryIndex) => {
          items.push({ environmentName: environment.name, libraryName: library.name, categoryName: category.name, environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, count: getCategoryAllFunctionsLocal(category).length, groups: countCategoryGroupsLocal(category) });
        });
      });
    });
    if (!items.length) return '<div class="meta-line">No categories yet.</div>';
    return '<div class="summary-list"><h3>Categories in this pack</h3>' + items.map((item) => '<div class="summary-item"><div class="summary-main"><div class="summary-title">' + escapeHtml(item.environmentName + ' / ' + item.libraryName + ' / ' + item.categoryName) + '</div><div class="summary-meta">' + item.count + ' symbols • ' + item.groups + ' groups</div></div><div class="sublist-item-actions"><button class="action secondary" data-select="' + escapeAttr(JSON.stringify({ kind: 'category', environmentIndex: item.environmentIndex, libraryIndex: item.libraryIndex, categoryIndex: item.categoryIndex })) + '">Open</button></div></div>').join('') + '</div>';
  }

  function renderSummaryLimitNotice(total, shown) {
    if (total <= shown) return '';
    return '<div class="meta-line">Showing ' + shown + ' of ' + total + ' symbols. Use the tree filter to find a specific symbol.</div>';
  }

  function renderPackFunctionList() {
    const items = [];
    getEnvironments().forEach((environment, environmentIndex) => {
      (environment.libraries || []).forEach((library, libraryIndex) => {
        (library.categories || []).forEach((category, categoryIndex) => {
          getCategoryAllFunctionsLocal(category).forEach((fn, functionIndex) => {
            items.push({ environmentName: environment.name, libraryName: library.name, categoryName: category.name, functionName: fn.name, environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: functionIndex, kind: getSymbolKindLabel(getSymbolKind(fn)) });
          });
        });
      });
    });
    if (!items.length) return '<div class="meta-line">No symbols yet.</div>';
    const visibleItems = items.slice(0, PACK_EDITOR_SUMMARY_ITEM_LIMIT);
    return '<div class="summary-list"><h3>Symbols in this pack</h3>' + renderSummaryLimitNotice(items.length, visibleItems.length) + visibleItems.map((item) => '<div class="summary-item"><div class="summary-main"><div class="summary-title">' + escapeHtml(item.functionName) + '</div><div class="summary-meta">' + escapeHtml(item.environmentName + ' / ' + item.libraryName + ' / ' + item.categoryName + ' • ' + item.kind) + '</div></div></div>').join('') + '</div>';
  }

  function renderLibraryFunctionList(environmentIndex, libraryIndex) {
    const library = getLibrary(environmentIndex, libraryIndex);
    const items = [];
    (library?.categories || []).forEach((category, categoryIndex) => {
      getCategoryAllFunctionsLocal(category).forEach((fn, functionIndex) => {
        items.push({ categoryName: category.name, categoryIndex: categoryIndex, functionIndex: functionIndex, functionName: fn.name, kind: getSymbolKindLabel(getSymbolKind(fn)) });
      });
    });
    if (!items.length) return '<div class="meta-line">No symbols yet.</div>';
    const visibleItems = items.slice(0, PACK_EDITOR_SUMMARY_ITEM_LIMIT);
    return '<div class="sublist"><h3>Symbols in this library</h3>' + renderSummaryLimitNotice(items.length, visibleItems.length) + visibleItems.map((item) => '<div class="sublist-item"><div class="sublist-item-main"><div class="sublist-item-title">' + escapeHtml(item.functionName) + '</div><div class="sublist-item-meta">' + escapeHtml(item.categoryName) + ' • ' + escapeHtml(item.kind) + '</div></div></div>').join('') + '</div>';
  }

  function renderTree() {
    ensureExpansionDefaults();
    pruneCheckedNodes();
    const query = normalize(treeFilter).trim();
    const parts = [];
    const environments = getEnvironments();
    const environmentCount = environments.length;
    const categoryCount = environments.reduce((sum, environment) => sum + (environment.libraries || []).reduce((inner, library) => inner + (library.categories || []).length, 0), 0);
    const groupCount = environments.reduce((sum, environment) => sum + (environment.libraries || []).reduce((inner, library) => inner + (library.categories || []).reduce((deep, category) => deep + countCategoryGroupsLocal(category), 0), 0), 0);
    const functionCount = environments.reduce((sum, environment) => sum + (environment.libraries || []).reduce((inner, library) => inner + (library.categories || []).reduce((deep, category) => deep + getCategoryAllFunctionsLocal(category).length, 0), 0), 0);
    parts.push('<div class="tree-row" style="padding-left:0px"><button class="toggle" data-action="toggleRoot" disabled>•</button><button class="node ' + (selection.kind === 'pack' ? 'active' : '') + '" data-select="' + escapeAttr(JSON.stringify({ kind: 'pack' })) + '" title="' + escapeAttr(String(pack.name || 'Untitled Pack')) + '"><span class="node-label"><span class="node-title">📦 ' + escapeHtml(pack.name || 'Untitled Pack') + '</span><span class="muted">Pack • ' + environmentCount + ' environments</span></span></button></div>');
    let visibleEnvironmentCount = 0;
    let visibleLibraryCount = 0;
    let visibleCategoryCount = 0;
    let visibleGroupCount = 0;
    let visibleFunctionCount = 0;
    const renderGroupBranch = (category, environmentIndex, libraryIndex, categoryIndex, groups, parentPath, depth) => {
      (Array.isArray(groups) ? groups : []).forEach((group, groupIndex) => {
        if (!groupMatches(group, query)) return;
        const path = parentPath.concat(groupIndex);
        const key = groupKey(environmentIndex, libraryIndex, categoryIndex, path);
        const expanded = query ? true : expandedGroups.has(key);
        visibleGroupCount += 1;
        const active = selection.kind === 'group' && selectionInGroup(environmentIndex, libraryIndex, categoryIndex, path);
        parts.push('<div class="tree-row" style="padding-left:' + (depth * 14) + 'px"><button class="toggle" data-action="toggleGroup" data-environment-index="' + environmentIndex + '" data-library-index="' + libraryIndex + '" data-category-index="' + categoryIndex + '" data-group-path="' + path.join('.') + '">' + (expanded ? '▾' : '▸') + '</button>' + renderMultiCheck({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: path }, 'Select this group for batch move') + '<button class="node ' + (active ? 'active' : '') + '" data-select="' + escapeAttr(JSON.stringify({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: path })) + '" title="' + escapeAttr(String(group.name || 'Group')) + '"><span class="node-label"><span class="node-title"><span class="node-icon group"></span>' + escapeHtml(group.name || 'Group') + '</span><span class="muted">Group • ' + countGroupSymbolsLocal(group) + ' symbols</span></span></button></div>');
        if (!expanded) return;
        getGroupFunctions(group).forEach((fn, functionIndex) => {
          if (!functionMatches(fn, query)) return;
          visibleFunctionCount += 1;
          const fnActive = selection.kind === 'function' && selection.environmentIndex === environmentIndex && selection.libraryIndex === libraryIndex && selection.categoryIndex === categoryIndex && selection.functionIndex === functionIndex && samePath(selection.groupPath || [], path);
          parts.push('<div class="tree-row" style="padding-left:' + ((depth + 1) * 14) + 'px"><button class="toggle" disabled>•</button>' + renderMultiCheck({ kind: 'function', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: functionIndex, groupPath: path }, 'Select this symbol for batch move') + '<button class="node ' + (fnActive ? 'active' : '') + '" data-select="' + escapeAttr(JSON.stringify({ kind: 'function', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: functionIndex, groupPath: path })) + '" title="' + escapeAttr(String(fn.name || 'Symbol')) + '"><span class="node-label"><span class="node-title">' + escapeHtml(getSymbolKindIcon(getSymbolKind(fn)) + ' ' + (fn.name || 'Symbol')) + '</span><span class="muted">' + escapeHtml(getSymbolKindLabel(getSymbolKind(fn))) + '</span></span></button></div>');
        });
        renderGroupBranch(category, environmentIndex, libraryIndex, categoryIndex, getGroupChildren(group), path, depth + 1);
      });
    };
    environments.forEach((environment, ei) => {
      if (!environmentMatches(environment, query)) return;
      visibleEnvironmentCount += 1;
      const envKey = environmentKey(ei);
      const environmentExpanded = query ? true : expandedEnvironments.has(envKey);
      const envActive = selection.kind === 'environment' && selection.environmentIndex === ei;
      parts.push('<div class="tree-row" style="padding-left:14px"><button class="toggle" data-action="toggleEnvironment" data-environment-index="' + ei + '">' + (environmentExpanded ? '▾' : '▸') + '</button>' + renderMultiCheck({ kind: 'environment', environmentIndex: ei }, 'Select this environment for batch move') + '<button class="node ' + (envActive ? 'active' : '') + '" data-select="' + escapeAttr(JSON.stringify({ kind: 'environment', environmentIndex: ei })) + '" title="' + escapeAttr(String(environment.name || 'Environment')) + '"><span class="node-label"><span class="node-title"><span class="node-icon environment"></span>' + escapeHtml(environment.name || 'Environment') + '</span><span class="muted">Environment • ' + ((environment.libraries || []).length) + ' libraries</span></span></button></div>');
      if (!environmentExpanded) return;
      (environment.libraries || []).forEach((library, li) => {
        if (!libraryMatches(library, query)) return;
        visibleLibraryCount += 1;
        const libKey = libraryKey(ei, li);
        const libraryExpanded = query ? true : expandedLibraries.has(libKey);
        const libActive = selection.kind === 'library' && selection.environmentIndex === ei && selection.libraryIndex === li;
        parts.push('<div class="tree-row" style="padding-left:28px"><button class="toggle" data-action="toggleLibrary" data-environment-index="' + ei + '" data-library-index="' + li + '">' + (libraryExpanded ? '▾' : '▸') + '</button>' + renderMultiCheck({ kind: 'library', environmentIndex: ei, libraryIndex: li }, 'Select this library for batch move') + '<button class="node ' + (libActive ? 'active' : '') + '" data-select="' + escapeAttr(JSON.stringify({ kind: 'library', environmentIndex: ei, libraryIndex: li })) + '" title="' + escapeAttr(String(library.name || 'Library')) + '"><span class="node-label"><span class="node-title"><span class="node-icon library"></span>' + escapeHtml(library.name || 'Library') + '</span><span class="muted">Library • ' + ((library.categories || []).length) + ' categories</span></span></button></div>');
        if (!libraryExpanded) return;
        (library.categories || []).forEach((category, ci) => {
          if (!categoryMatches(category, query)) return;
          visibleCategoryCount += 1;
          const catKey = categoryKey(ei, li, ci);
          const categoryExpanded = query ? true : expandedCategories.has(catKey);
          const catActive = selection.kind === 'category' && selection.environmentIndex === ei && selection.libraryIndex === li && selection.categoryIndex === ci;
          parts.push('<div class="tree-row" style="padding-left:42px"><button class="toggle" data-action="toggleCategory" data-environment-index="' + ei + '" data-library-index="' + li + '" data-category-index="' + ci + '">' + (categoryExpanded ? '▾' : '▸') + '</button>' + renderMultiCheck({ kind: 'category', environmentIndex: ei, libraryIndex: li, categoryIndex: ci }, 'Select this category for batch move') + '<button class="node ' + (catActive ? 'active' : '') + '" data-select="' + escapeAttr(JSON.stringify({ kind: 'category', environmentIndex: ei, libraryIndex: li, categoryIndex: ci })) + '" title="' + escapeAttr(String(category.name || 'Category')) + '"><span class="node-label"><span class="node-title"><span class="node-icon category"></span>' + escapeHtml(category.name || 'Category') + '</span><span class="muted">' + getCategoryAllFunctionsLocal(category).length + ' symbols • ' + countCategoryGroupsLocal(category) + ' groups</span></span></button></div>');
          if (!categoryExpanded) return;
          getCategoryRootFunctions(category).forEach((fn, fi) => {
            if (!functionMatches(fn, query)) return;
            visibleFunctionCount += 1;
            const fnActive = selection.kind === 'function' && selection.environmentIndex === ei && selection.libraryIndex === li && selection.categoryIndex === ci && selection.functionIndex === fi && (!selection.groupPath || !selection.groupPath.length);
            parts.push('<div class="tree-row" style="padding-left:56px"><button class="toggle" disabled>•</button>' + renderMultiCheck({ kind: 'function', environmentIndex: ei, libraryIndex: li, categoryIndex: ci, functionIndex: fi, groupPath: [] }, 'Select this symbol for batch move') + '<button class="node ' + (fnActive ? 'active' : '') + '" data-select="' + escapeAttr(JSON.stringify({ kind: 'function', environmentIndex: ei, libraryIndex: li, categoryIndex: ci, functionIndex: fi, groupPath: [] })) + '" title="' + escapeAttr(String(fn.name || 'Symbol')) + '"><span class="node-label"><span class="node-title">' + escapeHtml(getSymbolKindIcon(getSymbolKind(fn)) + ' ' + (fn.name || 'Symbol')) + '</span><span class="muted">' + escapeHtml(getSymbolKindLabel(getSymbolKind(fn))) + '</span></span></button></div>');
          });
          renderGroupBranch(category, ei, li, ci, getCategoryGroups(category), [], 4);
        });
      });
    });
    if (query && visibleEnvironmentCount === 0 && visibleLibraryCount === 0 && visibleCategoryCount === 0 && visibleFunctionCount === 0) {
      parts.push('<div class="tree-empty">No matching environments, libraries, categories, groups, or symbols.</div>');
    }
    treeEl.innerHTML = parts.join('');
    const filterInput = document.getElementById('treeFilter');
    if (filterInput instanceof HTMLInputElement && filterInput.value !== treeFilter) {
      filterInput.value = treeFilter;
    }
    if (treeStatusEl) {
      const base = 'Pack: ' + environmentCount + ' environments, ' + categoryCount + ' categories, ' + groupCount + ' groups, ' + functionCount + ' symbols';
      const multi = checkedNodes.size ? (' • Multi-select: ' + checkedNodes.size + ' item(s) ready for batch move') : '';
      treeStatusEl.textContent = query ? (base + ' • Filter: ' + visibleEnvironmentCount + ' env, ' + visibleLibraryCount + ' libs, ' + visibleCategoryCount + ' categories, ' + visibleGroupCount + ' groups, ' + visibleFunctionCount + ' symbols visible' + multi) : (base + multi);
    }
    saveUiState();
  }

  function renderPackEditor() {
    const environments = getEnvironments();
    const environmentCount = environments.length;
    const libraryCount = environments.reduce((total, environment) => total + ((environment.libraries || []).length), 0);
    const categoryCount = environments.reduce((total, environment) => total + (environment.libraries || []).reduce((inner, lib) => inner + ((lib.categories || []).length), 0), 0);
    const functionCount = environments.reduce((total, environment) => total + (environment.libraries || []).reduce((inner, lib) => inner + (lib.categories || []).reduce((deep, cat) => deep + getCategoryAllFunctionsLocal(cat).length, 0), 0), 0);
    return '<div class="card"><h3>Pack metadata</h3>' + renderSelectionPath() + '<div class="meta-line">' + escapeHtml(meta.filePath) + ' • ' + escapeHtml(meta.source) + '</div>'
      + '<div class="grid">'
      + '<label>Name<input type="text" data-pack-field="name" value="' + escapeAttr(pack.name || '') + '" ' + (writable ? '' : 'disabled') + '></label>'
      + '<label>ID<input type="text" data-pack-field="id" value="' + escapeAttr(pack.id || '') + '" ' + (writable ? '' : 'disabled') + '></label>'
      + '<label>Language<input type="text" data-pack-field="language" value="' + escapeAttr(pack.language || '') + '" ' + (writable ? '' : 'disabled') + '></label>'
      + '<label>Version<input type="text" data-pack-field="version" value="' + escapeAttr(pack.version || '') + '" ' + (writable ? '' : 'disabled') + '></label>'
      + '</div>'
      + '<label style="margin-top:12px;max-width:220px;"><span>Read-only pack</span><input type="checkbox" data-pack-field="readOnly" ' + (pack.readOnly ? 'checked ' : '') + (writable ? '' : 'disabled') + '></label>'
      + '<div class="meta-line">' + (pack.readOnly ? 'This pack is flagged as read-only.' : 'This pack is editable.') + '</div>'
      + '</div>'
      + '<div class="card"><h3>Summary</h3><div class="grid"><div><strong>' + environmentCount + '</strong><br><span class="muted">Environments</span></div><div><strong>' + libraryCount + '</strong><br><span class="muted">Libraries</span></div><div><strong>' + categoryCount + '</strong><br><span class="muted">Categories</span></div><div><strong>' + functionCount + '</strong><br><span class="muted">Symbols</span></div></div>'
      + '<div class="actions" style="margin-top:12px; margin-bottom:8px;">'
      + '<button class="action" data-action="addEnvironment" ' + (writable ? '' : 'disabled') + '>+ Environment</button>'
      + '<button class="action secondary" data-action="addContentPack" ' + (writable ? '' : 'disabled') + '>Add content</button>'
      + '<button class="action secondary" data-action="exportContentPack">Export content</button>'
      + '</div>'
      + renderPackEnvironmentList()
      + renderPackCategoryList()
      + renderPackFunctionList()
      + '</div>';
  }

  function renderEnvironmentEditor(environment, environmentIndex) {
    const canMoveUp = environmentIndex > 0;
    const canMoveDown = environmentIndex < getEnvironments().length - 1;
    const checkedEnvironments = getCheckedItemsForCurrentSelection();
    return '<div class="card"><h3>Environment</h3>' + renderSelectionPath() + '<div class="grid">'
      + '<label>Name<input type="text" data-environment-index="' + environmentIndex + '" data-environment-field="name" value="' + escapeAttr(environment.name || '') + '" ' + (writable ? '' : 'disabled') + '></label>'
      + '</div></div>'
      + '<div class="card"><h3>Actions</h3><div class="actions">'
      + '<button class="action" data-action="addLibrary" data-environment-index="' + environmentIndex + '" ' + (writable ? '' : 'disabled') + '>+ Library</button>'
      + '<button class="action secondary" data-action="renameSelected" ' + (writable ? '' : 'disabled') + '>Rename</button>'
      + '<button class="action secondary" data-action="duplicateSelected" ' + (writable ? '' : 'disabled') + '>Duplicate</button>'
      + '<button class="action secondary" data-action="moveSelectedUp" ' + (writable && canMoveUp ? '' : 'disabled') + '>Move up</button>'
      + '<button class="action secondary" data-action="moveSelectedDown" ' + (writable && canMoveDown ? '' : 'disabled') + '>Move down</button>'
      + '<button class="action secondary" data-action="addContentEnvironment" ' + (writable ? '' : 'disabled') + '>Add content</button>'
      + '<button class="action secondary" data-action="exportContentEnvironment">Export content</button>'
      + '<button class="action danger" data-action="deleteEnvironment" ' + (writable ? '' : 'disabled') + '>' + escapeHtml((checkedEnvironments.length > 1 ? 'Delete selected environments (' + checkedEnvironments.length + ')' : 'Delete environment')) + '</button>'
      + '</div>' + renderEnvironmentLibraryList(environmentIndex) + '</div>';
  }

  function renderLibraryEditor(library, environmentIndex, libraryIndex) {
    const environment = getEnvironment(environmentIndex);
    const canMoveUp = libraryIndex > 0;
    const canMoveDown = libraryIndex < ((environment?.libraries || []).length - 1);
    const checkedLibraries = getCheckedItemsForCurrentSelection();
    const environmentActionLabel = checkedLibraries.length > 1 ? 'Change environment (' + checkedLibraries.length + ' selected)' : 'Change environment';
    return '<div class="card"><h3>Library</h3>' + renderSelectionPath() + '<div class="grid">'
      + '<label>Name<input type="text" data-environment-index="' + environmentIndex + '" data-library-index="' + libraryIndex + '" data-library-field="name" value="' + escapeAttr(library.name || '') + '" ' + (writable ? '' : 'disabled') + '></label>'
      + '</div></div>'
      + '<div class="card"><h3>Actions</h3><div class="actions">'
      + '<button class="action" data-action="addCategory" data-environment-index="' + environmentIndex + '" data-library-index="' + libraryIndex + '" ' + (writable ? '' : 'disabled') + '>+ Category</button>'
      + '<button class="action secondary" data-action="renameSelected" ' + (writable ? '' : 'disabled') + '>Rename</button>'
      + '<button class="action secondary" data-action="duplicateSelected" ' + (writable ? '' : 'disabled') + '>Duplicate</button>'
      + '<button class="action secondary" data-action="moveSelectedUp" ' + (writable && canMoveUp ? '' : 'disabled') + '>Move up</button>'
      + '<button class="action secondary" data-action="moveSelectedDown" ' + (writable && canMoveDown ? '' : 'disabled') + '>Move down</button>'
      + '<button class="action secondary" data-action="moveLibraryToEnvironment" ' + (writable && getEnvironments().length > 1 ? '' : 'disabled') + '>' + escapeHtml(environmentActionLabel) + '</button>'
      + '<button class="action secondary" data-action="addContentLibrary" data-environment-index="' + environmentIndex + '" data-library-index="' + libraryIndex + '" ' + (writable ? '' : 'disabled') + '>Add content</button>'
      + '<button class="action secondary" data-action="exportContentLibrary" data-environment-index="' + environmentIndex + '" data-library-index="' + libraryIndex + '">Export content</button>'
      + '<button class="action danger" data-action="deleteLibrary" ' + (writable ? '' : 'disabled') + '>' + escapeHtml((checkedLibraries.length > 1 ? 'Delete selected libraries (' + checkedLibraries.length + ')' : 'Delete library')) + '</button>'
      + '</div>' + renderCategoryList(environmentIndex, libraryIndex) + renderLibraryFunctionList(environmentIndex, libraryIndex) + '</div>';
  }

  function renderCategoryEditor(category, environmentIndex, libraryIndex, categoryIndex) {
    const library = getLibrary(environmentIndex, libraryIndex);
    const total = library && Array.isArray(library.categories) ? library.categories.length : 0;
    const canMoveUp = categoryIndex > 0;
    const canMoveDown = categoryIndex < total - 1;
    const itemLabel = getCategoryItemLabel(category && category.name).replace(/^./, (m) => m.toUpperCase());
    const checkedCategories = getCheckedItemsForCurrentSelection();
    const libraryActionLabel = checkedCategories.length > 1 ? 'Change library (' + checkedCategories.length + ' selected)' : 'Change library';
    return '<div class="card"><h3>Category</h3>' + renderSelectionPath() + '<div class="grid">'
      + '<label>Name<input type="text" data-category-field="name" value="' + escapeAttr(category.name || '') + '" ' + (writable ? '' : 'disabled') + '></label>'
      + '</div></div>'
      + '<div class="card"><h3>Actions</h3><div class="actions">'
      + '<button class="action" data-action="addFunction" data-environment-index="' + environmentIndex + '" data-library-index="' + libraryIndex + '" data-category-index="' + categoryIndex + '" ' + (writable ? '' : 'disabled') + '>+ ' + itemLabel.slice(0, -1) + '</button>'
      + '<button class="action positive" data-action="addGroup" data-environment-index="' + environmentIndex + '" data-library-index="' + libraryIndex + '" data-category-index="' + categoryIndex + '" ' + (writable ? '' : 'disabled') + '>+ Group</button>'
      + '<button class="action secondary" data-action="renameSelected" ' + (writable ? '' : 'disabled') + '>Rename</button>'
      + '<button class="action secondary" data-action="duplicateSelected" ' + (writable ? '' : 'disabled') + '>Duplicate</button>'
      + '<button class="action secondary" data-action="moveSelectedUp" ' + (writable && canMoveUp ? '' : 'disabled') + '>Move up</button>'
      + '<button class="action secondary" data-action="moveSelectedDown" ' + (writable && canMoveDown ? '' : 'disabled') + '>Move down</button>'
      + '<button class="action secondary" data-action="moveCategoryToLibrary" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(libraryActionLabel) + '</button>'
      + '<button class="action secondary" data-action="addContentCategory" data-environment-index="' + environmentIndex + '" data-library-index="' + libraryIndex + '" data-category-index="' + categoryIndex + '" ' + (writable ? '' : 'disabled') + '>Add content</button>'
      + '<button class="action secondary" data-action="exportContentCategory" data-environment-index="' + environmentIndex + '" data-library-index="' + libraryIndex + '" data-category-index="' + categoryIndex + '">Export content</button>'
      + '<button class="action danger" data-action="deleteCategory" ' + (writable ? '' : 'disabled') + '>' + escapeHtml((checkedCategories.length > 1 ? 'Delete selected categories (' + checkedCategories.length + ')' : 'Delete category')) + '</button>'
      + '</div>' + renderFunctionList(environmentIndex, libraryIndex, categoryIndex) + '</div>';
  }


  function renderFieldSummaryCard(fn, symbolLabel) {
    const fields = Array.isArray(fn.fields) ? fn.fields : [];
    const label = symbolLabel === 'Class' ? 'Members' : 'Fields';
    if (!fields.length) {
      return '<div class="card"><h3>' + escapeHtml(label) + '</h3><div class="actions" style="margin-bottom:8px;"><button class="action" data-action="addField" ' + (writable ? '' : 'disabled') + '>+ Field</button></div><div class="meta-line">No ' + escapeHtml(label.toLowerCase()) + ' yet.</div></div>';
    }
    const rows = fields.map((field, index) => '<tr>'
      + '<td>' + (index + 1) + '</td>'
      + '<td><select data-field-index="' + index + '" data-field-field="access" ' + (writable ? '' : 'disabled') + '>' + methodAccessOptions(normalizeAccessLabel(field.access || 'private', 'private')) + '</select></td>'
      + '<td><input type="text" data-field-index="' + index + '" data-field-field="type" value="' + escapeAttr(field.type || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
      + '<td><input type="text" data-field-index="' + index + '" data-field-field="name" value="' + escapeAttr(field.name || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
      + '<td><input type="text" data-field-index="' + index + '" data-field-field="description" value="' + escapeAttr(field.description || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
      + '<td><div class="param-actions">'
      + '<button class="action secondary" data-action="moveFieldUp" data-field-index="' + index + '" ' + (writable && index > 0 ? '' : 'disabled') + '>↑</button>'
      + '<button class="action secondary" data-action="moveFieldDown" data-field-index="' + index + '" ' + (writable && index < fields.length - 1 ? '' : 'disabled') + '>↓</button>'
      + '<button class="action secondary" data-action="duplicateField" data-field-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Duplicate</button>'
      + '<button class="action danger" data-action="deleteField" data-field-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Delete</button>'
      + '</div></td>'
      + '</tr>').join('');
    return '<div class="card"><h3>' + escapeHtml(label) + '</h3><div class="actions" style="margin-bottom:8px;"><button class="action" data-action="addField" ' + (writable ? '' : 'disabled') + '>+ Field</button></div><table class="table"><thead><tr><th>#</th><th>Access</th><th>Type</th><th>Name</th><th>Description</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderMethodSummaryCard(fn) {
    const methods = Array.isArray(fn.methods) ? fn.methods : [];
    if (!methods.length) {
      return '<div class="card"><h3>Methods</h3><div class="actions" style="margin-bottom:8px;"><button class="action" data-action="addMethod" ' + (writable ? '' : 'disabled') + '>+ Method</button></div><div class="meta-line">No methods yet.</div></div>';
    }
    const rows = methods.map((method, index) => {
      const qualifiers = splitMethodQualifiers(method);
      return '<tr>'
        + '<td>' + (index + 1) + '</td>'
        + '<td><select data-method-index="' + index + '" data-method-field="access" ' + (writable ? '' : 'disabled') + '>' + methodAccessOptions(normalizeAccessLabel(method.access || 'public', 'public')) + '</select></td>'
        + '<td><select data-method-index="' + index + '" data-method-field="methodKind" ' + (writable ? '' : 'disabled') + '>' + methodKindOptions(method.methodKind || 'method') + '</select></td>'
        + '<td><input type="text" data-method-index="' + index + '" data-method-field="name" value="' + escapeAttr(method.name || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
        + '<td><input type="text" data-method-index="' + index + '" data-method-field="returnType" value="' + escapeAttr(method.returnType || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
        + '<td><input type="text" data-method-index="' + index + '" data-method-field="parameters" value="' + escapeAttr(method.parameters || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
        + '<td><input type="text" data-method-index="' + index + '" data-method-field="prefixQualifiers" value="' + escapeAttr(Array.isArray(qualifiers.prefix) ? qualifiers.prefix.join(' ') : (qualifiers.prefix || '')) + '" ' + (writable ? '' : 'disabled') + '></td>'
        + '<td><input type="text" data-method-index="' + index + '" data-method-field="suffixQualifiers" value="' + escapeAttr(Array.isArray(qualifiers.suffix) ? qualifiers.suffix.join(' ') : (qualifiers.suffix || '')) + '" ' + (writable ? '' : 'disabled') + '></td>'
        + '<td><div class="param-actions">'
        + '<button class="action secondary" data-action="moveMethodUp" data-method-index="' + index + '" ' + (writable && index > 0 ? '' : 'disabled') + '>↑</button>'
        + '<button class="action secondary" data-action="moveMethodDown" data-method-index="' + index + '" ' + (writable && index < methods.length - 1 ? '' : 'disabled') + '>↓</button>'
        + '<button class="action secondary" data-action="duplicateMethod" data-method-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Duplicate</button>'
        + '<button class="action danger" data-action="deleteMethod" data-method-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Delete</button>'
        + '</div></td>'
        + '</tr>'
        + '<tr><td></td><td colspan="8"><textarea class="textarea-small" data-method-index="' + index + '" data-method-field="signature" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(method.signature || '') + '</textarea><div class="tiny">Signature / declaration</div></td></tr>';
    }).join('');
    return '<div class="card"><h3>Methods</h3><div class="actions" style="margin-bottom:8px;"><button class="action" data-action="addMethod" ' + (writable ? '' : 'disabled') + '>+ Method</button></div><table class="table"><thead><tr><th>#</th><th>Access</th><th>Kind</th><th>Name</th><th>Return type</th><th>Parameters</th><th>Prefix</th><th>Suffix</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderEnumValueSummaryCard(fn) {
    const values = Array.isArray(fn.enumValues) ? fn.enumValues : [];
    if (!values.length) {
      return '<div class="card"><h3>Enum values</h3><div class="actions" style="margin-bottom:8px;"><button class="action" data-action="addEnumValue" ' + (writable ? '' : 'disabled') + '>+ Enum value</button></div><div class="meta-line">No enum values yet.</div></div>';
    }
    const rows = values.map((item, index) => '<tr>'
      + '<td>' + (index + 1) + '</td>'
      + '<td><input type="text" data-enum-index="' + index + '" data-enum-field="name" value="' + escapeAttr(item.name || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
      + '<td><input type="text" data-enum-index="' + index + '" data-enum-field="value" value="' + escapeAttr(item.value || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
      + '<td><input type="text" data-enum-index="' + index + '" data-enum-field="description" value="' + escapeAttr(item.description || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
      + '<td><div class="param-actions">'
      + '<button class="action secondary" data-action="moveEnumValueUp" data-enum-index="' + index + '" ' + (writable && index > 0 ? '' : 'disabled') + '>↑</button>'
      + '<button class="action secondary" data-action="moveEnumValueDown" data-enum-index="' + index + '" ' + (writable && index < values.length - 1 ? '' : 'disabled') + '>↓</button>'
      + '<button class="action secondary" data-action="duplicateEnumValue" data-enum-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Duplicate</button>'
      + '<button class="action danger" data-action="deleteEnumValue" data-enum-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Delete</button>'
      + '</div></td>'
      + '</tr>').join('');
    return '<div class="card"><h3>Enum values</h3><div class="actions" style="margin-bottom:8px;"><button class="action" data-action="addEnumValue" ' + (writable ? '' : 'disabled') + '>+ Enum value</button></div><table class="table"><thead><tr><th>#</th><th>Name</th><th>Value</th><th>Description</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderEditorError(error) {
    const message = error && error.message ? error.message : String(error || 'Unknown error');
    return '<div class="card"><h3>Selection error</h3><div class="meta-line">The selected item could not be rendered.</div><div class="code">' + escapeHtml(message) + '</div></div>';
  }


  function renderGroupEditor(group, environmentIndex, libraryIndex, categoryIndex, groupPath) {
    const siblings = getGroupContainer({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: groupPath });
    const index = groupPath.length ? groupPath[groupPath.length - 1] : 0;
    const canMoveUp = index > 0;
    const canMoveDown = index < (siblings.length - 1);
    const subgroups = getGroupChildren(group);
    const functions = getGroupFunctions(group);
    const checkedGroups = getCheckedItemsForCurrentSelection();
    const parentActionLabel = checkedGroups.length > 1 ? 'Change parent (' + checkedGroups.length + ' selected)' : 'Change parent';
    return '<div class="card"><h3>Group</h3>' + renderSelectionPath() + '<div class="grid">'
      + '<label>Name<input type="text" data-group-field="name" value="' + escapeAttr(group.name || '') + '" ' + (writable ? '' : 'disabled') + '></label>'
      + '<label>Description<input type="text" data-group-field="description" value="' + escapeAttr(group.description || '') + '" ' + (writable ? '' : 'disabled') + '></label>'
      + '</div></div>'
      + '<div class="card"><h3>Actions</h3><div class="actions">'
      + '<button class="action positive" data-action="addGroup" ' + (writable ? '' : 'disabled') + '>+ Sub-group</button>'
      + '<button class="action positive" data-action="addFunction" ' + (writable ? '' : 'disabled') + '>+ Symbol</button>'
      + '<button class="action secondary" data-action="renameSelected" ' + (writable ? '' : 'disabled') + '>Rename</button>'
      + '<button class="action secondary" data-action="duplicateSelected" ' + (writable ? '' : 'disabled') + '>Duplicate</button>'
      + '<button class="action secondary" data-action="moveSelectedUp" ' + (writable && canMoveUp ? '' : 'disabled') + '>Move up</button>'
      + '<button class="action secondary" data-action="moveSelectedDown" ' + (writable && canMoveDown ? '' : 'disabled') + '>Move down</button>'
      + '<button class="action secondary" data-action="moveGroupToParent" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(parentActionLabel) + '</button>'
      + '<button class="action danger" data-action="deleteGroup" ' + (writable ? '' : 'disabled') + '>' + escapeHtml((checkedGroups.length > 1 ? 'Delete selected groups (' + checkedGroups.length + ')' : 'Delete group')) + '</button>'
      + '</div>'
      + '<div class="meta-line">' + subgroups.length + ' subgroup(s) • ' + functions.length + ' direct symbol(s) • ' + countGroupSymbolsLocal(group) + ' total symbol(s)</div>'
      + renderFunctionList(environmentIndex, libraryIndex, categoryIndex)
      + '</div>';
  }

  function renderFunctionEditor(fn, environmentIndex, libraryIndex, categoryIndex, functionIndex) {
    const parameters = Array.isArray(fn.parameters) ? fn.parameters : [];
    const category = getCategory({ kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex });
    const canMoveUp = functionIndex > 0;
    const container = getFunctionContainer({ kind: 'function', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: functionIndex, groupPath: Array.isArray(selection.groupPath) ? selection.groupPath : [] });
    const canMoveDown = functionIndex < (container.length - 1);
    const symbolKind = getSymbolKind(fn);
    const symbolLabel = getSymbolKindLabel(symbolKind);
    const isCallable = isCallableSymbolKind(symbolKind);
    const checkedFunctions = getCheckedItemsForCurrentSelection();
    const categoryActionLabel = checkedFunctions.length > 1 ? 'Change category (' + checkedFunctions.length + ' selected)' : 'Change category';
    const groupActionLabel = checkedFunctions.length > 1 ? 'Change group (' + checkedFunctions.length + ' selected)' : 'Change group';
    const isVoid = (fn.returnType || 'void').trim().toLowerCase() === 'void';
    const rows = parameters.map((param, index) => {
      const pickerConfig = param && param.pickerConfig ? param.pickerConfig : null;
      const pickerEnabled = !!pickerConfig;
      const pickerTitle = pickerConfig && pickerConfig.title ? pickerConfig.title : ('Select value for ' + (param.name || ('param' + (index + 1))));
      const pickerSourceTypesText = stringifyPickerSourceTypesText(pickerConfig || {});
      const pickerItemsText = stringifyStructuredPickerItemsText(pickerConfig || {});
      const pickerApplyDefault = !!(pickerConfig && pickerConfig.applyDefaultIfEmpty);
      const pickerMultiSelect = !!(pickerConfig && pickerConfig.multiSelect);
      const pickerValueSeparator = String((pickerConfig && pickerConfig.valueSeparator) || ' | ');
      const pickerEmptyValue = String((pickerConfig && pickerConfig.emptyValue) || '');
      return '<tr>'
      + '<td>' + (index + 1) + '</td>'
      + '<td><input type="text" data-param-index="' + index + '" data-param-field="type" value="' + escapeAttr(param.type || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
      + '<td><input type="text" data-param-index="' + index + '" data-param-field="name" value="' + escapeAttr(param.name || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
      + '<td><input type="text" data-param-index="' + index + '" data-param-field="description" value="' + escapeAttr(param.description || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
      + '<td><select data-param-index="' + index + '" data-param-field="editorType" ' + (writable ? '' : 'disabled') + '>' + editorTypeOptions(param.editorType || 'text') + '</select></td>'
      + '<td><input type="text" data-param-index="' + index + '" data-param-field="defaultValue" value="' + escapeAttr(param.defaultValue || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
      + '<td><input type="text" data-param-index="' + index + '" data-param-field="placeholder" value="' + escapeAttr(param.placeholder || '') + '" ' + (writable ? '' : 'disabled') + '></td>'
      + '<td><textarea class="textarea-small" data-param-index="' + index + '" data-param-field="presetsText" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(stringifyChoiceText(param.presets || [])) + '</textarea><div class="tiny">one per line: value | description | detail</div></td>'
      + '<td><textarea class="textarea-small" data-param-index="' + index + '" data-param-field="optionsText" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(stringifyChoiceText(param.options || [])) + '</textarea><div class="tiny">one per line: value | description | detail. For Editor = Enum, this is the direct dropdown source.</div></td>'
      + '<td><div class="param-actions">'
      + '<button class="action secondary" data-action="moveParamUp" data-param-index="' + index + '" ' + (writable && index > 0 ? '' : 'disabled') + '>↑</button>'
      + '<button class="action secondary" data-action="moveParamDown" data-param-index="' + index + '" ' + (writable && index < parameters.length - 1 ? '' : 'disabled') + '>↓</button>'
      + '<button class="action secondary" data-action="duplicateParameter" data-param-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Duplicate</button>'
      + '<button class="action danger" data-action="deleteParameter" data-param-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Delete</button>'
      + '</div></td></tr>'
      + '<tr class="picker-config-row"><td colspan="10">'
      + '<details class="picker-config-card" ' + (pickerEnabled ? 'open' : '') + '>'
      + '<summary>Selection window (...)</summary>'
      + '<div class="meta-line" style="margin-top:10px;">Use this only when the ... button should open the large structured picker. For a normal Enum dropdown, fill <strong>Options</strong> and leave this section disabled.</div>'
      + '<div class="tiny" style="margin-top:6px;">Quick rule: <strong>Boolean</strong> = Editor Boolean. <strong>Enum dropdown</strong> = Editor Enum + Options. <strong>Large picker popup</strong> = enable this section + fill Picker structure. Source types, sections, and groups are optional.</div>'
      + '<div class="actions" style="margin-top:10px; gap:8px; flex-wrap:wrap;">'
      + '<button type="button" class="action secondary" data-action="loadPickerSimpleExample" data-param-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Load simple example</button>'
      + '<button type="button" class="action secondary" data-action="loadPickerStructuredExample" data-param-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Load structured example</button>'
      + '<button type="button" class="action secondary" data-action="loadPickerFromChoices" data-param-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Import presets/options</button>'
      + (getBuiltInPickerTemplateForEditor(fn, index) ? '<button type="button" class="action secondary" data-action="loadPickerFromBuiltInHelper" data-param-index="' + index + '" ' + (writable ? '' : 'disabled') + '>Import built-in helper</button>' : '')
      + '</div>'
      + (getBuiltInPickerTemplateForEditor(fn, index)
        ? '<div class="tiny" style="margin-top:6px;">This parameter already has a built-in picker template in the extension. Import it here to make it editable in the visual builder without losing the rest of the current function definition.</div>'
        : '')
      + '<div class="grid" style="margin-top:10px;">'
      + '<label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" data-param-index="' + index + '" data-param-field="pickerEnabled" ' + (pickerEnabled ? 'checked' : '') + ' ' + (writable ? '' : 'disabled') + '>Enable structured selection window for this parameter</label>'
      + '<label>Picker title<input type="text" data-param-index="' + index + '" data-param-field="pickerTitle" value="' + escapeAttr(pickerTitle) + '" placeholder="Select value for ' + escapeAttr(param.name || ('param' + (index + 1))) + '" ' + (writable ? '' : 'disabled') + '></label>'
      + '<label>Selection label<input type="text" data-param-index="' + index + '" data-param-field="pickerSelectionLabel" value="' + escapeAttr(String((pickerConfig && pickerConfig.selectionLabel) || 'Selected value')) + '" placeholder="Selected value" ' + (writable ? '' : 'disabled') + '></label>'
      + '<label>Popup subtitle<input type="text" data-param-index="' + index + '" data-param-field="pickerSubtitle" value="' + escapeAttr(String((pickerConfig && pickerConfig.subtitle) || '')) + '" placeholder="Optional helper sentence shown under the popup title" ' + (writable ? '' : 'disabled') + '></label>'
      + '<label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" data-param-index="' + index + '" data-param-field="pickerApplyDefaultIfEmpty" ' + (pickerApplyDefault ? 'checked' : '') + ' ' + (writable ? '' : 'disabled') + '>Apply suggested value only when linked target is empty</label>'
      + '<label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" data-param-index="' + index + '" data-param-field="pickerMultiSelect" ' + (pickerMultiSelect ? 'checked' : '') + ' ' + (writable ? '' : 'disabled') + '>Allow multiple selections and combine constants</label>'
      + '<label>Multi-select separator<input type="text" data-param-index="' + index + '" data-param-field="pickerValueSeparator" value="' + escapeAttr(pickerValueSeparator) + '" placeholder=" | " ' + (writable ? '' : 'disabled') + '></label>'
      + '<label>Empty multi-select value<input type="text" data-param-index="' + index + '" data-param-field="pickerEmptyValue" value="' + escapeAttr(pickerEmptyValue) + '" placeholder="0" ' + (writable ? '' : 'disabled') + '></label>'
      + '</div>'
      + '<div class="meta-line" style="margin-top:10px; margin-bottom:8px;">V3 builder: use the outline to select a node, edit it in the inspector, and validate the popup in the live preview. Keep the raw editor only for advanced/manual editing.</div>'
      + renderPickerVisualBuilder(param, index)
      + '<details style="margin-top:12px;">'
      + '<summary class="picker-advanced-summary">Advanced raw editor</summary>'
      + '<div class="grid" style="margin-top:10px;">'
      + '<label>Source types<textarea class="textarea-small" placeholder="Numeric&#10;Graph" data-param-index="' + index + '" data-param-field="pickerSourceTypesText" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(pickerSourceTypesText) + '</textarea><div class="tiny">One source type per line. Leave empty to hide the left column.</div></label>'
      + '<label>Picker structure<textarea class="textarea-small" placeholder="VAL_ONE | First choice | Short description&#10;VAL_TWO | Second choice | Another description" data-param-index="' + index + '" data-param-field="pickerItemsText" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(pickerItemsText) + '</textarea><div class="tiny"><strong>Simplest working setup:</strong> enable this section, keep Source types empty, then enter one choice per line like <code>VAL_ONE | First choice | Description</code>.</div><div class="tiny" style="margin-top:6px;">Advanced format: <code>value | label | description | defaultValue | type1, type2</code>. Optional headers: <code>[Section] Common | Shared choices</code> and <code>[Group] Colors | Foreground / background</code>.</div><div class="tiny" style="margin-top:6px;">For Editor = Enum, these values are also reused as the dropdown list when <strong>Options</strong> is empty.</div></label>'
      + '</div>'
      + '</details></details></td></tr>';
    }).join('');


    const longDescription = fn.longDescription && fn.longDescription !== fn.description ? fn.longDescription : '';
    const notesText = Array.isArray(fn.notes) ? fn.notes.join('\\n') : (fn.notes || '');
    const warningsText = Array.isArray(fn.warnings) ? fn.warnings.join('\\n') : (fn.warnings || '');
    const declarationText = fn.declaration || fn.signature || '';

    let content = '<div class="card"><h3>' + escapeHtml(symbolLabel) + '</h3>' + renderSelectionPath() + '<div class="grid">'
      + '<label>Name<input type="text" data-function-field="name" value="' + escapeAttr(fn.name || '') + '" ' + (writable ? '' : 'disabled') + '></label>'
      + '<label>Kind<select data-function-field="symbolKind" ' + (writable ? '' : 'disabled') + '>' + symbolKindOptions(symbolKind) + '</select></label>'
      + '<label>Header<input type="text" data-function-field="header" value="' + escapeAttr(fn.header || '') + '" ' + (writable ? '' : 'disabled') + '></label>';

    if (isCallable) {
      content += '<label>Return type<input type="text" data-function-field="returnType" value="' + escapeAttr(fn.returnType || '') + '" ' + (writable ? '' : 'disabled') + '></label>'
        + '<label>Return description<input type="text" data-function-field="returnDescription" value="' + escapeAttr(fn.returnDescription || '') + '" ' + (writable ? '' : 'disabled') + '></label>';
    } else {
      content += '<label>Type label<input type="text" data-function-field="returnType" value="' + escapeAttr(fn.returnType || symbolLabel.toLowerCase()) + '" ' + (writable ? '' : 'disabled') + '></label>';
    }

    content += '</div>'
      + '<label style="margin-top:12px;">Description<textarea data-function-field="description" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(fn.description || '') + '</textarea></label>'
      + '<label style="margin-top:12px;">Long description<textarea data-function-field="longDescription" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(longDescription || '') + '</textarea></label>'
      + '<label style="margin-top:12px;">Declaration / signature<textarea data-function-field="declaration" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(declarationText) + '</textarea></label>'
      + '<label style="margin-top:12px;">Insert text<textarea data-function-field="insertText" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(fn.insertText || '') + '</textarea></label>'
      + '<label style="margin-top:12px;">Notes<textarea data-function-field="notesText" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(notesText) + '</textarea></label>'
      + '<label style="margin-top:12px;">Warnings<textarea data-function-field="warningsText" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(warningsText) + '</textarea></label>'
      + '</div>';

    content += '<div class="card"><h3>' + escapeHtml(symbolLabel) + ' actions</h3><div class="actions">'
      + '<button class="action secondary" data-action="renameSelected" ' + (writable ? '' : 'disabled') + '>Rename</button>'
      + '<button class="action secondary" data-action="duplicateSelected" ' + (writable ? '' : 'disabled') + '>Duplicate</button>'
      + '<button class="action secondary" data-action="moveSelectedUp" ' + (writable && canMoveUp ? '' : 'disabled') + '>Move up</button>'
      + '<button class="action secondary" data-action="moveSelectedDown" ' + (writable && canMoveDown ? '' : 'disabled') + '>Move down</button>'
      + '<button class="action secondary" data-action="moveFunctionToCategory" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(categoryActionLabel) + '</button>'
      + '<button class="action secondary" data-action="moveFunctionToGroup" ' + (writable ? '' : 'disabled') + '>' + escapeHtml(groupActionLabel) + '</button>'
      + '<button class="action danger" data-action="deleteFunction" ' + (writable ? '' : 'disabled') + '>' + escapeHtml((checkedFunctions.length > 1 ? 'Delete selected symbols (' + checkedFunctions.length + ')' : 'Delete ' + symbolLabel.toLowerCase())) + '</button>'
      + '</div></div>';

    content += '<div class="card"><h3>Preview</h3>';
    if (isCallable) {
      content += '<div class="grid"><label>Optional return target<input type="text" id="previewReturnTarget" value="' + escapeAttr(previewReturnTarget) + '" ' + (writable && !isVoid ? '' : 'disabled') + '></label></div>';
    }
    content += '<div class="meta-line">Generated signature</div><div class="code" id="previewSignatureCode">' + escapeHtml(buildSignature(fn)) + '</div>'
      + '<div class="meta-line" style="margin-top:12px;">Generated output</div><div class="code" id="previewCallCode">' + escapeHtml(buildPreview(fn)) + '</div></div>';

    if (isCallable) {
      content += '<div class="card"><h3>Parameters</h3><div class="actions" style="margin-bottom:8px;">'
        + '<button class="action" data-action="addParameter" ' + (writable ? '' : 'disabled') + '>+ Parameter</button>'
        + '</div><div class="meta-line">Presets and options use one choice per line. Format: value | description | detail. The optional selection window uses [Section] / [Group] markers plus value | label | description | defaultValue | source types.</div>'
        + '<table class="table"><thead><tr><th>#</th><th>Type</th><th>Name</th><th>Description</th><th>Editor</th><th>Default</th><th>Placeholder</th><th>Presets</th><th>Options</th><th>Actions</th></tr></thead><tbody>'
        + rows + '</tbody></table></div>';
    } else {
      content += '<div class="card"><h3>Declaration details</h3><div class="meta-line">This symbol is edited as a declaration block. The generated output uses the declaration or insert text directly.</div></div>';
      content += renderFieldSummaryCard(fn, symbolLabel);
      content += renderMethodSummaryCard(fn);
      content += renderEnumValueSummaryCard(fn);
    }
    return content;
  }

  function renderEditor() {
    ensureValidSelection();
    let content = '';
    try {
      if (selection.kind === 'pack') {
        content = renderPackEditor();
      } else if (selection.kind === 'environment') {
        const environment = getEnvironment(selection.environmentIndex);
        content = environment ? renderEnvironmentEditor(environment, selection.environmentIndex) : renderPackEditor();
      } else if (selection.kind === 'library') {
        const library = getLibrary(selection.environmentIndex, selection.libraryIndex);
        content = library ? renderLibraryEditor(library, selection.environmentIndex, selection.libraryIndex) : renderPackEditor();
      } else if (selection.kind === 'category') {
        const category = getCategory(selection);
        content = category ? renderCategoryEditor(category, selection.environmentIndex, selection.libraryIndex, selection.categoryIndex) : renderPackEditor();
      } else if (selection.kind === 'group') {
        const group = getGroup(selection);
        content = group ? renderGroupEditor(group, selection.environmentIndex, selection.libraryIndex, selection.categoryIndex, selection.groupPath || []) : renderPackEditor();
      } else {
        const fn = getFunction(selection);
        content = fn ? renderFunctionEditor(fn, selection.environmentIndex, selection.libraryIndex, selection.categoryIndex, selection.functionIndex) : renderPackEditor();
      }
    } catch (error) {
      console.error('Failed to render selection', selection, error);
      content = renderEditorError(error);
    }
    editorBodyEl.innerHTML = '<div id="validationContainer">' + renderValidationCard(getCurrentValidationMessages()) + '</div>' + content;
  }

  function updateValidationUi() {
    const validationContainer = document.getElementById('validationContainer');
    if (validationContainer) {
      validationContainer.innerHTML = renderValidationCard(getCurrentValidationMessages());
    }
    syncHeaderState();
  }

  function updateFunctionPreviewUi() {
    const fn = selection.kind === 'function' ? getFunction(selection) : null;
    const signatureNode = document.getElementById('previewSignatureCode');
    const callNode = document.getElementById('previewCallCode');
    const returnTargetNode = document.getElementById('previewReturnTarget');
    if (!fn) {
      updateValidationUi();
      return;
    }
    const isVoid = String(fn.returnType || 'void').trim().toLowerCase() === 'void';
    if (isVoid) {
      previewReturnTarget = '';
    }
    if (returnTargetNode instanceof HTMLInputElement) {
      returnTargetNode.disabled = !writable || isVoid;
      if (isVoid) {
        returnTargetNode.value = '';
      }
    }
    if (signatureNode) signatureNode.textContent = buildSignature(fn);
    if (callNode) callNode.textContent = buildPreview(fn);
    updateValidationUi();
  }

  function renderFatalError(error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown visual editor error');
    console.error('Visual Pack Editor render failed', error);
    if (treeEl) {
      treeEl.innerHTML = '<div class="tree-empty">Unable to render the pack tree. ' + escapeHtml(message) + '</div>';
    }
    if (editorBodyEl) {
      editorBodyEl.innerHTML = '<div class="card validation-card"><h3>Visual Pack Editor error</h3><div class="meta-line">' + escapeHtml(message) + '</div><div class="tiny">Reload the pack after correcting the malformed entry. The JSON can still be opened from the toolbar.</div></div>';
    }
  }

  function render() {
    try {
      renderTree();
      renderEditor();
      syncHeaderState();
    } catch (error) {
      renderFatalError(error);
    }
  }

  function addEnvironment() {
    requestInput('addEnvironment', { title: 'Add environment', prompt: 'Environment name', value: 'New Environment' });
  }

  function addLibrary(environmentIndex) {
    const environment = getEnvironment(environmentIndex);
    if (!environment) return;
    requestInput('addLibrary', { title: 'Add library', prompt: 'Library name', value: 'New Library', payload: { environmentIndex: environmentIndex } });
  }

  function addCategory(environmentIndex, libraryIndex) {
    const lib = getLibrary(environmentIndex, libraryIndex);
    if (!lib) return;
    requestInput('addCategory', { title: 'Add category', prompt: 'Category name', value: 'New Category', payload: { environmentIndex: environmentIndex, libraryIndex: libraryIndex } });
  }

  function addGroup() {
    if (selection.kind !== 'category' && selection.kind !== 'group') return;
    const category = getCategory(selection);
    if (!category) return;
    requestInput('addGroup', { title: 'Add group', prompt: 'Group name', value: 'New Group', payload: { environmentIndex: selection.environmentIndex, libraryIndex: selection.libraryIndex, categoryIndex: selection.categoryIndex, groupPath: selection.kind === 'group' ? (selection.groupPath || []) : [] } });
  }

  function addFunction(environmentIndex, libraryIndex, categoryIndex) {
    const category = getCategory({ kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex });
    if (!category) return;
    const itemLabel = getCategoryItemLabel(category && category.name); requestInput('addFunction', { title: 'Add ' + itemLabel.slice(0, -1), prompt: itemLabel.slice(0, -1) + ' name', value: itemLabel === 'functions' ? 'NewFunction' : 'NewSymbol', payload: { environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: selection.kind === 'group' ? (selection.groupPath || []) : [] } });
  }

  function addParameter() {
    const fn = getFunction(selection);
    if (!fn) return;
    fn.parameters = fn.parameters || [];
    fn.parameters.push({ name: uniqueName('param' + (fn.parameters.length + 1), fn.parameters.map((item) => item.name)), type: 'int', description: '', editorType: 'text', defaultValue: '', placeholder: '', presets: [], options: [] });
    render();
  }

  function deleteSelected(kind, payload) {
    const checked = !payload ? getCheckedItemsForCurrentSelection() : [];
    if (kind === 'deleteEnvironment' && checked.length > 1) {
      requestConfirm('deleteCheckedEnvironments', { title: 'Delete selected environments', message: 'Delete ' + checked.length + ' selected environments and everything they contain?', confirmLabel: 'Delete', payload: { items: checked } });
      return;
    }
    if (kind === 'deleteLibrary' && checked.length > 1) {
      requestConfirm('deleteCheckedLibraries', { title: 'Delete selected libraries', message: 'Delete ' + checked.length + ' selected libraries and all nested categories/symbols?', confirmLabel: 'Delete', payload: { items: checked } });
      return;
    }
    if (kind === 'deleteCategory' && checked.length > 1) {
      requestConfirm('deleteCheckedCategories', { title: 'Delete selected categories', message: 'Delete ' + checked.length + ' selected categories and all nested symbols/groups?', confirmLabel: 'Delete', payload: { items: checked } });
      return;
    }
    if (kind === 'deleteGroup' && checked.length > 1) {
      requestConfirm('deleteCheckedGroups', { title: 'Delete selected groups', message: 'Delete ' + checked.length + ' selected groups and all nested content?', confirmLabel: 'Delete', payload: { items: checked } });
      return;
    }
    if (kind === 'deleteFunction' && checked.length > 1) {
      requestConfirm('deleteCheckedFunctions', { title: 'Delete selected symbols', message: 'Delete ' + checked.length + ' selected symbols?', confirmLabel: 'Delete', payload: { items: checked } });
      return;
    }
    if (kind === 'deleteEnvironment') {
      const environmentIndex = payload && typeof payload.environmentIndex === 'number' ? payload.environmentIndex : selection.environmentIndex;
      requestConfirm('deleteEnvironment', { title: 'Delete environment', message: 'Delete this environment and all its libraries/categories/symbols?', confirmLabel: 'Delete', payload: { environmentIndex: environmentIndex } });
      return;
    }
    if (kind === 'deleteLibrary') {
      const environmentIndex = payload && typeof payload.environmentIndex === 'number' ? payload.environmentIndex : selection.environmentIndex;
      const libraryIndex = payload && typeof payload.libraryIndex === 'number' ? payload.libraryIndex : selection.libraryIndex;
      requestConfirm('deleteLibrary', { title: 'Delete library', message: 'Delete this library and all its categories/functions?', confirmLabel: 'Delete', payload: { environmentIndex: environmentIndex, libraryIndex: libraryIndex } });
      return;
    }
    if (kind === 'deleteCategory') {
      const environmentIndex = payload && typeof payload.environmentIndex === 'number' ? payload.environmentIndex : selection.environmentIndex;
      const libraryIndex = payload && typeof payload.libraryIndex === 'number' ? payload.libraryIndex : selection.libraryIndex;
      const categoryIndex = payload && typeof payload.categoryIndex === 'number' ? payload.categoryIndex : selection.categoryIndex;
      requestConfirm('deleteCategory', { title: 'Delete category', message: 'Delete this category and all its symbols?', confirmLabel: 'Delete', payload: { environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex } });
      return;
    }
    if (kind === 'deleteGroup') {
      const environmentIndex = payload && typeof payload.environmentIndex === 'number' ? payload.environmentIndex : selection.environmentIndex;
      const libraryIndex = payload && typeof payload.libraryIndex === 'number' ? payload.libraryIndex : selection.libraryIndex;
      const categoryIndex = payload && typeof payload.categoryIndex === 'number' ? payload.categoryIndex : selection.categoryIndex;
      const groupPath = payload && Array.isArray(payload.groupPath) ? payload.groupPath : (Array.isArray(selection.groupPath) ? selection.groupPath : []);
      requestConfirm('deleteGroup', { title: 'Delete group', message: 'Delete this group and all nested groups/symbols?', confirmLabel: 'Delete', payload: { environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: groupPath } });
      return;
    }
    if (kind === 'deleteFunction') {
      const environmentIndex = payload && typeof payload.environmentIndex === 'number' ? payload.environmentIndex : selection.environmentIndex;
      const libraryIndex = payload && typeof payload.libraryIndex === 'number' ? payload.libraryIndex : selection.libraryIndex;
      const categoryIndex = payload && typeof payload.categoryIndex === 'number' ? payload.categoryIndex : selection.categoryIndex;
      const functionIndex = payload && typeof payload.functionIndex === 'number' ? payload.functionIndex : selection.functionIndex;
      const groupPath = payload && Array.isArray(payload.groupPath) ? payload.groupPath : (Array.isArray(selection.groupPath) ? selection.groupPath : []);
      requestConfirm('deleteFunction', { title: 'Delete function', message: 'Delete this function?', confirmLabel: 'Delete', payload: { environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: functionIndex, groupPath: groupPath } });
    }
  }

  function selectionInEnvironment(environmentIndex) {
    return selection.kind === 'environment' ? selection.environmentIndex === environmentIndex : selection.kind === 'library' ? selection.environmentIndex === environmentIndex : selection.kind === 'category' ? selection.environmentIndex === environmentIndex : selection.kind === 'group' ? selection.environmentIndex === environmentIndex : selection.kind === 'function' ? selection.environmentIndex === environmentIndex : false;
  }

  function selectionInLibrary(environmentIndex, libraryIndex) {
    return selection.kind === 'library' ? selection.environmentIndex === environmentIndex && selection.libraryIndex === libraryIndex : selection.kind === 'category' ? selection.environmentIndex === environmentIndex && selection.libraryIndex === libraryIndex : selection.kind === 'group' ? selection.environmentIndex === environmentIndex && selection.libraryIndex === libraryIndex : selection.kind === 'function' ? selection.environmentIndex === environmentIndex && selection.libraryIndex === libraryIndex : false;
  }

  function selectionInCategory(environmentIndex, libraryIndex, categoryIndex) {
    return selection.kind === 'category' ? selection.environmentIndex === environmentIndex && selection.libraryIndex === libraryIndex && selection.categoryIndex === categoryIndex : selection.kind === 'group' ? selection.environmentIndex === environmentIndex && selection.libraryIndex === libraryIndex && selection.categoryIndex === categoryIndex : selection.kind === 'function' ? selection.environmentIndex === environmentIndex && selection.libraryIndex === libraryIndex && selection.categoryIndex === categoryIndex : false;
  }

  function samePath(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) { if (a[i] !== b[i]) return false; }
    return true;
  }

  function selectionInGroup(environmentIndex, libraryIndex, categoryIndex, groupPath) {
    if (selection.kind !== 'group' && selection.kind !== 'function') return false;
    return selection.environmentIndex === environmentIndex && selection.libraryIndex === libraryIndex && selection.categoryIndex === categoryIndex && samePath(selection.groupPath || [], groupPath || []);
  }

  function moveParameter(index, direction) {
    const fn = getFunction(selection);
    if (!fn || !Array.isArray(fn.parameters)) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= fn.parameters.length) return;
    const temp = fn.parameters[index];
    fn.parameters[index] = fn.parameters[nextIndex];
    fn.parameters[nextIndex] = temp;
    render();
  }

  function deleteParameter(index) {
    const fn = getFunction(selection);
    if (!fn || !Array.isArray(fn.parameters)) return;
    fn.parameters.splice(index, 1);
    render();
  }


  function addField() {
    const fn = getFunction(selection);
    if (!fn) return;
    fn.fields = Array.isArray(fn.fields) ? fn.fields : [];
    fn.fields.push({ name: uniqueName('field' + (fn.fields.length + 1), fn.fields.map((item) => item.name)), type: 'int', description: '' });
    syncCompositeDeclaration(fn);
    render();
  }

  function duplicateField(index) {
    const fn = getFunction(selection);
    if (!fn || !Array.isArray(fn.fields) || !fn.fields[index]) return;
    const copy = cloneData(fn.fields[index]);
    copy.name = uniqueName((copy.name || 'field') + '_copy', fn.fields.map((item) => item.name));
    fn.fields.splice(index + 1, 0, copy);
    syncCompositeDeclaration(fn);
    render();
  }

  function moveField(index, direction) {
    const fn = getFunction(selection);
    if (!fn || !Array.isArray(fn.fields)) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= fn.fields.length) return;
    const temp = fn.fields[index];
    fn.fields[index] = fn.fields[nextIndex];
    fn.fields[nextIndex] = temp;
    syncCompositeDeclaration(fn);
    render();
  }

  function deleteField(index) {
    const fn = getFunction(selection);
    if (!fn || !Array.isArray(fn.fields)) return;
    fn.fields.splice(index, 1);
    syncCompositeDeclaration(fn);
    render();
  }

  function addMethod() {
    const fn = getFunction(selection);
    if (!fn) return;
    fn.methods = Array.isArray(fn.methods) ? fn.methods : [];
    const className = String(fn.name || 'MyClass').trim() || 'MyClass';
    const unique = uniqueName('method', fn.methods.map((item) => item.name));
    const method = {
      name: unique,
      returnType: 'void',
      signature: 'void ' + unique + '();',
      declaration: 'void ' + unique + '();',
      description: '',
      access: 'public',
      qualifiers: [],
      paramsText: '',
      methodKind: 'method'
    };
    rebuildMethodFromMetadata(method, className);
    fn.methods.push(method);
    syncCompositeDeclaration(fn);
    render();
  }

  function duplicateMethod(index) {
    const fn = getFunction(selection);
    if (!fn || !Array.isArray(fn.methods) || !fn.methods[index]) return;
    const copy = cloneData(fn.methods[index]);
    copy.name = uniqueName((copy.name || 'method') + '_copy', fn.methods.map((item) => item.name));
    if (copy.signature) {
      copy.signature = String(copy.signature).replace(/([~A-Za-z_][A-Za-z0-9_]*)\\s*\\(/, copy.name + '(');
      copy.declaration = copy.signature;
    }
    updateMethodMetadataFromSignature(copy, String(fn.name || 'MyClass'));
    fn.methods.splice(index + 1, 0, copy);
    syncCompositeDeclaration(fn);
    render();
  }

  function moveMethod(index, direction) {
    const fn = getFunction(selection);
    if (!fn || !Array.isArray(fn.methods)) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= fn.methods.length) return;
    const temp = fn.methods[index];
    fn.methods[index] = fn.methods[nextIndex];
    fn.methods[nextIndex] = temp;
    syncCompositeDeclaration(fn);
    render();
  }

  function deleteMethod(index) {
    const fn = getFunction(selection);
    if (!fn || !Array.isArray(fn.methods)) return;
    fn.methods.splice(index, 1);
    syncCompositeDeclaration(fn);
    render();
  }

  function addEnumValue() {
    const fn = getFunction(selection);
    if (!fn) return;
    fn.enumValues = Array.isArray(fn.enumValues) ? fn.enumValues : [];
    fn.enumValues.push({ name: uniqueName('VALUE', fn.enumValues.map((item) => item.name)), value: '', description: '' });
    syncCompositeDeclaration(fn);
    render();
  }

  function duplicateEnumValue(index) {
    const fn = getFunction(selection);
    if (!fn || !Array.isArray(fn.enumValues) || !fn.enumValues[index]) return;
    const copy = cloneData(fn.enumValues[index]);
    copy.name = uniqueName((copy.name || 'VALUE') + '_COPY', fn.enumValues.map((item) => item.name));
    fn.enumValues.splice(index + 1, 0, copy);
    syncCompositeDeclaration(fn);
    render();
  }

  function moveEnumValue(index, direction) {
    const fn = getFunction(selection);
    if (!fn || !Array.isArray(fn.enumValues)) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= fn.enumValues.length) return;
    const temp = fn.enumValues[index];
    fn.enumValues[index] = fn.enumValues[nextIndex];
    fn.enumValues[nextIndex] = temp;
    syncCompositeDeclaration(fn);
    render();
  }

  function deleteEnumValue(index) {
    const fn = getFunction(selection);
    if (!fn || !Array.isArray(fn.enumValues)) return;
    fn.enumValues.splice(index, 1);
    syncCompositeDeclaration(fn);
    render();
  }

  document.body.addEventListener('change', (event) => {
    const rawTarget = event.target;
    if (!(rawTarget instanceof HTMLInputElement) || !rawTarget.classList.contains('multi-check')) return;
    const payload = rawTarget.getAttribute('data-multi');
    if (!payload) return;
    const parsed = deserializeCheckedNode(payload);
    if (!parsed) return;
    setNodeChecked(parsed, rawTarget.checked);
    syncSelectionToCheckedNodes(parsed);
    render();
  });

  document.body.addEventListener('click', (event) => {
    const rawTarget = event.target;
    const sourceElement = rawTarget instanceof Element ? rawTarget : (rawTarget && rawTarget.parentElement ? rawTarget.parentElement : null);
    const target = sourceElement ? sourceElement.closest('button') : null;
    if (!target) return;
    const selectPayload = target.getAttribute('data-select');
    if (selectPayload) { try { setSelection(JSON.parse(selectPayload)); } catch {} return; }
    const action = target.getAttribute('data-action');
    if (!action) return;
    if (!writable && action !== 'openJson') return;
    switch (action) {
      case 'savePack': { const errors = validatePack(); if (errors.length) { alert('Please fix validation issues before saving.'); render(); return; } vscode.postMessage({ type: 'savePack', pack: pack }); return; }
      case 'openJson': vscode.postMessage({ type: 'openJson' }); return;
      case 'deleteCurrentSelection': {
        const deleteState = getHeaderDeleteState();
        if (!deleteState.enabled || !deleteState.deleteKind) return;
        deleteSelected(deleteState.deleteKind);
        return;
      }
      case 'expandAll': {
        getEnvironments().forEach((environment, environmentIndex) => {
          expandedEnvironments.add(environmentKey(environmentIndex));
          (environment.libraries || []).forEach((library, libraryIndex) => {
            expandedLibraries.add(libraryKey(environmentIndex, libraryIndex));
            (library.categories || []).forEach((category, categoryIndex) => expandedCategories.add(categoryKey(environmentIndex, libraryIndex, categoryIndex)));
          });
        });
        renderTree();
        return;
      }
      case 'collapseAll': {
        expandedEnvironments.clear();
        expandedLibraries.clear();
        expandedCategories.clear();
        if (selection.kind !== 'pack') {
          selection = { kind: 'pack' };
          render();
        } else {
          renderTree();
        }
        return;
      }
      case 'clearMultiSelection':
        clearCheckedNodes();
        render();
        return;
      case 'toggleEnvironment': {
        const environmentIndex = Number(target.getAttribute('data-environment-index'));
        const key = environmentKey(environmentIndex);
        if (expandedEnvironments.has(key)) {
          if (selectionInEnvironment(environmentIndex)) {
            selection = { kind: 'environment', environmentIndex: environmentIndex };
          }
          expandedEnvironments.delete(key);
        } else {
          expandedEnvironments.add(key);
        }
        render();
        return;
      }
      case 'toggleLibrary': {
        const environmentIndex = Number(target.getAttribute('data-environment-index'));
        const libraryIndex = Number(target.getAttribute('data-library-index'));
        const key = libraryKey(environmentIndex, libraryIndex);
        if (expandedLibraries.has(key)) {
          if (selectionInLibrary(environmentIndex, libraryIndex)) {
            selection = { kind: 'library', environmentIndex: environmentIndex, libraryIndex: libraryIndex };
          }
          expandedLibraries.delete(key);
        } else {
          expandedLibraries.add(key);
        }
        render();
        return;
      }
      case 'toggleCategory': {
        const environmentIndex = Number(target.getAttribute('data-environment-index'));
        const libraryIndex = Number(target.getAttribute('data-library-index'));
        const categoryIndex = Number(target.getAttribute('data-category-index'));
        const key = categoryKey(environmentIndex, libraryIndex, categoryIndex);
        if (expandedCategories.has(key)) {
          if (selectionInCategory(environmentIndex, libraryIndex, categoryIndex)) {
            selection = { kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex };
          }
          expandedCategories.delete(key);
        } else {
          expandedCategories.add(key);
        }
        render();
        return;
      }
      case 'toggleGroup': {
        const environmentIndex = Number(target.getAttribute('data-environment-index'));
        const libraryIndex = Number(target.getAttribute('data-library-index'));
        const categoryIndex = Number(target.getAttribute('data-category-index'));
        const groupPath = String(target.getAttribute('data-group-path') || '').split('.').filter(Boolean).map((value) => Number(value));
        const key = groupKey(environmentIndex, libraryIndex, categoryIndex, groupPath);
        if (expandedGroups.has(key)) {
          if (selectionInGroup(environmentIndex, libraryIndex, categoryIndex, groupPath)) {
            selection = { kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: groupPath };
          }
          expandedGroups.delete(key);
        } else {
          expandedGroups.add(key);
        }
        render();
        return;
      }
      case 'addEnvironment': addEnvironment(); return;
      case 'addLibrary': addLibrary(Number(target.getAttribute('data-environment-index') || selection.environmentIndex || 0)); return;
      case 'addCategory': addCategory(Number(target.getAttribute('data-environment-index') || selection.environmentIndex || 0), Number(target.getAttribute('data-library-index') || selection.libraryIndex || 0)); return;
      case 'addGroup': addGroup(); return;
      case 'addFunction': addFunction(Number(target.getAttribute('data-environment-index') || selection.environmentIndex || 0), Number(target.getAttribute('data-library-index') || selection.libraryIndex || 0), Number(target.getAttribute('data-category-index') || selection.categoryIndex || 0)); return;
      case 'addParameter': addParameter(); return;
      case 'addField': addField(); return;
      case 'addEnumValue': addEnumValue(); return;
      case 'renameSelected': renameSelected(); return;
      case 'duplicateSelected': duplicateSelected(); return;
      case 'moveSelectedUp': moveSelected(-1); return;
      case 'moveSelectedDown': moveSelected(1); return;
      case 'moveLibraryToEnvironment': (getCheckedItemsForCurrentSelection().length > 1 ? moveCheckedLibrariesToEnvironmentPrompt() : moveLibraryToEnvironmentPrompt()); return;
      case 'moveCategoryToLibrary': (getCheckedItemsForCurrentSelection().length > 1 ? moveCheckedCategoriesToLibraryPrompt() : moveCategoryToLibraryPrompt()); return;
      case 'moveGroupToParent': (getCheckedItemsForCurrentSelection().length > 1 ? moveCheckedGroupsToParentPrompt() : moveGroupToParentPrompt()); return;
      case 'moveFunctionToCategory': (getCheckedItemsForCurrentSelection().length > 1 ? moveCheckedFunctionsToCategoryPrompt() : moveFunctionToCategoryPrompt()); return;
      case 'moveFunctionToGroup': (getCheckedItemsForCurrentSelection().length > 1 ? moveCheckedFunctionsToGroupPrompt() : moveFunctionToGroupPrompt()); return;
      case 'deleteEnvironment': deleteSelected('deleteEnvironment'); return;
      case 'deleteLibrary': deleteSelected(action); return;
      case 'deleteLibraryFromEnvironment': deleteSelected('deleteLibrary', { environmentIndex: Number(target.getAttribute('data-environment-index')), libraryIndex: Number(target.getAttribute('data-library-index')) }); return;
      case 'deleteCategory': deleteSelected(action); return;
      case 'deleteGroup': deleteSelected(action); return;
      case 'deleteFunction': deleteSelected(action); return;
      case 'deleteCategoryFromList': deleteSelected('deleteCategory', { environmentIndex: Number(target.getAttribute('data-environment-index')), libraryIndex: Number(target.getAttribute('data-library-index')), categoryIndex: Number(target.getAttribute('data-category-index')) }); return;
      case 'deleteGroupFromList': deleteSelected('deleteGroup', { environmentIndex: Number(target.getAttribute('data-environment-index')), libraryIndex: Number(target.getAttribute('data-library-index')), categoryIndex: Number(target.getAttribute('data-category-index')), groupPath: String(target.getAttribute('data-group-path') || '').split('.').filter(Boolean).map((value) => Number(value)) }); return;
      case 'deleteFunctionFromList': deleteSelected('deleteFunction', { environmentIndex: Number(target.getAttribute('data-environment-index')), libraryIndex: Number(target.getAttribute('data-library-index')), categoryIndex: Number(target.getAttribute('data-category-index')), functionIndex: Number(target.getAttribute('data-function-index')), groupPath: String(target.getAttribute('data-group-path') || '').split('.').filter(Boolean).map((value) => Number(value)) }); return;
      case 'addContentPack': vscode.postMessage({ type: 'runPackTool', operation: 'addContentPack' }); return;
      case 'exportContentPack': vscode.postMessage({ type: 'runPackTool', operation: 'exportContentPack' }); return;
      case 'addContentEnvironment': vscode.postMessage({ type: 'runPackTool', operation: 'addContentEnvironment', payload: { environmentIndex: selection.environmentIndex } }); return;
      case 'exportContentEnvironment': vscode.postMessage({ type: 'runPackTool', operation: 'exportContentEnvironment', payload: { environmentIndex: selection.environmentIndex } }); return;
      case 'addContentLibrary': vscode.postMessage({ type: 'runPackTool', operation: 'addContentLibrary', payload: { environmentIndex: Number(target.getAttribute('data-environment-index') || selection.environmentIndex || 0), libraryIndex: Number(target.getAttribute('data-library-index') || selection.libraryIndex || 0) } }); return;
      case 'exportContentLibrary': vscode.postMessage({ type: 'runPackTool', operation: 'exportContentLibrary', payload: { environmentIndex: Number(target.getAttribute('data-environment-index') || selection.environmentIndex || 0), libraryIndex: Number(target.getAttribute('data-library-index') || selection.libraryIndex || 0) } }); return;
      case 'addContentCategory': vscode.postMessage({ type: 'runPackTool', operation: 'addContentCategory', payload: { environmentIndex: Number(target.getAttribute('data-environment-index') || selection.environmentIndex || 0), libraryIndex: Number(target.getAttribute('data-library-index') || selection.libraryIndex || 0), categoryIndex: Number(target.getAttribute('data-category-index') || selection.categoryIndex || 0) } }); return;
      case 'exportContentCategory': vscode.postMessage({ type: 'runPackTool', operation: 'exportContentCategory', payload: { environmentIndex: Number(target.getAttribute('data-environment-index') || selection.environmentIndex || 0), libraryIndex: Number(target.getAttribute('data-library-index') || selection.libraryIndex || 0), categoryIndex: Number(target.getAttribute('data-category-index') || selection.categoryIndex || 0) } }); return;
      case 'moveParamUp': moveParameter(Number(target.getAttribute('data-param-index')), -1); return;
      case 'moveParamDown': moveParameter(Number(target.getAttribute('data-param-index')), 1); return;
      case 'duplicateParameter': duplicateParameter(Number(target.getAttribute('data-param-index'))); return;
      case 'deleteParameter': deleteParameter(Number(target.getAttribute('data-param-index'))); return;
      case 'loadPickerSimpleExample': loadPickerExample(Number(target.getAttribute('data-param-index')), 'simple'); return;
      case 'loadPickerStructuredExample': loadPickerExample(Number(target.getAttribute('data-param-index')), 'structured'); return;
      case 'loadPickerFromChoices': loadPickerExample(Number(target.getAttribute('data-param-index')), 'choices'); return;
      case 'loadPickerFromBuiltInHelper': loadPickerExample(Number(target.getAttribute('data-param-index')), 'builtIn'); return;
      case 'selectPickerNode': {
        setPickerEditorSelection({
          paramIndex: Number(target.getAttribute('data-param-index')),
          nodeType: String(target.getAttribute('data-picker-node-type') || 'root'),
          sourceIndex: Number(target.getAttribute('data-picker-source-index')),
          sectionIndex: Number(target.getAttribute('data-picker-section-index')),
          groupIndex: Number(target.getAttribute('data-picker-group-index')),
          itemIndex: Number(target.getAttribute('data-picker-item-index'))
        });
        return;
      }
      case 'addPickerSourceType': addPickerSourceType(Number(target.getAttribute('data-param-index'))); return;
      case 'movePickerSourceTypeUp': movePickerSourceType(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-source-index')), -1); return;
      case 'movePickerSourceTypeDown': movePickerSourceType(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-source-index')), 1); return;
      case 'deletePickerSourceType': deletePickerSourceType(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-source-index'))); return;
      case 'addPickerSection': addPickerSection(Number(target.getAttribute('data-param-index'))); return;
      case 'movePickerSectionUp': movePickerSection(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index')), -1); return;
      case 'movePickerSectionDown': movePickerSection(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index')), 1); return;
      case 'deletePickerSection': deletePickerSection(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index'))); return;
      case 'duplicatePickerSection': duplicatePickerSection(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index'))); return;
      case 'addPickerGroup': addPickerGroup(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index'))); return;
      case 'movePickerGroupUp': movePickerGroup(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index')), Number(target.getAttribute('data-picker-group-index')), -1); return;
      case 'movePickerGroupDown': movePickerGroup(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index')), Number(target.getAttribute('data-picker-group-index')), 1); return;
      case 'deletePickerGroup': deletePickerGroup(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index')), Number(target.getAttribute('data-picker-group-index'))); return;
      case 'duplicatePickerGroup': duplicatePickerGroup(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index')), Number(target.getAttribute('data-picker-group-index'))); return;
      case 'addPickerItem': addPickerItem(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index')), Number(target.getAttribute('data-picker-group-index'))); return;
      case 'movePickerItemUp': movePickerItem(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index')), Number(target.getAttribute('data-picker-group-index')), Number(target.getAttribute('data-picker-item-index')), -1); return;
      case 'movePickerItemDown': movePickerItem(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index')), Number(target.getAttribute('data-picker-group-index')), Number(target.getAttribute('data-picker-item-index')), 1); return;
      case 'deletePickerItem': deletePickerItem(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index')), Number(target.getAttribute('data-picker-group-index')), Number(target.getAttribute('data-picker-item-index'))); return;
      case 'duplicatePickerItem': duplicatePickerItem(Number(target.getAttribute('data-param-index')), Number(target.getAttribute('data-picker-section-index')), Number(target.getAttribute('data-picker-group-index')), Number(target.getAttribute('data-picker-item-index'))); return;
      case 'moveFieldUp': moveField(Number(target.getAttribute('data-field-index')), -1); return;
      case 'moveFieldDown': moveField(Number(target.getAttribute('data-field-index')), 1); return;
      case 'duplicateField': duplicateField(Number(target.getAttribute('data-field-index'))); return;
      case 'deleteField': deleteField(Number(target.getAttribute('data-field-index'))); return;
      case 'addMethod': addMethod(); return;
      case 'moveMethodUp': moveMethod(Number(target.getAttribute('data-method-index')), -1); return;
      case 'moveMethodDown': moveMethod(Number(target.getAttribute('data-method-index')), 1); return;
      case 'duplicateMethod': duplicateMethod(Number(target.getAttribute('data-method-index'))); return;
      case 'deleteMethod': deleteMethod(Number(target.getAttribute('data-method-index'))); return;
      case 'moveEnumValueUp': moveEnumValue(Number(target.getAttribute('data-enum-index')), -1); return;
      case 'moveEnumValueDown': moveEnumValue(Number(target.getAttribute('data-enum-index')), 1); return;
      case 'duplicateEnumValue': duplicateEnumValue(Number(target.getAttribute('data-enum-index'))); return;
      case 'deleteEnumValue': deleteEnumValue(Number(target.getAttribute('data-enum-index'))); return;
    }
  });

  document.body.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    if (target.id === 'treeFilter') { treeFilter = target.value; renderTree(); return; }
    if (target.id === 'previewReturnTarget') { previewReturnTarget = target.value; updateFunctionPreviewUi(); return; }
    const packField = target.getAttribute('data-pack-field');
    if (packField) {
      if (target instanceof HTMLInputElement && target.type === 'checkbox') pack[packField] = target.checked;
      else pack[packField] = target.value;
      if (packField === 'readOnly') { render(); return; }
      renderTree(); updateValidationUi(); return;
    }
    const environmentField = target.getAttribute('data-environment-field');
    if (environmentField) { const environmentIndex = Number(target.getAttribute('data-environment-index') || selection.environmentIndex || 0); const environment = getEnvironment(environmentIndex); if (environment) environment[environmentField] = target.value; renderTree(); updateValidationUi(); return; }
    const libraryField = target.getAttribute('data-library-field');
    if (libraryField) { const environmentIndex = Number(target.getAttribute('data-environment-index') || selection.environmentIndex || 0); const libraryIndex = Number(target.getAttribute('data-library-index') || selection.libraryIndex || 0); const library = getLibrary(environmentIndex, libraryIndex); if (library) library[libraryField] = target.value; renderTree(); updateValidationUi(); return; }
    const categoryField = target.getAttribute('data-category-field');
    if (categoryField) { const category = getCategory(selection); if (category) category[categoryField] = target.value; renderTree(); updateValidationUi(); return; }
    const groupField = target.getAttribute('data-group-field');
    if (groupField) { const group = getGroup(selection); if (group) group[groupField] = target.value; renderTree(); updateValidationUi(); return; }
    const functionField = target.getAttribute('data-function-field');
    if (functionField) { const fn = getFunction(selection); if (fn) { if (functionField === 'notesText') fn.notes = String(target.value || '').split(/\\r?\\n/).map((item) => item.trim()).filter(Boolean); else if (functionField === 'warningsText') fn.warnings = String(target.value || '').split(/\\r?\\n/).map((item) => item.trim()).filter(Boolean); else if (functionField === 'declaration') { fn.declaration = target.value; fn.signature = target.value; } else fn[functionField] = target.value; } if (functionField === 'symbolKind') { render(); return; } renderTree(); updateFunctionPreviewUi(); return; }
    const pickerSourceField = target.getAttribute('data-picker-source-field');
    if (pickerSourceField) {
      const fn = getFunction(selection);
      const paramIndex = Number(target.getAttribute('data-param-index'));
      const sourceIndex = Number(target.getAttribute('data-picker-source-index'));
      const config = getPickerConfigForEditor(fn, paramIndex);
      if (config) {
        config.sourceTypes = Array.isArray(config.sourceTypes) ? config.sourceTypes : [];
        if (sourceIndex >= 0 && sourceIndex < config.sourceTypes.length) config.sourceTypes[sourceIndex] = target.value;
        updateValidationUi();
      }
      return;
    }
    const pickerSectionField = target.getAttribute('data-picker-section-field');
    if (pickerSectionField) {
      const fn = getFunction(selection);
      const paramIndex = Number(target.getAttribute('data-param-index'));
      const sectionIndex = Number(target.getAttribute('data-picker-section-index'));
      const config = getPickerConfigForEditor(fn, paramIndex);
      const section = config && Array.isArray(config.sections) ? config.sections[sectionIndex] : null;
      if (section) {
        section[pickerSectionField] = target.value;
        updateValidationUi();
      }
      return;
    }
    const pickerGroupField = target.getAttribute('data-picker-group-field');
    if (pickerGroupField) {
      const fn = getFunction(selection);
      const paramIndex = Number(target.getAttribute('data-param-index'));
      const sectionIndex = Number(target.getAttribute('data-picker-section-index'));
      const groupIndex = Number(target.getAttribute('data-picker-group-index'));
      const config = getPickerConfigForEditor(fn, paramIndex);
      const section = config && Array.isArray(config.sections) ? config.sections[sectionIndex] : null;
      const group = section && Array.isArray(section.groups) ? section.groups[groupIndex] : null;
      if (group) {
        group[pickerGroupField] = target.value;
        updateValidationUi();
      }
      return;
    }
    const pickerItemField = target.getAttribute('data-picker-item-field');
    if (pickerItemField) {
      const fn = getFunction(selection);
      const paramIndex = Number(target.getAttribute('data-param-index'));
      const sectionIndex = Number(target.getAttribute('data-picker-section-index'));
      const groupIndex = Number(target.getAttribute('data-picker-group-index'));
      const itemIndex = Number(target.getAttribute('data-picker-item-index'));
      const config = getPickerConfigForEditor(fn, paramIndex);
      const section = config && Array.isArray(config.sections) ? config.sections[sectionIndex] : null;
      const group = section && Array.isArray(section.groups) ? section.groups[groupIndex] : null;
      const item = group && Array.isArray(group.items) ? group.items[itemIndex] : null;
      if (item) {
        if (pickerItemField === 'sourceTypesText') item.sourceTypes = parseCsvChoiceList(target.value);
        else item[pickerItemField] = target.value;
        updateValidationUi();
      }
      return;
    }
    const paramField = target.getAttribute('data-param-field');
    if (paramField) {
      const fn = getFunction(selection);
      const index = Number(target.getAttribute('data-param-index'));
      if (fn && Array.isArray(fn.parameters) && fn.parameters[index]) {
        const param = fn.parameters[index];
        if (paramField === 'presetsText') {
          param.presets = parseChoiceText(target.value);
        } else if (paramField === 'optionsText') {
          param.options = parseChoiceText(target.value);
        } else if (paramField === 'pickerEnabled') {
          if (target instanceof HTMLInputElement && target.checked) ensureParamPickerConfig(param, fn, index);
          else delete param.pickerConfig;
        } else if (paramField === 'pickerTitle') {
          ensureParamPickerConfig(param, fn, index).title = target.value;
        } else if (paramField === 'pickerSelectionLabel') {
          ensureParamPickerConfig(param, fn, index).selectionLabel = target.value;
        } else if (paramField === 'pickerSubtitle') {
          ensureParamPickerConfig(param, fn, index).subtitle = target.value;
        } else if (paramField === 'pickerSourceTypesText') {
          ensureParamPickerConfig(param, fn, index).sourceTypes = parsePickerSourceTypesText(target.value);
        } else if (paramField === 'pickerItemsText') {
          ensureParamPickerConfig(param, fn, index).sections = parseStructuredPickerItemsText(target.value);
        } else if (paramField === 'pickerApplyDefaultIfEmpty') {
          ensureParamPickerConfig(param, fn, index).applyDefaultIfEmpty = !!(target instanceof HTMLInputElement && target.checked);
        } else if (paramField === 'pickerMultiSelect') {
          ensureParamPickerConfig(param, fn, index).multiSelect = !!(target instanceof HTMLInputElement && target.checked);
        } else if (paramField === 'pickerValueSeparator') {
          ensureParamPickerConfig(param, fn, index).valueSeparator = target.value || ' | ';
        } else if (paramField === 'pickerEmptyValue') {
          ensureParamPickerConfig(param, fn, index).emptyValue = target.value;
        } else {
          param[paramField] = target.value;
        }
        updateFunctionPreviewUi();
        return;
      }
    }
    const methodField = target.getAttribute('data-method-field');
    if (methodField) {
      const fn = getFunction(selection);
      const index = Number(target.getAttribute('data-method-index'));
      if (fn && Array.isArray(fn.methods) && fn.methods[index]) {
        const method = fn.methods[index];
        if (methodField === 'qualifiersText') method.qualifiers = String(target.value || '').split(/\\s+/).map((item) => item.trim()).filter(Boolean);
        else method[methodField] = target.value;
        updateMethodMetadata(method, String(fn.name || 'MyClass'));
        syncCompositeDeclaration(fn);
        updateFunctionPreviewUi();
        return;
      }
    }
    const fieldField = target.getAttribute('data-field-field');
    if (fieldField) { const fn = getFunction(selection); const index = Number(target.getAttribute('data-field-index')); if (fn && Array.isArray(fn.fields) && fn.fields[index]) { if (fieldField === 'access') fn.fields[index][fieldField] = normalizeAccessLabel(target.value || 'private', 'private'); else fn.fields[index][fieldField] = target.value; syncCompositeDeclaration(fn); updateFunctionPreviewUi(); return; } }
    const enumField = target.getAttribute('data-enum-field');
    if (enumField) { const fn = getFunction(selection); const index = Number(target.getAttribute('data-enum-index')); if (fn && Array.isArray(fn.enumValues) && fn.enumValues[index]) { fn.enumValues[index][enumField] = target.value; syncCompositeDeclaration(fn); updateFunctionPreviewUi(); return; } }
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message) return;
    if (message.type === 'packSaved' && message.pack) { pack = message.pack; render(); return; }
    if (message.type === 'inputResult') {
      const value = String(message.value || '').trim();
      const payload = message.payload || {};
      if (!value) return;
      if (message.operation === 'addEnvironment') {
        pack.environments = Array.isArray(pack.environments) ? pack.environments : [];
        const finalName = uniqueName(value || 'Environment', (pack.environments || []).map((item) => item.name));
        pack.environments.push({ name: finalName, libraries: [] });
        selection = { kind: 'environment', environmentIndex: pack.environments.length - 1 };
        render();
        return;
      }
      if (message.operation === 'addLibrary') {
        const environmentIndex = Number(payload.environmentIndex);
        const environment = getEnvironment(environmentIndex);
        if (!environment) return;
        environment.libraries = Array.isArray(environment.libraries) ? environment.libraries : [];
        const finalName = uniqueName(value || 'Library', (environment.libraries || []).map((item) => item.name));
        environment.libraries.push({ name: finalName, categories: [] });
        selection = { kind: 'library', environmentIndex: environmentIndex, libraryIndex: environment.libraries.length - 1 };
        render();
        return;
      }
      if (message.operation === 'addCategory') {
        const environmentIndex = Number(payload.environmentIndex);
        const libraryIndex = Number(payload.libraryIndex);
        const lib = getLibrary(environmentIndex, libraryIndex);
        if (!lib) return;
        lib.categories = lib.categories || [];
        const finalName = uniqueName(value || 'Category', (lib.categories || []).map((item) => item.name));
        lib.categories.push({ name: finalName, functions: [], groups: [] });
        selection = { kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: lib.categories.length - 1 };
        render();
        return;
      }
      if (message.operation === 'addGroup') {
        const environmentIndex = Number(payload.environmentIndex);
        const libraryIndex = Number(payload.libraryIndex);
        const categoryIndex = Number(payload.categoryIndex);
        const category = getCategory({ kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex });
        if (!category) return;
        const parentPath = Array.isArray(payload.groupPath) ? payload.groupPath : [];
        let groups = parentPath.length ? getGroupChildren(getGroup({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: parentPath })) : getCategoryGroups(category);
        const finalName = uniqueName(value || 'Group', (groups || []).map((item) => item.name));
        groups.push({ name: finalName, description: '', functions: [], groups: [] });
        selection = { kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: parentPath.concat(groups.length - 1) };
        render();
        return;
      }
      if (message.operation === 'addFunction') {
        const environmentIndex = Number(payload.environmentIndex);
        const libraryIndex = Number(payload.libraryIndex);
        const categoryIndex = Number(payload.categoryIndex);
        const category = getCategory({ kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex });
        if (!category) return;
        const groupPath = Array.isArray(payload.groupPath) ? payload.groupPath : [];
        const container = groupPath.length ? getGroupFunctions(getGroup({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: groupPath })) : getCategoryRootFunctions(category);
        const finalName = uniqueName(value || 'Function', (container || []).map((item) => item.name));
        container.push(getDefaultEntryForCategory(category.name, finalName));
        selection = { kind: 'function', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: container.length - 1, groupPath: groupPath };
        render();
        return;
      }
      if (message.operation === 'renamePack') { pack.name = value || pack.name; render(); return; }
      if (message.operation === 'renameEnvironment') { const environmentIndex = Number(payload.environmentIndex); const environment = getEnvironment(environmentIndex); if (!environment) return; const siblings = getEnvironments().filter((_, index) => index !== environmentIndex).map((item) => item.name); environment.name = uniqueName(value || 'Environment', siblings); render(); return; }
      if (message.operation === 'renameLibrary') { const environmentIndex = Number(payload.environmentIndex); const libraryIndex = Number(payload.libraryIndex); const library = getLibrary(environmentIndex, libraryIndex); const environment = getEnvironment(environmentIndex); if (!library || !environment) return; const siblings = (environment.libraries || []).filter((_, index) => index !== libraryIndex).map((item) => item.name); library.name = uniqueName(value || 'Library', siblings); render(); return; }
      if (message.operation === 'renameCategory') { const environmentIndex = Number(payload.environmentIndex); const libraryIndex = Number(payload.libraryIndex); const categoryIndex = Number(payload.categoryIndex); const library = getLibrary(environmentIndex, libraryIndex); const category = getCategory({ kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex }); if (!library || !category) return; const siblings = (library.categories || []).filter((_, index) => index !== categoryIndex).map((item) => item.name); category.name = uniqueName(value || 'Category', siblings); render(); return; }
      if (message.operation === 'renameGroup') { const environmentIndex = Number(payload.environmentIndex); const libraryIndex = Number(payload.libraryIndex); const categoryIndex = Number(payload.categoryIndex); const groupPath = Array.isArray(payload.groupPath) ? payload.groupPath : []; const group = getGroup({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: groupPath }); const siblings = getGroupContainer({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: groupPath }).filter((_, index) => index !== (groupPath[groupPath.length - 1] || 0)).map((item) => item.name); if (!group) return; group.name = uniqueName(value || 'Group', siblings); render(); return; }
      if (message.operation === 'renameFunction') { const environmentIndex = Number(payload.environmentIndex); const libraryIndex = Number(payload.libraryIndex); const categoryIndex = Number(payload.categoryIndex); const functionIndex = Number(payload.functionIndex); const groupPath = Array.isArray(payload.groupPath) ? payload.groupPath : []; const fn = getFunction({ kind: 'function', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: functionIndex, groupPath: groupPath }); if (!fn) return; const siblings = getFunctionContainer({ kind: 'function', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: functionIndex, groupPath: groupPath }).filter((_, index) => index !== functionIndex).map((item) => item.name); fn.name = uniqueName(value || 'Function', siblings); render(); return; }
    }
    if (message.type === 'pickResult') {
      const value = String(message.value || '').trim();
      const payload = message.payload || {};
      if (!value) return;
      if (message.operation === 'moveCheckedLibrariesToEnvironment') {
        const items = (Array.isArray(payload.items) ? payload.items : []).slice().sort((a, b) => Number(a.libraryIndex) - Number(b.libraryIndex));
        if (!items.length) return;
        const sourceEnvironmentIndex = Number(items[0].environmentIndex);
        const targetEnvironmentIndex = Number(value);
        const sourceEnvironment = getEnvironment(sourceEnvironmentIndex);
        const targetEnvironment = getEnvironment(targetEnvironmentIndex);
        if (!sourceEnvironment || !targetEnvironment || sourceEnvironmentIndex === targetEnvironmentIndex) return;
        sourceEnvironment.libraries = Array.isArray(sourceEnvironment.libraries) ? sourceEnvironment.libraries : [];
        targetEnvironment.libraries = Array.isArray(targetEnvironment.libraries) ? targetEnvironment.libraries : [];
        const preferredIndex = getCheckedSelectionPreferredIndex(items);
        const movedLibraries = items.map((item) => sourceEnvironment.libraries[Number(item.libraryIndex)]).filter(Boolean);
        items.slice().sort((a, b) => Number(b.libraryIndex) - Number(a.libraryIndex)).forEach((item) => {
          const index = Number(item.libraryIndex);
          if (index >= 0 && index < sourceEnvironment.libraries.length) sourceEnvironment.libraries.splice(index, 1);
        });
        const updatedItems = [];
        movedLibraries.forEach((library) => {
          library.name = uniqueName(library.name || 'Library', targetEnvironment.libraries.map((item) => item.name));
          syncLibraryMetadata(library, targetEnvironment.name || 'Environment');
          targetEnvironment.libraries.push(library);
          updatedItems.push({ kind: 'library', environmentIndex: targetEnvironmentIndex, libraryIndex: targetEnvironment.libraries.length - 1 });
        });
        applyCheckedMoveSelection(updatedItems, preferredIndex);
        render();
        return;
      }
      if (message.operation === 'moveLibraryToEnvironment') {
        const sourceEnvironmentIndex = Number(payload.environmentIndex);
        const sourceLibraryIndex = Number(payload.libraryIndex);
        const targetEnvironmentIndex = Number(value);
        const sourceEnvironment = getEnvironment(sourceEnvironmentIndex);
        const targetEnvironment = getEnvironment(targetEnvironmentIndex);
        if (!sourceEnvironment || !targetEnvironment || sourceEnvironmentIndex === targetEnvironmentIndex) return;
        const library = (sourceEnvironment.libraries || [])[sourceLibraryIndex];
        if (!library) return;
        sourceEnvironment.libraries.splice(sourceLibraryIndex, 1);
        library.name = uniqueName(library.name || 'Library', (targetEnvironment.libraries || []).map((item) => item.name));
        syncLibraryMetadata(library, targetEnvironment.name || 'Environment');
        targetEnvironment.libraries = Array.isArray(targetEnvironment.libraries) ? targetEnvironment.libraries : [];
        targetEnvironment.libraries.push(library);
        selection = { kind: 'library', environmentIndex: targetEnvironmentIndex, libraryIndex: targetEnvironment.libraries.length - 1 };
        render();
        return;
      }
      if (message.operation === 'moveCheckedCategoriesToLibrary') {
        const items = (Array.isArray(payload.items) ? payload.items : []).slice().sort((a, b) => Number(a.categoryIndex) - Number(b.categoryIndex));
        if (!items.length) return;
        const sourceEnvironmentIndex = Number(items[0].environmentIndex);
        const sourceLibraryIndex = Number(items[0].libraryIndex);
        const [targetEnvironmentIndexRaw, targetLibraryIndexRaw] = value.split(':');
        const targetEnvironmentIndex = Number(targetEnvironmentIndexRaw);
        const targetLibraryIndex = Number(targetLibraryIndexRaw);
        const sourceLibrary = getLibrary(sourceEnvironmentIndex, sourceLibraryIndex);
        const targetLibrary = getLibrary(targetEnvironmentIndex, targetLibraryIndex);
        const targetEnvironment = getEnvironment(targetEnvironmentIndex);
        if (!sourceLibrary || !targetLibrary || !targetEnvironment) return;
        sourceLibrary.categories = Array.isArray(sourceLibrary.categories) ? sourceLibrary.categories : [];
        targetLibrary.categories = Array.isArray(targetLibrary.categories) ? targetLibrary.categories : [];
        const preferredIndex = getCheckedSelectionPreferredIndex(items);
        const movedCategories = items.map((item) => sourceLibrary.categories[Number(item.categoryIndex)]).filter(Boolean);
        items.slice().sort((a, b) => Number(b.categoryIndex) - Number(a.categoryIndex)).forEach((item) => {
          const index = Number(item.categoryIndex);
          if (index >= 0 && index < sourceLibrary.categories.length) sourceLibrary.categories.splice(index, 1);
        });
        const updatedItems = [];
        movedCategories.forEach((category) => {
          category.name = uniqueName(category.name || 'Category', targetLibrary.categories.map((item) => item.name));
          syncCategoryMetadata(category, targetEnvironment.name || 'Environment', targetLibrary.name || 'Library');
          targetLibrary.categories.push(category);
          updatedItems.push({ kind: 'category', environmentIndex: targetEnvironmentIndex, libraryIndex: targetLibraryIndex, categoryIndex: targetLibrary.categories.length - 1 });
        });
        applyCheckedMoveSelection(updatedItems, preferredIndex);
        render();
        return;
      }
      if (message.operation === 'moveCategoryToLibrary') {
        const sourceEnvironmentIndex = Number(payload.environmentIndex);
        const sourceLibraryIndex = Number(payload.libraryIndex);
        const sourceCategoryIndex = Number(payload.categoryIndex);
        const [targetEnvironmentIndexRaw, targetLibraryIndexRaw] = value.split(':');
        const targetEnvironmentIndex = Number(targetEnvironmentIndexRaw);
        const targetLibraryIndex = Number(targetLibraryIndexRaw);
        const sourceLibrary = getLibrary(sourceEnvironmentIndex, sourceLibraryIndex);
        const targetLibrary = getLibrary(targetEnvironmentIndex, targetLibraryIndex);
        const targetEnvironment = getEnvironment(targetEnvironmentIndex);
        if (!sourceLibrary || !targetLibrary || !targetEnvironment) return;
        const category = (sourceLibrary.categories || [])[sourceCategoryIndex];
        if (!category) return;
        sourceLibrary.categories.splice(sourceCategoryIndex, 1);
        category.name = uniqueName(category.name || 'Category', (targetLibrary.categories || []).map((item) => item.name));
        syncCategoryMetadata(category, targetEnvironment.name || 'Environment', targetLibrary.name || 'Library');
        targetLibrary.categories = Array.isArray(targetLibrary.categories) ? targetLibrary.categories : [];
        targetLibrary.categories.push(category);
        selection = { kind: 'category', environmentIndex: targetEnvironmentIndex, libraryIndex: targetLibraryIndex, categoryIndex: targetLibrary.categories.length - 1 };
        render();
        return;
      }
      if (message.operation === 'moveCheckedFunctionsToCategory') {
        const items = (Array.isArray(payload.items) ? payload.items : []).slice().sort((a, b) => Number(a.functionIndex) - Number(b.functionIndex));
        if (!items.length) return;
        const sourceEnvironmentIndex = Number(items[0].environmentIndex);
        const sourceLibraryIndex = Number(items[0].libraryIndex);
        const sourceCategoryIndex = Number(items[0].categoryIndex);
        const sourceGroupPath = Array.isArray(items[0].groupPath) ? items[0].groupPath : [];
        const [targetEnvironmentIndexRaw, targetLibraryIndexRaw, targetCategoryIndexRaw] = value.split(':');
        const targetEnvironmentIndex = Number(targetEnvironmentIndexRaw);
        const targetLibraryIndex = Number(targetLibraryIndexRaw);
        const targetCategoryIndex = Number(targetCategoryIndexRaw);
        const sourceCategory = getCategory({ kind: 'category', environmentIndex: sourceEnvironmentIndex, libraryIndex: sourceLibraryIndex, categoryIndex: sourceCategoryIndex });
        const targetCategory = getCategory({ kind: 'category', environmentIndex: targetEnvironmentIndex, libraryIndex: targetLibraryIndex, categoryIndex: targetCategoryIndex });
        const targetEnvironment = getEnvironment(targetEnvironmentIndex);
        const targetLibrary = getLibrary(targetEnvironmentIndex, targetLibraryIndex);
        if (!sourceCategory || !targetCategory || !targetEnvironment || !targetLibrary) return;
        const sourceFnContainer = sourceGroupPath.length ? getGroupFunctions(getGroup({ kind: 'group', environmentIndex: sourceEnvironmentIndex, libraryIndex: sourceLibraryIndex, categoryIndex: sourceCategoryIndex, groupPath: sourceGroupPath })) : getCategoryRootFunctions(sourceCategory);
        const preferredIndex = getCheckedSelectionPreferredIndex(items);
        const movedFunctions = items.map((item) => sourceFnContainer[Number(item.functionIndex)]).filter(Boolean);
        items.slice().sort((a, b) => Number(b.functionIndex) - Number(a.functionIndex)).forEach((item) => {
          const index = Number(item.functionIndex);
          if (index >= 0 && index < sourceFnContainer.length) sourceFnContainer.splice(index, 1);
        });
        targetCategory.functions = Array.isArray(targetCategory.functions) ? targetCategory.functions : [];
        const updatedItems = [];
        movedFunctions.forEach((fn) => {
          fn.name = uniqueName(fn.name || 'Symbol', getCategoryRootFunctions(targetCategory).map((item) => item.name));
          fn.environment = targetEnvironment.name || 'Environment';
          fn.library = targetLibrary.name || 'Library';
          fn.category = targetCategory.name || 'Category';
          targetCategory.functions.push(fn);
          updatedItems.push({ kind: 'function', environmentIndex: targetEnvironmentIndex, libraryIndex: targetLibraryIndex, categoryIndex: targetCategoryIndex, functionIndex: targetCategory.functions.length - 1, groupPath: [] });
        });
        applyCheckedMoveSelection(updatedItems, preferredIndex);
        render();
        return;
      }
      if (message.operation === 'moveFunctionToCategory') {
        const sourceEnvironmentIndex = Number(payload.environmentIndex);
        const sourceLibraryIndex = Number(payload.libraryIndex);
        const sourceCategoryIndex = Number(payload.categoryIndex);
        const sourceFunctionIndex = Number(payload.functionIndex);
        const [targetEnvironmentIndexRaw, targetLibraryIndexRaw, targetCategoryIndexRaw] = value.split(':');
        const targetEnvironmentIndex = Number(targetEnvironmentIndexRaw);
        const targetLibraryIndex = Number(targetLibraryIndexRaw);
        const targetCategoryIndex = Number(targetCategoryIndexRaw);
        const sourceCategory = getCategory({ kind: 'category', environmentIndex: sourceEnvironmentIndex, libraryIndex: sourceLibraryIndex, categoryIndex: sourceCategoryIndex });
        const targetCategory = getCategory({ kind: 'category', environmentIndex: targetEnvironmentIndex, libraryIndex: targetLibraryIndex, categoryIndex: targetCategoryIndex });
        const targetEnvironment = getEnvironment(targetEnvironmentIndex);
        const targetLibrary = getLibrary(targetEnvironmentIndex, targetLibraryIndex);
        if (!sourceCategory || !targetCategory || !targetEnvironment || !targetLibrary) return;
        const sourceGroupPath = Array.isArray(payload.groupPath) ? payload.groupPath : [];
        const sourceFnContainer = sourceGroupPath.length ? getGroupFunctions(getGroup({ kind: 'group', environmentIndex: sourceEnvironmentIndex, libraryIndex: sourceLibraryIndex, categoryIndex: sourceCategoryIndex, groupPath: sourceGroupPath })) : getCategoryRootFunctions(sourceCategory);
        const fn = (sourceFnContainer || [])[sourceFunctionIndex];
        if (!fn) return;
        sourceFnContainer.splice(sourceFunctionIndex, 1);
        fn.name = uniqueName(fn.name || 'Symbol', getCategoryRootFunctions(targetCategory).map((item) => item.name));
        fn.environment = targetEnvironment.name || 'Environment';
        fn.library = targetLibrary.name || 'Library';
        fn.category = targetCategory.name || 'Category';
        targetCategory.functions = Array.isArray(targetCategory.functions) ? targetCategory.functions : [];
        targetCategory.functions.push(fn);
        selection = { kind: 'function', environmentIndex: targetEnvironmentIndex, libraryIndex: targetLibraryIndex, categoryIndex: targetCategoryIndex, functionIndex: targetCategory.functions.length - 1, groupPath: [] };
        render();
        return;
      }
      if (message.operation === 'moveCheckedGroupsToParent') { const items = (Array.isArray(payload.items) ? payload.items : []).slice().sort((a, b) => getCheckedNodeIndex(a) - getCheckedNodeIndex(b)); if (!items.length) return; const environmentIndex = Number(items[0].environmentIndex); const libraryIndex = Number(items[0].libraryIndex); const categoryIndex = Number(items[0].categoryIndex); const sourceParentPath = Array.isArray(items[0].groupPath) ? items[0].groupPath.slice(0, -1) : []; const targetPath = value === 'root' ? [] : value.split('.').filter(Boolean).map((item) => Number(item)); if (samePath(sourceParentPath, targetPath)) return; const sourceContainer = sourceParentPath.length ? getGroupChildren(getGroup({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: sourceParentPath })) : getCategoryGroups(getCategory({ kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex })); const preferredIndex = getCheckedSelectionPreferredIndex(items); const movedGroups = items.map((item) => sourceContainer[getCheckedNodeIndex(item)]).filter(Boolean); items.slice().sort((a, b) => getCheckedNodeIndex(b) - getCheckedNodeIndex(a)).forEach((item) => { const index = getCheckedNodeIndex(item); if (index >= 0 && index < sourceContainer.length) sourceContainer.splice(index, 1); }); const category = getCategory({ kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex }); const targetContainer = targetPath.length ? getGroupChildren(getGroup({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: targetPath })) : getCategoryGroups(category); const updatedItems = []; movedGroups.forEach((group) => { group.name = uniqueName(group.name || 'Group', targetContainer.map((item) => item.name)); targetContainer.push(group); updatedItems.push({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: targetPath.concat(targetContainer.length - 1) }); }); applyCheckedMoveSelection(updatedItems, preferredIndex); render(); return; }
      if (message.operation === 'moveGroupToParent') { const environmentIndex = Number(payload.environmentIndex); const libraryIndex = Number(payload.libraryIndex); const categoryIndex = Number(payload.categoryIndex); const sourcePath = Array.isArray(payload.groupPath) ? payload.groupPath : []; const sourceContainer = getGroupContainer({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: sourcePath }); const sourceIndex = sourcePath[sourcePath.length - 1]; const group = sourceContainer[sourceIndex]; if (!group) return; sourceContainer.splice(sourceIndex, 1); const category = getCategory({ kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex }); const targetPath = value === 'root' ? [] : value.split('.').filter(Boolean).map((item) => Number(item)); if (samePath(sourcePath.slice(0, -1), targetPath)) return; const targetContainer = targetPath.length ? getGroupChildren(getGroup({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: targetPath })) : getCategoryGroups(category); group.name = uniqueName(group.name || 'Group', targetContainer.map((item) => item.name)); targetContainer.push(group); selection = { kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: targetPath.concat(targetContainer.length - 1) }; render(); return; }
      if (message.operation === 'moveCheckedFunctionsToGroup') { const items = (Array.isArray(payload.items) ? payload.items : []).slice().sort((a, b) => Number(a.functionIndex) - Number(b.functionIndex)); if (!items.length) return; const environmentIndex = Number(items[0].environmentIndex); const libraryIndex = Number(items[0].libraryIndex); const categoryIndex = Number(items[0].categoryIndex); const sourcePath = Array.isArray(items[0].groupPath) ? items[0].groupPath : []; const targetPath = value === 'root' ? [] : value.split('.').filter(Boolean).map((item) => Number(item)); if (samePath(sourcePath, targetPath)) return; const sourceContainer = getFunctionContainer({ kind: 'function', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: Number(items[0].functionIndex), groupPath: sourcePath }); const preferredIndex = getCheckedSelectionPreferredIndex(items); const movedFunctions = items.map((item) => sourceContainer[Number(item.functionIndex)]).filter(Boolean); items.slice().sort((a, b) => Number(b.functionIndex) - Number(a.functionIndex)).forEach((item) => { const index = Number(item.functionIndex); if (index >= 0 && index < sourceContainer.length) sourceContainer.splice(index, 1); }); const category = getCategory({ kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex }); const targetContainer = targetPath.length ? getGroupFunctions(getGroup({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: targetPath })) : getCategoryRootFunctions(category); const updatedItems = []; movedFunctions.forEach((fn) => { fn.name = uniqueName(fn.name || 'Symbol', targetContainer.map((item) => item.name)); targetContainer.push(fn); updatedItems.push({ kind: 'function', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: targetContainer.length - 1, groupPath: targetPath }); }); applyCheckedMoveSelection(updatedItems, preferredIndex); render(); return; }
      if (message.operation === 'moveFunctionToGroup') { const environmentIndex = Number(payload.environmentIndex); const libraryIndex = Number(payload.libraryIndex); const categoryIndex = Number(payload.categoryIndex); const functionIndex = Number(payload.functionIndex); const sourcePath = Array.isArray(payload.groupPath) ? payload.groupPath : []; const sourceContainer = getFunctionContainer({ kind: 'function', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: functionIndex, groupPath: sourcePath }); const fn = sourceContainer[functionIndex]; if (!fn) return; sourceContainer.splice(functionIndex, 1); const category = getCategory({ kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex }); const targetPath = value === 'root' ? [] : value.split('.').filter(Boolean).map((item) => Number(item)); if (samePath(sourcePath, targetPath)) return; const targetContainer = targetPath.length ? getGroupFunctions(getGroup({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: targetPath })) : getCategoryRootFunctions(category); fn.name = uniqueName(fn.name || 'Symbol', targetContainer.map((item) => item.name)); targetContainer.push(fn); selection = { kind: 'function', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: targetContainer.length - 1, groupPath: targetPath }; render(); return; }
    }
    if (message.type === 'confirmResult' && message.confirmed) {
      const payload = message.payload || {};
      if (message.operation === 'deleteCheckedEnvironments') {
        const items = (Array.isArray(payload.items) ? payload.items : []).slice().sort((a, b) => Number(b.environmentIndex) - Number(a.environmentIndex));
        items.forEach((item) => {
          const environmentIndex = Number(item.environmentIndex);
          if (!Number.isNaN(environmentIndex) && Array.isArray(pack.environments) && environmentIndex >= 0 && environmentIndex < pack.environments.length) pack.environments.splice(environmentIndex, 1);
        });
        clearCheckedNodes();
        selection = { kind: 'pack' };
        render();
        return;
      }
      if (message.operation === 'deleteCheckedLibraries') {
        const items = (Array.isArray(payload.items) ? payload.items : []).slice().sort((a, b) => Number(b.libraryIndex) - Number(a.libraryIndex));
        const environmentIndex = items.length ? Number(items[0].environmentIndex) : -1;
        const environment = getEnvironment(environmentIndex);
        if (environment) items.forEach((item) => { const libraryIndex = Number(item.libraryIndex); if (!Number.isNaN(libraryIndex) && libraryIndex >= 0 && libraryIndex < environment.libraries.length) environment.libraries.splice(libraryIndex, 1); });
        clearCheckedNodes();
        selection = { kind: 'environment', environmentIndex: environmentIndex };
        render();
        return;
      }
      if (message.operation === 'deleteCheckedCategories') {
        const items = (Array.isArray(payload.items) ? payload.items : []).slice().sort((a, b) => Number(b.categoryIndex) - Number(a.categoryIndex));
        const environmentIndex = items.length ? Number(items[0].environmentIndex) : -1;
        const libraryIndex = items.length ? Number(items[0].libraryIndex) : -1;
        const library = getLibrary(environmentIndex, libraryIndex);
        if (library) items.forEach((item) => { const categoryIndex = Number(item.categoryIndex); if (!Number.isNaN(categoryIndex) && categoryIndex >= 0 && categoryIndex < library.categories.length) library.categories.splice(categoryIndex, 1); });
        clearCheckedNodes();
        selection = { kind: 'library', environmentIndex: environmentIndex, libraryIndex: libraryIndex };
        render();
        return;
      }
      if (message.operation === 'deleteCheckedGroups') {
        const items = (Array.isArray(payload.items) ? payload.items : []).slice().sort((a, b) => getCheckedNodeIndex(b) - getCheckedNodeIndex(a));
        const environmentIndex = items.length ? Number(items[0].environmentIndex) : -1;
        const libraryIndex = items.length ? Number(items[0].libraryIndex) : -1;
        const categoryIndex = items.length ? Number(items[0].categoryIndex) : -1;
        const container = items.length ? getGroupContainer(items[0]) : null;
        if (Array.isArray(container)) items.forEach((item) => { const groupIndex = getCheckedNodeIndex(item); if (!Number.isNaN(groupIndex) && groupIndex >= 0 && groupIndex < container.length) container.splice(groupIndex, 1); });
        clearCheckedNodes();
        selection = { kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex };
        render();
        return;
      }
      if (message.operation === 'deleteCheckedFunctions') {
        const items = (Array.isArray(payload.items) ? payload.items : []).slice().sort((a, b) => Number(b.functionIndex) - Number(a.functionIndex));
        const environmentIndex = items.length ? Number(items[0].environmentIndex) : -1;
        const libraryIndex = items.length ? Number(items[0].libraryIndex) : -1;
        const categoryIndex = items.length ? Number(items[0].categoryIndex) : -1;
        const groupPath = items.length && Array.isArray(items[0].groupPath) ? items[0].groupPath : [];
        const container = items.length ? getFunctionContainer(items[0]) : null;
        if (Array.isArray(container)) items.forEach((item) => { const functionIndex = Number(item.functionIndex); if (!Number.isNaN(functionIndex) && functionIndex >= 0 && functionIndex < container.length) container.splice(functionIndex, 1); });
        clearCheckedNodes();
        selection = groupPath.length ? { kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: groupPath } : { kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex };
        render();
        return;
      }
      if (message.operation === 'deleteEnvironment') {
        const environmentIndex = Number(payload.environmentIndex);
        if (!Number.isNaN(environmentIndex) && Array.isArray(pack.environments)) { clearCheckedNodes(); pack.environments.splice(environmentIndex, 1); selection = { kind: 'pack' }; render(); }
        return;
      }
      if (message.operation === 'deleteLibrary') {
        const environmentIndex = Number(payload.environmentIndex);
        const libraryIndex = Number(payload.libraryIndex);
        const environment = getEnvironment(environmentIndex);
        if (environment && !Number.isNaN(libraryIndex)) { clearCheckedNodes(); environment.libraries.splice(libraryIndex, 1); selection = { kind: 'environment', environmentIndex: environmentIndex }; render(); }
        return;
      }
      if (message.operation === 'deleteCategory') {
        const environmentIndex = Number(payload.environmentIndex);
        const libraryIndex = Number(payload.libraryIndex);
        const lib = getLibrary(environmentIndex, libraryIndex);
        const categoryIndex = Number(payload.categoryIndex);
        if (lib && !Number.isNaN(categoryIndex)) { clearCheckedNodes(); lib.categories.splice(categoryIndex, 1); selection = { kind: 'library', environmentIndex: environmentIndex, libraryIndex: libraryIndex }; render(); }
        return;
      }
      if (message.operation === 'deleteGroup') {
        const environmentIndex = Number(payload.environmentIndex);
        const libraryIndex = Number(payload.libraryIndex);
        const categoryIndex = Number(payload.categoryIndex);
        const groupPath = Array.isArray(payload.groupPath) ? payload.groupPath : [];
        const container = getGroupContainer({ kind: 'group', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, groupPath: groupPath });
        const groupIndex = groupPath[groupPath.length - 1];
        if (container && !Number.isNaN(groupIndex)) { clearCheckedNodes(); container.splice(groupIndex, 1); selection = { kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex }; render(); }
        return;
      }
      if (message.operation === 'deleteFunction') {
        const environmentIndex = Number(payload.environmentIndex);
        const libraryIndex = Number(payload.libraryIndex);
        const categoryIndex = Number(payload.categoryIndex);
        const functionIndex = Number(payload.functionIndex);
        const groupPath = Array.isArray(payload.groupPath) ? payload.groupPath : [];
        const container = getFunctionContainer({ kind: 'function', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex, functionIndex: functionIndex, groupPath: groupPath });
        if (container && !Number.isNaN(functionIndex)) { clearCheckedNodes(); container.splice(functionIndex, 1); selection = { kind: 'category', environmentIndex: environmentIndex, libraryIndex: libraryIndex, categoryIndex: categoryIndex }; render(); }
      }
    }
  });

  render();
})();
</script>
</body>
</html>`;
}

export function activate(context: vscode.ExtensionContext): void {
  ensureCustomTreeIcons(context);
  const retiredCleanup = purgeRetiredGlobalPackStorage(context);
  let currentData = loadExtensionData(context);
  if (retiredCleanup.deletedFiles > 0 || retiredCleanup.updatedFiles > 0) {
    setTimeout(() => {
      void vscode.window.showInformationMessage(
        `CPM cleaned retired global pack content (${retiredCleanup.deletedFiles} file(s) removed, ${retiredCleanup.updatedFiles} file(s) updated).`
      );
    }, 0);
  }

  const treeProvider = new CpmTreeProvider(currentData.db);
  const treeView = vscode.window.createTreeView('cpm.libraryExplorer', { treeDataProvider: treeProvider, showCollapseAll: true });

  context.subscriptions.push(treeView.onDidChangeSelection(async (event) => {
    const selected = event.selection[0];
    if (!selected?.functionData) {
      return;
    }
    await showFunctionDetailsPanel(selected.functionData, { preserveFocus: true });
  }));
  let searchEntries = flattenFunctions(currentData.db);

  let detailsPanel: vscode.WebviewPanel | undefined;
  let currentPanelFunction: CpmFunction | undefined;
  let currentDetailsStateKey: string | undefined;
  let pendingDetailsRender = false;
  let choicePickerPanel: vscode.WebviewPanel | undefined;
  let currentChoicePickerRequest: { targetIndex: number; defaultTargetIndex: number; values: string[]; applyDefaultIfEmpty: boolean; multiSelect?: boolean; valueSeparator?: string; emptyValue?: string } | undefined;
  const packEditorPanels = new Map<string, vscode.WebviewPanel>();

  const refreshSearchData = (): void => {
    searchEntries = flattenFunctions(treeProvider.getDatabase());
  };

  const resolveDetailsFunction = (fn: CpmFunction | undefined): CpmFunction | undefined => {
    if (!fn) {
      return undefined;
    }

    const environmentName = fn.environment ?? DEFAULT_ENVIRONMENT_NAME;
    return searchEntries.find((entry) =>
      entry.fn.name === fn.name &&
      (entry.fn.environment ?? DEFAULT_ENVIRONMENT_NAME) === environmentName &&
      entry.library === fn.library &&
      entry.category === fn.category
    )?.fn ?? fn;
  };

  const buildDetailsLoadingHtml = (fn: CpmFunction | undefined): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 20px; }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 16px; max-width: 820px; }
    .muted { opacity: 0.8; }
  </style>
</head>
<body>
  <div class="card">
    <h1 style="margin-top:0;">${escapeHtml(fn?.name ?? 'Symbol')}</h1>
    <div class="muted">Loading symbol details…</div>
  </div>
</body>
</html>`;

  const buildDetailsErrorHtml = (fn: CpmFunction | undefined, error: unknown): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 20px; }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 16px; max-width: 980px; }
    pre { white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <div class="card">
    <h1 style="margin-top:0;">${escapeHtml(fn?.name ?? 'Symbol')}</h1>
    <p>Unable to render the details view.</p>
    <pre>${escapeHtml(error instanceof Error ? (error.stack || error.message) : String(error || 'Unknown error'))}</pre>
  </div>
</body>
</html>`;

  const renderCurrentDetailsPanel = (): void => {
    if (!detailsPanel || !currentPanelFunction) {
      pendingDetailsRender = false;
      return;
    }

    const resolvedFunction = resolveDetailsFunction(currentPanelFunction);
    currentPanelFunction = resolvedFunction;
    currentDetailsStateKey = resolvedFunction ? getStateKey(resolvedFunction) : undefined;
    const storedState = currentDetailsStateKey
      ? context.workspaceState.get<StoredFunctionState>(currentDetailsStateKey)
      : undefined;

    detailsPanel.title = `C/C++ Libraries: ${resolvedFunction?.name ?? 'Symbol'}`;

    try {
      detailsPanel.webview.html = hardenHtml(buildDetailsHtml(resolvedFunction!, storedState), detailsPanel.webview, { harmonize: true });
    } catch (error) {
      console.error('C/C++ Libraries: failed to render details panel', error);
      detailsPanel.webview.html = hardenHtml(buildDetailsErrorHtml(resolvedFunction, error), detailsPanel.webview, { harmonize: true });
    }

    pendingDetailsRender = false;
  };

  const scheduleDetailsRender = (): void => {
    if (!detailsPanel || !currentPanelFunction || pendingDetailsRender) {
      return;
    }

    pendingDetailsRender = true;
    setTimeout(() => {
      renderCurrentDetailsPanel();
      if (detailsPanel && currentPanelFunction) {
        setTimeout(() => {
          if (detailsPanel && currentPanelFunction) {
            renderCurrentDetailsPanel();
          }
        }, 25);
      }
    }, 0);
  };

  const getPreferredDetailsColumn = (): vscode.ViewColumn => {
    // When the user is editing a file, open JC Lib details beside that editor
    // instead of replacing it. If there is no active editor, keep the panel in
    // the active/full-width column.
    if (vscode.window.activeTextEditor) {
      return vscode.ViewColumn.Beside;
    }
    const activeColumn = vscode.window.tabGroups.activeTabGroup?.viewColumn;
    if (typeof activeColumn === 'number' && activeColumn >= 1) {
      return activeColumn as vscode.ViewColumn;
    }
    return vscode.ViewColumn.One;
  };

  const openStructuredChoicePicker = (fn: CpmFunction, pickerConfig: StructuredPickerConfig, currentValues: string[]): void => {
    const normalizedConfig = normalizeStructuredPickerConfig(pickerConfig, pickerConfig?.title || `Select value for ${fn.name}`);
    const targetIndex = typeof normalizedConfig?.targetIndex === 'number' ? normalizedConfig.targetIndex : -1;
    if (!normalizedConfig || targetIndex < 0) {
      void vscode.window.showWarningMessage(`No target parameter could be identified for ${fn.name}.`);
      return;
    }

    const defaultTargetIndex = typeof normalizedConfig?.defaultTargetIndex === 'number' ? normalizedConfig.defaultTargetIndex : -1;
    currentChoicePickerRequest = {
      targetIndex,
      defaultTargetIndex,
      values: Array.isArray(currentValues) ? [...currentValues] : [],
      applyDefaultIfEmpty: normalizedConfig?.applyDefaultIfEmpty !== false,
      multiSelect: normalizedConfig?.multiSelect === true,
      valueSeparator: typeof normalizedConfig?.valueSeparator === 'string' && normalizedConfig.valueSeparator.length > 0 ? normalizedConfig.valueSeparator : ' | ',
      emptyValue: typeof normalizedConfig?.emptyValue === 'string' ? normalizedConfig.emptyValue : ''
    };

    if (!choicePickerPanel) {
      choicePickerPanel = vscode.window.createWebviewPanel(
        'jcLibStructuredPicker',
        normalizedConfig.title || `Selection: ${fn.name}`,
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );

      choicePickerPanel.onDidDispose(() => {
        choicePickerPanel = undefined;
        currentChoicePickerRequest = undefined;
      });

      choicePickerPanel.webview.onDidReceiveMessage(async (message: any) => {
        if (!message || !detailsPanel || !currentChoicePickerRequest) {
          return;
        }
        if (message.type === 'cancel') {
          choicePickerPanel?.dispose();
          return;
        }
        if (message.type !== 'applySelection' || !message.item) {
          return;
        }

        const item = message.item;
        await detailsPanel.webview.postMessage({
          type: 'setFieldValue',
          index: currentChoicePickerRequest.targetIndex,
          value: typeof message.value === 'string'
            ? message.value
            : String(item.value || item.constant || item.label || '')
        });

        const currentValueText = currentChoicePickerRequest.defaultTargetIndex >= 0
          ? String(currentChoicePickerRequest.values?.[currentChoicePickerRequest.defaultTargetIndex] || '').trim()
          : '';
        if (currentChoicePickerRequest.defaultTargetIndex >= 0 && currentChoicePickerRequest.applyDefaultIfEmpty && !currentValueText && item.defaultValue) {
          await detailsPanel.webview.postMessage({
            type: 'setFieldValue',
            index: currentChoicePickerRequest.defaultTargetIndex,
            value: String(item.defaultValue || '')
          });
        }

        choicePickerPanel?.dispose();
      });
    }

    choicePickerPanel.title = normalizedConfig.title || `Selection: ${fn.name}`;
    choicePickerPanel.webview.html = hardenHtml(buildCpmAttributeHelperHtml(fn, normalizedConfig, currentValues), choicePickerPanel.webview, { harmonize: true });
    choicePickerPanel.reveal(choicePickerPanel.viewColumn ?? vscode.ViewColumn.Active, true);
  };


  const reloadAllData = async (): Promise<void> => {
    currentData = loadExtensionData(context);
    treeProvider.setDatabase(currentData.db);
    refreshSearchData();
    updateViewMessage(treeView, treeProvider);

    if (detailsPanel && currentPanelFunction) {
      const refreshedFunction = resolveDetailsFunction(currentPanelFunction);
      if (refreshedFunction) {
        currentPanelFunction = refreshedFunction;
        currentDetailsStateKey = getStateKey(refreshedFunction);
        scheduleDetailsRender();
      }
    }
  };

  const showFunctionDetailsPanel = async (fn: CpmFunction, options?: { preserveFocus?: boolean }): Promise<void> => {
    const resolvedFunction = resolveDetailsFunction(fn) ?? fn;

    currentPanelFunction = resolvedFunction;
    currentDetailsStateKey = getStateKey(resolvedFunction);

    if (!detailsPanel) {
      const initialColumn = getPreferredDetailsColumn();
      detailsPanel = vscode.window.createWebviewPanel(
        'cpmFunctionDetails',
        `C/C++ Libraries: ${resolvedFunction.name}`,
        initialColumn,
        { enableScripts: true, retainContextWhenHidden: true }
      );

      detailsPanel.onDidDispose(() => {
        detailsPanel = undefined;
        currentPanelFunction = undefined;
        currentDetailsStateKey = undefined;
        pendingDetailsRender = false;
      });

      detailsPanel.onDidChangeViewState(() => {
        if (detailsPanel?.visible && currentPanelFunction) {
          renderCurrentDetailsPanel();
          setTimeout(() => {
            if (detailsPanel?.visible && currentPanelFunction) {
              renderCurrentDetailsPanel();
            }
          }, 25);
        }
      });

      detailsPanel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
        const activeFn = currentPanelFunction;
        if (!activeFn) {
          return;
        }

        const activeStateKey = getStateKey(activeFn);

        if (message?.type === 'persistState' && message.state) {
          await context.workspaceState.update(activeStateKey, message.state);
          return;
        }

        if (message?.type === 'insertCall') {
          if (message.text) {
            await insertFunctionCallText(message.text);
          } else {
            await insertFunctionCall(activeFn);
          }
          return;
        }

        if (message?.type === 'copyCall') {
          const text = message.text ?? buildCallText(activeFn);
          await vscode.env.clipboard.writeText(text);
          void vscode.window.showInformationMessage(`Copied ${activeFn.name} call to clipboard.`);
          return;
        }

        if (message?.type === 'pickValue' && typeof message.index === 'number') {
          const resolved = (activeFn.parameters ?? []).map(resolveParameter);
          const param = resolved[message.index];
          if (!param) {
            return;
          }
          const pickerConfig = getStructuredPickerConfigForParameter(activeFn, param, Array.isArray(message.values) ? message.values : []);
          if (pickerConfig) {
            openStructuredChoicePicker(activeFn, pickerConfig, Array.isArray(message.values) ? message.values : []);
            return;
          }
          const selected = await pickValueForParameter(param, message.currentValue ?? '');
          if (selected !== undefined && detailsPanel) {
            await detailsPanel.webview.postMessage({ type: 'setFieldValue', index: message.index, value: selected });
          }
        }
      });
    }

    const revealColumn = detailsPanel.viewColumn ?? getPreferredDetailsColumn();
    detailsPanel.title = `C/C++ Libraries: ${resolvedFunction.name}`;
    detailsPanel.webview.html = hardenHtml(buildDetailsLoadingHtml(resolvedFunction), detailsPanel.webview, { harmonize: true });
    detailsPanel.reveal(revealColumn, options?.preserveFocus ?? false);
    renderCurrentDetailsPanel();
    setTimeout(() => {
      if (detailsPanel && currentPanelFunction?.name === resolvedFunction.name) {
        renderCurrentDetailsPanel();
      }
    }, 25);
  };


  const showPackEditor = async (pack: LoadedPack): Promise<void> => {
    let currentPackMeta = pack;
    const existing = packEditorPanels.get(pack.filePath);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Active);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'cpmPackEditor',
      `Pack: ${pack.name}`,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    packEditorPanels.set(pack.filePath, panel);

    const renderPackEditor = (): void => {
      const packFile = readPackFile(currentPackMeta.filePath);
      panel.title = `Pack: ${packFile.name}`;
      panel.webview.html = hardenHtml(buildPackEditorHtml(packFile, currentPackMeta), panel.webview, { harmonize: true });
    };

    panel.onDidDispose(() => {
      packEditorPanels.delete(pack.filePath);
    });

    panel.webview.onDidReceiveMessage(async (message: PackEditorMessage) => {
      if (message?.type === 'openJson') {
        await openPackFileInEditor(currentPackMeta.filePath);
        return;
      }

      if (message?.type === 'showInput') {
        const value = await vscode.window.showInputBox({ title: message.title, prompt: message.prompt, value: message.value ?? '', placeHolder: message.placeHolder });
        await panel.webview.postMessage({ type: 'inputResult', operation: message.operation, value, payload: message.payload });
        return;
      }

      if (message?.type === 'showConfirm') {
        const picked = await vscode.window.showWarningMessage(message.message ?? 'Confirm action', { modal: true, detail: message.title }, message.confirmLabel ?? 'Confirm');
        await panel.webview.postMessage({ type: 'confirmResult', operation: message.operation, confirmed: picked === (message.confirmLabel ?? 'Confirm'), payload: message.payload });
        return;
      }

      if (message?.type === 'showPick') {
        const items = Array.isArray(message.items) ? message.items : [];
        const picked = await vscode.window.showQuickPick(items, {
          title: message.title,
          placeHolder: message.placeHolder,
          ignoreFocusOut: true
        });
        await panel.webview.postMessage({ type: 'pickResult', operation: message.operation, value: picked?.value, payload: message.payload });
        return;
      }

      if (message?.type === 'runPackTool') {
        try {
          const packFile = readPackFile(currentPackMeta.filePath);
          const payload = message.payload || {};
          const environment = packFile.environments?.[Number(payload.environmentIndex)];
          const library = environment?.libraries?.[Number(payload.libraryIndex)];
          const category = library?.categories?.[Number(payload.categoryIndex)];

          if (message.operation === 'addLanguagePackPack') {
            const result = await importLanguageStarterIntoPackFile(currentPackMeta);
            if (result) {
              await reloadAllData();
              const refreshed = currentData.packs.find((candidate) => candidate.filePath === currentPackMeta.filePath);
              if (refreshed) currentPackMeta = refreshed;
              renderPackEditor();
              void vscode.window.showInformationMessage(`Added ${result.added} item(s) from ${result.label} to ${result.libraryName}.`);
            }
            return;
          }
          if (message.operation === 'importSnippetPack') {
            const result = await importSnippetFileIntoPackFile(currentPackMeta);
            if (result) {
              await reloadAllData();
              const refreshed = currentData.packs.find((candidate) => candidate.filePath === currentPackMeta.filePath);
              if (refreshed) currentPackMeta = refreshed;
              renderPackEditor();
              void vscode.window.showInformationMessage(`Imported snippet into ${result.libraryName} / ${result.categoryName}. Source: ${result.filePath}`);
            }
            return;
          }
          if (message.operation === 'addLanguagePackLibrary') {
            if (library && environment) {
              const result = await importLanguageStarterIntoPackFile(currentPackMeta, { environmentName: environment.name, libraryName: library.name });
              if (result) {
                await reloadAllData();
                const refreshed = currentData.packs.find((candidate) => candidate.filePath === currentPackMeta.filePath);
                if (refreshed) currentPackMeta = refreshed;
                renderPackEditor();
                void vscode.window.showInformationMessage(`Added ${result.added} item(s) from ${result.label} to ${result.libraryName}.`);
              }
            }
            return;
          }
          if (message.operation === 'importSnippetLibrary') {
            if (library && environment) {
              const result = await importSnippetFileIntoPackFile(currentPackMeta, { environmentName: environment.name, libraryName: library.name });
              if (result) {
                await reloadAllData();
                const refreshed = currentData.packs.find((candidate) => candidate.filePath === currentPackMeta.filePath);
                if (refreshed) currentPackMeta = refreshed;
                renderPackEditor();
                void vscode.window.showInformationMessage(`Imported snippet into ${result.libraryName} / ${result.categoryName}. Source: ${result.filePath}`);
              }
            }
            return;
          }
          if (message.operation === 'addLanguagePackCategory') {
            if (library && category && environment) {
              const result = await importLanguageStarterIntoPackFile(currentPackMeta, { environmentName: environment.name, libraryName: library.name, categoryName: category.name });
              if (result) {
                await reloadAllData();
                const refreshed = currentData.packs.find((candidate) => candidate.filePath === currentPackMeta.filePath);
                if (refreshed) currentPackMeta = refreshed;
                renderPackEditor();
                void vscode.window.showInformationMessage(`Added ${result.added} item(s) from ${result.label} to ${result.libraryName} / ${category.name}.`);
              }
            }
            return;
          }
          if (message.operation === 'importSnippetCategory') {
            if (library && category && environment) {
              const result = await importSnippetFileIntoPackFile(currentPackMeta, { environmentName: environment.name, libraryName: library.name, categoryName: category.name });
              if (result) {
                await reloadAllData();
                const refreshed = currentData.packs.find((candidate) => candidate.filePath === currentPackMeta.filePath);
                if (refreshed) currentPackMeta = refreshed;
                renderPackEditor();
                void vscode.window.showInformationMessage(`Imported snippet into ${result.libraryName} / ${result.categoryName}. Source: ${result.filePath}`);
              }
            }
            return;
          }
          if (message.operation === 'importSymbolsLibrary') {
            if (library && environment) {
              const result = await importSymbolsToPackFile(currentPackMeta, { environmentName: environment.name, libraryName: library.name });
              if (result) {
                await reloadAllData();
                const refreshed = currentData.packs.find((candidate) => candidate.filePath === currentPackMeta.filePath);
                if (refreshed) {
                  currentPackMeta = refreshed;
                }
                renderPackEditor();
                const info = result.skipped > 0 ? `Imported ${result.imported} symbol(s) and skipped ${result.skipped} duplicate(s).` : `Imported ${result.imported} symbol(s).`;
                void vscode.window.showInformationMessage(`${info} Source: ${result.filePath}`);
              }
            }
            return;
          }
          if (message.operation === 'importSymbolsCategory') {
            if (library && category && environment) {
              const result = await importSymbolsToPackFile(currentPackMeta, { environmentName: environment.name, libraryName: library.name, categoryName: category.name });
              if (result) {
                await reloadAllData();
                const refreshed = currentData.packs.find((candidate) => candidate.filePath === currentPackMeta.filePath);
                if (refreshed) {
                  currentPackMeta = refreshed;
                }
                renderPackEditor();
                const info = result.skipped > 0 ? `Imported ${result.imported} symbol(s) and skipped ${result.skipped} duplicate(s).` : `Imported ${result.imported} symbol(s).`;
                void vscode.window.showInformationMessage(`${info} Source: ${result.filePath}`);
              }
            }
            return;
          }
          if (message.operation === 'generateHeaderLibrary') {
            if (library && environment) {
              const generatedPath = await generateHeaderForPack(currentPackMeta, { environmentName: environment.name, libraryName: library.name });
              if (generatedPath) {
                const openChoice = await vscode.window.showInformationMessage(`Generated header: ${generatedPath}`, 'Open header');
                if (openChoice === 'Open header') {
                  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(generatedPath));
                  await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active });
                }
              }
            }
            return;
          }
          if (message.operation === 'generateHeaderCategory') {
            if (library && category && environment) {
              const generatedPath = await generateHeaderForPack(currentPackMeta, { environmentName: environment.name, libraryName: library.name, categoryName: category.name });
              if (generatedPath) {
                const openChoice = await vscode.window.showInformationMessage(`Generated header: ${generatedPath}`, 'Open header');
                if (openChoice === 'Open header') {
                  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(generatedPath));
                  await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active });
                }
              }
            }
            return;
          }
          if (message.operation === 'addContentPack') {
            const result = await addContentIntoPackFile(currentPackMeta);
            if (result) {
              await reloadAllData();
              const refreshed = currentData.packs.find((candidate) => candidate.filePath === currentPackMeta.filePath);
              if (refreshed) {
                currentPackMeta = refreshed;
              }
              renderPackEditor();
              void vscode.window.showInformationMessage(result.message);
            }
            return;
          }
          if (message.operation === 'exportContentPack') {
            const result = await exportContentFromPackFile(currentPackMeta);
            if (result) {
              const openChoice = result.openPath
                ? await vscode.window.showInformationMessage(result.message, 'Open file')
                : await vscode.window.showInformationMessage(result.message);
              if (result.openPath && openChoice === 'Open file') {
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.openPath));
                await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active });
              }
            }
            return;
          }

          if (message.operation === 'addContentEnvironment') {
            if (environment) {
              const result = await addContentIntoPackFile(currentPackMeta, { environmentName: environment.name });
              if (result) {
                await reloadAllData();
                const refreshed = currentData.packs.find((candidate) => candidate.filePath === currentPackMeta.filePath);
                if (refreshed) {
                  currentPackMeta = refreshed;
                }
                renderPackEditor();
                void vscode.window.showInformationMessage(result.message);
              }
            }
            return;
          }
          if (message.operation === 'exportContentEnvironment') {
            if (environment) {
              const result = await exportContentFromPackFile(currentPackMeta, { environmentName: environment.name });
              if (result) {
                const openChoice = result.openPath
                  ? await vscode.window.showInformationMessage(result.message, 'Open file')
                  : await vscode.window.showInformationMessage(result.message);
                if (result.openPath && openChoice === 'Open file') {
                  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.openPath));
                  await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active });
                }
              }
            }
            return;
          }
          if (message.operation === 'addContentLibrary') {
            if (library && environment) {
              const result = await addContentIntoPackFile(currentPackMeta, { environmentName: environment.name, libraryName: library.name });
              if (result) {
                await reloadAllData();
                const refreshed = currentData.packs.find((candidate) => candidate.filePath === currentPackMeta.filePath);
                if (refreshed) {
                  currentPackMeta = refreshed;
                }
                renderPackEditor();
                void vscode.window.showInformationMessage(result.message);
              }
            }
            return;
          }
          if (message.operation === 'exportContentLibrary') {
            if (library && environment) {
              const result = await exportContentFromPackFile(currentPackMeta, { environmentName: environment.name, libraryName: library.name });
              if (result) {
                const openChoice = result.openPath
                  ? await vscode.window.showInformationMessage(result.message, 'Open file')
                  : await vscode.window.showInformationMessage(result.message);
                if (result.openPath && openChoice === 'Open file') {
                  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.openPath));
                  await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active });
                }
              }
            }
            return;
          }
          if (message.operation === 'addContentCategory') {
            if (library && category && environment) {
              const result = await addContentIntoPackFile(currentPackMeta, { environmentName: environment.name, libraryName: library.name, categoryName: category.name });
              if (result) {
                await reloadAllData();
                const refreshed = currentData.packs.find((candidate) => candidate.filePath === currentPackMeta.filePath);
                if (refreshed) {
                  currentPackMeta = refreshed;
                }
                renderPackEditor();
                void vscode.window.showInformationMessage(result.message);
              }
            }
            return;
          }
          if (message.operation === 'exportContentCategory') {
            if (library && category && environment) {
              const result = await exportContentFromPackFile(currentPackMeta, { environmentName: environment.name, libraryName: library.name, categoryName: category.name });
              if (result) {
                const openChoice = result.openPath
                  ? await vscode.window.showInformationMessage(result.message, 'Open file')
                  : await vscode.window.showInformationMessage(result.message);
                if (result.openPath && openChoice === 'Open file') {
                  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.openPath));
                  await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active });
                }
              }
            }
            return;
          }
        } catch (error) {
          void vscode.window.showErrorMessage(`Pack tool failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        return;
      }

      if (message?.type === 'savePack' && message.pack) {
        try {
          const sanitized = sanitizePackFileForSave(message.pack);
          writePackFile(currentPackMeta.filePath, sanitized);
          await reloadAllData();
          const refreshed = currentData.packs.find((candidate) => candidate.filePath === currentPackMeta.filePath);
          if (refreshed) {
            currentPackMeta = refreshed;
          }
          panel.webview.postMessage({ type: 'packSaved', pack: sanitized });
          renderPackEditor();
          void vscode.window.showInformationMessage(`Saved ${sanitized.name}.`);
        } catch (error) {
          void vscode.window.showErrorMessage(`Failed to save pack: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });

    renderPackEditor();
  };

  context.subscriptions.push(treeView);

  const refreshView = async (): Promise<void> => {
    await reloadAllData();
  };

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.refresh', refreshView));
  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.reloadPacks', refreshView));

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.openVisualEditor', async () => {
    const pack = await chooseWritablePack(currentData.packs, 'Open visual library pack editor');
    if (!pack) {
      return;
    }
    await showPackEditor(pack);
  }));

  const runCreatePackFlow = async (scope: PackSource) => {
    const packName = await promptForText({
      title: 'Create library pack',
      prompt: 'Pack name',
      placeHolder: 'My Internal C++ Pack'
    });
    if (!packName) {
      return;
    }

    const languageChoice = await vscode.window.showQuickPick([
      { label: 'C', value: 'c' },
      { label: 'C++', value: 'cpp' },
      { label: 'LabWindows/CVI', value: 'cvi' },
      { label: 'Lua', value: 'lua' },
      { label: 'Other', value: 'other' }
    ], {
      title: 'Choose the default language for the pack'
    });

    if (!languageChoice) {
      return;
    }

    const readOnlyChoice = await vscode.window.showQuickPick([
      { label: 'Editable', value: 'false', description: 'The pack can be edited directly from C/C++ Libraries' },
      { label: 'Read-only', value: 'true', description: 'The pack opens in read-only mode unless you edit the JSON manually' }
    ], { title: 'Choose the initial edit mode for the pack' });
    if (!readOnlyChoice) {
      return;
    }

    const targetDir = getPackTargetDirectory(context, scope);
    if (!targetDir) {
      void vscode.window.showWarningMessage('No valid storage directory is available for the selected scope.');
      return;
    }

    const filePath = makeUniqueFilePath(targetDir, `${slugify(packName)}.json`);
    writePackFile(filePath, createPackTemplate(packName, languageChoice.value, readOnlyChoice.value === 'true'));
    await reloadAllData();
    await openPackFileInEditor(filePath);
    void vscode.window.showInformationMessage(`Created ${packName} in ${sourceLabel(scope)} packs.`);
  };

  const runImportPackFlow = async (scope: PackSource) => {
    const picked = await vscode.window.showOpenDialog({
      title: 'Import library pack',
      canSelectMany: false,
      filters: {
        'JSON': ['json']
      }
    });

    const sourceUri = picked?.[0];
    if (!sourceUri) {
      return;
    }

    const readOnlyChoice = await vscode.window.showQuickPick([
      { label: 'Editable', value: 'false', description: 'The pack can be edited directly from C/C++ Libraries' },
      { label: 'Read-only', value: 'true', description: 'The pack opens in read-only mode unless you edit the JSON manually' }
    ], { title: 'Choose the initial edit mode for the imported pack' });
    if (!readOnlyChoice) {
      return;
    }

    const targetDir = getPackTargetDirectory(context, scope);
    if (!targetDir) {
      void vscode.window.showWarningMessage('No valid storage directory is available for the selected scope.');
      return;
    }

    const destination = makeUniqueFilePath(targetDir, path.basename(sourceUri.fsPath));
    fs.copyFileSync(sourceUri.fsPath, destination);
    try {
      const importedPack = readPackFile(destination);
      importedPack.readOnly = readOnlyChoice.value === 'true';
      writePackFile(destination, importedPack);
    } catch {}
    await reloadAllData();
    await openPackFileInEditor(destination);
    void vscode.window.showInformationMessage(`Imported ${path.basename(destination)} into ${sourceLabel(scope)} packs.`);
  };

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.createPack', async () => {
    const scope = await choosePackScope(!!getWorkspaceRoot());
    if (!scope) {
      return;
    }
    await runCreatePackFlow(scope);
  }));


  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.generateHeader', async () => {
    const pack = await chooseWritablePack(currentData.packs, 'Choose a pack for header generation')
      ?? await vscode.window.showQuickPick(
        currentData.packs.map((candidate) => ({
          label: candidate.name,
          description: `${sourceLabel(candidate.source)} • ${candidate.language ?? 'c'}`,
          detail: `${candidate.libraries.length} librar${candidate.libraries.length === 1 ? 'y' : 'ies'} • ${countFunctions(candidate)} function${countFunctions(candidate) === 1 ? '' : 's'}`,
          pack: candidate
        })),
        { title: 'Choose a pack for header generation', ignoreFocusOut: true }
      )?.pack;
    if (!pack) {
      return;
    }

    const generatedPath = await generateHeaderForPack(pack);
    if (!generatedPath) {
      return;
    }

    const openChoice = await vscode.window.showInformationMessage(`Generated header: ${generatedPath}`, 'Open header');
    if (openChoice === 'Open header') {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(generatedPath));
      await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active });
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.importPrototypes', async () => {
    const pack = await chooseWritablePack(currentData.packs, 'Choose a pack that will receive imported prototypes');
    if (!pack) {
      return;
    }

    const result = await importPrototypesToPackFile(pack);
    if (!result) {
      return;
    }

    await reloadAllData();
    const message = result.skipped > 0
      ? `Imported ${result.imported} prototype(s) and skipped ${result.skipped} duplicate(s).`
      : `Imported ${result.imported} prototype(s).`;
    void vscode.window.showInformationMessage(`${message} Source: ${result.filePath}`);
  }));



  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.importSymbols', async () => {
    const pack = await chooseWritablePack(currentData.packs, 'Choose a pack that will receive imported symbols');
    if (!pack) {
      return;
    }

    const result = await importSymbolsToPackFile(pack);
    if (!result) {
      return;
    }

    await reloadAllData();
    const message = result.skipped > 0
      ? `Imported ${result.imported} symbol(s) and skipped ${result.skipped} duplicate(s).`
      : `Imported ${result.imported} symbol(s).`;
    void vscode.window.showInformationMessage(`${message} Source: ${result.filePath}`);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.exportContent', async () => {
    const pack = await vscode.window.showQuickPick(
      currentData.packs.map((candidate) => ({
        label: candidate.name,
        description: `${sourceLabel(candidate.source)} • ${candidate.language ?? 'c'} • ${candidate.readOnly ? 'read-only' : (candidate.writable ? 'editable' : 'read-only')}`,
        detail: `${candidate.libraries.length} librar${candidate.libraries.length === 1 ? 'y' : 'ies'} • ${countFunctions(candidate)} function${countFunctions(candidate) === 1 ? '' : 's'}`,
        pack: candidate
      })),
      { title: 'Choose a pack to export or generate content from', ignoreFocusOut: true }
    )?.pack;
    if (!pack) {
      return;
    }
    const result = await exportContentFromPackFile(pack);
    if (!result) return;
    if (result.openPath) {
      const openChoice = await vscode.window.showInformationMessage(result.message, 'Open header');
      if (openChoice === 'Open header') {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.openPath));
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active });
      }
    } else {
      void vscode.window.showInformationMessage(result.message);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.addContent', async () => {
    const pack = await chooseWritablePack(currentData.packs, 'Choose a pack that will receive added content');
    if (!pack) {
      return;
    }

    const result = await addContentIntoPackFile(pack);
    if (!result) {
      return;
    }

    await reloadAllData();
    void vscode.window.showInformationMessage(result.message);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.deleteContent', async () => {
    const pack = await chooseWritablePack(currentData.packs, 'Choose a pack that will have content removed');
    if (!pack) {
      return;
    }

    const result = await deleteContentFromPackFile(pack);
    if (!result) {
      return;
    }

    await reloadAllData();
    void vscode.window.showInformationMessage(result.message);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.addLanguageStarter', async () => {
    const pack = await chooseWritablePack(currentData.packs, 'Choose a pack that will receive language packs, snippets, or DLL helpers');
    if (!pack) {
      return;
    }

    const result = await importLanguageStarterIntoPackFile(pack);
    if (!result) {
      return;
    }

    await reloadAllData();
    void vscode.window.showInformationMessage(`Added ${result.added} item(s) from ${result.label} to ${result.libraryName}.`);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.importSnippetFile', async () => {
    const pack = await chooseWritablePack(currentData.packs, 'Choose a pack that will receive the imported snippet');
    if (!pack) {
      return;
    }

    const result = await importSnippetFileIntoPackFile(pack);
    if (!result) {
      return;
    }

    await reloadAllData();
    void vscode.window.showInformationMessage(`Imported snippet into ${result.libraryName} / ${result.categoryName}. Source: ${result.filePath}`);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.importPack', async () => {
    const scope = await choosePackScope(!!getWorkspaceRoot());
    if (!scope) {
      return;
    }
    await runImportPackFlow(scope);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.managePacks', async () => {
    const packChoice = await vscode.window.showQuickPick(
      currentData.packs.map((pack) => ({
        label: pack.name,
        description: `${sourceLabel(pack.source)} • ${pack.language ?? 'c'} • ${pack.readOnly ? 'read-only' : (pack.writable ? 'editable' : 'read-only')}`,
        detail: `${pack.libraries.length} librar${pack.libraries.length === 1 ? 'y' : 'ies'} • ${countFunctions(pack)} function${countFunctions(pack) === 1 ? '' : 's'} • ${pack.filePath}`,
        pack
      })),
      {
        title: 'Manage library packs',
        placeHolder: 'Choose a pack to inspect or modify'
      }
    );

    const pack = packChoice?.pack;
    if (!pack) {
      return;
    }

    const actions = [
      { label: 'Open visual editor', description: 'Edit libraries, functions, and parameters in a visual form', value: 'visual' },
      { label: 'Open JSON file', description: 'Inspect or edit the raw pack file', value: 'open' },
      { label: 'Export content', description: 'Generate a header or export this pack', value: 'exportContent' },
      ...(pack.writable ? [
        { label: 'Add content', description: 'Add environments, libraries, symbols, imports, language packs, DLL helpers, or snippets', value: 'addContent' },
        { label: 'Delete content', description: 'Remove an environment, library, category, or symbol from this pack', value: 'deleteContent' },
        { label: 'Delete pack', description: 'Remove this pack from storage', value: 'delete' }
      ] : [])
    ];

    const actionChoice = await vscode.window.showQuickPick(actions, {
      title: `Manage ${pack.name}`
    });

    if (!actionChoice) {
      return;
    }

    if (actionChoice.value === 'visual') {
      await showPackEditor(pack);
      return;
    }

    if (actionChoice.value === 'open') {
      await openPackFileInEditor(pack.filePath);
      return;
    }

    if (actionChoice.value === 'exportContent') {
      const result = await exportContentFromPackFile(pack);
      if (result) {
        if (result.openPath) {
          const openChoice = await vscode.window.showInformationMessage(result.message, 'Open header');
          if (openChoice === 'Open header') {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.openPath));
            await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active });
          }
        } else {
          void vscode.window.showInformationMessage(result.message);
        }
      }
      return;
    }

    if (actionChoice.value === 'addContent') {
      const result = await addContentIntoPackFile(pack);
      if (result) {
        await reloadAllData();
        await openPackFileInEditor(pack.filePath);
        void vscode.window.showInformationMessage(result.message);
      }
      return;
    }

    if (actionChoice.value === 'deleteContent') {
      const result = await deleteContentFromPackFile(pack);
      if (result) {
        await reloadAllData();
        await openPackFileInEditor(pack.filePath);
        void vscode.window.showInformationMessage(result.message);
      }
      return;
    }

    if (actionChoice.value === 'importPrototypes') {
      const result = await importPrototypesToPackFile(pack);
      if (result) {
        await reloadAllData();
        const summary = result.skipped > 0
          ? `Imported ${result.imported} prototype(s) and skipped ${result.skipped} duplicate(s).`
          : `Imported ${result.imported} prototype(s).`;
        void vscode.window.showInformationMessage(`${summary} Source: ${result.filePath}`);
      }
      return;
    }

    if (actionChoice.value === 'importSymbols') {
      const result = await importSymbolsToPackFile(pack);
      if (result) {
        await reloadAllData();
        const summary = result.skipped > 0
          ? `Imported ${result.imported} symbol(s) and skipped ${result.skipped} duplicate(s).`
          : `Imported ${result.imported} symbol(s).`;
        void vscode.window.showInformationMessage(`${summary} Source: ${result.filePath}`);
      }
      return;
    }

    if (actionChoice.value === 'addLanguageStarter') {
      const result = await importLanguageStarterIntoPackFile(pack);
      if (result) {
        await reloadAllData();
        void vscode.window.showInformationMessage(`Added ${result.added} item(s) from ${result.label} to ${result.libraryName}.`);
      }
      return;
    }

    if (actionChoice.value === 'addLibrary') {
      await addLibraryToPackFile(pack);
      await reloadAllData();
      await openPackFileInEditor(pack.filePath);
      return;
    }

    if (actionChoice.value === 'addFunction') {
      const createdFunction = await addFunctionToPackFile(pack);
      await reloadAllData();
      await openPackFileInEditor(pack.filePath);

      if (createdFunction) {
        const refreshedFunction = searchEntries.find((entry) =>
          entry.fn.name === createdFunction.name &&
          entry.library === createdFunction.library &&
          entry.category === createdFunction.category
        )?.fn;

        if (refreshedFunction) {
          await showFunctionDetailsPanel(refreshedFunction);
        }
      }
      return;
    }

    if (actionChoice.value === 'delete') {
      const confirmation = await vscode.window.showWarningMessage(
        `Delete the pack "${pack.name}" from ${sourceLabel(pack.source)} storage?`,
        { modal: true },
        'Delete'
      );

      if (confirmation !== 'Delete') {
        return;
      }

      fs.unlinkSync(pack.filePath);
      await reloadAllData();
      void vscode.window.showInformationMessage(`Deleted ${pack.name}.`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.findFunction', async () => {
    const quickPick = vscode.window.createQuickPick<FunctionQuickPickItem>();
    quickPick.title = 'Find Symbol';
    quickPick.placeholder = 'Type a function name, library, category, header, signature, or parameter name';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.ignoreFocusOut = true;
    quickPick.prompt = 'Results update while you type. Press Enter to open the selected symbol details.';

    const updateItems = (query: string, activateFirst = false): void => {
      const trimmed = query.trim();

      // Keep the initial Find Symbol surface intentionally empty.  The picker
      // opens directly in text-entry mode and does not preview an arbitrary
      // first symbol until the user has actually entered a search term.
      if (trimmed.length === 0) {
        quickPick.items = [];
        quickPick.activeItems = [];
        quickPick.title = 'Find Symbol';
        quickPick.placeholder = 'Type a function name, library, category, header, signature, or parameter name';
        return;
      }

      const items = buildFunctionFilterItems(searchEntries, trimmed);
      quickPick.items = items;
      quickPick.title = `Find Symbol — ${items.length} match${items.length > 1 ? 'es' : ''}`;

      if (items.length === 0) {
        quickPick.activeItems = [];
        quickPick.placeholder = `No symbol matches "${trimmed}"`;
        return;
      }

      quickPick.placeholder = 'Type a function name, library, category, header, signature, or parameter name';

      if (activateFirst) {
        // Highlight the best match inside the QuickPick only. Opening or
        // revealing the details webview here would steal focus from the
        // search input after the first keystroke.
        quickPick.activeItems = [items[0]];
      }
    };

    quickPick.onDidChangeValue((value) => {
      updateItems(value, true);
    });

    // Do not open the details page while the user is typing or moving through
    // the QuickPick results. The details webview is opened only when the
    // selected result is explicitly accepted with Enter.
    quickPick.onDidChangeActive(() => undefined);

    const restoreUnfilteredExplorer = (): void => {
      // Find Symbol is a transient navigation surface. It must not leave the
      // sidebar in its flat filtered mode after Enter or Escape.
      treeProvider.clearFilter();
      updateViewMessage(treeView, treeProvider);
    };

    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems[0] ?? quickPick.activeItems[0];
      if (!selected) {
        quickPick.hide();
        return;
      }

      restoreUnfilteredExplorer();
      await showFunctionDetailsPanel(selected.fn);
      quickPick.hide();
    });

    quickPick.onDidHide(() => {
      restoreUnfilteredExplorer();
      quickPick.dispose();
    });

    // show() transfers keyboard focus to the QuickPick input.  Always start
    // from an empty query even when the explorer currently has a persisted
    // tree filter: no result and no preview are shown before the first key.
    quickPick.value = '';
    quickPick.items = [];
    quickPick.show();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.clearFind', () => {
    treeProvider.clearFilter();
    updateViewMessage(treeView, treeProvider);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.insertCall', async (item?: CpmItem) => {
    if (!item?.functionData) {
      void vscode.window.showInformationMessage('Select a function node first.');
      return;
    }
    await insertFunctionCall(item.functionData);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.showFunctionDetails', async (item?: CpmItem) => {
    if (!item?.functionData) {
      void vscode.window.showInformationMessage('Select a function node first.');
      return;
    }
    await showFunctionDetailsPanel(item.functionData);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('cpm.library.showFunctionDetailsByName', async (name?: string, fallback?: CpmFunction) => {
    const wanted = String(name ?? '').trim().toLowerCase();
    const matched = wanted ? searchEntries.find((entry) => entry.fn.name.toLowerCase() === wanted)?.fn : undefined;
    const resolved = matched ?? fallback;
    if (!resolved) {
      void vscode.window.showInformationMessage(`No C/C++ library card was found for ${name ?? 'the selected function'}.`);
      return;
    }
    await showFunctionDetailsPanel(resolved);
  }));

  updateViewMessage(treeView, treeProvider);
}


export function deactivate(): void {}
