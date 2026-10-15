// Vercel serverless entry point. vercel.json rewrites /api/* and /health
// here; the Express app handles every route (including its own /api/v1
// prefix) exactly as it does for local development.
import type { IncomingMessage, ServerResponse } from "node:http";
import { getServerlessApp } from "../apps/api/src/serverless.js";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const app = await getServerlessApp();
    app(request, response);
  } catch (error) {
    console.error("Failed to initialise the Pathlens API:", error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          error: { code: "INTERNAL_ERROR", message: "Server configuration error" },
        }),
      );
    }
  }
}
