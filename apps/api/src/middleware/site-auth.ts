import type { RequestHandler } from "express";
import { AppError } from "./error-handler.js";

// Optional per-site read authorization. When no tokens are configured every
// read endpoint stays public (the demo default). When tokens are configured,
// listed sites require their token via the x-site-token header or the token
// query parameter; unlisted sites stay public. Ingestion is intentionally
// left open: a browser tracker cannot keep a secret.
export function createSiteAuth(tokens: Map<string, string>): RequestHandler {
  return (request, _response, next): void => {
    if (tokens.size === 0) {
      next();
      return;
    }
    const siteId = typeof request.query.siteId === "string" ? request.query.siteId : "";
    const expected = tokens.get(siteId);
    if (!expected) {
      next();
      return;
    }
    const headerToken = request.headers["x-site-token"];
    const queryToken = typeof request.query.token === "string" ? request.query.token : undefined;
    const provided = (Array.isArray(headerToken) ? headerToken[0] : headerToken) ?? queryToken ?? "";
    if (provided === expected) {
      next();
      return;
    }
    next(new AppError(401, "UNAUTHORIZED", "A valid site token is required"));
  };
}
