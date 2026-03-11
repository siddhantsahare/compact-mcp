# Code Review — React AST Preprocessor Context

> **Usage:** Paste this block before your compressed component when doing a code review with any LLM.
> The component below has been AST-compressed to remove noise. Focus on architecture, patterns, and correctness.

---

## What was stripped (non-issues for code review)
- Comments and JSDoc (they can't be wrong if they don't exist)
- `console.log` calls (assumed caught by lint in CI)
- `PropTypes` (project uses TypeScript)
- TypeScript type annotations (compile-time only)
- `data-testid` attributes (QA concern, not logic)
- Internal style values (design system concern, not logic)

## What was preserved (the review surface)
- All component and function names
- Hook dependency arrays — **review these carefully for stale closures**
- Handler signatures — their existence signals the interaction contract
- JSX structure — reveals component composition and prop drilling
- Import graph — reveals coupling and dependency direction
- All export declarations — reveals the public API surface

## Code review checklist to apply to this component

### Correctness
- [ ] Are all `useEffect` dependency arrays complete? (no missing deps, no overcapturing)
- [ ] Do handlers guard against race conditions (cancelled fetches, stale state)?
- [ ] Are there any obvious memory leaks (missing cleanup in effects)?

### Architecture
- [ ] Is this component doing too many things? (SRP check)
- [ ] Is state lifted at the right level?
- [ ] Are props too granular or too coarse?
- [ ] Is there hidden prop drilling through 3+ levels?

### Performance
- [ ] Are `useCallback` / `useMemo` used where the dep arrays are complex?
- [ ] Are there expensive operations inside render (no memoization)?
- [ ] Would this trigger unnecessary re-renders in parent components?

### Security (for forms / data submission)
- [ ] Is user input validated before being sent?
- [ ] Are API calls authenticated?
- [ ] Is there any XSS risk from `dangerouslySetInnerHTML`?

---

## Review prompts to follow with your component

- "Flag any potential infinite render loops."
- "Are the useEffect dependency arrays correct and complete?"
- "Is the component following single responsibility principle?"
- "What would cause this component to re-render unnecessarily?"
- "Does the public API (props + exports) make sense as a contract?"
