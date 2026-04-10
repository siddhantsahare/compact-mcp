import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { parse, countTokens } from '../../parser.js';
import { walkProject, MAX_FILES } from '../walker.js';

export interface MapMetrics {
  filesScanned: number;
  rawTokens: number;       // tokens if Claude had Read every file
  skeletonTokens: number;  // tokens in the compact_map output
  savedTokens: number;
  savedPercent: number;
}

/**
 * compact_map — Project Skeleton
 *
 * Walks all .tsx/.jsx/.ts/.js files in rootDir, extracts a structural skeleton
 * for each (component names, props, hooks used, top-level JSX children, exports),
 * and returns the concatenated result.
 *
 * One tool call = Claude understands the whole app structure.
 * Replaces 5-10 exploratory Read calls at the start of a session.
 */
export async function compactMap(rootDir: string): Promise<{ text: string; metrics: MapMetrics }> {
  const { files, totalFound, readErrors } = await walkProject(rootDir);

  const skeletons: string[] = [];
  let rawTokens = 0;

  for (const { relPath, source } of files) {
    rawTokens += countTokens(source);
    const skeleton = extractFileSkeleton(relPath, source);
    if (skeleton) skeletons.push(skeleton);
  }

  const lines: string[] = [];

  if (skeletons.length === 0) {
    lines.push('[no-react] No React/TypeScript component files found.');
    lines.push('Compact MCP is designed for React/TypeScript projects.');
    lines.push('Use Claude Code\'s native Read/Grep/Glob tools for this project.');
    const text = lines.join('\n');
    return { text, metrics: { filesScanned: 0, rawTokens: 0, skeletonTokens: countTokens(text), savedTokens: 0, savedPercent: 0 } };
  }

  lines.push(...skeletons);

  if (totalFound > MAX_FILES) {
    lines.push('');
    lines.push(`[truncated] Showing ${files.length} of ${totalFound} files.`);
    lines.push('Use the rootDir parameter to narrow scope (e.g., rootDir: "src/components").');
  }

  if (readErrors.length > 0) {
    lines.push('');
    lines.push(`[read-errors] Could not read ${readErrors.length} file(s) — skipped.`);
  }

  const text = lines.join('\n');
  const skeletonTokens = countTokens(text);
  const savedTokens = Math.max(0, rawTokens - skeletonTokens);
  const savedPercent = rawTokens > 0 ? Math.round((savedTokens / rawTokens) * 100) : 0;

  return {
    text,
    metrics: {
      filesScanned: files.length,
      rawTokens,
      skeletonTokens,
      savedTokens,
      savedPercent,
    },
  };
}

// ─── Per-file skeleton extraction ───────────────────────────────────────────

interface ComponentInfo {
  name: string;
  props: string;
  isExported: boolean;
  isDefault: boolean;
  hooks: string[];
  renders: string[];
}

function extractFileSkeleton(relPath: string, source: string): string | null {
  let ast;
  try {
    ast = parse(source);
  } catch {
    return null; // Unparseable file — skip silently
  }

  const components: ComponentInfo[] = [];
  const topLevelExports: string[] = [];

  traverse(ast, {
    // Named exports: export { Foo, Bar }
    ExportNamedDeclaration(path) {
      if (!path.node.declaration && path.node.specifiers.length > 0) {
        for (const spec of path.node.specifiers) {
          if (t.isExportSpecifier(spec) && t.isIdentifier(spec.exported)) {
            if (!/^[A-Z]/.test(spec.exported.name)) {
              topLevelExports.push(spec.exported.name);
            }
          }
        }
      }
    },

    // Function declarations and arrow function components
    'FunctionDeclaration|ArrowFunctionExpression|FunctionExpression'(path) {
      const info = extractComponentFromPath(path);
      if (info) components.push(info);
    },
  });

  if (components.length === 0 && topLevelExports.length === 0) {
    // Utility file — emit a minimal entry
    const exports = collectSimpleExports(ast);
    if (exports.length === 0) return null;
    return `── ${relPath}\n  exports: ${exports.slice(0, 8).join(', ')}`;
  }

  const lines: string[] = [`── ${relPath}`];

  for (const comp of components) {
    const exported = comp.isDefault ? 'export default ' : comp.isExported ? 'export ' : '';
    lines.push(`  ${exported}${comp.name}(${comp.props})`);
    if (comp.hooks.length > 0) {
      lines.push(`  hooks: ${comp.hooks.join(', ')}`);
    }
    if (comp.renders.length > 0) {
      lines.push(`  renders: ${comp.renders.join(', ')}`);
    }
  }

  if (topLevelExports.length > 0) {
    lines.push(`  exports: ${topLevelExports.slice(0, 8).join(', ')}`);
  }

  return lines.join('\n');
}

