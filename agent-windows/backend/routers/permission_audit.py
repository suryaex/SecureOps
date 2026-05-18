"""
Permission Audit — Windows version.

Scans key directories for dangerous ACL settings using `icacls`.
Flags entries with:
- "Everyone:F" or "Everyone:M" → Critical
- "BUILTIN\\Users:F" / "Authenticated Users:F" → High
- "Anonymous Logon" with access → Critical
"""
import json
import os
import re
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request

from auth import get_current_user

router = APIRouter()

STATE_DIR  = Path(os.getenv("PROGRAMDATA", "C:\\ProgramData")) / "SecureOps-Agent"
STATE_FILE = STATE_DIR / "permission-audit.json"
STATE_DIR.mkdir(parents=True, exist_ok=True)


SCAN_TARGETS = [
    r"C:\Windows\System32\config",
    r"C:\Windows\Tasks",
    r"C:\Program Files",
    r"C:\ProgramData",
    r"C:\Users\Public",
]

DANGEROUS = [
    (re.compile(r"Everyone:\(?[FM]",                  re.IGNORECASE), "Everyone has Full/Modify",       "Critical"),
    (re.compile(r"BUILTIN\\Users:\(?F",               re.IGNORECASE), "Users group has Full Control",   "High"),
    (re.compile(r"Authenticated Users:\(?F",          re.IGNORECASE), "Authenticated Users has Full",   "High"),
    (re.compile(r"NT AUTHORITY\\Anonymous Logon",     re.IGNORECASE), "Anonymous has access",           "Critical"),
]


def _load() -> list:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _save(items: list) -> None:
    STATE_FILE.write_text(json.dumps(items, indent=2), encoding="utf-8")


def _icacls(path: str) -> str:
    try:
        proc = subprocess.run(
            ["icacls", path],
            capture_output=True, text=True, timeout=15,
            creationflags=0x08000000,
        )
        return proc.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ""


def _scan_one(target: str, by: str, items: list, total: list):
    if not Path(target).exists():
        return

    try:
        entries = [target] + [str(p) for p in Path(target).iterdir()][:50]
    except (PermissionError, OSError):
        entries = [target]

    for path in entries:
        total[0] += 1
        output = _icacls(path)
        for pattern, issue_type, severity in DANGEROUS:
            m = pattern.search(output)
            if m:
                items.append({
                    "id":               len(items) + 1,
                    "file_path":        path,
                    "issue_type":       issue_type,
                    "permission_value": m.group(0)[:32],
                    "severity":         severity,
                    "detected_at":      datetime.utcnow().isoformat(),
                    "scanned_by":       by,
                })


@router.get("/logs")
def get_logs(
    severity: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    _user=Depends(get_current_user),
):
    items = _load()
    if severity:
        items = [i for i in items if i.get("severity") == severity]
    items.sort(key=lambda i: i.get("detected_at", ""), reverse=True)
    return items[skip:skip + limit]


@router.post("/scan")
def run_scan(request: Request, _user=Depends(get_current_user)):
    t0 = time.time()
    items = []
    total = [0]

    for target in SCAN_TARGETS:
        _scan_one(target, "controller", items, total)

    _save(items)

    return {
        "total_scanned":    total[0],
        "issues_found":     len(items),
        "duration_seconds": round(time.time() - t0, 2),
    }
