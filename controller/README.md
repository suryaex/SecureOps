# Controller — SecureOps

> Aplikasi pusat (UI + central API). Install di **1 server** publik yang akan jadi titik akses fleet.
> Untuk panduan instalasi lengkap, baca **[../PANDUAN-INSTALASI.md](../PANDUAN-INSTALASI.md)** di root repo.

## 📦 Struktur Komponen

```
controller/
├── backend/                      # FastAPI app
│   ├── main.py                    # App factory + CORS + routers
│   ├── auth.py                    # Linux PAM + JWT
│   ├── models.py                  # SQLAlchemy ORM (6 tabel)
│   ├── schemas.py                 # Pydantic validation
│   ├── database.py                # SQLite engine
│   ├── agent_client.py            # HTTP forwarder ke agent
│   ├── gunicorn.conf.py           # Production WSGI config
│   ├── requirements.txt           # Python deps (versi loose)
│   └── routers/
│       ├── auth.py                # /api/auth/*
│       ├── dashboard.py           # /api/dashboard/* (+ /report)
│       ├── permission_audit.py    # /api/permission-audit/*
│       ├── sudo_monitor.py        # /api/sudo-monitor/*
│       ├── file_integrity.py      # /api/file-integrity/*
│       ├── activity_logs.py       # /api/activity-logs/*
│       ├── system.py              # /api/system/{health,network,alerts,fleet}
│       ├── search.py              # /api/search?q=...
│       ├── users.py               # /api/users (admin CRUD)
│       ├── servers.py             # /api/servers (+ join-token, auto-register)
│       └── terminal.py            # /api/terminal/{id}/ws (WebSocket)
│
├── frontend/                      # React SPA
│   ├── index.html                 # PWA meta tags
│   ├── vite.config.js             # Build + PWA + dev proxy
│   ├── capacitor.config.json      # Konfigurasi Android/iOS shell
│   ├── package.json               # Scripts: dev / build / cap:*
│   ├── scripts/generate-icons.py  # Auto-generate icon PWA
│   └── src/
│       ├── App.jsx                # Router
│       ├── api/client.js          # Axios + runtime server-URL switcher
│       ├── components/            # Sidebar, TopBar, Layout
│       └── pages/                 # 16 halaman (Login, Dashboard, dst.)
│
└── deploy/                        # Production tooling
    ├── deploy-prod.sh             # Installer otomatis (auto-detect distro)
    ├── nginx.conf                 # Template (placeholder di-fill saat install)
    ├── secureops-backend.service  # systemd unit untuk backend
    ├── secureops-cloudflared.service # Optional: Cloudflare Tunnel
    ├── cloudflared-config.yml     # Template Cloudflare Tunnel
    ├── MOBILE.md                  # Build APK/IPA dengan Capacitor
    └── MULTI-SERVER.md            # Deep-dive arsitektur multi-server
```

## ⚡ Instalasi Cepat

```bash
git clone https://github.com/suryaex/secureops.git
cd secureops
sudo SERVER_NAME=secureops.site bash controller/deploy/deploy-prod.sh
```

Installer otomatis:
1. ✅ Deteksi distro (Ubuntu / Debian / derivatives)
2. ✅ Install Python venv + Node.js 20
3. ✅ Install nginx + gunicorn
4. ✅ Generate PWA icons
5. ✅ Build frontend React
6. ✅ Setup systemd service
7. ✅ Reload nginx

Setelah selesai, akses via `http://<ip-server>/` lalu login pakai akun Linux server.

## 🔐 Otentikasi

Controller pakai **2 jalur auth**:

1. **Linux PAM** (default) — login pakai akun OS server. Member group `sudo`/`wheel` otomatis jadi admin, lainnya jadi auditor.
2. **Database fallback** — user yang dibuat lewat sidebar Users (password bcrypt-hashed). Untuk yang gak punya akun Linux.

Token sesi: JWT (HS256, expiry 8 jam) disimpan di `localStorage`.

## 📡 Komunikasi ke Agent

Controller meneruskan request API ke agent yang dipilih user dengan flow:

1. Request masuk: `GET /api/system/health?server_id=12`
2. Controller resolve `server_id` → ambil row dari tabel `monitored_servers`
3. Forward HTTP GET ke `<agent_url>/api/system/health` dengan header `X-Agent-Key: <shared>`
4. Response dikembalikan ke browser

Detail implementasi: `backend/agent_client.py`.

## 🚀 Auto-Register Agent (v1.5+)

Flow zero-touch untuk nambah agent:

1. Admin: UI → Servers → **+ Add Server** → isi nama → klik **Generate**
2. UI tampilkan one-liner: `curl -fsSL "https://secureops.site/api/servers/install-script/<token>" | sudo bash`
3. Admin paste di terminal agent
4. Agent install dirinya sendiri + auto POST ke `/api/servers/auto-register`
5. UI auto-detect (polling tiap 2 detik) → server muncul 🟢 online

Detail: `backend/routers/servers.py` (endpoint `/join-token`, `/install-script/{token}`, `/auto-register`).

## 🛠️ Manajemen Service

```bash
# Status
sudo systemctl status secureops-backend
sudo systemctl status nginx

# Restart
sudo systemctl restart secureops-backend nginx

# Logs realtime
sudo journalctl -u secureops-backend -f
sudo journalctl -u nginx -f
```

## 🔧 Environment Variables

Set di `/etc/systemd/system/secureops-backend.service`:

| Variable | Default | Fungsi |
|----------|---------|--------|
| `SECUREOPS_BIND` | `127.0.0.1:8000` | Bind address |
| `SECUREOPS_WORKERS` | `2` | Jumlah gunicorn worker |
| `SECUREOPS_CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `SECUREOPS_BEHIND_PROXY` | `1` | Trust X-Forwarded-* dari nginx |
| `SECUREOPS_LOGLEVEL` | `info` | Log level (debug/info/warning/error) |

## 📚 Dokumentasi Lain

- **[../PANDUAN-INSTALASI.md](../PANDUAN-INSTALASI.md)** — Panduan instalasi lengkap
- **[deploy/MOBILE.md](deploy/MOBILE.md)** — Build APK Android / IPA iOS
- **[deploy/MULTI-SERVER.md](deploy/MULTI-SERVER.md)** — Arsitektur multi-server detail

## 🆘 Troubleshooting Singkat

| Gejala | Cek |
|--------|-----|
| 502 Bad Gateway | `sudo systemctl status secureops-backend` |
| Login PAM gagal | Backend harus run `User=root` |
| CORS error di browser | Update `SECUREOPS_CORS_ORIGINS` |
| Build frontend gagal | Pastikan Node ≥ 18 (`node -v`) |
