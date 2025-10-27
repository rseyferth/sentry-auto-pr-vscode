import * as vscode from "vscode";
import { SentryClient } from "../sentry/client";
import { SentryIssue } from "../sentry/types";

export class SentryTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    TreeNode | undefined | null | void
  > = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    TreeNode | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private issuesByProject: Map<string, SentryIssue[]> = new Map();

  constructor(private sentryClient: SentryClient) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async loadIssues(): Promise<void> {
    try {
      this.issuesByProject = await this.sentryClient.fetchAllIssues();
      this.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to load Sentry issues: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!element) {
      // Root level: show projects
      const projects: TreeNode[] = [];

      for (const [projectSlug, issues] of this.issuesByProject.entries()) {
        const projectNode = new ProjectNode(projectSlug, issues.length);
        projects.push(projectNode);
      }

      if (projects.length === 0) {
        return [new MessageNode("No projects configured. Check settings.")];
      }

      return projects;
    } else if (element instanceof ProjectNode) {
      // Show issues for this project
      const issues = this.issuesByProject.get(element.projectSlug) || [];

      if (issues.length === 0) {
        return [new MessageNode("No unresolved issues")];
      }

      return issues.map((issue) => new IssueNode(issue));
    }

    return [];
  }

  getIssueById(issueId: string): SentryIssue | undefined {
    for (const issues of this.issuesByProject.values()) {
      const issue = issues.find((i) => i.id === issueId);
      if (issue) {
        return issue;
      }
    }
    return undefined;
  }
}

abstract class TreeNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}

class ProjectNode extends TreeNode {
  constructor(public readonly projectSlug: string, issueCount: number) {
    super(
      `${projectSlug} (${issueCount})`,
      vscode.TreeItemCollapsibleState.Expanded
    );
    this.contextValue = "project";
    this.iconPath = new vscode.ThemeIcon("folder");
  }
}

class IssueNode extends TreeNode {
  constructor(public readonly issue: SentryIssue) {
    super(issue.title, vscode.TreeItemCollapsibleState.None);

    this.contextValue = "issue";
    this.tooltip = this.buildTooltip();
    this.description = `${issue.shortId} • ${issue.count} events`;
    this.iconPath = this.getIconForLevel(issue.level);

    // Store issue ID in the command argument
    this.command = {
      command: "sentryAutoFix.showIssueDetails",
      title: "Show Issue Details",
      arguments: [issue.id],
    };
  }

  private buildTooltip(): string {
    const i = this.issue;
    return [
      `Issue: ${i.shortId}`,
      `Level: ${i.level}`,
      `Events: ${i.count}`,
      `Users Affected: ${i.userCount}`,
      `First Seen: ${new Date(i.firstSeen).toLocaleString()}`,
      `Last Seen: ${new Date(i.lastSeen).toLocaleString()}`,
      ``,
      i.culprit,
    ].join("\n");
  }

  private getIconForLevel(level: string): vscode.ThemeIcon {
    switch (level) {
      case "fatal":
      case "error":
        return new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("errorForeground")
        );
      case "warning":
        return new vscode.ThemeIcon(
          "warning",
          new vscode.ThemeColor("editorWarning.foreground")
        );
      case "info":
        return new vscode.ThemeIcon("info");
      default:
        return new vscode.ThemeIcon("circle-outline");
    }
  }
}

class MessageNode extends TreeNode {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "message";
  }
}
