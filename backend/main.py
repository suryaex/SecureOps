from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, SessionLocal
import models
from auth import hash_password
from routers import (
    auth,
    permission_audit,
    sudo_monitor,
    file_integrity,
    activity_logs,
    dashboard,
    system,
    search,
)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="SecureOps API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,             prefix="/api/auth",             tags=["Auth"])
app.include_router(permission_audit.router, prefix="/api/permission-audit", tags=["Permission Audit"])
app.include_router(sudo_monitor.router,     prefix="/api/sudo-monitor",     tags=["Sudo Monitor"])
app.include_router(file_integrity.router,   prefix="/api/file-integrity",   tags=["File Integrity"])
app.include_router(activity_logs.router,    prefix="/api/activity-logs",    tags=["Activity Logs"])
app.include_router(dashboard.router,        prefix="/api/dashboard",        tags=["Dashboard"])
app.include_router(system.router,           prefix="/api/system",           tags=["System"])
app.include_router(search.router,           prefix="/api/search",           tags=["Search"])


@app.on_event("startup")
def seed_default_admin():
    """
    Bootstrap fallback admins so the app still works on Windows / dev
    machines where PAM is unavailable.
    On Linux, real OS users will take over via PAM at login time.
    """
    db = SessionLocal()
    try:
        existing = db.query(models.Admin).filter(models.Admin.username == "admin").first()
        if not existing:
            db.add(models.Admin(
                username="admin",
                email="admin@secureops.local",
                password_hash=hash_password("Admin@123"),
                role="admin",
            ))
            db.add(models.Admin(
                username="auditor",
                email="auditor@secureops.local",
                password_hash=hash_password("Auditor@123"),
                role="auditor",
            ))
            db.commit()
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "SecureOps API", "version": "1.1.0"}
