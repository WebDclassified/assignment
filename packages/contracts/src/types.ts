export type EventType = "page_view" | "click";
export type ViewportClass = "mobile" | "tablet" | "desktop";

export interface Coordinates {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface DocumentDimensions {
  width: number;
  height: number;
}

export interface AnalyticsEvent {
  eventId: string;
  siteId: string;
  sessionId: string;
  type: EventType;
  pageUrl: string;
  occurredAt: string;
  coordinates?: Coordinates;
  viewport: Viewport;
  document: DocumentDimensions;
  referrerOrigin?: string | null;
}

export interface StoredEvent extends AnalyticsEvent {
  pathname: string;
  receivedAt: string;
}

export interface EventBatch {
  events: AnalyticsEvent[];
}

export interface SessionSummary {
  sessionId: string;
  eventCount: number;
  pageViews: number;
  clicks: number;
  startedAt: string;
  lastActivityAt: string;
  durationSeconds: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface HeatmapPage {
  pageUrl: string;
  clicks: number;
}

export interface HeatmapClick {
  x: number;
  y: number;
  viewport: Viewport;
  document: DocumentDimensions;
  occurredAt: string;
}

export interface HeatmapGridCell {
  col: number;
  row: number;
  count: number;
}

export interface HeatmapGrid {
  size: number;
  cells: HeatmapGridCell[];
}

export interface HeatmapResult {
  pageUrl: string;
  viewportClass: ViewportClass;
  totalClicks: number;
  data: HeatmapClick[];
  grid?: HeatmapGrid;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; issue: string }>;
  };
}

// Alias for backwards compatibility with spec terminology
export type Event = AnalyticsEvent;
