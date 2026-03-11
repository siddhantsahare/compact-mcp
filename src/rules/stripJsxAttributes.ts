import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';
import type { PreprocessorOptions, PruningRule } from '../types.js';

/**
 * Rule: Strip noisy JSX attributes that carry no semantic meaning for logic tasks.
 *
 * Removed by default:
 *   - className / class (Tailwind/CSS strings)
 *   - style={{...}} inline objects
 *   - aria-* attributes (accessibility metadata)
 *   - data-* attributes not already caught by stripTestAttributes
 *
 * Kept (always):
 *   - Event handlers: onClick, onChange, onSubmit, on* …
 *   - key, ref, type, name, id, value, defaultValue, checked, disabled
 *   - href, src, alt, rel, target (semantic HTML)
 *   - htmlFor, tabIndex, role
 *   - Spread attributes (unknown — conservative)
 *   - Any prop whose value is a non-string expression (state, variables, functions)
 *
 * Flags (via PreprocessorOptions):
 *   - preserveStyles  → keep className, class, and style attributes
 *   - preserveTestIds → keep data-* attributes
 */
export function makeStripJsxAttributes(opts: PreprocessorOptions = {}): PruningRule {
  return function stripJsxAttributes(ast: File): void {
    traverse(ast, {
      JSXOpeningElement(path) {
        path.node.attributes = path.node.attributes.filter((attr) => {
          // Always keep spreads: {...props}
          if (t.isJSXSpreadAttribute(attr)) return true;

          if (!t.isJSXAttribute(attr)) return true;

          const name = t.isJSXNamespacedName(attr.name)
            ? `${attr.name.namespace.name}:${attr.name.name.name}`
            : attr.name.name;

          // aria-* — strip unless preserveStyles (UI-fidelity mode keeps them)
          if (/^aria-/.test(String(name))) return opts.preserveStyles ?? false;

          // data-* — honour preserveTestIds flag
          if (/^data-/.test(String(name))) return opts.preserveTestIds ?? false;

          // className / class — honour preserveStyles flag
          if (name === 'className' || name === 'class') return opts.preserveStyles ?? false;

          // style={} — honour preserveStyles flag
          if (name === 'style') {
            if (opts.preserveStyles) return true;
            if (!attr.value) return false;
            if (t.isJSXExpressionContainer(attr.value)) {
              const expr = attr.value.expression;
              // Keep variable/member references: style={styles.foo}
              if (t.isIdentifier(expr) || t.isMemberExpression(expr)) return true;
              return false;
            }
            return false;
          }

          return true;
        });
      },
    });
  };
}

/** Default instance — maximum compression, no style preservation. */
export const stripJsxAttributes = makeStripJsxAttributes();
