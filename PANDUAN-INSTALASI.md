# 📘 Panduan Instalasi SecureOps — `secureops.site`

Panduan lengkap deployment SecureOps untuk **State Polytechnic of Sriwijaya** dengan domain `secureops.site` (Rumahweb). Dibagi 2 tahap: testing di VM dulu, baru migrasi ke server produksi.

---

## ✅ Distro yang Didukung

Installer otomatis mendeteksi distro dan menyesuaikan langkah-langkahnya. Versi yang **sudah ditest**:

| Distro                | Versi Didukung           | Python default | Catatan |
|-----------------------|--------------------------|----------------|---------|
| **Ubuntu Server**     | 20.04 / 22.04 / **24.04** / 25.04 | 3.8 → 3.12 | Direkomendasikan: 22.04 LTS atau 24.04 LTS |
| **Debian**            | 11 (Bullseye) / 12 (Bookworm) / 13 (Trixie) | 3.9 → 3.13 | Stable, ringan |
| **Linux Mint**        | 20+ / 21+ / 22+          | mengikuti Ubuntu | ✅ Tested |
| **Pop!_OS**           | 22.04+                   | mengikuti Ubuntu | ✅ Tested |
| **Elementary OS**     | 7+                       | mengikuti Ubuntu | ✅ |
| **Kali Linux**        | 2024.x+                  | 3.11+ | ⚠️ Untuk audit lab only |
| **Raspberry Pi OS**   | Bookworm (arm64)          | 3.11+ | ✅ Untuk monitoring perangkat IoT |

**Yang TIDAK didukung** (perlu manual install): Fedora, RHEL/CentOS, openSUSE, Arch (karena pakai package manager yang berbeda — bisa di-port nanti kalau perlu).

### Apa yang sudah di-fix untuk Ubuntu 24.04+

| Issue | Solusi |
|---|---|
| **PEP 668** (`externally-managed-environment` error) | Installer pakai `venv` terpisah — tidak install ke system Python |
| **`bcrypt` 4.1+ warning di passlib** | Auto-suppress di `auth.py` (functional, hanya log noise) |
| **`certbot` apt-package hilang di Ubuntu 24+** | Installer auto-deteksi & instruksikan `snap install certbot` di Ubuntu 24+ |
| **Node.js 18 sudah deprecated** | Installer pakai Node 20 LTS via NodeSource |
| **Version pin terlalu strict** | Semua dependency pakai range (`>=X,<Y`) supaya kompatibel di semua versi Python 3.10–3.13 |

---

## 📋 Rencana Deployment

```
TAHAP 1  →  Testing di VM lokal           →  4 VM: 1 controller + 3 agent
                                              Akses lewat IP LAN (192.168.x.x)
                                              Tanpa HTTPS, no domain

TAHAP 2  →  Production di server asli     →  Domain secureops.site
                                              HTTPS auto via Cloudflare/Let's Encrypt
                                              Cloudflare Tunnel (gratis, no port forward)
```

**Yang kamu butuhkan dari sekarang:**

- ✅ Domain `secureops.site` (sudah punya)
- ⬜ Software virtualisasi: **VirtualBox** (gratis) atau VMware Workstation
- ⬜ ISO Ubuntu Server 22.04 LTS — download dari https://ubuntu.com/download/server (~2 GB)
- ⬜ Komputer dengan minimal **16 GB RAM** (4 VM × 2 GB + sistem)
- ⬜ Server produksi (VPS atau fisik) dengan Ubuntu 22.04+
- ⬜ Akun gratis: Tailscale + Cloudflare

---

# 🟦 TAHAP 1 — Testing di Virtual Machine

> Tujuan: pastikan semua fitur jalan sebelum sentuh server produksi. Kalau ada error, masih bisa hapus VM dan ulang.

## Langkah 1.1 — Buat 4 VM di VirtualBox

Untuk setiap VM, gunakan settingan ini:

