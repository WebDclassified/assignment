interface LoadingStateProps {
  label?: string;
  lines?: number;
}

export function LoadingState({ label, lines }: LoadingStateProps) {
  return (
    <div className="loading-state" role="status">
      {label && <span className="loading-label">{label}</span>}
      {lines !== undefined ? (
        <div className="skeleton-list" aria-hidden="true">
          {Array.from({ length: lines }, (_, index) => (
            <div key={index} className="skeleton-line" />
          ))}
        </div>
      ) : (
        <div className="loading-spinner" aria-label="Loading" />
      )}
    </div>
  );
}
