import hashlib
import os
import time
import platform
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import models, schemas
from auth import get_current_user

router = APIRouter()

DEMO_FILES = [
    "/etc/passwd",
    "/etc/shadow",
    "/etc/sudoers",
    "/etc/ssh/sshd_config",
    "/var/log/auth.log",
    "/usr/bin/login",
    "/usr/bin/sudo",
    "/boot/vmlinuz",
    "/etc/crontab",
    "/etc/hosts",
]


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except (PermissionError, FileNotFoundError):
        return hashlib.sha256(path.encode()).hexdigest()


def demo_hash(path: str) -> str:
    return hashlib.sha256(f"demo-{path}-stable".encode()).hexdigest()


@router.get("/files", response_model=List[schemas.FileIntegrityOut])
def list_files(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    return db.query(models.FileIntegrity).order_by(models.FileIntegrity.last_checked.desc()).all()


@router.post("/add", response_model=schemas.FileIntegrityOut)
def add_file(
    body: schemas.FileIntegrityAdd,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    existing = db.query(models.FileIntegrity).filter(models.FileIntegrity.filename == body.filename).first()
    if existing:
        raise HTTPException(status_code=400, detail="File already monitored")

    hash_val = sha256_file(body.filename) if os.path.exists(body.filename) else demo_hash(body.filename)
    entry = models.FileIntegrity(filename=body.filename, hash_value=hash_val, status="safe")
    db.add(entry)

    log = models.AdminActivityLog(
        admin_id=current_user.id,
        admin_username=current_user.username,
        action="Add Monitored File",
        details=f"Added {body.filename} to integrity monitoring",
        ip_address=request.client.host or "unknown",
        status="success",
    )
    db.add(log)
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/scan", response_model=schemas.ScanResult)
def scan_integrity(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    start = time.time()
    files = db.query(models.FileIntegrity).all()

    if not files:
        for path in DEMO_FILES:
            h = sha256_file(path) if os.path.exists(path) else demo_hash(path)
            entry = models.FileIntegrity(filename=path, hash_value=h, status="safe")
            db.add(entry)
        db.commit()
        files = db.query(models.FileIntegrity).all()

    alerts = 0
    for f in files:
        if os.path.exists(f.filename):
            current_hash = sha256_file(f.filename)
            if current_hash != f.hash_value:
                f.status = "modified"
                f.alert_sent = True
                alerts += 1
            else:
                f.status = "safe"
        elif platform.system() != "Linux":
            pass
        else:
            f.status = "missing"
            alerts += 1

        from datetime import datetime
        f.last_checked = datetime.utcnow()

    db.commit()

    log = models.AdminActivityLog(
        admin_id=current_user.id,
        admin_username=current_user.username,
        action="File Integrity Scan",
        details=f"Checked {len(files)} files, {alerts} alerts",
        ip_address=request.client.host or "unknown",
        status="success",
    )
    db.add(log)
    db.commit()

    return schemas.ScanResult(
        total_scanned=len(files),
        issues_found=alerts,
        duration_seconds=round(time.time() - start, 2),
    )
