import rateLimit, { type Store } from "express-rate-limit";
import type { MongoClient } from "mongodb";
import { type Environment } from "../config/env.js";

// A persistent express-rate-limit store. The default in-memory store resets
// on every restart and is invisible across serverless isolates, which makes
// limits unreliable in production. Counts live in MongoDB next to the data.
interface RateLimitBucket {
  _id: string;
  hits: number;
  resetTime: Date;
}

export class MongoRateLimitStore implements Store {
  constructor(
    private readonly client: MongoClient,
    private readonly databaseName: string,
    private readonly windowMs: number,
  ) {}

  private collection = () =>
    this.client.db(this.databaseName).collection<RateLimitBucket>("rate_limits");

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    try {
      const now = new Date();
      const existing = await this.collection().findOne({ _id: key });
      if (!existing || !(existing.resetTime instanceof Date) || existing.resetTime <= now) {
        const resetTime = new Date(now.getTime() + this.windowMs);
        await this.collection().updateOne(
          { _id: key },
          { $set: { hits: 1, resetTime } },
          { upsert: true },
        );
        return { totalHits: 1, resetTime };
      }
      await this.collection().updateOne({ _id: key }, { $inc: { hits: 1 } });
      return { totalHits: existing.hits + 1, resetTime: existing.resetTime };
    } catch (error: unknown) {
      // Fail open: a store outage (wrong permissions, network blip) must not
      // turn every request into a 500 before handlers can respond honestly.
      console.error(
        JSON.stringify({
          level: "error",
          msg: "rate limit store unavailable; failing open",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    }
  }

  async decrement(key: string): Promise<void> {
    const existing = await this.collection().findOne({ _id: key });
    if (!existing) return;
    if (existing.hits <= 1) {
      await this.collection().deleteOne({ _id: key });
      return;
    }
    await this.collection().updateOne({ _id: key }, { $inc: { hits: -1 } });
  }

  async resetKey(key: string): Promise<void> {
    await this.collection().deleteOne({ _id: key });
  }
}

export function createRateLimit(
  { RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS, MONGODB_DATABASE }: Environment,
  client: MongoClient,
) {
  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    // Readiness probes must never be throttled or depend on the limiter.
    skip: (request) => request.path === "/health",
    store: new MongoRateLimitStore(client, MONGODB_DATABASE, RATE_LIMIT_WINDOW_MS),
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests, please try again later",
      },
    },
  });
}