| Item | Nilai |
|---|---|
| **OS** | Ubuntu Server 22.04 LTS |
| **RAM** | 2048 MB (2 GB) |
| **CPU** | 2 cores |
| **Disk** | 20 GB (dynamic) |
| **Network adapter 1** | Bridged Adapter (supaya VM dapat IP di jaringan kamu) |

Beri nama VM-nya:

| Nama VM | Peran | Hostname |
|---|---|---|
| `secureops-ctrl` | Controller (web UI + central API) | `controller` |
| `secureops-web` | Agent (simulasi web server) | `web-prod` |
| `secureops-db`  | Agent (simulasi database server) | `db-server` |
| `secureops-bak` | Agent (simulasi backup server) | `backup-srv` |

**Catatan saat install Ubuntu Server:**

1. Saat ditanya hostname → isi sesuai tabel di atas
2. Saat ditanya username → buat user `superadmin` dengan password yang kamu ingat
3. Centang **"Install OpenSSH server"** supaya bisa SSH dari laptop
4. Skip semua featured snaps, langsung **Done**

Setelah ke-4 VM selesai install, **catat IP address-nya**:

```bash
# Di setiap VM, jalankan:
ip a | grep "inet "
# Catat IP yang formatnya 192.168.x.x atau 10.x.x.x
```

Misal hasilnya:

```
controller   → 192.168.1.100
web-prod     → 192.168.1.101
db-server    → 192.168.1.102
backup-srv   → 192.168.1.103
```

> Dari laptop, test SSH: `ssh superadmin@192.168.1.100` — kalau bisa masuk, lanjut.

---

## Langkah 1.2 — Install Tailscale di semua VM

Tailscale bikin "private VPN gratis" antar semua VM, supaya controller bisa hubungin agent walaupun nanti agent ada di server beda lokasi.

**Buat akun Tailscale dulu** di https://login.tailscale.com (gratis, sign-up pakai Google/GitHub).

Di **setiap** VM (4-4nya), jalankan:

```bash
# SSH ke VM dari laptop
ssh superadmin@<ip-vm>

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sudo sh

# Authenticate — akan tampil URL, copy ke browser, login, approve device
sudo tailscale up

# Lihat IP Tailscale (formatnya 100.x.x.x)
tailscale ip -4
```

Misal hasilnya:

```
controller   → Tailscale IP: 100.64.10.5
web-prod     → Tailscale IP: 100.64.10.12
db-server    → Tailscale IP: 100.64.10.18
backup-srv   → Tailscale IP: 100.64.10.24
```

Test antar VM:

```bash
# Dari controller VM
ping -c 2 100.64.10.12   # ping ke web-prod via Tailscale
```

Kalau berhasil ping, mesh sudah jalan ✅

---

## Langkah 1.3 — Install Controller di VM `controller`

```bash
# Dari laptop, SSH ke controller VM
ssh superadmin@192.168.1.100

# Update sistem + install git
sudo apt update && sudo apt upgrade -y
sudo apt install -y git

# Clone repository SecureOps
cd ~
git clone https://github.com/suryaex/secureops.git
cd secureops

# Jalankan installer — sekitar 3-5 menit
sudo bash controller/deploy/deploy-prod.sh
```

Output terakhir kira-kira:

```
✅ Production deploy complete
  Web:        http://192.168.1.100/
  Backend:    http://192.168.1.100/api/health
  Login with your real Linux account.
```

**Tes dari laptop:**

1. Buka browser di laptop
2. Akses `http://192.168.1.100`
3. Login dengan username **superadmin** dan password Linux yang kamu set tadi
4. Harusnya masuk ke dashboard SecureOps ✅

> Kalau dapat error PAM, restart service: `sudo systemctl restart secureops-backend`. Pastikan service jalan **as root** (`sudo systemctl status secureops-backend`).

---

## Langkah 1.4 — Daftarkan agent pertama (`web-prod`)

**Di browser** (controller UI):

