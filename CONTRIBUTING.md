# Contributing to compact-mcp

Thanks for wanting to improve compact-mcp. This is a focused project — contributions that make the React AST intelligence more accurate, faster, or better at saving tokens are most welcome.

## What we want

- **Bug fixes** for incorrect compression output (wrong skeleton, missed hooks, broken compact_expand)
- **Accuracy improvements** to the skeleton format (better prop extraction, hook detection, renders list)
- **Performance** — faster walker, lower memory on large repos
- **New React patterns** that the compressor currently mishandles (see `src/rules/`)

## What we don't want (yet)

- New languages (compact-mcp is intentionally React/TypeScript-specific)
- New MCP tools without a discussion issue first
- Changes to the skeleton output format without a discussion issue (it's a contract with Claude)

## Setup

```bash
git clone https://github.com/siddhantsahare/merlin-optimus
cd merlin-optimus
npm install
npm run build
```

Run tests:
```bash
node --test dist/test/**/*.test.js
```

Run the Excalidraw benchmark (requires a shallow clone of excalidraw):
```bash
git clone --depth 1 https://github.com/excalidraw/excalidraw /tmp/excalidraw
node scripts/benchmark-mcp.mjs /tmp/excalidraw packages/excalidraw/src
```

## Making a change

1. Open an issue first for anything non-trivial — describe the problem before the solution
2. Fork and create a branch: `fix/compact-expand-class-method` or `feat/compact-deps-context-display`
3. Make your change. Add or update a test in `src/test/` if you're changing compressor behaviour
4. Run `npm run build && node --test dist/test/**/*.test.js` — must pass
5. Run `npm run lint` — must pass
6. Open a PR with a clear description of what changed and why

## Key files

| Path | What it does |
|---|---|
| `src/rules/` | The 13 compression rules. Each rule is a Babel visitor. |
| `src/compressor.ts` | Orchestrates rules, applies them in order |
| `src/parser.ts` | Babel parser wrapper + token counting |
| `src/mcp/walker.ts` | File system walker used by compact_map and compact_deps |
| `src/mcp/tools/compact-map.ts` | compact_map implementation |
| `src/mcp/tools/compact-expand.ts` | compact_expand implementation |
| `src/mcp/tools/compact-deps.ts` | compact_deps implementation |

## Rule ordering matters

The rules in `src/rules/index.ts` run in a fixed order. A rule that runs early can remove nodes that a later rule would have operated on. If you add or reorder rules, check the interaction with `skeletonizeTypes` vs `stripTypeAnnotations` (see the critical bug fix in CHANGELOG.md for why this matters).

## Reporting compression bugs

The most useful bug report is: "I passed this input and got this output, but I expected this instead." Paste a minimal reproduction — a 20-line React component that triggers the issue is more useful than a 400-line file.
