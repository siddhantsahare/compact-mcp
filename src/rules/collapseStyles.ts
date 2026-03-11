import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';

/**
 * Rule 6: Collapse style objects and StyleSheet.create() into key summaries.
 */
export function collapseStyles(ast: File): void {
  traverse(ast, {
    VariableDeclarator(path) {
      if (
        t.isIdentifier(path.node.id) &&
        /[Ss]tyles?$/.test(path.node.id.name) &&
        t.isObjectExpression(path.node.init)
      ) {
        const keys = extractObjectKeys(path.node.init);
        if (keys.length > 0) {
          path.node.init = createCommentedEmptyObject(`styles: ${keys.join(', ')}`);
        }
      }
    },
    CallExpression(path) {
      if (
        t.isMemberExpression(path.node.callee) &&
        t.isIdentifier(path.node.callee.object, { name: 'StyleSheet' }) &&
        t.isIdentifier(path.node.callee.property, { name: 'create' }) &&
        path.node.arguments.length > 0 &&
        t.isObjectExpression(path.node.arguments[0])
      ) {
        const keys = extractObjectKeys(path.node.arguments[0]);
        if (keys.length > 0) {
          path.node.arguments[0] = createCommentedEmptyObject(`styles: ${keys.join(', ')}`);
        }
      }
    },
  });
}

function extractObjectKeys(obj: t.ObjectExpression): string[] {
  return obj.properties
    .filter((p): p is t.ObjectProperty => t.isObjectProperty(p) && t.isIdentifier(p.key))
    .map((p) => (p.key as t.Identifier).name);
}

function createCommentedEmptyObject(comment: string): t.ObjectExpression {
  const emptyObj = t.objectExpression([]);
  emptyObj.leadingComments = [
    { type: 'CommentBlock', value: ` ${comment} ` } as t.Comment,
  ];
  return emptyObj;
}
