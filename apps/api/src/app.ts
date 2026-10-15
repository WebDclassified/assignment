import express from "express";
import cors from "cors";
import helmet from "helmet";
import {
  bodyLimit,
  createRateLimit,
  errorHandler,
  requestId,
  requestLog,
} from "./middleware/index.js";
import { configureCors } from "./middleware/cors.js";
import { createApiRouter } from "./routes/index.js";
import type { EventRepository } from "./repositories/events.js";
import type { Environment } from "./config/env.js";
import type { MongoClient } from "mongodb";

export function createApp(env: Environment, client: MongoClient, repository: EventRepository): express.Express {
  const app: express.Express = express();

  app.set("trust proxy", env.NODE_ENV === "production" ? 1 : 0);

  app.use(requestId);
  app.use(requestLog);
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  // navigator.sendBeacon posts the JSON payload as a text/plain Blob.
  app.use(express.text({ type: "text/plain", limit: "1mb" }));
  app.use(bodyLimit);

  // Same-origin requests (the browser sends an Origin matching the Host
  // header) never need CORS validation. Skipping them keeps a same-origin
  // deployment working without listing its domain in ALLOWED_ORIGINS.
  const corsMiddleware = cors(configureCors(env));
  app.use((request, response, next) => {
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (origin && host && (origin === `http://${host}` || origin === `https://${host}`)) {
      next();
      return;
    }
    corsMiddleware(request, response, next);
  });

  app.use(createRateLimit(env, client));

  app.use(createApiRouter(client, repository, env.SITE_READ_TOKENS ?? new Map()));

  app.use(errorHandler);

  return app;
}
