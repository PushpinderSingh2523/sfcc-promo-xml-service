#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Claude Context Sync — Mac / Linux
#
# Syncs Claude project memory and settings between machines via a cloud folder.
#
# What is synced:
#   ~/.claude/settings.json                    — global Claude settings
#   ~/.claude/projects/<this-project>/memory/  — project-specific memory files
#   ./.claude/settings.local.json              — project permissions (in repo)
#   ./PROJECT_MEMORY.md                        — human-readable memory snapshot
#
# What is NOT synced (too large / machine-specific):
#   ~/.claude/sessions/         — conversation transcripts
#   ~/.claude/backups/          — local backups
#   ~/.claude/shell-snapshots/  — shell state
#   ~/.claude/telemetry/        — usage data
#
# Usage:
#   ./scripts/sync-claude.sh --export ~/OneDrive/Dev/sfcc-sync
#   ./scripts/sync-claude.sh --import ~/OneDrive/Dev/sfcc-sync
#   ./scripts/sync-claude.sh --status ~/OneDrive/Dev/sfcc-sync
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ACTION="${1:-}"
CLOUD_SYNC_DIR="${2:-}"

# ── Derive the Claude project directory path for THIS machine ─────────────────
# Claude hashes the absolute project path into a directory key like:
#   ~/.claude/projects/-Users-paramjitsingh-Desktop-sfcc-promo-xml-service/
CLAUDE_GLOBAL_DIR="$HOME/.claude"
CLAUDE_PROJECT_KEY=$(echo "$PROJECT_ROOT" | sed 's|/|-|g' | sed 's|^-||')
CLAUDE_PROJECT_DIR="$CLAUDE_GLOBAL_DIR/projects/$CLAUDE_PROJECT_KEY"

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

show_usage() {
  echo "Usage: $0 --export|--import|--status <cloud-sync-dir>"
  echo ""
  echo "  --export <dir>   Push Claude context → cloud sync folder"
  echo "  --import <dir>   Pull Claude context ← cloud sync folder"
  echo "  --status <dir>   Compare local vs cloud sync (no changes)"
  echo ""
  echo "Example:"
  echo "  $0 --export ~/OneDrive/Dev/sfcc-sync"
  echo "  $0 --import ~/OneDrive/Dev/sfcc-sync"
}

