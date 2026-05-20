# SecureOps Agent - Windows Installer
#
# Usage (PowerShell as Administrator):
#   $env:SECUREOPS_AGENT_KEY = "<paste-key-from-controller-UI>"
#   iwr "https://secureops.site/api/servers/install-script/<token>?os=windows" -UseBasicParsing | iex
#
# Or download then run:
#   iwr "https://raw.githubusercontent.com/suryaex/secureops/main/agent-windows/deploy/install.ps1" -OutFile install.ps1
#   .\install.ps1
#
# Supported OS: Windows 10 (1809+), Windows 11, Windows Server 2019/2022

# Note: Admin check happens in the bootstrap prefix from controller.
# When running install.ps1 standalone, uncomment this:
# #Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

# ============================== CONFIG ==============================
$InstallDir    = "C:\Program Files\SecureOps-Agent"
$ServiceName   = "SecureOps-Agent"
$Port          = if ($env:SECUREOPS_AGENT_PORT) { $env:SECUREOPS_AGENT_PORT } else { 8001 }
$AgentKey      = $env:SECUREOPS_AGENT_KEY
$JoinToken     = $env:SECUREOPS_JOIN_TOKEN
$ControllerURL = $env:SECUREOPS_CONTROLLER_URL
$RecordSess    = if ($env:SECUREOPS_RECORD_SESSIONS) { $env:SECUREOPS_RECORD_SESSIONS } else { "0" }
$RepoURL       = "https://github.com/suryaex/secureops.git"
$ConfigDir     = "$env:PROGRAMDATA\SecureOps-Agent"

# ============================== HELPERS ==============================
function Say  { param($msg) Write-Host "==> $msg" -ForegroundColor Green }
function Info { param($msg) Write-Host "  $msg" -ForegroundColor Cyan }
function Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Die  { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

# ============================== OS CHECK ==============================
$os = Get-CimInstance Win32_OperatingSystem
Say "Detected: $($os.Caption) build $($os.BuildNumber)"

if ([int]$os.BuildNumber -lt 17763) {
    Die "Windows 10 build 1809+ or Windows Server 2019+ required for ConPTY support"
}

# Auto-generate key if not set
if (-not $AgentKey) {
    Add-Type -AssemblyName System.Web
    $AgentKey = [System.Web.Security.Membership]::GeneratePassword(43, 8)
    Warn "SECUREOPS_AGENT_KEY not set - auto-generated"
}

# ============================== PYTHON ==============================
# Cari Python 3.10-3.13 (paling stabil + semua wheel tersedia).
# Hindari Python 3.14+ karena banyak package belum punya pre-built wheel.
# Semua operasi di-wrap try/catch supaya stderr dari py.exe gak terminate script.

$PreferredPyVersions = @("3.13", "3.12", "3.11", "3.10")
$PythonExe = $null

function Test-PythonExe([string]$ExePath) {
    if (-not (Test-Path $ExePath)) { return $null }
    try {
        $ver = & $ExePath -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>&1
        if ($LASTEXITCODE -eq 0 -and $ver -match "^3\.(10|11|12|13)$") {
            return $ver.Trim()
        }
    } catch {}
    return $null
}

# Cara 1: Cek path standard tempat installer Python masuk
$standardPaths = @(
    "C:\Python313\python.exe",
    "C:\Python312\python.exe",
    "C:\Python311\python.exe",
    "C:\Python310\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe"
)
foreach ($p in $standardPaths) {
    $ver = Test-PythonExe $p
    if ($ver) {
        $PythonExe = $p
        Info "Found Python $ver at $p"
        break
    }
}

# Cara 2: py launcher with --list (cek apa yang ter-install)
if (-not $PythonExe) {
    try {
        $pyAvailable = @()
        # py --list selalu sukses kalau py launcher ada; output ke stderr
        $listRaw = (& py --list 2>&1) -join "`n"
        foreach ($line in $listRaw -split "`r?`n") {
            if ($line -match "-V:(\d+\.\d+)") {
                $pyAvailable += $matches[1]
            }
        }
        Info "py launcher Pythons: $($pyAvailable -join ', ')"

        foreach ($v in $PreferredPyVersions) {
            if ($pyAvailable -contains $v) {
                $candidate = (& py "-$v" -c "import sys; print(sys.executable)" 2>&1).Trim()
                if ((Test-PythonExe $candidate)) {
                    $PythonExe = $candidate
                    Info "Found via py launcher: Python $v at $candidate"
                    break
                }
            }
        }
    } catch {
        # py launcher gagal — skip ke cara 3
    }
}

# Cara 3: direct python.exe di PATH (cek versinya)
if (-not $PythonExe) {
    try {
        $directPy = (Get-Command python -ErrorAction Stop).Source
        $ver = Test-PythonExe $directPy
        if ($ver) {
            $PythonExe = $directPy
            Info "Found python.exe in PATH: Python $ver at $directPy"
        } else {
            Warn "python.exe found but version not compatible (need 3.10-3.13). Will install Python 3.12."
        }
    } catch {
        # python.exe tidak di PATH
    }
}

# Cara 4: install Python 3.12 manual
if (-not $PythonExe) {
    Say "Compatible Python (3.10-3.13) tidak ditemukan - installing Python 3.12.7..."
    $pyInstaller = Join-Path $env:TEMP "python-3.12.7-installer.exe"
    try {
        Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe" `
                          -OutFile $pyInstaller -UseBasicParsing -TimeoutSec 120
    } catch {
        Die "Gagal download Python 3.12.7 installer: $_"
    }

    Say "Running Python installer (silent, all users, +PATH, +launcher)..."
    # InstallAllUsers=1 → C:\Python312 (system-wide)
    # PrependPath=1     → add to PATH
    # Include_launcher=1 → register py launcher
    # Include_test=0    → skip test suite (smaller)
    $proc = Start-Process $pyInstaller -Wait -PassThru -ArgumentList @(
        "/quiet", "InstallAllUsers=1", "PrependPath=1",
        "Include_launcher=1", "Include_test=0", "SimpleInstall=1"
    )
    Remove-Item $pyInstaller -Force -ErrorAction SilentlyContinue

    if ($proc.ExitCode -ne 0) {
        Die "Python 3.12.7 installer exited dengan code $($proc.ExitCode). Install manually dari https://www.python.org/downloads/release/python-3127/"
    }

    # Refresh PATH dalam current PowerShell session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")

    # Cek apakah Python 3.12 sekarang ada
    $candidate = "C:\Python312\python.exe"
    $ver = Test-PythonExe $candidate
    if ($ver) {
        $PythonExe = $candidate
        Info "Successfully installed Python $ver at $candidate"
    } else {
        Die "Python 3.12 ke-install tapi C:\Python312\python.exe tidak ditemukan. Coba restart PowerShell dan jalankan installer lagi."
    }
}

Info "Will use Python: $PythonExe"

# ============================== GIT ==============================
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Say "Git not found - installing Git for Windows..."
    $gitInstaller = "$env:TEMP\git-installer.exe"
    Invoke-WebRequest -Uri "https://github.com/git-for-windows/git/releases/download/v2.46.0.windows.1/Git-2.46.0-64-bit.exe" -OutFile $gitInstaller -UseBasicParsing
    Start-Process $gitInstaller -Wait -ArgumentList "/VERYSILENT /NORESTART"
    Remove-Item $gitInstaller -Force
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
}

