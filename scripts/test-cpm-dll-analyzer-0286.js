'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const vscodeMock = { SymbolKind: { Function: 11, Method: 5, Constructor: 8, 11:'Function',5:'Method',8:'Constructor' } };
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) { if (request === 'vscode') return vscodeMock; return originalLoad.call(this, request, parent, isMain); };
const analyzer = require(path.join(root, 'out', 'services', 'cpmDllAnalyzerService.js'));
Module._load = originalLoad;

const align4 = n => (n + 3) & ~3;
function utf16z(s) { return Buffer.from(s + '\0', 'utf16le'); }
function versionBlock(key, type, value, children=[]) {
  const keyBuf = utf16z(key);
  let pos = 6 + keyBuf.length;
  const valueOffset = align4(pos);
  const childOffset = align4(valueOffset + value.length);
  let total = childOffset + children.reduce((n,b)=>n+b.length,0);
  total = align4(total);
  const b = Buffer.alloc(total, 0);
  b.writeUInt16LE(total,0);
  b.writeUInt16LE(type === 1 ? value.length/2 : value.length,2);
  b.writeUInt16LE(type,4);
  keyBuf.copy(b,6);
  value.copy(b,valueOffset);
  let c = childOffset;
  for (const child of children) { child.copy(b,c); c += child.length; }
  return b;
}
function makeVersionInfo() {
  const fixed = Buffer.alloc(52,0);
  fixed.writeUInt32LE(0xFEEF04BD,0);
  fixed.writeUInt32LE(0x00010000,4);
  fixed.writeUInt32LE((1<<16)|2,8);
  fixed.writeUInt32LE((3<<16)|4,12);
  fixed.writeUInt32LE((5<<16)|6,16);
  fixed.writeUInt32LE((7<<16)|8,20);
  const fileDesc = versionBlock('FileDescription',1,utf16z('Synthetic CPM DLL'));
  const company = versionBlock('CompanyName',1,utf16z('OpenAI Test Lab'));
  const table = versionBlock('040904B0',1,Buffer.alloc(0),[fileDesc,company]);
  const sfi = versionBlock('StringFileInfo',1,Buffer.alloc(0),[table]);
  return versionBlock('VS_VERSION_INFO',0,fixed,[sfi]);
}
function makePe64() {
  const b = Buffer.alloc(0x1200,0);
  b.write('MZ',0,'ascii'); b.writeUInt32LE(0x80,0x3c); b.write('PE\0\0',0x80,'ascii');
  const fh=0x84; b.writeUInt16LE(0x8664,fh); b.writeUInt16LE(4,fh+2); b.writeUInt32LE(0x65000000,fh+4); b.writeUInt16LE(0xf0,fh+16); b.writeUInt16LE(0x2022,fh+18);
  const oh=0x98; b.writeUInt16LE(0x20b,oh); b.writeUInt32LE(0x1234,oh+16); b.writeBigUInt64LE(0x140000000n,oh+24); b.writeUInt32LE(0x5000,oh+56); b.writeUInt32LE(0x400,oh+60); b.writeUInt32LE(0xAABBCCDD,oh+64); b.writeUInt16LE(3,oh+68); b.writeUInt16LE(0x8160,oh+70); b.writeUInt32LE(16,oh+108);
  const setDir=(idx,rva,size)=>{b.writeUInt32LE(rva,oh+112+idx*8);b.writeUInt32LE(size,oh+116+idx*8);};
  setDir(0,0x1000,0x180); setDir(1,0x2000,0x100); setDir(2,0x3000,0x300); setDir(4,0x1000,0x80); setDir(6,0x4000,28);
  const sh=oh+0xf0;
  const sec=(i,name,rva,raw,size)=>{const o=sh+i*40;b.write(name+'\0'.repeat(Math.max(0,8-name.length)),o,'ascii');b.writeUInt32LE(size,o+8);b.writeUInt32LE(rva,o+12);b.writeUInt32LE(size,o+16);b.writeUInt32LE(raw,o+20);b.writeUInt32LE(0x40000040,o+36);};
  sec(0,'.edata',0x1000,0x400,0x200); sec(1,'.idata',0x2000,0x600,0x200); sec(2,'.rsrc',0x3000,0x800,0x400); sec(3,'.rdata',0x4000,0xC00,0x200);
  const raw=(rva)=> rva>=0x4000?0xC00+(rva-0x4000):rva>=0x3000?0x800+(rva-0x3000):rva>=0x2000?0x600+(rva-0x2000):0x400+(rva-0x1000);
  // exports
  const ed=raw(0x1000); b.writeUInt32LE(0x1060,ed+12); b.writeUInt32LE(1,ed+16); b.writeUInt32LE(3,ed+20); b.writeUInt32LE(2,ed+24); b.writeUInt32LE(0x1040,ed+28); b.writeUInt32LE(0x104c,ed+32); b.writeUInt32LE(0x1054,ed+36);
  b.writeUInt32LE(0x5000,raw(0x1040)); b.writeUInt32LE(0x5010,raw(0x1040)+4); b.writeUInt32LE(0x5020,raw(0x1040)+8); b.writeUInt32LE(0x1070,raw(0x104c)); b.writeUInt32LE(0x1080,raw(0x104c)+4); b.writeUInt16LE(0,raw(0x1054)); b.writeUInt16LE(1,raw(0x1054)+2); b.write('demo.dll\0',raw(0x1060),'ascii'); b.write('plain_export\0',raw(0x1070),'ascii'); b.write('?CppExport@@YAHH@Z\0',raw(0x1080),'ascii');
  // imports
  const id=raw(0x2000); b.writeUInt32LE(0x2040,id); b.writeUInt32LE(0x2060,id+12); b.writeUInt32LE(0x2050,id+16); b.writeBigUInt64LE(0x2070n,raw(0x2040)); b.writeBigUInt64LE(0x8000000000000012n,raw(0x2040)+8); b.writeBigUInt64LE(0n,raw(0x2040)+16); b.write('KERNEL32.dll\0',raw(0x2060),'ascii'); b.writeUInt16LE(3,raw(0x2070)); b.write('GetTickCount64\0',raw(0x2070)+2,'ascii');
  // version resource tree: type 16 -> name 1 -> lang 1033 -> data
  const rb=raw(0x3000); b.writeUInt16LE(1,rb+14); b.writeUInt32LE(16,rb+16); b.writeUInt32LE(0x80000020,rb+20);
  b.writeUInt16LE(1,rb+0x20+14); b.writeUInt32LE(1,rb+0x20+16); b.writeUInt32LE(0x80000040,rb+0x20+20);
  b.writeUInt16LE(1,rb+0x40+14); b.writeUInt32LE(1033,rb+0x40+16); b.writeUInt32LE(0x60,rb+0x40+20);
  const vi=makeVersionInfo(); b.writeUInt32LE(0x3100,rb+0x60); b.writeUInt32LE(vi.length,rb+0x64); vi.copy(b,raw(0x3100));
  // debug RSDS
  const dbg=raw(0x4000); b.writeUInt32LE(2,dbg+12); b.writeUInt32LE(64,dbg+16); b.writeUInt32LE(0x4040,dbg+20); b.writeUInt32LE(raw(0x4040),dbg+24); const cv=raw(0x4040); b.write('RSDS',cv,'ascii'); for(let i=0;i<16;i++)b[cv+4+i]=i+1; b.writeUInt32LE(2,cv+20); b.write('C:\\build\\demo.pdb\0',cv+24,'ascii');
  return b;
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cpm-dll-analyzer-'));
const dll=path.join(dir,'demo.dll'); fs.writeFileSync(dll,makePe64());
const a=analyzer.analyzeDllFile(dll);
assert.strictEqual(a.architecture,'x64');
assert.strictEqual(a.peFormat,'PE32+');
assert.strictEqual(a.version.fileVersion,'1.2.3.4');
assert.strictEqual(a.version.productVersion,'5.6.7.8');
assert.strictEqual(a.version.strings.FileDescription,'Synthetic CPM DLL');
assert.strictEqual(a.exports.length,2);
assert.strictEqual(a.ordinalOnlyExportCount,1);
assert.strictEqual(a.imports[0].dll,'KERNEL32.dll');
assert(a.imports[0].symbols.some(x=>x.name==='GetTickCount64'));
assert(a.imports[0].symbols.some(x=>x.ordinal===18));
assert(a.resources.some(x=>x.id===16));
assert.strictEqual(a.authenticodePresent,true);
assert(a.debug.pdbPath.endsWith('demo.pdb'));
assert.strictEqual(a.debug.pdbAge,2);
assert.strictEqual(a.sections.length,4);
const md=analyzer.renderDllAnalysisMarkdown(a);
assert(md.includes('1.2.3.4') && md.includes('GetTickCount64') && md.includes('plain_export'));

const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
assert(/^0\.2\.\d+$/.test(pkg.version));
assert(pkg.contributes.commands.some(c=>c.command==='cpm.analyzeDll'));
assert(pkg.contributes.menus['view/item/context'].some(x=>x.command==='cpm.analyzeDll' && /ext-dll/.test(x.when)));
const importSource=fs.readFileSync(path.join(root,'src','services','cpmImportLibraryService.ts'),'utf8');
for(const token of ['+ Add DLL(s)…','data-browse-dll','data-browse-out','one .lib per DLL','generateDllBatch']) assert(importSource.includes(token),token);
const settings=fs.readFileSync(path.join(root,'src','views','buildSettingsPanel.ts'),'utf8');
for(const token of ['DLL Analyzer','section-dll-analyzer','Exports (','Imports / dependencies','Version strings','exportDllAnalysis']) assert(settings.includes(token),token);
console.log(`CPM ${pkg.version} multi-DLL import UI + DLL Analyzer: PASS`);