// ─── Component detection ─────────────────────────────────────────────────────

const TRACKED_HOOKS = new Set([
  'useState', 'useReducer', 'useContext', 'useRef',
  'useEffect', 'useLayoutEffect', 'useCallback', 'useMemo',
  'useImperativeHandle', 'useId', 'useTransition', 'useDeferredValue',
]);

function extractComponentFromPath(path: babel.NodePath): ComponentInfo | null {
  let name = '';
  let isExported = false;
  let isDefault = false;
  let props = '';
  let funcNode: t.Function | null = null;

  if (path.isFunctionDeclaration()) {
    const node = path.node as t.FunctionDeclaration;
    if (!node.id) return null;
    name = node.id.name;
    funcNode = node;

    const parent = path.parent;
    if (t.isExportDefaultDeclaration(parent)) {
      isExported = true;
      isDefault = true;
    } else if (t.isExportNamedDeclaration(parent)) {
      isExported = true;
    }
  } else if (path.isVariableDeclarator?.()) {
    // Handled via FunctionDeclaration + ArrowFunctionExpression paths
    return null;
  } else if (path.isArrowFunctionExpression() || path.isFunctionExpression()) {
    // Must be top-level: const Foo = () => ...
    const varDecl = path.parentPath?.parentPath;
    if (!varDecl?.isVariableDeclaration()) return null;

    const declarator = path.parent as t.VariableDeclarator;
    if (!t.isIdentifier(declarator.id)) return null;

    name = declarator.id.name;
    funcNode = path.node as t.Function;

    const maybeExport = varDecl.parent;
    if (t.isExportDefaultDeclaration(maybeExport)) {
      isExported = true;
      isDefault = true;
    } else if (t.isExportNamedDeclaration(maybeExport)) {
      isExported = true;
    }
  }

  // Must start with uppercase to be a React component
  if (!name || !/^[A-Z]/.test(name)) return null;
  if (!funcNode) return null;

  // Extract first parameter as props string
  if (funcNode.params.length > 0) {
    const firstParam = funcNode.params[0];
    props = extractPropsSignature(firstParam);
  }

  // Check function body for hooks + JSX children
  const body = t.isBlockStatement(funcNode.body) ? funcNode.body : null;
  const hooks: string[] = [];
  const renders: string[] = [];

  if (body) {
    collectHooksAndRenders(body, hooks, renders);
  } else if (funcNode.body) {
    // Arrow expression body: () => <div />
    collectRendersFromExpression(funcNode.body as t.Expression, renders);
  }

  return { name, props, isExported, isDefault, hooks: dedup(hooks), renders: dedup(renders).slice(0, 6) };
}

function extractPropsSignature(param: t.Function['params'][0]): string {
  if (t.isObjectPattern(param)) {
    const keys = param.properties
      .filter((p): p is t.ObjectProperty => t.isObjectProperty(p))
      .map((p) => {
        const key = t.isIdentifier(p.key) ? p.key.name : '?';
        return p.value && t.isAssignmentPattern(p.value) ? `${key}?` : key;
      });
    return `{ ${keys.join(', ')} }`;
  }
  if (t.isIdentifier(param)) return param.name;
  if (t.isRestElement(param) && t.isIdentifier(param.argument)) return `...${param.argument.name}`;
  return 'props';
}

function collectHooksAndRenders(body: t.BlockStatement, hooks: string[], renders: string[]): void {
  for (const stmt of body.body) {
    // Check variable declarations for hook calls
    if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (t.isCallExpression(decl.init)) {
          const hookStr = extractHookCall(decl.init);
          if (hookStr) hooks.push(hookStr);
        }
      }
    }
    // Check expression statements for hook calls (useEffect, etc.)
    if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
      const hookStr = extractHookCall(stmt.expression);
      if (hookStr) hooks.push(hookStr);
    }
    // Return statement — collect top-level JSX children
    if (t.isReturnStatement(stmt) && stmt.argument) {
      collectRendersFromExpression(stmt.argument, renders);
    }
  }
}

