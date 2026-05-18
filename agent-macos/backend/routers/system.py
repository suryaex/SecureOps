"""
System Health & Network endpoints — AGENT version.

Returns metrics for THIS host only. The controller has its own /system router
that aggregates across all agents.
"""
import os
import platform
import socket

from fastapi import APIRouter, Depends

from auth import get_current_user

try:
    import psutil
except Exception:
    psutil = None

router = APIRouter()


@router.get("/health")
def system_health(_user=Depends(get_current_user)):
    """Live OS metrics."""
    if psutil is None:
        return {"available": False, "reason": "psutil not installed"}

    from datetime import datetime
    vm = psutil.virtual_memory()
    sm = psutil.swap_memory()
    du = psutil.disk_usage("/" if platform.system() != "Windows" else "C:\\")
    boot = datetime.fromtimestamp(psutil.boot_time())
    load1, load5, load15 = (0.0, 0.0, 0.0)
    try:
        load1, load5, load15 = os.getloadavg()
    except (AttributeError, OSError):
        pass

    cpu_percent = psutil.cpu_percent(interval=0.3)
    per_cpu = psutil.cpu_percent(interval=None, percpu=True)

    return {
        "available": True,
        "hostname": socket.gethostname(),
        "platform": platform.platform(),
        "system": platform.system(),
        "release": platform.release(),
        "architecture": platform.machine(),
        "python_version": platform.python_version(),
        "uptime_seconds": int((datetime.utcnow() - boot.replace(tzinfo=None)).total_seconds()),
        "boot_time": boot.isoformat(),
        "cpu": {
            "percent": cpu_percent,
            "cores_physical": psutil.cpu_count(logical=False) or 0,
            "cores_logical": psutil.cpu_count(logical=True) or 0,
            "per_cpu": per_cpu,
            "load_1m": round(load1, 2),
            "load_5m": round(load5, 2),
            "load_15m": round(load15, 2),
        },
        "memory": {
            "total_gb": round(vm.total / (1024**3), 2),
            "used_gb": round(vm.used / (1024**3), 2),
            "available_gb": round(vm.available / (1024**3), 2),
            "percent": vm.percent,
        },
        "swap": {
            "total_gb": round(sm.total / (1024**3), 2),
            "used_gb": round(sm.used / (1024**3), 2),
            "percent": sm.percent,
        },
        "disk": {
            "total_gb": round(du.total / (1024**3), 2),
            "used_gb": round(du.used / (1024**3), 2),
            "free_gb": round(du.free / (1024**3), 2),
            "percent": du.percent,
        },
        "processes": len(psutil.pids()),
    }


@router.get("/network")
def system_network(_user=Depends(get_current_user)):
    """Interfaces, addresses, traffic counters, listening ports."""
    if psutil is None:
        return {"available": False, "reason": "psutil not installed"}

    interfaces = []
    addrs = psutil.net_if_addrs()
    stats = psutil.net_if_stats()
    iocounters = psutil.net_io_counters(pernic=True)

    for name, addr_list in addrs.items():
        ipv4 = next((a.address for a in addr_list if a.family == socket.AF_INET), None)
        ipv6 = next((a.address for a in addr_list if a.family == socket.AF_INET6), None)
        mac = next((a.address for a in addr_list
                    if getattr(a, "family", None) == getattr(psutil, "AF_LINK", -1)
                    or str(a.family).endswith("17")), None)
        st = stats.get(name)
        io = iocounters.get(name)
        interfaces.append({
            "name": name,
            "ipv4": ipv4,
            "ipv6": ipv6,
            "mac": mac,
            "is_up": bool(st.isup) if st else False,
            "speed_mbps": st.speed if st else 0,
            "bytes_sent_mb": round(io.bytes_sent / (1024**2), 2) if io else 0,
            "bytes_recv_mb": round(io.bytes_recv / (1024**2), 2) if io else 0,
            "packets_sent": io.packets_sent if io else 0,
            "packets_recv": io.packets_recv if io else 0,
        })

    listening = []
    try:
        for c in psutil.net_connections(kind="inet"):
            if c.status == "LISTEN":
                listening.append({
                    "ip": c.laddr.ip if c.laddr else None,
                    "port": c.laddr.port if c.laddr else None,
                    "pid": c.pid,
                    "type": "TCP" if c.type == socket.SOCK_STREAM else "UDP",
                })
    except (psutil.AccessDenied, PermissionError):
        pass

    total_io = psutil.net_io_counters()
    return {
        "available": True,
        "hostname": socket.gethostname(),
        "interfaces": interfaces,
        "total": {
            "bytes_sent_mb": round(total_io.bytes_sent / (1024**2), 2),
            "bytes_recv_mb": round(total_io.bytes_recv / (1024**2), 2),
            "packets_sent": total_io.packets_sent,
            "packets_recv": total_io.packets_recv,
            "errin": total_io.errin,
            "errout": total_io.errout,
            "dropin": total_io.dropin,
            "dropout": total_io.dropout,
        },
        "listening_ports": listening[:50],
    }
