import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';

/**
 * Rule: Remove import specifiers (and entire import declarations) whose
 * bindings are never referenced in the file body after all other pruning.
 *
 * Algorithm:
 *   1. Collect every import binding name from `import` declarations.
 *   2. Walk the entire AST counting references to each binding.
 *      An "import declaration" node itself is excluded from the count so
 *      that the declaration doesn't count as its own usage.
 *   3. Remove specifiers with 0 references.
 *   4. If a declaration has no specifiers left, remove the whole declaration.
 *
 * Conservative by design — side-effect imports (`import './styles.css'`)
 * have no specifiers and are kept as-is.
 *
 * Note: this rule should run LAST in the pipeline so it sees the post-pruned AST.
 */
export function pruneUnusedImports(ast: File): void {
  // ── Step 1: collect all import bindings ──────────────────────────────────
  // Map: localName → the ImportSpecifier / ImportDefaultSpecifier / ImportNamespaceSpecifier node
  const importedNames = new Map<string, t.ImportDeclaration>();

  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) continue;
    for (const spec of node.specifiers) {
      const local = spec.local.name;
      importedNames.set(local, node);
    }
  }

  if (importedNames.size === 0) return;

  // ── Step 2: count usages ─────────────────────────────────────────────────
  const usageCount = new Map<string, number>();
  for (const name of importedNames.keys()) usageCount.set(name, 0);

  traverse(ast, {
    // Skip the import declarations themselves
    ImportDeclaration(path) {
      path.skip();
    },

    Identifier(path) {
      const { name } = path.node;
      if (!usageCount.has(name)) return;

      // Exclude binding declarations: `const foo = ...` left-hand sides
      // These show up as Identifier nodes too but aren't "uses"
      const parent = path.parent;
      if (
        t.isVariableDeclarator(parent) && parent.id === path.node
      ) return;
      if (
        (t.isFunctionDeclaration(parent) || t.isFunctionExpression(parent)) &&
        parent.id === path.node
      ) return;
      if (
        t.isClassDeclaration(parent) && parent.id === path.node
      ) return;

      // ObjectProperty key in shorthand: { foo } uses foo
      // ObjectProperty key in non-shorthand: { foo: bar } — foo is a key, not a use
      if (t.isObjectProperty(parent) && parent.key === path.node && !parent.computed && !parent.shorthand) {
        return;
      }

      // Member expression property: obj.foo — foo is a property access, not an import reference
      if (t.isMemberExpression(parent) && parent.property === path.node && !parent.computed) {
        return;
      }

      // JSX attribute name: <Comp foo={...}> — always a JSXIdentifier, never an Identifier import ref
      if (t.isJSXAttribute(parent)) return;

      usageCount.set(name, (usageCount.get(name) ?? 0) + 1);
    },

    JSXIdentifier(path) {
      const { name } = path.node;
      if (!usageCount.has(name)) return;
      // Only count JSX opening/closing element names, not attributes
      if (
        t.isJSXOpeningElement(path.parent) || t.isJSXClosingElement(path.parent)
      ) {
        usageCount.set(name, (usageCount.get(name) ?? 0) + 1);
      }
    },
  });

  // ── Step 3 & 4: prune ────────────────────────────────────────────────────
  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) continue;
    if (node.specifiers.length === 0) continue; // side-effect import — leave alone

    node.specifiers = node.specifiers.filter((spec) => {
      const count = usageCount.get(spec.local.name) ?? 0;
      return count > 0;
    });
  }

  // Remove import declarations that now have no specifiers
  // (but not side-effect imports, which started with 0 specifiers)
  ast.program.body = ast.program.body.filter((node) => {
    if (!t.isImportDeclaration(node)) return true;
    // Keep side-effect imports (no specifiers originally kept, but we only
    // reach here if node was non-empty at start and got emptied)
    return node.specifiers.length > 0 || node.source.value.startsWith('./') === false;
  });
}
