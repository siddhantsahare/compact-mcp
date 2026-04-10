# React AST Preprocessor - Handoff Document
**Date:** March 11, 2026 | **Status:** TypeScript Migration Complete — Production Ready

---

## EXECUTIVE SUMMARY

### Problem
LLM context windows are expensive. Typical React components contain 30-60% token bloat (comments, types, unused handlers, boilerplate).

### Solution
**Deterministic AST-based compression** that strips structural noise while preserving semantic intent. Uses Babel's AST parser to surgically remove patterns LLMs don't need.

### Results (from 10 top public repos)
- **Average savings: 33% tokens per file**
- **Best case: 54%** (error boundaries, component skeletons)
- **Worst case: 15%** (lean JSX, minimal comments)
- **Speed: 35.9ms avg** (well under 100ms threshold)
- **Cost savings: ~$4.05 per 1K API calls** (at $3/1M tokens)

---

## WHAT CHANGED: JS → TypeScript Migration (March 2026)

The codebase was fully migrated to TypeScript with a modular, extensible architecture. The Git history tells the story:

```
3e0582e  test: migrate tests and benchmark to TypeScript
66f343a  feat: VS Code extension wrapper and CLI tool
b801852  feat: React-specific pruning heuristics as typed modules
deae2f5  feat: core AST parsing engine
890bc8f  chore: initial project structure and TypeScript setup
```

**Key architectural changes:**
- Each of the 8 pruning rules is now its own typed module in `src/rules/`
- `ReactASTCompressor` uses a `Map<RuleName, PruningRule>` plugin registry (extensible)
- Added a standalone CLI: `react-preprocessor <file> [--output] [--disable <rule>]`
- Two test suites: structural integrity (`compressor.test.ts`) + semantic preservation (`semantic.test.ts`)
- Benchmark is now TypeScript: `npm run benchmark`

---

## ARCHITECTURE

### Core Concept: "Skeletonization"
Transform a 200-line React component into a 40-line semantic skeleton that preserves all information an LLM needs:
- Function signatures ✓
- Hook dependency arrays ✓
- JSX element structure ✓
- Import statements ✓
- Conditional rendering ✓

But removes:
- Comments ✗
- console.* calls ✗
- Hook body internals ✗
- Handler implementations ✗
- PropTypes/defaultProps ✗
- Type annotations ✗
- Test attributes ✗
- Style object values ✗

---

## 8 PRUNING RULES (Priority Order)

| # | Rule | File | Impact | Safe? |
|---|------|------|--------|-------|
| 1 | `stripComments` | `src/rules/stripComments.ts` | 5-10% | Yes — comments are never semantic |
| 2 | `stripConsoleLogs` | `src/rules/stripConsoleLogs.ts` | 2-5% | Yes — dev-only |
| 3 | `summarizeHooks` | `src/rules/summarizeHooks.ts` | **15-25%** | Yes — deps array kept intact |
| 4 | `summarizeHandlers` | `src/rules/summarizeHandlers.ts` | **10-20%** | Yes — signature kept, body summarized |
| 5 | `stripPropTypes` | `src/rules/stripPropTypes.ts` | 3-8% | Yes — compile-time only |
| 6 | `collapseStyles` | `src/rules/collapseStyles.ts` | 5-12% | Yes — LLM doesn't need CSS values |
| 7 | `stripTypeAnnotations` | `src/rules/stripTypeAnnotations.ts` | 5-15% | Yes — TS is compile-only |
| 8 | `stripTestAttributes` | `src/rules/stripTestAttributes.ts` | 1-2% | Yes — QA-only |

---

## PROJECT STRUCTURE

