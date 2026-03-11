import traverse from '@babel/traverse';
import type { File } from '@babel/types';

/**
 * Rule 7: Strip TypeScript type annotations, interfaces, and type aliases.
 * These are compilation-only constructs; LLMs don't need them for reasoning.
 */
export function stripTypeAnnotations(ast: File): void {
  traverse(ast, {
    TSTypeAnnotation(path) {
      path.remove();
    },
    TSTypeAliasDeclaration(path) {
      path.remove();
    },
    TSInterfaceDeclaration(path) {
      path.remove();
    },
    TSAsExpression(path) {
      path.replaceWith(path.node.expression);
    },
    TSNonNullExpression(path) {
      path.replaceWith(path.node.expression);
    },
    TSTypeParameterInstantiation(path) {
      path.remove();
    },
    TSTypeParameterDeclaration(path) {
      path.remove();
    },
  });
}
