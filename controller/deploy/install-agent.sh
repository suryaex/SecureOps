#!/usr/bin/env bash
#
# Install SecureOps as an AGENT on a remote server.
#
# Run this on every server you want to monitor from the central Controller.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/suryaex/secureops/main/deploy/install-agent.sh \
#     | sudo SECUREOPS_AGENT_KEY=xxxx bash
#
# or after `git clone`:
#   sudo SECUREOPS_AGENT_KEY=xxxx bash deploy/install-agent.sh
#
# What this does:
#   1. Installs system packages (python, libpam, build deps)
#   2. Installs Tailscale and joins your tailnet  (skip with SKIP_TAILSCALE=1)
#   3. Clones / pulls the SecureOps repo to /opt/secureops
#   4. Sets up Python venv and installs requirements
#   5. Writes a systemd unit (AGENT mode, port 8001 by default)
#   6. Starts the agent

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/suryaex/secureops.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/secureops}"
AGENT_PORT="${SECUREOPS_AGENT_PORT:-8001}"
AGENT_KEY="${SECUREOPS_AGENT_KEY:-}"
SKIP_TAILSCALE="${SKIP_TAILSCALE:-0}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
say()  { echo -e "${GREEN}==> $*${NC}"; }
warn() { echo -e "${YELLOW}!! $*${NC}"; }
die()  { echo -e "${RED}ERROR: $*${NC}"; exit 1; }

[[ $EUID -ne 0 ]] && die "Run with sudo / as root"
[[ -z "$AGENT_KEY" ]] && die "Pass SECUREOPS_AGENT_KEY=<key from controller UI>"

# -------- 1) Packages --------
say "Installing system packages…"
apt-get update -y
apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip python3-dev \
    libpam0g-dev build-essential \
    git curl ca-certificates

# -------- 2) Tailscale --------
if [[ "$SKIP_TAILSCALE" != "1" ]]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    say "Installing Tailscale…"
    curl -fsSL https://tailscale.com/install.sh | sh
  fi

  if ! tailscale status >/dev/null 2>&1; then
    warn "Tailscale not authenticated yet."
    echo "Run on this server:"
    echo "    sudo tailscale up"
    echo "Then re-run this script."
    exit 1
  fi

  TS_IP=$(tailscale ip -4 | head -n1 || echo "")
  say "Tailscale IP: $TS_IP"
fi

# -------- 3) Repo --------
if [[ -d "$INSTALL_DIR/.git" ]]; then
  say "Updating $INSTALL_DIR…"
  git -C "$INSTALL_DIR" pull --ff-only
else
  say "Cloning $REPO_URL → $INSTALL_DIR…"
  rm -rf "$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

# -------- 4) venv --------
say "Setting up Python venv…"
cd "$INSTALL_DIR/backend"
[[ -d venv ]] || python3 -m venv venv
# shellcheck disable=SC1091
source venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
deactivate

# -------- 5) systemd --------
say "Writing systemd unit…"
cat > /etc/systemd/system/secureops-agent.service <<EOF
[Unit]
Description=SecureOps Agent (AGENT MODE)
After=network.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$INSTALL_DIR/backend

Environment="PATH=$INSTALL_DIR/backend/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="PYTHONUNBUFFERED=1"
Environment="SECUREOPS_AGENT_MODE=1"
Environment="SECUREOPS_AGENT_KEY=$AGENT_KEY"
Environment="SECUREOPS_BIND=0.0.0.0:$AGENT_PORT"
Environment="SECUREOPS_WORKERS=2"
Environment="SECUREOPS_CORS_ORIGINS=*"

ExecStart=$INSTALL_DIR/backend/venv/bin/gunicorn -c $INSTALL_DIR/backend/gunicorn.conf.py main:app

Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=secureops-agent

ProtectSystem=false
ProtectHome=false
PrivateTmp=true
NoNewPrivileges=false

[Install]
WantedBy=multi-user.target
EOF

# Make sure firewall allows the agent port from tailnet (UFW)
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow from 100.64.0.0/10 to any port "$AGENT_PORT" comment 'SecureOps Agent (Tailscale)'
fi

systemctl daemon-reload
systemctl enable secureops-agent
systemctl restart secureops-agent

sleep 2
say "Status:"
systemctl --no-pager --lines=3 status secureops-agent || true

LOCAL_IP=$(hostname -I | awk '{print $1}')
TS_IP="${TS_IP:-}"

echo
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}  ✅ SecureOps Agent installed and running${NC}"
echo
echo "  Hostname:     $(hostname)"
echo "  LAN IP:       $LOCAL_IP"
[[ -n "$TS_IP" ]] && echo "  Tailscale IP: $TS_IP"
echo "  Port:         $AGENT_PORT"
echo
echo "  Register this server in the Controller UI:"
echo "    API URL: http://${TS_IP:-$LOCAL_IP}:$AGENT_PORT"
echo "    API Key: (the one you used above)"
echo
echo "  Logs: sudo journalctl -u secureops-agent -f"
echo -e "${GREEN}=====================================================${NC}"