# ============================== CLONE/PULL REPO ==============================
if (Test-Path "$InstallDir\.git") {
    Say "Updating existing install at $InstallDir..."
    git -C $InstallDir pull --ff-only
} else {
    Say "Cloning repo to $InstallDir..."
    if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
    git clone --depth 1 $RepoURL $InstallDir
}

# ============================== PYTHON VENV ==============================
$BackendDir = "$InstallDir\agent-windows\backend"
$VenvDir    = "$BackendDir\venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip    = Join-Path $VenvDir "Scripts\pip.exe"

# Buang venv lama kalau ada (mungkin dari Python version berbeda)
if (Test-Path $VenvDir) {
    Say "Removing existing venv..."
    Remove-Item $VenvDir -Recurse -Force
}

Say "Setting up Python venv with $PythonExe..."
& $PythonExe -m venv $VenvDir
if (-not (Test-Path $VenvPython)) {
    Die "Failed to create venv. Python at $PythonExe may be broken."
}

# Verifikasi venv pakai Python yang benar
$venvVer = & $VenvPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
Info "Venv Python: $venvVer"

Say "Installing core dependencies (fastapi, uvicorn, psutil, websockets, etc.)..."
& $VenvPython -m pip install --quiet --upgrade pip setuptools wheel
& $VenvPip install --quiet -r "$BackendDir\requirements.txt"
if ($LASTEXITCODE -ne 0) {
    Die "Failed to install core Python dependencies. Check Python version + internet connection."
}

