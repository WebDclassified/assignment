import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoClient } from "mongodb";
import { createApp } from "../app.js";
import { MongoEventRepository } from "../repositories/events.js";
import { loadEnvironment } from "../config/env.js";
import request from "supertest";

function makePageView(
  overrides: Partial<{ eventId: string; pageUrl: string; occurredAt: string }> = {},
) {
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

function makeClick(overrides: Partial<{ eventId: string; coordinates: { x: number; y: number } }> = {}) {
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

describe("POST /api/v1/events", () => {
  let app: ReturnType<typeof createApp>;
  let client: MongoClient;

  beforeAll(async () => {
    const env = loadEnvironment();
    client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    const repository = new MongoEventRepository(client, env.MONGODB_DATABASE);
    app = createApp(env, client, repository);
  });

  afterAll(async () => {
    await client.close();
  });

  it("accepts a valid page_view event", async () => {
    const response = await request(app)
      .post("/api/v1/events")
      .send({ events: [makePageView()] });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: 1, duplicates: 0 });
  });

  it("accepts a valid click event", async () => {
    const response = await request(app)
      .post("/api/v1/events")
      .send({ events: [makeClick()] });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: 1, duplicates: 0 });
  });

  it("rejects an unsupported event type", async () => {
    const response = await request(app)
      .post("/api/v1/events")
      .send({
        events: [
          {
            ...makePageView({ eventId: "11111111-1111-1111-1111-111111111111" }),
            type: "scroll",
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a click missing coordinates", async () => {
    const response = await request(app)
      .post("/api/v1/events")
      .send({
        events: [
          {
            ...makeClick({ eventId: "22222222-2222-2222-2222-222222222222" }),
            coordinates: undefined,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a page_view that includes coordinates", async () => {
    const response = await request(app)
      .post("/api/v1/events")
      .send({
        events: [
          {
            ...makePageView({ eventId: "33333333-3333-3333-3333-333333333333" }),
            coordinates: { x: 0, y: 0 },
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects negative coordinates", async () => {
    const response = await request(app)
      .post("/api/v1/events")
      .send({
        events: [
          {
            ...makeClick({ eventId: "44444444-4444-4444-4444-444444444444", coordinates: { x: -1, y: 5 } }),
          },
        ],
      });

    expect(response.status).toBe(400);
  });

  it("deduplicates repeated eventId values", async () => {
    const eventId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const first = await request(app)
      .post("/api/v1/events")
      .send({ events: [makePageView({ eventId })] });

    expect(first.status).toBe(202);
    expect(first.body.accepted).toBe(1);

    const retry = await request(app)
      .post("/api/v1/events")
      .send({ events: [makePageView({ eventId })] });

    expect(retry.status).toBe(202);
    expect(retry.body.accepted).toBe(0);
    expect(retry.body.duplicates).toBe(1);
  });

  it("rejects an event timestamp far in the future", async () => {
    const response = await request(app)
      .post("/api/v1/events")
      .send({
        events: [
          makePageView({
            eventId: "55555555-5555-5555-5555-555555555555",
            occurredAt: "2999-01-01T00:00:00.000Z",
          }),
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a non-http(s) pageUrl", async () => {
    const response = await request(app)
      .post("/api/v1/events")
      .send({
        events: [
          makePageView({
            eventId: "66666666-6666-6666-6666-666666666666",
            pageUrl: "javascript:void(0)",
          }),
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("strips query strings from stored page URLs", async () => {
    const eventId = "77777777-7777-4777-8777-777777777777";
    const response = await request(app)
      .post("/api/v1/events")
      .send({
        events: [
          makePageView({
            eventId,
            pageUrl: "https://shop.example.test/products?ref=email#top",
          }),
        ],
      });

    expect(response.status).toBe(202);

    const pages = await request(app).get(
      "/api/v1/heatmap/pages?siteId=demo-store",
    );
    expect(
      (pages.body.data as Array<{ pageUrl: string }>).some((page) =>
        page.pageUrl.includes("?"),
      ),
    ).toBe(false);
  });

  it("accepts a JSON body sent as text/plain", async () => {
    const response = await request(app)
      .post("/api/v1/events")
      .set("Content-Type", "text/plain")
      .send(JSON.stringify({ events: [makeClick({ eventId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" })] }));

    expect(response.status).toBe(202);
    expect(response.body.accepted).toBe(1);
  });
});
