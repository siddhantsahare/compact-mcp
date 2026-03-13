import * as vscode from 'vscode';
import { ReactASTCompressor } from './compressor.js';
import { SearchWorkspaceTool, ReadAndCompressTool, ReadExactFunctionTool, ReplaceFunctionTool } from './tools.js';
import type { SearchWorkspaceArgs, ReadAndCompressArgs, ReadExactFunctionArgs, ReplaceFunctionArgs } from './types.js';
import { CompressedFileCache } from './types.js';

const TOOL_CALL_LIMIT = 20;

const SYSTEM_PROMPT = `You are @compact, an elite React context optimizer embedded in VS Code.
You have four tools:
- compact_search_workspace: find React/TS files in the workspace by keyword or component name.
- compact_read_and_compress: read a file and return its compressed AST skeleton (saves 50-80% tokens). Use this first for every file to understand structure cheaply.
- compact_read_exact_function: extract the raw, uncompressed source of one specific named function or component. ALWAYS call this before modifying any function.
- compact_replace_function: AST-aware surgical replacement. Provide the functionName and your complete newCode — Babel finds the exact byte range of that function in the file and splices your new code in, leaving every other line in the file completely untouched. The file is left unsaved so the user can review the diff.

YOUR ROLE: Find the problem, read the raw code, fix it, and apply the fix autonomously using compact_replace_function.

WORKFLOW — follow this every time:
1. If the file path is unknown, use compact_search_workspace with a keyword from the user's request.
2. Use compact_read_and_compress to get the compressed AST skeleton and understand the file structure cheaply.
3. Identify the exact function or component that needs to change.
4. Use compact_read_exact_function to get the real, uncompressed source of that function.
5. Fix the code, then call compact_replace_function with the complete updated function.
   - newCode must be the ENTIRE function body — not a partial diff, not a snippet.
   - NEVER use placeholders like "// ... existing code ..."
   - If multiple functions need changing, call compact_replace_function once per function.
6. After all replacements succeed, write a short confirmation message. Tell the user the file is unsaved so they can review the diff and Ctrl+S to save or Ctrl+Z to undo.

IMPORTANT RULES:
- Do NOT ask the user to paste code. Use your tools.
- Do NOT guess at code you cannot see. Call compact_read_exact_function first.
- Do NOT output Markdown code blocks for edits — call compact_replace_function instead.
- compact_replace_function is mathematically safe: it only touches the exact bytes of the target function. It cannot break surrounding JSX or unrelated code.
`;

