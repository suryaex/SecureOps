"""
Realtime terminal endpoint (agent side).

Spawns a PTY with /bin/bash (or `su -l <user>` if SECUREOPS_SHELL_USER is set)
and pipes it through a WebSocket.  Sessions are optionally recorded in
asciinema v2 format (.cast) for forensic replay.

Environment variables:
   SECUREOPS_AGENT_KEY       Required. Shared secret with the controller.
   SECUREOPS_SHELL_USER      Optional. If set, shell drops to this OS user via `su -l`.
                             Recommended for production (avoids root shells).
   SECUREOPS_SHELL_CMD       Optional. Full custom command (overrides SHELL_USER).
   SECUREOPS_RECORD_SESSIONS '1' to record every session to /var/log/secureops/sessions
   SECUREOPS_RECORD_DIR      Override the recording directory.

Wire protocol:
   ←  bytes  : PTY stdout/stderr (terminal output → browser)
   →  bytes  : Browser keystrokes
   →  text "{\"resize\":[cols,rows]}" : TTY size change
   →  text "{\"meta\":{\"user\":\"...\",\"ip\":\"...\"}}" : controller-provided session metadata
"""
import asyncio
import fcntl
import json
import os
import pty
import shlex
import signal
import struct
import termios
import time
import uuid
import logging
from contextlib import suppress
from pathlib import Path

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

import auth

router = APIRouter()
log = logging.getLogger("secureops.terminal")

CHUNK              = 8192
SHELL_USER         = os.getenv("SECUREOPS_SHELL_USER", "").strip()
SHELL_CMD          = os.getenv("SECUREOPS_SHELL_CMD", "").strip()
RECORD             = os.getenv("SECUREOPS_RECORD_SESSIONS", "0") == "1"
RECORD_DIR         = Path(os.getenv("SECUREOPS_RECORD_DIR", "/var/log/secureops/sessions"))

if RECORD:
    RECORD_DIR.mkdir(parents=True, exist_ok=True)


def _shell_argv() -> list[str]:
    """Decide which command to exec inside the PTY."""
    if SHELL_CMD:
        return shlex.split(SHELL_CMD)
    if SHELL_USER:
        # Drop to a real OS user — preserves their UID, GID, env, $HOME
        return ["/bin/su", "-s", "/bin/bash", "-l", SHELL_USER]
    return ["/bin/bash", "--login"]


def _set_winsize(fd: int, cols: int, rows: int) -> None:
    with suppress(OSError):
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


class CastRecorder:
    """asciinema v2 (.cast) recorder. JSON-lines stream."""
    def __init__(self, path: Path, cols: int, rows: int, title: str = ""):
        self.path  = path
        self.start = time.time()
        self.f     = path.open("w", encoding="utf-8", buffering=1)  # line-buffered
        header = {
            "version":   2,
            "width":     cols,
            "height":    rows,
            "timestamp": int(self.start),
            "title":     title,
            "env":       {"SHELL": "/bin/bash", "TERM": "xterm-256color"},
        }
        self.f.write(json.dumps(header) + "\n")

    def write(self, kind: str, data: bytes | str) -> None:
        try:
            if isinstance(data, bytes):
                try:    text = data.decode("utf-8")
                except: text = data.decode("utf-8", errors="replace")
            else:
                text = data
            t = round(time.time() - self.start, 4)
            self.f.write(json.dumps([t, kind, text]) + "\n")
        except Exception:
            pass

    def close(self) -> None:
        with suppress(Exception):
            self.f.close()


