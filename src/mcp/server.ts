import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SentryClient } from "../sentry/client";
import { SentryConfig, SentryIssue } from "../sentry/types";

export class SentryMCPServer {
  private server: Server;
  private sentryClient: SentryClient;

  constructor(config: SentryConfig) {
    this.sentryClient = new SentryClient(config);
    this.server = new Server(
      {
        name: "sentry-mcp-server",
        version: "0.1.0",
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

  updateConfig(config: SentryConfig) {
    this.sentryClient.updateConfig(config);
  }
}

