'use strict';
/** Offline regression tests for CPM project linkage and terminal ownership. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm109-regression-'));
const fakeVscode = {
  workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
  window: {
    terminals: [],
    onDidCloseTerminal: () => ({ dispose() {} }),
    onDidOpenTerminal: () => ({ dispose() {} }),
  },
};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return fakeVscode;
  return originalLoad.apply(this, arguments);
};

try {
  const { CpmProjectSettingsService } = require('../out/services/cpmProjectSettingsService');
  const { CpmBuildService } = require('../out/services/cpmBuildService');
  const outputLines = [];
  const output = { appendLine: text => outputLines.push(text) };
  const projectRef = { name: 'Project DLL', absolutePath: path.join(root, 'host.prj'), exists: true, index: 0 };
  const workspaces = { currentWorkspace: { path: path.join(root, 'workspace.cpm'), projects: [projectRef] }, activeProjectRef: projectRef };
  const parser = { getProjectBuildActions: () => ({ nativeSectionsPresent: false }) };
  const settings = new CpmProjectSettingsService(workspaces, parser, output);

  // A new project, and an older project without an explicit linkage setting,
  // must both use the static compiler runtime by default.
  assert.equal(settings.getSettings(projectRef).linkageMode, 'static-runtime');
  const projectKey = 'host.prj';
  const file = path.join(root, '.vscode', 'cpm-build.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const store = value => fs.writeFileSync(file, JSON.stringify({ version: 1, projects: { [projectKey]: value } }));
  store({});
  assert.equal(settings.getSettings(projectRef).linkageMode, 'static-runtime', 'legacy project with unspecified mode');
  store({ linkageMode: 'dynamic' });
  assert.equal(settings.getSettings(projectRef).linkageMode, 'dynamic', 'persisted Dynamic mode must not be overwritten');
  store({ linkageMode: 'static' });
  assert.equal(settings.getSettings(projectRef).linkageMode, 'static', 'persisted Fully static mode must not be overwritten');
  store({ linkageMode: 'static-runtime' });
  assert.equal(settings.getSettings(projectRef).linkageMode, 'static-runtime');

  const service = new CpmBuildService(parser, workspaces, null, settings, null,
    output, output, output, { clear() {} });
  assert.deepEqual(service.runtimeLinkFlags({}, 'Executable', undefined, 'static-runtime'), ['-static-libgcc', '-static-libstdc++']);
  assert.deepEqual(service.runtimeLinkFlags({}, 'Executable', undefined, 'dynamic'), []);
  assert.deepEqual(service.runtimeLinkFlags({}, 'Static Library', undefined, 'static-runtime'), []);

  let closed = 0;
  function terminal(name) {
    return { name, dispose() { closed += 1; fakeVscode.window.terminals = fakeVscode.window.terminals.filter(t => t !== this); } };
  }
  const oldRun1 = terminal('CPM Run: target A');
  const oldRun2 = terminal('CPM Run: target B');
  const userTerminal = terminal('PowerShell');
  const buildTerminal = terminal('CPM Build');
  const debuggerTerminal = terminal('cppdbg: target A');
  fakeVscode.window.terminals.push(oldRun1, oldRun2, userTerminal, buildTerminal, debuggerTerminal);
  service.runTerminals.add(oldRun1);
  service.runTerminals.add(oldRun2);

  let childTerminated = 0;
  const child = { pid: undefined, killed: false, exitCode: null, signalCode: null, kill() { childTerminated++; this.killed = true; } };
  service.managedRunProcesses.add(child);
  service.stopPreviousInteractiveRuns('Run');
  assert.equal(closed, 2, 'all previous CPM Run terminals must be disposed');
  assert.equal(childTerminated, 1, 'previous Program Output child must be stopped');
  assert.deepEqual(fakeVscode.window.terminals.map(t => t.name), ['PowerShell', 'CPM Build', 'cppdbg: target A']);
  assert.equal(service.runTerminals.size, 0);

  const oldRunDebug = terminal('CPM Run: target C');
  fakeVscode.window.terminals.push(oldRunDebug);
  service.stopPreviousInteractiveRuns('Debug');
  assert.equal(closed, 3, 'Debug must clean previous Run tabs');
  assert.equal(fakeVscode.window.terminals.length, 3, 'unrelated terminals retained');
  service.dispose();
  console.log('PASS: static-runtime defaults and explicit saved linkage modes');
  console.log('PASS: Run/Debug replace previous CPM Run terminals');
  console.log('PASS: managed output processes stopped; user/Build/Debugger terminals left alone');
} finally {
  Module._load = originalLoad;
  fs.rmSync(root, { recursive: true, force: true });
}
