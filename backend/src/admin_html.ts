export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Action Fish Shooter Admin</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #070f19;
      --panel: rgba(255,255,255,0.045);
      --panel2: rgba(255,255,255,0.03);
      --border: rgba(255,255,255,0.10);
      --muted: rgba(233,243,255,0.70);
      --accent: #00f2ff;
      --good: #00ff8c;
      --bad: #ff5656;
      --warn: #ffd64a;
      --shadow: rgba(0,0,0,0.25);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      background:
        radial-gradient(1200px 700px at 10% -10%, rgba(0,242,255,0.16), transparent 60%),
        radial-gradient(900px 650px at 95% 5%, rgba(255,214,74,0.10), transparent 55%),
        var(--bg);
      color: #e9f3ff;
    }
    a { color: inherit; text-decoration: none; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
    }

    .app {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 270px 1fr;
    }
    @media (max-width: 980px) {
      .app { grid-template-columns: 1fr; }
    }

    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      padding: 14px 12px;
      border-right: 1px solid rgba(255,255,255,0.08);
      background: linear-gradient(180deg, rgba(11,23,38,0.92), rgba(7,15,25,0.92));
      backdrop-filter: blur(10px);
    }
    @media (max-width: 980px) {
      .sidebar { position: relative; height: auto; border-right: 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 10px 12px;
    }
    .logoDot {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      background: radial-gradient(circle at 30% 30%, #ffffff, rgba(255,255,255,0.0) 55%),
                  linear-gradient(180deg, var(--accent), rgba(0,169,179,0.95));
      box-shadow: 0 0 0 6px rgba(0,242,255,0.08);
    }
    .brandTitle { font-weight: 900; letter-spacing: 0.2px; font-size: 14px; }
    .brandSub { color: var(--muted); font-size: 11px; margin-top: 2px; }

    .nav {
      display: grid;
      gap: 6px;
      padding: 8px 6px;
    }
    .navBtn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 10px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.04);
      cursor: pointer;
      user-select: none;
    }
    .navBtn:hover { border-color: rgba(0,242,255,0.35); background: rgba(0,242,255,0.06); }
    .navBtn.active { border-color: rgba(0,242,255,0.65); background: rgba(0,242,255,0.10); }
    .navIcon {
      width: 28px;
      height: 28px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.10);
      font-weight: 900;
      color: rgba(233,243,255,0.86);
    }
    .navText { font-weight: 800; font-size: 13px; }
    .navDesc { color: var(--muted); font-size: 11px; margin-top: 2px; }
    .navStack { display:flex; flex-direction: column; line-height: 1.15; }

    .content {
      display: grid;
      grid-template-rows: auto 1fr;
      min-width: 0;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: linear-gradient(180deg, rgba(7,15,25,0.92), rgba(7,15,25,0.74));
      backdrop-filter: blur(10px);
    }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .right { margin-left: auto; }
    .pill {
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(0,242,255,0.10);
      border: 1px solid rgba(0,242,255,0.25);
      font-size: 12px;
      color: #c9fbff;
    }
    .pill.good { background: rgba(0,255,140,0.12); border-color: rgba(0,255,140,0.28); color: rgba(210,255,236,0.96); }
    .pill.bad { background: rgba(255,86,86,0.12); border-color: rgba(255,86,86,0.28); color: rgba(255,220,220,0.96); }

    label { font-size: 12px; color: var(--muted); }
    input, select {
      background: rgba(10,19,32,0.90);
      border: 1px solid rgba(255,255,255,0.12);
      color: #e9f3ff;
      border-radius: 12px;
      padding: 8px 10px;
      outline: none;
    }
    input:focus, select:focus {
      border-color: rgba(0,242,255,0.65);
      box-shadow: 0 0 0 3px rgba(0,242,255,0.12);
    }
    button {
      background: linear-gradient(180deg, var(--accent), rgba(0,169,179,0.95));
      color: #041018;
      border: 0;
      border-radius: 12px;
      padding: 9px 12px;
      font-weight: 900;
      cursor: pointer;
    }
    button.secondary {
      background: rgba(255,255,255,0.06);
      color: #e9f3ff;
      border: 1px solid rgba(255,255,255,0.12);
      font-weight: 800;
    }

    .page {
      padding: 16px;
      display: grid;
      gap: 16px;
      min-width: 0;
    }
    .view { display: none; }
    .view.active { display: block; }

    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 14px;
    }
    @media (min-width: 1100px) {
      .grid.cols2 { grid-template-columns: 1fr 1fr; }
      .grid.cols3 { grid-template-columns: 1fr 1fr 1fr; }
    }

    .card {
      background: linear-gradient(180deg, var(--panel), var(--panel2));
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px;
      box-shadow: 0 10px 30px var(--shadow);
      min-width: 0;
    }
    .cardHeader {
      display:flex;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 10px;
    }
    .cardHeader strong { font-size: 13px; letter-spacing: 0.2px; }
    .muted { color: var(--muted); }

    .kpiGrid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }
    @media (min-width: 780px) { .kpiGrid { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 1100px) { .kpiGrid { grid-template-columns: repeat(6, 1fr); } }
    .kpi {
      background: linear-gradient(180deg, rgba(11,23,38,0.90), rgba(8,16,26,0.80));
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 12px;
    }
    .kpiLabel { font-size: 11px; color: var(--muted); letter-spacing: 0.4px; text-transform: uppercase; }
    .kpiValue { margin-top: 6px; font-size: 18px; font-weight: 1000; }
    .kpiSub { margin-top: 4px; font-size: 11px; color: var(--muted); }
    .good { color: var(--good); }
    .bad { color: var(--bad); }

    .tableWrap { overflow: auto; max-height: 560px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 13px; vertical-align: top; }
    th {
      position: sticky;
      top: 0;
      background: rgba(7,15,25,0.92);
      backdrop-filter: blur(8px);
      font-size: 12px;
      color: rgba(233,243,255,0.86);
    }
    .nowrap { white-space: nowrap; }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="logoDot"></div>
        <div>
          <div class="brandTitle">Action Fish Shooter</div>
          <div class="brandSub">Admin Dashboard</div>
        </div>
      </div>

      <nav class="nav">
        <div class="navBtn" data-view="overview">
          <div class="navIcon">O</div>
          <div class="navStack">
            <div class="navText">Overview</div>
            <div class="navDesc">KPI, win/loss, RTP</div>
          </div>
        </div>
        <div class="navBtn" data-view="users">
          <div class="navIcon">U</div>
          <div class="navStack">
            <div class="navText">Users</div>
            <div class="navDesc">Balance, energy, last login</div>
          </div>
        </div>
        <div class="navBtn" data-view="history">
          <div class="navIcon">H</div>
          <div class="navStack">
            <div class="navText">History</div>
            <div class="navDesc">Transactions log</div>
          </div>
        </div>
        <div class="navBtn" data-view="active">
          <div class="navIcon">A</div>
          <div class="navStack">
            <div class="navText">Active</div>
            <div class="navDesc">Seats, connections</div>
          </div>
        </div>
        <div class="navBtn" data-view="audit">
          <div class="navIcon">V</div>
          <div class="navStack">
            <div class="navText">Audit</div>
            <div class="navDesc">Hash-chain verification</div>
          </div>
        </div>
      </nav>
    </aside>

    <section class="content">
      <header class="topbar">
        <div class="row">
          <span class="pill" id="pillStage">stage: -</span>
          <span class="pill" id="pillWindow">window: 24h</span>
          <span class="pill" id="pillStatus">loading...</span>
          <div class="right row">
            <div>
              <label>Admin token</label><br />
              <input id="adminToken" placeholder="(required)" style="width: 240px;" />
            </div>
            <div>
              <label>Auto refresh</label><br />
              <select id="autoRefresh">
                <option value="0">off</option>
                <option value="2000">2s</option>
                <option value="5000" selected>5s</option>
                <option value="10000">10s</option>
              </select>
            </div>
            <button class="secondary" id="refreshBtn">Refresh</button>
          </div>
        </div>
      </header>

      <main class="page">
        <section id="view-overview" class="view">
          <div class="card">
            <div class="row" style="justify-content: space-between;">
              <div class="cardHeader"><strong>Overview</strong> <span class="muted">Summary window</span></div>
              <div class="row">
                <label>Window</label>
                <select id="summaryWindow">
                  <option value="3600000">1h</option>
                  <option value="21600000">6h</option>
                  <option value="43200000">12h</option>
                  <option value="86400000" selected>24h</option>
                  <option value="604800000">7d</option>
                </select>
              </div>
            </div>
            <div class="kpiGrid" style="margin-top: 12px;">
              <div class="kpi"><div class="kpiLabel">Total Users</div><div class="kpiValue" id="kpiTotalUsers">-</div><div class="kpiSub" id="kpiUsersSub">&nbsp;</div></div>
              <div class="kpi"><div class="kpiLabel">Active Users</div><div class="kpiValue" id="kpiActivePlayers">-</div><div class="kpiSub">Seats (server)</div></div>
              <div class="kpi"><div class="kpiLabel">Connections</div><div class="kpiValue" id="kpiConnections">-</div><div class="kpiSub">Socket connections</div></div>
              <div class="kpi"><div class="kpiLabel">Total Bet</div><div class="kpiValue" id="kpiBet">-</div><div class="kpiSub" id="kpiBetEvents">-</div></div>
              <div class="kpi"><div class="kpiLabel">Total Win</div><div class="kpiValue" id="kpiWin">-</div><div class="kpiSub" id="kpiWinEvents">-</div></div>
              <div class="kpi"><div class="kpiLabel">Net / RTP</div><div class="kpiValue" id="kpiNet">-</div><div class="kpiSub" id="kpiRtp">-</div></div>
            </div>
          </div>

          <div class="grid cols2">
            <div class="card">
              <div class="cardHeader"><strong>Top Winners</strong> <span class="muted">Net = win - bet</span></div>
              <div class="tableWrap" style="max-height: 320px;">
                <table>
                  <thead><tr><th>User</th><th class="nowrap">Net</th><th class="nowrap">Bet</th><th class="nowrap">Win</th></tr></thead>
                  <tbody id="topWinnersBody"></tbody>
                </table>
              </div>
            </div>
            <div class="card">
              <div class="cardHeader"><strong>Top Losers</strong> <span class="muted">Net = win - bet</span></div>
              <div class="tableWrap" style="max-height: 320px;">
                <table>
                  <thead><tr><th>User</th><th class="nowrap">Net</th><th class="nowrap">Bet</th><th class="nowrap">Win</th></tr></thead>
                  <tbody id="topLosersBody"></tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section id="view-users" class="view">
          <div class="card">
            <div class="row" style="justify-content: space-between;">
              <div class="cardHeader"><strong>Users</strong> <span class="muted" id="usersCount"></span></div>
              <div class="row">
                <label>Limit</label>
                <input id="usersLimit" value="200" style="width: 90px;" />
              </div>
            </div>
            <div class="row" style="margin-top: 10px;">
              <div>
                <label>UserId</label><br />
                <input id="userFilter" placeholder="P1 / user_..." style="width: 240px;" />
              </div>
              <span class="muted">Press Enter to apply</span>
            </div>
            <div class="tableWrap" style="margin-top: 12px;">
              <table>
                <thead>
                  <tr>
                    <th class="nowrap">UserId</th>
                    <th class="nowrap">Balance</th>
                    <th class="nowrap">Energy</th>
                    <th class="nowrap">Last Login</th>
                  </tr>
                </thead>
                <tbody id="usersBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="view-history" class="view">
          <div class="card">
            <div class="row" style="justify-content: space-between;">
              <div class="cardHeader"><strong>History</strong> <span class="muted" id="txCount"></span></div>
              <div class="row">
                <label>Limit</label>
                <input id="txLimit" value="200" style="width: 90px;" />
              </div>
            </div>
            <div class="grid cols3" style="margin-top: 10px;">
              <div>
                <label>UserId</label><br />
                <input id="txUserFilter" placeholder="(optional) P1" style="width: 100%;" />
              </div>
              <div>
                <label>Type</label><br />
                <input id="txTypeFilter" placeholder="BET / WIN / WIN_LUCKY_ORB ..." style="width: 100%;" />
              </div>
              <div>
                <label>Since (ms or ISO)</label><br />
                <input id="txSince" placeholder="(optional) 2026-05-12T00:00:00Z" style="width: 100%;" />
              </div>
            </div>
            <div class="row" style="margin-top: 10px;">
              <div style="flex: 1;">
                <label>Until (ms or ISO)</label><br />
                <input id="txUntil" placeholder="(optional)" style="width: 100%;" />
              </div>
              <span class="muted">Press Enter to apply filters</span>
            </div>
            <div class="tableWrap" style="margin-top: 12px;">
              <table>
                <thead>
                  <tr>
                    <th class="nowrap">Time</th>
                    <th class="nowrap">UserId</th>
                    <th class="nowrap">Type</th>
                    <th class="nowrap">Amount</th>
                    <th class="nowrap">Before</th>
                    <th class="nowrap">After</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody id="txBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="view-active" class="view">
          <div class="grid cols2">
            <div class="card">
              <div class="cardHeader"><strong>Active Seats</strong> <span class="muted" id="activeSeatsCount"></span></div>
              <div class="tableWrap" style="max-height: 420px;">
                <table>
                  <thead>
                    <tr>
                      <th class="nowrap">Seat</th>
                      <th class="nowrap">UserId</th>
                      <th class="nowrap">Socket</th>
                      <th class="nowrap">Balance</th>
                      <th class="nowrap">Energy</th>
                    </tr>
                  </thead>
                  <tbody id="activeSeatsBody"></tbody>
                </table>
              </div>
            </div>
            <div class="card">
              <div class="cardHeader"><strong>Server</strong> <span class="muted">Health</span></div>
              <div class="row">
                <span class="pill" id="healthUptime">uptime: -</span>
                <span class="pill" id="healthJackpot">jackpot: -</span>
                <span class="pill" id="healthFish">fish: -</span>
              </div>
              <div style="margin-top: 12px;" class="muted">
                Monitoring data juga tersedia di endpoint admin:
                <div><code>/admin/api/metrics</code></div>
              </div>
              <div class="tableWrap" style="margin-top: 12px; max-height: 280px;">
                <table>
                  <thead><tr><th>Metric</th><th class="nowrap">Value</th></tr></thead>
                  <tbody id="metricsBody"></tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section id="view-audit" class="view">
          <div class="card">
            <div class="cardHeader"><strong>Audit Chain</strong> <span class="muted">Verify transactions hash-chain</span></div>
            <div class="row">
              <span class="pill" id="auditPill">status: -</span>
              <span class="pill" id="auditRows">rows: -</span>
              <span class="pill" id="auditBroken">brokenAt: -</span>
            </div>
            <div class="tableWrap" style="margin-top: 12px; max-height: 420px;">
              <table>
                <thead><tr><th>Field</th><th>Value</th></tr></thead>
                <tbody id="auditBody"></tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </section>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const state = { timer: null, activeView: 'overview' };

    (function initToken(){
      const saved = (localStorage.getItem('adminToken') || '').trim();
      const urlTok = (new URLSearchParams(location.search).get('token') || '').trim();
      const field = $('adminToken');
      if (urlTok && !field.value) field.value = urlTok;
      if (saved && !field.value) field.value = saved;
    })();

    function tokenHeader() {
      const t = ($('adminToken').value || '').trim();
      if (!t) return {};
      return { 'Authorization': t.toLowerCase().startsWith('bearer ') ? t : ('Bearer ' + t) };
    }

    async function fetchJson(url) {
      const res = await fetch(url, { headers: tokenHeader() });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(res.status + ' ' + (text || res.statusText));
      }
      return await res.json();
    }

    function fmtMoney(v) {
      const n = Number(v || 0);
      return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtTime(ms) {
      if (!ms) return '';
      try { return new Date(ms).toLocaleString(); } catch { return String(ms); }
    }

    function esc(v) {
      return String(v ?? '').replace(/[&<>\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
    }

    function setStatus(ok, text) {
      const pill = $('pillStatus');
      pill.textContent = text;
      pill.className = 'pill ' + (ok ? 'good' : 'bad');
    }

    function setView(name) {
      state.activeView = name;
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      const el = document.getElementById('view-' + name);
      if (el) el.classList.add('active');
      document.querySelectorAll('.navBtn').forEach(b => {
        const active = b.getAttribute('data-view') === name;
        b.classList.toggle('active', active);
      });
      localStorage.setItem('adminView', name);
    }

    function resolveInitialView() {
      const fromHash = (location.hash || '').replace('#', '').trim();
      if (fromHash) return fromHash;
      const saved = (localStorage.getItem('adminView') || '').trim();
      return saved || 'overview';
    }

    async function loadSummary() {
      const windowMs = parseInt($('summaryWindow').value, 10) || 86400000;
      const until = Date.now();
      const since = until - windowMs;
      const qs = new URLSearchParams();
      qs.set('since', String(since));
      qs.set('until', String(until));
      qs.set('limit', '10');
      const data = await fetchJson('/admin/api/summary?' + qs.toString());

      $('pillStage').textContent = 'stage: ' + (data.stage || '-');
      $('pillWindow').textContent = 'window: ' + Math.round(windowMs / 3600000) + 'h';
      $('pillStage').textContent = 'stage: ' + (data.stage || '-');
      $('pillWindow').textContent = 'window: ' + Math.round(windowMs / 3600000) + 'h';
      $('kpiTotalUsers').textContent = String(data.totalUsers ?? '-');
      $('kpiActivePlayers').textContent = String(data.activePlayers ?? '-');
      $('kpiConnections').textContent = String(data.activeConnections ?? '-');
      $('kpiBet').textContent = fmtMoney(data.tx?.betAmount || 0);
      $('kpiWin').textContent = fmtMoney(data.tx?.winAmount || 0);

      const net = Number(data.tx?.netAmount || 0);
      $('kpiNet').textContent = (net >= 0 ? '+' : '') + fmtMoney(net);
      $('kpiNet').className = 'kpiValue ' + (net >= 0 ? 'good' : 'bad');

      const rtp = Number(data.tx?.rtp || 0);
      $('kpiRtp').textContent = 'RTP ' + (rtp ? (rtp * 100).toFixed(2) + '%' : '0%');
      $('kpiBetEvents').textContent = (data.tx?.betEvents || 0) + ' bet events';
      $('kpiWinEvents').textContent = (data.tx?.winEvents || 0) + ' win events';

      const winners = data.top?.winners || [];
      const losers = data.top?.losers || [];
      $('topWinnersBody').innerHTML = winners.map(r => (
        '<tr>' +
          '<td><code>' + esc(r.userId) + '</code></td>' +
          '<td class=\"nowrap ' + (Number(r.netAmount) >= 0 ? 'good' : 'bad') + '\">' + esc((Number(r.netAmount) >= 0 ? '+' : '') + fmtMoney(r.netAmount)) + '</td>' +
          '<td class=\"nowrap\">' + esc(fmtMoney(r.betAmount)) + '</td>' +
          '<td class=\"nowrap\">' + esc(fmtMoney(r.winAmount)) + '</td>' +
        '</tr>'
      )).join('');
      $('topLosersBody').innerHTML = losers.map(r => (
        '<tr>' +
          '<td><code>' + esc(r.userId) + '</code></td>' +
          '<td class=\"nowrap ' + (Number(r.netAmount) >= 0 ? 'good' : 'bad') + '\">' + esc((Number(r.netAmount) >= 0 ? '+' : '') + fmtMoney(r.netAmount)) + '</td>' +
          '<td class=\"nowrap\">' + esc(fmtMoney(r.betAmount)) + '</td>' +
          '<td class=\"nowrap\">' + esc(fmtMoney(r.winAmount)) + '</td>' +
        '</tr>'
      )).join('');
    }

    async function loadUsers() {
      const userId = ($('userFilter').value || '').trim();
      const limit = parseInt(($('usersLimit').value || '200'), 10) || 200;
      const qs = new URLSearchParams();
      if (userId) qs.set('userId', userId);
      qs.set('limit', String(Math.max(1, Math.min(1000, limit))));
      const data = await fetchJson('/admin/api/users?' + qs.toString());

      $('usersCount').textContent = '(' + data.total + ')';
      const rows = data.users || [];
      $('usersBody').innerHTML = rows.map(u => (
        '<tr>' +
          '<td><code>' + esc(u.userId) + '</code></td>' +
          '<td class=\"nowrap\">' + esc(Number(u.balance).toFixed(2)) + '</td>' +
          '<td class=\"nowrap\">' + esc(Number(u.energy).toFixed(2)) + '</td>' +
          '<td class=\"nowrap\">' + esc(fmtTime(u.lastLogin)) + '</td>' +
        '</tr>'
      )).join('');
    }

    async function loadTx() {
      const userId = ($('txUserFilter').value || '').trim();
      const type = ($('txTypeFilter').value || '').trim();
      const since = ($('txSince').value || '').trim();
      const until = ($('txUntil').value || '').trim();
      const limit = parseInt(($('txLimit').value || '200'), 10) || 200;
      const qs = new URLSearchParams();
      if (userId) qs.set('userId', userId);
      if (type) qs.set('type', type);
      if (since) qs.set('since', since);
      if (until) qs.set('until', until);
      qs.set('limit', String(Math.max(1, Math.min(1000, limit))));
      const data = await fetchJson('/admin/api/transactions?' + qs.toString());

      $('txCount').textContent = '(' + data.total + ')';
      const rows = data.transactions || [];
      $('txBody').innerHTML = rows.map(t => (
        '<tr>' +
          '<td class=\"nowrap\">' + esc(fmtTime(t.timestamp)) + '</td>' +
          '<td><code>' + esc(t.userId) + '</code></td>' +
          '<td class=\"nowrap\">' + esc(t.type) + '</td>' +
          '<td class=\"nowrap\">' + esc(Number(t.amount).toFixed(2)) + '</td>' +
          '<td class=\"nowrap\">' + esc(Number(t.balanceBefore).toFixed(2)) + '</td>' +
          '<td class=\"nowrap\">' + esc(Number(t.balanceAfter).toFixed(2)) + '</td>' +
          '<td><code>' + esc((t.details || '').slice(0, 220)) + '</code></td>' +
        '</tr>'
      )).join('');
    }

    async function loadActiveSeats() {
      const data = await fetchJson('/admin/api/active-users');
      const rows = data.seats || [];
      $('activeSeatsCount').textContent = '(' + rows.length + ')';
      $('activeSeatsBody').innerHTML = rows.map(s => (
        '<tr>' +
          '<td class=\"nowrap\">' + esc(s.seatIndex) + '</td>' +
          '<td><code>' + esc(s.userId) + '</code></td>' +
          '<td><code>' + esc(String(s.socketId || '').slice(0, 10)) + '</code></td>' +
          '<td class=\"nowrap\">' + esc(fmtMoney(s.balance)) + '</td>' +
          '<td class=\"nowrap\">' + esc(fmtMoney(s.energy)) + '</td>' +
        '</tr>'
      )).join('');
    }

    async function loadHealthAndMetrics() {
      const health = await fetchJson('/admin/api/health');
      $('healthUptime').textContent = 'uptime: ' + esc(String(health.uptimeSec || '-')) + 's';
      $('healthJackpot').textContent = 'jackpot: ' + esc(fmtMoney(health.jackpot || 0));
      $('healthFish').textContent = 'fish: ' + esc(String(health.activeFish || 0));

      const metrics = await fetchJson('/admin/api/metrics');
      const m = metrics.metrics || {};
      const rows = [
        ['acceptedConnections', m.acceptedConnections],
        ['rejectedConnections', m.rejectedConnections],
        ['shootEvents', m.shootEvents],
        ['orbEvents', m.orbEvents],
        ['rejectedActions', m.rejectedActions],
        ['fishKilled', m.fishKilled],
        ['payoutTotal', m.payoutTotal],
        ['rateLimitShootHits', m.rateLimitShootHits],
        ['rateLimitOrbHits', m.rateLimitOrbHits]
      ];
      $('metricsBody').innerHTML = rows.map(r => (
        '<tr><td><code>' + esc(r[0]) + '</code></td><td class=\"nowrap\">' + esc(String(r[1] ?? '')) + '</td></tr>'
      )).join('');
    }

    async function loadAudit() {
      const data = await fetchJson('/admin/api/audit');
      const ok = !!data.ok;
      $('auditPill').textContent = 'status: ' + (ok ? 'OK' : 'BROKEN');
      $('auditPill').className = 'pill ' + (ok ? 'good' : 'bad');
      $('auditRows').textContent = 'rows: ' + esc(String(data.chain?.totalRows ?? '-'));
      $('auditBroken').textContent = 'brokenAt: ' + esc(String(data.chain?.brokenAtId ?? '-'));
      const items = [
        ['valid', ok],
        ['totalRows', data.chain?.totalRows],
        ['brokenAtId', data.chain?.brokenAtId],
        ['reason', data.chain?.reason]
      ];
      $('auditBody').innerHTML = items.map(it => (
        '<tr><td><code>' + esc(it[0]) + '</code></td><td><code>' + esc(String(it[1] ?? '')) + '</code></td></tr>'
      )).join('');
    }

    async function refreshAll() {
      try {
        setStatus(true, 'refreshing...');
        await loadSummary();
        if (state.activeView === 'users') await loadUsers();
        if (state.activeView === 'history') await loadTx();
        if (state.activeView === 'active') { await loadActiveSeats(); await loadHealthAndMetrics(); }
        if (state.activeView === 'audit') await loadAudit();
        setStatus(true, 'ok');
      } catch (e) {
        setStatus(false, 'error');
        console.error(e);
      }
    }

    function setupAutoRefresh() {
      if (state.timer) clearInterval(state.timer);
      const ms = parseInt($('autoRefresh').value, 10) || 0;
      if (ms > 0) state.timer = setInterval(refreshAll, ms);
    }

    document.querySelectorAll('.navBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.getAttribute('data-view') || 'overview';
        location.hash = v;
      });
    });

    window.addEventListener('hashchange', () => {
      const v = (location.hash || '').replace('#', '') || 'overview';
      setView(v);
      refreshAll();
    });

    $('refreshBtn').addEventListener('click', refreshAll);
    $('autoRefresh').addEventListener('change', setupAutoRefresh);
    $('summaryWindow').addEventListener('change', refreshAll);

    ['adminToken','userFilter','usersLimit','txUserFilter','txTypeFilter','txSince','txUntil','txLimit'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', refreshAll);
      el.addEventListener('keyup', (e) => { if (e.key === 'Enter') refreshAll(); });
    });

    $('adminToken').addEventListener('change', () => {
      const t = ($('adminToken').value || '').trim();
      if (t) localStorage.setItem('adminToken', t);
      else localStorage.removeItem('adminToken');
    });

    setView(resolveInitialView());
    setupAutoRefresh();
    refreshAll();
  </script>
</body>
</html>`;
