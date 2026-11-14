// CPM — Instrument Diagnostics webview client.
// Loaded as an external script (see InstrumentDiagnosticsPanel.render); initial data comes from window.CPM_INSTRUMENT_INIT.
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();
  const init = window.CPM_INSTRUMENT_INIT || {};

  // ---------------------------------------------------------------- state
  let state = init.state;
  let discovery = { serial: [], usb: [], visa: [], visaAvailable: false, warnings: [] };
  let presets = init.presets || [];
  let profiles = init.profiles || [];
  let savedCommands = init.savedCommands || [];
  let history = init.history || [];
  let sequences = init.sequences || [];
  let session = init.session || { connected: false };
  let sequenceDraft = [];
  let sequenceEditingIndex = -1;
  let sequenceRun = { running: false, results: [] };

  const DEFAULT_SIDEBAR = 400;
  const ui = Object.assign({ tab: 'commands', sidebarWidth: DEFAULT_SIDEBAR, showTime: true, showHex: true, autoScroll: true, advancedOpen: false }, vscode.getState() || {});
  const saveUi = () => vscode.setState(ui);

  const MAX_LOG_ROWS = 3000;
  const RX_MERGE_WINDOW_MS = 120;
  const logEntries = [];           // { row, plain } — plain text kept for "Copy log"
  const recallData = new WeakMap(); // TX row -> frame to put back in the composer
  const stats = { txFrames: 0, txBytes: 0, rxFrames: 0, rxBytes: 0 };
  let lastRx = null;               // RX chunk aggregation (serial responses often arrive in pieces)
  let pendingTx = [];              // TX rows waiting for their "frameSent" acknowledgement
  let unseen = 0;
  let historyCursor = -1;
  let historyDraft = '';

  // ---------------------------------------------------------------- helpers
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const printable = (value) => String(value ?? '').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  const setValue = (id, value) => { const el = $(id); if (el) el.value = value ?? ''; };
  const setChecked = (id, value) => { const el = $(id); if (el) el.checked = !!value; };
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const fmtTime = (ts) => { const d = new Date(ts || Date.now()); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + pad(d.getMilliseconds(), 3); };
  const fmtBytes = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' kB' : (n / 1048576).toFixed(2) + ' MB';
  const clientId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  function ago(ts) {
    const s = Math.max(0, Math.round((Date.now() - Number(ts || 0)) / 1000));
    if (s < 45) return 'now';
    if (s < 3600) return Math.round(s / 60) + ' min';
    if (s < 86400) return Math.round(s / 3600) + ' h';
    return new Date(ts).toLocaleDateString();
  }
  /** Escape a decoded payload and make control characters visible without breaking the layout. */
  function fmtPayload(raw) {
    const s = String(raw ?? '');
    if (!s.length) return '<span class="ctl">∅ empty</span>';
    return esc(s)
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => '<span class="ctl">\\x' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0') + '</span>')
      .replace(/\t/g, '<span class="ctl">\\t</span>')
      .replace(/\r/g, '<span class="ctl">\\r</span>')
      .replace(/\n(?!$)/g, '<span class="ctl">\\n</span>\n')
      .replace(/\n$/, '<span class="ctl">\\n</span>');
  }

  // ---------------------------------------------------------------- connection state <-> form
  function applyState(next) {
    state = next || state;
    setValue('baudRate', state.serial.baudRate); setValue('dataBits', state.serial.dataBits); setValue('parity', state.serial.parity);
    setValue('stopBits', state.serial.stopBits); setValue('handshake', state.serial.handshake); setValue('readTimeoutMs', state.serial.readTimeoutMs);
    setValue('writeTimeoutMs', state.serial.writeTimeoutMs); setChecked('dtrEnable', state.serial.dtrEnable); setChecked('rtsEnable', state.serial.rtsEnable);
    setValue('visaResource', state.visa.resource); setValue('visaTimeoutMs', state.visa.timeoutMs); setValue('frameMode', state.frameMode);
    setValue('frameEncoding', state.frameEncoding); setValue('frameText', state.frameText); setChecked('expectResponse', state.expectResponse);
    selectTransport(state.transport, false); renderPortOptions(); renderSerialSummary(); renderSession(); autoGrow();
  }

  function collectState(save = true) {
    const lineEnding = $('lineEnding').value;
    const next = {
      transport: state.transport,
      serial: {
        portName: $('portName').value,
        baudRate: Number($('baudRate').value || 9600), dataBits: Number($('dataBits').value || 8), parity: $('parity').value,
        stopBits: $('stopBits').value, handshake: $('handshake').value, readTimeoutMs: Number($('readTimeoutMs').value || 1500),
        writeTimeoutMs: Number($('writeTimeoutMs').value || 1500), dtrEnable: $('dtrEnable').checked, rtsEnable: $('rtsEnable').checked,
        encoding: $('frameEncoding').value, lineEnding: state.transport === 'serial' ? lineEnding : state.serial.lineEnding
      },
      visa: {
        resource: $('visaResource').value.trim(), timeoutMs: Number($('visaTimeoutMs').value || 2000),
        lineEnding: state.transport === 'visa' ? lineEnding : state.visa.lineEnding
      },
      frameMode: $('frameMode').value, frameEncoding: $('frameEncoding').value, frameText: $('frameText').value,
      expectResponse: $('expectResponse').checked
    };
    state = next;
    if (save) vscode.postMessage({ type: 'saveState', state: next });
    return next;
  }

  function selectTransport(transport, save = true) {
    if (session.connected && transport !== session.transport) return;
    state.transport = transport;
    $('transportSerial').classList.toggle('active', transport === 'serial');
    $('transportVisa').classList.toggle('active', transport === 'visa');
    $('serialQuick').classList.toggle('hidden', transport !== 'serial');
    $('visaQuick').classList.toggle('hidden', transport !== 'visa');
    $('serialSettings').classList.toggle('hidden', transport !== 'serial');
    $('visaSettings').classList.toggle('hidden', transport !== 'visa');
    setValue('lineEnding', transport === 'visa' ? state.visa.lineEnding : state.serial.lineEnding);
    if (save) collectState();
  }

  function renderSerialSummary() {
    const parity = { None: 'N', Odd: 'O', Even: 'E', Mark: 'M', Space: 'S' }[$('parity').value] || 'N';
    const stop = { One: '1', OnePointFive: '1.5', Two: '2' }[$('stopBits').value] || '1';
    const flow = { None: 'no flow control', XOnXOff: 'XON/XOFF', RequestToSend: 'RTS/CTS', RequestToSendXOnXOff: 'RTS/CTS+XON' }[$('handshake').value] || '';
    const lines = [$('dtrEnable').checked ? 'DTR' : '', $('rtsEnable').checked ? 'RTS' : ''].filter(Boolean).join('+');
    $('serialSummary').textContent = ($('dataBits').value || '8') + parity + stop + ' · ' + flow + (lines ? ' · ' + lines : '');
  }

  function renderPortOptions() {
    const select = $('portName');
    const current = state.serial.portName || select.value;
    select.innerHTML = '';
    if (!discovery.serial.length) select.insertAdjacentHTML('beforeend', '<option value="">No COM port detected</option>');
    for (const item of discovery.serial) select.insertAdjacentHTML('beforeend', '<option value="' + esc(item.portName) + '">' + esc(item.portName + ' — ' + (item.name || item.description || 'Serial device')) + '</option>');
    if (current && !Array.from(select.options).some((o) => o.value === current)) select.insertAdjacentHTML('beforeend', '<option value="' + esc(current) + '">' + esc(current + ' (not detected)') + '</option>');
    select.value = current || (discovery.serial[0] ? discovery.serial[0].portName : '');
  }

  function renderDevices() {
    $('serialCount').textContent = String(discovery.serial.length);
    $('visaCount').textContent = String(discovery.visa.length);
    $('usbCount').textContent = String(discovery.usb.length);
    renderPortOptions();
    $('visaResourceList').innerHTML = discovery.visa.map((v) => '<option value="' + esc(v.resource) + '"></option>').join('');
    $('visaHint').textContent = discovery.visaAvailable
      ? (discovery.visa.length ? 'VISA runtime detected. Select a resource or enter one manually.' : 'VISA runtime detected, but no ?*INSTR resource was found.')
      : 'No usable VISA runtime detected. Install/configure NI-VISA, Keysight VISA or another compatible runtime for USBTMC/VISA communication.';
    $('serialTable').innerHTML = discovery.serial.length
      ? discovery.serial.map((d) => '<tr class="clickable" data-port="' + esc(d.portName) + '" title="' + esc(d.pnpDeviceId) + '"><td><code>' + esc(d.portName) + '</code></td><td>' + esc(d.name || d.description) + '</td><td>' + esc(d.manufacturer) + '</td><td>' + esc(d.status) + '</td></tr>').join('')
      : '<tr><td colspan="4" class="muted">No serial interface detected.</td></tr>';
    $('visaTable').innerHTML = discovery.visa.length
      ? discovery.visa.map((v) => '<tr class="clickable" data-visa="' + esc(v.resource) + '"><td><code>' + esc(v.resource) + '</code></td></tr>').join('')
      : '<tr><td class="muted">' + (discovery.visaAvailable ? 'No VISA resource found.' : 'No VISA runtime detected.') + '</td></tr>';
    $('usbTable').innerHTML = discovery.usb.length
      ? discovery.usb.map((d) => '<tr title="' + esc(d.pnpDeviceId + (d.service ? ' · service ' + d.service : '')) + '"><td>' + esc(d.name) + '</td><td><code>' + esc(d.vid && d.pid ? d.vid + ':' + d.pid : '') + '</code></td><td>' + esc(d.manufacturer) + '</td><td>' + esc(d.status) + '</td></tr>').join('')
      : '<tr><td colspan="4" class="muted">No USB/PnP device detected.</td></tr>';
    const warnings = discovery.warnings || [];
    $('warningsBar').classList.toggle('hidden', !warnings.length);
    $('warningsSummary').textContent = '⚠ ' + warnings.length + ' discovery note' + (warnings.length > 1 ? 's' : '') + ' — click to ' + ($('warningsBar').querySelector('details').open ? 'hide' : 'show');
    $('warnings').innerHTML = warnings.map((w) => '<div class="notice">' + esc(w) + '</div>').join('');
  }

  function renderSession() {
    const connected = !!session.connected;
    const badge = $('sessionBadge');
    badge.classList.toggle('connected', connected);
    badge.classList.toggle('disconnected', !connected);
    $('sessionText').textContent = connected ? ((session.transport === 'visa' ? 'VISA ' : '') + (session.target || 'instrument')) : 'Disconnected';
    badge.title = connected && session.openedAt ? 'Connected since ' + new Date(session.openedAt).toLocaleTimeString() : '';
    $('connect').disabled = connected;
    $('disconnect').disabled = !connected;
    $('send').disabled = !connected;
    $('connectionFields').disabled = connected;
    $('connectionQuick').disabled = connected;
    $('profileQuick').disabled = connected;
    $('transportSerial').disabled = connected;
    $('transportVisa').disabled = connected;
    $('frameText').placeholder = connected ? 'Type a command, e.g. *IDN?' : 'Connect to an instrument, then type a command (e.g. *IDN?)';
    renderSequenceControls();
  }

  // ---------------------------------------------------------------- side panel lists
  function renderPresets() {
    $('presetList').innerHTML = presets.map((p, i) => '<button class="chip" data-preset="' + i + '" title="' + esc((p.label ? p.label + ' — ' : '') + (p.description || '')) + '">' + esc(p.command) + '</button>').join('');
  }

  function rowActions(buttons) {
    return '<span class="actions">' + buttons.map((b) => '<button class="icon' + (b.danger ? ' danger' : '') + '" data-action="' + b.action + '" data-id="' + esc(b.id) + '" title="' + esc(b.title) + '" aria-label="' + esc(b.title) + '">' + b.icon + '</button>').join('') + '</span>';
  }

  function renderSavedCommands() {
    const list = $('savedCommandList');
    list.innerHTML = savedCommands.map((c) => '<div class="list-row" tabindex="0" data-load-command="' + esc(c.id) + '" title="Click to load · double-click to send"><div class="main"><div class="title">' + esc(c.name) + '</div><div class="sub mono">' + esc(printable(c.command)) + ' · ' + esc(c.frameMode.toUpperCase()) + '</div></div>'
      + rowActions([{ action: 'send-command', id: c.id, icon: '▶', title: 'Send now' }, { action: 'delete-command', id: c.id, icon: '✕', title: 'Delete', danger: true }]) + '</div>').join('');
    $('savedCommandEmpty').classList.toggle('hidden', savedCommands.length > 0);
    $('savedCount').textContent = String(savedCommands.length);
    $('savedCount').classList.toggle('hidden', !savedCommands.length);
  }

  function renderHistory() {
    const query = String($('historyFilter').value || '').trim().toLocaleLowerCase();
    const items = history.filter((h) => !query || h.command.toLocaleLowerCase().includes(query) || String(h.target || '').toLocaleLowerCase().includes(query));
    $('historyList').innerHTML = items.map((h) => '<div class="list-row" tabindex="0" data-load-history="' + esc(h.id) + '" title="' + esc(new Date(h.timestamp).toLocaleString() + ' · ' + h.transport.toUpperCase() + ' ' + h.target + ' · ' + h.frameMode.toUpperCase() + '\nClick to load · double-click to send') + '"><div class="main"><div class="title mono">' + esc(printable(h.command)) + '</div></div>'
      + (h.count > 1 ? '<span class="aside" title="Sent ' + h.count + ' times">×' + h.count + '</span>' : '')
      + '<span class="aside">' + esc(ago(h.timestamp)) + '</span>'
      + rowActions([{ action: 'send-history', id: h.id, icon: '▶', title: 'Send again' }, { action: 'save-history', id: h.id, icon: '☆', title: 'Save as command' }]) + '</div>').join('');
    $('historyEmpty').textContent = history.length ? 'No history entry matches the filter.' : 'No command sent yet.';
    $('historyEmpty').classList.toggle('hidden', items.length > 0);
    $('historyCount').textContent = String(history.length);
    $('historyCount').classList.toggle('hidden', !history.length);
  }

  function renderProfiles() {
    $('profileList').innerHTML = profiles.map((p) => {
      const target = p.state.transport === 'serial' ? p.state.serial.portName + ' · ' + p.state.serial.baudRate + ' Bd' : p.state.visa.resource;
      return '<div class="list-row" tabindex="0" data-action-row="load-profile" data-id="' + esc(p.id) + '" title="Click to load this profile"><div class="main"><div class="title">' + esc(p.name) + '</div><div class="sub">' + esc(p.state.transport.toUpperCase() + ' — ' + target) + '</div></div>'
        + rowActions([{ action: 'profile-device', id: p.id, icon: '⇪', title: 'Add to a CPM device' }, { action: 'delete-profile', id: p.id, icon: '✕', title: 'Delete', danger: true }]) + '</div>';
    }).join('');
    $('profileEmpty').classList.toggle('hidden', profiles.length > 0);
    $('profileCount').textContent = String(profiles.length);
    $('profileCount').classList.toggle('hidden', !profiles.length);
    $('profileQuick').innerHTML = '<option value="">' + (profiles.length ? 'Load profile…' : 'No saved profile') + '</option>' + profiles.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('');
  }

  // ---------------------------------------------------------------- sequences
  function sequenceCriteriaLabel(step) {
    if (!step.expectResponse) return 'no response expected' + (step.delayAfterMs ? ' · delay ' + step.delayAfterMs + ' ms' : '');
    const criterion = step.matchMode === 'any' ? 'any response' : (step.matchMode + ' "' + printable(step.expected) + '"');
    return criterion + ' · ' + step.timeoutMs + ' ms' + (step.delayAfterMs ? ' · delay ' + step.delayAfterMs + ' ms' : '');
  }

  function collectSequenceStep() {
    const existing = sequenceEditingIndex >= 0 ? sequenceDraft[sequenceEditingIndex] : null;
    return {
      id: (existing && existing.id) || clientId(),
      name: $('sequenceStepName').value.trim() || ('Step ' + (sequenceEditingIndex >= 0 ? sequenceEditingIndex + 1 : sequenceDraft.length + 1)),
      command: $('sequenceStepCommand').value,
      frameMode: $('sequenceStepFrameMode').value,
      frameEncoding: $('sequenceStepEncoding').value,
      expectResponse: $('sequenceStepExpectResponse').checked,
      timeoutMs: Math.max(50, Math.min(120000, Number($('sequenceStepTimeout').value || 2000))),
      delayAfterMs: Math.max(0, Math.min(120000, Number($('sequenceStepDelay').value || 0))),
      matchMode: $('sequenceStepMatchMode').value,
      expected: $('sequenceStepExpected').value
    };
  }

  function resetSequenceStepEditor() {
    sequenceEditingIndex = -1;
    setValue('sequenceStepName', ''); setValue('sequenceStepCommand', ''); setValue('sequenceStepFrameMode', 'text'); setValue('sequenceStepEncoding', state.frameEncoding || 'ascii');
    setChecked('sequenceStepExpectResponse', true); setValue('sequenceStepMatchMode', 'any'); setValue('sequenceStepExpected', ''); setValue('sequenceStepTimeout', '2000'); setValue('sequenceStepDelay', '0');
    $('sequenceAddStep').textContent = 'Add step'; $('stepEditorTitle').textContent = 'Add a step'; $('sequenceCancelEdit').classList.add('hidden');
    updateSequenceStepControls(); renderSequenceDraft();
  }

  function updateSequenceStepControls() {
    const expects = $('sequenceStepExpectResponse').checked;
    $('sequenceStepMatchMode').disabled = !expects;
    $('sequenceStepTimeout').disabled = !expects;
    $('sequenceStepExpected').disabled = !expects || $('sequenceStepMatchMode').value === 'any';
  }

  function renderSequenceDraft() {
    $('sequenceStepList').innerHTML = sequenceDraft.map((step, index) => '<div class="step-row' + (index === sequenceEditingIndex ? ' editing' : '') + '"><span class="idx">' + (index + 1) + '</span><div style="min-width:0"><div class="cmd" title="' + esc(step.name) + '"><strong style="font-family:var(--vscode-font-family);font-weight:600">' + esc(step.name) + '</strong> · ' + esc(printable(step.command)) + '</div><div class="crit">' + esc(sequenceCriteriaLabel(step)) + '</div></div><span class="actions">'
      + '<button class="icon" data-seq-up="' + index + '" title="Move up"' + (index === 0 ? ' disabled' : '') + '>↑</button>'
      + '<button class="icon" data-seq-down="' + index + '" title="Move down"' + (index === sequenceDraft.length - 1 ? ' disabled' : '') + '>↓</button>'
      + '<button class="icon" data-seq-edit="' + index + '" title="Edit">✎</button>'
      + '<button class="icon danger" data-seq-delete="' + index + '" title="Delete">✕</button></span></div>').join('');
    $('sequenceStepEmpty').classList.toggle('hidden', sequenceDraft.length > 0);
    $('stepCount').textContent = String(sequenceDraft.length);
    $('stepCount').classList.toggle('hidden', !sequenceDraft.length);
    renderSequenceControls();
  }

  function renderSavedSequences() {
    $('savedSequenceList').innerHTML = sequences.map((seq) => '<div class="list-row" tabindex="0" data-action-row="load-sequence" data-id="' + esc(seq.id) + '" title="Click to load into the editor"><div class="main"><div class="title">' + esc(seq.name) + '</div><div class="sub">' + seq.steps.length + ' step(s) · ' + (seq.stopOnFailure ? 'stop on failure' : 'continue on failure') + '</div></div>'
      + rowActions([{ action: 'delete-sequence', id: seq.id, icon: '✕', title: 'Delete', danger: true }]) + '</div>').join('');
    $('savedSequenceEmpty').classList.toggle('hidden', sequences.length > 0);
    $('seqTabCount').textContent = String(sequences.length);
    $('seqTabCount').classList.toggle('hidden', !sequences.length);
  }

  function renderSequenceControls() {
    $('runSequence').disabled = !session.connected || !sequenceDraft.length || sequenceRun.running;
    $('runSequence').title = !session.connected ? 'Connect to an instrument first' : (!sequenceDraft.length ? 'Add at least one step' : 'Run the sequence on ' + (session.target || 'the instrument'));
    $('stopSequence').disabled = !sequenceRun.running;
    $('saveSequence').disabled = !sequenceDraft.length || sequenceRun.running;
    $('sequenceAddStep').disabled = sequenceRun.running;
  }

  function setSequenceStatus(label, cls) { const badge = $('sequenceRunStatus'); badge.textContent = label; badge.className = 'status-tag ' + cls; }

  function renderSequenceResults() {
    const results = sequenceRun.results || [];
    if (!results.length) { $('sequenceResultTable').innerHTML = '<tr><td colspan="4" class="muted">No sequence run yet.</td></tr>'; return; }
    $('sequenceResultTable').innerHTML = results.map((entry, index) => {
      if (!entry) return '<tr class="result-row"><td>' + (index + 1) + '</td><td colspan="3" class="muted">Pending</td></tr>';
      const step = entry.step || {}, result = entry.result || {};
      const status = result.status || entry.status || 'running';
      const text = result.responseText ? printable(result.responseText) : (result.message || '');
      return '<tr class="result-row"><td>' + (index + 1) + '</td><td><div>' + esc(step.name || ('Step ' + (index + 1))) + ' <code class="muted">' + esc(printable(step.command || '')) + '</code></div><div class="muted small mono" style="overflow-wrap:anywhere">' + esc(text) + '</div>' + (result.message && result.responseText ? '<div class="muted small">' + esc(result.message) + '</div>' : '') + '</td><td><span class="status-tag ' + esc(status) + '">' + esc(status.toUpperCase()) + '</span></td><td class="nowrap">' + esc(result.elapsedMs === undefined ? '' : result.elapsedMs + ' ms') + '</td></tr>';
    }).join('');
  }

  function renderCollections() { renderProfiles(); renderSavedCommands(); renderHistory(); renderSavedSequences(); }

  // ---------------------------------------------------------------- console
  const consoleEl = $('console');

  function isNearBottom() { return consoleEl.scrollHeight - consoleEl.scrollTop - consoleEl.clientHeight < 32; }
  function scrollToBottom() { consoleEl.scrollTop = consoleEl.scrollHeight; unseen = 0; $('jumpLatest').classList.add('hidden'); }

  function renderEmptyConsole() {
    if (logEntries.length) return;
    consoleEl.innerHTML = '<div class="console-empty">' + (session.connected
      ? 'Connected to <strong>' + esc(session.target || 'instrument') + '</strong>. Type a command below and press <kbd>Enter</kbd>. Replies and unsolicited frames appear here.'
      : 'Select a port or VISA resource above and press <strong>Connect</strong>.<br>Sent frames (TX), replies (RX) and errors will be logged here, right above the input box.') + '</div>';
  }

  function renderStats() {
    $('termStats').innerHTML = '<span class="tx">TX ' + stats.txFrames + ' · ' + fmtBytes(stats.txBytes) + '</span> &nbsp; <span class="rx">RX ' + stats.rxFrames + ' · ' + fmtBytes(stats.rxBytes) + '</span>';
  }

  function matchesFilter(text) {
    const q = String($('logFilter').value || '').trim().toLocaleLowerCase();
    return !q || String(text).toLocaleLowerCase().includes(q);
  }

  /**
   * Append a structured line. kind: tx | rx | err | info | seq | pass.
   * opts: { ts, hex, meta, html, recall }
   */
  function addLog(kind, label, text, opts = {}) {
    const stick = isNearBottom();
    if (!logEntries.length) consoleEl.innerHTML = '';
    const ts = opts.ts || Date.now();
    const row = document.createElement('div');
    row.className = 'log-row ' + kind;
    row.innerHTML = '<span class="log-time">' + fmtTime(ts) + '</span><span class="log-dir">' + esc(label) + '</span><div class="log-body"><div class="log-text">' + (opts.html !== undefined ? opts.html : esc(text)) + '</div>' + (opts.hex ? '<div class="log-hex">' + esc(opts.hex) + '</div>' : '') + '</div><span class="log-meta">' + esc(opts.meta || '') + '</span>';
    if (opts.recall) { recallData.set(row, opts.recall); row.title = 'Click to put this frame back in the input box'; }
    const entry = { row, ts, label, text: String(text ?? ''), hex: opts.hex || '', meta: opts.meta || '' };
    entry.plain = plainLine(entry);
    if (!matchesFilter(entry.plain)) row.classList.add('filtered');
    consoleEl.appendChild(row);
    logEntries.push(entry);
    while (logEntries.length > MAX_LOG_ROWS) { const old = logEntries.shift(); old.row.remove(); }
    afterAppend(stick);
    return entry;
  }

  function plainLine(entry) { return '[' + fmtTime(entry.ts) + '] ' + entry.label.padEnd(4) + ' ' + printable(entry.text) + (entry.hex ? '  | HEX ' + entry.hex : '') + (entry.meta ? '  (' + entry.meta + ')' : ''); }

  function updateEntry(entry, patch) {
    Object.assign(entry, patch);
    if (patch.html !== undefined) entry.row.querySelector('.log-text').innerHTML = patch.html;
    if (patch.meta !== undefined) entry.row.querySelector('.log-meta').textContent = patch.meta;
    if (patch.hex !== undefined) {
      let hexEl = entry.row.querySelector('.log-hex');
      if (!hexEl && patch.hex) { hexEl = document.createElement('div'); hexEl.className = 'log-hex'; entry.row.querySelector('.log-body').appendChild(hexEl); }
      if (hexEl) hexEl.textContent = patch.hex;
    }
    entry.plain = plainLine(entry);
    entry.row.classList.toggle('filtered', !matchesFilter(entry.plain));
  }

  function afterAppend(stick) {
    if (ui.autoScroll && stick) scrollToBottom();
    else if (ui.autoScroll) { unseen++; $('jumpLatest').textContent = '↓ ' + unseen + ' new line' + (unseen > 1 ? 's' : ''); $('jumpLatest').classList.remove('hidden'); }
  }

  function logInfo(text, kind = 'info', label = 'INFO') { lastRx = null; return addLog(kind, label, text); }

  function logTx(frame, label = 'TX') {
    lastRx = null;
    const html = frame.frameMode === 'hex' ? esc(frame.frameText.trim().toUpperCase()) : fmtPayload(frame.frameText);
    stats.txFrames++; renderStats();
    return addLog('tx', label, frame.frameText, { html, meta: '…', recall: { frameText: frame.frameText, frameMode: frame.frameMode, frameEncoding: frame.frameEncoding } });
  }

  function logRx(e) {
    const ts = e.timestamp || Date.now();
    const target = (e.transport || '') + ' ' + (e.target || '');
    const bytes = Number(e.bytes || 0);
    stats.rxBytes += bytes;
    const canMerge = lastRx && lastRx.target === target && ts - lastRx.lastTs <= RX_MERGE_WINDOW_MS && !/\n$/.test(lastRx.entry.text) && consoleEl.lastElementChild === lastRx.entry.row;
    if (canMerge) {
      lastRx.bytes += bytes; lastRx.lastTs = ts;
      const text = lastRx.entry.text + (e.text || '');
      updateEntry(lastRx.entry, { text, html: fmtPayload(text), hex: [lastRx.entry.hex, e.hex || ''].filter(Boolean).join(' '), meta: lastRx.bytes + ' B' });
      if (ui.autoScroll && isNearBottom()) scrollToBottom();
    } else {
      stats.rxFrames++;
      const entry = addLog('rx', 'RX', e.text || '', { ts, html: e.text ? fmtPayload(e.text) : '<span class="ctl">&lt;binary&gt;</span>', hex: e.hex || '', meta: bytes + ' B' });
      lastRx = { entry, target, bytes, lastTs: ts };
    }
    renderStats();
  }

  function clearLog() {
    logEntries.length = 0; lastRx = null; pendingTx = [];
    Object.assign(stats, { txFrames: 0, txBytes: 0, rxFrames: 0, rxBytes: 0 });
    consoleEl.innerHTML = ''; renderStats(); renderEmptyConsole(); scrollToBottom();
  }

  function applyLogOptions() {
    consoleEl.classList.toggle('no-time', !ui.showTime);
    consoleEl.classList.toggle('no-hex', !ui.showHex);
    setChecked('optTime', ui.showTime); setChecked('optHex', ui.showHex); setChecked('optScroll', ui.autoScroll);
  }

  // ---------------------------------------------------------------- composer
  function autoGrow() {
    const ta = $('frameText');
    ta.style.height = 'auto';
    ta.style.height = Math.min(180, Math.max(34, ta.scrollHeight + 2)) + 'px';
  }

  function loadIntoComposer(frame, focus = true) {
    if (!frame) return;
    if (frame.frameText !== undefined) setValue('frameText', frame.frameText);
    if (frame.command !== undefined) setValue('frameText', frame.command);
    if (frame.frameMode) setValue('frameMode', frame.frameMode);
    if (frame.frameEncoding) setValue('frameEncoding', frame.frameEncoding);
    if (frame.expectResponse !== undefined) setChecked('expectResponse', frame.expectResponse);
    historyCursor = -1;
    collectState(); autoGrow();
    if (focus) { const ta = $('frameText'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  function flashConnect() { const b = $('connect'); b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }

  function doSend() {
    const next = collectState(false);
    if (!session.connected) { logInfo('Not connected — select a port or VISA resource and press Connect first.', 'err', 'ERR'); flashConnect(); return; }
    if (!next.frameText.length) { $('frameText').focus(); return; }
    pendingTx.push(logTx(next));
    vscode.postMessage({ type: 'sendFrame', state: next });
    historyCursor = -1;
    const ta = $('frameText'); ta.focus(); ta.select();
  }

  function sendFrame(frame) { loadIntoComposer(frame, false); doSend(); }

  function recallHistory(direction) {
    if (!history.length) return false;
    if (historyCursor === -1) historyDraft = $('frameText').value;
    const nextCursor = Math.max(-1, Math.min(history.length - 1, historyCursor + direction));
    if (nextCursor === historyCursor) return true;
    historyCursor = nextCursor;
    const ta = $('frameText');
    if (historyCursor === -1) setValue('frameText', historyDraft);
    else { const h = history[historyCursor]; setValue('frameText', h.command); setValue('frameMode', h.frameMode); setValue('frameEncoding', h.frameEncoding); }
    autoGrow();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    return true;
  }

  // ---------------------------------------------------------------- tabs & splitter
  function switchTab(name) {
    ui.tab = name; saveUi();
    document.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === name); b.setAttribute('aria-selected', String(b.dataset.tab === name)); });
    document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
  }

  function applySidebarWidth() { $('workspace').style.setProperty('--sidebar-width', Math.round(ui.sidebarWidth) + 'px'); }

  function setupSplitter() {
    const splitter = $('splitter');
    const workspace = $('workspace');
    const clamp = (w) => Math.max(260, Math.min(workspace.clientWidth - 340, w));
    splitter.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      splitter.setPointerCapture(event.pointerId);
      splitter.classList.add('dragging'); document.body.classList.add('resizing');
      const left = workspace.getBoundingClientRect().left;
      const move = (e) => { ui.sidebarWidth = clamp(e.clientX - left); applySidebarWidth(); };
      const up = () => { splitter.classList.remove('dragging'); document.body.classList.remove('resizing'); splitter.removeEventListener('pointermove', move); splitter.removeEventListener('pointerup', up); saveUi(); };
      splitter.addEventListener('pointermove', move);
      splitter.addEventListener('pointerup', up);
    });
    splitter.addEventListener('dblclick', () => { ui.sidebarWidth = DEFAULT_SIDEBAR; applySidebarWidth(); saveUi(); });
    splitter.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      ui.sidebarWidth = clamp(ui.sidebarWidth + (e.key === 'ArrowRight' ? 24 : -24)); applySidebarWidth(); saveUi(); e.preventDefault();
    });
  }

  function busy(operation, value) {
    if (operation === 'discover') {
      $('refresh').disabled = value;
      $('status').innerHTML = value ? '<span class="spinner"></span> Enumerating interfaces…' : '';
    }
    if (operation === 'connect') {
      $('connect').disabled = value || session.connected;
      $('connect').textContent = value ? 'Connecting…' : 'Connect';
    }
  }

  // ---------------------------------------------------------------- event wiring
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('transportSerial').addEventListener('click', () => selectTransport('serial'));
  $('transportVisa').addEventListener('click', () => selectTransport('visa'));
  $('toggleAdvanced').addEventListener('click', () => {
    ui.advancedOpen = !ui.advancedOpen; saveUi();
    $('advancedSettings').classList.toggle('hidden', !ui.advancedOpen);
    $('toggleAdvanced').setAttribute('aria-expanded', String(ui.advancedOpen));
    $('toggleAdvanced').textContent = ui.advancedOpen ? '⚙ Settings ▴' : '⚙ Settings ▾';
  });
  $('warningsBar').querySelector('details').addEventListener('toggle', renderDevices);
  $('profileQuick').addEventListener('change', () => { const id = $('profileQuick').value; if (id) vscode.postMessage({ type: 'applyProfile', id }); $('profileQuick').value = ''; });
  $('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refreshDevices' }));
  $('openHelp').addEventListener('click', () => vscode.postMessage({ type: 'openHelp' }));
  $('openNetworkDiagnostics').addEventListener('click', () => vscode.postMessage({ type: 'openNetworkDiagnostics' }));
  $('openDeviceManager').addEventListener('click', () => vscode.postMessage({ type: 'openDeviceManager' }));
  $('connect').addEventListener('click', () => vscode.postMessage({ type: 'connect', state: collectState(false) }));
  $('disconnect').addEventListener('click', () => vscode.postMessage({ type: 'disconnect' }));
  $('send').addEventListener('click', doSend);
  $('saveProfile').addEventListener('click', () => { vscode.postMessage({ type: 'saveProfile', name: $('profileName').value, state: collectState(false) }); setValue('profileName', ''); });
  $('saveToDevice').addEventListener('click', () => vscode.postMessage({ type: 'saveToDevice', state: collectState(false) }));
  $('saveCommand').addEventListener('click', () => { vscode.postMessage({ type: 'saveCommand', name: $('commandName').value, state: collectState(false) }); setValue('commandName', ''); });
  $('clearHistory').addEventListener('click', () => vscode.postMessage({ type: 'clearHistory' }));
  $('historyFilter').addEventListener('input', renderHistory);
  $('clearLog').addEventListener('click', clearLog);
  $('copyLog').addEventListener('click', () => vscode.postMessage({ type: 'copyText', text: logEntries.map((e) => e.plain).join('\n') }));
  $('jumpLatest').addEventListener('click', scrollToBottom);
  consoleEl.addEventListener('scroll', () => { if (isNearBottom()) { unseen = 0; $('jumpLatest').classList.add('hidden'); } });
  consoleEl.addEventListener('click', (event) => {
    const row = event.target.closest('.log-row.tx');
    if (!row || window.getSelection().toString()) return;
    loadIntoComposer(recallData.get(row));
  });
  $('logFilter').addEventListener('input', () => { for (const e of logEntries) e.row.classList.toggle('filtered', !matchesFilter(e.plain)); });
  $('optTime').addEventListener('change', () => { ui.showTime = $('optTime').checked; saveUi(); applyLogOptions(); });
  $('optHex').addEventListener('change', () => { ui.showHex = $('optHex').checked; saveUi(); applyLogOptions(); });
  $('optScroll').addEventListener('change', () => { ui.autoScroll = $('optScroll').checked; saveUi(); applyLogOptions(); if (ui.autoScroll) scrollToBottom(); });

  // Persist any connection/composer field change (the log options above are UI-only and handled separately).
  document.querySelectorAll('.connection-bar input, .connection-bar select, #advancedSettings input, #advancedSettings select, .composer input, .composer select').forEach((el) => {
    if (el.id === 'profileQuick') return;
    el.addEventListener('change', () => { collectState(); renderSerialSummary(); });
  });
  $('frameText').addEventListener('change', () => collectState());
  $('frameText').addEventListener('input', () => { autoGrow(); historyCursor = -1; });
  $('frameText').addEventListener('keydown', (event) => {
    const ta = event.target;
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); doSend(); return; }
    if (event.key === 'ArrowUp' && !event.altKey && !ta.value.slice(0, ta.selectionStart).includes('\n')) { if (recallHistory(+1)) event.preventDefault(); return; }
    if (event.key === 'ArrowDown' && !event.altKey && historyCursor !== -1 && !ta.value.slice(ta.selectionEnd).includes('\n')) { if (recallHistory(-1)) event.preventDefault(); return; }
    if (event.key === 'Escape' && historyCursor !== -1) { historyCursor = -1; setValue('frameText', historyDraft); autoGrow(); }
  });

  // Delegated clicks for the side-panel lists.
  $('presetList').addEventListener('click', (event) => {
    const b = event.target.closest('[data-preset]'); if (!b) return;
    const p = presets[Number(b.dataset.preset)]; if (!p) return;
    loadIntoComposer({ command: p.command, frameMode: 'text', expectResponse: !!p.expectsResponse });
  });
  $('presetList').addEventListener('dblclick', (event) => {
    const b = event.target.closest('[data-preset]'); if (!b) return;
    const p = presets[Number(b.dataset.preset)]; if (p) sendFrame({ command: p.command, frameMode: 'text', expectResponse: !!p.expectsResponse });
  });
  const commandById = (id) => savedCommands.find((x) => x.id === id);
  const historyById = (id) => history.find((x) => x.id === id);
  function onListActivate(event, isDouble) {
    const action = event.target.closest('[data-action]');
    if (action) {
      event.stopPropagation();
      const id = action.dataset.id;
      switch (action.dataset.action) {
        case 'send-command': { const c = commandById(id); if (c) sendFrame(c); return; }
        case 'delete-command': vscode.postMessage({ type: 'deleteCommand', id }); return;
        case 'send-history': { const h = historyById(id); if (h) sendFrame(h); return; }
        case 'save-history': { const h = historyById(id); if (h) vscode.postMessage({ type: 'saveCommand', name: '', state: Object.assign(collectState(false), { frameText: h.command, frameMode: h.frameMode, frameEncoding: h.frameEncoding }) }); return; }
        case 'profile-device': vscode.postMessage({ type: 'profileToDevice', id }); return;
        case 'delete-profile': vscode.postMessage({ type: 'deleteProfile', id }); return;
        case 'delete-sequence': vscode.postMessage({ type: 'deleteSequence', id }); return;
      }
      return;
    }
    const row = event.target.closest('.list-row'); if (!row) return;
    if (row.dataset.loadCommand) { const c = commandById(row.dataset.loadCommand); if (!c) return; if (isDouble) sendFrame(c); else loadIntoComposer(c); return; }
    if (row.dataset.loadHistory) { const h = historyById(row.dataset.loadHistory); if (!h) return; if (isDouble) sendFrame(h); else loadIntoComposer(h); return; }
    if (isDouble) return;
    if (row.dataset.actionRow === 'load-profile') vscode.postMessage({ type: 'applyProfile', id: row.dataset.id });
    if (row.dataset.actionRow === 'load-sequence') {
      const seq = sequences.find((x) => x.id === row.dataset.id); if (!seq) return;
      setValue('sequenceName', seq.name); setChecked('sequenceStopOnFailure', seq.stopOnFailure);
      sequenceDraft = JSON.parse(JSON.stringify(seq.steps)); resetSequenceStepEditor();
    }
  }
  ['savedCommandList', 'historyList', 'profileList', 'savedSequenceList'].forEach((id) => {
    $(id).addEventListener('click', (e) => onListActivate(e, false));
    $(id).addEventListener('dblclick', (e) => onListActivate(e, true));
    $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('list-row')) onListActivate(e, e.ctrlKey || e.metaKey); });
  });
  $('serialTable').addEventListener('click', (event) => {
    const tr = event.target.closest('[data-port]'); if (!tr || session.connected) return;
    state.serial.portName = tr.dataset.port; selectTransport('serial', false); renderPortOptions(); collectState();
  });
  $('visaTable').addEventListener('click', (event) => {
    const tr = event.target.closest('[data-visa]'); if (!tr || session.connected) return;
    selectTransport('visa', false); setValue('visaResource', tr.dataset.visa); collectState();
  });

  // Sequence editor.
  $('sequenceStepExpectResponse').addEventListener('change', updateSequenceStepControls);
  $('sequenceStepMatchMode').addEventListener('change', updateSequenceStepControls);
  $('sequenceUseTerminal').addEventListener('click', () => {
    const terminal = collectState(false);
    setValue('sequenceStepCommand', terminal.frameText); setValue('sequenceStepFrameMode', terminal.frameMode); setValue('sequenceStepEncoding', terminal.frameEncoding);
    setChecked('sequenceStepExpectResponse', terminal.expectResponse); setValue('sequenceStepMatchMode', 'any'); setValue('sequenceStepExpected', ''); updateSequenceStepControls();
  });
  $('sequenceCancelEdit').addEventListener('click', resetSequenceStepEditor);
  $('sequenceAddStep').addEventListener('click', () => {
    const step = collectSequenceStep();
    if (!step.command.trim()) { logInfo('Sequence step command is empty.', 'err', 'ERR'); return; }
    if (step.expectResponse && step.matchMode !== 'any' && !step.expected.length) { logInfo('Enter the expected response text for this validation mode.', 'err', 'ERR'); return; }
    if (step.expectResponse && step.matchMode === 'regex') { try { new RegExp(step.expected); } catch (error) { logInfo('Invalid regular expression — ' + error.message, 'err', 'ERR'); return; } }
    if (sequenceEditingIndex >= 0) sequenceDraft[sequenceEditingIndex] = step; else sequenceDraft.push(step);
    resetSequenceStepEditor();
  });
  $('sequenceStepList').addEventListener('click', (event) => {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.seqUp !== undefined) { const i = Number(b.dataset.seqUp); if (i > 0) { [sequenceDraft[i - 1], sequenceDraft[i]] = [sequenceDraft[i], sequenceDraft[i - 1]]; renderSequenceDraft(); } }
    else if (b.dataset.seqDown !== undefined) { const i = Number(b.dataset.seqDown); if (i < sequenceDraft.length - 1) { [sequenceDraft[i + 1], sequenceDraft[i]] = [sequenceDraft[i], sequenceDraft[i + 1]]; renderSequenceDraft(); } }
    else if (b.dataset.seqDelete !== undefined) { const i = Number(b.dataset.seqDelete); sequenceDraft.splice(i, 1); if (sequenceEditingIndex === i) resetSequenceStepEditor(); else { if (sequenceEditingIndex > i) sequenceEditingIndex--; renderSequenceDraft(); } }
    else if (b.dataset.seqEdit !== undefined) {
      const i = Number(b.dataset.seqEdit), step = sequenceDraft[i]; if (!step) return; sequenceEditingIndex = i;
      setValue('sequenceStepName', step.name); setValue('sequenceStepCommand', step.command); setValue('sequenceStepFrameMode', step.frameMode); setValue('sequenceStepEncoding', step.frameEncoding);
      setChecked('sequenceStepExpectResponse', step.expectResponse); setValue('sequenceStepMatchMode', step.matchMode); setValue('sequenceStepExpected', step.expected); setValue('sequenceStepTimeout', step.timeoutMs); setValue('sequenceStepDelay', step.delayAfterMs);
      $('sequenceAddStep').textContent = 'Update step'; $('stepEditorTitle').textContent = 'Edit step ' + (i + 1); $('sequenceCancelEdit').classList.remove('hidden');
      $('stepEditor').open = true; updateSequenceStepControls(); renderSequenceDraft(); $('sequenceStepCommand').focus();
    }
  });
  $('saveSequence').addEventListener('click', () => vscode.postMessage({ type: 'saveSequence', name: $('sequenceName').value, stopOnFailure: $('sequenceStopOnFailure').checked, steps: sequenceDraft }));
  $('runSequence').addEventListener('click', () => vscode.postMessage({ type: 'runSequence', name: $('sequenceName').value, stopOnFailure: $('sequenceStopOnFailure').checked, steps: sequenceDraft }));
  $('stopSequence').addEventListener('click', () => vscode.postMessage({ type: 'stopSequence' }));

  // ---------------------------------------------------------------- extension -> webview messages
  window.addEventListener('message', (event) => {
    const msg = event.data || {};
    switch (msg.type) {
      case 'state':
        presets = msg.presets || presets; profiles = msg.profiles || []; savedCommands = msg.savedCommands || []; history = msg.history || []; sequences = msg.sequences || [];
        session = msg.session || { connected: false }; renderPresets(); applyState(msg.state); renderCollections(); renderSession(); renderEmptyConsole();
        break;
      case 'devices':
        discovery = msg.discovery || discovery; if (msg.state) applyState(msg.state); renderDevices();
        break;
      case 'collections':
        profiles = msg.profiles || []; savedCommands = msg.savedCommands || []; history = msg.history || []; sequences = msg.sequences || []; renderCollections();
        break;
      case 'sessionState':
        session = msg.session || { connected: false }; renderSession(); renderEmptyConsole();
        break;
      case 'sessionEvent': {
        const e = msg.event || {};
        const where = ((e.transport || '').toUpperCase() + ' ' + (e.target || '')).trim();
        if (e.type === 'connected') { if (logEntries.length) consoleEl.insertAdjacentHTML('beforeend', '<div class="log-sep">session ' + esc(where) + '</div>'); logInfo('Connected to ' + where); }
        else if (e.type === 'disconnected') logInfo('Disconnected from ' + where + (e.message ? ' — ' + e.message : ''));
        else if (e.type === 'rx') logRx(e);
        else if (e.type === 'error') logInfo((where ? '[' + where + '] ' : '') + (e.message || 'Unknown error'), 'err', 'ERR');
        break;
      }
      case 'frameSent': {
        const entry = pendingTx.shift();
        if (entry) updateEntry(entry, { meta: msg.bytesWritten + ' B' });
        stats.txBytes += Number(msg.bytesWritten || 0); renderStats();
        if (msg.history) { history = msg.history; renderHistory(); }
        break;
      }
      case 'historyUpdated':
        history = msg.history || history; renderHistory();
        break;
      case 'sequenceRunStarted':
        sequenceRun = { running: true, runId: msg.runId, results: new Array(Number(msg.stepCount || 0)) };
        setSequenceStatus('Running', 'running'); renderSequenceResults(); renderSequenceControls();
        logInfo('Sequence "' + (msg.name || 'Diagnostic sequence') + '" started — ' + Number(msg.stepCount || 0) + ' step(s)', 'seq', 'SEQ');
        break;
      case 'sequenceStepStarted': {
        sequenceRun.results[msg.index] = { step: msg.step, status: 'running', result: { status: 'running', message: 'Waiting…' } }; renderSequenceResults();
        const step = msg.step || {};
        const entry = logTx({ frameText: step.command || '', frameMode: step.frameMode || 'text', frameEncoding: step.frameEncoding || 'ascii' }, 'S' + (Number(msg.index) + 1));
        sequenceRun.txEntry = entry;
        break;
      }
      case 'sequenceStepTx':
        if (sequenceRun.txEntry) { updateEntry(sequenceRun.txEntry, { meta: msg.bytesWritten + ' B' }); sequenceRun.txEntry = null; }
        stats.txBytes += Number(msg.bytesWritten || 0); renderStats();
        break;
      case 'sequenceStepResult': {
        sequenceRun.results[msg.index] = { step: msg.step, result: msg.result }; renderSequenceResults();
        const r = msg.result || {};
        const label = String(r.status || '').toUpperCase();
        logInfo('Step ' + (Number(msg.index) + 1) + ' ' + label + ' — ' + (r.message || '') + (r.elapsedMs !== undefined ? ' (' + r.elapsedMs + ' ms)' : ''), r.status === 'pass' ? 'pass' : (r.status === 'fail' ? 'err' : 'seq'), r.status === 'pass' ? 'PASS' : (r.status === 'fail' ? 'FAIL' : 'SEQ'));
        break;
      }
      case 'sequenceStopping':
        setSequenceStatus('Stopping…', 'cancelled');
        break;
      case 'sequenceRunFinished': {
        sequenceRun.running = false;
        const failed = Number(msg.failed || 0), passed = Number(msg.passed || 0);
        if (msg.cancelled) setSequenceStatus('Cancelled', 'cancelled'); else if (failed > 0) setSequenceStatus('FAIL', 'fail'); else setSequenceStatus('PASS', 'pass');
        renderSequenceControls();
        logInfo('Sequence ' + (msg.cancelled ? 'cancelled' : (failed > 0 ? 'FAILED' : 'PASSED')) + ' — ' + passed + ' passed, ' + failed + ' failed', msg.cancelled ? 'seq' : (failed > 0 ? 'err' : 'pass'), msg.cancelled ? 'SEQ' : (failed > 0 ? 'FAIL' : 'PASS'));
        break;
      }
      case 'busy':
        busy(msg.operation, !!msg.busy);
        break;
      case 'error': {
        const entry = pendingTx.shift();
        if (entry) { entry.row.classList.add('failed'); updateEntry(entry, { meta: 'not sent' }); }
        logInfo(msg.message, 'err', 'ERR');
        break;
      }
    }
  });

  // ---------------------------------------------------------------- boot
  applySidebarWidth(); setupSplitter(); switchTab(ui.tab || 'commands'); applyLogOptions();
  $('advancedSettings').classList.toggle('hidden', !ui.advancedOpen);
  $('toggleAdvanced').textContent = ui.advancedOpen ? '⚙ Settings ▴' : '⚙ Settings ▾';
  renderPresets(); applyState(state); resetSequenceStepEditor(); renderSequenceResults(); renderCollections(); renderDevices(); renderSession(); renderStats(); renderEmptyConsole();
  setInterval(renderHistory, 60000); // keep "x min ago" labels fresh
  vscode.postMessage({ type: 'ready' });
})();
