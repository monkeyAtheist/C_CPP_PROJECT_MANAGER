'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');
class Uri{constructor(fsPath){this.fsPath=fsPath;this.scheme='file';}static file(p){return new Uri(p)}}
const vscodeMock={window:{showErrorMessage:async()=>undefined,showInformationMessage:async()=>undefined,showQuickPick:async()=>undefined,showTextDocument:async()=>undefined},workspace:{openTextDocument:async(o)=>o,getConfiguration:()=>({get:(_k,f)=>f})},Uri};
const originalLoad=Module._load;Module._load=function(request,parent,isMain){if(request==='vscode')return vscodeMock;return originalLoad.call(this,request,parent,isMain)};
const root=path.resolve(__dirname,'..');
const pkg=require('../package.json');
const {CpmCMakeService}=require('../out/services/cpmCMakeService.js');
const {DEFAULT_CMAKE_CONFIGURATION,DEFAULT_EXTERNAL_DEPENDENCIES,DEFAULT_REMOTE_LINUX}=require('../out/services/cpmProjectSettingsService.js');
let passed=0,failed=0;async function test(name,fn){try{await fn();passed++;console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+': '+(e.stack||e))}}
(async()=>{
 await test('version is 0.2.79',()=>assert.strictEqual(pkg.version,'0.2.79'));
 await test('manifest exposes CMake backend commands',()=>{
   for(const id of ['cpm.selectBuildBackend','cpm.cmake.configure','cpm.cmake.openReport']) assert(pkg.contributes.commands.some(x=>x.command===id),id);
   assert(pkg.contributes.menus['view/title'].some(x=>x.command==='cpm.selectBuildBackend'));
 });
 await test('project settings default to direct backend with Ninja CMake configuration',()=>{
   assert.strictEqual(DEFAULT_CMAKE_CONFIGURATION.generator,'Ninja');
   assert.strictEqual(DEFAULT_CMAKE_CONFIGURATION.buildDirectory,'.cpm/cmake/${buildMode}');
   assert.strictEqual(DEFAULT_CMAKE_CONFIGURATION.configureBeforeBuild,true);
 });
 await test('real CMake/Ninja configure, File API target discovery and build work',async()=>{
   const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cpm0279-cmake-'));
   const prj=path.join(dir,'Demo.prj');fs.writeFileSync(prj,'[Project]\nName = Demo\n');
   fs.writeFileSync(path.join(dir,'main.cpp'),'#include <iostream>\nint main(){std::cout << "cmake-ok" << std::endl; return 0;}\n');
   fs.writeFileSync(path.join(dir,'CMakeLists.txt'),'cmake_minimum_required(VERSION 3.16)\nproject(Demo LANGUAGES CXX)\nadd_executable(Demo main.cpp)\n');
   const ref={index:0,relativePath:'Demo.prj',absolutePath:prj,name:'Demo',exists:true};
   const settingsObj={preBuildActions:[],buildBackend:'cmake',cmake:{...DEFAULT_CMAKE_CONFIGURATION},linkageMode:'dynamic',parallelJobs:2,useResponseFiles:true,precompiledHeadersEnabled:false,cPrecompiledHeader:'',cppPrecompiledHeader:'',unityBuildEnabled:false,unityBatchSize:8,customBuildActions:[],postBuildActions:[],dependencies:[],externalDependencies:JSON.parse(JSON.stringify(DEFAULT_EXTERNAL_DEPENDENCIES)),remoteLinux:JSON.parse(JSON.stringify(DEFAULT_REMOTE_LINUX)),run:{arguments:'',workingDirectory:'',environmentOptions:'',externalProcessPath:''},nativeBuildActions:false};
   const settings={getSettings:()=>settingsObj,getCpmConfigurationValue:(k,f)=>({buildMode:'debug',cCompilerPath:'gcc',cppCompilerPath:'g++'}[k]??f),setSettings() {}};
   const workspaces={activeProjectRef:ref,getProject:()=>({targetType:'Executable'}),refresh(){}};
   let log='';const output={appendLine:(s='')=>{log+=s+'\n'},append:(s='')=>{log+=s}};
   const service=new CpmCMakeService(workspaces,settings,output);
   assert.strictEqual(await service.configure(ref,true),true,log);
   const before=service.readTargets(ref);assert(before.some(t=>t.name==='Demo'&&t.type==='EXECUTABLE'),JSON.stringify(before));
   assert.strictEqual(await service.build(ref,false),true,log);
   const artifact=service.resolveArtifact(ref,'Executable');assert(artifact&&fs.existsSync(artifact),artifact+'\n'+log);
   const result=require('child_process').execFileSync(artifact,[],{encoding:'utf8'}).trim();assert.strictEqual(result,'cmake-ok');
   const snap=service.getHealthSnapshot(ref);assert(snap.cacheExists);assert.strictEqual(snap.activeGenerator,'Ninja');assert(snap.resolvedArtifact);
 });
 await test('BuildService routes CMake backend and resolves File API artifact',()=>{
   const src=fs.readFileSync(path.join(root,'src/services/cpmBuildService.ts'),'utf8');
   assert(src.includes("settings.buildBackend === 'cmake'"));
   assert(src.includes('this.cmake?.build(item, rebuild)'));
   assert(src.includes('this.cmake?.resolveArtifact(ref, targetType)'));
   assert(src.includes('this.cmake?.clean(ref)'));
 });
 await test('Build Settings expose backend, generator, target and dependency toolchain controls',()=>{
   const src=fs.readFileSync(path.join(root,'src/views/buildSettingsPanel.ts'),'utf8');
   for(const token of ['section-build-backend','cmakeGenerator','cmakeTarget','cmakeToolchainFile','cmakeUseDependencyToolchain','cpm.cmake.configure']) assert(src.includes(token),token);
 });
 await test('Project Health contains CMake backend checks',()=>{
   const src=fs.readFileSync(path.join(root,'src/providers/cpmProjectHealthProvider.ts'),'utf8');
   assert(src.includes("settings.buildBackend === 'cmake'"));assert(src.includes('CMakeLists.txt not found'));assert(src.includes('Multiple CMake targets'));
 });
 console.log(`RESULT ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
