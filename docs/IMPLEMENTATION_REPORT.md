# Implementation report — Pathlens User Analytics

Owner: Prabhat Teotia. Date: 2026-10-16.
Method: AUDIT → PLAN → IMPLEMENT → TEST → POLISH → VERIFY. No blind rewrite;
every change below traces to an audit finding, a spec requirement, or an
observed failure. Full detail in `docs/CURRENT_STATE_AUDIT.md`.

## What was inspected

Every source file across `packages/contracts`, `packages/tracker`,
`apps/api`, `apps/dashboard` (+ demos), `vercel.json`,
environment templates, the implementation pack (all 14 docs + specs), and the
design tokens/concept image. Plus: full test runs, production builds, and live
runs against MongoDB Atlas.

## What was already working

Complete pipeline (tracker → API → Mongo → dashboard), idempotent ingestion,
validation rejections, CORS/helmet/rate limiting, session aggregation,
paginated sessions, timelines, heatmaps with viewport segmentation, trends
groundwork, mobile drawer, deep links, demo journeys, one-terminal `pnpm
start`, Vercel same-origin deployment, and 101 passing tests.

## What was broken (root causes, all fixed)

1. **Sessions never appeared with a date range**: `occurredAt` stored as
   BSON strings while queries compared BSON dates (dates always sort above
   strings). Fixed by storing real dates + a startup migration. Reproduced
   first with a failing test (`expected 0 to be 2`).
2. **Rate limiter crashing readiness**: the Mongo-backed limiter threw inside
   `next(error)` on DB outage, masking `/health` with a 500. Fixed with
   store-level fail-open (loud log) plus `/health` exemption.
3. **Dashboard CSS class mismatch** (fixed earlier): stylesheet used
   `snake_case`, components `kebab-case`.
4. Several smaller defects fixed earlier in the session (DB-name ignored by
   the repository, duplicate counting under the unique index, non-RFC session
   IDs, queue drain, `null`-origin CORS bypass, dead dev filters, stale CSS
   asset link).

## What was changed (this pass)

- **API**: `GET /api/v1/trends` (zero-filled daily rollups); paginated session
  timelines (`page`/`pageSize` + totals); server-computed `durationSeconds`;
  UUID-validated `sessionId` (400); `/health` 503 `DATABASE_UNAVAILABLE`;
  server-side density grid (`grid=5..50`); optional per-site read tokens
  (`SITE_READ_TOKENS`); optional retention TTL (`EVENT_RETENTION_DAYS`);
  Mongo-backed rate limiting with fail-open; request IDs + JSON logs.
- **Contracts**: `pathname` on stored events, `durationSeconds` on sessions,
  `http(s)`-only URLs, future-timestamp rejection, `HeatmapGrid` types.
- **Tracker**: opt-in `observeSpaNavigation()` (also on `window.pathlens`).
- **Dashboard**: activity chart, timeline show-more, hash deep links, skeleton
  loaders, onboarding steps, specific error titles, refresh + freshness,
  code-split routes — all on real API data only.
- **Docs**: this set (`AUDIT`, `ARCHITECTURE`, `DATA_MODEL`, `API`,
  `TRACKER`, `DESIGN_SYSTEM`, `QA_CHECKLIST`, `IMPLEMENTATION_REPORT`) +
  README API reference/assumptions.
- **Design**: flat surfaces, tightened radii (6/8/12/14), 220px sidebar,
  compact KPIs, hairline shadows, 200ms motion budget, deleted duplicate
  `App.css`.

## Deliberate non-changes (with reasons)

- No separate Pages/Realtime nav screens — no honest data source exists for
  them; journey detail lives in Sessions/Overview.
- No user-agent storage — the binding privacy spec forbids extra collection.
- No Playwright — replaced with a dependency-free Node smoke script runnable
  in this environment.
