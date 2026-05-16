#!/usr/bin/env bash
# SecureOps AGENT installer
#
# Supports: Ubuntu 20.04 / 22.04 / 24.04 / 25.04
#           Debian 11 / 12 / 13
#           Linux Mint, Pop!_OS, Elementary, Kali, Raspbian
#
# Usage (RECOMMENDED — agent generates its own key):
#   sudo bash install.sh
#   → outputs API key at the end. Paste it into Controller UI.
#
# Usage (legacy — pre-generated key from controller):
#   sudo SECUREOPS_AGENT_KEY=<key> bash install.sh
#
# Optional env vars:
#   SECUREOPS_AGENT_PORT      = 8001
#   SKIP_TAILSCALE            = 1   (skip on LAN-only setups)
#   SECUREOPS_SHELL_USER      = secureops   (drop-privileges shell)
#   SECUREOPS_SHELL_CMD       = /usr/bin/zsh -l
#   SECUREOPS_RECORD_SESSIONS = 1
#   SECUREOPS_RECORD_DIR      = /var/log/secureops/sessions
#   REPO_URL / INSTALL_DIR
#   KEY_FILE                  = /etc/secureops-agent/key  (where key persists)

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/suryaex/secureops.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/secureops-agent}"
PORT="${SECUREOPS_AGENT_PORT:-8001}"
KEY="${SECUREOPS_AGENT_KEY:-}"
KEY_FILE="${KEY_FILE:-/etc/secureops-agent/key}"
SKIP_TS="${SKIP_TAILSCALE:-0}"

SHELL_USER="${SECUREOPS_SHELL_USER:-}"
SHELL_CMD="${SECUREOPS_SHELL_CMD:-}"
RECORD="${SECUREOPS_RECORD_SESSIONS:-0}"
RECORD_DIR_VAR="${SECUREOPS_RECORD_DIR:-/var/log/secureops/sessions}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
say()  { echo -e "${GREEN}==> $*${NC}"; }
info() { echo -e "${BLUE}ℹ  $*${NC}"; }
warn() { echo -e "${YELLOW}!! $*${NC}"; }
die()  { echo -e "${RED}ERROR: $*${NC}"; exit 1; }

[[ $EUID -ne 0 ]] && die "Run with sudo / as root."

# -------- API key: reuse existing → env override → generate new --------
GENERATED_KEY=0
if [[ -z "$KEY" ]]; then
  if [[ -f "$KEY_FILE" ]]; then
    KEY="$(cat "$KEY_FILE")"
    info "Reusing existing key at $KEY_FILE"
  else
    # Generate a 43-char URL-safe key (32 bytes base64-url, no padding)
    if command -v openssl >/dev/null 2>&1; then
      KEY="$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-43)"
    else
      KEY="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | cut -c1-43)"
    fi
    GENERATED_KEY=1
    say "Generated new API key for this agent"
  fi
fi
mkdir -p "$(dirname "$KEY_FILE")"
echo -n "$KEY" > "$KEY_FILE"
chmod 0600 "$KEY_FILE"

# -------- Detect distro ----------
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  DISTRO_ID="${ID,,}"
  DISTRO_LIKE="${ID_LIKE:-}"
  DISTRO_MAJOR="${VERSION_ID%%.*}"
  PRETTY="${PRETTY_NAME:-$DISTRO_ID}"
else
  die "Cannot detect distro."
fi

case "$DISTRO_ID" in
  ubuntu|debian|linuxmint|pop|elementary|kali|raspbian|neon) : ;;
  *)
    if [[ "$DISTRO_LIKE" == *debian* || "$DISTRO_LIKE" == *ubuntu* ]]; then :
    else die "Unsupported distro: $DISTRO_ID"
    fi
    ;;
esac

say "Detected: $PRETTY"
export DEBIAN_FRONTEND=noninteractive

# -------- 1) System packages ----------
say "Installing system packages…"
apt-get update -y
apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip python3-dev \
    git curl ca-certificates build-essential

# -------- 2) Tailscale ----------
if [[ "$SKIP_TS" != "1" ]]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    say "Installing Tailscale…"
    curl -fsSL https://tailscale.com/install.sh | sh
  fi
  if ! tailscale status >/dev/null 2>&1; then
    echo
    warn "Tailscale not authenticated yet."
    echo "Run on this server NOW:    sudo tailscale up"
    echo "Then re-run this installer."
    exit 1
  fi
  TS_IP=$(tailscale ip -4 | head -n1 || echo "")
  info "Tailscale IP: $TS_IP"
fi

# -------- 3) Repository ----------
if [[ -d "$INSTALL_DIR/.git" ]]; then
  say "Updating existing install at $INSTALL_DIR…"
  git -C "$INSTALL_DIR" pull --ff-only
else
  say "Cloning repo to $INSTALL_DIR…"
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

# -------- 4) Python venv ----------
say "Setting up Python venv…"
cd "$INSTALL_DIR/agent/backend"
[[ -d venv ]] || python3 -m venv venv
# shellcheck disable=SC1091
source venv/bin/activate
pip install --quiet --upgrade pip setuptools wheel
pip install --quiet -r requirements.txt
deactivate

info "Python: $(python3 --version)"

# -------- 5) systemd unit ----------
say "Writing systemd unit…"
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

# Firewall
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow from 100.64.0.0/10 to any port "$PORT" comment 'SecureOps Agent (Tailscale)' || true
fi

# Recording directory
if [[ "$RECORD" == "1" ]]; then
  mkdir -p "$RECORD_DIR_VAR"
  chmod 0750 "$RECORD_DIR_VAR"
  info "Recordings → $RECORD_DIR_VAR"
fi

systemctl daemon-reload
systemctl enable secureops-agent
systemctl restart secureops-agent
sleep 2

say "Agent status:"
systemctl --no-pager --lines=3 status secureops-agent || true

LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
TS_IP="${TS_IP:-}"
USE_IP="${TS_IP:-$LAN_IP}"

echo
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       ✅ SecureOps Agent Installed Successfully              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "  Distro:       $PRETTY"
echo -e "  Hostname:     $(hostname)"
[[ -n "$SHELL_USER" ]] && echo -e "  Shell user:   ${BLUE}$SHELL_USER${NC} (drop-privileges enabled)"
[[ "$RECORD" == "1" ]] && echo -e "  Recording:    ${BLUE}ON${NC}  ($RECORD_DIR_VAR)"
echo
echo -e "${YELLOW}┌──────────────────────────────────────────────────────────────┐${NC}"
echo -e "${YELLOW}│       📋 PASTE THESE TO THE CONTROLLER UI                    │${NC}"
echo -e "${YELLOW}│       (Sidebar → Servers → Add Server)                       │${NC}"
echo -e "${YELLOW}└──────────────────────────────────────────────────────────────┘${NC}"
echo
echo -e "  ${BLUE}Name${NC}     :  $(hostname)"
echo -e "  ${BLUE}API URL${NC}  :  ${GREEN}http://$USE_IP:$PORT${NC}"
echo -e "  ${BLUE}API Key${NC}  :  ${GREEN}$KEY${NC}"
echo
if [[ "$GENERATED_KEY" == "1" ]]; then
  echo -e "  ${YELLOW}⚠  This key was auto-generated. Copy it now —${NC}"
  echo -e "  ${YELLOW}    you can also find it later at:  $KEY_FILE${NC}"
else
  echo -e "  Key reused/provided (see $KEY_FILE)"
fi
echo
echo -e "  Logs:  ${BLUE}sudo journalctl -u secureops-agent -f${NC}"
echo
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
