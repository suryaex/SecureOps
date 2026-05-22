# SecureOps Agent - Windows Installer
# Supports: Windows 10 (1809+), Windows 11, Windows Server 2019/2022
# Runs cleanly via `iwr ... | iex` OR `.\install.ps1` standalone.

# CRITICAL: don't use 'Stop' globally - native commands (nssm) write to stderr
# routinely and we don't want to terminate on warnings. Use try/catch per-call.
$ErrorActionPreference = 'Continue'

# ============================== CONFIG ==============================
$InstallDir    = "C:\Program Files\SecureOps-Agent"
$ServiceName   = "SecureOps-Agent"
$Port          = if ($env:SECUREOPS_AGENT_PORT)         { $env:SECUREOPS_AGENT_PORT }         else { "8001" }
$RecordSess    = if ($env:SECUREOPS_RECORD_SESSIONS)    { $env:SECUREOPS_RECORD_SESSIONS }    else { "0" }
$AgentKey      = $env:SECUREOPS_AGENT_KEY
$JoinToken     = $env:SECUREOPS_JOIN_TOKEN
$ControllerURL = $env:SECUREOPS_CONTROLLER_URL
$RepoURL       = "https://github.com/suryaex/secureops.git"

# ConfigDir: prefer PROGRAMDATA, fallback ke C:\ProgramData
$pgmData = $env:PROGRAMDATA
if ([string]::IsNullOrWhiteSpace($pgmData)) { $pgmData = "C:\ProgramData" }
$ConfigDir = Join-Path $pgmData "SecureOps-Agent"

# ============================== HELPERS ==============================
function Say  { param($msg) Write-Host "==> $msg" -ForegroundColor Green }
function Info { param($msg) Write-Host "  $msg" -ForegroundColor Cyan }
function Warn { param($msg) Write-Host "!!  $msg" -ForegroundColor Yellow }
function Die  { param($msg) Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# Wrap native commands so stderr doesn't crash the script.
function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments)
    try {
        $output = & $Exe @Arguments 2>&1 | Out-String
        return @{ Output = $output; ExitCode = $LASTEXITCODE; Success = ($LASTEXITCODE -eq 0) }
    } catch {
        return @{ Output = $_.Exception.Message; ExitCode = -1; Success = $false }
    }
}

# ============================== ADMIN CHECK ==============================
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Die "Must run as Administrator. Right-click PowerShell -> Run as Administrator."
}

# ============================== OS CHECK ==============================
try {
    $os = Get-CimInstance Win32_OperatingSystem
    Say "Detected: $($os.Caption) build $($os.BuildNumber)"
    if ([int]$os.BuildNumber -lt 17763) {
        Die "Need Windows 10 build 1809+ or Server 2019+"
    }
} catch {
    Warn "Could not detect OS version: $($_.Exception.Message)"
}

# ============================== AGENT KEY ==============================
if ([string]::IsNullOrWhiteSpace($AgentKey)) {
    # CRITICAL: gunakan ONLY alphanumeric (a-z, A-Z, 0-9) supaya safe di URL
    # query string. GeneratePassword(43,8) bisa hasilkan '#&+=' yang break URL parsing.
    $AgentKey = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 43 | ForEach-Object { [char]$_ })
    Warn "SECUREOPS_AGENT_KEY not set - auto-generated"
}

# ============================== PYTHON ==============================
# Cari Python 3.12 atau 3.13. Skip 3.14+ karena banyak wheel belum tersedia.
$PreferredPyVersions = @("3.12", "3.13")
$PythonExe = $null

# Cara 1: py launcher
$pyLauncher = Get-Command py -ErrorAction SilentlyContinue
if ($pyLauncher) {
    foreach ($v in $PreferredPyVersions) {
        try {
            $check = & py "-$v" --version 2>&1
            if ($LASTEXITCODE -eq 0) {
                $PythonExe = (& py "-$v" -c "import sys; print(sys.executable)" 2>$null).Trim()
                if (-not [string]::IsNullOrWhiteSpace($PythonExe)) {
                    Info "Found via py launcher: $check ($PythonExe)"
                    break
                }
            }
        } catch {}
    }
}

