# Current-state audit — Pathlens User Analytics

Date: 2026-10-16. Owner: Prabhat Teotia.
Method: full repository read (every source file), test suite runs (110 tests),
production build runs, and live end-to-end runs against MongoDB Atlas.
No finding below is invented; each maps to code, a test, or an observed run.

## 1. Existing architecture

pnpm monorepo (`pnpm@10.34.7`, Node ≥ 20):

- `packages/contracts` — shared Zod schemas + TypeScript types (`@pathlens/contracts`)
- `packages/tracker` — framework-free browser SDK, bundled to IIFE (`dist/pathlens-tracker.js`)
- `apps/api` — Express + TypeScript + MongoDB driver (`@pathlens/api`)
- `apps/dashboard` — React 19 + Vite dashboard **and** the static demo storefront (`/demo/…`)
- `api/index.ts` — Vercel serverless entry that reuses the Express app
- `pathlens_user_analytics_implementation_pack/` — the binding specification (read in full, not modified)

Request flow: demo page → tracker (queue → fetch/beacon) → `POST /api/v1/events`
→ Zod validation → normalization → MongoDB `events` → aggregation read
endpoints → React dashboard. One `pnpm start` boots the production API (:4000)
plus the production dashboard build (:5173, API calls proxied same-origin).

## 2. Existing technologies

TypeScript 5.9 (strict, `noUnusedLocals`), Zod 3, Express 4, express-rate-limit 7,
helmet, cors, mongodb driver 6, React 19, Vite 6, Tailwind 3 (tokens present;
most styling is hand-written CSS variables), Vitest 2 + Supertest,
mongodb-memory-server, esbuild (tracker bundle).

## 3. Existing routes (all versioned under `/api/v1`, per the pack's OpenAPI)

| Method | Route | State |
|---|---|---|
| `GET` | `/health` | Working — 200 connected / 503 `DATABASE_UNAVAILABLE` |
| `POST` | `/api/v1/events` | Working — 202 `{accepted, duplicates}`, JSON + `text/plain` |
| `GET` | `/api/v1/summary` | Working — distinct-session counts for the range |
| `GET` | `/api/v1/sessions` | Working — search, pagination, range filter |
| `GET` | `/api/v1/sessions/:sessionId/events` | Working — UUID-validated, paginated timeline |
| `GET` | `/api/v1/heatmap/pages` | Working — click-bearing pages, date-filtered |
| `GET` | `/api/v1/heatmap/clicks` | Working — viewport filter + server-side density grid |
| `GET` | `/api/v1/trends` | Working — zero-filled daily rollups |

## 4. Existing database structure

- `events`: `eventId` (unique), `siteId`, `sessionId`, `type`, canonical
  `pageUrl`, derived `pathname`, `occurredAt`/`receivedAt` as **BSON dates**,
  `coordinates` (clicks only), `viewport`, `document`, `referrerOrigin`.
- `site_daily_stats`: `{siteId, day}` unique — precomputed counters.
- `rate_limits`: persistent rate-limit buckets with TTL cleanup.
- Startup: creates indexes, migrates legacy string timestamps to dates,
  backfills missing rollup days, manages the optional retention TTL index.

## 5. Existing tracker behavior

One `page_view` per navigation (URL-deduped,incl. opt-in SPA hook), capture-phase
clicks with document-relative coordinates, input/password/textarea/select/
contenteditable/`data-analytics-ignore` exclusions, 30-minute inactivity session
rotation in `localStorage` with an in-memory fallback, 10-event/2s batching with
full-drain flush and bounded retries, `fetch` + beacon-first/keepalive-fallback
unload delivery, RFC 4122 v4 IDs, silent failure, debug flag.

## 6. Existing dashboard behavior

Overview (KPIs + 14-day activity chart + recent sessions + sticky journey panel),
Sessions (debounced search, pagination, duration column, journey + show-more),
Heatmaps (page/device incl. all-devices aggregate, Heat/Points/Grid modes over a
labeled layout preview, device breakdown). Working custom date ranges, mobile
drawer nav, API status chip, session copy/export, hash deep links, skeleton
loading, and code-split routes. All numbers come from the API.

## 7. Working features (verified)

