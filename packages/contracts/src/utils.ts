export type ViewportClass = "mobile" | "tablet" | "desktop";

// Viewport class boundaries shared by the tracker and the API
// (classifyViewport below). Exported so server-side filters classify
// identically to the client.
export const MOBILE_MAX_WIDTH = 767;
export const TABLET_MAX_WIDTH = 1024;

export function classifyViewport(width: number): ViewportClass {
  if (width <= MOBILE_MAX_WIDTH) return "mobile";
  if (width <= TABLET_MAX_WIDTH) return "tablet";
  return "desktop";
}

export function canonicalPageUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "";
  }
  return `${parsed.origin}${parsed.pathname}`;
}

export function normalizeSiteId(raw: string): string {
  return raw.trim().slice(0, 80);
}
