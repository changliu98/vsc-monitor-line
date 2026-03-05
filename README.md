# System Monitor

A VS Code status bar extension that displays real-time system metrics, similar to htop.

**Supports Linux, macOS, and Windows.**

## Status Bar

```
⬡  45%  3.60GHz    🗄  8.24/15.59G    🗃  0.12/2.00G    ▶ 3
```

| Item | Default Icon | Metric | Platform |
|------|-------------|--------|----------|
| `cpu`  | `$(chip)`        | CPU usage % + avg clock frequency | All |
| `mem`  | `$(server)`      | Memory used / total (GB)           | All |
| `swp`  | `$(archive)`     | Swap used / total (GB)             | All |
| `run`  | `$(run)`         | Running processes                  | All |
| `temp` | `$(thermometer)` | CPU temperature (°C)               | Linux only |
| `fan`  | `$(dashboard)`   | Fan speed (RPM)                    | Linux only |

Click the status bar to open an htop-style panel with per-core CPU bars, memory/swap bars, load average, and uptime.

## Settings

`Ctrl+,` → search **System Monitor**

### Items — choose what to show and in what order

```json
"systemMonitor.items": ["cpu", "mem", "swp", "run"]
```

Remove an entry to hide it. Reorder to rearrange. Add `"temp"` or `"fan"` to enable those (Linux only).

### Icons — customize the icon for each item

```json
"systemMonitor.icons": {
    "cpu":  "chip",
    "mem":  "server",
    "swp":  "archive",
    "run":  "run",
    "temp": "thermometer",
    "fan":  "dashboard"
}
```

Use any codicon name from [microsoft.github.io/vscode-codicons](https://microsoft.github.io/vscode-codicons/dist/codicon.html) (without the `$()` wrapper). Set to `""` to hide the icon for that item.

All settings apply instantly without restarting.

## Install

```bash
code --install-extension system-monitor-0.0.3.vsix
```

## Requirements

- **Linux** — reads `/proc`, `/sys/class/hwmon`, `/sys/devices/system/cpu/*/cpufreq/`
- **macOS** — uses `os` module + `sysctl` for swap
- **Windows** — uses `os` module + PowerShell for swap (cached every 10s)
