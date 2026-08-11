// ────────────────────────────────────────────────────────────────────────────
// Dashboard frontend assets (embedded)
//
// These are inlined as strings (not loose files in a public/ folder) so the
// single self-contained .exe can serve the UI with no external files on disk.
// Keep the inner content free of backticks and ${} so they embed cleanly.
// ────────────────────────────────────────────────────────────────────────────

export const STYLES_CSS = `
:root {
  --bg: #0f1115;
  --panel: #171a21;
  --panel2: #1f242e;
  --text: #e6e8ec;
  --muted: #8b93a1;
  --border: #2a3038;
  --accent: #4f8cff;
  --pos: #2ecc71;
  --neg: #e74c3c;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}
.topbar {
  display: flex; align-items: baseline; gap: 12px;
  padding: 12px 18px; background: var(--panel); border-bottom: 1px solid var(--border);
}
.logo { font-weight: 600; font-size: 16px; }
.muted { color: var(--muted); font-size: 12px; }
.layout { display: flex; min-height: calc(100vh - 49px); }
.sidebar {
  width: 200px; flex: 0 0 200px; background: var(--panel);
  border-right: 1px solid var(--border); padding: 10px;
  display: flex; flex-direction: column; gap: 4px;
}
.nav-btn {
  text-align: left; background: transparent; color: var(--text);
  border: 1px solid transparent; border-radius: 8px; padding: 8px 10px;
  cursor: pointer; font-size: 13px;
}
.nav-btn:hover { background: var(--panel2); }
.nav-btn.active { background: var(--panel2); border-color: var(--accent); color: #fff; }
.content { flex: 1; padding: 18px; overflow: auto; }
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.toolbar h1 { font-size: 18px; margin: 0; }
.status { color: var(--muted); font-size: 12px; }
.symbol {
  background: var(--panel2); border: 1px solid var(--border); color: var(--text);
  border-radius: 8px; padding: 6px 10px;
}
.refresh {
  background: var(--accent); color: #fff; border: none; border-radius: 8px;
  padding: 6px 14px; cursor: pointer;
}
.output { margin-top: 6px; }
table {
  border-collapse: collapse; width: 100%; background: var(--panel);
  border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
}
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 13px; }
th { background: var(--panel2); color: var(--muted); text-transform: capitalize; font-weight: 600; }
td.pos { color: var(--pos); }
td.neg { color: var(--neg); }
tr.cat-long td:first-child { border-left: 3px solid var(--pos); }
tr.cat-short td:first-child { border-left: 3px solid var(--neg); }
tr.cat-unwind td:first-child { border-left: 3px solid #e67e22; }
tr.cat-cover td:first-child { border-left: 3px solid #3498db; }
tr.cat-neutral td:first-child { border-left: 3px solid var(--muted); }
.chain-summary { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; padding: 10px 12px; background: var(--panel2); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 10px; font-size: 13px; }
.chain-summary .cs-sym { font-size: 15px; font-weight: 700; }
.chain-summary b { color: var(--text); }
.chain-scroll { overflow-x: auto; }
table.chain th, table.chain td { padding: 6px 8px; font-size: 12px; text-align: right; white-space: nowrap; }
table.chain th.call-h { color: var(--pos); }
table.chain th.put-h { color: var(--neg); }
table.chain th.strike-h, table.chain td.strike { text-align: center; background: var(--panel2); font-weight: 700; }
table.chain tr.atm { background: rgba(127, 182, 255, 0.08); }
table.chain td.empty { color: var(--muted); }
.hint { margin-top: 14px; }
.warn-text { color: #f0a85a; }
.log-filter {
  background: var(--panel2); border: 1px solid var(--border); color: var(--text);
  border-radius: 8px; padding: 6px 10px; font-size: 13px;
}
.auto-toggle {
  display: inline-flex; align-items: center; gap: 6px; color: var(--muted);
  font-size: 12px; cursor: pointer; user-select: none;
}
.log-empty { margin: 18px 0; }
.badge {
  display: inline-block; padding: 2px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
}
.badge-ai { background: #16304d; color: #7fb6ff; }
.badge-request { background: #14352a; color: #6fe0a0; }
.badge-network { background: #431f1f; color: #ff9b9b; }
.badge-nse { background: #43340f; color: #ffd37f; }
.badge-error { background: #431616; color: #ff7f7f; }
.badge-info { background: #232a36; color: #9fb0c8; }
.badge-debug { background: #232a36; color: #9fb0c8; }
.badge.lvl-error { box-shadow: 0 0 0 1px #ff5a5a inset; }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
td.msg { white-space: pre-wrap; word-break: break-word; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; max-width: 640px; }
.card h2 { font-size: 15px; margin: 4px 0 8px; }
.card label { display: block; font-size: 12px; color: var(--muted); margin: 12px 0 4px; }
.card .symbol { width: 100%; box-sizing: border-box; }
.card hr { border: none; border-top: 1px solid var(--border); margin: 18px 0; }
.card .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.status-ok { color: var(--pos); }
.status-bad { color: var(--neg); }
`;

