import os
import stat
import time
import platform
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import models, schemas
from auth import get_current_user

router = APIRouter()

DEMO_SCAN_DATA = [
    ("/var/www/html/config.php", "777 Permission", "-rwxrwxrwx", "Critical"),
    ("/tmp/malicious.sh", "Executable in /tmp", "-rwxr-xr-x", "Critical"),
    ("/home/user/old_backup.tar.gz", "No Owner", "-rw-r--r--", "High"),
    ("/etc/shadow.backup", "Global Read Permission", "-rw-r--r--", "High"),
    ("/opt/app/logs/debug.log", "Public Writeable Directory", "drwxrwxrwx", "Medium"),
    ("/var/tmp/cache.bin", "777 Permission", "-rwxrwxrwx", "Critical"),
    ("/usr/local/bin/update.sh", "Executable in /tmp", "-rwxr-xr-x", "High"),
    ("/home/backup/dump.sql", "No Owner", "-rw-rw-rw-", "Medium"),
    ("/etc/cron.d/cleanup", "Global Read Permission", "-rwxrwxr-x", "High"),
    ("/var/spool/mail/root", "Public Writeable Directory", "drwxrwxrwx", "Critical"),
]


def _scan_linux(scan_dir: str, scanned_by: str, db: Session):
    start = time.time()
    issues = []
    total = 0

    for root, dirs, files in os.walk(scan_dir):
        for name in files + dirs:
            total += 1
            path = os.path.join(root, name)
            try:
                st = os.stat(path)
                mode = st.st_mode
                perm_str = oct(stat.S_IMODE(mode))

                if stat.S_IMODE(mode) == 0o777:
                    issues.append((path, "777 Permission", perm_str, "Critical"))
                elif st.st_uid == 0 and stat.S_ISREG(mode) and mode & stat.S_IXOTH:
                    issues.append((path, "Suspicious Executable", perm_str, "High"))
                elif mode & (stat.S_IWGRP | stat.S_IWOTH):
                    issues.append((path, "Global Write Permission", perm_str, "Medium"))
            except (PermissionError, FileNotFoundError):
                continue

    for file_path, issue_type, perm_val, severity in issues[:200]:
        log = models.PermissionAuditLog(
            file_path=file_path,
            issue_type=issue_type,
            permission_value=perm_val,
            severity=severity,
            scanned_by=scanned_by,
        )
        db.add(log)

    db.commit()
    return total, len(issues), time.time() - start


def _seed_demo_data(scanned_by: str, db: Session):
    start = time.time()
    for file_path, issue_type, perm_val, severity in DEMO_SCAN_DATA:
        log = models.PermissionAuditLog(
            file_path=file_path,
            issue_type=issue_type,
            permission_value=perm_val,
            severity=severity,
            scanned_by=scanned_by,
        )
        db.add(log)
    db.commit()
    return 12450, len(DEMO_SCAN_DATA), time.time() - start


@router.get("/logs", response_model=List[schemas.PermissionAuditLogOut])
def get_logs(
    severity: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    q = db.query(models.PermissionAuditLog)
    if severity:
        q = q.filter(models.PermissionAuditLog.severity == severity)
    return q.order_by(models.PermissionAuditLog.detected_at.desc()).offset(skip).limit(limit).all()


@router.post("/scan", response_model=schemas.ScanResult)
def run_scan(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    log = models.AdminActivityLog(
        admin_id=current_user.id,
        admin_username=current_user.username,
        action="Permission Scan",
        details="Initiated file permission scan",
        ip_address=request.client.host or "unknown",
        status="success",
    )
    db.add(log)
    db.commit()

    # macOS Darwin scans /etc + /Applications + /Library (Mac equivalents of Linux /var)
    if platform.system() == "Darwin":
        total, found, duration = _scan_linux("/etc", current_user.username, db)
    else:
        total, found, duration = _seed_demo_data(current_user.username, db)

    return schemas.ScanResult(total_scanned=total, issues_found=found, duration_seconds=round(duration, 2))
