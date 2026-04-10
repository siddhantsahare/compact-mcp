import generate from '@babel/generator';
import { parse, countTokens } from './parser.js';
import { ALL_RULES } from './rules/index.js';
import { makeStripJsxAttributes } from './rules/stripJsxAttributes.js';
import type { CompressorOptions, CompressResult, RuleName, PruningRule, PreprocessorOptions } from './types.js';

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
  // V2 aggressive skeletonization rules (opt-in by default)
  stripJsxAttributes: true,
  skeletonizeJsx: false,
  collapseHelperBodies: true,
  // V3 enterprise bloat rules
  pruneUnusedImports: true,
  skeletonizeTypes: true,
};

export class ReactASTCompressor {
  readonly options: CompressorOptions;
  readonly processorOptions: PreprocessorOptions;
  private rules: Map<RuleName, PruningRule> = new Map();

  constructor(options: Partial<CompressorOptions> = {}, processorOptions: PreprocessorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.processorOptions = processorOptions;

    // Register all built-in rules
    for (const [name, rule] of ALL_RULES) {
      this.rules.set(name, rule);
    }

    // Apply processor options to rules that support fine-grained control
    this.rules.set('stripJsxAttributes', makeStripJsxAttributes(processorOptions));
  }

  /** Register a pruning rule implementation. */
  registerRule(name: RuleName, rule: PruningRule): void {
    this.rules.set(name, rule);
  }

  /** Compress React source code by applying all enabled pruning rules. */
  compress(code: string): CompressResult {
    const originalTokens = countTokens(code);

    try {
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

      const compressedTokens = countTokens(output.code);
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
    } catch {
      // Malformed input — return original unmodified rather than throwing
      return {
        compressed: code,
        originalTokens,
        compressedTokens: originalTokens,
        savingsPercent: 0,
      };
    }
  }

  /** Exact BPE token count. */
  countTokens(text: string): number {
    return countTokens(text);
  }
}
