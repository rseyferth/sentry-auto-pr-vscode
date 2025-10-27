# Sentry Auto Fix for Cursor

Integrate Sentry directly into Cursor/VSCode. Works with both **Sentry.io (cloud)** and **self-hosted** instances. View issues in a sidebar panel and generate AI-powered fix prompts with a single click.

## Features

- 🔌 **Connect to Sentry** - Works with sentry.io or self-hosted instances
- 🎨 **Modern Card UI** - Beautiful card-based interface with visual hierarchy
- 🔍 **Search & Filter** - Instantly search issues and filter by project with checkboxes
- 📋 **Browse Issues** - View all unresolved issues from your projects in a dedicated sidebar
- 🤖 **AI-Powered Fixes** - Generate comprehensive prompts for Cursor AI with one click
- 🔄 **Real-time Sync** - Refresh issues on demand to stay up-to-date
- 📊 **Issue Details** - See event counts, affected users, and timestamps at a glance
- 🛠️ **MCP Server** - Let AI agents search, analyze, and resolve issues via Model Context Protocol
- ✅ **Resolve Issues** - Mark issues as "resolved in next release" directly from the UI

## Installation

1. Install the extension in Cursor/VSCode
2. Configure your Sentry connection (see Configuration below)
3. The Sentry Issues panel will appear in the Activity Bar (sidebar)

## Configuration

Open your settings (`Cmd/Ctrl + ,`) and search for "Sentry Auto Fix". Configure the following:

### Required Settings

- **Sentry URL**: Your Sentry instance URL

  - **Cloud (sentry.io)**: `https://sentry.io` ← Most common
  - **Self-hosted**: `https://sentry.example.com`
  - Do not include trailing slash

- **API Token**: Your Sentry authentication token

  - Create one at:
    - Cloud: `https://sentry.io/settings/account/api/auth-tokens/`
    - Self-hosted: `https://your-sentry-url/settings/account/api/auth-tokens/`
  - **Required scopes**: `project:read`, `event:read`, `event:write`

- **Project Slugs**: Array of projects to monitor
  - Format: `["organization-slug/project-slug"]`
  - Example: `["my-company/web-app", "my-company/api"]`

### Example Configuration (settings.json)

**For Sentry.io (Cloud):**

```json
{
  "sentryAutoFix.sentryUrl": "https://sentry.io",
  "sentryAutoFix.apiToken": "sntrys_your_token_here",
  "sentryAutoFix.projectSlugs": ["my-org/frontend", "my-org/backend"]
}
```

**For Self-Hosted:**

```json
{
  "sentryAutoFix.sentryUrl": "https://sentry.example.com",
  "sentryAutoFix.apiToken": "your_sentry_api_token_here",
  "sentryAutoFix.projectSlugs": ["my-org/frontend", "my-org/backend"]
}
```

## Usage

### Viewing Issues

1. Click the 🐛 bug icon in the Activity Bar (left sidebar)
2. Issues display as cards grouped by project
3. Use the search bar at the top to filter issues
4. Click "📁 Projects" dropdown to show/hide specific projects
5. Click "🔄 Refresh" to reload issues from Sentry

### Fixing Issues with AI

1. Find an issue in the sidebar
2. Click the **"🤖 Fix with AI"** button on the issue card

The extension will:

- Fetch the latest event details from Sentry
- Generate a comprehensive prompt including:
  - Issue title and error message
  - Full stack trace with file locations
  - User actions (breadcrumbs) leading to the error
  - Environment tags (browser, OS, runtime, etc.)
- Send the prompt to Cursor AI chat (or copy to clipboard)

### Resolving Issues

Click the **"✅ Resolve in Next Release"** button to mark an issue as resolved in Sentry. The issue will disappear from the list after the next refresh.

### Opening Issues in Sentry

Click the **"🌐 Open in Sentry"** button on any issue card to view full details in your browser.

## MCP Server