# pywinpty di-install TERPISAH (optional, hanya untuk fitur terminal).
# Bisa gagal di Python 3.14+ karena belum ada wheel — di-handle gracefully.
Say "Installing pywinpty for terminal feature (optional)..."
$pywinptyOK = $false
try {
    & $VenvPip install --quiet pywinpty 2>$null
    if ($LASTEXITCODE -eq 0) {
        $pywinptyOK = $true
        Info "pywinpty installed - terminal feature enabled"
    }
} catch {}

if (-not $pywinptyOK) {
    Warn "pywinpty install failed - terminal feature will be DISABLED"
    Warn "Common cause: Python 3.14 has no pre-built wheel yet."
    Warn "Other features (system health, audit, sudo, FIM) tetap berfungsi."
    Warn "Untuk enable terminal nanti:"
    Warn "  1. Install Visual Studio Build Tools dengan C++ workload"
    Warn "  2. Jalankan: $VenvPip install pywinpty"
}

# ============================== SAVE KEY ==============================
New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
Set-Content -Path "$ConfigDir\key" -Value $AgentKey -Encoding UTF8 -NoNewline

$acl = Get-Acl "$ConfigDir\key"
$acl.SetAccessRuleProtection($true, $false)
$adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Administrators", "FullControl", "Allow")
$acl.AddAccessRule($adminRule)
Set-Acl "$ConfigDir\key" $acl

# ============================== DOWNLOAD NSSM ==============================
$NssmDir = "$InstallDir\nssm"
$NssmExe = "$NssmDir\win64\nssm.exe"
if (-not (Test-Path $NssmExe)) {
    Say "Downloading NSSM (service manager)..."
    $nssmZip = "$env:TEMP\nssm.zip"
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip -UseBasicParsing
    Expand-Archive -Path $nssmZip -DestinationPath $NssmDir -Force

    $extracted = Get-ChildItem $NssmDir -Directory | Select-Object -First 1
    if ($extracted -and $extracted.Name -ne "win64") {
        Move-Item "$NssmDir\$($extracted.Name)\win64" $NssmDir -Force
        Remove-Item "$NssmDir\$($extracted.Name)" -Recurse -Force
    }
    Remove-Item $nssmZip -Force
}

# ============================== INSTALL SERVICE ==============================
#
# Helper untuk menjalankan native command dan TELAN error sambil tetap track
# exit code. Tanpa ini, native command (NSSM, sc.exe) yang tulis ke stderr akan
# trigger PowerShell RemoteException dan terminate script ($ErrorActionPreference=Stop).
function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments)
    try {
        # Redirect stderr ke stdout, capture semua output, jangan biarkan exception
        $output = & $Exe @Arguments 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
        return @{ Output = $output; ExitCode = $exitCode; Success = ($exitCode -eq 0) }
    } catch {
        return @{ Output = $_.Exception.Message; ExitCode = -1; Success = $false }
    }
}

Say "Installing Windows Service: $ServiceName..."

# Stop & remove kalau service existing (dengan tolerance kalau gak ada)
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Info "Existing service found - stopping and removing..."
    Invoke-Native $NssmExe @("stop", $ServiceName) | Out-Null
    Invoke-Native $NssmExe @("remove", $ServiceName, "confirm") | Out-Null
    Start-Sleep -Seconds 2
}

$uvicornExe = Join-Path $VenvDir "Scripts\uvicorn.exe"
$svcArgs    = "main:app --host 0.0.0.0 --port $Port"

# Install service
$r = Invoke-Native $NssmExe @("install", $ServiceName, $uvicornExe, $svcArgs)
if (-not $r.Success) { Die "NSSM install failed: $($r.Output)" }

# Configure service (semua dengan tolerance — kalau salah satu fail, log saja)
$nssmConfig = @(
    @("set", $ServiceName, "AppDirectory", $BackendDir),
    @("set", $ServiceName, "DisplayName", "SecureOps Agent"),
    @("set", $ServiceName, "Description", "SecureOps Agent - Centralized security monitoring"),
    @("set", $ServiceName, "Start", "SERVICE_AUTO_START")
)

foreach ($cfg in $nssmConfig) {
    $r = Invoke-Native $NssmExe $cfg
    if (-not $r.Success) {
        Warn "NSSM config '$($cfg[2])' returned $($r.ExitCode): $($r.Output.Trim())"
    }
}

# Environment variables for the service
$nl = [Environment]::NewLine
$envBlock = "SECUREOPS_AGENT_KEY=$AgentKey" + $nl +
            "SECUREOPS_RECORD_SESSIONS=$RecordSess" + $nl +
            "SECUREOPS_RECORD_DIR=$ConfigDir\sessions" + $nl +
            "PYTHONUNBUFFERED=1" + $nl +
            "PYTHONIOENCODING=utf-8"
