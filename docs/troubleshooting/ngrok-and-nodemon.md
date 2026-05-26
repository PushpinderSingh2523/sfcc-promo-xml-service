# Troubleshooting: ngrok + nodemon Local Development Issues

## Problem 1 — nodemon restart loop

### Symptom
nodemon restarts repeatedly without any source file changing, sometimes dozens of
times per minute, flooding the terminal with restart messages.

### Root cause
nodemon's default watch scope is the project root (`.`). The `runtime/` directory
contains session files (`.json`), log files (`.log`), and export files that the
running server writes to while handling requests. Every write to those files
triggers nodemon's file-watcher, which causes a restart, which writes more files,
which causes another restart — an infinite loop.

### Fix
[`nodemon.json`](../../nodemon.json) was added at the project root:

```json
{
  "watch": ["src"],
  "ext": "js,json",
  "ignore": [
    "runtime/**",
    "output/**",
    "docs/**",
    "coverage/**",
    "tests/**",
    ".git/**",
    "**/*.log",
    "**/*.log.*"
  ],
  "delay": 500
}
```

Key choices:
- `"watch": ["src"]` — only source code triggers restarts, not data directories
- `"ignore": ["runtime/**"]` — sessions, logs, exports, imports, traces are excluded
- `"delay": 500` — 500 ms debounce prevents rapid double-restarts when multiple
  files save simultaneously (e.g. editor auto-format on save)

---

## Problem 2 — ERR_ERL_UNEXPECTED_X_FORWARDED_FOR behind ngrok

### Symptom
```
Error: ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
    at ...express-rate-limit/dist/index.js
```
The server crashes or returns 500 on the first request when accessed through
an ngrok tunnel (or any reverse proxy).

### Root cause
ngrok adds an `X-Forwarded-For` header to every request it proxies. By default,
Express does **not** trust proxy headers — `req.ip` is the raw socket address
(ngrok's IP), not the end-user's IP. `express-rate-limit` v7 detects the
mismatch and throws `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` as a safety guard,
preventing a proxy from spoofing lower rate-limit counts by injecting custom
headers.

### Fix — two-part

**Part 1: Tell Express to trust one proxy hop** ([`src/app.js`](../../src/app.js)):
```js
app.set('trust proxy', 1);
```
This makes `req.ip` resolve to the first `X-Forwarded-For` address (the actual
client IP) and tells the rate-limiter that proxy headers are intentional.

**Part 2: Silence the rate-limiter's independent validation** ([`src/middleware/rateLimiter.js`](../../src/middleware/rateLimiter.js)):
```js
validate: { xForwardedForHeader: false }
```
express-rate-limit v7 performs its own check independently of Express's trust
proxy setting. `validate.xForwardedForHeader: false` disables that check so the
two layers stay in sync without the library throwing on every proxied request.

### Applies to
- ngrok (`ngrok http 3000`)
- Azure Container Apps (always behind a load balancer)
- Azure API Management
- Any Docker-based reverse proxy (nginx, Traefik, Caddy)
- Copilot Studio Custom Connector calls

---

## Problem 3 — EADDRINUSE on auto-restart

### Symptom
```
Error: listen EADDRINUSE: address already in use :::3000
```
After nodemon triggers a restart, the new process fails to bind port 3000
because the old process hasn't fully released it yet.

### Root cause
When nodemon sends SIGINT to restart the app, Node.js starts shutting down
but ongoing keep-alive TCP connections from HTTP clients (browsers, ngrok,
Postman) hold the port open for several seconds (up to the OS's `TIME_WAIT`
timeout). If the new process tries to `listen()` before those connections drain,
the bind fails.

The original `app.listen()` also had no `.on('error')` handler, so EADDRINUSE
crashed the process silently.

### Fix — graceful shutdown ([`src/app.js`](../../src/app.js))

```js
const server = app.listen(PORT, () => { ... });

// Surface EADDRINUSE with a helpful hint instead of an unhandled crash
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use.`, {
      hint: 'kill: lsof -ti tcp:' + PORT + ' | xargs kill',
    });
  }
  process.exit(1);
});

// Graceful shutdown on SIGINT (Ctrl-C / nodemon) and SIGTERM (Docker / ACA)
function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('Server closed. Exiting.');
    process.exit(0);
  });
  // Force-exit after 8 s if connections refuse to drain
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

`server.close()` stops the server from accepting new connections and waits for
existing ones to finish before calling the callback. By the time the new nodemon
process starts, the port is guaranteed to be free. The 8-second timeout prevents
a stale keep-alive connection from blocking shutdown indefinitely.

---

## Quick-reference: running locally with ngrok

```bash
# Terminal 1 — start the service
npm run dev

# Terminal 2 — start ngrok
ngrok http 3000

# Copy the ngrok HTTPS URL, e.g.:
# https://abc123.ngrok-free.app

# Test via ngrok
curl -X POST https://abc123.ngrok-free.app/api/v1/promotions/generate \
  -H 'Content-Type: application/json' \
  -d '{"intent": "20% off for VIP customers in July"}'
```

ngrok also provides a local inspector at `http://localhost:4040` where you can
replay requests and inspect headers.

---

## Verifying the fixes

After applying all fixes:

1. **No restart loop**: start `npm run dev`, write a session file manually
   (`touch runtime/sessions/test.json`) — nodemon should **not** restart.

2. **No proxy error**: send a request through ngrok — no `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`.

3. **No EADDRINUSE**: press Ctrl-C and immediately run `npm run dev` again —
   the server binds successfully without error.
