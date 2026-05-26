# Power Automate Integration Guide

## Overview

This guide explains how to integrate the **SFCC Promo XML Service** into a Microsoft Power Automate flow so that business users can generate SFCC-compliant promotion XML from plain English descriptions — without any coding.

---

## Architecture

```
User Input (Teams / SharePoint / Forms)
         │
         ▼
Power Automate Flow
         │  HTTP POST — intent text
         ▼
SFCC Promo XML Service  ──►  Claude AI (intent → JSON)
         │                        │
         │  ◄─── validated JSON ──┘
         │
         │  deterministic XML generation
         │
         ▼
Response JSON  { xml, parsed, requestId }
         │
         ▼
Power Automate — Store XML in SharePoint / send to SFCC
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Power Automate Premium licence | HTTP connector requires premium |
| SFCC Promo XML Service deployed | Cloud or on-prem with HTTPS endpoint |
| Service API key | Set `API_KEY` in your `.env` |

---

## Step-by-Step: Build the Flow

### 1. Create a new Automated Cloud Flow

Trigger: **When an item is created or modified** (SharePoint list) — or any trigger that exposes a text field containing the promotion description.

### 2. Add an HTTP action

| Field | Value |
|---|---|
| Method | `POST` |
| URI | `https://your-service-host/api/v1/promotions/generate` |
| Headers | `Content-Type: application/json` `X-API-Key: your-api-key-here` |
| Body | `{ "intent": "@{triggerBody()?['PromotionDescription']}" }` |

> Replace `PromotionDescription` with the actual field name from your trigger.

### 3. Parse the JSON response

Add a **Parse JSON** action with this schema:

```json
{
  "type": "object",
  "properties": {
    "requestId": { "type": "string" },
    "intent":    { "type": "string" },
    "xml":       { "type": "string" },
    "parsed":    { "type": "object" },
    "warnings":  { "type": "array" }
  }
}
```

### 4. Store or send the XML

**Option A — Save to SharePoint document library:**
- Add **Create file** action
- File name: `@{body('Parse_JSON')?['parsed']?['id']}.xml`
- File content: `@{body('Parse_JSON')?['xml']}`

**Option B — Send by email for review:**
- Add **Send an email (V2)** action
- Attach the XML string as a `.xml` attachment

**Option C — POST directly to SFCC WebDAV:**
- Add another HTTP action targeting your SFCC WebDAV endpoint
- Body: `@{body('Parse_JSON')?['xml']}`
- Auth: Basic authentication with SFCC credentials

---

## Error Handling

Add a **Condition** after the HTTP action to check status:

```
HTTP Status Code is not equal to 200
  → Send failure notification
  → Log to SharePoint list with body('HTTP')?['error']
```

Common error codes:

| Status | Meaning |
|---|---|
| 400 | `intent` field missing or empty |
| 401 | Invalid or missing API key |
| 422 | Claude returned an unrecognisable structure |
| 429 | Rate limit hit — add a delay and retry |
| 502 | Claude API upstream error — retry after 30 s |

---

## Sample Flow Export (JSON)

Save the following as `sfcc-promo-flow.json` and import via **My Flows → Import**:

```json
{
  "properties": {
    "displayName": "SFCC Promotion XML Generator",
    "definition": {
      "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      "triggers": {},
      "actions": {
        "HTTP_Generate_XML": {
          "type": "Http",
          "inputs": {
            "method": "POST",
            "uri": "https://your-service-host/api/v1/promotions/generate",
            "headers": {
              "Content-Type": "application/json",
              "X-API-Key": "@parameters('apiKey')"
            },
            "body": {
              "intent": "@triggerBody()?['intent']"
            }
          }
        }
      }
    }
  }
}
```

---

## Testing the Flow

1. Manually trigger the flow with a test item: `"20% off all footwear in December 2025"`
2. Inspect the HTTP action response body — `xml` field should contain valid SFCC XML
3. Check the `parsed` field to verify Claude extracted the right discount type and dates
4. Review `warnings` — an empty array means the XML passed structural validation

---

## Security Best Practices

- Store the API key in **Power Automate connection parameters** or **Azure Key Vault**, not hard-coded
- Use HTTPS for the service endpoint (enforce TLS 1.2+)
- Restrict the service's `RATE_LIMIT_MAX` to match expected flow volume
- Enable Power Automate audit logging for compliance
