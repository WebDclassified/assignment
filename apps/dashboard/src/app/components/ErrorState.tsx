import type { ReactNode } from "react";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  icon?: ReactNode;
}

export function ErrorState({ title, message, onRetry, icon }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      {icon && <div className="error-state-icon">{icon}</div>}
      <h3 className="error-state-title">{title ?? "Something went wrong"}</h3>
      <p className="error-state-message">{message}</p>
      {onRetry && (
        <button className="error-state-action" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
