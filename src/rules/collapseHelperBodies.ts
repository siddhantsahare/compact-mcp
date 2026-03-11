import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';

/**
 * Rule: Collapse the bodies of module-level helper functions into a single comment.
 *
 * Target: Functions that are:
 *   (a) Declared at module scope (not inside another function or component)
 *   (b) Named with a lowercase initial (i.e., NOT React components)
 *   (c) Have a body with more than 1 statement (trivial 1-liners are kept)
 *
 * The function signature, parameter list, and return type are preserved.
 * Only the body is replaced with `{ /* implementation * / }`.
 *
 * This is the "Deep Implementation Hiding" heuristic described in the roadmap.
 * The LLM needs to know that `computeScore(product, query): number` exists and
 * what it accepts, but does NOT need 20 lines of math to fix a useEffect bug.
 *
 * Excluded from collapsing:
 *   - React components (uppercase first letter)
 *   - Handler functions (handle*, on*) — already handled by summarizeHandlers
 *   - Hook factories (use*) — own semantics
 *   - Functions with 1 statement (already minimal)
 *   - Class methods (too risky to collapse without understanding inheritance)
 */
export function collapseHelperBodies(ast: File): void {
  traverse(ast, {
    FunctionDeclaration(path) {
      if (!path.parentPath?.isProgram() && !path.parentPath?.isExportNamedDeclaration() && !path.parentPath?.isExportDefaultDeclaration()) return;
      const name = path.node.id?.name ?? '';
      if (!name || shouldSkip(name)) return;
      if (path.node.body.body.length <= 1) return;
      path.node.body = makeCollapsedBody(name);
    },

    VariableDeclarator(path) {
      // Only collapse top-level `const foo = () => ...` or `const foo = function() ...`
      const isTopLevel =
        path.parentPath?.isVariableDeclaration() &&
        (path.parentPath.parentPath?.isProgram() ||
          path.parentPath.parentPath?.isExportNamedDeclaration());

      if (!isTopLevel) return;
      if (!t.isIdentifier(path.node.id)) return;

      const name = path.node.id.name;
      if (!name || shouldSkip(name)) return;

      const init = path.node.init;
      if (!init) return;

      if (t.isArrowFunctionExpression(init)) {
        if (t.isBlockStatement(init.body) && init.body.body.length > 1) {
          init.body = makeCollapsedBody(name);
        } else if (!t.isBlockStatement(init.body) && !isSimpleExpression(init.body)) {
          // expression body that is non-trivial — wrap in block with comment
          const block = makeCollapsedBody(name);
          init.body = block;
        }
      } else if (t.isFunctionExpression(init)) {
        if (init.body.body.length > 1) {
          init.body = makeCollapsedBody(name);
        }
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Names that should NOT have their bodies collapsed. */
function shouldSkip(name: string): boolean {
  // React components start uppercase
  if (/^[A-Z]/.test(name)) return true;
  // Event handlers — summarizeHandlers already handles these
  if (/^(handle|on)[A-Z]/.test(name)) return true;
  // Custom hooks — semantically important
  if (/^use[A-Z]/.test(name)) return true;
  return false;
}

/** True if an expression is simple enough to leave as-is (identifier, member, literal). */
function isSimpleExpression(expr: t.Expression | t.BlockStatement): boolean {
  return (
    t.isIdentifier(expr) ||
    t.isNumericLiteral(expr) ||
    t.isStringLiteral(expr) ||
    t.isBooleanLiteral(expr) ||
    t.isNullLiteral(expr) ||
    t.isMemberExpression(expr)
  );
}

function makeCollapsedBody(name: string): t.BlockStatement {
  const block = t.blockStatement([]);
  block.innerComments = [
    { type: 'CommentBlock', value: ` ${name} implementation ` } as t.Comment,
  ];
  return block;
}
