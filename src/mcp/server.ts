import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { compactMap } from './tools/compact-map.js';
import { compactExpand } from './tools/compact-expand.js';
import { compactDeps } from './tools/compact-deps.js';

const SERVER_INSTRUCTIONS = `
Compact MCP gives Claude Code deep React intelligence via live Babel AST analysis.

TOOLS:
- compact_map: Get a structural skeleton of the entire project (components, hooks, exports).
  Use at the START of any multi-file task or when exploring an unfamiliar codebase.

- compact_expand: Get the raw uncompressed source of a specific named function/component.
  Use BEFORE editing any function to see its exact implementation detail.
  NEVER edit based on compact_map output alone — always expand first.

- compact_deps: Get the full dependency chain for a component — who renders it, what
  props it takes, what contexts/hooks it uses, what it renders.

IMPORTANT: These tools are for CONTEXT files (files you read for orientation).
The file you are about to EDIT must ALWAYS be read with Claude's native Read tool.
`;

export async function startMcpServer(): Promise<void> {
  const cwd = process.cwd();

  const server = new McpServer(
    { name: 'compact-mcp', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      instructions: SERVER_INSTRUCTIONS.trim(),
    },
  );

  // ── Tool 1: compact_map ──────────────────────────────────────────────────
  server.registerTool(
    'compact_map',
    {
      description:
        'Walk all .tsx/.jsx/.ts/.js files in the project and return a structural skeleton: ' +
        'component names, props, hooks used, top-level JSX children rendered, and exports. ' +
        'Call this at the START of any multi-file task to orient Claude without reading every file. ' +
        'Saves 2,000–8,000 tokens vs exploratory Read calls. ' +
        'Returns up to 200 files. Use rootDir to narrow scope in large monorepos.',
      inputSchema: {
        rootDir: z
          .string()
          .optional()
          .describe(
            'Directory to scan. Defaults to the current working directory. ' +
            'Pass a subdirectory (e.g. "src/components") to narrow scope in large monorepos.',
          ),
      },
    },
    async ({ rootDir }) => {
      const dir = rootDir ? rootDir : cwd;
      const { text, metrics } = await compactMap(dir);
      const metricsLine = metrics.savedTokens > 0
        ? `\n\n📊 compact_map: ${metrics.filesScanned} files | ${metrics.rawTokens.toLocaleString()} raw tokens → ${metrics.skeletonTokens.toLocaleString()} skeleton tokens | saved ${metrics.savedTokens.toLocaleString()} tokens (${metrics.savedPercent}%)`
        : '';
      return { content: [{ type: 'text' as const, text: text + metricsLine }] };
    },
  );

  // ── Tool 2: compact_expand ───────────────────────────────────────────────
  server.registerTool(
    'compact_expand',
    {
      description:
        'Return the raw uncompressed source of a specific named function or component from a file. ' +
        'Use this AFTER compact_map or compact_read gives you a skeleton and you need ' +
        'implementation detail before editing. ' +
        'DO NOT edit a function based on compressed output — always expand it first. ' +
        'More token-efficient than raw Read when you need only one function from a large file.',
      inputSchema: {
        filePath: z
          .string()
          .describe('Path to the file, relative to the project root (e.g. "src/components/Button.tsx").'),
        functionName: z
          .string()
          .describe(
            'Exact name of the function, component, or class method to extract. ' +
            'Use "default" for anonymous default exports. ' +
            'If unsure of the name, call compact_map first.',
          ),
        rootDir: z
          .string()
          .optional()
          .describe('Project root directory. Defaults to current working directory.'),
      },
    },
    ({ filePath, functionName, rootDir }) => {
      const dir = rootDir ?? cwd;
      const { text, metrics } = compactExpand(filePath, functionName, dir);
      const metricsLine = metrics && metrics.savedTokens > 0
        ? `\n\n📊 compact_expand: ${metrics.functionTokens} tokens (function) vs ${metrics.fileTokens} tokens (full file) | saved ${metrics.savedTokens} tokens (${metrics.savedPercent}%)`
        : '';
      return { content: [{ type: 'text' as const, text: text + metricsLine }] };
    },
  );

  // ── Tool 3: compact_deps ─────────────────────────────────────────────────
  server.registerTool(
    'compact_deps',
    {
      description:
        'Return the full dependency chain for a React component: ' +
        'which components render it (rendered-by), what props it receives, ' +
        'what contexts it consumes, what hooks it uses, and what it renders. ' +
        'Replaces 6+ Read calls to manually trace this. ' +
        'Use when refactoring a component, debugging a re-render, or adding a prop.',
      inputSchema: {
        componentName: z
          .string()
          .describe(
            'Exact name of the React component (must start with uppercase, e.g. "CheckoutForm").',
          ),
        rootDir: z
          .string()
          .optional()
          .describe('Project root directory. Defaults to current working directory.'),
      },
    },
    async ({ componentName, rootDir }) => {
      const dir = rootDir ?? cwd;
      const result = await compactDeps(componentName, dir);
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  // ── Start ────────────────────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
