import { describe, it, expect, vi } from "vitest";
import { canonicalPageUrl, classifyViewport, generateId } from "../utils.js";

describe("canonicalPageUrl", () => {
  it("strips query and fragment", () => {
    vi.stubGlobal("location", {
      origin: "https://shop.example.test",
      pathname: "/products?ref=email#top",
    } as Location);
    expect(canonicalPageUrl()).toBe("https://shop.example.test/products");
  });

  it("keeps origin and pathname", () => {
    vi.stubGlobal("location", {
      origin: "https://shop.example.test",
      pathname: "/",
    } as Location);
    expect(canonicalPageUrl()).toBe("https://shop.example.test/");
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

describe("generateId", () => {
  it("produces a string that looks like a UUID", () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("produces unique ids in sequence", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(50);
  });
});
