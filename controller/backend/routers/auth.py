from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
import models, schemas
from auth import (
    verify_password,
    create_token,
    get_current_user,
    pam_authenticate,
    linux_user_exists,
    linux_user_role,
    upsert_linux_admin,
    _is_linux,
)

router = APIRouter()


def _log(db: Session, *, username: str, action: str, details: str,
         ip: str, status_str: str, admin_id: int | None = None) -> None:
    db.add(models.AdminActivityLog(
        admin_id=admin_id,
        admin_username=username,
        action=action,
        details=details,
        ip_address=ip,
        status=status_str,
    ))
    db.commit()


@router.post("/login", response_model=schemas.TokenResponse)
def login(request: Request, body: schemas.LoginRequest, db: Session = Depends(get_db)):
    """
    Login priority:
      1. If running on Linux AND the username exists as a Linux user
         -> authenticate via PAM (real OS credentials).
      2. Otherwise fall back to the DB Admin table (bcrypt hash).
    """
    ip = request.client.host or "unknown"
    username = body.username.strip()

    # --------- 1) PAM path ---------
    if _is_linux() and linux_user_exists(username):
        if pam_authenticate(username, body.password):
            user = upsert_linux_admin(db, username)
            _log(db, username=username, action="Login",
                 details=f"PAM login successful (role={user.role})",
                 ip=ip, status_str="success", admin_id=user.id)
            token = create_token({"sub": user.username, "role": user.role})
            return schemas.TokenResponse(
                access_token=token, role=user.role, username=user.username
            )
        else:
            _log(db, username=username, action="Login Failed",
                 details="PAM rejected credentials", ip=ip, status_str="failed")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Linux username or password",
            )

    # --------- 2) DB fallback ---------
    user = db.query(models.Admin).filter(models.Admin.username == username).first()
    if not user or not verify_password(body.password, user.password_hash):
        _log(db, username=username, action="Login Failed",
             details=f"Invalid credentials for user: {username}",
             ip=ip, status_str="failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    user.last_login = datetime.utcnow()
    db.commit()
    _log(db, username=user.username, action="Login",
         details="DB login successful", ip=ip, status_str="success",
         admin_id=user.id)
    db.refresh(user)

    token = create_token({"sub": user.username, "role": user.role})
    return schemas.TokenResponse(
        access_token=token, role=user.role, username=user.username
    )


@router.get("/me", response_model=schemas.AdminOut)
def me(current_user: models.Admin = Depends(get_current_user)):
    return current_user


@router.post("/logout")
def logout(request: Request, current_user: models.Admin = Depends(get_current_user),
           db: Session = Depends(get_db)):
    _log(db, username=current_user.username, action="Logout",
         details="User logged out",
         ip=request.client.host or "unknown",
         status_str="success", admin_id=current_user.id)
    return {"detail": "Logged out"}
