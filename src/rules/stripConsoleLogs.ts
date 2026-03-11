import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';

/** Rule 2: Remove all console.* expression statements. */
export function stripConsoleLogs(ast: File): void {
  traverse(ast, {
    ExpressionStatement(path) {
      const expr = path.node.expression;
      if (
        t.isCallExpression(expr) &&
        t.isMemberExpression(expr.callee) &&
        t.isIdentifier(expr.callee.object, { name: 'console' })
      ) {
        path.remove();
      }
    },
  });
}
