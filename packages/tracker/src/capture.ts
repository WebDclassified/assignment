import { canonicalPageUrl } from "./utils.js";
import { getOrCreateSessionId, refreshActivity } from "./session.js";

const EXCLUDED_SELETERS = [
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"])',
  "textarea",
  "select",
  "[contenteditable]",
  "[data-analytics-ignore]",
  "input[type='password']",
];

export interface TrackerEvent {
  eventId: string;
  siteId: string;
  sessionId: string;
  type: "page_view" | "click";
  pageUrl: string;
  occurredAt: string;
  coordinates?: { x: number; y: number };
  viewport: { width: number; height: number };
  document: { width: number; height: number };
  referrerOrigin?: string | null;
}

export function buildPageView(siteId: string, pageUrl: string): TrackerEvent {
  const now = new Date();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const documentWidth = document.documentElement.scrollWidth || document.body.scrollWidth;
  const documentHeight = document.documentElement.scrollHeight || document.body.scrollHeight;

  return {
    eventId: crypto.randomUUID(),
    siteId,
    sessionId: getOrCreateSessionId(),
    type: "page_view",
    pageUrl,
    occurredAt: now.toISOString(),
    viewport: { width: viewportWidth, height: viewportHeight },
    document: { width: documentWidth, height: documentHeight },
    referrerOrigin: document.referrer
      ? (() => {
          try {
            return new URL(document.referrer).origin;
          } catch {
            return null;
          }
        })()
      : null,
  };
}

export function buildClick(event: MouseEvent, siteId: string, pageUrl: string): TrackerEvent | null {
  if (event.pageX == null || event.pageY == null) {
    return null;
  }

  const target = event.target as HTMLElement | null;
  if (target && isExcludedElement(target)) {
    return null;
  }

  const now = new Date();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const documentWidth = document.documentElement.scrollWidth || document.body.scrollWidth;
  const documentHeight = document.documentElement.scrollHeight || document.body.scrollHeight;

  return {
    eventId: crypto.randomUUID(),
    siteId,
    sessionId: getOrCreateSessionId(),
    type: "click",
    pageUrl,
    occurredAt: now.toISOString(),
    coordinates: {
      x: event.pageX,
      y: event.pageY,
    },
    viewport: { width: viewportWidth, height: viewportHeight },
    document: { width: documentWidth, height: documentHeight },
  };
}

export function isExcludedElement(element: HTMLElement): boolean {
  if (!element || !(element instanceof HTMLElement)) return false;
  if (element.matches(EXCLUDED_SELETERS.join(","))) return true;
  const tagName = element.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") return true;
  if (element.isContentEditable) return true;
  const editable = element.contentEditable;
  if (editable === "true" || editable === "plaintext-only") return true;
  return false;
}

let lastPageViewUrl = "";
let pageViewEmittedForNavigate = false;

export function maybeEmitPageView(siteId: string, enqueue: (event: string) => void): void {
  const url = canonicalPageUrl();
  if (!url) return;
  if (url === lastPageViewUrl && pageViewEmittedForNavigate) return;
  lastPageViewUrl = url;
  pageViewEmittedForNavigate = true;
  refreshActivity();
  const event = buildPageView(siteId, url);
  enqueue(JSON.stringify(event));
}

export function resetPageViewDedup(): void {
  lastPageViewUrl = "";
  pageViewEmittedForNavigate = false;
}
