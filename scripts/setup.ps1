#Requires -Version 5.1
# ═══════════════════════════════════════════════════════════════════════════════
# SFCC Promo XML Service — Windows Setup Script
#
# Run once on a new Windows machine (or after git clone).
# Open PowerShell as Administrator for first-time setup.
#
# Usage:
#   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
#   .\scripts\setup.ps1
#   .\scripts\setup.ps1 -CloudSyncDir "C:\Users\$env:USERNAME\OneDrive\Dev\sfcc-sync"
#
# ═══════════════════════════════════════════════════════════════════════════════

param(
    [string]$CloudSyncDir = ""
)

$ErrorActionPreference = "Stop"

# ── Colors ────────────────────────────────────────────────────────────────────
function Write-Info  { param($msg) Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Blue
Write-Host "  SFCC Promo XML Service — Windows Setup" -ForegroundColor Blue
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Blue
Write-Host ""

Set-Location $ProjectRoot

# ─────────────────────────────────────────────────────────────────────────────
# 1. PREREQUISITES — Winget / Chocolatey / Scoop
# ─────────────────────────────────────────────────────────────────────────────
Write-Info "Checking prerequisites..."

# Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Info "Installing git via winget..."
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    $env:PATH += ";C:\Program Files\Git\bin"
}
Write-Ok "git: $(git --version)"

# ─────────────────────────────────────────────────────────────────────────────
# 2. NODE VERSION MANAGER — fnm (cross-platform, works on Windows natively)
# ─────────────────────────────────────────────────────────────────────────────
Write-Info "Setting up Node.js version manager (fnm)..."

$RequiredNode = "20"
if (Test-Path ".nvmrc") {
    $RequiredNode = (Get-Content ".nvmrc" -Raw).Trim()
}

if (-not (Get-Command fnm -ErrorAction SilentlyContinue)) {
    Write-Info "Installing fnm..."

    # Try winget first
    $wingetAvailable = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetAvailable) {
        winget install Schniz.fnm --accept-package-agreements --accept-source-agreements
    } else {
        # Fallback: install via Chocolatey
        if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
            Write-Info "Installing Chocolatey..."
            Set-ExecutionPolicy Bypass -Scope Process -Force
            [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
            Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        }
        choco install fnm -y
    }
    $env:PATH += ";$env:LOCALAPPDATA\fnm"
    Write-Ok "fnm installed"
}

# Initialize fnm for this session
$fnmEnv = fnm env --use-on-cd --shell power-shell
$fnmEnv | ForEach-Object { Invoke-Expression $_ }

fnm install $RequiredNode
fnm use $RequiredNode

# Add fnm to PowerShell profile for future sessions
$ProfileDir = Split-Path -Parent $PROFILE
if (-not (Test-Path $ProfileDir)) { New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null }
if (-not (Test-Path $PROFILE)) { New-Item -ItemType File -Path $PROFILE -Force | Out-Null }
$ProfileContent = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue
if (-not ($ProfileContent -match "fnm env")) {
    Add-Content $PROFILE "`n# fnm — Node version manager`nfnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression"
    Write-Info "fnm added to PowerShell profile: $PROFILE"
}

Write-Ok "Node.js: $(node --version)"

# ─────────────────────────────────────────────────────────────────────────────
# 3. DEPENDENCIES
# ─────────────────────────────────────────────────────────────────────────────
Write-Info "Installing npm dependencies..."
npm ci --prefer-offline 2>$null
if ($LASTEXITCODE -ne 0) { npm install }
$pkgCount = (Get-ChildItem node_modules -Directory | Measure-Object).Count
Write-Ok "Dependencies installed ($pkgCount packages)"

# ─────────────────────────────────────────────────────────────────────────────
# 4. ENVIRONMENT FILE
# ─────────────────────────────────────────────────────────────────────────────
Write-Info "Setting up environment..."

if (Test-Path ".env") {
    Write-Ok ".env already exists — skipping"
} elseif ($CloudSyncDir -and (Test-Path "$CloudSyncDir\.env")) {
    Copy-Item "$CloudSyncDir\.env" ".env"
    Write-Ok ".env copied from cloud sync: $CloudSyncDir"
} elseif (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env"
    Write-Warn ".env created from .env.example — FILL IN SECRETS before starting!"
    Write-Warn "  Required: ANTHROPIC_API_KEY"
    Write-Warn "  Edit: $ProjectRoot\.env"
} else {
    Write-Warn "No .env.example found. Create .env manually."
}

# ─────────────────────────────────────────────────────────────────────────────
# 5. RUNTIME DIRECTORIES
# ─────────────────────────────────────────────────────────────────────────────
Write-Info "Creating runtime directories..."
@("runtime\sessions","runtime\exports","runtime\imports","runtime\traces","runtime\logs","logs\runtime") | ForEach-Object {
    New-Item -ItemType Directory -Path $_ -Force | Out-Null
}
Write-Ok "Runtime directories ready"

# ─────────────────────────────────────────────────────────────────────────────
# 6. CLAUDE CONTEXT SYNC (optional)
# ─────────────────────────────────────────────────────────────────────────────
if ($CloudSyncDir) {
    Write-Info "Syncing Claude context from $CloudSyncDir..."
    & "$ScriptDir\sync-claude.ps1" -Action import -CloudSyncDir $CloudSyncDir
} else {
    Write-Info "Tip: Run with -CloudSyncDir to restore Claude project memory"
}

# ─────────────────────────────────────────────────────────────────────────────
# 7. GIT CONFIGURATION (Windows-specific)
# ─────────────────────────────────────────────────────────────────────────────
Write-Info "Configuring git for cross-platform..."

git config core.autocrlf false     # Keep LF — .gitattributes handles normalization
git config core.eol lf             # Checkout LF (consistent with Mac)
git config core.longpaths true     # Windows: allow long file paths
git config pull.rebase true
git config push.default current
git config fetch.prune true

Write-Ok "Git configured for cross-platform"

# ─────────────────────────────────────────────────────────────────────────────
# 8. WINDOWS-SPECIFIC DEVELOPER MODE SETUP
# ─────────────────────────────────────────────────────────────────────────────
Write-Info "Enabling Windows developer features..."

# Enable long paths in Windows registry (requires admin, silently skip if not admin)
try {
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem"
    Set-ItemProperty -Path $regPath -Name "LongPathsEnabled" -Value 1 -ErrorAction Stop
    Write-Ok "Long paths enabled in Windows registry"
} catch {
    Write-Warn "Could not enable long paths (requires Admin). Run as Administrator if git clone fails."
}

# ─────────────────────────────────────────────────────────────────────────────
# DONE
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:"
Write-Host "  1. Edit .env — add your ANTHROPIC_API_KEY"
Write-Host "  2. Run: npm run dev          (start dev server)"
Write-Host "  3. Run: npm test             (run test suite)"
Write-Host "  4. Open: http://localhost:3000/health"
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
