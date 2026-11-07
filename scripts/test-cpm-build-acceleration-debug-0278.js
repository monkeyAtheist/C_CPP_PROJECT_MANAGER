'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const cp=require('child_process');
const Module=require('module');
class Uri { constructor(fsPath){this.fsPath=fsPath;this.scheme='file';} static file(p){return new Uri(p);} }
class Range { constructor(){} }
const vscodeMock={
 SymbolKind:{Function:11,Method:5,Constructor:8},CompletionItemKind:{Function:3},
 window:{showErrorMessage:async()=>undefined,showInformationMessage:async()=>undefined,showWarningMessage:async()=>undefined,showQuickPick:async()=>undefined,showOpenDialog:async()=>undefined,showSaveDialog:async()=>undefined,createOutputChannel:()=>({appendLine(){},append(){},show(){},clear(){}}),createWebviewPanel:()=>({onDidDispose(){},webview:{onDidReceiveMessage(){},html:'',postMessage:async()=>{}},reveal(){}})},
 workspace:{getConfiguration:()=>({get:(_k,f)=>f,update:async()=>{},inspect:()=>({})}),workspaceFolders:[{uri:Uri.file(process.cwd())}],getWorkspaceFolder:()=>undefined},
 commands:{executeCommand:async()=>undefined},debug:{startDebugging:async()=>true},ConfigurationTarget:{Workspace:2,Global:1},ViewColumn:{Active:1},Uri,Range,DiagnosticSeverity:{Warning:1,Error:0}
};
const originalLoad=Module._load;Module._load=function(request,parent,isMain){if(request==='vscode')return vscodeMock;return originalLoad.call(this,request,parent,isMain);};
const root=path.resolve(__dirname,'..');
const pkg=require('../package.json');
const {BuildSettingsPanel}=require('../out/views/buildSettingsPanel.js');
const {DEFAULT_EXTERNAL_DEPENDENCIES,DEFAULT_REMOTE_LINUX}=require('../out/services/cpmProjectSettingsService.js');
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+(e.stack||e));}}
(async()=>{
 await test('version is 0.2.79',()=>assert.strictEqual(pkg.version,'0.2.79'));
 await test('workspace toolbar exposes Run Debug with debug-start icon',()=>{
   const cmd=pkg.contributes.commands.find(x=>x.command==='cpm.runDebug');assert(cmd);assert.strictEqual(cmd.icon,'$(debug-start)');
   const menu=pkg.contributes.menus['view/title'].find(x=>x.command==='cpm.runDebug');assert(menu);assert(menu.when.includes('cpm.workspaceExplorer'));
 });
 await test('Run Debug is separate from Build and Debug in runtime source',()=>{
   const src=fs.readFileSync(path.join(root,'src/services/cpmBuildService.ts'),'utf8');
   assert(src.includes('async debugWithoutBuild'));assert(src.includes('startGdbDebug(projectRef, false)'));assert(src.includes('if (buildFirst)'));
 });
 await test('build settings expose PCH and Unity controls',()=>{
   const ref={exists:true,absolutePath:path.join(os.tmpdir(),'Accel.prj'),name:'Accel',index:1};
   const settingsObj={preBuildActions:[],linkageMode:'dynamic',parallelJobs:0,useResponseFiles:true,precompiledHeadersEnabled:true,cPrecompiledHeader:'pch.h',cppPrecompiledHeader:'pch.hpp',unityBuildEnabled:true,unityBatchSize:8,customBuildActions:[],postBuildActions:[],dependencies:[],externalDependencies:DEFAULT_EXTERNAL_DEPENDENCIES,remoteLinux:DEFAULT_REMOTE_LINUX,run:{arguments:'',workingDirectory:'',environmentOptions:'',externalProcessPath:''}};
   const workspaces={activeProjectRef:ref,getProject:()=>({files:[]}),currentWorkspace:{projects:[ref]}};
   const parser={getNativeTargetSettings:()=>({targetType:'Executable',outputPath:'build/App.exe',applicationTitle:'',iconFile:'',windowIconFile:'',applyWindowIconAutomatically:false})};
   const settings={getSettings:()=>settingsObj,dependencyKey:()=>'',getCpmConfigurationValue:(_k,f)=>f};
   const html=new BuildSettingsPanel(workspaces,parser,settings).render(ref);
   assert(html.includes('Precompiled Headers (PCH)'));assert(html.includes('Unity Build'));assert(html.includes('unityBatchSize'));new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
 });
 await test('real GCC/G++ PCH plus Unity translation unit compiles',()=>{
   const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cpm0278-accel-'));
   const pch=path.join(dir,'pch.hpp'),wrapper=path.join(dir,'cpm_pch_cpp.hpp'),gch=wrapper+'.gch';
   fs.writeFileSync(pch,'#pragma once\n#include <string>\n#define MAGIC 7\n');
   fs.writeFileSync(wrapper,`#pragma once\n#include "${pch.replace(/\\/g,'/')}"\n`);
   cp.execFileSync('g++',['-x','c++-header',wrapper,'-MMD','-MP','-MF',gch+'.d','-MT',gch,'-std=c++17','-o',gch]);
   const a=path.join(dir,'a.cpp'),b=path.join(dir,'b.cpp'),unity=path.join(dir,'unity.cpp'),obj=path.join(dir,'unity.o');
   fs.writeFileSync(a,'int a(){std::string s="a";return MAGIC;}\n');fs.writeFileSync(b,'int b(){std::string s="b";return MAGIC;}\n');
   fs.writeFileSync(unity,`#include "${a.replace(/\\/g,'/')}"\n#include "${b.replace(/\\/g,'/')}"\n`);
   cp.execFileSync('g++',['-c',unity,'-include',wrapper,'-MMD','-MP','-MF',obj+'.d','-MT',obj,'-std=c++17','-o',obj]);
   assert(fs.existsSync(gch));assert(fs.existsSync(obj));const dep=fs.readFileSync(obj+'.d','utf8');assert(dep.includes('a.cpp')&&dep.includes('b.cpp'));
 });
 await test('build runtime contains generated PCH and Unity engine paths',()=>{
   const src=fs.readFileSync(path.join(root,'src/services/cpmBuildService.ts'),'utf8');
   assert(src.includes('cpm_pch_${entry.language}'));assert(src.includes('cpm_unity_'));assert(src.includes("'-x', xlang"));assert(src.includes('sourceNeedsCompilation(wrapperPath, pchPath'));
 });
 console.log(`RESULT ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
