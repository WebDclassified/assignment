import { useState, useEffect, useCallback, useRef } from "react";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import {
  getSessions,
  getSessionEvents,
  ApiError,
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
  formatDate,
} from "../../../lib/utils";
import type { SessionSummary } from "@pathlens/contracts";

interface SessionsPageProps {
  from: string;
  to: string;
}

const TIMELINE_PAGE_SIZE = 100;

export function SessionsPage({ from, to }: SessionsPageProps) {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [loadingMoreEvents, setLoadingMoreEvents] = useState(false);
  const linkedSessionHandled = useRef(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [pagination, setPagination] = useState<{
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } | null>(null);
  const [searchDebounce, setSearchDebounce] = useState(search);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [, setFreshnessTick] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSessions(
        page,
        pageSize,
        searchDebounce || undefined,
        from,
        to,
      );
      setSessions(data.data);
      setPagination(data.pagination);
      setLastUpdatedAt(Date.now());
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.envelope?.error.message ?? "Failed to load sessions");
      } else {
        setError("Failed to load sessions");
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchDebounce, from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const timer = setInterval(() => setFreshnessTick(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const handleSelectSession = useCallback(async (session: SessionSummary, eventsPageToLoad = 1) => {
    setSelectedSession(session);
    if (eventsPageToLoad === 1) {
      setLoading(true);
    } else {
      setLoadingMoreEvents(true);
    }
    try {
      const events = await getSessionEvents(session.sessionId, eventsPageToLoad, TIMELINE_PAGE_SIZE);
      setSessionEvents((previous) =>
        eventsPageToLoad === 1 ? events.data : [...previous, ...events.data],
      );
      setEventsPage(eventsPageToLoad);
      setEventsTotal(events.pagination?.total ?? events.data.length);
      writeHashParams({ page: "sessions", session: session.sessionId });
    } catch {
      if (eventsPageToLoad === 1) {
        setSessionEvents([]);
        setEventsTotal(0);
      }
    } finally {
      setLoading(false);
      setLoadingMoreEvents(false);
    }
  }, []);

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

  const handleClearSelection = () => {
    setSelectedSession(null);
    setSessionEvents([]);
    setCopiedSessionId(false);
    writeHashParams({ session: null });
  };

  useEffect(() => {
    if (linkedSessionHandled.current || selectedSession || sessions.length === 0) return;
    linkedSessionHandled.current = true;
    const linked = readHashParams().session;
    if (!linked) return;
    const match = sessions.find((session) => session.sessionId === linked);
    if (match) {
      void handleSelectSession(match);
    }
  }, [sessions, selectedSession, handleSelectSession]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  if (error && sessions.length === 0) {
    return (
      <div className="sessions-page">
        <div className="page-header page-header-row">
          <div>
            <h2 className="page-title">Sessions</h2>
            <p className="page-subtitle">Browse and explore user sessions</p>
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
          title="Unable to load sessions"
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
    <div className="sessions-page">
      <div className="page-header page-header-row">
        <div>
          <h2 className="page-title">Sessions</h2>
          <p className="page-subtitle">Browse and explore user sessions</p>
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

      <div className="sessions-controls">
        <div className="search-input-wrap">
          <svg
            className="search-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="search-input"
            placeholder="Search sessions by ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search sessions"
          />
        </div>
      </div>

      <div className="workspace-grid">
        <div className="sessions-panel analytics-card">
          <div className="panel-header">
            <h3 className="panel-title">All sessions</h3>
          <span className="panel-count">
            {pagination ? `${pagination.total} sessions` : "…"}
          </span>
        </div>

        {loading && selectedSession === null ? (
          <LoadingState label="Loading sessions..." lines={8} />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            }
            title="No sessions found"
            description={
              searchDebounce
                ? "No sessions match your search."
                : "Open the demo storefront to generate session data."
            }
            action={
              !searchDebounce
                ? {
                    label: "Open demo storefront",
                    onClick: () => window.open("/demo/", "_blank"),
                  }
                : undefined
            }
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
            <div className="panel-header-row">
              <h3 className="panel-title">Session journey</h3>
              <button
                className="panel-close-btn"
                onClick={handleClearSelection}
                aria-label="Close session detail"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="panel-session-info">
              <code className="session-id" title={selectedSession.sessionId}>
                {truncateMiddle(selectedSession.sessionId, 16)}
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
              <span className="session-date">
                {formatDate(selectedSession.startedAt)}
              </span>
            </div>
          </div>
          {loading ? (
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
          {selectedSession && !loading && sessionEvents.length < eventsTotal && (
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
