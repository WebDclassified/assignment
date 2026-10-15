import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionsPage } from "./SessionsPage";
import {
  getSessions,
  getSessionEvents,
  ApiError,
  type SessionsResponse,
} from "../../../lib/api";
import type { SessionSummary } from "@pathlens/contracts";

vi.mock("../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/api")>();
  return {
    ...actual,
    getSessions: vi.fn(),
    getSessionEvents: vi.fn(),
  };
});

const FROM = "2026-10-01T00:00:00.000Z";
const TO = "2026-10-15T00:00:00.000Z";

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
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

const sessionEvents = {
  data: [
    {
      eventId: "0b1fc2d6-ec27-4584-97c2-4c86a83a0dbb",
      type: "page_view" as const,
      pageUrl: "https://shop.example.test/",
      occurredAt: "2026-10-14T12:00:00.000Z",
    },
    {
      eventId: "e20c70dc-6f03-4f38-ae68-079f1f61b9e4",
      type: "click" as const,
      pageUrl: "https://shop.example.test/",
      occurredAt: "2026-10-14T12:00:03.451Z",
      coordinates: { x: 522, y: 418 },
    },
  ],
  pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
};

describe("SessionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "";
  });

  it("shows loading first, then the sessions table", async () => {
    vi.mocked(getSessions).mockResolvedValue(pageOne);

    render(<SessionsPage from={FROM} to={TO} />);

    expect(screen.getByText("Loading sessions...")).not.toBeNull();
    expect(await screen.findByTitle(session.sessionId)).not.toBeNull();
  });

  it("shows an error state when the request fails", async () => {
    vi.mocked(getSessions).mockRejectedValue(
      new ApiError(503, {
        error: { code: "SERVICE_UNAVAILABLE", message: "Sessions are unavailable" },
      }),
    );

    render(<SessionsPage from={FROM} to={TO} />);

    expect(await screen.findByText("Unable to load sessions")).not.toBeNull();
    expect(screen.getByText("Sessions are unavailable")).not.toBeNull();
  });

  it("refetches with the search term after the debounce delay", async () => {
    vi.mocked(getSessions).mockResolvedValue(pageOne);

    render(<SessionsPage from={FROM} to={TO} />);
    await screen.findByTitle(session.sessionId);

    const input = screen.getByLabelText("Search sessions");
    fireEvent.change(input, { target: { value: "4c2d" } });

    await waitFor(
      () => {
        expect(getSessions).toHaveBeenLastCalledWith(
          1,
          20,
          "4c2d",
          FROM,
          TO,
        );
      },
      { timeout: 2000 },
    );
  });

  it("updates the detail panel when a session is selected", async () => {
    vi.mocked(getSessions).mockResolvedValue(pageOne);
    vi.mocked(getSessionEvents).mockResolvedValue(sessionEvents);

    render(<SessionsPage from={FROM} to={TO} />);

    const row = await screen.findByTitle(session.sessionId);
    fireEvent.click(row);

    expect(await screen.findByText("Session journey")).not.toBeNull();
    expect((await screen.findAllByText("/")).length).toBe(2);
    expect(screen.getByText("(522, 418)")).not.toBeNull();
    expect(getSessionEvents).toHaveBeenCalledWith(session.sessionId, 1, 100);
  });

  it("requests the next page when pagination is available", async () => {
    vi.mocked(getSessions).mockResolvedValue({
      data: [session],
      pagination: { page: 1, pageSize: 20, total: 40, totalPages: 2 },
    });

    render(<SessionsPage from={FROM} to={TO} />);

    expect(await screen.findByText("Page 1 of 2")).not.toBeNull();

    vi.mocked(getSessions).mockResolvedValue({
      data: [
        {
          ...session,
          sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
      ],
      pagination: { page: 2, pageSize: 20, total: 40, totalPages: 2 },
    });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Page 2 of 2")).not.toBeNull();
    await waitFor(() => {
      expect(getSessions).toHaveBeenLastCalledWith(2, 20, undefined, FROM, TO);
    });
  });
});
