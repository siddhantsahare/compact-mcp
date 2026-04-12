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

ALWAYS include the 📊 metrics line from the tool output verbatim in your response when you use any compact tool.
`;

export async function startMcpServer(): Promise<void> {
  const cwd = process.cwd();

  const server = new McpServer(
    { name: 'compact-mcp', version: '1.0.0' },
    {
      capabilities: { tools: {}, prompts: {} },
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
        ? `📊 compact_map: ${metrics.filesScanned} files | ${metrics.rawTokens.toLocaleString()} raw tokens → ${metrics.skeletonTokens.toLocaleString()} skeleton tokens | saved ${metrics.savedTokens.toLocaleString()} tokens (${metrics.savedPercent}%)\n\n`
        : '';
      return { content: [{ type: 'text' as const, text: metricsLine + text }] };
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
        ? `📊 compact_expand: ${metrics.functionTokens} tokens (function) vs ${metrics.fileTokens} tokens (full file) | saved ${metrics.savedTokens} tokens (${metrics.savedPercent}%)\n\n`
        : '';
      return { content: [{ type: 'text' as const, text: metricsLine + text }] };
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

  // ── Prompts ──────────────────────────────────────────────────────────────

  // Prompt 1: Map the project
  server.registerPrompt(
    'compact_map_project',
    {
      title: 'Map this React project',
      description:
        'Get a structural skeleton of the entire React project — components, hooks, exports, ' +
        'and render trees — in one call. Use at the start of any multi-file task.',
    },
    () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              'Use compact_map to get a structural overview of this React project. ' +
              'Then summarise what you found: the main pages/routes, the key shared components, ' +
              'and any patterns you notice (contexts used, common hooks, etc.). ' +
              'IMPORTANT: at the end of your response, copy the 📊 compact_map line from the tool output verbatim (do not paraphrase it).',
          },
        },
      ],
    }),
  );

  // Prompt 2: Explain a component's dependency chain
  server.registerPrompt(
    'compact_explain_component',
    {
      title: 'Explain a component',
      description:
        'Trace the full dependency chain for a React component: who renders it, what props ' +
        'it receives, what contexts and hooks it uses, and what it renders.',
      argsSchema: {
        componentName: z
          .string()
          .describe('Name of the React component to explain (e.g. "CheckoutForm")'),
      },
    },
    ({ componentName }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              `Use compact_deps to trace the full dependency chain for the ${componentName} component. ` +
              `Then explain: where it sits in the component tree, what data it depends on, ` +
              `and what would need to change if I refactored it.`,
          },
        },
      ],
    }),
  );

  // Prompt 3: Expand and explain a function
  server.registerPrompt(
    'compact_expand_function',
    {
      title: 'Expand a function',
      description:
        'Get the raw uncompressed source of a named function and explain what it does. ' +
        'Use before editing any function.',
      argsSchema: {
        functionName: z
          .string()
          .describe('Exact name of the function or component to expand (e.g. "handleSubmit")'),
        filePath: z
          .string()
          .describe('File path relative to project root (e.g. "src/components/CheckoutForm.tsx")'),
      },
    },
    ({ functionName, filePath }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              `Use compact_expand to get the raw source of ${functionName} from ${filePath}. ` +
              `Then explain what it does, what it depends on, and flag anything that looks ` +
              `fragile or worth knowing before I edit it. ` +
              `IMPORTANT: at the end of your response, copy the 📊 compact_expand line from the tool output verbatim (do not paraphrase it).`,
          },
        },
      ],
    }),
  );

  // ── Start ────────────────────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
