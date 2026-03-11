# Code Explanation — React AST Preprocessor Context

> **Usage:** Paste this block before your compressed component when you want an LLM to explain unfamiliar code.
> The skeleton preserves all structural meaning while removing noise — perfect for fast understanding.

---

## What was stripped (you don't need this to understand the component)
- Inline comments and JSDoc (may be outdated anyway)
- `console.log` noise
- `PropTypes` / `defaultProps` (runtime-only)
- TypeScript type annotations (compile-time only)
- `data-testid` attributes (QA only)
- Style object values (design system details)

## What was preserved (the full meaning of the component)
- Component and function names — the vocabulary of this module
- Every `useState` / `useRef` — the component's memory
- Hook dep arrays — what drives re-execution
- Handler signatures — what the user can do
- JSX structure — what the user sees
- Import graph — this component's dependencies
- Conditional rendering — the component's decision tree

## How to read a compressed component quickly

### 1. Start with imports → understand what world this lives in
```
import { useState, useEffect } from 'react';
import { Button } from '@mui/material';
```
→ This is a MUI-based React component. It manages local state and has side effects.

### 2. Read hook dep arrays → understand the data flow
```
useEffect(() => /* fetch, setState */{}, [userId])
```
→ This fetches something whenever `userId` changes.

### 3. Read handlers → understand the interactions
```
const handleSave = (data) => /* validate, fetch, setState */{}
```
→ There's a save action that validates, calls an API, and updates state.

### 4. Read JSX → understand the UI contract
```
<form onSubmit={handleSubmit}>
  {loading ? <Spinner /> : <UserForm user={user} />}
</form>
```
→ A form with conditional loading state. Delegates editing to `UserForm`.

---

## Explanation prompts to follow with your component

- "Explain what this component does in 3 sentences."
- "Walk me through the data flow from when the component mounts to first render."
- "What does the user experience when they interact with this component?"
- "What are all the ways this component can update its parent?"
- "What external APIs or services does this component depend on?"
- "Describe the component as if explaining it to a new team member."
- "What is the mental model I need to hold to safely modify this component?"
