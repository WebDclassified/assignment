import type { Request, Response, NextFunction } from "express";
import type { ErrorEnvelope } from "@pathlens/contracts";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ field: string; issue: string }>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    const envelope: ErrorEnvelope = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
      },
    };
    response.status(error.statusCode).json(envelope);
    return;
  }

  console.error(
    JSON.stringify({
      level: "error",
      msg: "unhandled error",
      requestId: request.requestId,
      method: request.method,
      path: request.path,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  const envelope: ErrorEnvelope = {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  };
  response.status(500).json(envelope);
}
