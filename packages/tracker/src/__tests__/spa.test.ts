import { describe, it, expect, vi, afterEach } from "vitest";
import { observeSpaNavigation } from "../index.js";

describe("observeSpaNavigation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("notifies on pushState, replaceState, and popstate", () => {
    const onNavigate = vi.fn();
    const cleanup = observeSpaNavigation(onNavigate);

    window.history.pushState({}, "", "/products");
    expect(onNavigate).toHaveBeenCalledTimes(1);

    window.history.replaceState({}, "", "/cart");
    expect(onNavigate).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onNavigate).toHaveBeenCalledTimes(3);

    cleanup();
  });

  it("patches history only once and restores originals on cleanup", () => {
    const first = vi.fn();
    const second = vi.fn();
    const cleanupFirst = observeSpaNavigation(first);
    const cleanupSecond = observeSpaNavigation(second);

    window.history.pushState({}, "", "/a");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    cleanupFirst();
    cleanupSecond();
    window.history.pushState({}, "", "/b");
    expect(first).toHaveBeenCalledTimes(1);
  });
});
