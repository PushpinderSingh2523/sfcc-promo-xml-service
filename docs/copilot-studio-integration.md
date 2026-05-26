# Microsoft Copilot Studio Integration Guide

## Overview

Integrate the **SFCC Promo XML Service** as a **Power Platform Custom Connector** called from a Copilot Studio agent. This lets business users generate SFCC promotion XML through a natural-language chat interface — no forms, no technical knowledge required.

---

## Architecture

```
Business User (Teams / Copilot Studio chat)
         │  "Create a 15% off promotion for shoes next month"
         ▼
Copilot Studio Agent
  ├─ Topic: Generate Promotion
  │     ▼
  │  Power Automate action (HTTP call)
  │     ▼
  │  SFCC Promo XML Service
  │     │  Claude parses intent → JSON → XML
  │     ▼
  │  Returns { xml, parsed, requestId }
  └─ Bot replies with confirmation + summary
```

---

## Part 1: Create the Custom Connector

### 1.1 Open Power Platform admin centre

Navigate to **Data → Custom Connectors → New custom connector → Create from blank**

### 1.2 General tab

| Field | Value |
|---|---|
| Connector name | `SFCC Promo XML Service` |
| Description | Converts natural language promotion intent to SFCC XML |
| Host | `your-service-host.example.com` |
| Base URL | `/api/v1/promotions` |
| Scheme | HTTPS |

### 1.3 Security tab

| Field | Value |
|---|---|
| Authentication type | API Key |
| Parameter label | API Key |
| Parameter name | `X-API-Key` |
| Parameter location | Header |

### 1.4 Definition tab — Actions

**Action 1: GeneratePromotion**

| Field | Value |
|---|---|
| Summary | Generate SFCC Promotion XML |
| Operation ID | `GeneratePromotion` |
| Verb | POST |
| Path | `/generate` |

Request body schema:
```json
{
  "type": "object",
  "required": ["intent"],
  "properties": {
    "intent": {
      "type": "string",
      "description": "Natural language description of the promotion (e.g. '10% off orders over $50 in January')",
      "x-ms-summary": "Promotion Intent"
    }
  }
}
```

Response body schema (200):
```json
{
  "type": "object",
  "properties": {
    "requestId": { "type": "string", "x-ms-summary": "Request ID" },
    "intent":    { "type": "string", "x-ms-summary": "Original Intent" },
    "xml":       { "type": "string", "x-ms-summary": "Generated XML" },
    "parsed": {
      "type": "object",
      "properties": {
        "id":            { "type": "string" },
        "name":          { "type": "string" },
        "discountType":  { "type": "string" },
        "discountValue": { "type": "number" },
        "startDate":     { "type": "string" },
        "endDate":       { "type": "string" }
      }
    },
    "warnings": { "type": "array", "items": { "type": "object" } }
  }
}
```

**Action 2: ValidateXML**

| Field | Value |
|---|---|
| Summary | Validate SFCC Promotion XML |
| Operation ID | `ValidateXML` |
| Verb | POST |
| Path | `/validate` |

Request body: `{ "xml": "<string>" }`

---

## Part 2: Create the Copilot Studio Agent

### 2.1 Create a new agent

In **Copilot Studio → Create → New agent**:
- Name: `SFCC Promotions Assistant`
- Instructions: `You help SFCC merchandising teams create promotions. When a user describes a promotion, extract it and call the GeneratePromotion action. Confirm the details back to the user in plain English before and after generation.`

### 2.2 Add the custom connector as an action

1. In your agent, go to **Actions → Add an action**
2. Select **Custom connector → SFCC Promo XML Service**
3. Select **GeneratePromotion**
4. Set the API key connection

### 2.3 Create the main topic

**Topic name:** `Generate Promotion`

**Trigger phrases:**
- Create a promotion
- Generate a promotion
- Make a promo
- New SFCC promotion
- I need a discount

**Conversation nodes:**

```
[Message] "I can help you generate an SFCC promotion. Describe it in plain English, 
           for example: '10% off orders over $50 in January 2025'."

[Question] "What promotion would you like to create?"
  → Save to variable: Var_Intent (string)

[Message] "Got it! Generating your promotion now..."

[Action: GeneratePromotion]
  → Input: intent = Var_Intent
  → Save outputs:
      Var_XML     = outputs.xml
      Var_Parsed  = outputs.parsed
      Var_ReqId   = outputs.requestId

[Condition] Var_XML is not blank
  YES →
    [Message] "✅ Promotion created successfully!
    
    **Name:** {Var_Parsed.name}
    **Discount:** {Var_Parsed.discountType} — {Var_Parsed.discountValue}
    **Dates:** {Var_Parsed.startDate} to {Var_Parsed.endDate}
    **Request ID:** {Var_ReqId}
    
    The SFCC XML has been generated. Would you like me to save it to SharePoint?"
    
    [Question] "Save to SharePoint? (Yes / No)"
      YES → [Redirect to topic: Save Promotion to SharePoint]
      NO  → [Message] "No problem! The XML is ready when you need it."
      
  NO →
    [Message] "❌ Something went wrong generating the XML. Please try again or contact IT support."
```

### 2.4 Create the Save topic

**Topic name:** `Save Promotion to SharePoint`

**Action:** Call Power Automate flow that saves `Var_XML` to a SharePoint document library.

---

## Part 3: Connect to Teams

1. In Copilot Studio, go to **Channels → Microsoft Teams**
2. Click **Turn on Teams**
3. Install the bot in your Teams tenant via Teams Admin Centre
4. Test by opening the bot in Teams and typing: `Create a 20% off coupon code promotion for the holiday season`

---

## Sample Conversations

**Scenario 1 — Simple percentage discount:**
```
User:  Create a 15% off all products promotion for next month
Agent: Got it! Generating your promotion now...
       ✅ Promotion created successfully!
       Name: 15% Off All Products – June 2025
       Discount: percentage — 15
       Dates: 2025-06-01 to 2025-06-30
       Would you like me to save it to SharePoint?
```

**Scenario 2 — Coupon code:**
```
User:  $25 off for customers who use the code SPRING25 in April
Agent: Got it! Generating your promotion now...
       ✅ Promotion created successfully!
       Name: $25 Off with Code SPRING25
       Discount: amount-off — 25
       Dates: 2025-04-01 to 2025-04-30
```

**Scenario 3 — Free shipping:**
```
User:  Free shipping on all orders this weekend
Agent: ✅ Promotion created successfully!
       Name: Free Standard Shipping – Weekend
       Discount: free-shipping — 0
```

---

## Troubleshooting

| Issue | Resolution |
|---|---|
| Action returns error 401 | Check API key in the custom connector connection |
| Action returns error 422 | Document is structurally invalid after all clarification was collected — this should not occur during normal conversational flows; report to the API team |
| Action returns error 429 | Add a `Delay` node (30 s) before retrying |
| XML not appearing in SharePoint | Check Power Automate flow run history for the file creation step |
| Bot not responding in Teams | Verify Teams channel is enabled and the bot is installed |

---

## Security Considerations

- Store the API key as a **Power Platform environment variable** (secret type), not inline
- Restrict the Copilot Studio agent to internal-only users via Teams policies
- Enable DLP (Data Loss Prevention) policies to prevent sensitive product data from leaving the tenant
- Log all requests via the `requestId` field for audit trails
