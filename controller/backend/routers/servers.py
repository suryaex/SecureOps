"""
/api/servers — manage the fleet of monitored servers.

Only available on the Controller (not on Agents).
Admin role required for create/update/delete; auditors can list & ping.
"""
import secrets
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
import models
from auth import get_current_user, require_admin
from agent_client import ping_agent, ping_all

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
