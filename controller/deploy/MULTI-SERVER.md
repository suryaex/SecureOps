# 🌐 SecureOps Multi-Server Deployment

Monitor an entire fleet of servers through **one public domain**.

```
                      🌍 https://secureops.polsri.ac.id
                                    │
                       ┌────────────▼────────────┐
                       │       Controller         │   ← public, has UI + login
                       │   (this is what users    │
                       │     see in browser)      │
                       └────────────┬────────────┘
                                    │ (Tailscale mesh, encrypted)
                  ┌─────────────────┼─────────────────┐
                  │                 │                 │
              ┌───▼───┐         ┌───▼───┐         ┌───▼───┐
              │Agent 1│         │Agent 2│         │Agent N│   ← private, headless
              └───────┘         └───────┘         └───────┘
              web-prod          db-server         backup-srv
```

## Roles

| Role            | Description                                                      | Public? |
|-----------------|------------------------------------------------------------------|---------|
| **Controller**  | Hosts the React UI, handles login, lists registered servers      | Yes (HTTPS) |
| **Agent**       | Same FastAPI code but in `AGENT_MODE=1` — no UI, no JWT, no PAM   | No (private LAN/VPN only) |

The controller talks to each agent over a private network using a **shared API key**. Even though all data flows through one domain, each module's scan (Permission Audit, Sudo Monitor, File Integrity, System Health…) runs *locally* on the target server.

---

## 🛠 Setup

### A. Set up the Controller (once)

Pick the server that will be publicly reachable. It can be the same as one of the monitored servers.

```bash
git clone https://github.com/suryaex/secureops.git /opt/secureops
cd /opt/secureops
sudo SERVER_NAME=secureops.polsri.ac.id bash deploy/deploy-prod.sh
sudo certbot --nginx -d secureops.polsri.ac.id     # HTTPS
```

Or use Cloudflare Tunnel — see main `README.md`.

### B. Install Tailscale on the Controller

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# Copy the URL it prints, open it in a browser, log in.
tailscale ip -4    # remember the 100.x.x.x IP
```

### C. For each server you want to monitor

1. **Log in to the SecureOps UI** as admin → sidebar **Servers** → **Add Server**.
2. Fill in:
   - **Name**: `web-prod` (whatever you want)
   - **Hostname**: actual hostname
   - **API URL**: leave it as `http://<tailscale-ip-of-this-agent>:8001` — you'll fill the agent's IP in just a sec
   - **API key**: leave blank to auto-generate
3. Click **Register**. A modal pops up showing the **API key** — **copy it now** (it won't be shown again).

4. SSH into the new agent server and run:

   ```bash
   sudo SECUREOPS_AGENT_KEY=<the-api-key> \
        bash <(curl -fsSL https://raw.githubusercontent.com/suryaex/secureops/main/deploy/install-agent.sh)
   ```

   This script:
   - Installs Tailscale and prompts to authenticate (run `sudo tailscale up` then re-run if needed)
   - Clones SecureOps to `/opt/secureops`
   - Sets up a Python venv
   - Writes `/etc/systemd/system/secureops-agent.service` (port 8001, AGENT_MODE)
   - Starts the agent

5. Back in the Controller UI → **Servers** → click **ping** on that row. Should turn 🟢 green.

6. Pick the server from the top-bar selector. Every page (Health, Network, Audit, Sudo, FIM, Logs) now shows data for **that** server. Switch back to the controller server via the same selector.

---

## 🔐 Security model

- Agents listen on Tailscale-only interface (or LAN). They **do not** expose port 8001 to the internet.
- Every request from controller → agent includes `X-Agent-Key`. Without it, agent returns 401.
- Tailscale provides E2E WireGuard encryption — even if your ISP MITMs, traffic is opaque.
- The user authenticating in the UI does so against the **controller's** PAM. The agent never sees usernames/passwords.

---

## 🧩 What's been multi-server-enabled so far

| Module             | Per-server | Aggregated |
|--------------------|:----------:|:----------:|
| System Health      | ✅          | ✅ (Fleet page) |
| Network            | ✅          | —          |
| Servers CRUD       | —          | ✅ (Controller-only) |
| Dashboard stats    | ⚠️ Controller-only (todo) | — |
| Permission Audit   | ⚠️ Controller-only (todo) | — |
| Sudo Monitor       | ⚠️ Controller-only (todo) | — |
| File Integrity     | ⚠️ Controller-only (todo) | — |
| Activity Logs      | ⚠️ Controller-only (todo) | — |
| Alerts             | ⚠️ Controller-only (todo) | — |

### How to extend a module to multi-server

The pattern is mechanical — see `backend/routers/system.py` as the reference. For each existing endpoint:

```python
# BEFORE
@router.get("/foo")
def get_foo(_user=Depends(get_current_user)):
    return do_work()

# AFTER
from agent_client import resolve_server, agent_get_json

@router.get("/foo")
async def get_foo(
    server_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    srv = resolve_server(db, server_id)
    if srv is not None:
        return await agent_get_json(srv, "/api/<module>/foo")
    return do_work()
```

On the frontend, replace:
```jsx
api.get('/foo')
```
with:
```jsx
import { useServers } from '../context/ServerContext'
const { queryParam, selected } = useServers()
…
api.get('/foo', { params: queryParam })
```
And re-run the effect when `selected?.id` changes.

---

## 🐛 Troubleshooting

**Agent shows "offline" after registering**
→ Test connectivity from controller:
```bash
curl -H "X-Agent-Key: <key>" http://<agent-tailscale-ip>:8001/api/health
```

**`Agent unreachable: ConnectError`**
→ Either Tailscale isn't up on one side, or UFW is blocking port 8001. Run on the agent:
```bash
sudo tailscale status
sudo ufw status            # should show: 100.64.0.0/10 ALLOW
```

**HTTPS-only firewall blocks agent traffic**
→ Tailscale uses WireGuard on UDP 41641 — usually fine. If your firewall blocks UDP, install Tailscale with `--accept-routes` and let it tunnel over TCP-443 fallback.

**Agent stuck on "unknown" status**
→ Click the **Ping** button in `/servers`. If still failing, check `journalctl -u secureops-agent -f` on the agent.
