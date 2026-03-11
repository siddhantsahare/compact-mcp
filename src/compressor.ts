import generate from '@babel/generator';
import { parse, estimateTokens } from './parser.js';
import { ALL_RULES } from './rules/index.js';
import type { CompressorOptions, CompressResult, RuleName, PruningRule } from './types.js';

/** Default options — all rules enabled. */
const DEFAULT_OPTIONS: CompressorOptions = {
  stripComments: true,
  stripConsoleLogs: true,
  summarizeHooks: true,
  summarizeHandlers: true,
  stripPropTypes: true,
  collapseStyles: true,
  stripTypeAnnotations: true,
  stripTestAttributes: true,
};

export class ReactASTCompressor {
  readonly options: CompressorOptions;
  private rules: Map<RuleName, PruningRule> = new Map();

  constructor(options: Partial<CompressorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Register all built-in rules
    for (const [name, rule] of ALL_RULES) {
      this.rules.set(name, rule);
    }
  }

  /** Register a pruning rule implementation. */
  registerRule(name: RuleName, rule: PruningRule): void {
    this.rules.set(name, rule);
  }

  /** Compress React source code by applying all enabled pruning rules. */
  compress(code: string): CompressResult {
    const ast = parse(code);

    for (const [name, rule] of this.rules) {
      if (this.options[name]) {
        rule(ast);
      }
    }

    const output = generate(ast, {
      comments: true,
      concise: true,
      retainLines: false,
    });

    const originalTokens = estimateTokens(code);
    const compressedTokens = estimateTokens(output.code);
    const savingsPercent =
      originalTokens > 0
        ? Math.round(((originalTokens - compressedTokens) / originalTokens) * 100)
        : 0;

    return {
      compressed: output.code,
      originalTokens,
      compressedTokens,
      savingsPercent,
    };
  }

  /** Rough token estimate (~4 chars per token). */
  estimateTokens(text: string): number {
    return estimateTokens(text);
  }
}
