# Publishing Guide

## Prerequisites

1. **Create a publisher account**

   - Go to https://marketplace.visualstudio.com/manage
   - Sign in with Microsoft/GitHub account
   - Create a publisher (e.g., "yourname" or "yourcompany")

2. **Get a Personal Access Token (PAT)**
   - Go to https://dev.azure.com/
   - Click User Settings → Personal Access Tokens
   - Create new token with **Marketplace (Manage)** scope
   - Copy and save the token securely

## Step 1: Prepare for Publishing

```bash
# Fix npm cache permissions if needed
sudo chown -R $(id -u):$(id -g) "$HOME/.npm"

# Install vsce globally
npm install -g @vscode/vsce

# Make sure dependencies are installed
npm install

# Compile the extension
npm run compile
```

## Step 2: Update package.json

Update these fields in `package.json`:

```json
{
  "publisher": "your-publisher-name", // Use your actual publisher ID
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/sentry-auto-pr-mcp"
  }
}
```

## Step 3: Create Icon (Optional but Recommended)

Convert the SVG icon to PNG:

```bash
# Using ImageMagick or any converter
convert resources/sentry-icon.svg -resize 128x128 resources/sentry-icon.png
```

Or just use an online converter to create a 128x128 PNG.

## Step 4: Build the Extension

```bash
# Package the extension
vsce package

# This creates: sentry-auto-fix-0.0.1.vsix
```

## Step 5A: Install Locally (Testing)

**In Cursor/VSCode:**

1. Click Extensions icon
2. Click `...` (three dots menu)
3. Select "Install from VSIX..."
4. Choose `sentry-auto-fix-0.0.1.vsix`

**Or via command line:**

```bash
code --install-extension sentry-auto-fix-0.0.1.vsix
```

## Step 5B: Publish to Marketplace

```bash
# First time: Login with your PAT
vsce login your-publisher-name

# Publish (this will package and upload)
vsce publish

# Or publish a specific version
vsce publish minor  # 0.0.1 → 0.1.0
vsce publish patch  # 0.0.1 → 0.0.2
vsce publish major  # 0.0.1 → 1.0.0
```

## Step 6: Update Version

For future releases:

```bash
# Update version in package.json
npm version patch  # or minor, or major

# Compile
npm run compile

# Publish
vsce publish
```

## Quick Commands

```bash
# Full build and package
npm run compile && vsce package

# Full build and publish
npm run compile && vsce publish

# Publish with automatic version bump
vsce publish patch  # Auto-increments version
```

## Troubleshooting

### Error: "Missing publisher name"

Update the `publisher` field in `package.json` with your actual publisher ID.

### Error: "Missing README.md"

Make sure `README.md` exists in the project root.

### Error: "Missing icon"

Either:

- Create `resources/sentry-icon.png` (128x128)
- Or remove the `icon` field from `package.json`

### Error: "EACCES: permission denied"

```bash
sudo chown -R $(id -u):$(id -g) "$HOME/.npm"
```

## Publishing Checklist

- [ ] Update `package.json` with your publisher name
- [ ] Update version number
- [ ] Update `README.md` if needed
- [ ] Create icon PNG (128x128)
- [ ] Run `npm run compile`
- [ ] Test locally with `vsce package` + install
- [ ] Create git tag: `git tag v0.0.1 && git push --tags`
- [ ] Publish: `vsce publish`

## Post-Publishing

After publishing, your extension will be available at:

```
https://marketplace.visualstudio.com/items?itemName=your-publisher-name.sentry-auto-fix
```

It takes a few minutes to appear in search results after publishing.

## Updating the Extension

1. Make your changes
2. Update version: `npm version patch`
3. Compile: `npm run compile`
4. Publish: `vsce publish`

Users will automatically get notified of the update in their editor.
