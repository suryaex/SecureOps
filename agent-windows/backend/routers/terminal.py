"""
Realtime terminal endpoint - Windows version (pywinpty + ConPTY).

Spawns PowerShell or cmd in a Windows pseudo-terminal and pipes I/O through
a WebSocket. Mirror wire-protocol Linux agent supaya controller proxy gak
perlu special-case per OS.

Notes:
  - pywinpty 2.x API: `PtyProcess.spawn(argv, cwd, env, dimensions)`
  - `read(size)` returns string (UTF-8 decoded)
  - `write(text)` takes string
  - `setwinsize(rows, cols)` positional
  - Termination: `proc.terminate()` (no `force=True` arg)
"""
import asyncio
import json
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

import auth

router = APIRouter()
log = logging.getLogger("secureops.terminal")

CHUNK = 4096

# Resolve full path ke shell executable supaya pywinpty bisa spawn dengan reliable.
def _resolve_shell() -> list:
    """Return argv list untuk shell yang akan dipakai PTY."""
    custom = os.getenv("SECUREOPS_SHELL_CMD", "").strip()
    if custom:
        # User override - split sebagai shell argv
        import shlex
        return shlex.split(custom, posix=False)

    # Try PowerShell (preferred — modern, syntax-highlighted)
    ps = shutil.which("pwsh.exe") or shutil.which("powershell.exe")
    if ps:
        return [ps, "-NoLogo", "-NoProfile"]

    # Fallback: cmd.exe (selalu ada di Windows)
    cmd = shutil.which("cmd.exe") or r"C:\Windows\System32\cmd.exe"
    return [cmd]


RECORD     = os.getenv("SECUREOPS_RECORD_SESSIONS", "0") == "1"
RECORD_DIR = Path(os.getenv(
    "SECUREOPS_RECORD_DIR",
    os.path.join(os.getenv("PROGRAMDATA", "C:\\ProgramData"), "SecureOps-Agent", "sessions")
))
if RECORD:
    try:
        RECORD_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        log.warning(f"Cannot create recording dir: {e}")


try:
    from winpty import PtyProcess
    HAS_WINPTY = True
except ImportError:
    PtyProcess = None
    HAS_WINPTY = False


def _safe_env() -> dict:
    """
    Sanitize environment variables untuk passing ke pywinpty.
    Beberapa env vars sensitive / problematic harus di-strip.
    """
    env = {}
    for k, v in os.environ.items():
        if v is None:
            continue
        try:
            # Pastikan key + value adalah string yang valid
            env[str(k)] = str(v)
        except Exception:
            pass

    # Pastikan TERM ada (xterm.js compatible)
    env.setdefault("TERM", "xterm-256color")
    return env


