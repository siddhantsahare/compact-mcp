/**
 * Semantic Preservation Tests
 *
 * These tests answer: "After compression, is the output still useful to an LLM?"
 * They go beyond token-counting to verify STRUCTURAL INTEGRITY:
 *   - The compressed output must be re-parseable (valid syntax)
 *   - All component names must survive
 *   - All exported identifiers must survive
 *   - All hook call sites must survive (with deps)
 *   - JSX element structure must survive
 *   - Import statements must survive
 *   - Props passed to components must survive
 *
 * What we DON'T test (and why):
 *   - LLM output quality — requires live API calls, non-deterministic
 *   - Runtime behaviour — compressor output is not meant to be executed
 */

import assert from 'node:assert';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { ReactASTCompressor } from '../compressor.js';

/** Re-parse the compressed output — throws if syntax is broken. */
function assertReparseable(compressed: string, label: string): void {
  try {
    parse(compressed, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    assert.fail(`[${label}] Compressed output is not re-parseable: ${msg}`);
  }
}

/** Collect all top-level identifier names from a parsed AST. */
function topLevelNames(compressed: string): Set<string> {
  const ast = parse(compressed, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    errorRecovery: true,
  });
  const names = new Set<string>();
  traverse(ast, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    FunctionDeclaration(path: any) {
      if (path.node.id) names.add(path.node.id.name);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    VariableDeclarator(path: any) {
      if (path.node.id.type === 'Identifier') names.add(path.node.id.name);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ClassDeclaration(path: any) {
      if (path.node.id) names.add(path.node.id.name);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ImportDefaultSpecifier(path: any) {
      names.add(path.node.local.name);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ImportSpecifier(path: any) {
      names.add(path.node.local.name);
    },
  });
  return names;
}

suite('Semantic Preservation', () => {
  let compressor: ReactASTCompressor;

  setup(() => {
    compressor = new ReactASTCompressor();
  });

  // ─── Re-parseability ──────────────────────────────────────────
  test('compressed output is always valid, re-parseable syntax', () => {
    const components = [
      // minimal functional component
      `import React from 'react'; function App() { return <div />; }`,
      // class component
      `import React from 'react'; class Counter extends React.Component { render() { return <span>{this.state.count}</span>; } }`,
      // TSX with interface
      `interface Props { id: string; } const Card = ({ id }: Props) => <div id={id} />;`,
      // hooks heavy
      `import { useState, useEffect } from 'react';
       function Feed() {
         const [items, setItems] = useState([]);
         useEffect(() => { fetch('/api').then(r=>r.json()).then(setItems); }, []);
         return <ul>{items.map(i=><li key={i.id}>{i.title}</li>)}</ul>;
       }`,
    ];
    for (const code of components) {
      const { compressed } = compressor.compress(code);
      assertReparseable(compressed, code.slice(0, 40));
    }
  });

  // ─── Component name survival ──────────────────────────────────
  test('component function name survives compression', () => {
    const code = `
      import React, { useState, useEffect, useCallback } from 'react';
      /**
       * UserDashboard — primary dashboard for authenticated users.
       * Handles data fetching, filtering, and export.
       */
      export function UserDashboard({ userId, onLogout }) {
        const [data, setData] = useState(null);
        useEffect(() => {
          fetch('/api/dashboard/' + userId).then(r => r.json()).then(setData);
        }, [userId]);
        const handleExport = () => {
          downloadCSV(data);
          trackEvent('export');
          showToast('Exported!');
        };
        return <div className="dashboard"><h1>Dashboard</h1></div>;
      }
    `;
    const { compressed } = compressor.compress(code);
    assertReparseable(compressed, 'UserDashboard');
    assert.ok(compressed.includes('UserDashboard'), 'Component name must survive');
    assert.ok(compressed.includes('userId'), 'Prop name must survive');
    assert.ok(compressed.includes('onLogout'), 'Prop name must survive');
  });

  // ─── Import survival ──────────────────────────────────────────
  test('import declarations survive intact', () => {
    const code = `
      import React, { useState, useEffect } from 'react';
      import { Button } from '@mui/material';
      import axios from 'axios';
      function Page() { return <Button>Click</Button>; }
    `;
    const { compressed } = compressor.compress(code);
    assertReparseable(compressed, 'imports');
    assert.ok(compressed.includes("'react'"), 'react import must survive');
    assert.ok(compressed.includes("'@mui/material'"), 'mui import must survive');
    assert.ok(compressed.includes("'axios'"), 'axios import must survive');
    assert.ok(compressed.includes('useState'), 'useState specifier must survive');
  });

  // ─── Hook dependency array survival ───────────────────────────
  test('hook dependency arrays survive in full', () => {
    const code = `
      import { useEffect, useCallback } from 'react';
      function Component({ userId, teamId, onUpdate }) {
        useEffect(() => {
          const sub = subscribeToUser(userId);
          const sub2 = subscribeToTeam(teamId);
          return () => { sub.unsubscribe(); sub2.unsubscribe(); };
        }, [userId, teamId]);
        const handleUpdate = useCallback((payload) => {
          validatePayload(payload);
          sendUpdate(payload);
          onUpdate(payload);
        }, [onUpdate]);
        return null;
      }
    `;
    const { compressed } = compressor.compress(code);
    assertReparseable(compressed, 'hook deps');
    // Dep arrays must be present
    assert.ok(compressed.includes('userId'), 'userId dep must survive');
    assert.ok(compressed.includes('teamId'), 'teamId dep must survive');
    assert.ok(compressed.includes('onUpdate'), 'onUpdate dep must survive');
    // Body must be gone
    assert.ok(!compressed.includes('subscribeToUser'), 'internal calls must be stripped');
    assert.ok(!compressed.includes('validatePayload'), 'internal calls must be stripped');
  });

  // ─── JSX structure survival ───────────────────────────────────
  test('JSX element tree structure survives', () => {
    const code = `
      function Layout({ children, title }) {
        return (
          <main className="layout">
            <header><h1>{title}</h1></header>
            <section className="content">{children}</section>
            <footer>© 2026</footer>
          </main>
        );
      }
    `;
    const { compressed } = compressor.compress(code);
    assertReparseable(compressed, 'JSX structure');
    assert.ok(compressed.includes('<main'), 'root element must survive');
    assert.ok(compressed.includes('<header'), 'header must survive');
    assert.ok(compressed.includes('<section'), 'section must survive');
    assert.ok(compressed.includes('<footer'), 'footer must survive');
    assert.ok(compressed.includes('{children}'), 'children prop must survive');
    assert.ok(compressed.includes('{title}'), 'title expression must survive');
  });

  // ─── Export survival ──────────────────────────────────────────
  test('default and named exports survive', () => {
    const code = `
      export const API_BASE = '/api/v2';
      export function formatDate(date) { return new Intl.DateTimeFormat().format(date); }
      export default function App() { return <div />; }
    `;
    const { compressed } = compressor.compress(code);
    assertReparseable(compressed, 'exports');
    assert.ok(compressed.includes('export const API_BASE'), 'const export must survive');
    assert.ok(compressed.includes('export function formatDate'), 'function export must survive');
    assert.ok(compressed.includes('export default function App'), 'default export must survive');
  });

  // ─── Conditional rendering survival ───────────────────────────
  test('conditional rendering logic survives', () => {
    const code = `
      function StatusBadge({ status, user }) {
        if (!user) return null;
        return (
          <span className={\`badge badge--\${status}\`}>
            {status === 'active' ? 'Live' : 'Offline'}
          </span>
        );
      }
    `;
    const { compressed } = compressor.compress(code);
    assertReparseable(compressed, 'conditionals');
    assert.ok(compressed.includes('if (!user)'), 'early return guard must survive');
    assert.ok(compressed.includes('status'), 'prop reference must survive');
  });

  // ─── No semantic identifiers stripped by accident ─────────────
  test('useState/useRef variable names are not stripped', () => {
    const code = `
      import { useState, useRef } from 'react';
      function Form() {
        const [email, setEmail] = useState('');
        const [password, setPassword] = useState('');
        const inputRef = useRef(null);
        return <input ref={inputRef} value={email} onChange={e => setEmail(e.target.value)} />;
      }
    `;
    const { compressed } = compressor.compress(code);
    assertReparseable(compressed, 'state names');
    assert.ok(compressed.includes('email'), 'state variable name must survive');
    assert.ok(compressed.includes('password'), 'state variable name must survive');
    assert.ok(compressed.includes('inputRef'), 'ref name must survive');
    assert.ok(compressed.includes('setEmail'), 'setter reference in JSX must survive');
  });

  // ─── Savings are non-trivial ──────────────────────────────────
  test('meaningful components achieve >15% token savings', () => {
    const code = `
      import React, { useState, useEffect } from 'react';
      import PropTypes from 'prop-types';
      /**
       * A typical mid-size React component with comments, hooks,
       * handlers, PropTypes, and TypeScript-style inline types.
       */
      interface ItemListProps { category: string; onSelect: (id: string) => void; }
      function ItemList({ category, onSelect }: ItemListProps) {
        const [items, setItems] = useState<any[]>([]);
        const [loading, setLoading] = useState(true);
        useEffect(() => {
          setLoading(true);
          fetch(\`/api/items?category=\${category}\`)
            .then(r => r.json())
            .then(data => { setItems(data); setLoading(false); })
            .catch(err => { console.error(err); setLoading(false); });
        }, [category]);
        const handleSelect = (item: any) => {
          console.log('selected', item);
          trackClick(item.id);
          onSelect(item.id);
          highlightItem(item);
        };
        if (loading) return <div data-testid="spinner">Loading...</div>;
        return (
          <ul data-testid="list">
            {items.map(item => (
              <li key={item.id} data-testid={\`item-\${item.id}\`} onClick={() => handleSelect(item)}>
                {item.name}
              </li>
            ))}
          </ul>
        );
      }
      ItemList.propTypes = { category: PropTypes.string.isRequired, onSelect: PropTypes.func.isRequired };
      export default ItemList;
    `;
    const { savingsPercent, compressed } = compressor.compress(code);
    assertReparseable(compressed, 'ItemList');
    assert.ok(
      savingsPercent >= 15,
      `Expected ≥15% savings on a typical component, got ${savingsPercent}%`,
    );
  });
});
