import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SentryClient } from "../sentry/client";
import { SentryConfig, SentryIssue } from "../sentry/types";
import { ClickUpClient } from "../clickup/client";
import { StoreManager } from "../stores/storeManager";

export class SentryMCPServer {
  private server: Server;
  private sentryClient: SentryClient;
  private clickUpClient: ClickUpClient | null = null;
  private storeManager: StoreManager | null = null;
  private clickUpConfig: any | null = null;

  constructor(config: SentryConfig, storeManager?: StoreManager | null) {
    this.storeManager = storeManager || null;
    this.sentryClient = new SentryClient(config);

    // Try to get ClickUp config from storeManager first
    const clickUpConfig = storeManager?.getClickUpConfig();
    if (clickUpConfig) {
      this.clickUpConfig = clickUpConfig;
      this.clickUpClient = new ClickUpClient(clickUpConfig);
      console.error(
        "[MCP Server] ClickUp client initialized from storeManager"
      );
    } else if (!this.clickUpConfig) {
      // Try to load from environment variables (for standalone MCP server)
      if (process.env.CLICKUP_API_TOKEN && process.env.CLICKUP_TEAM_ID) {
        const customFields = process.env.CLICKUP_CUSTOM_FIELDS
          ? JSON.parse(process.env.CLICKUP_CUSTOM_FIELDS)
          : {};

        this.clickUpConfig = {
          apiToken: process.env.CLICKUP_API_TOKEN,
          teamId: process.env.CLICKUP_TEAM_ID,
          customFields,
          selectedListId: process.env.CLICKUP_SELECTED_LIST,
          completedStatusName:
            process.env.CLICKUP_COMPLETED_STATUS || "complete",
          language: process.env.CLICKUP_LANGUAGE || "English",
        };
        this.clickUpClient = new ClickUpClient(this.clickUpConfig);
        console.error(
          "[MCP Server] ClickUp client initialized from environment"
        );
      } else {
        console.error("[MCP Server] ClickUp not configured");
      }
    }

    this.server = new Server(
      {
        name: "sentry-mcp-server",
        version: "0.2.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "sentry_search_issues",
          description:
            "Search and filter Sentry issues across all configured projects. Returns a list of unresolved issues with their details.",
          inputSchema: {
            type: "object",
            properties: {
              search: {
                type: "string",
                description:
                  "Search term to filter issues by title, ID, or error message",
              },
              project: {
                type: "string",
                description:
                  "Filter by specific project (format: 'org/project')",
              },
              limit: {
                type: "number",
                description: "Maximum number of issues to return (default: 25)",
              },
            },
          },
        },
        {
          name: "sentry_get_issue_details",
          description:
            "Get detailed information about a specific Sentry issue, including full stack trace, breadcrumbs, and tags.",
          inputSchema: {
            type: "object",
            properties: {
              issueId: {
                type: "string",
                description: "The Sentry issue ID",
              },
            },
            required: ["issueId"],
          },
        },
        {
          name: "sentry_list_projects",
          description: "List all configured Sentry projects.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "sentry_resolve_issue",
          description:
            "Mark a Sentry issue as resolved in next release. This removes the issue from the active list.",
          inputSchema: {
            type: "object",
            properties: {
              issueId: {
                type: "string",
                description: "The Sentry issue ID to resolve",
              },
            },
            required: ["issueId"],
          },
        },
        {
          name: "clickup_add_comment",
          description:
            "Add a comment to a ClickUp task. Use this to add summaries of problems, solutions, and testing instructions.",
          inputSchema: {
            type: "object",
            properties: {
              taskId: {
                type: "string",
                description: "The ClickUp task ID",
              },
              comment: {
                type: "string",
                description: "The comment text to add",
              },
            },
            required: ["taskId", "comment"],
          },
        },
        {
          name: "clickup_set_status",
          description:
            "Set the status of a ClickUp task (e.g., mark as complete when an issue is fixed).",
          inputSchema: {
            type: "object",
            properties: {
              taskId: {
                type: "string",
                description: "The ClickUp task ID",
              },
              statusName: {
                type: "string",
                description:
                  "The status name (defaults to 'complete' or configured completion status)",
              },
            },
            required: ["taskId"],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "sentry_search_issues":
            return await this.searchIssues(args);

          case "sentry_get_issue_details":
            return await this.getIssueDetails(args);

          case "sentry_list_projects":
            return await this.listProjects();

          case "sentry_resolve_issue":
            return await this.resolveIssue(args);

          case "clickup_add_comment":
            return await this.addClickUpComment(args);

          case "clickup_set_status":
            return await this.setClickUpStatus(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async searchIssues(args: any) {
    const searchTerm = args.search?.toLowerCase() || "";
    const projectFilter = args.project;
    const limit = args.limit || 25;

    const issuesByProject = await this.sentryClient.fetchAllIssues();
    const allIssues: Array<{ project: string; issue: SentryIssue }> = [];

    for (const [project, issues] of issuesByProject.entries()) {
      if (projectFilter && project !== projectFilter) {
        continue;
      }

      for (const issue of issues) {
        if (
          !searchTerm ||
          issue.title.toLowerCase().includes(searchTerm) ||
          issue.shortId.toLowerCase().includes(searchTerm) ||
          issue.culprit?.toLowerCase().includes(searchTerm)
        ) {
          allIssues.push({ project, issue });
        }
      }
    }

    const limitedIssues = allIssues.slice(0, limit);

    const response = limitedIssues
      .map(
        ({ project, issue }) =>
          `**${issue.shortId}** (${project})\n` +
          `Title: ${issue.title}\n` +
          `Level: ${issue.level}\n` +
          `Events: ${issue.count} (${issue.userCount} users affected)\n` +
          `Last seen: ${new Date(issue.lastSeen).toLocaleString()}\n` +
          `Culprit: ${issue.culprit || "N/A"}\n` +
          `Link: ${issue.permalink}\n` +
          `Issue ID: ${issue.id}\n`
      )
      .join("\n---\n\n");

    return {
      content: [
        {
          type: "text",
          text:
            response ||
            "No issues found matching your criteria. All issues may be resolved!",
        },
      ],
    };
  }

  private async getIssueDetails(args: any) {
    const issueId = args.issueId;

    if (!issueId) {
      throw new Error("issueId is required");
    }

    // First, find the issue in our cache
    const issuesByProject = await this.sentryClient.fetchAllIssues();
    let foundIssue: SentryIssue | undefined;
    let foundProject: string | undefined;

    for (const [project, issues] of issuesByProject.entries()) {
      const issue = issues.find(
        (i) => i.id === issueId || i.shortId === issueId
      );
      if (issue) {
        foundIssue = issue;
        foundProject = project;
        break;
      }
    }

    if (!foundIssue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    // Fetch the latest event for detailed information
    const event = await this.sentryClient.fetchLatestEvent(foundIssue.id);

    let details = `# ${foundIssue.shortId}: ${foundIssue.title}\n\n`;
    details += `**Project:** ${foundProject}\n`;
    details += `**Level:** ${foundIssue.level}\n`;
    details += `**Status:** ${foundIssue.status}\n`;
    details += `**Events:** ${foundIssue.count} (${foundIssue.userCount} users affected)\n`;
    details += `**First Seen:** ${new Date(
      foundIssue.firstSeen
    ).toLocaleString()}\n`;
    details += `**Last Seen:** ${new Date(
      foundIssue.lastSeen
    ).toLocaleString()}\n`;
    details += `**Link:** ${foundIssue.permalink}\n\n`;

    if (foundIssue.culprit) {
      details += `**Culprit:** ${foundIssue.culprit}\n\n`;
    }

    if (event) {
      details += `## Error Message\n\n`;
      details += `${foundIssue.metadata?.value || event.message}\n\n`;

      // Extract stack trace
      const exceptionEntry = event.entries.find(
        (entry) => entry.type === "exception"
      );
      if (exceptionEntry?.data?.values) {
        details += `## Stack Trace\n\n\`\`\`\n`;
        for (const exception of exceptionEntry.data.values.reverse()) {
          details += `${exception.type}: ${exception.value}\n`;
          if (exception.stacktrace?.frames) {
            for (const frame of exception.stacktrace.frames.slice().reverse()) {
              details += `  at ${frame.function || "<anonymous>"} (${
                frame.filename || frame.absPath || "unknown"
              }:${frame.lineNo || "?"})\n`;
            }
          }
        }
        details += `\`\`\`\n\n`;
      }

      // Breadcrumbs
      if (event.breadcrumbs?.values && event.breadcrumbs.values.length > 0) {
        details += `## User Actions (Breadcrumbs)\n\n`;
        const breadcrumbs = event.breadcrumbs.values.slice(-10);
        for (const breadcrumb of breadcrumbs) {
          const timestamp = new Date(breadcrumb.timestamp).toLocaleTimeString();
          const category = breadcrumb.category || breadcrumb.type;
          const message =
            breadcrumb.message || JSON.stringify(breadcrumb.data || {});
          details += `- [${timestamp}] ${category}: ${message}\n`;
        }
        details += `\n`;
      }

      // Tags
      if (event.tags && event.tags.length > 0) {
        details += `## Tags\n\n`;
        const relevantTags = event.tags
          .filter((tag) =>
            [
              "environment",
              "release",
              "browser",
              "os",
              "level",
              "runtime",
              "url",
            ].includes(tag.key)
          )
          .slice(0, 10);

        for (const tag of relevantTags) {
          details += `- **${tag.key}:** ${tag.value}\n`;
        }
      }
    }

    details += `\n**To resolve this issue, use:** \`sentry_resolve_issue\` with issueId: \`${foundIssue.id}\`\n`;

    return {
      content: [
        {
          type: "text",
          text: details,
        },
      ],
    };
  }

  private async listProjects() {
    const issuesByProject = await this.sentryClient.fetchAllIssues();
    const projects: string[] = [];

    for (const [project, issues] of issuesByProject.entries()) {
      projects.push(`${project} (${issues.length} unresolved issues)`);
    }

    return {
      content: [
        {
          type: "text",
          text:
            projects.length > 0
              ? `Available projects:\n\n${projects
                  .map((p) => `- ${p}`)
                  .join("\n")}`
              : "No projects configured.",
        },
      ],
    };
  }

  private async resolveIssue(args: any) {
    const issueId = args.issueId;

    if (!issueId) {
      throw new Error("issueId is required");
    }

    // Find the issue first to get its shortId for the response
    const issuesByProject = await this.sentryClient.fetchAllIssues();
    let foundIssue: SentryIssue | undefined;

    for (const issues of issuesByProject.values()) {
      const issue = issues.find(
        (i) => i.id === issueId || i.shortId === issueId
      );
      if (issue) {
        foundIssue = issue;
        break;
      }
    }

    if (!foundIssue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    await this.sentryClient.resolveIssue(foundIssue.id);

    return {
      content: [
        {
          type: "text",
          text: `✅ Issue ${foundIssue.shortId} has been marked as resolved in next release.\n\nThe issue will no longer appear in the active issues list.`,
        },
      ],
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Sentry MCP Server running on stdio");
  }

  updateConfig(config: SentryConfig, storeManager?: StoreManager | null) {
    this.sentryClient.updateConfig(config);

    // Update store manager reference if provided
    if (storeManager !== undefined) {
      this.storeManager = storeManager;
    }

    // Update ClickUp client if configured
    const clickUpConfig =
      this.storeManager?.getClickUpConfig() || this.clickUpConfig;
    if (clickUpConfig) {
      if (this.clickUpClient) {
        this.clickUpClient.updateConfig(clickUpConfig);
      } else {
        this.clickUpClient = new ClickUpClient(clickUpConfig);
        console.error(
          "[MCP Server] ClickUp client initialized in updateConfig"
        );
      }
    } else {
      this.clickUpClient = null;
    }
  }

  private async addClickUpComment(args: any) {
    const taskId = args.taskId;
    const comment = args.comment;

    console.error("[MCP Server] addClickUpComment called with taskId:", taskId);
    console.error("[MCP Server] Has clickUpClient:", !!this.clickUpClient);
    console.error("[MCP Server] Has storeManager:", !!this.storeManager);

    if (this.storeManager) {
      const clickUpConfig = this.storeManager.getClickUpConfig();
      console.error(
        "[MCP Server] ClickUp config from storeManager:",
        clickUpConfig ? "exists" : "null"
      );

      // Update ClickUp client from store manager if not initialized
      if (!this.clickUpClient && clickUpConfig) {
        console.error(
          "[MCP Server] Initializing ClickUp client from storeManager"
        );
        this.clickUpClient = new ClickUpClient(clickUpConfig);
      }
    }

    if (!taskId || !comment) {
      throw new Error("taskId and comment are required");
    }

    if (!this.clickUpClient) {
      throw new Error("ClickUp is not configured");
    }

    await this.clickUpClient.addComment(taskId, comment);

    return {
      content: [
        {
          type: "text",
          text: `✅ Comment added to ClickUp task ${taskId}`,
        },
      ],
    };
  }

  private async setClickUpStatus(args: any) {
    const taskId = args.taskId;
    const statusName = args.statusName;

    console.error("[MCP Server] setClickUpStatus called with taskId:", taskId);
    console.error("[MCP Server] Has clickUpClient:", !!this.clickUpClient);
    console.error("[MCP Server] Has storeManager:", !!this.storeManager);

    if (this.storeManager) {
      const clickUpConfig = this.storeManager.getClickUpConfig();
      console.error(
        "[MCP Server] ClickUp config from storeManager:",
        clickUpConfig ? "exists" : "null"
      );

      // Update ClickUp client from store manager if not initialized
      if (!this.clickUpClient && clickUpConfig) {
        console.error(
          "[MCP Server] Initializing ClickUp client from storeManager"
        );
        this.clickUpClient = new ClickUpClient(clickUpConfig);
      }
    }

    if (!taskId) {
      throw new Error("taskId is required");
    }

    if (!this.clickUpClient) {
      throw new Error("ClickUp is not configured");
    }

    await this.clickUpClient.updateTaskStatus(taskId, statusName);

    return {
      content: [
        {
          type: "text",
          text: `✅ ClickUp task ${taskId} status set to "${
            statusName || "complete"
          }"`,
        },
      ],
    };
  }
}
