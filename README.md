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
