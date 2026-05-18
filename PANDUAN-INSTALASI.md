# 📘 Panduan Instalasi SecureOps Lengkap

> **Untuk siapa**: Operator IT yang baru pertama kali deploy SecureOps. Ikuti baris per baris — pasti jadi.
> **Target deployment**: Domain `secureops.site` (atau domain apa saja), monitor banyak server Linux dari 1 tempat.
> **Estimasi waktu**: ~30-45 menit total kalau lancar.
> **Versi panduan**: SecureOps v1.5 (Mei 2026)

---

## 📋 Daftar Isi

1. [Big Picture — Apa yang Akan Dibangun](#-big-picture)
2. [Persiapan Awal](#-persiapan-awal)
3. [Quick Reference — Tabel Command Cepat](#-quick-reference)
4. [TAHAP 1 — Install Controller](#-tahap-1--install-controller-1-server-1-command)
5. [TAHAP 2 — Hubungkan Domain](#-tahap-2--hubungkan-domain-secureopssite)
6. [TAHAP 3 — Tambah Server Agent](#-tahap-3--tambah-server-agent-zero-touch-)
7. [TAHAP 4 — Mobile App (Opsional)](#-tahap-4--mobile-app-opsional)
8. [TAHAP 5 — Setup Tim & Pengguna](#-tahap-5--setup-tim--pengguna)
9. [Operasi Sehari-hari (Day-2 Ops)](#-operasi-sehari-hari-day-2-ops)
10. [Troubleshooting](#-troubleshooting)
11. [Tips Pro](#-tips-pro)
12. [Glosarium & FAQ](#-glosarium--faq)
13. [Checklist Final](#-checklist-final)

---

## 🗺️ Big Picture

### Apa yang Akan Kamu Bangun

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│          🌍 INTERNET                                             │
│             │                                                    │
│             ▼                                                    │
│       https://secureops.site                                     │
│             │                                                    │
│             │ (Cloudflare Tunnel — HTTPS gratis, no port forward)│
│             ▼                                                    │
│   ╔═══════════════════════╗                                     │
│   ║   CONTROLLER SERVER   ║   ← UI + database + central API     │
│   ║   1 unit, public      ║                                      │
│   ╚═══════════════════════╝                                     │
│             │                                                    │
│             │ (Tailscale mesh, encrypted WireGuard)              │
│   ┌─────────┼─────────┐                                          │
│   ▼         ▼         ▼                                          │
│ ┌────┐    ┌────┐    ┌────┐                                       │
│ │AGT │    │AGT │    │AGT │  ← agent kecil, install di tiap       │
│ │ 1  │    │ 2  │    │ N  │     server yang mau dimonitor         │
│ └────┘    └────┘    └────┘                                       │
│  web      database  backup                                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Konsep dasar**:
- **1 Controller** → server publik dengan domain (dapat HTTPS)
- **N Agent** → setiap server yang mau dimonitor, terpasang otomatis pakai 1 command

### Apa yang Bisa Dimonitor

| Modul | Fungsi |
|-------|--------|
| **Dashboard** | Statistik agregat, grafik 24 jam, recent activity |
| **Fleet** | Overview grid semua server dengan CPU/RAM/Disk live |
| **System Health** | CPU per core, memory, disk, load average, uptime |
| **Network** | Interface, IP, MAC, traffic, listening ports |
| **Permission Audit** | Scan file permission anomali (777, setuid, dll) |
| **Sudo Monitor** | Daftar user dengan grup sudo/wheel/admin |
| **File Integrity** | SHA-256 hash file kritis, alert kalau berubah |
| **Activity Logs** | Audit trail lengkap (login, scan, terminal) |
| **Terminal** | SSH-like terminal live via WebSocket |
| **Replays** | Playback session terminal yang direkam |
| **Alerts** | Aggregator semua alert dari setiap modul |

---

## ✅ Persiapan Awal

### Yang Kamu Butuhkan

- ✅ **Domain** (misal `secureops.site` dari Rumahweb / Niagahoster / Cloudflare Registrar)
- ✅ **Server controller** — VPS atau fisik, minimal:
  - Ubuntu 22.04+/24.04+ atau Debian 12+
  - RAM 2 GB
  - Storage 20 GB
  - Akses SSH root
- ✅ **Server agent** (sebanyak yang mau dimonitor) — spek minimal:
  - Ubuntu/Debian/derivative
  - RAM 1 GB
  - Storage 10 GB
- ✅ **Akun gratis**:
  - [Tailscale](https://tailscale.com) — mesh VPN antar node
  - [Cloudflare](https://dash.cloudflare.com/sign-up) — DNS + HTTPS gratis

### Distro yang Didukung

| Distro | Versi | Status |
|--------|-------|:------:|
| Ubuntu Server | 20.04, 22.04, **24.04** (LTS recommended), 25.04, 25.10 | ✅ |
| Debian | 11, 12, 13 | ✅ |
| Linux Mint | 20.x, 21.x, 22.x | ✅ |
| Pop!_OS | 22.04+ | ✅ |
| Elementary OS | 7+ | ✅ |
| Kali Linux | 2024.x+ | ✅ (untuk lab pentest) |
| Raspberry Pi OS | Bookworm arm64 | ✅ (IoT monitoring) |

> Installer otomatis deteksi distro dan adapt langkah-langkahnya.

---

## ⚡ Quick Reference

Tabel command paling sering dipakai (untuk yang sudah familiar):

| Tugas | Command |
|-------|---------|
| **Install Controller** | `git clone https://github.com/suryaex/secureops.git && cd secureops && sudo SERVER_NAME=secureops.site bash controller/deploy/deploy-prod.sh` |
| **Tambah Agent** | UI → Servers → **+ Add Server** → tab One-Liner → isi nama → Generate → copy command → paste di terminal agent |
| **Update versi** | `cd ~/secureops && git pull && sudo bash controller/deploy/deploy-prod.sh` |
| **Update agent** | `sudo git -C /opt/secureops-agent pull && sudo systemctl restart secureops-agent` |
| **Log Controller** | `sudo journalctl -u secureops-backend -f` |
| **Log Agent** | `sudo journalctl -u secureops-agent -f` |
| **Restart semua** | `sudo systemctl restart secureops-backend nginx secureops-cloudflared` |
| **Backup DB** | `cp ~/secureops/controller/backend/secureops.db /backup/secureops-$(date +%F).db` |

---

# 🟦 TAHAP 1 — Install Controller (1 server, 1 command)

## 1.1 Siapkan Server Controller

Pilih VPS atau server fisik dengan Ubuntu 22.04 atau 24.04 (recommended). Bisa pakai:

- **Niagahoster Cloud VPS** (lokal Indonesia, paling cepat)
- **DigitalOcean**, **Vultr**, **Hetzner** (luar negeri)
- **Server fisik kampus** (paling murah jangka panjang)

> 💡 Minimal spek: **2 vCPU, 2 GB RAM, 20 GB SSD**. Untuk fleet > 20 agent, naikkan ke 4 GB RAM.

## 1.2 SSH ke Server, Install

```bash
# Update sistem dulu
sudo apt update && sudo apt upgrade -y
sudo apt install -y git

# Clone repository & jalanin installer (~5 menit)
cd ~
git clone https://github.com/suryaex/secureops.git
cd secureops
sudo SERVER_NAME=secureops.site bash controller/deploy/deploy-prod.sh
```

Installer akan otomatis:
1. Deteksi distro Linux kamu
2. Install Node.js 20, Python venv, nginx, gunicorn
3. Generate icon PWA
4. Build frontend React (vite build)
5. Setup systemd service
6. Reload nginx dengan konfigurasi baru

Output akhir kira-kira:

```
═════════════════════════════════════════════════════════
  ✅ Production deploy complete

  Distro:    Ubuntu 24.04.1 LTS
  Web:       http://10.5.5.10/
  Domain:    http://secureops.site/
  Backend:   http://10.5.5.10/api/health
  API docs:  http://10.5.5.10/docs

  Login with your real Linux account.
═════════════════════════════════════════════════════════
```

## 1.3 Test Login Lokal

Buka browser → akses `http://<ip-server-controller>/` (sebelum domain HTTPS aktif).

Login pakai akun Linux server controller (yang anggota group `sudo`):

```
┌───────────────────────────────────────┐
│                                       │
│         🛡 SecureOps                  │
│  State Polytechnic of Sriwijaya       │
│                                       │
│  👤 Username   [_____________]         │
│  🔑 Password   [_____________]         │
│                                       │
│         ┌──────────────┐              │
│         │   Sign In →  │              │
│         └──────────────┘              │
│                                       │
│  Authenticated via Linux PAM          │
└───────────────────────────────────────┘
```

> 💡 **Yang dimasukin = username + password Linux server**, bukan database. Anggota group `sudo` otomatis dapat role admin.

Setelah berhasil, kamu akan masuk Dashboard:

```
┌──────────────────────────────────────────────────────────┐
│ 🛡 SecureOps    🔍 search...   controller ▼  System Health│
├────────┬─────────────────────────────────────────────────┤
│        │                                                  │
│ 📊 Dashboard      System Overview                          │
│ 🌐 Fleet                                                   │
│ 🔍 Audit          ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │
│ 🔐 Sudo           │TOTAL │ │SUDO  │ │INTEG │ │ALERT │    │
│ ✅ Integrity      │ 200  │ │  3   │ │SECURE│ │  0   │    │
│ 📝 Logs           └──────┘ └──────┘ └──────┘ └──────┘    │
│ 🖥  Terminal                                              │
│ 📡 Servers       Severity Distribution    Scan Activity   │
│ 👥 Users                                                  │
│ ⚙ Settings       [donut chart]            [bar chart]    │
│ ❓ Support                                                │
└──────────────────────────────────────────────────────────┘
```

---

# 🟩 TAHAP 2 — Hubungkan Domain `secureops.site`

Saya rekomendasi pakai **Cloudflare Tunnel** karena:
- ✅ Gratis HTTPS
- ✅ Gak perlu IP publik / port forwarding
- ✅ Tahan ISP block port 80/443

## 2.1 Daftar Cloudflare (kalau belum punya)

1. Buka https://dash.cloudflare.com/sign-up
2. Sign-up dengan email kamu
3. Klik tombol **"Add a Site"**
4. Masukkan `secureops.site` → pilih plan **Free**
5. Cloudflare kasih **2 nameserver**, contoh:
   ```
   alex.ns.cloudflare.com
   barb.ns.cloudflare.com
   ```
   📸 **Screenshot atau catat 2 nameserver ini** — beda untuk tiap akun!

## 2.2 Ganti Nameserver di Provider Domain

### Kalau pakai Rumahweb:

1. Login ke https://clientarea.rumahweb.com
2. Menu kiri → **Domains** → **My Domains**
3. Cari `secureops.site` → klik **Manage Domain** (atau icon ⚙️)
4. Tab **Nameservers** (atau "Manage Nameservers")
5. Pilih opsi **"Use custom nameservers"**
6. Paste 2 nameserver dari Cloudflare → klik **Change Nameservers**

```
┌─────────────────────────────────────────────────┐
│  Rumahweb Client Area                            │
│  ─────────────────────────────────────────       │
│                                                  │
│   Domain: secureops.site                         │
│                                                  │
│   ○ Use Rumahweb nameservers                     │
│   ● Use custom nameservers       ← PILIH INI    │
│                                                  │
│   Nameserver 1: [alex.ns.cloudflare.com_______] │
│   Nameserver 2: [barb.ns.cloudflare.com_______] │
│                                                  │
│                        ┌──────────────────────┐ │
│                        │  Change Nameservers  │ │
│                        └──────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Kalau pakai Niagahoster / IDwebhost / lainnya:

Logika sama — cari menu **DNS / Nameservers**, ganti ke 2 nameserver Cloudflare.

⏰ **Tunggu propagasi DNS** 15 menit hingga 24 jam (biasanya cepat di Indonesia, ~30 menit). Cek di:

```bash
# Di terminal laptop kamu
nslookup -type=NS secureops.site
# Output harus tampilkan nameserver Cloudflare
```

Atau pakai web tool: https://dnschecker.org/#NS/secureops.site

## 2.3 Install Cloudflared di Server Controller

SSH ke controller server:

```bash
# Download installer cloudflared
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb

# Install
sudo dpkg -i cloudflared.deb

# Verifikasi
cloudflared --version
# Output: cloudflared version 2024.x.x ...
```

## 2.4 Authenticate Cloudflare di Server

```bash
cloudflared tunnel login
```

Output:
```
Please open the following URL and log in with your Cloudflare account:
https://dash.cloudflare.com/argotunnel?aud=...
```

**Copy URL itu**, buka di browser laptop kamu. Halaman Cloudflare muncul:
- Pilih `secureops.site`
- Klik **Authorize**

Setelah authorize, server otomatis dapat file credential `~/.cloudflared/cert.pem`.

## 2.5 Buat Tunnel "secureops"

```bash
cloudflared tunnel create secureops
```

Output (CATAT UUID-NYA):
```
Tunnel credentials written to /root/.cloudflared/7a3b9c1d-8e6f-4a2b-9c5d-1e3f7a8b9c0d.json
Created tunnel secureops with id 7a3b9c1d-8e6f-4a2b-9c5d-1e3f7a8b9c0d
```

⚠️ **COPY UUID-nya** (`7a3b9c1d-...`) — akan dipakai di langkah berikutnya.

## 2.6 Setup File Konfigurasi Tunnel

```bash
# Buat folder permanen
sudo mkdir -p /etc/cloudflared

# Copy credentials
sudo cp ~/.cloudflared/*.json /etc/cloudflared/

# Copy template config dari repo
sudo cp ~/secureops/controller/deploy/cloudflared-config.yml /etc/cloudflared/config.yml

# Edit config — ganti UUID dengan UUID kamu
sudo nano /etc/cloudflared/config.yml
```

Edit jadi seperti ini (ganti UUID dengan punya kamu):

```yaml
tunnel: 7a3b9c1d-8e6f-4a2b-9c5d-1e3f7a8b9c0d
credentials-file: /etc/cloudflared/7a3b9c1d-8e6f-4a2b-9c5d-1e3f7a8b9c0d.json

ingress:
  - hostname: secureops.site
    service: http://127.0.0.1:80
    originRequest:
      connectTimeout: 30s
      tcpKeepAlive: 30s
      keepAliveTimeout: 90s
      noTLSVerify: true
      http2Origin: false

  - service: http_status:404
```

Save dengan **Ctrl+O**, Enter, **Ctrl+X**.

## 2.7 Route DNS Cloudflare ke Tunnel

```bash
cloudflared tunnel route dns secureops secureops.site
```

Output:
```
INF Added CNAME secureops.site which will route to this tunnel.
```

Otomatis Cloudflare bikin DNS record CNAME — **tidak perlu setting DNS manual**.

## 2.8 Jalankan Tunnel sebagai Systemd Service

```bash
# Buat user service
sudo useradd --system --no-create-home --shell /usr/sbin/nologin cloudflared
sudo chown -R cloudflared:cloudflared /etc/cloudflared

# Install service file
sudo cp ~/secureops/controller/deploy/secureops-cloudflared.service /etc/systemd/system/

# Reload + enable + start
sudo systemctl daemon-reload
sudo systemctl enable --now secureops-cloudflared

# Cek status
sudo systemctl status secureops-cloudflared
```

Output yang benar:
```
● secureops-cloudflared.service - SecureOps Cloudflare Tunnel
     Loaded: loaded
     Active: active (running) since ...
     Main PID: 12345 (cloudflared)
```

## 2.9 Test Akses Domain

Buka di browser: **https://secureops.site**

Harus muncul:
- ✅ **Gembok hijau HTTPS** di address bar
- ✅ Halaman login SecureOps dengan glassmorphism

🎉 **Domain sudah live di internet dengan HTTPS gratis!**

## 2.10 Update CORS Backend untuk Domain

Edit systemd unit backend:

```bash
sudo nano /etc/systemd/system/secureops-backend.service
```

Cari baris CORS:
```ini
Environment="SECUREOPS_CORS_ORIGINS=*"
```

Ganti jadi (lebih aman):
```ini
Environment="SECUREOPS_CORS_ORIGINS=https://secureops.site,capacitor://localhost"
```

Save, lalu:

```bash
sudo systemctl daemon-reload
sudo systemctl restart secureops-backend
```

---

# 🟨 TAHAP 3 — Tambah Server Agent (Zero-Touch 🚀)

> **Ini fitur favorit di v1.5**: cuma **1 command**, agent otomatis register sendiri ke controller. Mirip seperti Tailscale auth-key.

## 3.1 Buka Halaman Servers di UI

```
┌────────────────────────────────────────────────────────────┐
│  🛡 SecureOps                          controller ▼       │
├──────┬─────────────────────────────────────────────────────┤
│      │                                                      │
│ 📊 Dashboard      Monitored Servers                          │
│ 🌐 Fleet          Fleet of agents this controller talks to  │
│ 🔍 Audit                                                    │
│ 🔐 Sudo                                ┌─────────────────┐  │
│ ✅ Integrity                            │ + Add Server   │  │
│ 📝 Logs                                └────────┬────────┘  │
│ 🖥  Terminal                                    │ KLIK!     │
│ 📡 Servers ◀──── KAMU DISINI                   │           │
│ 👥 Users                                                    │
└────────────────────────────────────────────────────────────┘
```

**Sidebar → klik Servers → klik tombol biru "+ Add Server"** kanan atas.

## 3.2 Pilih Mode "One-Liner"

Modal muncul dengan 2 tab:

```
┌──────────────────────────────────────────────────────────────┐
│  ⚡ Add a new server                                       ✕ │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────┐  ┌──────────────────────────┐  │
│  │ ⚡ One-Liner             │  │  ✏ Manual Entry          │  │
│  │ (Recommended) ◀━━━ PILIH │  │                          │  │
│  └──────────────────────────┘  └──────────────────────────┘  │
│                                                               │
│  ⚡ How it works                                              │
│   1. Pick a name for your new server                          │
│   2. Copy the one-liner command (next screen)                 │
│   3. Paste it on the target server's terminal                 │
│   4. Server appears here automatically                        │
│                                                               │
│  SERVER NAME *                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  web-prod-01                                             │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  TAGS (optional)                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  production, web                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌──────────────────────────┐  ┌─────────────┐               │
│  │ → Generate install cmd   │  │   Cancel    │               │
│  └──────────────────────────┘  └─────────────┘               │
└──────────────────────────────────────────────────────────────┘
```

Isi:
- **Server name**: nama unik (misal `web-prod-01`)
- **Tags**: opsional, comma-separated (misal `production, web`)

Klik **"Generate install command"**.

## 3.3 Copy 1 Command yang Muncul

Layar berubah jadi:

```
┌──────────────────────────────────────────────────────────────┐
│  ⚡ Add a new server                                       ✕ │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  💻 Run this on the new server  web-prod-01                  │
│                                                               │
│  ╭──────────────────────────────────────────────────╮ ┌────┐ │
│  │ curl -fsSL "https://secureops.site/api/servers/ │ │ 📋 │ │
│  │ install-script/Xy7Bz..." | sudo bash             │ │COPY│ │
│  ╰──────────────────────────────────────────────────╯ └────┘ │
│                                                               │
│  Token expires in 59:42. Server name reserved as web-prod-01 │
│                                                               │
│  ┌──────────────────────────────────────────────────┐         │
│  │            ⏳ (spinning loader)                   │         │
│  │     Waiting for the agent to register...         │         │
│  └──────────────────────────────────────────────────┘         │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

Klik icon **📋** (copy) di pojok kanan kotak hitam → command tercopy ke clipboard.

⚠️ **Biarkan window ini tetap terbuka** — dia auto-detect agent saat join.

## 3.4 Paste di Server Target

> **Versi command berbeda tergantung OS** — UI auto-generate sesuai OS yang kamu pilih di dropdown.

### 🐧 Untuk Linux (Ubuntu, Debian, Mint, dll.)

SSH ke server, paste:

```bash
curl -fsSL "https://secureops.site/api/servers/install-script/Xy7Bz..." | sudo bash
```

### 🪟 Untuk Windows 10/11 atau Windows Server

Buka **PowerShell sebagai Administrator** (Start → cari "PowerShell" → klik kanan → **Run as Administrator**), paste:

```powershell
iwr "https://secureops.site/api/servers/install-script/Xy7Bz...?os=windows" -UseBasicParsing | iex
```

### 🍎 Untuk macOS

Buka **Terminal.app** (Cmd+Space → "Terminal"), paste:

```bash
curl -fsSL "https://secureops.site/api/servers/install-script/Xy7Bz...?os=macos" | sudo bash
```

Output di terminal akan menampilkan progress install:

```
==> Downloading main installer...
==> Detected: Ubuntu 24.04.1 LTS
==> Installing system packages…
==> Setting up Python venv…
==> Writing systemd unit…
==> Waiting for agent to become healthy...
==> Auto-registering with controller at https://secureops.site

╔══════════════════════════════════════════════════════════╗
║       ✅ SecureOps Agent Installed Successfully           ║
╚══════════════════════════════════════════════════════════╝

  Distro:       Ubuntu 24.04.1 LTS
  Hostname:     web-prod-01
  Shell user:   secureops (drop-privileges enabled)
  Recording:    ON  (/var/log/secureops/sessions)

┌──────────────────────────────────────────────────────────┐
│       🎉 AUTO-REGISTERED WITH CONTROLLER                 │
│       No further action needed — agent is online!        │
└──────────────────────────────────────────────────────────┘

  Controller:    https://secureops.site
  Registered as: web-prod-01
  API URL:       http://100.64.10.12:8001
```

⏱️ Tunggu 2-5 menit. Yang **harus muncul** di akhir adalah kotak hijau **"🎉 AUTO-REGISTERED"**.

## 3.5 Browser Otomatis Update

Tanpa perlu refresh, modal di browser otomatis berubah:

```
┌──────────────────────────────────────────────────────────────┐
│  ⚡ Add a new server                                       ✕ │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│                       ┌──────────────┐                        │
│                       │      ✅      │                        │
│                       └──────────────┘                        │
│                                                               │
│                  Server connected!                            │
│           web-prod-01 is now in your fleet.                   │
│                                                               │
│                http://100.64.10.12:8001                       │
│                                                               │
│        ┌─────────────┐    ┌─────────────────┐                 │
│        │ ✓  Got it    │    │ +  Add another  │                 │
│        └─────────────┘    └─────────────────┘                 │
└──────────────────────────────────────────────────────────────┘
```

Klik **"Got it"** atau **"Add another"** untuk lanjut tambah server lain.

## 3.6 Verifikasi di Halaman Servers

Server baru langsung muncul di tabel:

```
┌─────────────────────────────────────────────────────────────────┐
│  NAME            HOSTNAME      URL                STATUS  TAGS  │
├─────────────────────────────────────────────────────────────────┤
│  ● controller    ubuntu-24     127.0.0.1:8000    🟢 local       │
│  ● web-prod-01   web-prod      100.64.10.12:8001 🟢 online      │
└─────────────────────────────────────────────────────────────────┘
```

Klik dropdown server di top-bar → pilih `web-prod-01` → semua page (Health, Network, Audit, dll.) akan menampilkan data **dari server itu**:

```
┌────────────────────────────────────────────────────────────────┐
│  🛡 SecureOps    🔍 search...   ● web-prod-01 ▼  System Health │
├──────┬─────────────────────────────────────────────────────────┤
│      │                                                          │
│ 📊 Dashboard      System Health — web-prod-01                   │
│ 🌐 Fleet                                                        │
│ 🔍 Audit          CPU         Memory       Disk      Network    │
│                  ┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐      │
│                  │ 12% │    │ 38% │    │ 24% │    │ ↑↓  │      │
│                  └─────┘    └─────┘    └─────┘    └─────┘      │
│                                                                  │
│                      [grafik CPU usage 24 jam terakhir]          │
└──────────────────────────────────────────────────────────────────┘
```

## 3.7 Ulangi untuk Server Lain

**Ulangi langkah 3.1 - 3.6** untuk setiap server yang mau dimonitor. Setiap server butuh nama unik di UI.

> 💡 **Tip**: Buka multiple tab browser, generate beberapa command sekaligus, lalu paste di masing-masing terminal SSH agent.

## 3.8 Diagram Alur Komunikasi Lengkap

Buat yang penasaran "behind the scenes":

```
┌──────────┐                ┌─────────────┐               ┌────────────┐
│ BROWSER  │                │  CONTROLLER │               │   AGENT    │
│  (user)  │                │             │               │  (target)  │
└────┬─────┘                └──────┬──────┘               └─────┬──────┘
     │                             │                            │
     │ 1. POST /servers/join-token │                            │
     │    {name, tags}             │                            │
     ├────────────────────────────▶│                            │
     │                             │                            │
     │     {token, install_cmd}    │                            │
     │◀────────────────────────────┤                            │
     │                             │                            │
     │   👤 User copy command      │                            │
     │   ke terminal agent         │                            │
     │                             │                            │
     │                             │   2. GET /install-script/  │
     │                             │      {token}               │
     │                             │◀───────────────────────────┤
     │                             │                            │
     │                             │  install.sh (personalized) │
     │                             ├───────────────────────────▶│
     │                             │                            │
     │                             │             🛠 Agent       │
     │                             │             installs       │
     │                             │             gunicorn       │
     │                             │             generates key  │
     │                             │                            │
     │                             │   3. POST /auto-register   │
     │                             │      {token, ip, key}      │
     │                             │◀───────────────────────────┤
     │                             │                            │
     │                             │   {server_id, status:ok}   │
     │                             ├───────────────────────────▶│
     │                             │                            │
     │  4. GET /join-token/{t}/    │                            │
     │     status (every 2s)       │                            │
     ├────────────────────────────▶│                            │
     │                             │                            │
     │    {status: 'registered'}   │                            │
     │◀────────────────────────────┤                            │
     │                             │                            │
     │   ✅ Modal: "Connected!"    │                            │
     │                             │                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

# 🌐 Multi-OS Agent — Catatan per Platform

SecureOps v1.6+ mendukung agent di **3 platform**:

| OS | Folder Repo | Installer | Service Manager |
|----|-------------|-----------|-----------------|
| 🐧 **Linux** | `agent-linux/` | `bash install.sh` | systemd |
| 🪟 **Windows** | `agent-windows/` | PowerShell `install.ps1` | Windows Service via NSSM |
| 🍎 **macOS** | `agent-macos/` | `bash install.sh` (via Homebrew) | launchd |

Semua agent expose **API identik** — controller gak perlu special-case per OS.

## 🪟 Windows Agent — Detail

### Prasyarat
- Windows 10 build 1809+ (untuk dukungan ConPTY)
- Windows 11 atau Windows Server 2019/2022
- Akun Administrator (untuk install service)

### Yang Otomatis Di-install
1. **Python 3.12** (kalau belum ada — download dari python.org)
2. **Git for Windows** (kalau belum ada)
3. **NSSM** (Non-Sucking Service Manager — wrapper agar Python jadi Windows Service)
4. **pywinpty** (Python binding untuk ConPTY)

### Lokasi File
| Item | Path |
|------|------|
| Install dir | `C:\Program Files\SecureOps-Agent` |
| Config & key | `C:\ProgramData\SecureOps-Agent\` |
| Log stdout | `C:\ProgramData\SecureOps-Agent\service-stdout.log` |
| Log stderr | `C:\ProgramData\SecureOps-Agent\service-stderr.log` |
| Recordings | `C:\ProgramData\SecureOps-Agent\sessions\` |
| Service name | `SecureOps-Agent` |

### Manage Service
```powershell
Get-Service SecureOps-Agent
Restart-Service SecureOps-Agent
Get-Content "C:\ProgramData\SecureOps-Agent\service-stdout.log" -Tail 50 -Wait
```

### Perbedaan Fitur dengan Linux
| Fitur | Linux | Windows |
|-------|:-----:|:-------:|
| System Health (CPU/RAM/Disk) | ✅ | ✅ |
| Network monitor | ✅ | ✅ |
| File Integrity (SHA-256) | ✅ | ✅ |
| Permission Audit | POSIX `stat()` | `icacls` ACL scan |
| Sudo Monitor | `/etc/sudoers` + grup sudo/wheel | `net localgroup Administrators` |
| Terminal Live | `pty` module → bash | `pywinpty` ConPTY → PowerShell |
| Session Recording | ✅ asciinema `.cast` | ✅ asciinema `.cast` |

## 🍎 macOS Agent — Detail

### Prasyarat
- macOS 12 (Monterey) atau lebih baru
- Xcode Command Line Tools (`xcode-select --install`)

### Yang Otomatis Di-install
1. **Homebrew** (kalau belum ada)
2. **Python 3.12** via Homebrew
3. **Git** via Xcode CLI

### Lokasi File
| Item | Path |
|------|------|
| Install dir | `/opt/secureops-agent` |
| Config & key | `/etc/secureops-agent/` |
| LaunchDaemon | `/Library/LaunchDaemons/com.polsri.secureops-agent.plist` |
| Logs | `/Library/Logs/SecureOps/` |
| Recordings | `/Library/Logs/SecureOps/sessions/` |

### Manage LaunchDaemon
```bash
sudo launchctl unload /Library/LaunchDaemons/com.polsri.secureops-agent.plist  # stop
sudo launchctl load   -w /Library/LaunchDaemons/com.polsri.secureops-agent.plist  # start
sudo launchctl list | grep secureops
tail -f /Library/Logs/SecureOps/agent-stdout.log
```

### Perbedaan Fitur dengan Linux
macOS Darwin = Unix, jadi **fitur identik dengan Linux** — termasuk Permission Audit POSIX-style dan Sudo Monitor (cek grup `admin`).

---

# 🟪 TAHAP 4 — Mobile App (Opsional)

SecureOps adalah **PWA (Progressive Web App)** — bisa di-install ke HP tanpa publish ke Play Store / App Store.

## 4.1 Install di Android

1. Buka https://secureops.site di **Chrome** atau **Edge**
2. Menu (titik 3) → **"Install app"** atau **"Add to Home screen"**
3. Icon SecureOps muncul di launcher
4. Buka — jalan **full screen** seperti app native

```
┌────────────────────────┐
│ 📱 Android Home Screen │
├────────────────────────┤
│                        │
│ 📷  ⛅  💬  📰         │
│                        │
│ 🛡  📅  ✉  📷         │
│ ↑                      │
│ SecureOps              │
│ (PWA installed)        │
│                        │
└────────────────────────┘
```

## 4.2 Install di iPhone / iPad

⚠️ Harus pakai **Safari** (Apple ngga support PWA via Chrome di iOS).

1. Buka https://secureops.site di **Safari**
2. Tap tombol **Share** (kotak panah) di bagian bawah
3. Scroll → tap **"Add to Home Screen"**
4. Done!

## 4.3 Native APK / IPA (Capacitor)

Kalau mau publish ke Play Store atau App Store, lihat [controller/deploy/MOBILE.md](controller/deploy/MOBILE.md).

---

# 🟫 TAHAP 5 — Setup Tim & Pengguna

## 5.1 Tambah User Admin (Tim IT)

Login sebagai admin (kamu sendiri), lalu pastikan setiap anggota tim IT punya:

1. **Akun Linux di server controller**:
   ```bash
   sudo useradd -m -s /bin/bash budi
   sudo passwd budi
   # Masukkan password yang akan dipakai untuk login web
   ```

2. **Tambahkan ke group sudo** (supaya jadi admin):
   ```bash
   sudo usermod -aG sudo budi
   ```

Sekarang Budi login pakai username `budi` + password Linux → **otomatis admin** di SecureOps.

## 5.2 Tambah Auditor (Read-Only)

Ada 2 cara:

### Cara A: User Linux tanpa sudo

```bash
sudo useradd -m -s /bin/bash audit1
sudo passwd audit1
# JANGAN tambahkan ke sudo
```

User ini login pakai akun Linux → otomatis dapat role **auditor** (read-only).

### Cara B: User database (untuk yang gak punya akun Linux)

Login sebagai admin → sidebar **Users** → **+ Add New User**:

```
┌─────────────────────────────────────────┐
│  + Add New User                          │
├─────────────────────────────────────────┤
│                                          │
│  USERNAME       [auditor1____________]  │
│  EMAIL          [auditor1@polsri.ac.id] │
│  PASSWORD       [••••••••••••••••••]    │
│  CONFIRM        [••••••••••••••••••]    │
│  ROLE           ( ) Admin ( • ) Auditor │
│                                          │
│             ┌───────────────────────┐   │
│             │  Add User             │   │
│             └───────────────────────┘   │
└─────────────────────────────────────────┘
```

## 5.3 Perbedaan Role Admin vs Auditor

| Aksi | Admin | Auditor |
|------|:-----:|:-------:|
| Lihat dashboard | ✅ | ✅ |
| Lihat semua modul monitoring | ✅ | ✅ |
| Run scan (Audit, Sudo, FIM) | ✅ | ❌ |
| Buka terminal SSH | ✅ | ❌ |
| Tambah/hapus server agent | ✅ | ❌ |
| Manage users | ✅ | ❌ |
| Download report | ✅ | ✅ |

---

# 🛠️ Operasi Sehari-hari (Day-2 Ops)

## Update ke Versi Terbaru

### Di Controller:

```bash
cd ~/secureops
git pull
sudo bash controller/deploy/deploy-prod.sh
```

Installer otomatis:
- Re-install dependencies (kalau ada perubahan)
- Re-build frontend
- Restart backend service

### Di Setiap Agent:

```bash
sudo git -C /opt/secureops-agent pull
sudo /opt/secureops-agent/agent/backend/venv/bin/pip install -r /opt/secureops-agent/agent/backend/requirements.txt
sudo systemctl restart secureops-agent
```

> 💡 **Pro tip**: bikin script di laptop kamu yang loop-ssh ke semua agent dan jalankan command update. Saya bisa bantu buatin kalau perlu.

## Backup Database

Database SQLite ada di `~/secureops/controller/backend/secureops.db`. Backup harian otomatis:

```bash
sudo crontab -e

# Tambahkan baris ini (backup tiap jam 2 pagi):
0 2 * * * cp /home/superadmin/secureops/controller/backend/secureops.db /var/backups/secureops-$(date +\%Y\%m\%d).db
```

### Backup ke Cloud Storage (Opsional)

Pakai `rclone` untuk sync ke Google Drive / S3 / dll.:

```bash
sudo apt install -y rclone
rclone config   # Wizard interaktif setup provider

# Lalu di crontab:
0 3 * * * rclone copy /var/backups/ remote:secureops-backups/
```

## Restore Database

```bash
sudo systemctl stop secureops-backend
cp /var/backups/secureops-2026-05-15.db ~/secureops/controller/backend/secureops.db
sudo systemctl start secureops-backend
```

## Cek Log

### Log Backend Controller:

```bash
sudo journalctl -u secureops-backend -f
sudo journalctl -u secureops-backend -n 100 --no-pager
```

### Log nginx:

```bash
sudo journalctl -u nginx -f
sudo tail -f /var/log/nginx/secureops.access.log
sudo tail -f /var/log/nginx/secureops.error.log
```

### Log Cloudflare Tunnel:

```bash
sudo journalctl -u secureops-cloudflared -f
```

### Log Agent:

```bash
sudo journalctl -u secureops-agent -f
sudo journalctl -u secureops-agent -n 50 --no-pager
```

## Reset Password User Database (di UI)

Sidebar **Users** → cari user → klik icon 🔑 → masukkan password baru → Save.

## Hapus Server Agent dari Fleet

### 1. Hapus dari UI:

Sidebar **Servers** → klik 🗑️ delete row → konfirmasi.

### 2. Uninstall dari Server Agent:

```bash
# SSH ke agent server
sudo systemctl stop secureops-agent
sudo systemctl disable secureops-agent
sudo rm -f /etc/systemd/system/secureops-agent.service
sudo systemctl daemon-reload
sudo rm -rf /opt/secureops-agent
sudo rm -rf /etc/secureops-agent
sudo rm -rf /var/log/secureops
sudo userdel -r secureops 2>/dev/null
```

## Stop / Start Service

```bash
# Controller
sudo systemctl stop secureops-backend
sudo systemctl start secureops-backend
sudo systemctl restart secureops-backend

# Agent
sudo systemctl stop secureops-agent
sudo systemctl start secureops-agent
sudo systemctl restart secureops-agent
```

---

# 🚨 Troubleshooting

## Masalah Umum

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| `502 Bad Gateway` di browser | Backend mati | `sudo systemctl restart secureops-backend nginx` |
| **Windows**: `iex` blocked oleh ExecutionPolicy | Default Windows block PS script | `Set-ExecutionPolicy -Scope Process Bypass -Force` lalu paste ulang |
| **Windows**: Service tidak start | Cek error log | `Get-Content "C:\ProgramData\SecureOps-Agent\service-stderr.log" -Tail 30` |
| **Windows**: Python tidak ketemu | Installer auto-install. Restart PowerShell setelah install Python | Run command lagi di PowerShell baru |
| **macOS**: `xcode-select` tidak ada | Belum install Xcode CLI tools | `xcode-select --install` → klik Install di pop-up |
| **macOS**: `brew: command not found` | Homebrew belum di-PATH | `eval "$(/opt/homebrew/bin/brew shellenv)"` |
| **macOS**: LaunchDaemon tidak start | Cek log error | `tail /Library/Logs/SecureOps/agent-stderr.log` |
| `Connection refused` ke localhost:8001 | Service crash | `sudo journalctl -u secureops-agent -n 50` |
| `ModuleNotFoundError: agent_client` | File system.py versi lama | `sudo git -C /opt/secureops-agent pull && sudo systemctl restart secureops-agent` |
| Login PAM gagal "Invalid credentials" | User bukan di group sudo, atau backend run as non-root | Cek `sudo systemctl cat secureops-backend \| grep User=` |
| Agent stuck "waiting" > 5 menit | Terminal agent error | Cek output terminal agent untuk error message |
| Cloudflare error **1033** | Tunnel mati | `sudo systemctl restart secureops-cloudflared` |
| Cloudflare error **522** | Backend mati | `sudo systemctl restart secureops-backend` |
| HTTPS belum aktif | DNS belum propagate | https://dnschecker.org/#NS/secureops.site |
| Terminal disconnect 100s di Cloudflare | Free plan idle limit | Upgrade Pro plan ATAU switch ke certbot direct |
| Server agent offline padahal install sukses | Service crash setelah install | `sudo journalctl -u secureops-agent -n 50` paste outputnya |
| Ubuntu 24+: `externally-managed-environment` | PEP 668 | Installer udah handle (pakai venv) |

## Debug Lengkap Agent

Kalau agent muncul tapi status offline:

```bash
# 1. Cek service hidup
sudo systemctl status secureops-agent

# 2. Cek port listening
sudo ss -tlnp | grep 8001

# 3. Cek log untuk error
sudo journalctl -u secureops-agent -n 50 --no-pager

# 4. Test self
curl http://localhost:8001/api/health
# Output: {"status":"ok","service":"SecureOps Agent",...}

# 5. Test dengan auth
curl -H "X-Agent-Key: $(sudo cat /etc/secureops-agent/key)" \
     http://localhost:8001/api/system/health
```

## Debug Lengkap Connection Controller → Agent

Dari controller:

```bash
# Cek konektivitas Tailscale
tailscale status | grep <agent-name>
tailscale ping <agent-tailscale-ip>

# Test agent dari controller
AGENT_IP="100.64.10.12"
AGENT_KEY="<paste key dari agent>"
curl -v -H "X-Agent-Key: $AGENT_KEY" --max-time 5 \
     http://$AGENT_IP:8001/api/health
```

Hasil:
- `200 OK` + JSON → ✅ semua OK
- `Connection refused` → service agent mati
- `Connection timed out` → Tailscale beda akun / firewall
- `401 Unauthorized` → key di controller DB beda dengan yang di agent

## Reset Total

Kalau semua udah dicoba dan masih bermasalah, reset dari nol:

```bash
# === Di CONTROLLER ===
sudo systemctl stop secureops-backend secureops-cloudflared 2>/dev/null
sudo rm -f /etc/systemd/system/secureops-backend.service
sudo rm -f /etc/systemd/system/secureops-cloudflared.service
sudo rm -f /etc/nginx/sites-enabled/secureops
sudo rm -f /etc/nginx/sites-available/secureops
sudo rm -rf /var/www/secureops
sudo rm -rf ~/secureops
sudo systemctl daemon-reload

# Lalu install ulang dari awal (Tahap 1)

# === Di AGENT ===
sudo systemctl stop secureops-agent 2>/dev/null
sudo systemctl disable secureops-agent 2>/dev/null
sudo rm -f /etc/systemd/system/secureops-agent.service
sudo systemctl daemon-reload
sudo rm -rf /opt/secureops-agent /etc/secureops-agent /var/log/secureops
sudo userdel -r secureops 2>/dev/null
```

---

# 💡 Tips Pro

## 1. Penamaan Agent yang Konsisten

Gunakan pola: `<env>-<role>-<id>`

| Format | Contoh |
|--------|--------|
| `prod-web-01` | Production web server #1 |
| `prod-db-01` | Production database #1 |
| `staging-app-01` | Staging app server |
| `dev-test-01` | Development testing |

Membuat top-bar selector lebih rapi dan mudah dicari.

## 2. Tagging untuk Filter

Pakai tag untuk grouping logis:

| Server | Tags |
|--------|------|
| `prod-web-01` | `production, web, frontend` |
| `prod-db-01` | `production, database, critical` |
| `backup-srv` | `backup, lowpriority` |

## 3. Bulk Install Banyak Agent

Loop SSH dari laptop kamu:

```bash
# servers.txt — daftar IP yang mau di-install agent
echo "100.64.10.11
100.64.10.12
100.64.10.13" > servers.txt

# Buat join token dulu di UI, copy command-nya
JOIN_CMD='curl -fsSL "https://secureops.site/api/servers/install-script/XXX..." | sudo bash'

# Loop install
while IFS= read -r ip; do
  echo "Installing on $ip..."
  ssh root@"$ip" "$JOIN_CMD"
done < servers.txt
```

> ⚠️ Setiap server butuh token unik (karena 1 token = 1 server). Buat token per server di UI.

## 4. Monitoring si Monitor

Pasang [Uptime Robot](https://uptimerobot.com) (gratis) yang ping `https://secureops.site/api/health` setiap 5 menit. Kalau down, notif email/Telegram.

## 5. Limit Akses Publik

Cloudflare Free punya **Zero Trust Access Policies**. Bisa di-restrict supaya:
- Cuma email `@polsri.ac.id` yang bisa buka login page
- Cuma IP kampus yang boleh akses
- Auth via Google/GitHub sebelum sampai ke SecureOps

Setup di: https://one.dash.cloudflare.com → Access → Applications.

## 6. Push Notification Alert ke Telegram

Tambah hook di `controller/backend/routers/system.py` `system_alerts` endpoint. Belum di-build, tapi gampang. Kabari saya kalau perlu.

---

# 📖 Glosarium & FAQ

## Istilah Penting

- **Controller** — Server pusat dengan UI + database. **1 unit** per deployment.
- **Agent** — Service ringan di setiap server yang dimonitor. **N unit** (sebanyak yang kamu mau).
- **Linux PAM** — Pluggable Authentication Modules. Standard Linux untuk verifikasi password OS.
- **JWT** — JSON Web Token. Format token sesi login.
- **Tailscale** — Mesh VPN gratis berbasis WireGuard. Menghubungkan controller & agent dengan enkripsi.
- **Cloudflare Tunnel** — Akses publik tanpa port forwarding. Gratis HTTPS.
- **Join Token** — Token sekali pakai (TTL 1 jam) untuk auto-register agent.
- **PWA** — Progressive Web App. Web yang bisa di-install jadi app di HP.
- **Capacitor** — Framework untuk wrap web app jadi native APK/IPA.

## FAQ

**Q: Apakah SecureOps support RHEL / CentOS / Rocky Linux?**
A: Belum (pakai `yum`/`dnf` bukan `apt`). Bisa di-port kalau perlu — kasih tahu saya.

**Q: Berapa maksimal agent yang bisa dimonitor?**
A: Tidak ada hard limit. Tested sampai 50 agent dengan controller 2 vCPU + 2 GB RAM. Untuk > 100 agent, naikkan ke 4 vCPU + 4 GB RAM.

**Q: Apakah harus pakai Tailscale?**
A: Tidak wajib. Tailscale paling gampang. Bisa juga pakai WireGuard manual, IPsec, atau LAN biasa kalau controller dan agent satu jaringan.

**Q: Apakah Cloudflare Tunnel wajib?**
A: Tidak. Kalau punya IP publik statis + bisa buka port 80/443, pakai certbot/Let's Encrypt langsung.

**Q: Apakah aman pakai akun Linux untuk login web?**
A: Lebih aman daripada DB password terpisah. PAM punya:
- Rate-limit anti-brute-force
- Login history di `/var/log/auth.log`
- Bisa integrate 2FA via Google Authenticator (PAM module)

**Q: Bisa integrate dengan Active Directory / LDAP?**
A: Belum native, tapi bisa lewat PAM (install `libpam-ldap` di controller).

**Q: Berapa biaya total bulanan?**
A:
- Cloudflare Free: Rp 0
- Tailscale Free (sampai 100 device): Rp 0
- Domain (`secureops.site`): ~Rp 150-200rb/tahun
- VPS controller: tergantung provider (mulai ~Rp 50rb/bulan di lokal)
- **Total: ~Rp 50-100rb/bulan** untuk fleet kecil-menengah.

**Q: Apakah data agent disimpan di controller?**
A: Iya — semua data dari agent di-aggregate di SQLite controller. Agent gak punya database sendiri.

**Q: Apakah komunikasi controller ↔ agent terenkripsi?**
A: Iya, lewat Tailscale (WireGuard encryption). Plus API request di-auth dengan `X-Agent-Key` header.

---

# ✅ Checklist Final

Sebelum bisa dibilang "production ready":

## Tahap 1 — Controller

- [ ] Server controller punya akses SSH root
- [ ] `git clone` & `bash deploy-prod.sh` jalan tanpa error
- [ ] `http://<ip-controller>/` bisa diakses dari LAN
- [ ] Login pakai akun Linux server berhasil
- [ ] Dashboard menampilkan stat cards + charts

## Tahap 2 — Domain & HTTPS

- [ ] Domain dibeli (`secureops.site` atau yang lain)
- [ ] Nameserver di provider diganti ke Cloudflare
- [ ] DNS sudah propagate (cek di dnschecker.org)
- [ ] Cloudflared tunnel ter-install & ter-config
- [ ] `https://secureops.site` bisa diakses dengan gembok hijau
- [ ] CORS backend updated ke domain

## Tahap 3 — Agent

- [ ] Klik **+ Add Server** di UI tampilkan modal dengan tab One-Liner
- [ ] Generate command sukses dapat one-liner
- [ ] Copy command → paste di agent → auto-register
- [ ] Agent muncul 🟢 online di tabel Servers
- [ ] Switch server di top-bar → data dari agent tampil

## Tahap 4 — Mobile

- [ ] PWA install di HP via "Add to Home Screen"
- [ ] Icon muncul di home screen
- [ ] Login lancar via PWA

## Tahap 5 — User Management

- [ ] User tim IT punya akun Linux + group sudo
- [ ] User auditor (read-only) tested
- [ ] Restriksi role berfungsi (auditor tidak bisa run scan)

## Day-2 Ops

- [ ] Cron backup database aktif (`sudo crontab -l`)
- [ ] Log tidak ada error (`sudo journalctl -u secureops-backend -n 50`)
- [ ] Uptime monitoring (Uptime Robot) terpasang

Semua ✅ → **production ready!** 🚀

---

# 📞 Bantuan Lanjut

Kalau ada langkah yang stuck atau error, paste outputnya ke saya:

1. Output command yang error (lengkap, termasuk traceback Python kalau ada)
2. `sudo journalctl -u secureops-backend -n 30` (kalau masalah di controller)
3. `sudo journalctl -u secureops-agent -n 30` (kalau masalah di agent)

Saya bantu debug.

---

*Dokumen ini adalah panduan resmi instalasi SecureOps v1.5 · Bahasa Indonesia*
*State Polytechnic of Sriwijaya · Jurusan Teknik Elektro · Prodi D4 Teknik Telekomunikasi · 2026*
