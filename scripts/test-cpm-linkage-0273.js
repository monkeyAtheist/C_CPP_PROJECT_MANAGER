'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

class Uri { constructor(fsPath){ this.fsPath=fsPath; this.scheme='file'; } static file(p){ return new Uri(p); } }
class Range { constructor(){} }
const vscodeMock = {
  SymbolKind:{Function:11,Method:5,Constructor:8}, CompletionItemKind:{Function:3},
  window:{showErrorMessage:async()=>undefined,showInformationMessage:async()=>undefined,showQuickPick:async()=>undefined,createOutputChannel:()=>({appendLine(){},append(){},show(){}})},
  workspace:{getConfiguration:()=>({get:(_k,f)=>f,update:async()=>{}}),workspaceFolders:[{uri:Uri.file(process.cwd())}],getWorkspaceFolder:()=>undefined},
  commands:{executeCommand:async()=>undefined},debug:{startDebugging:async()=>true},Uri,Range,DiagnosticSeverity:{Warning:1,Error:0}
};
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){ if(request==='vscode') return vscodeMock; return originalLoad.call(this,request,parent,isMain); };

const root=path.resolve(__dirname,'..');
const { CpmBuildService }=require('../out/services/cpmBuildService.js');
const { BuildSettingsPanel }=require('../out/views/buildSettingsPanel.js');
const pkg=require('../package.json');
const lines=[];
const output={appendLine:(v='')=>lines.push(String(v)),append:(v='')=>lines.push(String(v)),show(){}};
const ref={exists:true,absolutePath:path.join(os.tmpdir(),'LinkageTest.prj'),name:'LinkageTest',index:1};
const projectSettings={
  getSettings:()=>({preBuildActions:[],linkageMode:'static',customBuildActions:[],postBuildActions:[],dependencies:[],run:{arguments:'',workingDirectory:'',environmentOptions:'',externalProcessPath:''},nativeBuildActions:true}),
  getCpmConfigurationValue:(_k,f)=>f,
  setSettings(){},parseEnvironment:()=>process.env
};
const workspaces={activeProjectRef:ref,getProject:()=>({targetType:'Executable',files:[]}),refresh(){},currentWorkspace:{projects:[ref]}};
const service=new CpmBuildService({},workspaces,{},projectSettings,{},output,output,output,{clear(){},set(){}});
const baseConfig={cCompilerPath:'gcc',cppCompilerPath:'g++',debuggerPath:'gdb',runtimeDependencyMode:'copy-dlls'};
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+(e.stack||e));}}

test('version is 0.2.84',()=>assert.strictEqual(pkg.version,'0.2.84'));
test('linkage commands are contributed',()=>{assert(pkg.contributes.commands.some(x=>x.command==='cpm.selectLinkageMode'));assert(pkg.contributes.commands.some(x=>x.command==='cpm.inspectRuntimeDependencies'));});
test('dynamic linkage adds no static linker flags',()=>assert.deepStrictEqual(service['runtimeLinkFlags'](baseConfig,'Executable',undefined,'dynamic'),[]));
test('static-runtime embeds compiler runtime without global -static',()=>{const flags=service['runtimeLinkFlags'](baseConfig,'Executable',undefined,'static-runtime');assert(flags.includes('-static-libgcc'));assert(flags.includes('-static-libstdc++'));assert(!flags.includes('-static'));});
test('full static linkage injects global -static',()=>{const flags=service['runtimeLinkFlags'](baseConfig,'Executable',undefined,'static');assert(flags.includes('-static'));assert(flags.includes('-static-libgcc'));assert(flags.includes('-static-libstdc++'));});
test('legacy SDL DLL cleanup removes only SDL runtime names',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cpm0273-sdl-'));fs.writeFileSync(path.join(dir,'SDL2.dll'),'x');fs.writeFileSync(path.join(dir,'SDL3_image.dll'),'x');fs.writeFileSync(path.join(dir,'custom.dll'),'x');service['cleanLegacySdlRuntimeDlls'](dir);assert(!fs.existsSync(path.join(dir,'SDL2.dll')));assert(!fs.existsSync(path.join(dir,'SDL3_image.dll')));assert(fs.existsSync(path.join(dir,'custom.dll')));});
test('settings page exposes QPM-style linkage modes and dependency inspection',()=>{const parser={getNativeTargetSettings:()=>({targetType:'Executable',outputPath:'build/App.exe',applicationTitle:'',iconFile:'',windowIconFile:'',applyWindowIconAutomatically:false})};const settings={...projectSettings,dependencyKey:()=>''};const html=new BuildSettingsPanel(workspaces,parser,settings)['render'](ref);assert(html.includes('Linkage mode'));assert(html.includes('Static compiler runtime'));assert(html.includes('Fully static when available'));assert(html.includes('Inspect built DLL dependencies'));new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);});
test('runtime dependency setting keeps static-link only as migration value',()=>{const p=pkg.contributes.configuration.properties['cpm.runtimeDependencyMode'];assert(p.enum.includes('static-link'));assert(/legacy static-link/i.test(p.description));});
test('source performs post-link runtime dependency verification',()=>{const src=fs.readFileSync(path.join(root,'src/services/cpmBuildService.ts'),'utf8');assert(src.includes('reportRuntimeDependencies(artifacts.targetPath'));assert(src.includes('readImportedDllNames(targetPath)'));assert(src.includes('Fully-static goal reached'));});

console.log(`RESULT ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
