from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from datetime import datetime
from database import get_db
import models, schemas
from auth import verify_password, create_token, get_current_user

router = APIRouter()


@router.post("/login", response_model=schemas.TokenResponse)
def login(request: Request, body: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.Admin).filter(models.Admin.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        log = models.AdminActivityLog(
            admin_username=body.username,
            action="Login Failed",
            details=f"Invalid credentials for user: {body.username}",
            ip_address=request.client.host or "unknown",
            status="failed",
        )
        db.add(log)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    user.last_login = datetime.utcnow()
    log = models.AdminActivityLog(
        admin_id=user.id,
        admin_username=user.username,
        action="Login",
        details="Successful login",
        ip_address=request.client.host or "unknown",
        status="success",
    )
    db.add(log)
    db.commit()
    db.refresh(user)

    token = create_token({"sub": user.username, "role": user.role})
    return schemas.TokenResponse(access_token=token, role=user.role, username=user.username)


@router.get("/me", response_model=schemas.AdminOut)
def me(current_user: models.Admin = Depends(get_current_user)):
    return current_user