1. Klik sidebar **Servers** (admin only — pastikan akun kamu ada di group sudo)
2. Klik tombol **Add Server**
3. Isi:
   - **Name**: `web-prod`
   - **Hostname**: `web-prod`
   - **API URL**: kosongkan dulu (nanti diisi setelah agent terinstall)
   - **Tags**: `production, web`
4. Klik **Register Server**
5. **Pop-up muncul** dengan **API Key** — **COPY API KEY-NYA**, contoh:
   ```
   Xy7Bz_AbC123dEf456GhIjK_lMnOpQrStUv
   ```

**Di VM `web-prod`:**

```bash
# SSH ke web-prod
ssh superadmin@192.168.1.101

# Buat user terbatas untuk shell session (best practice — biar gak run as root)
sudo useradd -m -s /bin/bash secureops

# Install agent dengan opsi production-grade
sudo SECUREOPS_AGENT_KEY=Xy7Bz_AbC123dEf456GhIjK_lMnOpQrStUv \
     SECUREOPS_SHELL_USER=secureops \
     SECUREOPS_RECORD_SESSIONS=1 \
     bash <(curl -fsSL https://raw.githubusercontent.com/suryaex/secureops/main/agent/deploy/install.sh)
```

> Ganti `Xy7Bz_...` dengan API Key kamu yang dari pop-up tadi.

Output terakhir:

```
✅ SecureOps Agent installed!
  Hostname:     web-prod
  IP for ctrl:  100.64.10.12     ← Tailscale IP
  Port:         8001
```

**Catat Tailscale IP-nya** (`100.64.10.12`), lalu **kembali ke browser**:

1. Sidebar **Servers** → klik icon ✏️ pensil di row `web-prod`
2. **API URL**: `http://100.64.10.12:8001`
3. Save
4. Klik icon 📡 ping → harus muncul 🟢 **online**

✅ Server pertama tersambung.

---

## Langkah 1.5 — Daftarkan agent ke-2 dan ke-3

Ulangi **Langkah 1.4** untuk `db-server` dan `backup-srv`:

| Server | Tailscale IP | Tags |
|---|---|---|
| `db-server` | misal `100.64.10.18` | `production, database` |
| `backup-srv` | misal `100.64.10.24` | `backup` |

Setelah semua terdaftar, halaman **Servers** akan menampilkan 4 baris (1 controller local + 3 agent remote), semua hijau 🟢.

---

## Langkah 1.6 — Test semua fitur

### A. Dashboard & Fleet

- Sidebar **Dashboard** → harus muncul stat cards + charts
- Sidebar **Fleet** → harus muncul 4 card server dengan CPU/Memory/Disk per server (auto-refresh 10 detik)

### B. Switch server di top-bar

- Top-bar dropdown → pilih `db-server`
- Sidebar **System Health** → grafik CPU/Memory di-pull dari `db-server`, bukan controller
- Sidebar **Network** → daftar interface jaringan `db-server`

### C. Permission Audit

- Top-bar pilih `web-prod`
- Sidebar **Audit** → klik **Start Scan** → tunggu beberapa detik → muncul daftar issue
- Coba filter by severity (Critical / High / Medium / Low)

### D. Sudo Monitor

- Sidebar **Sudo** → klik **Scan Sudoers** → muncul daftar user dengan grup sudo/wheel

### E. File Integrity

- Sidebar **Integrity** → klik **Add File** → masukkan path `/etc/passwd` → Save
- Klik **Scan Now** → file muncul dengan status `safe` + SHA-256 hash
- SSH ke web-prod, edit `/etc/passwd` (atau bikin user baru) → re-scan dari UI → statusnya berubah jadi `modified` ⚠️

### F. Live SSH Terminal 🖥️

- Top-bar pilih `web-prod`
- Sidebar **Terminal** → otomatis connect
- Coba: `whoami` → output harusnya **`secureops`** (bukan root, karena `SECUREOPS_SHELL_USER=secureops`)
- Coba: `ls -la`, `top` (q untuk keluar), `htop`, `vim test.txt`
- Test tombol virtual keys: ^C untuk batal, Tab untuk completion, panah atas untuk history
- Klik **Disconnect**

