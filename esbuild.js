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
    banner: {
      js: `'use strict';`
    },
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

  // Build webview React app
  const webviewCtx = await esbuild.context({
    entryPoints: ['src/webview/index.tsx'],
    bundle: true,
    format: 'iife',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    outfile: 'dist/webview.js',
    logLevel: 'silent',
    jsx: 'automatic',
    loader: {
      '.css': 'text',
    },
    plugins: [
      {
        name: 'css-loader',
        setup(build) {
          build.onLoad({ filter: /\.css$/ }, async (args) => {
            const fs = require('fs');
            const text = await fs.promises.readFile(args.path, 'utf8');
            return {
              contents: `const style = document.createElement('style'); style.textContent = ${JSON.stringify(text)}; document.head.appendChild(style);`,
              loader: 'js',
            };
          });
        },
      },
      {
        name: 'watch-plugin-webview',
        setup(build) {
          build.onStart(() => {
            console.log('[watch] webview build started');
          });
          build.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error('[watch] webview build failed:', result.errors);
            } else {
              console.log('[watch] webview build succeeded');
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
    format: 'cjs',
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
    await webviewCtx.watch();
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
    await webviewCtx.rebuild();
    await mcpCtx.rebuild();
    await extensionCtx.dispose();
    await webviewCtx.dispose();
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

