# ADR-001 — Deterministic XML Generation

**Status:** Accepted
**Date:** 2026-05-06
**Author:** SFCC Engineering
**Related:** ADR-002, ADR-003

---

## Context

The service must generate SFCC-compliant promotion XML from natural-language descriptions.
Two approaches were considered:

**Option A:** Ask AI (Claude) to generate the XML directly from the intent.
**Option B:** Use AI only to extract structured intent data (JSON), then generate XML deterministically.

---

## Decision

**Option B — AI extracts intent, deterministic code generates XML.**

The AI layer (`claudeService`) is responsible ONLY for parsing the natural-language intent
into a structured JSON object. XML generation is handled exclusively by `xmlService.js`,
which contains pure deterministic transformation logic using `xmlbuilder2`.

---

## Consequences

### Positive
- **Testable:** XML output can be unit tested without mocking AI. Same JSON → same XML always.
- **Auditable:** Every XML generation decision is traceable to code, not a black box.
- **Debuggable:** When XML is wrong, the bug is in `xmlService.js` — not in an AI prompt.
- **Replaceable:** The AI layer can be replaced (Claude → GPT-4 → local rules) without touching XML logic.
- **Versionable:** XML structure changes require code changes — they are reviewed, tested, deployed.
- **AI-optional:** The service works with zero AI calls (see ADR-002).
- **Consistent:** SFCC import reliability requires exact XML structure. Deterministic generation guarantees this.

### Negative
- Two-step process adds complexity vs. direct XML generation.
- The intermediate JSON schema must be carefully designed to capture all needed XML parameters.
- Parser changes (v1 → v2) require coordinated schema, parser, and builder updates.

---

## Rejected Alternative

**Option A — AI generates XML directly**
- Rejected because: AI-generated XML is not deterministic; same input can produce different output.
- SFCC is strict about XML schema — any structural deviation causes import failure.
- Cannot be unit tested without AI calls.
- Debugging failures requires inspecting AI outputs, not code.
- Prompt injection could generate malformed or malicious XML.
