# HookLens

A temporary webhook inbox with a NestJS API, PostgreSQL persistence, and a React inspector.

## Planned structure

```text
apps/api/       NestJS API, Prisma schema and migrations, integration tests
apps/web/       React + Vite dashboard
```

Development is organized into endpoint creation, capture, history and retention,
authorized live events, dashboard, and final integration verification.

Anonymous endpoints last 24 hours. Do not send production secrets. The management
token grants access to captured data and belongs only in the current browser session.

## Development setup

Use Node.js 24.11+ (an active LTS release is recommended), npm 11+, and Docker Compose.
On Windows PowerShell, use `npm.cmd` if the execution policy blocks `npm.ps1`.

```sh
npm install
cp .env.example .env
npm run db:generate
docker compose up -d postgres
npm run db:deploy
npm run dev:api
npm run dev:web
```

The API listens on port 3000; Vite on 5173. API configuration is loaded from the
repository root `.env` and validated on startup. Never commit `.env`.

```sh
npm run lint
npm run typecheck
npm run build
npm test
npm run format:check
```

Swagger is available at http://localhost:3000/api/docs and the process health check
at http://localhost:3000/api/health. Database and API instructions will grow with
each implemented feature.

PostgreSQL runs only on loopback with a persistent Docker volume. Set
`POSTGRES_PASSWORD` and the matching URL password in `.env` before starting it.
Apply the tracked migrations with `npm run db:deploy`. For schema development use
`npm exec --workspace @hooklens/api -- prisma migrate dev --name change_name`.
`npm run db:generate` regenerates the ignored Prisma client after a fresh install.

The schema includes cascading capture deletion, an expiry index, and a compound
endpoint/time/ID index for deterministic newest-first history. Prisma 7 uses its
PostgreSQL driver adapter and a bounded connection pool.

## Endpoint creation

`POST /api/endpoints` returns `{ id, webhookUrl, managementToken, expiresAt }`.
The public URL contains a 128-bit random slug; its independent 256-bit management
token is returned only once. Only its SHA-256 hash is persisted. Creation is
limited to 10 requests per direct source IP per minute.

```sh
curl -X POST http://localhost:3000/api/endpoints
```

For PostgreSQL integration tests, set `TEST_DATABASE_URL` to a separate database
whose name ends in `_test`, then run `npm run test:e2e`. The runner deploys the
tracked migrations there; it never resets a database. Tests delete only their
own endpoints. Unit tests run with `npm test`.

## Capture

Send GET, POST, PUT, PATCH, or DELETE requests to the returned public URL.
The API returns `200 { "received": true }` after a successful transaction.
It preserves up to 256 KiB of raw bytes, including invalid JSON, binary, multipart,
and content-encoded data. It stores headers, repeated query parameters, and the
direct socket peer IP. Forwarded headers are captured as data, never trusted.
Unknown or expired endpoints return 404; oversized uploads 413; rate limits 429.
Capture is limited to 120 requests per direct source IP per minute. The latest
100 captures are retained, with insertion and pruning serialized per endpoint.

```sh
curl -X POST "$WEBHOOK_URL?source=demo" -H 'Content-Type: application/json' --data-binary '{"event":"hello"}'
```

## Inspect history

Endpoint-specific APIs require `Authorization: Bearer <managementToken>`.
`GET /api/endpoints/:id/requests` returns `{ items, page, limit, total, hasMore }`;
defaults are page 1 and 50 summaries. `limit` is capped at 100; optional `method`
accepts GET, POST, PUT, PATCH, or DELETE. Responses are marked `Cache-Control: no-store`.
`GET /api/endpoints/:id/requests/:requestId` returns full details with `bodyBase64`,
`bodySize`, and a supplementary `bodyText` for suitable UTF-8 textual MIME types.
Compressed, binary, and undecodable bodies have `bodyText: null`.

```sh
curl "$API_URL/api/endpoints/$ENDPOINT_ID/requests?method=POST&limit=50" -H "Authorization: Bearer $MANAGEMENT_TOKEN"
```

`DELETE /api/endpoints/:id/requests` clears history and returns `{ deleted: number }`.
`DELETE /api/endpoints/:id` deletes the endpoint and all captures, returning 204.
Both require the management bearer token. Expired endpoints reject new deliveries
immediately; a cleanup task removes expired endpoints and their captures every minute.

## Real-time updates

Connect Socket.IO over the `websocket` transport to namespace `/inspector`.
Emit `endpoint:subscribe` with `{ endpointId, managementToken }` and await the
acknowledgement `{ ok: true }` (or `{ ok: false, error }`). Tokens belong in the
message body, never a connection URL. Re-subscribe after reconnection, then refresh
REST history to recover events missed while disconnected.

Only an authorized endpoint room receives `request:received` summaries,
`request:deleted` (`{ endpointId, requestIds, cleared }`), and `endpoint:expired`
(`{ endpointId, reason: "expired" | "deleted" }`). Events are emitted after database
commit. Expiry or deletion removes subscribers from the room. WebSocket messages
are limited to 4 KiB and subscription attempts to 30 per socket per minute.
Browser origins must match `FRONTEND_ORIGIN`; command-line clients without Origin
are supported but still need the management token.

## Dashboard

Open http://localhost:5173, generate a webhook, and send a request to its URL.
The dashboard updates through Socket.IO and refreshes authorized history after
reconnection. Select a capture to inspect overview, headers, query parameters,
formatted/raw text, or exact Base64 bytes. Filter by method, clear history, or
delete the endpoint. Captured HTML is rendered only as escaped text.

Only `sessionStorage` holds endpoint credentials. The token is never displayed,
placed in URLs, or persisted to localStorage. New webhook generation replaces the
current tab's saved endpoint; the previous endpoint expires on its normal schedule.
GitHub is a placeholder link; replace it with the repository URL when publishing.

`npm run test:e2e` runs PostgreSQL API tests and a React/jsdom integration check
against a real temporary API server using the dedicated test database. The latter
exercises generation, live updates, body inspection, inert captured HTML, binary
Base64, session restoration, and history clearing. It does not verify visual layout.
