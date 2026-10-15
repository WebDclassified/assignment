# Architecture

Pathlens is a pnpm monorepo with four workspace packages and one serverless entry.

```text
pathlens/
├── packages/
│   ├── contracts/      # shared Zod schemas + TypeScript types
│   └── tracker/        # framework-free browser SDK (IIFE bundle)
├── apps/
│   ├── api/            # Express API (long-lived server + serverless)
│   └── dashboard/      # React dashboard + static demo storefront (/demo)
├── api/
│   └── index.ts        # Vercel serverless entry (reuses the Express app)
└── docs/               # this documentation set
```

## Request flow

1. A demo (or third-party) page loads the tracker via one script tag carrying
   `data-api-base` and `data-site-id`.
2. The tracker emits `page_view` once per navigation and `click` events with
   document-relative coordinates, queuing them in memory.
3. Batches flush over `fetch`; `pagehide`/`visibilitychange` flush via
   `navigator.sendBeacon` with a keepalive-`fetch` fallback.
4. `POST /api/v1/events` validates (Zod), normalizes (canonical URL,
   `pathname`, BSON dates), and inserts with `ordered: false`. The `eventId`
   unique index makes retries idempotent; the response reports
   `{ accepted, duplicates }`.
5. Reads aggregate the single `events` collection; per-day counters are
   precomputed into `site_daily_stats` on ingest.
6. The React dashboard renders only API data across Overview, Sessions, and
   Heatmaps views.

## Why this shape

- The tracker has no React/dashboard dependency so it can run on any site.
- The API owns validation, normalization, and storage; route handlers stay thin
  and all MongoDB access lives in the repository layer.
- Sessions are derived views over the event stream, never separately stored
  counters — retries therefore cannot drift the totals.
- The same Express app serves both the long-lived Node process
  (`src/server.ts`) and Vercel serverless (`api/index.ts`), which rebuilds the
  app once per isolate and reuses the MongoDB connection.

## Deliberate non-goals

No authentication (open demo posture with optional read tokens), no message
queue, no precomputed session tables, no microservices. Scaling steps from
here: async ingest queue, more rollups, analytics-optimized store — only once
measured load demands them.
