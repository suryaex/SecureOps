"""
SecureOps AGENT — Windows version.

Listens on configurable port (default 8001) and exposes the same API surface
as the Linux agent so the Controller doesn't need to special-case Windows.

Run with:
    SECUREOPS_AGENT_KEY=<secret>
    uvicorn main:app --host 0.0.0.0 --port 8001
or via NSSM as a Windows Service.
"""
import socket
import platform
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import system, permission_audit, user_monitor, file_integrity, terminal

app = FastAPI(
    title="SecureOps Agent (Windows)",
    version="1.5.0",
    description="Windows agent — talks to Controller via X-Agent-Key.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router,           prefix="/api/system",           tags=["System"])
app.include_router(permission_audit.router, prefix="/api/permission-audit", tags=["Permission Audit"])
app.include_router(user_monitor.router,     prefix="/api/sudo-monitor",     tags=["User Monitor"])
app.include_router(file_integrity.router,   prefix="/api/file-integrity",   tags=["File Integrity"])
app.include_router(terminal.router,         prefix="/api/terminal",         tags=["Terminal"])


@app.get("/api/health")
def health():
    return {
        "status":     "ok",
        "service":    "SecureOps Agent",
        "version":    "1.5.0",
        "mode":       "agent",
        "platform":   "windows",
        "hostname":   socket.gethostname(),
        "os":         platform.platform(),
        "python":     sys.version.split()[0],
    }
