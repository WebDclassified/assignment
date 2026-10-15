import { useState, useEffect, useCallback } from "react";
import { KpiCard } from "../../components/KpiCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import {
  getSummary,
  getSessions,
  getSessionEvents,
  getTrends,
  ApiError,
  type ApiSummary,
  type DailyTrend,
} from "../../../lib/api";
import {
  formatRelativeTime,
  formatDurationSeconds,
  formatFreshness,
  pagePathname,
  copyText,
  downloadJson,
  readHashParams,
  writeHashParams,
  truncateMiddle,
  formatCount,
} from "../../../lib/utils";
import type { SessionSummary, Pagination } from "@pathlens/contracts";

interface OverviewPageProps {
  from: string;
  to: string;
}

const TIMELINE_PAGE_SIZE = 100;

export function OverviewPage({ from, to }: OverviewPageProps) {
  const [summary, setSummary] = useState<ApiSummary | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(null);
  const [sessionEvents, setSessionEvents] = useState<
    Array<{
      eventId: string;
      type: "page_view" | "click";
      pageUrl: string;
      occurredAt: string;
      coordinates?: { x: number; y: number };
    }>
  >([]);
// Note: loading state managed per-panel in child components
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [loadingMoreEvents, setLoadingMoreEvents] = useState(false);
  const [trends, setTrends] = useState<DailyTrend[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [, setFreshnessTick] = useState(0);

  const fetchData = useCallback(async () => {
    setSessionsLoading(true);
    setError(null);
    try {
      const [summaryData, sessionsData] = await Promise.all([
        getSummary(from, to),
        getSessions(page, pageSize, undefined, from, to),
      ]);
      setSummary(summaryData);
      setSessions(sessionsData.data);
      setPagination(sessionsData.pagination);
      setLastUpdatedAt(Date.now());
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.envelope?.error.message ?? "Failed to load data");
      } else {
        setError("Failed to load data");
      }
    } finally {
      setSessionsLoading(false);
    }
  }, [from, to, page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const timer = setInterval(() => setFreshnessTick(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Activity trends are informational; a failure hides the panel instead of
    // breaking the page.
    getTrends()
      .then(setTrends)
      .catch(() => setTrends([]));
  }, []);

  const handleSelectSession = useCallback(async (session: SessionSummary, eventsPageToLoad = 1) => {
    setSelectedSession(session);
    setSessionsLoading(eventsPageToLoad === 1);
    setLoadingMoreEvents(eventsPageToLoad > 1);
    try {
      const events = await getSessionEvents(session.sessionId, eventsPageToLoad, TIMELINE_PAGE_SIZE);
      setSessionEvents((previous) =>
        eventsPageToLoad === 1 ? events.data : [...previous, ...events.data],
      );
      setEventsPage(eventsPageToLoad);
      setEventsTotal(events.pagination?.total ?? events.data.length);
      writeHashParams({ session: session.sessionId });
    } catch {
      if (eventsPageToLoad === 1) {
        setSessionEvents([]);
        setEventsTotal(0);
      }
    } finally {
      setSessionsLoading(false);
      setLoadingMoreEvents(false);
    }
  }, []);

  // Deep link support: auto-select the session named in the URL hash once the
  // session list has loaded.
  useEffect(() => {
    if (selectedSession || sessions.length === 0) return;
    const linked = readHashParams().session;
    if (!linked) return;
    const match = sessions.find((session) => session.sessionId === linked);
    if (match) {
      void handleSelectSession(match);
    }
  }, [sessions, selectedSession, handleSelectSession]);

  const handleCopySessionId = async () => {
    if (!selectedSession) return;
    setCopiedSessionId(await copyText(selectedSession.sessionId));
    window.setTimeout(() => setCopiedSessionId(false), 1600);
  };

  const handleExportSession = () => {
    if (!selectedSession) return;
    downloadJson(`pathlens-session-${selectedSession.sessionId}.json`, {
      session: selectedSession,
      events: sessionEvents,
    });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  if (error && summary === null) {
    return (
      <div className="overview-page">
      <div className="page-header page-header-row">
        <div>
          <h2 className="page-title">Overview</h2>
          <p className="page-subtitle">Session activity and engagement summary</p>
        </div>
        <div className="page-actions">
          {lastUpdatedAt !== null && (
            <span className="freshness">Updated {formatFreshness(lastUpdatedAt)} ago</span>
          )}
          <button type="button" className="pagination-btn" onClick={fetchData}>
            Refresh
          </button>
        </div>
      </div>
      <ErrorState
          title="Unable to load overview"
          message={error}
          onRetry={fetchData}
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          }
        />
      </div>
    );
  }

  return (
    <div className="overview-page">
      <div className="page-header page-header-row">
        <div>
          <h2 className="page-title">Overview</h2>
          <p className="page-subtitle">Session activity and engagement summary</p>
        </div>
        <div className="page-actions">
          {lastUpdatedAt !== null && (
            <span className="freshness">Updated {formatFreshness(lastUpdatedAt)} ago</span>
          )}
          <button type="button" className="pagination-btn" onClick={fetchData}>
            Refresh
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Sessions"
          value={summary?.sessions ?? 0}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <KpiCard
          label="Page views"
          value={summary?.pageViews ?? 0}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          }
        />
        <KpiCard
          label="Clicks"
          value={summary?.clicks ?? 0}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 15l-2 5L7 9l10 6 2-5z" />
              <path d="M22 12A10 10 0 0 0 12 2v10z" />
            </svg>
          }
        />
        <KpiCard
          label="Avg. events/session"
          value={summary?.averageEventsPerSession ?? 0}
          delta={trends.length > 0 ? `${trends.reduce((total, day) => total + day.events, 0)} events in 14 days` : undefined}
          trend="neutral"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          }
        />
      </div>

      {trends.length > 0 && (
        <div className="trends-panel analytics-card">
          <div className="panel-header">
            <h3 className="panel-title">Activity</h3>
            <span className="panel-count">Last 14 days · clicks per day</span>
          </div>
          <div
            className="trends-chart"
            role="img"
            aria-label={`Clicks per day for the last 14 days, peaking at ${Math.max(...trends.map((day) => day.clicks))} clicks`}
          >
            {trends.map((day) => {
              const peak = Math.max(...trends.map((entry) => entry.clicks), 1);
              return (
                <div
                  key={day.date}
                  className="trend-column"
                  title={`${day.date}: ${day.clicks} clicks, ${day.pageViews} page views`}
                >
                  <div
                    className="trend-bar"
                    style={{ height: `${Math.max(4, Math.round((day.clicks / peak) * 100))}%` }}
                  />
                  <span className="trend-day">{day.date.slice(5).replace("-", "/")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="workspace-grid">
        <div className="sessions-panel analytics-card">
          <div className="panel-header">
            <h3 className="panel-title">Recent sessions</h3>
          <span className="panel-count">{sessions.length} sessions</span>
        </div>

        {sessionsLoading && selectedSession === null ? (
          <LoadingState label="Loading sessions..." lines={5} />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            }
            title="No sessions yet"
            description="Open the demo storefront and navigate around to generate session data."
            steps={[
              "Open the demo storefront in a new tab",
              "Browse products and click around the pages",
              "Return here — your new session appears below",
            ]}
            action={{
              label: "Open demo storefront",
              onClick: () => window.open("/demo/", "_blank"),
            }}
          />
        ) : (
          <>
            <div className="sessions-table-wrap">
              <table className="sessions-table">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Events</th>
                    <th>Page views</th>
                    <th>Clicks</th>
                    <th>First activity</th>
                    <th>Last activity</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr
                      key={session.sessionId}
                      className={`session-row ${selectedSession?.sessionId === session.sessionId ? "session-row-selected" : ""}`}
                      onClick={() => handleSelectSession(session)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectSession(session);
                        }
                      }}
                    >
                      <td className="session-id-cell">
                        <code
                          className="session-id"
                          title={session.sessionId}
                        >
                          {truncateMiddle(session.sessionId, 12)}
                        </code>
                      </td>
                      <td>{formatCount(session.eventCount)}</td>
                      <td>{session.pageViews}</td>
                      <td>{session.clicks}</td>
                      <td>{formatRelativeTime(session.startedAt)}</td>
                      <td>{formatRelativeTime(session.lastActivityAt)}</td>
                      <td>{formatDurationSeconds(session.durationSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && pagination.totalPages > 1 && (
              <div className="pagination">
                <button
                  className="pagination-btn"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                >
                  Previous
                </button>
                <span className="pagination-info">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  className="pagination-btn"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= pagination.totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedSession && (
        <div className="timeline-panel analytics-card">
          <div className="panel-header">
            <h3 className="panel-title">Session journey</h3>
            <div className="panel-session-info">
              <code className="session-id" title={selectedSession.sessionId}>
                {truncateMiddle(selectedSession.sessionId, 12)}
              </code>
              <button
                type="button"
                className={`copy-button${copiedSessionId ? " copy-button-copied" : ""}`}
                onClick={handleCopySessionId}
              >
                {copiedSessionId ? "Copied" : "Copy ID"}
              </button>
              <button type="button" className="copy-button" onClick={handleExportSession}>
                Export JSON
              </button>
              <span className="session-stats">
                {selectedSession.eventCount} events ·
                {selectedSession.pageViews} page views ·
                {selectedSession.clicks} clicks ·
                {formatDurationSeconds(selectedSession.durationSeconds)}
              </span>
            </div>
          </div>
          {sessionsLoading ? (
            <LoadingState label="Loading timeline..." />
          ) : sessionEvents.length === 0 ? (
            <EmptyState
              title="No events"
              description="This session has no recorded events."
            />
          ) : (
            <div className="timeline">
              {sessionEvents.map((event, index) => (
                <div key={event.eventId} className="timeline-item">
                  <div className="timeline-connector">
                    <div
                      className={`timeline-marker timeline-marker-${event.type === "click" ? "click" : "pageview"}`}
                      aria-label={`${event.type} event`}
                    />
                    {index < sessionEvents.length - 1 && (
                      <div className="timeline-line" />
                    )}
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-header">
                      <span className="timeline-type">
                        {event.type === "click" ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </span>
                      <span className="timeline-time">{formatRelativeTime(event.occurredAt)}</span>
                      {event.type === "click" && event.coordinates && (
                        <span className="timeline-coords">
                          ({event.coordinates.x}, {event.coordinates.y})
                        </span>
                      )}
                    </div>
                    <div className="timeline-url">
                      <span
                        className="timeline-url-path"
                        title={event.pageUrl}
                      >
                        {pagePathname(event.pageUrl)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {selectedSession && !sessionsLoading && sessionEvents.length < eventsTotal && (
            <div className="timeline-more">
              <button
                type="button"
                className="pagination-btn"
                onClick={() => handleSelectSession(selectedSession, eventsPage + 1)}
                disabled={loadingMoreEvents}
              >
                {loadingMoreEvents
                  ? "Loading…"
                  : `Show more (${eventsTotal - sessionEvents.length} remaining)`}
              </button>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
