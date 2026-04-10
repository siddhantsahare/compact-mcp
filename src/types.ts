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

/** Names of all pruning rules the compressor supports. */
export type RuleName =
  | 'stripComments'
  | 'stripConsoleLogs'
  | 'summarizeHooks'
  | 'summarizeHandlers'
  | 'stripPropTypes'
  | 'collapseStyles'
  | 'stripTypeAnnotations'
  | 'stripTestAttributes'
  // V2 aggressive skeletonization rules
  | 'stripJsxAttributes'
  | 'skeletonizeJsx'
  | 'collapseHelperBodies'
  // V3 enterprise bloat rules
  | 'pruneUnusedImports'
  | 'skeletonizeTypes';

/** A pruning rule is a function that mutates a Babel AST in place. */
export type PruningRule = (ast: File) => void;

/** Map of rule name → rule implementation. */
export type RuleRegistry = Record<RuleName, PruningRule>;

// ─── Compressor ─────────────────────────────────────────────────

/** Per-rule toggle options — all default to `true`. */
export type CompressorOptions = Record<RuleName, boolean>;

/**
 * Fine-grained content-preservation flags, independent of which rules are
 * enabled.  Pass these when the task demands structural fidelity over
 * maximum compression (e.g., "byte-for-byte identical JSX" prompts).
 */
export interface PreprocessorOptions {
  /** Keep className and style={} attributes (default: strip them). */
  preserveStyles?: boolean;
  /** Keep data-testid / data-* attributes (default: strip them). */
  preserveTestIds?: boolean;
}

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

// ─── LM Tool Arguments ─────────────────────────────────────────

/** Arguments for the `compact_search_workspace` tool. */
export interface SearchWorkspaceArgs {
  keyword: string;
}

/** Arguments for the `compact_read_and_compress` tool. */
export interface ReadAndCompressArgs {
  filePath: string;
}

/** Arguments for the `compact_read_exact_function` tool. */
export interface ReadExactFunctionArgs {
  filePath: string;
  functionName: string;
}

/** Arguments for the `compact_replace_function` tool. */
export interface ReplaceFunctionArgs {
  filePath: string;
  functionName: string;
  newCode: string;
}

/** Arguments for the `compact_apply_edit` tool. */
export interface ApplyEditArgs {
  filePath: string;
  searchString: string;
  replaceString: string;
}

/** Arguments for the `compact_create_file` tool. */
export interface CreateFileArgs {
  filePath: string;
  content: string;
}

// ─── Session Cache ──────────────────────────────────────────────

/** Per-file token metrics stored during compression. */
export interface FileTokenMetrics {
  originalTokens: number;
  compressedTokens: number;
}

/**
 * Per-request cache that tracks which files have already been compressed
 * during the current chat turn. Prevents redundant AST processing when
 * the LLM requests the same file more than once.
 *
 * Also stores per-file token metrics so downstream tools (e.g. compact_replace_function)
 * can calculate total workflow savings without re-compressing.
 */
export class CompressedFileCache {
  private readonly seen = new Set<string>();
  private readonly metrics = new Map<string, FileTokenMetrics>();

  has(filePath: string): boolean {
    return this.seen.has(filePath);
  }

  add(filePath: string): void {
    this.seen.add(filePath);
  }

  /** Store token metrics for a file after compression. */
  setMetrics(filePath: string, metrics: FileTokenMetrics): void {
    this.metrics.set(filePath, metrics);
  }

  /** Retrieve token metrics for a previously compressed file. */
  getMetrics(filePath: string): FileTokenMetrics | undefined {
    return this.metrics.get(filePath);
  }
}
