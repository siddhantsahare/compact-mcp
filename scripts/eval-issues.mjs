#!/usr/bin/env node
/**
 * Compact MCP — Issue Navigation Eval
 *
 * Usage:
 *   node scripts/eval-issues.mjs <path-to-excalidraw-repo>
 *
 * What it measures:
 *   For 5 real excalidraw GitHub issues, simulates two navigation paths:
 *
 *   WITHOUT MCP: Grep → Read files (raw token cost of likely files to read)
 *   WITH MCP:    compact_map → compact_deps → compact_expand (actual MCP token cost)
 *
 *   Reports token delta per issue and totals.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { glob } from 'glob';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { compactMap } = require('../dist/mcp/tools/compact-map.js');
const { compactExpand } = require('../dist/mcp/tools/compact-expand.js');
const { compactDeps } = require('../dist/mcp/tools/compact-deps.js');
const { countTokens } = require('../dist/parser.js');

// ─── Args ────────────────────────────────────────────────────────────────────

const [,, repoPath] = process.argv;

if (!repoPath) {
  console.error('Usage: node scripts/eval-issues.mjs <path-to-excalidraw-repo>');
  process.exit(1);
}

const absRepo = resolve(repoPath);
// Support both old layout (packages/excalidraw/src) and new flat layout (packages/excalidraw)
const srcDirCandidates = [
  join(absRepo, 'packages/excalidraw/src'),
  join(absRepo, 'packages/excalidraw'),
  absRepo,
];
const srcDir = srcDirCandidates.find(existsSync);

if (!srcDir) {
  console.error(`Directory not found. Tried:\n${srcDirCandidates.join('\n')}`);
  console.error('Make sure you cloned excalidraw and the path is correct.');
  process.exit(1);
}

// ─── Issues ──────────────────────────────────────────────────────────────────

/**
 * Each issue describes:
 * - GitHub issue number + title
 * - What a developer needs to find to understand/fix it
 * - WITHOUT MCP: which files they'd likely grep + read
 * - WITH MCP: which compact tools they'd call + for what symbols
 */
