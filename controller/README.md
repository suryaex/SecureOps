# SecureOps — Security Audit Dashboard

**State Polytechnic of Sriwijaya**

A full-stack server control & security monitoring platform.
Full Linux PAM authentication, live system telemetry, file integrity monitoring,
sudo auditing, complete activity logs — wrapped in a clean React UI that ships
as a **website**, a **PWA**, and **native Android / iOS apps**.

**🆕 Multi-server fleet** — monitor *many* servers from *one* domain via the
Controller + Agent architecture. See [deploy/MULTI-SERVER.md](deploy/MULTI-SERVER.md).

---

## ⚡ What's in this repo

| Layer       | Tech                                           |
|-------------|------------------------------------------------|
| Frontend    | React 18, Vite, Tailwind, Recharts             |
| Mobile      | Capacitor (Android + iOS), Vite-PWA            |
| Backend     | FastAPI, SQLAlchemy, gunicorn + uvicorn        |
| Auth        | Linux PAM (real OS accounts) + JWT tokens      |
| Database    | SQLite (file-based, no separate DB server)     |
| Web server  | nginx reverse-proxy + static SPA               |
| Service mgr | systemd                                        |

---

## 🚀 Three ways to run SecureOps

### 1. Development (single machine, hot-reload)
```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend (another terminal)
cd frontend
npm install
npm run dev
```
Browse to **http://localhost:5173** — login with `admin / Admin@123` (DB fallback) or any real Linux user on Ubuntu.

---

### 2. Production (Ubuntu server, nginx + systemd)

The one-shot deploy script handles **everything**: packages, venv, build, nginx, systemd, auto-start.

```bash
git clone https://github.com/suryaex/secureops.git
cd secureops
bash deploy/deploy-prod.sh
```

After it finishes, the dashboard is live on `http://<server-ip>/`.

Want a domain? Set it before running:
```bash
SERVER_NAME=secureops.polsri.ac.id bash deploy/deploy-prod.sh
sudo certbot --nginx -d secureops.polsri.ac.id   # free HTTPS
```

No domain, no port-forward, free HTTPS via **Cloudflare Tunnel**:
```bash
# After deploy-prod.sh:
sudo apt install cloudflared
cloudflared tunnel login
cloudflared tunnel create secureops
sudo cp deploy/cloudflared-config.yml /etc/cloudflared/config.yml
# Edit the file: paste tunnel UUID and your hostname
sudo cp deploy/secureops-cloudflared.service /etc/systemd/system/
sudo systemctl enable --now secureops-cloudflared
```

---

### 3. Multi-server fleet (one domain, many servers)

Run SecureOps as a **central controller** and install the **agent** on each
server you want to monitor. They communicate over a private Tailscale mesh,
authenticated by a shared per-server API key.

**On controller** (already deployed via deploy-prod.sh):
1. UI sidebar → **Servers** → **Add Server**, copy the generated API key.

**On each agent server:**
```bash
sudo SECUREOPS_AGENT_KEY=<key-from-controller-ui> \
     bash <(curl -fsSL https://raw.githubusercontent.com/suryaex/secureops/main/deploy/install-agent.sh)
```

Full guide: **[deploy/MULTI-SERVER.md](deploy/MULTI-SERVER.md)**.

### 4. Mobile (PWA or native)

Full guide: **[deploy/MOBILE.md](deploy/MOBILE.md)**

**Fast path (PWA):**  open the web URL in Chrome/Safari on the phone, tap "Install app" / "Add to Home Screen". Done.

**Native APK / IPA:**
```bash
cd frontend
echo "VITE_API_BASE_URL=https://secureops.yourdomain.com" > .env.production
npm install
npm run build
npx cap add android      # or: npx cap add ios
npx cap sync
npm run cap:android      # opens Android Studio
```

---

## 🗂  Project layout

