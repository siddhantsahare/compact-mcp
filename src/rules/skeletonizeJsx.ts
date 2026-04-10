import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';

/**
 * Rule: Replace the JSX return block of React components with a skeleton placeholder.
 *
 * This is deliberately aggressive — it drops the entire render tree and replaces it
 * with `return <_JSX_ />;`. It is designed for prompt types where the LLM needs to
 * understand logic/state/hooks, NOT the UI structure (e.g., "fix a useEffect bug",
 * "add a prop", "memoize this computation").
 *
 * Detection heuristic:
 *   A function/arrow is treated as a React component when ALL of:
 *     (a) Its name starts with an uppercase letter
 *     (b) Its body contains a return statement whose argument is a JSXElement,
 *         JSXFragment, or JSXExpressionContainer wrapping JSX
 *
 * Only the JSX-returning return statement is replaced; other early returns
 * (guard clauses like `if (!user) return null;`) are preserved because they
 * carry conditional logic.
 *
 * The placeholder element name `_JSX_` is chosen to be unambiguous and
 * obviously machine-generated.
 */
/** Walk the AST and replace JSX return blocks in React components with a skeleton placeholder. */
export function skeletonizeJsxFull(ast: File): void {
  traverse(ast, {
    VariableDeclarator(path) {
      if (
        !t.isIdentifier(path.node.id) ||
        !/^[A-Z]/.test(path.node.id.name)
      )
        return;

      const init = path.node.init;
      if (
        !init ||
        (!t.isArrowFunctionExpression(init) && !t.isFunctionExpression(init))
      )
        return;

      const body = t.isBlockStatement(init.body) ? init.body : null;
      if (!body) {
        // Arrow with expression body: `const Foo = () => <div/>`
        if (isJsxReturn(init.body as t.Expression)) {
          const childNames = collectTopLevelTagNames(init.body as t.Expression);
          const hint = childNames.length > 0 ? childNames.join(', ') : 'JSX';
          (init as t.ArrowFunctionExpression).body = makePlaceholder(hint);
        }
        return;
      }

      let replaced = false;
      for (const stmt of body.body) {
        if (
          t.isReturnStatement(stmt) &&
          stmt.argument &&
          isJsxReturn(stmt.argument) &&
          !replaced
        ) {
          const childNames = collectTopLevelTagNames(stmt.argument);
          const hint = childNames.length > 0 ? childNames.join(', ') : 'JSX';
          stmt.argument = makePlaceholder(hint);
          replaced = true;
        }
      }
    },

    FunctionDeclaration(path) {
      if (
        !path.node.id ||
        !/^[A-Z]/.test(path.node.id.name)
      )
        return;

      let replaced = false;
      for (const stmt of path.node.body.body) {
        if (
          t.isReturnStatement(stmt) &&
          stmt.argument &&
          isJsxReturn(stmt.argument) &&
          !replaced
        ) {
          const childNames = collectTopLevelTagNames(stmt.argument);
          const hint = childNames.length > 0 ? childNames.join(', ') : 'JSX';
          stmt.argument = makePlaceholder(hint);
          replaced = true;
        }
      }
    },
  });
}

function isJsxReturn(expr: t.Expression | t.JSXEmptyExpression): boolean {
  return (
    t.isJSXElement(expr) ||
    t.isJSXFragment(expr) ||
    (t.isParenthesizedExpression?.(expr) && isJsxReturn((expr as t.ParenthesizedExpression).expression)) ||
    false
  );
}

/** Collect the top-level JSX tag names (max 4) to embed in the placeholder comment. */
function collectTopLevelTagNames(expr: t.Expression | t.JSXEmptyExpression): string[] {
  const names: string[] = [];
  let root: t.JSXElement | t.JSXFragment | null = null;

  if (t.isJSXElement(expr)) root = expr;
  else if (t.isJSXFragment(expr)) root = expr;

  if (!root) return names;

  for (const child of root.children) {
    if (!t.isJSXElement(child)) continue;
    const opening = child.openingElement.name;
    if (t.isJSXIdentifier(opening)) names.push(opening.name);
    else if (t.isJSXMemberExpression(opening) && t.isJSXIdentifier(opening.property)) {
      names.push(opening.property.name);
    }
    if (names.length >= 4) break;
  }

  return names;
}

/** Build `<_JSX_ />` with a comment hint about what was replaced. */
function makePlaceholder(hint: string): t.JSXElement {
  const el = t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier('_JSX_'), [], true),
    null,
    [],
    true
  );
  el.leadingComments = [
    { type: 'CommentBlock', value: ` renders: ${hint} ` } as t.Comment,
  ];
  return el;
}
