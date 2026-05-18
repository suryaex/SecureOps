"""Agent-mode auth for Windows — same X-Agent-Key model as Linux."""
import os
from fastapi import HTTPException, Request


AGENT_KEY = os.getenv("SECUREOPS_AGENT_KEY", "")
if not AGENT_KEY:
    print("[WARN] SECUREOPS_AGENT_KEY is not set — agent will reject ALL requests.")


class _AgentPrincipal:
    """Pseudo-user returned to handlers when authenticated as the controller."""
    id = 0
    username = "controller"
    role = "admin"
    email = "controller@secureops.local"


def get_current_user(request: Request) -> _AgentPrincipal:
    sent = request.headers.get("x-agent-key") or request.headers.get("X-Agent-Key")
    if not AGENT_KEY or sent != AGENT_KEY:
        raise HTTPException(401, "Invalid or missing X-Agent-Key")
    return _AgentPrincipal()


def require_admin():
    return _AgentPrincipal()
