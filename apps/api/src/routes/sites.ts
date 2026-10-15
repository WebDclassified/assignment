import { Router, type RequestHandler } from "express";
import type { EventRepository } from "../repositories/events.js";

export function createSitesRouter(repository: EventRepository, auth: RequestHandler): Router {
  const router = Router();
  router.use(auth);

  router.get("/sites", async (_request, response, next) => {
    try {
      const sites = await repository.listSites();
      response.json({ data: sites });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
