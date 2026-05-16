#!/usr/bin/env bash
#
# SecureOps AGENT installer.
# Run on every server you want to monitor.
#
# Usage:
#   sudo SECUREOPS_AGENT_KEY=<paste-key-from-controller-UI> bash install.sh
#
# Optional env:
#   SECUREOPS_AGENT_PORT=8001  (default)
#   SKIP_TAILSCALE=1           (if you're on same LAN as controller)
#   REPO_URL=https://github.com/suryaex/secureops.git
#   INSTALL_DIR=/opt/secureops-agent

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/suryaex/secureops.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/secureops-agent}"
PORT="${SECUREOPS_AGENT_PORT:-8001}"
KEY="${SECUREOPS_AGENT_KEY:-}"
SKIP_TS="${SKIP_TAILSCALE:-0}"

# Terminal options
SHELL_USER="${SECUREOPS_SHELL_USER:-}"          # e.g. "secureops" — agent will `su -l` to this user (recommended)
SHELL_CMD="${SECUREOPS_SHELL_CMD:-}"            # full custom command (overrides SHELL_USER)
RECORD="${SECUREOPS_RECORD_SESSIONS:-0}"        # "1" to record every terminal session to .cast files
RECORD_DIR_VAR="${SECUREOPS_RECORD_DIR:-/var/log/secureops/sessions}"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
say()  { echo -e "${GREEN}==> $*${NC}"; }
die()  { echo -e "${RED}ERROR: $*${NC}"; exit 1; }

[[ $EUID -ne 0 ]] && die "Run with sudo / as root."
[[ -z "$KEY"  ]] && die "Missing SECUREOPS_AGENT_KEY. Get it from the Controller UI → Servers → Add Server."

say "Installing system packages..."
apt-get update -y
apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip python3-dev \
    git curl ca-certificates build-essential

if [[ "$SKIP_TS" != "1" ]]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    say "Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
  fi
  if ! tailscale status >/dev/null 2>&1; then
    echo
    echo "Run on this server NOW:    sudo tailscale up"
    echo "Then re-run this installer."
    exit 1
  fi
  TS_IP=$(tailscale ip -4 | head -n1 || echo "")
  say "Tailscale IP: $TS_IP"
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  say "Updating existing install at $INSTALL_DIR..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  say "Cloning repo to $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

say "Setting up Python venv..."
cd "$INSTALL_DIR/agent/backend"
[[ -d venv ]] || python3 -m venv venv
# shellcheck disable=SC1091
source venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
deactivate

say "Writing systemd unit..."
cat > /etc/systemd/system/secureops-agent.service <<EOF
[Unit]
Description=SecureOps Agent
After=network.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$INSTALL_DIR/agent/backend

Environment="PATH=$INSTALL_DIR/agent/backend/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="PYTHONUNBUFFERED=1"
Environment="SECUREOPS_AGENT_KEY=$KEY"
Environment="SECUREOPS_BIND=0.0.0.0:$PORT"
Environment="SECUREOPS_WORKERS=2"
Environment="SECUREOPS_SHELL_USER=$SHELL_USER"
Environment="SECUREOPS_SHELL_CMD=$SHELL_CMD"
Environment="SECUREOPS_RECORD_SESSIONS=$RECORD"
Environment="SECUREOPS_RECORD_DIR=$RECORD_DIR_VAR"

ExecStart=$INSTALL_DIR/agent/backend/venv/bin/gunicorn -c $INSTALL_DIR/agent/backend/gunicorn.conf.py main:app

Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=secureops-agent

[Install]
WantedBy=multi-user.target
EOF

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow from 100.64.0.0/10 to any port "$PORT" comment 'SecureOps Agent (Tailscale)' || true
fi

# Recording directory
if [[ "$RECORD" == "1" ]]; then
  mkdir -p "$RECORD_DIR_VAR"
  chmod 0750 "$RECORD_DIR_VAR"
  echo "Recordings will be written to: $RECORD_DIR_VAR"
fi

systemctl daemon-reload
systemctl enable secureops-agent
systemctl restart secureops-agent
sleep 2

say "Agent status:"
systemctl --no-pager --lines=3 status secureops-agent || true

LAN_IP=$(hostname -I | awk '{print $1}')
TS_IP="${TS_IP:-}"
USE_IP="${TS_IP:-$LAN_IP}"

echo
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}  ✅ SecureOps Agent installed!${NC}"
echo
echo "  Hostname:     $(hostname)"
echo "  IP for ctrl:  $USE_IP"
echo "  Port:         $PORT"
echo
echo "  In the Controller UI → Servers, edit this entry:"
echo "    API URL:  http://$USE_IP:$PORT"
echo
echo "  Logs:  sudo journalctl -u secureops-agent -f"
echo -e "${GREEN}=====================================================${NC}"
