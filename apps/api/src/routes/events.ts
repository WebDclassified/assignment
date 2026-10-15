import { Router } from "express";
import { z } from "zod";
import { eventBatchSchema } from "@pathlens/contracts";
import type { EventRepository } from "../repositories/events.js";
import { AppError } from "../middleware/error-handler.js";

export function createEventsRouter(repository: EventRepository): Router {
  const router = Router();

  router.post("/events", async (request, response, next) => {
    try {
      const body = request.body;

      let parsedBatch: z.infer<typeof eventBatchSchema>;
      if (typeof body === "string") {
        try {
          parsedBatch = JSON.parse(body);
        } catch {
          throw new AppError(400, "VALIDATION_ERROR", "Request body is not valid JSON");
        }
      } else {
        parsedBatch = body;
      }

      const result = eventBatchSchema.safeParse(parsedBatch);
      if (!result.success) {
        const details = result.error.errors.map((issue: z.ZodIssue) => ({
          field: issue.path.join(".") || "events",
          issue: issue.message,
        }));
        throw new AppError(400, "VALIDATION_ERROR", "The event payload is invalid", details);
      }

      const accepted = await repository.ingest(result.data.events);
      response.status(202).json({ accepted, duplicates: result.data.events.length - accepted });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
