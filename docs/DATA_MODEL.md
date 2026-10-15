# Data model

## Collections

### `events` (source of truth)

One document per accepted tracker event:

| Field | Type | Notes |
|---|---|---|
| `eventId` | string (UUID) | Idempotency key; unique index |
| `siteId` | string | Grouping key, `[A-Za-z0-9_-]{1,80}` |
| `sessionId` | string (UUID) | Anonymous browser session |
| `type` | `page_view` \| `click` | |
| `pageUrl` | string | Normalized server-side to `origin + pathname` |
| `pathname` | string | Derived from `pageUrl` for grouping |
| `occurredAt` | BSON date | Client event time (validated, ≤ 1h future skew) |
| `receivedAt` | BSON date | Server receipt time; tie-breaker + TTL field |
| `coordinates` | `{x, y}` | Clicks only; document-relative pixels |
| `viewport` | `{width, height}` | CSS pixels at event time |
| `document` | `{width, height}` | Scroll dimensions at event time |
| `referrerOrigin` | string \| null | Origin only — never query strings |

Timestamps are stored as BSON dates (never strings) so range filters, sorts,
and indexes compare chronologically. A startup migration converts any legacy
ISO-string timestamps in place.

### `site_daily_stats` (precomputed)

`{ siteId, day: "YYYY-MM-DD", pageViews, clicks, events }` with a unique
`{siteId, day}` index. Incremented on ingest for genuinely new documents only;
backfilled at startup for days that predate the writer. Powers `/trends`
without scanning raw events.

### `rate_limits` (operational)

`{ _id: <client key>, hits, resetTime }` with TTL cleanup. Backs the
persistent rate limiter; the limiter fails open (with a loud log) if the
store is unreachable.

## Indexes and why each exists

| Index | Serves |
|---|---|
| `eventId` unique | Idempotent ingestion |
| `siteId, sessionId, occurredAt, receivedAt` | Session timelines (filter + sort) |
| `siteId, pageUrl, type, occurredAt` | Heatmap page/click queries |
| `siteId, occurredAt` (desc) | Session lists, summaries, trends over ranges |
| `receivedAt` TTL (optional) | `EVENT_RETENTION_DAYS` automatic expiry |

## Coordinate system

Stored coordinates are **document-relative** (`MouseEvent.pageX/pageY`), i.e.
measured from the top-left of the full scrolled document — not the viewport.
Each event also stores the viewport and document dimensions at capture time.
The heatmap normalizes per click (`x / document.width`) before placing markers
or binning grid cells, and clicks are segmented by viewport class (mobile ≤
767px, tablet ≤ 1024px, else desktop) so layouts never mix by default.

## Session rule

A session is the tracker's anonymous UUID, persisted in `localStorage` and
rotated after 30 minutes without a tracked event. The API never invents
sessions: summaries group by the stored `sessionId`, and session duration is
computed server-side (`lastActivityAt − startedAt`, in seconds).

## Retention

No expiry by default. Setting `EVENT_RETENTION_DAYS` creates the TTL index;
unsetting it drops the index again. No silent deletion is ever introduced.