End-to-end ingestion → storage → aggregation → dashboard rendering (observed live
against Atlas); idempotent retries; date-range filtering on every read endpoint;
validation rejections (400s); CORS behavior incl. origin-less requests; health
readiness semantics; 110/110 tests green; production build green; `pnpm smoke`
(9 checks) green.

## 8. Broken features

None at audit time. (Previously broken and already fixed: string-vs-Date range
queries, repository ignoring `MONGODB_DATABASE`, duplicate counting under the
unique index, non-RFC session IDs, queue leaving >10-event bursts unflushed,
`null`-origin CORS bypass, dead dev-script filters, missing dashboard CSS class
conventions, stale hard-coded CSS asset link.)

## 9. Missing assignment requirements

- **Server-side session duration.** The pack's session example implies it and
  the brief lists duration; it is currently derived client-side. → Implement.
- **Browser-level smoke test.** Replaced deliberately with a dependency-free
  Node smoke script (`pnpm smoke`) that exercises the same path; documented.
- **Separate Pages / Realtime / User-Journey nav items.** Deliberately NOT built:
  a Pages screen has no page-view-per-page data source and a Realtime screen
  would need fake "live" numbers. Journey detail lives inside Sessions/Overview.
- **User-agent storage.** Deliberately NOT stored: the binding privacy spec
  limits collection to session/type/URL/timestamps/coordinates/dimensions.
- API base is `/api/v1/*`, not the brief's illustrative `/api/*` — versioning
  kept intentionally; documented in README + `docs/API.md`.

## 10. Performance issues

- Dashboard bundle ~260 KB total with route-level code splitting already in
  place (per-route chunks ≈ 8–11 KB). No further action needed at this scale.
- No N+1 or blocking calls found; aggregations are single-pipeline with
  `$match` first and matching indexes. No unindexed sorts observed.
- Heatmap raw-point cap (2000) + server grid (5000-point scan) bound the heavy
  path; timelines paginate at 100/page.

## 11. UX issues (to fix in this pass)

- Error states all read "Something went wrong" — replace with specific,
  actionable copy per context.
- No manual refresh / freshness indicator while demo traffic arrives.
- `App.css` duplicates layout rules already in `index.css` — remove the copy.

## 12. Visual/design issues (to fix in this pass)

- Decorative lavender radial washes on `body` violate the no-gradient rule —
  remove; keep surfaces flat with borders.
- Radius scale too large (card 18px, panel 22px, sidebar 248px) for the
  minimal-premium direction — tighten (cards 12px, controls 8px, sidebar 220px).
- Card shadows on everything — reduce reliance, let borders carry structure.
- KPI cards roomy (20px padding, 28px values) — compact them.
- Drawer transition 240ms — bring inside the 120–200ms budget.

## 13. Security concerns

- No secrets in code; `.env*` git-ignored; `VITE_*` vars are public-only. OK.
- Public ingestion + open reads are the documented demo posture; optional
  `SITE_READ_TOKENS` + `EVENT_RETENTION_DAYS` exist for stricter deployments.
- No Mongo injection vectors found (all filters built from validated scalars;
  search term regex-escaped).

## 14. Recommended changes (this pass)

1. Server-side `durationSeconds` on session summaries; use it in the UI.
2. Specific error titles per failing panel.
3. Refresh control + "updated N seconds ago" freshness indicator.
4. Visual tightening listed in §12 + delete `App.css`.
5. Root docs: `ARCHITECTURE.md`, `DATA_MODEL.md`, `API.md`, `TRACKER.md`,
   `DESIGN_SYSTEM.md`, `QA_CHECKLIST.md`, `IMPLEMENTATION_REPORT.md`.
6. Full verification + live end-to-end (21-step flow, browser steps performed
   via equivalent HTTP-level checks where no browser driver exists here).

## 15. Risks of changing existing code

- Response-shape changes break the dashboard contract — mitigate by additive
  changes only (verified by the 110-test suite after every change).
- CSS tightening can regress small screens — mitigate by keeping every
  breakpoint and re-checking the responsive rules while editing.
- Touching ingest affects stored data — mitigate by keeping validation
  behavior identical and proving dedup/counts via tests.
