import type { ParserPlugin } from '@babel/parser';
import type { File } from '@babel/types';

// ─── Parser ─────────────────────────────────────────────────────

export const BABEL_BASE_PLUGINS: ParserPlugin[] = [
  'jsx',
  'classProperties',
  'optionalChaining',
  'nullishCoalescingOperator',
  'decorators-legacy',
  'exportDefaultFrom',
  'dynamicImport',
  'objectRestSpread',
];

// ─── Pruning Rules ──────────────────────────────────────────────

/** Names of the eight pruning rules the compressor supports. */
export type RuleName =
  | 'stripComments'
  | 'stripConsoleLogs'
  | 'summarizeHooks'
  | 'summarizeHandlers'
  | 'stripPropTypes'
  | 'collapseStyles'
  | 'stripTypeAnnotations'
  | 'stripTestAttributes';

/** A pruning rule is a function that mutates a Babel AST in place. */
export type PruningRule = (ast: File) => void;

/** Map of rule name → rule implementation. */
export type RuleRegistry = Record<RuleName, PruningRule>;

// ─── Compressor ─────────────────────────────────────────────────

/** Per-rule toggle options — all default to `true`. */
export type CompressorOptions = Record<RuleName, boolean>;

/** Result returned by `ReactASTCompressor.compress()`. */
export interface CompressResult {
  compressed: string;
  originalTokens: number;
  compressedTokens: number;
  savingsPercent: number;
}

// ─── CLI ────────────────────────────────────────────────────────

export interface CLIFlags {
  files: string[];
  /** Print compressed output to stdout instead of showing stats. */
  output: boolean;
  /** Disable specific rules by name. */
  disable: RuleName[];
}

// ─── Benchmark ──────────────────────────────────────────────────

export interface BenchmarkSource {
  repo: string;
  file: string;
  url: string;
}

export interface BenchmarkResult {
  repo: string;
  file: string;
  lines: number;
  originalTokens: number;
  compressedTokens: number;
  savingsPercent: number;
  timeMs: string;
  status: string;
}
