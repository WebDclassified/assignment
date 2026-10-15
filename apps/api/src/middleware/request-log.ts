import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

declare global {
  // Module augmentation for express request extension (namespace required).
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestId(request: Request, response: Response, next: NextFunction): void {
  const headerValue = request.headers["x-request-id"];
  const id =
    (Array.isArray(headerValue) ? headerValue[0] : headerValue)?.trim() || randomUUID();
  request.requestId = id;
  response.setHeader("X-Request-Id", id);
  next();
}

export function requestLog(request: Request, response: Response, next: NextFunction): void {
  const start = Date.now();
  response.on("finish", () => {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "request",
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Date.now() - start,
      }),
    );
  });
  next();
}
