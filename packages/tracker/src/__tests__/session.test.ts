import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOrCreateSessionId, resetSession } from "../session.js";

function mockStorage(ops: Record<string, string | null> = {}) {
  const store: Record<string, string> = {};
  for (const [key, value] of Object.entries(ops)) {
    if (value !== null) {
      store[key] = value;
    }
  }
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    store,
  };
}

describe("session", () => {
  beforeEach(() => {
    resetSession();
  });

  it("creates a new session id when none exists", () => {
    const storage = mockStorage();
    vi.stubGlobal("localStorage", storage);
    vi.useFakeTimers({ now: new Date("2026-10-14T12:00:00.000Z") });

    const id = getOrCreateSessionId();
    expect(id).toBeTruthy();
    expect(storage.setItem).toHaveBeenCalledWith(
      "pathlens_session",
      id,
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      "pathlens_activity",
      String(Date.now()),
    );

    vi.useRealTimers();
  });

  it("reuses the session id when activity is recent", () => {
    const id = "4c2db6ba-70e9-4bb3-a028-8a70de2f6dbf";
    const storage = mockStorage({
      pathlens_session: id,
      pathlens_activity: String(Date.now() - 60_000),
    });
    vi.stubGlobal("localStorage", storage);
    vi.useFakeTimers({ now: new Date("2026-10-14T12:01:00.000Z") });

    const reused = getOrCreateSessionId();
    expect(reused).toBe(id);
    expect(storage.setItem).toHaveBeenCalledWith(
      "pathlens_activity",
      String(Date.now()),
    );

    vi.useRealTimers();
  });

  it("rotates the session id after 30 minutes of inactivity", () => {
    vi.useFakeTimers({ now: new Date("2026-10-14T12:31:00.000Z") });
    const oldId = "4c2db6ba-70e9-4bb3-a028-8a70de2f6dbf";
    const activity = Date.now() - 31 * 60 * 1000;
    const storage = mockStorage({
      pathlens_session: oldId,
      pathlens_activity: String(activity),
    });
    vi.stubGlobal("localStorage", storage);

    const newId = getOrCreateSessionId();
    expect(newId).not.toBe(oldId);
    expect(storage.setItem).toHaveBeenCalledWith(
      "pathlens_session",
      newId,
    );

    vi.useRealTimers();
  });

  it("keeps a stable in-memory session when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("localStorage unavailable");
      },
      setItem: () => {
        throw new Error("localStorage unavailable");
      },
      removeItem: () => {
        throw new Error("localStorage unavailable");
      },
    });

    const first = getOrCreateSessionId();
    const second = getOrCreateSessionId();
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it("falls back when localStorage is unavailable", () => {
    const storage = mockStorage();
    const getItem = storage.getItem;
    getItem.mockImplementationOnce(() => {
      throw new Error("localStorage unavailable");
    });
    vi.stubGlobal("localStorage", storage);

    const id = getOrCreateSessionId();
    expect(id).toBeTruthy();
  });
});
