"""
Agent client — forwards API calls from the central Controller to a remote
Agent running SecureOps in AGENT_MODE.

Auth model:
   Controller signs each outbound request with header  X-Agent-Key: <shared>
   Agent verifies it and skips JWT/PAM (controller already authenticated user).

The controller-to-agent network is assumed to be private (Tailscale, WireGuard,
or LAN). Even so, the shared key prevents lateral movement.
"""
import asyncio
from datetime import datetime, timedelta
from typing import Any, Optional

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

import models

DEFAULT_TIMEOUT  = 15.0
HEALTH_CACHE_TTL = 10        # seconds — avoid hammering agents


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=DEFAULT_TIMEOUT,
        verify=False,        # private network — self-signed allowed
        follow_redirects=True,
    )


def resolve_server(db: Session, server_id: Optional[int]) -> Optional[models.MonitoredServer]:
    """
    Return the target server or None for the local controller itself.

    - server_id=None or 0  → controller-local (no forwarding)
    - server_id=<int>      → look up; raise 404 if missing or disabled
    """
    if not server_id or server_id == 0:
        return None
    srv = db.query(models.MonitoredServer).filter(
        models.MonitoredServer.id == server_id,
        models.MonitoredServer.enabled == True,
    ).first()
    if not srv:
        raise HTTPException(404, f"Server id={server_id} not found or disabled")
    if srv.is_local:
        return None
    return srv


async def agent_request(srv: models.MonitoredServer,
                        method: str,
                        path: str,
                        *,
                        params: Optional[dict] = None,
                        json_body: Any = None) -> httpx.Response:
    """
    Send a request to the agent and return the raw httpx Response.
    Caller is responsible for handling the response (proxying body/status).
    """
    url = f"{srv.api_url.rstrip('/')}{path}"
    headers = {"X-Agent-Key": srv.api_key, "User-Agent": "SecureOps-Controller/1.2"}
    try:
        async with _client() as c:
            return await c.request(method, url, params=params, json=json_body, headers=headers)
    except (httpx.ConnectError, httpx.ConnectTimeout) as e:
        raise HTTPException(502, f"Agent '{srv.name}' unreachable: {e}")
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Agent '{srv.name}' error: {e}")


async def agent_get_json(srv: models.MonitoredServer, path: str,
                         params: Optional[dict] = None) -> Any:
    """Convenience: GET → parse JSON, raise on non-2xx."""
    r = await agent_request(srv, "GET", path, params=params)
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text)
    return r.json()


async def agent_post_json(srv: models.MonitoredServer, path: str,
                          json_body: Any = None) -> Any:
    r = await agent_request(srv, "POST", path, json_body=json_body)
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text)
    return r.json()


async def ping_agent(srv: models.MonitoredServer, db: Session) -> dict:
    """Quick health probe — updates DB last_seen/last_status."""
    try:
        async with _client() as c:
            r = await c.get(
                f"{srv.api_url.rstrip('/')}/api/health",
                headers={"X-Agent-Key": srv.api_key},
                timeout=5,
            )
        if r.status_code == 200:
            srv.last_status = "online"
            srv.last_error  = None
        else:
            srv.last_status = "offline"
            srv.last_error  = f"HTTP {r.status_code}"
    except Exception as e:
        srv.last_status = "offline"
        srv.last_error  = str(e)[:300]
    srv.last_seen = datetime.utcnow()
    db.commit()
    return {"status": srv.last_status, "error": srv.last_error}


async def ping_all(db: Session) -> dict:
    """Refresh online status for all enabled remote servers (parallel)."""
    servers = db.query(models.MonitoredServer).filter(
        models.MonitoredServer.enabled == True,
        models.MonitoredServer.is_local == False,
    ).all()
    if not servers:
        return {"checked": 0}
    await asyncio.gather(*(ping_agent(s, db) for s in servers))
    return {"checked": len(servers)}
