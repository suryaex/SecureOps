# SecureOps Agent

Runs on a server you want to monitor. Talks **only** to the Controller over a private network (Tailscale / LAN). No public access, no UI, no login.

**v1.4** adds a WebSocket `/api/terminal/ws` endpoint for live PTY shells, with optional session recording.

## What it exposes

| Endpoint                             | Purpose                              |
|--------------------------------------|--------------------------------------|
| `GET  /api/health`                   | Liveness check                       |
| `GET  /api/system/health`            | CPU / mem / disk / load / uptime     |
| `GET  /api/system/network`           | Interfaces, traffic, listening ports |
| `POST /api/permission-audit/scan`    | Scan filesystem permissions          |
| `GET  /api/permission-audit/logs`    | List detected issues                 |
| `POST /api/sudo-monitor/scan`        | Enumerate sudo / wheel members       |
| `GET  /api/sudo-monitor/users`       | List privileged users                |
| `POST /api/file-integrity/scan`      | Hash all monitored files             |
| `GET  /api/file-integrity/files`     | List with statuses                   |
| `POST /api/file-integrity/add`       | Add a path to monitor                |
| `WS   /api/terminal/ws?key=…`        | Live PTY shell (WebSocket)           |
| `GET  /api/terminal/recordings`      | List recorded .cast files            |
| `GET  /api/terminal/recordings/{n}`  | Download a single recording          |

Every request must include header `X-Agent-Key: <secret>` — set the secret at install time via `SECUREOPS_AGENT_KEY=...`. Without it, every request returns `401`.

## Terminal options (env vars)

| Variable                       | Default                          | Meaning |
|--------------------------------|----------------------------------|---------|
| `SECUREOPS_AGENT_KEY`          | (required)                       | Shared secret with the controller |
| `SECUREOPS_SHELL_USER`         | unset → spawns shell as **root** | OS user to `su -l` into for every terminal session (recommended for production) |
| `SECUREOPS_SHELL_CMD`          | unset                            | Override the full shell command (e.g. `/usr/bin/zsh -l`). Takes precedence over `SHELL_USER`. |
| `SECUREOPS_RECORD_SESSIONS`    | `0`                              | Set to `1` to record every session as asciinema `.cast` |
| `SECUREOPS_RECORD_DIR`         | `/var/log/secureops/sessions`    | Where to store recordings |

## Install

One command:

```bash
sudo SECUREOPS_AGENT_KEY=<paste-key-from-controller-ui> bash deploy/install.sh
```

That's it. The script:
1. Installs Python, Tailscale (if missing), build tools
2. Clones this repo to `/opt/secureops-agent`
3. Creates a Python venv, installs the **7** Python deps
4. Writes `/etc/systemd/system/secureops-agent.service` and starts it

## Manage

```bash
sudo systemctl status   secureops-agent
sudo systemctl restart  secureops-agent
sudo journalctl -u secureops-agent -f
```

## Uninstall

```bash
sudo systemctl disable --now secureops-agent
sudo rm /etc/systemd/system/secureops-agent.service
sudo rm -rf /opt/secureops-agent
sudo systemctl daemon-reload
```
