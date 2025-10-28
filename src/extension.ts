import * as vscode from "vscode";
import { SentryMCPServer } from "./mcp/server";
import { StoreManager } from "./stores/storeManager";
import { SentryWebViewProvider } from "./views/sentryWebView";
import { FixWithAICommand } from "./commands/fixWithAI";
import { SentryConfig } from "./sentry/types";
import { ClickUpConfig } from "./clickup/types";

let storeManager: StoreManager | null = null;
let webviewProvider: SentryWebViewProvider | null = null;
let mcpServer: SentryMCPServer | null = null;
let statusBarItem: vscode.StatusBarItem;
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
  console.log("Sentry Auto Fix extension is now active");

  extensionContext = context;

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "sentryAutoFix.refreshIssues";
  context.subscriptions.push(statusBarItem);

  // Initialize stores
  initializeStores();

  // Register configuration change handler
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("sentryAutoFix.sentryUrl") ||
        e.affectsConfiguration("sentryAutoFix.apiToken") ||
        e.affectsConfiguration("sentryAutoFix.projectSlugs") ||
        e.affectsConfiguration("sentryAutoFix.clickupApiToken") ||
        e.affectsConfiguration("sentryAutoFix.clickupTeamId") ||
        e.affectsConfiguration("sentryAutoFix.clickupCustomFields") ||
        e.affectsConfiguration("sentryAutoFix.clickupSelectedList") ||
        e.affectsConfiguration("sentryAutoFix.clickupCompletedStatus") ||
        e.affectsConfiguration("sentryAutoFix.clickupLanguage") ||
        e.affectsConfiguration("sentryAutoFix.customPromptInstructions")
      ) {
        initializeStores();
      }
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("sentryAutoFix.refreshIssues", async () => {
      if (!storeManager) {
        vscode.window.showWarningMessage(
          "Please configure Sentry settings first"
        );
        return;
      }

      statusBarItem.text = "$(sync~spin) Loading Sentry issues...";
      statusBarItem.show();

      await storeManager.refreshAll();

      statusBarItem.text = "$(check) Sentry";
      setTimeout(() => statusBarItem.hide(), 3000);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "sentryAutoFix.fixWithAI",
      async (data: any) => {
        if (!storeManager) {
          vscode.window.showWarningMessage("Sentry is not properly configured");
          return;
        }

        const issue = data?.issue || data;
        if (!issue) {
          vscode.window.showErrorMessage("No issue selected");
          return;
        }

        const sentryClient = storeManager.getSentryClient();
        if (!sentryClient) {
          vscode.window.showWarningMessage("Sentry client not available");
          return;
        }

        // Get ClickUp language setting
        const clickUpConfig = storeManager.getClickUpConfig();
        const language = clickUpConfig?.language || "English";

        // Get custom prompt instructions
        const config = vscode.workspace.getConfiguration("sentryAutoFix");
        const customPromptInstructions = config.get<string>(
          "customPromptInstructions",
          ""
        );

        const fixCommand = new FixWithAICommand(
          sentryClient,
          language,
          customPromptInstructions
        );
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
    vscode.commands.registerCommand("sentryAutoFix.openSettings", async () => {
      // Open workspace settings by default
      const config = vscode.workspace.getConfiguration("sentryAutoFix", null);
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "sentryAutoFix"
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "sentryAutoFix.showIssueDetails",
      async (issueId: string) => {
        if (!webviewProvider) {
          return;
        }

        const sentryClient = storeManager?.getSentryClient();
        if (!sentryClient) {
          return;
        }

        // Get issue from store
        const issuesByProject = storeManager?.getSentryClient()
          ? await storeManager.getSentryClient()?.fetchAllIssues()
          : new Map();
        let issue;
        for (const issues of issuesByProject?.values() || []) {
          issue = issues.find((i: any) => i.id === issueId);
          if (issue) break;
        }

        if (!issue) {
          return;
        }

        const items = [
          { label: "$(bug) Fix with AI", action: "fix" },
          { label: "$(globe) Open in Sentry", action: "open" },
        ];

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `${issue.shortId}: ${issue.title}`,
        });

        if (selected) {
          if (selected.action === "fix") {
            const sentryClient = storeManager?.getSentryClient();
            if (sentryClient) {
              // Get ClickUp language setting
              const clickUpConfig = storeManager.getClickUpConfig();
              const language = clickUpConfig?.language || "English";

              // Get custom prompt instructions
              const config = vscode.workspace.getConfiguration("sentryAutoFix");
              const customPromptInstructions = config.get<string>(
                "customPromptInstructions",
                ""
              );

              const fixCommand = new FixWithAICommand(
                sentryClient,
                language,
                customPromptInstructions
              );
              await fixCommand.execute(issue);
            }
          } else if (selected.action === "open") {
            vscode.env.openExternal(vscode.Uri.parse(issue.permalink));
          }
        }
      }
    )
  );
}

