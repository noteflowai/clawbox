#!/usr/bin/env node
/**
 * Patch playwright-mcp context.js to use the last page instead of all pages
 * This ensures each new MCP session gets the most recently created tab
 */

const fs = require('fs');
const path = require('path');

const CONTEXT_JS = path.join(__dirname, 'playwright-mcp/node_modules/playwright/lib/mcp/browser/context.js');

console.log('[patch] Patching context.js to use last page for new sessions...');

if (!fs.existsSync(CONTEXT_JS)) {
  console.error('[patch] Error: context.js not found at', CONTEXT_JS);
  process.exit(1);
}

// Read the file
let content = fs.readFileSync(CONTEXT_JS, 'utf8');

// Backup original
fs.writeFileSync(CONTEXT_JS + '.original', content);

// Find and replace the problematic code
const originalCode = `    for (const page of browserContext.pages())
      this._onPageCreated(page);`;

const patchedCode = `    const existingPages = browserContext.pages();
    if (existingPages.length > 0) {
      // Use the last page (most recently created tab) for this session
      const lastPage = existingPages[existingPages.length - 1];
      console.log('[mcp-patch] Using last page for new session. Total pages:', existingPages.length);
      this._onPageCreated(lastPage);
    }`;

if (content.includes(originalCode)) {
  content = content.replace(originalCode, patchedCode);
  fs.writeFileSync(CONTEXT_JS, content);
  console.log('[patch] ✓ Successfully patched context.js');
  console.log('[patch] ✓ Each new MCP session will now use the last (newest) browser tab');
} else if (content.includes('mcp-patch')) {
  console.log('[patch] ✓ Already patched (found mcp-patch marker)');
} else {
  console.error('[patch] ✗ Could not find expected code to patch');
  console.error('[patch]   The playwright-mcp version may have changed');
  process.exit(1);
}
