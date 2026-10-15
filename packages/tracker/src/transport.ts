import { MAX_QUEUE_PAYLOAD_BYTES } from "./types.js";

export interface TransportResult {
  accepted: boolean;
}

export async function deliverViaFetch(payload: string, apiBase: string): Promise<TransportResult> {
  if (payload.length > MAX_QUEUE_PAYLOAD_BYTES) {
    return { accepted: false };
  }

  try {
    const response = await fetch(`${apiBase}/api/v1/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
      keepalive: true,
    });

    if (response.ok || response.status === 202) {
      return { accepted: true };
    }

    return { accepted: false };
  } catch {
    return { accepted: false };
  }
}

export function deliverViaBeacon(payload: string, apiBase: string): boolean {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) {
    return false;
  }

  try {
    const blob = new Blob([payload], { type: "text/plain" });
    const url = `${apiBase}/api/v1/events`;
    const result = navigator.sendBeacon(url, blob);
    return result === true;
  } catch {
    return false;
  }
}

export async function deliverForUnload(payload: string, apiBase: string): Promise<boolean> {
  if (typeof navigator === "undefined") {
    return false;
  }

  if (navigator.sendBeacon) {
    try {
      const blob = new Blob([payload], { type: "text/plain" });
      const url = `${apiBase}/api/v1/events`;
      const result = navigator.sendBeacon(url, blob);
      if (result) {
        return true;
      }
    } catch {
      // fall through to fetch keepalive
    }
  }

  try {
    const response = await fetch(`${apiBase}/api/v1/events`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: payload,
      keepalive: true,
    });
    return response.ok || response.status === 202;
  } catch {
    return false;
  }
}
