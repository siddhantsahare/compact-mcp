import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { parse } from '../../parser.js';
import { walkProject } from '../walker.js';

/**
 * compact_deps — Component Dependency Chain
 *
 * Given a component name, returns its full dependency picture:
 * - RENDERED BY: which components render it (and with what props)
 * - PROPS: prop names it receives (from its own parameter list)
 * - CONTEXTS: which contexts it consumes via useContext
 * - HOOKS: all hooks it uses
 * - RENDERS: which components it renders
 *
 * Replaces 6+ Read calls to manually trace this.
 */
export async function compactDeps(componentName: string, rootDir: string): Promise<string> {
  const { files, totalFound } = await walkProject(rootDir);

  // Per-file analysis
  interface FileAnalysis {
    relPath: string;
    // Components defined in this file
    components: ComponentDef[];
    // Components used (rendered) in this file
    usages: ComponentUsage[];
  }

  interface ComponentDef {
    name: string;
    props: string[];
    contexts: string[];
    hooks: string[];
    renders: string[];
    isDefault: boolean;
  }

  interface ComponentUsage {
    parentName: string;
    childName: string;
    passedProps: string[];
  }

  const analyses: FileAnalysis[] = [];

  for (const { relPath, source } of files) {
    let ast;
    try {
      ast = parse(source);
    } catch {
      continue;
    }

    const analysis = analyzeFile(relPath, ast);
    analyses.push(analysis);
  }

  // Find the target component's definition
  const definingFile = analyses.find((a) =>
    a.components.some((c) => c.name === componentName)
  );
  const targetDef = definingFile?.components.find((c) => c.name === componentName);

  if (!targetDef) {
    // Check if it exists as a non-component (e.g., a utility function)
    const anyFile = analyses.find((a) =>
      a.usages.some((u) => u.childName === componentName)
    );
    if (!anyFile) {
      return `[not-found] Component "${componentName}" not found in ${rootDir}.\nNote: Component names must start with an uppercase letter.`;
    }
  }

  // Find all places that render this component
  const renderedBy: { file: string; parentName: string; passedProps: string[] }[] = [];
  for (const analysis of analyses) {
    for (const usage of analysis.usages) {
      if (usage.childName === componentName) {
        renderedBy.push({
          file: analysis.relPath,
          parentName: usage.parentName,
          passedProps: usage.passedProps,
        });
      }
    }
  }

  // Format output
  const lines: string[] = [];
  lines.push(`${componentName}`);
  if (definingFile) {
    lines.push(`  defined in: ${definingFile.relPath}`);
  }
  lines.push('');

  // RENDERED BY
  if (renderedBy.length === 0) {
    lines.push('RENDERED BY:');
    lines.push('  (not found — may be a page/root component or dynamically imported)');
  } else {
    lines.push('RENDERED BY:');
    for (const r of renderedBy) {
      const props = r.passedProps.length > 0 ? ` [props: ${r.passedProps.join(', ')}]` : '';
      lines.push(`  ${r.parentName} (${r.file})${props}`);
    }
  }
  lines.push('');

  // PROPS
  if (targetDef) {
    if (targetDef.props.length > 0) {
      lines.push('PROPS RECEIVED:');
      for (const p of targetDef.props) {
        lines.push(`  ${p}`);
      }
      lines.push('');
    }

    // CONTEXTS
    if (targetDef.contexts.length > 0) {
      lines.push('CONTEXT CONSUMED:');
      for (const c of targetDef.contexts) {
        lines.push(`  ${c}`);
      }
      lines.push('');
    }

    // HOOKS
    if (targetDef.hooks.length > 0) {
      lines.push('HOOKS:');
      for (const h of targetDef.hooks) {
        lines.push(`  ${h}`);
      }
      lines.push('');
    }

    // RENDERS
    if (targetDef.renders.length > 0) {
      lines.push('RENDERS:');
      for (const r of targetDef.renders) {
        lines.push(`  ${r}`);
      }
      lines.push('');
    }
  }

  if (totalFound > files.length) {
    lines.push(`[note] Analysis based on first ${files.length} of ${totalFound} files. Use rootDir to narrow scope for complete results.`);
  }

  return lines.join('\n');
}

// ─── File analysis ────────────────────────────────────────────────────────────

interface ComponentDef {
  name: string;
  props: string[];
  contexts: string[];
  hooks: string[];
  renders: string[];
  isDefault: boolean;
}

interface ComponentUsage {
  parentName: string;
  childName: string;
  passedProps: string[];
}

interface FileAnalysis {
  relPath: string;
  components: ComponentDef[];
  usages: ComponentUsage[];
}

const TRACKED_HOOKS = new Set([
  'useState', 'useReducer', 'useContext', 'useRef',
  'useEffect', 'useLayoutEffect', 'useCallback', 'useMemo',
]);

