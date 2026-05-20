"""
SecureOps AGENT (macOS) — runs on a server you want to monitor.

Receives requests from the central Controller (authenticated by X-Agent-Key)
and reports back: system health, network, file permissions, sudo users,
file integrity.

Run with:
    SECUREOPS_AGENT_KEY=<secret> \
    gunicorn -c gunicorn.conf.py main:app
"""
import os
import platform
import socket
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine
import models
from routers import system, permission_audit, sudo_monitor, file_integrity, terminal

# Startup sanity checks
if platform.system() != "Darwin":
    print(f"[WARN] agent-macos berjalan di {platform.system()} (bukan macOS). "
          "Fitur seperti unified log query akan dinonaktifkan.")

if not os.getenv("SECUREOPS_AGENT_KEY"):
    print("[WARN] SECUREOPS_AGENT_KEY tidak di-set — semua endpoint akan return 401")

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SecureOps Agent (macOS)",
    version="1.3.0",
    description="Runs on a monitored server. Authenticated by X-Agent-Key.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # private network only; controller will use X-Agent-Key
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router,           prefix="/api/system",           tags=["System"])
app.include_router(permission_audit.router, prefix="/api/permission-audit", tags=["Permission Audit"])
app.include_router(sudo_monitor.router,     prefix="/api/sudo-monitor",     tags=["Sudo Monitor"])
app.include_router(file_integrity.router,   prefix="/api/file-integrity",   tags=["File Integrity"])
app.include_router(terminal.router,         prefix="/api/terminal",         tags=["Terminal"])


@app.get("/api/health")
def health():
    return {
        "status":   "ok",
        "service":  "SecureOps Agent (macOS)",
        "version":  "1.5.0",
        "mode":     "agent",
        "platform": "macos",
        "hostname": socket.gethostname(),
        "os":       platform.platform(),
        "python":   sys.version.split()[0],
        "features": {
            "terminal":  True,  # macOS punya /dev/pty seperti Linux
            "recording": os.getenv("SECUREOPS_RECORD_SESSIONS", "0") == "1",
        },
    }
