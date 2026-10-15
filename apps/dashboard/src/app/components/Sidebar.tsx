import type { ReactNode } from "react";

type Page = "overview" | "sessions" | "heatmaps";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  open?: boolean;
  onClose?: () => void;
}

const DEMOS: Array<{ label: string; path: string }> = [
  { label: "Store", path: "/demo/" },
  { label: "Blog", path: "/demo-blog/" },
  { label: "SPA", path: "/demo-spa/" },
];

const NAV_ITEMS: Array<{
  id: Page;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    id: "overview",
    label: "Overview",
    description: "Summary and recent sessions",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10.5V20h13v-9.5" />
      </svg>
    ),
  },
  {
    id: "sessions",
    label: "Sessions",
    description: "Session list and journey",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    ),
  },
  {
    id: "heatmaps",
    label: "Heatmaps",
    description: "Click heatmaps by page",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <circle cx="9.2" cy="10" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="14.8" cy="14.4" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="15" cy="9.4" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

export function Sidebar({ currentPage, onNavigate, open = false, onClose }: SidebarProps) {
  return (
    <>
      {open && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={onClose}
        />
      )}
      <nav
        className={`sidebar${open ? " sidebar-open" : ""}`}
        aria-label="Main navigation"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose?.();
        }}
      >
      <div className="sidebar-brand">
        <div className="sidebar-logo" aria-hidden="true">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        </div>
        <div className="sidebar-title">
          <span className="sidebar-name">Pathlens</span>
          <span className="sidebar-tagline">User Analytics</span>
        </div>
      </div>
      <div className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-link ${currentPage === item.id ? "sidebar-link-active" : ""
              }`}
            onClick={() => {
              onNavigate(item.id);
              onClose?.();
            }}
            aria-current={currentPage === item.id ? "page" : undefined}
            title={item.label}
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            <span className="sidebar-link-text">
              <span className="sidebar-link-label">{item.label}</span>
              <span className="sidebar-link-desc">{item.description}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="sidebar-footer">
        <span className="sidebar-demos-label">Demo sites</span>
        <div className="sidebar-demos">
          {DEMOS.map((demo) => (
            <button
              key={demo.path}
              type="button"
              className="sidebar-demo-link"
              onClick={() => window.open(demo.path, "_blank", "noopener")}
              title={`Open the ${demo.label} demo`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              {demo.label}
            </button>
          ))}
        </div>
        <span className="sidebar-version">v1.0.0</span>
      </div>
      </nav>
    </>
  );
}
