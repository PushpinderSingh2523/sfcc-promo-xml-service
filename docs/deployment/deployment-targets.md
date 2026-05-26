# Deployment Targets

## Local Development

```bash
npm install
cp .env.example .env
npm run dev         # nodemon — auto-restarts on change
# Open: http://localhost:3000/api-docs  (Swagger UI)
```

## Docker (local)

```bash
docker build -t sfcc-promo-xml-service .
docker run -p 3000:3000 \
  -e FEATURE_FLAG_USE_AI=false \
  -e LOG_LEVEL=info \
  sfcc-promo-xml-service

# Or with compose:
docker-compose up
```

## Azure Container Apps

### Prerequisites
- Azure CLI
- Container Registry (ACR)
- Container Apps Environment

### Deploy commands

```bash
# Build and push image
az acr build --registry <acr-name> --image sfcc-promo-xml-service:latest .

# Create Container App
az containerapp create \
  --name sfcc-promo-xml-service \
  --resource-group <rg-name> \
  --environment <env-name> \
  --image <acr-name>.azurecr.io/sfcc-promo-xml-service:latest \
  --target-port 3000 \
  --ingress external \
  --env-vars \
    PORT=3000 \
    NODE_ENV=production \
    FEATURE_FLAG_USE_AI=false \
    LOG_LEVEL=info \
    API_KEY=secretref:api-key
```

### Environment variables

Set these in Container Apps Configuration → Secrets:
- `api-key` → your API key value
- `anthropic-api-key` → only if FEATURE_FLAG_USE_AI=true

## Azure API Management (APIM)

1. Deploy the Container App (above)
2. In APIM, create a new API → **Import from OpenAPI**
   - URL: `https://your-containerapp.azurecontainerapps.io/api-docs/swagger.json`
   - (Or upload `/openapi/promotion-api.yaml` directly)
3. Set backend URL to your Container App URL
4. Add subscription key policy if needed
5. Enable CORS policy for Copilot Studio

### APIM Policy (add to All Operations)
```xml
<policies>
  <inbound>
    <cors allow-credentials="false">
      <allowed-origins><origin>*</origin></allowed-origins>
      <allowed-methods><method>GET</method><method>POST</method></allowed-methods>
      <allowed-headers><header>*</header></allowed-headers>
    </cors>
    <set-header name="x-api-key" exists-action="override">
      <value>{{api-key-secret}}</value>
    </set-header>
  </inbound>
</policies>
```

## Environment Variable Reference

| Variable | Default | Description |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `NODE_ENV` | development | `development` or `production` |
| `FEATURE_FLAG_USE_AI` | false | `true` = Claude AI, `false` = local parser |
| `ANTHROPIC_API_KEY` | — | Required if FEATURE_FLAG_USE_AI=true |
| `CLAUDE_MODEL` | claude-sonnet-4-6 | Claude model ID |
| `API_KEY` | — | API key for x-api-key header auth; blank = disabled |
| `RATE_LIMIT_WINDOW_MS` | 60000 | Rate limit window in ms |
| `RATE_LIMIT_MAX` | 60 | Max requests per window |
| `LOG_LEVEL` | info | `debug`, `info`, `warn`, `error` |