Invoke-Native $NssmExe @("set", $ServiceName, "AppEnvironmentExtra", $envBlock) | Out-Null

# Logs
$stdoutLog = Join-Path $ConfigDir "service-stdout.log"
$stderrLog = Join-Path $ConfigDir "service-stderr.log"
$logConfig = @(
    @("set", $ServiceName, "AppStdout", $stdoutLog),
    @("set", $ServiceName, "AppStderr", $stderrLog),
    @("set", $ServiceName, "AppRotateFiles", "1"),
    @("set", $ServiceName, "AppRotateBytes", "10485760"),
    @("set", $ServiceName, "AppExit", "Default", "Restart"),
    @("set", $ServiceName, "AppRestartDelay", "5000")
)
foreach ($cfg in $logConfig) {
    Invoke-Native $NssmExe $cfg | Out-Null
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
    Warn "Failed to add firewall rule: $($_.Exception.Message)"
    Warn "Manual: New-NetFirewallRule -DisplayName '$ruleName' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow"
}

# ============================== START SERVICE ==============================
Say "Starting service..."
try {
    Start-Service -Name $ServiceName -ErrorAction Stop
    Start-Sleep -Seconds 3
} catch {
    Warn "Start-Service failed: $($_.Exception.Message)"
    Warn "Trying NSSM start instead..."
    Invoke-Native $NssmExe @("start", $ServiceName) | Out-Null
    Start-Sleep -Seconds 3
}

# Wait for service to become healthy
Say "Waiting for agent to become healthy..."
$healthy = $false
for ($i = 1; $i -le 15; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 1
}

if ($healthy) {
    Info "Agent healthy after $i seconds"
} else {
    Warn "Agent not responding yet. Check log: Get-Content $stderrLog -Tail 30"
}

# ============================== AUTO-REGISTER ==============================
$AutoRegistered = $false
$primaryIP = (Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp,Manual -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch "^(169\.254|127\.)" } | Select-Object -First 1).IPAddress
if (-not $primaryIP) {
    $primaryIP = "127.0.0.1"
}

if ($JoinToken -and $ControllerURL) {
    Say "Auto-registering with controller at $ControllerURL ..."

    $payload = @{
        token    = $JoinToken
        hostname = $env:COMPUTERNAME
        api_url  = "http://${primaryIP}:$Port"
        api_key  = $AgentKey
    } | ConvertTo-Json -Compress

    try {
        $resp = Invoke-WebRequest -Uri "$ControllerURL/api/servers/auto-register" -Method POST -Body $payload -ContentType "application/json" -UseBasicParsing -TimeoutSec 10
        Info "Response: $($resp.Content)"
        $AutoRegistered = $true
    } catch {
        Warn "Auto-registration failed: $($_.Exception.Message)"
    }
}

# ============================== SUMMARY ==============================
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  SecureOps Agent for Windows - Installed Successfully" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  OS:           $($os.Caption)" -ForegroundColor White
Write-Host "  Hostname:     $env:COMPUTERNAME" -ForegroundColor White
$svcStatus = (Get-Service $ServiceName).Status
Write-Host "  Service:      $ServiceName (status: $svcStatus)" -ForegroundColor White
Write-Host "  IP:           $primaryIP" -ForegroundColor White
Write-Host "  Port:         $Port" -ForegroundColor White
Write-Host ""

if ($AutoRegistered) {
    Write-Host "  [SUCCESS] AUTO-REGISTERED WITH CONTROLLER" -ForegroundColor Green
    Write-Host "     Controller: $ControllerURL" -ForegroundColor White
    Write-Host "     No further action needed - agent is online!" -ForegroundColor Green
} else {
    Write-Host "  PASTE THESE TO THE CONTROLLER UI:" -ForegroundColor Yellow
    Write-Host "  (Sidebar -> Servers -> Add Server -> Manual Entry)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "     API URL :  http://${primaryIP}:$Port" -ForegroundColor Cyan
    Write-Host "     API Key :  $AgentKey" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "  Manage service:"
Write-Host "    Get-Service $ServiceName"
Write-Host "    Restart-Service $ServiceName"
Write-Host "    Stop-Service $ServiceName"
Write-Host ""
Write-Host "  Logs:"
Write-Host "    Get-Content $stdoutLog -Tail 30"
Write-Host "    Get-Content $stderrLog -Tail 30"
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