export function activate(context: vscode.ExtensionContext): void {
  const compressor = new ReactASTCompressor();

  // ─── Status Bar Item ─────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'compact.copyCompressed';
  statusBar.tooltip = 'Compact: Click to copy compressed code to clipboard';

  function updateStatusBar(document?: vscode.TextDocument) {
    const doc = document ?? vscode.window.activeTextEditor?.document;
    if (!doc || !/\.[jt]sx?$/.test(doc.fileName)) {
      statusBar.hide();
      return;
    }
    try {
      const { savingsPercent, originalTokens, compressedTokens } = compressor.compress(doc.getText());
      statusBar.text = `$(symbol-structure) ${savingsPercent}% saved (${compressedTokens}/${originalTokens} tk)`;
      statusBar.show();
    } catch {
      statusBar.text = '$(symbol-structure) Compact';
      statusBar.show();
    }
  }

  context.subscriptions.push(
    statusBar,
    vscode.window.onDidChangeActiveTextEditor((e) => updateStatusBar(e?.document)),
    vscode.workspace.onDidSaveTextDocument(updateStatusBar),
  );
  updateStatusBar();

  // ─── LM Tool Registration ────────────────────────────────────
  // These tools are exposed to native Copilot as context middleware.
  // Native Copilot handles all file editing — we only provide compressed context.
  const initialCache = new CompressedFileCache();
  const searchToolInstance = new SearchWorkspaceTool();
  const readAndCompressTool = new ReadAndCompressTool(initialCache);
  const readExactFunctionTool = new ReadExactFunctionTool();
  const replaceFunctionTool = new ReplaceFunctionTool();

  context.subscriptions.push(
    vscode.lm.registerTool('compact_search_workspace', searchToolInstance),
    vscode.lm.registerTool('compact_read_and_compress', readAndCompressTool),
    vscode.lm.registerTool('compact_read_exact_function', readExactFunctionTool),
    vscode.lm.registerTool('compact_replace_function', replaceFunctionTool),
  );

  // ─── Diagnostic command ──────────────────────────────────────
  const diagCmd = vscode.commands.registerCommand('compact.diagnostics', () => {
    const registered = vscode.lm.tools.map((t) => t.name).join(', ');
    vscode.window.showInformationMessage(`Compact tools registered: ${registered || '(none)'}`);
  });
  context.subscriptions.push(diagCmd);

  // ─── Chat Participant: @compact (read-only context provider) ──
  const participant = vscode.chat.createChatParticipant(
    'compact-for-copilot.compact',
    chatHandler,
  );
  participant.iconPath = new vscode.ThemeIcon('symbol-structure');

  async function chatHandler(
    request: vscode.ChatRequest,
    _chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    readAndCompressTool.resetCache(new CompressedFileCache());
    const model = request.model;

    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
      vscode.LanguageModelChatMessage.User(request.prompt),
    ];

    const tools: vscode.LanguageModelChatTool[] = [
      {
        name: 'compact_search_workspace',
        description: 'Search the workspace for React/TypeScript files matching a keyword.',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'Filename keyword or fragment (e.g. "Button", "useAuth").' },
          },
          required: ['keyword'],
        },
      },
      {
        name: 'compact_read_and_compress',
        description: 'Read and compress a React/TS file into a token-efficient AST skeleton.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Workspace-relative path to the file.' },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'compact_read_exact_function',
        description: 'Extract the raw uncompressed source of a specific named function or component. Always call this before replacing any function.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Workspace-relative path to the file.' },
            functionName: { type: 'string', description: 'Exact name of the function or component.' },
          },
          required: ['filePath', 'functionName'],
        },
      },
      {
        name: 'compact_replace_function',
        description: 'AST-aware surgical replacement. Babel finds the exact byte range of functionName in the file and splices newCode in. Only the target function is touched — zero collateral damage to surrounding code or JSX. The file is left unsaved for review.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Workspace-relative path to the file to edit.' },
            functionName: { type: 'string', description: 'Exact name of the function or component to replace.' },
            newCode: { type: 'string', description: 'The complete, final replacement source for the entire function. Must not use placeholders.' },
          },
          required: ['filePath', 'functionName', 'newCode'],
        },
      },
    ];

    let toolCallCount = 0;
    while (!token.isCancellationRequested) {
      const response = await model.sendRequest(messages, { tools }, token);
      const toolCalls: vscode.LanguageModelToolCallPart[] = [];
      let textAccumulator = '';

      for await (const part of response.stream) {
        if (part instanceof vscode.LanguageModelTextPart) {
          textAccumulator += part.value;
          stream.markdown(part.value);
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          toolCalls.push(part);
        }
      }

      if (toolCalls.length === 0) break;

      toolCallCount += toolCalls.length;
      if (toolCallCount > TOOL_CALL_LIMIT) {
        stream.markdown('\n\n---\n⚠️ Tool-call limit reached.');
        break;
      }

      messages.push(
        vscode.LanguageModelChatMessage.Assistant(
          textAccumulator
            ? [new vscode.LanguageModelTextPart(textAccumulator), ...toolCalls]
            : toolCalls,
        ),
      );

      for (const toolCall of toolCalls) {
        const label =
          toolCall.name === 'compact_search_workspace'
            ? `Searching for "${(toolCall.input as SearchWorkspaceArgs).keyword}"`
            : toolCall.name === 'compact_read_exact_function'
            ? `Extracting raw source of "${(toolCall.input as ReadExactFunctionArgs).functionName}"`
            : toolCall.name === 'compact_replace_function'
            ? `Replacing "${(toolCall.input as ReplaceFunctionArgs).functionName}" in ${(toolCall.input as ReplaceFunctionArgs).filePath}`
            : `Compressing ${(toolCall.input as ReadAndCompressArgs).filePath}`;
        stream.progress(label);

        let toolResult: vscode.LanguageModelToolResult;
        try {
          const invOpts = { toolInvocationToken: request.toolInvocationToken };
          if (toolCall.name === 'compact_search_workspace') {
            toolResult = await searchToolInstance.invoke(
              { ...invOpts, input: toolCall.input as SearchWorkspaceArgs }, token);
          } else if (toolCall.name === 'compact_read_and_compress') {
            toolResult = await readAndCompressTool.invoke(
              { ...invOpts, input: toolCall.input as ReadAndCompressArgs }, token);
          } else if (toolCall.name === 'compact_read_exact_function') {
            toolResult = await readExactFunctionTool.invoke(
              { ...invOpts, input: toolCall.input as ReadExactFunctionArgs }, token);
          } else if (toolCall.name === 'compact_replace_function') {
            toolResult = await replaceFunctionTool.invoke(
              { ...invOpts, input: toolCall.input as ReplaceFunctionArgs }, token);
          } else {
            toolResult = new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(`[error] Unknown tool: ${toolCall.name}`),
            ]);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toolResult = new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`[tool error] ${msg}`),
          ]);
        }

        messages.push(
          vscode.LanguageModelChatMessage.User([
            new vscode.LanguageModelToolResultPart(toolCall.callId, toolResult.content),
          ]),
        );
      }
    }
  }

  context.subscriptions.push(participant);

  // ─── Command: Compress Active File ────────────────────────────
  const compressCmd = vscode.commands.registerCommand(
    'compact.compressFile',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Open a React file first.');
        return;
      }

      const code = editor.document.getText();
      let result;
      try {
        result = compressor.compress(code);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Parse error: ${message}`);
        return;
      }

      const doc = await vscode.workspace.openTextDocument({
        content: result.compressed,
        language: editor.document.languageId,
      });
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);

      vscode.window.showInformationMessage(
        `Compressed: ${result.originalTokens} → ${result.compressedTokens} tokens (${result.savingsPercent}% saved)`,
      );
    },
  );

  // ─── Command: Compress Selection ──────────────────────────────
  const compressSelCmd = vscode.commands.registerCommand(
    'compact.compressSelection',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Select some React code first.');
        return;
      }

      const code = editor.document.getText(editor.selection);
      let result;
      try {
        result = compressor.compress(code);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Parse error: ${message}`);
        return;
      }

      const doc = await vscode.workspace.openTextDocument({
        content: result.compressed,
        language: editor.document.languageId,
      });
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);

      vscode.window.showInformationMessage(
        `Compressed: ${result.originalTokens} → ${result.compressedTokens} tokens (${result.savingsPercent}% saved)`,
      );
    },
  );

  // ─── Command: Copy Compressed File to Clipboard ─────────────
  const copyCompressedCmd = vscode.commands.registerCommand(
    'compact.copyCompressed',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Open a React file first.');
        return;
      }

      const code = editor.document.getText();
      let result;
      try {
        result = compressor.compress(code);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Parse error: ${message}`);
        return;
      }

      await vscode.env.clipboard.writeText(result.compressed);

      vscode.window.showInformationMessage(
        `Copied to clipboard — ${result.originalTokens} → ${result.compressedTokens} tokens (${result.savingsPercent}% saved). Paste into your AI chat.`,
      );
    },
  );

  context.subscriptions.push(compressCmd, compressSelCmd, copyCompressedCmd);
}

export function deactivate(): void {}
