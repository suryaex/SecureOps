from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str


class AdminOut(BaseModel):
    id: int
    username: str
    email: str
    role: str
    created_at: Optional[datetime]
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class PermissionAuditLogOut(BaseModel):
    id: int
    file_path: str
    issue_type: str
    permission_value: str
    severity: str
    detected_at: Optional[datetime]
    scanned_by: Optional[str]

    class Config:
        from_attributes = True


class ScanResult(BaseModel):
    total_scanned: int
    issues_found: int
    duration_seconds: float


class SudoLogOut(BaseModel):
    id: int
    username: str
    groups: Optional[str]
    last_access: Optional[datetime]
    status: str
    failed_attempts: int
    action: Optional[str]
    timestamp: Optional[datetime]

    class Config:
        from_attributes = True


class FileIntegrityOut(BaseModel):
    id: int
    filename: str
    hash_value: str
    last_checked: Optional[datetime]
    status: str
    alert_sent: bool

    class Config:
        from_attributes = True


class FileIntegrityAdd(BaseModel):
    filename: str


class AdminActivityLogOut(BaseModel):
    id: int
    admin_id: Optional[int]
    admin_username: str
    action: str
    details: Optional[str]
    ip_address: str
    timestamp: Optional[datetime]
    status: str

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_risky_files: int
    critical_files: int
    sudo_users_count: int
    integrity_status: str
    modified_files: int
    missing_files: int
    new_alerts: int
    recent_activities: List[AdminActivityLogOut]
    severity_breakdown: dict
