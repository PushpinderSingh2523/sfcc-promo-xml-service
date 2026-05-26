# Troubleshooting Guide
# SFCC Promotion XML Service

**Last Updated:** 2026-05-07
**Related:** `docs/edge-cases.md`, `docs/api-contracts.md`

---

## Startup Issues

### Error: `listen EADDRINUSE :::3000`
Port 3000 is already in use.
```bash
# Find and kill the process using port 3000
lsof -ti :3000 | xargs kill -9
# Then restart
npm run dev
```

### Error: `Cannot find module '@anthropic-ai/sdk'`
Missing dependencies. Run:
```bash
npm install
```

### Warning: `FEATURE_FLAG_USE_AI=true but ANTHROPIC_API_KEY is missing or a placeholder`
Service starts in local mode. To fix:
- Set a real `ANTHROPIC_API_KEY` in `.env`, or
- Set `FEATURE_FLAG_USE_AI=false` to intentionally use local mode

### Server shows `Intent parser mode: Claude AI` but you expected local mode
Check `.env` — both `FEATURE_FLAG_USE_AI=true` AND a non-placeholder `ANTHROPIC_API_KEY` are set.
The server must be restarted after `.env` changes.

---

## API Issues

### HTTP 401 Unauthorized
`API_KEY` is set in `.env` and the request is missing or using the wrong value in `X-API-Key` header.
- For local dev: set `API_KEY=` (blank) in `.env` to disable auth, then restart server
- For production: pass the correct key in the header

### HTTP 400 Bad Request — "intent is required"
The request body is missing the `intent` field, or it is whitespace only.
```bash
# Correct:
curl -X POST http://localhost:3000/api/v1/promotions/generate \
  -H "Content-Type: application/json" \
  -d '{"intent": "10% off orders over $50"}'

# Wrong — missing intent:
curl -X POST http://localhost:3000/api/v1/promotions/generate \
  -H "Content-Type: application/json" \
  -d '{}'
```

### HTTP 422 — Intent Validation Failed (AI mode only)
Claude returned JSON that doesn't pass AJV validation.
- Check `details` array in the response for specific field failures
- Check the `parsed` field to see what Claude returned
- Usually caused by Claude using the wrong enum value or omitting a required field
- The Claude system prompt in `prompts/claude-intent-parsing-system-prompt.md` may need updating

### HTTP 500 — Claude returned non-JSON content
Claude returned a markdown-formatted or plain-text response instead of raw JSON.
- Check that `CLAUDE_MODEL` is a supported model that follows instructions well
- The service attempts to strip markdown fences (`\`\`\`json`) as a safety measure
- If persistent: consider adding more examples to the system prompt

### HTTP 502 — Claude API Error
The Anthropic API is unreachable or returned an error.
- Check Anthropic API status: https://status.anthropic.com
- Check that `ANTHROPIC_API_KEY` is valid and has quota
- Check network/firewall connectivity from the server to `api.anthropic.com`

### HTTP 429 — Too Many Requests
Rate limit exceeded (default: 60 req/min).
- Wait for the window to reset (check `Retry-After` header)
- Increase `RATE_LIMIT_MAX` in `.env` for local testing
- For production: implement retry with exponential backoff in the client

---

## XML Issues

### Generated XML fails SFCC import — "Promotion already exists"
A promotion with this ID already exists in Business Manager.
- Change the `intent` to produce a different promotion ID, or
- Delete the existing promotion in Business Manager before re-importing

### Generated XML fails SFCC import — "Campaign not found"
The `campaignId` in the XML references a campaign that doesn't exist in Business Manager.
- Create the campaign in Business Manager → Campaigns first, or
- Use an existing campaign ID in your intent

### Generated XML fails SFCC import — "Invalid category"
A category ID in qualifying-products or exclusions doesn't match the SFCC catalog.
**Known v1 limitation:** The local parser emits product keywords (e.g., "shoes") as
`<product-id>` elements, not `<category-id>` elements. "shoes" is not a valid SFCC product ID.
- For now: manually edit the XML before import to use actual SFCC category IDs
- Fix: coming in v2 with proper category-condition support

### `warnings` array is non-empty in /generate response
The XML passed generation but failed structural validation.
- Review each warning for the missing element or attribute
- Check if the XML is still importable in SFCC sandbox
- Non-empty warnings are usually non-blocking for import

### XML date is wrong (off by a day or time zone)
All dates are in UTC. SFCC Business Manager may display them in your local timezone.
If the date appears off by one day, this is a timezone display issue, not a data issue.
The ISO UTC dates are correct for SFCC processing purposes.

---

## Parser Issues

### Local parser extracts wrong discount type
**Symptom:** "free shipping" promo generates a percentage discount
**Cause:** The `free shipping` pattern check must come before generic `percentage` checks in `DISCOUNT_PATTERNS`
**Fix:** Check pattern order in `localParser.js` → `DISCOUNT_PATTERNS` array. Free-shipping pattern must be first.

### Local parser extracts no condition (defaults to "none")
**Symptom:** "10% off orders over $50" produces `conditionType: "none"`
**Cause:** Condition pattern didn't match. Check the exact wording against `CONDITION_PATTERNS` in `localParser.js`
**Debug:** Call `POST /api/v1/promotions/parse` to see the extracted JSON without generating XML

### Dates default to today+90 days unexpectedly
**Cause:** No date signal matched in the intent string
**Fix:** Use explicit month names ("in July"), relative terms ("this month"), or explicit dates ("from Jan 1 to Jan 31")

---

## Test Issues

### Tests fail with timezone-related date assertion errors
**Symptom:** `Expected "-07-31" Received "2026-08-01T03:59:59.000Z"`
**Cause:** Using `.getDate()` or `.getMonth()` instead of `.getUTCDate()` / `.getUTCMonth()` in test assertions
**Fix:** Always use UTC getters in date assertions

### Jest exits with `open handles` warning
**Cause:** Express server is kept open between tests
**Fix:** The `--forceExit --detectOpenHandles` flags are set in `package.json` test script — they handle this

### `claudeService` tests call real API unexpectedly
**Cause:** `jest.mock('../../src/services/claudeService')` is missing from the test file
**Fix:** Ensure integration tests have the mock at the top level (outside describe blocks)

---

## Development Tips

### See parsed JSON before generating XML
```bash
curl -s -X POST http://localhost:3000/api/v1/promotions/parse \
  -H "Content-Type: application/json" \
  -d '{"intent": "your intent here"}' \
  | python3 -m json.tool
```

### Pretty-print generated XML only
```bash
curl -s -X POST http://localhost:3000/api/v1/promotions/generate \
  -H "Content-Type: application/json" \
  -d '{"intent": "your intent here"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['xml'])"
```

### Save XML directly to file
```bash
curl -s -X POST http://localhost:3000/api/v1/promotions/generate \
  -H "Content-Type: application/json" \
  -d '{"intent": "your intent here"}' \
  | python3 -c "import json,sys; open('output/promo.xml','w').write(json.load(sys.stdin)['xml'])"
```

### Check server logs for request details
```bash
tail -f /tmp/sfcc-dev.log
```
