import * as vscode from "vscode";
import { SentryClient } from "../sentry/client";
import {
  SentryIssue,
  SentryEvent,
  ExceptionValue,
  StackFrame,
} from "../sentry/types";

export class FixWithAICommand {
  constructor(private sentryClient: SentryClient) {}

  async execute(issue: SentryIssue): Promise<void> {
    try {
      // Fetch the latest event for detailed information
      const event = await this.sentryClient.fetchLatestEvent(issue.id);

      if (!event) {
        vscode.window.showErrorMessage(
          "Failed to fetch event details from Sentry"
        );
        return;
      }

      // Build the comprehensive prompt
      const prompt = this.buildPrompt(issue, event);

      // Send to Cursor AI chat
      await this.sendToCursorAI(prompt);

      vscode.window.showInformationMessage(
        `Generated AI fix prompt for: ${issue.shortId}`
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to generate fix prompt: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private buildPrompt(issue: SentryIssue, event: SentryEvent): string {
    const sections: string[] = [];

    // Header
    sections.push("# Fix Sentry Issue");
    sections.push("");
    sections.push(`**Issue ID:** ${issue.shortId}`);
    sections.push(`**Issue Title:** ${issue.title}`);
    sections.push(`**Level:** ${issue.level}`);
    sections.push(`**Event Count:** ${issue.count} events`);
    sections.push(`**Users Affected:** ${issue.userCount}`);
    sections.push(`**Link:** ${issue.permalink}`);
    sections.push("");

    // Error message
    sections.push("## Error Message");
    sections.push("");
    if (issue.metadata?.value) {
      sections.push(`\`\`\`\n${issue.metadata.value}\n\`\`\``);
    } else {
      sections.push(`\`\`\`\n${event.message}\n\`\`\``);
    }
    sections.push("");

    // Stack trace
    const stackTrace = this.extractStackTrace(event);
    if (stackTrace) {
      sections.push("## Stack Trace");
      sections.push("");
      sections.push("```");
      sections.push(stackTrace);
      sections.push("```");
      sections.push("");

      // Extract file locations
      const fileLocations = this.extractFileLocations(event);
      if (fileLocations.length > 0) {
        sections.push("## Affected Files");
        sections.push("");
        fileLocations.forEach((loc) => {
          sections.push(
            `- \`${loc.filename}\` at line ${loc.lineNo} in function \`${loc.function}\``
          );
        });
        sections.push("");
      }
    }

    // Breadcrumbs (user actions leading to error)
    const breadcrumbs = this.extractBreadcrumbs(event);
    if (breadcrumbs) {
      sections.push("## User Actions (Breadcrumbs)");
      sections.push("");
      sections.push("Steps that led to this error:");
      sections.push("");
      sections.push("```");
      sections.push(breadcrumbs);
      sections.push("```");
      sections.push("");
    }

    // Tags and context
    if (event.tags && event.tags.length > 0) {
      sections.push("## Environment Tags");
      sections.push("");
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

      relevantTags.forEach((tag) => {
        sections.push(`- **${tag.key}:** ${tag.value}`);
      });
      sections.push("");
    }

    // Request for analysis
    sections.push("## Task");
    sections.push("");
    sections.push("Please analyze this error and:");
    sections.push("1. Identify the root cause of the issue");
    sections.push("2. Suggest a fix with code changes");
    sections.push(
      "3. Explain why this error occurred and how to prevent it in the future"
    );
    sections.push("");
    sections.push(
      "If you need to see more context from the codebase, please ask or search for the relevant files."
    );

    return sections.join("\n");
  }

  private extractStackTrace(event: SentryEvent): string | null {
    // Look for exception entry
    const exceptionEntry = event.entries.find(
      (entry) => entry.type === "exception"
    );

    if (!exceptionEntry || !exceptionEntry.data) {
      return null;
    }

    const exceptions: ExceptionValue[] = exceptionEntry.data.values || [];
    const lines: string[] = [];

    for (const exception of exceptions.reverse()) {
      lines.push(`${exception.type}: ${exception.value}`);

      if (exception.stacktrace && exception.stacktrace.frames) {
        const frames = exception.stacktrace.frames;

        // Reverse frames to show most recent call first
        for (const frame of frames.slice().reverse()) {
          const location = this.formatFrameLocation(frame);
          lines.push(`  at ${frame.function || "<anonymous>"} (${location})`);
        }
      }

      lines.push("");
    }

    return lines.join("\n").trim();
  }

  private extractFileLocations(event: SentryEvent): StackFrame[] {
    const exceptionEntry = event.entries.find(
      (entry) => entry.type === "exception"
    );

    if (!exceptionEntry || !exceptionEntry.data) {
      return [];
    }

    const exceptions: ExceptionValue[] = exceptionEntry.data.values || [];
    const frames: StackFrame[] = [];

    for (const exception of exceptions) {
      if (exception.stacktrace && exception.stacktrace.frames) {
        // Only include frames from the application (inApp)
        const appFrames = exception.stacktrace.frames.filter(
          (frame) => frame.inApp && frame.filename && frame.lineNo
        );
        frames.push(...appFrames);
      }
    }

    return frames;
  }

  private formatFrameLocation(frame: StackFrame): string {
    const file = frame.filename || frame.absPath || "unknown";
    const line = frame.lineNo ? `:${frame.lineNo}` : "";
    const col = frame.colNo ? `:${frame.colNo}` : "";
    return `${file}${line}${col}`;
  }

  private extractBreadcrumbs(event: SentryEvent): string | null {
    if (
      !event.breadcrumbs ||
      !event.breadcrumbs.values ||
      event.breadcrumbs.values.length === 0
    ) {
      return null;
    }

    const lines: string[] = [];
    const breadcrumbs = event.breadcrumbs.values.slice(-10); // Last 10 breadcrumbs

    for (const breadcrumb of breadcrumbs) {
      const timestamp = new Date(breadcrumb.timestamp).toLocaleTimeString();
      const category = breadcrumb.category || breadcrumb.type;
      const message =
        breadcrumb.message || JSON.stringify(breadcrumb.data || {});

      lines.push(`[${timestamp}] ${category}: ${message}`);
    }

    return lines.join("\n");
  }

  private async sendToCursorAI(prompt: string): Promise<void> {
    try {
      // Save the original clipboard content
      const originalClipboard = await vscode.env.clipboard.readText();

      // Open the chat panel
      await vscode.commands.executeCommand("aichat.show-ai-chat");

      // Wait for the chat window to open
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Put your prompt in the clipboard
      await vscode.env.clipboard.writeText(prompt);

      // Paste it into the chat
      await vscode.commands.executeCommand(
        "editor.action.clipboardPasteAction"
      );

      // Restore the original clipboard content
      await vscode.env.clipboard.writeText(originalClipboard);

      vscode.window.showInformationMessage("✅ Prompt sent to Cursor AI chat!");
    } catch (error) {
      console.error("Failed to send prompt to AI chat:", error);

      // Fallback: copy to clipboard and show message
      await vscode.env.clipboard.writeText(prompt);

      const action = await vscode.window.showWarningMessage(
        "⚠️ Couldn't auto-paste to AI chat. Prompt is copied - please paste with Cmd+V / Ctrl+V.",
        "Open Chat"
      );

      if (action === "Open Chat") {
        try {
          await vscode.commands.executeCommand("aichat.show-ai-chat");
        } catch (error) {
          vscode.window.showErrorMessage(
            "Unable to open chat. Please open it manually and paste the prompt."
          );
        }
      }
    }
  }
}