### G. Session Replay 🎬

- Sidebar **Replays** → muncul recording sesi yang barusan
- Klik recording → terminal di-replay otomatis dengan timing asli
- Coba ganti kecepatan ke 4× atau 8×
- Klik download → dapat file `.cast` yang bisa juga dimainkan di terminal dengan `asciinema play file.cast`

### H. Activity Logs

- Sidebar **Logs** → harus muncul daftar semua action: Login, scan, Terminal Open/Close dengan durasi

### I. User Management

- Sidebar **Users** → klik **Add New User** → buat user DB (misalnya `auditor1` / password `Test@1234` / role `auditor`)
- Logout, login ulang dengan `auditor1` → menu Users, Servers, Terminal harus **tidak muncul** di sidebar
- Logout, login balik dengan superadmin

### J. Download Report

- Dashboard → klik **Download Report** → dapat file HTML
- Buka file → muncul laporan lengkap audit
- Tekan Ctrl+P di browser → **Save as PDF**

### K. PWA install (opsional)

- Buka `http://192.168.1.100` dari browser HP yang **satu jaringan** dengan VM
- Chrome menu → **Install app** → icon SecureOps muncul di home screen
- Buka — jalan full-screen seperti app native

---

## ✅ Tahap 1 selesai

Kalau semua di atas jalan, kamu siap pindah ke produksi. Kalau ada yang gagal, debug pakai:

```bash
# Di controller VM
sudo journalctl -u secureops-backend -f      # log backend
sudo journalctl -u nginx -f                  # log nginx
sudo systemctl status secureops-backend

# Di agent VM
sudo journalctl -u secureops-agent -f
sudo systemctl status secureops-agent
```

---

# 🟩 TAHAP 2 — Production dengan Domain `secureops.site`

Sekarang asumsinya kamu sudah punya **VPS / server fisik** untuk deploy permanen.

## Langkah 2.1 — Persiapan domain di Rumahweb

Domain `secureops.site` dari Rumahweb perlu di-point ke server kamu. Ada **2 pilihan**:

### 🅰️ Pilihan A — Pakai Cloudflare (RECOMMENDED, gratis HTTPS, no port forward)

Cocok kalau:

- Server kamu di rumah / kantor tanpa IP publik statis
- ISP block port 80/443 (banyak ISP Indonesia begini)
- Mau HTTPS otomatis

**Langkah-langkah:**

1. **Bikin akun Cloudflare gratis** di https://dash.cloudflare.com/sign-up

2. Di Cloudflare dashboard → **Add a Site** → masukkan `secureops.site` → pilih plan **Free**

3. Cloudflare kasih **2 nameserver**, misalnya:
   ```
   alex.ns.cloudflare.com
   barb.ns.cloudflare.com
   ```

