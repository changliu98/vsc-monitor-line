import * as vscode from 'vscode';
import { getSystemMetrics, getCpuCores, getLoadAvg, getUptime, getCpuTemp, getFanSpeed, SystemMetrics, CpuCore } from './systemMetrics';

let statusBarItem: vscode.StatusBarItem;
let updateInterval: ReturnType<typeof setInterval> | undefined;
let panelInstance: vscode.WebviewPanel | undefined;
let lastMetrics: SystemMetrics | undefined;
let lastCores: CpuCore[] = [];

export function activate(context: vscode.ExtensionContext): void {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_SAFE_INTEGER);
    statusBarItem.tooltip = 'System Monitor';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    context.subscriptions.push(
        vscode.commands.registerCommand('systemMonitor.openPanel', openPanel)
    );

    // Baseline reads so first interval shows real delta
    getSystemMetrics();
    getCpuCores();

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('systemMonitor') && lastMetrics) {
                updateStatusBar(lastMetrics, lastCores);
            }
        })
    );

    updateInterval = setInterval(() => {
        const metrics = getSystemMetrics();
        const cores   = getCpuCores();
        lastMetrics = metrics;
        lastCores   = cores;
        updateStatusBar(metrics, cores);
        if (panelInstance) {
            panelInstance.webview.postMessage({
                type: 'update',
                metrics,
                cores,
                loadAvg: getLoadAvg(),
                uptime:  getUptime(),
            });
        }
    }, 2000);

    context.subscriptions.push({ dispose: () => clearInterval(updateInterval) });
}

function updateStatusBar(m: SystemMetrics, cores: CpuCore[]): void {
    const items = vscode.workspace.getConfiguration('systemMonitor')
        .get<string[]>('items', ['cpu', 'mem', 'swp', 'run']);

    const cpu  = String(m.cpuPercent).padStart(3);
    const memU = m.memUsedGB.toFixed(2).padStart(6);
    const memT = m.memTotalGB.toFixed(2).padStart(6);
    const swpU = m.swapUsedGB.toFixed(2).padStart(5);
    const swpT = m.swapTotalGB.toFixed(2).padStart(5);

    const freqCores = cores.filter(c => c.freqMHz > 0);
    const avgGHz = freqCores.length > 0
        ? (freqCores.reduce((s, c) => s + c.freqMHz, 0) / freqCores.length / 1000).toFixed(2) + 'GHz'
        : '';
    const freqPart = avgGHz ? `  ${avgGHz}` : '';

    const parts: string[] = [];
    for (const item of items) {
        switch (item) {
            case 'cpu': parts.push(`$(chip)${cpu}%${freqPart}`); break;
            case 'mem': parts.push(`$(server)${memU}/${memT}G`); break;
            case 'swp': parts.push(`$(archive)${swpU}/${swpT}G`); break;
            case 'run': parts.push(`$(run)${m.running}`); break;
            case 'temp': { const t = getCpuTemp(); if (t >= 0) { parts.push(`$(thermometer)${t}°C`); } break; }
            case 'fan':  { const f = getFanSpeed(); if (f >= 0) { parts.push(`$(dashboard)${f}rpm`); } break; }
        }
    }
    statusBarItem.text = parts.join('    ');
}

function openPanel(): void {
    if (panelInstance) { panelInstance.reveal(); return; }

    panelInstance = vscode.window.createWebviewPanel(
        'systemMonitor', 'System Monitor',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );
    panelInstance.onDidDispose(() => { panelInstance = undefined; });
    panelInstance.webview.html = getPanelHtml();

    setTimeout(() => {
        if (!panelInstance) { return; }
        panelInstance.webview.postMessage({
            type: 'update',
            metrics: getSystemMetrics(),
            cores:   getCpuCores(),
            loadAvg: getLoadAvg(),
            uptime:  getUptime(),
        });
    }, 300);
}

