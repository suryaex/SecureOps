"""
Global search across all SecureOps tables.

Used by the top-bar search box. Returns categorized hits with a route hint
so the frontend can jump straight to the relevant page.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from auth import get_current_user
import models

router = APIRouter()


@router.get("")
def global_search(
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = 5,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    needle = f"%{q.strip()}%"
    results = {
        "query": q,
        "logs": [],
        "users": [],
        "files": [],
        "permissions": [],
    }

    # Activity logs
    logs = (db.query(models.AdminActivityLog)
              .filter(or_(
                  models.AdminActivityLog.admin_username.ilike(needle),
                  models.AdminActivityLog.action.ilike(needle),
                  models.AdminActivityLog.details.ilike(needle),
                  models.AdminActivityLog.ip_address.ilike(needle),
              ))
              .order_by(models.AdminActivityLog.timestamp.desc())
              .limit(limit).all())
    for l in logs:
        results["logs"].append({
            "id": l.id,
            "title": f"{l.admin_username} — {l.action}",
            "subtitle": l.details or l.ip_address,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None,
            "status": l.status,
            "route": "/activity-logs",
        })

    # Sudo users
    sudo = (db.query(models.SudoLog)
              .filter(or_(
                  models.SudoLog.username.ilike(needle),
                  models.SudoLog.groups.ilike(needle),
                  models.SudoLog.action.ilike(needle),
              ))
              .limit(limit).all())
    for s in sudo:
        results["users"].append({
            "id": s.id,
            "title": s.username,
            "subtitle": f"Groups: {s.groups or '—'} · {s.failed_attempts} failed",
            "status": s.status,
            "route": "/sudo-monitor",
        })

    # File integrity
    files = (db.query(models.FileIntegrity)
               .filter(models.FileIntegrity.filename.ilike(needle))
               .limit(limit).all())
    for f in files:
        results["files"].append({
            "id": f.id,
            "title": f.filename,
            "subtitle": f"Hash {f.hash_value[:12]}…",
            "status": f.status,
            "route": "/file-integrity",
        })

    # Permission audit
    perms = (db.query(models.PermissionAuditLog)
               .filter(or_(
                   models.PermissionAuditLog.file_path.ilike(needle),
                   models.PermissionAuditLog.issue_type.ilike(needle),
                   models.PermissionAuditLog.permission_value.ilike(needle),
                   models.PermissionAuditLog.severity.ilike(needle),
               ))
               .order_by(models.PermissionAuditLog.detected_at.desc())
               .limit(limit).all())
    for p in perms:
        results["permissions"].append({
            "id": p.id,
            "title": p.file_path,
            "subtitle": f"{p.issue_type} · {p.permission_value}",
            "status": p.severity,
            "route": "/permission-audit",
        })

    results["total"] = sum(len(results[k]) for k in ("logs", "users", "files", "permissions"))
    return results
