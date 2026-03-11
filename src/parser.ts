import { parse as babelParse } from '@babel/parser';
import type { File } from '@babel/types';
import { BABEL_BASE_PLUGINS } from './types.js';

/**
 * Parse source code into a Babel AST.
 * Tries TypeScript plugins first, falls back to Flow if that fails.
 */
export function parse(code: string): File {
  try {
    return babelParse(code, {
      sourceType: 'module',
      plugins: [...BABEL_BASE_PLUGINS, 'typescript'],
      errorRecovery: true,
    });
  } catch {
    return babelParse(code, {
      sourceType: 'module',
      plugins: [...BABEL_BASE_PLUGINS, 'flow'],
      errorRecovery: true,
    });
  }
}

/**
 * Rough token estimate (~4 chars per token for code).
 * Consistent with GPT/Claude tokenizer heuristics — normalizes whitespace first.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const normalized = text.replace(/\s+/g, ' ').trim();
  return Math.ceil(normalized.length / 4);
}
