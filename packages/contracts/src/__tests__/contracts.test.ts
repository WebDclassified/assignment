import { describe, it, expect } from "vitest";
import {
  canonicalPageUrl,
  classifyViewport,
  normalizeSiteId,
} from "../utils.js";
import { eventSchema, eventBatchSchema, isClickEvent } from "../schemas.js";
import type { AnalyticsEvent } from "../types.js";

describe("canonicalPageUrl", () => {
  it("keeps origin and pathname", () => {
    expect(canonicalPageUrl("https://shop.example.test/products?ref=email#top")).toBe(
      "https://shop.example.test/products",
    );
  });

  it("strips query and fragment", () => {
    expect(
      canonicalPageUrl("https://shop.example.test/search?q=headphones&sort=price#results"),
    ).toBe("https://shop.example.test/search");
  });

  it("rejects non-http(s) URLs", () => {
    expect(canonicalPageUrl("mailto:test@example.test")).toBe("");
    expect(canonicalPageUrl("javascript:void(0)")).toBe("");
  });

  it("returns empty for invalid URLs", () => {
    expect(canonicalPageUrl("not a url")).toBe("");
  });

  it("keeps trailing slash in pathname", () => {
    expect(canonicalPageUrl("https://shop.example.test/")).toBe("https://shop.example.test/");
  });
});

describe("classifyViewport", () => {
  it("classifies mobile at 767px and below", () => {
    expect(classifyViewport(390)).toBe("mobile");
    expect(classifyViewport(767)).toBe("mobile");
  });

  it("classifies tablet from 768px to 1024px", () => {
    expect(classifyViewport(768)).toBe("tablet");
    expect(classifyViewport(1024)).toBe("tablet");
  });

  it("classifies desktop above 1024px", () => {
    expect(classifyViewport(1025)).toBe("desktop");
    expect(classifyViewport(1440)).toBe("desktop");
  });
});

describe("normalizeSiteId", () => {
  it("trims and caps length", () => {
    expect(normalizeSiteId("  demo-store  ")).toBe("demo-store");
    expect(normalizeSiteId("a".repeat(120))).toHaveLength(80);
  });
});

