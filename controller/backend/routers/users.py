"""
DB-backed user management (admin-only).

PAM-authenticated Linux users are auto-provisioned at login time;
those rows are protected from edits/deletes here so the OS remains the
source of truth.

DB-only users created through this endpoint use bcrypt password hashing
and can sign in on non-Linux machines or when no matching Linux account
exists.
"""
import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth import hash_password, require_admin, linux_user_exists, _is_linux

router = APIRouter()

# ---------- Schemas ----------

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: Optional[str] = Field(None, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)
    role: str = Field("auditor", pattern="^(admin|auditor)$")


class UserPasswordUpdate(BaseModel):
    password: str = Field(..., min_length=6, max_length=128)


class UserRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(admin|auditor)$")


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str]
    role: str
    created_at: Optional[datetime]
    last_login: Optional[datetime]
    is_linux_pam: bool = False

    class Config:
        from_attributes = True


def _to_out(u: models.Admin) -> UserOut:
    return UserOut(
        id=u.id,
        username=u.username,
        email=u.email,
        role=u.role,
        created_at=u.created_at,
        last_login=u.last_login,
        is_linux_pam=(u.password_hash == "!pam!"),
    )


USERNAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_.\-]{2,49}$")


# ---------- Endpoints ----------

@router.get("", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    rows = db.query(models.Admin).order_by(models.Admin.created_at.desc().nullslast()).all()
    return [_to_out(u) for u in rows]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, request: Request,
                db: Session = Depends(get_db),
                current=Depends(require_admin)):
    username = body.username.strip()

    if not USERNAME_RE.match(username):
        raise HTTPException(400, "Username must start with a letter and contain only letters, digits, '.', '_', '-'.")

    if db.query(models.Admin).filter(models.Admin.username == username).first():
        raise HTTPException(409, "Username already exists")

    # On Linux, refuse to shadow an existing Linux user — that account will
    # auto-provision via PAM the moment it logs in.
    if _is_linux() and linux_user_exists(username):
        raise HTTPException(
            409,
            f"A Linux account named '{username}' already exists. "
            f"That user can log in directly with their OS password — no need to create a DB account.",
        )

    email = (body.email or f"{username}@secureops.local").strip()
    if db.query(models.Admin).filter(models.Admin.email == email).first():
        raise HTTPException(409, "Email already in use")

    user = models.Admin(
        username=username,
        email=email,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(models.AdminActivityLog(
        admin_id=current.id,
        admin_username=current.username,
        action="Create User",
        details=f"Created DB user '{username}' (role={body.role})",
        ip_address=request.client.host or "unknown",
        status="success",
    ))
    db.commit()

    return _to_out(user)


@router.patch("/{user_id}/password", response_model=UserOut)
def change_password(user_id: int, body: UserPasswordUpdate, request: Request,
                    db: Session = Depends(get_db),
                    current=Depends(require_admin)):
    user = db.query(models.Admin).filter(models.Admin.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    if user.password_hash == "!pam!":
        raise HTTPException(
            400,
            "This user authenticates through Linux PAM. "
            "Change the password on the server with: sudo passwd " + user.username,
        )

    user.password_hash = hash_password(body.password)
    db.commit()
    db.refresh(user)

    db.add(models.AdminActivityLog(
        admin_id=current.id,
        admin_username=current.username,
        action="Reset Password",
        details=f"Reset password for '{user.username}'",
        ip_address=request.client.host or "unknown",
        status="success",
    ))
    db.commit()

    return _to_out(user)


@router.patch("/{user_id}/role", response_model=UserOut)
def change_role(user_id: int, body: UserRoleUpdate, request: Request,
                db: Session = Depends(get_db),
                current=Depends(require_admin)):
    user = db.query(models.Admin).filter(models.Admin.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    if user.id == current.id and body.role != "admin":
        raise HTTPException(400, "You cannot demote yourself")

    user.role = body.role
    db.commit()
    db.refresh(user)

    db.add(models.AdminActivityLog(
        admin_id=current.id,
        admin_username=current.username,
        action="Change Role",
        details=f"Set '{user.username}' role to {body.role}",
        ip_address=request.client.host or "unknown",
        status="success",
    ))
    db.commit()

    return _to_out(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, request: Request,
                db: Session = Depends(get_db),
                current=Depends(require_admin)):
    user = db.query(models.Admin).filter(models.Admin.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    if user.id == current.id:
        raise HTTPException(400, "You cannot delete yourself")

    if user.password_hash == "!pam!":
        raise HTTPException(
            400,
            "Cannot delete a Linux-PAM-mirrored user from here. "
            "Remove the OS account on the server instead.",
        )

    username = user.username
    db.delete(user)
    db.commit()

    db.add(models.AdminActivityLog(
        admin_id=current.id,
        admin_username=current.username,
        action="Delete User",
        details=f"Deleted DB user '{username}'",
        ip_address=request.client.host or "unknown",
        status="success",
    ))
    db.commit()
    return
