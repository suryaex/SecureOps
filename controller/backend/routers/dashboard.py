from datetime import datetime
from html import escape

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth import get_current_user

router = APIRouter()


@router.get("/stats", response_model=schemas.DashboardStats)
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    total_risky = db.query(models.PermissionAuditLog).count()
    critical = db.query(models.PermissionAuditLog).filter(models.PermissionAuditLog.severity == "Critical").count()
    high     = db.query(models.PermissionAuditLog).filter(models.PermissionAuditLog.severity == "High").count()
    medium   = db.query(models.PermissionAuditLog).filter(models.PermissionAuditLog.severity == "Medium").count()
    low      = db.query(models.PermissionAuditLog).filter(models.PermissionAuditLog.severity == "Low").count()

    sudo_count = db.query(models.SudoLog).filter(models.SudoLog.status.in_(["active", "idle"])).count()

    modified = db.query(models.FileIntegrity).filter(models.FileIntegrity.status == "modified").count()
    missing  = db.query(models.FileIntegrity).filter(models.FileIntegrity.status == "missing").count()
    integrity_status = "Secure" if (modified + missing) == 0 else "Alert"

    new_alerts = (
        db.query(models.AdminActivityLog)
        .filter(models.AdminActivityLog.status == "failed")
        .count()
    )

    recent = (
        db.query(models.AdminActivityLog)
        .order_by(models.AdminActivityLog.timestamp.desc())
        .limit(6)
        .all()
    )

    total = critical + high + medium + low or 1
    severity_breakdown = {
        "Critical": round(critical / total * 100),
        "High":     round(high     / total * 100),
        "Medium":   round(medium   / total * 100),
        "Low":      round(low      / total * 100),
    }

    return schemas.DashboardStats(
        total_risky_files=total_risky,
        critical_files=critical,
        sudo_users_count=sudo_count,
        integrity_status=integrity_status,
        modified_files=modified,
        missing_files=missing,
        new_alerts=new_alerts,
        recent_activities=recent,
        severity_breakdown=severity_breakdown,
    )


# ---------- Downloadable HTML report ----------

def _fmt_ts(ts):
    if not ts:
        return "—"
    if hasattr(ts, "strftime"):
        return ts.strftime("%Y-%m-%d %H:%M:%S")
    return str(ts)


