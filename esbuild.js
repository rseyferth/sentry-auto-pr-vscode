const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  // Build extension
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'watch-plugin',
        setup(build) {
          build.onStart(() => {
            console.log('[watch] extension build started');
          });
          build.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error('[watch] extension build failed:', result.errors);
            } else {
              console.log('[watch] extension build succeeded');
            }
          });
        },
      },
    ],
  });

  // Build MCP server
  const mcpCtx = await esbuild.context({
    entryPoints: ['src/mcp/mcp-entry.ts'],
    bundle: true,
    format: 'cjs', // Use CommonJS format for better compatibility
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/mcp-entry.js',
    external: [],
    logLevel: 'silent',
    banner: {
      js: '#!/usr/bin/env node\n',
    },
    plugins: [
      {
        name: 'watch-plugin-mcp',
        setup(build) {
          build.onStart(() => {
            console.log('[watch] MCP build started');
          });
          build.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error('[watch] MCP build failed:', result.errors);
            } else {
              console.log('[watch] MCP build succeeded');
            }
          });
        },
      },
    ],
  });

  if (watch) {
    await extensionCtx.watch();
    await mcpCtx.watch();
    
    // Make MCP entry executable on first build
    const fs = require('fs');
    try {
      fs.chmodSync('dist/mcp-entry.js', 0o755);
    } catch (err) {
      console.warn('Could not set executable permission on mcp-entry.js:', err.message);
    }
    
    console.log('👀 Watching for changes... (Press Cmd+R / Ctrl+R in Extension Development Host to reload)');
  } else {
    await extensionCtx.rebuild();
    await mcpCtx.rebuild();
    await extensionCtx.dispose();
    await mcpCtx.dispose();
    
    // Make MCP entry executable
    const fs = require('fs');
    try {
      fs.chmodSync('dist/mcp-entry.js', 0o755);
      console.log('✅ Build complete (MCP entry is executable)');
    } catch (err) {
      console.log('✅ Build complete');
      console.warn('⚠️  Could not set executable permission on mcp-entry.js');
    }
  }
}

main().catch((e) => {
  console.error('❌ Build failed:', e);
  process.exit(1);
});

