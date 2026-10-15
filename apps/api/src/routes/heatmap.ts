import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { MOBILE_MAX_WIDTH, TABLET_MAX_WIDTH } from "@pathlens/contracts";
import type { EventRepository } from "../repositories/events.js";
import { AppError } from "../middleware/error-handler.js";

const heatmapPagesQuery = z.object({
  siteId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const heatmapClicksQuery = z.object({
  siteId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  pageUrl: z.string().url().max(2048),
  viewportClass: z.enum(["mobile", "tablet", "desktop"]).default("desktop"),
  grid: z.coerce.number().int().min(5).max(50).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const HEATMAP_CLICKS_LIMIT = 2000;

export function createHeatmapRouter(repository: EventRepository, auth: RequestHandler): Router {
  const router = Router();
  router.use(auth);

  router.get("/heatmap/pages", async (request, response, next) => {
    try {
      const parsed = heatmapPagesQuery.safeParse(request.query);
      if (!parsed.success) {
        const details = parsed.error.errors.map((issue: z.ZodIssue) => ({
          field: issue.path.join(".") || "query",
          issue: issue.message,
        }));
        throw new AppError(400, "VALIDATION_ERROR", "Invalid query parameters", details);
      }

      const pages = await repository.listHeatmapPages({
        siteId: parsed.data.siteId,
        from: parsed.data.from,
        to: parsed.data.to,
      });

      response.json({ data: pages });
    } catch (error) {
      next(error);
    }
  });

  router.get("/heatmap/clicks", async (request, response, next) => {
    try {
      const parsed = heatmapClicksQuery.safeParse(request.query);
      if (!parsed.success) {
        const details = parsed.error.errors.map((issue: z.ZodIssue) => ({
          field: issue.path.join(".") || "query",
          issue: issue.message,
        }));
        throw new AppError(400, "VALIDATION_ERROR", "Invalid query parameters", details);
      }

      const canonicalUrl = new URL(parsed.data.pageUrl).origin + new URL(parsed.data.pageUrl).pathname;

      const result = await repository.getHeatmapClicks({
        siteId: parsed.data.siteId,
        pageUrl: canonicalUrl,
        viewportClass: parsed.data.viewportClass,
        viewportWidthThresholds: {
          mobileMaxWidth: MOBILE_MAX_WIDTH,
          tabletMaxWidth: TABLET_MAX_WIDTH,
        },
        from: parsed.data.from,
        to: parsed.data.to,
        limit: HEATMAP_CLICKS_LIMIT,
        gridSize: parsed.data.grid,
      });

      response.json({
        pageUrl: canonicalUrl,
        viewportClass: parsed.data.viewportClass,
        totalClicks: result.total,
        data: result.data,
        ...(result.grid && { grid: result.grid }),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