@router.get("/report")
def download_report(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user),
):
    """
    Generate a self-contained HTML security report.
    Returned as an inline HTML response with Content-Disposition: attachment.
    The browser can then "Save as PDF" via Ctrl+P → Save.
    """
    now = datetime.utcnow()

    # Counters
    total_risky = db.query(models.PermissionAuditLog).count()
    critical = db.query(models.PermissionAuditLog).filter(models.PermissionAuditLog.severity == "Critical").count()
    high     = db.query(models.PermissionAuditLog).filter(models.PermissionAuditLog.severity == "High").count()
    medium   = db.query(models.PermissionAuditLog).filter(models.PermissionAuditLog.severity == "Medium").count()
    low      = db.query(models.PermissionAuditLog).filter(models.PermissionAuditLog.severity == "Low").count()
    sudo_count = db.query(models.SudoLog).count()
    integrity_count = db.query(models.FileIntegrity).count()
    modified = db.query(models.FileIntegrity).filter(models.FileIntegrity.status == "modified").count()
    missing  = db.query(models.FileIntegrity).filter(models.FileIntegrity.status == "missing").count()
    safe     = integrity_count - modified - missing
    log_count = db.query(models.AdminActivityLog).count()
    failed_logins = db.query(models.AdminActivityLog).filter(models.AdminActivityLog.status == "failed").count()

    perm_top = (db.query(models.PermissionAuditLog)
                  .order_by(models.PermissionAuditLog.detected_at.desc())
                  .limit(25).all())
    sudo_list = db.query(models.SudoLog).limit(25).all()
    fi_list = db.query(models.FileIntegrity).limit(25).all()
    recent_logs = (db.query(models.AdminActivityLog)
                     .order_by(models.AdminActivityLog.timestamp.desc())
                     .limit(30).all())

    def row(*cells):
        return "<tr>" + "".join(f"<td>{escape(str(c))}</td>" for c in cells) + "</tr>"

    perm_rows = "".join(row(p.file_path, p.issue_type, p.permission_value,
                            p.severity, _fmt_ts(p.detected_at), p.scanned_by or "—")
                        for p in perm_top) or row("—", "—", "—", "—", "—", "—")
    sudo_rows = "".join(row(s.username, s.groups or "—",
                            _fmt_ts(s.last_access), s.failed_attempts,
                            s.status, s.action or "—")
                        for s in sudo_list) or row("—", "—", "—", "—", "—", "—")
    fi_rows = "".join(row(f.filename, f.hash_value[:16] + "…",
                          _fmt_ts(f.last_checked), f.status,
                          "Yes" if f.alert_sent else "No")
                      for f in fi_list) or row("—", "—", "—", "—", "—")
    log_rows = "".join(row(l.admin_username, l.action, l.details or "—",
                           l.ip_address, _fmt_ts(l.timestamp), l.status)
                       for l in recent_logs) or row("—", "—", "—", "—", "—", "—")

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SecureOps Security Report — {now.strftime('%Y-%m-%d %H:%M')}</title>
<style>
  @page {{ size: A4; margin: 18mm; }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: -apple-system, 'Segoe UI', Roboto, Inter, sans-serif;
          color: #111827; margin: 0; padding: 32px; background: #fff; }}
  h1 {{ font-size: 28px; margin: 0 0 4px; color: #111827; }}
  h2 {{ font-size: 18px; margin: 36px 0 12px; color: #1F2937;
        border-bottom: 2px solid #2563EB; padding-bottom: 6px; }}
  .subtitle {{ color: #6B7280; font-size: 14px; margin-bottom: 24px; }}
  .meta {{ background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 12px;
           padding: 16px 20px; margin-bottom: 24px; font-size: 13px;
           display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }}
  .meta b {{ color: #374151; }}
  .grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }}
  .stat {{ background: #fff; border: 1px solid #E5E7EB; border-radius: 12px;
           padding: 14px 16px; }}
  .stat .lbl {{ font-size: 11px; color: #9CA3AF; text-transform: uppercase;
                letter-spacing: 0.05em; font-weight: 600; }}
  .stat .val {{ font-size: 24px; font-weight: 700; margin-top: 4px; }}
  .red    {{ color: #DC2626; }}
  .orange {{ color: #D97706; }}
  .yellow {{ color: #CA8A04; }}
  .green  {{ color: #16A34A; }}
  .blue   {{ color: #2563EB; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }}
  th {{ text-align: left; padding: 8px 10px; background: #F3F4F6;
        color: #6B7280; font-size: 11px; text-transform: uppercase;
        letter-spacing: 0.04em; border-bottom: 1px solid #E5E7EB; }}
  td {{ padding: 8px 10px; border-bottom: 1px solid #F3F4F6; color: #374151;
        font-family: 'SF Mono', Consolas, monospace; font-size: 11.5px; }}
  tr:nth-child(even) td {{ background: #FAFBFC; }}
  .footer {{ margin-top: 40px; text-align: center; font-size: 11px;
             color: #9CA3AF; border-top: 1px solid #E5E7EB; padding-top: 12px; }}
  .badge {{ display: inline-block; padding: 2px 8px; border-radius: 999px;
            font-size: 10px; font-weight: 700; }}
</style>
</head>
<body>

<h1>SecureOps Security Report</h1>
<p class="subtitle">State Polytechnic of Sriwijaya — Comprehensive Audit Snapshot</p>

<div class="meta">
  <div><b>Generated:</b> {now.strftime('%Y-%m-%d %H:%M:%S UTC')}</div>
  <div><b>Generated by:</b> {escape(current_user.username)} ({escape(current_user.role)})</div>
  <div><b>Source IP:</b> {escape(request.client.host or 'unknown')}</div>
  <div><b>Report ID:</b> SO-{now.strftime('%Y%m%d%H%M%S')}</div>
</div>

<h2>Executive Summary</h2>
<div class="grid">
  <div class="stat"><div class="lbl">Total Issues</div><div class="val">{total_risky}</div></div>
  <div class="stat"><div class="lbl">Critical</div><div class="val red">{critical}</div></div>
  <div class="stat"><div class="lbl">High</div><div class="val orange">{high}</div></div>
  <div class="stat"><div class="lbl">Medium</div><div class="val yellow">{medium}</div></div>
  <div class="stat"><div class="lbl">Low</div><div class="val blue">{low}</div></div>
  <div class="stat"><div class="lbl">Sudo Users</div><div class="val">{sudo_count}</div></div>
  <div class="stat"><div class="lbl">Monitored Files</div><div class="val">{integrity_count}</div></div>
  <div class="stat"><div class="lbl">Failed Logins</div><div class="val red">{failed_logins}</div></div>
</div>

<h2>File Integrity</h2>
<div class="grid">
  <div class="stat"><div class="lbl">Safe</div><div class="val green">{safe}</div></div>
  <div class="stat"><div class="lbl">Modified</div><div class="val red">{modified}</div></div>
  <div class="stat"><div class="lbl">Missing</div><div class="val orange">{missing}</div></div>
  <div class="stat"><div class="lbl">Activity Logs</div><div class="val">{log_count}</div></div>
</div>
<table>
  <thead><tr><th>Filename</th><th>Hash</th><th>Last Checked</th><th>Status</th><th>Alert</th></tr></thead>
  <tbody>{fi_rows}</tbody>
</table>

<h2>Top Permission Issues (Latest 25)</h2>
<table>
  <thead><tr><th>File Path</th><th>Issue</th><th>Mode</th><th>Severity</th><th>Detected</th><th>Scanned By</th></tr></thead>
  <tbody>{perm_rows}</tbody>
</table>

<h2>Sudo Privileged Users</h2>
<table>
  <thead><tr><th>Username</th><th>Groups</th><th>Last Access</th><th>Failed</th><th>Status</th><th>Action</th></tr></thead>
  <tbody>{sudo_rows}</tbody>
</table>

<h2>Recent Activity (Latest 30)</h2>
<table>
  <thead><tr><th>Admin</th><th>Action</th><th>Details</th><th>IP</th><th>Time</th><th>Status</th></tr></thead>
  <tbody>{log_rows}</tbody>
</table>

<div class="footer">
  Generated by SecureOps v1.1 · State Polytechnic of Sriwijaya<br>
  Tip: Use Ctrl+P → "Save as PDF" to archive this report.
</div>

</body></html>"""

    filename = f"secureops-report-{now.strftime('%Y%m%d-%H%M%S')}.html"
    return HTMLResponse(
        content=html,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
