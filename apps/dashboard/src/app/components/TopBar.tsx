import { useEffect, useRef, useState } from "react";
import { getApiHealth, type SiteInfo } from "../../lib/api";

interface DateRange {
  from: string;
  to: string;
}

interface TopBarProps {
  dateRange: DateRange;
  onDateRangeChange: (from: string, to: string) => void;
  onMenuToggle: () => void;
  sites: SiteInfo[];
  siteId: string;
  onSiteChange: (siteId: string) => void;
}

interface PresetRange {
  id: string;
  label: string;
  getRange: () => DateRange;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const PRESET_RANGES: PresetRange[] = [
  {
    id: "last-24-hours",
    label: "Last 24 hours",
    getRange: () => {
      const to = new Date();
      return {
        from: new Date(to.getTime() - DAY_MS).toISOString(),
        to: to.toISOString(),
      };
    },
  },
  {
    id: "last-7-days",
    label: "Last 7 days",
    getRange: () => {
      const to = new Date();
      const start = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - 6));
      return { from: start.toISOString(), to: to.toISOString() };
    },
  },
  {
    id: "last-30-days",
    label: "Last 30 days",
    getRange: () => {
      const to = new Date();
      const start = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - 29));
      return { from: start.toISOString(), to: to.toISOString() };
    },
  },
];

function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function TopBar({ dateRange, onDateRangeChange, onMenuToggle, sites, siteId, onSiteChange }: TopBarProps) {
  const siteOptions = sites.some((site) => site.siteId === siteId)
    ? sites
    : [{ siteId, events: 0, sessions: 0, lastActivityAt: "" }, ...sites];
  const [showPresets, setShowPresets] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  const [customFrom, setCustomFrom] = useState(() => toLocalInputValue(dateRange.from));
  const [customTo, setCustomTo] = useState(() => toLocalInputValue(dateRange.to));
  const [customError, setCustomError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getApiHealth()
      .then(() => {
        if (active) setApiStatus("online");
      })
      .catch(() => {
        if (active) setApiStatus("offline");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showPresets) return;
    setCustomFrom(toLocalInputValue(dateRange.from));
    setCustomTo(toLocalInputValue(dateRange.to));
    setCustomError(null);
  }, [showPresets, dateRange.from, dateRange.to]);

  useEffect(() => {
    if (!showPresets) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowPresets(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showPresets]);

  const activePreset = PRESET_RANGES.find((preset) => preset.id === activePresetId);

  const handlePresetChange = (preset: PresetRange) => {
    const range = preset.getRange();
    setActivePresetId(preset.id);
    onDateRangeChange(range.from, range.to);
    setShowPresets(false);
  };

  const handleCustomSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const from = new Date(customFrom);
    const to = new Date(customTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      setCustomError("Enter both a start and an end date.");
      return;
    }
    if (from.getTime() > to.getTime()) {
      setCustomError("The start date must be before the end date.");
      return;
    }
    setActivePresetId(null);
    onDateRangeChange(from.toISOString(), to.toISOString());
    setShowPresets(false);
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="topbar-menu-button"
          onClick={onMenuToggle}
          aria-label="Open navigation menu"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
        <div className="topbar-heading">
          <h1 className="topbar-title">Analytics</h1>
          <span className="topbar-subtitle">
            Pathlens User Analytics
          </span>
        </div>
      </div>
      <div className="topbar-right">
        <label className="site-picker">
          <span className="site-picker-label">Site</span>
          <select
            className="site-select"
            value={siteId}
            onChange={(event) => onSiteChange(event.target.value)}
            aria-label="Select analytics site"
          >
            {siteOptions.map((site) => (
              <option key={site.siteId} value={site.siteId}>
                {site.siteId} ({site.sessions} sessions)
              </option>
            ))}
          </select>
        </label>
        <span className={`api-status api-status-${apiStatus}`} role="status">
          <span className="api-status-dot" aria-hidden="true" />
          {apiStatus === "online" ? "API connected" : apiStatus === "offline" ? "API offline" : "Checking API"}
        </span>
        <div className="date-range-picker" ref={menuRef}>
          <button
            className="date-range-trigger"
            onClick={() => setShowPresets(!showPresets)}
            aria-expanded={showPresets}
            aria-haspopup="dialog"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span className="date-range-label">
              {formatDateRangeLabel(dateRange.from, dateRange.to)}
            </span>
            <svg
              className={`chevron ${showPresets ? "chevron-open" : ""}`}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showPresets && (
            <div className="date-range-menu" role="dialog" aria-label="Choose a date range">
              {PRESET_RANGES.map((preset) => (
                <button
                  key={preset.id}
                  className={`date-range-option ${
                    activePreset?.id === preset.id ? "date-range-option-active" : ""
                  }`}
                  onClick={() => handlePresetChange(preset)}
                  aria-pressed={activePreset?.id === preset.id}
                >
                  {preset.label}
                </button>
              ))}
              <div className="date-range-divider" />
              <form className="custom-range-form" onSubmit={handleCustomSubmit}>
                <label className="custom-range-field">
                  Start
                  <input
                    type="datetime-local"
                    value={customFrom}
                    max={customTo || undefined}
                    onChange={(event) => setCustomFrom(event.target.value)}
                  />
                </label>
                <label className="custom-range-field">
                  End
                  <input
                    type="datetime-local"
                    value={customTo}
                    min={customFrom || undefined}
                    onChange={(event) => setCustomTo(event.target.value)}
                  />
                </label>
                {customError && <p className="custom-range-error">{customError}</p>}
                <button type="submit" className="custom-range-submit">
                  Apply custom range
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function formatDateRangeLabel(from: string, to: string): string {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return "Custom range";
  }
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  if (fromDate.getFullYear() !== toDate.getFullYear()) {
    options.year = "numeric";
  }
  return `${fromDate.toLocaleDateString(undefined, options)} – ${toDate.toLocaleDateString(undefined, options)}`;
}
