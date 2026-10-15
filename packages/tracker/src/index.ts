import { EventQueue } from "./queue.js";
import { deliverViaFetch, deliverForUnload } from "./transport.js";
import { maybeEmitPageView, resetPageViewDedup, buildClick } from "./capture.js";
import { getOrCreateSessionId } from "./session.js";
import { canonicalPageUrl, generateId } from "./utils.js";
import type { TrackerConfig } from "./types.js";

declare global {
  interface Window {
    pathlens?: {
      reset: () => void;
      debug: boolean;
      observeSpaNavigation: (onNavigate: () => void) => () => void;
      trackSpaNavigation: () => () => void;
    };
  }
}

const DEBUG_KEY = "pathlens_debug";
let debugEnabled = false;

function isDebugEnabled(): boolean {
  if (debugEnabled) return true;
  try {
    debugEnabled = window.localStorage.getItem(DEBUG_KEY) === "true";
  } catch {
    // ignore
  }
  return debugEnabled;
}

function log(...args: unknown[]): void {
  if (!isDebugEnabled()) return;
  if (typeof console !== "undefined" && console.log) {
    console.log("[pathlens]", ...args);
  }
}

function readConfig(): TrackerConfig | null {
  if (typeof document === "undefined") return null;
  const script = document.querySelector(
    "script[src][data-api-base]",
  ) as HTMLScriptElement | null;
  if (!script) return null;
  const apiBase = script.getAttribute("data-api-base");
  const siteId = script.getAttribute("data-site-id");
  // An empty data-api-base is valid: it means "same origin as the page",
  // which is how the tracker is configured on same-origin deployments.
  if (apiBase === null || !siteId) return null;
  return { apiBase: apiBase.trim(), siteId: siteId.trim() };
}

let config: TrackerConfig | null = null;
let queue: EventQueue | null = null;
let initialized = false;
let unloadHandlerAttached = false;

function init(): void {
  if (initialized) return;
  initialized = true;

  const cfg = readConfig();
  if (!cfg) {
    log("Tracker: missing configuration (data-api-base / data-site-id)");
    return;
  }
  config = cfg;

  log("Tracker: initializing with siteId=", cfg.siteId, "apiBase=", cfg.apiBase);

  queue = new EventQueue({
    onFlush: async (payload) => {
      const result = await deliverViaFetch(payload, cfg.apiBase);
      log("Tracker: flush result:", result);
      return result.accepted;
    },
    onError: (error) => {
      log("Tracker: flush error:", error);
    },
  });

  attachUnloadHandler();

  window.addEventListener("beforeunload", () => {
    if (queue) {
      queue.flushForUnload();
    }
  });

  // Unload delivery is beacon-first with a keepalive fetch fallback. The
  // server deduplicates by eventId, so an event delivered twice is stored
  // once; the priority is never losing the final batch on navigation.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && queue) {
        const payload = buildBatch();
        if (payload) {
          void deliverForUnload(payload, cfg.apiBase);
        }
      }
    });
  }

  if (typeof document !== "undefined") {
    document.addEventListener("pagehide", () => {
      if (queue) {
        const payload = buildBatch();
        if (payload) {
          void deliverForUnload(payload, cfg.apiBase);
        }
      }
    });
  }

  maybeEmitPageView(cfg.siteId, enqueueEvent);
}

function attachUnloadHandler(): void {
  if (unloadHandlerAttached) return;
  unloadHandlerAttached = true;

  if (typeof window === "undefined") return;

  const handleClick = (event: MouseEvent) => {
    if (!config || !queue) return;
    const url = canonicalPageUrl();
    if (!url) return;
    const clickEvent = buildClick(event, config.siteId, url);
    if (!clickEvent) return;
    enqueueEvent(JSON.stringify(clickEvent));
  };

  document.addEventListener("click", handleClick, true);
  // One page_view per document navigation: the URL dedup inside
  // maybeEmitPageView makes every later call a no-op for the same URL, so
  // these listeners only cover the case where init ran before the URL was
  // final. Resetting here would break that guarantee and emit duplicates.
  document.addEventListener("DOMContentLoaded", () => {
    if (config) {
      maybeEmitPageView(config.siteId, enqueueEvent);
    }
  });

  const handleNavigate = () => {
    if (!config) return;
    maybeEmitPageView(config.siteId, enqueueEvent);
  };

  window.addEventListener("load", handleNavigate);
  window.addEventListener("pageshow", handleNavigate);
}

function enqueueEvent(payload: string): void {
  if (!queue) return;
  queue.enqueue(payload);
}

// Zero-configuration SPA tracking: patches history once and emits a page
// view through the normal pipeline whenever the canonical URL changes.
// Same-URL transitions are dropped by the page-view dedup.
export function trackSpaNavigation(): () => void {
  return observeSpaNavigation(() => {
    if (config) {
      maybeEmitPageView(config.siteId, enqueueEvent);
    }
  });
}

// Explicit opt-in for single-page apps: pushState/replaceState never fire
// navigation events on their own, so full-document listeners miss client-side
// route changes. Patched exactly once per document; the page_view dedup in
// maybeEmitPageView keeps same-URL transitions from emitting twice.
let spaCleanup: (() => void) | null = null;

export function observeSpaNavigation(onNavigate: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (spaCleanup) return spaCleanup;

  const history = window.history;
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args: [unknown, string, string | URL | null | undefined]): void {
    originalPushState(...args);
    onNavigate();
  };
  history.replaceState = function (...args: [unknown, string, string | URL | null | undefined]): void {
    originalReplaceState(...args);
    onNavigate();
  };
  const handlePopState = (): void => {
    onNavigate();
  };
  window.addEventListener("popstate", handlePopState);

  spaCleanup = () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", handlePopState);
    spaCleanup = null;
  };
  return spaCleanup;
}

function buildBatch(): string | null {
  if (!queue || !config) return null;
  const payloads = queue.getPendingPayloads();
  if (payloads.length === 0) return null;
  const events = payloads.map((payload) => JSON.parse(payload) as object);
  return JSON.stringify({ events });
}

function reset(): void {
  initialized = false;
  config = null;
  if (queue) {
    queue.clear();
    queue = null;
  }
  unloadHandlerAttached = false;
  resetPageViewDedup();
  try {
    window.localStorage.removeItem("pathlens_debug");
  } catch {
    // ignore
  }
  debugEnabled = false;
}

function setDebug(value: boolean): void {
  debugEnabled = value;
  try {
    window.localStorage.setItem(DEBUG_KEY, String(value));
  } catch {
    // ignore
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
}

if (typeof window !== "undefined") {
  const api = window.pathlens ?? { reset, debug: false, observeSpaNavigation, trackSpaNavigation };
  api.reset = reset;
  api.debug = false;
  api.observeSpaNavigation = observeSpaNavigation;
  api.trackSpaNavigation = trackSpaNavigation;
  Object.defineProperty(api, "debug", {
    get() {
      return debugEnabled;
    },
    set(value) {
      setDebug(value);
    },
    configurable: true,
  });
  window.pathlens = api;
}

export type { TrackerConfig };
export { canonicalPageUrl, generateId, getOrCreateSessionId, reset, isDebugEnabled };