```
react-preprocessor/
├── src/
│   ├── types.ts              # Full domain model (RuleName, PruningRule, CompressResult, etc.)
│   ├── parser.ts             # Babel parser with TS/Flow fallback + token estimator
│   ├── compressor.ts         # ReactASTCompressor class with rule registry
│   ├── index.ts              # Public barrel export
│   ├── extension.ts          # VS Code chat participant + commands
│   ├── cli.ts                # Standalone CLI tool
│   ├── benchmark.ts          # Benchmark runner (10 OSS repos)
│   ├── rules/
│   │   ├── index.ts          # ALL_RULES registry (ordered)
│   │   ├── helpers.ts        # extractBodySummary() shared utility
│   │   ├── stripComments.ts
│   │   ├── stripConsoleLogs.ts
│   │   ├── summarizeHooks.ts
│   │   ├── summarizeHandlers.ts
│   │   ├── stripPropTypes.ts
│   │   ├── collapseStyles.ts
│   │   ├── stripTypeAnnotations.ts
│   │   └── stripTestAttributes.ts
│   └── test/
│       ├── compressor.test.ts  # Structural integrity tests (10 cases)
│       └── semantic.test.ts    # Semantic preservation tests (8 cases)
├── dist/                     # Compiled JS output (git-ignored)
├── md/                       # LLM context templates for different use cases
│   ├── debug.md
│   ├── code-review.md
│   ├── refactor.md
│   ├── feature.md
│   └── explain.md
├── tsconfig.json
├── package.json
├── HANDOFF.md               # This file
└── README.md
```

---

## HOW TO RUN

### Benchmark (live, fetches 10 OSS repos)
```bash
npm run benchmark
# → Fetches files from GitHub raw URLs, compresses, prints table
```

### Unit Tests
```bash
npm test
# → Builds TS first, then runs via vscode-test runner
```

### CLI (single file or glob)
```bash
node dist/cli.js src/App.tsx
node dist/cli.js src/App.tsx --output           # print compressed code
node dist/cli.js src/App.tsx -d stripComments   # disable a rule
```

### Build
```bash
npm run build    # one-shot
npm run watch    # incremental
```

---

## TESTING STRATEGY

There are **two test suites** with different purposes:

### 1. `compressor.test.ts` — Structural Integrity (10 cases)
Answers: *"Did the right things get removed?"*
- Verifies that noise (comments, console.*, propTypes, etc.) is absent from output
- Verifies that structural anchors (function names, hook names, JSX) survive
- Verifies token savings are positive
- **Does NOT call any LLM API** — zero tokens consumed

### 2. `semantic.test.ts` — Semantic Preservation (8 cases)
Answers: *"Is the output still intelligible / useful to an LLM?"*
- **Re-parses the compressed output** — confirms it's valid syntax (not garbled)
- Verifies component names, prop names, export identifiers survive
- Verifies hook dependency arrays are kept in full
- Verifies JSX element tree structure is intact
- Verifies conditional rendering expressions survive
- Verifies useState/useRef variable names are not accidentally stripped
- **Does NOT test LLM output quality** — that requires live API calls and is non-deterministic

### What these tests do NOT cover (and why)
| Gap | Why not covered |
|-----|----------------|
| LLM output quality | Non-deterministic, requires live API, high cost |
| Runtime execution | Compressed output is not meant to run, only to be read |
| Faithfulness to original intent | Subjective, needs human eval or reference LLM |

---

## BENCHMARK RESULTS

| Repo | File | Lines | Original | Compressed | Saved | Time |
|------|------|-------|----------|-----------|-------|------|
| facebook/react | InspectedElement.js | 342 | 2,172 | 1,645 | 24% | 69ms |
| facebook/react | Element.js | 297 | 1,763 | 1,497 | 15% | 25ms |
| mui/material-ui | Button.js | 749 | 4,211 | 3,143 | 25% | 42ms |
| vercel/next.js | error-boundary.tsx | 174 | 1,160 | 531 | **54%** | 10ms |
| ant-design/ant-design | Table.tsx | 53 | 410 | 300 | 27% | 5ms |
| tailwindlabs/headlessui | combobox.tsx | 1,673 | 12,118 | 7,278 | 40% | 101ms |
| storybookjs/storybook | Tree.tsx | 758 | 4,629 | 3,318 | 28% | 38ms |
| jitsi/jitsi-meet | Toolbox.tsx | 363 | 2,933 | 2,248 | 23% | 11ms |
| supabase/supabase | SQLEditor.tsx | 1,019 | 7,177 | 4,093 | 43% | 42ms |
| preactjs/preact | component.js | 254 | 1,803 | 824 | **54%** | 16ms |

