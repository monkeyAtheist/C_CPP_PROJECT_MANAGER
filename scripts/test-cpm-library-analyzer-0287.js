'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const analyzer = require(path.join(root, 'out', 'services', 'cpmLibraryAnalyzerService.js'));

function arHeader(name, data, timestamp = 0) {
  const field = (value, size) => String(value).slice(0, size).padEnd(size, ' ');
  const normalized = name.length <= 15 && !name.endsWith('/') ? name + '/' : name;
  return Buffer.from(
    field(normalized,16) + field(timestamp,12) + field(0,6) + field(0,6) + field('100644',8) + field(data.length,10) + '`\n',
    'ascii'
  );
}
function makeArchive(members) {
  const chunks=[Buffer.from('!<arch>\n','ascii')];
  for(const {name,data} of members){ chunks.push(arHeader(name,data),data); if(data.length&1) chunks.push(Buffer.from('\n')); }
  return Buffer.concat(chunks);
}
function shortImportObject(symbol,dll,machine=0x8664){
  const strings=Buffer.from(symbol+'\0'+dll+'\0','ascii');
  const h=Buffer.alloc(20,0); h.writeUInt16LE(0,0); h.writeUInt16LE(0xffff,2); h.writeUInt16LE(0,4); h.writeUInt16LE(machine,6); h.writeUInt32LE(0,8); h.writeUInt32LE(strings.length,12); h.writeUInt16LE(0,16); h.writeUInt16LE(0,18);
  return Buffer.concat([h,strings]);
}

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cpm-lib-analyzer-'));
const c=path.join(dir,'demo.c'); const o=path.join(dir,'demo.o'); const a=path.join(dir,'demo.a'); const libStatic=path.join(dir,'demo-static.lib');
fs.writeFileSync(c,'int demo_add(int a,int b){return a+b;}\n');
let cc=cp.spawnSync('gcc',['-c',c,'-o',o],{encoding:'utf8'}); assert.strictEqual(cc.status,0,cc.stderr);
let ar=cp.spawnSync('ar',['rcs',a,o],{encoding:'utf8'}); assert.strictEqual(ar.status,0,ar.stderr);
fs.copyFileSync(a,libStatic);
const sa=analyzer.analyzeLibraryFile(a);
assert.strictEqual(sa.libraryKind,'static');
assert(sa.objectMemberCount>=1); assert(sa.architectures.length>=1); assert(sa.sha256.length===64);
const sl=analyzer.analyzeLibraryFile(libStatic); assert.strictEqual(sl.libraryKind,'static'); assert.strictEqual(sl.extension,'.lib');

const importLib=path.join(dir,'demo-import.lib');
fs.writeFileSync(importLib,makeArchive([{name:'demo.obj',data:shortImportObject('demo_api','DEMO.dll')} ]));
const ia=analyzer.analyzeLibraryFile(importLib);
assert.strictEqual(ia.libraryKind,'import');
assert(ia.importDlls.some(x=>x.toLowerCase()==='demo.dll'));
assert(ia.members.some(x=>x.importSymbol==='demo_api' && x.importDll==='DEMO.dll'));
assert(ia.architectures.includes('x64'));
const md=analyzer.renderLibraryAnalysisMarkdown(ia); assert(md.includes('DEMO.dll') && md.includes('demo_api'));

const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
assert(/^0\.2\.\d+$/.test(pkg.version));
assert(pkg.contributes.commands.some(c=>c.command==='cpm.analyzeLibrary'));
assert(pkg.contributes.menus['view/item/context'].some(x=>x.command==='cpm.analyzeLibrary' && /ext-\(lib\|a\)/.test(x.when)));
const settingsSource=fs.readFileSync(path.join(root,'src','views','buildSettingsPanel.ts'),'utf8');
for(const token of ['.a / .lib Analyzer','section-library-analyzer','staticLibraryFormat','dllImportLibraryFormat','Analyze library']) assert(settingsSource.includes(token),token);
const buildSource=fs.readFileSync(path.join(root,'src','services','cpmBuildService.ts'),'utf8');
for(const token of ['--out-implib','windowsDllImportLibraryPath','/OUT:${targetPath}','staticLibraryExtension']) assert(buildSource.includes(token),token);
console.log('CPM .a/.lib Analyzer + archive/import-library build model: PASS');
