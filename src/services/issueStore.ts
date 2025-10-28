import * as vscode from "vscode";
import { SentryClient } from "../sentry/client";
import { SentryIssue } from "../sentry/types";

export type IssuesByProject = Map<string, SentryIssue[]>;

export class IssueStore {
  private issuesByProject: IssuesByProject = new Map();
  private sentryClient: SentryClient | null;
  private context: vscode.ExtensionContext;
  private emitter = new vscode.EventEmitter<IssuesByProject>();
  public readonly onDidChange = this.emitter.event;
  private refreshInterval: NodeJS.Timeout | null = null;
  private isRefreshing = false;

  constructor(context: vscode.ExtensionContext, client: SentryClient | null) {
    this.context = context;
    this.sentryClient = client;
    this.loadFromCache().catch(() => {});

    // If client is available on construction, immediately fetch issues
    if (client) {
      this.refresh(true).catch(() => {});
    }
  }

  updateClient(client: SentryClient | null) {
    this.sentryClient = client;
  }

  getIssues(): IssuesByProject {
    return this.issuesByProject;
  }

  async refresh(background: boolean = false): Promise<IssuesByProject> {
    if (!this.sentryClient) {
      this.issuesByProject = new Map();
      this.emitter.fire(this.issuesByProject);
      return this.issuesByProject;
    }

    if (this.isRefreshing) {
      return this.issuesByProject;
    }

    try {
      this.isRefreshing = true;
      const result = await this.sentryClient.fetchAllIssues();
      this.issuesByProject = result;
      await this.saveToCache();
      this.emitter.fire(this.issuesByProject);
      return this.issuesByProject;
    } finally {
      this.isRefreshing = false;
    }
  }

  startAutoRefresh(ms: number) {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    this.refreshInterval = setInterval(() => {
      this.refresh(true).catch(() => {});
    }, ms);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private async saveToCache(): Promise<void> {
    try {
      const serialized: { project: string; issues: SentryIssue[] }[] = [];
      for (const [project, issues] of this.issuesByProject.entries()) {
        serialized.push({ project, issues });
      }
      await this.context.workspaceState.update("sentryIssues", {
        data: serialized,
        timestamp: Date.now(),
      });
    } catch {}
  }

  private async loadFromCache(): Promise<void> {
    try {
      const cached = this.context.workspaceState.get<{
        data: Array<{ project: string; issues: SentryIssue[] }>;
        timestamp: number;
      }>("sentryIssues");
      if (cached?.data) {
        const map: IssuesByProject = new Map();
        for (const entry of cached.data) {
          map.set(entry.project, entry.issues);
        }
        this.issuesByProject = map;
        this.emitter.fire(this.issuesByProject);
      }
    } catch {}
  }
}
