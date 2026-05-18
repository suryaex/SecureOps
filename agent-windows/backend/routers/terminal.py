"""
Realtime terminal endpoint — Windows version.

Uses pywinpty (ConPTY backend on Windows 10/11) to spawn PowerShell or cmd
and pipe through WebSocket. Falls back to subprocess if pywinpty unavailable.

Wire protocol identical to Linux agent.
"""
import asyncio
import json
import os
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

import auth

router = APIRouter()

CHUNK = 8192
SHELL_CMD = os.getenv("SECUREOPS_SHELL_CMD", "powershell.exe -NoLogo").strip()
RECORD    = os.getenv("SECUREOPS_RECORD_SESSIONS", "0") == "1"
RECORD_DIR = Path(os.getenv(
    "SECUREOPS_RECORD_DIR",
    os.path.join(os.getenv("PROGRAMDATA", "C:\\ProgramData"), "SecureOps-Agent", "sessions")
))
if RECORD:
    RECORD_DIR.mkdir(parents=True, exist_ok=True)


try:
    from winpty import PtyProcess
    HAS_WINPTY = True
except ImportError:
    PtyProcess = None
    HAS_WINPTY = False


@router.websocket("/ws")
async def terminal_ws(ws: WebSocket, key: str = Query(default="")):
    if not auth.AGENT_KEY or key != auth.AGENT_KEY:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="bad agent key")
        return

    await ws.accept()

    if not HAS_WINPTY:
        await ws.send_text(
            "\r\n\x1b[33m[warning] pywinpty not installed — install with:\x1b[0m\r\n"
            "    pip install pywinpty\r\n\r\n"
            "\x1b[31mTerminal feature requires pywinpty on Windows.\x1b[0m\r\n"
        )
        await ws.close()
        return

    # ---- Spawn PowerShell via ConPTY ----
    try:
        proc = PtyProcess.spawn(
            SHELL_CMD,
            dimensions=(30, 100),
            env=os.environ.copy(),
        )
    except Exception as e:
        await ws.send_text(f"\r\n\x1b[31m[error] cannot spawn shell: {e}\x1b[0m\r\n")
        await ws.close()
        return

    # ---- Optional recorder ----
    rec_file = None
    if RECORD:
        try:
            fname = f"{int(datetime.utcnow().timestamp())}-windows.cast"
            rec_file = open(RECORD_DIR / fname, "w", encoding="utf-8", buffering=1)
            header = {
                "version": 2, "width": 100, "height": 30,
                "timestamp": int(datetime.utcnow().timestamp()),
                "title": f"controller @ {os.environ.get('COMPUTERNAME', 'windows')}",
                "env": {"SHELL": SHELL_CMD, "TERM": "xterm-256color"},
            }
            rec_file.write(json.dumps(header) + "\n")
            t0 = datetime.utcnow().timestamp()
        except Exception:
            rec_file = None

    def record(kind: str, data):
        if not rec_file: return
        try:
            text = data.decode("utf-8", errors="replace") if isinstance(data, bytes) else data
            t = round(datetime.utcnow().timestamp() - t0, 4)
            rec_file.write(json.dumps([t, kind, text]) + "\n")
        except Exception:
            pass

    loop = asyncio.get_event_loop()

    async def pty_to_ws():
        while True:
            try:
                data = await loop.run_in_executor(None, proc.read, CHUNK)
            except Exception:
                break
            if not data:
                break
            if isinstance(data, str):
                data = data.encode("utf-8", errors="replace")
            record("o", data)
            try:
                await ws.send_bytes(data)
            except Exception:
                break

    async def ws_to_pty():
        while True:
            try:
                msg = await ws.receive()
            except (WebSocketDisconnect, RuntimeError):
                break

            if msg.get("type") == "websocket.disconnect":
                break

            if "bytes" in msg and msg["bytes"] is not None:
                record("i", msg["bytes"])
                try:
                    proc.write(msg["bytes"].decode("utf-8", errors="replace"))
                except Exception:
                    pass
                continue

            if "text" in msg and msg["text"] is not None:
                text = msg["text"]
                if text.startswith("{"):
                    try:
                        obj = json.loads(text)
                        if "resize" in obj:
                            cols, rows = obj["resize"]
                            try:
                                proc.setwinsize(int(rows), int(cols))
                            except Exception:
                                pass
                            continue
                    except Exception:
                        pass
                record("i", text)
                try:
                    proc.write(text)
                except Exception:
                    pass

    try:
        await asyncio.gather(pty_to_ws(), ws_to_pty())
    finally:
        try: proc.terminate(force=True)
        except Exception: pass
        if rec_file:
            try: rec_file.close()
            except Exception: pass
        try: await ws.close()
        except Exception: pass


@router.get("/recordings")
def list_recordings():
    if not RECORD_DIR.exists():
        return {"recordings": []}
    out = []
    for f in sorted(RECORD_DIR.glob("*.cast"), reverse=True):
        try:
            stat = f.stat()
            out.append({"name": f.name, "size": stat.st_size, "mtime": int(stat.st_mtime)})
        except OSError:
            continue
    return {"recordings": out[:200]}


@router.get("/recordings/{name}")
def download_recording(name: str):
    from fastapi.responses import FileResponse
    from fastapi import HTTPException
    safe = RECORD_DIR / name
    if not str(safe.resolve()).startswith(str(RECORD_DIR.resolve())):
        raise HTTPException(400, "invalid name")
    if not safe.exists():
        raise HTTPException(404, "not found")
    return FileResponse(str(safe), media_type="application/json", filename=name)
