# Testing & Publishing Guide — React AST Preprocessor Extension

> **Target Release:** March 2026 | **Audience:** VS Code users (React/TypeScript developers)

---

## Phase 1: Local Testing (Today)

### 1.1 Build the Extension
```bash
npm run build
```
Outputs: `dist/extension.js` + all supporting modules.

### 1.2 Launch in VS Code (Debug Mode)
1. Open the project root in VS Code
2. Press `F5` or go to **Run → Start Debugging**
3. A new VS Code window opens with the extension active
4. You will see "React AST Preprocessor" among your installed extensions

### 1.3 Manual Testing Checklist

**Test 1: Status Bar appears on .tsx files**
- Open any `.tsx` or `.jsx` file
- Look at the bottom-right status bar
- You should see: `$(symbol-structure) 42% saved (407/634 tk)`
- Click it → "Copied to clipboard" message appears

**Test 2: Command palette works**
- Open any React file
- Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
- Type "React" → you should see all 3 commands:
  - React Preprocessor: Compress Active File
  - React Preprocessor: Compress Selection
  - React Preprocessor: Copy Compressed File to Clipboard
- Select "Copy Compressed..." and verify clipboard is populated

**Test 3: Keyboard shortcut works**
- Open any React file
- Press `Ctrl+Shift+Alt+C` (or `Cmd+Shift+Alt+C` on Mac)
- Bottom-right toast: "Copied to clipboard — X → Y tokens (N% saved). Paste into your AI chat."

**Test 4: Right-click context menu**
- Open any `.tsx` file
- Right-click in the editor
- You should see "React Preprocessor: Copy Compressed File to Clipboard"
- Click it and verify clipboard has the compressed code

**Test 5: Copy to side panel**
- Open any React file
- Press `Ctrl+Shift+P` → "Compress Active File"
- A new editor tab opens on the right side showing the compressed version
- Verify that the code is syntactically valid (no red squiggles, parses as TypeScript)

**Test 6: Error handling**
- Open a broken `.tsx` file (with syntax errors)
- Try to compress it
- You should see: "Parse error: [error message]"
- The extension does NOT crash

**Test 7: Chat Participant (if you have GitHub Copilot or another LM extension)**
- Open any React file
- Open the Chat view (Copilot chat)
- Type `@processor` to reference the extension
- Ask it: "What does this component do?"
- It should respond with compressed context embedded in its answer

---

## Phase 2: Publish to VS Code Marketplace

### 2.1 Prerequisites
1. **Microsoft account** (free) — sign up at https://login.live.com
2. **VS Code Publisher identity** — register at https://marketplace.visualstudio.com/manage
3. **Personal Access Token (PAT)** — create one in your Azure DevOps account
4. **vsce CLI tool** — `npm install -g vsce`

### 2.2 Create Publisher Identity
```bash
vsce create-publisher <publisher-name>
# Example: vsce create-publisher siddhant-s
```
Follow prompts to log in with your Microsoft account.

### 2.3 Update package.json
Add this field to `package.json`:
```json
{
  "publisher": "siddhant-s",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_GITHUB_USERNAME/react-preprocessor-js"
  },
  "categories": ["Programming Languages", "Linters", "Other"],
  "keywords": ["react", "ast", "compression", "tokens", "llm"],
  "icon": "icon.png"
}
```

### 2.4 Create Extension Icon (Optional but Recommended)
- Save a 128×128 PNG image as `icon.png` in the project root
- Recommended: A simple React logo or AST tree icon
- VS Code Marketplace will display this on your extension page

### 2.5 Package the Extension
```bash
vsce package
```
Outputs: `react-preprocessor-0.1.0.vsix` (installable extension file)

To test the VSIX locally before publishing:
```bash
code --install-extension react-preprocessor-0.1.0.vsix
```

### 2.6 Publish to Marketplace
```bash
vsce publish
```

**First time?** You will be prompted for your Personal Access Token (PAT).

Save the token in `~/.vsce` for future publishes (or use `--pat YOUR_TOKEN` flag each time).

