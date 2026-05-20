"""
/api/servers — manage the fleet of monitored servers.

Only available on the Controller (not on Agents).
Admin role required for create/update/delete; auditors can list & ping.
"""
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
import models
from auth import get_current_user, require_admin
from agent_client import ping_agent, ping_all

# Join tokens stored in DB (models.JoinToken) — shared across all workers
_JOIN_TOKEN_TTL_HOURS = 1

# Repo root = controller/backend/routers/../../..
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
INSTALL_SCRIPTS = {
    "linux":   _REPO_ROOT / "agent-linux"   / "deploy" / "install.sh",
    "windows": _REPO_ROOT / "agent-windows" / "deploy" / "install.ps1",
    "macos":   _REPO_ROOT / "agent-macos"   / "deploy" / "install.sh",
}


def _cleanup_expired_tokens(db: Session):
    """Drop tokens older than 24 hours from DB."""
    cutoff = datetime.utcnow() - timedelta(hours=24)
    db.query(models.JoinToken).filter(models.JoinToken.expires_at < cutoff).delete()
    db.commit()

router = APIRouter()

# ---------- Schemas ----------

class ServerCreate(BaseModel):
    name:     str = Field(..., min_length=1, max_length=100)
    hostname: str = Field(..., min_length=1, max_length=200)
    api_url:  str = Field(..., min_length=1, max_length=300)
    api_key:  Optional[str] = Field(None, max_length=200)   # auto-gen if omitted
    tags:     Optional[str] = ""
    enabled:  bool = True


class ServerUpdate(BaseModel):
    name:     Optional[str] = None
    hostname: Optional[str] = None
    api_url:  Optional[str] = None
    api_key:  Optional[str] = None
    tags:     Optional[str] = None
    enabled:  Optional[bool] = None


class ServerOut(BaseModel):
    id:          int
    name:        str
    hostname:    str
    api_url:     str
    api_key_set: bool
    tags:        Optional[str]
    enabled:     bool
    is_local:    bool
    last_status: str
    last_seen:   Optional[datetime]
    last_error:  Optional[str]
    created_at:  Optional[datetime]


def _serialize(s: models.MonitoredServer, *, include_key=False) -> dict:
    base = {
        "id":          s.id,
        "name":        s.name,
        "hostname":    s.hostname,
        "api_url":     s.api_url,
        "api_key_set": bool(s.api_key),
        "tags":        s.tags,
        "enabled":     s.enabled,
        "is_local":    s.is_local,
        "last_status": s.last_status,
        "last_seen":   s.last_seen,
        "last_error":  s.last_error,
        "created_at":  s.created_at,
    }
    if include_key:
        base["api_key"] = s.api_key
    return base


# ---------- List ----------

@router.get("")
def list_servers(db: Session = Depends(get_db),
                 _user=Depends(get_current_user)):
    rows = db.query(models.MonitoredServer).order_by(
        models.MonitoredServer.is_local.desc(),
        models.MonitoredServer.name.asc()
    ).all()
    return [_serialize(s) for s in rows]


# ---------- Create ----------

@router.post("", status_code=status.HTTP_201_CREATED)
def create_server(body: ServerCreate, request: Request,
                  db: Session = Depends(get_db),
                  current=Depends(require_admin)):
    if db.query(models.MonitoredServer).filter(models.MonitoredServer.name == body.name).first():
        raise HTTPException(409, f"Server '{body.name}' already exists")

    api_key = body.api_key or secrets.token_urlsafe(32)
    srv = models.MonitoredServer(
        name=body.name.strip(),
        hostname=body.hostname.strip(),
        api_url=body.api_url.rstrip("/"),
        api_key=api_key,
        tags=(body.tags or "").strip(),
        enabled=body.enabled,
        is_local=False,
        last_status="unknown",
    )
    db.add(srv); db.commit(); db.refresh(srv)

    db.add(models.AdminActivityLog(
        admin_id=getattr(current, "id", None),
        admin_username=getattr(current, "username", "system"),
        action="Add Server",
        details=f"Registered '{srv.name}' at {srv.api_url}",
        ip_address=request.client.host or "unknown",
        status="success",
    ))
    db.commit()

    # Return the api_key ONCE so the operator can paste it into the agent
    return _serialize(srv, include_key=True)


# ---------- Update ----------

