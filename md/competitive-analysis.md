# Competitive Analysis — compact-mcp vs RTK vs Repomix

## Summary

| | compact-mcp | RTK | Repomix |
|---|---|---|---|
| **What it compresses** | React/TS file structure | CLI terminal output | Entire repo → single file |
| **Mechanism** | Babel AST (React-aware) | Text filters on shell output | Tree-sitter (language-agnostic) |
| **Token savings** | 73–98% | 60–90% | ~70% |
| **React-specific intelligence** | Yes (hooks, props, dep chains) | No | No |
| **Per-function extraction** | Yes (`compact_expand`) | No | No |
| **Cross-file dependency tracing** | Yes (`compact_deps`) | No | No |
| **Interactive / per-call** | Yes | Yes (wraps CLI commands) | No (one-shot dump) |
| **Works on non-JS files** | Falls back gracefully | Yes | Yes |
| **npm install** | `npx compact-mcp` | Binary install | `npx repomix` |

---

## RTK (Rust Token Killer)

**What it is:** A Rust binary that acts as a proxy between shell commands and the LLM. When Claude runs `git status`, `docker logs`, or `npm test`, RTK intercepts the output and strips redundant tokens before they reach the context window.

**Claimed savings:** 60–90% on CLI output. Their 90% headline is achieved with combined filters on specific commands (git + test runner output).

**Why it's not a substitute for compact-mcp:**
- RTK compresses **shell command output** — it has nothing to say about code files.
- RTK doesn't know what a React component is, what hooks it uses, or who renders it.
- A developer using RTK still reads entire files raw with Claude's native Read tool.
- The token problems RTK solves (verbose git status, 500-line test output) are different from the token problems compact-mcp solves (reading 6 files to understand one component's context).

**RTK + compact-mcp are complementary, not competitive.** A well-configured session uses both:
- RTK: compress terminal output
- compact-mcp: compress codebase reading

---

## Repomix

**What it is:** Packs an entire repo into a single AI-readable file, with optional `--compress` flag that uses Tree-sitter to strip function bodies (~70% reduction).

**Claimed savings:** ~70% with `--compress`.

**Why compact-mcp outperforms it for interactive sessions:**

### 1. Savings: 98% vs 70%
compact_map achieves 98% on excalidraw because it extracts only semantically meaningful structural information (component name, props, hooks, what it renders) — not just stripping function bodies. Tree-sitter's approach preserves more content.

### 2. React intelligence vs generic compression
Repomix's Tree-sitter compression is language-agnostic — it doesn't understand:
- Hook dependency arrays (which tells you *what triggers re-renders*)
- Prop destructuring shapes (which tells you *what a component accepts*)
- JSX render tree (which tells you *what a component outputs*)

compact_map surfaces all three in a structured, consistent format per file.

### 3. Interactive vs static
Repomix generates a static dump. Every conversation starts by re-generating and re-uploading the whole file. compact-mcp responds to targeted queries:
- "Show me the dependency chain of CheckoutForm" → `compact_deps`
- "Show me the raw source of `handleSubmit`" → `compact_expand`
- "Map this whole project" → `compact_map`

### 4. Per-function extraction with zero compression
`compact_expand` returns 100% raw, uncompressed source of a named function. Repomix has no equivalent — you'd read the whole compressed file and try to locate the function manually.

### 5. Edit safety
compact-mcp's design rule: **always read the target file raw before editing** (via Claude's native Read). Repomix's compressed output cannot be used for editing — you'd be patching a summarised version.

---

## Where each tool wins

| Task | Best tool | Why |
|---|---|---|
| Running `git log`, `npm test`, reading build output | RTK | Compresses terminal output, not files |
| "Explain how this whole app is structured" | compact-mcp (`compact_map`) | 98% skeleton in one call |
| "Who renders CheckoutForm and what props does it pass?" | compact-mcp (`compact_deps`) | Cross-file AST analysis |
| "Show me the full source of `handleSubmit`" | compact-mcp (`compact_expand`) | Named symbol extraction, 100% raw |
| Sharing entire codebase context with a non-interactive LLM | Repomix | One-shot static dump, any language |
| Adding a feature, understanding existing patterns | compact-mcp | 73–79% savings on pattern-context reads |
| Non-React project (Python, Go, Ruby) | Repomix | compact-mcp is JS/TS-only |

---

## Positioning

compact-mcp is the only tool that provides **React-specific live AST intelligence for Claude Code**. The token savings (73–98%) are a side effect of answering the right question at the right granularity — not general-purpose compression.

RTK and Repomix are general-purpose compression tools. compact-mcp is a React-specific intelligence layer. The comparison is informative but not apples-to-apples.
