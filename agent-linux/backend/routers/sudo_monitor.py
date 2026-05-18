"""
Sudo Privilege Monitor.

On Linux, enumerates real users that have sudo/wheel/admin group membership
using `pwd` and `grp` modules. On non-Linux hosts falls back to demo data.
"""
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
    ("admin",      "wheel,sudo,adm",   "active", 0, "sudo su -"),
    ("operator",   "sudo,devops",      "active", 0, "sudo apt update"),
    ("jsmith",     "sudo",             "idle",   2, "sudo /bin/bash"),
    ("ext_vendor", "vendors",          "locked", 5, "sudo cat /etc/shadow"),
    ("sysbackup",  "wheel,backup",     "active", 0, "sudo rsync -avz /"),
]

SUDO_GROUPS = {"sudo", "wheel", "admin", "adm", "root"}


def _enumerate_linux_sudo_users(db: Session, scanned_by: str):
    """Real enumeration of OS users belonging to sudo/wheel/admin groups."""
    import pwd, grp, os

    start = time.time()
    sudo_members: set[str] = set()

    # Members listed in the sudo/wheel groups themselves
    for g in grp.getgrall():
        if g.gr_name in SUDO_GROUPS:
            sudo_members.update(g.gr_mem)

    # Plus any user whose primary group is one of these
    for u in pwd.getpwall():
        try:
            gname = grp.getgrgid(u.pw_gid).gr_name
            if gname in SUDO_GROUPS and u.pw_uid >= 1000 or u.pw_name == "root":
                sudo_members.add(u.pw_name)
        except KeyError:
            pass

    # Failed sudo attempts (last 7 days) from /var/log/auth.log
    failed_map: dict[str, int] = {}
    for log_path in ("/var/log/auth.log", "/var/log/secure"):
        if os.path.exists(log_path):
            try:
                with open(log_path, "r", errors="ignore") as f:
                    for line in f:
                        if "authentication failure" in line and "sudo" in line:
                            for tok in line.split():
                                if tok.startswith("user="):
                                    u = tok.split("=", 1)[1].strip()
                                    failed_map[u] = failed_map.get(u, 0) + 1
            except (PermissionError, OSError):
                pass
            break

    for username in sudo_members:
        try:
            user_info = pwd.getpwnam(username)
            groups = sorted({grp.getgrgid(user_info.pw_gid).gr_name} |
                            {g.gr_name for g in grp.getgrall() if username in g.gr_mem})

            # Last login from /var/log/wtmp via `last` is hard to parse cleanly;
            # fall back to home dir mtime as a cheap proxy.
            last_access = None
            try:
                last_access = datetime.fromtimestamp(os.stat(user_info.pw_dir).st_atime)
            except (FileNotFoundError, PermissionError):
                pass

            failed_attempts = failed_map.get(username, 0)
            status_str = "locked" if failed_attempts >= 5 else "active"

            existing = db.query(models.SudoLog).filter(models.SudoLog.username == username).first()
            if existing:
                existing.groups = ",".join(groups)
                existing.last_access = last_access
                existing.failed_attempts = failed_attempts
                existing.status = status_str
                existing.action = f"shell={user_info.pw_shell}"
                existing.timestamp = datetime.utcnow()
            else:
                db.add(models.SudoLog(
                    username=username,
                    groups=",".join(groups),
                    last_access=last_access,
                    failed_attempts=failed_attempts,
                    status=status_str,
                    action=f"shell={user_info.pw_shell}",
                ))
        except KeyError:
            continue

    db.commit()
    return len(sudo_members), time.time() - start


def _seed_demo_sudo(db: Session):
    start = time.time()
    for username, groups, status_str, fails, action in DEMO_SUDO_USERS:
        existing = db.query(models.SudoLog).filter(models.SudoLog.username == username).first()
        if not existing:
            db.add(models.SudoLog(
                username=username,
                groups=groups,
                last_access=datetime.utcnow() - timedelta(minutes=30),
                status=status_str,
                failed_attempts=fails,
                action=action,
            ))
    db.commit()
    return len(DEMO_SUDO_USERS), time.time() - start


@router.get("/users", response_model=List[schemas.SudoLogOut])
def get_sudo_users(db: Session = Depends(get_db),
                   _user: models.Admin = Depends(get_current_user)):
    return db.query(models.SudoLog).order_by(models.SudoLog.timestamp.desc()).all()


@router.post("/scan", response_model=schemas.ScanResult)
def scan_sudoers(request: Request, db: Session = Depends(get_db),
                 current_user: models.Admin = Depends(get_current_user)):
    db.add(models.AdminActivityLog(
        admin_id=current_user.id,
        admin_username=current_user.username,
        action="Sudo Scan",
        details="Enumerated sudo/wheel group members",
        ip_address=request.client.host or "unknown",
        status="success",
    ))
    db.commit()

    if platform.system() == "Linux":
        found, duration = _enumerate_linux_sudo_users(db, current_user.username)
    else:
        found, duration = _seed_demo_sudo(db)

    return schemas.ScanResult(total_scanned=1, issues_found=found,
                              duration_seconds=round(duration, 2))
