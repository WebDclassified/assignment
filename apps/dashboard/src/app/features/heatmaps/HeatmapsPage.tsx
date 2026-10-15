import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import {
  getHeatmapPages,
  getHeatmapClicks,
  getAllViewportHeatmapClicks,
  ApiError,
  type HeatmapDeviceBreakdown,
} from "../../../lib/api";
import type { HeatmapPage, HeatmapResult, HeatmapClick } from "@pathlens/contracts";
import { formatCount, pagePathname, readHashParams, writeHashParams } from "../../../lib/utils";

interface HeatmapsPageProps {
  from: string;
  to: string;
}

const VIEWPORT_OPTIONS = [
  { value: "desktop", label: "Desktop" },
  { value: "tablet", label: "Tablet" },
  { value: "mobile", label: "Mobile" },
  { value: "all", label: "All devices" },
] as const;

type ViewportFilter = (typeof VIEWPORT_OPTIONS)[number]["value"];

function viewportFromHash(): ViewportFilter {
  const value = readHashParams().hmDevice;
  return (VIEWPORT_OPTIONS as readonly { value: string }[]).some((option) => option.value === value)
    ? (value as ViewportFilter)
    : "desktop";
}

const DISPLAY_MODES = [
  { value: "intensity", label: "Heat" },
  { value: "points", label: "Points" },
  { value: "grid", label: "Grid" },
] as const;

const GRID_SIZE = 24;

const PREVIEW_MODES = [
  { value: "live", label: "Live page" },
  { value: "schematic", label: "Schematic" },
] as const;

type PreviewMode = (typeof PREVIEW_MODES)[number]["value"];