describe("eventSchema", () => {
  it("accepts a valid page_view without coordinates", () => {
    const result = eventSchema.safeParse({
      eventId: "0b1fc2d6-ec27-4584-97c2-4c86a83a0dbb",
      siteId: "demo-store",
      sessionId: "4c2db6ba-70e9-4bb3-a028-8a70de2f6dbf",
      type: "page_view",
      pageUrl: "https://shop.example.test/products/headphones",
      occurredAt: "2026-10-14T12:00:03.451Z",
      viewport: { width: 1440, height: 900 },
      document: { width: 1440, height: 2400 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid click with coordinates", () => {
    const result = eventSchema.safeParse({
      eventId: "e20c70dc-6f03-4f38-ae68-079f1f61b9e4",
      siteId: "demo-store",
      sessionId: "4c2db6ba-70e9-4bb3-a028-8a70de2f6dbf",
      type: "click",
      pageUrl: "https://shop.example.test/products/headphones",
      occurredAt: "2026-10-14T12:00:03.451Z",
      coordinates: { x: 522, y: 418 },
      viewport: { width: 1440, height: 900 },
      document: { width: 1440, height: 2400 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a page_view that includes coordinates", () => {
    const result = eventSchema.safeParse({
      eventId: "0b1fc2d6-ec27-4584-97c2-4c86a83a0dbb",
      siteId: "demo-store",
      sessionId: "4c2db6ba-70e9-4bb3-a028-8a70de2f6dbf",
      type: "page_view",
      pageUrl: "https://shop.example.test/",
      occurredAt: "2026-10-14T12:00:00.000Z",
      coordinates: { x: 0, y: 0 },
      viewport: { width: 1440, height: 900 },
      document: { width: 1440, height: 2400 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a click without coordinates", () => {
    const result = eventSchema.safeParse({
      eventId: "e20c70dc-6f03-4f38-ae68-079f1f61b9e4",
      siteId: "demo-store",
      sessionId: "4c2db6ba-70e9-4bb3-a028-8a70de2f6dbf",
      type: "click",
      pageUrl: "https://shop.example.test/",
      occurredAt: "2026-10-14T12:00:03.451Z",
      viewport: { width: 1440, height: 900 },
      document: { width: 1440, height: 2400 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unsupported event type", () => {
    const result = eventSchema.safeParse({
      eventId: "0b1fc2d6-ec27-4584-97c2-4c86a83a0dbb",
      siteId: "demo-store",
      sessionId: "4c2db6ba-70e9-4bb3-a028-8a70de2f6dbf",
      type: "scroll",
      pageUrl: "https://shop.example.test/",
      occurredAt: "2026-10-14T12:00:00.000Z",
      viewport: { width: 1440, height: 900 },
      document: { width: 1440, height: 2400 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative coordinates", () => {
    const result = eventSchema.safeParse({
      eventId: "e20c70dc-6f03-4f38-ae68-079f1f61b9e4",
      siteId: "demo-store",
      sessionId: "4c2db6ba-70e9-4bb3-a028-8a70de2f6dbf",
      type: "click",
      pageUrl: "https://shop.example.test/",
      occurredAt: "2026-10-14T12:00:03.451Z",
      coordinates: { x: -1, y: 5 },
      viewport: { width: 1440, height: 900 },
      document: { width: 1440, height: 2400 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-URL pageUrl", () => {
    const result = eventSchema.safeParse({
      eventId: "0b1fc2d6-ec27-4584-97c2-4c86a83a0dbb",
      siteId: "demo-store",
      sessionId: "4c2db6ba-70e9-4bb3-a028-8a70de2f6dbf",
      type: "page_view",
      pageUrl: "not-a-url",
      occurredAt: "2026-10-14T12:00:00.000Z",
      viewport: { width: 1440, height: 900 },
      document: { width: 1440, height: 2400 },
    });
    expect(result.success).toBe(false);
  });
});

function makePageViewEvent(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    eventId: "0b1fc2d6-ec27-4584-97c2-4c86a83a0dbb",
    siteId: "demo-store",
    sessionId: "4c2db6ba-70e9-4bb3-a028-8a70de2f6dbf",
    type: "page_view",
    pageUrl: "https://shop.example.test/",
    occurredAt: "2026-10-14T12:00:00.000Z",
    viewport: { width: 1440, height: 900 },
    document: { width: 1440, height: 2400 },
    ...overrides,
  };
}

function makeClickEvent(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    eventId: "e20c70dc-6f03-4f38-ae68-079f1f61b9e4",
    siteId: "demo-store",
    sessionId: "4c2db6ba-70e9-4bb3-a028-8a70de2f6dbf",
    type: "click",
    pageUrl: "https://shop.example.test/",
    occurredAt: "2026-10-14T12:00:03.451Z",
    coordinates: { x: 522, y: 418 },
    viewport: { width: 1440, height: 900 },
    document: { width: 1440, height: 2400 },
    ...overrides,
  };
}

describe("eventBatchSchema", () => {
  it("rejects an empty batch", () => {
    const result = eventBatchSchema.safeParse({ events: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a batch larger than 50 events", () => {
    const result = eventBatchSchema.safeParse({
      events: Array.from({ length: 51 }, (_, i) =>
        makePageViewEvent({ eventId: `00000000-0000-0000-0000-0000000000${String(i).padStart(2, "0")}` }),
      ),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a batch of one valid event", () => {
    const result = eventBatchSchema.safeParse({
      events: [makePageViewEvent()],
    });
    expect(result.success).toBe(true);
  });
});

describe("isClickEvent", () => {
  it("returns true for a click event with coordinates", () => {
    expect(
      isClickEvent(
        makeClickEvent({ eventId: "e20c70dc-6f03-4f38-ae68-079f1f61b9e4" }),
      ),
    ).toBe(true);
  });

  it("returns false for a page_view", () => {
    expect(
      isClickEvent(makePageViewEvent()),
    ).toBe(false);
  });
});
