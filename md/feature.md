# Feature Building — React AST Preprocessor Context

> **Usage:** Paste this block before your compressed component when adding a new feature with any LLM.
> The skeleton gives the LLM the full structural context it needs to integrate new code correctly.

---

## What was stripped
- Comments, console logs, PropTypes, TS annotations, test attributes, style values
- Hook body internals (summarized — the `/* ... */` markers show what was inside)
- Handler implementations (summarized — same pattern)

## What was preserved (integration points for your new feature)
- All state variables and their setter names — you know what state already exists
- All `useEffect` dep arrays — you know when each effect fires
- All handler signatures — you know what events are already handled
- JSX structure — you know exactly where to insert new UI
- All imports — you know what libraries are already available
- All exports — you know this component's public API

## Before asking the LLM to add a feature, identify:

### 1. State impact
Does the new feature need new state? Or does it modify existing state?
- Existing: look at `useState` lines to find what's already tracked
- New: decide if it belongs in this component or should be lifted

### 2. Side-effect impact
Does the feature trigger new side effects (fetches, subscriptions, timers)?
- If yes: where does it fit relative to existing `useEffect` dep arrays?
- Can it share an existing effect or needs its own?

### 3. Render impact
Where in the JSX does the new feature appear?
- The preserved JSX tree is your insertion map
- Check if it needs conditional rendering (`status === 'X' ? ... : ...`)

### 4. Handler impact
Does the feature need new user interactions?
- Check existing handler signatures — can any be extended?
- Or does it need a new `handleX` function?

---

## Feature building prompts to follow with your component

- "Add a search/filter input that filters the rendered list without refetching."
- "Add an optimistic UI update when the save handler fires."
- "Integrate a loading skeleton that shows while any useEffect is in-flight."
- "Add pagination — the current JSX shows a list, extend it with next/prev controls."
- "Add an error boundary around the main JSX container."
- "Extend the existing handleSubmit to also log an analytics event."
