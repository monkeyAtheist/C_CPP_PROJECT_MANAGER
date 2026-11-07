'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');

class EventEmitter{constructor(){this.event=()=>({dispose(){}});}fire(){}dispose(){}}
class TreeItem{constructor(label,state){this.label=label;this.collapsibleState=state;}}
class ThemeIcon{constructor(id){this.id=id;}}
const vscodeMock={
  EventEmitter,TreeItem,ThemeIcon,TreeItemCollapsibleState:{None:0},
  workspace:{
    getConfiguration:()=>({get:(k,f)=>k==='autocompleteProfile'?'hybrid':f}),
    openTextDocument:async()=>({}),
  },
  window:{showTextDocument:async()=>{},showInformationMessage:async()=>{},showQuickPick:async()=>undefined},
  commands:{executeCommand:async()=>undefined}
};
const originalLoad=Module._load;Module._load=function(request,parent,isMain){if(request==='vscode')return vscodeMock;return originalLoad.call(this,request,parent,isMain);};

const root=path.resolve(__dirname,'..');
const {CpmProjectHealthProvider,resolveConfiguredPath,architectureWarning}=require('../out/providers/cpmProjectHealthProvider.js');
const pkg=require('../package.json');
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+(e.stack||e));}}
function makeProvider(overrides={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cpm0275-health-'));
  const prj=path.join(dir,'Demo.prj');fs.writeFileSync(prj,'[Project Header]\n','utf8');
  const src=path.join(dir,'main.cpp');fs.writeFileSync(src,'int main(){return 0;}\n','utf8');
  const ref={index:1,relativePath:'Demo.prj',absolutePath:prj,name:'Demo',exists:true};
  const workspace={path:path.join(dir,'Demo.cws'),name:'Demo',activeProjectIndex:1,projects:[ref]};fs.writeFileSync(workspace.path,'[Workspace Header]\n','utf8');
  const project={path:prj,name:'Demo',targetType:'Executable',folders:[],files:[{sectionName:'File 1',id:1,type:'C Source',folder:'',absolutePath:src,excluded:false,compileIntoObjectFile:true,exists:true}]};
  const settings={preBuildActions:[],linkageMode:'dynamic',parallelJobs:0,useResponseFiles:true,customBuildActions:[],postBuildActions:[],dependencies:[],run:{arguments:'',workingDirectory:'',environmentOptions:'',externalProcessPath:''},nativeBuildActions:true};
  const build={buildMode:'debug',linkageMode:'dynamic',targetPath:path.join(dir,'build','Demo.exe'),targetExists:false,objectDirectory:path.join(dir,'build','Demo','debug','obj'),cCompilerPath:'gcc',cppCompilerPath:'g++',archiverPath:'ar',debuggerPath:'gdb',outputDirectory:'build',architectureMode:'auto',includePaths:[],libraryPaths:[],libraries:[],parallelJobs:0,useResponseFiles:true,externalRuntimeDlls:[],systemRuntimeDlls:[]};
  const workspaces={currentWorkspace:workspace,activeProjectRef:ref,getProject:()=>project,onDidChange:()=>({dispose(){}})};
  const parser={inspectWorkspaceCompatibility:()=>[],getNativeTargetSettings:()=>({iconFile:'',windowIconFile:''})};
  const installations={getActiveInstallation:()=>({label:'GCC',cCompilerExe:process.execPath,cppCompilerExe:process.execPath,archiverExe:process.execPath,debuggerExe:process.execPath})};
  const builds={buildMode:'debug',getHealthSnapshot:()=>build};
  const projectSettings={getSettings:()=>settings,getBuildOrder:()=>[ref],dependencyKey:(x)=>x.relativePath.toLowerCase()};
  const cppTools={getHealthSnapshot:()=>({configurationRoot:dir,configurationPath:path.join(dir,'.vscode','c_cpp_properties.json'),configurationExists:true,managedConfigurationPresent:true,configurationRootInWorkspace:true,cppToolsExtensionInstalled:true,staleProviderReference:false,compilerPath:process.execPath})};
  Object.assign(workspaces,overrides.workspaces||{});Object.assign(parser,overrides.parser||{});Object.assign(installations,overrides.installations||{});Object.assign(builds,overrides.builds||{});Object.assign(projectSettings,overrides.projectSettings||{});Object.assign(cppTools,overrides.cppTools||{});
  if(overrides.project)Object.assign(project,overrides.project);
  if(overrides.settings)Object.assign(settings,overrides.settings);
  if(overrides.build)Object.assign(build,overrides.build);
  return new CpmProjectHealthProvider(workspaces,parser,installations,builds,projectSettings,cppTools);
}

(async()=>{
  await test('version is 0.2.79',()=>assert.strictEqual(pkg.version,'0.2.79'));
  await test('Project Health view and commands are contributed',()=>{
    assert(pkg.contributes.views.cpm.some(v=>v.id==='cpm.projectHealth'));
    for(const c of ['cpm.refreshProjectHealth','cpm.openProjectHealthReport','cpm.repairProjectHealth'])assert(pkg.contributes.commands.some(x=>x.command===c));
  });
  await test('healthy project exposes core health checks',()=>{
    const items=makeProvider().getChildren();
    for(const id of ['project','files','dependencies','toolchain','architecture','search-paths','build-engine','linkage','artifact','run-profile','debugger','intellisense'])assert(items.some(x=>x.id===id),id);
    assert(!items.some(x=>x.severity==='error'));
  });
  await test('missing registered file is an error and repair opens project file',()=>{
    const provider=makeProvider({project:{files:[{sectionName:'File 1',id:1,type:'C Source',folder:'',absolutePath:path.join(os.tmpdir(),'does-not-exist.cpp'),excluded:false,compileIntoObjectFile:true,exists:false}]}});
    const item=provider.getChildren().find(x=>x.id==='files');assert(item);assert.strictEqual(item.severity,'error');assert.strictEqual(item.command.command,'cpm.openActiveProjectFile');
  });
  await test('DLL host misconfiguration and stale IntelliSense are repairable warnings',()=>{
    const provider=makeProvider({project:{targetType:'Dynamic Link Library'},settings:{run:{arguments:'',workingDirectory:'',environmentOptions:'',externalProcessPath:'missing-host.exe'}},cppTools:{getHealthSnapshot:()=>({configurationRoot:'x',configurationPath:'x/.vscode/c_cpp_properties.json',configurationExists:true,managedConfigurationPresent:true,configurationRootInWorkspace:true,cppToolsExtensionInstalled:true,staleProviderReference:true})}});
    const items=provider.getChildren();
    const host=items.find(x=>x.id==='run-profile');assert.strictEqual(host.severity,'warning');assert.strictEqual(host.command.command,'cpm.editBuildSettings');
    const intel=items.find(x=>x.id==='intellisense');assert.strictEqual(intel.severity,'warning');assert.strictEqual(intel.command.command,'cpm.repairCppToolsProvider');
  });
  await test('fully static build reports remaining external DLLs',()=>{
    const provider=makeProvider({build:{linkageMode:'static',targetExists:true,externalRuntimeDlls:['libusb-1.0.dll']}});
    const item=provider.getChildren().find(x=>x.id==='linkage');assert.strictEqual(item.severity,'warning');assert.strictEqual(item.command.command,'cpm.inspectRuntimeDependencies');
  });
  await test('architecture helper detects obvious 32/64 mismatch',()=>{
    assert(architectureWarning('debug64','from-build-mode','C:/msys64/mingw32/bin/g++.exe'));
    assert.strictEqual(architectureWarning('release64','from-build-mode','C:/msys64/mingw64/bin/g++.exe'),undefined);
  });
  await test('configured path resolver handles relative paths',()=>{
    const base=path.join(os.tmpdir(),'cpm-project');assert.strictEqual(resolveConfiguredPath('include',base),path.resolve(base,'include'));
  });
  await test('extension registers health refresh/report/repair and workspace compatibility repair',()=>{
    const src=fs.readFileSync(path.join(root,'src/extension.ts'),'utf8');
    for(const c of ["register('cpm.refreshProjectHealth'","register('cpm.openProjectHealthReport'","register('cpm.repairProjectHealth'","register('cpm.repairWorkspaceCompatibility'"])assert(src.includes(c),c);
  });
  console.log(`RESULT ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
