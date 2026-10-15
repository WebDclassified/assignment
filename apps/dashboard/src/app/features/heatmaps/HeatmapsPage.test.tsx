import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HeatmapsPage } from "./HeatmapsPage";
import {
  getHeatmapPages,
  getHeatmapClicks,
  ApiError,
} from "../../../lib/api";
import type { HeatmapPage, HeatmapResult } from "@pathlens/contracts";

vi.mock("../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/api")>();
  return {
    ...actual,
    getHeatmapPages: vi.fn(),
    getHeatmapClicks: vi.fn(),
  };
});

const FROM = "2026-10-01T00:00:00.000Z";
const TO = "2026-10-15T00:00:00.000Z";

const HOME = "https://shop.example.test/";
const PRODUCTS = "https://shop.example.test/products";

const pages: HeatmapPage[] = [
  { pageUrl: HOME, clicks: 5 },
  { pageUrl: PRODUCTS, clicks: 2 },
];

const emptyResult: HeatmapResult = {
  pageUrl: HOME,
  viewportClass: "desktop",
  totalClicks: 0,
  data: [],
};

const clickedResult: HeatmapResult = {
  pageUrl: HOME,
  viewportClass: "desktop",
  totalClicks: 3,
  data: [
    {
      x: 100,
      y: 200,
      viewport: { width: 1440, height: 900 },
      document: { width: 1440, height: 2400 },
      occurredAt: "2026-10-14T12:00:03.451Z",
    },
  ],
};

describe("HeatmapsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "";
  });

  it("auto-selects the top page and fetches clicks for it", async () => {
    vi.mocked(getHeatmapPages).mockResolvedValue(pages);
    vi.mocked(getHeatmapClicks).mockResolvedValue(emptyResult);

    render(<HeatmapsPage from={FROM} to={TO} />);

    await waitFor(() => {
      expect(getHeatmapClicks).toHaveBeenCalledWith(HOME, "desktop", FROM, TO, undefined);
    });
    expect(await screen.findByText("No clicks yet")).not.toBeNull();
  });

  it("refetches when the device filter changes", async () => {
    vi.mocked(getHeatmapPages).mockResolvedValue(pages);
    vi.mocked(getHeatmapClicks).mockResolvedValue(emptyResult);

    render(<HeatmapsPage from={FROM} to={TO} />);
    await waitFor(() => {
      expect(getHeatmapClicks).toHaveBeenCalledWith(HOME, "desktop", FROM, TO, undefined);
    });

    fireEvent.click(screen.getByRole("button", { name: "Tablet" }));

    await waitFor(() => {
      expect(getHeatmapClicks).toHaveBeenLastCalledWith(
        HOME,
        "tablet",
        FROM,
        TO,
        undefined,
      );
    });
  });

  it("refetches when another page is selected", async () => {
    vi.mocked(getHeatmapPages).mockResolvedValue(pages);
    vi.mocked(getHeatmapClicks).mockResolvedValue(emptyResult);

    render(<HeatmapsPage from={FROM} to={TO} />);
    const select = await screen.findByRole("combobox");
    expect(select).not.toBeNull();

    fireEvent.change(select, { target: { value: PRODUCTS } });

    await waitFor(() => {
      expect(getHeatmapClicks).toHaveBeenLastCalledWith(
        PRODUCTS,
        "desktop",
        FROM,
        TO,
        undefined,
      );
    });
  });

  it("shows the click count and canvas when clicks exist", async () => {
    vi.mocked(getHeatmapPages).mockResolvedValue(pages);
    vi.mocked(getHeatmapClicks).mockResolvedValue(clickedResult);

    render(<HeatmapsPage from={FROM} to={TO} />);

    expect(await screen.findByText("3 clicks")).not.toBeNull();
    expect(screen.getByLabelText("Click heatmap")).not.toBeNull();
    expect(screen.getByText("Intensity")).not.toBeNull();
  });

  it("requests the server-side density grid in Grid display mode", async () => {
    vi.mocked(getHeatmapPages).mockResolvedValue(pages);
    vi.mocked(getHeatmapClicks).mockResolvedValue({
      ...clickedResult,
      grid: { size: 10, cells: [{ col: 1, row: 2, count: 3 }] },
    });

    render(<HeatmapsPage from={FROM} to={TO} />);
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));

    await waitFor(() => {
      expect(getHeatmapClicks).toHaveBeenLastCalledWith(HOME, "desktop", FROM, TO, 24);
    });
    expect(screen.getByText("Density")).not.toBeNull();
  });

  it("shows the live recorded page behind markers by default", async () => {
    vi.mocked(getHeatmapPages).mockResolvedValue(pages);
    vi.mocked(getHeatmapClicks).mockResolvedValue(clickedResult);

    render(<HeatmapsPage from={FROM} to={TO} />);

    const frame = await screen.findByTitle("Recorded page preview for /");
    expect(frame.getAttribute("src")).toBe(HOME);
    expect(screen.getByLabelText("Click heatmap")).not.toBeNull();
  });

  it("shows an error state when the page list cannot load", async () => {
    vi.mocked(getHeatmapPages).mockRejectedValue(
      new ApiError(500, {
        error: { code: "INTERNAL_ERROR", message: "Heatmap pages unavailable" },
      }),
    );

    render(<HeatmapsPage from={FROM} to={TO} />);

    expect(await screen.findByText("Unable to load heatmaps")).not.toBeNull();
    expect(screen.getByText("Heatmap pages unavailable")).not.toBeNull();
  });
});
