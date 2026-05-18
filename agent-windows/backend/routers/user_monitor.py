"""
User Monitor — Windows version.

Enumerates members of the local Administrators group (Windows equivalent of
sudo/wheel on Linux). Same JSON shape so Controller doesn't need adapter.
"""
import subprocess
import time
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, Request

from auth import get_current_user

router = APIRouter()


def _list_admin_members() -> List[str]:
    """Parse `net localgroup Administrators` output."""
    try:
        proc = subprocess.run(
            ["net", "localgroup", "Administrators"],
            capture_output=True, text=True, timeout=10,
            creationflags=0x08000000,  # CREATE_NO_WINDOW (Windows-specific)
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return []

    users = []
    in_members = False
    for line in proc.stdout.splitlines():
        s = line.strip()
        if "---" in s:
            in_members = True
            continue
        if "command completed" in s.lower():
            break
        if in_members and s:
            users.append(s)
    return users


def _user_last_logon(username: str):
    """Try to get last logon time via `net user`."""
    try:
        proc = subprocess.run(
            ["net", "user", username],
            capture_output=True, text=True, timeout=5,
            creationflags=0x08000000,
        )
        for line in proc.stdout.splitlines():
            if "Last logon" in line or "Logon terakhir" in line:
                ts = line.split(maxsplit=2)[-1].strip()
                if ts and ts.lower() != "never":
                    return ts
    except Exception:
        pass
    return None


@router.get("/users")
def list_admin_users(_user=Depends(get_current_user)):
    """List users with administrator privileges on this Windows host."""
    members = _list_admin_members()
    out = []
    for name in members:
        # Strip domain prefix (e.g. "BUILTIN\\Administrator")
        clean = name.split("\\")[-1]
        out.append({
            "id":              hash(clean) & 0x7fffffff,  # stable pseudo-id
            "username":        clean,
            "groups":          "Administrators",
            "last_access":     _user_last_logon(clean),
            "status":          "active",
            "failed_attempts": 0,
            "action":          "Local administrator",
            "timestamp":       datetime.utcnow().isoformat(),
        })
    return out


@router.post("/scan")
def scan_admins(request: Request, _user=Depends(get_current_user)):
    """Re-scan; returns count summary."""
    t0 = time.time()
    members = _list_admin_members()
    return {
        "total_scanned":    1,
        "issues_found":     len(members),
        "duration_seconds": round(time.time() - t0, 2),
    }
