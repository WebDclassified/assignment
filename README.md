# Pathlens — User Analytics

Session tracking and click-heatmap analytics: an embeddable browser tracker, an
Express + MongoDB ingestion/query API, and a React dashboard with demo sites
that generate real event data.

## Setup

Prerequisites: Node.js 20+, pnpm 10 (`packageManager` pins `pnpm@10.34.7`), and
a MongoDB Atlas cluster.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # then set the production MONGODB_URI
pnpm start                                # builds everything; API on :4000, dashboard on :5173
```

- Dashboard: http://localhost:5173 (API status chip must show connected)
- Demo store: http://localhost:5173/demo/ · blog: `/demo-blog/` · SPA: `/demo-spa/`
- API health: http://localhost:5173/health (forwarded to the API)

Only `MONGODB_URI` is required; database name, CORS origins, rate limits,
site tokens, and retention fall back to production defaults.

Generate demo data by browsing the demos — each page load emits one
`page_view`, every click is captured with coordinates. One browser profile
keeps one session for 30 minutes; for more sessions use an incognito window, a
second browser, cleared site data, or the demo homepage's testing tools.
Switch sites with the top-bar site picker. Typed input is never captured.

Useful commands: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`,
`pnpm smoke`, `pnpm --filter @pathlens/api test:integration`.

To deploy on Vercel: push to GitHub, import the repo (root directory stays at
the repo root — build, output, and rewrites come from `vercel.json`), set
`MONGODB_URI`, and allow `0.0.0.0/0` in Atlas Network Access. Dashboard, demos,
and API share one origin, so no CORS setup is needed.

## Tech stack

- **Tracker** (`packages/tracker`): dependency-free TypeScript, batched
  `fetch` + beacon/keepalive unload delivery, bundled to a script-tag IIFE
- **Contracts** (`packages/contracts`): Zod event/API schemas + shared types
- **API** (`apps/api`): Node.js 20, Express 4, official MongoDB driver,
  Helmet/CORS/rate-limit middleware, Vitest + Supertest
- **Dashboard** (`apps/dashboard`): React 19, Vite 6, hand-rolled CSS design
  tokens, Testing Library + jsdom
- **Database**: MongoDB Atlas (single `events` collection + precomputed
  `site_daily_stats`)
- **Hosting**: one Vercel project (static dashboard/demos + serverless API)

## Assumptions and trade-offs

- One `events` collection is the source of truth; sessions, journeys, and
  heatmaps are derived views, so retried deliveries cannot drift the counts.
- Event times are stored as BSON dates so range filters, sorting, and indexes
  compare chronologically; startup migrates any legacy string timestamps.
- `pageUrl` values are normalized server-side to `origin + pathname` (query
  and fragment stripped); `occurredAt` values more than one hour in the future
  are rejected as untrusted input.
- `siteId` is a grouping key, not a secret; CORS is not access control.
  Optional `SITE_READ_TOKENS` adds per-site read authorization when needed.
- Session identity and the 30-minute expiry live in the browser tracker;
  without browser storage the tracker falls back to an in-memory session for
  the current document.
- Aggregations run on read with bounded results (heatmap capped at 2000
  clicks, timelines paginated at 100/page). Daily per-site counters are
  precomputed on ingest to serve trend charts without scanning raw events; a
  queue belongs to a later scaling step, once measured load demands it.
- Rate-limit counters live in MongoDB so limits survive restarts and
  serverless isolates; the limiter fails open with a loud log if its store is
  unreachable. Every request carries an `X-Request-Id` for tracing.
