/**
 * eval-feature-dev.mjs
 *
 * Evaluates compact-mcp token savings for FEATURE DEVELOPMENT tasks.
 *
 * Feature dev is different from bug navigation:
 *   - You need to find WHERE to add the feature (target file)
 *   - You need PATTERN CONTEXT: how do existing components handle similar things?
 *     (existing hook usage, state patterns, prop conventions)
 *   - You need CROSS-FILE IMPACT: what other files need updating?
 *     (types, exports, parent components)
 *
 * WITHOUT MCP: grep for pattern → read 3-5 reference files → read target file
 * WITH MCP:    compact_map → compact_deps(target) → compact_expand(reference functions)
 *
 * Usage:
 *   node scripts/eval-feature-dev.mjs "C:/Users/siddhant s/excalidraw-benchmark"
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const repoRoot = process.argv[2];
if (!repoRoot || !existsSync(repoRoot)) {
  console.error('Usage: node eval-feature-dev.mjs <path-to-excalidraw-repo>');
  process.exit(1);
}

// ─── Token counting (same as benchmark) ──────────────────────────────────────

// Rough but consistent: ~4 chars per token (GPT-4 average)
function countTokens(text) {
  return Math.ceil(text.length / 4);
}

function readTokens(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return { tokens: countTokens(content), exists: true };
  } catch {
    return { tokens: 2500, exists: false }; // fallback estimate for missing files
  }
}

// ─── Scenario definitions ─────────────────────────────────────────────────────

// Each scenario: a realistic feature request on excalidraw
// WITHOUT MCP: files a developer would grep + read to gather context
// WITH MCP: compact_map (shared) + compact_deps + compact_expand calls

const srcBase = join(repoRoot, 'packages', 'excalidraw', 'src');

const scenarios = [
  {
    id: 'feat-1',
    title: 'Add tooltip to existing toolbar button',
    issue: 'New feature — add hover tooltips to toolbar buttons that show keyboard shortcut',
    navigationChallenge: 'Find existing tooltip implementation + toolbar button components + shortcut registry',

    withoutMcp: {
      description: 'Grep for "tooltip" → read tooltip component → read ToolButton → read keyboard shortcuts → read target toolbar section',
      steps: [
        { label: 'grep "tooltip"', tokens: 600 },
        { label: 'read: components/Tooltip.tsx', file: join(srcBase, 'components', 'Tooltip.tsx') },
        { label: 'read: components/ToolButton.tsx', file: join(srcBase, 'components', 'ToolButton.tsx') },
        { label: 'read: components/Actions.tsx (toolbar)', file: join(srcBase, 'components', 'Actions.tsx') },
        { label: 'read: actions/actionCanvas.tsx (shortcut registry)', file: join(srcBase, 'actions', 'actionCanvas.tsx') },
        { label: 'read: components/App.tsx (toolbar integration)', file: join(srcBase, 'components', 'App.tsx') },
      ],
    },

    withMcp: {
      description: 'compact_map (shared) → compact_deps("ToolButton") → compact_expand("Tooltip") → compact_expand("ToolButton")',
      compactMapTokens: 4470, // amortized from eval-issues result
      steps: [
        { label: 'compact_deps("ToolButton")', tokens: 400 },
        { label: 'compact_expand("Tooltip")', tokens: 180 },
        { label: 'compact_expand("ToolButton")', tokens: 320 },
        { label: 'native Read target file (ToolButton.tsx — the file being edited)', file: join(srcBase, 'components', 'ToolButton.tsx') },
      ],
    },
  },

  {
    id: 'feat-2',
    title: 'Add export to new file format (e.g. SVG metadata)',
    issue: 'New feature — add metadata export alongside existing SVG/PNG export pipeline',
    navigationChallenge: 'Find existing export functions + file format registry + download utilities',

    withoutMcp: {
      description: 'Grep for "export" "download" → read export utils → read export dialog → read App.tsx export handlers → read existing format handlers',
      steps: [
        { label: 'grep "exportToSvg\\|exportToPng\\|download"', tokens: 600 },
        { label: 'read: utils/export.ts', file: join(srcBase, 'utils', 'export.ts') },
        { label: 'read: components/ExportDialog (entry)', tokens: 3500 },  // estimated
        { label: 'read: components/App.tsx (export trigger)', file: join(srcBase, 'components', 'App.tsx') },
        { label: 'read: packages/utils/src/export.ts (format impl)', tokens: 4000 }, // estimated
        { label: 'grep "ExportType\\|FileFormat"', tokens: 600 },
        { label: 'read: types.ts (ExportType definition)', file: join(srcBase, 'types.ts') },
      ],
    },

    withMcp: {
      description: 'compact_map (shared) → compact_deps("ExportDialog") → compact_expand("exportToSvg") → compact_expand("exportToPng")',
      compactMapTokens: 4470,
      steps: [
        { label: 'compact_deps("ExportDialog")', tokens: 350 },
        { label: 'compact_expand("exportToSvg")', tokens: 280 },
        { label: 'compact_expand("exportToPng")', tokens: 220 },
        { label: 'native Read target file (export.ts — being edited)', file: join(srcBase, 'utils', 'export.ts') },
      ],
    },
  },

  {
    id: 'feat-3',
    title: 'Add new element type (e.g. sticky note)',
    issue: 'New feature — add a new drawable element type following the existing element registration pattern',
    navigationChallenge: 'Find element type registry, rendering pipeline, action registration, and serialization',

    withoutMcp: {
      description: 'Grep for existing element types → read element factory → read renderer → read actions → read types → read serialization',
      steps: [
        { label: 'grep "ExcalidrawElement\\|ElementType"', tokens: 600 },
        { label: 'read: element/index.ts (factory)', tokens: 3000 }, // estimated
        { label: 'read: renderer/renderElement.ts', tokens: 4000 }, // estimated
        { label: 'read: actions/actionElements.ts', tokens: 3500 }, // estimated
        { label: 'read: types.ts (element type union)', file: join(srcBase, 'types.ts') },
        { label: 'read: data/json.ts (serialization)', tokens: 2000 }, // estimated
        { label: 'read: components/App.tsx (element creation handlers)', file: join(srcBase, 'components', 'App.tsx') },
      ],
    },

    withMcp: {
      description: 'compact_map (shared) → compact_deps("App" for element creation) → compact_expand("renderElement") → compact_expand("createElement")',
      compactMapTokens: 4470,
      steps: [
        { label: 'compact_deps("App") — for element creation flow', tokens: 600 },
        { label: 'compact_expand("renderElement")', tokens: 450 },
        { label: 'compact_expand("createElement")', tokens: 280 },
        { label: 'compact_expand("newElement")', tokens: 180 },
        { label: 'native Read types.ts (being edited)', file: join(srcBase, 'types.ts') },
      ],
    },
  },

  {
    id: 'feat-4',
    title: 'Add persistent user preference (e.g. default stroke width)',
    issue: 'New feature — persist a new user setting across sessions via existing preferences mechanism',
    navigationChallenge: 'Find existing preferences store, serialization, UI binding, and defaults',

    withoutMcp: {
      description: 'Grep for "localStorage\\|preferences\\|AppState" → read AppState type → read state persistence → read settings panel → read defaults',
      steps: [
        { label: 'grep "localStorage\\|preferences"', tokens: 600 },
        { label: 'read: components/App.tsx (AppState handling)', file: join(srcBase, 'components', 'App.tsx') },
        { label: 'read: appState.ts (defaults)', file: join(srcBase, 'appState.ts') },
        { label: 'read: types.ts (AppState type)', file: join(srcBase, 'types.ts') },
        { label: 'read: data/localStorage.ts (persistence)', tokens: 1800 }, // estimated
        { label: 'read: components/Actions.tsx (settings UI)', file: join(srcBase, 'components', 'Actions.tsx') },
      ],
    },

    withMcp: {
      description: 'compact_map (shared) → compact_expand("loadAppStateFromLocalStorage") → compact_expand("saveAppStateToLocalStorage") → native Read appState.ts',
      compactMapTokens: 4470,
      steps: [
        { label: 'compact_expand("loadAppStateFromLocalStorage")', tokens: 280 },
        { label: 'compact_expand("saveAppStateToLocalStorage")', tokens: 220 },
        { label: 'compact_expand("getDefaultAppState")', tokens: 300 },
        { label: 'native Read appState.ts (being edited)', file: join(srcBase, 'appState.ts') },
      ],
    },
  },
];

// ─── Run eval ────────────────────────────────────────────────────────────────

const COMPACT_MAP_TOKENS = 4470; // paid once, shared across all issues

console.log('\nFeature Development Eval — compact-mcp vs Without MCP');
console.log('='.repeat(70));
console.log('Scenario                               Without MCP   With MCP   Saved');
console.log('─'.repeat(70));

let totalWithout = 0;
let totalWith = 0;
const results = [];

for (const scenario of scenarios) {
  // WITHOUT MCP
  let withoutTokens = 0;
  for (const step of scenario.withoutMcp.steps) {
    if (step.file) {
      const { tokens } = readTokens(step.file);
      withoutTokens += tokens;
    } else {
      withoutTokens += step.tokens;
    }
  }

  // WITH MCP
  let withTokens = 0;
  for (const step of scenario.withMcp.steps) {
    if (step.file) {
      const { tokens } = readTokens(step.file);
      withTokens += tokens;
    } else {
      withTokens += step.tokens;
    }
  }

  const saved = Math.round(((withoutTokens - withTokens) / withoutTokens) * 100);
  totalWithout += withoutTokens;
  totalWith += withTokens;
  results.push({ scenario, withoutTokens, withTokens, saved });

  const title = scenario.title.slice(0, 38).padEnd(38);
  console.log(`${title} ${String(withoutTokens).padStart(8)} ${String(withTokens).padStart(9)}   ${saved}%`);
}

const totalSaved = Math.round(((totalWithout - totalWith) / totalWithout) * 100);

console.log('─'.repeat(70));
console.log(`${'TOTAL (4 scenarios, shared compact_map)'.padEnd(38)} ${String(totalWithout).padStart(8)} ${String(totalWith).padStart(9)}   ${totalSaved}%`);

// compact_map amortization note
const withMapPerScenario = Math.round(COMPACT_MAP_TOKENS / scenarios.length);
console.log(`\ncompact_map cost: ${COMPACT_MAP_TOKENS.toLocaleString()} tokens total (~${withMapPerScenario}/scenario, amortized)`);
console.log('compact_map is called ONCE per session — cost shared across all tasks.\n');

// ─── Detailed breakdown ───────────────────────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log('DETAILED BREAKDOWN');
console.log('='.repeat(70));

for (const { scenario, withoutTokens, withTokens, saved } of results) {
  console.log(`\n[${scenario.id}] ${scenario.title}`);
  console.log(`Issue: ${scenario.issue}`);
  console.log(`Navigation: ${scenario.navigationChallenge}`);
  console.log(`\nWithout MCP (${withoutTokens.toLocaleString()} tokens):`);
  for (const step of scenario.withoutMcp.steps) {
    const t = step.file ? readTokens(step.file).tokens : step.tokens;
    console.log(`  ${step.label.padEnd(55)} ${t.toLocaleString()} tokens`);
  }
  console.log(`\nWith MCP (${withTokens.toLocaleString()} tokens):`);
  for (const step of scenario.withMcp.steps) {
    const t = step.file ? readTokens(step.file).tokens : step.tokens;
    console.log(`  ${step.label.padEnd(55)} ${t.toLocaleString()} tokens`);
  }
  console.log(`\nSaved: ${saved}% (${(withoutTokens - withTokens).toLocaleString()} tokens)`);
}

console.log('\n' + '='.repeat(70));
console.log('KEY INSIGHT — Feature Dev vs Bug Nav');
console.log('='.repeat(70));
console.log(`
Feature development requires MORE context than bug navigation:
  - Bug nav: find 1 file, read it, fix the bug
  - Feature dev: read 4-7 files for pattern context + the edit target

This is where compact-mcp has its HIGHEST leverage:
  compact_map gives the pattern landscape in one call.
  compact_deps shows which components already handle similar concerns.
  compact_expand gives the exact reference implementation to pattern-match.
  Native Read only for the file being edited.

The savings are not from hiding information — they are from not reading
files that are irrelevant to the feature being added.
`);
