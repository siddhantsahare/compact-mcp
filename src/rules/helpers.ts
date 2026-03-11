import * as t from '@babel/types';

/**
 * Extract a concise summary of a block statement's contents.
 * Used by summarizeHooks and summarizeHandlers to generate comment labels.
 */
export function extractBodySummary(blockStatement: t.BlockStatement): string {
  const patterns: string[] = [];

  for (const stmt of blockStatement.body) {
    if (t.isExpressionStatement(stmt)) {
      if (t.isCallExpression(stmt.expression)) {
        const callee = stmt.expression.callee;
        if (t.isIdentifier(callee)) {
          patterns.push(callee.name + '()');
        } else if (
          t.isMemberExpression(callee) &&
          t.isIdentifier(callee.object) &&
          t.isIdentifier(callee.property)
        ) {
          if (callee.object.name !== 'console') {
            patterns.push(`${callee.object.name}.${callee.property.name}()`);
          }
        }
      } else if (t.isAssignmentExpression(stmt.expression)) {
        const left = stmt.expression.left;
        if (t.isIdentifier(left)) {
          patterns.push(`set ${left.name}`);
        } else if (t.isMemberExpression(left) && t.isIdentifier(left.property)) {
          patterns.push(`set ${left.property.name}`);
        }
      }
    } else if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (t.isIdentifier(decl.id)) {
          patterns.push(`let ${decl.id.name}`);
        }
      }
    } else if (t.isIfStatement(stmt)) {
      patterns.push('conditional');
    } else if (t.isReturnStatement(stmt)) {
      patterns.push('return');
    } else if (t.isTryStatement(stmt)) {
      patterns.push('try/catch');
    } else if (
      t.isForStatement(stmt) ||
      t.isForOfStatement(stmt) ||
      t.isForInStatement(stmt)
    ) {
      patterns.push('loop');
    } else if (t.isSwitchStatement(stmt)) {
      patterns.push('switch');
    } else if (t.isThrowStatement(stmt)) {
      patterns.push('throw');
    }
  }

  return patterns.length > 0 ? patterns.join(', ') : 'logic';
}