@router.websocket("/ws")
async def terminal_ws(ws: WebSocket, key: str = Query(default="")):
    if not auth.AGENT_KEY or key != auth.AGENT_KEY:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="bad agent key")
        return

    await ws.accept()

    # --- Optional metadata frame sent by controller (user@ip) ---
    meta = {"user": "controller", "ip": "unknown"}
    try:
        first = await asyncio.wait_for(ws.receive(), timeout=2.0)
        if "text" in first and first["text"] and first["text"].startswith("{"):
            try:
                obj = json.loads(first["text"])
                if "meta" in obj:
                    meta.update(obj["meta"])
                elif "resize" in obj:
                    # No metadata, but resize sent first — push it back for the loop
                    pass
            except Exception:
                pass
    except (asyncio.TimeoutError, WebSocketDisconnect, RuntimeError):
        pass

    # --- Spawn PTY ---
    try:
        pid, master_fd = pty.fork()
    except OSError as e:
        await ws.send_text(f"\r\n\x1b[31m[error] cannot fork pty: {e}\x1b[0m\r\n")
        await ws.close()
        return

    if pid == 0:
        # child
        env = os.environ.copy()
        env["TERM"] = "xterm-256color"
        env["LANG"] = env.get("LANG", "en_US.UTF-8")
        argv = _shell_argv()
        try:
            os.execvpe(argv[0], argv, env)
        except OSError as e:
            os.write(1, f"failed to exec {argv[0]}: {e}\n".encode())
            os._exit(127)

    # parent
    _set_winsize(master_fd, 100, 30)
    loop = asyncio.get_event_loop()

    # --- Recorder ---
    rec = None
    if RECORD:
        fname = f"{int(time.time())}-{meta.get('user','x')}-{uuid.uuid4().hex[:6]}.cast"
        try:
            rec = CastRecorder(
                RECORD_DIR / fname, 100, 30,
                title=f"{meta.get('user')} @ {os.uname().nodename} from {meta.get('ip')}",
            )
        except Exception as e:
            log.warning("recorder init failed: %s", e)
            rec = None

    async def pty_to_ws():
        while True:
            try:
                data = await loop.run_in_executor(None, os.read, master_fd, CHUNK)
            except OSError:
                break
            if not data:
                break
            if rec: rec.write("o", data)
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
            t = msg.get("type")
            if t == "websocket.disconnect":
                break

            if "bytes" in msg and msg["bytes"] is not None:
                if rec: rec.write("i", msg["bytes"])
                with suppress(OSError):
                    os.write(master_fd, msg["bytes"])
                continue

            if "text" in msg and msg["text"] is not None:
                text = msg["text"]
                # control frames are pure JSON objects
                if text.startswith("{"):
                    try:
                        obj = json.loads(text)
                        if "resize" in obj:
                            cols, rows = obj["resize"]
                            _set_winsize(master_fd, int(cols), int(rows))
                            continue
                    except Exception:
                        pass
                if rec: rec.write("i", text)
                with suppress(OSError):
                    os.write(master_fd, text.encode("utf-8"))

    try:
        await asyncio.gather(pty_to_ws(), ws_to_pty())
    finally:
        with suppress(ProcessLookupError):
            os.kill(pid, signal.SIGHUP)
            os.waitpid(pid, os.WNOHANG)
        with suppress(OSError):
            os.close(master_fd)
        if rec: rec.close()
        with suppress(Exception):
            await ws.close()


# ---------- Recorded session listing & download (admin via controller) ----------

@router.get("/recordings")
def list_recordings():
    """List all .cast recordings on this agent."""
    if not RECORD_DIR.exists():
        return {"recordings": []}
    out = []
    for f in sorted(RECORD_DIR.glob("*.cast"), reverse=True):
        try:
            stat = f.stat()
            out.append({
                "name":  f.name,
                "size":  stat.st_size,
                "mtime": int(stat.st_mtime),
            })
        except OSError:
            continue
    return {"recordings": out[:200]}


@router.get("/recordings/{name}")
def download_recording(name: str):
    """Stream a single .cast file back to the controller."""
    from fastapi.responses import FileResponse
    from fastapi import HTTPException

    # Path-traversal guard
    safe = RECORD_DIR / name
    if not str(safe.resolve()).startswith(str(RECORD_DIR.resolve())):
        raise HTTPException(400, "invalid name")
    if not safe.exists():
        raise HTTPException(404, "not found")
    return FileResponse(str(safe), media_type="application/json", filename=name)
