import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { EventRepository } from "../repositories/events.js";
import { AppError } from "../middleware/error-handler.js";

const trendsQuery = z.object({
  siteId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export function createTrendsRouter(repository: EventRepository, auth: RequestHandler): Router {
  const router = Router();
  router.use(auth);

  router.get("/trends", async (request, response, next) => {
    try {
      const parsed = trendsQuery.safeParse(request.query);
      if (!parsed.success) {
        const details = parsed.error.errors.map((issue: z.ZodIssue) => ({
          field: issue.path.join(".") || "query",
          issue: issue.message,
        }));
        throw new AppError(400, "VALIDATION_ERROR", "Invalid query parameters", details);
      }

      const trends = await repository.getDailyTrends({
        siteId: parsed.data.siteId,
        from: parsed.data.from,
        to: parsed.data.to,
      });

      response.json({ data: trends });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