function extractHookCall(call: t.CallExpression): string | null {
  const callee = call.callee;
  if (!t.isIdentifier(callee)) return null;

  const name = callee.name;
  if (!TRACKED_HOOKS.has(name) && !/^use[A-Z]/.test(name)) return null;

  // For useState/useReducer/useRef: show initializer
  if (name === 'useState' || name === 'useReducer') {
    if (call.arguments.length > 0) {
      const init = call.arguments[0];
      if (t.isStringLiteral(init)) return `${name}('${init.value}')`;
      if (t.isNumericLiteral(init)) return `${name}(${init.value})`;
      if (t.isNullLiteral(init)) return `${name}(null)`;
      if (t.isBooleanLiteral(init)) return `${name}(${init.value})`;
      if (t.isIdentifier(init)) return `${name}(${init.name})`;
    }
    return name;
  }

  // For useContext: show context name
  if (name === 'useContext' && call.arguments.length > 0) {
    const ctx = call.arguments[0];
    if (t.isIdentifier(ctx)) return `useContext(${ctx.name})`;
  }

  // For custom hooks: show name only
  if (/^use[A-Z]/.test(name)) return `${name}()`;

  return name;
}

function collectRendersFromExpression(expr: t.Expression | t.JSXEmptyExpression, renders: string[]): void {
  if (t.isJSXElement(expr)) {
    collectTopLevelJsxChildren(expr, renders);
  } else if (t.isJSXFragment(expr)) {
    for (const child of expr.children) {
      if (t.isJSXElement(child)) {
        const tag = getJsxTagName(child);
        if (tag && /^[A-Z]/.test(tag)) renders.push(formatJsxTag(child, tag));
      }
    }
  }
}

function collectTopLevelJsxChildren(root: t.JSXElement, renders: string[]): void {
  for (const child of root.children) {
    if (!t.isJSXElement(child)) continue;
    const tag = getJsxTagName(child);
    if (!tag) continue;
    // Only surface component children (uppercase) — skip plain DOM elements
    if (/^[A-Z]/.test(tag)) {
      renders.push(formatJsxTag(child, tag));
    }
  }
}

function getJsxTagName(el: t.JSXElement): string | null {
  const name = el.openingElement.name;
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name) && t.isJSXIdentifier(name.property)) {
    return name.property.name;
  }
  return null;
}

function formatJsxTag(el: t.JSXElement, tag: string): string {
  // Show up to 2 meaningful props (non-className, non-style)
  const meaningfulProps = el.openingElement.attributes
    .filter((a): a is t.JSXAttribute => t.isJSXAttribute(a))
    .filter((a) => {
      const name = t.isJSXIdentifier(a.name) ? a.name.name : '';
      return name !== 'className' && name !== 'style' && !name.startsWith('data-') && !name.startsWith('aria-');
    })
    .slice(0, 2)
    .map((a) => {
      const attrName = t.isJSXIdentifier(a.name) ? a.name.name : '?';
      if (!a.value) return attrName; // boolean prop
      if (t.isStringLiteral(a.value)) return `${attrName}="${a.value.value}"`;
      if (t.isJSXExpressionContainer(a.value) && t.isIdentifier(a.value.expression)) {
        return `${attrName}={${a.value.expression.name}}`;
      }
      return attrName;
    });

  return meaningfulProps.length > 0 ? `<${tag} ${meaningfulProps.join(' ')} />` : `<${tag} />`;
}

function collectSimpleExports(ast: t.File): string[] {
  const names: string[] = [];
  traverse(ast, {
    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        const decl = path.node.declaration;
        if (t.isFunctionDeclaration(decl) && decl.id) names.push(decl.id.name);
        if (t.isVariableDeclaration(decl)) {
          for (const d of decl.declarations) {
            if (t.isIdentifier(d.id)) names.push(d.id.name);
          }
        }
      }
      for (const spec of path.node.specifiers) {
        if (t.isExportSpecifier(spec) && t.isIdentifier(spec.exported)) {
          names.push(spec.exported.name);
        }
      }
    },
    ExportDefaultDeclaration(path) {
      const decl = path.node.declaration;
      if (t.isFunctionDeclaration(decl) && decl.id) names.push(`default:${decl.id.name}`);
      else if (t.isIdentifier(decl)) names.push(`default:${decl.name}`);
    },
  });
  return names;
}

function dedup<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

// Type import for babel traverse path
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace babel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type NodePath = any;
}
