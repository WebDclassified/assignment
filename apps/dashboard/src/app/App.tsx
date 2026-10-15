import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { LoadingState } from "./components/LoadingState";
import { getSites, getSiteId, setSiteId, type SiteInfo } from "../lib/api";
import { readHashParams, writeHashParams } from "../lib/utils";

const OverviewPage = lazy(() =>
  import("./features/overview/OverviewPage").then((module) => ({ default: module.OverviewPage })),
);
const SessionsPage = lazy(() =>
  import("./features/sessions/SessionsPage").then((module) => ({ default: module.SessionsPage })),
);
const HeatmapsPage = lazy(() =>
  import("./features/heatmaps/HeatmapsPage").then((module) => ({ default: module.HeatmapsPage })),
);

type Page = "overview" | "sessions" | "heatmaps";

function pageFromHash(): Page {
  const page = readHashParams().page;
  return page === "sessions" || page === "heatmaps" ? page : "overview";
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>(() => pageFromHash());
  const [menuOpen, setMenuOpen] = useState(false);
  const [siteId, setSiteIdState] = useState<string>(() => readHashParams().site || getSiteId());
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [dateRange, setDateRange] = useState<{
    from: string;
    to: string;
  }>({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10) + "T00:00:00.000Z",
    to: new Date().toISOString().slice(0, 10) + "T23:59:59.999Z",
  });

  const handleNavigate = useCallback((page: Page) => {
    setCurrentPage(page);
    writeHashParams({ page: page === "overview" ? null : page });
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPage(pageFromHash());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    setSiteId(siteId);
    writeHashParams({ site: siteId });
    getSites()
      .then(setSites)
      .catch(() => setSites([]));
  }, [siteId]);

  const handleDateRangeChange = (
    from: string,
    to: string,
  ) => {
    setDateRange({ from, to });
  };

  return (
    <div className="app">
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      <div className="app-main">
        <TopBar
          dateRange={dateRange}
          onDateRangeChange={handleDateRangeChange}
          onMenuToggle={() => setMenuOpen((open) => !open)}
          sites={sites}
          siteId={siteId}
          onSiteChange={setSiteIdState}
        />
        <main className="app-content">
          <Suspense fallback={<LoadingState label="Loading page..." />}>
            {currentPage === "overview" && (
              <OverviewPage
                key={siteId}
                from={dateRange.from}
                to={dateRange.to}
              />
            )}
            {currentPage === "sessions" && (
              <SessionsPage
                key={siteId}
                from={dateRange.from}
                to={dateRange.to}
              />
            )}
            {currentPage === "heatmaps" && (
              <HeatmapsPage
                key={siteId}
                from={dateRange.from}
                to={dateRange.to}
              />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
