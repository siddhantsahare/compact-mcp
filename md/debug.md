# Debug Session — React AST Preprocessor Context

> **Usage:** Paste this block before your compressed component when debugging with any LLM.
> The component below has been AST-compressed. Structural skeleton is intact; noise has been stripped.

---

## What was stripped (safe to ignore for debugging)
- All comments and JSDoc
- `console.log` / `console.error` calls
- `PropTypes` / `defaultProps` declarations
- TypeScript type annotations and interfaces
- `data-testid` / `data-cy` test attributes
- Style object values (keys preserved)

## What was preserved (everything you need to debug)
- All function and component names
- All `useState` / `useRef` variable names and their setters
- Hook call sites with **full dependency arrays** — critical for tracing re-render bugs
- Event handler signatures (body summarized as a comment)
- JSX element structure and all prop bindings
- Import declarations
- Conditional rendering logic and early returns

## How to read hook summaries
```
useEffect(() => /* fetch, setState, conditional */{}, [userId, teamId])
//                 ↑ body was here                     ↑ dep array INTACT
```
The dep array is the diagnostic signal — it tells you exactly when this effect re-runs.

## How to read handler summaries
```
const handleSubmit = (e) => /* validate(), sendForm(), reset() */{}
//                             ↑ original calls, summarized
```

---

## Debugging prompts to follow with your component

- "Why does this component re-render on every keystroke?"
- "Which hook is causing the infinite loop?"
- "What is the render order when `userId` changes?"
- "Is there a missing dependency in any of these hooks?"
- "Trace the state flow when `handleSubmit` is called."
