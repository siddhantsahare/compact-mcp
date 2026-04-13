#!/usr/bin/env node
// Entry point for the compact-mcp npm package.
if (process.argv[2] === 'setup') {
  require('../dist/setup.js').runSetup(process.argv.slice(3));
} else {
  require('../dist/mcp/index.js');
}
