import traverse from '@babel/traverse';
import type { File } from '@babel/types';

/** Rule 1: Strip all comments from the AST. */
export function stripComments(ast: File): void {
  traverse(ast, {
    enter(path) {
      if (path.node.leadingComments) path.node.leadingComments = [];
      if (path.node.trailingComments) path.node.trailingComments = [];
      if (path.node.innerComments) path.node.innerComments = [];
    },
  });
}
