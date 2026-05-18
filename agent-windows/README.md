# Agent — SecureOps untuk Windows

> Versi Windows dari SecureOps Agent. Untuk **Windows 10/11** dan **Windows Server 2019/2022**.
> Panduan instalasi lengkap: [../PANDUAN-INSTALASI.md](../PANDUAN-INSTALASI.md)

## 🪟 Perbedaan dengan versi Linux

| Aspek | Linux Agent | Windows Agent |
|-------|-------------|---------------|
| **Bahasa script install** | bash | PowerShell |
| **Service manager** | systemd | Windows Service via NSSM |
| **Terminal** | `pty` module | ConPTY via `pywinpty` |
| **Sudo monitor** | `/etc/sudoers` + grup `sudo`/`wheel` | `net localgroup Administrators` |
| **Permission audit** | POSIX `stat()` mode bits | `icacls` ACL output |
| **State storage** | SQLite di `/var/lib/...` | JSON di `%PROGRAMDATA%\SecureOps-Agent\` |
| **Log location** | `journalctl -u secureops-agent` | `C:\ProgramData\SecureOps-Agent\service-*.log` |

API endpoint **identik dengan Linux** — controller gak perlu special-case.

## 🚀 Install

### Cara 1 — Auto-Register (Recommended)

**Di Controller UI**:
1. Sidebar **Servers** → **+ Add Server**
2. Tab **One-Liner** → pilih **Windows** dari dropdown OS
3. Isi nama server → klik **Generate**
4. Copy command yang muncul

**Di Windows target** (PowerShell as Administrator):
```powershell
iwr "https://secureops.site/api/servers/install-script/<token>?os=windows" -UseBasicParsing | iex
```

Installer otomatis:
1. ✅ Install Python 3.12 (kalau belum ada)
2. ✅ Install Git for Windows (kalau belum ada)
3. ✅ Clone repo ke `C:\Program Files\SecureOps-Agent`
4. ✅ Bikin Python venv + install dependencies (termasuk `pywinpty`)
5. ✅ Download NSSM (Non-Sucking Service Manager)
6. ✅ Register Windows Service auto-start
7. ✅ Add Windows Firewall rule untuk port 8001
8. ✅ Auto-register ke controller dengan token

### Cara 2 — Manual

```powershell
# Buka PowerShell sebagai Administrator

# Set env vars
$env:SECUREOPS_AGENT_KEY = "your-secret-key"
$env:SECUREOPS_RECORD_SESSIONS = "1"

# Download & run
iwr "https://raw.githubusercontent.com/suryaex/secureops/main/agent-windows/deploy/install.ps1" -OutFile install.ps1
.\install.ps1
```

> Kalau ExecutionPolicy block: `Set-ExecutionPolicy -Scope Process Bypass -Force` dulu.

## 📡 Endpoint yang Tersedia

| Endpoint | Fungsi |
|----------|--------|
| `GET  /api/health` | Liveness check (no auth) |
| `GET  /api/system/health` | CPU / memory / disk / uptime |
| `GET  /api/system/network` | Interfaces, traffic, listening ports |
| `POST /api/permission-audit/scan` | Scan ACL bahaya (`icacls`) |
| `GET  /api/permission-audit/logs` | List isu yang terdeteksi |
| `POST /api/sudo-monitor/scan` | Enumerasi grup Administrators |
| `GET  /api/sudo-monitor/users` | List user admin lokal |
| `POST /api/file-integrity/scan` | Hash SHA-256 file monitored |
| `POST /api/file-integrity/add` | Tambah path ke monitoring |
| `GET  /api/file-integrity/files` | List dengan status |
| `WS   /api/terminal/ws?key=...` | Live PowerShell via ConPTY |
| `GET  /api/terminal/recordings` | List `.cast` recording |

## ⚙️ Environment Variables

Set di NSSM (auto-set saat install) atau lewat env saat run manual:

| Variable | Default | Fungsi |
|----------|---------|--------|
| `SECUREOPS_AGENT_KEY` | (wajib) | Shared secret dengan controller |
| `SECUREOPS_AGENT_PORT` | `8001` | Port HTTP |
| `SECUREOPS_SHELL_CMD` | `powershell.exe -NoLogo` | Shell command untuk terminal |
| `SECUREOPS_RECORD_SESSIONS` | `0` | Set `1` untuk rekam session |
| `SECUREOPS_RECORD_DIR` | `%PROGRAMDATA%\SecureOps-Agent\sessions` | Folder recording |
| `SECUREOPS_JOIN_TOKEN` | unset | Token auto-register (di-set otomatis dari install-script) |
| `SECUREOPS_CONTROLLER_URL` | unset | URL controller (di-set otomatis) |

## 🛠️ Manajemen Service

```powershell
# Status
Get-Service SecureOps-Agent

# Restart
Restart-Service SecureOps-Agent

# Stop
Stop-Service SecureOps-Agent

# Start
Start-Service SecureOps-Agent

# View live log
Get-Content "C:\ProgramData\SecureOps-Agent\service-stdout.log" -Tail 50 -Wait

# View error log
Get-Content "C:\ProgramData\SecureOps-Agent\service-stderr.log" -Tail 50
```

## 🧹 Uninstall

```powershell
# As Administrator
$NssmExe = "C:\Program Files\SecureOps-Agent\nssm\win64\nssm.exe"

# Stop & remove service
& $NssmExe stop SecureOps-Agent
& $NssmExe remove SecureOps-Agent confirm

# Remove firewall rule
Remove-NetFirewallRule -DisplayName "SecureOps-Agent Port 8001" -ErrorAction SilentlyContinue

# Remove files
Remove-Item "C:\Program Files\SecureOps-Agent" -Recurse -Force
Remove-Item "$env:PROGRAMDATA\SecureOps-Agent" -Recurse -Force
```

Lalu hapus row di Controller UI.

## 🆘 Troubleshooting

| Gejala | Solusi |
|--------|--------|
| `Set-ExecutionPolicy` error | Run PowerShell as Admin, jalankan `Set-ExecutionPolicy -Scope Process Bypass -Force` |
| Service tidak start | `Get-Content "C:\ProgramData\SecureOps-Agent\service-stderr.log"` |
| Port 8001 conflict | Set env `SECUREOPS_AGENT_PORT=8002` lalu reinstall |
| Terminal tidak jalan | Cek pywinpty ter-install: `& "C:\Program Files\SecureOps-Agent\agent-windows\backend\venv\Scripts\pip.exe" show pywinpty` |
| Firewall block | Cek `Get-NetFirewallRule -DisplayName "SecureOps*"` |
| Python tidak ketemu | Installer auto-install Python 3.12. Kalau gagal, install manual dari python.org |

## 🔄 Update

```powershell
Stop-Service SecureOps-Agent
git -C "C:\Program Files\SecureOps-Agent" pull
& "C:\Program Files\SecureOps-Agent\agent-windows\backend\venv\Scripts\pip.exe" install -r "C:\Program Files\SecureOps-Agent\agent-windows\backend\requirements.txt"
Start-Service SecureOps-Agent
```

## 📚 Dokumentasi Terkait

- [../PANDUAN-INSTALASI.md](../PANDUAN-INSTALASI.md) — Panduan instalasi lengkap
- [../agent-linux/README.md](../agent-linux/README.md) — Agent versi Linux
- [../agent-macos/README.md](../agent-macos/README.md) — Agent versi macOS
