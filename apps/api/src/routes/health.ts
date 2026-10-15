import { Router } from "express";
import { type MongoClient } from "mongodb";
import { AppError } from "../middleware/error-handler.js";

export function createHealthRouter(client: MongoClient): Router {
  const router = Router();

  // Liveness and database readiness in one check: a failed ping must not
  // report a successful readiness state, so it maps to 503 rather than 500.
  router.get("/health", async (_request, response, next) => {
    try {
      const admin = client.db().admin();
      await admin.ping();
      response.json({ status: "ok", database: "connected" });
    } catch (error) {
      console.error("Health check failed: database unreachable.", error);
      next(new AppError(503, "DATABASE_UNAVAILABLE", "Database unavailable"));
    }
  });

  return router;
}
