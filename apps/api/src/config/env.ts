import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("production"),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  MONGODB_URI: z.string().url().min(1),
  MONGODB_DATABASE: z.string().min(1).max(64).default("pathlens"),
  ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1).default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(120),
  // Optional per-site read tokens as "siteId:token" pairs separated by
  // commas. When set, read endpoints require the token for listed sites;
  // unlisted sites (like the open demo) stay public.
  SITE_READ_TOKENS: z
    .string()
    .optional()
    .transform((value) => {
      const tokens = new Map<string, string>();
      if (!value) return tokens;
      for (const pair of value.split(",")) {
        const separator = pair.indexOf(":");
        if (separator <= 0) continue;
        tokens.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
      }
      return tokens;
    }),
  // Optional event retention in days. When set, events older than this expire
  // automatically via a TTL index; when unset, events are kept indefinitely.
  EVENT_RETENTION_DAYS: z.coerce.number().int().min(1).optional(),
});

export type Environment = z.infer<typeof envSchema>;

export function loadEnvironment(): Environment {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid API environment configuration:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
