import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

export interface SystemMetrics {
    cpuPercent: number;
    memUsedGB: number;
    memTotalGB: number;
    swapUsedGB: number;
    swapTotalGB: number;
    tasks: number;
    threads: number;
    running: number;
}

export interface CpuCore {
    id: number;
    percent: number;
    freqMHz: number;
}

// ── CPU ───────────────────────────────────────────────────────────

interface CoreTimes { total: number; idle: number; }

let prevAggregate: CoreTimes | null = null;
const prevCoreTimes = new Map<number, CoreTimes>();

function osCpuTimes(): (CoreTimes & { speedMHz: number })[] {
    return os.cpus().map(cpu => {
        const t = cpu.times;
        const total = t.user + t.nice + t.sys + t.idle + t.irq;
        return { total, idle: t.idle, speedMHz: cpu.speed };
    });
}

export function getCpuPercent(): number {
    const cores = osCpuTimes();
    const curr = cores.reduce<CoreTimes>((a, b) => ({ total: a.total + b.total, idle: a.idle + b.idle }), { total: 0, idle: 0 });
    if (!prevAggregate) { prevAggregate = curr; return 0; }
    const td = curr.total - prevAggregate.total;
    const id = curr.idle - prevAggregate.idle;
    prevAggregate = curr;
    return td === 0 ? 0 : Math.max(0, Math.min(100, Math.round((1 - id / td) * 100)));
}

export function getCpuCores(): CpuCore[] {
    return osCpuTimes().map((cpu, id) => {
        const prev = prevCoreTimes.get(id);
        let percent = 0;
        if (prev && cpu.total > prev.total) {
            percent = Math.max(0, Math.min(100,
                Math.round((1 - (cpu.idle - prev.idle) / (cpu.total - prev.total)) * 100)));
        }
        prevCoreTimes.set(id, { total: cpu.total, idle: cpu.idle });

        // Linux: real-time freq from sysfs; others: os.cpus() speed baseline
        let freqMHz = cpu.speedMHz;
        if (process.platform === 'linux') {
            try {
                const raw = fs.readFileSync(`/sys/devices/system/cpu/cpu${id}/cpufreq/scaling_cur_freq`, 'utf8');
                freqMHz = Math.round(parseInt(raw.trim(), 10) / 1000);
            } catch { /* sysfs not available, keep os speed */ }
        }

        return { id, percent, freqMHz };
    });
}

// ── Memory & Swap ─────────────────────────────────────────────────

// Windows: PowerShell is slow (~500ms), cache swap for 10s
let winSwapCache: { usedGB: number; totalGB: number; ts: number } | null = null;

function getWindowsSwap(): { usedGB: number; totalGB: number } {
    const now = Date.now();
    if (winSwapCache && now - winSwapCache.ts < 10_000) {
        return winSwapCache;
    }
    try {
        const out = execSync(
            'powershell -NoProfile -NonInteractive -Command "$p=Get-CimInstance Win32_PageFileUsage;\'$($p.CurrentUsage) $($p.AllocatedBaseSize)\'"',
            { encoding: 'utf8', timeout: 4000 }
        ).trim();
        const [used, total] = out.split(' ').map(Number);
        winSwapCache = { usedGB: parseFloat((used / 1024).toFixed(2)), totalGB: parseFloat((total / 1024).toFixed(2)), ts: now };
    } catch {
        winSwapCache = { usedGB: 0, totalGB: 0, ts: now };
    }
    return winSwapCache;
}

export function getMemoryInfo(): Pick<SystemMetrics, 'memUsedGB' | 'memTotalGB' | 'swapUsedGB' | 'swapTotalGB'> {
    const GB = 1024 ** 3;

    if (process.platform === 'linux') {
        try {
            const lines = fs.readFileSync('/proc/meminfo', 'utf8').split('\n');
            const getKB = (key: string) => {
                const l = lines.find(x => x.startsWith(key + ':'));
                return l ? parseInt(l.split(/\s+/)[1], 10) : 0;
            };
            const memTotal = getKB('MemTotal'), memAvail = getKB('MemAvailable');
            const swapTotal = getKB('SwapTotal'), swapFree = getKB('SwapFree');
            const K = 1024 * 1024;
            return {
                memUsedGB:   parseFloat(((memTotal - memAvail) / K).toFixed(2)),
                memTotalGB:  parseFloat((memTotal / K).toFixed(2)),
                swapUsedGB:  parseFloat(((swapTotal - swapFree) / K).toFixed(2)),
                swapTotalGB: parseFloat((swapTotal / K).toFixed(2)),
            };
        } catch { /* fall through */ }
    }

    // macOS / Windows base memory
    const memTotalGB  = parseFloat((os.totalmem() / GB).toFixed(2));
    const memUsedGB   = parseFloat(((os.totalmem() - os.freemem()) / GB).toFixed(2));
    let swapUsedGB = 0, swapTotalGB = 0;

    if (process.platform === 'darwin') {
        try {
            const out = execSync('sysctl vm.swapusage', { encoding: 'utf8', timeout: 1000 });
            // "vm.swapusage: total = 2048.00M  used = 512.00M  free = 1536.00M  (encrypted)"
            const m = out.match(/total = ([\d.]+)(\w+).*?used = ([\d.]+)(\w+)/);
            if (m) {
                const toGB = (v: number, u: string) => u.startsWith('G') ? v : v / 1024;
                swapTotalGB = parseFloat(toGB(parseFloat(m[1]), m[2]).toFixed(2));
                swapUsedGB  = parseFloat(toGB(parseFloat(m[3]), m[4]).toFixed(2));
            }
        } catch { /* swap unavailable */ }
    }

    if (process.platform === 'win32') {
        ({ usedGB: swapUsedGB, totalGB: swapTotalGB } = getWindowsSwap());
    }

    return { memUsedGB, memTotalGB, swapUsedGB, swapTotalGB };
}

