# QA checklist

Run before every submission. Check the box only with observed evidence.

## Automated

- [ ] `pnpm install` resolves from the lockfile
- [ ] `pnpm typecheck` passes (all four projects)
- [ ] `pnpm lint` passes with zero warnings
- [ ] `pnpm test` passes (contracts, tracker, API, dashboard)
- [ ] `pnpm smoke` passes (boot → ingest → dedup → reads)
- [ ] `pnpm build` succeeds for contracts, tracker, API, dashboard

## End-to-end (live, against the real stack)

- [ ] `pnpm start` boots API (`Connected to MongoDB`) + dashboard (`:5173`)
- [ ] Dashboard shows API connected (top-bar chip)
- [ ] Fresh demo visit creates a session ID in `localStorage`
- [ ] A page load emits exactly one `page_view`
- [ ] Clicks emit events with plausible X/Y coordinates
- [ ] Navigating demo pages keeps the same session ID
- [ ] New session appears in dashboard sessions within the date range
- [ ] Session timeline order matches the journey taken
- [ ] Heatmap page picker lists the clicked URL; markers match click spots
- [ ] Refresh keeps all data (persistence, not memory state)
- [ ] Invalid payload (`POST` garbage / bad UUID / future timestamp) → 4xx
- [ ] Stopped API: demo storefront still works; dashboard shows honest errors
- [ ] Restarted API: tracking resumes without duplicates inflating counts

## Visual / responsive

- [ ] 1440 / 1280 / 1024 / 768 / 390px widths all usable (drawer ≤720px)
- [ ] No layout shift between loading → loaded states
- [ ] Keyboard: tab reaches nav, filters, rows, buttons; focus ring visible
- [ ] Empty, loading, and error states reviewed on each page
- [ ] No console errors; no secrets in network payloads or bundles

## Submission hygiene

- [ ] No `.env`, credentials, logs, or `dist/` committed
- [ ] README setup works from a fresh clone
- [ ] Hosted dashboard, demo, tracker bundle, and `/health` all reachable