4. **Login ke client area Rumahweb** (https://clientarea.rumahweb.com)
   - Klik **My Domains** → cari `secureops.site` → klik **Manage**
   - Cari menu **Nameservers**
   - Pilih **"Use custom nameservers"**
   - Ganti dengan 2 nameserver Cloudflare di atas
   - Save

5. Tunggu **15 menit – 24 jam** sampai propagasi DNS selesai. Cek di:
   ```bash
   dig +short NS secureops.site
   # Output harus tampilkan alex.ns.cloudflare.com dan barb.ns.cloudflare.com
   ```

6. Di Cloudflare dashboard → status domain berubah jadi 🟢 **Active**

### 🅱️ Pilihan B — Pakai DNS Rumahweb langsung (kalau VPS punya IP publik statis)

Cocok kalau:

- Server kamu VPS dengan IP publik dedicated
- Port 80/443 bisa dibuka di firewall VPS
- Gak mau ribet pindah nameserver

**Langkah-langkah:**

1. Login Rumahweb client area → **Manage** domain `secureops.site`
2. Cari menu **DNS Management** atau **Zone Editor**
3. Tambah record:
   ```
   Type:  A
   Name:  @
   Value: <IP publik VPS kamu>
   TTL:   300
   ```
4. Tambah lagi:
   ```
   Type:  A
   Name:  www
   Value: <IP publik VPS kamu>
   TTL:   300
   ```
5. Save. Tunggu 5-30 menit propagasi.

> 💡 **Rekomendasi: Pilihan A** karena gratis HTTPS + bisa diakses meski di belakang NAT.

---

## Langkah 2.2 — Install Controller di server produksi

```bash
# SSH ke server produksi
ssh user@<ip-server-produksi>

# Update + install git
sudo apt update && sudo apt upgrade -y
sudo apt install -y git

# Clone & install
cd ~
git clone https://github.com/suryaex/secureops.git
cd secureops
sudo SERVER_NAME=secureops.site bash controller/deploy/deploy-prod.sh
```

Tunggu ~5 menit sampai selesai.

---

## Langkah 2.3 — Setup HTTPS

### Kalau pakai Pilihan A (Cloudflare Tunnel):

```bash
# Install cloudflared
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Authenticate — browser kebuka, pilih secureops.site, Authorize
cloudflared tunnel login

# Buat tunnel
cloudflared tunnel create secureops
# COPY UUID YANG MUNCUL, misalnya: 7a3b9c1d-8e6f-4a2b-9c5d-1e3f7a8b9c0d

# Setup config
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/*.json /etc/cloudflared/
sudo cp ~/secureops/controller/deploy/cloudflared-config.yml /etc/cloudflared/config.yml

# Edit config — ganti UUID dan domain
sudo nano /etc/cloudflared/config.yml
```

Isi `config.yml`:

```yaml
tunnel: 7a3b9c1d-8e6f-4a2b-9c5d-1e3f7a8b9c0d   # ← ganti dengan UUID kamu
credentials-file: /etc/cloudflared/7a3b9c1d-8e6f-4a2b-9c5d-1e3f7a8b9c0d.json

ingress:
  - hostname: secureops.site
    service: http://127.0.0.1:80
    originRequest:
      connectTimeout: 30s
      tcpKeepAlive: 30s
      keepAliveTimeout: 90s
      noTLSVerify: true
      http2Origin: false
  - service: http_status:404
```

Save (Ctrl+O, Enter, Ctrl+X), lalu:

```bash
# Routing DNS Cloudflare otomatis ke tunnel
cloudflared tunnel route dns secureops secureops.site

# Buat service user
sudo useradd --system --no-create-home --shell /usr/sbin/nologin cloudflared
sudo chown -R cloudflared:cloudflared /etc/cloudflared

# Install systemd service
sudo cp ~/secureops/controller/deploy/secureops-cloudflared.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now secureops-cloudflared
sudo systemctl status secureops-cloudflared
```

**Test**: buka browser → `https://secureops.site` → harus muncul SecureOps dengan gembok HTTPS 🔒

### Kalau pakai Pilihan B (Let's Encrypt):

```bash
# Pastikan DNS sudah propagate
dig +short A secureops.site
# Output harus IP server kamu

# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Issue SSL certificate
sudo certbot --nginx -d secureops.site -d www.secureops.site
# Saat ditanya:
#   Email: <email kamu>
#   Agree to TOS: y
#   Share email with EFF: n (terserah)
#   Redirect HTTP to HTTPS: 2 (pilih 2 untuk auto-redirect)
```

**Test**: `https://secureops.site` — harus jalan dengan HTTPS 🔒

Sertifikat auto-renew tiap 60 hari (systemd timer `certbot.timer`).

---

## Langkah 2.4 — Update CORS untuk domain produksi

```bash
sudo nano /etc/systemd/system/secureops-backend.service
```

Ubah baris CORS jadi:

```ini
Environment="SECUREOPS_CORS_ORIGINS=https://secureops.site,capacitor://localhost"
```

Save, lalu:

```bash
sudo systemctl daemon-reload
sudo systemctl restart secureops-backend
```

---

## Langkah 2.5 — Install agent di setiap server produksi

Untuk setiap server fisik / VPS yang mau dimonitor, ulangi pola yang sama seperti **Langkah 1.4** tapi dengan server asli:

**1. Di browser**: Login ke `https://secureops.site` sebagai admin → Servers → Add Server → copy API key

**2. Di server target**:

```bash
# Install Tailscale (kalau server di lokasi berbeda dari controller)
curl -fsSL https://tailscale.com/install.sh | sudo sh
sudo tailscale up

# Buat user shell terbatas
sudo useradd -m -s /bin/bash secureops

# Install agent dengan production options
sudo SECUREOPS_AGENT_KEY=<key-dari-UI> \
     SECUREOPS_SHELL_USER=secureops \
     SECUREOPS_RECORD_SESSIONS=1 \
     bash <(curl -fsSL https://raw.githubusercontent.com/suryaex/secureops/main/agent/deploy/install.sh)

# Catat Tailscale IP yang muncul di output terakhir
```

**3. Kembali ke browser**:

- Servers → edit row yang baru → isi API URL: `http://<tailscale-ip>:8001` → Save
- Klik ping → 🟢

---

## Langkah 2.6 — Setup user akses untuk tim

Login sebagai admin (kamu sendiri lewat akun Linux), lalu:

**Untuk anggota tim yang butuh full access:**

- Pastikan mereka sudah punya akun Linux di server **controller**:
  ```bash
  sudo useradd -m -s /bin/bash budi
  sudo passwd budi
  ```
- Tambahkan ke group sudo: `sudo usermod -aG sudo budi`
- Mereka login pakai username + password Linux mereka → otomatis admin role

**Untuk auditor (read-only):**

- Bisa buat user OS biasa tanpa grup sudo, ATAU
- Sidebar **Users** → **Add New User** → role `auditor`

---

# 🛠️ Day-2 Operations (Setelah Live)

## Backup database

Database SQLite ada di `/home/<user>/secureops/controller/backend/secureops.db`. Backup harian:

```bash
sudo crontab -e

# Tambah baris ini (backup tiap jam 2 pagi):
0 2 * * * cp /home/superadmin/secureops/controller/backend/secureops.db /var/backups/secureops-$(date +\%Y\%m\%d).db
```

## Cek log

```bash
# Backend
sudo journalctl -u secureops-backend -f

# Nginx
sudo journalctl -u nginx -f
sudo tail -f /var/log/nginx/secureops.access.log

# Cloudflare Tunnel
sudo journalctl -u secureops-cloudflared -f

# Agent di server lain
sudo journalctl -u secureops-agent -f
```

## Update versi baru

Setiap kali ada update di GitHub:

**Di controller:**

```bash
cd ~/secureops
git pull
sudo bash controller/deploy/deploy-prod.sh
```

**Di setiap agent:**

```bash
sudo git -C /opt/secureops-agent pull
sudo /opt/secureops-agent/agent/backend/venv/bin/pip install -r /opt/secureops-agent/agent/backend/requirements.txt
sudo systemctl restart secureops-agent
```

## Reset password user DB (bukan PAM)

Sidebar **Users** → klik icon 🔑 → masukkan password baru → Save.

## Hapus agent dari fleet

1. UI **Servers** → klik 🗑 → konfirmasi
2. Di server agent:
   ```bash
   sudo systemctl disable --now secureops-agent
   sudo rm -rf /opt/secureops-agent
   ```

---

# 🚨 Troubleshooting Cepat

| Gejala | Solusi |
|---|---|
| `502 Bad Gateway` di browser | `sudo systemctl restart secureops-backend nginx` |
| `error: externally-managed-environment` saat pip | Installer udah pakai venv — pastikan jalanin `bash controller/deploy/deploy-prod.sh` bukan pip manual |
| Ubuntu 24.04: `certbot` tidak ada di apt | Pakai snap: `sudo snap install --classic certbot && sudo ln -sf /snap/bin/certbot /usr/bin/certbot` |
| Warning "trapped: error reading bcrypt version" | Sudah ditekan otomatis di v1.4+. Update repo: `git pull && bash controller/deploy/deploy-prod.sh` |
| Login gagal: "Invalid Linux username or password" | Pastikan user-nya ada di controller server (`getent passwd <user>`). Backend harus run as root (cek `systemctl status` "User=root") |
| Agent merah / offline | Cek `tailscale status` di kedua side. Test: `curl -H "X-Agent-Key: <key>" http://<tailscale-ip>:8001/api/health` |
| Terminal disconnect setelah 100 detik (Cloudflare) | Free plan limit. Solusi: keep typing OR upgrade ke Pro OR pakai Let's Encrypt langsung |
| Cloudflare error 1033 | Tunnel daemon mati: `sudo systemctl restart secureops-cloudflared` |
| HTTPS error "certificate not valid" | Tunggu 5-10 menit setelah `certbot`. Pastikan DNS udah propagate (`dig secureops.site`) |
| Sudoers kosong di Sudo Monitor | Agent harus run as root supaya bisa baca `/etc/sudoers`. Pastikan systemd unit `User=root` |
| Recording kosong | Pastikan `SECUREOPS_RECORD_SESSIONS=1` di systemd agent. Cek folder ada: `ls /var/log/secureops/sessions/` |

---

# ✅ Checklist Final Production

Setelah semua selesai, pastikan ini semua centang:

- [ ] `https://secureops.site` bisa diakses dari internet
- [ ] HTTPS aktif (gembok hijau di browser)
- [ ] Login pakai akun Linux server controller berhasil
- [ ] Semua agent server muncul 🟢 online di Servers
- [ ] Top-bar selector bisa pindah-pindah server
- [ ] Halaman Fleet menampilkan grid semua server dengan metrics live
- [ ] Live Terminal jalan ke agent — output `whoami` adalah `secureops`, bukan `root`
- [ ] Recording sesi muncul di Replays setelah disconnect
- [ ] Activity Logs catat semua login + Terminal Open/Close
- [ ] Download Report menghasilkan file HTML lengkap
- [ ] PWA bisa di-install di HP via "Add to Home Screen"
- [ ] Cron backup database aktif (`sudo crontab -l`)

Kalau semua centang → **production ready** ✅

---

# 📞 Catatan Tambahan

## Domain belum ter-route?

Cek DNS-nya:

- Pilihan A (Cloudflare): https://dnschecker.org/#NS/secureops.site
- Pilihan B (Rumahweb langsung): https://dnschecker.org/#A/secureops.site

## Mau monitoring 10+ server sekaligus?

Pakai loop installer di laptop kamu:

```bash
KEY="<paste-shared-API-key-disini>"
for ip in 100.64.10.5 100.64.10.12 100.64.10.18; do
  ssh root@$ip "SECUREOPS_AGENT_KEY=$KEY \
                SECUREOPS_SHELL_USER=secureops \
                bash <(curl -fsSL https://raw.githubusercontent.com/suryaex/secureops/main/agent/deploy/install.sh)"
done
```

> ⚠️ Setiap server tetap perlu API key **unik** sebenarnya — generate satu per satu dari UI agar bisa di-rotate/revoke per-server.

## Mau push notif alert ke Telegram/Slack?

Belum di-build di v1.4, tapi mudah ditambah di `controller/backend/routers/system.py` pada endpoint `system_alerts`. Kabari saya kalau perlu.

## Mau backup ke storage eksternal?

Gampang — pakai `rclone` dengan provider Google Drive / Backblaze / S3:

```bash
sudo apt install -y rclone
rclone config   # ikuti wizard
# Lalu di crontab:
0 3 * * * rclone copy /var/backups/secureops-$(date +\%Y\%m\%d).db remote:secureops-backups/
```

---

**Selamat coba di VM dulu!** 🚀

Kalau ada step yang stuck atau error, copy-paste output error-nya — saya bantu debug.

---

*Dokumen ini bagian dari project SecureOps v1.4 · State Polytechnic of Sriwijaya · Last updated: 2026-05-15*
