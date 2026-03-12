import * as vscode from 'vscode';
import { ReactASTCompressor } from './compressor.js';
import type { SearchWorkspaceArgs, ReadAndCompressArgs } from './types.js';
import { CompressedFileCache } from './types.js';

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
        `── ${relPath} (${result.savingsPercent}% compressed, ${result.compressedTokens} tokens) ──\n${result.compressed}`,
      ),
    ]);
  }

  private errorResult(message: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`[error] ${message}`),
    ]);
  }
}