# Cara 2: python.exe direct (cek versinya 3.10-3.13)
if ([string]::IsNullOrWhiteSpace($PythonExe)) {
    $directPy = Get-Command python -ErrorAction SilentlyContinue
    if ($directPy) {
        try {
            $verStr = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
            if ($verStr -and $verStr -match "^3\.(10|11|12|13)$") {
                $PythonExe = $directPy.Source
                Info "Found Python: $verStr ($PythonExe)"
            }
        } catch {}
    }
}

# Cara 3: install Python 3.12 baru
if ([string]::IsNullOrWhiteSpace($PythonExe)) {
    Say "Python 3.10-3.13 not found - installing Python 3.12.7..."
    $pyInstaller = Join-Path $env:TEMP "python-3.12.7.exe"
    try {
        Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe" `
                          -OutFile $pyInstaller -UseBasicParsing -ErrorAction Stop
    } catch {
        Die "Failed to download Python 3.12.7: $($_.Exception.Message)"
    }
    Start-Process $pyInstaller -Wait -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_launcher=1"
    Remove-Item $pyInstaller -Force -ErrorAction SilentlyContinue
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + `
                [System.Environment]::GetEnvironmentVariable("Path", "User")
    # Try lagi
    try {
        $check = & py "-3.12" --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $PythonExe = (& py "-3.12" -c "import sys; print(sys.executable)" 2>$null).Trim()
        }
    } catch {}
    if ([string]::IsNullOrWhiteSpace($PythonExe)) {
        Die "Python 3.12 installation failed."
    }
}

Info "Will use Python: $PythonExe"

# ============================== GIT ==============================
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Say "Git not found - installing Git for Windows..."
    $gitInstaller = Join-Path $env:TEMP "git-installer.exe"
    try {
        Invoke-WebRequest -Uri "https://github.com/git-for-windows/git/releases/download/v2.46.0.windows.1/Git-2.46.0-64-bit.exe" `
                          -OutFile $gitInstaller -UseBasicParsing -ErrorAction Stop
        Start-Process $gitInstaller -Wait -ArgumentList "/VERYSILENT /NORESTART"
        Remove-Item $gitInstaller -Force -ErrorAction SilentlyContinue
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    } catch {
        Die "Failed to install Git: $($_.Exception.Message)"
    }
}

# ============================== CLONE/PULL REPO ==============================
if (Test-Path (Join-Path $InstallDir ".git")) {
    Say "Updating existing install at $InstallDir..."
    Invoke-Native "git" @("-C", $InstallDir, "pull", "--ff-only") | Out-Null
} else {
    Say "Cloning repo to $InstallDir..."
    if (Test-Path $InstallDir) {
        Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    $r = Invoke-Native "git" @("clone", "--depth", "1", $RepoURL, $InstallDir)
    if (-not $r.Success) { Die "git clone failed: $($r.Output)" }
}

# ============================== PYTHON VENV ==============================
$BackendDir = Join-Path $InstallDir "agent-windows\backend"
$VenvDir    = Join-Path $BackendDir "venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip    = Join-Path $VenvDir "Scripts\pip.exe"

if (Test-Path $VenvDir) {
    Say "Removing existing venv..."
    Remove-Item $VenvDir -Recurse -Force -ErrorAction SilentlyContinue
}

Say "Setting up Python venv with $PythonExe..."
$r = Invoke-Native $PythonExe @("-m", "venv", $VenvDir)
if (-not (Test-Path $VenvPython)) {
    Die "venv creation failed: $($r.Output)"
}

try {
    $venvVer = & $VenvPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
    Info "Venv Python: $venvVer"
} catch {}

Say "Installing core dependencies (fastapi, uvicorn, psutil, websockets, etc.)..."
Invoke-Native $VenvPython @("-m", "pip", "install", "--quiet", "--upgrade", "pip", "setuptools", "wheel") | Out-Null
$r = Invoke-Native $VenvPip @("install", "--quiet", "-r", (Join-Path $BackendDir "requirements.txt"))
if (-not $r.Success) {
    Die "Failed to install core dependencies. Check Python + internet. Output: $($r.Output)"
}

# pywinpty optional - kalau gagal, terminal feature disabled tapi sisanya jalan.
Say "Installing pywinpty for terminal feature (optional)..."
$pywinptyOK = $false
$r = Invoke-Native $VenvPip @("install", "--quiet", "pywinpty")
if ($r.Success) {
    $pywinptyOK = $true
    Info "pywinpty installed - terminal feature enabled"
} else {
    Warn "pywinpty install failed - terminal feature DISABLED"
    Warn "Common cause: Python 3.14 has no pre-built wheel yet."
    Warn "Other features (system health, audit, sudo, FIM) tetap berfungsi."
}

# ============================== SAVE KEY ==============================
New-Item -ItemType Directory -Path $ConfigDir -Force -ErrorAction SilentlyContinue | Out-Null
$KeyFile = Join-Path $ConfigDir "key"
Set-Content -LiteralPath $KeyFile -Value $AgentKey -Encoding UTF8 -NoNewline

# ACL hardening optional - kalau gagal skip aja (file tetap protected by NTFS default)
try {
    $acl = Get-Acl -LiteralPath $KeyFile
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "BUILTIN\Administrators", "FullControl", "Allow")
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $KeyFile -AclObject $acl
} catch {
    Warn "Could not harden ACL on key file (non-fatal): $($_.Exception.Message)"
}

