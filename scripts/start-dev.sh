#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# SFCC Dev — Mac / Linux Daily Start Script
#
# Run this at the start of each session to verify the environment is healthy
# before you start coding. Takes ~5 seconds.
#
# Usage:  ./scripts/start-dev.sh [--no-sync]
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}▸${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NO_SYNC="${1:-}"

cd "$PROJECT_ROOT"

echo ""
echo "─────────────────────────────────────────────────────"
echo "  SFCC Promo XML Service — Dev Start"
echo "─────────────────────────────────────────────────────"

# ── 1. Node version
info "Node: $(node --version 2>/dev/null || echo 'not found')"
info "npm:  $(npm --version 2>/dev/null || echo 'not found')"

# ── 2. Git status summary
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')
BEHIND=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo '0')
AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo '0')
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

ok "Branch: $BRANCH  |  ahead: $AHEAD  behind: $BEHIND  uncommitted: $DIRTY"

# ── 3. Warn if behind upstream
if [[ "$BEHIND" -gt 0 ]]; then
  warn "$BEHIND commits behind origin/$BRANCH — run: git pull"
fi

# ── 4. .env check
if [[ ! -f ".env" ]]; then
  warn ".env missing — copy from .env.example and fill in secrets"
  cp .env.example .env 2>/dev/null || true
elif ! grep -q "ANTHROPIC_API_KEY=sk-" .env 2>/dev/null; then
  warn "ANTHROPIC_API_KEY looks unset in .env"
fi
ok ".env present"

# ── 5. Dependencies sync (fast — npm ci only installs if lockfile changed)
if [[ ! -d "node_modules" ]] || ! npm ls --depth=0 &>/dev/null; then
  info "Installing dependencies..."
  npm ci --prefer-offline --silent
fi
ok "Dependencies OK ($(ls node_modules | wc -l | tr -d ' ') packages)"

# ── 6. Runtime dirs
mkdir -p runtime/sessions runtime/exports runtime/imports runtime/traces runtime/logs logs/runtime
ok "Runtime dirs ready"

# ── 7. Quick smoke test (no-coverage, fast)
if [[ "$NO_SYNC" != "--skip-tests" ]]; then
  info "Quick sanity check..."
  if npm test -- --passWithNoTests --silent 2>/dev/null; then
    ok "All tests pass ✓"
  else
    warn "Tests not passing — check the test output"
  fi
fi

echo ""
echo "─────────────────────────────────────────────────────"
echo "  Ready! Start your server:"
echo "    npm run dev                   # nodemon dev server"
echo "    node src/app.js               # plain node"
echo "    docker-compose up --build     # Docker (full isolation)"
echo ""
echo "  Other commands:"
echo "    npm test                      # full test suite (2747 tests)"
echo "    npx jest tests/unit           # unit tests only"
echo "    npx jest tests/integration    # integration tests only"
echo "    npm run lint                  # ESLint"
echo "─────────────────────────────────────────────────────"
echo ""
