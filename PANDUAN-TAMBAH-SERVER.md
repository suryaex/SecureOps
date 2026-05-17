# 🚀 Panduan Tambah Server — Super Simple

> **TL;DR:** 3 langkah, **1 command** copy-paste. Done.

---

## 📊 Flow Baru (v1.5+) — Sekilas

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ① BROWSER                  ② SERVER TARGET     ③ BROWSER  │
│      Klik tombol                Paste command          🎉   │
│      "+ Add Server"             di terminal      Auto-muncul│
│      isi nama                   tekan Enter         online  │
│      → copy command                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
       ↓                          ↓                    ↑
       └──── 30 detik ──────────┘                      │
                                  └─── 2-5 menit ──────┘
```

**Total waktu**: ~3 menit. **Copy-paste**: 1 kali doang.

---

## 🎯 Langkah Detail dengan Ilustrasi

### Langkah 1️⃣ — Buka Controller UI, Klik "Add Server"

```
┌──────────────────────────────────────────────────────────────────────┐
│  🛡 SecureOps                          🔍 search...   controller ▼  │
├──────┬───────────────────────────────────────────────────────────────┤
│      │                                                                │
│ 📊 Dashboard                                                          │
│ 🌐 Fleet         Monitored Servers      ┌──────────┐ ┌──────────────┐│
│ 🔍 Audit         Fleet of agents...     │ Ping All │ │+ Add Server  ││
│ 🔐 Sudo                                  └──────────┘ └──────┬───────┘│
│ ✅ Integrity                                                  │       │
│ 📝 Logs                                                       │KLIK!  │
│ 🖥  Terminal     ┌──────┐ ┌──────┐ ┌──────┐ ┌─────────┐                │
│ 📡 Servers ◀━━━┓│TOTAL │ │ONLINE│ │OFFLINE│ │UNKNOWN │                │
│ 👥 Users      ┃│  1   │ │  1   │ │  0    │ │   0    │                │
│ ⚙ Settings    ┃└──────┘ └──────┘ └──────┘ └─────────┘                │
│ ❓Support      ┃                                                       │
│              ┃ [Tabel server existing...]                            │
│   SU        ┃                                                        │
│   admin     ┗━━ kamu disini                                          │
└──────────────────────────────────────────────────────────────────────┘
```

**Sidebar** → klik **Servers** → klik tombol biru **"+ Add Server"** kanan atas.

---

### Langkah 2️⃣ — Pilih Mode "One-Liner" (default)

Modal muncul dengan **2 tab**:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚡ Add a new server                                          ✕  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────┐ ┌─────────────────────────────┐│
│  │ ⚡ One-Liner (Recommended)  │ │  ✏ Manual Entry             ││
│  │                              │ │                              ││
│  │ Agent auto-registers itself. │ │ Paste API URL & Key from     ││
│  │ Zero copy-paste.             │ │ existing agent.              ││
│  └──────────────[SELECTED]─────┘ └──────────────────────────────┘│
│                                                                  │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║ ⚡ How it works                                            ║  │
│  ║                                                            ║  │
│  ║   1. Pick a name for your new server below                ║  │
│  ║   2. Copy the one-liner command (next screen)             ║  │
│  ║   3. Paste it on the target server's terminal             ║  │
│  ║   4. Agent installs itself and auto-registers             ║  │
│  ╚══════════════════════════════════════════════════════════╝  │
│                                                                  │
│  SERVER NAME *                                                   │
│  ┌────────────────────────────────────────────────────────────┐│
│  │  web-prod-01                                                ││
│  └────────────────────────────────────────────────────────────┘│
│   Must be unique. Use lowercase letters, digits, and dashes.   │
│                                                                  │
│  TAGS (optional, comma-separated)                                │
│  ┌────────────────────────────────────────────────────────────┐│
│  │  production, web                                            ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────┐ ┌────────────────┐│
│  │  →  Generate install command            │ │     Cancel     ││
│  └─────────────────────────────────────────┘ └────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

Isi 2 field:
- **Server name**: nama bebas (misal: `web-prod-01`)
- **Tags**: opsional (misal: `production, web`)

Klik **"Generate install command"** → ke screen berikutnya.

---

### Langkah 3️⃣ — Copy 1 Command yang Muncul

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚡ Add a new server                                          ✕  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║  💻 Run this on the new server  web-prod-01               ║  │
│  ║                                                            ║  │
│  ║  ╭──────────────────────────────────────────────╮ ┌─────┐║  │
│  ║  │ curl -fsSL "https://secureops.site/api/serve│ │ 📋  │║  │
│  ║  │ rs/install-script/Xy7Bz_AbC1234..." | sudo b│ │COPY │║  │
│  ║  │ ash                                          │ └─────┘║  │
│  ║  ╰──────────────────────────────────────────────╯        ║  │
│  ║                                                            ║  │
│  ║  Token expires in 59:42. Server name reserved as web-prod-01║│
│  ╚══════════════════════════════════════════════════════════╝  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ⏳ (spinning loader)                         │   │
│  │   Waiting for the agent to register…                     │   │
│  │   This window auto-detects when the agent reports in.    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────┐ ┌─────────────────────────────┐│
│  │  ↻  Generate new token       │ │       Close                ││
│  └─────────────────────────────┘ └─────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

Klik **icon 📋** di pojok kanan kotak hitam → command tercopy ke clipboard.

**Biarkan window tetap terbuka** — dia akan auto-detect saat agent join.

---

### Langkah 4️⃣ — SSH ke Server, Paste Command

```
╭─ Terminal: root@web-prod-01 ──────────────────────────────────╮
│                                                                │
│ $ curl -fsSL "https://secureops.site/api/servers/install-     │
│   script/Xy7Bz_AbC1234..." | sudo bash                        │
│                                                                │
│ ==> Downloading main installer...                              │
│ ==> Detected: Ubuntu 24.04.1 LTS (id=ubuntu, version=24.04)   │
│ ==> Installing system packages…                                │
│ ==> Setting up Python venv…                                    │
│ ==> Auto-registering with controller at https://secureops.site │
│                                                                │
│ ╔══════════════════════════════════════════════════════════╗  │
│ ║       ✅ SecureOps Agent Installed Successfully            ║  │
│ ╚══════════════════════════════════════════════════════════╝  │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │       🎉 AUTO-REGISTERED WITH CONTROLLER                  │  │
│ │       No further action needed — agent is online!         │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
│   Controller:    https://secureops.site                        │
│   Registered as: web-prod-01                                   │
│   API URL:       http://100.64.10.12:8001                      │
│                                                                │
│ root@web-prod-01:~# █                                          │
╰────────────────────────────────────────────────────────────────╯
```

Tunggu 2-5 menit (download deps + install). **Yang harus muncul** di akhir:
```
🎉 AUTO-REGISTERED WITH CONTROLLER
   No further action needed — agent is online!
