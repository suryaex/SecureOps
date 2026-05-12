import platform
import time
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import models, schemas
from auth import get_current_user

router = APIRouter()

DEMO_SUDO_USERS = [
    ("admin", "wheel,sudo,adm", "Active", 0, "sudo su -"),
    ("operator", "sudo,devops", "Active", 0, "sudo apt update"),
    ("jsmith", "sudo", "Idle", 2, "sudo /bin/bash"),
    ("ext_vendor", "vendors", "Locked", 5, "sudo cat /etc/shadow"),
    ("sysbackup", "wheel,backup", "Active", 0, "sudo rsync -avz /"),
]


def _parse_sudoers_linux(db: Session, scanned_by: str):
    start = time.time()
    users_added = 0
    try:
        with open("/etc/sudoers", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "ALL=" in line:
                    username = line.split()[0]
                    existing = db.query(models.SudoLog).filter(models.SudoLog.username == username).first()
                    if not existing:
                        entry = models.SudoLog(
                            username=username,
                            groups="sudo",
                            status="active",
                            failed_attempts=0,
                            action=f"Found in /etc/sudoers",
                            admin_id=None,
                        )
                        db.add(entry)
                        users_added += 1
    except PermissionError:
        pass
    db.commit()
    return users_added, time.time() - start


def _seed_demo_sudo(db: Session):
    start = time.time()
    for username, groups, status, fails, action in DEMO_SUDO_USERS:
        existing = db.query(models.SudoLog).filter(models.SudoLog.username == username).first()
        if not existing:
            entry = models.SudoLog(
                username=username,
                groups=groups,
                last_access=datetime.utcnow() - timedelta(minutes=30),
                status=status.lower(),
                failed_attempts=fails,
                action=action,
            )
            db.add(entry)
    db.commit()
    return len(DEMO_SUDO_USERS), time.time() - start


@router.get("/users", response_model=List[schemas.SudoLogOut])
def get_sudo_users(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    return db.query(models.SudoLog).order_by(models.SudoLog.timestamp.desc()).all()


@router.post("/scan", response_model=schemas.ScanResult)
def scan_sudoers(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    log = models.AdminActivityLog(
        admin_id=current_user.id,
        admin_username=current_user.username,
        action="Sudo Scan",
        details="Scanned /etc/sudoers for privileged users",
        ip_address=request.client.host or "unknown",
        status="success",
    )
    db.add(log)
    db.commit()

    if platform.system() == "Linux":
        found, duration = _parse_sudoers_linux(db, current_user.username)
    else:
        found, duration = _seed_demo_sudo(db)

    return schemas.ScanResult(total_scanned=1, issues_found=found, duration_seconds=round(duration, 2))
