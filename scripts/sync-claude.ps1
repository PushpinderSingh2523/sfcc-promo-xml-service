#Requires -Version 5.1
# ═══════════════════════════════════════════════════════════════════════════════
# Claude Context Sync — Windows PowerShell
#
# Syncs Claude project memory and settings between machines via a cloud folder.
#
# Usage:
#   .\scripts\sync-claude.ps1 -Action export -CloudSyncDir "C:\Users\$env:USERNAME\OneDrive\Dev\sfcc-sync"
#   .\scripts\sync-claude.ps1 -Action import -CloudSyncDir "C:\Users\$env:USERNAME\OneDrive\Dev\sfcc-sync"
#   .\scripts\sync-claude.ps1 -Action status -CloudSyncDir "C:\Users\$env:USERNAME\OneDrive\Dev\sfcc-sync"
#
# ═══════════════════════════════════════════════════════════════════════════════

param(
    [ValidateSet("export","import","status","help")]
    [string]$Action = "help",
    [string]$CloudSyncDir = ""
)

$ErrorActionPreference = "Stop"

function Write-Info  { param($msg) Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# ── Derive Claude project directory key for this machine ─────────────────────
# Claude converts the absolute project path to a directory key.
# On Windows: C:\Users\name\Desktop\project → -C-Users-name-Desktop-project
$ClaudeGlobalDir = "$env:USERPROFILE\.claude"

# Convert Windows path to Claude key format (matches how Claude Code does it)
$claudeProjectKey = $ProjectRoot -replace '\\', '-' -replace ':', '' -replace '^-', ''
$ClaudeProjectDir = "$ClaudeGlobalDir\projects\$claudeProjectKey"

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

function Validate-CloudDir {
    if (-not $CloudSyncDir) {
        Write-Err "CloudSyncDir is required. Example: -CloudSyncDir `"$env:USERPROFILE\OneDrive\Dev\sfcc-sync`""
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# EXPORT
# ─────────────────────────────────────────────────────────────────────────────
function Do-Export {
    Validate-CloudDir
    Write-Info "Exporting Claude context to: $CloudSyncDir"
    $claudeDir = "$CloudSyncDir\claude"
    New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null

    # 1. Global settings
    $globalSettings = "$ClaudeGlobalDir\settings.json"
    if (Test-Path $globalSettings) {
        Copy-Item $globalSettings "$claudeDir\settings.json" -Force
        Write-Ok "Global settings exported"
    } else {
        Write-Warn "No global settings.json at $globalSettings"
    }

    # 2. Project memory
    $projectMemoryDir = "$ClaudeProjectDir\memory"
    if (Test-Path $projectMemoryDir) {
        $dest = "$claudeDir\project-memory"
        New-Item -ItemType Directory -Path $dest -Force | Out-Null
        Copy-Item "$projectMemoryDir\*" $dest -Recurse -Force
        $count = (Get-ChildItem $projectMemoryDir | Measure-Object).Count
        Write-Ok "Project memory exported ($count files)"
    } else {
        Write-Warn "No project memory at $projectMemoryDir"
    }

    # 3. Project settings
    $projectSettings = "$ClaudeProjectDir\settings.json"
    if (Test-Path $projectSettings) {
        Copy-Item $projectSettings "$claudeDir\project-settings.json" -Force
        Write-Ok "Project settings exported"
    }

    # 4. PROJECT_MEMORY.md
    $projectMemoryMd = "$ProjectRoot\PROJECT_MEMORY.md"
    if (Test-Path $projectMemoryMd) {
        Copy-Item $projectMemoryMd "$claudeDir\PROJECT_MEMORY.md" -Force
        Write-Ok "PROJECT_MEMORY.md exported"
    }

    # 5. Manifest
    $manifest = @{
        exportedAt       = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ" -AsUTC)
        sourceMachine    = $env:COMPUTERNAME
        sourceOS         = "Windows"
        sourceProjectPath = $ProjectRoot
        claudeProjectKey = $claudeProjectKey
    } | ConvertTo-Json -Depth 5
    Set-Content "$claudeDir\sync-manifest.json" $manifest -Encoding UTF8
    Write-Ok "Manifest written"

    Write-Host ""
    Write-Ok "Export complete → $claudeDir"
}

# ─────────────────────────────────────────────────────────────────────────────
# IMPORT
# ─────────────────────────────────────────────────────────────────────────────
function Do-Import {
    Validate-CloudDir
    $claudeDir = "$CloudSyncDir\claude"

    if (-not (Test-Path $claudeDir)) {
        Write-Err "No Claude sync data at $claudeDir. Run export on the source machine first."
    }

    Write-Info "Importing Claude context from: $CloudSyncDir"

    # 1. Global settings
    if (Test-Path "$claudeDir\settings.json") {
        New-Item -ItemType Directory -Path $ClaudeGlobalDir -Force | Out-Null
        if (Test-Path "$ClaudeGlobalDir\settings.json") {
            Copy-Item "$ClaudeGlobalDir\settings.json" "$ClaudeGlobalDir\settings.json.bak" -Force
            Write-Info "Backed up existing settings.json"
        }
        Copy-Item "$claudeDir\settings.json" "$ClaudeGlobalDir\settings.json" -Force
        Write-Ok "Global settings imported"
    }

    # 2. Project memory — mapped to THIS machine's project path key
    if (Test-Path "$claudeDir\project-memory") {
        New-Item -ItemType Directory -Path "$ClaudeProjectDir\memory" -Force | Out-Null
        Copy-Item "$claudeDir\project-memory\*" "$ClaudeProjectDir\memory\" -Recurse -Force
        Write-Ok "Project memory imported to $ClaudeProjectDir\memory\"
    }

    # 3. Project settings
    if (Test-Path "$claudeDir\project-settings.json") {
        New-Item -ItemType Directory -Path $ClaudeProjectDir -Force | Out-Null
        Copy-Item "$claudeDir\project-settings.json" "$ClaudeProjectDir\settings.json" -Force
        Write-Ok "Project settings imported"
    }

    # 4. PROJECT_MEMORY.md
    if (Test-Path "$claudeDir\PROJECT_MEMORY.md") {
        Copy-Item "$claudeDir\PROJECT_MEMORY.md" "$ProjectRoot\PROJECT_MEMORY.md" -Force
        Write-Ok "PROJECT_MEMORY.md imported to repo root"
    }

    # 5. Show manifest
    if (Test-Path "$claudeDir\sync-manifest.json") {
        Write-Host ""
        Write-Info "Sync manifest:"
        Get-Content "$claudeDir\sync-manifest.json" | Write-Host
    }

    Write-Host ""
    Write-Ok "Import complete. Restart Claude Code to pick up the new context."
}

# ─────────────────────────────────────────────────────────────────────────────
# STATUS
# ─────────────────────────────────────────────────────────────────────────────
function Do-Status {
    Validate-CloudDir
    Write-Host ""
    Write-Info "Claude Sync Status"
    Write-Host "─────────────────────────────────────────────"
    Write-Host "Project root:        $ProjectRoot"
    Write-Host "Claude project dir:  $ClaudeProjectDir"
    Write-Host "Cloud sync dir:      $CloudSyncDir\claude"
    Write-Host ""

    Write-Host "LOCAL:"
    if (Test-Path "$ClaudeGlobalDir\settings.json") {
        Write-Host "  OK  ~/.claude/settings.json" -ForegroundColor Green
    } else {
        Write-Host "  --  ~/.claude/settings.json (not found)" -ForegroundColor Yellow
    }
    if (Test-Path "$ClaudeProjectDir\memory") {
        $count = (Get-ChildItem "$ClaudeProjectDir\memory" | Measure-Object).Count
        Write-Host "  OK  project memory ($count files)" -ForegroundColor Green
    } else {
        Write-Host "  --  project memory (not found)" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "CLOUD ($CloudSyncDir\claude):"
    $claudeDir = "$CloudSyncDir\claude"
    if (Test-Path "$claudeDir\settings.json") {
        Write-Host "  OK  settings.json" -ForegroundColor Green
    } else {
        Write-Host "  --  settings.json (not found)" -ForegroundColor Yellow
    }
    if (Test-Path "$claudeDir\project-memory") {
        $count = (Get-ChildItem "$claudeDir\project-memory" | Measure-Object).Count
        Write-Host "  OK  project-memory ($count files)" -ForegroundColor Green
    } else {
        Write-Host "  --  project-memory (not found)" -ForegroundColor Yellow
    }
    if (Test-Path "$claudeDir\sync-manifest.json") {
        $manifest = Get-Content "$claudeDir\sync-manifest.json" | ConvertFrom-Json
        Write-Host "  📅  Last exported: $($manifest.exportedAt) from $($manifest.sourceMachine)"
    }
    Write-Host ""
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
switch ($Action) {
    "export" { Do-Export }
    "import" { Do-Import }
    "status" { Do-Status }
    default  {
        Write-Host "Usage: sync-claude.ps1 -Action export|import|status -CloudSyncDir <path>"
        Write-Host ""
        Write-Host "  export  Push Claude context to cloud sync folder"
        Write-Host "  import  Pull Claude context from cloud sync folder"
        Write-Host "  status  Show local vs cloud comparison"
    }
}
