#!/usr/bin/env node
/**
 * @module index
 * Entry point for the Indian Option MCP Server.
 * Connects the MCP server to stdio transport for Claude Desktop integration.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sub = args[0];

  // Server management commands — no Claude / MCP involved, just start/stop/restart
  // the local dashboard. Lets the owner avoid Task Manager entirely.
  if (sub === 'stop' || sub === 'kill') {
    const { stopServer } = await import('./dashboard/process-manager.js');
    stopServer();
    return;
  }
  if (sub === 'status') {
    const { printStatus } = await import('./dashboard/process-manager.js');
    printStatus();
    return;
  }
  if (sub === 'restart') {
    const { restartServer } = await import('./dashboard/process-manager.js');
    restartServer();
    return;
  }
  if (sub === 'start') {
    const { startDashboard } = await import('./dashboard/server.js');
    await startDashboard();
    return;
  }

  const isDashboard = args.includes('--dashboard') || args.includes('--web');
  if (isDashboard) {
    const { startDashboard } = await import('./dashboard/server.js');
    await startDashboard();
    return;
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🇮🇳 Indian Option MCP Server v1.1.0 running on stdio');
  console.error('   Data provider: ' + (process.env.DATA_PROVIDER || 'nse'));
}

main().catch((error) => {
  console.error('Fatal error starting Indian Option MCP Server:', error);
  process.exit(1);
});