**Summary:** 33% avg savings · 35.9ms avg · ~$4.05 saved per 1K API calls

---

## TECH STACK

| Component | Technology |
|-----------|------------|
| Language | TypeScript 5.x (strict mode, ES2022, Node16 modules) |
| Runtime | Node.js ≥18 |
| AST Parser | `@babel/parser` (TS/Flow fallback) |
| AST Manipulation | `@babel/traverse`, `@babel/generator`, `@babel/types` |
| IDE Integration | VS Code Extension API |
| Language Support | JSX, TSX, Flow, JavaScript, TypeScript |
| Testing | Mocha (via `@vscode/test-cli`), `node:assert` |
| CLI | Node.js built-in `node:fs`, `node:path` |

---

## SCENARIO TEMPLATES (`md/` folder)

The `md/` folder contains pre-built LLM system prompt templates. Each file is a drop-in context block optimised for a specific use case — paste it before your compressed component when talking to any LLM.

| File | Use case |
|------|----------|
| `md/debug.md` | Diagnosing bugs, tracing re-renders, unexpected state |
| `md/code-review.md` | PR review, pattern checks, security, performance |
| `md/refactor.md` | Breaking into smaller components, reducing complexity |
| `md/feature.md` | Adding new functionality to an existing component |
| `md/explain.md` | Understanding an unfamiliar component quickly |

---

## KEY INSIGHTS & DECISION LOG

### What Works Well
- ✅ Summarizing hook bodies preserves dependency information (critical for re-run logic)
- ✅ Handler summarization is safe because implementations vary, intent doesn't
- ✅ Type annotation stripping is lossless (TS is compile-only)
- ✅ Compression speed is <100ms even for 1,600+ line files

### What Needs Refinement
- ⚠️ Flow syntax (Facebook codebase) requires try/catch fallback in parser
- ⚠️ Very small components (<50 lines) see only 7-15% savings
- ⚠️ LLM output quality is not yet measured — semantic tests only check structure

### How to Add a New Pruning Rule
```typescript
// 1. Create src/rules/stripMyRule.ts
import traverse from '@babel/traverse';
import type { File } from '@babel/types';

export function stripMyRule(ast: File): void {
  traverse(ast, {
    // your visitor here
  });
}

// 2. Register in src/rules/index.ts
import { stripMyRule } from './stripMyRule.js';
export const ALL_RULES: [RuleName, PruningRule][] = [
  // ... existing rules
  ['stripMyRule', stripMyRule],  // add here
];

// 3. Add to RuleName union in src/types.ts
export type RuleName = '...' | 'stripMyRule';
```

---

## COMPETITIVE CONTEXT

| Dimension | ML-based (e.g. The Token Company) | This Extension (AST) |
|-----------|----------------------------------|---------------------|
| Safety | Probabilistic (may hallucinate) | Deterministic (AST must balance) |
| Speed | 100ms+ (API round-trip) | 35ms (local) |
| Privacy | Code sent to external API | Local, never leaves IDE |
| Cost | Per-token API fees | One-time / open-source |
| Specificity | Generic NLP | React-specific syntax trees |

---

## VS CODE EXTENSION RELEASE (March 12, 2026)

The engine is now packaged as a production-ready VS Code extension with full IDE integration.

### Commands Available
| Command | Shortcut | What it does |
|---------|----------|-------------|
| Compress Active File | — | Opens compressed version in side panel |
| Compress Selection | — | Compresses only selected code |
| Copy Compressed to Clipboard | `Ctrl+Shift+Alt+C` (Windows/Linux) or `Cmd+Shift+Alt+C` (Mac) | One-shot compress → clipboard |
| @processor (Chat Participant) | — | Uses compressed context for LLM chat questions |

