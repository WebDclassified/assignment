import { z } from "zod";
import type { AnalyticsEvent, StoredEvent, Coordinates } from "./types.js";

// Client clocks can run slightly ahead of the server. Anything beyond this
// skew is treated as untrusted input and rejected instead of stored.
export const MAX_FUTURE_SKEW_MS = 60 * 60 * 1000;

const viewportSchema = z
  .object({
    width: z.number().int().min(1).max(10000),
    height: z.number().int().min(1).max(10000),
  })
  .strict();

const documentSchema = z
  .object({
    width: z.number().int().min(1).max(100000),
    height: z.number().int().min(1).max(1000000),
  })
  .strict();

const eventIdSchema = z.string().uuid();
const sessionIdSchema = z.string().uuid();
const siteIdSchema = z
  .string()
  .min(1, "siteId must not be empty")
  .max(80, "siteId must be at most 80 characters")
  .regex(/^[a-zA-Z0-9_-]+$/, "siteId contains invalid characters");
const eventTypeSchema = z.enum(["page_view", "click"]);
const pageUrlSchema = z
  .string()
  .url({ message: "pageUrl must be a valid URL" })
  .max(2048, "pageUrl must be at most 2048 characters")
  .refine(
    (value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "pageUrl must use http or https" },
  );
const occurredAtSchema = z.string().datetime({ message: "occurredAt must be a valid ISO 8601 date-time" });

const baseEventSchema = z
  .object({
    eventId: eventIdSchema,
    siteId: siteIdSchema,
    sessionId: sessionIdSchema,
    type: eventTypeSchema,
    pageUrl: pageUrlSchema,
    occurredAt: occurredAtSchema,
    coordinates: z
      .object({
        x: z.number().finite().min(0),
        y: z.number().finite().min(0),
      })
      .strict()
      .optional(),
    viewport: viewportSchema,
    document: documentSchema,
    referrerOrigin: z.string().max(255).nullable().optional(),
  })
  .strict();

export const eventSchema: z.ZodType<AnalyticsEvent> = baseEventSchema
  .refine(
    (event) => {
      if (event.type === "click") {
        if (!event.coordinates) return false;
        if (!Number.isFinite(event.coordinates.x) || event.coordinates.x < 0) return false;
        if (!Number.isFinite(event.coordinates.y) || event.coordinates.y < 0) return false;
      }
      if (event.type !== "click" && event.coordinates !== undefined) {
        return false;
      }
      return true;
    },
    {
      message: "click events require coordinates; page_view events must not include coordinates",
      path: ["coordinates"],
    },
  )
  .refine(
    (event) => {
      // Client clocks can skew slightly, but an event timestamp far in the
      // future is treated as untrusted input rather than stored.
      const occurredAt = new Date(event.occurredAt).getTime();
      return Number.isFinite(occurredAt) && occurredAt <= Date.now() + MAX_FUTURE_SKEW_MS;
    },
    {
      message: "occurredAt must not be unreasonably far in the future",
      path: ["occurredAt"],
    },
  );

export const eventBatchSchema = z
  .object({
    events: z.array(eventSchema).min(1, "At least one event is required").max(50, "At most 50 events are allowed per batch"),
  })
  .strict();

export const storedEventSchema: z.ZodType<StoredEvent> = baseEventSchema.extend({
  pathname: z.string().min(1).max(2048),
  receivedAt: z.string().datetime({ message: "receivedAt must be a valid ISO 8601 date-time" }),
});

export function isClickEvent(event: AnalyticsEvent): event is AnalyticsEvent & { type: "click"; coordinates: Coordinates } {
  return event.type === "click" && "coordinates" in event && event.coordinates !== undefined;
}