// ── Process count ─────────────────────────────────────────────────

// Windows/macOS: cache process count for 4s to avoid spawning every 2s
let procCache: { tasks: number; running: number; ts: number } | null = null;

function getProcessCount(): { tasks: number; running: number } {
    const now = Date.now();
    if (process.platform === 'linux') {
        try {
            const p = fs.readFileSync('/proc/loadavg', 'utf8').trim().split(/\s+/);
            const [runStr, totalStr] = p[3].split('/');
            return { tasks: parseInt(totalStr, 10), running: parseInt(runStr, 10) };
        } catch { return { tasks: 0, running: 0 }; }
    }

    if (procCache && now - procCache.ts < 4_000) {
        return { tasks: procCache.tasks, running: procCache.running };
    }

    let tasks = 0, running = 0;
    try {
        if (process.platform === 'darwin') {
            const out = execSync('ps -A | wc -l', { encoding: 'utf8', timeout: 1000 });
            tasks = Math.max(0, parseInt(out.trim(), 10) - 1);
        } else if (process.platform === 'win32') {
            const out = execSync(
                'powershell -NoProfile -NonInteractive -Command "(Get-Process).Count"',
                { encoding: 'utf8', timeout: 4000 }
            );
            tasks = parseInt(out.trim(), 10);
        }
    } catch { /* ignore */ }

    procCache = { tasks, running, ts: now };
    return { tasks, running };
}

// ── Linux thermal & fan (hwmon) ───────────────────────────────────
// Paths are discovered once and cached for the session.

let cpuTempFile: string | null | undefined = undefined; // undefined = not yet searched
let fanFiles: string[] | undefined = undefined;

const CPU_HWMON_NAMES = ['coretemp', 'k10temp', 'zenpower', 'acpitz'];

function findTempInput(base: string, sensorName: string): string | null {
    try {
        const files = fs.readdirSync(base);
        const labels = files.filter(f => /^temp\d+_label$/.test(f)).sort();

        // k10temp: prefer Tdie (actual die temp, no offset) over Tctl
        // coretemp: prefer "Package id 0" (overall package, not per-core)
        const preferred = sensorName === 'k10temp' ? 'Tdie'
            : sensorName === 'coretemp' ? 'Package id 0' : null;

        if (preferred) {
            for (const lf of labels) {
                try {
                    if (fs.readFileSync(`${base}/${lf}`, 'utf8').trim() === preferred) {
                        return `${base}/${lf.replace('_label', '_input')}`;
                    }
                } catch { /* skip */ }
            }
        }
        // fallback: first temp*_input
        const first = files.filter(f => /^temp\d+_input$/.test(f)).sort()[0];
        return first ? `${base}/${first}` : null;
    } catch { return null; }
}

function discoverHwmon(): void {
    cpuTempFile = null;
    fanFiles = [];
    try {
        for (const hwmon of fs.readdirSync('/sys/class/hwmon').sort()) {
            const base = `/sys/class/hwmon/${hwmon}`;
            let name = '';
            try { name = fs.readFileSync(`${base}/name`, 'utf8').trim(); } catch { continue; }

            // CPU temp: prefer hardware-specific (coretemp/k10temp) over generic acpitz
            if (CPU_HWMON_NAMES.includes(name)) {
                if (cpuTempFile === null || name !== 'acpitz') {
                    const input = findTempInput(base, name);
                    if (input) { cpuTempFile = input; }
                }
            }

            // Fan inputs can live in any hwmon (e.g. nct6775, it8728)
            try {
                for (const f of fs.readdirSync(base)) {
                    if (/^fan\d+_input$/.test(f)) { fanFiles!.push(`${base}/${f}`); }
                }
            } catch { /* skip */ }
        }
    } catch { /* /sys not available */ }
}

export function getCpuTemp(): number {
    if (process.platform !== 'linux') { return -1; }
    if (cpuTempFile === undefined) { discoverHwmon(); }
    if (cpuTempFile) {
        try {
            return Math.round(parseInt(fs.readFileSync(cpuTempFile, 'utf8').trim(), 10) / 1000);
        } catch { /* file disappeared */ }
    }
    // last-resort fallback
    try {
        return Math.round(parseInt(fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8').trim(), 10) / 1000);
    } catch { return -1; }
}

export function getFanSpeed(): number {
    if (process.platform !== 'linux') { return -1; }
    if (fanFiles === undefined) { discoverHwmon(); }
    for (const path of fanFiles!) {
        try {
            const val = parseInt(fs.readFileSync(path, 'utf8').trim(), 10);
            if (val > 0) { return val; }
        } catch { /* skip */ }
    }
    return -1;
}

// ── Load avg / Uptime ─────────────────────────────────────────────

export function getLoadAvg(): [number, number, number] {
    const [a, b, c] = os.loadavg(); // returns [0,0,0] on Windows
    return [parseFloat(a.toFixed(2)), parseFloat(b.toFixed(2)), parseFloat(c.toFixed(2))];
}

export function getUptime(): number {
    return os.uptime();
}

// ── Composite ─────────────────────────────────────────────────────

export function getSystemMetrics(): SystemMetrics {
    const cpuPercent = getCpuPercent();
    const mem = getMemoryInfo();
    const { tasks, running } = getProcessCount();
    return { cpuPercent, ...mem, tasks, threads: 0, running };
}
