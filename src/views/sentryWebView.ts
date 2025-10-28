import * as vscode from "vscode";
import { StoreManager } from "../stores/storeManager";

export class SentryWebViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "sentryIssuesView";
  private _view?: vscode.WebviewView;
  private storeManager: StoreManager;
  private badgeMessage?: vscode.Disposable;
  private storeChangeSubscription?: vscode.Disposable;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    storeManager: StoreManager
  ) {
    this.storeManager = storeManager;

    // Subscribe to store changes
    this.storeChangeSubscription = storeManager.onDidChange(() => {
      this.refresh();
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    // Update badge with issue count
    this.updateBadge();

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "fixWithAI": {
          // Find the actual issue object
          const issues = await this.getIssuesData();
          const issueTaskMap = this.getClickUpState().issueTaskMap;

          for (const projectData of issues) {
            const issue = projectData.issues.find(
              (i: any) => i.id === data.issueId
            );
            if (issue) {
              // Add ClickUp URL to issue if it exists
              const clickUpUrl = issueTaskMap.get(issue.id);
              if (clickUpUrl) {
                issue.clickupTaskUrl = clickUpUrl;
              }

              vscode.commands.executeCommand("sentryAutoFix.fixWithAI", {
                issue,
              });
              break;
            }
          }
          break;
        }
        case "openInBrowser": {
          // Find issue and open
          const issues = await this.getIssuesData();
          for (const projectData of issues) {
            const issue = projectData.issues.find((i) => i.id === data.issueId);
            if (issue) {
              vscode.env.openExternal(vscode.Uri.parse(issue.permalink));
              break;
            }
          }
          break;
        }
        case "refresh": {
          console.log("[SentryWebView] Refresh requested via message");
          vscode.commands.executeCommand("sentryAutoFix.refreshIssues");
          break;
        }
        case "resolveIssue": {
          await this.resolveIssue(data.issueId);
          break;
        }
        case "openSettings": {
          // Open workspace settings focused on Sentry Auto Fix settings
          vscode.commands.executeCommand(
            "workbench.action.openWorkspaceSettings",
            "sentryAutoFix"
          );
          break;
        }
        case "createClickUpTask": {
          await this.createClickUpTask(
            data.issueId,
            data.issueTitle,
            data.issueUrl
          );
          break;
        }
        case "openClickUpTask": {
          vscode.env.openExternal(vscode.Uri.parse(data.url));
          break;
        }
        case "selectClickUpList": {
          // Update selected list in configuration
          const config = vscode.workspace.getConfiguration("sentryAutoFix");
          await config.update(
            "clickupSelectedList",
            data.listId,
            vscode.ConfigurationTarget.Global
          );
          break;
        }
        case "getInitialState": {
          this.refresh();
          break;
        }
      }
    });

    // Send initial state
    setTimeout(() => {
      this.refresh();
    }, 100);
  }

  public refresh(): void {
    if (!this._view) {
      console.log("[SentryWebView] No view available to refresh");
      return;
    }

    const issuesData = this.getIssuesData();
    const clickUpState = this.getClickUpState();

    console.log("[SentryWebView] Refreshing webview with data:");
    console.log("  - Projects:", issuesData.length);
    console.log("  - ClickUp enabled:", clickUpState.enabled);
    console.log("  - Issue task map size:", clickUpState.issueTaskMap.size);

    this._view.webview.postMessage({
      type: "updateIssues",
      issues: issuesData,
      isLoading: false,
      isConfigured: true,
      clickUpEnabled: clickUpState.enabled,
      clickUpLists: clickUpState.lists,
      clickUpSelectedListId: clickUpState.selectedListId,
      issueTaskMap: Object.fromEntries(clickUpState.issueTaskMap),
    });

    // Update badge with issue count
    this.updateBadge();
  }

  private updateBadge(): void {
    if (!this._view) {
      console.log("[SentryWebView] updateBadge: _view is not available");
      return;
    }

    const issuesByProject = this.storeManager.getSentryIssues();
    const totalIssues = Array.from(issuesByProject.values()).reduce(
      (sum, issues) => sum + issues.length,
      0
    );

    console.log(
      `[SentryWebView] updateBadge: setting badge to ${totalIssues} issues`
    );
    console.log(
      `[SentryWebView] _view.badge property exists:`,
      "badge" in this._view
    );

    // Set badge (can only be assigned, not modified)
    if (totalIssues > 0) {
      this._view.badge = {
        value: totalIssues,
        tooltip: `${totalIssues} unresolved Sentry ${
          totalIssues === 1 ? "issue" : "issues"
        }`,
      };
      console.log(`[SentryWebView] Badge set to:`, this._view.badge);
    } else {
      this._view.badge = {
        value: 0,
        tooltip: "No unresolved issues",
      };
      console.log(`[SentryWebView] Badge set to 0`);
    }
  }

  private getIssuesData(): any[] {
    const issuesByProject = this.storeManager.getSentryIssues();
    const result: { project: string; issues: any[] }[] = [];

    for (const [project, issues] of issuesByProject.entries()) {
      result.push({
        project,
        issues: issues.map((issue: any) => ({
          id: issue.id,
          title: issue.title,
          shortId: issue.shortId,
          level: issue.level,
          count: issue.count,
          userCount: issue.userCount,
          culprit: issue.culprit,
          firstSeen: issue.firstSeen,
          lastSeen: issue.lastSeen,
          permalink: issue.permalink,
          metadata: issue.metadata,
          status: issue.status,
          clickupTaskUrl: issue.clickupTaskUrl,
        })),
      });
    }

    return result;
  }

  private getClickUpState() {
    const isEnabled = this.storeManager.isClickUpEnabled();
    const lists = this.storeManager.getClickUpLists();
    const selectedListId = this.storeManager.getClickUpSelectedListId();
    const issueTaskMap = this.storeManager.getIssueTaskMap();

    return {
      enabled: isEnabled,
      lists: lists,
      selectedListId: selectedListId,
      issueTaskMap: issueTaskMap,
    };
  }

  private async resolveIssue(issueId: string): Promise<void> {
    const sentryClient = this.storeManager.getSentryClient();
    if (!sentryClient) {
      vscode.window.showWarningMessage(
        "Sentry is not configured. Please configure your settings first."
      );
      return;
    }

    try {
      await sentryClient.resolveIssue(issueId);
      vscode.window.showInformationMessage("Issue resolved in next release");

      await this.storeManager.refreshSentry();
      this.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to resolve issue: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async createClickUpTask(
    issueId: string,
    issueTitle: string,
    issueUrl: string
  ): Promise<void> {
    try {
      const { taskUrl } = await this.storeManager.createClickUpTask(
        issueId,
        issueTitle,
        issueUrl
      );

      // Add ClickUp URL as comment to Sentry issue
      const sentryClient = this.storeManager.getSentryClient();
      if (sentryClient) {
        await sentryClient.addIssueComment(issueId, `ClickUp Task: ${taskUrl}`);
      }

      vscode.window.showInformationMessage(
        "ClickUp task created successfully!"
      );

      // Refresh to update UI
      await this.storeManager.refreshSentry();
      this.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to create ClickUp task: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.js")
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; font-src https://cdnjs.cloudflare.com; script-src 'unsafe-inline' ${webview.cspSource};">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <title>Sentry Issues</title>
</head>
<body>
  <div id="root"></div>
  <script src="${styleUri}"></script>
</body>
</html>`;
  }
}

// Helper methods to add to StoreManager
declare module "../stores/storeManager" {
  interface StoreManager {
    getSentryIssues(): Map<string, any[]>;
    getClickUpLists(): any[];
    getClickUpSelectedListId(): string | null;
    getIssueTaskMap(): Map<string, string>;
  }
}