# ============================== NSSM ==============================
$NssmDir = Join-Path $InstallDir "nssm"
$NssmExe = Join-Path $NssmDir "win64\nssm.exe"

# Cek bundled NSSM dari repo dulu (kalau ada)
if (-not (Test-Path $NssmExe)) {
    $bundledPath = Join-Path $InstallDir "agent-windows\deploy\bundled\nssm.exe"
    if (Test-Path $bundledPath) {
        Say "Using bundled NSSM from $bundledPath..."
        $win64Dir = Join-Path $NssmDir "win64"
        New-Item -ItemType Directory -Path $win64Dir -Force -ErrorAction SilentlyContinue | Out-Null
        Copy-Item -LiteralPath $bundledPath -Destination $NssmExe -Force
        Info "NSSM ready (bundled)"
    }
}

# Kalau bundled gak ada, download dari mirror
if (-not (Test-Path $NssmExe)) {
    Say "Downloading NSSM (service manager)..."
    $NssmMirrors = @(
        "https://github.com/suryaex/secureops/releases/download/nssm-2.24/nssm-2.24.zip",
        "https://nssm.cc/release/nssm-2.24.zip",
        "https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip"
    )
    $nssmZip = Join-Path $env:TEMP "nssm.zip"
    $downloaded = $false

    foreach ($url in $NssmMirrors) {
        for ($attempt = 1; $attempt -le 2; $attempt++) {
            try {
                Info "Mirror: $url (attempt $attempt/2)"
                Invoke-WebRequest -Uri $url -OutFile $nssmZip -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
                $size = (Get-Item -LiteralPath $nssmZip -ErrorAction SilentlyContinue).Length
                if ($size -and $size -gt 100000) {
                    $downloaded = $true
                    Info "NSSM downloaded ($size bytes)"
                    break
                } else {
                    Warn "Downloaded file too small, retrying..."
                    Remove-Item -LiteralPath $nssmZip -Force -ErrorAction SilentlyContinue
                }
            } catch {
                Warn "Mirror failed: $($_.Exception.Message)"
                Start-Sleep -Seconds 2
            }
        }
        if ($downloaded) { break }
    }

    if (-not $downloaded) {
        # Fallback: system-wide nssm (e.g. dari Chocolatey)
        $sysNssm = Get-Command nssm -ErrorAction SilentlyContinue
        if ($sysNssm) {
            Info "Using system-installed NSSM at $($sysNssm.Source)"
            $win64Dir = Join-Path $NssmDir "win64"
            New-Item -ItemType Directory -Path $win64Dir -Force -ErrorAction SilentlyContinue | Out-Null
            Copy-Item -LiteralPath $sysNssm.Source -Destination $NssmExe -Force
        } else {
            Write-Host ""
            Write-Host "Cannot download NSSM. Workaround:" -ForegroundColor Yellow
            Write-Host "  1. Install Chocolatey: https://chocolatey.org/install"
            Write-Host "  2. choco install nssm -y"
            Write-Host "  3. Re-run this installer"
            Die "NSSM download failed from all mirrors."
        }
    } else {
        # Extract zip
        try {
            Expand-Archive -LiteralPath $nssmZip -DestinationPath $NssmDir -Force -ErrorAction Stop
            # Cari nssm.exe yg di-extract dan move ke $NssmExe
            if (-not (Test-Path $NssmExe)) {
                $found = Get-ChildItem -LiteralPath $NssmDir -Recurse -Filter "nssm.exe" -ErrorAction SilentlyContinue |
                         Where-Object { $_.Directory.Name -eq "win64" } | Select-Object -First 1
                if ($found) {
                    $win64Dir = Join-Path $NssmDir "win64"
                    New-Item -ItemType Directory -Path $win64Dir -Force -ErrorAction SilentlyContinue | Out-Null
                    Copy-Item -LiteralPath $found.FullName -Destination $NssmExe -Force
                }
            }
            Remove-Item -LiteralPath $nssmZip -Force -ErrorAction SilentlyContinue
        } catch {
            Die "Failed to extract NSSM zip: $($_.Exception.Message)"
        }

        if (-not (Test-Path $NssmExe)) {
            Die "NSSM extracted but nssm.exe tidak ditemukan di expected path."
        }
        Info "NSSM ready at $NssmExe"
    }
}

