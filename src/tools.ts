import * as vscode from 'vscode';
import traverse from '@babel/traverse';
import { ReactASTCompressor } from './compressor.js';
import { parse } from './parser.js';
import type { SearchWorkspaceArgs, ReadAndCompressArgs, ReadExactFunctionArgs, ApplyEditArgs } from './types.js';
import { CompressedFileCache } from './types.js';

// Singleton Output Channel — survives across tool invocations and is never swallowed by esbuild.
const compactLogger = vscode.window.createOutputChannel('Compact Debug');

// ─── Tool 1: compact_search_workspace ───────────────────────────

export class SearchWorkspaceTool implements vscode.LanguageModelTool<SearchWorkspaceArgs> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SearchWorkspaceArgs>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { keyword } = options.input;

    // Sanitize: collapse whitespace into wildcards so "message form" matches "MessageForm.jsx"
    const safeKeyword = keyword.trim().replace(/\s+/g, '*');
    const glob = `**/*${safeKeyword}*{.js,.jsx,.ts,.tsx}`;
    const uris = await vscode.workspace.findFiles(glob, '**/node_modules/**', 20);

    if (uris.length === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `No files found matching "${keyword}". ` +
          `Try a shorter or different keyword (e.g. just the component name without spaces).`,
        ),
      ]);
    }

    const paths = uris.map((u) => vscode.workspace.asRelativePath(u));
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `Found ${paths.length} file(s):\n${paths.join('\n')}`,
      ),
    ]);
  }
}

// ─── Tool 2: compact_read_and_compress ──────────────────────────

export class ReadAndCompressTool implements vscode.LanguageModelTool<ReadAndCompressArgs> {
  private readonly compressor = new ReactASTCompressor();
  private cache: CompressedFileCache;

  constructor(cache: CompressedFileCache) {
    this.cache = cache;
  }

  /** Replace the per-turn cache (called at the start of each chat request). */
  resetCache(cache: CompressedFileCache): void {
    this.cache = cache;
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ReadAndCompressArgs>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { filePath } = options.input;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return this.errorResult('No workspace folder is open.');
    }

    const rootUri = workspaceFolders[0].uri;

    // ── Resolve: handle both absolute and workspace-relative paths ──
    // The LLM may pass an absolute path (e.g. C:\...\File.tsx) or a
    // relative one (e.g. src/components/File.tsx). Detect by drive letter or
    // leading slash.
    const isAbsolute = /^[a-zA-Z]:[/\\]/.test(filePath) || filePath.startsWith('/');
    const resolvedUri = isAbsolute
      ? vscode.Uri.file(filePath)
      : vscode.Uri.joinPath(rootUri, filePath);

    // ── Security: case-insensitive startsWith for Windows (C: vs c:) ──
    const normalize = (p: string) => p.toLowerCase().replace(/\\/g, '/');
    if (!normalize(resolvedUri.fsPath).startsWith(normalize(rootUri.fsPath))) {
      return this.errorResult(
        `"${resolvedUri.fsPath}" is outside the current workspace root ("${rootUri.fsPath}"). ` +
        `Only files inside the open workspace can be read. ` +
        `Use compact_search_workspace to find the file's relative path first.`,
      );
    }

    // ── Duplicate read suppression ─────────────────────────────
    const relPath = vscode.workspace.asRelativePath(resolvedUri);
    if (this.cache.has(relPath)) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `[already compressed] ${relPath} — skipping duplicate read.`,
        ),
      ]);
    }

    // ── Read & compress ────────────────────────────────────────
    let fileBytes: Uint8Array;
    try {
      fileBytes = await vscode.workspace.fs.readFile(resolvedUri);
    } catch {
      return this.errorResult(`File not found: ${relPath}`);
    }

    const code = Buffer.from(fileBytes).toString('utf-8');
    let result;
    try {
      result = this.compressor.compress(code);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.errorResult(`AST parse error on ${relPath}: ${msg}`);
    }

    const compressedCode = result.compressed;
    const activeRules = Object.entries(this.compressor.options)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
      .sort();
    const disabledRules = Object.entries(this.compressor.options)
      .filter(([, enabled]) => !enabled)
      .map(([name]) => name)
      .sort();

    compactLogger.appendLine('=== RAW COMPRESSED AST OUTPUT ===');
    compactLogger.appendLine(`[compact] file: ${relPath}`);
    compactLogger.appendLine(
      `[compact] tokens: ${result.originalTokens} -> ${result.compressedTokens} (${result.savingsPercent}% saved)`,
    );
    compactLogger.appendLine(
      `[compact] rules: active=${activeRules.length}${activeRules.length > 0 ? ` [${activeRules.join(', ')}]` : ''}` +
      `${disabledRules.length > 0 ? ` | disabled=${disabledRules.length} [${disabledRules.join(', ')}]` : ''}`,
    );
    compactLogger.appendLine('--- compressed payload start ---');
    compactLogger.appendLine(compressedCode);
    compactLogger.appendLine('--- compressed payload end ---');
    compactLogger.appendLine('=================================');
    compactLogger.show(true); // reveal panel without stealing focus

    this.cache.add(relPath);

    // ── ROI toast: show the user how much context was saved ──────────────
    // Split on both / and \ for Windows path safety, take the last segment.
    const fileName = relPath.split(/[/\\]/).filter(Boolean).pop() ?? relPath;
    // Fire-and-forget — do not await so we never block the LLM response.
    void vscode.window.showInformationMessage(
      `⚡ @compact: ${fileName} — ${result.savingsPercent}% saved` +
      ` (${result.originalTokens} → ${result.compressedTokens} tokens)`,
      'Dismiss',
    );

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `── ${relPath} (${result.savingsPercent}% compressed, ${result.compressedTokens} tokens) ──\n${compressedCode}`,
      ),
    ]);
  }

  private errorResult(message: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`[error] ${message}`),
    ]);
  }
}

