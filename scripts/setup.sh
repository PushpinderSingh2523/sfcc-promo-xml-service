#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# SFCC Promo XML Service — Mac / Linux Setup Script
#
# Run once on a new machine (or after git clone) to get fully set up.
# Usage:
#   chmod +x scripts/setup.sh
#   ./scripts/setup.sh
#   ./scripts/setup.sh --cloud-sync ~/OneDrive/Dev/sfcc-sync   # with cloud sync
#
# Requirements: git, curl or wget (Homebrew on Mac is auto-installed)
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLOUD_SYNC_DIR="${2:-}"

# ── Parse arguments ──────────────────────────────────────────────────────────
if [[ "${1:-}" == "--cloud-sync" ]]; then
  CLOUD_SYNC_DIR="${2:-}"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  SFCC Promo XML Service — Setup"
echo "═══════════════════════════════════════════════════════"
echo ""

cd "$PROJECT_ROOT"

# ─────────────────────────────────────────────────────────────────────────────
# 1. PREREQUISITES
# ─────────────────────────────────────────────────────────────────────────────
info "Checking prerequisites..."

# Git
command -v git &>/dev/null || error "git is required. Install from https://git-scm.com"

# macOS: Install Homebrew if missing
if [[ "$OSTYPE" == "darwin"* ]]; then
  if ! command -v brew &>/dev/null; then
    warn "Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add brew to PATH for Apple Silicon
    if [[ -f "/opt/homebrew/bin/brew" ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
  fi
  ok "Homebrew: $(brew --version | head -1)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. NODE VERSION MANAGER (fnm preferred — works on Mac + Windows + Linux)
# ─────────────────────────────────────────────────────────────────────────────
info "Setting up Node.js version manager..."

REQUIRED_NODE=$(cat .nvmrc 2>/dev/null || echo "20")

if command -v fnm &>/dev/null; then
  info "fnm detected — using it"
  eval "$(fnm env --use-on-cd)"
  fnm install "$REQUIRED_NODE" --log-level=quiet
  fnm use "$REQUIRED_NODE"
elif command -v nvm &>/dev/null; then
  info "nvm detected — using it"
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck source=/dev/null
  [[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"
  nvm install "$REQUIRED_NODE"
  nvm use "$REQUIRED_NODE"
else
  warn "Neither fnm nor nvm found. Installing fnm (cross-platform Node version manager)..."
  curl -fsSL https://fnm.vercel.app/install | bash
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)"
  fnm install "$REQUIRED_NODE"
  fnm use "$REQUIRED_NODE"

  # Add fnm to shell profile
  SHELL_NAME=$(basename "$SHELL")
  PROFILE_FILE="$HOME/.${SHELL_NAME}rc"
  if ! grep -q "fnm env" "$PROFILE_FILE" 2>/dev/null; then
    echo '' >> "$PROFILE_FILE"
    echo '# fnm — Node version manager' >> "$PROFILE_FILE"
    echo 'export PATH="$HOME/.local/share/fnm:$PATH"' >> "$PROFILE_FILE"
    echo 'eval "$(fnm env --use-on-cd)"' >> "$PROFILE_FILE"
    info "fnm added to $PROFILE_FILE — restart your shell or run: source $PROFILE_FILE"
  fi
fi

NODE_VERSION=$(node --version 2>/dev/null || echo "unknown")
ok "Node.js: $NODE_VERSION"

# ─────────────────────────────────────────────────────────────────────────────
# 3. DEPENDENCIES
# ─────────────────────────────────────────────────────────────────────────────
info "Installing npm dependencies..."
npm ci --prefer-offline 2>/dev/null || npm install
ok "Dependencies installed ($(ls node_modules | wc -l | tr -d ' ') packages)"

# ─────────────────────────────────────────────────────────────────────────────
# 4. ENVIRONMENT FILE
# ─────────────────────────────────────────────────────────────────────────────
info "Setting up environment..."

if [[ -f ".env" ]]; then
  ok ".env already exists — skipping"
elif [[ -n "$CLOUD_SYNC_DIR" && -f "$CLOUD_SYNC_DIR/.env" ]]; then
  cp "$CLOUD_SYNC_DIR/.env" .env
  ok ".env copied from cloud sync: $CLOUD_SYNC_DIR"
elif [[ -f ".env.example" ]]; then
  cp ".env.example" ".env"
  warn ".env created from .env.example — FILL IN YOUR SECRETS before starting!"
  warn "  Required: ANTHROPIC_API_KEY"
  warn "  Edit:     $PROJECT_ROOT/.env"
else
  warn "No .env.example found. Create .env manually."
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. RUNTIME DIRECTORIES
# ─────────────────────────────────────────────────────────────────────────────
info "Creating runtime directories..."
mkdir -p runtime/sessions runtime/exports runtime/imports runtime/traces runtime/logs
mkdir -p logs/runtime
ok "Runtime directories ready"

# ─────────────────────────────────────────────────────────────────────────────
# 6. CLAUDE CONTEXT SYNC (optional)
# ─────────────────────────────────────────────────────────────────────────────
if [[ -n "$CLOUD_SYNC_DIR" ]]; then
  info "Syncing Claude context from $CLOUD_SYNC_DIR..."
  bash "$SCRIPT_DIR/sync-claude.sh" --import "$CLOUD_SYNC_DIR"
else
  info "Tip: Run with --cloud-sync <path> to restore Claude project memory"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 7. GIT CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────
info "Configuring git for cross-platform..."

# Normalize line endings on this machine (apply .gitattributes rules)
git config core.autocrlf false     # Never convert LF → CRLF on checkout (Mac/Linux)
git config core.eol lf             # Store and checkout LF
git config pull.rebase true        # Rebase by default (clean history)
git config push.default current    # Push current branch by name
git config fetch.prune true        # Auto-prune deleted remote branches

ok "Git configured for cross-platform"

# ─────────────────────────────────────────────────────────────────────────────
# 8. VERIFY
# ─────────────────────────────────────────────────────────────────────────────
info "Running sanity check..."

if npm run test -- --passWithNoTests --silent 2>/dev/null; then
  ok "Tests pass ✓"
else
  warn "Tests not passing — check your .env secrets"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Edit .env — add your ANTHROPIC_API_KEY"
echo "  2. Run: npm run dev          (start dev server)"
echo "  3. Run: npm test             (run test suite)"
echo "  4. Open: http://localhost:3000/health"
echo "═══════════════════════════════════════════════════════"
echo ""
