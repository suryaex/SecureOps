#!/usr/bin/env bash
#
# SecureOps Agent — macOS Installer
#
# Untuk macOS 12 (Monterey), 13 (Ventura), 14 (Sonoma), 15 (Sequoia)
#
# Usage:
#   sudo SECUREOPS_AGENT_KEY=<key> bash install.sh
#
# Via one-liner dari Controller UI:
#   curl -fsSL "https://secureops.site/api/servers/install-script/<token>?os=macos" | sudo bash

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/suryaex/secureops.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/secureops-agent}"
PORT="${SECUREOPS_AGENT_PORT:-8001}"
KEY="${SECUREOPS_AGENT_KEY:-}"

SHELL_USER="${SECUREOPS_SHELL_USER:-_secureops}"
RECORD="${SECUREOPS_RECORD_SESSIONS:-0}"
RECORD_DIR_VAR="${SECUREOPS_RECORD_DIR:-/Library/Logs/SecureOps/sessions}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
say()  { echo -e "${GREEN}==> $*${NC}"; }
info() { echo -e "${BLUE}ℹ  $*${NC}"; }
warn() { echo -e "${YELLOW}!! $*${NC}"; }
die()  { echo -e "${RED}ERROR: $*${NC}"; exit 1; }

[[ $EUID -ne 0 ]] && die "Run with sudo / as root."
[[ -z "$KEY" ]] && KEY=$(openssl rand -base64 32 | tr -d '/+=' | head -c 43) && \
    warn "SECUREOPS_AGENT_KEY tidak di-set — generate otomatis: $KEY"

# -------- Detect macOS ----------
if [[ "$(uname)" != "Darwin" ]]; then
    die "Installer ini khusus macOS. Untuk Linux, pakai agent-linux/deploy/install.sh"
fi

MACOS_VERSION=$(sw_vers -productVersion)
MACOS_MAJOR=$(echo "$MACOS_VERSION" | cut -d. -f1)
say "Detected: macOS $MACOS_VERSION"

[[ "$MACOS_MAJOR" -lt 12 ]] && die "macOS 12 (Monterey)+ diperlukan"

# -------- 1) Install Homebrew (kalau belum ada) ----------
if ! command -v brew >/dev/null 2>&1; then
    say "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add to PATH for current session
    if [[ -f /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -f /usr/local/bin/brew ]]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
fi

info "Homebrew: $(brew --version | head -1)"

# -------- 2) Install Python 3.12 ----------
if ! command -v python3.12 >/dev/null 2>&1; then
    say "Installing Python 3.12..."
    brew install python@3.12
fi

PYTHON=$(brew --prefix python@3.12)/bin/python3.12
info "Python: $($PYTHON --version)"

# -------- 3) Install Git (biasanya sudah ada di macOS via Xcode CLI) ----------
if ! command -v git >/dev/null 2>&1; then
    say "Installing Git..."
    xcode-select --install || brew install git
fi

# -------- 4) Clone / pull repo ----------
if [[ -d "$INSTALL_DIR/.git" ]]; then
    say "Updating existing install di $INSTALL_DIR..."
    git -C "$INSTALL_DIR" pull --ff-only
else
    say "Cloning repo ke $INSTALL_DIR..."
    rm -rf "$INSTALL_DIR"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

# -------- 5) Setup Python venv ----------
say "Setting up Python venv..."
BACKEND_DIR="$INSTALL_DIR/agent-macos/backend"
cd "$BACKEND_DIR"
[[ -d venv ]] || "$PYTHON" -m venv venv
# shellcheck disable=SC1091
source venv/bin/activate
pip install --quiet --upgrade pip setuptools wheel
pip install --quiet -r requirements.txt
deactivate

# -------- 6) Save key ----------
mkdir -p /etc/secureops-agent
echo -n "$KEY" > /etc/secureops-agent/key
chmod 600 /etc/secureops-agent/key

# -------- 7) Shell user (drop-privileges) ----------
if ! dscl . -read /Users/"$SHELL_USER" >/dev/null 2>&1; then
    say "Creating shell user '$SHELL_USER'..."
    # macOS user creation via dscl (Directory Services)
    NEXT_UID=$(dscl . list /Users UniqueID | awk '{print $2}' | sort -n | tail -1)
    NEXT_UID=$((NEXT_UID + 1))
    dscl . -create /Users/"$SHELL_USER"
    dscl . -create /Users/"$SHELL_USER" UserShell /bin/bash
    dscl . -create /Users/"$SHELL_USER" UniqueID "$NEXT_UID"
    dscl . -create /Users/"$SHELL_USER" PrimaryGroupID 20
    dscl . -create /Users/"$SHELL_USER" NFSHomeDirectory /var/empty
