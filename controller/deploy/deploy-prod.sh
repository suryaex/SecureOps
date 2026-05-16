#!/usr/bin/env bash
# SecureOps PRODUCTION deploy script
#
# Usage:
#   bash deploy/deploy-prod.sh                    # uses defaults (LAN)
#   SERVER_NAME=secureops.example.com bash deploy/deploy-prod.sh
#
# What this does:
#   1. Installs system packages (nginx, node, python, libpam, pillow deps)
#   2. Creates Python venv and installs backend requirements
#   3. Generates PWA icons
#   4. Builds the React frontend (vite build → dist/)
#   5. Copies dist/ to /var/www/secureops
#   6. Renders nginx site config and reloads nginx
#   7. Installs and starts the systemd backend service
#
# Re-running is safe (idempotent).
set -euo pipefail

# -------- Configuration --------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_DIR/backend"
FRONTEND_DIR="$REPO_DIR/frontend"

SERVER_NAME="${SERVER_NAME:-_}"          # nginx server_name (use "_" to match anything)
FRONTEND_ROOT="${FRONTEND_ROOT:-/var/www/secureops}"
NGINX_SITE="${NGINX_SITE:-secureops}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
say() { echo -e "${GREEN}==> $*${NC}"; }
warn() { echo -e "${YELLOW}!! $*${NC}"; }
die()  { echo -e "${RED}ERROR: $*${NC}"; exit 1; }

[[ $EUID -ne 0 ]] && warn "Some steps need sudo — you may be prompted."

# -------- 1) System packages --------
if command -v apt-get >/dev/null 2>&1; then
  say "Installing system packages…"
  sudo apt-get update -y
  sudo apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip python3-dev \
      libpam0g-dev build-essential \
      libjpeg-dev zlib1g-dev libfreetype6-dev \
      nginx \
      curl gnupg ca-certificates
  # Node 20 LTS from NodeSource if not present or too old
  if ! command -v node >/dev/null 2>&1 || [[ $(node -v | sed 's/v//' | cut -d. -f1) -lt 18 ]]; then
    say "Installing Node.js 20 LTS…"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
fi

# -------- 2) Backend --------
say "Setting up backend Python venv…"
cd "$BACKEND_DIR"
if [[ ! -d venv ]]; then python3 -m venv venv; fi
# shellcheck disable=SC1091
source venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
deactivate

# -------- 3) Icons --------
say "Generating PWA icons…"
"$BACKEND_DIR/venv/bin/python" "$FRONTEND_DIR/scripts/generate-icons.py" || \
    warn "Icon generation failed (non-fatal) — using existing icons if any."

# -------- 4) Frontend build --------
say "Installing frontend dependencies…"
cd "$FRONTEND_DIR"
npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund

say "Building frontend (vite build)…"
npm run build

# -------- 5) Publish static files --------
say "Publishing dist/ → $FRONTEND_ROOT"
sudo mkdir -p "$FRONTEND_ROOT"
sudo rsync -a --delete "$FRONTEND_DIR/dist/" "$FRONTEND_ROOT/"
sudo chown -R www-data:www-data "$FRONTEND_ROOT" 2>/dev/null || true

# -------- 6) nginx config --------
say "Writing nginx site config…"
sudo install -m 0644 /dev/null "/etc/nginx/sites-available/$NGINX_SITE"
sed -e "s|{{SERVER_NAME}}|$SERVER_NAME|g" \
    -e "s|{{FRONTEND_ROOT}}|$FRONTEND_ROOT|g" \
    "$SCRIPT_DIR/nginx.conf" | sudo tee "/etc/nginx/sites-available/$NGINX_SITE" >/dev/null

sudo ln -sf "/etc/nginx/sites-available/$NGINX_SITE" "/etc/nginx/sites-enabled/$NGINX_SITE"
sudo rm -f /etc/nginx/sites-enabled/default || true

say "Testing nginx config…"
sudo nginx -t
sudo systemctl reload nginx || sudo systemctl restart nginx

# -------- 7) systemd backend --------
say "Installing systemd unit…"
sed "s|{{BACKEND_DIR}}|$BACKEND_DIR|g" \
    "$SCRIPT_DIR/secureops-backend.service" \
  | sudo tee /etc/systemd/system/secureops-backend.service >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable secureops-backend
sudo systemctl restart secureops-backend

# Disable old dev frontend service if it exists
sudo systemctl disable --now secureops-frontend 2>/dev/null || true
sudo rm -f /etc/systemd/system/secureops-frontend.service || true
sudo systemctl daemon-reload

# -------- 8) Status --------
sleep 2
say "Status:"
sudo systemctl --no-pager --lines=3 status secureops-backend || true
sudo systemctl --no-pager --lines=0 status nginx || true

IP="$(hostname -I | awk '{print $1}')"
echo
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}  ✅ Production deploy complete${NC}"
echo
echo "  Web:        http://$IP/"
[[ "$SERVER_NAME" != "_" ]] && echo "  Domain:     http://$SERVER_NAME/"
echo "  Backend:    http://$IP/api/health"
echo "  API docs:   http://$IP/docs"
echo
echo "  Login with your real Linux account."
echo
echo "  Next:"
echo "    • Add HTTPS:  sudo certbot --nginx -d $SERVER_NAME"
echo "    • Logs:       sudo journalctl -u secureops-backend -f"
echo "    • Mobile:     see deploy/MOBILE.md"
echo -e "${GREEN}=====================================================${NC}"