@router.websocket("/ws")
async def terminal_ws(ws: WebSocket, key: str = Query(default="")):
    # ---------- Auth ----------
    # CRITICAL: harus accept() DULU sebelum close(). Close-before-accept
    # bikin Starlette return HTTP 403 instead of WS close code 1008.
    await ws.accept()
    if not auth.AGENT_KEY or key != auth.AGENT_KEY:
        log.warning(f"WS auth failed. Expected len={len(auth.AGENT_KEY)} got len={len(key)}")
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="bad agent key")
        return

    if not HAS_WINPTY:
        await ws.send_text(
            "\r\n\x1b[31m[error] pywinpty tidak terinstall di agent ini.\x1b[0m\r\n"
            "Terminal feature requires pywinpty. Re-install agent setelah:\r\n"
            "  1. Install Visual Studio Build Tools (C++ workload), atau\r\n"
            "  2. Switch ke Python 3.12/3.13 yang punya wheel pywinpty.\r\n"
        )
        await ws.close()
        return

    argv = _resolve_shell()
    log.info(f"Spawning PTY: {argv}")

    # Env: pakai UTF-8 codepage supaya output PowerShell tidak garbled
    env = _safe_env()
    env["PYTHONIOENCODING"] = "utf-8"

    # ---- Spawn shell via ConPTY ----
    proc = None
    try:
        proc = PtyProcess.spawn(
            argv,
            dimensions=(30, 100),       # (rows, cols)
            env=env,
        )
        log.info(f"PTY spawned, pid={proc.pid}")

        # Set UTF-8 codepage + clear screen jadi prompt fresh
        # CRITICAL: tanpa ini, output bahasa Indonesia/symbol akan jadi mojibake
        is_powershell = any("powershell" in a.lower() or "pwsh" in a.lower() for a in argv)
        if is_powershell:
            init_cmds = (
                # Force UTF-8 untuk input/output
                "$OutputEncoding = [System.Text.Encoding]::UTF8\r\n"
                "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\r\n"
                "[Console]::InputEncoding = [System.Text.Encoding]::UTF8\r\n"
                "chcp 65001 > $null\r\n"
                "Clear-Host\r\n"
            )
            proc.write(init_cmds)
        else:
            # cmd.exe — pakai chcp saja
            proc.write("chcp 65001 > nul\r\ncls\r\n")
    except Exception as e:
        err_msg = f"\r\n\x1b[31m[error] cannot spawn shell ({argv[0]}): {e}\x1b[0m\r\n"
        try:
            await ws.send_text(err_msg)
        except Exception:
            pass
        await ws.close()
        return

    # ---- Optional asciinema recorder ----
    rec_file = None
    t0 = datetime.utcnow().timestamp()
    if RECORD:
        try:
            fname = f"{int(t0)}-windows.cast"
            rec_file = open(RECORD_DIR / fname, "w", encoding="utf-8", buffering=1)
            header = {
                "version":   2,
                "width":     100,
                "height":    30,
                "timestamp": int(t0),
                "title":     f"controller @ {os.environ.get('COMPUTERNAME', 'windows')}",
                "env":       {"SHELL": " ".join(argv), "TERM": "xterm-256color"},
            }
            rec_file.write(json.dumps(header) + "\n")
        except Exception as e:
            log.warning(f"Recorder init failed: {e}")
            rec_file = None

    def record(kind: str, data):
        if not rec_file:
            return
        try:
            text = data.decode("utf-8", errors="replace") if isinstance(data, bytes) else data
            t = round(datetime.utcnow().timestamp() - t0, 4)
            rec_file.write(json.dumps([t, kind, text]) + "\n")
        except Exception:
            pass

    loop = asyncio.get_event_loop()
    stop_flag = {"stop": False}

    # ---- PTY -> WebSocket ----
    async def pty_to_ws():
        while not stop_flag["stop"]:
            try:
                # pywinpty's read() returns str (UTF-8 decoded) and blocks until data available
                data = await loop.run_in_executor(None, proc.read, CHUNK)
            except EOFError:
                log.info("PTY EOF")
                break
            except Exception as e:
                log.warning(f"PTY read error: {e}")
                break

            if not data:
                # Empty string = process exited
                log.info("PTY closed (empty read)")
                break

            # data is str — encode ke bytes untuk WebSocket
            if isinstance(data, str):
                data_bytes = data.encode("utf-8", errors="replace")
            else:
                data_bytes = data

            record("o", data_bytes)
            try:
                await ws.send_bytes(data_bytes)
            except Exception as e:
                log.info(f"WS send failed (client likely disconnected): {e}")
                break

    # ---- WebSocket -> PTY ----
    async def ws_to_pty():
        while not stop_flag["stop"]:
            try:
                msg = await ws.receive()
            except (WebSocketDisconnect, RuntimeError) as e:
                log.info(f"WS disconnect: {e}")
                break

            t = msg.get("type")
            if t == "websocket.disconnect":
                break

            # Binary frame = raw keystrokes
            if "bytes" in msg and msg["bytes"] is not None:
                try:
                    text = msg["bytes"].decode("utf-8", errors="replace")
                    record("i", text)
                    proc.write(text)
                except Exception as e:
                    log.warning(f"PTY write (bytes) error: {e}")
                continue

            # Text frame = either JSON control or text input
            if "text" in msg and msg["text"] is not None:
                text = msg["text"]
                # Control frame: {"resize": [cols, rows]}
                if text.startswith("{"):
                    try:
                        obj = json.loads(text)
                        if "resize" in obj:
                            cols, rows = obj["resize"]
                            try:
                                proc.setwinsize(int(rows), int(cols))
                                log.debug(f"Resized PTY: {rows}x{cols}")
                            except Exception as e:
                                log.warning(f"Resize failed: {e}")
                            continue
                    except json.JSONDecodeError:
                        pass

                record("i", text)
                try:
                    proc.write(text)
                except Exception as e:
                    log.warning(f"PTY write (text) error: {e}")

    # ---- Run both pipes until either side closes ----
    try:
        done, pending = await asyncio.wait(
            {asyncio.create_task(pty_to_ws()), asyncio.create_task(ws_to_pty())},
            return_when=asyncio.FIRST_COMPLETED,
        )
        stop_flag["stop"] = True
        for t in pending:
            t.cancel()
    finally:
        # Cleanup PTY — pywinpty 2.x: gunakan close() atau terminate() tanpa args
        if proc is not None:
            try:
                if proc.isalive():
                    try:
                        proc.terminate()
                    except Exception:
                        pass
                    # Give it 1 sec to terminate gracefully
                    await asyncio.sleep(1)
                    if proc.isalive():
                        try:
                            proc.kill(9)
                        except Exception:
                            pass
            except Exception as e:
                log.debug(f"PTY cleanup error (non-fatal): {e}")
            try:
                proc.close()
            except Exception:
                pass

        if rec_file is not None:
            try:
                rec_file.close()
            except Exception:
                pass

        try:
            await ws.close()
        except Exception:
            pass


# ---------- Recorded session listing & download ----------

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
