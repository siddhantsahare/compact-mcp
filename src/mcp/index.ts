#!/usr/bin/env node

import { startMcpServer } from './server.js';

startMcpServer().catch((err) => {
  process.stderr.write(`[compact-mcp] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
