# CORS Verification & Preflight Immunity Protocol

## Overview

The admin console, scanner app, ticket counter UI, and public digital pass system run as Single Page Applications (SPAs) calling `/api/*` endpoints across various domains and mobile browser environments.

To guarantee that CORS preflight requests (`OPTIONS /api/*`) never fail with `308 Permanent Redirect` or missing CORS headers, preflight responses are handled directly at the Vercel Edge layer in `vercel.json`.

## Vercel Edge CORS Headers (`vercel.json`)

```json
{
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, POST, PUT, PATCH, DELETE, OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-User-Role, X-Pass-Request-Id" },
        { "key": "Access-Control-Max-Age", "value": "86400" }
      ]
    }
  ]
}
```

## Critical Safety Verification Commands

Run these `curl` commands from any terminal or test environment to verify preflight behavior:

### 1. Preflight OPTIONS Test (Must return HTTP 200 or 204 with CORS headers, NEVER 301/302/307/308)

```bash
curl -i -X OPTIONS "https://ashvishevents.com/api/passes/test-slug/test-sig" \
  -H "Origin: https://ashvishevents.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization"
```

**Expected Output:**
```
HTTP/2 200 (or 204)
access-control-allow-origin: *
access-control-allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
access-control-allow-headers: Origin, X-Requested-With, Content-Type, Accept, Authorization, X-User-Role, X-Pass-Request-Id
```

### 2. Public Pass GET Test (With Request ID Tracking)

```bash
curl -i "https://ashvishevents.com/api/passes/SAMPLE_SLUG/SAMPLE_SIG"
```

**Expected Output:**
```
HTTP/2 200
content-type: application/json; charset=utf-8
x-pass-request-id: req_...
access-control-allow-origin: *
```

### 3. Verification Rules
- `/api/*` endpoints must **NEVER** return a redirect status code (301, 302, 307, 308).
- `server.ts` must **NEVER** contain `req.headers.host` redirection logic for `/api/*`.
- `vercel.json` must **NEVER** contain a `"redirects"` array targeting `/api/*`.
