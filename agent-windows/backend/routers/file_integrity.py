"""
File Integrity Monitoring — Windows version.

Same SHA-256 logic as Linux, but uses in-memory state file at
%PROGRAMDATA%\\SecureOps-Agent\\file-integrity.json instead of SQLite.
"""
import hashlib
import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import get_current_user

router = APIRouter()

STATE_DIR  = Path(os.getenv("PROGRAMDATA", "C:\\ProgramData")) / "SecureOps-Agent"
STATE_FILE = STATE_DIR / "file-integrity.json"
STATE_DIR.mkdir(parents=True, exist_ok=True)


class FileAdd(BaseModel):
    filename: str


def _load() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def _sha256(path: str) -> str | None:
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()
    except (PermissionError, FileNotFoundError, OSError):
        return None


@router.get("/files")
def list_files(_user=Depends(get_current_user)):
    state = _load()
    out = []
    for fname, info in state.items():
        out.append({
            "id":           hash(fname) & 0x7fffffff,
            "filename":     fname,
            "hash_value":   info.get("hash") or "—" * 64,
            "last_checked": info.get("last_checked"),
            "status":       info.get("status", "safe"),
            "alert_sent":   info.get("alert_sent", False),
        })
    return out


@router.post("/add")
def add_file(body: FileAdd, _user=Depends(get_current_user)):
    fname = body.filename.strip()
    if not fname:
        raise HTTPException(400, "filename kosong")
    if not Path(fname).exists():
        raise HTTPException(404, f"File tidak ditemukan: {fname}")

    state = _load()
    hash_val = _sha256(fname)
    state[fname] = {
        "hash":         hash_val,
        "last_checked": datetime.utcnow().isoformat(),
        "status":       "safe" if hash_val else "missing",
        "alert_sent":   False,
    }
    _save(state)
    return {"status": "added", "file": fname, "hash": hash_val}


@router.post("/scan")
def scan_files(request: Request, _user=Depends(get_current_user)):
    t0 = time.time()
    state = _load()
    issues = 0

    for fname, info in state.items():
        new_hash = _sha256(fname)
        if new_hash is None:
            info["status"] = "missing"; issues += 1
        elif info.get("hash") and info["hash"] != new_hash:
            info["status"] = "modified"; issues += 1
        else:
            info["status"] = "safe"
            if not info.get("hash"):
                info["hash"] = new_hash
        info["last_checked"] = datetime.utcnow().isoformat()

    _save(state)
    return {
        "total_scanned":    len(state),
        "issues_found":     issues,
        "duration_seconds": round(time.time() - t0, 2),
    }
