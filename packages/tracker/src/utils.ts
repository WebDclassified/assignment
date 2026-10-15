import type { ViewportClass } from "@pathlens/contracts";

const MOBILE_MAX_WIDTH = 767;
const TABLET_MAX_WIDTH = 1024;

export function canonicalPageUrl(): string {
  const url = location.origin + location.pathname;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "";
  }
}

export function classifyViewport(width: number): ViewportClass {
  if (width <= MOBILE_MAX_WIDTH) return "mobile";
  if (width <= TABLET_MAX_WIDTH) return "tablet";
  return "desktop";
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const hex = (value: number, length: number): string =>
    value.toString(16).padStart(length, "0");
  const random = (): number => Math.floor(Math.random() * 0x10000);
  return `${hex(random(), 8)}-${hex(random(), 4)}-4${hex(random() & 0x0fff, 3)}-${hex(0x8 + (random() & 0x3), 1)}${hex(random() & 0x0fff, 3)}-${hex(random(), 8)}${hex(random(), 4)}`;
}

