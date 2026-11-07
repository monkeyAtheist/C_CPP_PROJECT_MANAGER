const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const pkg = JSON.parse(read('package.json'));
for (const id of ['cpm.runDebug', 'cpm.runDebugProject']) {
  const cmd = pkg.contributes.commands.find(c => c.command === id);
  assert(cmd, `missing command ${id}`);
  assert(cmd.icon === '$(debug-alt)', `${id} must use $(debug-alt), got ${cmd.icon}`);
}

const srcBuild = read('src/services/cpmBuildService.ts');
assert(srcBuild.includes("$(debug-alt) Run Debug"), 'Run Options Run Debug must use debug-alt');
assert(!srcBuild.includes("$(debug-start) Run Debug"), 'Run Options still contains debug-start');

const srcQuick = read('src/views/quickActionsView.ts');
assert(srcQuick.includes("action('Run Debug', 'cpm.runDebug', 'debug-alt')"), 'Quick Actions Run Debug must use debug-alt');

const srcExt = read('src/extension.ts');
assert(srcExt.includes("createStatusBarAction('$(debug-alt)', 'Run Debug without rebuilding'"), 'status bar Run Debug must use debug-alt');

const outBuild = read('out/services/cpmBuildService.js');
const outQuick = read('out/views/quickActionsView.js');
const outExt = read('out/extension.js');
assert(outBuild.includes("$(debug-alt) Run Debug"), 'published Run Options JS must use debug-alt');
assert(outQuick.includes("action('Run Debug', 'cpm.runDebug', 'debug-alt')"), 'published Quick Actions JS must use debug-alt');
assert(outExt.includes("createStatusBarAction('$(debug-alt)', 'Run Debug without rebuilding'"), 'published status bar JS must use debug-alt');

console.log('CPM 0.2.82 debug icon consistency: PASS');
