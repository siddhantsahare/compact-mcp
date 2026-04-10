import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';

/**
 * Rule: Collapse large TypeScript interfaces and type aliases into a compact
 * single-line summary when they are purely structural boilerplate.
 *
 * Strategy:
 *   - Keep interfaces with ≤ KEEP_THRESHOLD properties intact (they're already small).
 *   - For larger interfaces/types, retain the declaration but replace the body
 *     with a comment listing property names: `{ /* id, name, email, ... * / }`.
 *   - Type aliases that are unions of string literals (e.g. `type Status = 'a' | 'b'`)
 *     are always kept — they carry meaning in a few tokens.
 *   - Generic constraints on type parameters are kept.
 *   - JSDoc comments on the interface are stripped (already done by stripComments,
 *     but this rule doesn't need to repeat that).
 *
 * This is specifically aimed at eliminating 40-60 line PropTypes-style interfaces
 * from MUI / Ant Design components that bloat input context significantly.
 */

const KEEP_THRESHOLD = 4; // interfaces with ≤ 4 props are kept verbatim

export function skeletonizeTypes(ast: File): void {
  traverse(ast, {
    TSInterfaceDeclaration(path) {
      const body = path.node.body;
      const members = body.body;

      if (members.length <= KEEP_THRESHOLD) return;

      // Collect property names for the summary comment
      const names = members
        .map((m) => {
          if (t.isTSPropertySignature(m) || t.isTSMethodSignature(m)) {
            const key = m.key;
            if (t.isIdentifier(key)) return key.name;
            if (t.isStringLiteral(key)) return key.value;
          }
          if (t.isTSIndexSignature(m)) return '[index]';
          return null;
        })
        .filter((n): n is string => n !== null);

      // Replace body with an empty body carrying a summary comment
      const emptyBody = t.tsInterfaceBody([]);
      emptyBody.innerComments = [
        {
          type: 'CommentBlock',
          value: ` ${names.join(', ')} `,
        } as t.Comment,
      ];
      path.node.body = emptyBody;
    },

    TSTypeAliasDeclaration(path) {
      const typeAnnotation = path.node.typeAnnotation;

      // Keep union-of-literals (e.g. type Status = 'a' | 'b') — cheap and meaningful
      if (isUnionOfLiterals(typeAnnotation)) return;

      // Only collapse object types with many members
      if (!t.isTSTypeLiteral(typeAnnotation)) return;
      const members = typeAnnotation.members;
      if (members.length <= KEEP_THRESHOLD) return;

      const names = members
        .map((m) => {
          if (t.isTSPropertySignature(m) || t.isTSMethodSignature(m)) {
            const key = m.key;
            if (t.isIdentifier(key)) return key.name;
            if (t.isStringLiteral(key)) return key.value;
          }
          return null;
        })
        .filter((n): n is string => n !== null);

      const collapsed = t.tsTypeLiteral([]);
      collapsed.innerComments = [
        {
          type: 'CommentBlock',
          value: ` ${names.join(', ')} `,
        } as t.Comment,
      ];
      path.node.typeAnnotation = collapsed;
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUnionOfLiterals(type: t.TSType): boolean {
  if (!t.isTSUnionType(type)) return false;
  return type.types.every(
    (t2) =>
      t.isTSLiteralType(t2) ||
      t.isTSUndefinedKeyword(t2) ||
      t.isTSNullKeyword(t2) ||
      t.isTSBooleanKeyword(t2) ||
      t.isTSStringKeyword(t2) ||
      t.isTSNumberKeyword(t2)
  );
}
