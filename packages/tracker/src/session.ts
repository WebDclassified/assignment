import { generateId } from "./utils.js";
import { SESSION_STORAGE_KEY, ACTIVITY_STORAGE_KEY, SESSION_INACTIVITY_MS } from "./types.js";

export interface SessionState {
  id: string;
  lastActivity: number;
}

function safeNow(): number {
  return Date.now();
}

// Reduced-behavior fallback for browsers where storage is unavailable: the
// session lives in memory for the current document instead of rotating on
// every single event.
let memorySession: SessionState | null = null;

function isFresh(state: SessionState | null): state is SessionState {
  return state !== null && safeNow() - state.lastActivity <= SESSION_INACTIVITY_MS;
}

export function createSessionId(): string {
  return generateId();
}

export function readSession(): SessionState | null {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    const activity = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    if (!stored || !activity) return isFresh(memorySession) ? memorySession : null;
    const id = stored.trim();
    const lastActivity = Number(activity);
    if (!id || !Number.isFinite(lastActivity)) return null;
    if (safeNow() - lastActivity > SESSION_INACTIVITY_MS) {
      return null;
    }
    const state = { id, lastActivity };
    memorySession = state;
    return state;
  } catch {
    return isFresh(memorySession) ? memorySession : null;
  }
}

export function writeSession(id: string): void {
  memorySession = { id, lastActivity: safeNow() };
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, id);
    localStorage.setItem(ACTIVITY_STORAGE_KEY, String(safeNow()));
  } catch {
    // localStorage unavailable; keep in-memory only
  }
}

export function refreshActivity(): void {
  if (memorySession) {
    memorySession = { ...memorySession, lastActivity: safeNow() };
  }
  try {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, String(safeNow()));
  } catch {
    // ignore
  }
}

export function getOrCreateSessionId(): string {
  const existing = readSession();
  if (existing) {
    refreshActivity();
    return existing.id;
  }
  const id = createSessionId();
  writeSession(id);
  return id;
}

export function resetSession(): void {
  memorySession = null;
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(ACTIVITY_STORAGE_KEY);
  } catch {
    // ignore
  }
}
