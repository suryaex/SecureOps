#!/usr/bin/env bash
# SecureOps PRODUCTION deploy script (Controller)
#
# Supports: Ubuntu 20.04 / 22.04 / 24.04 / 25.04
#           Debian 11 / 12 / 13
#           Linux Mint 20+ / Pop!_OS 22+ / Elementary OS 7+
#
# Usage:
#   bash controller/deploy/deploy-prod.sh                    # uses defaults
#   SERVER_NAME=secureops.site bash controller/deploy/deploy-prod.sh
set -euo pipefail

# -------- Configuration --------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_DIR/backend"
FRONTEND_DIR="$REPO_DIR/frontend"

SERVER_NAME="${SERVER_NAME:-_}"
FRONTEND_ROOT="${FRONTEND_ROOT:-/var/www/secureops}"
NGINX_SITE="${NGINX_SITE:-secureops}"
NODE_VERSION="${NODE_VERSION:-20}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
say()  { echo -e "${GREEN}==> $*${NC}"; }
info() { echo -e "${BLUE}ℹ  $*${NC}"; }
warn() { echo -e "${YELLOW}!! $*${NC}"; }
die()  { echo -e "${RED}ERROR: $*${NC}"; exit 1; }

# -------- Detect distro ----------
detect_distro() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    DISTRO_ID="${ID,,}"
    DISTRO_LIKE="${ID_LIKE:-}"
    DISTRO_VERSION="${VERSION_ID:-unknown}"
    DISTRO_CODENAME="${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}"
    DISTRO_MAJOR="${DISTRO_VERSION%%.*}"
    PRETTY="${PRETTY_NAME:-$DISTRO_ID}"
  else
    die "Cannot detect distro (/etc/os-release missing)."
  fi

  case "$DISTRO_ID" in
    ubuntu|debian|linuxmint|pop|elementary|kali|raspbian|neon) : ;;
    *)
      if [[ "$DISTRO_LIKE" == *debian* || "$DISTRO_LIKE" == *ubuntu* ]]; then :
      else die "Unsupported distro: $DISTRO_ID. Need Ubuntu/Debian/derivative."
      fi
      ;;
  esac
}

detect_distro
say "Detected: $PRETTY (id=$DISTRO_ID, version=$DISTRO_VERSION)"
[[ $EUID -ne 0 ]] && warn "Some steps need sudo — you may be prompted."

export DEBIAN_FRONTEND=noninteractive

# -------- 1) System packages --------
say "Installing system packages…"
sudo apt-get update -y
sudo apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip python3-dev \
    libpam0g-dev build-essential \
    libjpeg-dev zlib1g-dev libfreetype6-dev \
    nginx \
    curl gnupg ca-certificates \
    rsync

# -------- 2) Node.js LTS via NodeSource --------
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  NODE_MAJ=$(node -v | sed 's/v//' | cut -d. -f1)
  if [[ "$NODE_MAJ" -ge 18 ]]; then
    info "Node $(node -v) already installed"
    NEED_NODE=0
  fi
fi
if [[ "$NEED_NODE" == "1" ]]; then
  say "Installing Node.js $NODE_VERSION LTS…"
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

info "Node:   $(node --version)"
info "npm:    $(npm --version)"
info "Python: $(python3 --version)"

# -------- 3) Backend venv ----------
say "Setting up backend Python venv…"
cd "$BACKEND_DIR"
if [[ ! -d venv ]]; then python3 -m venv venv; fi
# shellcheck disable=SC1091
source venv/bin/activate
pip install --quiet --upgrade pip setuptools wheel
pip install --quiet -r requirements.txt
deactivate

# -------- 4) PWA icons ----------
say "Generating PWA icons…"
"$BACKEND_DIR/venv/bin/python" "$FRONTEND_DIR/scripts/generate-icons.py" || \
    warn "Icon generation skipped (non-fatal)."

# -------- 5) Frontend build ----------
say "Installing frontend deps + building…"
cd "$FRONTEND_DIR"
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
npm run build

# -------- 6) Publish ----------
say "Publishing dist/ → $FRONTEND_ROOT"
sudo mkdir -p "$FRONTEND_ROOT"
sudo rsync -a --delete "$FRONTEND_DIR/dist/" "$FRONTEND_ROOT/"
sudo chown -R www-data:www-data "$FRONTEND_ROOT" 2>/dev/null || true

# -------- 7) nginx ----------
say "Writing nginx site config…"
sed -e "s|{{SERVER_NAME}}|$SERVER_NAME|g" \
    -e "s|{{FRONTEND_ROOT}}|$FRONTEND_ROOT|g" \
    "$SCRIPT_DIR/nginx.conf" \
  | sudo tee "/etc/nginx/sites-available/$NGINX_SITE" >/dev/null

sudo ln -sf "/etc/nginx/sites-available/$NGINX_SITE" "/etc/nginx/sites-enabled/$NGINX_SITE"
sudo rm -f /etc/nginx/sites-enabled/default || true

say "Testing nginx config…"
sudo nginx -t
sudo systemctl reload nginx || sudo systemctl restart nginx

# -------- 8) systemd backend ----------
say "Installing systemd unit…"
sed "s|{{BACKEND_DIR}}|$BACKEND_DIR|g" \
    "$SCRIPT_DIR/secureops-backend.service" \
  | sudo tee /etc/systemd/system/secureops-backend.service >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable secureops-backend
sudo systemctl restart secureops-backend

# Cleanup legacy
sudo systemctl disable --now secureops-frontend 2>/dev/null || true
sudo rm -f /etc/systemd/system/secureops-frontend.service || true
sudo systemctl daemon-reload

# -------- 9) Status ----------
sleep 2
say "Status:"
sudo systemctl --no-pager --lines=3 status secureops-backend || true
sudo systemctl --no-pager --lines=0 status nginx || true

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}  ✅ Production deploy complete${NC}"
echo
echo "  Distro:    $PRETTY"
echo "  Web:       http://$IP/"
[[ "$SERVER_NAME" != "_" ]] && echo "  Domain:    http://$SERVER_NAME/"
echo "  Backend:   http://$IP/api/health"
echo "  API docs:  http://$IP/docs"
echo
echo "  Login with your real Linux account."
echo
echo "  Next steps — HTTPS via Let's Encrypt:"
if [[ "$DISTRO_ID" == "ubuntu" && "$DISTRO_MAJOR" -ge 24 ]] \
   || [[ "$DISTRO_ID" == "debian" && "$DISTRO_MAJOR" -ge 13 ]]; then
  echo "      sudo snap install --classic certbot"
  echo "      sudo ln -sf /snap/bin/certbot /usr/bin/certbot"
  echo "      sudo certbot --nginx -d $SERVER_NAME"
else
  echo "      sudo apt install -y certbot python3-certbot-nginx"
  echo "      sudo certbot --nginx -d $SERVER_NAME"
fi
echo
echo "  Logs:      sudo journalctl -u secureops-backend -f"
echo "  Mobile:    see controller/deploy/MOBILE.md"
echo -e "${GREEN}=====================================================${NC}"
