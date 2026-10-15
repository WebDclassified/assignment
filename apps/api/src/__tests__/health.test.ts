import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoClient } from "mongodb";
import { createApp } from "../app.js";
import { MongoEventRepository } from "../repositories/events.js";
import { loadEnvironment } from "../config/env.js";
import request from "supertest";

describe("GET /health", () => {
  let app: ReturnType<typeof createApp>;
  let client: MongoClient;

  beforeAll(async () => {
    const env = loadEnvironment();
    client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    const repository = new MongoEventRepository(client);
    app = createApp(env, client, repository);
  });

  afterAll(async () => {
    await client.close();
  });

  it("returns status ok and database connected when MongoDB is reachable", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "connected" });
  });

  it("returns 503 instead of success when the database is unreachable", async () => {
    const env = loadEnvironment();
    const badClient = new MongoClient("mongodb://127.0.0.1:1/", {
      serverSelectionTimeoutMS: 500,
    });
    const badApp = createApp(
      { ...env, NODE_ENV: "production", ALLOWED_ORIGINS: ["http://localhost:5173"] },
      badClient,
      new MongoEventRepository(badClient, env.MONGODB_DATABASE),
    );

    const response = await request(badApp).get("/health");
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("DATABASE_UNAVAILABLE");

    await badClient.close();
  });

  it("in production mode allows origin-less requests but rejects disallowed origins", async () => {
    const env = loadEnvironment();
    const productionApp = createApp(
      { ...env, NODE_ENV: "production", ALLOWED_ORIGINS: ["http://localhost:5173"] },
      client,
      new MongoEventRepository(client, env.MONGODB_DATABASE),
    );

    const noOrigin = await request(productionApp).get("/health");
    expect(noOrigin.status).toBe(200);

    const allowedOrigin = await request(productionApp)
      .get("/health")
      .set("Origin", "http://localhost:5173");
    expect(allowedOrigin.status).toBe(200);

    const deniedOrigin = await request(productionApp)
      .get("/health")
      .set("Origin", "http://evil.example");
    expect(deniedOrigin.status).toBe(403);
    expect(deniedOrigin.body.error.code).toBe("FORBIDDEN");
  });
});
