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

Setup and API documentation will be updated as each working feature is added.
