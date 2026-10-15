import type { Express } from "express";
import { loadEnvironment } from "./config/env.js";
import { createMongoClient } from "./repositories/mongodb.js";
import { MongoEventRepository } from "./repositories/events.js";
import { createApp } from "./app.js";

let appPromise: Promise<Express> | undefined;

/**
 * Builds the Express app once per serverless isolate and reuses the
 * MongoDB connection across invocations. A failed initialisation clears
 * the cache so the next invocation retries instead of failing forever.
 */
export function getServerlessApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = (async () => {
      const env = loadEnvironment();
      const client = await createMongoClient(env);
      const repository = new MongoEventRepository(client, env.MONGODB_DATABASE);
      return createApp(env, client, repository);
    })().catch((error: unknown) => {
      appPromise = undefined;
      throw error;
    });
  }
  return appPromise;
}
