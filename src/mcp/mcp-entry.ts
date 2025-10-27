import { SentryMCPServer } from "./server.js";

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

const server = new SentryMCPServer(config);
server.start().catch((error) => {
  console.error("❌ Failed to start MCP server:", error);
  process.exit(1);
});