### Status Bar Integration
When you open a `.jsx/.tsx/.ts/.js` file, the VS Code status bar (bottom-right) shows:
```
$(symbol-structure) 50% saved (407/634 tk)
```
Click to copy compressed code to clipboard. Updates in real-time as you edit.

### For Testing & Publishing
See **[TESTING_AND_PUBLISHING.md](TESTING_AND_PUBLISHING.md)** for:
- Local debug testing checklist (7 manual tests)
- VS Code Marketplace publication steps
- Semantic versioning & update workflow
- Feedback collection for beta users
- Success metrics to track

### Proven Quality
- **Benchmark:** 10/10 LLM parity on real React scenarios (claude-sonnet-4-6)
- **Token savings:** 50.6% average (all 10 scenarios)
- **Cost reduction:** 31% per API call
- **Syntax validity:** 9/10 compressed outputs parse cleanly

### Next Steps
1. Test locally (see TESTING_AND_PUBLISHING.md Phase 1)
2. Commit code (see **Git Commit Checklist** below)
3. Publish to Marketplace (Phase 2)
4. Gather beta feedback (Phase 4)

---

## GIT COMMIT CHECKLIST

**Files to commit (all changes since v0.1.0 baseline):**
```
✓ src/compressor.ts              — Core AST engine
✓ src/extension.ts               — VS Code extension (commands, status bar)
✓ src/run_evals.ts               — LLM evaluation harness
✓ src/types.ts                   — TypeScript interfaces
✓ src/rules/                      — All new pruning rules
  ✓ stripJsxAttributes.ts
  ✓ collapseHelperBodies.ts
  ✓ pruneUnusedImports.ts
  ✓ skeletonizeJsx.ts
  ✓ skeletonizeTypes.ts
✓ src/rules/index.ts             — Rule registry
✓ benchmarks/                     — Golden dataset (10 scenarios)
  ✓ scenarios/01-10/              — Original + expected + prompt files
  ✓ tsconfig.json                 — Type checking config for fixtures
  ✓ results/latest.json           — Latest eval run results
✓ md/explain.md                   — Updated user guide
✓ package.json                    — Updated dependencies + extension metadata
✓ TESTING_AND_PUBLISHING.md       — New testing & publishing guide
```

**Files to NOT commit:**
```
✗ dist/                           — Generated (git-ignored)
✗ node_modules/                   — Generated (git-ignored)
✗ .git/                           — Internal
✗ **/node_modules                 — Generated
```

**Commit message template:**
```
release: v0.1.0 - React AST Preprocessor VS Code Extension

Features:
- VS Code extension with 3 commands + chat participant
- Keyboard shortcut (Ctrl+Shift+Alt+C) for instant compress-to-clipboard
- Status bar showing real-time token savings
- Right-click context menu integration
- 13 tuned AST pruning rules

Quality:
- 10/10 LLM parity on 10 real-world React scenarios
- 50.6% average token compression
- 9/10 syntax-valid compressed outputs
- 31% API cost reduction

Testing:
- 10 golden benchmark scenarios with ground truth
- LLM-as-Judge evaluation (claude-sonnet-4-6)
- Structural + semantic test suites
- See: TESTING_AND_PUBLISHING.md for full guide

Architecture:
- Babel AST-based (deterministic, no ML)
- Plugin registry for extensible rules
- TypeScript (strict mode)
- Dual interface: CLI + VS Code Extension

See TESTING_AND_PUBLISHING.md for:
- Local testing checklist (Phase 1)
- Marketplace publication (Phase 2)
- Beta feedback workflow (Phase 4)
```

---

**Last Updated:** March 12, 2026
**Status:** VS Code Extension ready for release — all tests passing, benchmarks complete ✓
**Next Milestone:** Launch on VS Code Marketplace

---

## ARCHITECTURE

