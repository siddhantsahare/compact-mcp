import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';

const TEST_ATTRS = new Set(['data-testid', 'data-cy', 'data-test']);

/**
 * Rule 8: Strip test-only JSX attributes (data-testid, data-cy, data-test).
 */
export function stripTestAttributes(ast: File): void {
  traverse(ast, {
    JSXAttribute(path) {
      if (
        t.isJSXIdentifier(path.node.name) &&
        TEST_ATTRS.has(path.node.name.name)
      ) {
        path.remove();
      }
    },
  });
}