validate_cloud_dir() {
  if [[ -z "$CLOUD_SYNC_DIR" ]]; then
    error "Cloud sync directory is required. Example: --export ~/OneDrive/Dev/sfcc-sync"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# EXPORT — push local Claude context to cloud
# ─────────────────────────────────────────────────────────────────────────────
do_export() {
  validate_cloud_dir
  info "Exporting Claude context to: $CLOUD_SYNC_DIR"
  mkdir -p "$CLOUD_SYNC_DIR/claude"

  # ── 1. Global Claude settings
  if [[ -f "$CLAUDE_GLOBAL_DIR/settings.json" ]]; then
    cp "$CLAUDE_GLOBAL_DIR/settings.json" "$CLOUD_SYNC_DIR/claude/settings.json"
    ok "Global settings exported"
  else
    warn "No global settings.json found at $CLAUDE_GLOBAL_DIR/settings.json"
  fi

  # ── 2. Project memory files
  if [[ -d "$CLAUDE_PROJECT_DIR/memory" ]]; then
    mkdir -p "$CLOUD_SYNC_DIR/claude/project-memory"
    cp -r "$CLAUDE_PROJECT_DIR/memory/." "$CLOUD_SYNC_DIR/claude/project-memory/"
    ok "Project memory exported ($(ls "$CLAUDE_PROJECT_DIR/memory" | wc -l | tr -d ' ') files)"
  else
    warn "No Claude project memory dir found at $CLAUDE_PROJECT_DIR/memory"
  fi

  # ── 3. Project-level settings (non-sensitive)
  if [[ -f "$CLAUDE_PROJECT_DIR/settings.json" ]]; then
    cp "$CLAUDE_PROJECT_DIR/settings.json" "$CLOUD_SYNC_DIR/claude/project-settings.json"
    ok "Project settings exported"
  fi

  # ── 4. PROJECT_MEMORY.md (human-readable snapshot in repo)
  if [[ -f "$PROJECT_ROOT/PROJECT_MEMORY.md" ]]; then
    cp "$PROJECT_ROOT/PROJECT_MEMORY.md" "$CLOUD_SYNC_DIR/claude/PROJECT_MEMORY.md"
    ok "PROJECT_MEMORY.md exported"
  fi

  # ── 5. Write a manifest with the source path (so import can map it correctly)
  cat > "$CLOUD_SYNC_DIR/claude/sync-manifest.json" <<EOF
{
  "exportedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sourceMachine": "$(hostname)",
  "sourceOS": "$(uname -s)",
  "sourceProjectPath": "$PROJECT_ROOT",
  "claudeProjectKey": "$CLAUDE_PROJECT_KEY"
}
EOF
  ok "Manifest written"

  echo ""
  ok "Export complete → $CLOUD_SYNC_DIR/claude/"
}

# ─────────────────────────────────────────────────────────────────────────────
# IMPORT — pull Claude context from cloud
# ─────────────────────────────────────────────────────────────────────────────
do_import() {
  validate_cloud_dir
  local CLAUDE_DIR="$CLOUD_SYNC_DIR/claude"

  if [[ ! -d "$CLAUDE_DIR" ]]; then
    error "No Claude sync data found at $CLAUDE_DIR. Run --export on the source machine first."
  fi

  info "Importing Claude context from: $CLOUD_SYNC_DIR"

  # ── 1. Global Claude settings
  if [[ -f "$CLAUDE_DIR/settings.json" ]]; then
    mkdir -p "$CLAUDE_GLOBAL_DIR"
    if [[ -f "$CLAUDE_GLOBAL_DIR/settings.json" ]]; then
      cp "$CLAUDE_GLOBAL_DIR/settings.json" "$CLAUDE_GLOBAL_DIR/settings.json.bak"
      info "Backed up existing settings.json → settings.json.bak"
    fi
    cp "$CLAUDE_DIR/settings.json" "$CLAUDE_GLOBAL_DIR/settings.json"
    ok "Global settings imported"
  fi

  # ── 2. Project memory — stored under THIS machine's project path key
  if [[ -d "$CLAUDE_DIR/project-memory" ]]; then
    mkdir -p "$CLAUDE_PROJECT_DIR/memory"
    cp -r "$CLAUDE_DIR/project-memory/." "$CLAUDE_PROJECT_DIR/memory/"
    ok "Project memory imported to $CLAUDE_PROJECT_DIR/memory/"
  fi

  # ── 3. Project settings
  if [[ -f "$CLAUDE_DIR/project-settings.json" ]]; then
    mkdir -p "$CLAUDE_PROJECT_DIR"
    cp "$CLAUDE_DIR/project-settings.json" "$CLAUDE_PROJECT_DIR/settings.json"
    ok "Project settings imported"
  fi

  # ── 4. PROJECT_MEMORY.md into repo root
  if [[ -f "$CLAUDE_DIR/PROJECT_MEMORY.md" ]]; then
    cp "$CLAUDE_DIR/PROJECT_MEMORY.md" "$PROJECT_ROOT/PROJECT_MEMORY.md"
    ok "PROJECT_MEMORY.md imported to repo root"
  fi

  # ── 5. Show manifest info
  if [[ -f "$CLAUDE_DIR/sync-manifest.json" ]]; then
    echo ""
    info "Sync manifest:"
    cat "$CLAUDE_DIR/sync-manifest.json" | python3 -m json.tool 2>/dev/null || cat "$CLAUDE_DIR/sync-manifest.json"
  fi

  echo ""
  ok "Import complete. Restart Claude Code to pick up the new context."
}

# ─────────────────────────────────────────────────────────────────────────────
# STATUS — compare without modifying
# ─────────────────────────────────────────────────────────────────────────────
do_status() {
  validate_cloud_dir
  echo ""
  info "Claude Sync Status"
  echo "─────────────────────────────────────────────"
  echo "Project root:        $PROJECT_ROOT"
  echo "Claude project dir:  $CLAUDE_PROJECT_DIR"
  echo "Cloud sync dir:      $CLOUD_SYNC_DIR/claude"
  echo ""

  # Local
  echo "LOCAL:"
  if [[ -f "$CLAUDE_GLOBAL_DIR/settings.json" ]]; then
    echo "  ✅ ~/.claude/settings.json"
  else
    echo "  ❌ ~/.claude/settings.json (not found)"
  fi
  if [[ -d "$CLAUDE_PROJECT_DIR/memory" ]]; then
    echo "  ✅ project memory ($(ls "$CLAUDE_PROJECT_DIR/memory" | wc -l | tr -d ' ') files)"
  else
    echo "  ❌ project memory (not found)"
  fi

  echo ""
  echo "CLOUD ($CLOUD_SYNC_DIR/claude):"
  local CLOUD_DIR="$CLOUD_SYNC_DIR/claude"
  if [[ -f "$CLOUD_DIR/settings.json" ]]; then
    echo "  ✅ settings.json"
  else
    echo "  ❌ settings.json (not found)"
  fi
  if [[ -d "$CLOUD_DIR/project-memory" ]]; then
    echo "  ✅ project-memory ($(ls "$CLOUD_DIR/project-memory" | wc -l | tr -d ' ') files)"
  else
    echo "  ❌ project-memory (not found)"
  fi
  if [[ -f "$CLOUD_DIR/sync-manifest.json" ]]; then
    local EXPORTED_AT
    EXPORTED_AT=$(python3 -c "import json,sys; d=json.load(open('$CLOUD_DIR/sync-manifest.json')); print(d.get('exportedAt','unknown'))" 2>/dev/null || echo "unknown")
    local SOURCE_MACHINE
    SOURCE_MACHINE=$(python3 -c "import json,sys; d=json.load(open('$CLOUD_DIR/sync-manifest.json')); print(d.get('sourceMachine','unknown'))" 2>/dev/null || echo "unknown")
    echo "  📅 Last exported: $EXPORTED_AT from $SOURCE_MACHINE"
  fi
  echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
case "$ACTION" in
  --export)  do_export  ;;
  --import)  do_import  ;;
  --status)  do_status  ;;
  *)         show_usage; exit 0 ;;
esac
