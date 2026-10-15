// End-to-end smoke test: boots the built API against a throwaway in-memory
// MongoDB, replays a realistic tracker batch (page views + clicks across a
// demo journey), then asserts every read endpoint reflects the stored data.
// Run with: pnpm smoke (from the repository root, after pnpm install).
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

const failures = [];
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok - ${name}`);
  } else {
    console.log(`  FAIL - ${name}${detail ? `: ${detail}` : ""}`);
    failures.push(name);
  }
}

const mongod = await MongoMemoryServer.create();
process.env.NODE_ENV = "test";
process.env.PORT = "0";
process.env.MONGODB_URI = mongod.getUri();
process.env.MONGODB_DATABASE = "pathlens_smoke";
process.env.ALLOWED_ORIGINS = "http://localhost:5173";
process.env.RATE_LIMIT_WINDOW_MS = "60000";
process.env.RATE_LIMIT_MAX_REQUESTS = "1000";

const { loadEnvironment } = await import("../dist/config/env.js");
const { createMongoClient } = await import("../dist/repositories/mongodb.js");
const { MongoEventRepository } = await import("../dist/repositories/events.js");
const { createApp } = await import("../dist/app.js");

const env = loadEnvironment();
const client = await createMongoClient(env);
const repository = new MongoEventRepository(client, env.MONGODB_DATABASE);
const app = createApp(env, client, repository);

const server = await new Promise((resolve) => {
  const running = app.listen(0, () => resolve(running));
});
const base = `http://127.0.0.1:${server.address().port}`;
const siteId = "smoke-store";
const sessionId = "11111111-2222-4333-8444-555555555555";

async function post(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function get(path) {
  const response = await fetch(`${base}${path}`, { headers: { Accept: "application/json" } });
  return { status: response.status, body: await response.json() };
}

try {
  console.log("smoke: tracker-style journey");
  const events = [
    {
      eventId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      siteId,
      sessionId,
      type: "page_view",
      pageUrl: "https://smoke.example.test/",
      occurredAt: new Date(Date.now() - 3000).toISOString(),
      viewport: { width: 1440, height: 900 },
      document: { width: 1440, height: 2400 },
    },
    {
      eventId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      siteId,
      sessionId,
      type: "page_view",
      pageUrl: "https://smoke.example.test/products",
      occurredAt: new Date(Date.now() - 2000).toISOString(),
      viewport: { width: 1440, height: 900 },
      document: { width: 1440, height: 2400 },
    },
    {
      eventId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
      siteId,
      sessionId,
      type: "click",
      pageUrl: "https://smoke.example.test/products",
      occurredAt: new Date(Date.now() - 1000).toISOString(),
      coordinates: { x: 320, y: 410 },
      viewport: { width: 1440, height: 900 },
      document: { width: 1440, height: 2400 },
    },
  ];
  const ingested = await post("/api/v1/events", { events });
  check("ingestion accepts the batch", ingested.status === 202 && ingested.body.accepted === 3, JSON.stringify(ingested.body));

  const duplicate = await post("/api/v1/events", { events });
  check(
    "retries are deduplicated",
    duplicate.status === 202 && duplicate.body.accepted === 0 && duplicate.body.duplicates === 3,
    JSON.stringify(duplicate.body),
  );

  const health = await get("/health");
  check("health reports connected", health.status === 200 && health.body.database === "connected");

  const summary = await get(`/api/v1/summary?siteId=${siteId}`);
  check(
    "summary counts the session",
    summary.status === 200 && summary.body.data.sessions === 1 && summary.body.data.clicks === 1,
    JSON.stringify(summary.body),
  );

  const sessions = await get(`/api/v1/sessions?siteId=${siteId}&page=1&pageSize=20`);
  check(
    "session list shows the journey",
    sessions.status === 200 &&
      sessions.body.pagination.total === 1 &&
      sessions.body.data[0].eventCount === 3,
    JSON.stringify(sessions.body),
  );

  const timeline = await get(`/api/v1/sessions/${sessionId}/events?siteId=${siteId}`);
  check(
    "timeline returns ordered events",
    timeline.status === 200 &&
      timeline.body.data.length === 3 &&
      timeline.body.data[0].type === "page_view" &&
      timeline.body.data[2].type === "click",
    JSON.stringify(timeline.body).slice(0, 200),
  );

  const pages = await get(`/api/v1/heatmap/pages?siteId=${siteId}`);
  check(
    "heatmap lists the clicked page",
    pages.status === 200 &&
      pages.body.data.some((page) => page.pageUrl === "https://smoke.example.test/products"),
    JSON.stringify(pages.body),
  );

  const clicks = await get(
    `/api/v1/heatmap/clicks?siteId=${siteId}&pageUrl=${encodeURIComponent("https://smoke.example.test/products")}&viewportClass=desktop&grid=10`,
  );
  check(
    "heatmap clicks carry coordinates and a grid",
    clicks.status === 200 &&
      clicks.body.data[0].x === 320 &&
      clicks.body.grid.size === 10 &&
      clicks.body.grid.cells.reduce((total, cell) => total + cell.count, 0) === 1,
    JSON.stringify(clicks.body).slice(0, 200),
  );

  const trends = await get(`/api/v1/trends?siteId=${siteId}`);
  check(
    "trends reflect ingested traffic",
    trends.status === 200 &&
      trends.body.data.some((day) => day.events === 3),
    JSON.stringify(trends.body).slice(0, 200),
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  await client.close();
  await mongod.stop();
}

if (failures.length > 0) {
  console.error(`smoke: ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("smoke: all checks passed");
