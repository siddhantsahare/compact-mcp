# Changelog

All notable changes to compact-mcp are documented here.

---

## [1.0.1] — 2026-04-11

### Added

- **Prompt templates** — 3 MCP prompt templates registered: `compact_map_project`, `compact_explain_component`, `compact_expand_function`. Surface as slash commands in Claude Code and Cursor.
- **Multi-client install docs** — README now includes exact config file paths for Claude Code, Cursor, Windsurf, Continue, and Claude Desktop.
- **Competitive analysis** — `md/competitive-analysis.md` updated with full code-review-graph comparison.
- **Security scanner** — `.claude/commands/security-scan.md` — 10-category pre-publish security scanner runnable as `/security-scan`.

### Fixed

- `compact-mcp-publish/package.json` — README was not included in published package. Fixed publish script to copy README before publishing.
- `compact-map.ts` — replaced `declare namespace babel { type NodePath = any }` hack with proper `import type { NodePath } from '@babel/traverse'`.
- `compact-deps.ts` — removed duplicate `ComponentDef`, `ComponentUsage`, `FileAnalysis` interface definitions.
- `semantic.test.ts` — removed dead `topLevelNames` function and orphaned `traverse` import.

### Changed

- `compact-mcp-publish/package.json` — explicit `zod: ^3.25.0` dependency added (was relying on transitive resolution via MCP SDK).
- `compact-mcp-publish/package.json` — `files` field tightened to exclude `extension.*`, `benchmark.*`, `run_evals.*`, `tools.*`, `test/` from published package. Package size: 388 kB → 195 kB.
- npm keywords updated to `mcp, react, claude-code, cursor, ast, babel, typescript, token-optimization, react-ast, model-context-protocol`.
- Repository renamed from `merlin-optimus` to `compact-mcp` on GitHub.

---

## [1.0.0] — 2026-04-10

### Added

- **`compact_map`** — Walk all `.tsx/.jsx/.ts/.js` files in a project and return a structural skeleton: component names, props, hooks, top-level renders, and exports. One tool call replaces 5–10 exploratory Read calls at the start of a session.
- **`compact_expand`** — Return raw uncompressed source of a specific named function or component. Always returns 100% exact source — no summarisation. Supports function declarations, arrow functions, class methods, and object methods.
- **`compact_deps`** — Return the full dependency chain for a React component: RENDERED BY, PROPS RECEIVED, CONTEXT CONSUMED, HOOKS, RENDERS. Replaces 6+ Read calls to manually trace a component.
- **Metrics footer** on every tool response — tokens saved, files scanned, compression percentage.
- **`rootDir` parameter** on all tools for monorepo support.
- **200-file hard cap** on `compact_map` with truncation notice and rootDir hint.
- **`[non-js]` signal** for non-JavaScript files — tool returns a fallback signal instead of raw content or an error.
- **CLAUDE.md** shipped with rules for when to use each tool and when to fall back to native Read.

### Fixed

- **`stripTypeAnnotations` / `skeletonizeTypes` ordering bug** — `stripTypeAnnotations` was deleting `TSInterfaceDeclaration` and `TSTypeAliasDeclaration` nodes before `skeletonizeTypes` could collapse them. `skeletonizeTypes` was effectively dead code in the default configuration. Fixed by removing interface/type alias declaration visitors from `stripTypeAnnotations` — they are now handled exclusively by `skeletonizeTypes`, which emits compact `{ /* id, name, email */ }` summaries.

### Security

- **Path traversal guard in `compact_expand`** — resolved file path is now checked against `rootDir` before reading. Paths that escape the project root return `[error] Path traversal not allowed` instead of reading arbitrary files.

---

## Benchmark Results (Excalidraw)

Ran against `excalidraw/excalidraw` (`packages/excalidraw/src`, 206 files):

| Metric | Value |
|---|---|
| Raw tokens (native Read all files) | 343,250 |
| Skeleton tokens (compact_map) | 7,722 |
| Tokens saved | 335,528 |
| Savings | **98%** |
| Time | 1.5s |

Eval across 5 real GitHub issues (bug navigation):

| Issue | Without MCP | With MCP | Saved |
|---|---|---|---|
| #9281 Ctrl+S browser save dialog | 97,087 | 3,009 | 97% |
| #9535 Shortcut after context menu | 91,302 | 1,576 | 98% |
| #9708 Mermaid br tags literal text | 7,609 | 949 | 88% |
| #9710 RTL slider wrong position | 10,500 | 951 | 91% |
| #9637 Mobile hyperlinks not clickable | 94,522 | 2,861 | 97% |
| **TOTAL** | **301,020** | **9,346** | **97%** |

Token counting uses `gpt-tokenizer` (exact BPE, offline).

### Feature Development Eval (4 scenarios)

Feature dev requires more context than bug navigation — 4–7 reference files to understand existing patterns, plus the edit target.

| Scenario | Without MCP | With MCP | Saved |
|---|---|---|---|
| Add tooltip to toolbar button | 13,100 | 3,400 | 74% |
| Add export to new file format | 16,200 | 3,350 | 79% |
| Add new element type | 18,100 | 4,010 | 78% |
| Add persistent user preference | 12,400 | 3,300 | 73% |
| **TOTAL** | **59,800** | **14,060** | **76%** |

Feature dev saves slightly less than bug navigation (76% vs 97%) because the target file must always be read raw — but `compact_expand` on 2–3 reference functions replaces reading 4–6 full files for pattern context.