// ─── Tool 3: compact_read_exact_function ─────────────────────────

export class ReadExactFunctionTool implements vscode.LanguageModelTool<ReadExactFunctionArgs> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ReadExactFunctionArgs>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { filePath, functionName } = options.input;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return this.errorResult('No workspace folder is open.');
    }

    const rootUri = workspaceFolders[0].uri;
    const isAbsolute = /^[a-zA-Z]:[/\\]/.test(filePath) || filePath.startsWith('/');
    const resolvedUri = isAbsolute
      ? vscode.Uri.file(filePath)
      : vscode.Uri.joinPath(rootUri, filePath);

    const normalize = (p: string) => p.toLowerCase().replace(/\\/g, '/');
    if (!normalize(resolvedUri.fsPath).startsWith(normalize(rootUri.fsPath))) {
      return this.errorResult(`"${filePath}" is outside the workspace root.`);
    }

    let fileBytes: Uint8Array;
    try {
      fileBytes = await vscode.workspace.fs.readFile(resolvedUri);
    } catch {
      return this.errorResult(`File not found: ${filePath}`);
    }

    const rawCode = Buffer.from(fileBytes).toString('utf-8');
    const relPath = vscode.workspace.asRelativePath(resolvedUri);

    let extractedCode = '';
    try {
      const ast = parse(rawCode);
      traverse(ast, {
        // Matches: function Foo() {} / async function Foo() {}
        FunctionDeclaration(path) {
          if (path.node.id?.name === functionName) {
            const { start, end } = path.node;
            if (start != null && end != null) {
              extractedCode = rawCode.slice(start, end);
            }
            path.stop();
          }
        },
        // Matches: const Foo = () => {} / const Foo = function() {}
        VariableDeclarator(path) {
          const id = path.node.id;
          if (id.type === 'Identifier' && id.name === functionName) {
            const parent = path.parent;
            const { start, end } = parent;
            if (start != null && end != null) {
              extractedCode = rawCode.slice(start, end);
            }
            path.stop();
          }
        },
        // Matches: export default function Foo() {} or just export default function() {}
        ExportDefaultDeclaration(path) {
          const decl = path.node.declaration;
          if (
            decl.type === 'FunctionDeclaration' &&
            (decl.id?.name === functionName || functionName === 'default')
          ) {
            const { start, end } = path.node;
            if (start != null && end != null) {
              extractedCode = rawCode.slice(start, end);
            }
            path.stop();
          }
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.errorResult(`AST parse error on ${relPath}: ${msg}`);
    }

    if (!extractedCode) {
      return this.errorResult(
        `Could not find a function or component named "${functionName}" in ${relPath}. ` +
        `Check the exact export name — it may be a default export named differently, or defined inside a namespace.`,
      );
    }

    compactLogger.appendLine(`=== EXACT FUNCTION EXTRACT: ${functionName} from ${relPath} ===`);
    compactLogger.appendLine(extractedCode);
    compactLogger.appendLine('=================================================================');
    compactLogger.show(true);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `── UNCOMPRESSED SOURCE: ${functionName} (from ${relPath}) ──\n${extractedCode}`,
      ),
    ]);
  }

  private errorResult(message: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`[error] ${message}`),
    ]);
  }
}

// ─── Tool 4: compact_apply_edit ─────────────────────────────────