function analyzeFile(relPath: string, ast: t.File): FileAnalysis {
  const components: ComponentDef[] = [];
  const usages: ComponentUsage[] = [];

  // Track which function body we're currently in
  const functionStack: string[] = [];

  traverse(ast, {
    // Detect component definitions
    'FunctionDeclaration|ArrowFunctionExpression|FunctionExpression': {
      enter(path) {
        let name = '';

        if (path.isFunctionDeclaration()) {
          name = (path.node as t.FunctionDeclaration).id?.name ?? '';
        } else {
          const parent = path.parent;
          if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
            name = parent.id.name;
          }
        }

        if (name && /^[A-Z]/.test(name)) {
          functionStack.push(name);
          // Analyze this component's body
          const def = analyzeComponent(name, path.node as t.Function, ast);
          if (def) components.push(def);
        } else {
          functionStack.push('');
        }
      },
      exit() {
        functionStack.pop();
      },
    },

    // Detect JSX usage (which components are rendered)
    JSXOpeningElement(path) {
      const name = path.node.name;
      let childName = '';
      if (t.isJSXIdentifier(name)) childName = name.name;
      else if (t.isJSXMemberExpression(name) && t.isJSXIdentifier(name.property)) {
        childName = name.property.name;
      }

      if (!childName || !/^[A-Z]/.test(childName)) return;

      const parentComponent = [...functionStack].reverse().find((n) => n) ?? 'unknown';

      // Collect passed props
      const passedProps = path.node.attributes
        .filter((a): a is t.JSXAttribute => t.isJSXAttribute(a))
        .filter((a) => {
          const attrName = t.isJSXIdentifier(a.name) ? a.name.name : '';
          return attrName !== 'className' && attrName !== 'style' && !attrName.startsWith('data-');
        })
        .map((a) => {
          const attrName = t.isJSXIdentifier(a.name) ? a.name.name : '?';
          return attrName;
        })
        .slice(0, 5);

      usages.push({
        parentName: parentComponent,
        childName,
        passedProps,
      });
    },
  });

  return { relPath, components, usages };
}

function analyzeComponent(name: string, node: t.Function, _ast: t.File): ComponentDef | null {
  const props: string[] = [];
  const contexts: string[] = [];
  const hooks: string[] = [];
  const renders: string[] = [];

  // Extract props from first parameter
  if (node.params.length > 0) {
    const firstParam = node.params[0];
    if (t.isObjectPattern(firstParam)) {
      for (const prop of firstParam.properties) {
        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
          const optional = t.isAssignmentPattern(prop.value) ? '?' : '';
          props.push(`${prop.key.name}${optional}`);
        }
      }
    }
  }

  // Traverse function body for hooks/contexts/renders
  const body = t.isBlockStatement(node.body) ? node.body : null;
  if (!body) return { name, props, contexts, hooks, renders, isDefault: false };

  for (const stmt of body.body) {
    // Variable declarations with hook calls
    if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (t.isCallExpression(decl.init)) {
          const callee = decl.init.callee;
          if (t.isIdentifier(callee)) {
            const hookName = callee.name;
            if (TRACKED_HOOKS.has(hookName) || /^use[A-Z]/.test(hookName)) {
              if (hookName === 'useContext' && decl.init.arguments.length > 0) {
                const ctx = decl.init.arguments[0];
                if (t.isIdentifier(ctx)) {
                  contexts.push(ctx.name);
                  hooks.push(`useContext(${ctx.name})`);
                }
              } else {
                hooks.push(hookName);
              }
            }
          }
        }
      }
    }

    // Expression statements (useEffect, etc.)
    if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression)) {
      const callee = stmt.expression.callee;
      if (t.isIdentifier(callee)) {
        const hookName = callee.name;
        if (TRACKED_HOOKS.has(hookName) || /^use[A-Z]/.test(hookName)) {
          hooks.push(hookName);
        }
      }
    }

    // Return statement — collect top-level component renders
    if (t.isReturnStatement(stmt) && stmt.argument) {
      collectTopLevelComponents(stmt.argument, renders);
    }
  }

  return {
    name,
    props,
    contexts: [...new Set(contexts)],
    hooks: [...new Set(hooks)],
    renders: [...new Set(renders)].slice(0, 8),
    isDefault: false,
  };
}

function collectTopLevelComponents(expr: t.Expression | t.JSXEmptyExpression, renders: string[]): void {
  if (t.isJSXElement(expr)) {
    for (const child of expr.children) {
      if (t.isJSXElement(child)) {
        const name = child.openingElement.name;
        let childName = '';
        if (t.isJSXIdentifier(name)) childName = name.name;
        if (childName && /^[A-Z]/.test(childName)) {
          renders.push(`<${childName} />`);
        }
      }
    }
  } else if (t.isJSXFragment(expr)) {
    for (const child of expr.children) {
      if (t.isJSXElement(child)) {
        const name = child.openingElement.name;
        if (t.isJSXIdentifier(name) && /^[A-Z]/.test(name.name)) {
          renders.push(`<${name.name} />`);
        }
      }
    }
  }
}
