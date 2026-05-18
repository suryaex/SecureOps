# SecureOps — Platform Monitoring Keamanan Multi-Server

**Politeknik Negeri Sriwijaya**

> Pantau **banyak server Linux** dari **satu dashboard glassmorphism modern**. Login pakai akun OS asli via PAM. Akses lewat browser, install sebagai PWA di Android & iOS, atau bangun jadi APK/IPA native pakai Capacitor.

```
                     🌍 https://secureops.site
                                │
                          ┌─────▼──────┐
                          │ Controller │ ← Web UI + central API
                          └─────┬──────┘
              ┌─────────────────┼─────────────────┐
              │                 │                 │
          ┌───▼────┐        ┌───▼────┐        ┌───▼────┐
          │ Agent  │        │ Agent  │        │ Agent  │
          └────────┘        └────────┘        └────────┘
          web-prod          db-server         backup-srv
```

## 📂 Struktur Repository

| Folder | Kegunaan | Install di |
|--------|----------|------------|
| `controller/` | Backend lengkap + UI React glass + konfigurasi nginx | **1 server pusat** (Linux only) |
| `agent-linux/` | Agent untuk distro Linux/Debian | Server/desktop Linux |
| `agent-windows/` | Agent untuk Windows 10/11 & Server 2019+ | Workstation/server Windows |
| `agent-macos/` | Agent untuk macOS 12+ | Mac mini, MacBook |

## ⚡ Mulai Cepat

**👉 Baca [PANDUAN-INSTALASI.md](PANDUAN-INSTALASI.md) — panduan lengkap step-by-step.**

Untuk yang udah familiar:

```bash
# 1. Di controller server (1 unit aja):
git clone https://github.com/suryaex/secureops.git
cd secureops
sudo SERVER_NAME=secureops.site bash controller/deploy/deploy-prod.sh
sudo certbot --nginx -d secureops.site   # atau pakai Cloudflare Tunnel

# 2. Di setiap server agent — tinggal 1 langkah!
#    Buka Controller UI → Servers → + Add Server → copy command yang muncul
#    → paste di terminal agent → SELESAI (agent auto-register sendiri)
```

## ✨ Fitur Utama

- 🔐 **Login Linux PAM** — sign in pakai akun OS, gak ada database password terpisah
- 🌐 **Satu domain, banyak server** — Controller proxy ke setiap agent lewat Tailscale
- 🎨 **Design Luminous Security** — glassmorphism, aksen Apple Blue, tipografi Inter
- 📱 **Siap mobile** — PWA out-of-the-box; Capacitor untuk Play Store / App Store
- 📊 **9 modul monitoring** — Dashboard, Fleet, Audit, Sudo, Integrity, Logs, Health, Network, Alerts
- 🖥️ **Terminal SSH live** — PTY via WebSocket ke setiap agent, full audit log
- 🎬 **Recording sesi** — auto rekam terminal sesi ke `asciinema .cast`, playback in-browser
- 🛡️ **Role-based** — anggota `sudo`/`wheel` jadi admin; lainnya jadi auditor (read-only)
- 📄 **Report otomatis** — export laporan HTML/PDF satu klik dari Dashboard
- ⚡ **Auto-register agent** — tambah server cuma 1 command (mirip Tailscale auth-key)

## 🧱 Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 18 · Vite · Tailwind · Recharts · PWA |
| Mobile | Capacitor (Android + iOS) |
| Backend | FastAPI · SQLAlchemy · gunicorn + uvicorn |
| Auth | Linux PAM + JWT |
| Database | SQLite (berbasis file) |
| Mesh VPN | Tailscale (controller ↔ agents) |
| Web server | nginx |
| Services | systemd |

## 📚 Dokumentasi

- **[PANDUAN-INSTALASI.md](PANDUAN-INSTALASI.md)** — panduan instalasi lengkap (Bahasa Indonesia)
- [INSTALL.md](INSTALL.md) — versi English
- [controller/README.md](controller/README.md) — fitur controller & dev guide
- [controller/deploy/MOBILE.md](controller/deploy/MOBILE.md) — bangun APK Android / IPA iOS
- [controller/deploy/MULTI-SERVER.md](controller/deploy/MULTI-SERVER.md) — arsitektur multi-server deep-dive
- [agent/README.md](agent/README.md) — setup agent & daftar endpoint

## 🌐 OS yang Didukung untuk Agent

Installer otomatis deteksi OS. Tinggal pilih dari dropdown saat **+ Add Server**:

### 🐧 Linux (semua berbasis Debian/Ubuntu)

| Distro | Versi | Status |
|--------|-------|:------:|
| Ubuntu Server/Desktop | 20.04 / 22.04 / **24.04** / 25.04 / 25.10 | ✅ |
| Debian | 11 / 12 / 13 | ✅ |
| Linux Mint | 20+ / 21+ / 22+ | ✅ |
| Pop!_OS | 22.04+ | ✅ |
| Elementary OS | 7+ | ✅ |
| Kali Linux | 2024.x+ | ✅ |
| Raspberry Pi OS | Bookworm (arm64) | ✅ |

### 🪟 Windows

| Versi | Status | Catatan |
|-------|:------:|---------|
| Windows 10 (1809+) | ✅ | Untuk terminal ConPTY |
| Windows 11 | ✅ | Recommended |
| Windows Server 2019 | ✅ | |
| Windows Server 2022 | ✅ | Recommended untuk server |

Install via PowerShell (Run as Administrator):
```powershell
iwr "https://secureops.site/api/servers/install-script/<token>?os=windows" -UseBasicParsing | iex
```

### 🍎 macOS

| Versi | Status |
|-------|:------:|
| macOS 12 (Monterey) | ✅ |
| macOS 13 (Ventura) | ✅ |
| macOS 14 (Sonoma) | ✅ |
| macOS 15 (Sequoia) | ✅ |

Untuk Apple Silicon (M1/M2/M3) maupun Intel.

## 🚀 Status Project

| Versi | Tanggal | Catatan |
|-------|---------|---------|
| **v1.5** | Mei 2026 | Auto-register agent (one-liner), terminal recording, dukungan Ubuntu 24+ |
| v1.4 | Mei 2026 | SSH terminal realtime, virtual keys mobile |
| v1.3 | Mei 2026 | Multi-server arsitektur, Luminous Security UI |
| v1.2 | Mei 2026 | PWA, Capacitor, deploy production |
| v1.1 | April 2026 | Linux PAM auth |
| v1.0 | April 2026 | Modul dasar (audit, sudo, FIM, logs) |

## 📄 Lisensi

Untuk penggunaan internal Politeknik Negeri Sriwijaya. Hubungi tim IT untuk redistribusi.

---

**Dikembangkan oleh:** Muhammad Surya Ragasin · **Jurusan Teknik Elektro · Prodi D4 Teknik Telekomunikasi**
