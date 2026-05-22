"""
Terminal WebSocket proxy (controller side).

Browser → Controller: ws://controller/api/terminal/{server_id}/ws?token=<JWT>
Controller → Agent:   ws://<agent-tailscale-ip>:8001/api/terminal/ws?key=<X-Agent-Key>

Auth model:
- Browser provides JWT in ?token query param (WebSocket can't easily set Authorization header).
- Controller decodes JWT, requires admin role.
- Then opens upstream WS to agent using the shared X-Agent-Key.

Every session is recorded in admin_activity_logs (start + end with duration).
"""
import asyncio
import logging
from datetime import datetime
from urllib.parse import urlparse, quote

import httpx
import websockets
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.responses import Response
from jose import JWTError
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
import models
from auth import decode_token, require_admin
from agent_client import resolve_server, agent_get_json, agent_request

router = APIRouter()
log = logging.getLogger("secureops.terminal-proxy")


def _http_to_ws(url: str) -> str:
    """http://host:port → ws://host:port  /  https → wss."""
    if url.startswith("https://"):
        return "wss://" + url[len("https://"):]
    if url.startswith("http://"):
        return "ws://" + url[len("http://"):]
    return url


def _log_event(*, admin_username: str, admin_id: int,
               action: str, details: str, ip: str, status_str: str = "success") -> None:
    db = SessionLocal()
    try:
        db.add(models.AdminActivityLog(
            admin_id=admin_id, admin_username=admin_username,
            action=action, details=details,
            ip_address=ip, status=status_str,
        ))
        db.commit()
    finally:
        db.close()


@router.websocket("/{server_id}/ws")
async def terminal_proxy(ws: WebSocket, server_id: int, token: str = Query(default="")):
    # ---------- 1. Auth: JWT ----------
    if not token:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="missing token")
        return

    try:
        payload = decode_token(token)
        username = payload.get("sub")
        role     = payload.get("role")
    except JWTError:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="bad token")
        return

    if role != "admin":
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="admin only")
        return

    # ---------- 2. Look up target server ----------
    db = SessionLocal()
    try:
        srv = db.query(models.MonitoredServer).filter(
            models.MonitoredServer.id == server_id,
            models.MonitoredServer.enabled == True,
        ).first()
        admin = db.query(models.Admin).filter(models.Admin.username == username).first()
        admin_id = admin.id if admin else 0
    finally:
        db.close()

    if not srv:
        await ws.close(code=status.WS_1011_INTERNAL_ERROR, reason="server not found")
        return

    if srv.is_local:
        await ws.close(code=status.WS_1011_INTERNAL_ERROR,
                       reason="local controller terminal not supported via this endpoint")
        return

    client_ip = ws.client.host if ws.client else "unknown"
    # CRITICAL: URL-encode the key. If agent key contains "#", "&", "+", "=" etc.
    # (e.g. from Windows GeneratePassword), unencoded URL breaks query parsing on
    # agent side, leading to HTTP 403. quote(safe="") encodes EVERYTHING except a-zA-Z0-9.
    encoded_key = quote(srv.api_key, safe="")
    upstream_url = _http_to_ws(srv.api_url.rstrip("/")) + f"/api/terminal/ws?key={encoded_key}"

    started = datetime.utcnow()
    _log_event(admin_username=username, admin_id=admin_id,
               action="Terminal Open",
               details=f"Opened terminal on '{srv.name}' ({srv.hostname})",
               ip=client_ip)

    await ws.accept()

    # ---------- 3. Upstream connection ----------
    try:
        agent_ws = await websockets.connect(upstream_url, max_size=2**22, ping_interval=20)
    except Exception as e:
        await ws.send_text(f"\r\n\x1b[31m[error] cannot connect to agent: {e}\x1b[0m\r\n")
        await ws.close()
        _log_event(admin_username=username, admin_id=admin_id,
                   action="Terminal Open",
                   details=f"Failed connecting to '{srv.name}': {e}",
                   ip=client_ip, status_str="failed")
        return

    # Push session metadata for the agent's recorder
    import json as _json
    try:
        await agent_ws.send(_json.dumps({"meta": {"user": username, "ip": client_ip}}))
    except Exception:
        pass

    # ---------- 4. Bi-directional pipe ----------
    async def client_to_agent():
        try:
            while True:
                msg = await ws.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                if "bytes" in msg and msg["bytes"] is not None:
                    await agent_ws.send(msg["bytes"])
                elif "text" in msg and msg["text"] is not None:
                    await agent_ws.send(msg["text"])
        except (WebSocketDisconnect, websockets.ConnectionClosed, RuntimeError):
            pass

    async def agent_to_client():
        try:
            async for data in agent_ws:
                if isinstance(data, (bytes, bytearray)):
                    await ws.send_bytes(data)
                else:
                    await ws.send_text(data)
        except (websockets.ConnectionClosed, RuntimeError):
            pass

    try:
        done, pending = await asyncio.wait(
            {asyncio.create_task(client_to_agent()), asyncio.create_task(agent_to_client())},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()
    finally:
        try: await agent_ws.close()
        except Exception: pass
        try: await ws.close()
        except Exception: pass

        duration = (datetime.utcnow() - started).total_seconds()
        _log_event(admin_username=username, admin_id=admin_id,
                   action="Terminal Close",
                   details=f"Closed terminal on '{srv.name}' (duration {duration:.1f}s)",
                   ip=client_ip)


# ---------- Recording management ----------

@router.get("/{server_id}/recordings")
async def list_recordings(server_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Proxy to agent: list all .cast recordings."""
    srv = resolve_server(db, server_id)
    if srv is None:
        raise HTTPException(400, "Server must be a remote agent (not the local controller)")
    return await agent_get_json(srv, "/api/terminal/recordings")


@router.get("/{server_id}/recordings/{name}")
async def download_recording(server_id: int, name: str,
                             db: Session = Depends(get_db),
                             _admin=Depends(require_admin)):
    """Proxy to agent: download a single .cast file."""
    srv = resolve_server(db, server_id)
    if srv is None:
        raise HTTPException(400, "Server must be a remote agent")
    r = await agent_request(srv, "GET", f"/api/terminal/recordings/{name}")
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text)
    return Response(
        content=r.content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