@router.patch("/{server_id}")
def update_server(server_id: int, body: ServerUpdate, request: Request,
                  db: Session = Depends(get_db),
                  current=Depends(require_admin)):
    srv = db.query(models.MonitoredServer).filter(models.MonitoredServer.id == server_id).first()
    if not srv:
        raise HTTPException(404, "Server not found")
    if srv.is_local:
        raise HTTPException(400, "Cannot edit the local controller entry")

    for field, val in body.dict(exclude_unset=True).items():
        if val is not None:
            if field == "api_url":
                val = val.rstrip("/")
            setattr(srv, field, val)
    db.commit(); db.refresh(srv)

    db.add(models.AdminActivityLog(
        admin_id=getattr(current, "id", None),
        admin_username=getattr(current, "username", "system"),
        action="Edit Server",
        details=f"Updated '{srv.name}'",
        ip_address=request.client.host or "unknown",
        status="success",
    ))
    db.commit()
    return _serialize(srv)


# ---------- Delete ----------

@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_server(server_id: int, request: Request,
                  db: Session = Depends(get_db),
                  current=Depends(require_admin)):
    srv = db.query(models.MonitoredServer).filter(models.MonitoredServer.id == server_id).first()
    if not srv:
        raise HTTPException(404, "Server not found")
    if srv.is_local:
        raise HTTPException(400, "Cannot delete the local controller entry")

    name = srv.name
    db.delete(srv); db.commit()

    db.add(models.AdminActivityLog(
        admin_id=getattr(current, "id", None),
        admin_username=getattr(current, "username", "system"),
        action="Delete Server",
        details=f"Removed '{name}'",
        ip_address=request.client.host or "unknown",
        status="success",
    ))
    db.commit()


# ---------- Ping (health probe) ----------

@router.post("/{server_id}/ping")
async def ping_one(server_id: int, db: Session = Depends(get_db),
                   _user=Depends(get_current_user)):
    srv = db.query(models.MonitoredServer).filter(models.MonitoredServer.id == server_id).first()
    if not srv:
        raise HTTPException(404, "Server not found")
    if srv.is_local:
        return {"status": "online", "note": "controller-local"}
    return await ping_agent(srv, db)


@router.post("/ping-all")
async def ping_everyone(db: Session = Depends(get_db),
                        _user=Depends(get_current_user)):
    return await ping_all(db)


# =====================================================================
#  AUTO-REGISTRATION FLOW (v1.5+)
#
#  3 endpoints together implement zero-touch agent join:
#  1. POST /join-token  → admin creates a one-time token in UI
#  2. GET  /install-script/{token}  → agent downloads personalized script
#  3. POST /auto-register  → agent calls back after install to self-register
# =====================================================================

class JoinTokenCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    tags: Optional[str] = ""
    os:   Optional[str] = "linux"   # linux / windows / macos


@router.post("/join-token")
def create_join_token(body: JoinTokenCreate, request: Request,
                      db: Session = Depends(get_db),
                      current=Depends(require_admin)):
    """Admin creates a one-time join token. Returns the install command."""
    _cleanup_expired_tokens(db)

    # Make sure name isn't already taken
    if db.query(models.MonitoredServer).filter(models.MonitoredServer.name == body.name).first():
        raise HTTPException(409, f"Server name '{body.name}' already exists")

    # Check pending tokens for same name
    pending = db.query(models.JoinToken).filter(
        models.JoinToken.name == body.name,
        models.JoinToken.used == False,
        models.JoinToken.expires_at > datetime.utcnow(),
    ).first()
    if pending:
        raise HTTPException(409, f"A pending join token for '{body.name}' already exists. Wait for it to expire (max {_JOIN_TOKEN_TTL_HOURS}h) or pick another name.")

    # Validate OS
    target_os = (body.os or "linux").lower().strip()
    if target_os not in ("linux", "windows", "macos"):
        raise HTTPException(400, f"Invalid OS '{target_os}'. Use linux/windows/macos.")

    token      = secrets.token_urlsafe(24)
    expires_at = datetime.utcnow() + timedelta(hours=_JOIN_TOKEN_TTL_HOURS)

    db_token = models.JoinToken(
        token=token,
        name=body.name,
        tags=(body.tags or "").strip(),
        target_os=target_os,
        used=False,
        expires_at=expires_at,
        created_by=current.username,
    )
    db.add(db_token)
    db.commit()

    # Build absolute public URL from request
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host  = request.headers.get("x-forwarded-host",  request.headers.get("host", "localhost"))
    base  = f"{proto}://{host}"

    # OS-specific one-liner
    if target_os == "windows":
        one_liner = (
            f'iwr "{base}/api/servers/install-script/{token}?os=windows" '
            f'-UseBasicParsing | iex'
        )
    elif target_os == "macos":
        one_liner = (
            f'curl -fsSL "{base}/api/servers/install-script/{token}?os=macos" | sudo bash'
        )
    else:  # linux
        one_liner = (
            f'curl -fsSL "{base}/api/servers/install-script/{token}" | sudo bash'
        )

    db.add(models.AdminActivityLog(
        admin_id=getattr(current, "id", None),
        admin_username=current.username,
        action="Create Join Token",
        details=f"Token for '{body.name}' (expires {expires_at.isoformat()})",
        ip_address=request.client.host or "unknown",
        status="success",
    ))
    db.commit()

    return {
        "token":           token,
        "name":            body.name,
        "tags":            body.tags or "",
        "os":              target_os,
        "expires_at":      expires_at.isoformat() + "Z",
        "ttl_seconds":     int((expires_at - datetime.utcnow()).total_seconds()),
        "install_command": one_liner,
        "controller_url":  base,
    }


