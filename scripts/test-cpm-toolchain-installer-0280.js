const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      workspace: { getConfiguration: () => ({ get: (_k, fallback) => fallback, update: async () => undefined }) },
      window: {}, commands: {}, ConfigurationTarget: { Global: 1, Workspace: 2 }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-toolchains-'));
for (const env of ['ucrt64', 'mingw32']) {
  const bin = path.join(root, env, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const exe of ['gcc.exe', 'g++.exe', 'ar.exe', 'gdb.exe']) fs.writeFileSync(path.join(bin, exe), '');
}
process.env.CPM_TOOLCHAINS_ROOT = root;
process.env.MSYS2_ROOT = '';

const { CpmInstallationService } = require('../out/services/cpmInstallationService');
const service = new CpmInstallationService({ appendLine() {} });
const found = service.scanInstallations();
const compilerPaths = found.flatMap(x => [x.cCompilerExe, x.cppCompilerExe]).filter(Boolean).map(x => x.toLowerCase());
assert(compilerPaths.some(x => x.includes(path.join('ucrt64','bin').toLowerCase())), 'UCRT64 toolchain was not detected');
assert(compilerPaths.some(x => x.includes(path.join('mingw32','bin').toLowerCase())), 'MINGW32 toolchain was not detected');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
assert.equal(pkg.version, '0.2.81');
assert(pkg.contributes.commands.some(x => x.command === 'cpm.installSupportedToolchains'), 'installer command missing');

const viewTitle = pkg.contributes.menus['view/title'] || [];
assert(!viewTitle.some(x => x.command === 'cpm.selectBuildBackend' && String(x.when || '').includes('cpm.workspaceExplorer')), 'build backend selector must not be in the workspace toolbar');
const commandPalette = pkg.contributes.menus.commandPalette || [];
assert(commandPalette.some(x => x.command === 'cpm.selectBuildBackend' && x.when === 'false'), 'build backend quick selector should be hidden from the command palette');
const launcher = fs.readFileSync(path.join(__dirname, '..', 'setup', 'CPM-Setup-Launcher.go'), 'utf8');
assert(launcher.includes('go:embed CPM-Toolchain-Installer.ps1 c-cpp-project-manager-and-build-0.2.81.vsix'), 'single-file EXE bootstrapper does not embed the 0.2.81 payload');

const installer = fs.readFileSync(path.join(__dirname, '..', 'setup', 'CPM-Toolchain-Installer.ps1'), 'utf8');
for (const required of [
  'https://repo.msys2.org/distrib/msys2-x86_64-latest.exe',
  'mingw-w64-ucrt-x86_64-toolchain',
  'mingw-w64-i686-toolchain',
  'mingw-w64-i686-gdb',
  'mingw-w64-i686-make',
  "SetEnvironmentVariable('MSYS2_ROOT'",
  "SetEnvironmentVariable('CPM_TOOLCHAINS_ROOT'"
]) assert(installer.includes(required), `installer is missing: ${required}`);

assert(!installer.includes("Add-UserPathEntry (Join-Path $Root 'mingw32\\bin')"), '32-bit bin must not be added to PATH');
console.log(`CPM 0.2.81 toolchain/setup tests: PASS (${found.length} detected toolchain entries)`);
fs.rmSync(root, { recursive: true, force: true });
