'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');

class EventEmitter{constructor(){this.listeners=[];this.event=(cb)=>{this.listeners.push(cb);return{dispose(){}}};}fire(v){for(const cb of this.listeners)cb(v);}dispose(){}}
class ThemeIcon{constructor(id){this.id=id;}}
class TreeItem{constructor(label,state){this.label=label;this.collapsibleState=state;}}
class Uri{constructor(fsPath){this.fsPath=fsPath;this.scheme='file';}static file(p){return new Uri(p);}}
let lastDebugConfig;
const vscodeMock={
  EventEmitter,ThemeIcon,TreeItem,TreeItemCollapsibleState:{None:0},Uri,SymbolKind:{Function:11,Method:5,Constructor:8,Class:4,Struct:23,Enum:10,Variable:12,Constant:14,Namespace:2,Interface:9,Property:6,Field:7,Macro:25},CompletionItemKind:{Function:3},
  window:{
    showInformationMessage:async()=>undefined,showErrorMessage:async()=>undefined,showWarningMessage:async()=>undefined,
    showQuickPick:async()=>undefined,showInputBox:async()=>undefined,showTextDocument:async()=>undefined,
    createTerminal:()=>({show(){},sendText(){},dispose(){}})
  },
  workspace:{openTextDocument:async()=>({}),getWorkspaceFolder:()=>({uri:Uri.file(process.cwd())}),getConfiguration:()=>({get:(_k,f)=>f,update:async()=>{}})},
  commands:{executeCommand:async()=>undefined},
  debug:{startDebugging:async(_folder,cfg)=>{lastDebugConfig=cfg;return true;}}
};
const originalLoad=Module._load;Module._load=function(req,parent,isMain){if(req==='vscode')return vscodeMock;return originalLoad.call(this,req,parent,isMain);};

const pkg=require('../package.json');
const {CpmRemoteLinuxService}=require('../out/services/cpmRemoteLinuxService.js');
const {CpmProjectHealthProvider}=require('../out/providers/cpmProjectHealthProvider.js');
const {BuildSettingsPanel}=require('../out/views/buildSettingsPanel.js');
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+(e.stack||e));}}

function remoteConfig(overrides={}){return Object.assign({
 enabled:true,sshHost:'raspberrypi',sshUser:'pi',sshPort:22,sshExecutable:'ssh',scpExecutable:'scp',rsyncExecutable:'rsync',useRsync:false,
 remoteProjectDirectory:'~/cpm-projects/${projectName}',remoteBuildDirectory:'.cpm-remote-build',syncBeforeBuild:false,syncBeforeRun:false,
 remoteBuildCommand:'',remoteRunCommand:'',cCompiler:'gcc',cppCompiler:'g++',archiver:'ar',additionalCompilerFlags:[],additionalLinkerFlags:[],additionalIncludeDirectories:[],additionalLibraryDirectories:[],additionalLibraries:[],pkgConfigPackages:[],environment:[],gdbServerPort:2345,gdbServerExecutable:'gdbserver',remoteDebuggerExecutable:'gdb',startGdbServerAutomatically:false
 },overrides);}