@router.get("/join-token/{token}/status")
def join_token_status(token: str, db: Session = Depends(get_db),
                      _user=Depends(get_current_user)):
    """Polled by the UI to check if the agent has registered yet."""
    tok = db.query(models.JoinToken).filter(models.JoinToken.token == token).first()
    if not tok:
        raise HTTPException(404, "Token not found")

    if tok.used and tok.server_id:
        srv = db.query(models.MonitoredServer).filter(models.MonitoredServer.id == tok.server_id).first()
        return {
            "status":      "registered",
            "used":        True,
            "server_id":   tok.server_id,
            "server_name": srv.name if srv else tok.name,
            "hostname":    srv.hostname if srv else None,
            "api_url":     srv.api_url if srv else None,
            "last_status": srv.last_status if srv else None,
        }

    if tok.expires_at < datetime.utcnow():
        return {"status": "expired", "used": False}

    return {
        "status":     "pending",
        "used":       False,
        "expires_at": tok.expires_at.isoformat() + "Z",
    }


@router.get("/install-script/{token}", response_class=PlainTextResponse)
def get_install_script(token: str, request: Request,
                       os: Optional[str] = None,
                       db: Session = Depends(get_db)):
    """PUBLIC endpoint — agent downloads a personalized install script.

    Install script is read from controller's local disk (agent-{os}/deploy/install.*)
    and prefixed with token env vars. No GitHub dependency.
    """
    tok = db.query(models.JoinToken).filter(models.JoinToken.token == token).first()
    if not tok:
        raise HTTPException(404, "Invalid token")
    if tok.used:
        raise HTTPException(410, "Token already used")
    if tok.expires_at < datetime.utcnow():
        raise HTTPException(410, "Token expired")

    # Build a dict-like view for backward-compatible templating below
    tok_dict = {
        "name":       tok.name,
        "tags":       tok.tags or "",
        "expires_at": tok.expires_at,
    }

    target_os = (os or tok.target_os or "linux").lower()
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host  = request.headers.get("x-forwarded-host",  request.headers.get("host", "localhost"))
    base  = f"{proto}://{host}"

    # Read the actual installer from disk
    script_path = INSTALL_SCRIPTS.get(target_os)
    if not script_path or not script_path.exists():
        raise HTTPException(500, f"Install script for OS '{target_os}' not found on controller disk")

    installer_body = script_path.read_text(encoding="utf-8")

    # ────────────────── WINDOWS ──────────────────
    if target_os == "windows":
        # Prefix: env vars + admin check, then INLINE the full install.ps1
        prefix = (
            "# SecureOps Agent - Windows installer (token-injected)\r\n"
            f"# Generated for: {tok_dict['name']}\r\n"
            f"# Expires:       {tok_dict['expires_at'].isoformat()}Z\r\n"
            "\r\n"
            "Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force\r\n"
            "\r\n"
            f'$env:SECUREOPS_CONTROLLER_URL = "{base}"\r\n'
            f'$env:SECUREOPS_JOIN_TOKEN     = "{token}"\r\n'
            f'$env:SECUREOPS_SERVER_NAME    = "{tok_dict["name"]}"\r\n'
            f'$env:SECUREOPS_TAGS           = "{tok_dict["tags"]}"\r\n'
            'if (-not $env:SECUREOPS_RECORD_SESSIONS) { $env:SECUREOPS_RECORD_SESSIONS = "1" }\r\n'
            "\r\n"
            "# Must be Administrator\r\n"
            "$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()\r\n"
            "if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {\r\n"
            '    Write-Error "Must run as Administrator. Right-click PowerShell -> Run as Administrator."\r\n'
            "    exit 1\r\n"
            "}\r\n"
            "\r\n"
        )
        # Combine prefix + actual installer body (read from disk)
        # Normalize line endings to CRLF for Windows
        body = installer_body.replace("\r\n", "\n").replace("\n", "\r\n")
        return PlainTextResponse(content=prefix + body, media_type="text/x-powershell")

    # ────────────────── macOS ──────────────────
    if target_os == "macos":
        prefix = (
            "#!/usr/bin/env bash\n"
            "# SecureOps Agent - macOS installer (token-injected)\n"
            f"# Generated for: {tok_dict['name']}\n"
            f"# Expires:       {tok_dict['expires_at'].isoformat()}Z\n"
            "set -euo pipefail\n"
            "\n"
            f'export SECUREOPS_CONTROLLER_URL="{base}"\n'
            f'export SECUREOPS_JOIN_TOKEN="{token}"\n'
            f'export SECUREOPS_SERVER_NAME="{tok_dict["name"]}"\n'
            f'export SECUREOPS_TAGS="{tok_dict["tags"]}"\n'
            'export SECUREOPS_SHELL_USER="${SECUREOPS_SHELL_USER:-_secureops}"\n'
            'export SECUREOPS_RECORD_SESSIONS="${SECUREOPS_RECORD_SESSIONS:-1}"\n'
            "\n"
        )
        # Strip shebang from the body since prefix already has one
        body = installer_body
        if body.startswith("#!"):
            body = body.split("\n", 1)[1] if "\n" in body else ""
        return PlainTextResponse(content=prefix + body, media_type="text/x-shellscript")

    # ────────────────── LINUX (default) ──────────────────
    prefix = (
        "#!/usr/bin/env bash\n"
        "# SecureOps Agent - Linux installer (token-injected)\n"
        f"# Generated for: {tok_dict['name']}\n"
        f"# Expires:       {tok_dict['expires_at'].isoformat()}Z\n"
        "set -euo pipefail\n"
        "\n"
        f'export SECUREOPS_CONTROLLER_URL="{base}"\n'
        f'export SECUREOPS_JOIN_TOKEN="{token}"\n'
        f'export SECUREOPS_SERVER_NAME="{tok_dict["name"]}"\n'
        f'export SECUREOPS_TAGS="{tok_dict["tags"]}"\n'
        'export SECUREOPS_SHELL_USER="${SECUREOPS_SHELL_USER:-secureops}"\n'
        'export SECUREOPS_RECORD_SESSIONS="${SECUREOPS_RECORD_SESSIONS:-1}"\n'
        "\n"
        '# Ensure shell user exists (idempotent)\n'
        'id "$SECUREOPS_SHELL_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$SECUREOPS_SHELL_USER"\n'
        "\n"
    )
    body = installer_body
    if body.startswith("#!"):
        body = body.split("\n", 1)[1] if "\n" in body else ""
    return PlainTextResponse(content=prefix + body, media_type="text/x-shellscript")


