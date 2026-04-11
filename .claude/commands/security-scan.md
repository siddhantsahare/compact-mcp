# Security & Code Quality Scan

Run a full security and code quality scan on this codebase. Cover all the categories below in order. For each category, report findings as ✅ PASS, ⚠️ WARN, or ❌ FAIL with the exact file:line for any issue found.

---

## 1. Dependency Vulnerabilities

Run `npm audit --omit=dev --audit-level=moderate` and report:
- Any high or critical CVEs in production dependencies
- Any moderate CVEs worth noting
- Whether `package-lock.json` is in sync with `package.json`

Also check `compact-mcp-publish/package.json` dependencies match the root `package.json` production deps.

---

## 2. Path Traversal

Scan all files in `src/mcp/` for any code that:
- Reads a file using a user-supplied path without resolving it to an absolute path first
- Uses `resolve()` but does NOT validate the result starts with `absRoot + sep` (or `absRoot + path.sep`)
- Passes user input directly to `readFileSync`, `createReadStream`, `fs.open`, or `glob`

Known guard location: `src/mcp/tools/compact-expand.ts` lines 25-31. Verify it is still intact and covers all code paths that accept `filePath` from the MCP tool input.

---

## 3. Code Injection

Scan all `.ts` files under `src/` for:
- Any use of `eval()`, `Function()` constructor, `new Function`, `vm.runInContext`, or `vm.runInThisContext`
- Any `child_process.exec`, `child_process.spawn`, or `execSync` calls
- Any `require()` of a user-supplied string
- Dynamic `import()` of a user-supplied string

These should all be absent. Report exact locations of any found.

---

## 4. Outbound Network Calls

Scan all `.ts` files under `src/` for:
- Any `fetch()`, `axios`, `http.request`, `https.request`, `XMLHttpRequest`, or `WebSocket` calls
- Any import of `node:http`, `node:https`, `undici`, `got`, `axios`, `node-fetch`

The tool must be fully offline. No network calls are acceptable in the MCP server.

---

## 5. Secret / Credential Leakage

Check the following for accidentally committed secrets:
- All files tracked by git (`git ls-files`) for patterns: `password`, `secret`, `api_key`, `apikey`, `token`, `bearer`, `private_key`, `sk-`, `npm_`, `ghp_`, `AKIA` (case-insensitive)
- `.env`, `.env.local`, `.env.*` files — should not be tracked
- `package.json` and `compact-mcp-publish/package.json` for any credential-looking values
- Check `.gitignore` includes `.env*`

Flag any match that looks like a real value (not a variable name or comment).

---

## 6. Published Package Contents

Run `npm pack --dry-run` from inside `compact-mcp-publish/` and verify the tarball does NOT include:
- `dist/extension.*` — old VS Code extension code
- `dist/benchmark.*` — benchmark harness
- `dist/run_evals.*` — eval scripts
- `dist/tools.*` — old VS Code tools
- `dist/test/` — test suite
- `dist/cli.*` — CLI (acceptable to include, but flag for review)
- Any `.ts` source files
- Any test fixture files

Verify the tarball DOES include:
- `bin/compact-mcp.js`
- `dist/mcp/` (all files)
- `dist/compressor.js`, `dist/parser.js`, `dist/types.js`, `dist/rules/`
- `README.md`

---

## 7. Lint & Type Safety

Run `npm run lint` and report any errors or warnings. Then run `npx tsc --noEmit` and report any type errors.

Flag any `@typescript-eslint/no-explicit-any` suppressions that were added to working code (not test utilities). Each suppression should have a justification comment explaining why `any` is unavoidable.

---

## 8. Error Boundary Hygiene

Review all MCP tool handlers in `src/mcp/tools/` and `src/mcp/server.ts` for:
- Unhandled promise rejections (async functions without try/catch or `.catch()`)
- `readFileSync` calls without try/catch
- `parse()` calls without try/catch
- Any function that could throw and would crash the MCP server process

The server process must never crash due to bad user input. All user-facing errors should return a structured `[error] ...` string, not throw.

---

## 9. Input Validation

For each MCP tool that accepts user input, verify:
- `compact_expand`: `filePath` is validated (path traversal guard ✅), `functionName` is used only as a string match — not evaluated
- `compact_map`: `rootDir` is optional, used as a filesystem path. Verify it doesn't accept `..` paths that escape intended scope
- `compact_deps`: `componentName` is used only as a string match in AST traversal — not evaluated or used as a filesystem path
- Prompt template args (`componentName`, `filePath`, `functionName`) are only interpolated into strings — no exec, no eval, no filesystem access

---

## 10. CI Pipeline Integrity

Read `.github/workflows/ci.yml` and verify:
- Uses pinned action versions (e.g. `actions/checkout@v4`) — flag any using `@main` or `@latest`
- Runs tests on Node 18, 20, and 22
- Runs `npm audit --omit=dev --audit-level=high`
- Does NOT use `--no-verify` or skip hooks anywhere
- `npm ci` is used (not `npm install`) for reproducible installs

---

## Report Format

After completing all checks, output a summary table:

```
Category                     | Status | Finding
-----------------------------|--------|--------
1. Dependency Vulnerabilities | ✅/⚠️/❌ | ...
2. Path Traversal             | ✅/⚠️/❌ | ...
3. Code Injection             | ✅/⚠️/❌ | ...
4. Outbound Network           | ✅/⚠️/❌ | ...
5. Secret Leakage             | ✅/⚠️/❌ | ...
6. Published Package          | ✅/⚠️/❌ | ...
7. Lint & Type Safety         | ✅/⚠️/❌ | ...
8. Error Boundaries           | ✅/⚠️/❌ | ...
9. Input Validation           | ✅/⚠️/❌ | ...
10. CI Pipeline               | ✅/⚠️/❌ | ...
```

For any ❌ FAIL: include exact file path, line number, and the fix required.
For any ⚠️ WARN: include why it's acceptable risk or what to watch for.

If all 10 pass: output "✅ Safe to publish."
If any fail: output "❌ Do not publish — fix items marked FAIL first."
