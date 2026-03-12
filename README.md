# React Preprocessor

A smart context optimizer for React developers. Instantly strip visual bloat and non-essential syntax from your files before sending them to Claude, ChatGPT, or GitHub Copilot. 

Fit massive React components into your context window, reduce API costs, and keep your AI focused purely on the logic.

## Why It Exists

Large React files are packed with UI styling, SVG paths, and metadata that consume thousands of tokens but offer zero value to an LLM trying to fix a bug or write a hook. 

React Preprocessor intelligently skeletonizes your code, drastically reducing token count while preserving the semantic structure and logic the AI actually needs.

- **Maximize Context:** Fit more files into a single prompt.
- **Save Costs:** Reduce your pay-as-you-go API bills.
- **100% Local & Private:** Processing happens entirely on your machine. Your code is never sent to a third-party server by this extension.

## Features

- **Quick Copy:** Instantly copy a compressed version of your file to the clipboard.
- **Copilot Integration:** Use the `@processor` participant directly in your GitHub Copilot chat.
- **Live Metrics:** Status bar indicator shows your exact token savings in real-time.
- **Broad Support:** Works seamlessly with `.js`, `.jsx`, `.ts`, and `.tsx` files.

## Quick Start

1. Open any React or TypeScript file.
2. Run `React Preprocessor: Copy Compressed File to Clipboard` from the Command Palette.
3. Paste the optimized code into your LLM chat.

**Keyboard Shortcuts:**
- Windows/Linux: `Ctrl+Shift+Alt+C`
- macOS: `Cmd+Shift+Alt+C`

## Commands
- `React Preprocessor: Copy Compressed File to Clipboard`
- `React Preprocessor: Compress Active File`
- `React Preprocessor: Compress Selection`

## Requirements
- VS Code `^1.110.0`