# ============================== INSTALL SERVICE ==============================
Say "Installing Windows Service: $ServiceName..."

# Stop & remove existing (with tolerance)
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Info "Existing service found - stopping and removing..."
    Invoke-Native $NssmExe @("stop", $ServiceName) | Out-Null
    Start-Sleep -Seconds 1
    Invoke-Native $NssmExe @("remove", $ServiceName, "confirm") | Out-Null
    Start-Sleep -Seconds 2
}

$UvicornExe = Join-Path $VenvDir "Scripts\uvicorn.exe"
$SvcArgs    = "main:app --host 0.0.0.0 --port $Port"

$r = Invoke-Native $NssmExe @("install", $ServiceName, $UvicornExe, $SvcArgs)
if (-not $r.Success) { Die "NSSM install failed: $($r.Output)" }

# Config (each call wrapped, errors warn-only)
$nl = [Environment]::NewLine
$EnvBlock = "SECUREOPS_AGENT_KEY=$AgentKey" + $nl + `
            "SECUREOPS_RECORD_SESSIONS=$RecordSess" + $nl + `
            "SECUREOPS_RECORD_DIR=$ConfigDir\sessions" + $nl + `
            "PYTHONUNBUFFERED=1" + $nl + `
            "PYTHONIOENCODING=utf-8"

$StdoutLog = Join-Path $ConfigDir "service-stdout.log"
$StderrLog = Join-Path $ConfigDir "service-stderr.log"

$nssmConfig = @(
    @("set", $ServiceName, "AppDirectory", $BackendDir),
    @("set", $ServiceName, "DisplayName", "SecureOps Agent"),
    @("set", $ServiceName, "Description", "SecureOps Agent - Centralized security monitoring"),
    @("set", $ServiceName, "Start", "SERVICE_AUTO_START"),
    @("set", $ServiceName, "AppEnvironmentExtra", $EnvBlock),
    @("set", $ServiceName, "AppStdout", $StdoutLog),
    @("set", $ServiceName, "AppStderr", $StderrLog),
    @("set", $ServiceName, "AppRotateFiles", "1"),
    @("set", $ServiceName, "AppRotateBytes", "10485760"),
    @("set", $ServiceName, "AppExit", "Default", "Restart"),
    @("set", $ServiceName, "AppRestartDelay", "5000")
)

