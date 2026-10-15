# API reference

Base path: `/api/v1`. All timestamps are ISO 8601 UTC. The full machine
contract lives in `pathlens_user_analytics_implementation_pack/spec/openapi.yaml`.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness + DB readiness. `200 {status: ok, database: connected}` or `503 DATABASE_UNAVAILABLE`. Never rate-limited. |
| `POST` | `/api/v1/events` | Ingest 1–50 validated events as JSON (or JSON sent as `text/plain` for beacons). Answers `202 {accepted, duplicates}`. |
| `GET` | `/api/v1/summary` | Distinct sessions, page views, clicks, average events/session for `siteId` + range. |
| `GET` | `/api/v1/sessions` | Session summaries with `page`/`pageSize` (≤ 100), optional `search`/`from`/`to`, and distinct-session totals. |
| `GET` | `/api/v1/sessions/:sessionId/events` | Ordered timeline; `sessionId` must be a UUID; `page`/`pageSize` (default 100, max 1000). |
| `GET` | `/api/v1/heatmap/pages` | Click-bearing pages for the range, sorted by clicks. |
| `GET` | `/api/v1/heatmap/clicks` | ≤ 2000 coordinates for a page + viewport class; optional `grid=5..50` adds a server-side density grid. |
| `GET` | `/api/v1/trends` | Per-day `{date, pageViews, clicks, events}`; missing days are zero-filled. |

## Validation

Every event and query parameter is validated with Zod at the boundary:
UUID formats, `siteId` charset/length, click-vs-page_view coordinate rules,
finite non-negative coordinates, bounded dimensions, `http(s)`-only page URLs,
`occurredAt` within one hour of server time, batch size 1–50, 1 MiB body cap.

## Errors

Stable envelope `{ error: { code, message, details? } }`. Codes:
`VALIDATION_ERROR` (400), `UNAUTHORIZED` (401, only when site tokens are
configured), `FORBIDDEN` (403), `PAYLOAD_TOO_LARGE` (413), `RATE_LIMITED`
(429), `DATABASE_UNAVAILABLE` (503), `INTERNAL_ERROR` (500). Stack traces and
connection details never leave the server; unexpected errors are JSON-logged
with the request ID (also returned as the `X-Request-Id` header).

## Authorization

No authentication in the default demo posture. Setting `SITE_READ_TOKENS`
(`site:token` pairs) requires the token — via `x-site-token` header or `token`
query parameter — on read endpoints for listed sites. Ingestion stays open by
design: a browser tracker cannot keep a secret.

## Rate limiting

Sliding-window limits (default 120 req/min) backed by MongoDB, so limits hold
across restarts and serverless isolates. `/health` is exempt, and the limiter
fails open with a loud log if its store is unreachable.
