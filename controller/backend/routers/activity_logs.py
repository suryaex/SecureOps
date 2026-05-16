from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import models, schemas
from auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[schemas.AdminActivityLogOut])
def get_logs(
    search: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    q = db.query(models.AdminActivityLog)
    if search:
        q = q.filter(models.AdminActivityLog.admin_username.ilike(f"%{search}%"))
    if action:
        q = q.filter(models.AdminActivityLog.action.ilike(f"%{action}%"))
    if status:
        q = q.filter(models.AdminActivityLog.status == status)
    return q.order_by(models.AdminActivityLog.timestamp.desc()).offset(skip).limit(limit).all()
