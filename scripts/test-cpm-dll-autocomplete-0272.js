'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const state = { config: {}, explicit: new Set() };
class Position { constructor(line, character){ this.line=line; this.character=character; } }
class Range { constructor(start, end){ this.start=start; this.end=end; } }
class MarkdownString { constructor(value){ this.value=value; } }
class SignatureHelp { constructor(){ this.signatures=[]; this.activeSignature=0; this.activeParameter=0; } }
class SignatureInformation { constructor(label, documentation){ this.label=label; this.documentation=documentation; this.parameters=[]; } }
class ParameterInformation { constructor(label){ this.label=label; } }
class CompletionItem { constructor(label, kind){ this.label=label; this.kind=kind; } }
class SnippetString { constructor(value){ this.value=value; } }
class Uri { constructor(fsPath){ this.fsPath=fsPath; this.scheme='file'; } static file(p){ return new Uri(p); } }
const TextEdit = { insert:(position,newText)=>({position,newText}) };
const configApi = {
  get:(key,fallback)=>Object.prototype.hasOwnProperty.call(state.config,key)?state.config[key]:fallback,
  inspect:(key)=>({workspaceValue:state.explicit.has(key)?state.config[key]:undefined}),
  update:async()=>{}
};
const vscodeMock = {
  SymbolKind:{Function:11,Method:5,Constructor:8}, CompletionItemKind:{Function:3},
  workspace:{getConfiguration:()=>configApi, workspaceFolders:[{uri:Uri.file(process.cwd())}]},
  window:{showErrorMessage:async()=>undefined,showInformationMessage:async()=>undefined,showQuickPick:async()=>undefined,showOpenDialog:async()=>undefined,showSaveDialog:async()=>undefined,createWebviewPanel:()=>({onDidDispose(){},webview:{onDidReceiveMessage(){},html:''},reveal(){}})},
  commands:{executeCommand:async()=>undefined}, ConfigurationTarget:{Workspace:2,Global:1}, ViewColumn:{Active:1},
  Position,Range,MarkdownString,SignatureHelp,SignatureInformation,ParameterInformation,CompletionItem,SnippetString,TextEdit,Uri
};
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){ if(request==='vscode') return vscodeMock; return originalLoad.call(this,request,parent,isMain); };

const root=path.resolve(__dirname,'..');
const sym=require('../out/services/cpmSymbolService.js');
const { BuildSettingsPanel }=require('../out/views/buildSettingsPanel.js');
const { CpmBuildService }=require('../out/services/cpmBuildService.js');
const pkg=require('../package.json');
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+(e.stack||e));}}
function setProfile(profile){state.config.autocompleteProfile=profile;state.explicit.add('autocompleteProfile');}
function documentFor(text,filePath){const lines=text.split('\n');return{uri:{scheme:'file',fsPath:filePath},languageId:'cpp',lineCount:lines.length,lineAt:(n)=>({text:lines[n]||''}),getText(range){if(!range)return text;const off=(pos)=>{let n=0;for(let i=0;i<pos.line;i++)n+=lines[i].length+1;return n+pos.character;};return text.slice(off(range.start),off(range.end));}};}
function target(overrides={}){return{targetType:'Dynamic Link Library',outputPath:'build/Test.dll',applicationTitle:'',iconFile:'',windowIconFile:'',applyWindowIconAutomatically:false,runtimeSupport:'Full Runtime Support',runtimeBinding:'Shared',generateSourceDocumentation:'None',manifestEmbed:false,manifestPath:'',embedProjectUirs:false,generateMapFile:false,createConsoleApplication:false,embedTimestamp:false,usingLoadExternalModule:false,forcedModules:[],useDefaultImportLibBaseName:true,importLibBaseName:'',whereToCopyDll:'Do not copy',customDirectoryToCopyDll:'',useIviSubdirectoriesForImportLibraries:false,useVxiPnpSubdirectoriesForImportLibraries:false,dllExports:'Include File Symbols',exportFiles:[],addTypeLibToDll:false,includeTypeLibHelpLinks:false,tlbHelpStyle:'HLP',typeLibFpFile:'',addNiTypeInfoToDll:false,useSingleHeaderForNiTypeInfo:false,singleHeaderNiTypeInfoFile:'',versionInfo:{numericFileVersion:'1,0,0,0',numericProductVersion:'1,0,0,0',comments:'',companyName:'',fileDescription:'',fileVersion:'',internalName:'',legalCopyright:'',legalTrademarks:'',originalFilename:'',privateBuild:'',productName:'',productVersion:'',specialBuild:''},signing:{enabled:false,store:'',certificate:'',timestampUrl:'',descriptionUrl:'',signDebugBuild:false},...overrides};}
function compilerValue(key,fallback){return fallback;}

