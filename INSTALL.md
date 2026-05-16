# 🚀 SecureOps Installation — Step by Step

> 🆕 **v1.4 — Final** — adds:
> - 🖥️ **Live SSH terminal** (sidebar **Terminal**, admin only) — full bash via WebSocket-piped PTY
> - 🎬 **Session recording & replay** (sidebar **Replays**) — every session saved as asciinema `.cast`, playable in-browser with 0.5×–8× speed
> - ⌨️ **Virtual keys toolbar** — Ctrl/Esc/Tab/Arrows/^C/^D/^L/^Z/^R for mobile & headless keyboards
> - 🔒 **Drop-privileges shell** — set `SECUREOPS_SHELL_USER=<user>` on the agent to never spawn root shells
> - 🌐 **Cloudflare Tunnel WebSocket support** — config tuned for long-running terminals



```
┌────────────────────────────────────────────────────────────┐
│  Repository layout                                          │
│                                                             │
│  secureops/                                                 │
│  ├── controller/      ← The web UI + central API           │
│  │   ├── backend/        FastAPI + DB + auth + routers     │
│  │   ├── frontend/       React glass UI (Luminous Security)│
│  │   └── deploy/         nginx + systemd + scripts         │
│  │                                                          │
│  └── agent/           ← Lightweight node that runs on       │
│      ├── backend/        every server you want to monitor  │
│      └── deploy/                                            │
│                                                             │
│  Install controller on ONE central server.                  │
│  Install agent on EACH server you want to monitor.          │
└────────────────────────────────────────────────────────────┘
```

> **Prerequisite (one-time):** an Ubuntu 22.04+ server with sudo access, a domain (or use Cloudflare Tunnel — free), and root SSH access on every server you want to monitor.

---

# 🅰️ PART A — Controller (1× central server)

This is the server users will open in their browser at `https://secureops.example.com`.

### A1. Prepare the server

```bash
# Connect to the controller server
ssh youruser@controller.example.com

# Update packages
sudo apt update && sudo apt upgrade -y

# Install git
sudo apt install -y git
```

### A2. Clone the repository

```bash
cd ~
git clone https://github.com/suryaex/secureops.git
cd secureops
```

### A3. Run the deploy script

The script installs **everything** (nginx, Python, Node, gunicorn, systemd) and starts the app.

**Without domain** (just LAN access):
```bash
sudo bash controller/deploy/deploy-prod.sh
```

**With domain**:
```bash
sudo SERVER_NAME=secureops.example.com bash controller/deploy/deploy-prod.sh
```

✅ Wait ~3–5 minutes. When done, you'll see:

```
✅ Production deploy complete
  Web:        http://<server-ip>/
  Backend:    http://<server-ip>/api/health
  Login with your real Linux account.
```

### A4. (Optional) Add HTTPS

**Pick ONE** of these:

**Option 1 — Free TLS via Let's Encrypt** *(requires public IP + port 80 open)*:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d secureops.example.com
# Choose: 2 (redirect HTTP → HTTPS)
```

**Option 2 — Cloudflare Tunnel** *(no public IP needed, free HTTPS, ISP-friendly)*:
```bash
# Install
curl -L --output cloudflared.deb \
   https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Auth & create tunnel
cloudflared tunnel login                 # opens browser, pick your domain
cloudflared tunnel create secureops      # COPY the UUID it prints

