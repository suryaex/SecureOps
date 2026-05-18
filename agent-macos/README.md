# Agent — SecureOps untuk macOS

> Versi macOS dari SecureOps Agent. Untuk **macOS 12+** (Monterey, Ventura, Sonoma, Sequoia).
> Panduan instalasi lengkap: [../PANDUAN-INSTALASI.md](../PANDUAN-INSTALASI.md)

## 🍎 Perbedaan dengan versi Linux

macOS Darwin = Unix, jadi 90% code sama dengan Linux. Perbedaannya:

| Aspek | Linux | macOS |
|-------|-------|-------|
| **Service manager** | systemd | launchd (`launchctl`) |
| **Service config** | `/etc/systemd/system/*.service` | `/Library/LaunchDaemons/*.plist` |
| **Install package** | apt | Homebrew |
| **Default Python** | apt python3 | brew python@3.12 |
| **Sudo group** | `sudo` / `wheel` | `admin` |
| **Logs** | journalctl | `/Library/Logs/SecureOps/` |
| **Default shell user** | `secureops` | `_secureops` (macOS convention) |

API endpoint **identik dengan Linux** — controller gak perlu special-case.

## 🚀 Install

### Cara 1 — Auto-Register (Recommended)

**Di Controller UI**:
1. Sidebar **Servers** → **+ Add Server**
2. Tab **One-Liner** → pilih **macOS** dari dropdown OS
3. Isi nama server → klik **Generate**
4. Copy command

**Di macOS target**:
```bash
curl -fsSL "https://secureops.site/api/servers/install-script/<token>?os=macos" | sudo bash
```

Installer otomatis:
1. ✅ Install Homebrew (kalau belum ada)
2. ✅ Install Python 3.12 via brew
3. ✅ Install Git via Xcode CLI tools
4. ✅ Clone repo ke `/opt/secureops-agent`
5. ✅ Bikin Python venv + install dependencies
6. ✅ Buat user `_secureops` (drop-privileges)
7. ✅ Setup LaunchDaemon (auto-start saat boot)
8. ✅ Auto-register ke controller

### Cara 2 — Manual

```bash
# Set env vars
export SECUREOPS_AGENT_KEY="your-secret-key"
export SECUREOPS_RECORD_SESSIONS=1

# Run installer
curl -fsSL https://raw.githubusercontent.com/suryaex/secureops/main/agent-macos/deploy/install.sh -o install.sh
sudo bash install.sh
```

## 📡 Endpoint yang Tersedia

Sama persis dengan Linux agent — lihat [../agent-linux/README.md](../agent-linux/README.md#-endpoint-yang-tersedia).

## ⚙️ Environment Variables

| Variable | Default | Fungsi |
|----------|---------|--------|
| `SECUREOPS_AGENT_KEY` | (wajib) | Shared secret dengan controller |
| `SECUREOPS_AGENT_PORT` | `8001` | Port HTTP |
| `SECUREOPS_SHELL_USER` | `_secureops` | OS user untuk shell session |
| `SECUREOPS_RECORD_SESSIONS` | `0` | Set `1` untuk rekam session |
| `SECUREOPS_RECORD_DIR` | `/Library/Logs/SecureOps/sessions` | Folder recording |

## 🛠️ Manajemen LaunchDaemon

```bash
# Stop
sudo launchctl unload /Library/LaunchDaemons/com.polsri.secureops-agent.plist

# Start
sudo launchctl load -w /Library/LaunchDaemons/com.polsri.secureops-agent.plist

# Status
sudo launchctl list | grep secureops

# View live log
tail -f /Library/Logs/SecureOps/agent-stdout.log

# View error log
tail -f /Library/Logs/SecureOps/agent-stderr.log
```

## 🧹 Uninstall

```bash
sudo launchctl unload /Library/LaunchDaemons/com.polsri.secureops-agent.plist
sudo rm /Library/LaunchDaemons/com.polsri.secureops-agent.plist
sudo rm -rf /opt/secureops-agent /etc/secureops-agent /Library/Logs/SecureOps
sudo dscl . -delete /Users/_secureops 2>/dev/null
```

## 🔄 Update

```bash
sudo launchctl unload /Library/LaunchDaemons/com.polsri.secureops-agent.plist
sudo git -C /opt/secureops-agent pull
sudo /opt/secureops-agent/agent-macos/backend/venv/bin/pip install -r /opt/secureops-agent/agent-macos/backend/requirements.txt
sudo launchctl load -w /Library/LaunchDaemons/com.polsri.secureops-agent.plist
```

## 🆘 Troubleshooting

| Gejala | Solusi |
|--------|--------|
| `xcode-select: not installed` | `xcode-select --install` lalu klik Install di GUI |
| `brew: command not found` | Installer auto-install. Manual: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` |
| LaunchDaemon tidak start | Cek log: `tail /Library/Logs/SecureOps/agent-stderr.log` |
| Permission denied (System Integrity Protection) | Beberapa folder system protected. Pakai folder yang allowed (sudah default di installer). |
| `command not found: python3.12` | Add ke PATH: `eval "$(/opt/homebrew/bin/brew shellenv)"` |

## 📚 Dokumentasi Terkait

- [../PANDUAN-INSTALASI.md](../PANDUAN-INSTALASI.md) — Panduan instalasi lengkap
- [../agent-linux/README.md](../agent-linux/README.md) — Agent Linux
- [../agent-windows/README.md](../agent-windows/README.md) — Agent Windows