```

---

### Langkah 5️⃣ — Otomatis! Browser nge-Detect

Tanpa perlu refresh, modal di browser otomatis berubah jadi:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚡ Add a new server                                          ✕  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                       ┌──────────────┐                           │
│                       │              │                           │
│                       │      ✅      │                           │
│                       │              │                           │
│                       └──────────────┘                           │
│                                                                  │
│                    Server connected!                             │
│              web-prod-01 is now in your fleet.                  │
│                                                                  │
│                http://100.64.10.12:8001                          │
│                                                                  │
│            ┌──────────────┐  ┌─────────────────┐                │
│            │  ✓  Got it    │  │  +  Add another │                │
│            └──────────────┘  └─────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

Klik **"Got it"** untuk close, atau **"Add another"** untuk lanjut tambah server lain.

Server baru langsung muncul 🟢 di tabel + dropdown top-bar selector.

---

## ⚡ Yang Berbeda dari Versi Lama

| Aspek | ❌ Lama (v1.4) | ✅ Baru (v1.5+) |
|---|---|---|
| Copy-paste | 3 hal (Name, URL, Key) | 1 command |
| Bolak-balik | Browser → Terminal → Browser | Browser only |
| Risiko salah ketik | Tinggi (43-char key) | Nol |
| Verify agent online | Manual klik Ping | Otomatis polling |
| Tahu kapan jadi | Refresh terus | Modal auto-update |
| Waktu rata-rata | 5-10 menit | 2-3 menit |

---

## 🆘 Jika Agent Gak Auto-Connect dalam 5 Menit

Modal akan tetap menunggu (token valid 1 jam). Kemungkinan masalah:

### 1. Internet di agent gak nyambung
```bash
# Di agent:
curl -I https://secureops.site
# Harus return: HTTP/2 200
```

### 2. Bukan Ubuntu/Debian/derivative
Installer cek distro otomatis. Cek output di terminal — pasti ada pesan error.

### 3. Token expired (>1 jam)
Klik **"Generate new token"** di modal — bikin yang baru.

### 4. Agent crash setelah install
SSH ke agent:
```bash
sudo systemctl status secureops-agent
sudo journalctl -u secureops-agent -n 50
```

Paste outputnya ke chat, saya bantu debug.

---

## 🔧 Mode Manual (Fallback)

Kalau preferred **manual entry** (misal: agent sudah ter-install dari sebelumnya), klik tab **"Manual Entry"** di modal — form klasik dengan field API URL & API Key.

---

## 🎨 Diagram Komunikasi Antar Komponen

```
┌──────────┐                ┌─────────────┐               ┌────────────┐
│ BROWSER  │                │  CONTROLLER │               │   AGENT    │
│  (user)  │                │             │               │  (target)  │
└────┬─────┘                └──────┬──────┘               └─────┬──────┘
     │                             │                            │
     │ 1. POST /servers/join-token │                            │
     │    {name, tags}             │                            │
     ├────────────────────────────▶│                            │
     │                             │                            │
     │     {token, install_cmd}    │                            │
     │◀────────────────────────────┤                            │
     │                             │                            │
     │   👤 User copies cmd        │                            │
     │   to agent terminal         │                            │
     │                             │                            │
     │                             │   2. GET /install-script/  │
     │                             │      {token}               │
     │                             │◀───────────────────────────┤
     │                             │                            │
     │                             │  install.sh (personalized) │
     │                             ├───────────────────────────▶│
     │                             │                            │
     │                             │             🛠 Agent       │
     │                             │             installs       │
     │                             │             gunicorn       │
     │                             │             generates key  │
     │                             │                            │
     │                             │   3. POST /auto-register   │
     │                             │      {token, ip, key}      │
     │                             │◀───────────────────────────┤
     │                             │                            │
     │                             │   {server_id, status:ok}   │
     │                             ├───────────────────────────▶│
     │                             │                            │
     │  4. GET /join-token/{t}/    │                            │
     │     status (every 2s)       │                            │
     ├────────────────────────────▶│                            │
     │                             │                            │
     │    {status: 'registered'}   │                            │
     │◀────────────────────────────┤                            │
     │                             │                            │
     │   ✅ Modal: "Connected!"    │                            │
     │                             │                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Yang Berubah di Code

| File | Perubahan |
|---|---|
| `controller/backend/routers/servers.py` | +3 endpoint: `POST /join-token`, `GET /install-script/{t}`, `POST /auto-register` |
| `agent/deploy/install.sh` | Setelah service ready, kalau ada `SECUREOPS_JOIN_TOKEN` + `SECUREOPS_CONTROLLER_URL`, auto POST ke `/auto-register` |
| `controller/frontend/src/pages/Servers.jsx` | Modal baru dengan 2 tab: **One-Liner** (default) + **Manual Entry** |

---

## 🚀 Push Update ke Production

Setelah git pull di controller:

```bash
cd ~/secureops
git pull
sudo bash controller/deploy/deploy-prod.sh
```

Frontend di-rebuild + backend di-restart. Done.

Sekarang setiap kali nambah server: **1 command, 1 paste**. 🎉

---

*Dokumen ini bagian dari project SecureOps v1.5 · State Polytechnic of Sriwijaya · 2026*
