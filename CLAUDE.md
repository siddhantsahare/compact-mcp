# Compact MCP — Usage Rules for Claude Code

Compact MCP is installed in this project. It gives you deep React intelligence via
live Babel AST analysis. Three tools are available: `compact_map`, `compact_expand`,
`compact_deps`.

---

## When to use compact_map

Call `compact_map` at the **start** of any task that involves multiple files:

- You don't know which file to edit yet
- You're exploring or explaining an unfamiliar codebase
- You're refactoring across more than two files
- You need to understand the component tree before making a decision

**Do NOT call compact_map if:**
- The user already told you the exact file to edit
- You already called it earlier in this conversation (the output is in your context — reuse it)
- The task is a single-file change with a known path

---

## When to use compact_expand

Call `compact_expand` when you have seen a skeleton (from compact_map) and need the
implementation detail of one specific function before editing it.

**Rule:** Never write edits based on compressed output. Always expand the target
function first, then edit.

Use compact_expand when:
- compact_map showed you a component and you need to see its full implementation
- You want to inspect one hook body or handler without reading the whole file

Use native **Read** instead when:
- The file is under ~100 lines (just read it)
- You need more than 3 functions from the same file (read the whole file)
- You need exact line numbers for debugging

---

## When to use compact_deps

Call `compact_deps` when you need to understand a component's relationships:

- Adding a prop and need to know every parent that renders this component
- Debugging a re-render and need the full blast radius
- Refactoring a component and need to know everything it touches

---

## The file you are editing: always use native Read

The file you are about to **edit** must always be read with Claude's native Read tool
before writing any changes. Compact tools are for orientation only — never for the
edit target.

---

## Non-JS/TS files

Compact tools only handle `.tsx/.jsx/.ts/.js` files.
For `.yaml`, `.json`, `.prisma`, `.py`, `.sql`, `.md`, `.css` — use native Read.
If a compact tool returns `[non-js]`, fall back to native Read.

---

## Fallback contract

| Signal returned | Action |
|---|---|
| `[non-js]` | Use native Read |
| `[no-react]` | Use native Read — no React files found |
| `[not-found]` | Check the symbol list in the error, retry or use native Read |
| `[parse-error]` | Use native Read |
| `[truncated]` | Pass a narrower `rootDir` to compact_map |
