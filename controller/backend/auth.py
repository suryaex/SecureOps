"""
Authentication module.

Supports TWO login paths:
  1) PAM authentication against the real Linux user accounts on the host.
  2) Fallback legacy DB-stored admin (only used when PAM is unavailable
     or for the bootstrap "admin"/"Admin@123" account on Windows/dev).

After a successful PAM login, the Linux user is auto-provisioned into the
`admins` table so that ownership / FK relations still work.
"""
from datetime import datetime, timedelta
from typing import Optional
import os
import platform
import grp
import pwd

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
import models

# Agent mode: when set, this backend acts as a remote agent. JWT auth is
# disabled and replaced with shared-key (X-Agent-Key) auth.
AGENT_MODE = os.getenv("SECUREOPS_AGENT_MODE", "0") == "1"
AGENT_KEY  = os.getenv("SECUREOPS_AGENT_KEY", "")

SECRET_KEY = "secureops-secret-key-change-in-production-2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# ---------- Password helpers (DB fallback) ----------

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


# ---------- PAM (real Linux user) authentication ----------

def _is_linux() -> bool:
    return platform.system().lower() == "linux"


def pam_authenticate(username: str, password: str) -> bool:
    """
    Authenticate against the host Linux PAM stack.

    Returns True only if the OS confirms the username/password.
    On non-Linux systems (Windows / macOS dev) this always returns False.
    """
    if not _is_linux():
        return False
    try:
        import pam  # python-pam
        p = pam.pam()
        # service "login" works on most distros; "sshd" or "system-auth" are alternatives
        return p.authenticate(username, password, service="login")
    except Exception:
        try:
            import pam
            p = pam.pam()
            return p.authenticate(username, password)
        except Exception:
            return False


def linux_user_exists(username: str) -> bool:
    if not _is_linux():
        return False
    try:
        pwd.getpwnam(username)
        return True
    except KeyError:
        return False


def linux_user_groups(username: str) -> list[str]:
    """Return all groups the Linux user belongs to."""
    if not _is_linux():
        return []
    try:
        user = pwd.getpwnam(username)
        groups = {g.gr_name for g in grp.getgrall() if username in g.gr_mem}
        primary = grp.getgrgid(user.pw_gid).gr_name
        groups.add(primary)
        return sorted(groups)
    except Exception:
        return []


def linux_user_role(username: str) -> str:
    """
    Map a Linux user to a SecureOps role.

    - Member of sudo / wheel / root  -> "admin"
    - Otherwise                       -> "auditor"
    """
    if username == "root":
        return "admin"
    groups = linux_user_groups(username)
    admin_groups = {"sudo", "wheel", "root", "admin", "adm"}
    return "admin" if (set(groups) & admin_groups) else "auditor"


# ---------- Token helpers ----------

def create_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    payload.update({"exp": expire})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def _verify_agent_key(request: Request) -> bool:
    """Check X-Agent-Key header matches the configured agent shared secret."""
    sent = request.headers.get("x-agent-key") or request.headers.get("X-Agent-Key")
    return bool(AGENT_KEY) and sent == AGENT_KEY


class _AgentPrincipal:
    """Pseudo-user returned to handlers when authenticated as the controller."""
    id = 0
    username = "controller"
    role = "admin"
    email = "controller@secureops.local"


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> models.Admin | _AgentPrincipal:
    """
    Resolve the caller.

    AGENT_MODE  → require X-Agent-Key (no JWT). Returns a fake admin principal.
    Normal mode → require Bearer JWT, returns the DB Admin row.
    """
    # ---------- Agent mode ----------
    if AGENT_MODE:
        if not _verify_agent_key(request):
            raise HTTPException(401, "Invalid or missing X-Agent-Key")
        return _AgentPrincipal()

    # ---------- Normal (JWT) mode ----------
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = auth_header.split(" ", 1)[1].strip()

    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        username: str = payload.get("sub")
        if not username:
            raise exc
    except JWTError:
        raise exc

    user = db.query(models.Admin).filter(models.Admin.username == username).first()
    if not user:
        raise exc
    return user


def require_admin(current_user = Depends(get_current_user)):
    if getattr(current_user, "role", None) != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return current_user


def upsert_linux_admin(db: Session, username: str) -> models.Admin:
    """Create or update the DB Admin row that mirrors a Linux user."""
    role = linux_user_role(username)
    user = db.query(models.Admin).filter(models.Admin.username == username).first()
    if user:
        user.role = role
        user.last_login = datetime.utcnow()
        db.commit()
        db.refresh(user)
        return user

    user = models.Admin(
        username=username,
        email=f"{username}@localhost",
        password_hash="!pam!",  # placeholder, never used (PAM verifies)
        role=role,
        last_login=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