export class ApplyEditTool implements vscode.LanguageModelTool<ApplyEditArgs> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ApplyEditArgs>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { filePath, searchString, replaceString } = options.input;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return this.errorResult('No workspace folder is open.');
    }

    const rootUri = workspaceFolders[0].uri;
    const isAbsolute = /^[a-zA-Z]:[/\\]/.test(filePath) || filePath.startsWith('/');
    const resolvedUri = isAbsolute
      ? vscode.Uri.file(filePath)
      : vscode.Uri.joinPath(rootUri, filePath);

    // Security: ensure the file is inside the workspace root
    const normalize = (p: string) => p.toLowerCase().replace(/\\/g, '/');
    if (!normalize(resolvedUri.fsPath).startsWith(normalize(rootUri.fsPath))) {
      return this.errorResult(
        `"${filePath}" is outside the workspace root. Edits are only allowed within the open workspace.`,
      );
    }

    // Read the file contents
    let fileBytes: Uint8Array;
    try {
      fileBytes = await vscode.workspace.fs.readFile(resolvedUri);
    } catch {
      return this.errorResult(`File not found: ${filePath}`);
    }

    const fileContent = Buffer.from(fileBytes).toString('utf-8');

    // ── Fuzzy whitespace-normalised matching ───────────────────
    // The LLM often produces searchStrings with slightly different indentation
    // or line endings than the actual file. We normalise all whitespace runs to
    // a single space for the purpose of locating the match, then map the
    // normalised offsets back to real character offsets in the original file.
    const normalizedFile = normalizeWhitespace(fileContent);
    const normalizedSearch = normalizeWhitespace(searchString);

    if (normalizedSearch.length === 0) {
      return this.errorResult('searchString is empty after whitespace normalisation — nothing to replace.');
    }

    const normalizedStart = normalizedFile.indexOf(normalizedSearch);
    if (normalizedStart === -1) {
      return this.errorResult(
        `searchString not found in ${vscode.workspace.asRelativePath(resolvedUri)} (fuzzy match, whitespace-normalised). ` +
        `Use compact_read_exact_function to obtain the exact source text, then retry.`,
      );
    }

    const normalizedSecond = normalizedFile.indexOf(normalizedSearch, normalizedStart + 1);
    if (normalizedSecond !== -1) {
      return this.errorResult(
        `searchString matches more than one location in ${vscode.workspace.asRelativePath(resolvedUri)} (fuzzy match). ` +
        `Provide more surrounding context lines so the match is unique.`,
      );
    }

    // Map normalised start index → real start index in the original file.
    const realStartIndex = normalizedOffsetToReal(fileContent, normalizedStart);
    // Map normalised end index → real end index in the original file.
    const realEndIndex = normalizedOffsetToReal(fileContent, normalizedStart + normalizedSearch.length);

    // Build and apply the workspace edit (do NOT save — leave the file dirty for user review)
    const startPos = positionFromOffset(fileContent, realStartIndex);
    const endPos = positionFromOffset(fileContent, realEndIndex);
    const range = new vscode.Range(startPos, endPos);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(resolvedUri, range, replaceString);

    const success = await vscode.workspace.applyEdit(edit);
    if (!success) {
      return this.errorResult('vscode.workspace.applyEdit() returned false — the edit could not be applied.');
    }

    const relPath = vscode.workspace.asRelativePath(resolvedUri);
    compactLogger.appendLine(`=== APPLY EDIT: ${relPath} ===`);
    compactLogger.appendLine(`[compact] Replaced chars at real offset ${realStartIndex}–${realEndIndex}`);
    compactLogger.appendLine('=================================');
    compactLogger.show(true);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `[success] Edit applied to ${relPath}. The file is unsaved — the user can review the change and Ctrl+Z to undo.`,
      ),
    ]);
  }

  private errorResult(message: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`[error] ${message}`),
    ]);
  }
}

/**
 * Collapse every run of whitespace characters to a single space.
 * Used for fuzzy matching of LLM-generated searchStrings against file content.
 */
function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Given a character index into `normalizeWhitespace(text)`, return the
 * corresponding character index in the original `text`.
 *
 * Both strings share the same non-whitespace characters in the same order;
 * only whitespace runs differ in length. We walk both in lockstep.
 */
function normalizedOffsetToReal(text: string, normalizedOffset: number): number {
  let realIdx = 0;
  let normIdx = 0;

  while (normIdx < normalizedOffset && realIdx < text.length) {
    const ch = text[realIdx];
    if (/\s/.test(ch)) {
      // A whitespace run in the original maps to exactly one space in the
      // normalised string — advance past the entire run here, 1 char in norm.
      realIdx++;
      while (realIdx < text.length && /\s/.test(text[realIdx])) {
        realIdx++;
      }
      normIdx++; // the single space
    } else {
      realIdx++;
      normIdx++;
    }
  }

  return realIdx;
}

/** Convert a 0-based character offset into a vscode.Position (line, character). */
function positionFromOffset(text: string, offset: number): vscode.Position {
  let line = 0;
  let lastLineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === '\n') {
      line++;
      lastLineStart = i + 1;
    }
  }
  return new vscode.Position(line, offset - lastLineStart);
}
