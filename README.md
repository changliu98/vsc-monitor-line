# System Monitor

A VS Code status bar extension that displays real-time system metrics, similar to htop.

## Status Bar

```
⬡  45%  3.60GHz    🗄  8.24/15.59G    🗃  0.12/2.00G    ▶ 3
```

| Icon | Metric |
|------|--------|
| `$(chip)` | CPU usage % + average clock frequency |
| `$(server)` | Memory used / total (GB) |
| `$(archive)` | Swap used / total (GB) |
| `$(run)` | Running processes |

Click the status bar to open an htop-style panel with per-core CPU bars, memory/swap bars, load average, and uptime.

## Settings

`Ctrl+,` → search **System Monitor**

```json
"systemMonitor.items": ["cpu", "mem", "swp", "run"]
```

Remove entries to hide them. Reorder to rearrange. Changes apply instantly.

## Install

```bash
code --install-extension system-monitor-0.0.1.vsix
```

## Requirements

Linux only — reads from `/proc/stat`, `/proc/meminfo`, `/proc/loadavg`, `/proc/uptime`, and `/sys/devices/system/cpu/*/cpufreq/scaling_cur_freq`.