```
secureops/
├── backend/                          # FastAPI app
│   ├── main.py                        # app factory + CORS + routers
│   ├── auth.py                        # PAM + JWT
│   ├── models.py / schemas.py
│   ├── database.py
│   ├── gunicorn.conf.py               # production WSGI config
│   ├── requirements.txt
│   └── routers/
│       ├── auth.py                    # /api/auth/*
│       ├── dashboard.py               # /api/dashboard/* (incl. /report download)
│       ├── permission_audit.py        # /api/permission-audit/*
│       ├── sudo_monitor.py            # /api/sudo-monitor/*
│       ├── file_integrity.py          # /api/file-integrity/*
│       ├── activity_logs.py           # /api/activity-logs/*
│       ├── system.py                  # /api/system/{health,network,alerts}
│       ├── search.py                  # /api/search?q=…
│       └── users.py                   # /api/users (admin CRUD)
│
├── frontend/                          # React SPA
│   ├── index.html                     # PWA meta tags
│   ├── vite.config.js                 # build + PWA + dev proxy
│   ├── capacitor.config.json          # Android/iOS shell config
│   ├── package.json                   # scripts: dev / build / cap:android / cap:ios
│   ├── scripts/generate-icons.py      # auto PWA icon set
│   └── src/
│       ├── App.jsx                    # router
│       ├── api/client.js              # axios + runtime server-URL switcher
│       ├── components/                # Sidebar, TopBar, Layout
│       └── pages/                     # 13 pages incl. Users, Settings, Support
│
└── deploy/                            # Production tooling
    ├── deploy-prod.sh                 # one-shot deploy (nginx + systemd + build)
    ├── nginx.conf                     # template (placeholders filled in by script)
    ├── secureops-backend.service      # systemd unit
    ├── secureops-cloudflared.service  # optional Cloudflare Tunnel unit
    ├── cloudflared-config.yml         # tunnel ingress config
    └── MOBILE.md                      # Android/iOS build guide
```

---

## ✨ Feature matrix

| Module             | Highlights                                                              |
|--------------------|-------------------------------------------------------------------------|
| **Dashboard**      | Live stats, charts, recent activity, **Download Report** (HTML/PDF)     |
| **Permission Audit**| File-system scan; Critical/High/Medium/Low severities                  |
| **Sudo Monitor**   | Real Linux `sudo`/`wheel` group enumeration via `pwd`/`grp`             |
| **File Integrity** | SHA-256 hashing of arbitrary watched files; safe / modified / missing  |
| **Activity Logs**  | Full audit trail w/ search, action filter, status filter, pagination    |
| **System Health**  | CPU per-core, memory, swap, disk, load avg, uptime — auto-refresh 5 s  |
| **Network**        | Interfaces (IPv4/MAC/up-down), traffic counters, listening ports        |
| **Alerts**         | Aggregated Critical/High issues from all modules                        |
| **Search**         | Global top-bar search → logs, users, files, permissions                 |
| **Users**          | Admin-only CRUD; PAM users protected; bcrypt for DB users               |
| **Settings**       | Account info, runtime API server URL (mobile), toggles, server info     |
| **Support**        | FAQ, quick commands, links                                              |

---

## 🔐 How authentication works

1. **Login → PAM:** If you're on Linux and the username exists as an OS account,
   the password is verified through PAM (`/etc/shadow`).
2. **Role mapping:** member of `sudo` / `wheel` / `admin` / `adm` or is `root`
   → **admin** role. Otherwise → **auditor** (read-only).
3. **Auto-provision:** First successful PAM login inserts a mirror row into the
   DB `admins` table so foreign keys / activity logs still work.
4. **Fallback:** On Windows or for non-OS users, the legacy bcrypt-hashed
   accounts in the DB are used. The `users` page can manage these.
5. **Token:** JWT (8 h expiry) stored in `localStorage`, attached to every API
   request via an axios interceptor.

---

## 🛠  Day-2 operations

```bash
# Logs
sudo journalctl -u secureops-backend -f
sudo journalctl -u nginx -f

# Restart
sudo systemctl restart secureops-backend
sudo systemctl reload  nginx

# Re-deploy after a git pull
git pull && bash deploy/deploy-prod.sh

# Make a Linux user an admin in SecureOps
sudo usermod -aG sudo someuser

# Reset the DB (DESTRUCTIVE)
sudo systemctl stop secureops-backend
rm backend/secureops.db
sudo systemctl start secureops-backend
```

---

## 📊 System flowcharts

Visual flowcharts (architecture, auth flow, module flows, DB schema, deployment)
are available in Figma — links are stored in the project's onboarding doc.

---

## 📄 License

Internal use, State Polytechnic of Sriwijaya. Contact IT for redistribution.
