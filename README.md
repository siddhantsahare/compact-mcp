# compact-mcp

**React AST intelligence for Claude Code, Cursor, Windsurf, and any MCP-compatible AI assistant. Map component trees, trace dependencies, extract raw source — 73–98% fewer tokens on React codebase tasks.**

[![CI](https://github.com/siddhantsahare/compact-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/siddhantsahare/compact-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/compact-mcp)](https://www.npmjs.com/package/compact-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## The problem

`components/App.tsx` in excalidraw is **85,610 tokens**. Reading it with Claude's native Read tool consumes nearly your entire Opus session budget — before you've done any work.

Three of the five most common bug triage workflows in a large React codebase require opening that file. Every time. Even when the bug has nothing to do with 95% of what's in it.

compact-mcp solves this with live Babel AST analysis: a structural skeleton of 200 files in one call, named function extraction with zero compression, and cross-file dependency tracing.

---

## Install (30 seconds)

The MCP config is the same JSON block across all clients — only the file location differs.

```json
{
  "mcpServers": {
    "compact": {
      "command": "npx",
      "args": ["-y", "compact-mcp"]
    }
  }
}
```

**Claude Code** — add to `.mcp.json` at your project root, then `/restart`:

```
your-project/
└── .mcp.json   ← paste the block above
```

**Cursor** — add to `.cursor/mcp.json` at your project root (or `~/.cursor/mcp.json` for global):

```
your-project/
└── .cursor/
    └── mcp.json   ← paste the block above
```

**Windsurf** — add to `~/.codeium/windsurf/mcp_config.json`:

```
~/.codeium/windsurf/
└── mcp_config.json   ← paste the block above
```

**Continue** — add under `mcpServers` in `~/.continue/config.json`:

```
~/.continue/
└── config.json   ← paste the block above
```

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```
~/Library/Application Support/Claude/
└── claude_desktop_config.json   ← paste the block above
```

> **Requirements:** Node.js 18+. The `npx` command pulls the latest version automatically — no global install needed.

After every tool call, Claude shows a live savings line at the bottom of its response:

```
📊 compact_map: 206 files | 343,250 raw tokens → 7,722 skeleton tokens | saved 335,528 tokens (98%)
📊 compact_expand: 847 tokens (function) vs 6,200 tokens (full file) | saved 5,353 tokens (86%)
```

---

## Three tools

### `compact_map` — orient without reading everything

Walk all `.tsx/.jsx/.ts/.js` files and return a structural skeleton: component names, props, hooks, top-level renders, exports. One call replaces 5–10 exploratory Read calls at the start of a session.

```
── src/components/Navbar.tsx
  export Navbar({ user, onLogout })
  hooks: useContext(AuthContext), useState(false)
  renders: <Logo />, <NavLinks />, <UserAvatar user={user} />

── src/hooks/useAuth.ts
  export useAuth()
  hooks: useContext(AuthContext), useEffect, useState(null)
```

**Use at the start of any multi-file task.** Don't call it again in the same session — the output stays in context.

---

### `compact_expand` — drill down without reading the whole file

Get the raw, 100% uncompressed source of a specific named function. Zero compression — exact code, nothing changed. More token-efficient than reading the whole file when you only need one function.

```
compact_expand("isPointHittingLink", "packages/excalidraw/components/hyperlink/helpers.ts")
```

Returns the exact function body. Always use this before editing — never edit based on `compact_map` output.

---

### `compact_deps` — trace relationships instantly

Get the full dependency chain for a React component: who renders it, what props it receives, what contexts it consumes, what hooks it uses, what it renders.

```
CheckoutForm
  defined in: src/components/checkout/CheckoutForm.tsx

RENDERED BY:
  CheckoutPage (src/pages/CheckoutPage.tsx) [props: cartItems, onSuccess]

PROPS RECEIVED:
  cartItems, onSuccess, currency?

CONTEXT CONSUMED:
  AuthContext, CartContext

HOOKS:
  useContext(AuthContext), useState, useEffect, useCallback

RENDERS:
  <CartSummary />, <PaymentForm />, <OrderConfirmation />
```

Replaces 6+ Read calls to manually trace this.

---

## Benchmark results

### Bug navigation — 5 real excalidraw issues

Simulated with actual file reads against a shallow clone of [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw).

```
Issue                                  Without MCP   With MCP   Saved
──────────────────────────────────────────────────────────────────────
#9281  Ctrl+S triggers browser save      97,087       3,009     97%
#9535  Shortcut after context menu       91,302       1,576     98%
#9708  Mermaid <br> tags literal text     7,609         949     88%
#9710  RTL slider wrong position         10,500         951     91%
#9637  Mobile hyperlinks not clickable   94,522       2,861     97%
──────────────────────────────────────────────────────────────────────
TOTAL                                   301,020       9,346     97%
```

`compact_map` cost: 4,470 tokens. Fully amortized after the first issue — the remaining 4 are essentially free orientation.

### Feature development — 4 scenarios

```
Scenario                               Without MCP   With MCP   Saved
──────────────────────────────────────────────────────────────────────
Add tooltip to toolbar button           13,100        3,400     74%
Add export to new file format           16,200        3,350     79%
Add new element type                    18,100        4,010     78%
Add persistent user preference          12,400        3,300     73%
──────────────────────────────────────────────────────────────────────
TOTAL                                   59,800       14,060     76%
```

### Full project skeleton — excalidraw (206 files)

```
Raw tokens (native Read all files):   343,250
Skeleton tokens (compact_map):          7,722
Tokens saved:                         335,528
Savings:                                  98%
Time:                                   1.5s
```

Token counting uses `gpt-tokenizer` (exact BPE, offline — no network, no approximation).

Run the benchmark yourself:

```bash
git clone --depth 1 https://github.com/excalidraw/excalidraw /tmp/excalidraw
node scripts/benchmark-mcp.mjs /tmp/excalidraw packages/excalidraw/src
```

---

## How the savings work

The savings are not from hiding information — they are from not reading files that aren't relevant to the task.

| Stage | Tool | Compression? |
|---|---|---|
| Orientation (which file? which component?) | `compact_map` | Yes — 98% reduction |
| Relationships (who renders what? what props?) | `compact_deps` | Yes — synthesized from full AST |
| Implementation detail (exact code to edit) | `compact_expand` | **No — 100% raw source** |

Claude never edits based on compressed output. `compact_expand` always returns exact source. The compression only applies to context files — files you read to understand the codebase, not the file you're editing.

---

## AI assistant rules (optional but recommended)

compact-mcp works without any extra config — the AI reads the tool descriptions and calls the right tool automatically. But if you want consistent behaviour across every session, add these rules to your AI assistant's project instructions file:

| Client | File |
|---|---|
| Claude Code | `CLAUDE.md` in project root |
| Cursor | `.cursor/rules` or Settings → Rules |
| Windsurf | `.windsurfrules` in project root |
| Continue | `.continue/config.json` → `systemMessage` |

```markdown
## When to use compact_map
- At the START of any task involving multiple React/TS files
- When asked to "understand", "explain", or "explore" the codebase
- When you don't know which file to edit yet
- DO NOT call compact_map if the user already told you the exact file to edit
- DO NOT call compact_map twice in the same session — reuse what's in context

## When NOT to use compact tools
- For the file you are about to EDIT — always use native Read for the edit target
- For non-JS/TS files (YAML, JSON, Prisma, Python, SQL, Markdown, CSS)

## Edit safety rule
NEVER generate edits based on compact_map or compact_deps output.
ALWAYS call compact_expand first, then use native Read/Edit for the actual change.
```

---

## vs RTK and Repomix

| | compact-mcp | RTK | Repomix |
|---|---|---|---|
| What it compresses | React/TS file structure | CLI terminal output | Entire repo → single file |
| Mechanism | Babel AST (React-aware) | Text filters | Tree-sitter (language-agnostic) |
| Token savings | 73–98% | 60–90% | ~70% |
| React-specific intelligence | Yes | No | No |
| Per-function extraction | Yes (`compact_expand`) | No | No |
| Cross-file dependency tracing | Yes (`compact_deps`) | No | No |
| Interactive per-call | Yes | Yes | No (one-shot dump) |

**RTK** compresses shell command output — `git status`, test runners, build logs. It can also wrap `cat` and `ls`, but uses text filtering, not AST — no concept of hooks, props, or component structure. Use RTK + compact-mcp together; they solve different problems.

**Repomix** generates a static repo dump with ~70% compression via Tree-sitter. No React-specific intelligence, no per-function extraction, not interactive.

---

## How it works

compact-mcp is built on [Babel](https://babeljs.io/) — the same parser that powers every major React build tool. It runs 13 compression rules against the AST:

- `stripComments`, `stripConsoleLogs`, `stripTypeAnnotations`
- `summarizeHooks` — replaces hook bodies with call summaries
- `summarizeHandlers` — collapses event handler bodies
- `collapseHelperBodies` — replaces helper implementations with `/* implementation */`
- `skeletonizeTypes` — collapses TS interfaces to `{ /* id, name, email */ }`
- `stripJsxAttributes`, `stripPropTypes`, `stripTestAttributes`
- `collapseStyles`, `pruneUnusedImports`, `skeletonizeJsx`

`compact_expand` bypasses all rules and returns byte-range-sliced raw source. It never summarises.

No LLM calls inside the server. Pure AST. Fully local. Nothing leaves your machine.

---

## Security

- **Path traversal protection** — resolved file paths are validated against `rootDir` before reading
- **No code execution** — Babel runs in parse-only mode; no `eval`, no `child_process`, no shell out
- **No outbound HTTP** — fully local filesystem I/O
- **Clean audit** — `npm audit --omit=dev` passes with zero high/critical issues in production dependencies

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports with minimal reproductions are most welcome. PRs that improve compression accuracy on real React patterns are especially valuable.

---

## License

[MIT](LICENSE) © Siddhant Sahare