The extension includes an MCP (Model Context Protocol) server that allows AI agents to interact with your Sentry issues.

### Setup

The MCP server is **automatically registered** when you activate the extension. After configuring your Sentry credentials, you'll see a message confirming registration.

**Important:** After the MCP server registers, you must **fully restart Cursor** (quit and reopen) for the AI to recognize the new tools.

```json
{
  "mcpServers": {
    "sentry": {
      "command": "node",
      "args": ["/Users/ruben/Projects/sentry-auto-pr-mcp/dist/mcp-entry.js"],
      "env": {
        "SENTRY_URL": "https://your-sentry-url.com",
        "SENTRY_API_TOKEN": "your_token_here",
        "SENTRY_PROJECT_SLUGS": "org/project1,org/project2"
      }
    }
  }
}
```

**After configuring, restart Cursor completely** (not just reload window).

### Available Tools

The AI agent can now:

- **`sentry_search_issues`** - Search/filter issues by keyword, project, or limit
- **`sentry_get_issue_details`** - Get full details including stack traces and breadcrumbs
- **`sentry_list_projects`** - List all configured projects
- **`sentry_resolve_issue`** - Mark issue as resolved in next release

### Example Usage

In Cursor AI chat, you can say:

- "Show me all Sentry errors from the last week"
- "Get details for issue MYAPP-123"
- "Which project has the most issues?"
- "Great, let's resolve issue MYAPP-123" ← Marks it as resolved!

## Generated Prompt Format

The AI fix prompt includes:

- **Issue Summary**: ID, title, severity, event count, affected users
- **Error Message**: The actual error that occurred
- **Stack Trace**: Complete call stack with file paths and line numbers
- **Affected Files**: List of application files involved in the error
- **User Actions**: Breadcrumbs showing what the user did before the error
- **Environment Tags**: Browser, OS, runtime version, URL, etc.
- **Task**: Specific instructions for the AI to analyze and fix

## Troubleshooting

### "Sentry Not Configured" Warning

Make sure you've set all three required settings:

- `sentryAutoFix.sentryUrl`
- `sentryAutoFix.apiToken`
- `sentryAutoFix.projectSlugs`

### "Failed to load Sentry issues"

Check that:

1. Your Sentry URL is correct (no trailing slash)
2. Your API token is valid and has the required scopes
3. Your project slugs are in the correct format: `"org/project"`
4. You have network access to your Sentry instance

### API Token Scopes

Your Sentry API token needs these scopes:

- `project:read` - To fetch project information and issues
- `event:read` - To fetch event details
- `event:write` - To resolve issues

**Create a token at:**

- Cloud: `https://sentry.io/settings/account/api/auth-tokens/`
- Self-hosted: `https://your-sentry-url/settings/account/api/auth-tokens/`

## Commands

- `Sentry: Refresh Issues` - Reload issues from Sentry
- `Sentry: Fix this issue using AI` - Generate AI fix prompt for selected issue
- `Sentry: Open Issue in Sentry` - Open issue in browser

## Development

To build and run locally:

```bash
# Install dependencies
npm install

# Compile the extension
npm run compile

# Or watch for changes (recommended)
npm run watch
```

Then press F5 in VSCode and select "Run Extension (Watch Mode)" to launch with hot reload. When you make changes, press `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux) in the Extension Development Host window to reload.

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed development guide.

## Requirements

- VSCode/Cursor version 1.85.0 or higher
- A Sentry account (sentry.io or self-hosted)
- Valid Sentry API token with required scopes

## Release Notes

### 0.0.1

Initial release:

- Connect to Sentry.io (cloud) or self-hosted instances
- View unresolved issues in a modern card-based UI
- Search and filter issues by project
- Generate AI fix prompts with full context (stack traces, breadcrumbs, tags)
- Resolve issues directly from the extension
- Open issues in browser
- MCP server for AI agent integration

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
