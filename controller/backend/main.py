"""
SecureOps API — FastAPI application factory.

Production launch:
    gunicorn -k uvicorn.workers.UvicornWorker -w 2 -b 0.0.0.0:8000 main:app

Dev launch:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Environment variables:
    SECUREOPS_CORS_ORIGINS  Comma-separated list of allowed origins.
                            Default: "*" (open — fine behind nginx).
                            Example: "https://secureops.polsri.ac.id,capacitor://localhost,http://localhost"
    SECUREOPS_BEHIND_PROXY  "1" to trust X-Forwarded-* headers (when nginx fronts us).
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, SessionLocal
import models
from auth import hash_password, AGENT_MODE
from routers import (
    auth,
    permission_audit,
    sudo_monitor,
    file_integrity,
    activity_logs,
    dashboard,
    system,
    search,
    users,
    servers,
    terminal,
)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SecureOps API" + (" — AGENT" if AGENT_MODE else ""),
    version="1.2.0",
    description="State Polytechnic of Sriwijaya — Security Audit Dashboard API",
)

# -------- CORS --------
_origins_env = os.getenv("SECUREOPS_CORS_ORIGINS", "*")
if _origins_env.strip() == "*":
    cors_origins = ["*"]
    cors_credentials = False  # cannot mix * with credentials
else:
    cors_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]
    # Capacitor mobile shells use special URL schemes — auto-allow them.
    for extra in ("capacitor://localhost", "http://localhost", "ionic://localhost"):
        if extra not in cors_origins:
            cors_origins.append(extra)
    cors_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------- Trust nginx X-Forwarded-* when behind reverse proxy --------
if os.getenv("SECUREOPS_BEHIND_PROXY") == "1":
    from starlette.middleware.trustedhost import TrustedHostMiddleware
    try:
        from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
        app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
    except ImportError:
        pass

# -------- Routers --------
if not AGENT_MODE:
    # Auth & user management only on the controller
    app.include_router(auth.router,   prefix="/api/auth",  tags=["Auth"])
    app.include_router(users.router,  prefix="/api/users", tags=["Users"])
    app.include_router(servers.router, prefix="/api/servers", tags=["Servers"])
    app.include_router(terminal.router, prefix="/api/terminal", tags=["Terminal"])

app.include_router(permission_audit.router, prefix="/api/permission-audit", tags=["Permission Audit"])
app.include_router(sudo_monitor.router,     prefix="/api/sudo-monitor",     tags=["Sudo Monitor"])
app.include_router(file_integrity.router,   prefix="/api/file-integrity",   tags=["File Integrity"])
app.include_router(activity_logs.router,    prefix="/api/activity-logs",    tags=["Activity Logs"])
app.include_router(dashboard.router,        prefix="/api/dashboard",        tags=["Dashboard"])
app.include_router(system.router,           prefix="/api/system",           tags=["System"])
app.include_router(search.router,           prefix="/api/search",           tags=["Search"])


@app.on_event("startup")
def seed_default_admin():
    """Bootstrap DB-fallback admin + 'this server' entry (controller only)."""
    if AGENT_MODE:
        return
    db = SessionLocal()
    try:
        if not db.query(models.Admin).filter(models.Admin.username == "admin").first():
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

        # Always have a "local" server entry so the UI selector includes "this server"
        if not db.query(models.MonitoredServer).filter(models.MonitoredServer.is_local == True).first():
            import socket
            db.add(models.MonitoredServer(
                name="controller",
                hostname=socket.gethostname(),
                api_url="http://127.0.0.1:8000",
                api_key="local",
                tags="controller,local",
                is_local=True,
                enabled=True,
                last_status="online",
            ))
            db.commit()
    finally:
        db.close()


@app.get("/api/health")
def health():
    import socket
    return {
        "status":   "ok",
        "service":  "SecureOps API",
        "version":  "1.2.0",
        "mode":     "agent" if AGENT_MODE else "controller",
        "hostname": socket.gethostname(),
    }
