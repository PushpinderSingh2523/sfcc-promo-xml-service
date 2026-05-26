# Copilot Studio Integration — v2

## Architecture Principle

> **Copilot Studio is ONLY: UI, orchestration, workflow, and approvals.**
> **All business logic lives in the Node.js platform.**

Copilot Studio calls this API. It does not parse intent, generate XML, validate documents, or score confidence. Those are all done server-side.

---

## Overview

```
Teams User
    │
    ▼
Copilot Studio Topic
    │  HTTP Action (Custom Connector)
    ▼
SFCC Promo XML Service (Node.js)
    │
    ├─ POST /api/v1/promotions/generate   ← first call
    ├─ POST /api/v1/promotions/clarify    ← follow-up answers
    ├─ GET  /api/v1/promotions/capabilities
    └─ POST /api/v1/promotions/preview
```

---

## Custom Connector Setup

### 1. Import OpenAPI Spec

1. Go to **Power Platform** → **Custom Connectors** → **New custom connector** → **Import an OpenAPI file**
2. Upload `/openapi/promotion-api.yaml`
3. Set **Base URL**: `https://your-service.azurecontainerapps.io/api/v1/promotions`
4. Set **Authentication**: API Key in header `x-api-key` (or None for dev)

### 2. Test the connector

Use the test tab to call `GET /capabilities` — confirm it returns `ruleTypes`, `discountKinds`, etc.

---

## Conversation Flow Design

### Topic: "Create Promotion"

```
Trigger: "create promo", "new promotion", "generate promotion XML"
```

**Step 1 — Collect intent**
```
Copilot: "Tell me about the promotion you want to create."
User:    "20% off for VIP customers in July"
```

**Step 2 — Call POST /generate**
```json
Action: HTTP POST /generate
Body: {
  "intent": "{user_input}",
  "conversationId": "{activity.conversation.id}"
}
```

**Step 3 — Check response**
```
IF response.clarificationRequired == true:
    → Show nextQuestion.text to user
    → Collect answer
    → Call POST /clarify with { sessionId, answer }
    → Repeat until completed == true

IF response.clarificationRequired == false:
    → Show summary.oneLiner
    → Show XML preview (truncated to 500 chars)
    → Offer to export or approve
```

### Topic: "Clarify Promotion"

This topic handles follow-up answers. It must:
1. Store `sessionId` in the conversation variable
2. Send `{ sessionId, answer }` to `POST /clarify`
3. Check `completed` — if false, ask the next question
4. If `completed == true`, show the XML and offer approval

---

## Adaptive Card: Promotion Preview

Use this Adaptive Card template for Teams promotion previews:

```json
{
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "text": "${summary.headline}",
      "size": "Large",
      "weight": "Bolder"
    },
    {
      "type": "TextBlock",
      "text": "${summary.oneLiner}",
      "wrap": true
    },
    {
      "type": "FactSet",
      "facts": "${summary.bullets}"
    },
    {
      "type": "TextBlock",
      "text": "Confidence: ${confidence}",
      "isSubtle": true
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Approve & Export XML",
      "data": { "action": "approve", "sessionId": "${sessionId}" }
    },
    {
      "type": "Action.Submit",
      "title": "Edit",
      "data": { "action": "edit", "sessionId": "${sessionId}" }
    },
    {
      "type": "Action.Submit",
      "title": "Cancel",
      "data": { "action": "cancel" }
    }
  ]
}
```

---

## Clarification Question Card

When `clarificationRequired == true`:

```json
{
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "text": "${nextQuestion.text}",
      "weight": "Bolder"
    },
    {
      "type": "TextBlock",
      "text": "${nextQuestion.hint}",
      "isSubtle": true,
      "wrap": true
    },
    {
      "type": "Input.Text",
      "id": "answer",
      "placeholder": "Type your answer..."
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Continue"
    }
  ]
}
```

For `type == "choice"` questions (shipping methods), use `Input.ChoiceSet` instead of `Input.Text`.

---

## Session Management

- Every `POST /generate` response includes a `sessionId`
- Store `sessionId` in a Copilot global variable for the conversation
- Pass it with every `POST /clarify` call
- Sessions expire after 2 hours — handle 410 Gone with a "start over" message

---

## Environment Variables (for Custom Connector)

| Variable | Value |
|---|---|
| Base URL | `https://your-service.azurecontainerapps.io/api/v1/promotions` |
| x-api-key | Your API key (blank = auth disabled) |
| Content-Type | `application/json` |

---

## Error Handling in Copilot

| HTTP Status | Copilot Response |
|---|---|
| 400 | "I didn't understand that. Could you rephrase?" |
| 404 | "I couldn't find that session. Let's start over." |
| 410 | "That session has expired. Let's create a new promotion." |
| 422 | "The promotion has a configuration issue: ${validation.document.errors[0].message}" |
| 500 | "Something went wrong. Please try again." |

---

## Teams Deployment

1. Publish the Custom Connector in Power Platform
2. In Copilot Studio, add the connector as an HTTP Action
3. Enable the bot in the **Microsoft Teams** channel
4. Optional: configure an **Approval** flow via Power Automate before export

---

## Testing the Flow

Use the Copilot Studio Test panel:
1. Type "Create a VIP promo"
2. System asks for discount → type "20% off"
3. System asks for schedule → type "in July"
4. System shows preview card
5. Click "Approve & Export XML"
