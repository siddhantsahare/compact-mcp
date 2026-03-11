import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';
import { extractBodySummary } from './helpers.js';

const HOOK_NAMES = new Set([
  'useEffect',
  'useCallback',
  'useMemo',
  'useLayoutEffect',
  'useImperativeHandle',
]);

/**
 * Rule 3: Summarize React hook bodies.
 * Keeps the dependency array intact but replaces the callback body
 * with a descriptive comment.
 */
export function summarizeHooks(ast: File): void {
  traverse(ast, {
    CallExpression(path) {
      if (
        t.isIdentifier(path.node.callee) &&
        HOOK_NAMES.has(path.node.callee.name)
      ) {
        const hookName = path.node.callee.name;
        const args = path.node.arguments;

        if (
          args.length > 0 &&
          (t.isArrowFunctionExpression(args[0]) ||
            t.isFunctionExpression(args[0]))
        ) {
          const callback = args[0] as t.ArrowFunctionExpression | t.FunctionExpression;
          const body = callback.body;

          if (t.isBlockStatement(body)) {
            const summary = extractBodySummary(body);
            const hasCleanup = body.body.some((s) => t.isReturnStatement(s));

            const commentText = hasCleanup
              ? ` ${hookName}: ${summary} +cleanup `
              : ` ${hookName}: ${summary} `;

            const emptyBlock = t.blockStatement([]);
            emptyBlock.leadingComments = [
              { type: 'CommentBlock', value: commentText } as t.Comment,
            ];
            callback.body = emptyBlock;
          }
        }
      }
    },
  });
}
