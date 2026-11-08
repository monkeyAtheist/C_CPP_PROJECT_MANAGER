'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const symbolKind = { Function: 11, Method: 5, Constructor: 8, 11: 'Function', 5: 'Method', 8: 'Constructor' };
const vscodeMock = { SymbolKind: symbolKind };
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};
const api = require(path.join(root, 'out', 'services', 'cpmImportLibraryService.js'));
Module._load = originalLoad;

function makePe64() {
  const b = Buffer.alloc(0x600, 0);
  b.write('MZ', 0, 'ascii');
  b.writeUInt32LE(0x80, 0x3c);
  b.write('PE\0\0', 0x80, 'ascii');
  const fh = 0x84;
  b.writeUInt16LE(0x8664, fh); // AMD64
  b.writeUInt16LE(1, fh + 2); // sections
  b.writeUInt16LE(0xf0, fh + 16); // optional-header size
  const oh = 0x98;
  b.writeUInt16LE(0x20b, oh); // PE32+
  b.writeUInt32LE(0x200, oh + 60); // SizeOfHeaders
  b.writeUInt32LE(16, oh + 108); // NumberOfRvaAndSizes
  b.writeUInt32LE(0x1000, oh + 112); // export RVA
  b.writeUInt32LE(0x180, oh + 116); // export size
  const sh = oh + 0xf0;
  b.write('.edata\0\0', sh, 'ascii');
  b.writeUInt32LE(0x400, sh + 8); // virtual size
  b.writeUInt32LE(0x1000, sh + 12); // RVA
  b.writeUInt32LE(0x400, sh + 16); // raw size
  b.writeUInt32LE(0x200, sh + 20); // raw pointer
  const ed = 0x200;
  b.writeUInt32LE(0x1060, ed + 12); // DLL name
  b.writeUInt32LE(1, ed + 16); // ordinal base
  b.writeUInt32LE(3, ed + 20); // functions
  b.writeUInt32LE(2, ed + 24); // names
  b.writeUInt32LE(0x1040, ed + 28); // funcs
  b.writeUInt32LE(0x104c, ed + 32); // names
  b.writeUInt32LE(0x1054, ed + 36); // ordinals
  const raw = (rva) => 0x200 + (rva - 0x1000);
  b.writeUInt32LE(0x2000, raw(0x1040));
  b.writeUInt32LE(0x2010, raw(0x1040) + 4);
  b.writeUInt32LE(0x2020, raw(0x1040) + 8); // ordinal-only export
  b.writeUInt32LE(0x1070, raw(0x104c));
  b.writeUInt32LE(0x1080, raw(0x104c) + 4);
  b.writeUInt16LE(0, raw(0x1054));
  b.writeUInt16LE(1, raw(0x1054) + 2);
  b.write('demo.dll\0', raw(0x1060), 'ascii');
  b.write('plain_export\0', raw(0x1070), 'ascii');
  b.write('?CppExport@@YAHH@Z\0', raw(0x1080), 'ascii');
  return b;
}

const header = `
#ifdef __cplusplus
extern "C" {
#endif
__declspec(dllimport) int GPT_Open(int port);
void GPT_Close(void);
static int helper(void);
#ifdef __cplusplus
}
#endif
`;
const parsedHeader = api.collectHeaderImportSymbols(header, 'driver.h');
assert(parsedHeader.symbols.some(s => s.name === 'GPT_Open'), JSON.stringify(parsedHeader));
assert(parsedHeader.symbols.some(s => s.name === 'GPT_Close'), JSON.stringify(parsedHeader));
assert(!parsedHeader.symbols.some(s => s.name === 'helper'));

const pe = api.parsePeExports(makePe64());
assert.strictEqual(pe.architecture, 'x64');
assert.strictEqual(pe.dllName, 'demo.dll');
assert.deepStrictEqual(pe.symbols.map(s => s.name), ['plain_export', '?CppExport@@YAHH@Z']);
assert.strictEqual(pe.ordinalOnlyCount, 1);

const def = api.renderModuleDefinition('demo.dll', pe.symbols);
assert(def.includes('LIBRARY "demo.dll"'));
assert(def.includes('plain_export @1'));
assert(def.includes('?CppExport@@YAHH@Z @2'));

const msvc = api.buildImportLibraryInvocation({kind:'msvc-lib', executable:'lib.exe', label:'Microsoft LIB'}, 'demo.def', 'demo.lib', 'demo.dll', 'x64');
assert.deepStrictEqual(msvc.args, ['/NOLOGO','/DEF:demo.def','/OUT:demo.lib','/MACHINE:X64']);
const gnu = api.buildImportLibraryInvocation({kind:'gnu-dlltool', executable:'dlltool.exe', label:'GNU dlltool'}, 'demo.def', 'demo.lib', 'demo.dll', 'x86');
assert.deepStrictEqual(gnu.args, ['-d','demo.def','-l','demo.lib','-D','demo.dll','-m','i386']);

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert(/^0\.2\.\d+$/.test(pkg.version));
for (const id of ['cpm.generateImportLibraryFromHeaders','cpm.generateImportLibraryFromDll','cpm.extractDllDefinitionFile','cpm.openImportLibraryReport']) {
  assert(pkg.contributes.commands.some(c => c.command === id), `missing command ${id}`);
}
const contexts = pkg.contributes.menus['view/item/context'];
assert(contexts.some(x => x.command === 'cpm.generateImportLibraryFromHeaders' && /header/.test(x.when)));
assert(contexts.some(x => x.command === 'cpm.generateImportLibraryFromDll' && /ext-dll/.test(x.when)));
const settingsSource = fs.readFileSync(path.join(root, 'src', 'views', 'buildSettingsPanel.ts'), 'utf8');
for (const token of ['section-import-libraries','Generate .lib from Header(s)','Generate .lib from DLL','importLibraryGenerator','importLibraryArchitecture']) assert(settingsSource.includes(token), token);
const treeSource = fs.readFileSync(path.join(root, 'src', 'providers', 'cpmTreeProvider.ts'), 'utf8');
assert(treeSource.includes('ext-${extension}'));
console.log(`CPM import-library generation regression (${pkg.version}): PASS`);
