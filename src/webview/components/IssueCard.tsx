import React from "react";
import { SentryIssue } from "../../sentry/types";

// Declare vscode API globally
declare global {
  interface Window {
    vscode?: {
      postMessage: (message: any) => void;
    };
  }
}

interface IssueCardProps {
  issue: SentryIssue & { project?: string };
  isExpanded: boolean;
  onToggle: () => void;
  onClickUpTask?: () => void;
  onClickUpTaskUrl?: string | undefined;
}

export const IssueCard: React.FC<IssueCardProps> = ({
  issue,
  isExpanded,
  onToggle,
  onClickUpTask,
  onClickUpTaskUrl,
}) => {
  const isResolved = issue.status === "resolved";
  const isIgnored = issue.status === "ignored";

  const getIcon = () => {
    if (isResolved) {
      return <i className="fas fa-circle-check"></i>;
    }
    if (isIgnored) {
      return <i className="fas fa-eye-slash"></i>;
    }

    const iconMap = {
      fatal: <i className="fas fa-skull-crossbones"></i>,
      error: <i className="fas fa-circle-exclamation"></i>,
      warning: <i className="fas fa-triangle-exclamation"></i>,
      info: <i className="fas fa-circle-info"></i>,
      debug: <i className="fas fa-bug"></i>,
    };
    return iconMap[issue.level] || <i className="fas fa-bug"></i>;
  };

  const iconClass = isResolved
    ? "resolved"
    : isIgnored
    ? "ignored"
    : issue.level;
  const lastSeen = new Date(issue.lastSeen).toLocaleString();

  return (
    <div
      className={`issue-card ${isExpanded ? "expanded" : ""} ${
        isResolved ? "resolved" : isIgnored ? "ignored" : ""
      }`}
    >
      <div className="issue-header" onClick={onToggle}>
        <div className="expand-icon">
          <i className="fas fa-chevron-right"></i>
        </div>
        <div className={`issue-icon ${iconClass}`}>{getIcon()}</div>
        <div className="issue-content">
          <div className="issue-summary">
            <div className="issue-id">
              {issue.shortId}
              {onClickUpTaskUrl && (
                <span
                  style={{
                    color: "#ff6b35",
                    marginLeft: "8px",
                    fontSize: "8px",
                    fontWeight: "normal",
                  }}
                >
                  ClickUp
                </span>
              )}
            </div>
            <div className="issue-title">{issue.title}</div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="issue-details">
          <div className="issue-title-full">{issue.title}</div>
          {issue.culprit && (
            <div className="issue-culprit">
              <i className="fas fa-location-dot"></i> {issue.culprit}
            </div>
          )}

          <div className="issue-meta">
            <div className="issue-meta-item">
              <i className="fas fa-chart-simple"></i> {issue.count} events
            </div>
            <div className="issue-meta-item">
              <i className="fas fa-users"></i> {issue.userCount} users
            </div>
            <div className="issue-meta-item">
              <i className="fas fa-clock"></i> {lastSeen}
            </div>
          </div>

          <div className="issue-actions">
            <button
              className="btn btn-primary btn-fix"
              data-issue-id={issue.id}
            >
              <i className="fas fa-wand-magic-sparkles"></i> Fix with AI
            </button>
            <button
              className="btn btn-secondary btn-open"
              data-issue-id={issue.id}
            >
              <i className="fas fa-arrow-up-right-from-square"></i> Open in
              Sentry
            </button>
            {onClickUpTask && !onClickUpTaskUrl && (
              <button
                className="btn btn-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onClickUpTask();
                }}
              >
                <i className="fas fa-plus"></i> Create ClickUp Task
              </button>
            )}
            {onClickUpTaskUrl && (
              <button
                className="btn btn-clickup"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onClickUpTaskUrl) {
                    if (window.vscode) {
                      window.vscode.postMessage({
                        type: "openClickUpTask",
                        url: onClickUpTaskUrl,
                      });
                    } else {
                      console.error("vscode API not available");
                    }
                  }
                }}
              >
                <i className="fas fa-external-link-alt"></i> Show ClickUp Task
              </button>
            )}
            <button
              className="btn btn-secondary btn-resolve"
              data-issue-id={issue.id}
              disabled={isResolved || isIgnored}
            >
              <i className="fas fa-check-circle"></i>{" "}
              {isResolved
                ? "Resolved!"
                : isIgnored
                ? "Ignored"
                : "Resolve in Next Release"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
