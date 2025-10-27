#!/bin/bash

# Test the MCP server standalone
# This will help debug if the server is working correctly

echo "Testing MCP Server..."
echo ""
echo "Setting up environment..."

export SENTRY_URL="https://your-sentry-url.com"
export SENTRY_API_TOKEN="your_token_here"  # Replace with actual token
export SENTRY_PROJECT_SLUGS="org/project"

echo "Starting MCP server..."
echo "Send this JSON to test (press Ctrl+D after pasting):"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
echo ""

# Run as executable (not with node command)
./dist/mcp-entry.js