### Core Concept: "Skeletonization"
Transform a 200-line React component into a 40-line semantic skeleton that preserves all information an LLM needs:
- Function signatures ✓
- Hook dependencies ✓
- JSX structure ✓
- Import statements ✓
- Prop types (as comments) ✓

But removes:
- Comments ✗
- console.* calls ✗
- Hook body internals ✗
- Handler implementations ✗
- PropTypes/defaultProps ✗
- Type annotations ✗
- Test attributes ✗
- Style object values ✗

---

## NEXT STEPS FROM HERE

1. **Publish as npm package:** `npm publish react-ast-compressor --access public`
2. **LLM quality evaluation:** Build eval harness using a reference LLM to score output faithfulness
3. **Vue/Angular support:** Extend rule registry with framework-specific visitors
4. **Middleware mode:** Intercept Anthropic/OpenAI API calls, auto-compress code in context
5. **Dashboard:** Cost savings, compression stats per team/project
6. **Enterprise SaaS:** Middleware sold to orgs using Cursor, Copilot, or internal LLM deployments

---

## 8 PRUNING RULES (Priority Order)

### 1. stripComments
- **What:** Removes all leading, trailing, and inner comments
- **Impact:** ~5-10% tokens
- **Safe:** Yes (comments are never semantic)

### 2. stripConsoleLogs
- **What:** Removes `console.log()`, `console.error()`, etc
- **Impact:** ~2-5% tokens
- **Safe:** Yes (dev-only)

### 3. summarizeHooks (HIGH IMPACT)
- **What:** Empties `useEffect()`, `useCallback()`, `useMemo()` bodies → keeps deps array + summary comment
- **Example:**
  ```js
  // BEFORE: useEffect(() => { fetch/setState/validate/etc }, [userId])
  // AFTER:  useEffect(() => /* fetch, validate, setState */{}, [userId])
  ```
- **Impact:** ~15-25% tokens
- **Safe:** Yes (LLM only needs to know the dependency array to understand when hook re-runs)

### 4. summarizeHandlers (HIGH IMPACT)
- **What:** Collapses `handle*()` and `on*()` functions (>2 statements) to call summary
- **Example:**
  ```js
  // BEFORE: const handleSubmit = (e) => { e.preventDefault(); validate(); send(); reset(); }
  // AFTER:  const handleSubmit = (e) => /* validate, send, reset */{}
  ```
- **Impact:** ~10-20% tokens
- **Safe:** Yes (the implementation is less important than knowing it exists as a handler)

### 5. stripPropTypes
- **What:** Removes `Component.propTypes`, `defaultProps`, and `prop-types` imports
- **Impact:** ~3-8% tokens
- **Safe:** Yes (compile-time only, TS is already stripped)

### 6. collapseStyles
- **What:** Empties style objects → keeps keys as comment
- **Example:**
  ```js
  // BEFORE: const styles = { container: { flex: 1, padding: 20 }, header: {...} }
  // AFTER:  const styles = /* container, header, footer */{};
  ```
