# SecureOps Agent — Windows Installer
#
# Usage (PowerShell as Administrator):
#   $env:SECUREOPS_AGENT_KEY = "<paste-key-from-controller-UI>"
#   iwr "https://secureops.site/api/servers/install-script/<token>?os=windows" -UseBasicParsing | iex
#
# Or download then run:
#   iwr "https://raw.githubusercontent.com/suryaex/secureops/main/agent-windows/deploy/install.ps1" -OutFile install.ps1
#   .\install.ps1
#
# Supported OS: Windows 10, Windows 11, Windows Server 2019, 2022

#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

# ---------- Configuration ----------
$InstallDir    = "C:\Program Files\SecureOps-Agent"
$ServiceName   = "SecureOps-Agent"
$Port          = if ($env:SECUREOPS_AGENT_PORT) { $env:SECUREOPS_AGENT_PORT } else { 8001 }
$AgentKey      = $env:SECUREOPS_AGENT_KEY
$JoinToken     = $env:SECUREOPS_JOIN_TOKEN
$ControllerURL = $env:SECUREOPS_CONTROLLER_URL
$ServerName    = $env:SECUREOPS_SERVER_NAME
$RecordSess    = if ($env:SECUREOPS_RECORD_SESSIONS) { $env:SECUREOPS_RECORD_SESSIONS } else { "0" }
$RepoURL       = "https://github.com/suryaex/secureops.git"