### 2.7 Verify Publication
After ~5 minutes, your extension appears on the Marketplace:
```
https://marketplace.visualstudio.com/items?itemName=siddhant-s.react-preprocessor
```

Users can now install it directly from VS Code:
1. Open Extensions (Ctrl+Shift+X)
2. Search "React Preprocessor"
3. Click Install

---

## Phase 3: Iterate & Update

### Update Workflow
```bash
# Make code changes
npm run build

# Test locally (F5 in VS Code debug window)

# Update version in package.json
# "version": "0.1.1"

# Commit changes
git add -A
git commit -m "feat: add [feature name]"

# Publish new version
vsce publish minor  # or patch/major
```

### Semantic Versioning
- `patch` (0.1.**1**) — Bug fixes, small improvements
- `minor` (0.**2**.0) — New features, backward compatible
- `major` (**1**.0.0) — Breaking changes, major redesign

---

## Phase 4: Gather Beta Feedback

### Beta Testers
Share the extension link with beta testers (React developers in your network):
```
https://marketplace.visualstudio.com/items?itemName=siddhant-s.react-preprocessor
```

### Feedback Collection
Ask testers to report:
1. **Does compression work?** (status bar shows token savings?)
2. **Does compressed code still make sense?** (paste into Claude, does it work?)
3. **Any crashes or errors?**
4. **Feature requests?** (selective rule disabling, config file support, etc.)

### Common Feedback Loops
- "The Tailwind stripping is too aggressive" → tune `stripJsxAttributes` rule
- "I want to preserve data-testid" → add `preserveTestAttrs` option
- "Can I use this from the command line?" → already built! `npx react-preprocessor file.tsx`

---

## Troubleshooting

### "Extension fails to load"
- Check `About → Show Logs` in VS Code
- Run `npm run build` to ensure dist/ is up-to-date
- Verify `"main": "./dist/extension.js"` exists in `package.json`

### "Status bar doesn't show"
- The status bar only appears for `.jsx`, `.tsx`, `.js`, `.ts` files (or files ending in these extensions)
- Check that your file has the correct extension
- Try opening a file from `/benchmarks/scenarios/` to test

### "Commands don't appear in palette"
- Run `npm run build` to regenerate dist/
- Reload the VS Code window (Ctrl+R while in the extension host)
- Check that commands are defined in `package.json` under `"contributes.commands"`

### "Clipboard command doesn't work"
- On Linux, you may need `xclip` or `xsel` installed
- On Windows/Mac, clipboard access is built-in and should work out of the box
- Check: Does the toast message appear? If yes, check your clipboard manually (Ctrl+V)

---

## Git Workflow for Publishing

```bash
# Before publishing, commit all changes
git add -A
git commit -m "release: v0.1.0 - Initial extension release

- CLI compression tool
- VS Code extension with 3 commands
- Keyboard shortcut Ctrl+Shift+Alt+C
- Status bar showing token savings
- 10/10 LLM judge parity on benchmark suite
- 50.6% average token compression
"

# Tag the release
git tag -a v0.1.0 -m "Initial VS Code extension release"

# Push to GitHub
git push origin main
git push origin v0.1.0

# Then publish to VS Code Marketplace
vsce publish
```

---

## Success Metrics (Post-Launch)

Track these to understand adoption:

| Metric | Target |
|---|---|
| Installs (first week) | 50+ |
| Installs (first month) | 500+ |
| Average rating | 4.5+ stars |
| Downloads growth | 10%+ week-over-week |
| GitHub stars | 10+  |
| Issues opened | <5 (high quality = fewer complaints) |

---

## Next Steps After v0.1 Stabilizes

1. **Configuration file support** (`.preprocessorrc.js` for enabling/disabling rules)
2. **Web extension** (run in github.dev, vscode.dev)
3. **Batch processing** (compress entire project folders)
4. **Integration with LLM providers** (auto-send to Claude/ChatGPT from extension)
5. **Treesitter vs Babel** (faster parsing for massive files)

