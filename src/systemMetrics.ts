import * as fs from 'fs';

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

interface CpuTimes { total: number; idle: number; }

let prevCpuTimes: CpuTimes | null = null;
const prevCoreTimes = new Map<number, CpuTimes>();

function parseStatNums(line: string): CpuTimes {
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] ?? 0);
    return { total: parts.reduce((a, b) => a + b, 0), idle };
}

export function getCpuPercent(): number {
    try {
        const curr = parseStatNums(fs.readFileSync('/proc/stat', 'utf8').split('\n')[0]);
        if (!prevCpuTimes) { prevCpuTimes = curr; return 0; }
        const td = curr.total - prevCpuTimes.total;
        const id = curr.idle - prevCpuTimes.idle;
        prevCpuTimes = curr;
        return td === 0 ? 0 : Math.max(0, Math.min(100, Math.round((1 - id / td) * 100)));
    } catch { return 0; }
}

export function getCpuCores(): CpuCore[] {
    const cores: CpuCore[] = [];
    try {
        for (const line of fs.readFileSync('/proc/stat', 'utf8').split('\n')) {
            const m = line.match(/^cpu(\d+)\s/);
            if (!m) { continue; }
            const id = parseInt(m[1], 10);
            const curr = parseStatNums(line);
            const prev = prevCoreTimes.get(id);
            let percent = 0;
            if (prev && curr.total > prev.total) {
                percent = Math.max(0, Math.min(100,
                    Math.round((1 - (curr.idle - prev.idle) / (curr.total - prev.total)) * 100)));
            }
            prevCoreTimes.set(id, curr);

            let freqMHz = 0;
            try {
                const raw = fs.readFileSync(`/sys/devices/system/cpu/cpu${id}/cpufreq/scaling_cur_freq`, 'utf8');
                freqMHz = Math.round(parseInt(raw.trim(), 10) / 1000);
            } catch { /* freq not available */ }

            cores.push({ id, percent, freqMHz });
        }
    } catch {}
    return cores;
}

export function getMemoryInfo(): Pick<SystemMetrics, 'memUsedGB' | 'memTotalGB' | 'swapUsedGB' | 'swapTotalGB'> {
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
            memUsedGB:  parseFloat(((memTotal - memAvail) / K).toFixed(2)),
            memTotalGB: parseFloat((memTotal / K).toFixed(2)),
            swapUsedGB: parseFloat(((swapTotal - swapFree) / K).toFixed(2)),
            swapTotalGB: parseFloat((swapTotal / K).toFixed(2)),
        };
    } catch {
        return { memUsedGB: 0, memTotalGB: 0, swapUsedGB: 0, swapTotalGB: 0 };
    }
}

export function getLoadAvg(): [number, number, number] {
    try {
        const p = fs.readFileSync('/proc/loadavg', 'utf8').trim().split(/\s+/);
        return [parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2])];
    } catch { return [0, 0, 0]; }
}

export function getUptime(): number {
    try {
        return parseFloat(fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0]);
    } catch { return 0; }
}

export function getSystemMetrics(): SystemMetrics {
    const cpuPercent = getCpuPercent();
    const mem = getMemoryInfo();
    try {
        const p = fs.readFileSync('/proc/loadavg', 'utf8').trim().split(/\s+/);
        const [runStr, totalStr] = p[3].split('/');
        return { cpuPercent, ...mem, tasks: parseInt(totalStr, 10), threads: 0, running: parseInt(runStr, 10) };
    } catch {
        return { cpuPercent, ...mem, tasks: 0, threads: 0, running: 0 };
    }
}
