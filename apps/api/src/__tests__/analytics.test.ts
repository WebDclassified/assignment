import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoClient } from "mongodb";
import { createApp } from "../app.js";
import { MongoEventRepository } from "../repositories/events.js";
import { loadEnvironment } from "../config/env.js";
import request from "supertest";

const SITE_ID = "analytics-test";
const HOME = "https://shop.example.test/";
const PRODUCTS = "https://shop.example.test/products";
const CART = "https://shop.example.test/cart";

const SESSION_A = "aaaaaaaa-1111-4111-8111-111111111111";
const SESSION_B = "bbbbbbbb-2222-4222-8222-222222222222";

let idCounter = 0;
function uuid(): string {
  idCounter += 1;
  const tail = idCounter.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${tail}`;
}

function pageView(sessionId: string, pageUrl: string, width: number, occurredAt: string) {
  return {
    eventId: uuid(),
    siteId: SITE_ID,
    sessionId,
    type: "page_view",
    pageUrl,
    occurredAt,
    viewport: { width, height: 800 },
    document: { width, height: 2000 },
  };
}

function click(
  sessionId: string,
  pageUrl: string,
  width: number,
  occurredAt: string,
  coordinates: { x: number; y: number },
) {
  return {
    eventId: uuid(),
    siteId: SITE_ID,
    sessionId,
    type: "click",
    pageUrl,
    occurredAt,
    coordinates,
    viewport: { width, height: 800 },
    document: { width, height: 2000 },
  };
}

describe("analytics read endpoints", () => {
  let app: ReturnType<typeof createApp>;
  let client: MongoClient;

  beforeAll(async () => {
    const env = loadEnvironment();
    client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    const repository = new MongoEventRepository(client, env.MONGODB_DATABASE);
    app = createApp(env, client, repository);

    // Session A: home page view + clicks at three viewport widths, then products.
    // Session B: products page view and one click. Cart is only viewed.
    const response = await request(app)
      .post("/api/v1/events")
      .send({
        events: [
          pageView(SESSION_A, HOME, 1440, "2026-10-14T12:00:00.000Z"),
          click(SESSION_A, HOME, 1440, "2026-10-14T12:00:01.000Z", { x: 100, y: 200 }),
          click(SESSION_A, HOME, 800, "2026-10-14T12:00:02.000Z", { x: 300, y: 400 }),
          click(SESSION_A, HOME, 390, "2026-10-14T12:00:03.000Z", { x: 50, y: 60 }),
          pageView(SESSION_A, PRODUCTS, 1440, "2026-10-14T12:00:04.000Z"),
          pageView(SESSION_A, CART, 1440, "2026-10-14T12:00:05.000Z"),
          pageView(SESSION_B, PRODUCTS, 800, "2026-10-14T13:00:00.000Z"),
          click(SESSION_B, PRODUCTS, 800, "2026-10-14T13:00:01.000Z", { x: 700, y: 150 }),
        ],
      });

    expect(response.status).toBe(202);
    expect(response.body.accepted).toBe(8);
  });

  afterAll(async () => {
    await client.close();
  });

  it("summary counts distinct sessions, not events", async () => {
    const response = await request(app).get(`/api/v1/summary?siteId=${SITE_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      sessions: 2,
      pageViews: 4,
      clicks: 4,
      averageEventsPerSession: 4,
    });
  });

  it("lists sessions with distinct-session pagination totals", async () => {
    const response = await request(app).get(
      `/api/v1/sessions?siteId=${SITE_ID}&page=1&pageSize=1`,
    );

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(response.body.data).toHaveLength(1);

    // Sorted by lastActivityAt descending: session B is the most recent.
    const first = response.body.data[0];
    expect(first.sessionId).toBe(SESSION_B);
    expect(first.eventCount).toBe(2);
    expect(first.pageViews).toBe(1);
    expect(first.clicks).toBe(1);

    const secondPage = await request(app).get(
      `/api/v1/sessions?siteId=${SITE_ID}&page=2&pageSize=1`,
    );
    expect(secondPage.body.data[0].sessionId).toBe(SESSION_A);
    expect(secondPage.body.data[0].eventCount).toBe(6);
    expect(secondPage.body.data[0].pageViews).toBe(3);
    expect(secondPage.body.data[0].clicks).toBe(3);
  });

  it("lists known sites with totals", async () => {
    const response = await request(app).get("/api/v1/sites");

    expect(response.status).toBe(200);
    expect(response.body.data).toContainEqual(
      expect.objectContaining({ siteId: SITE_ID, sessions: 2, events: 8 }),
    );
  });

  it("returns server-computed session durations", async () => {
    const response = await request(app).get(
      `/api/v1/sessions?siteId=${SITE_ID}&page=1&pageSize=1`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      sessionId: SESSION_B,
      durationSeconds: 1,
    });
  });

  it("filters sessions by a sessionId search term", async () => {
    const response = await request(app).get(
      `/api/v1/sessions?siteId=${SITE_ID}&search=bbbb`,
    );

    expect(response.status).toBe(200);
    expect(response.body.pagination.total).toBe(1);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].sessionId).toBe(SESSION_B);

    const noMatch = await request(app).get(
      `/api/v1/sessions?siteId=${SITE_ID}&search=zzzz`,
    );
    expect(noMatch.body.pagination.total).toBe(0);
    expect(noMatch.body.data).toHaveLength(0);
  });

  it("lists only pages that have click records", async () => {
    const response = await request(app).get(`/api/v1/heatmap/pages?siteId=${SITE_ID}`);

    expect(response.status).toBe(200);
    const pages = response.body.data as Array<{ pageUrl: string; clicks: number }>;
    // Cart was viewed but never clicked, so it must not appear.
    expect(pages.map((page) => page.pageUrl).sort()).toEqual([HOME, PRODUCTS]);
    const home = pages.find((page) => page.pageUrl === HOME);
    expect(home?.clicks).toBe(3);
  });

  it("classifies heatmap clicks by viewport width", async () => {
    const desktop = await request(app).get(
      `/api/v1/heatmap/clicks?siteId=${SITE_ID}&pageUrl=${encodeURIComponent(HOME)}&viewportClass=desktop`,
    );
    expect(desktop.status).toBe(200);
    expect(desktop.body.totalClicks).toBe(1);
    expect(desktop.body.data).toHaveLength(1);
    expect(desktop.body.data[0].viewport.width).toBe(1440);
    expect(desktop.body.data[0].coordinates).toBeUndefined();
    expect(desktop.body.data[0].x).toBe(100);
    expect(desktop.body.data[0].y).toBe(200);

    const tablet = await request(app).get(
      `/api/v1/heatmap/clicks?siteId=${SITE_ID}&pageUrl=${encodeURIComponent(HOME)}&viewportClass=tablet`,
    );
    expect(tablet.body.totalClicks).toBe(1);
    expect(tablet.body.data[0].viewport.width).toBe(800);

    const mobile = await request(app).get(
      `/api/v1/heatmap/clicks?siteId=${SITE_ID}&pageUrl=${encodeURIComponent(HOME)}&viewportClass=mobile`,
    );
    expect(mobile.body.totalClicks).toBe(1);
    expect(mobile.body.data[0].viewport.width).toBe(390);
    expect(mobile.body.data[0].document.width).toBe(390);
  });

  it("filters by the requested date range instead of returning nothing", async () => {
    const range = {
      from: "2026-10-14T00:00:00.000Z",
      to: "2026-10-15T00:00:00.000Z",
    };

    const summary = await request(app).get(
      `/api/v1/summary?siteId=${SITE_ID}&from=${range.from}&to=${range.to}`,
    );
    expect(summary.status).toBe(200);
    expect(summary.body.data.sessions).toBe(2);

    const sessions = await request(app).get(
      `/api/v1/sessions?siteId=${SITE_ID}&from=${range.from}&to=${range.to}`,
    );
    expect(sessions.status).toBe(200);
    expect(sessions.body.pagination.total).toBe(2);

    const pages = await request(app).get(
      `/api/v1/heatmap/pages?siteId=${SITE_ID}&from=${range.from}&to=${range.to}`,
    );
    expect(pages.status).toBe(200);
    expect(pages.body.data).toHaveLength(2);

    const outside = await request(app).get(
      `/api/v1/sessions?siteId=${SITE_ID}&from=2020-01-01T00:00:00.000Z&to=2020-02-01T00:00:00.000Z`,
    );
    expect(outside.status).toBe(200);
    expect(outside.body.pagination.total).toBe(0);
  });

  it("rejects a non-UUID sessionId with a 400", async () => {
    const response = await request(app).get(
      `/api/v1/sessions/not-a-uuid/events?siteId=${SITE_ID}`,
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("paginates the session timeline", async () => {
    const first = await request(app).get(
      `/api/v1/sessions/${SESSION_A}/events?siteId=${SITE_ID}&page=1&pageSize=2`,
    );

    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.pagination).toEqual({
      page: 1,
      pageSize: 2,
      total: 6,
      totalPages: 3,
    });

    const third = await request(app).get(
      `/api/v1/sessions/${SESSION_A}/events?siteId=${SITE_ID}&page=3&pageSize=2`,
    );
    expect(third.status).toBe(200);
    expect(third.body.data).toHaveLength(2);
    expect(third.body.data[0]).not.toEqual(first.body.data[0]);
  });

  it("returns daily trends with zero-filled days", async () => {
    const response = await request(app).get(
      `/api/v1/trends?siteId=${SITE_ID}&from=2026-10-13T00:00:00.000Z&to=2026-10-15T00:00:00.000Z`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.data).toContainEqual({
      date: "2026-10-13",
      pageViews: 0,
      clicks: 0,
      events: 0,
    });
    expect(response.body.data).toContainEqual({
      date: "2026-10-14",
      pageViews: 4,
      clicks: 4,
      events: 8,
    });
  });

  it("enforces site tokens only for listed sites", async () => {
    const env = loadEnvironment();
    const authedApp = createApp(
      { ...env, SITE_READ_TOKENS: new Map([["analytics-test", "s3cret"]]) },
      client,
      new MongoEventRepository(client, env.MONGODB_DATABASE),
    );

    const denied = await request(authedApp).get(`/api/v1/summary?siteId=${SITE_ID}`);
    expect(denied.status).toBe(401);
    expect(denied.body.error.code).toBe("UNAUTHORIZED");

    const allowed = await request(authedApp).get(
      `/api/v1/summary?siteId=${SITE_ID}&token=s3cret`,
    );
    expect(allowed.status).toBe(200);

    const unlisted = await request(authedApp).get("/api/v1/summary?siteId=other-site");
    expect(unlisted.status).toBe(200);

    const ingested = await request(authedApp)
      .post("/api/v1/events")
      .send({
        events: [
          {
            eventId: "12345678-1234-4234-8234-123456789012",
            siteId: SITE_ID,
            sessionId: "99999999-9999-4999-8999-999999999999",
            type: "page_view",
            pageUrl: HOME,
            occurredAt: "2026-10-14T14:00:00.000Z",
            viewport: { width: 1440, height: 800 },
            document: { width: 1440, height: 2000 },
          },
        ],
      });
    expect(ingested.status).toBe(202);
  });

  it("returns a server-side density grid covering every click", async () => {
    const response = await request(app).get(
      `/api/v1/heatmap/clicks?siteId=${SITE_ID}&pageUrl=${encodeURIComponent(HOME)}&viewportClass=desktop&grid=10`,
    );

    expect(response.status).toBe(200);
    expect(response.body.grid.size).toBe(10);
    const counted = (response.body.grid.cells as Array<{ count: number }>).reduce(
      (total, cell) => total + cell.count,
      0,
    );
    expect(counted).toBe(response.body.totalClicks);
    expect(counted).toBe(1);
  });

  it("returns a session's events in order", async () => {
    const response = await request(app).get(
      `/api/v1/sessions/${SESSION_A}/events?siteId=${SITE_ID}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(6);
    const timestamps = (response.body.data as Array<{ occurredAt: string }>).map(
      (event) => event.occurredAt,
    );
    expect([...timestamps].sort()).toEqual(timestamps);
  });
});
