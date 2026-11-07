'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const cp=require('child_process');
const Module=require('module');

class Uri { constructor(fsPath){ this.fsPath=fsPath; this.scheme='file'; } static file(p){ return new Uri(p); } }
class Range { constructor(){} }
const vscodeMock={
  SymbolKind:{Function:11,Method:5,Constructor:8},CompletionItemKind:{Function:3},
  window:{showErrorMessage:async()=>undefined,showInformationMessage:async()=>undefined,showQuickPick:async()=>undefined,showOpenDialog:async()=>undefined,showSaveDialog:async()=>undefined,createOutputChannel:()=>({appendLine(){},append(){},show(){}}),createWebviewPanel:()=>({onDidDispose(){},webview:{onDidReceiveMessage(){},html:''},reveal(){}})},
  workspace:{getConfiguration:()=>({get:(_k,f)=>f,update:async()=>{},inspect:()=>({})}),workspaceFolders:[{uri:Uri.file(process.cwd())}],getWorkspaceFolder:()=>undefined},
  commands:{executeCommand:async()=>undefined},debug:{startDebugging:async()=>true},ConfigurationTarget:{Workspace:2,Global:1},ViewColumn:{Active:1},Uri,Range,DiagnosticSeverity:{Warning:1,Error:0}
};
const originalLoad=Module._load;Module._load=function(request,parent,isMain){if(request==='vscode')return vscodeMock;return originalLoad.call(this,request,parent,isMain);};

const root=path.resolve(__dirname,'..');
const build=require('../out/services/cpmBuildService.js');
const rsp=require('../out/services/cpmGnuResponseFile.js');
const cleanup=require('../out/services/cpmBuildCleanup.js');
const {BuildSettingsPanel}=require('../out/views/buildSettingsPanel.js');
const pkg=require('../package.json');
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+(e.stack||e));}}

(async()=>{
  await test('version is 0.2.79',()=>assert.strictEqual(pkg.version,'0.2.79'));
  await test('GNU response threshold protects Windows command lines',()=>{
    assert.strictEqual(rsp.shouldUseGnuResponseFile(['-o','a.exe'],'win32'),false);
    assert.strictEqual(rsp.shouldUseGnuResponseFile(['x'.repeat(25000)],'win32'),true);
    assert.strictEqual(rsp.normalizeGnuResponseArgument('C:\\build\\file.o'),'C:/build/file.o');
  });
  await test('GNU response file can drive a real GCC link',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cpm0274-rsp-'));
    const src=path.join(dir,'main.c'),obj=path.join(dir,'main.o'),exe=path.join(dir,'app');
    fs.writeFileSync(src,'int main(void){return 0;}\n');
    cp.execFileSync('gcc',['-c',src,'-o',obj]);
    const response=path.join(dir,'link.rsp');
    const args=rsp.createGnuResponseFileArguments([obj,'-o',exe],response);
    cp.execFileSync('gcc',args);
    assert(fs.existsSync(exe));
  });
  await test('GCC dependency file invalidates object when included header changes',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cpm0274-dep-'));
    const hdr=path.join(dir,'value.h'),src=path.join(dir,'main.c'),obj=path.join(dir,'main.o'),dep=build.dependencyPathForObject(obj);
    fs.writeFileSync(hdr,'#define VALUE 1\n');
    fs.writeFileSync(src,'#include "value.h"\nint value(void){return VALUE;}\n');
    cp.execFileSync('gcc',['-c',src,'-MMD','-MP','-MF',dep,'-MT',obj,'-o',obj],{cwd:dir});
    assert(fs.existsSync(dep));
    assert(build.readGnuDependencyFile(dep,dir).some(x=>path.normalize(x)===path.normalize(hdr)));
    assert.strictEqual(build.sourceNeedsCompilation(src,obj,dir,false),false);
    const future=new Date(Date.now()+3000);fs.utimesSync(hdr,future,future);
    assert.strictEqual(build.sourceNeedsCompilation(src,obj,dir,false),true);
  });
  await test('dependency parser handles MinGW escaped drive colon and spaces',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cpm0274-win-dep-'));const dep=path.join(dir,'x.o.d');
    fs.writeFileSync(dep,'C\\:/build/x.o: C\\:/work/main.c C\\:/work/My\\ Header/value.h\nC\\:/work/My\\ Header/value.h:\n','utf8');
    const values=build.readGnuDependencyFile(dep,dir);
    assert(values.includes(path.normalize('C:/work/main.c')));
    assert(values.includes(path.normalize('C:/work/My Header/value.h')));
  });
  await test('missing dependency file triggers safe recompile',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cpm0274-missing-'));const src=path.join(dir,'x.c'),obj=path.join(dir,'x.o');
    fs.writeFileSync(src,'int x;');fs.writeFileSync(obj,'object');const past=new Date(Date.now()-5000),now=new Date();fs.utimesSync(src,past,past);fs.utimesSync(obj,now,now);
    assert.strictEqual(build.sourceNeedsCompilation(src,obj,dir,false),true);
  });
  await test('parallel worker respects requested concurrency',async()=>{
    let active=0,maxActive=0,done=0;
    const ok=await build.runWithConcurrency([1,2,3,4,5,6],2,async()=>{active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,25));active--;done++;return true;});
    assert(ok);assert.strictEqual(done,6);assert(maxActive<=2);assert(maxActive>=2);
  });
  await test('robust clean atomically removes build directory',async()=>{
    const parent=fs.mkdtempSync(path.join(os.tmpdir(),'cpm0274-clean-'));const dir=path.join(parent,'obj');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'a.o'),'x');
    const result=await cleanup.cleanCpmBuildDirectory(dir,3,10);assert(result.success);assert(!fs.existsSync(dir));assert(['rename','in-place'].includes(result.strategy));
  });
  await test('build settings expose QPM-style build engine controls',()=>{
    const ref={exists:true,absolutePath:path.join(os.tmpdir(),'BuildEngine.prj'),name:'BuildEngine',index:1};
    const workspaces={activeProjectRef:ref,getProject:()=>({files:[]}),currentWorkspace:{projects:[ref]}};
    const parser={getNativeTargetSettings:()=>({targetType:'Executable',outputPath:'build/App.exe',applicationTitle:'',iconFile:'',windowIconFile:'',applyWindowIconAutomatically:false})};
    const settings={getSettings:()=>({preBuildActions:[],linkageMode:'dynamic',parallelJobs:0,useResponseFiles:true,customBuildActions:[],postBuildActions:[],dependencies:[],run:{arguments:'',workingDirectory:'',environmentOptions:'',externalProcessPath:''}}),dependencyKey:()=>'',getCpmConfigurationValue:(_k,f)=>f};
    const html=new BuildSettingsPanel(workspaces,parser,settings).render(ref);
    assert(html.includes('Parallel jobs (0 = automatic)'));assert(html.includes('Use GNU response files automatically'));assert(html.includes('Exact header dependency tracking'));new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  });
  await test('compiler command writes GCC/Clang dependency files',()=>{
    const src=fs.readFileSync(path.join(root,'src/services/cpmBuildService.ts'),'utf8');
    assert(src.includes("'-MMD', '-MP', '-MF', dependencyPath, '-MT', objectPath"));
    assert(src.includes('runWithConcurrency(compileItems, parallelJobs'));
    assert(src.includes("'cpm_link.rsp'"));
    assert(src.includes('cleanCpmBuildDirectory(modeDirectory)'));assert(src.includes('cleanCpmBuildDirectory(buildModeDirectory)'));
  });
  console.log(`RESULT ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
