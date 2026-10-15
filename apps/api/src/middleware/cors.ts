import cors from "cors";
import { type Environment } from "../config/env.js";
import { AppError } from "./error-handler.js";

export function configureCors({ ALLOWED_ORIGINS }: Environment): cors.CorsOptions {
  const allowedOrigins = new Set(ALLOWED_ORIGINS);
  allowedOrigins.add("null");

  return {
    origin: (origin, callback) => {
      // Requests without an Origin header (curl, health checks, address-bar
      // navigation) are not cross-origin browser requests, so there is
      // nothing for CORS to allow or deny. Only a present-but-disallowed
      // Origin is rejected.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new AppError(403, "FORBIDDEN", "Origin not allowed"), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"],
    credentials: false,
  };
}
