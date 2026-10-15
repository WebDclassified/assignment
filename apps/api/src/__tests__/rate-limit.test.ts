import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoClient } from "mongodb";
import { MongoRateLimitStore } from "../middleware/rate-limit.js";
import { loadEnvironment } from "../config/env.js";

describe("MongoRateLimitStore", () => {
  let client: MongoClient;
  let store: MongoRateLimitStore;

  beforeAll(async () => {
    const env = loadEnvironment();
    client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    // Isolated database so rate-limit keys never collide with app requests.
    store = new MongoRateLimitStore(client, `${env.MONGODB_DATABASE}_ratelimit`, 60_000);
  });

  afterAll(async () => {
    await client.close();
  });

  it("counts hits persistently within a window", async () => {
    expect((await store.increment("store-test-key")).totalHits).toBe(1);
    expect((await store.increment("store-test-key")).totalHits).toBe(2);
    const third = await store.increment("store-test-key");
    expect(third.totalHits).toBe(3);
    expect(third.resetTime instanceof Date).toBe(true);
  });

  it("resets a single key on demand", async () => {
    await store.increment("reset-test-key");
    await store.resetKey("reset-test-key");
    expect((await store.increment("reset-test-key")).totalHits).toBe(1);
  });
});