function getPanelHtml(): string {
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: #1a1a1a; color: #d0d0d0; font-family: 'Courier New', monospace; font-size: 13px; }
  body { padding: 10px 14px; display: flex; flex-direction: column; gap: 0; }

  /* ── bar rows ─────────────────────────────── */
  .bar-row {
    display: flex;
    align-items: center;
    height: 18px;
    margin-bottom: 3px;
  }
  .bar-label {
    color: #5af;
    width: 4ch;
    text-align: right;
    flex-shrink: 0;
    margin-right: 1px;
  }
  .bracket { color: #666; flex-shrink: 0; }
  .bar-track {
    flex: 1;
    height: 100%;
    background: #2a2a2a;
    position: relative;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    transition: width 0.5s ease, background-color 0.5s ease;
  }
  .bar-right {
    color: #aaa;
    width: 18ch;
    text-align: right;
    flex-shrink: 0;
    padding-left: 6px;
    white-space: nowrap;
  }

  /* ── divider ──────────────────────────────── */
  .divider { border: none; border-top: 1px solid #333; margin: 6px 0; }

  /* ── info row ─────────────────────────────── */
  #info-row {
    display: flex;
    gap: 28px;
    font-size: 12px;
    color: #999;
    margin-top: 4px;
    flex-wrap: wrap;
  }
</style>
</head>
<body>

<div id="cores-container"></div>

<hr class="divider">

<div class="bar-row">
  <span class="bar-label">Mem</span>
  <span class="bracket">[</span>
  <div class="bar-track">
    <div class="bar-fill" id="mem-fill" style="width:0%;background:#3fb950"></div>
  </div>
  <span class="bracket">]</span>
  <span class="bar-right" id="mem-info">— / —</span>
</div>

<div class="bar-row">
  <span class="bar-label">Swp</span>
  <span class="bracket">[</span>
  <div class="bar-track">
    <div class="bar-fill" id="swp-fill" style="width:0%;background:#58a6ff"></div>
  </div>
  <span class="bracket">]</span>
  <span class="bar-right" id="swp-info">— / —</span>
</div>

<hr class="divider">

<div id="info-row">
  <span id="tasks-span">Tasks: —</span>
  <span id="load-span">Load avg: —</span>
  <span id="uptime-span">Uptime: —</span>
</div>

<script>
  function barColor(p) {
    return p > 80 ? '#f85149' : p > 60 ? '#e3b341' : '#3fb950';
  }
  function fmtUptime(s) {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = Math.floor(s % 60);
    const hms = [h,m,ss].map(n => String(n).padStart(2,'0')).join(':');
    return d > 0 ? d + 'd ' + hms : hms;
  }
  function fmtFreq(mhz) {
    if (!mhz) return '';
    return mhz >= 1000 ? ' ' + (mhz / 1000).toFixed(2) + 'GHz' : ' ' + mhz + 'MHz';
  }

  window.addEventListener('message', ({ data }) => {
    if (data.type !== 'update') { return; }
    const { metrics: m, cores, loadAvg, uptime } = data;

    // ── per-core bars ──────────────────────────
    const container = document.getElementById('cores-container');
    cores.forEach(core => {
      const rowId = 'core-row-' + core.id;
      let row = document.getElementById(rowId);
      if (!row) {
        row = document.createElement('div');
        row.id = rowId;
        row.className = 'bar-row';
        row.innerHTML =
          '<span class="bar-label" style="color:#5af">' + (core.id + 1) + '</span>' +
          '<span class="bracket">[</span>' +
          '<div class="bar-track"><div class="bar-fill" id="cf-' + core.id + '" style="width:0%"></div></div>' +
          '<span class="bracket">]</span>' +
          '<span class="bar-right" id="ci-' + core.id + '"></span>';
        container.appendChild(row);
      }
      const fill = document.getElementById('cf-' + core.id);
      const info = document.getElementById('ci-' + core.id);
      if (fill) { fill.style.width = core.percent + '%'; fill.style.backgroundColor = barColor(core.percent); }
      if (info) { info.textContent = String(core.percent).padStart(3) + '%' + fmtFreq(core.freqMHz); }
    });

    // ── mem / swap ─────────────────────────────
    const memPct = m.memTotalGB > 0 ? (m.memUsedGB / m.memTotalGB * 100) : 0;
    document.getElementById('mem-fill').style.width = memPct.toFixed(1) + '%';
    document.getElementById('mem-info').textContent = m.memUsedGB + 'G / ' + m.memTotalGB + 'G';

    const swpPct = m.swapTotalGB > 0 ? (m.swapUsedGB / m.swapTotalGB * 100) : 0;
    document.getElementById('swp-fill').style.width = swpPct.toFixed(1) + '%';
    document.getElementById('swp-info').textContent = m.swapUsedGB + 'G / ' + m.swapTotalGB + 'G';

    // ── info line ──────────────────────────────
    document.getElementById('tasks-span').textContent  = 'Tasks: ' + m.tasks + ', ' + m.running + ' running';
    document.getElementById('load-span').textContent   = 'Load avg: ' + loadAvg.join('  ');
    document.getElementById('uptime-span').textContent = 'Uptime: ' + fmtUptime(uptime);
  });
</script>
</body>
</html>`;
}

export function deactivate(): void {
    if (updateInterval) { clearInterval(updateInterval); }
}