function makeFakeTool(dir,name){const p=path.join(dir,name);fs.writeFileSync(p,'#!/bin/sh\ncmd=""\nfor arg in "$@"; do cmd="$arg"; done\ncase "$cmd" in\n  *CPM_REMOTE_OK*) printf CPM_REMOTE_OK ;;\n  *"pwd -P"*) case "$cmd" in *.cpm-remote-build*Demo*) echo /home/pi/cpm-projects/Demo/.cpm-remote-build/debug64/Demo ;; *) echo /home/pi/cpm-projects/Demo ;; esac ;;\n  *) : ;;\nesac\nexit 0\n');fs.chmodSync(p,0o755);return p;}
function harness(overrides={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cpm0277-remote-'));fs.mkdirSync(path.join(dir,'include'),{recursive:true});
 const prj=path.join(dir,'Demo.prj');const src=path.join(dir,'main.cpp');fs.writeFileSync(prj,'[Project Header]\n');fs.writeFileSync(src,'#include "demo.hpp"\nint main(){return 0;}\n');fs.writeFileSync(path.join(dir,'include','demo.hpp'),'#pragma once\n');
 const ref={index:1,relativePath:'Demo.prj',absolutePath:prj,name:'Demo',exists:true};
 const project={path:prj,name:'Demo',targetType:'Executable',folders:[],files:[{sectionName:'File 1',id:1,type:'C Source',folder:'',absolutePath:src,excluded:false,compileIntoObjectFile:true,exists:true}]};
 const cfg=remoteConfig();
 const settings={remoteLinux:cfg,linkageMode:'static-runtime',parallelJobs:0,useResponseFiles:true,dependencies:[],preBuildActions:[],customBuildActions:[],postBuildActions:[],externalDependencies:{enabled:false},run:{arguments:'--demo 42',workingDirectory:'',environmentOptions:'',externalProcessPath:''}};
 const workspaces={activeProjectRef:ref,currentWorkspace:{path:path.join(dir,'Demo.cws'),name:'Demo',projects:[ref]},getProject:()=>project,onDidChange:()=>({dispose(){}})};
 const values={compilerFlags:['-DGLOBAL'],cCompilerFlags:[],cppCompilerFlags:['-fno-exceptions'],defineSymbols:['FEATURE=1'],warningLevel:'wall-extra',optimizationLevel:'mode-default',debugInformation:'mode-default',includePaths:['include','C:/host-only/include'],libraryPaths:['lib','D:/host-only/lib'],libraries:['m','C:/host-only/libbad.a'],cppStandard:'c++20',cStandard:'c17',linkerFlags:['-pthread'],runOutputMode:'output-channel'};
 const projectSettings={getSettings:()=>settings,parseArguments:(v)=>v.trim()?v.trim().split(/\s+/):[],getCpmConfigurationValue:(k,f)=>Object.prototype.hasOwnProperty.call(values,k)?values[k]:f};
 const builds={buildMode:'debug64'};
 const outputLines=[];const output={appendLine:(v='')=>outputLines.push(String(v)),append:(v='')=>outputLines.push(String(v)),clear(){},show(){}};const program={appendLine:(v='')=>outputLines.push(String(v)),append:(v='')=>outputLines.push(String(v)),clear(){},show(){}};
 const service=new CpmRemoteLinuxService(workspaces,{},projectSettings,builds,output,program);
 Object.assign(cfg,overrides.config||{});Object.assign(project,overrides.project||{});
 return {dir,ref,project,cfg,settings,workspaces,projectSettings,builds,output,outputLines,service};
}

(async()=>{
 await test('version is 0.2.81',()=>assert.strictEqual(pkg.version,'0.2.81'));
 await test('Remote Linux view and complete command set are contributed',()=>{assert(pkg.contributes.views.cpm.some(v=>v.id==='cpm.remoteLinux'));for(const c of ['cpm.openSshDeviceManager','cpm.remote.configure','cpm.remote.testConnection','cpm.remote.sync','cpm.remote.build','cpm.remote.run','cpm.remote.buildRun','cpm.remote.debug','cpm.remote.openTerminal','cpm.remote.openReport'])assert(pkg.contributes.commands.some(x=>x.command===c),c);});
 await test('generated Linux build script maps project paths and skips Windows-only absolute paths',()=>{const h=harness();const r=h.service['generateRemoteBuildScript'](h.ref,h.cfg);assert(r.success);const script=fs.readFileSync(r.path,'utf8');assert(script.includes('PROJECT_DIR="$HOME/cpm-projects/Demo"'));assert(script.includes('-I"$PROJECT_DIR/include"'));assert(!script.includes('host-only/include'));assert(!script.includes('libbad.a'));assert(script.includes('-std=c++20'));assert(script.includes('-static-libgcc'));assert(script.includes('-static-libstdc++'));assert(script.includes('libm')===false);assert(script.includes("'-lm'"));assert.strictEqual(require('child_process').spawnSync('sh',['-n',r.path]).status,0);});
 await test('remote target is Linux-native for executable, shared and static targets',()=>{const h=harness();assert(h.service['remoteTargetPath'](h.ref,h.cfg).endsWith('/.cpm-remote-build/debug64/Demo'));h.project.targetType='Dynamic Link Library';assert(h.service['remoteTargetPath'](h.ref,h.cfg).endsWith('/libDemo.so'));h.project.targetType='Static Library';assert(h.service['remoteTargetPath'](h.ref,h.cfg).endsWith('/libDemo.a'));});
 await test('SSH connection test executes configured OpenSSH tool',async()=>{const h=harness();h.cfg.sshExecutable=makeFakeTool(h.dir,'fake-ssh');assert.strictEqual(await h.service.testConnection(h.ref),true);});
 await test('scp fallback synchronizes and generates remote script',async()=>{const h=harness();h.cfg.sshExecutable=makeFakeTool(h.dir,'fake-ssh');h.cfg.scpExecutable=makeFakeTool(h.dir,'fake-scp');h.cfg.useRsync=false;assert.strictEqual(await h.service.syncProject(h.ref),true);assert(fs.existsSync(path.join(h.dir,'.cpm','remote','cpm_remote_build.sh')));});
 await test('remote debug uses remote GDB through SSH pipeTransport and sourceFileMap',async()=>{const h=harness();h.cfg.sshExecutable=makeFakeTool(h.dir,'fake-ssh');h.cfg.scpExecutable=makeFakeTool(h.dir,'fake-scp');h.cfg.startGdbServerAutomatically=false;lastDebugConfig=undefined;assert.strictEqual(await h.service.debugRemote(h.ref),true);assert(lastDebugConfig);assert.strictEqual(lastDebugConfig.type,'cppdbg');assert.strictEqual(lastDebugConfig.pipeTransport.debuggerPath,'gdb');assert.strictEqual(lastDebugConfig.pipeTransport.pipeProgram,h.cfg.sshExecutable);assert.strictEqual(lastDebugConfig.miDebuggerServerAddress,'127.0.0.1:2345');assert.strictEqual(lastDebugConfig.program,'/home/pi/cpm-projects/Demo/.cpm-remote-build/debug64/Demo');assert.strictEqual(lastDebugConfig.sourceFileMap['/home/pi/cpm-projects/Demo'],h.dir);});
 await test('Build Settings exposes dedicated Remote Linux page and gdbserver controls',()=>{const src=fs.readFileSync(path.join(__dirname,'..','src/views/buildSettingsPanel.ts'),'utf8');for(const text of ['Remote Linux / Raspberry Pi','remoteLinuxSshHost','remoteLinuxBuildDirectory','remoteLinuxGdbServerPort','OpenSSH Device Manager','cpm.remote.buildRun'])assert(src.includes(text),text);});
 await test('Project Health includes Remote Linux status when enabled',()=>{const h=harness();const parser={inspectWorkspaceCompatibility:()=>[],getNativeTargetSettings:()=>({iconFile:'',windowIconFile:''})};const installations={getActiveInstallation:()=>({label:'GCC',cCompilerExe:process.execPath,cppCompilerExe:process.execPath,archiverExe:process.execPath,debuggerExe:process.execPath})};const build={buildMode:'debug64',linkageMode:'dynamic',targetPath:path.join(h.dir,'x'),targetExists:false,objectDirectory:path.join(h.dir,'obj'),cCompilerPath:process.execPath,cppCompilerPath:process.execPath,archiverPath:process.execPath,debuggerPath:process.execPath,outputDirectory:'build',architectureMode:'auto',includePaths:[],libraryPaths:[],libraries:[],parallelJobs:0,useResponseFiles:true,externalRuntimeDlls:[],systemRuntimeDlls:[]};const builds={buildMode:'debug64',getHealthSnapshot:()=>build};const ps={...h.projectSettings,getBuildOrder:()=>[h.ref],dependencyKey:(x)=>x.relativePath};const cpp={getHealthSnapshot:()=>({configurationRoot:h.dir,configurationPath:path.join(h.dir,'.vscode','c_cpp_properties.json'),configurationExists:true,managedConfigurationPresent:true,configurationRootInWorkspace:true,cppToolsExtensionInstalled:true,staleProviderReference:false,compilerPath:process.execPath})};const provider=new CpmProjectHealthProvider(h.workspaces,parser,installations,builds,ps,cpp,undefined,h.service);const item=provider.getChildren().find(x=>x.id==='remote-linux');assert(item);assert(item.description.includes('pi@raspberrypi'));});
 await test('SSH Device Manager keeps private key material outside CPM storage',()=>{const src=fs.readFileSync(path.join(__dirname,'..','src/services/cpmSshDeviceManager.ts'),'utf8');assert(src.includes('.ssh'));assert(src.includes('IdentityFile'));assert(!/privateKey\s*[:=]/i.test(src));});
 await test('Quick Actions exposes remote test, build/run and debug entry points',()=>{const src=fs.readFileSync(path.join(__dirname,'..','src/views/quickActionsView.ts'),'utf8');for(const c of ['cpm.openSshDeviceManager','cpm.remote.testConnection','cpm.remote.buildRun','cpm.remote.debug'])assert(src.includes(c),c);});
 console.log(`RESULT ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
