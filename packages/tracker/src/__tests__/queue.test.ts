import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { EventQueue } from "../queue.js";

function createQueue(): { queue: EventQueue; onFlush: Mock; onError: Mock } {
  const onFlush = vi.fn().mockResolvedValue(true);
  const onError = vi.fn();
  const queue = new EventQueue({ onFlush, onError });
  return { queue, onFlush, onError };
}

describe("EventQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueues events", () => {
    const { queue } = createQueue();
    expect(queue.enqueue(JSON.stringify({ x: 1 }))).toBe(true);
    expect(queue.length).toBe(1);
  });

  it("flushes after the batch threshold", () => {
    const { queue, onFlush } = createQueue();
    for (let i = 0; i < 10; i++) {
      queue.enqueue(JSON.stringify({ i }));
    }
    expect(onFlush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("flushes after the timer without reaching the batch threshold", () => {
    const { queue, onFlush } = createQueue();
    queue.enqueue(JSON.stringify({ i: 1 }));
    vi.advanceTimersByTime(2_100);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("does nothing on flush when the queue is empty", () => {
    const { queue, onFlush } = createQueue();
    queue.flush();
    expect(onFlush).not.toHaveBeenCalled();
  });
});
