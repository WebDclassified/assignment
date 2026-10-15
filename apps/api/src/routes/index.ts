import { Router } from "express";
import { createHealthRouter } from "./health.js";
import { createEventsRouter } from "./events.js";
import { createSessionsRouter } from "./sessions.js";
import { createHeatmapRouter } from "./heatmap.js";
import { createSummaryRouter } from "./summary.js";
import { createTrendsRouter } from "./trends.js";
import { createSitesRouter } from "./sites.js";
import { createSiteAuth } from "../middleware/site-auth.js";
import type { EventRepository } from "../repositories/events.js";
import type { MongoClient } from "mongodb";

export function createV1Router(repository: EventRepository, tokens: Map<string, string>): Router {
  const router = Router();
  const auth = createSiteAuth(tokens);
  router.use(createEventsRouter(repository));
  router.use(createSessionsRouter(repository, auth));
  router.use(createHeatmapRouter(repository, auth));
  router.use(createSummaryRouter(repository, auth));
  router.use(createTrendsRouter(repository, auth));
  router.use(createSitesRouter(repository, auth));
  return router;
}

export function createApiRouter(
  client: MongoClient,
  repository: EventRepository,
  tokens: Map<string, string>,
): Router {
  const router = Router();
  router.use(createHealthRouter(client));
  router.use("/api/v1", createV1Router(repository, tokens));
  return router;
}
