import type {
  SessionSummary,
  Pagination,
  HeatmapPage,
  HeatmapClick,
  HeatmapGrid,
  HeatmapResult,
  ViewportClass,
  ErrorEnvelope,
} from "@pathlens/contracts";

function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return configured;
  if (typeof window === "undefined") return "";
  // Production uses either an explicitly configured API origin or the same
  // origin that serves the dashboard.
  return window.location.origin;
}

const API_BASE = resolveApiBase();
const DEFAULT_SITE_ID = import.meta.env.VITE_SITE_ID ?? "demo-store";
const SITE_TOKEN = import.meta.env.VITE_SITE_TOKEN;
const SITE_STORAGE_KEY = "pathlens_site";

let siteId = DEFAULT_SITE_ID;
if (typeof window !== "undefined") {
  try {
    const stored = window.localStorage.getItem(SITE_STORAGE_KEY);
    if (stored) siteId = stored;
  } catch {
    // Storage unavailable; fall back to the configured default.
  }
}

export function getSiteId(): string {
  return siteId;
}

export function setSiteId(next: string): void {
  siteId = next;
  try {
    window.localStorage.setItem(SITE_STORAGE_KEY, next);
  } catch {
    // Storage unavailable; the in-memory value still applies.
  }
}

export interface ApiSummary {
  sessions: number;
  pageViews: number;
  clicks: number;
  averageEventsPerSession: number;
}

export interface SessionsResponse {
  data: SessionSummary[];
  pagination: Pagination;
}

export interface SessionEventsResponse {
  data: Array<{
    eventId: string;
    type: "page_view" | "click";
    pageUrl: string;
    occurredAt: string;
    coordinates?: { x: number; y: number };
  }>;
  pagination: Pagination;
}

export interface DailyTrend {
  date: string;
  pageViews: number;
  clicks: number;
  events: number;
}

export interface SiteInfo {
  siteId: string;
  events: number;
  sessions: number;
  lastActivityAt: string;
}

export async function getSites(): Promise<SiteInfo[]> {
  const response = await get<{ data: SiteInfo[] }>(`${API_BASE}/api/v1/sites`);
  return response.data;
}

function buildUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const search = new URLSearchParams();
  search.set("siteId", siteId);
  if (SITE_TOKEN) {
    search.set("token", SITE_TOKEN);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return `${API_BASE}${path}?${query}`;
}

async function get<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const envelope: ErrorEnvelope | null = await response
      .json()
      .then((json) => json as ErrorEnvelope)
      .catch(() => null);
    throw new ApiError(response.status, envelope);
  }
  return response.json();
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly envelope: ErrorEnvelope | null,
  ) {
    super(envelope?.error.message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
  }
}

export interface ApiHealth {
  status: string;
  database: string;
}

export async function getApiHealth(): Promise<ApiHealth> {
  return get<ApiHealth>(`${API_BASE}/health`);
}

export async function getSummary(
  from?: string,
  to?: string,
): Promise<ApiSummary> {
  const url = buildUrl("/api/v1/summary", { from, to });
  const response = await get<{ data: ApiSummary }>(url);
  return response.data;
}

export async function getSessions(
  page: number,
  pageSize: number,
  search?: string,
  from?: string,
  to?: string,
): Promise<SessionsResponse> {
  const params: Record<string, string | number | undefined> = {
    page,
    pageSize,
    from,
    to,
  };
  if (search) {
    (params as Record<string, string | number | undefined>).search = search;
  }
  const url = buildUrl("/api/v1/sessions", params);
  return get<SessionsResponse>(url);
}

export async function getSessionEvents(
  sessionId: string,
  page = 1,
  pageSize = 100,
): Promise<SessionEventsResponse> {
  const url = buildUrl("/api/v1/sessions/" + sessionId + "/events", { page, pageSize });
  return get<SessionEventsResponse>(url);
}

export async function getTrends(from?: string, to?: string): Promise<DailyTrend[]> {
  const url = buildUrl("/api/v1/trends", { from, to });
  const response = await get<{ data: DailyTrend[] }>(url);
  return response.data;
}

export async function getHeatmapPages(from?: string, to?: string): Promise<HeatmapPage[]> {
  const url = buildUrl("/api/v1/heatmap/pages", { from, to });
  const response = await get<{ data: HeatmapPage[] }>(url);
  return response.data;
}

export async function getHeatmapClicks(
  pageUrl: string,
  viewportClass: ViewportClass,
  from?: string,
  to?: string,
  gridSize?: number,
): Promise<HeatmapResult> {
  const params: Record<string, string | undefined> = {
    pageUrl,
    viewportClass,
    from,
    to,
  };
  if (gridSize !== undefined) {
    params.grid = String(gridSize);
  }
  const url = buildUrl("/api/v1/heatmap/clicks", params);
  return get<HeatmapResult>(url);
}

export interface HeatmapDeviceBreakdown {
  viewportClass: ViewportClass;
  clicks: number;
}

export interface AllViewportHeatmapResult {
  pageUrl: string;
  totalClicks: number;
  data: HeatmapClick[];
  breakdown: HeatmapDeviceBreakdown[];
  grid?: HeatmapGrid;
}

const HEATMAP_DEVICE_CLASSES: ViewportClass[] = ["desktop", "tablet", "mobile"];

export async function getAllViewportHeatmapClicks(
  pageUrl: string,
  from?: string,
  to?: string,
  gridSize?: number,
): Promise<AllViewportHeatmapResult> {
  const results = await Promise.all(
    HEATMAP_DEVICE_CLASSES.map((viewportClass) =>
      getHeatmapClicks(pageUrl, viewportClass, from, to, gridSize),
    ),
  );
  const data = results
    .flatMap((result) => result.data)
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));

  let grid: HeatmapGrid | undefined;
  if (gridSize !== undefined) {
    const cells = new Map<string, number>();
    for (const result of results) {
      for (const cell of result.grid?.cells ?? []) {
        const key = `${cell.col}:${cell.row}`;
        cells.set(key, (cells.get(key) ?? 0) + cell.count);
      }
    }
    grid = {
      size: gridSize,
      cells: [...cells.entries()]
        .map(([key, count]) => {
          const [col, row] = key.split(":").map(Number);
          return { col, row, count };
        })
        .sort((a, b) => b.count - a.count),
    };
  }

  return {
    pageUrl: results[0]?.pageUrl ?? pageUrl,
    totalClicks: results.reduce((total, result) => total + result.totalClicks, 0),
    data,
    breakdown: results.map((result) => ({
      viewportClass: result.viewportClass,
      clicks: result.totalClicks,
    })),
    ...(grid && { grid }),
  };
}
