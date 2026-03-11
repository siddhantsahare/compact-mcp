import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';
import { extractBodySummary } from './helpers.js';

const HANDLER_PATTERN = /^(handle|on)[A-Z]/;

/**
 * Rule 4: Summarize event handler functions (handle*, on*).
 * Keeps the function signature but replaces bodies longer than 2 statements.
 */
export function summarizeHandlers(ast: File): void {
  traverse(ast, {
    VariableDeclarator(path) {
      if (
        t.isIdentifier(path.node.id) &&
        HANDLER_PATTERN.test(path.node.id.name) &&
        (t.isArrowFunctionExpression(path.node.init) ||
          t.isFunctionExpression(path.node.init))
      ) {
        const fn = path.node.init;
        if (t.isBlockStatement(fn.body) && fn.body.body.length > 2) {
          fn.body = createSummarizedBlock(fn.body);
        }
      }
    },
    FunctionDeclaration(path) {
      if (
        t.isIdentifier(path.node.id) &&
        HANDLER_PATTERN.test(path.node.id.name) &&
        path.node.body.body.length > 2
      ) {
        path.node.body = createSummarizedBlock(path.node.body);
      }
    },
    ClassMethod(path) {
      if (
        t.isIdentifier(path.node.key) &&
        HANDLER_PATTERN.test(path.node.key.name) &&
        path.node.body.body.length > 2
      ) {
        path.node.body = createSummarizedBlock(path.node.body);
      }
    },
  });
}

function createSummarizedBlock(body: t.BlockStatement): t.BlockStatement {
  const summary = extractBodySummary(body);
  const emptyBlock = t.blockStatement([]);
  emptyBlock.leadingComments = [
    { type: 'CommentBlock', value: ` ${summary} ` } as t.Comment,
  ];
  return emptyBlock;
}