# Configure
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/*.json /etc/cloudflared/
sudo nano /etc/cloudflared/config.yml
```

Paste (replace `<UUID>` and the hostname):
```yaml
tunnel: <UUID>
credentials-file: /etc/cloudflared/<UUID>.json
ingress:
  - hostname: secureops.example.com
    service: http://127.0.0.1:80
  - service: http_status:404
```

Then:
```bash
cloudflared tunnel route dns secureops secureops.example.com

sudo useradd --system --no-create-home --shell /usr/sbin/nologin cloudflared
sudo chown -R cloudflared:cloudflared /etc/cloudflared

sudo cp controller/deploy/secureops-cloudflared.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now secureops-cloudflared
```

✅ Done. Browse to `https://secureops.example.com`.

### A5. First login

The controller authenticates against the controller server's **own Linux user accounts** via PAM.

| Username      | Password                | Role     |
|---------------|-------------------------|----------|
| Your OS user  | Your OS password        | admin (if you're in sudo/wheel) |
| `admin`       | `Admin@123` (fallback)  | admin    |
| `auditor`     | `Auditor@123` (fallback)| auditor  |

Login → you'll land on the **Dashboard**. The "controller" server is already listed in **Servers**.

---

# 🅱️ PART B — Agent (every server you want to monitor)

Repeat these steps for **each remote server**.

### B1. Register the server in the Controller UI

1. Open the Controller in browser → log in as admin
2. Sidebar → **Servers** → click **Add Server**
3. Fill:
   - **Name**: `web-prod-01` (any unique label)
   - **Hostname**: actual hostname (or leave blank)
   - **API URL**: leave empty for now (fill after step B4)
   - **Tags**: `production, web` (optional)
4. Click **Register** → a popup shows the **API Key** → **COPY THIS NOW** (only shown once)

### B2. Install Tailscale on the agent server

> Skip this step if controller and agent are on the same LAN.

```bash
# Connect to the agent server
ssh youruser@agent-server.example.com

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Authenticate (browser link will appear)
sudo tailscale up

# Note your Tailscale IP
tailscale ip -4
# Output example: 100.64.5.12
```

Also run on the **Controller** server (if not done yet):
```bash
sudo tailscale up    # same tailnet
```

### B3. Run the agent installer

```bash
# Still on the agent server, as root:
sudo SECUREOPS_AGENT_KEY=<paste-the-api-key-from-step-B1> \
     bash <(curl -fsSL https://raw.githubusercontent.com/suryaex/secureops/main/agent/deploy/install.sh)
```

✅ Output ends with:
```
✅ SecureOps Agent installed!
  Hostname:     web-prod-01
  IP for ctrl:  100.64.5.12
  Port:         8001
```

### B4. Connect controller → agent

Back in the **Controller UI** → Servers → click the **edit** icon on the row you created:
- **API URL**: `http://100.64.5.12:8001` (the Tailscale IP printed above)
- Save → click the **ping** icon → green dot 🟢 means connected!

### B5. View agent data

In the top-bar **server selector dropdown**, click the new server. Every page (System Health, Network, Permission Audit, Sudo, File Integrity) now shows data from that server.

Click **Fleet** in the sidebar to see all servers side-by-side.

**Repeat B1–B4 for every server you want to add to the fleet.**

---

# 🖥️ PART B+ — SSH Terminal & Session Recording (optional but recommended)

After installing an agent, you can already open a live terminal from the UI:
**Sidebar → Terminal** (admin only) or click the terminal icon on any **Servers** row.

By default the agent spawns `bash --login` as **root**. Two upgrades make this production-grade:

### B+.1 Drop privileges — never spawn root shells

Pick a low-privilege user on the agent server (or create one):
```bash
sudo useradd -m -s /bin/bash secureops
```

Edit `/etc/systemd/system/secureops-agent.service`:
```ini
Environment="SECUREOPS_SHELL_USER=secureops"
```

Reload + restart:
```bash
sudo systemctl daemon-reload
sudo systemctl restart secureops-agent
```

Now every browser terminal session lands as `secureops`, not `root`. If you still need root for specific commands, give that user `sudo` selectively in `/etc/sudoers.d/`.

> Want a fully-custom command instead? Use `SECUREOPS_SHELL_CMD="/usr/bin/lazyssh"` (or anything). It overrides `SHELL_USER`.

### B+.2 Record every session for forensic replay

Edit the same systemd unit:
```ini
Environment="SECUREOPS_RECORD_SESSIONS=1"
Environment="SECUREOPS_RECORD_DIR=/var/log/secureops/sessions"
```

```bash
sudo mkdir -p /var/log/secureops/sessions
sudo systemctl restart secureops-agent
```

Every session is now saved as a **standard asciinema v2 `.cast`** file. View them:

- **In SecureOps UI**: Sidebar → **Replays** → pick the agent → click the recording → controls let you scrub through with 0.5×/1×/2×/4×/8× speed
- **CLI** (anywhere asciinema is installed):
  ```bash
  asciinema play <file.cast>
  ```
- **Web embedding**: drop the `.cast` into [asciinema-player](https://github.com/asciinema/asciinema-player) for sharing

### B+.3 Reinstall an agent with these options preset

```bash
sudo SECUREOPS_AGENT_KEY=<key-from-controller-ui> \
     SECUREOPS_SHELL_USER=secureops \
     SECUREOPS_RECORD_SESSIONS=1 \
     bash <(curl -fsSL https://raw.githubusercontent.com/suryaex/secureops/main/agent/deploy/install.sh)
```

# 🅲 PART C — Mobile (optional)

After domain + HTTPS is live, users can install SecureOps as an app on their phone in 10 seconds:

### Android (Chrome / Edge / Brave)
1. Open `https://secureops.example.com` on the phone
2. Menu (⋮) → **Install app** → Done. SecureOps icon appears on home screen.

### iOS (Safari only — required by Apple)
1. Open `https://secureops.example.com` in **Safari**
2. Share button → **Add to Home Screen** → Done.

✅ Runs full-screen, auto-updates when you re-deploy.

For Play Store / App Store builds (Capacitor), see `controller/deploy/MOBILE.md`.

---

# 🔧 Day-2 commands cheat sheet

### On controller
```bash
# Logs
sudo journalctl -u secureops-backend -f
sudo journalctl -u nginx -f

# Restart everything
sudo systemctl restart secureops-backend nginx

# Re-deploy after `git pull`
cd ~/secureops && git pull && sudo bash controller/deploy/deploy-prod.sh

# Reset DB (DESTRUCTIVE — loses users, server list, logs)
sudo systemctl stop secureops-backend
sudo rm ~/secureops/controller/backend/secureops.db
sudo systemctl start secureops-backend
```

### On any agent
```bash
sudo systemctl status   secureops-agent
sudo systemctl restart  secureops-agent
sudo journalctl -u secureops-agent -f
```

### Remove an agent from the fleet
1. Controller UI → Servers → 🗑 delete row
2. On the agent server: `sudo systemctl disable --now secureops-agent && sudo rm -rf /opt/secureops-agent`

---

# 🐛 Troubleshooting (most common issues)

| Symptom | Fix |
|---|---|
| `502 Bad Gateway` | `sudo systemctl restart secureops-backend` |
| Agent shows offline after registration | Check Tailscale: `tailscale status` on both sides. Test: `curl -H "X-Agent-Key: <key>" http://<tailscale-ip>:8001/api/health` |
| `Permission denied` on PAM login | Backend service must run as root (`sudo systemctl status secureops-backend`) — only root can call PAM |
| Cloudflare Tunnel shows `1033` error | Tunnel daemon is down: `sudo systemctl restart secureops-cloudflared` |
| Login fails with valid Linux account | User must exist on the **controller** server, not the agent |
| `Cleartext HTTP not permitted` in Android PWA | Add HTTPS via certbot or Cloudflare Tunnel |

---

# 🎯 Final checklist

After install you should be able to:

- [ ] Open `https://secureops.example.com` in browser
- [ ] Log in with your Linux account
- [ ] See **controller** server in the top-bar dropdown
- [ ] Add a new server via **Servers** page
- [ ] See **agent** server turn green after registering
- [ ] Switch between servers in the dropdown
- [ ] Open **Fleet** page and see all servers in a grid
- [ ] Install the PWA on a phone via "Add to Home Screen"

Everything green? 🎉 You're done.