function initializeStores() {
  const sentryConfig = getSentryConfiguration();
  const clickUpConfig = getClickUpConfiguration();
  const isSentryConfigured =
    sentryConfig.sentryUrl &&
    sentryConfig.apiToken &&
    sentryConfig.projectSlugs.length > 0;

  if (!isSentryConfigured) {
    statusBarItem.text = "$(warning) Sentry Not Configured";
    statusBarItem.tooltip = "Click to configure Sentry settings";
    statusBarItem.command = "workbench.action.openSettings";
    statusBarItem.show();

    // Clear stores if not configured
    if (storeManager) {
      storeManager.dispose();
      storeManager = null;
    }
    return;
  }

  // Initialize store manager
  if (!storeManager) {
    storeManager = new StoreManager(extensionContext);

    // Listen for store changes to update webview
    storeManager.onDidChange(() => {
      if (webviewProvider) {
        webviewProvider.refresh();
      }
    });
  }

  // Initialize stores
  storeManager.initialize(sentryConfig, clickUpConfig).catch((error) => {
    console.error("Failed to initialize stores:", error);
  });

  // Initialize webview provider
  if (!webviewProvider) {
    webviewProvider = new SentryWebViewProvider(
      extensionContext.extensionUri,
      storeManager
    );
    extensionContext.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        SentryWebViewProvider.viewType,
        webviewProvider
      )
    );
  }

  // Initialize or update MCP server
  if (!mcpServer) {
    mcpServer = new SentryMCPServer(sentryConfig, storeManager);
  } else {
    mcpServer.updateConfig(sentryConfig, storeManager);
  }

  // Register MCP server with Cursor
  registerMCPServer().catch((error) => {
    console.error("Failed to register MCP server:", error);
  });

  statusBarItem.text = "$(check) Sentry Connected";
  statusBarItem.tooltip = "Click to refresh issues";
  statusBarItem.show();
  setTimeout(() => statusBarItem.hide(), 3000);
}

async function registerMCPServer() {
  if (!storeManager) {
    return;
  }

  const sentryConfig = getSentryConfiguration();
  const clickUpConfig = getClickUpConfiguration();
  const mcpPath = vscode.Uri.joinPath(
    extensionContext.extensionUri,
    "dist",
    "mcp-entry.js"
  ).fsPath;

  console.log("Registering MCP server at:", mcpPath);

  const env: Record<string, string> = {
    SENTRY_URL: sentryConfig.sentryUrl,
    SENTRY_API_TOKEN: sentryConfig.apiToken,
    SENTRY_PROJECT_SLUGS: sentryConfig.projectSlugs.join(","),
  };

  // Add ClickUp config to environment if configured
  if (clickUpConfig) {
    env.CLICKUP_API_TOKEN = clickUpConfig.apiToken;
    env.CLICKUP_TEAM_ID = clickUpConfig.teamId;
    env.CLICKUP_COMPLETED_STATUS = clickUpConfig.completedStatusName;
    env.CLICKUP_LANGUAGE = clickUpConfig.language;
    if (clickUpConfig.selectedListId) {
      env.CLICKUP_SELECTED_LIST = clickUpConfig.selectedListId;
    }
    if (Object.keys(clickUpConfig.customFields).length > 0) {
      env.CLICKUP_CUSTOM_FIELDS = JSON.stringify(clickUpConfig.customFields);
    }
    console.log("✅ ClickUp config added to MCP server env");
  } else {
    console.log("⚠️ ClickUp not configured for MCP server");
  }

  if (typeof (vscode as any).cursor?.mcp?.registerServer === "function") {
    await (vscode as any).cursor.mcp.registerServer({
      name: "sentry",
      server: {
        command: mcpPath,
        args: [],
        env,
      },
    });

    console.log("✅ MCP server registered successfully");
    console.log("Environment variables:", Object.keys(env));
    vscode.window.showInformationMessage(
      "✅ Sentry MCP server registered! Restart Cursor to enable AI access."
    );
  } else {
    console.warn("⚠️ Cursor MCP API not available");
  }
}

function getSentryConfiguration(): SentryConfig {
  const config = vscode.workspace.getConfiguration("sentryAutoFix");

  return {
    sentryUrl: config.get<string>("sentryUrl", ""),
    apiToken: config.get<string>("apiToken", ""),
    projectSlugs: config.get<string[]>("projectSlugs", []),
  };
}

function getClickUpConfiguration(): ClickUpConfig | null {
  const config = vscode.workspace.getConfiguration("sentryAutoFix");

  const apiToken = config.get<string>("clickupApiToken", "");
  const teamId = config.get<string>("clickupTeamId", "");

  if (!apiToken || !teamId) {
    return null;
  }

  return {
    apiToken,
    teamId,
    customFields: config.get<Record<string, any>>("clickupCustomFields", {}),
    selectedListId: config.get<string>("clickupSelectedList", ""),
    completedStatusName: config.get<string>(
      "clickupCompletedStatus",
      "complete"
    ),
    language: config.get<string>("clickupLanguage", "English"),
  };
}

export async function deactivate() {
  if (statusBarItem) {
    statusBarItem.dispose();
  }

  if (storeManager) {
    storeManager.dispose();
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