(async()=>{
 await test('version is 0.2.84',()=>assert.strictEqual(pkg.version,'0.2.84'));
 await test('autocomplete profile manifest exists',()=>{const p=pkg.contributes.configuration.properties['cpm.autocompleteProfile'];assert(p);assert.strictEqual(p.default,'hybrid');assert.deepStrictEqual(p.enum,['hybrid','native','nativeSignature','standardAssist','custom']);});
 await test('profile resolver mirrors advanced CVI-style modes',()=>{assert.deepStrictEqual(sym.resolveAutocompleteProfile('nativeSignature'),{profile:'nativeSignature',completionEnabled:false,includeProjectCompletion:false,includeStandardCompletion:false,signatureHelpEnabled:true});assert.deepStrictEqual(sym.resolveAutocompleteProfile('standardAssist'),{profile:'standardAssist',completionEnabled:true,includeProjectCompletion:false,includeStandardCompletion:true,signatureHelpEnabled:true});});
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cpm0272-'));
 const hdr=path.join(temp,'api.hpp');fs.writeFileSync(hdr,'int compute(int a, double b);\n','utf8');
 const ref={exists:true,absolutePath:path.join(temp,'Test.prj'),name:'Test',index:1};fs.writeFileSync(ref.absolutePath,'','utf8');
 const ws={currentWorkspace:{path:path.join(temp,'Test.cws'),projects:[ref]},activeProjectRef:ref,getProject:()=>({files:[{absolutePath:hdr}]})};
 const symbols=new sym.CpmSymbolService(root,ws);const completion=new sym.CpmCompletionProvider(symbols);const signature=new sym.CpmSignatureHelpProvider(symbols);const doc=documentFor('compute(',hdr);
 await test('hybrid completion includes project symbols',()=>{setProfile('hybrid');const items=completion.provideCompletionItems(doc)||[];assert(items.some(x=>x.label==='compute'));});
 await test('native profile withdraws CPM completion/signature',()=>{setProfile('native');assert.strictEqual(completion.provideCompletionItems(doc),undefined);assert.strictEqual(signature.provideSignatureHelp(doc,new Position(0,8)),undefined);});
 await test('nativeSignature keeps immediate project signature help',()=>{setProfile('nativeSignature');const help=signature.provideSignatureHelp(doc,new Position(0,8));assert(help);assert.strictEqual(help.signatures[0].parameters.length,2);});
 await test('standardAssist can suggest printf when stdio is missing',()=>{setProfile('standardAssist');const stdDoc=documentFor('pri',path.join(temp,'main.c'));stdDoc.languageId='c';ws.getProject=()=>({files:[{absolutePath:hdr},{absolutePath:stdDoc.uri.fsPath}]});fs.writeFileSync(stdDoc.uri.fsPath,'pri','utf8');symbols.invalidateProjectCache();const items=completion.provideCompletionItems(stdDoc)||[];assert(items.some(x=>x.label==='printf'));});
 await test('build settings render Program name for DLL and autocomplete page',()=>{
   setProfile('hybrid');
   const parser={getNativeTargetSettings:()=>target()};
   const settings={getSettings:()=>({preBuildActions:[],linkageMode:'dynamic',customBuildActions:[],postBuildActions:[],dependencies:[],run:{arguments:'--mode test',workingDirectory:'run',environmentOptions:'X=1',externalProcessPath:'tools/host.exe'}}),dependencyKey:()=>'',getCpmConfigurationValue:compilerValue};
   const workspaces={activeProjectRef:ref,getProject:()=>({files:[]}),currentWorkspace:{projects:[ref]}};
   const html=new BuildSettingsPanel(workspaces,parser,settings).render(ref);
   assert(html.includes("pathField('Program name'" )===false); // rendered HTML, not source expression
   assert(html.includes('Program name'));
   assert(html.includes('tools/host.exe'));
   assert(html.includes('Autocompletion'));
   assert(html.includes('Native + CPM Signature Help'));
   const script=html.match(/<script>([\s\S]*?)<\/script>/)[1]; new Function(script);
 });
 await test('DLL runtime helpers resolve relative hosts and preserve custom debug environment',()=>{
   const service=new CpmBuildService({}, {}, {}, {}, {}, {}, {}, {}, {});
   const base=path.join(temp,'project');
   assert.strictEqual(service.resolveRuntimeReference ? typeof service.resolveRuntimeReference : typeof service['resolveRuntimeReference'],'function');
   const resolved=service['resolveRuntimeReference']('tools/host.exe',base);
   assert.strictEqual(resolved,path.resolve(base,'tools/host.exe'));
   const custom={...process.env,CPM_DLL_TEST_ENV:'enabled'};
   custom.PATH=(process.env.PATH||'')+path.delimiter+path.join(base,'runtime');
   const entries=service['debugEnvironmentFromProcessEnv'](custom);
   assert(entries.some(x=>x.name==='CPM_DLL_TEST_ENV'&&x.value==='enabled'));
   assert(entries.some(x=>x.name.toLowerCase()==='path'&&x.value===custom.PATH));
 });
 await test('run/debug source supports DLL host and opens settings when missing',()=>{const src=fs.readFileSync(path.join(root,'src/services/cpmBuildService.ts'),'utf8');assert(src.includes("targetType === 'Dynamic Link Library'"));assert(src.includes('Configure Program name'));assert(src.includes("vscode.commands.executeCommand('cpm.editBuildSettings'"));assert(src.includes("'Debug'") && src.includes('via ${path.basename(program)}'));assert(!/VS Code debugger launch is available only for executable targets/.test(src));});
 await test('profile selector command is contributed and registered',()=>{assert(pkg.contributes.commands.some(x=>x.command==='cpm.selectAutocompleteProfile'));const src=fs.readFileSync(path.join(root,'src/extension.ts'),'utf8');assert(src.includes("register('cpm.selectAutocompleteProfile'"));assert(src.includes('CpmSignatureHelpProvider'));});
 console.log(`RESULT ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
