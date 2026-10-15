import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { EventRepository } from "../repositories/events.js";
import { AppError } from "../middleware/error-handler.js";

const paginatedSessionsQuery = z.object({
  siteId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const sessionEventsQuery = z.object({
  siteId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(100),
});

const sessionIdParam = z.string().uuid({ message: "sessionId must be a valid UUID" });

export function createSessionsRouter(repository: EventRepository, auth: RequestHandler): Router {
  const router = Router();
  router.use(auth);

  router.get("/sessions", async (request, response, next) => {
    try {
      const parsed = paginatedSessionsQuery.safeParse(request.query);
      if (!parsed.success) {
        const details = parsed.error.errors.map((issue: z.ZodIssue) => ({
          field: issue.path.join(".") || "query",
          issue: issue.message,
        }));
        throw new AppError(400, "VALIDATION_ERROR", "Invalid query parameters", details);
      }

      const { siteId, page, pageSize, search, from, to } = parsed.data;
      const result = await repository.listSessions({ siteId, page, pageSize, search, from, to });

      response.json({
        data: result.data,
        pagination: {
          page,
          pageSize,
          total: result.total,
          totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/sessions/:sessionId/events", async (request, response, next) => {
    try {
      const parsedParams = sessionIdParam.safeParse(request.params.sessionId);
      const parsedQuery = sessionEventsQuery.safeParse(request.query);
      if (!parsedParams.success || !parsedQuery.success) {
        const details = [
          ...(!parsedParams.success
            ? parsedParams.error.errors.map((issue: z.ZodIssue) => ({
                field: `params.sessionId`,
                issue: issue.message,
              }))
            : []),
          ...(!parsedQuery.success
            ? parsedQuery.error.errors.map((issue: z.ZodIssue) => ({
                field: issue.path.join(".") || "query",
                issue: issue.message,
              }))
            : []),
        ];
        throw new AppError(400, "VALIDATION_ERROR", "Invalid session events request", details);
      }

      const { siteId, page, pageSize } = parsedQuery.data;
      const result = await repository.getSessionEvents({
        siteId,
        sessionId: parsedParams.data,
        page,
        pageSize,
      });

      response.json({
        data: result.data,
        pagination: {
          page,
          pageSize,
          total: result.total,
          totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
