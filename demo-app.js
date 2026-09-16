#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   DemoStudio Mock SaaS Application (Port 3200)
   Used for instant zero-dependency testing of AI demo generation,
   DOM snapshotting, and in-place content customizer.
   ════════════════════════════════════════════════════════════════ */
const http = require('http');

const PORT = 3200;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PulseMetrics — Cloud Analytics</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#0f172a; color:#f8fafc; min-height:100vh; display:flex; flex-direction:column; }
    nav { height:64px; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:space-between; padding:0 32px; background:#1e293b; }
    .logo { font-size:18px; font-weight:700; color:#38bdf8; display:flex; align-items:center; gap:8px; }
    .nav-links { display:flex; gap:20px; }
    .nav-links a { color:#94a3b8; text-decoration:none; font-size:14px; font-weight:500; }
    .nav-links a:hover { color:#fff; }
    .user-pill { font-size:13px; background:rgba(255,255,255,0.08); padding:6px 12px; border-radius:99px; }
    main { flex:1; padding:36px; max-width:1200px; width:100%; margin:0 auto; }
    .header-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:32px; }
    h1 { font-size:26px; font-weight:700; color:#fff; }
    .btn-primary { background:#3b82f6; color:#fff; border:none; border-radius:8px; padding:10px 20px; font-weight:600; cursor:pointer; font-size:14px; transition:background 0.2s; }
    .btn-primary:hover { background:#2563eb; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:20px; margin-bottom:36px; }
    .card { background:#1e293b; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:24px; }
    .card-title { font-size:13px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; }
    .card-value { font-size:32px; font-weight:800; color:#fff; }
    .card-change { font-size:13px; color:#10b981; margin-top:8px; }
    .table-container { background:#1e293b; border:1px solid rgba(255,255,255,0.08); border-radius:12px; overflow:hidden; }
    table { width:100%; border-collapse:collapse; text-align:left; font-size:14px; }
    th { background:rgba(255,255,255,0.03); color:#94a3b8; padding:14px 20px; font-weight:600; border-bottom:1px solid rgba(255,255,255,0.08); }
    td { padding:14px 20px; border-bottom:1px solid rgba(255,255,255,0.04); color:#cbd5e1; }
    .status-badge { display:inline-block; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600; background:rgba(16,185,129,0.15); color:#34d399; }
  </style>
</head>
<body>
  <nav>
    <div class="logo">⚡ PulseMetrics</div>
    <div class="nav-links">
      <a href="#dash" class="active">Dashboard</a>
      <a href="#reports">Analytics</a>
      <a href="#deployments">Deployments</a>
      <a href="#settings">Settings</a>
    </div>
    <div class="user-pill">demo@enterprise.io</div>
  </nav>

  <main>
    <div class="header-row">
      <div>
        <h1 id="page-title">Executive Revenue Pipeline</h1>
        <p style="color:#94a3b8;font-size:14px;margin-top:4px;">Real-time enterprise metrics & conversion velocity</p>
      </div>
      <button id="new-pipeline-btn" class="btn-primary" onclick="alert('New Pipeline created!')">+ Create Pipeline</button>
    </div>

    <div class="grid">
      <div class="card" id="kpi-arr">
        <div class="card-title">Annual Run Rate (ARR)</div>
        <div class="card-value">$4,850,200</div>
        <div class="card-change">↑ +24.8% vs last quarter</div>
      </div>
      <div class="card" id="kpi-conversion">
        <div class="card-title">Conversion Velocity</div>
        <div class="card-value">68.4%</div>
        <div class="card-change">↑ +11.2% speed to close</div>
      </div>
      <div class="card" id="kpi-customers">
        <div class="card-title">Active Enterprise Seats</div>
        <div class="card-value">12,480</div>
        <div class="card-change">↑ +1,240 new this month</div>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Organization</th>
            <th>Tier</th>
            <th>Contract Value</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Acme Global Corp</td>
            <td>Enterprise Tier</td>
            <td>$240,000 / yr</td>
            <td><span class="status-badge">Active</span></td>
          </tr>
          <tr>
            <td>Stripe Payments Inc</td>
            <td>Strategic Partner</td>
            <td>$480,000 / yr</td>
            <td><span class="status-badge">Active</span></td>
          </tr>
          <tr>
            <td>Vercel Cloud</td>
            <td>Growth Scale</td>
            <td>$120,000 / yr</td>
            <td><span class="status-badge">Active</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('⚡ PulseMetrics Mock App running on http://localhost:' + PORT);
});
