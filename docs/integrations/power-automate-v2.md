# Power Automate Integration — v2

## Architecture

```
Copilot Studio (Teams UI)
    │ HTTP Action
    ▼
SFCC Promo XML Service
    │
    ├─ POST /generate → sessionId + summary + XML (or clarificationRequired)
    └─ POST /clarify  → multi-turn answers → XML

When XML is ready:
    │
    ▼
Power Automate Flow
    ├─ Teams Approval card → Approver
    ├─ On Approve → Save XML to SharePoint
    └─ On Reject  → Notify user, optionally restart
```

---

## Flow 1: Promotion Generation & Approval

### Trigger
- HTTP Request from Copilot Studio
- OR: Scheduled trigger (batch promotion generation)
- OR: SharePoint list item created

### Steps

**1. Call POST /generate**
```
Action: HTTP
Method: POST
URI: https://your-service.azurecontainerapps.io/api/v1/promotions/generate
Headers: { "x-api-key": "@{parameters('ApiKey')}", "Content-Type": "application/json" }
Body: {
  "intent": "@{triggerBody()?['intent']}",
  "conversationId": "@{triggerBody()?['conversationId']}"
}
```

**2. Check clarificationRequired**
```
Condition: body('Call_Generate')?['clarificationRequired'] is equal to false
  YES → Continue to approval
  NO  → Send clarification question back to Copilot (via HTTP response)
```

**3. Post Approval Card to Teams**
```
Action: Post adaptive card and wait for response
Team: Merchandising
Channel: Promotions-Approvals

Card JSON:
{
  "type": "AdaptiveCard",
  "body": [
    { "type": "TextBlock", "text": "New Promotion for Approval", "size": "Large", "weight": "Bolder" },
    { "type": "TextBlock", "text": "@{body('Call_Generate')?['summary']?['oneLiner']}", "wrap": true },
    { "type": "FactSet", "facts": "@{body('Call_Generate')?['summary']?['bullets']}" },
    { "type": "TextBlock", "text": "Confidence: @{body('Call_Generate')?['confidence']}", "isSubtle": true },
    { "type": "Input.Text", "id": "approverNote", "label": "Notes (optional)", "isMultiline": true }
  ],
  "actions": [
    { "type": "Action.Submit", "title": "✅ Approve", "data": { "action": "approve" } },
    { "type": "Action.Submit", "title": "❌ Reject",  "data": { "action": "reject" } }
  ]
}
```

**4. Condition on approval response**
```
Condition: body('Post_approval_card')?['data']?['action'] is equal to 'approve'
  YES → Save XML to SharePoint
  NO  → Send rejection notification
```

**5. Save to SharePoint (on approve)**
```
Action: Create file
Site Address: https://yourorg.sharepoint.com/sites/Merchandising
Folder Path: /Promotions/Exports/@{formatDateTime(utcNow(),'yyyy-MM')}
File Name: @{body('Call_Generate')?['normalizedDocument']?['promotion']?['id']}.xml
File Content: @{body('Call_Generate')?['xml']}
```

**6. Update SharePoint list**
```
Action: Create item
List: Promotion Log
Fields:
  Title: @{body('Call_Generate')?['normalizedDocument']?['promotion']?['name']}
  Status: Approved
  PromotionId: @{body('Call_Generate')?['normalizedDocument']?['promotion']?['id']}
  Confidence: @{body('Call_Generate')?['confidence']}
  ApprovedBy: @{body('Post_approval_card')?['responder']?['displayName']}
  XMLPath: /Promotions/Exports/...
```

**7. Notify requester**
```
Action: Post message in a chat
Message: "✅ Your promotion has been approved and saved to SharePoint."
```

---

## Flow 2: Multi-Turn Clarification via Power Automate

When `clarificationRequired == true`, this flow handles the back-and-forth:

```
1. POST /generate → clarificationRequired: true, nextQuestion, sessionId
2. Store sessionId in flow variable
3. Send question to Teams (adaptive card with text input)
4. Wait for response
5. POST /clarify with { sessionId, answer }
6. Check completed:
   - false → go back to step 3
   - true  → proceed to approval flow
```

### Loop template
```
Do until body('Call_Clarify')?['completed'] is equal to true (max 10 iterations):
  1. Post question card to Teams
  2. Wait for answer
  3. POST /clarify { sessionId: variables('sessionId'), answer: body('Card_Response')?['data']?['answer'] }
  4. Update sessionId if needed
```

---

## Flow 3: Bulk Import & Export

### Import existing XMLs from SharePoint

```
Trigger: Scheduled (weekly) or manual
1. List files in SharePoint /Promotions/Legacy/
2. For each XML file:
   a. Get file content
   b. POST /import-xml { xml: file_content }
   c. Save normalized JSON back to SharePoint
   d. Post summary to Teams channel
3. Send digest report
```

### Export generated XML to SharePoint

```
1. Receive XML from /generate response
2. Create SharePoint file: {promotionId}.xml
3. Create SharePoint list entry with metadata
4. Optionally: email to merchandising team
```

---

## Flow 4: Promotion Diff & Review

When editing an existing promotion:

```
1. Load existing XML from SharePoint
2. POST /import-xml → original PromotionDocumentV2
3. Collect new intent from user
4. POST /generate → new PromotionDocumentV2 + XML
5. Compare using GET /capabilities or client-side diff
6. Show change summary in Teams card
7. Route to approval if changed
```

---

## Environment Variables

Store these in Power Automate Environment Variables (not hardcoded):

| Variable | Type | Description |
|---|---|---|
| `SfccPromoServiceUrl` | String | Base URL of the service |
| `SfccPromoApiKey` | String (secret) | API key for x-api-key header |
| `SharePointSiteUrl` | String | SharePoint site for XML exports |
| `TeamsChannelId` | String | Teams channel for approval notifications |
| `ApproverEmail` | String | Default approver for promotions |

---

## Error Handling

**Retry policy**: Configure HTTP actions with:
- Retry count: 3
- Interval: 5 seconds
- Type: Fixed

**Error notifications**:
```
Catch block → Post to Teams: "❌ Promotion generation failed: @{body('Call_Generate')?['message']}"
```

**Timeout handling**: Power Automate has a 30-day run limit. Clarification sessions expire in 2 hours — ensure the loop checks `session expired` (410 status) and restarts gracefully.

---

## Testing

1. **Manually trigger** the flow from Power Automate canvas
2. Use test intents from `/tests/integration/businessScenarios.test.js`
3. Check SharePoint for saved XML files
4. Verify Teams approval card renders correctly
5. Confirm approver receives notification

---

## Adaptive Card Quick Reference

| Field from API | Adaptive Card expression |
|---|---|
| Promotion name | `@{body('Generate')?['normalizedDocument']?['promotion']?['name']}` |
| One-liner summary | `@{body('Generate')?['summary']?['oneLiner']}` |
| Confidence score | `@{body('Generate')?['confidence']}` |
| Rule type | `@{body('Generate')?['normalizedDocument']?['promotion']?['ruleType']}` |
| Next question | `@{body('Generate')?['nextQuestion']?['text']}` |
| Session ID | `@{body('Generate')?['sessionId']}` |
