import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { parse, countTokens } from '../../parser.js';
import { isJsFile } from '../walker.js';

export interface ExpandMetrics {
  functionTokens: number;  // tokens in the extracted function
  fileTokens: number;      // tokens if Claude had Read the whole file
  savedTokens: number;
  savedPercent: number;
}

/**
 * compact_expand — Drill-down tool
 *
 * Given a file path and function/component name, returns the raw uncompressed
 * source of that specific symbol. Used after compact_map or compact_read gives
 * Claude a skeleton and Claude needs the implementation detail of one function.
 *
 * DO NOT edit based on compact_read output — always expand first, then edit.
 */
export function compactExpand(filePath: string, functionName: string, rootDir: string): { text: string; metrics: ExpandMetrics | null } {
  const absPath = resolve(rootDir, filePath);

  // Non-JS file fallback
  if (!isJsFile(filePath)) {
    return { text: `[non-js] ${filePath} is not a JavaScript/TypeScript file. Use Claude's native Read tool for this file type.`, metrics: null };
  }

  // Read file
  let source: string;
  try {
    source = readFileSync(absPath, 'utf-8');
  } catch {
    return { text: `[error] File not found: ${filePath}`, metrics: null };
  }

  // Parse
  let ast;
  try {
    ast = parse(source);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: `[parse-error] Could not parse ${filePath}: ${msg}. Use Claude's native Read tool.`, metrics: null };
  }

  // Search for the named symbol
  let extractedCode = '';
  const availableSymbols: string[] = [];

  traverse(ast, {
    // function Foo() {} / async function Foo() {}
    FunctionDeclaration(path) {
      const name = path.node.id?.name ?? '';
      if (name) availableSymbols.push(name);
      if (name === functionName) {
        const { start, end } = path.node;
        if (start != null && end != null) {
          extractedCode = source.slice(start, end);
        }
        path.stop();
      }
    },

    // const Foo = () => {} / const Foo = function() {}
    VariableDeclarator(path) {
      const id = path.node.id;
      if (!t.isIdentifier(id)) return;
      availableSymbols.push(id.name);
      if (id.name === functionName) {
        const parent = path.parent;
        const { start, end } = parent;
        if (start != null && end != null) {
          extractedCode = source.slice(start, end);
        }
        path.stop();
      }
    },

    // export default function Foo() {} / export default function() {}
    ExportDefaultDeclaration(path) {
      const decl = path.node.declaration;
      if (
        t.isFunctionDeclaration(decl) &&
        (decl.id?.name === functionName || functionName === 'default')
      ) {
        const { start, end } = path.node;
        if (start != null && end != null) {
          extractedCode = source.slice(start, end);
        }
        path.stop();
      }
    },

    // class Foo { bar() {} } — class method
    ClassMethod(path) {
      const key = path.node.key;
      const name = t.isIdentifier(key) ? key.name : '';
      if (name) availableSymbols.push(name);
      if (name === functionName) {
        const { start, end } = path.node;
        if (start != null && end != null) {
          extractedCode = source.slice(start, end);
        }
        path.stop();
      }
    },

    // { foo() {} } — object method
    ObjectMethod(path) {
      const key = path.node.key;
      const name = t.isIdentifier(key) ? key.name : '';
      if (name) availableSymbols.push(name);
      if (name === functionName) {
        const { start, end } = path.node;
        if (start != null && end != null) {
          extractedCode = source.slice(start, end);
        }
        path.stop();
      }
    },
  });

  if (!extractedCode) {
    const symbols = [...new Set(availableSymbols)].sort().join(', ') || 'none found';
    return {
      text: (
        `[not-found] No function or component named "${functionName}" in ${filePath}.\n` +
        `Available top-level symbols: ${symbols}\n` +
        `Tip: If this is a nested function, expand the parent component instead.`
      ),
      metrics: null,
    };
  }

  const fileTokens = countTokens(source);
  const functionTokens = countTokens(extractedCode);
  const savedTokens = Math.max(0, fileTokens - functionTokens);
  const savedPercent = fileTokens > 0 ? Math.round((savedTokens / fileTokens) * 100) : 0;

  return {
    text: `── UNCOMPRESSED SOURCE: ${functionName} (from ${filePath}) ──\n${extractedCode}`,
    metrics: { functionTokens, fileTokens, savedTokens, savedPercent },
  };
}
