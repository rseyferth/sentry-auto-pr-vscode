import * as vscode from "vscode";
import { SentryClient } from "./sentry/client";
import { SentryWebViewProvider } from "./views/sentryWebView";
import { FixWithAICommand } from "./commands/fixWithAI";
import { SentryConfig } from "./sentry/types";
import { SentryMCPServer } from "./mcp/server";

let sentryClient: SentryClient | null = null;
let webviewProvider: SentryWebViewProvider | null = null;
let mcpServer: SentryMCPServer | null = null;
let statusBarItem: vscode.StatusBarItem;
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
  console.log("Sentry Auto Fix extension is now active");

  // Store context for use in other functions
  extensionContext = context;

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "sentryAutoFix.refreshIssues";
  context.subscriptions.push(statusBarItem);

  // Initialize Sentry client, webview, and MCP server
  initializeSentry().catch((error) => {
    console.error("Failed to initialize Sentry:", error);
  });

  // Register configuration change handler
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("sentryAutoFix.sentryUrl") ||
        e.affectsConfiguration("sentryAutoFix.apiToken") ||
        e.affectsConfiguration("sentryAutoFix.projectSlugs")
      ) {
        initializeSentry().catch((error) => {
          console.error("Failed to initialize Sentry:", error);
        });
      }
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("sentryAutoFix.refreshIssues", async () => {
      if (!webviewProvider) {
        vscode.window.showWarningMessage(
          "Please configure Sentry settings first (sentryUrl, apiToken, projectSlugs)"
        );
        return;
      }

      statusBarItem.text = "$(sync~spin) Loading Sentry issues...";
      statusBarItem.show();

      await webviewProvider.loadIssues();

      statusBarItem.text = "$(check) Sentry";
      setTimeout(() => statusBarItem.hide(), 3000);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "sentryAutoFix.fixWithAI",
      async (data: any) => {
        if (!webviewProvider || !sentryClient) {
          vscode.window.showWarningMessage("Sentry is not properly configured");
          return;
        }

        // Get the issue from the data (can be from webview or tree node)
        const issue = data?.issue || data;
        if (!issue) {
          vscode.window.showErrorMessage("No issue selected");
          return;
        }

        const fixCommand = new FixWithAICommand(sentryClient);
        await fixCommand.execute(issue);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "sentryAutoFix.openIssueInBrowser",
      async (issueNode: any) => {
        const issue = issueNode?.issue;
        if (issue && issue.permalink) {
          vscode.env.openExternal(vscode.Uri.parse(issue.permalink));
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "sentryAutoFix.showIssueDetails",
      async (issueId: string) => {
        if (!webviewProvider) {
          return;
        }

        const issue = webviewProvider.getIssueById(issueId);
        if (!issue) {
          return;
        }

        // Show issue details in a quick pick
        const items = [
          { label: "$(bug) Fix with AI", action: "fix" },
          { label: "$(globe) Open in Sentry", action: "open" },
        ];

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `${issue.shortId}: ${issue.title}`,
        });

        if (selected) {
          if (selected.action === "fix" && sentryClient) {
            const fixCommand = new FixWithAICommand(sentryClient);
            await fixCommand.execute(issue);
          } else if (selected.action === "open") {
            vscode.env.openExternal(vscode.Uri.parse(issue.permalink));
          }
        }
      }
    )
  );

  // Auto-load issues on activation if configured
  if (isConfigured()) {
    vscode.commands.executeCommand("sentryAutoFix.refreshIssues");
  }
}

async function initializeSentry() {
  const config = getConfiguration();

  if (
    !config.sentryUrl ||
    !config.apiToken ||
    config.projectSlugs.length === 0
  ) {
    statusBarItem.text = "$(warning) Sentry Not Configured";
    statusBarItem.tooltip = "Click to configure Sentry settings";
    statusBarItem.command = "workbench.action.openSettings";
    statusBarItem.show();

    sentryClient = null;
    webviewProvider = null;
    return;
  }

  // Create or update Sentry client
  if (sentryClient) {
    sentryClient.updateConfig(config);
  } else {
    sentryClient = new SentryClient(config);
  }

  // Create or update webview provider
  if (!webviewProvider) {
    webviewProvider = new SentryWebViewProvider(
      extensionContext.extensionUri,
      sentryClient,
      extensionContext
    );
    extensionContext.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        SentryWebViewProvider.viewType,
        webviewProvider
      )
    );

    // Start background refresh (every 5 minutes)
    const refreshInterval = setInterval(() => {
      if (webviewProvider) {
        webviewProvider.loadIssues(true); // true = background refresh
      }
    }, 5 * 60 * 1000); // 5 minutes

    extensionContext.subscriptions.push({
      dispose: () => clearInterval(refreshInterval),
    });
  }

  // Create or update MCP server
  if (!mcpServer) {
    mcpServer = new SentryMCPServer(config);
  } else {
    mcpServer.updateConfig(config);
  }

  // Register MCP server with Cursor
  try {
    const mcpPath = vscode.Uri.joinPath(
      extensionContext.extensionUri,
      "dist",
      "mcp-entry.js"
    ).fsPath;

    console.log("Registering MCP server at:", mcpPath);

    // Check if Cursor MCP API exists
    if (typeof (vscode as any).cursor?.mcp?.registerServer === "function") {
      await (vscode as any).cursor.mcp.registerServer({
        name: "sentry",
        server: {
          command: mcpPath, // Run as executable, not with node
          args: [],
          env: {
            SENTRY_URL: config.sentryUrl,
            SENTRY_API_TOKEN: config.apiToken,
            SENTRY_PROJECT_SLUGS: config.projectSlugs.join(","),
          },
        },
      });

      console.log("✅ MCP server registered successfully");
      vscode.window.showInformationMessage(
        "✅ Sentry MCP server registered! Restart Cursor to enable AI access."
      );
    } else {
      console.warn("⚠️ Cursor MCP API not available");
      vscode.window.showWarningMessage(
        "Cursor MCP API not found. Please upgrade Cursor or manually configure the MCP server."
      );
    }
  } catch (error) {
    console.error("❌ Failed to register MCP server:", error);
    vscode.window.showErrorMessage(
      `Failed to register MCP server: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  statusBarItem.text = "$(check) Sentry Connected";
  statusBarItem.tooltip = "Click to refresh issues";
  statusBarItem.show();
  setTimeout(() => statusBarItem.hide(), 3000);
}

function getConfiguration(): SentryConfig {
  const config = vscode.workspace.getConfiguration("sentryAutoFix");

  return {
    sentryUrl: config.get<string>("sentryUrl", ""),
    apiToken: config.get<string>("apiToken", ""),
    projectSlugs: config.get<string[]>("projectSlugs", []),
  };
}

function isConfigured(): boolean {
  const config = getConfiguration();
  return !!(
    config.sentryUrl &&
    config.apiToken &&
    config.projectSlugs.length > 0
  );
}

export async function deactivate() {
  if (statusBarItem) {
    statusBarItem.dispose();
  }

  // Unregister MCP server
  try {
    if (typeof (vscode as any).cursor?.mcp?.unregisterServer === "function") {
      await (vscode as any).cursor.mcp.unregisterServer("sentry");
      console.log("MCP server unregistered");
    }
  } catch (error) {
    console.error("Failed to unregister MCP server:", error);
  }
}