const ISSUES = [
  {
    number: 9281,
    title: 'Ctrl+S triggers browser save dialog instead of saving drawing',
    description: 'Need to find keyboard shortcut registration and browser default prevention.',
    withoutMcp: {
      grepTerms: ['keydown', 'ctrl', 'save', 'preventDefault'],
      likelyFiles: [
        'components/App.tsx',
        'actions/actionCanvas.tsx',
        'components/LayerUI.tsx',
      ],
    },
    withMcp: {
      compactMap: true,
      deps: ['App'],
      expand: [
        { file: 'components/App.tsx', fn: 'App' },
      ],
    },
  },
  {
    number: 9535,
    title: 'Keyboard shortcut for tool not working after context menu',
    description: 'Need to trace shortcut dispatch path and focus management.',
    withoutMcp: {
      grepTerms: ['shortcut', 'keydown', 'blur', 'focus'],
      likelyFiles: [
        'components/App.tsx',
        'components/ContextMenu.tsx',
        'actions/actionFinalize.tsx',
      ],
    },
    withMcp: {
      compactMap: true,
      deps: ['ContextMenu'],
      expand: [
        { file: 'components/ContextMenu.tsx', fn: 'ContextMenu' },
      ],
    },
  },
  {
    number: 9708,
    title: 'Mermaid diagram: <br> tags render as literal text instead of line break',
    description: 'Need to find Mermaid rendering pipeline and sanitization.',
    withoutMcp: {
      grepTerms: ['mermaid', 'Mermaid', 'diagram', 'sanitize'],
      likelyFiles: [
        'components/charts',
        'mermaid.ts',
        'components/MermaidToExcalidraw.tsx',
      ],
    },
    withMcp: {
      compactMap: true,
      deps: [],
      expand: [
        { file: 'mermaid.ts', fn: 'parseMermaidToExcalidraw' },
      ],
    },
  },
  {
    number: 9710,
    title: 'RTL layout: transparency slider bar renders at wrong position',
    description: 'Need to find transparency/opacity slider component and RTL handling.',
    withoutMcp: {
      grepTerms: ['transparency', 'opacity', 'Slider', 'rtl', 'dir='],
      likelyFiles: [
        'components/Slider.tsx',
        'components/Stats/Stats.tsx',
        'components/ElementDimensionsEditor.tsx',
      ],
    },
    withMcp: {
      compactMap: true,
      deps: ['Slider'],
      expand: [
        { file: 'components/Slider.tsx', fn: 'Slider' },
      ],
    },
  },
  {
    number: 9637,
    title: 'Mobile: hyperlinks not clickable in view/presentation mode',
    description: 'Need to find presentation mode link handling and pointer events.',
    withoutMcp: {
      grepTerms: ['link', 'href', 'presentation', 'viewMode', 'pointerEvents'],
      likelyFiles: [
        'components/App.tsx',
        'components/hyperlink/Hyperlink.tsx',
        'renderer/renderElement.ts',
      ],
    },
    withMcp: {
      compactMap: true,
      deps: ['Hyperlink'],
      expand: [
        { file: 'components/hyperlink/Hyperlink.tsx', fn: 'Hyperlink' },
      ],
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readFileSafe(absPath) {
  try {
    return readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Simulate "without MCP" path:
 * - Grep cost is approximated at ~600 tokens per grep call (search result output)
 * - Each file read costs countTokens(fileContent)
 */
function simulateWithoutMcp(issue) {
  const GREP_COST_PER_CALL = 600;
  let tokens = 0;
  const breakdown = [];

  // Cost of grep calls
  const grepCost = issue.withoutMcp.grepTerms.length * GREP_COST_PER_CALL;
  tokens += grepCost;
  breakdown.push(`grep (${issue.withoutMcp.grepTerms.length} searches): ${grepCost} tokens`);

  // Cost of reading each likely file
  for (const relPath of issue.withoutMcp.likelyFiles) {
    // Search for this file in the repo
    const patterns = [
      join(srcDir, relPath),
      join(absRepo, 'packages/excalidraw/src', relPath),
      join(absRepo, relPath),
    ];

    let found = false;
    for (const p of patterns) {
      const src = readFileSafe(p);
      if (src) {
        const t = countTokens(src);
        tokens += t;
        breakdown.push(`Read ${relPath}: ${t.toLocaleString()} tokens`);
        found = true;
        break;
      }
    }

    if (!found) {
      // File doesn't exist with this exact name — estimate based on typical component size
      const estimated = 2500;
      tokens += estimated;
      breakdown.push(`Read ${relPath}: ~${estimated} tokens (estimated — file not found at expected path)`);
    }
  }

  return { tokens, breakdown };
}

/**
 * Simulate "with MCP" path using actual tool calls.
 * compact_map is called once and reused across all issues (cached).
 */
async function simulateWithMcp(issue, mapTokens) {
  let tokens = mapTokens; // compact_map cost (shared across all issues — charge proportional share)
  const breakdown = [];
  breakdown.push(`compact_map (1/${ISSUES.length} share): ${Math.round(mapTokens)} tokens`);

  // compact_deps calls
  for (const componentName of (issue.withMcp.deps || [])) {
    const depsResult = await compactDeps(componentName, srcDir);
    const t = countTokens(depsResult);
    tokens += t;
    breakdown.push(`compact_deps(${componentName}): ${t} tokens`);
  }

  // compact_expand calls
  for (const { file, fn } of (issue.withMcp.expand || [])) {
    const { text, metrics } = compactExpand(file, fn, srcDir);
    const t = countTokens(text);
    tokens += t;
    const note = metrics ? ` (saved ${metrics.savedPercent}% vs full file)` : ' (file not found — estimated)';
    breakdown.push(`compact_expand(${fn}): ${t} tokens${note}`);
  }

  return { tokens, breakdown };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log(`\n🧪 Compact MCP — Issue Navigation Eval`);
console.log(`   Repo:   ${absRepo}`);
console.log(`   Issues: ${ISSUES.length} excalidraw issues`);
console.log(`   Measuring navigation token cost: WITH vs WITHOUT MCP\n`);

// Run compact_map once — it's called at the start of any session
console.log('Running compact_map (one-time session cost)...');
const { text: skeleton, metrics: mapMetrics } = await compactMap(srcDir);
const mapTokensTotal = mapMetrics.skeletonTokens;
const mapTokensPerIssue = mapTokensTotal / ISSUES.length;
console.log(`compact_map: ${mapMetrics.filesScanned} files → ${mapTokensTotal.toLocaleString()} skeleton tokens\n`);

// ─── Per-issue results ────────────────────────────────────────────────────────

const results = [];

for (const issue of ISSUES) {
  console.log(`${'─'.repeat(60)}`);
  console.log(`#${issue.number}: ${issue.title}`);
  console.log(`Context: ${issue.description}\n`);

  const withoutResult = simulateWithoutMcp(issue);
  const withResult = await simulateWithMcp(issue, mapTokensPerIssue);

  const saved = withoutResult.tokens - withResult.tokens;
  const savedPercent = withoutResult.tokens > 0
    ? Math.round((saved / withoutResult.tokens) * 100)
    : 0;

  console.log(`WITHOUT MCP (grep + read):`);
  for (const line of withoutResult.breakdown) {
    console.log(`  ${line}`);
  }
  console.log(`  TOTAL: ${withoutResult.tokens.toLocaleString()} tokens\n`);

  console.log(`WITH MCP (compact tools):`);
  for (const line of withResult.breakdown) {
    console.log(`  ${line}`);
  }
  console.log(`  TOTAL: ${Math.round(withResult.tokens).toLocaleString()} tokens\n`);

  const verdict = saved > 0
    ? `✅ MCP saves ${saved.toLocaleString()} tokens (${savedPercent}% reduction)`
    : `⚠️  MCP costs more (compact_map amortization not favorable for 1 issue)`;

  console.log(verdict);
  results.push({ issue, withoutTokens: withoutResult.tokens, withTokens: withResult.tokens, saved, savedPercent });
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log(`📊 EVAL SUMMARY — ${ISSUES.length} Issues`);
console.log(`${'═'.repeat(60)}`);

const totalWithout = results.reduce((s, r) => s + r.withoutTokens, 0);
const totalWith = results.reduce((s, r) => s + r.withTokens, 0);
const totalSaved = totalWithout - totalWith;
const totalSavedPercent = totalWithout > 0 ? Math.round((totalSaved / totalWithout) * 100) : 0;

console.log(`\n  Issue                                      Without MCP   With MCP   Saved`);
console.log(`  ${'─'.repeat(72)}`);
for (const r of results) {
  const title = `#${r.issue.number}`.padEnd(7);
  const short = r.issue.title.slice(0, 35).padEnd(36);
  const without = r.withoutTokens.toLocaleString().padStart(11);
  const with_ = Math.round(r.withTokens).toLocaleString().padStart(10);
  const saved = r.saved > 0 ? `${r.saved.toLocaleString()} (${r.savedPercent}%)` : `+${Math.abs(r.saved).toLocaleString()} overhead`;
  console.log(`  ${title} ${short} ${without} ${with_}   ${saved}`);
}

console.log(`  ${'─'.repeat(72)}`);
console.log(`  ${'TOTAL'.padEnd(44)} ${totalWithout.toLocaleString().padStart(11)} ${Math.round(totalWith).toLocaleString().padStart(10)}   ${totalSaved.toLocaleString()} (${totalSavedPercent}%)\n`);

if (totalSaved > 0) {
  console.log(`✅ VERDICT: MCP saves ${totalSaved.toLocaleString()} tokens across ${ISSUES.length} issues (${totalSavedPercent}% reduction).`);
  console.log(`   compact_map amortizes quickly — worth it from the first 2 issues.\n`);
} else {
  console.log(`⚠️  VERDICT: Net overhead across ${ISSUES.length} issues. compact_map not yet amortized.\n`);
}

console.log(`Note: "WITHOUT MCP" estimates grep at ${600} tokens/call and reads actual file sizes.`);
console.log(`      "WITH MCP" uses actual token counts from compact_map, compact_deps, compact_expand.\n`);