// The stage uses the most common recorded document size so markers and the
// page underneath share one coordinate system. Markers are then placed by
// ratio against each click's own document size, which keeps positions exact
// even when viewports differ.
function modeDocumentSize(clicks: HeatmapClick[]): { width: number; height: number } {
  const counts = new Map<string, number>();
  for (const click of clicks) {
    const key = `${click.document.width}x${click.document.height}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = { width: 1440, height: 900, count: 0 };
  for (const [key, count] of counts) {
    const [width, height] = key.split("x").map(Number);
    if (count > best.count && width > 0 && height > 0) {
      best = { width, height, count };
    }
  }
  return { width: best.width, height: best.height };
}

const LEGEND_STOPS = [
  { label: "Low", color: "#35C7F4" },
  { label: "Medium", color: "#55E28A" },
  { label: "High", color: "#FFE45B" },
  { label: "Hot", color: "#FF6B4A" },
];

type DisplayMode = (typeof DISPLAY_MODES)[number]["value"];

export function HeatmapsPage({ from, to }: HeatmapsPageProps) {
  const [pages, setPages] = useState<HeatmapPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [clicks, setClicks] = useState<HeatmapResult | null>(null);
  const [deviceBreakdown, setDeviceBreakdown] = useState<HeatmapDeviceBreakdown[] | null>(null);
  const [loadingPages, setLoadingPages] = useState(true);
  const [loadingClicks, setLoadingClicks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewportClass, setViewportClass] = useState<ViewportFilter>(() => viewportFromHash());
  const [displayMode, setDisplayMode] = useState<DisplayMode>("intensity");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("live");
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestId = useRef(0);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 400 });

  const fetchPages = useCallback(async () => {
    setLoadingPages(true);
    setError(null);
    try {
      const data = await getHeatmapPages(from, to);
      setPages(data);
      if (data.length > 0) {
        setSelectedPage((previous) => {
          if (previous) return previous;
          const linked = readHashParams().hmPage;
          if (linked && data.some((page) => page.pageUrl === linked)) return linked;
          return data[0].pageUrl;
        });
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.envelope?.error.message ?? "Failed to load pages");
      } else {
        setError("Failed to load pages");
      }
    } finally {
      setLoadingPages(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  useEffect(() => {
    writeHashParams({
      page: "heatmaps",
      hmPage: selectedPage,
      hmDevice: viewportClass === "desktop" ? null : viewportClass,
    });
  }, [selectedPage, viewportClass]);

  const fetchClicks = useCallback(async () => {
    if (!selectedPage) return;
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setLoadingClicks(true);
    try {
      const gridSize = displayMode === "grid" ? GRID_SIZE : undefined;
      if (viewportClass === "all") {
        const combined = await getAllViewportHeatmapClicks(selectedPage, from, to, gridSize);
        if (requestId.current !== currentRequest) return;
        setClicks({
          pageUrl: combined.pageUrl,
          viewportClass: "desktop",
          totalClicks: combined.totalClicks,
          data: combined.data,
          ...(combined.grid && { grid: combined.grid }),
        });
        setDeviceBreakdown(combined.breakdown);
      } else {
        const data = await getHeatmapClicks(
          selectedPage,
          viewportClass,
          from,
          to,
          gridSize,
        );
        if (requestId.current !== currentRequest) return;
        setClicks(data);
        setDeviceBreakdown(null);
      }
    } catch (err: unknown) {
      if (requestId.current !== currentRequest) return;
      if (err instanceof ApiError) {
        setError(err.envelope?.error.message ?? "Failed to load clicks");
      } else {
        setError("Failed to load clicks");
      }
    } finally {
      if (requestId.current === currentRequest) {
        setLoadingClicks(false);
      }
    }
  }, [selectedPage, viewportClass, displayMode, from, to]);

  useEffect(() => {
    fetchClicks();
  }, [fetchClicks]);

  useEffect(() => {
    const target = stageRef.current;
    if (!target) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    resizeObserver.observe(target);
    return () => resizeObserver.disconnect();
  }, [clicks]);

  const stageDocument = clicks && clicks.data.length > 0
    ? modeDocumentSize(clicks.data)
    : { width: 1440, height: 900 };
  const documentWidth = stageDocument.width;
  const documentHeight = stageDocument.height;

  useEffect(() => {
    if (!canvasRef.current || !clicks) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvasSize;
    const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * pixelRatio));
    canvas.height = Math.max(1, Math.floor(height * pixelRatio));
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const markerRadius = Math.max(10, Math.min(width, height) * 0.035);

    const toStage = (click: HeatmapClick): { x: number; y: number } => {
      const docWidth = click.document.width > 0 ? click.document.width : documentWidth;
      const docHeight = click.document.height > 0 ? click.document.height : documentHeight;
      return {
        x: Math.min(Math.max((click.x / docWidth) * width, 0), width),
        y: Math.min(Math.max((click.y / docHeight) * height, 0), height),
      };
    };

    if (displayMode === "grid" && clicks.grid) {
      const cellWidth = width / clicks.grid.size;
      const cellHeight = height / clicks.grid.size;
      const peak = Math.max(...clicks.grid.cells.map((cell) => cell.count), 1);
      for (const cell of clicks.grid.cells) {
        const alpha = 0.12 + 0.78 * (cell.count / peak);
        ctx.fillStyle = `rgba(255, 107, 74, ${alpha.toFixed(3)})`;
        ctx.fillRect(cell.col * cellWidth, cell.row * cellHeight, cellWidth, cellHeight);
      }
      return;
    }

    for (const click of clicks.data) {
      const { x, y } = toStage(click);

      if (displayMode === "points") {
        const pointRadius = Math.min(7, Math.max(3, markerRadius * 0.22));
        ctx.beginPath();
        ctx.fillStyle = "rgba(98, 91, 238, 0.72)";
        ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        ctx.stroke();
      } else {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, markerRadius);
        gradient.addColorStop(0, "rgba(255, 107, 74, 0.42)");
        gradient.addColorStop(0.45, "rgba(255, 228, 91, 0.30)");
        gradient.addColorStop(0.75, "rgba(85, 226, 138, 0.12)");
        gradient.addColorStop(1, "rgba(85, 226, 138, 0)");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, markerRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [clicks, canvasSize, displayMode, documentWidth, documentHeight]);

  if (error && pages.length === 0) {
    return (
      <div className="heatmaps-page">
        <div className="page-header">
          <h2 className="page-title">Heatmaps</h2>
          <p className="page-subtitle">Click heatmaps by page</p>
        </div>
        <ErrorState
          title="Unable to load heatmaps"
          message={error}
          onRetry={fetchPages}
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          }
        />
      </div>
    );
  }

  return (
    <div className="heatmaps-page">
      <div className="page-header">
        <h2 className="page-title">Heatmaps</h2>
        <p className="page-subtitle">Click heatmaps by page</p>
      </div>

      <div className="heatmap-controls analytics-card">
        <div className="control-group">
          <label className="control-label" htmlFor="heatmap-page">Page</label>
          {loadingPages ? (
            <LoadingState />
          ) : (
            <select
              id="heatmap-page"
              className="control-select"
              value={selectedPage ?? ""}
              onChange={(e) => setSelectedPage(e.target.value)}
              disabled={pages.length === 0}
            >
              {pages.length === 0 ? (
                <option value="">No pages with clicks</option>
              ) : (
                pages.map((page) => (
                  <option key={page.pageUrl} value={page.pageUrl}>
                    {pagePathname(page.pageUrl)} ({formatCount(page.clicks)} clicks)
                  </option>
                ))
              )}
            </select>
          )}
        </div>

        <div className="control-group">
          <span className="control-label" id="heatmap-device-label">Device</span>
          <div className="segmented-control" role="group" aria-labelledby="heatmap-device-label">
            {VIEWPORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`segmented-btn ${viewportClass === option.value ? "segmented-btn-active" : ""}`}
                onClick={() => setViewportClass(option.value)}
                aria-pressed={viewportClass === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <span className="control-label" id="heatmap-display-label">Display</span>
          <div className="segmented-control" role="group" aria-labelledby="heatmap-display-label">
            {DISPLAY_MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`segmented-btn ${displayMode === option.value ? "segmented-btn-active" : ""}`}
                onClick={() => setDisplayMode(option.value)}
                aria-pressed={displayMode === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <span className="control-label" id="heatmap-preview-label">Preview</span>
          <div className="segmented-control" role="group" aria-labelledby="heatmap-preview-label">
            {PREVIEW_MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`segmented-btn ${previewMode === option.value ? "segmented-btn-active" : ""}`}
                onClick={() => setPreviewMode(option.value)}
                aria-pressed={previewMode === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="heatmap-panel analytics-card">
        <div className="panel-header">
          <h3 className="panel-title">Click heatmap</h3>
          {clicks && (
            <div className="heatmap-stats">
              <span className="heatmap-total">{clicks.totalClicks} clicks</span>
              <span className="heatmap-url">
                {selectedPage ? pagePathname(selectedPage) : ""}
              </span>
            </div>
          )}
        </div>

        {loadingClicks && !clicks ? (
          <LoadingState label="Loading heatmap data..." />
        ) : !clicks || clicks.data.length === 0 ? (
          <EmptyState
            icon={
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <circle cx="16" cy="12" r="1.5" />
                <circle cx="10" cy="17" r="1.5" />
              </svg>
            }
            title="No clicks yet"
            description={
              selectedPage
                ? "No clicks recorded for this page in the selected range."
                : "Select a page to view its heatmap."
            }
          />
        ) : (
          <div className="heatmap-canvas-wrap">
            {deviceBreakdown && (
              <div className="heatmap-device-breakdown" aria-label="Clicks by device">
                {deviceBreakdown.map((device) => (
                  <span key={device.viewportClass} className="device-chip">
                    {device.viewportClass}: {formatCount(device.clicks)}
                  </span>
                ))}
              </div>
            )}
            <div
              ref={stageRef}
              className="heatmap-stage"
              style={{ aspectRatio: `${documentWidth} / ${documentHeight}` }}
            >
              {previewMode === "live" && selectedPage ? (
                <div
                  className="heatmap-live-scale"
                  style={{
                    width: documentWidth,
                    height: documentHeight,
                    transform: `scale(${canvasSize.width / documentWidth})`,
                  }}
                >
                  <iframe
                    key={selectedPage}
                    title={`Recorded page preview for ${pagePathname(selectedPage)}`}
                    src={selectedPage}
                    className="heatmap-live"
                    // Scripts stay blocked (no double tracking, no navigation),
                    // but same-origin access is required: Vite emits asset
                    // links with a crossorigin attribute, whose CORS fetch
                    // fails from an opaque origin and leaves the page unstyled.
                    sandbox="allow-same-origin"
                    referrerPolicy="no-referrer"
                    scrolling="no"
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                </div>
              ) : (
                <svg
                  className="heatmap-layout"
                  viewBox={`0 0 ${documentWidth} ${documentHeight}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  {renderPageLayout(selectedPage ?? clicks.pageUrl, documentWidth, documentHeight)}
                </svg>
              )}
              <canvas
                ref={canvasRef}
                className="heatmap-overlay"
                aria-label="Click heatmap"
              />
            </div>
            <p className="heatmap-stage-note">
              {previewMode === "live"
                ? "Live preview of the recorded page. Markers are plotted by ratio against each click's own document size."
                : "Simplified layout preview. Markers are plotted by ratio against each click's own document size."}
            </p>
            <div className="heatmap-legend">
              <span className="legend-label">
                {displayMode === "points" ? "Clicks" : displayMode === "grid" ? "Density" : "Intensity"}
              </span>
              <div className="legend-scale">
                {LEGEND_STOPS.map((stop) => (
                  <span key={stop.label} className="legend-item">
                    <span className="legend-swatch" style={{ background: stop.color }} />
                    {stop.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function layoutKind(pageUrl: string): "home" | "products" | "detail" | "cart" | "checkout" | "generic" {
  const path = pagePathname(pageUrl).toLowerCase();
  if (path === "/" || path === "/demo" || path === "/demo/") return "home";
  if (path.includes("/demo/products/headphones") || path.includes("/demo/products/keyboard")) return "detail";
  if (path.includes("/demo/products")) return "products";
  if (path.includes("/demo/cart")) return "cart";
  if (path.includes("/demo/checkout")) return "checkout";
  return "generic";
}

function block(
  x: number,
  y: number,
  width: number,
  height: number,
  fill = "#ffffff",
  stroke = "#E5E7F2",
): ReactNode {
  if (width <= 0 || height <= 0) return null;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={Math.min(20, height / 4)}
      fill={fill}
      stroke={stroke}
      strokeWidth={Math.max(1, width / 720)}
    />
  );
}

function bar(
  x: number,
  y: number,
  width: number,
  height: number,
  fill = "#F1F0FF",
): ReactNode {
  if (width <= 0 || height <= 0) return null;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={height / 2}
      fill={fill}
    />
  );
}

function renderPageLayout(pageUrl: string, width: number, height: number): ReactNode {
  const kind = layoutKind(pageUrl);
  const chromeHeight = Math.min(64, height * 0.075);
  const navHeight = Math.min(48, height * 0.055);
  const footerHeight = Math.min(44, height * 0.05);
  const contentY = chromeHeight + navHeight + height * 0.035;
  const contentHeight = Math.max(80, height - contentY - footerHeight - height * 0.035);
  const gutter = Math.max(16, width * 0.035);
  const contentWidth = Math.max(80, width - gutter * 2);

  return (
    <>
      <rect x={0} y={0} width={width} height={height} fill="#F8F9FD" />
      <rect x={0} y={0} width={width} height={chromeHeight} fill="#ffffff" stroke="#E5E7F2" />
      <circle cx={gutter * 0.55} cy={chromeHeight / 2} r={chromeHeight * 0.12} fill="#FFE45B" />
      <circle cx={gutter * 0.9} cy={chromeHeight / 2} r={chromeHeight * 0.12} fill="#55E28A" />
      <circle cx={gutter * 1.25} cy={chromeHeight / 2} r={chromeHeight * 0.12} fill="#FF6B4A" />
      {bar(width * 0.22, chromeHeight * 0.28, width * 0.42, chromeHeight * 0.44)}
      {block(0, chromeHeight, width, navHeight, "#ffffff")}
      {bar(gutter, chromeHeight + navHeight * 0.32, width * 0.18, navHeight * 0.36, "#EAE8FF")}
      {bar(gutter + width * 0.22, chromeHeight + navHeight * 0.32, width * 0.10, navHeight * 0.36)}
      {bar(gutter + width * 0.35, chromeHeight + navHeight * 0.32, width * 0.10, navHeight * 0.36)}
      {renderContent(kind, gutter, contentY, contentWidth, contentHeight)}
      {block(gutter, height - footerHeight - height * 0.025, contentWidth, footerHeight * 0.62, "#ffffff")}
    </>
  );
}

function renderContent(
  kind: "home" | "products" | "detail" | "cart" | "checkout" | "generic",
  x: number,
  y: number,
  width: number,
  height: number,
): ReactNode {
  switch (kind) {
    case "home":
      return (
        <>
          {block(x, y, width, height * 0.36)}
          {bar(x + width * 0.05, y + height * 0.08, width * 0.42, height * 0.055, "#625BEE")}
          {bar(x + width * 0.05, y + height * 0.16, width * 0.30, height * 0.035)}
          {bar(x + width * 0.05, y + height * 0.23, width * 0.16, height * 0.055, "#625BEE")}
          {[0, 1, 2].map((index) => {
            const cardWidth = (width - width * 0.08) / 3;
            return (
              <g key={index}>
                {block(x + index * (cardWidth + width * 0.04), y + height * 0.43, cardWidth, height * 0.50)}
                {bar(
                  x + index * (cardWidth + width * 0.04) + cardWidth * 0.08,
                  y + height * 0.47,
                  cardWidth * 0.84,
                  height * 0.18,
                  "#F4F5FB",
                )}
              </g>
            );
          })}
        </>
      );
    case "products":
      return (
        <>
          {block(x, y, width, height * 0.18)}
          {[0, 1, 2].map((index) => {
            const cardWidth = (width - width * 0.08) / 3;
            return (
              <g key={index}>
                {block(x + index * (cardWidth + width * 0.04), y + height * 0.26, cardWidth, height * 0.66)}
                {bar(
                  x + index * (cardWidth + width * 0.04) + cardWidth * 0.1,
                  y + height * 0.30,
                  cardWidth * 0.8,
                  height * 0.22,
                  "#F4F5FB",
                )}
                {bar(
                  x + index * (cardWidth + width * 0.04) + cardWidth * 0.1,
                  y + height * 0.58,
                  cardWidth * 0.48,
                  height * 0.055,
                  "#625BEE",
                )}
              </g>
            );
          })}
        </>
      );
    case "detail":
      return (
        <>
          {block(x, y, width * 0.44, height * 0.82, "#F4F5FB")}
          {bar(x + width * 0.50, y + height * 0.05, width * 0.38, height * 0.07, "#171833")}
          {bar(x + width * 0.50, y + height * 0.16, width * 0.18, height * 0.055, "#625BEE")}
          {bar(x + width * 0.50, y + height * 0.25, width * 0.42, height * 0.035)}
          {bar(x + width * 0.50, y + height * 0.31, width * 0.36, height * 0.035)}
          {bar(x + width * 0.50, y + height * 0.44, width * 0.22, height * 0.075, "#625BEE")}
          {bar(x + width * 0.74, y + height * 0.44, width * 0.16, height * 0.075, "#ffffff")}
        </>
      );
    case "cart":
      return (
        <>
          {block(x, y, width, height * 0.64)}
          {bar(x + width * 0.05, y + height * 0.10, width * 0.52, height * 0.055)}
          {bar(x + width * 0.05, y + height * 0.22, width * 0.20, height * 0.055, "#625BEE")}
          {bar(x + width * 0.05, y + height * 0.34, width * 0.52, height * 0.035)}
          {bar(x + width * 0.05, y + height * 0.48, width * 0.22, height * 0.07, "#625BEE")}
        </>
      );
    case "checkout":
      return (
        <>
          {block(x, y, width * 0.58, height * 0.88)}
          {[0, 1, 2, 3].map((index) => (
            <g key={index}>
              {bar(x + width * 0.05, y + height * (0.08 + index * 0.15), width * 0.20, height * 0.035)}
              {block(x + width * 0.05, y + height * (0.13 + index * 0.15), width * 0.48, height * 0.075)}
            </g>
          ))}
          {block(x + width * 0.66, y, width * 0.34, height * 0.52)}
          {bar(x + width * 0.70, y + height * 0.10, width * 0.26, height * 0.055, "#625BEE")}
        </>
      );
    default:
      return (
        <>
          {block(x, y, width, height * 0.28)}
          {[0, 1].map((index) => (
            <g key={index}>
              {block(x + index * width * 0.52, y + height * 0.36, width * 0.48, height * 0.56)}
              {bar(x + index * width * 0.52 + width * 0.04, y + height * 0.42, width * 0.30, height * 0.05, "#625BEE")}
            </g>
          ))}
        </>
      );
  }
}
