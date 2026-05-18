"""
Gunicorn config for production.

Run with:
    gunicorn -c gunicorn.conf.py main:app
"""
import multiprocessing
import os

bind            = os.getenv("SECUREOPS_BIND", "0.0.0.0:8000")
workers         = int(os.getenv("SECUREOPS_WORKERS",
                                str(min(4, max(2, multiprocessing.cpu_count())))))
worker_class    = "uvicorn.workers.UvicornWorker"
timeout         = 120
graceful_timeout = 30
keepalive       = 5

accesslog = "-"          # stdout — captured by systemd journal
errorlog  = "-"
loglevel  = os.getenv("SECUREOPS_LOGLEVEL", "info")

# Trust X-Forwarded-* from nginx
forwarded_allow_ips = "*"
proxy_allow_ips     = "*"