class AutoRegisterBody(BaseModel):
    token:    str
    hostname: str = Field(..., max_length=200)
    api_url:  str = Field(..., max_length=300)
    api_key:  str = Field(..., min_length=20, max_length=200)


@router.post("/auto-register")
def auto_register(body: AutoRegisterBody, request: Request,
                  db: Session = Depends(get_db)):
    """
    PUBLIC endpoint — called by the agent at the end of install to self-register.
    Consumes the one-time join token and creates a MonitoredServer row.
    """
    tok = db.query(models.JoinToken).filter(models.JoinToken.token == body.token).first()
    if not tok:
        raise HTTPException(404, "Invalid token")
    if tok.used:
        raise HTTPException(410, "Token already used")
    if tok.expires_at < datetime.utcnow():
        raise HTTPException(410, "Token expired")

    # Double-check name still free (race condition guard)
    if db.query(models.MonitoredServer).filter(models.MonitoredServer.name == tok.name).first():
        raise HTTPException(409, f"Server name '{tok.name}' was registered by someone else")

    srv = models.MonitoredServer(
        name=tok.name,
        hostname=body.hostname.strip(),
        api_url=body.api_url.rstrip("/"),
        api_key=body.api_key,
        tags=tok.tags or "",
        enabled=True,
        is_local=False,
        last_status="online",
        last_seen=datetime.utcnow(),
    )
    db.add(srv)
    db.commit()
    db.refresh(srv)

    tok.used      = True
    tok.used_at   = datetime.utcnow()
    tok.server_id = srv.id
    db.commit()

    db.add(models.AdminActivityLog(
        admin_id=None,
        admin_username=f"agent:{srv.name}",
        action="Auto-Register Server",
        details=f"Agent '{srv.name}' joined via token ({body.api_url})",
        ip_address=request.client.host or "unknown",
        status="success",
    ))
    db.commit()

    return {
        "status":       "registered",
        "server_id":    srv.id,
        "server_name":  srv.name,
    }
