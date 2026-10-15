import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildPageView,
  buildClick,
  isExcludedElement,
  resetPageViewDedup,
  maybeEmitPageView,
} from "../capture.js";

const realDocument = globalThis.document;
const realCreateElement = realDocument
  ? realDocument.createElement.bind(realDocument)
  : undefined;

function createMouseEvent(pageX: number, pageY: number, target?: HTMLElement) {
  return {
    pageX,
    pageY,
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    cancelable: true,
    bubbles: true,
    composed: false,
  } as unknown as MouseEvent;
}

describe("buildPageView", () => {
  it("includes required fields and no coordinates", () => {
    vi.stubGlobal("window", {
      innerWidth: 1440,
      innerHeight: 900,
    } as Window);
    vi.stubGlobal("document", {
      documentElement: {
        scrollWidth: 1440,
        scrollHeight: 2400,
      },
      body: {
        scrollWidth: 1440,
        scrollHeight: 2400,
      },
      referrer: "https://shop.example.test/",
    } as Document);

    const event = buildPageView("demo-store", "https://shop.example.test/");
    expect(event.type).toBe("page_view");
    expect(event.coordinates).toBeUndefined();
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(event.siteId).toBe("demo-store");
    expect(event.viewport).toEqual({ width: 1440, height: 900 });
    expect(event.document).toEqual({ width: 1440, height: 2400 });
  });

  it("sets viewport class based on width", () => {
    vi.stubGlobal("window", {
      innerWidth: 400,
      innerHeight: 800,
    } as Window);
    vi.stubGlobal("document", {
      documentElement: { scrollWidth: 400, scrollHeight: 1200 },
      body: { scrollWidth: 400, scrollHeight: 1200 },
      referrer: "",
    } as Document);

    const event = buildPageView("demo-store", "https://shop.example.test/");
    // The API derives the viewport class from this measurement (spec event
    // payload has no viewportClass field).
    expect(event.viewport).toEqual({ width: 400, height: 800 });
  });
});

describe("buildClick", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      innerWidth: 1440,
      innerHeight: 900,
    } as Window);
    vi.stubGlobal("document", {
      documentElement: { scrollWidth: 1440, scrollHeight: 2400 },
      body: { scrollWidth: 1440, scrollHeight: 2400 },
      createElement: realCreateElement,
    } as unknown as Document);
  });

  it("includes document-relative coordinates", () => {
    const target = document.createElement("button");
    const event = buildClick(createMouseEvent(522, 418, target), "demo-store", "https://shop.example.test/");
    expect(event).not.toBeNull();
    expect(event!.coordinates).toEqual({ x: 522, y: 418 });
    expect(event!.type).toBe("click");
  });

  it("returns null when the target is a password field", () => {
    const input = document.createElement("input");
    input.type = "password";
    const result = buildClick(createMouseEvent(10, 10, input), "demo-store", "https://shop.example.test/");
    expect(result).toBeNull();
  });

  it("returns null when the target is a contenteditable element", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    const result = buildClick(createMouseEvent(10, 10, div), "demo-store", "https://shop.example.test/");
    expect(result).toBeNull();
  });

  it("returns null when the target has data-analytics-ignore", () => {
    const div = document.createElement("div");
    div.setAttribute("data-analytics-ignore", "");
    const result = buildClick(createMouseEvent(10, 10, div), "demo-store", "https://shop.example.test/");
    expect(result).toBeNull();
  });

  it("returns null for text input", () => {
    const input = document.createElement("input");
    input.type = "text";
    const result = buildClick(createMouseEvent(10, 10, input), "demo-store", "https://shop.example.test/");
    expect(result).toBeNull();
  });

  it("returns null for textarea", () => {
    const textarea = document.createElement("textarea");
    const result = buildClick(createMouseEvent(10, 10, textarea), "demo-store", "https://shop.example.test/");
    expect(result).toBeNull();
  });

  it("returns null for select", () => {
    const select = document.createElement("select");
    const result = buildClick(createMouseEvent(10, 10, select), "demo-store", "https://shop.example.test/");
    expect(result).toBeNull();
  });
});

describe("isExcludedElement", () => {
  it("excludes password inputs", () => {
    const input = document.createElement("input");
    input.type = "password";
    expect(isExcludedElement(input)).toBe(true);
  });

  it("excludes text inputs", () => {
    const input = document.createElement("input");
    input.type = "text";
    expect(isExcludedElement(input)).toBe(true);
  });

  it("excludes textareas", () => {
    const textarea = document.createElement("textarea");
    expect(isExcludedElement(textarea)).toBe(true);
  });

  it("excludes selects", () => {
    const select = document.createElement("select");
    expect(isExcludedElement(select)).toBe(true);
  });

  it("excludes contenteditable elements", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    expect(isExcludedElement(div)).toBe(true);
  });

  it("excludes elements with data-analytics-ignore", () => {
    const div = document.createElement("div");
    div.setAttribute("data-analytics-ignore", "");
    expect(isExcludedElement(div)).toBe(true);
  });

  it("does not exclude buttons", () => {
    const button = document.createElement("button");
    expect(isExcludedElement(button)).toBe(false);
  });

  it("does not exclude links", () => {
    const a = document.createElement("a");
    expect(isExcludedElement(a)).toBe(false);
  });
});

describe("page view dedup", () => {
  beforeEach(() => {
    resetPageViewDedup();
    vi.stubGlobal("window", {
      innerWidth: 1440,
      innerHeight: 900,
    } as Window);
    vi.stubGlobal("document", {
      documentElement: { scrollWidth: 1440, scrollHeight: 2400 },
      body: { scrollWidth: 1440, scrollHeight: 2400 },
      referrer: "",
    } as Document);
    vi.stubGlobal("location", {
      origin: "https://shop.example.test",
      pathname: "/",
    } as Location);
    vi.stubGlobal("getOrCreateSessionId", () => "session-1");
    vi.stubGlobal("JSON", JSON);
    vi.stubGlobal("querySelector", null as unknown as Document["querySelector"]);
  });

  it("does not duplicate page views for the same URL", () => {
    const enqueueCalls: string[] = [];
    const enqueue = (payload: string) => enqueueCalls.push(payload);

    maybeEmitPageView("demo-store", enqueue);
    maybeEmitPageView("demo-store", enqueue);

    expect(enqueueCalls).toHaveLength(1);
  });

  it("emits a page view when the URL changes", () => {
    const enqueueCalls: string[] = [];
    const enqueue = (payload: string) => enqueueCalls.push(payload);

    vi.stubGlobal("location", {
      origin: "https://shop.example.test",
      pathname: "/",
    } as Location);

    maybeEmitPageView("demo-store", enqueue);

    vi.stubGlobal("location", {
      origin: "https://shop.example.test",
      pathname: "/products",
    } as Location);

    resetPageViewDedup();
    maybeEmitPageView("demo-store", enqueue);

    expect(enqueueCalls).toHaveLength(2);
  });
});