foreach ($cfg in $nssmConfig) {
    $r = Invoke-Native $NssmExe $cfg
    if (-not $r.Success) {
        Warn "NSSM config '$($cfg[2])' failed (non-fatal): $($r.Output.Trim())"
    }
}

# ============================== FIREWALL ==============================
Say "Adding Windows Firewall rule for port $Port..."
$ruleName = "SecureOps-Agent Port $Port"
try {
    Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $ruleName `
        -Direction Inbound -Protocol TCP -LocalPort $Port `
        -Action Allow -Profile Domain,Private,Public `
        -Description "SecureOps Agent HTTP API" -ErrorAction Stop | Out-Null
    Info "Firewall rule added"
} catch {
    Warn "Firewall rule failed: $($_.Exception.Message) (non-fatal)"
}

# ============================== START SERVICE ==============================
Say "Starting service..."
try {
    Start-Service -Name $ServiceName -ErrorAction Stop
} catch {
    Warn "Start-Service failed, trying NSSM start..."
    Invoke-Native $NssmExe @("start", $ServiceName) | Out-Null
}
Start-Sleep -Seconds 3

# ============================== HEALTH CHECK ==============================
Say "Waiting for agent to become healthy..."
$healthy = $false
for ($i = 1; $i -le 15; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" `
                                  -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $healthy = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}

if ($healthy) {
    Info "Agent healthy after ${i}s"
} else {
    Warn "Agent did not become healthy. Check logs:"
    Warn "  Get-Content '$StderrLog' -Tail 30"
}

# ============================== AUTO-REGISTER ==============================
$PrimaryIP = (Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp,Manual -ErrorAction SilentlyContinue |
              Where-Object { $_.IPAddress -notmatch '^(169\.254|127\.)' } |
              Select-Object -First 1).IPAddress
if ([string]::IsNullOrWhiteSpace($PrimaryIP)) { $PrimaryIP = "127.0.0.1" }

$AutoRegistered = $false
if (-not [string]::IsNullOrWhiteSpace($JoinToken) -and -not [string]::IsNullOrWhiteSpace($ControllerURL)) {
    Say "Auto-registering with controller at $ControllerURL ..."
    $payload = @{
        token    = $JoinToken
        hostname = $env:COMPUTERNAME
        api_url  = "http://${PrimaryIP}:$Port"
        api_key  = $AgentKey
    } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-WebRequest -Uri "$ControllerURL/api/servers/auto-register" `
                                  -Method POST -Body $payload `
                                  -ContentType "application/json" `
                                  -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        Info "Auto-registration response: $($resp.Content)"
        $AutoRegistered = $true
    } catch {
        Warn "Auto-registration failed: $($_.Exception.Message)"
    }
}

# ============================== SUMMARY ==============================
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  SecureOps Agent for Windows - Installed Successfully  " -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  OS:           $($os.Caption)"
Write-Host "  Hostname:     $env:COMPUTERNAME"
$serviceStatus = (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue).Status
Write-Host "  Service:      $ServiceName (status: $serviceStatus)"
Write-Host "  IP:           $PrimaryIP"
Write-Host "  Port:         $Port"
if ($pywinptyOK) {
    Write-Host "  Terminal:     ENABLED" -ForegroundColor Green
} else {
    Write-Host "  Terminal:     DISABLED (pywinpty failed - sisanya jalan normal)" -ForegroundColor Yellow
}
Write-Host ""
if ($AutoRegistered) {
    Write-Host "  AUTO-REGISTERED WITH CONTROLLER" -ForegroundColor Green
    Write-Host "  No further action needed!" -ForegroundColor Green
} else {
    Write-Host "  PASTE THESE TO THE CONTROLLER UI:" -ForegroundColor Yellow
    Write-Host "    API URL :  http://${PrimaryIP}:$Port" -ForegroundColor Cyan
    Write-Host "    API Key :  $AgentKey" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "  Logs:"
Write-Host "    Get-Content '$StdoutLog' -Tail 30 -Wait"
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
