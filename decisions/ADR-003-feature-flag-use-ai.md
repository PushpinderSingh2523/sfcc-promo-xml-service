# ADR-003 — FEATURE_FLAG_USE_AI Environment Variable Pattern

**Status:** Accepted
**Date:** 2026-05-07
**Author:** SFCC Engineering
**Related:** ADR-002

---

## Context

The service has two intent-parsing modes (local vs Claude AI) and needs a clear,
operationally safe way to switch between them at runtime without code changes.

---

## Decision

Use a single environment variable `FEATURE_FLAG_USE_AI` (string "true" / "false")
as the primary switch. The Claude SDK is lazy-required — it is never loaded when
the flag is false.

Evaluation logic (resolved once at startup, not per-request):

```
USE_AI = (FEATURE_FLAG_USE_AI === "true")
       AND
         (ANTHROPIC_API_KEY is present AND not a known placeholder)
```

A warning is logged if `FEATURE_FLAG_USE_AI=true` but the key is missing or placeholder.
The service continues in local mode — it does not crash or refuse to start.

---

## Why Not Per-Request Feature Flags

Per-request flags were considered but rejected:
- Would allow API callers to switch AI on/off arbitrarily (security risk)
- Would make AI costs unpredictable
- Would complicate testing (request body affects parsing mode)
- Startup-time evaluation makes the mode visible in logs on every server start

---

## Operational Runbook

| Goal | Setting |
|---|---|
| Fully local (no keys, no cost) | `FEATURE_FLAG_USE_AI=false` + `ANTHROPIC_API_KEY=` |
| AI enabled | `FEATURE_FLAG_USE_AI=true` + real `ANTHROPIC_API_KEY` |
| Force local despite having key | `FEATURE_FLAG_USE_AI=false` |
| Test AI path in CI | `FEATURE_FLAG_USE_AI=true` + mock key + jest.mock in tests |

---

## Consequences

### Positive
- Single env var controls expensive external dependency
- Safe default: missing key → local mode (never crashes on missing config)
- Startup log shows mode clearly: `Intent parser mode: local (deterministic)` or `Intent parser mode: Claude AI`
- No API key = no Anthropic SDK even loaded → faster startup in local mode

### Negative
- Requires server restart to change mode (not hot-switchable)
- Does not support per-tenant or per-request mode switching
