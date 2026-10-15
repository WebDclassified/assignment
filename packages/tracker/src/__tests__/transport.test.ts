import { describe, it, expect, vi } from "vitest";
import { deliverViaFetch, deliverForUnload, deliverViaBeacon } from "../transport.js";

describe("deliverViaFetch", () => {
  it("returns accepted when the response is ok", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 202,
    } as Response);

    const result = await deliverViaFetch('{"events":[]}', "https://api.example.test");
    expect(result.accepted).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/events",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }),
    );

    fetchSpy.mockRestore();
  });

  it("returns not accepted when the response is an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const result = await deliverViaFetch('{"events":[]}', "https://api.example.test");
    expect(result.accepted).toBe(false);

    vi.restoreAllMocks();
  });

  it("returns not accepted when fetch throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    const result = await deliverViaFetch('{"events":[]}', "https://api.example.test");
    expect(result.accepted).toBe(false);

    vi.restoreAllMocks();
  });
});

describe("deliverViaBeacon", () => {
  it("returns false when sendBeacon is unavailable", () => {
    vi.stubGlobal("navigator", { sendBeacon: undefined } as unknown as Navigator);
    const result = deliverViaBeacon('{"events":[]}', "https://api.example.test");
    expect(result).toBe(false);
  });

  it("returns true when sendBeacon succeeds", () => {
    vi.stubGlobal("navigator", {
      sendBeacon: vi.fn(() => true),
    } as unknown as Navigator);
    const result = deliverViaBeacon('{"events":[]}', "https://api.example.test");
    expect(result).toBe(true);
  });

  it("returns false when sendBeacon returns false", () => {
    vi.stubGlobal("navigator", {
      sendBeacon: vi.fn(() => false),
    } as unknown as Navigator);
    const result = deliverViaBeacon('{"events":[]}', "https://api.example.test");
    expect(result).toBe(false);
  });
});

describe("deliverForUnload", () => {
  it("falls back to fetch keepalive when beacon is unavailable", async () => {
    vi.stubGlobal("navigator", { sendBeacon: undefined } as unknown as Navigator);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 202,
    } as Response);

    const result = await deliverForUnload('{"events":[]}', "https://api.example.test");
    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/events",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        keepalive: true,
      }),
    );

    vi.restoreAllMocks();
  });
});