export const INDEX_HTML = `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>NSE Dashboard</title>
<link rel="stylesheet" href="/styles.css" />
</head>
<body>
<header class="topbar">
  <span class="logo">NSE Dashboard</span>
  <span class="muted">local viewer for your options tool</span>
</header>
<div class="layout">
  <nav class="sidebar">
    <button class="nav-btn active" data-route="indices/live" data-label="Live Indices">Live Indices</button>
    <button class="nav-btn" data-route="chain/option" data-label="Option Chain">Option Chain</button>
    <button class="nav-btn" data-route="fno/futures" data-label="Futures Live">Futures Live</button>
    <button class="nav-btn" data-route="fno/oi-vs-price" data-label="OI vs Price">OI vs Price</button>
    <button class="nav-btn" data-route="fno/change-in-oi" data-label="Change in OI">Change in OI</button>
    <button class="nav-btn" data-route="fno/fii-stats" data-label="FII/DII F&O">FII/DII F&O</button>
    <button class="nav-btn" data-route="fno/most-active" data-label="Most Active">Most Active</button>
    <button class="nav-btn" data-route="fii-di/activity" data-label="FII/DII Cash">FII/DII Cash</button>
    <button class="nav-btn" data-route="vix" data-label="India VIX">India VIX</button>
    <button class="nav-btn" data-route="breadth" data-label="Market Breadth">Market Breadth</button>
    <button class="nav-btn" data-route="week52" data-label="52-Week High/Low">52-Week High/Low</button>
    <button class="nav-btn" data-route="lot-sizes" data-label="Lot Sizes">Lot Sizes</button>
    <button class="nav-btn" data-route="logs" data-label="Logs">Logs</button>
    <button class="nav-btn" data-route="settings/upstox" data-label="Broker Setup">Broker Setup</button>
  </nav>
  <main class="content">
    <div class="toolbar" id="toolbar">
      <h1 id="viewTitle">Live Indices</h1>
      <span id="status" class="status">-</span>
      <span id="symbolWrap">
        <input id="symbolInput" class="symbol" type="text" placeholder="symbol / index (e.g. NIFTY, BANKNIFTY)" />
      </span>
      <select id="logFilter" class="log-filter" style="display:none">
        <option value="">All activity</option>
        <option value="ai">AI calls (Claude)</option>
        <option value="request">Page requests</option>
        <option value="network">Network errors</option>
        <option value="nse">NSE errors</option>
        <option value="error">All errors</option>
        <option value="info">Info / status</option>
      </select>
      <label id="logAutoWrap" class="auto-toggle" style="display:none">
        <input id="logAuto" type="checkbox" checked /> Auto-refresh (2s)
      </label>
      <button id="refreshBtn" class="refresh">Refresh</button>
    </div>
    <div id="output" class="output"></div>
    <p id="globalHint" class="hint muted">Data is fetched live from Upstox. First load may take a moment. Green = up, red = down. OI-vs-Price rows are color-coded by buildup type.</p>
  </main>
</div>
<script src="/app.js"></script>
</body>
</html>
`;

