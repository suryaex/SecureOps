from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, Enum
from sqlalchemy.sql import func
from database import Base
import enum


class RoleEnum(str, enum.Enum):
    admin = "admin"
    auditor = "auditor"


class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="auditor", nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    last_login = Column(DateTime, nullable=True)


class PermissionAuditLog(Base):
    __tablename__ = "permission_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    file_path = Column(String(500), nullable=False)
    issue_type = Column(String(100), nullable=False)
    permission_value = Column(String(20), nullable=False)
    severity = Column(String(20), nullable=False)
    detected_at = Column(DateTime, server_default=func.now())
    scanned_by = Column(String(50), nullable=True)


class SudoLog(Base):
    __tablename__ = "sudo_logs"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), nullable=False)
    groups = Column(String(200), nullable=True)
    last_access = Column(DateTime, nullable=True)
    status = Column(String(20), default="active")
    failed_attempts = Column(Integer, default=0)
    action = Column(String(200), nullable=True)
    timestamp = Column(DateTime, server_default=func.now())
    admin_id = Column(Integer, nullable=True)


class FileIntegrity(Base):
    __tablename__ = "file_integrity"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(500), nullable=False, unique=True)
    hash_value = Column(String(64), nullable=False)
    last_checked = Column(DateTime, server_default=func.now())
    status = Column(String(20), default="safe")
    alert_sent = Column(Boolean, default=False)


class AdminActivityLog(Base):
    __tablename__ = "admin_activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, nullable=True)
    admin_username = Column(String(50), nullable=False)
    action = Column(String(100), nullable=False)
    details = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=False)
    timestamp = Column(DateTime, server_default=func.now())
    status = Column(String(20), default="success")
