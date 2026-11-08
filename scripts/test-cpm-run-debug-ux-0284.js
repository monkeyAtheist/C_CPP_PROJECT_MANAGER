'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const command = id => pkg.contributes.commands.find(c => c.command === id);

assert.strictEqual(pkg.version, '0.2.84');
for (const [id, title] of [
  ['cpm.run', 'Run'],
  ['cpm.runDebug', 'Debug'],
  ['cpm.buildAndRun', 'Build & Run'],
  ['cpm.debugWithGdb', 'Build & Debug'],
  ['cpm.executeProject', 'Run'],
  ['cpm.runDebugProject', 'Debug'],
  ['cpm.buildAndRunProject', 'Build & Run'],
  ['cpm.debugProjectWithGdb', 'Build & Debug'],
]) {
  const c = command(id);
  assert(c, `missing command ${id}`);
  assert.strictEqual(c.title, title, `${id} title mismatch`);
  assert.strictEqual(c.category, 'C/C++ Project Manager', `${id} must be categorized`);
}
assert.strictEqual(command('cpm.runDebug').icon, '$(debug-alt)');
assert.strictEqual(command('cpm.run').icon, '$(play)');

const ext = read('src/extension.ts');
assert(ext.includes("register('cpm.run', () => builds.runWithoutBuild())"), 'Run must not build first');
assert(ext.includes("register('cpm.executeProject', (node?: ProjectNode) => node ? builds.runWithoutBuild(node.ref) : undefined)"), 'project Run must not build first');
assert(ext.includes("register('cpm.buildAndRunProject', (node?: ProjectNode) => node ? builds.buildAndRun(node.ref) : undefined)"), 'project Build & Run missing');
assert(ext.includes("register('cpm.chooseRunAction', (node?: ProjectNode) => builds.chooseRunAction(node?.ref))"), 'context Run Options must target clicked project');

const build = read('src/services/cpmBuildService.ts');
for (const label of ["$(play) Run", "$(debug-alt) Debug", "$(run-all) Build & Run", "$(debug-alt) Build & Debug"]) {
  assert(build.includes(label), `Run Options missing ${label}`);
}
assert(!build.includes("$(run) Run without build"), 'old Run without build label still visible');
assert(!build.includes("$(debug-alt) Run Debug"), 'old Run Debug label still visible');

const home = read('src/views/homePanel.ts');
assert(home.includes('>Run</button>'));
assert(home.includes('>Debug</button>'));
assert(home.includes('>Build &amp; Run</button>'));
assert(home.includes('>Build &amp; Debug</button>'));
assert(!home.includes('Build + run'));
assert(!home.includes('Build + debug'));

const quick = read('src/views/quickActionsView.ts');
assert(quick.includes("action('Run', 'cpm.run', 'run')"));
assert(quick.includes("action('Debug', 'cpm.runDebug', 'debug-alt')"));
assert(quick.includes("action('Build & Run', 'cpm.buildAndRun', 'play')"));
assert(quick.includes("action('Build & Debug', 'cpm.debugWithGdb', 'debug-alt-small')"));

const context = pkg.contributes.menus['view/item/context'].filter(m => ['cpm.executeProject','cpm.runDebugProject','cpm.buildAndRunProject','cpm.debugProjectWithGdb'].includes(m.command));
assert.deepStrictEqual(context.map(x => x.command), ['cpm.executeProject','cpm.runDebugProject','cpm.buildAndRunProject','cpm.debugProjectWithGdb']);

console.log('CPM 0.2.84 Run/Debug UX consistency: PASS');
