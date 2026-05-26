# Cross-Platform Development Setup

**Mac ↔ Windows synchronization guide for the SFCC Promo XML Service**

This document tells you exactly what to sync, what NOT to sync, and how to maintain identical development environments across machines.

---

## Contents

1. [Architecture overview](#1-architecture-overview)
2. [What lives where](#2-what-lives-where)
3. [First-time setup](#3-first-time-setup)
4. [Daily workflow](#4-daily-workflow)
5. [Claude context synchronization](#5-claude-context-synchronization)
6. [Environment variables](#6-environment-variables)
7. [Git workflow](#7-git-workflow)
8. [VS Code sync](#8-vs-code-sync)
9. [Path issues and OS differences](#9-path-issues-and-os-differences)
10. [Docker / dev container](#10-docker--dev-container)
11. [Backup strategy](#11-backup-strategy)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     Sync Architecture                            │
│                                                                  │
│   GitHub (git push/pull)                                         │
│   ┌─────────────────────────────────┐                           │
│   │  ALL source code                │ ← Single source of truth  │
│   │  package-lock.json              │   for code                │
│   │  config files (.nvmrc, etc.)    │                           │
│   │  .claude/settings.local.json    │                           │
│   │  PROJECT_MEMORY.md              │                           │
│   └─────────────────────────────────┘                           │
│                                                                  │
│   OneDrive / Dropbox (cloud folder)                              │
│   ┌─────────────────────────────────┐                           │
│   │  .env (secrets)                 │ ← Secrets + Claude state  │
│   │  claude/settings.json           │   NOT in git              │
│   │  claude/project-memory/         │                           │
│   │  claude/sync-manifest.json      │                           │
│   └─────────────────────────────────┘                           │
│                                                                  │
│   VS Code Settings Sync (built-in)                               │
│   ┌─────────────────────────────────┐                           │
│   │  Keybindings                    │ ← Editor preferences      │
│   │  Snippets                       │                           │
│   │  User settings                  │                           │
│   │  Extensions                     │                           │
│   └─────────────────────────────────┘                           │
└──────────────────────────────────────────────────────────────────┘
```

**Rule of thumb:**
- Code → Git
- Secrets → Cloud storage (never git)
- Claude context → Cloud storage (scripts handle path differences)
- Editor preferences → VS Code Settings Sync

---

## 2. What Lives Where

### ✅ Synced via Git (committed)

| Path | Reason |
|---|---|
| `src/**` | Application source code |
| `tests/**` | Test suites (2,747 tests) |
| `fixtures/**` | Test fixtures + SAS replays |
| `docs/**` | Documentation including this guide |
| `architecture/**`, `decisions/**` | ADRs and architecture notes |
| `openapi/**`, `schemas/**` | API specs and schemas |
| `prompts/**`, `examples/**`, `reference/**` | Project reference material |
| `package.json` + `package-lock.json` | Dependency pinning (reproducible installs) |
| `nodemon.json` | Dev server config |
| `Dockerfile` + `docker-compose.yml` | Container definitions |
| `.env.example` | Environment template (no values!) |
| `.nvmrc` | Node version pinning |
| `.gitattributes` | Line ending normalization |
| `.gitignore` | Exclusion rules |
| `.vscode/settings.json` | Shared editor settings |
| `.vscode/extensions.json` | Recommended extensions list |
| `.devcontainer/devcontainer.json` | Dev container config |
| `.claude/settings.local.json` | Shared Claude permissions (no paths) |
| `PROJECT_MEMORY.md` | Claude context snapshot |
| `scripts/**` | Setup + sync scripts |
| `.github/workflows/ci.yml` | CI/CD pipeline |

### ❌ NOT synced via Git (in `.gitignore`)

| Path | Reason |
|---|---|
| `.env` | Contains secrets (ANTHROPIC_API_KEY) |
| `node_modules/` | Regenerated via `npm ci` |
| `runtime/sessions/` | Ephemeral session state (840+ dirs) |
| `runtime/exports/`, `runtime/imports/`, etc. | Generated output |
| `output/` | Generated XML files |
| `logs/` | Runtime logs |
| `coverage/` | Jest coverage output |
| `.DS_Store`, `Thumbs.db` | OS junk |

### ☁️ Synced via Cloud (OneDrive/Dropbox)

| Path (cloud) | Source | Reason |
|---|---|---|
| `sfcc-sync/.env` | Project root | Secrets — never in git |
| `sfcc-sync/claude/settings.json` | `~/.claude/settings.json` | Global Claude preferences |
| `sfcc-sync/claude/project-memory/` | `~/.claude/projects/<key>/memory/` | AI project context |
| `sfcc-sync/claude/PROJECT_MEMORY.md` | `PROJECT_MEMORY.md` in repo | Human-readable memory |

---

## 3. First-Time Setup

### Mac / Linux

```bash
# Step 1: Clone the repo
git clone https://github.com/your-org/sfcc-promo-xml-service.git
cd sfcc-promo-xml-service

# Step 2: Run setup (installs Node, deps, creates .env)
chmod +x scripts/setup.sh
./scripts/setup.sh

# Step 3: If you have a cloud sync folder, restore context
./scripts/setup.sh --cloud-sync ~/OneDrive/Dev/sfcc-sync

# Step 4: Edit .env with your API keys
code .env    # or nano .env / vim .env
```

### Windows (PowerShell — run as Administrator once)

```powershell
# Step 0: Enable script execution (once per machine)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Step 1: Clone the repo
git clone https://github.com/your-org/sfcc-promo-xml-service.git
cd sfcc-promo-xml-service

# Step 2: Run setup
.\scripts\setup.ps1

# Step 3: With cloud sync
.\scripts\setup.ps1 -CloudSyncDir "$env:USERPROFILE\OneDrive\Dev\sfcc-sync"

# Step 4: Edit .env
notepad .env    # or code .env
```

### What the setup script does

1. Installs **fnm** (cross-platform Node version manager) if not present
2. Installs **Node.js 20** (from `.nvmrc`)
3. Runs `npm ci` (locked install from `package-lock.json`)
4. Copies `.env.example` → `.env` if missing
5. Creates `runtime/` subdirectories
6. Configures git for cross-platform (LF line endings, rebase pull)
7. (Optional) Imports Claude context from cloud sync folder

---

## 4. Daily Workflow

### Mac — start of day

```bash
cd ~/Desktop/sfcc-promo-xml-service
git pull --rebase              # get latest changes
./scripts/start-dev.sh         # health check + smoke test
npm run dev                    # start dev server
```

### Windows — start of day

```powershell
cd C:\Users\paramjitsingh\Desktop\sfcc-promo-xml-service
git pull --rebase              # get latest
.\scripts\start-dev.ps1        # health check
npm run dev                    # start dev server
```

### End of session

```bash
# 1. Commit any work in progress
git add -p                     # review changes
git commit -m "feat: ..."

# 2. Push to GitHub
git push

# 3. Export Claude context to cloud (so other machine picks it up)
./scripts/sync-claude.sh --export ~/OneDrive/Dev/sfcc-sync
```

### On the other machine

```bash
git pull --rebase
./scripts/sync-claude.sh --import ~/OneDrive/Dev/sfcc-sync
# Restart Claude Code to pick up new context
```

---

## 5. Claude Context Synchronization

### The challenge

Claude stores project-specific memory in:
- **Mac:** `~/.claude/projects/-Users-paramjitsingh-Desktop-sfcc-promo-xml-service/memory/`
- **Windows:** `~/.claude/projects/-C-Users-paramjitsingh-Desktop-sfcc-promo-xml-service/memory/`

The directory key is derived from the absolute path, so it differs per machine. The sync scripts handle this automatically — they export from the source path and import into the correct destination path.

### What Claude remembers across machines

After a sync, the new machine's Claude has access to:
- Project phase, completed work, and architecture decisions (`MEMORY.md`)
- All memory index files (`project_phase2.md`, etc.)
- Global Claude preferences (model, appearance settings)

### What Claude does NOT carry across machines

- Active conversation sessions (transcripts)
- Bash history within Claude sessions
- Shell snapshots
- Telemetry data

These are machine-local and not useful to transfer.

### Sync commands

```bash
# Mac — after a productive session
./scripts/sync-claude.sh --export ~/OneDrive/Dev/sfcc-sync

# Windows — to pick up Mac work
.\scripts\sync-claude.ps1 -Action import -CloudSyncDir "$env:USERPROFILE\OneDrive\Dev\sfcc-sync"

# Check what's in sync vs local
./scripts/sync-claude.sh --status ~/OneDrive/Dev/sfcc-sync
```

### Keep PROJECT_MEMORY.md updated

`PROJECT_MEMORY.md` in the repo root is a human-maintained context snapshot. Update it when:
- A major phase completes
- Architecture decisions change
- Test counts shift significantly

This file is committed to Git, so Claude on either machine can always read the current project state even without a cloud sync.

---

## 6. Environment Variables

### Required variables (in `.env`)

```bash
# ── Required ───────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...     # Your Anthropic API key
CLAUDE_MODEL=claude-sonnet-4-6   # Model to use

# ── Optional (defaults shown) ──────────────────────────────────
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
API_KEY=dev-key-local            # Local API auth key

# ── Feature flags ──────────────────────────────────────────────
FEATURE_FLAG_USE_AI=false        # Use Claude AI for classification
RATE_LIMIT_WINDOW_MS=900000      # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
```

### Getting `.env` to the new machine

**Option A — Cloud storage (recommended):**
1. Put your `.env` in `~/OneDrive/Dev/sfcc-sync/`
2. The setup script copies it automatically

**Option B — Manual:**
1. Copy `.env.example` → `.env`
2. Fill in your secrets

**Option C — 1Password / Bitwarden:**
Store each value as a secret note. Use their CLI to inject at startup:
```bash
# 1Password CLI example
op run --env-file=.env.template npm run dev
```

### Cross-platform `.env` rules

- Use `=` without spaces: `PORT=3000` ✓ (not `PORT = 3000`)
- Quote values with spaces: `DESCRIPTION="my service"`
- Never use Windows `%VAR%` or Unix `$VAR` inside `.env` — values are literal
- LF line endings only (`.gitattributes` ensures this in git)

---

## 7. Git Workflow

### Branch strategy

```
main            — stable, CI-passing (what Windows and Mac both pull from)
feature/xxx     — short-lived feature branches
fix/xxx         — bug fixes
phase/N         — large phase branches (merged to main when complete)
```

### Cross-platform git configuration

Both machines are configured by the setup scripts to:

```bash
git config core.autocrlf false   # Never convert LF ↔ CRLF automatically
git config core.eol lf           # Always checkout LF
git config pull.rebase true      # Rebase instead of merge on pull
git config push.default current  # Push current branch by name
git config fetch.prune true      # Auto-clean deleted remote branches
git config core.longpaths true   # Windows: avoid path length errors
```

**Why `autocrlf = false`?** `.gitattributes` already normalizes line endings declaratively — letting git also auto-convert creates double-conversion conflicts.

### Re-normalize after adding `.gitattributes`

If you added `.gitattributes` to an existing repo with mixed line endings:

```bash
git add --renormalize .
git commit -m "chore: normalize line endings"
```

### Commit message format

```
feat: add Teams answer endpoint
fix: handle expired session in confirm route
refactor: extract blueprintStore from sessionStore
test: add double-confirm integration test
docs: update cross-platform setup guide
chore: bump Node to 20.x
```

---

## 8. VS Code Sync

### Settings Sync (built-in)

Turn on via: **Code → Settings → Turn on Settings Sync**

What it syncs: User `settings.json`, keybindings, snippets, extensions, UI state.

What it does NOT sync: Workspace-level `.vscode/settings.json` (that's in git).

### Install recommended extensions

```bash
# Mac / Linux
code --install-extension esbenp.prettier-vscode
code --install-extension dbaeumer.vscode-eslint
code --install-extension orta.vscode-jest
code --install-extension eamodio.gitlens
code --install-extension ms-vscode-remote.remote-containers

# Or: in VS Code, open the Extensions panel and filter by "recommended"
```

### Windows-specific VS Code settings

If you need different terminal settings on Windows, use **workspace** settings (committed) to set `"terminal.integrated.defaultProfile.windows": "Git Bash"` — already done in `.vscode/settings.json`.

Do NOT put Windows-specific paths in committed settings.

---

## 9. Path Issues and OS Differences

### The core problems

| Issue | Mac | Windows | Fix |
|---|---|---|---|
| Path separator | `/` | `\` | Use `path.join()` in Node.js always |
| Home directory | `~/` or `/Users/name` | `C:\Users\name` or `%USERPROFILE%` | Use `os.homedir()` in scripts |
| Temp directory | `/tmp` | `%TEMP%` | Use `os.tmpdir()` in code |
| Line endings | LF (`\n`) | CRLF (`\r\n`) | Handled by `.gitattributes` |
| Case sensitivity | Case-sensitive FS | Case-insensitive FS | Use consistent casing in imports |
| Shell | zsh / bash | PowerShell / Git Bash | Scripts have `.sh` + `.ps1` pairs |
| `pkill` | available | not available (use taskkill) | Use scripts, not raw commands |

### Node.js path safety

All existing code uses `path.join()` and `path.resolve()` — this is already cross-platform safe:

```js
// ✅ Safe (already in the codebase)
const xmlPath = path.resolve(__dirname, '../tests/fixtures/Summer_SAS.xml');
const logFile = path.join(os.tmpdir(), 'sfcc-dev.log');
```

### When Windows uses WSL

If running WSL (Windows Subsystem for Linux), your project should live **inside WSL's filesystem**, not on the Windows drive:

```bash
# ✅ Good — inside WSL (fast I/O)
~/projects/sfcc-promo-xml-service

# ⚠ Slow — Windows drive mounted in WSL
/mnt/c/Users/paramjitsingh/Desktop/sfcc-promo-xml-service
```

With WSL, use the same `scripts/setup.sh` as Mac.

---

## 10. Docker / Dev Container

### When to use Docker

Use Docker when:
- You want a guaranteed identical environment between machines
- You're debugging a CI failure (Docker matches GitHub Actions)
- You're onboarding a new machine without installing Node locally

### Quick start with Docker Compose

```bash
# Start the service
docker-compose up --build

# Run tests inside container
docker-compose run --rm app npm test

# Shell into the container
docker-compose run --rm app bash
```

### VS Code Dev Container (recommended for Windows)

The `.devcontainer/devcontainer.json` is already configured. To use it:

1. Install the **Dev Containers** extension in VS Code
2. Open the project folder
3. VS Code prompts: **"Reopen in Container"** — click it
4. First launch: ~2 minutes to build. Subsequent launches: ~10 seconds.

Inside the container, `npm run dev`, `npm test`, etc. all work identically to Mac.

### What the dev container gives you

- Node.js 20 (pinned, matches `.nvmrc`)
- Port 3000 forwarded automatically
- All VS Code extensions pre-installed
- Runs as non-root `node` user (matches production)
- `npm install` runs automatically on container start

### `.env` inside Docker

The `devcontainer.json` mounts `.env` from the host into the container. If `.env` doesn't exist on the host, the mount fails silently — create it first:

```bash
cp .env.example .env
# Edit .env with your secrets
```

---

## 11. Backup Strategy

### Three-tier backup

| Tier | Tool | What | Frequency |
|---|---|---|---|
| 1 | GitHub | Source code + history | On every push |
| 2 | Cloud storage | Secrets + Claude context | On every session end |
| 3 | Local | node_modules (regenerable) | Not needed |

### Cloud sync folder structure

```
~/OneDrive/Dev/sfcc-sync/
├── .env                          ← Secrets (never in git)
├── claude/
│   ├── settings.json             ← Global Claude settings
│   ├── project-settings.json     ← Project Claude settings
│   ├── project-memory/           ← Claude project memory files
│   │   ├── MEMORY.md
│   │   └── project_phase2.md
│   ├── PROJECT_MEMORY.md         ← Human-readable memory snapshot
│   └── sync-manifest.json        ← Export metadata
```

### Backup `.env` to cloud

```bash
# Mac — add to your session-end script or alias
cp ~/Desktop/sfcc-promo-xml-service/.env \
   ~/OneDrive/Dev/sfcc-sync/.env
```

### Emergency recovery

If you lose a machine:
1. Clone repo from GitHub → all code restored
2. Run `setup.sh` → Node, deps, git config
3. Copy `.env` from cloud sync → secrets restored
4. Run `sync-claude.sh --import` → Claude context restored
5. Total recovery time: ~5 minutes

---

## 12. Troubleshooting

### "Module not found" or import errors

```bash
rm -rf node_modules
npm ci         # clean install from lockfile
```

On Windows, if `npm ci` fails due to path length:
```powershell
git config core.longpaths true
npm ci
```

### Tests fail on Windows but pass on Mac

**Likely cause:** Line ending differences in test fixtures.

```bash
# Re-normalize all files
git add --renormalize .
git diff --cached          # verify only line ending changes
git commit -m "chore: normalize line endings"
```

**Second likely cause:** Path separator in test fixture paths. Audit any hardcoded `/` in test files — use `path.join()`.

### Claude context not loading after import

1. Verify the import completed: `./scripts/sync-claude.sh --status ~/OneDrive/Dev/sfcc-sync`
2. **Restart Claude Code completely** (quit the app, reopen)
3. Check the project directory key matches: look in `~/.claude/projects/` — the folder name must match your absolute project path

### `.env` not found in Docker

The dev container mounts `.env` from the host. If the file doesn't exist:
```bash
cp .env.example .env
# Fill in secrets, then rebuild the container
```

### `pkill` not found on Windows

The `.claude/settings.local.json` allows `pkill` for Mac. On Windows with Git Bash, `pkill` is not available. Use:
```powershell
# Windows PowerShell equivalent
Stop-Process -Name "node" -Force
# or
taskkill /f /im node.exe
```

### Port 3000 already in use

```bash
# Mac / Linux
lsof -ti tcp:3000 | xargs kill -9

# Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

### git pull fails with "diverged branches"

```bash
git fetch origin
git rebase origin/main    # or origin/your-branch
```

This happens when you committed on both machines without pulling first. Rebase (not merge) keeps the history linear.

### fnm not found after setup on Mac

```bash
# Reload your shell profile
source ~/.zshrc    # or ~/.bashrc
# Verify fnm is in PATH
which fnm
```

### Node version mismatch

```bash
fnm use          # reads .nvmrc automatically
node --version   # should print v20.x.x
```

If `fnm use` fails to find v20:
```bash
fnm install 20
fnm use 20
```

---

## Quick Reference

```bash
# Setup (first time)
./scripts/setup.sh
.\scripts\setup.ps1                              # Windows

# Daily start
./scripts/start-dev.sh
.\scripts\start-dev.ps1                          # Windows

# Claude sync
./scripts/sync-claude.sh --export ~/OneDrive/Dev/sfcc-sync   # push
./scripts/sync-claude.sh --import ~/OneDrive/Dev/sfcc-sync   # pull
./scripts/sync-claude.sh --status ~/OneDrive/Dev/sfcc-sync   # check

# Windows Claude sync
.\scripts\sync-claude.ps1 -Action export -CloudSyncDir "$env:USERPROFILE\OneDrive\Dev\sfcc-sync"
.\scripts\sync-claude.ps1 -Action import -CloudSyncDir "$env:USERPROFILE\OneDrive\Dev\sfcc-sync"

# Dev server
npm run dev                # nodemon (auto-restart)
docker-compose up --build  # Docker

# Tests
npm test                   # all 2,747 tests
npx jest tests/unit        # unit only
npx jest tests/integration # integration only
npx jest --watch           # watch mode

# Git
git pull --rebase          # safe pull
git push                   # push current branch
```