export const APP_JS = `
'use strict';

var toolbar = document.getElementById('toolbar');
var symbolInput = document.getElementById('symbolInput');
var refreshBtn = document.getElementById('refreshBtn');
var viewTitle = document.getElementById('viewTitle');
var statusLine = document.getElementById('status');
var output = document.getElementById('output');

var logFilter = document.getElementById('logFilter');
var logAuto = document.getElementById('logAuto');
var logAutoWrap = document.getElementById('logAutoWrap');
var symbolWrap = document.getElementById('symbolWrap');
var globalHint = document.getElementById('globalHint');
var logTimer = null;

var currentRoute = 'indices/live';
var currentLabel = 'Live Indices';

function paramKeyFor(route) {
  if (route.indexOf('fno/') === 0 || route === 'breadth') return 'index';
  if (route === 'chain/option') return 'symbol';
  return null;
}

function buildQuery() {
  var key = paramKeyFor(currentRoute);
  var val = (symbolInput && symbolInput.value || '').trim();
  if (key && val) return encodeURIComponent(key) + '=' + encodeURIComponent(val);
  return '';
}

function setActive(btn) {
  var all = document.querySelectorAll('.nav-btn');
  for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
  btn.classList.add('active');
}

function load(route, label, btn) {
  stopLogTimer();
  currentRoute = route;
  currentLabel = label;
  if (btn) setActive(btn);
  viewTitle.textContent = label;
  var isLogs = (route === 'logs');
  var isSettings = (route === 'settings/upstox');
  if (!isSettings) setLogsToolbar(isLogs);
  symbolWrap.style.display = (isLogs || isSettings) ? 'none' : '';
  globalHint.style.display = isLogs ? '' : (isSettings ? 'none' : '');
  if (isSettings) {
    if (logFilter) logFilter.style.display = 'none';
    if (logAutoWrap) logAutoWrap.style.display = 'none';
  }
  statusLine.textContent = 'Loading...';
  output.innerHTML = '';
  if (isLogs) { startLogView(); return; }
  if (isSettings) { renderSettings(); return; }
  var q = buildQuery();
  var url = '/api/' + route + (q ? '?' + q : '');
  fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (body) { render(body); })
    .catch(function (e) { statusLine.textContent = 'Error: ' + e.message; });
}

function render(body) {
  if (!body.ok) {
    statusLine.textContent = 'Error: ' + (body.error || 'unknown');
    return;
  }
  statusLine.textContent = 'OK';
  if (isOptionChain(body.data)) { renderOptionChain(body.data); return; }
  var rows = extractRows(body.data);
  if (rows === null) {
    renderKeyValue(body.data);
    return;
  }
  if (!rows.length) {
    output.innerHTML = '<p class="muted">No rows returned.</p>';
    return;
  }
  renderTable(rows);
}

function extractRows(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    var keys = ['contracts', 'items', 'entries', 'data', 'results', 'constituents', 'rows'];
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(data[keys[i]])) return data[keys[i]];
    }
  }
  return null;
}

function isObject(v) { return v && typeof v === 'object'; }

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (isObject(v)) return JSON.stringify(v);
  return String(v);
}

function categoryClass(cat) {
  var c = String(cat).toLowerCase();
  if (c.indexOf('long buildup') !== -1) return 'cat-long';
  if (c.indexOf('short buildup') !== -1) return 'cat-short';
  if (c.indexOf('long unwinding') !== -1) return 'cat-unwind';
  if (c.indexOf('short covering') !== -1) return 'cat-cover';
  if (c.indexOf('neutral') !== -1) return 'cat-neutral';
  return '';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderTable(rows) {
  var cols = [];
  for (var k in rows[0]) {
    if (cols.indexOf(k) === -1) cols.push(k);
  }
  var html = '<table><thead><tr>';
  for (var i = 0; i < cols.length; i++) html += '<th>' + escapeHtml(cols[i]) + '</th>';
  html += '</tr></thead><tbody>';
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var cat = row.category;
    var rowCls = cat ? ' class="' + categoryClass(cat) + '"' : '';
    html += '<tr' + rowCls + '>';
    for (var j = 0; j < cols.length; j++) {
      var val = row[cols[j]];
      var cellCls = '';
      if ((cols[j] === 'change' || cols[j] === 'pChange' || cols[j] === 'changeInOi' || cols[j] === 'oiChangePct') && typeof val === 'number') {
        cellCls = val >= 0 ? 'pos' : 'neg';
      }
      if (cellCls) cellCls = ' class="' + cellCls + '"';
      html += '<td' + cellCls + '>' + escapeHtml(cellText(val)) + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  output.innerHTML = html;
}

function renderKeyValue(data) {
  var html = '<table><tbody>';
  for (var k in data) {
    if (isObject(data[k])) continue;
    html += '<tr><th>' + escapeHtml(k) + '</th><td>' + escapeHtml(cellText(data[k])) + '</td></tr>';
  }
  html += '</tbody></table>';
  output.innerHTML = html;
}

function fmtInt(v) {
  if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) return '-';
  try { return Math.round(v).toLocaleString('en-IN'); } catch (e) { return String(Math.round(v)); }
}
function fmtPrice(v) {
  if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) return '-';
  try { return Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  catch (e) { return Number(v).toFixed(2); }
}
function isOptionChain(data) {
  return !!(data && Array.isArray(data.rows) && Array.isArray(data.strikePrices));
}
function renderOptionChain(data) {
  var rows = (data.rows || []);
  // Highlight the At-The-Money strike (closest to the underlying spot).
  var spot = data.underlyingValue || 0;
  var atm = null, best = Infinity;
  for (var i = 0; i < rows.length; i++) {
    var d = Math.abs(rows[i].strikePrice - spot);
    if (d < best) { best = d; atm = rows[i].strikePrice; }
  }
  // Call columns (left→right) and Put columns (left→right), strike in the middle.
  var callCols = [
    { k: 'openInterest', l: 'OI', int: true },
    { k: 'changeinOpenInterest', l: 'Chg OI', int: true, color: true },
    { k: 'totalTradedVolume', l: 'Vol', int: true },
    { k: 'impliedVolatility', l: 'IV', dec: 2 },
    { k: 'lastPrice', l: 'LTP', dec: 2 },
    { k: 'delta', l: 'Δ', dec: 2 },
    { k: 'gamma', l: 'Γ', dec: 4 },
    { k: 'theta', l: 'Θ', dec: 2 },
    { k: 'vega', l: 'V', dec: 2 },
    { k: 'bidPrice', l: 'Bid', dec: 2 },
    { k: 'askPrice', l: 'Ask', dec: 2 }
  ];
  var putCols = [
    { k: 'bidPrice', l: 'Bid', dec: 2 },
    { k: 'askPrice', l: 'Ask', dec: 2 },
    { k: 'delta', l: 'Δ', dec: 2 },
    { k: 'gamma', l: 'Γ', dec: 4 },
    { k: 'theta', l: 'Θ', dec: 2 },
    { k: 'vega', l: 'V', dec: 2 },
    { k: 'impliedVolatility', l: 'IV', dec: 2 },
    { k: 'lastPrice', l: 'LTP', dec: 2 },
    { k: 'totalTradedVolume', l: 'Vol', int: true },
    { k: 'changeinOpenInterest', l: 'Chg OI', int: true, color: true },
    { k: 'openInterest', l: 'OI', int: true }
  ];
  function cellHtml(leg, col) {
    if (!leg) return '<td class="empty">-</td>';
    var v = leg[col.k];
    var cls = '';
    if (col.color && typeof v === 'number') cls = v >= 0 ? ' class="pos"' : ' class="neg"';
    var txt;
    if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) txt = '-';
    else if (col.int) txt = fmtInt(v);
    else txt = fmtPrice(v);
    return '<td' + cls + '>' + escapeHtml(txt) + '</td>';
  }
  var html = '<div class="chain-summary">'
    + '<span class="cs-sym">' + escapeHtml(data.symbol) + '</span>'
    + '<span>Spot <b>' + fmtPrice(data.underlyingValue) + '</b></span>'
    + '<span>Expiry <b>' + escapeHtml(data.expiryDate) + '</b></span>'
    + '<span>CE OI <b>' + fmtInt(data.totalCEOpenInterest) + '</b></span>'
    + '<span>PE OI <b>' + fmtInt(data.totalPEOpenInterest) + '</b></span>'
    + '<span>CE Vol <b>' + fmtInt(data.totalCEVolume) + '</b></span>'
    + '<span>PE Vol <b>' + fmtInt(data.totalPEVolume) + '</b></span>'
    + '<span class="muted">as of ' + escapeHtml(formatTs(data.timestamp)) + '</span>'
    + '</div>';
  html += '<div class="chain-scroll"><table class="chain"><thead><tr>';
  for (var c = 0; c < callCols.length; c++) html += '<th class="call-h">' + callCols[c].l + '</th>';
  html += '<th class="strike-h">Strike</th>';
  for (var c2 = 0; c2 < putCols.length; c2++) html += '<th class="put-h">' + putCols[c2].l + '</th>';
  html += '</tr></thead><tbody>';
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var atmCls = (row.strikePrice === atm) ? ' class="atm"' : '';
    html += '<tr' + atmCls + '>';
    for (var c = 0; c < callCols.length; c++) html += cellHtml(row.CE, callCols[c]);
    html += '<td class="strike">' + escapeHtml(fmtInt(row.strikePrice)) + '</td>';
    for (var c2 = 0; c2 < putCols.length; c2++) html += cellHtml(row.PE, putCols[c2]);
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  output.innerHTML = html;
}

function formatTs(iso) {
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  } catch (e) { return iso; }
}

function badgeClassFor(category) {
  switch (category) {
    case 'ai': return 'badge-ai';
    case 'request': return 'badge-request';
    case 'network': return 'badge-network';
    case 'nse': return 'badge-nse';
    case 'error': return 'badge-error';
    case 'info': return 'badge-info';
    case 'debug': return 'badge-debug';
    default: return 'badge-info';
  }
}

function currentLogFilter() {
  return (logFilter && logFilter.value) ? logFilter.value : '';
}

function setLogsToolbar(isLogs) {
  if (symbolWrap) symbolWrap.style.display = isLogs ? 'none' : '';
  if (logFilter) logFilter.style.display = isLogs ? '' : 'none';
  if (logAutoWrap) logAutoWrap.style.display = isLogs ? '' : 'none';
  if (globalHint) globalHint.style.display = isLogs ? 'none' : '';
}

function stopLogTimer() {
  if (logTimer) { clearInterval(logTimer); logTimer = null; }
}

function renderLogs(entries) {
  var n = entries.length;
  statusLine.textContent = n + ' event' + (n === 1 ? '' : 's') + ' shown';
  if (!n) {
    output.innerHTML = '<p class="muted log-empty">No log entries yet. Use the tool in Claude Desktop, or browse this dashboard — activity shows up here live.</p>';
    return;
  }
  var html = '<table><thead><tr><th>Time</th><th>Type</th><th>Message</th></tr></thead><tbody>';
  for (var i = 0; i < n; i++) {
    var e = entries[i];
    var lvl = e.level || 'info';
    var cat = e.category || 'info';
    var msgCls = (lvl === 'error') ? ' class="neg"' : (lvl === 'warn' ? ' class="warn-text"' : '');
    var lvlBadge = (lvl === 'error') ? ' lvl-error' : '';
    html += '<tr class="log-row">'
      + '<td class="mono">' + escapeHtml(formatTs(e.ts || '')) + '</td>'
      + '<td><span class="badge ' + badgeClassFor(cat) + lvlBadge + '">' + escapeHtml(cat) + '</span></td>'
      + '<td class="msg"' + msgCls + '>' + escapeHtml(e.message || '') + '</td>'
      + '</tr>';
  }
  html += '</tbody></table>';
  output.innerHTML = html;
}

function refreshLogs() {
  var f = currentLogFilter();
  var url = '/api/logs?limit=400' + (f ? '&filter=' + encodeURIComponent(f) : '');
  fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (body) {
      if (!body.ok) { statusLine.textContent = 'Error: ' + (body.error || 'unknown'); return; }
      renderLogs(body.data || []);
    })
    .catch(function (e) { statusLine.textContent = 'Error: ' + e.message; });
}

function startLogView() {
  refreshLogs();
  stopLogTimer();
  if (logAuto && logAuto.checked) {
    logTimer = setInterval(function () {
      if (document.hidden) return;
      refreshLogs();
    }, 2000);
  }
}

if (logFilter) logFilter.addEventListener('change', function () {
  if (currentRoute === 'logs') startLogView();
});
if (logAuto) logAuto.addEventListener('change', function () {
  if (currentRoute === 'logs') startLogView();
});

var navBtns = document.querySelectorAll('.nav-btn');
for (var n = 0; n < navBtns.length; n++) {
  navBtns[n].addEventListener('click', function () {
    load(this.getAttribute('data-route'), this.getAttribute('data-label'), this);
  });
}
if (refreshBtn) refreshBtn.addEventListener('click', function () { load(currentRoute, currentLabel, null); });
if (symbolInput) symbolInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') load(currentRoute, currentLabel, null); });

function renderSettings() {
  statusLine.textContent = '-';
  globalHint.style.display = 'none';
  output.innerHTML =
    '<div class="card">' +
    '<h2>Upstox Connection</h2>' +
    '<p class="muted">Connect your Upstox account so the tool pulls option-chain and market data straight from the broker, with no NSE anti-bot blocking. Your key and secret stay in the git-ignored .env file on this computer.</p>' +
    '<label>API Key</label>' +
    '<input id="upKey" class="symbol" type="text" placeholder="paste your Upstox API Key" />' +
    '<label>API Secret</label>' +
    '<input id="upSecret" class="symbol" type="text" placeholder="paste your Upstox API Secret" />' +
    '<div class="row" style="margin-top:10px"><button id="upSave" class="refresh">Save Credentials</button> <span id="upSaveStatus" class="status"></span></div>' +
    '<hr/>' +
    '<h2>Authorize</h2>' +
    '<p class="muted">After saving, click Connect, log in to Upstox in the popup, and approve. The dashboard catches the code automatically.</p>' +
    '<button id="upConnect" class="refresh">Connect to Upstox</button> <span id="upConnectStatus" class="status"></span>' +
    '<div id="upLinkWrap" class="row" style="display:none;margin-top:8px"></div>' +
    '<hr/>' +
    '<p class="muted">Alternative: if the automatic catch does not work, copy the full redirect URL from your browser after login and paste it below.</p>' +
    '<input id="upCodeUrl" class="symbol" type="text" placeholder="https://127.0.0.1:8787/upstox/callback?code=..." />' +
    '<div class="row" style="margin-top:8px"><button id="upPaste" class="refresh">Use pasted URL</button> <span id="upPasteStatus" class="status"></span></div>' +
    '<hr/>' +
    '<h2>Status</h2>' +
    '<div id="upStatus"></div>' +
    '</div>';
  wireSettings();
  refreshUpstoxStatus();
}

function wireSettings() {
  var saveBtn = document.getElementById('upSave');
  var connectBtn = document.getElementById('upConnect');
  var pasteBtn = document.getElementById('upPaste');
  if (saveBtn) saveBtn.addEventListener('click', function () {
    var k = document.getElementById('upKey').value.trim();
    var s = document.getElementById('upSecret').value.trim();
    var st = document.getElementById('upSaveStatus');
    if (!k || !s) { st.textContent = 'Enter both key and secret.'; st.className = 'status status-bad'; return; }
    fetch('/api/upstox/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: k, apiSecret: s }) })
      .then(function (r) { return r.json(); })
      .then(function (b) { st.textContent = b.ok ? 'Saved.' : ('Error: ' + (b.error || '')); st.className = 'status ' + (b.ok ? 'status-ok' : 'status-bad'); })
      .catch(function (e) { st.textContent = 'Error: ' + e.message; st.className = 'status status-bad'; });
  });
  if (connectBtn) connectBtn.addEventListener('click', function () {
    var st = document.getElementById('upConnectStatus');
    fetch('/api/upstox/connect')
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (!b.ok) { st.textContent = 'Error: ' + (b.error || ''); st.className = 'status status-bad'; return; }
        st.textContent = 'Opened login.'; st.className = 'status status-ok';
        var wrap = document.getElementById('upLinkWrap');
        wrap.innerHTML = '<a class="refresh" href="' + b.url + '" target="_blank" rel="noopener">Open Upstox login</a>';
        wrap.style.display = '';
        window.open(b.url, '_blank');
        pollUpstoxStatus();
      })
      .catch(function (e) { st.textContent = 'Error: ' + e.message; st.className = 'status status-bad'; });
  });
  if (pasteBtn) pasteBtn.addEventListener('click', function () {
    var url = document.getElementById('upCodeUrl').value.trim();
    var st = document.getElementById('upPasteStatus');
    var m = url.match(/[?&]code=([^&]+)/);
    var code = m ? decodeURIComponent(m[1]) : url;
    if (!code) { st.textContent = 'No code found in that URL.'; st.className = 'status status-bad'; return; }
    fetch('/api/upstox/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) })
      .then(function (r) { return r.json(); })
      .then(function (b) { st.textContent = b.ok ? 'Connected.' : ('Error: ' + (b.error || '')); st.className = 'status ' + (b.ok ? 'status-ok' : 'status-bad'); refreshUpstoxStatus(); })
      .catch(function (e) { st.textContent = 'Error: ' + e.message; st.className = 'status status-bad'; });
  });
}

var upPoll = null;
function pollUpstoxStatus() {
  if (upPoll) clearInterval(upPoll);
  upPoll = setInterval(function () {
    if (document.hidden) return;
    refreshUpstoxStatus(function (connected) { if (connected && upPoll) { clearInterval(upPoll); upPoll = null; } });
  }, 2000);
}

function refreshUpstoxStatus(done) {
  fetch('/api/upstox/status')
    .then(function (r) { return r.json(); })
    .then(function (b) {
      if (!b.ok) { setStatusText('Error: ' + (b.error || '')); if (done) done(false); return; }
      var d = b.data;
      var html = '<p>Configured: <b class="' + (d.configured ? 'status-ok' : 'status-bad') + '">' + (d.configured ? 'Yes' : 'No') + '</b></p>' +
        '<p>Connected: <b class="' + (d.connected ? 'status-ok' : 'status-bad') + '">' + (d.connected ? 'Yes' : 'No') + '</b></p>' +
        '<p>Auto-renews daily: <b class="' + (d.canAutoRenew ? 'status-ok' : 'status-bad') + '">' + (d.canAutoRenew ? 'Yes' : 'No') + '</b></p>' +
        '<p class="muted">Redirect URI: ' + d.redirectUri + '</p>';
      var el = document.getElementById('upStatus');
      if (el) el.innerHTML = html;
      if (done) done(d.connected);
    })
    .catch(function (e) { setStatusText('Error: ' + e.message); if (done) done(false); });
}

function setStatusText(t) {
  var el = document.getElementById('upStatus');
  if (el) el.textContent = t;
}

load('indices/live', 'Live Indices', document.querySelector('.nav-btn'));
`;
