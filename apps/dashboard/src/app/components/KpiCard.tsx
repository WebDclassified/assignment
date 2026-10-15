import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  delta?: string;
  deltaLabel?: string;
  trend?: "up" | "down" | "neutral";
}

export function KpiCard({
  label,
  value,
  icon,
  delta,
  deltaLabel,
  trend = "neutral",
}: KpiCardProps) {
  return (
    <div className="kpi-card analytics-card">
      <div className="kpi-header">
        <div className="kpi-icon">{icon}</div>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      {delta !== undefined && (
        <div
          className={`kpi-delta kpi-delta-${trend}`}
          title={deltaLabel}
        >
          {delta}
        </div>
      )}
    </div>
  );
}