# ---------- Helpers ----------
function Say($msg)  { Write-Host "==> $msg" -ForegroundColor Green }
function Info($msg) { Write-Host "i   $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "!!  $msg" -ForegroundColor Yellow }
function Die($msg)  { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# ---------- Check OS ----------
$os = Get-CimInstance Win32_OperatingSystem
Say "Detected: $($os.Caption) (build $($os.BuildNumber))"

if ([int]$os.BuildNumber -lt 17763) {
    Die "Windows 10 build 1809+ atau Windows Server 2019+ diperlukan untuk ConPTY"
}

# Auto-generate key kalau belum di-set
if (-not $AgentKey) {
    Add-Type -AssemblyName System.Web
    $AgentKey = [System.Web.Security.Membership]::GeneratePassword(43, 8)
    Warn "SECUREOPS_AGENT_KEY tidak di-set — generate otomatis"
}

# ---------- 1) Install Python (kalau belum ada) ----------
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Say "Python tidak ditemukan — installing Python 3.12..."
    $pyInstaller = "$env:TEMP\python-installer.exe"
    Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe" `
                      -OutFile $pyInstaller -UseBasicParsing
    Start-Process $pyInstaller -Wait -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0"
    Remove-Item $pyInstaller -Force
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

$pyVersion = & python --version 2>&1
Info "Python: $pyVersion"

# ---------- 2) Install Git (kalau belum ada) ----------
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Say "Git tidak ditemukan — installing Git for Windows..."
    $gitInstaller = "$env:TEMP\git-installer.exe"
    Invoke-WebRequest -Uri "https://github.com/git-for-windows/git/releases/download/v2.46.0.windows.1/Git-2.46.0-64-bit.exe" `
                      -OutFile $gitInstaller -UseBasicParsing
    Start-Process $gitInstaller -Wait -ArgumentList "/VERYSILENT /NORESTART"
    Remove-Item $gitInstaller -Force
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
}

# ---------- 3) Clone / pull repo ----------
if (Test-Path "$InstallDir\.git") {
    Say "Updating existing install di $InstallDir..."
    git -C $InstallDir pull --ff-only
} else {
    Say "Cloning repo ke $InstallDir..."
    if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
    git clone --depth 1 $RepoURL $InstallDir
}

# ---------- 4) Setup Python venv ----------
$BackendDir = "$InstallDir\agent-windows\backend"
$VenvDir    = "$BackendDir\venv"

Say "Setting up Python venv..."
if (-not (Test-Path $VenvDir)) {
    Push-Location $BackendDir
    & python -m venv venv
    Pop-Location
}

& "$VenvDir\Scripts\python.exe" -m pip install --quiet --upgrade pip setuptools wheel
& "$VenvDir\Scripts\pip.exe" install --quiet -r "$BackendDir\requirements.txt"

# ---------- 5) Save key & config ----------
$ConfigDir = "$env:PROGRAMDATA\SecureOps-Agent"
New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
Set-Content -Path "$ConfigDir\key" -Value $AgentKey -Encoding UTF8 -NoNewline
# Restrict access
$acl = Get-Acl "$ConfigDir\key"
$acl.SetAccessRuleProtection($true, $false)
$adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "BUILTIN\Administrators", "FullControl", "Allow")
$acl.AddAccessRule($adminRule)
Set-Acl "$ConfigDir\key" $acl

# ---------- 6) Download NSSM (service manager) ----------
$NssmDir = "$InstallDir\nssm"
$NssmExe = "$NssmDir\win64\nssm.exe"
if (-not (Test-Path $NssmExe)) {
    Say "Downloading NSSM (Non-Sucking Service Manager)..."
    $nssmZip = "$env:TEMP\nssm.zip"
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip -UseBasicParsing
    Expand-Archive -Path $nssmZip -DestinationPath $NssmDir -Force
    # Rename "nssm-2.24" folder to "win64" for easier path
    $extracted = Get-ChildItem $NssmDir -Directory | Select-Object -First 1
    if ($extracted.Name -ne 'win64') {
        Move-Item "$NssmDir\$($extracted.Name)\win64" $NssmDir -Force
        Remove-Item "$NssmDir\$($extracted.Name)" -Recurse -Force
    }
    Remove-Item $nssmZip -Force
}

# ---------- 7) Install Windows Service via NSSM ----------
Say "Installing Windows Service: $ServiceName..."
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    & $NssmExe stop $ServiceName | Out-Null
    & $NssmExe remove $ServiceName confirm | Out-Null
}

$uvicornExe = "$VenvDir\Scripts\uvicorn.exe"
& $NssmExe install $ServiceName $uvicornExe "main:app --host 0.0.0.0 --port $Port"
& $NssmExe set $ServiceName AppDirectory $BackendDir
& $NssmExe set $ServiceName DisplayName "SecureOps Agent"
& $NssmExe set $ServiceName Description "SecureOps Agent — Centralized security monitoring"
& $NssmExe set $ServiceName Start SERVICE_AUTO_START

# Environment variables
$envBlock = @(
    "SECUREOPS_AGENT_KEY=$AgentKey",
    "SECUREOPS_RECORD_SESSIONS=$RecordSess",
    "SECUREOPS_RECORD_DIR=$ConfigDir\sessions",
    "PYTHONUNBUFFERED=1",
    "PYTHONIOENCODING=utf-8"
) -join "`r`n"
& $NssmExe set $ServiceName AppEnvironmentExtra $envBlock

# Stdout / stderr logging
& $NssmExe set $ServiceName AppStdout "$ConfigDir\service-stdout.log"
& $NssmExe set $ServiceName AppStderr "$ConfigDir\service-stderr.log"
& $NssmExe set $ServiceName AppRotateFiles 1
& $NssmExe set $ServiceName AppRotateBytes 10485760  # 10 MB

# Restart on failure
& $NssmExe set $ServiceName AppExit Default Restart
& $NssmExe set $ServiceName AppRestartDelay 5000

# ---------- 8) Firewall rule ----------
Say "Adding Windows Firewall rule untuk port $Port..."
$ruleName = "SecureOps-Agent Port $Port"
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound -Protocol TCP -LocalPort $Port `
    -Action Allow -Profile Domain,Private -Description "SecureOps Agent HTTP API" | Out-Null

# ---------- 9) Start service ----------
Say "Starting service..."
Start-Service -Name $ServiceName
Start-Sleep -Seconds 3

# Wait for service to become healthy
Say "Waiting for agent to become healthy..."
$healthy = $false
for ($i = 1; $i -le 15; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" `
                                   -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) { $healthy = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}
if ($healthy) {
    Info "Agent healthy after ${i}s"
} else {
    Warn "Agent belum responsif. Check logs: Get-Content '$ConfigDir\service-stderr.log'"
}

# ---------- 10) Auto-register dengan controller ----------
$AutoRegistered = $false
$primaryIP = (Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp,Manual |
              Where-Object { $_.IPAddress -notmatch '^(169\.254|127\.)' } |
              Select-Object -First 1).IPAddress
if (-not $primaryIP) { $primaryIP = "127.0.0.1" }

if ($JoinToken -and $ControllerURL) {
    Say "Auto-registering dengan controller di $ControllerURL..."
    $payload = @{
        token    = $JoinToken
        hostname = $env:COMPUTERNAME
        api_url  = "http://${primaryIP}:$Port"
        api_key  = $AgentKey
    } | ConvertTo-Json -Compress

    try {
        $resp = Invoke-WebRequest -Uri "$ControllerURL/api/servers/auto-register" `
                                   -Method POST -Body $payload `
                                   -ContentType "application/json" `
                                   -UseBasicParsing -TimeoutSec 10
        Info "Auto-registration response: $($resp.Content)"
        $AutoRegistered = $true
    } catch {
        Warn "Auto-registration gagal: $($_.Exception.Message)"
    }
}

# ---------- 11) Print summary ----------
Write-Host ""
Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "       SecureOps Agent for Windows Installed Successfully" -ForegroundColor Green
Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  OS:           $($os.Caption)" -ForegroundColor White
Write-Host "  Hostname:     $env:COMPUTERNAME" -ForegroundColor White
Write-Host "  Service:      $ServiceName (status: $(Get-Service $ServiceName | Select-Object -ExpandProperty Status))" -ForegroundColor White
Write-Host "  IP:           $primaryIP" -ForegroundColor White
Write-Host "  Port:         $Port" -ForegroundColor White
Write-Host ""

if ($AutoRegistered) {
    Write-Host "  🎉 AUTO-REGISTERED WITH CONTROLLER" -ForegroundColor Green
    Write-Host "     Controller: $ControllerURL" -ForegroundColor White
    Write-Host "     No further action needed!" -ForegroundColor Green
} else {
    Write-Host "  📋 PASTE THESE TO THE CONTROLLER UI:" -ForegroundColor Yellow
    Write-Host "     (Sidebar → Servers → Add Server → Manual Entry)" -ForegroundColor Yellow
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
Write-Host "    Get-Content '$ConfigDir\service-stdout.log' -Tail 20"
Write-Host "    Get-Content '$ConfigDir\service-stderr.log' -Tail 20"
Write-Host ""
Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Green
