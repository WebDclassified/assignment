import type { Request, Response, NextFunction } from "express";

const MAX_BODY_BYTES = 1_048_576; // 1 MiB

export function bodyLimit(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const contentLength = request.headers["content-length"];
  if (contentLength !== undefined) {
    const length = Number(contentLength);
    if (!Number.isFinite(length) || length > MAX_BODY_BYTES) {
      response.status(413).json({
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Request body is too large",
        },
      });
      return;
    }
  }
  next();
}
