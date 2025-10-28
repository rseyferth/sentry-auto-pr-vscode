import * as vscode from "vscode";
import { SentryClient } from "../sentry/client";
import { SentryConfig } from "../sentry/types";
import { useSentryStore } from "./sentryStore";
import { ClickUpClient } from "../clickup/client";
import { ClickUpConfig, ClickUpList } from "../clickup/types";
import { useClickUpStore } from "./clickupStore";

export class StoreManager {
  private sentryClient: SentryClient | null = null;
  private clickUpClient: ClickUpClient | null = null;
  private sentryConfig: SentryConfig | null = null;
  private clickUpConfig: ClickUpConfig | null = null;
  private context: vscode.ExtensionContext;
  private emitter: vscode.EventEmitter<void>;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.emitter = new vscode.EventEmitter<void>();
  }

  get onDidChange(): vscode.Event<void> {
    return this.emitter.event;
  }

  /**
   * Initialize both stores with configuration
   */
  async initialize(
    sentryConfig: SentryConfig,
    clickUpConfig: ClickUpConfig | null
  ): Promise<void> {
    console.log("[StoreManager] Initializing stores...");
    this.sentryConfig = sentryConfig;
    this.clickUpConfig = clickUpConfig;

    // Initialize Sentry client
    this.sentryClient = new SentryClient(sentryConfig);
    console.log("[StoreManager] Sentry client initialized");

    // Initialize ClickUp client if configured
    if (clickUpConfig) {
      this.clickUpClient = new ClickUpClient(clickUpConfig);
      console.log("[StoreManager] ClickUp client initialized");
    }

    // Load Sentry issues
    await this.refreshSentry();

    // Load ClickUp lists if configured
    await this.refreshClickUp();

    console.log("[StoreManager] Stores initialized and emitters fired");
    this.emitter.fire();
  }

  /**
   * Refresh all stores
   */
  async refreshAll(): Promise<void> {
    await Promise.all([this.refreshSentry(), this.refreshClickUp()]);
    this.emitter.fire();
  }

  /**
   * Refresh only Sentry store
   */
  async refreshSentry(): Promise<void> {
    console.log("[StoreManager] refreshSentry called");
    if (!this.sentryClient) {
      console.log("[StoreManager] No Sentry client, clearing issues");
      useSentryStore.getState().updateIssues(new Map());
      return;
    }

    console.log("[StoreManager] Fetching Sentry issues...");
    await useSentryStore.getState().refresh(this.sentryClient);

    // After fetching issues, parse ClickUp URLs from comments
    console.log("[StoreManager] Parsing ClickUp URLs from Sentry comments...");
    const issuesByProject = useSentryStore.getState().issuesByProject;
    const totalIssues = Array.from(issuesByProject.values()).reduce(
      (sum, issues) => sum + issues.length,
      0
    );
    console.log(`[StoreManager] Total issues to check: ${totalIssues}`);

    let foundCount = 0;
    for (const [project, issues] of issuesByProject.entries()) {
      console.log(
        `[StoreManager] Checking ${issues.length} issues in project ${project}`
      );
      for (const issue of issues) {
        try {
          const clickUpUrl =
            await this.sentryClient.parseClickUpUrlFromComments(issue.id);
          if (clickUpUrl) {
            console.log(
              `[StoreManager] Found ClickUp URL for issue ${issue.shortId} (${issue.id}): ${clickUpUrl}`
            );
            useClickUpStore.getState().setTaskMapping(issue.id, clickUpUrl);
            foundCount++;
          }
        } catch (error) {
          console.error(
            `[StoreManager] Failed to parse ClickUp URL for issue ${issue.id}:`,
            error
          );
        }
      }
    }

    console.log(
      `[StoreManager] Found ${foundCount} ClickUp URLs from ${totalIssues} issues`
    );
    console.log("[StoreManager] Sentry issues fetched and emitters fired");
    this.emitter.fire();
  }

  /**
   * Refresh only ClickUp store
   */
  async refreshClickUp(): Promise<void> {
    console.log("[StoreManager] refreshClickUp called");
    if (!this.clickUpClient || !this.clickUpConfig) {
      console.log("[StoreManager] ClickUp not configured, skipping");
      return;
    }

    console.log("[StoreManager] Fetching ClickUp lists...");
    await useClickUpStore
      .getState()
      .refresh(this.clickUpClient, this.clickUpConfig);
    console.log("[StoreManager] ClickUp lists fetched and emitters fired");
    this.emitter.fire();
  }

  /**
   * Update configuration (called when settings change)
   */
  async updateConfig(
    sentryConfig: SentryConfig,
    clickUpConfig: ClickUpConfig | null
  ): Promise<void> {
    this.sentryConfig = sentryConfig;
    this.clickUpConfig = clickUpConfig;

    // Update Sentry client
    if (this.sentryClient) {
      this.sentryClient.updateConfig(sentryConfig);
    } else {
      this.sentryClient = new SentryClient(sentryConfig);
    }

    // Update ClickUp client
    if (clickUpConfig) {
      if (this.clickUpClient) {
        this.clickUpClient.updateConfig(clickUpConfig);
      } else {
        this.clickUpClient = new ClickUpClient(clickUpConfig);
      }
    } else {
      this.clickUpClient = null;
    }

    // Refresh both stores
    await this.refreshAll();
  }

  /**
   * Get Sentry client
   */
  getSentryClient(): SentryClient | null {
    return this.sentryClient;
  }

  /**
   * Get ClickUp client
   */
  getClickUpClient(): ClickUpClient | null {
    return this.clickUpClient;
  }

  /**
   * Get Sentry configuration
   */
  getSentryConfig(): SentryConfig | null {
    return this.sentryConfig;
  }

  /**
   * Get ClickUp configuration
   */
  getClickUpConfig(): ClickUpConfig | null {
    return this.clickUpConfig;
  }

  /**
   * Get ClickUp client
   */
  getClickUpStoreClient(): ClickUpClient | null {
    return this.clickUpClient;
  }

  /**
   * Create ClickUp task for a Sentry issue
   */
  async createClickUpTask(
    issueId: string,
    issueTitle: string,
    issueUrl: string
  ): Promise<{ taskId: string; taskUrl: string }> {
    if (!this.clickUpClient || !this.clickUpConfig) {
      throw new Error("ClickUp is not configured");
    }

    const selectedListId = useClickUpStore.getState().selectedListId;
    if (!selectedListId) {
      throw new Error("No ClickUp list selected");
    }

    const { taskId, taskUrl } = await useClickUpStore
      .getState()
      .createTask(
        this.clickUpClient,
        selectedListId,
        issueId,
        issueTitle,
        issueUrl
      );

    // Also save the URL mapping
    useClickUpStore.getState().setTaskMapping(issueId, taskUrl);

    return { taskId, taskUrl };
  }

  /**
   * Get ClickUp task URL for a Sentry issue
   */
  getClickUpTaskUrl(issueId: string): string | undefined {
    return useClickUpStore.getState().issueTaskMap.get(issueId);
  }

  /**
   * Check if ClickUp is enabled
   */
  isClickUpEnabled(): boolean {
    return useClickUpStore.getState().isEnabled;
  }

  /**
   * Get Sentry issues from store
   */
  getSentryIssues(): Map<string, any[]> {
    const state = useSentryStore.getState();
    return state.issuesByProject;
  }

  /**
   * Get ClickUp lists from store
   */
  getClickUpLists(): any[] {
    const state = useClickUpStore.getState();
    return state.lists;
  }

  /**
   * Get ClickUp selected list ID
   */
  getClickUpSelectedListId(): string | null {
    const state = useClickUpStore.getState();
    return state.selectedListId;
  }

  /**
   * Get issue task mapping
   */
  getIssueTaskMap(): Map<string, string> {
    const state = useClickUpStore.getState();
    return state.issueTaskMap;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.emitter.dispose();
  }
}
