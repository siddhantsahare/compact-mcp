#!/usr/bin/env node
/**
 * Compact MCP — Repo Benchmark
 *
 * Usage:
 *   node scripts/benchmark-mcp.mjs <path-to-react-repo> [subdir]
 *
 * Examples:
 *   node scripts/benchmark-mcp.mjs ~/excalidraw packages/excalidraw/src
 *   node scripts/benchmark-mcp.mjs ~/lobe-chat src
 *   node scripts/benchmark-mcp.mjs ~/cal.com apps/web/src
 *
 * What it measures:
 *   - Total raw tokens if Claude read every file with native Read
 *   - compact_map skeleton tokens (what Claude actually gets)
 *   - Token savings % and absolute
 *   - Largest components by token count (prime compact_expand targets)
 *   - Time taken
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, extname, relative } from 'node:path';
import { glob } from 'glob';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { compactMap } = require('../dist/mcp/tools/compact-map.js');
const { countTokens } = require('../dist/parser.js');

// ─── Args ────────────────────────────────────────────────────────────────────

const [,, repoPath, subDir] = process.argv;

if (!repoPath) {
  console.error('Usage: node scripts/benchmark-mcp.mjs <repo-path> [subdir]');
  console.error('Example: node scripts/benchmark-mcp.mjs ~/excalidraw packages/excalidraw/src');
  process.exit(1);
}

const absRepo = resolve(repoPath);
const scanDir = subDir ? join(absRepo, subDir) : absRepo;

if (!existsSync(scanDir)) {
  console.error(`Directory not found: ${scanDir}`);
  process.exit(1);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log(`\n🔍 Compact MCP Benchmark`);
console.log(`   Repo:    ${absRepo}`);
console.log(`   Scan:    ${scanDir}`);
console.log(`   Running...\n`);

const startMs = Date.now();

// 1. compact_map pass
const { text: skeleton, metrics } = await compactMap(scanDir);
const elapsedMs = Date.now() - startMs;

// 2. Per-file breakdown — find the largest files
const JS_EXTS = new Set(['.tsx', '.jsx', '.ts', '.js']);
const EXCLUDE = ['node_modules', 'dist', 'build', '.next', 'coverage', '.git'];

const allFiles = await glob('**/*.{tsx,jsx,ts,js}', {
  cwd: scanDir,
  ignore: EXCLUDE.map(d => `**/${d}/**`),
  absolute: true,
  nodir: true,
});

const fileSizes = allFiles
  .filter(f => JS_EXTS.has(extname(f)))
  .map(f => {
    try {
      const src = readFileSync(f, 'utf-8');
      return { path: relative(scanDir, f), tokens: countTokens(src) };
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .sort((a, b) => b.tokens - a.tokens);

// 3. Top 10 biggest files = best compact_expand targets
const top10 = fileSizes.slice(0, 10);

// ─── Report ──────────────────────────────────────────────────────────────────

console.log(`${'─'.repeat(60)}`);
console.log(`📊 TOKEN SAVINGS REPORT`);
console.log(`${'─'.repeat(60)}`);
console.log(`Files scanned:        ${metrics.filesScanned.toLocaleString()} (of ${allFiles.length.toLocaleString()} total JS/TS files)`);
console.log(`Raw tokens (Read all): ${metrics.rawTokens.toLocaleString()}`);
console.log(`Skeleton tokens:       ${metrics.skeletonTokens.toLocaleString()}`);
console.log(`Tokens saved:          ${metrics.savedTokens.toLocaleString()} (${metrics.savedPercent}%)`);
console.log(`Time elapsed:          ${elapsedMs}ms`);
console.log('');

// Claude Code rate limit context
const OPUS_LIMIT_PER_5MIN = 20000; // approximate Opus limit
const conversationsEnabled = Math.floor(metrics.savedTokens / 5000);
console.log(`📈 RATE LIMIT IMPACT`);
console.log(`At ~5,000 tokens saved per conversation:`);
console.log(`  → ${conversationsEnabled} additional conversations per day unlocked`);
console.log(`  → One compact_map call replaces ~${Math.round(metrics.rawTokens / Math.max(metrics.rawTokens / metrics.filesScanned, 1))} Read calls`);
console.log('');

// Top files
console.log(`🔍 TOP 10 LARGEST FILES (best compact_expand targets)`);
console.log(`${'─'.repeat(60)}`);
for (const { path, tokens } of top10) {
  const bar = '█'.repeat(Math.min(30, Math.round(tokens / 100)));
  console.log(`  ${tokens.toString().padStart(5)} tokens  ${bar}  ${path}`);
}
console.log('');

// Skeleton preview
console.log(`📋 SKELETON PREVIEW (first 2000 chars)`);
console.log(`${'─'.repeat(60)}`);
console.log(skeleton.slice(0, 2000));
if (skeleton.length > 2000) console.log(`... [${skeleton.length - 2000} more chars]`);
console.log('');

// Benchmark verdict
console.log(`${'─'.repeat(60)}`);
if (metrics.savedPercent >= 80) {
  console.log(`✅ VERDICT: Excellent — ${metrics.savedPercent}% savings. Strong demo candidate.`);
} else if (metrics.savedPercent >= 60) {
  console.log(`✅ VERDICT: Good — ${metrics.savedPercent}% savings. Worth highlighting.`);
} else {
  console.log(`⚠️  VERDICT: Moderate — ${metrics.savedPercent}% savings. May be a utility-heavy codebase.`);
}
console.log(`${'─'.repeat(60)}\n`);
