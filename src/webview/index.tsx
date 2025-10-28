import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./components/App";
import "./styles.css";

// Declare VSCode API functions
declare const acquireVsCodeApi: () => {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

declare const vscode: {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

// Acquire VSCode API
const vscodeApi = acquireVsCodeApi();

// Make vscode API available globally so other components can use it
if (typeof window !== "undefined") {
  (window as any).vscode = vscodeApi;
}

interface WebViewState {
  issuesByProject: Map<string, any[]>;
  isLoading: boolean;
  clickUpEnabled: boolean;
  clickUpLists: any[];
  clickUpSelectedListId: string | null;
  issueTaskMap: Record<string, string>;
  isConfigured: boolean;
}

const initialState: WebViewState = {
  issuesByProject: new Map(),
  isLoading: false,
  clickUpEnabled: false,
  clickUpLists: [],
  clickUpSelectedListId: null,
  issueTaskMap: {},
  isConfigured: true,
};

function createIssuesByProjectMap(data: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const projectData of data) {
    map.set(projectData.project, projectData.issues);
  }
  return map;
}

function AppWrapper() {
  const [state, setState] = React.useState<WebViewState>(initialState);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      console.log("[WebView] Received message:", message.type);

      if (message.type === "updateIssues") {
        console.log(
          "[WebView] updateIssues message, isConfigured:",
          message.isConfigured
        );
        console.log("[WebView] issues data:", message.issues);

        if (message.isConfigured === false) {
          console.log("[WebView] Not configured, setting empty state");
          setState({
            issuesByProject: new Map(),
            isLoading: false,
            clickUpEnabled: false,
            clickUpLists: [],
            clickUpSelectedListId: null,
            issueTaskMap: {},
            isConfigured: false,
          });
          return;
        }

        const issuesByProjectMap = createIssuesByProjectMap(
          message.issues || []
        );
        console.log(
          "[WebView] Created issues map with size:",
          issuesByProjectMap.size
        );

        setState((prev) => ({
          ...prev,
          issuesByProject: issuesByProjectMap,
          isLoading: message.isLoading || false,
          isConfigured: true,
          clickUpEnabled: message.clickUpEnabled || false,
          clickUpLists: message.clickUpLists || [],
          clickUpSelectedListId: message.clickUpSelectedListId || null,
          issueTaskMap: message.issueTaskMap || {},
        }));
      } else if (message.type === "updateState") {
        console.log("[WebView] updateState message");
        setState((prev) => ({
          ...prev,
          ...message.state,
        }));
      }
    };

    window.addEventListener("message", handleMessage);

    // Request initial state
    vscodeApi.postMessage({ type: "getInitialState" });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  // Setup event listeners for buttons
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest(".btn-fix, .btn-open, .btn-resolve");

      if (!button) return;

      e.stopPropagation();
      const issueId = (button as HTMLElement).dataset.issueId;

      if (button.classList.contains("btn-fix")) {
        vscodeApi.postMessage({ type: "fixWithAI", issueId });
      } else if (button.classList.contains("btn-open")) {
        vscodeApi.postMessage({ type: "openInBrowser", issueId });
      } else if (button.classList.contains("btn-resolve")) {
        vscodeApi.postMessage({ type: "resolveIssue", issueId });
      }
    };

    document.addEventListener("click", handleClick);

    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, []);

  if (!state.isConfigured) {
    return (
      <div className="config-message">
        <div className="config-icon">
          <i className="fas fa-gear"></i>
        </div>
        <h2 className="config-title">Welcome to Sentry Auto Fix!</h2>
        <p className="config-description">
          To get started, you need to configure your Sentry connection settings.
        </p>
        <div className="config-steps">
          <div className="config-step">
            <div className="step-number">1</div>
            <div className="step-content">
              <strong>Sentry URL</strong>
              <p>Enter your Sentry instance URL (e.g., https://sentry.io)</p>
            </div>
          </div>
          <div className="config-step">
            <div className="step-number">2</div>
            <div className="step-content">
              <strong>API Token</strong>
              <p>Create an authentication token in your Sentry settings</p>
            </div>
          </div>
          <div className="config-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <strong>Project Slugs</strong>
              <p>Add your project slugs (format: organization/project)</p>
            </div>
          </div>
        </div>
        <button
          className="btn-config"
          onClick={() => vscodeApi.postMessage({ type: "openSettings" })}
        >
          <i className="fas fa-cog"></i> Open Settings
        </button>
      </div>
    );
  }

  const handleCreateClickUpTask = (
    issueId: string,
    issueTitle: string,
    issueUrl: string
  ) => {
    vscodeApi.postMessage({
      type: "createClickUpTask",
      issueId,
      issueTitle,
      issueUrl,
    });
  };

  const handleSelectClickUpList = (listId: string | null) => {
    vscodeApi.postMessage({
      type: "selectClickUpList",
      listId,
    });
  };

  const issueTaskMap = new Map(Object.entries(state.issueTaskMap));

  return (
    <App
      issuesByProject={state.issuesByProject}
      isLoading={state.isLoading}
      clickUpEnabled={state.clickUpEnabled}
      clickUpLists={state.clickUpLists}
      clickUpSelectedListId={state.clickUpSelectedListId}
      issueTaskMap={issueTaskMap}
      stats={{ totalIssues: 0, totalEvents: 0 }}
      onCreateClickUpTask={handleCreateClickUpTask}
      onSelectClickUpList={handleSelectClickUpList}
    />
  );
}

// Render the app
const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<AppWrapper />);
}
