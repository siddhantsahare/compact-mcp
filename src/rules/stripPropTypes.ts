import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';

/**
 * Rule 5: Strip PropTypes and defaultProps declarations + the prop-types import.
 */
export function stripPropTypes(ast: File): void {
  traverse(ast, {
    ExpressionStatement(path) {
      if (
        t.isAssignmentExpression(path.node.expression) &&
        t.isMemberExpression(path.node.expression.left) &&
        t.isIdentifier(path.node.expression.left.property) &&
        (path.node.expression.left.property.name === 'propTypes' ||
          path.node.expression.left.property.name === 'defaultProps')
      ) {
        path.remove();
      }
    },
    ImportDeclaration(path) {
      if (path.node.source.value === 'prop-types') {
        path.remove();
      }
    },
  });
}
