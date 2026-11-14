// CPM — Home page client. The extension sends the full HomeState; this script redraws the page in place.
(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  let state = window.CPM_HOME_INIT || {};
  const app = document.getElementById('app');

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const base = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
  const dir = (p) => { const parts = String(p || '').split(/[\\/]/); parts.pop(); return parts.join(p && p.includes('\\') ? '\\' : '/'); };
  function ago(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    const days = Math.round(s / 86400);
    return days === 1 ? 'yesterday' : days < 30 ? days + ' days ago' : new Date(ts).toLocaleDateString();
  }
  const duration = (ms) => ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s';

  // Small stroke icons (16×16), coloured with currentColor so they follow the theme.
  const ICONS = {
    folder: '<path d="M1.5 4.5v8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3.5h-4a1 1 0 0 0-1 1z"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    play: '<path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none"/>',
    bug: '<rect x="5" y="5" width="6" height="8" rx="3"/><path d="M8 5V3.5M6 3.2l.8 1.8M10 3.2l-.8 1.8M5 8H2.5M13.5 8H11M5 11H3M13 11h-2"/>',
    tools: '<path d="M2.5 13.5l6-6"/><path d="M8.2 2.6a3.2 3.2 0 0 0 4.2 4.2l-1.6 1.6-3.2-3.2z"/>',
    gear: '<circle cx="8" cy="8" r="2.3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
    library: '<path d="M3 2.5h7.5A1.5 1.5 0 0 1 12 4v9.5H4.5A1.5 1.5 0 0 1 3 12z"/><path d="M3 12a1.5 1.5 0 0 1 1.5-1.5H12"/>',
    file: '<path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5z"/><path d="M9 1.5v4h4M6.5 8.5L5 10l1.5 1.5M9.5 8.5L11 10l-1.5 1.5"/>',
    snippet: '<path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4"/>',
    templates: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><path d="M11.5 9v5M9 11.5h5"/>',
    plug: '<path d="M5.5 1.5v3M10.5 1.5v3M4 4.5h8v3a4 4 0 0 1-8 0zM8 11.5v3"/>',
    network: '<circle cx="8" cy="8" r="1.4"/><path d="M5.2 5.2a4 4 0 0 0 0 5.6M10.8 5.2a4 4 0 0 1 0 5.6M3.2 3.2a6.8 6.8 0 0 0 0 9.6M12.8 3.2a6.8 6.8 0 0 1 0 9.6"/>',
    chip: '<rect x="4" y="4" width="8" height="8" rx="1"/><path d="M6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5"/>',
    terminal: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4.5 6l2 2-2 2M8.5 10.5h3"/>',
    check: '<path d="M3 8.5l3 3 7-7"/>',
    cross: '<path d="M4 4l8 8M12 4l-8 8"/>',
    warning: '<path d="M8 2l6.5 11.5h-13z"/><path d="M8 6.5v3M8 11.3v.4"/>',
    clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>',
    close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>'
  };
  const icon = (name, cls) => '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  const cmd = (command, label, cls, extra) => '<button type="button" class="' + (cls || '') + '" data-cmd="' + esc(command) + '"' + (extra || '') + '>' + label + '</button>';

  function header() {
    return '<header class="home-header"><div class="brand"><div class="brand-mark">CPM</div><div><h1>C/C++ Project Manager</h1><p class="muted">Create, build, run and debug C/C++ workspaces with GCC, MinGW, Clang or another toolchain.</p></div></div>'
      + '<div class="header-actions">' + cmd('cpm.openWorkspace', icon('folder') + 'Open…', 'secondary', ' title="Open a .cws workspace or .prj project"') + cmd('cpm.createWorkspaceProject', icon('plus') + 'New workspace…', 'secondary') + '</div></header>';
  }

  function buildStatus() {
    const b = state.lastBuild;
    const p = state.problems || { errors: 0, warnings: 0 };
    let line;
    if (!b) line = '<span class="build-state none">' + icon('clock') + 'Not built during this session</span>';
    else if (b.success) line = '<span class="build-state ok">' + icon('check') + (b.rebuild ? 'Rebuild' : 'Build') + ' succeeded</span><span class="muted">' + esc(b.project) + ' · ' + esc(ago(b.finishedAt)) + ' · ' + esc(duration(b.durationMs)) + '</span>';
    else line = '<span class="build-state fail">' + icon('cross') + (b.rebuild ? 'Rebuild' : 'Build') + ' failed</span><span class="muted">' + esc(b.failedAt ? b.failedAt + ' · ' : '') + esc(ago(b.finishedAt)) + '</span>';
    const problems = (p.errors || p.warnings)
      ? cmd('cpm.showBuildProblems', '<span class="' + (p.errors ? 'err' : '') + '">' + p.errors + ' error' + (p.errors === 1 ? '' : 's') + '</span> · <span class="' + (p.warnings ? 'warn' : '') + '">' + p.warnings + ' warning' + (p.warnings === 1 ? '' : 's') + '</span>', 'link problems', ' title="Open the build problems"')
      : (b ? '<span class="muted">No build problem</span>' : '');
    return '<div class="build-status">' + line + '<span class="spacer"></span>' + problems + '</div>';
  }

  function projectCard() {
    const pr = state.project;
    const ws = state.workspace;
    if (!pr) {
      return '<section class="card hero"><div class="card-kicker">Workspace ' + esc(ws.name) + '</div><h2>No active project</h2><p class="muted">This workspace has ' + ws.projectCount + ' project' + (ws.projectCount === 1 ? '' : 's') + '. Select one in the Workspace view or add a new project.</p><div class="action-bar">'
        + cmd('cpm.createProjectInWorkspace', icon('plus') + 'Add a project…', '') + cmd('cpm.openWorkspace', icon('folder') + 'Open another workspace…', 'secondary') + '</div></section>';
    }
    const isLib = pr.targetType === 'Static Library';
    return '<section class="card hero"><div class="card-kicker">Active project · workspace ' + esc(ws ? ws.name : '') + '</div>'
      + '<div class="project-title"><h2>' + esc(pr.name) + '</h2><span class="mono muted" title="' + esc(pr.path) + '">' + esc(base(pr.path)) + '</span></div>'
      + '<div class="config-row">' + cmd('cpm.selectConfiguration', '<strong>' + esc(state.modeShort) + '</strong><span>' + esc(state.modeLong) + '</span>', 'config-chip', ' title="Change the build mode or the target type"')
      + cmd('cpm.selectConfiguration', '<strong>' + esc(pr.targetShort || '—') + '</strong><span>' + esc(pr.targetType || 'Unknown target') + '</span>', 'config-chip', ' title="Change the build mode or the target type"') + '</div>'
      + '<div class="action-bar">' + cmd('cpm.build', icon('tools') + 'Build<kbd>Ctrl+F7</kbd>', '') + (isLib ? '' : cmd('cpm.run', icon('play') + 'Run<kbd>Ctrl+F5</kbd>', 'secondary') + cmd('cpm.runDebug', icon('bug') + 'Debug<kbd>F5</kbd>', 'secondary'))
      + '<span class="spacer"></span>' + cmd('cpm.rebuild', 'Rebuild', 'ghost') + cmd('cpm.clean', 'Clean', 'ghost') + (isLib ? '' : cmd('cpm.chooseRunAction', 'Run options…', 'ghost')) + '</div>'
      + buildStatus()
      + '<div class="card-links">' + cmd('cpm.editBuildSettings', icon('gear') + 'Project settings', 'link') + cmd('cpm.createNewFile', icon('file') + 'New file…', 'link') + (isLib ? '' : cmd('cpm.buildAndRun', 'Build &amp; Run', 'link') + cmd('cpm.debugWithGdb', 'Build &amp; Debug', 'link')) + '</div></section>';
  }

  function startCard() {
    return '<section class="card hero"><h2>Start</h2><p class="muted">Open an existing <code>.cws</code> workspace or <code>.prj</code> project, or create a starter workspace with build settings ready to use.</p>'
      + '<div class="start-actions">' + cmd('cpm.openWorkspace', icon('folder', 'big') + '<span><strong>Open workspace or project…</strong><small>Pick a .cws or .prj file</small></span>', 'start')
      + cmd('cpm.createWorkspaceProject', icon('plus', 'big') + '<span><strong>Create workspace and project…</strong><small>C or C++ starter, executable, DLL or library</small></span>', 'start secondary') + '</div>'
      + '<div class="card-links">' + cmd('cpm.openGettingStarted', 'Getting started guide', 'link') + cmd('cpm.createSdlWorkspaceProject', 'Create an SDL workspace…', 'link') + cmd('cpm.openTools', icon('gear') + 'Settings &amp; tools', 'link') + '</div></section>';
  }

  function toolchainCard() {
    const tc = state.toolchain || { tools: [] };
    const head = '<div class="card-head"><h2>Toolchain</h2><span class="muted small">' + esc(tc.source ? tc.source + ' · ' : '') + (tc.configuredCount || 0) + ' configured</span></div>';
    if (!tc.root && !(tc.tools || []).length) {
      return '<section class="card">' + head + '<p class="muted">No C/C++ toolchain is selected. CPM can detect GCC, MinGW, MSYS2 or LLVM/Clang, or install a supported one.</p><div class="action-bar">'
        + cmd('cpm.configureInstallation', 'Select toolchain…', '') + cmd('cpm.installSupportedToolchains', 'Install toolchains…', 'secondary') + '</div></section>';
    }
    const pills = (tc.tools || []).map((t) => {
      const cls = t.status === 'ok' ? 'ok' : t.status === 'missing' ? 'bad' : 'warn';
      return '<span class="tool-pill ' + cls + '" title="' + esc(t.status === 'ok' ? t.path : t.message) + '">' + icon(t.status === 'ok' ? 'check' : t.status === 'missing' ? 'cross' : 'warning') + '<strong>' + esc(base(t.path) || t.label) + '</strong><span>' + esc(t.role) + '</span></span>';
    }).join('');
    return '<section class="card">' + head + '<div class="mono path" title="' + esc(tc.root) + '">' + esc(tc.root || '') + '</div><div class="tool-pills">' + pills + '</div>'
      + '<div class="card-links">' + cmd('cpm.configureInstallation', 'Select toolchain…', 'link') + cmd('cpm.installSupportedToolchains', 'Install toolchains…', 'link') + cmd('cpm.diagnoseCppTools', 'Diagnose IntelliSense', 'link') + '</div></section>';
  }

  function toolTile(command, ico, title, text) {
    return cmd(command, '<span class="tile-ico">' + icon(ico) + '</span><span class="tile-text"><strong>' + title + '</strong><small>' + text + '</small></span>', 'tool-tile');
  }

  function toolsSection() {
    return '<section class="tool-group"><h3 class="group-title">Code</h3><div class="tool-grid">'
      + toolTile('cpm.library.findFunction', 'library', 'Find a symbol', 'Search the C/C++ API packs and insert a call')
      + toolTile('cpm.createNewFile', 'file', 'New file from template', '.c, .cpp, .h, DLL and class starters')
      + toolTile('cpm.insertSnippet', 'snippet', 'Insert a snippet', 'Reusable fragments at the cursor')
      + toolTile('cpm.manageFileTemplates', 'templates', 'Manage templates', 'Your own file templates and snippets')
      + '</div></section><section class="tool-group"><h3 class="group-title">Equipment &amp; connectivity</h3><div class="tool-grid">'
      + toolTile('cpm.openInstrumentDiagnostics', 'plug', 'Instrument diagnostics', 'COM, USB and VISA terminal, SCPI sequences')
      + toolTile('cpm.openNetworkDiagnostics', 'network', 'Network &amp; wireless', 'TCP/UDP terminal, Wi-Fi and BLE scan')
      + toolTile('cpm.openDeviceManager', 'chip', 'CPM devices', 'One profile per instrument or board')
      + toolTile('cpm.openSshDeviceManager', 'terminal', 'SSH devices', 'OpenSSH aliases and keys for Remote Linux')
      + '</div></section>';
  }

  function recentsCard() {
    const items = state.recents || [];
    const rows = items.map((r) => '<div class="recent-row' + (r.current ? ' current' : '') + (r.exists ? '' : ' missing') + '">'
      + '<button type="button" class="recent-open" data-open="' + esc(r.path) + '" title="' + esc(r.path) + '"><span class="recent-name">' + esc(r.name) + (r.current ? '<span class="pill-open">open</span>' : '') + (r.exists ? '' : '<span class="pill-missing">missing</span>') + '</span><span class="recent-path">' + esc(dir(r.path)) + '</span></button>'
      + '<span class="recent-time">' + esc(ago(r.lastOpened)) + '</span>'
      + '<button type="button" class="icon-btn" data-forget="' + esc(r.path) + '" title="Remove from recents" aria-label="Remove ' + esc(r.name) + ' from recents">' + icon('close') + '</button></div>').join('');
    return '<section class="card"><div class="card-head"><h2>Recent workspaces</h2></div>' + (rows ? '<div class="recent-list">' + rows + '</div>' : '<p class="muted small">Workspaces and projects you open appear here.</p>') + '</section>';
  }

  function workspaceCard() {
    const ws = state.workspace;
    if (!ws) return '';
    return '<section class="card"><div class="card-head"><h2>Workspace</h2><span class="muted small">' + ws.projectCount + ' project' + (ws.projectCount === 1 ? '' : 's') + '</span></div><div class="ws-name">' + esc(ws.name) + '</div><div class="mono path" title="' + esc(ws.path) + '">' + esc(ws.path) + '</div>'
      + '<div class="card-links">' + cmd('cpm.createProjectInWorkspace', icon('plus') + 'Add a project…', 'link') + cmd('cpm.openWorkspaceFile', 'Open workspace file', 'link') + '</div></section>';
  }

  function render() {
    const scrollY = window.scrollY;
    app.innerHTML = header()
      + '<div class="home-grid"><div class="home-main">' + (state.workspace ? projectCard() : startCard()) + toolchainCard() + toolsSection() + '</div>'
      + '<aside class="home-side">' + recentsCard() + workspaceCard() + '</aside></div>';
    window.scrollTo(0, scrollY);
  }

  app.addEventListener('click', (event) => {
    const target = event.target.closest('[data-cmd],[data-open],[data-forget]');
    if (!target) return;
    if (target.dataset.cmd) vscode.postMessage({ type: 'command', command: target.dataset.cmd });
    else if (target.dataset.open) vscode.postMessage({ type: 'openRecent', path: target.dataset.open });
    else if (target.dataset.forget) vscode.postMessage({ type: 'forgetRecent', path: target.dataset.forget });
  });
  window.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.type === 'state' && message.state) { state = message.state; render(); }
  });
  setInterval(render, 60000); // keep "x min ago" labels fresh
  render();
  vscode.postMessage({ type: 'ready' });
})();
