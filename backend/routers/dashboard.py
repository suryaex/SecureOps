from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from auth import get_current_user

router = APIRouter()


@router.get("/stats", response_model=schemas.DashboardStats)
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    total_risky = db.query(models.PermissionAuditLog).count()
    critical = db.query(models.PermissionAuditLog).filter(models.PermissionAuditLog.severity == "Critical").count()
    high = db.query(models.PermissionAuditLog).filter(models.PermissionAuditLog.severity == "High").count()
    medium = db.query(models.PermissionAuditLog).filter(models.PermissionAuditLog.severity == "Medium").count()
    low = db.query(models.PermissionAuditLog).filter(models.PermissionAuditLog.severity == "Low").count()

    sudo_count = db.query(models.SudoLog).filter(models.SudoLog.status.in_(["active", "idle"])).count()

    modified = db.query(models.FileIntegrity).filter(models.FileIntegrity.status == "modified").count()
    missing = db.query(models.FileIntegrity).filter(models.FileIntegrity.status == "missing").count()
    integrity_status = "Secure" if (modified + missing) == 0 else "Alert"

    new_alerts = (
        db.query(models.AdminActivityLog)
        .filter(models.AdminActivityLog.status == "failed")
        .count()
    )

    recent = (
        db.query(models.AdminActivityLog)
        .order_by(models.AdminActivityLog.timestamp.desc())
        .limit(6)
        .all()
    )

    total = critical + high + medium + low or 1
    severity_breakdown = {
        "Critical": round(critical / total * 100),
        "High": round(high / total * 100),
        "Medium": round(medium / total * 100),
        "Low": round(low / total * 100),
    }

    return schemas.DashboardStats(
        total_risky_files=total_risky,
        critical_files=critical,
        sudo_users_count=sudo_count,
        integrity_status=integrity_status,
        modified_files=modified,
        missing_files=missing,
        new_alerts=new_alerts,
        recent_activities=recent,
        severity_breakdown=severity_breakdown,
    )
