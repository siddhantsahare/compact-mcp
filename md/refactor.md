# Refactoring Session — React AST Preprocessor Context

> **Usage:** Paste this block before your compressed component when planning a refactor with any LLM.
> The skeleton below shows the component's full structural surface — ideal for refactoring analysis.

---

## What was stripped
- Comments, console logs, PropTypes, TS annotations, test attributes, style values
- Hook body internals (summarized as comments — look for the `/* ... */` markers)
- Handler implementations (summarized — look for the `/* ... */` markers)

## What was preserved (your refactoring map)
- Every function and component name — this is your dependency graph
- Every hook call with its dep array — tells you what state drives what behaviour
- JSX structure — tells you the render tree and component composition
- Every import — tells you external coupling points
- Handler signatures — tells you the interaction surface

## Reading the skeleton for refactoring signals

### Signs this component needs to be split
- More than 3–4 `useState` declarations → candidate for a custom hook
- Multiple `useEffect` blocks with unrelated dep arrays → separate concerns
- JSX has more than 2–3 levels of nesting → candidate for sub-components
- Handler count > 4 → too many responsibilities

### Signs this needs a custom hook
- State + effects that always change together → extract `useX()`
- Same `useEffect` dep pattern appears in multiple components → extract hook
- The component imports > 5 items but only uses each once → over-coupled

### Signs this needs Context or Zustand
- A prop appears in JSX but wasn't declared in the function params → prop drilling
- The same prop is passed to 3+ child components → lift to context

---

## Refactoring prompts to follow with your component

- "What custom hooks could be extracted from this component?"
- "Which parts of this component's JSX could become separate sub-components?"
- "Map all state variables and identify which ones always change together."
- "Which handlers could be moved to a parent or a custom hook?"
- "What is the minimal interface this component needs from its parent?"
- "Rewrite this as two or three smaller components and show the boundaries."
