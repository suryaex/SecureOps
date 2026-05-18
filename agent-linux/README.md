# Agent — SecureOps

> Aplikasi ringan yang dipasang di setiap server yang mau dimonitor. Hanya berkomunikasi dengan Controller via jaringan privat (Tailscale / LAN). **Tidak ada akses publik, tidak ada UI, tidak ada login.**
> Untuk panduan instalasi lengkap, baca **[../PANDUAN-INSTALASI.md](../PANDUAN-INSTALASI.md)** di root repo.

**v1.5** menambahkan **auto-registration** — agent install dirinya sendiri & otomatis terdaftar di Controller cuma dengan 1 command dari UI.

## 📡 Endpoint yang Tersedia

| Endpoint | Fungsi |
|----------|--------|
| `GET  /api/health` | Liveness check (no auth) |
| `GET  /api/system/health` | CPU / memory / disk / load / uptime |
| `GET  /api/system/network` | Interfaces, traffic, listening ports |
| `POST /api/permission-audit/scan` | Scan permission filesystem |
| `GET  /api/permission-audit/logs` | List isu yang terdeteksi |
| `POST /api/sudo-monitor/scan` | Enumerasi member sudo / wheel |
| `GET  /api/sudo-monitor/users` | List user privileged |
| `POST /api/file-integrity/scan` | Hash semua file yang dimonitor |
| `GET  /api/file-integrity/files` | List dengan status |
| `POST /api/file-integrity/add` | Tambah path untuk dimonitor |
| `WS   /api/terminal/ws?key=...` | Live PTY shell (WebSocket) |
| `GET  /api/terminal/recordings` | List `.cast` recording |
| `GET  /api/terminal/recordings/{n}` | Download recording tertentu |

Setiap request **harus** sertakan header `X-Agent-Key: <secret>` — secret di-set saat install via `SECUREOPS_AGENT_KEY=...`. Tanpa header, response `401 Unauthorized`.

## ⚙️ Environment Variables

| Variable | Default | Fungsi |
|----------|---------|--------|
| `SECUREOPS_AGENT_KEY` | (wajib) | Shared secret dengan controller |
| `SECUREOPS_SHELL_USER` | unset → root | OS user untuk `su -l` saat buka terminal session (recommended untuk production) |
| `SECUREOPS_SHELL_CMD` | unset | Override shell command (misal `/usr/bin/zsh -l`). Prioritas di atas `SHELL_USER`. |
| `SECUREOPS_RECORD_SESSIONS` | `0` | Set ke `1` untuk rekam semua sesi terminal jadi asciinema `.cast` |
| `SECUREOPS_RECORD_DIR` | `/var/log/secureops/sessions` | Folder tempat simpan recording |
| `SECUREOPS_BIND` | `0.0.0.0:8001` | Bind address gunicorn |
| `SECUREOPS_WORKERS` | `2` | Jumlah worker gunicorn |
| `SECUREOPS_JOIN_TOKEN` | unset | Token auto-registration (di-set otomatis oleh install-script) |
| `SECUREOPS_CONTROLLER_URL` | unset | URL controller (di-set otomatis oleh install-script) |

## 🚀 Install (Cara Recommended — Auto-Register)

**Di Controller UI**:
1. Sidebar **Servers** → **+ Add Server**
2. Pilih tab **One-Liner**
3. Isi nama server → klik **Generate install command**
4. Copy command (icon 📋)

**Di Server Target**:
```bash
curl -fsSL "https://secureops.site/api/servers/install-script/<token>" | sudo bash
```

Script otomatis:
1. ✅ Deteksi distro (Ubuntu / Debian / derivatives)
2. ✅ Install Python venv + dependencies
3. ✅ Install Tailscale (kalau belum ada)
4. ✅ Buat user `secureops` (drop-privileges untuk shell)
5. ✅ Tulis `/etc/systemd/system/secureops-agent.service` dan start
6. ✅ Auto-register ke controller dengan token + key

UI di browser otomatis update — server muncul 🟢 online tanpa refresh.

## 🚀 Install (Cara Manual — Tanpa Auto-Register)

Kalau mau install agent dulu lalu daftar manual di UI:

```bash
# Generate key sendiri
KEY=$(openssl rand -base64 32)
echo "API Key: $KEY"

sudo SECUREOPS_AGENT_KEY="$KEY" \
     SECUREOPS_SHELL_USER=secureops \
     SECUREOPS_RECORD_SESSIONS=1 \
     bash <(curl -fsSL https://raw.githubusercontent.com/suryaex/secureops/main/agent/deploy/install.sh)
```

Lalu di Controller UI → Servers → **+ Add Server** → tab **Manual Entry** → paste API URL & API Key.

## 🛠️ Manajemen Service

```bash
# Status
sudo systemctl status secureops-agent

# Restart
sudo systemctl restart secureops-agent

# Logs realtime
sudo journalctl -u secureops-agent -f

# Logs 50 baris terakhir
sudo journalctl -u secureops-agent -n 50 --no-pager
```

## 🧹 Uninstall

```bash
sudo systemctl stop secureops-agent
sudo systemctl disable secureops-agent
sudo rm -f /etc/systemd/system/secureops-agent.service
sudo systemctl daemon-reload
sudo rm -rf /opt/secureops-agent
sudo rm -rf /etc/secureops-agent
sudo rm -rf /var/log/secureops
sudo userdel -r secureops 2>/dev/null
```

Lalu hapus row server di Controller UI → Servers → klik 🗑️.

## 🔄 Update

```bash
sudo git -C /opt/secureops-agent pull
sudo /opt/secureops-agent/agent/backend/venv/bin/pip install -r /opt/secureops-agent/agent/backend/requirements.txt
sudo systemctl restart secureops-agent
```

## 🆘 Troubleshooting

| Gejala | Solusi |
|--------|--------|
| Service `activating (auto-restart)` | `sudo journalctl -u secureops-agent -n 50` — pasti ada Python traceback |
| Status `inactive` setelah install | Cek `tailscale status` — Tailscale harus aktif |
| `Connection refused` dari controller | Service mati. Restart: `sudo systemctl restart secureops-agent` |
| `Connection timed out` dari controller | Firewall / Tailscale beda akun. Cek `tailscale ping <agent>` |
| `401 Unauthorized` | Key di Controller DB beda dengan `/etc/secureops-agent/key` |
| `ModuleNotFoundError: agent_client` | File versi lama. `sudo git -C /opt/secureops-agent pull && sudo systemctl restart secureops-agent` |

## 📚 Dokumentasi Lain

- **[../PANDUAN-INSTALASI.md](../PANDUAN-INSTALASI.md)** — Panduan instalasi lengkap (Bahasa Indonesia)
- **[../controller/README.md](../controller/README.md)** — Dokumentasi controller