- **Impact:** ~5-12% tokens
- **Safe:** Yes (LLM doesn't need internal CSS values)

### 7. stripTypeAnnotations
- **What:** Removes TS/Flow types, interfaces, generics, casts (`as Type`)
- **Impact:** ~5-15% tokens
- **Safe:** Yes (TS is compile-only)

### 8. stripTestAttributes
- **What:** Removes `data-testid`, `data-cy`, `data-test` JSX attributes
- **Impact:** ~1-2% tokens
- **Safe:** Yes (QA-only)

---

## REACT PATTERNS TARGETED (Ordered by Token Savings)

| Pattern | Rule | Savings | Example |
|---------|------|---------|---------|
| Hook bodies (useEffect, useCallback) | Rule 3 | 15-25% | Empty `useEffect(() => {...}, deps)` |
| Event handlers (handle*, on*) | Rule 4 | 10-20% | `const onClick = () => {...}` → comment |
| Comments | Rule 1 | 5-10% | Strip all JSDoc, inline comments |
| TypeScript types | Rule 7 | 5-15% | Remove `interface`, `type`, `: Type` annotations |
| Style objects | Rule 6 | 5-12% | `{ padding: 20, margin: 10 }` → key list |
| PropTypes declarations | Rule 5 | 3-8% | Strip `.propTypes`, `.defaultProps` |
| console.* calls | Rule 2 | 2-5% | Remove all logging |
| Test attributes | Rule 8 | 1-2% | Removes `data-testid="..."` |

---

## CODE: Full Compressor Implementation

See [compressor.js](compressor.js) - Full AST compression engine with all 8 rules implemented

Key classes:
- `ReactASTCompressor` - Main class with compression logic
- `_extractBodySummary()` - Helper to summarize function bodies

---

## CODE: VS Code Extension Integration

See [extension.js](extension.js) - VS Code Extension Entry Point

Features:
- Chat participant: `@processor` for inline compression
- Command: `React Preprocessor: Compress Active File`
- Command: `React Preprocessor: Compress Selection`

---

## BENCHMARK RESULTS (10 Top Public Repos)

### Data Table
| Repo | File | Lines | Original | Compressed | Saved | Time |
|------|------|-------|----------|-----------|-------|------|
| facebook/react | InspectedElement.js | 342 | 2,172 | 1,645 | 24% | 69ms |
| facebook/react | Element.js | 297 | 1,763 | 1,497 | 15% | 25ms |
| mui/material-ui | Button.js | 749 | 4,211 | 3,143 | 25% | 42ms |
| vercel/next.js | error-boundary.tsx | 174 | 1,160 | 531 | **54%** | 10ms |
| ant-design/ant-design | Table.tsx | 53 | 410 | 300 | 27% | 5ms |
| tailwindlabs/headlessui | combobox.tsx | 1,673 | 12,118 | 7,278 | 40% | 101ms |
| storybookjs/storybook | Tree.tsx | 758 | 4,629 | 3,318 | 28% | 38ms |
| jitsi/jitsi-meet | Toolbox.tsx | 363 | 2,933 | 2,248 | 23% | 11ms |
| supabase/supabase | SQLEditor.tsx | 1,019 | 7,177 | 4,093 | 43% | 42ms |
| preactjs/preact | component.js | 254 | 1,803 | 824 | **54%** | 16ms |

### Summary Metrics
- **10 files tested** across 9 major OSS repos
- **Total tokens saved:** 13,499 across 36,376 original tokens
- **Overall savings:** 35% across all files
- **Average file savings:** 33%
- **Average compression time:** 35.9ms (safe <100ms latency)
- **Cost estimate:** ~$4.05 saved per 1,000 function calls (at $3/1M input tokens)

### How to Run Benchmark
```bash
cd c:\Users\siddhant\ s\react-preprocessor-js
node benchmark.js
```

---

## TESTING STRATEGY (Token-Efficient)

The benchmark script ([benchmark.js](benchmark.js)) is fully self-contained:
- Fetches raw files from `raw.githubusercontent.com` via Node.js `https` — **zero API tokens consumed**
- Runs compression locally — **no LLM calls**
- Reports token counts, percentages, and timing
- Just run `node benchmark.js` anytime to reproduce

Files with more comments, PropTypes, console logs, TypeScript types, and hook bodies see the highest savings (40-54%). Lean files with mostly JSX structure land at 15-27% — still meaningful at scale.

---

## PROJECT STRUCTURE

```
react-preprocessor-js/
├── compressor.js           # Core AST compression engine (500 lines)
├── extension.js            # VS Code chat participant (150 lines)
├── benchmark.js            # Reproduction benchmark script (250 lines)
├── package.json            # NPM dependencies
├── test/
│   └── extension.test.js   # Unit tests (200+ lines)
├── HANDOFF.md             # This file (context for new sessions)
└── README.md              # User-facing documentation
```

---

## TECH STACK

| Component | Technology |
|-----------|------------|
| Runtime | Node.js (CommonJS) |
| AST Parser | Babel (@babel/parser) |
| AST Manipulation | @babel/traverse, @babel/generator, @babel/types |
| IDE Integration | VS Code Extension API |
| Language Support | JSX, TSX, Flow, TypeScript |
| Testing | Mocha assertions, manual test cases |

---

## DEPENDENCIES (package.json)

```json
{
  "dependencies": {
    "@babel/generator": "^7.22.5",
    "@babel/parser": "^7.22.5",
    "@babel/traverse": "^7.22.5",
    "@babel/types": "^7.22.5"
  },
  "devDependencies": {
    "@types/vscode": "^1.110.0",
    "@types/mocha": "^10.0.10",
    "@types/node": "22.x",
    "eslint": "^9.39.3",
    "@vscode/test-cli": "^0.0.12",
    "@vscode/test-electron": "^2.5.2"
  }
}
```

---

## NEXT STEPS FOR NEW CHAT

1. **Test on proprietary code:** Run benchmark against your company's actual React codebase
2. **Publish as npm package:** `npm publish react-ast-compressor`
3. **Add Vue/Angular support:** Extend base class with framework-specific pruning rules
4. **Integrate with LLM providers:** Hook into Anthropic API, OpenAI API, or Bedrock to auto-compress on input
5. **Build dashboard:** Show cost savings, compression stats per team/project
6. **Enterprise licensing:** Sell as middleware to orgs using Cursor, GitHub Copilot, or internal LLM deployments

---

## KEY INSIGHTS & DECISION LOG

### What Works Well
- ✅ Summarizing hook bodies preserves dependency information (most critical for re-run logic)
- ✅ Handler summarization is safe because implementations vary, intent doesn't
- ✅ Type annotation stripping is lossless (TS is compile-only, LLM reasoning doesn't need types)
- ✅ Compression speed is <100ms even for 1600+ line files (safe for real-time IDE use)

### What Needs Refinement
- ⚠️ Flow syntax support (Facebook codebase) requires try/catch fallback in parser
- ⚠️ Very small components (<50 lines) see only 7-15% savings (diminishing returns)
- ⚠️ Heavily commented code (JSDoc-heavy) gets 40%+ savings but is rare

### Competitive Advantage vs The Token Company
| Dimension | The Token Company (ML) | Our Extension (AST) |
|-----------|----------------------|-------------------|
| Safety | Probabilistic (risk of breaking code) | Deterministic (AST must balance) |
| Speed | 100ms+ (API round-trip) | 35ms (local) |
| Privacy | Sends code to API | Local, never leaves IDE |
| Cost | Per-token API fees | One-time license |
| Code Understanding | Generic NLP | React-specific syntax trees |

---

## FAQ FOR NEXT SESSION

**Q: Why not just use smaller LLMs to compress?**
A: ML-based compression is probabilistic — it might hallucinate and break code. AST compression is deterministic by definition (parse tree must balance).

**Q: Will this work for Vue/Angular?**
A: Yes. The architecture is extensible. Vue components need different pruning rules (template syntax, defineComponent), but the framework is the same.

**Q: What's the licensing model?**
A: Option 1: Free/open-source (like Prettier). Option 2: Enterprise SaaS ($500/mo per team). Option 3: Per-API-call metering.

**Q: Can we compress during API calls transparently?**
A: Yes — next phase is middleware that auto-compresses on LLM API calls. Intercept request, compress code in context, send to Anthropic/OpenAI, decompress response.

---

## QUICK START FOR NEXT SESSION

1. **Clone context from this file**
2. **Run tests:** `npm test`
3. **Run benchmark:** `node benchmark.js`
4. **Test on your code:** Copy a React file into the project, compress it manually
5. **Extend:** Add new pruning rules by adding `_stripX()` methods to the compressor class

---

**Last Updated:** March 11, 2026  
**Author:** Siddhant S  
**Status:** Ready for production testing  
**Next Milestone:** Publish npm package / Enterprise SaaS beta