- API stays `/api/v1/*` (versioned beats the brief's illustrative `/api/*`).

## Tests performed

- `pnpm install` (lockfile current), `typecheck`, `lint` (zero warnings)
- **111/111 tests pass**: 21 contracts, 44 tracker, 29 API, 17 dashboard —
  including 20+ new regression tests for every fix above
- `pnpm build` clean (route-split chunks emitted)
- `pnpm smoke`: 9/9 checks against a throwaway database
- Live E2E vs Atlas from one `pnpm start`: health connected, date-filtered
  summary/sessions/trends return real data, grid heatmap bins real clicks,
  server `durationSeconds` verified against actual timestamps (5824s).

## Follow-up pass (dark theme, responsive, multi-session testing)

- **Dark theme, zero decorative gradients**: the full token set was converted
  to a dark palette (`color-scheme: dark`); the one remaining gradient (trend
  bars) was flattened, the body washes removed. Heatmap data colors and the
  skeleton shimmer remain as functional exceptions.
- **Legend alignment bug fixed**: legend labels were rendered inside 16px
  color swatches; labels now sit beside 12px swatches.
- **Responsive pass**: wrapping panel/topbar/timeline headers, scroll-safe
  tables with `min-width`, 2-column KPI grid on phones, hidden trend-day
  labels under 720px, wrapping heatmap legend.
- **Multi-session testing**: the demo homepage gained a collapsed
  testing-tools panel (start-new-session, clear-cart) plus README
  documentation of all four session-creation methods.

## Follow-up pass (multi-site, alignment, dark theme)

- **`GET /api/v1/sites`** lists known sites with event/session totals; the
  dashboard top bar gained a persisted site switcher so all three demos
  (`demo-store`, `demo-blog`, `demo-spa`) are explorable without rebuilds.
- **Two new demos**: an editorial blog (3 pages) and a History-API SPA that
  wires the tracker's SPA route hook; both ship in the Vite build with
  cross-demo footer links.
- **Tracker**: new `trackSpaNavigation()` convenience wrapper (also on
  `window.pathlens`).
- **Alignment pass**: fixed heatmap legend labels (were inside 16px swatches),
  table edge-bleed vs panel padding, selection restyle without layout shift,
  wrapping headers, scroll-safe tables, 2-column phone KPIs.
- **Dark theme**: full token conversion, decorative gradients removed; only
  data heat colors and the skeleton shimmer remain.
- Verified live: blog journey ingested, `/sites` lists both sites, per-site
  summaries isolated, grid binning correct; probe documents removed after.

## Follow-up pass (alignment audit, live-page heatmaps)

- **Heatmap live preview root-caused**: demo pages rendered unstyled inside
  the preview because `sandbox=""` gives an opaque origin, which fails the
  CORS fetch for Vite's `crossorigin` stylesheet links (verified: no
  `Access-Control-Allow-Origin` on static assets). Fixed with
  `sandbox="allow-same-origin"` — scripts stay blocked, styles apply, markers
  align to the real layout.
- **Alignment audit**: verified every JSX class has a matching selector;
  fixed legend labels overflowing 16px swatches, table edge-bleed, selection
  layout shift, wrapping headers, scroll-safe tables, tablet rail overflow,
  and control-height rhythm.
- All 113 tests green; production build + live Atlas verification repeated.

## Follow-up pass (Vercel services migration)

- `vercel.json` converted to services mode: `api` (Express, `apps/api`) and
  `dashboard` (Vite, `apps/dashboard`) on one domain. Verified from the docs
  that services receive original paths, the filesystem wins over the SPA
  fallback, and `maxDuration: 30` was safe to drop (300s default everywhere).
- Zero bindings: the only cross-service traffic is browser-side fetch over
  public rewrites; the API only calls external Atlas.
- Each service builds `@pathlens/contracts` first (gitignored `dist` would
  otherwise break fresh-clone builds).
- Deleted repo-root `api/` (invalid + duplicate-function risk in services
  mode) and the now-unreferenced `src/serverless.ts`. `src/server.ts` left
  untouched — it already matches the documented Express detection pattern.
- README + architecture docs updated for the services topology.

## Follow-up pass (Vercel missing-module fix)

- Production logs showed `Cannot find module 'mongodb'` with require stack at
  `apps/api/package.json` — identical under the old single-function config and
  the new services config, proving the bug is Vercel's function packaging
  (bare imports externalized, pnpm-symlinked `node_modules` unusable at
  runtime), not the routing topology.
- Fix: the api service now builds a self-contained esbuild bundle
  (`dist/server.bundle.cjs`, mongodb inlined, optional native deps external)
  and serves it via `entrypoint`. Proven locally: the bundle boots against
  Atlas, ingests, deduplicates, and serves reads with no `node_modules`
  involvement (no `require("mongodb")` remains in the bundle).
- `vercel.json` api service gained the explicit `entrypoint`; dashboard
  service unchanged.

## Remaining limitations

- Session timelines cap at 100/page (documented, paginated).
- Trends/rollups only cover post-migration history for brand-new databases
  (startup backfill covers pre-existing data).
- Read endpoints have no auth unless `SITE_READ_TOKENS` is configured
  (documented demo posture).
- Browser-based visual review was performed via code + jsdom + production
  build inspection; no screenshot driver exists in this environment.
