# 📘 Panduan Instalasi SecureOps v1.5

> **Untuk siapa**: Pemula yang baru pertama kali deploy. Ikuti baris per baris — pasti jadi.
> **Target**: Domain `secureops.site` (Rumahweb), monitor banyak server Linux dari 1 tempat.
> **Waktu**: ~30 menit total kalau lancar.

---

## 🗺️ Big Picture — Apa yang Akan Kamu Bangun

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
│             │ (Tailscale mesh, encrypted)                        │
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

**Konsep dasar**: 1 **Controller** (yang dikasih domain publik), banyak **Agent** (tetap private).

---

# ⚡ Quick Reference (kalau cuma butuh command)

| Tugas | Command |
|---|---|
| Install Controller | `git clone https://github.com/suryaex/secureops.git && cd secureops && sudo SERVER_NAME=secureops.site bash controller/deploy/deploy-prod.sh` |
| Tambah Agent | Browser → Servers → **+ Add Server** → isi nama → copy command yang muncul → paste di server target ✅ |
| Update | `cd ~/secureops && git pull && sudo bash controller/deploy/deploy-prod.sh` |
| Log Controller | `sudo journalctl -u secureops-backend -f` |
| Log Agent | `sudo journalctl -u secureops-agent -f` |

---

# 🟦 TAHAP 1 — Install Controller (1 server, 1 command)

## 1.1 Siapkan Server

Server controller perlu:
- **Ubuntu Server 22.04 / 24.04** (recommended) atau Debian 12+
- **RAM 2 GB** minimum
- **Disk 20 GB**
- **Akses SSH root**

Bisa pakai VPS (DigitalOcean, Vultr, Niagahoster, Hetzner) atau server fisik kampus.

## 1.2 SSH ke server, install

```bash
# Update sistem
sudo apt update && sudo apt upgrade -y
sudo apt install -y git

# Clone & install (~5 menit)
cd ~
git clone https://github.com/suryaex/secureops.git
cd secureops
sudo SERVER_NAME=secureops.site bash controller/deploy/deploy-prod.sh
```

Output akhir kira-kira:

```
═════════════════════════════════════════════════════════
  ✅ Production deploy complete

  Distro:    Ubuntu 24.04.1 LTS
  Web:       http://10.5.5.10/
  Domain:    http://secureops.site/    ← tinggal HTTPS
  Backend:   http://10.5.5.10/api/health
═════════════════════════════════════════════════════════
```

## 1.3 Test Login

Buka browser → `http://<ip-server-kamu>/` → login pakai akun Linux server (yang punya group `sudo`).

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

> 💡 Login pakai **user Linux server**, bukan user database. Anggota group `sudo` otomatis dapat role admin.

---

# 🟩 TAHAP 2 — Hubungkan Domain `secureops.site`

Saya rekomendasi pakai **Cloudflare Tunnel** karena:
- ✅ Gratis HTTPS
- ✅ Gak perlu IP publik / port forwarding
- ✅ Tahan ISP block port 80/443

## 2.1 Daftar Cloudflare

1. Buka https://dash.cloudflare.com/sign-up
2. Sign-up dengan email kamu
3. Klik **"Add a Site"** → masukkan `secureops.site` → pilih plan **Free**
4. Cloudflare kasih **2 nameserver**, contoh:
   ```
   alex.ns.cloudflare.com
   barb.ns.cloudflare.com
   ```
   📸 **Screenshot/catat nameserver ini**

## 2.2 Ganti Nameserver di Rumahweb

1. Login https://clientarea.rumahweb.com
2. **Domains** → **My Domains** → klik **Manage** untuk `secureops.site`
3. Cari tab **"Nameservers"**
4. Pilih **"Use custom nameservers"**
5. Paste 2 nameserver dari Cloudflare → **Save**

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
│   Nameserver 3: [______________________________] │
│   Nameserver 4: [______________________________] │
│                                                  │
│                        ┌──────────────────────┐ │
│                        │  Change Nameservers  │ │
│                        └──────────────────────┘ │
└─────────────────────────────────────────────────┘
```

⏰ **Tunggu 15-30 menit** sampai propagasi. Cek di https://dnschecker.org/#NS/secureops.site

Kalau sudah hijau di Cloudflare dashboard (status "Active"), lanjut.

## 2.3 Install Cloudflared di Server Controller

```bash
# SSH ke server controller
ssh user@<ip-controller>

