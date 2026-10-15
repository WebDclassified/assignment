# Tracker SDK

Package: `packages/tracker` — dependency-free TypeScript, bundled to
`dist/pathlens-tracker.js`. It must never depend on React or the dashboard.

## Installation

```html
<script
  src="https://your-app.vercel.app/demo/tracker-entry.js"
  data-api-base="https://your-app.vercel.app"
  data-site-id="demo-store"
  defer
></script>
```

`data-api-base=""` means "same origin as the page". `data-site-id` is a
grouping key, not a secret.

## Lifecycle

1. On load, reads its configuration from its own script tag. Missing config
   disables tracking silently — the host page is never affected.
2. Resolves the session ID: reuse the stored ID while activity is within the
   30-minute window, otherwise mint a new UUID. Without working storage, an
   in-memory ID covers the current document.
3. Emits exactly one `page_view` per canonical URL
   (`origin + pathname`; query and fragment stripped).
4. Listens for clicks in the capture phase; skips inputs, textareas, selects,
   password fields, content-editable regions, and `data-analytics-ignore`
   subtrees; never reads values or element text.

## Delivery

Events queue in memory and flush on 10 events, after 2 seconds, on
`visibilitychange`/`pagehide` (beacon-first, keepalive-`fetch` fallback), and
on `beforeunload`. Batches stay under 48 KiB; failed batches retry up to three
times, then the queue stops draining until the next flush — the server's
`eventId` unique index makes any redelivery safe.

## SPA support (opt-in)

Full-document navigations are tracked automatically. Single-page apps call:

```js
window.pathlens.observeSpaNavigation(() => {
  // the tracker re-emits only when the canonical URL actually changed
});
```

The history methods are patched exactly once per document; cleanup restores
the originals. Same-URL transitions never duplicate thanks to page-view dedup.

## Failure contract

No uncaught errors, no synchronous XHR, no navigation blocking, no unbounded
retries, no verbose logging unless `pathlens.debug` is enabled.
