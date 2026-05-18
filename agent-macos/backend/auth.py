"""
Agent-mode auth — minimal.

Every inbound request must carry  X-Agent-Key: <shared-secret>.
This file replaces the full controller's auth.py.
"""
import os
import grp
import pwd
import platform
from fastapi import Depends, HTTPException, Request, status


AGENT_KEY = os.getenv("SECUREOPS_AGENT_KEY", "")
if not AGENT_KEY:
    print("⚠️  SECUREOPS_AGENT_KEY is not set — agent will reject ALL requests.")


class _AgentPrincipal:
    """Pseudo-user returned to handlers so existing routers Just Work."""
    id = 0
    username = "controller"
    role = "admin"
    email = "controller@secureops.local"


def get_current_user(request: Request) -> _AgentPrincipal:
    sent = request.headers.get("x-agent-key") or request.headers.get("X-Agent-Key")
    if not AGENT_KEY or sent != AGENT_KEY:
        raise HTTPException(401, "Invalid or missing X-Agent-Key")
    return _AgentPrincipal()


def require_admin(user=Depends(get_current_user)):
    return user  # controller is always admin from agent's POV


# ---- Linux helpers reused by sudo monitor ----

def _is_linux() -> bool:
    return platform.system().lower() == "linux"


def linux_user_exists(username: str) -> bool:
    if not _is_linux():
        return False
    try:
        pwd.getpwnam(username); return True
    except KeyError:
        return False


def linux_user_groups(username: str):
    if not _is_linux():
        return []
    try:
        u = pwd.getpwnam(username)
        groups = {g.gr_name for g in grp.getgrall() if username in g.gr_mem}
        groups.add(grp.getgrgid(u.pw_gid).gr_name)
        return sorted(groups)
    except Exception:
        return []
