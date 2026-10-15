import { BATCH_FLUSH_EVENTS, BATCH_FLUSH_MS, MAX_QUEUE_PAYLOAD_BYTES, MAX_RETRIES } from "./types.js";

export interface QueueCallbacks {
  onFlush: (payload: string) => Promise<boolean>;
  onError: (error: unknown) => void;
}

export class EventQueue {
  private queue: Array<{ payload: string; addedAt: number }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly callbacks: QueueCallbacks;
  private readonly pending: Set<string> = new Set();

  constructor(callbacks: QueueCallbacks) {
    this.callbacks = callbacks;
    this.startFlushTimer();
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, BATCH_FLUSH_MS);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  enqueue(payload: string): boolean {
    if (payload.length > MAX_QUEUE_PAYLOAD_BYTES) {
      return false;
    }
    this.queue.push({ payload, addedAt: Date.now() });
    this.startFlushTimer();
    if (this.queue.length >= BATCH_FLUSH_EVENTS) {
      this.stopFlushTimer();
      this.scheduleFlush();
    }
    return true;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 0);
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) {
      this.stopFlushTimer();
      return;
    }
    this.stopFlushTimer();

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, BATCH_FLUSH_EVENTS);
      const payload = JSON.stringify({
        events: batch.map((item) => JSON.parse(item.payload)),
      });

      let lastError: unknown = null;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const accepted = await this.callbacks.onFlush(payload);
          if (accepted) {
            lastError = null;
            break;
          }
          lastError = new Error("Flush not accepted");
        } catch (error) {
          lastError = error;
        }
      }

      if (lastError) {
        this.callbacks.onError(lastError);
        // Stop draining on a failed batch; the remaining events keep their
        // queued order for the next flush attempt.
        break;
      }
    }
  }

  async flushForUnload(): Promise<void> {
    await this.flush();
  }

  getPendingPayloads(): string[] {
    return this.queue.map((item) => item.payload);
  }

  clear(): void {
    this.queue = [];
    this.stopFlushTimer();
    this.pending.clear();
  }

  get length(): number {
    return this.queue.length;
  }
}
