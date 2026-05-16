# SecureOps — Multi-Server Security Audit Platform

**State Polytechnic of Sriwijaya**

> Monitor an entire fleet of Linux servers through **one** clean glassmorphism dashboard. Login with real OS accounts via PAM. Works in browser, installs as PWA on Android & iOS, and ships as a native Capacitor app if you need Play Store / App Store distribution.

```
                    🌍 https://secureops.example.com
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

## 📂 Repo layout

| Folder         | Purpose                                            | Install on              |
|----------------|----------------------------------------------------|-------------------------|
| `controller/`  | Full backend + React glass UI + nginx config       | **One** central server  |
| `agent/`       | Slim backend that exposes scan endpoints           | **Every** monitored server |

## ⚡ Quick start

**👉 [INSTALL.md](INSTALL.md)** — full step-by-step (English)
**👉 [PANDUAN-INSTALASI.md](PANDUAN-INSTALASI.md)** — panduan lengkap dalam Bahasa Indonesia (testing VM → production `secureops.site`)

TL;DR:

```bash
# 1. On the controller server:
git clone https://github.com/suryaex/secureops.git
cd secureops
sudo SERVER_NAME=secureops.example.com bash controller/deploy/deploy-prod.sh
sudo certbot --nginx -d secureops.example.com    # or use Cloudflare Tunnel

# 2. On every agent server (one-liner after registering in UI):
sudo SECUREOPS_AGENT_KEY=<key-from-controller-ui> \
     bash <(curl -fsSL https://raw.githubusercontent.com/suryaex/secureops/main/agent/deploy/install.sh)
```

## ✨ Highlights

- 🔐 **Real PAM login** — sign in with your Linux user, no separate password DB
- 🌐 **One domain, many servers** — central controller proxies to agents over Tailscale
- 🎨 **Luminous Security design** — glassmorphism, Apple-blue accents, Inter typography
- 📱 **Mobile-ready** — PWA out of the box; Capacitor for Play Store / App Store
- 📊 **9 modules** — Dashboard, Fleet, Audit, Sudo, Integrity, Logs, Health, Network, Alerts
- 🖥️ **Live SSH terminal** — WebSocket-piped PTY to any agent, fully audited
- 🛡️ **Role-based** — sudo/wheel members get admin; everyone else is auditor (read-only)
- 📄 **Reports** — one-click HTML/PDF export of the full security snapshot

## 🧱 Tech

| Layer       | Stack                                       |
|-------------|---------------------------------------------|
| Frontend    | React 18 · Vite · Tailwind · Recharts · PWA |
| Mobile      | Capacitor (Android + iOS)                   |
| Backend     | FastAPI · SQLAlchemy · gunicorn + uvicorn   |
| Auth        | Linux PAM + JWT                             |
| Database    | SQLite (file-based)                         |
| Mesh        | Tailscale (controller ↔ agents)             |
| Web server  | nginx                                       |
| Services    | systemd                                     |

## 📚 Documentation

- [INSTALL.md](INSTALL.md) — step-by-step setup
- [controller/README.md](controller/README.md) — controller features & dev guide
- [controller/deploy/MOBILE.md](controller/deploy/MOBILE.md) — Android / iOS build guide
- [controller/deploy/MULTI-SERVER.md](controller/deploy/MULTI-SERVER.md) — multi-server architecture deep-dive
- [agent/README.md](agent/README.md) — agent setup & endpoints

## 📄 License

Internal use, State Polytechnic of Sriwijaya. Contact IT for redistribution.
