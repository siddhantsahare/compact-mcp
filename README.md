# Compact AI: The Context Pre-Processor & Autonomous Agent

A smart context optimizer and autonomous coding agent for React developers. Instantly strip visual bloat and non-essential syntax from your massive React files to prevent LLM "context window collapse." Use the native `@compact` Copilot participant to seamlessly hunt down bugs, understand complex architectures, and autonomously refactor code across multiple files without chat UI lag.

Fit massive enterprise React components into your context window, reduce API costs by up to 80%, and keep your AI focused purely on the logic.

## 🧠 Why It Exists

Large React files are packed with UI styling, SVG paths, and heavy `className` metadata. This consumes thousands of tokens but offers zero value to an LLM trying to fix a hook or trace a state bug. When standard AI agents read these raw files, they suffer from the "Lost in the Middle" effect — hallucinating, freezing, or ignoring code entirely.

Compact solves this by instantly skeletonizing your code. It strips away the visual noise, leaving only the semantic structure, hooks, and logic the AI actually needs to do its job.

- **Maximize Context:** Fit 3x to 5x more files into a single LLM prompt.
- **Save Costs:** Drastically reduce your pay-as-you-go API bills by cutting up to 80% of tokens per file.
- **100% Local & Private:** Your code is compressed entirely on your machine and never sent to a third-party server by this extension.

## ⚡ Core Features

- **The `@compact` Agent:** An advanced GitHub Copilot Chat participant. Ask it to find a bug, and it will autonomously search your workspace, read your files, find the logical error, and fix it.
- **Silent Editor (Agent Mode):** Bypasses the slow, clunky text generation of standard AI chats. Compact applies precise code edits directly to your VS Code editor instantly.
- **Safe "Dirty" Edits:** Autonomous edits are applied directly to the file but left unsaved. Review the exact diff in real-time and simply hit `Ctrl+Z` to revert if needed.
- **Deep Dive Extraction:** If the LLM needs to see the exact raw syntax of a specific function, the agent autonomously extracts only that specific component, saving massive context space.
- **Live Token Metrics:** A real-time status bar indicator shows your exact token savings on the active file.

## 🚀 Quick Start

### Using the Autonomous Agent

1. Open the GitHub Copilot Chat panel.
2. Type `@compact` followed by your request.

**Example:**
> `@compact I noticed a bug in the booking state logic. Find where isOngoing is calculated, fix the logic, and apply the edit directly.`

### Using the Manual Context Optimizer

1. Open any React or TypeScript file (`.js`, `.jsx`, `.ts`, `.tsx`).
2. Run `Compact: Copy Compressed File to Clipboard` from the Command Palette.
3. Paste the optimized skeleton code into Claude, ChatGPT, or your preferred AI.

**Keyboard Shortcuts:**
- Windows/Linux: `Ctrl+Shift+Alt+C`
- macOS: `Cmd+Shift+Alt+C`

## Commands

- `Compact: Copy Compressed File to Clipboard`
- `Compact: Compress Active File`
- `Compact: Compress Selection`

---

## Claude Code MCP Server

Compact ships as an MCP server for **Claude Code** — giving Claude deep React
intelligence via live Babel AST analysis. No LLM calls inside the server. Pure AST.

### Install (30 seconds)

Add to `.mcp.json` in your project root:

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

Restart Claude Code. Done. Claude now has three tools:

| Tool | What it does | Saves |
|---|---|---|
| `compact_map` | Structural skeleton of the whole project (components, hooks, exports) | 2,000–8,000 tokens vs exploratory reads |
| `compact_expand` | Raw source of a specific named function | Drill-down without reading whole file |
| `compact_deps` | Full dependency chain for a component (rendered-by, props, contexts, hooks, renders) | 6+ Read calls |

### Token savings — real benchmark (Excalidraw)

```
Repo:              excalidraw/excalidraw  (packages/excalidraw/src)
Files scanned:     206 component files
Raw tokens:        343,250  (reading every file with native Read)
Skeleton tokens:     7,722  (one compact_map call)
Tokens saved:      335,528  (98% reduction)
Time:                 1.5s
```

Measured with `gpt-tokenizer` (exact BPE, offline). Run the benchmark yourself:

```bash
node scripts/benchmark-mcp.mjs ~/excalidraw packages/excalidraw/src
```

Every token saved counts against your Claude Code rate limit (especially Opus).

### Requirements

- Node.js 18+
- Claude Code CLI, desktop app, or IDE extension

---

## VS Code Extension Requirements

- VS Code `^1.110.0`
- GitHub Copilot (for the `@compact` agent)