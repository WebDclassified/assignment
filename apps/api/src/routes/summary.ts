import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { EventRepository } from "../repositories/events.js";
import { AppError } from "../middleware/error-handler.js";

const summaryQuery = z.object({
  siteId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export function createSummaryRouter(repository: EventRepository, auth: RequestHandler): Router {
  const router = Router();
  router.use(auth);

  router.get("/summary", async (request, response, next) => {
    try {
      const parsed = summaryQuery.safeParse(request.query);
      if (!parsed.success) {
        const details = parsed.error.errors.map((issue: z.ZodIssue) => ({
          field: issue.path.join(".") || "query",
          issue: issue.message,
        }));
        throw new AppError(400, "VALIDATION_ERROR", "Invalid query parameters", details);
      }

      const stats = await repository.getSummaryStats({
        siteId: parsed.data.siteId,
        from: parsed.data.from,
        to: parsed.data.to,
      });

      const averageEventsPerSession =
        stats.sessions > 0 ? stats.events / stats.sessions : 0;

      response.json({
        data: {
          sessions: stats.sessions,
          pageViews: stats.pageViews,
          clicks: stats.clicks,
          averageEventsPerSession: Math.round(averageEventsPerSession * 100) / 100,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