# Install
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Auth ke Cloudflare (browser akan kebuka)
cloudflared tunnel login

# Buat tunnel
cloudflared tunnel create secureops
# OUTPUT: Created tunnel secureops with id <UUID>
# CATAT UUID INI! Contoh: 7a3b9c1d-8e6f-4a2b-9c5d-1e3f7a8b9c0d
```

## 2.4 Setup Tunnel

```bash
# Copy credentials ke tempat permanent
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/*.json /etc/cloudflared/

# Copy template config
sudo cp ~/secureops/controller/deploy/cloudflared-config.yml /etc/cloudflared/config.yml

# Edit config
sudo nano /etc/cloudflared/config.yml
```

Edit jadi (ganti `<UUID>` dengan UUID yang kamu catat tadi):

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

Save (Ctrl+O, Enter, Ctrl+X).

```bash
# Route DNS ke tunnel
cloudflared tunnel route dns secureops secureops.site

# Bikin user service
sudo useradd --system --no-create-home --shell /usr/sbin/nologin cloudflared
sudo chown -R cloudflared:cloudflared /etc/cloudflared

# Install systemd service
sudo cp ~/secureops/controller/deploy/secureops-cloudflared.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now secureops-cloudflared
sudo systemctl status secureops-cloudflared
```

## 2.5 Test!

Buka di browser: **https://secureops.site**

```
┌─────────────────────────────────────────────────┐
│  🔒 secureops.site                              │
│  ─────────────────────────────────────────      │
│                                                  │
│         🛡 SecureOps                            │
│   State Polytechnic of Sriwijaya                 │
│                                                  │
│  ✅ Halaman login muncul dengan HTTPS hijau     │
│                                                  │
└─────────────────────────────────────────────────┘
```

🎉 Domain LIVE di internet dengan HTTPS gratis!

---

# 🟨 TAHAP 3 — Tambah Server Agent (yang HARUS dimonitor)

> **Ini fitur favorit di v1.5** — cuma 1 command, otomatis register.

## 3.1 Klik "+ Add Server" di UI

```
┌────────────────────────────────────────────────────────────┐
│  🛡 SecureOps                          controller ▼       │
├──────┬─────────────────────────────────────────────────────┤
│      │                                                      │
│ 📊 Dashboard          Monitored Servers                     │
│ 🌐 Fleet              Fleet of agents...                    │
│ 🔍 Audit                                                    │
│ 🔐 Sudo                                ┌─────────────────┐  │
│ ✅ Integrity                            │ + Add Server   │  │
│ 📝 Logs                                └────────┬────────┘  │
│ 🖥  Terminal                                    │ KLIK!     │
│ 📡 Servers ◀──── KAMU DISINI                   │           │
│ 👥 Users                                                    │
└────────────────────────────────────────────────────────────┘
```

## 3.2 Pilih Mode "One-Liner" → Isi Nama

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
│  ┌─────────────────────────────────────────────────────────┐│
│  │  web-prod-01                                              ││
│  └─────────────────────────────────────────────────────────┘│
│                                                               │
│  TAGS (optional)                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  production, web                                          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌─────────────────────────┐    ┌─────────────┐              │
│  │ → Generate install cmd  │    │   Cancel    │              │
│  └─────────────────────────┘    └─────────────┘              │
└──────────────────────────────────────────────────────────────┘
```

Isi nama (misal `web-prod-01`), klik **"Generate install command"**.

## 3.3 Copy 1 Command yang Muncul

```
┌──────────────────────────────────────────────────────────────┐
│  ⚡ Add a new server                                       ✕ │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  💻 Run this on the new server  web-prod-01                  │
│                                                               │
│  ╭──────────────────────────────────────────────────╮ ┌────┐│
│  │ curl -fsSL "https://secureops.site/api/servers/..│ │ 📋 ││
│  │ install-script/Xy7Bz..." | sudo bash             │ │COPY││
│  ╰──────────────────────────────────────────────────╯ └────┘│
│                                                               │
│  Token expires in 59:42                                       │
│                                                               │
│  ┌──────────────────────────────────────────────────┐         │
│  │            ⏳ (spinning loader)                   │         │
│  │     Waiting for the agent to register...         │         │
│  └──────────────────────────────────────────────────┘         │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

Klik icon **📋** di pojok kanan → command tercopy.

**Biarkan window ini tetap terbuka** — dia akan otomatis update saat agent join.

## 3.4 Paste di Server Target

SSH ke server yang mau dimonitor, paste command:

```bash
# Di server target
curl -fsSL "https://secureops.site/api/servers/install-script/Xy7Bz..." | sudo bash
```

Output di terminal:

```
==> Downloading main installer...
==> Detected: Ubuntu 24.04.1 LTS
==> Installing system packages…
==> Setting up Python venv…
==> Auto-registering with controller at https://secureops.site

╔══════════════════════════════════════════════════════════╗
║       ✅ SecureOps Agent Installed Successfully           ║
╚══════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────┐
│       🎉 AUTO-REGISTERED WITH CONTROLLER                 │
│       No further action needed — agent is online!        │
└──────────────────────────────────────────────────────────┘
```

⏱️ Tunggu 2-5 menit. Setelah muncul **"🎉 AUTO-REGISTERED"**, balik ke browser.

## 3.5 Browser Otomatis Update

Window modal di browser otomatis berubah (tanpa refresh):

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                       ┌──────────────┐                       │
│                       │      ✅      │                       │
│                       └──────────────┘                       │
│                                                              │
│                  Server connected!                           │
│           web-prod-01 is now in your fleet.                  │
│                                                              │
│        ┌─────────────┐    ┌─────────────────┐                │
│        │ ✓  Got it    │    │ +  Add another  │                │
│        └─────────────┘    └─────────────────┘                │
└──────────────────────────────────────────────────────────────┘
```

Klik **"Got it"** atau **"Add another"** untuk lanjut tambah server lain.

## 3.6 Cek Hasil

Pindah ke top-bar selector → pilih `web-prod-01`:

```
┌────────────────────────────────────────────────────────────────┐
│  🛡 SecureOps    🔍 search...   ● web-prod-01 ▼  System Health │
├──────┬─────────────────────────────────────────────────────────┤
│ 📊 Dashboard          System Health — web-prod-01               │
│ 🌐 Fleet                                                        │
│ 🔍 Audit         CPU      Memory     Disk      Network          │
│                ┌─────┐  ┌─────┐   ┌─────┐   ┌─────┐            │
│                │ 12% │  │ 38% │   │ 24% │   │ ↑↓  │            │
│                └─────┘  └─────┘   └─────┘   └─────┘            │
│                                                                  │
│                  [grafik CPU usage 24 jam terakhir]              │
└──────────────────────────────────────────────────────────────────┘
```

🎉 **Selesai!** Server `web-prod-01` sekarang dimonitor.

**Ulangi 3.1 - 3.6 untuk setiap server lain yang mau dimonitor.**

---

# 🟪 TAHAP 4 — Mobile App (Opsional)

## 4.1 Install di Android

1. Buka https://secureops.site di **Chrome** Android
2. Menu (titik 3) → **"Install app"** atau **"Add to Home Screen"**
3. Icon SecureOps muncul di home screen
4. Buka → jalan **full screen** seperti app native

## 4.2 Install di iPhone

1. Buka https://secureops.site di **Safari** (HARUS Safari, bukan Chrome)
2. Tombol Share → **"Add to Home Screen"**
3. Done!

```
┌────────────────────────┐
│ 📱 iPhone Home Screen   │
├────────────────────────┤
│                        │
│ 📷  ⛅  💬  📰         │
│                        │
│ 🛡  📅  ✉  📷         │
│ ↑                      │
│ SecureOps              │
│                        │
└────────────────────────┘
```

---

# 🛠️ Day-2 Operations

## Update ke versi terbaru

```bash
# Di controller
cd ~/secureops
git pull
sudo bash controller/deploy/deploy-prod.sh

# Di setiap agent (otomatis kalau pakai install ulang dari UI)
sudo git -C /opt/secureops-agent pull
sudo /opt/secureops-agent/agent/backend/venv/bin/pip install -r /opt/secureops-agent/agent/backend/requirements.txt
sudo systemctl restart secureops-agent
```

## Cek log

```bash
# Controller
sudo journalctl -u secureops-backend -f
sudo journalctl -u nginx -f
sudo journalctl -u secureops-cloudflared -f

# Agent
sudo journalctl -u secureops-agent -f
```

## Backup database

```bash
# Backup harian otomatis pakai cron
sudo crontab -e

# Tambahkan baris ini:
0 2 * * * cp /home/superadmin/secureops/controller/backend/secureops.db /var/backups/secureops-$(date +\%Y\%m\%d).db
```

## Hapus agent

1. UI **Servers** → klik 🗑️ delete
2. Di agent server: `sudo systemctl disable --now secureops-agent && sudo rm -rf /opt/secureops-agent`

## Reset password user di UI

Sidebar **Users** → klik icon 🔑 di row user → masukkan password baru → Save.

---

# 🚨 Troubleshooting

| Gejala | Solusi |
|---|---|
| **502 Bad Gateway** di browser | `sudo systemctl restart secureops-backend nginx` |
| Login PAM gagal | Pastikan user di group `sudo` (`sudo usermod -aG sudo username`). Backend harus run as root. |
| Agent stuck "waiting" lebih dari 5 menit | Cek terminal agent — pasti ada error. Atau klik **"Generate new token"** di modal. |
| Cloudflare error 1033 | Tunnel mati: `sudo systemctl restart secureops-cloudflared` |
| Cloudflare error 522 | Backend mati: `sudo systemctl restart secureops-backend` |
| HTTPS belum aktif | Cek DNS sudah propagate: https://dnschecker.org/#NS/secureops.site |
| Terminal WebSocket putus 100s di Cloudflare | Free plan limit. Pakai Pro plan ($20/bln) atau switch ke certbot direct |
| Agent crash setelah install | `sudo journalctl -u secureops-agent -n 50` → kirim outputnya |
| Ubuntu 24+: `externally-managed-environment` | Sudah ditangani — installer pakai venv terpisah |

---

# ✅ Checklist Final

Sebelum dianggap selesai, pastikan:

- [ ] https://secureops.site bisa diakses dengan HTTPS hijau
- [ ] Login pakai akun Linux di server controller sukses
- [ ] Klik **+ Add Server** → muncul modal dengan tab One-Liner
- [ ] Generate command → bisa dicopy → paste di agent → auto-register sukses
- [ ] Agent muncul 🟢 online di tabel Servers
- [ ] Switch server di top-bar selector → semua page (Health, Network, Terminal, dll) menampilkan data agent
- [ ] PWA bisa di-install di HP via "Add to Home Screen"
- [ ] Cron backup database aktif (`sudo crontab -l`)
- [ ] Log tidak ada error: `sudo journalctl -u secureops-backend -n 20`

Kalau semua centang → **production ready** 🚀

---

# 📚 Dokumentasi Tambahan

- **[PANDUAN-TAMBAH-SERVER.md](PANDUAN-TAMBAH-SERVER.md)** — detail visual nambah agent
- **[INSTALL.md](INSTALL.md)** — versi English
- **[controller/deploy/MOBILE.md](controller/deploy/MOBILE.md)** — bikin APK Android / IPA iOS (Capacitor)
- **[controller/deploy/MULTI-SERVER.md](controller/deploy/MULTI-SERVER.md)** — arsitektur deep dive

---

# 💡 Tips Pro

1. **Naming convention agent**: gunakan pola seperti `<env>-<role>-<id>`, misal `prod-web-01`, `prod-db-01`, `dev-test-01`. Lebih mudah dicari di top-bar selector.

2. **Tag-based filtering**: Tag bukan cuma metadata. Future feature akan support filter Dashboard berdasarkan tag (misal "Show only production servers").

3. **Backup berlapis**: SQLite database controller di-backup harian + sertifikat Cloudflare disimpan terpisah:
   ```bash
   sudo rclone copy /var/backups/ remote:secureops-backups/
   sudo rclone copy /etc/cloudflared/ remote:secureops-backups/cloudflared/
   ```

4. **Monitoring si monitor**: Install Uptime Robot (gratis) yang ping `https://secureops.site/api/health` tiap 5 menit. Notif via email/Telegram kalau down.

5. **Limit akses publik**: Cloudflare Free punya fitur **Access Policies**. Bisa di-restrict supaya cuma email kampus `@polsri.ac.id` yang bisa buka login page (sebelum login PAM).

---

**Selesai!** Kalau ada error atau bingung di step manapun, paste output errornya ke chat. 🚀

---

*Dokumen ini adalah panduan resmi instalasi SecureOps v1.5 · State Polytechnic of Sriwijaya · 2026 · Bahasa Indonesia*
