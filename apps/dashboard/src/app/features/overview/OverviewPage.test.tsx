import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OverviewPage } from "./OverviewPage";
import {
  getSummary,
  getSessions,
  getSessionEvents,
  getTrends,
  ApiError,
  type ApiSummary,
  type SessionsResponse,
} from "../../../lib/api";
import type { SessionSummary } from "@pathlens/contracts";

vi.mock("../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/api")>();
  return {
    ...actual,
    getSummary: vi.fn(),
    getSessions: vi.fn(),
    getSessionEvents: vi.fn(),
    getTrends: vi.fn(),
  };
});

const FROM = "2026-10-01T00:00:00.000Z";
const TO = "2026-10-15T00:00:00.000Z";

const summary: ApiSummary = {
  sessions: 4,
  pageViews: 12,
  clicks: 30,
  averageEventsPerSession: 7.5,
};

const session: SessionSummary = {
  sessionId: "4c2db6ba-70e9-4bb3-a028-8a70de2f6dbf",
  eventCount: 3,
  pageViews: 2,
  clicks: 1,
  startedAt: "2026-10-14T12:00:00.000Z",
  lastActivityAt: "2026-10-14T12:05:00.000Z",
  durationSeconds: 300,
};

const pageOne: SessionsResponse = {
  data: [session],
  pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
};

const sessionEvents = {
  data: [
    {
      eventId: "0b1fc2d6-ec27-4584-97c2-4c86a83a0dbb",
      type: "page_view" as const,
      pageUrl: "https://shop.example.test/products",
      occurredAt: "2026-10-14T12:00:00.000Z",
    },
    {
      eventId: "e20c70dc-6f03-4f38-ae68-079f1f61b9e4",
      type: "click" as const,
      pageUrl: "https://shop.example.test/products",
      occurredAt: "2026-10-14T12:00:03.451Z",
      coordinates: { x: 522, y: 418 },
    },
  ],
  pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
};

describe("OverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "";
    vi.mocked(getTrends).mockResolvedValue([]);
  });

  it("shows the loading state until data arrives", async () => {
    let resolveSummary!: (value: ApiSummary) => void;
    let resolveSessions!: (value: SessionsResponse) => void;
    vi.mocked(getSummary).mockReturnValue(
      new Promise((resolve) => {
        resolveSummary = resolve;
      }),
    );
    vi.mocked(getSessions).mockReturnValue(
      new Promise((resolve) => {
        resolveSessions = resolve;
      }),
    );

    render(<OverviewPage from={FROM} to={TO} />);

    expect(screen.getByText("Loading sessions...")).not.toBeNull();

    resolveSummary(summary);
    resolveSessions(pageOne);

    expect(await screen.findByTitle(session.sessionId)).not.toBeNull();
  });

  it("shows an error state and recovers when retry succeeds", async () => {
    vi.mocked(getSummary).mockRejectedValue(
      new ApiError(500, {
        error: { code: "INTERNAL_ERROR", message: "Database unavailable" },
      }),
    );
    vi.mocked(getSessions).mockRejectedValue(
      new ApiError(500, {
        error: { code: "INTERNAL_ERROR", message: "Database unavailable" },
      }),
    );

    render(<OverviewPage from={FROM} to={TO} />);

    expect(await screen.findByText("Unable to load overview")).not.toBeNull();
    expect(screen.getByText("Database unavailable")).not.toBeNull();

    vi.mocked(getSummary).mockResolvedValue(summary);
    vi.mocked(getSessions).mockResolvedValue(pageOne);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByTitle(session.sessionId)).not.toBeNull();
  });

  it("shows the empty state when there are no sessions", async () => {
    vi.mocked(getSummary).mockResolvedValue({
      sessions: 0,
      pageViews: 0,
      clicks: 0,
      averageEventsPerSession: 0,
    });
    vi.mocked(getSessions).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
    });

    render(<OverviewPage from={FROM} to={TO} />);

    expect(await screen.findByText("No sessions yet")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Open demo storefront" }),
    ).not.toBeNull();
    expect(screen.getByText("Avg. events/session")).not.toBeNull();
  });

  it("renders KPIs and sessions, and shows the timeline after selection", async () => {
    vi.mocked(getSummary).mockResolvedValue(summary);
    vi.mocked(getSessions).mockResolvedValue(pageOne);
    vi.mocked(getSessionEvents).mockResolvedValue(sessionEvents);

    render(<OverviewPage from={FROM} to={TO} />);

    const row = await screen.findByTitle(session.sessionId);
    expect(screen.getByText("7.5")).not.toBeNull();
    expect(screen.getByText("1 sessions")).not.toBeNull();

    fireEvent.click(row);

    expect(await screen.findByText("Session journey")).not.toBeNull();
    expect((await screen.findAllByText("/products")).length).toBe(2);
    expect(screen.getByText("(522, 418)")).not.toBeNull();
    expect(getSessionEvents).toHaveBeenCalledWith(session.sessionId, 1, 100);
  });

  it("shows the activity chart when trends are available", async () => {
    vi.mocked(getSummary).mockResolvedValue(summary);
    vi.mocked(getSessions).mockResolvedValue(pageOne);
    vi.mocked(getTrends).mockResolvedValue([
      { date: "2026-10-14", pageViews: 4, clicks: 6, events: 10 },
      { date: "2026-10-15", pageViews: 1, clicks: 0, events: 1 },
    ]);

    render(<OverviewPage from={FROM} to={TO} />);

    expect(await screen.findByText("Activity")).not.toBeNull();
    expect(screen.getByText("Last 14 days · clicks per day")).not.toBeNull();
  });

  it("loads the next page when pagination is available", async () => {
    vi.mocked(getSummary).mockResolvedValue(summary);
    vi.mocked(getSessions).mockResolvedValue({
      data: [session],
      pagination: { page: 1, pageSize: 10, total: 25, totalPages: 3 },
    });

    render(<OverviewPage from={FROM} to={TO} />);

    expect(await screen.findByText("Page 1 of 3")).not.toBeNull();

    vi.mocked(getSessions).mockResolvedValue({
      data: [
        {
          ...session,
          sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
      ],
      pagination: { page: 2, pageSize: 10, total: 25, totalPages: 3 },
    });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Page 2 of 3")).not.toBeNull();
    await waitFor(() => {
      expect(getSessions).toHaveBeenLastCalledWith(2, 10, undefined, FROM, TO);
    });
  });
});
