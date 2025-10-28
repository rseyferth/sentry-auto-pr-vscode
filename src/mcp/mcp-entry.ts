import { SentryMCPServer } from "./server.js";
import { ClickUpConfig } from "../clickup/types.js";

// Debug: Log environment variables (without sensitive data)
console.error("=== Sentry MCP Server Starting ===");
console.error("SENTRY_URL:", process.env.SENTRY_URL ? "✓ Set" : "✗ Missing");
console.error(
  "SENTRY_API_TOKEN:",
  process.env.SENTRY_API_TOKEN ? "✓ Set" : "✗ Missing"
);
console.error(
  "SENTRY_PROJECT_SLUGS:",
  process.env.SENTRY_PROJECT_SLUGS ? "✓ Set" : "✗ Missing"
);
console.error(
  "CLICKUP_API_TOKEN:",
  process.env.CLICKUP_API_TOKEN ? "✓ Set" : "✗ Missing"
);
console.error(
  "CLICKUP_TEAM_ID:",
  process.env.CLICKUP_TEAM_ID ? "✓ Set" : "✗ Missing"
);

// Read config from environment variables
const config = {
  sentryUrl: process.env.SENTRY_URL || "",
  apiToken: process.env.SENTRY_API_TOKEN || "",
  projectSlugs: process.env.SENTRY_PROJECT_SLUGS
    ? process.env.SENTRY_PROJECT_SLUGS.split(",").map((s) => s.trim())
    : [],
};

if (!config.sentryUrl || !config.apiToken || config.projectSlugs.length === 0) {
  console.error("❌ Error: Missing required environment variables");
  console.error("Required: SENTRY_URL, SENTRY_API_TOKEN, SENTRY_PROJECT_SLUGS");
  console.error("\nExample:");
  console.error("  SENTRY_URL=https://sentry.io");
  console.error("  SENTRY_API_TOKEN=your_token_here");
  console.error("  SENTRY_PROJECT_SLUGS=org/project1,org/project2");
  process.exit(1);
}

console.error("✅ Configuration valid");
console.error("Projects:", config.projectSlugs.join(", "));

// Read ClickUp config from environment if available
let clickUpConfig: ClickUpConfig | null = null;
if (process.env.CLICKUP_API_TOKEN && process.env.CLICKUP_TEAM_ID) {
  const customFields = process.env.CLICKUP_CUSTOM_FIELDS
    ? JSON.parse(process.env.CLICKUP_CUSTOM_FIELDS)
    : {};

  clickUpConfig = {
    apiToken: process.env.CLICKUP_API_TOKEN,
    teamId: process.env.CLICKUP_TEAM_ID,
    customFields,
    selectedListId: process.env.CLICKUP_SELECTED_LIST || undefined,
    completedStatusName: process.env.CLICKUP_COMPLETED_STATUS || "complete",
    language: process.env.CLICKUP_LANGUAGE || "English",
  };
  console.error("✅ ClickUp configuration available");
} else {
  console.error("⚠️ ClickUp not configured");
}

// Initialize server with ClickUp config if available
// Note: The mcp-entry is for the standalone MCP server process
// It doesn't have access to storeManager, so we pass null
const server = new SentryMCPServer(config, null);

// If ClickUp is configured, initialize the client
if (clickUpConfig) {
  // We need to manually initialize the ClickUp client since we don't have access to storeManager
  // This is a bit of a workaround - the server's updateConfig method should handle this
  console.error("Attempting to initialize ClickUp client from config...");
  // The server will attempt to get the config from storeManager when needed
}

server.start().catch((error) => {
  console.error("❌ Failed to start MCP server:", error);
  process.exit(1);
});
