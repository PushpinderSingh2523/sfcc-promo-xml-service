#Requires -Version 5.1
# ═══════════════════════════════════════════════════════════════════════════════
# SFCC Dev — Windows Daily Start Script
#
# Run at the start of each session to verify environment health.
#
# Usage:  .\scripts\start-dev.ps1 [-SkipTests]
# ═══════════════════════════════════════════════════════════════════════════════

param([switch]$SkipTests)

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

function Write-Step { param($msg) Write-Host "  ▸ $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "─────────────────────────────────────────────────────" -ForegroundColor Blue
Write-Host "  SFCC Promo XML Service — Dev Start (Windows)" -ForegroundColor Blue
Write-Host "─────────────────────────────────────────────────────" -ForegroundColor Blue

# 1. Node / npm
Write-Ok "Node: $(node --version 2>$null)  npm: $(npm --version 2>$null)"

# 2. Git status
$branch = (git rev-parse --abbrev-ref HEAD 2>$null) ?? "unknown"
$dirty  = (git status --porcelain 2>$null | Measure-Object -Line).Lines ?? 0
try {
    $behind = (git rev-list --count HEAD..`@{u} 2>$null) ?? "0"
    $ahead  = (git rev-list --count `@{u}..HEAD 2>$null) ?? "0"
} catch {
    $behind = "?"; $ahead = "?"
}
Write-Ok "Branch: $branch  |  ahead: $ahead  behind: $behind  uncommitted: $dirty"

if ([int]$behind -gt 0) {
    Write-Warn "$behind commits behind origin/$branch — run: git pull"
}

# 3. .env check
if (-not (Test-Path ".env")) {
    Write-Warn ".env missing — copying from .env.example..."
    if (Test-Path ".env.example") { Copy-Item ".env.example" ".env" }
} else {
    $envContent = Get-Content ".env" -Raw -ErrorAction SilentlyContinue
    if (-not ($envContent -match "ANTHROPIC_API_KEY=sk-")) {
        Write-Warn "ANTHROPIC_API_KEY may be unset in .env"
    }
}
Write-Ok ".env present"

# 4. Dependencies
if (-not (Test-Path "node_modules")) {
    Write-Step "Installing dependencies..."
    npm ci --prefer-offline --silent
}
$pkgCount = (Get-ChildItem node_modules -Directory -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Ok "Dependencies OK ($pkgCount packages)"

# 5. Runtime dirs
@("runtime\sessions","runtime\exports","runtime\imports","runtime\traces","runtime\logs","logs\runtime") | ForEach-Object {
    New-Item -ItemType Directory -Path $_ -Force -ErrorAction SilentlyContinue | Out-Null
}
Write-Ok "Runtime dirs ready"

# 6. Quick smoke test
if (-not $SkipTests) {
    Write-Step "Quick sanity check..."
    npm test -- --passWithNoTests --silent 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "All tests pass ✓"
    } else {
        Write-Warn "Tests not passing — run 'npm test' for details"
    }
}

Write-Host ""
Write-Host "─────────────────────────────────────────────────────" -ForegroundColor Blue
Write-Host "  Ready! Start your server:"
Write-Host "    npm run dev                   # nodemon dev server"
Write-Host "    node src/app.js               # plain node"
Write-Host "    docker-compose up --build     # Docker"
Write-Host ""
Write-Host "  Other commands:"
Write-Host "    npm test                      # full test suite"
Write-Host "    npm run lint                  # ESLint"
Write-Host "─────────────────────────────────────────────────────" -ForegroundColor Blue
Write-Host ""
