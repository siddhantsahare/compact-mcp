import traverse from '@babel/traverse';
import type { File } from '@babel/types';

/**
 * Rule 7: Strip TypeScript inline type annotations.
 *
 * Removes: variable/parameter/return type annotations, `as` casts, `!` non-null
 * assertions, and generic type parameter lists from call sites and declarations.
 *
 * Does NOT remove TSInterfaceDeclaration or TSTypeAliasDeclaration — those are
 * handled by skeletonizeTypes (rule 12), which collapses large interfaces into
 * compact property-name summaries instead of deleting them entirely.
 * Having both rules delete declarations meant skeletonizeTypes was dead code.
 */
export function stripTypeAnnotations(ast: File): void {
  traverse(ast, {
    TSTypeAnnotation(path) {
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
