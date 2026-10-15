export interface TrackerConfig {
  apiBase: string;
  siteId: string;
}

export interface QueuedEvent {
  payload: string;
  addedAt: number;
}

export const SESSION_STORAGE_KEY = "pathlens_session";
export const ACTIVITY_STORAGE_KEY = "pathlens_activity";
export const BATCH_FLUSH_EVENTS = 10;
export const BATCH_FLUSH_MS = 2_000;
export const MAX_QUEUE_PAYLOAD_BYTES = 48 * 1024;
export const SESSION_INACTIVITY_MS = 30 * 60 * 1000;
export const MAX_RETRIES = 3;
