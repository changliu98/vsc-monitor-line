# System Monitor

A VS Code status bar extension that displays real-time system metrics, similar to htop.
I used to use [Resource Monitor](https://marketplace.visualstudio.com/items?itemName=mutantdino.resourcemonitor) but it has some bugs on my remote server and some new features I want, so I asked claude to make this new extension.

**Supports Linux, macOS, and Windows.**

## Status Bar

```
⬡  45%    〜 3.60GHz    🗄  8.24/15.59G    🗃  0.12/2.00G    ▶ 3
```

| Item | Default Icon | Metric | Platform |
|------|-------------|--------|----------|
| `cpu`  | `$(chip)`        | CPU usage %              | All |
| `freq` | `$(pulse)`       | Average CPU frequency    | All |
| `mem`  | `$(server)`      | Memory used / total (GB) | All |
| `swp`  | `$(archive)`     | Swap used / total (GB)   | All |
| `run`  | `$(run)`         | Running processes        | All |
| `temp` | `$(thermometer)` | CPU temperature (°C)     | Linux only |
| `fan`  | `$(dashboard)`   | Fan speed (RPM)          | Linux only |

Click the status bar to open an htop-style panel with per-core CPU bars, memory/swap bars, load average, and uptime.

## Settings

`Ctrl+,` → search **System Monitor**

### `systemMonitor.items`

Controls which metrics appear and in what order. Remove an entry to hide it, reorder to rearrange.

```json
"systemMonitor.items": ["cpu", "freq", "mem", "swp", "run"]
```

`temp` and `fan` are Linux-only and opt-in. `freq` is silently hidden on systems that don't report clock speed.

### `systemMonitor.icons`

Codicon name for each item. Use any name from [microsoft.github.io/vscode-codicons](https://microsoft.github.io/vscode-codicons/dist/codicon.html) (without the `$()` wrapper). Set to `""` to show no icon.

```json
"systemMonitor.icons": {
    "cpu":  "chip",
    "freq": "pulse",
    "mem":  "server",
    "swp":  "archive",
    "run":  "run",
    "temp": "thermometer",
    "fan":  "dashboard"
}
```

All settings apply instantly without restarting.

## Build

```bash
bash build.sh          # builds inside Docker, outputs system-monitor-x.x.x.vsix
```

## Install

```bash
code --install-extension system-monitor-0.0.3.vsix
```

## Requirements

- **Linux** — reads `/proc`, `/sys/class/hwmon`, `/sys/devices/system/cpu/*/cpufreq/`
- **macOS** — uses `os` module + `sysctl` for swap
- **Windows** — uses `os` module + PowerShell for swap (cached every 10s)