fi

# -------- 8) Recording dir ----------
if [[ "$RECORD" == "1" ]]; then
    mkdir -p "$RECORD_DIR_VAR"
    chmod 0750 "$RECORD_DIR_VAR"
fi

# -------- 9) launchd LaunchDaemon ----------
say "Writing launchd LaunchDaemon..."
PLIST_PATH="/Library/LaunchDaemons/com.polsri.secureops-agent.plist"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
                       "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.polsri.secureops-agent</string>

    <key>ProgramArguments</key>
    <array>
        <string>$BACKEND_DIR/venv/bin/gunicorn</string>
        <string>-c</string>
        <string>$BACKEND_DIR/gunicorn.conf.py</string>
        <string>main:app</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$BACKEND_DIR</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$BACKEND_DIR/venv/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>SECUREOPS_AGENT_KEY</key>
        <string>$KEY</string>
        <key>SECUREOPS_BIND</key>
        <string>0.0.0.0:$PORT</string>
        <key>SECUREOPS_WORKERS</key>
        <string>2</string>
        <key>SECUREOPS_SHELL_USER</key>
        <string>$SHELL_USER</string>
        <key>SECUREOPS_RECORD_SESSIONS</key>
        <string>$RECORD</string>
        <key>SECUREOPS_RECORD_DIR</key>
        <string>$RECORD_DIR_VAR</string>
        <key>PYTHONUNBUFFERED</key>
        <string>1</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Library/Logs/SecureOps/agent-stdout.log</string>

    <key>StandardErrorPath</key>
    <string>/Library/Logs/SecureOps/agent-stderr.log</string>

    <key>UserName</key>
    <string>root</string>
</dict>
</plist>
EOF

mkdir -p /Library/Logs/SecureOps

# -------- 10) Load LaunchDaemon ----------
say "Loading LaunchDaemon..."
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load -w "$PLIST_PATH"

# -------- 11) Wait healthy ----------
say "Waiting for agent to become healthy..."
for i in {1..15}; do
    if curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/api/health" 2>/dev/null; then
        info "Agent healthy after ${i}s"
        break
    fi
    sleep 1
done

# -------- 12) Auto-register ----------
USE_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname)
AUTO_REGISTERED=0

if [[ -n "${SECUREOPS_JOIN_TOKEN:-}" && -n "${SECUREOPS_CONTROLLER_URL:-}" ]]; then
    say "Auto-registering with controller at $SECUREOPS_CONTROLLER_URL ..."

    REGISTER_PAYLOAD=$(cat <<EOF
{"token":"$SECUREOPS_JOIN_TOKEN","hostname":"$(hostname)","api_url":"http://$USE_IP:$PORT","api_key":"$KEY"}
EOF
)

    REGISTER_RESPONSE=$(curl -fsS -X POST \
        -H "Content-Type: application/json" \
        -d "$REGISTER_PAYLOAD" \
        --max-time 10 \
        "$SECUREOPS_CONTROLLER_URL/api/servers/auto-register" 2>&1 || echo "FAILED")

    if [[ "$REGISTER_RESPONSE" == "FAILED" ]]; then
        warn "Auto-registration gagal"
    else
        info "Response: $REGISTER_RESPONSE"
        AUTO_REGISTERED=1
    fi
fi

# -------- 13) Output ----------
echo
echo -e "${GREEN}═════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ SecureOps Agent for macOS Installed Successfully${NC}"
echo -e "${GREEN}═════════════════════════════════════════════════════════════════${NC}"
echo
echo "  OS:           macOS $MACOS_VERSION"
echo "  Hostname:     $(hostname)"
echo "  IP:           $USE_IP"
echo "  Port:         $PORT"
echo "  Shell user:   $SHELL_USER"
echo

if [[ "$AUTO_REGISTERED" == "1" ]]; then
    echo -e "${GREEN}  🎉 AUTO-REGISTERED WITH CONTROLLER${NC}"
    echo "     Controller: $SECUREOPS_CONTROLLER_URL"
else
    echo -e "${YELLOW}  📋 PASTE THESE TO THE CONTROLLER UI:${NC}"
    echo "     API URL :  http://$USE_IP:$PORT"
    echo "     API Key :  $KEY"
fi

echo
echo "  Manage service:"
echo "    sudo launchctl unload $PLIST_PATH    # stop"
echo "    sudo launchctl load -w $PLIST_PATH   # start"
echo
echo "  Logs:"
echo "    tail -f /Library/Logs/SecureOps/agent-stdout.log"
echo "    tail -f /Library/Logs/SecureOps/agent-stderr.log"
echo
echo -e "${GREEN}═════════════════════════════════════════════════════════════════${NC}"
