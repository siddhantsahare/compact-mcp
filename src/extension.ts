import * as vscode from 'vscode';
import { ReactASTCompressor } from './compressor.js';
import { SearchWorkspaceTool, ReadAndCompressTool, ReadExactFunctionTool, ApplyEditTool } from './tools.js';
import { CompressedFileCache } from './types.js';
import type { SearchWorkspaceArgs, ReadAndCompressArgs, ReadExactFunctionArgs, ApplyEditArgs } from './types.js';

const TOOL_CALL_LIMIT = 5;

const SYSTEM_PROMPT = `You are @compact, an expert React architectural assistant embedded in VS Code.
You have four tools available:
- compact_search_workspace: search the workspace for files by keyword.
- compact_read_and_compress: read a file, compress it for minimal token usage, and return its structural skeleton.
- compact_read_exact_function: extract the complete, raw, uncompressed source of a specific named function or component from a file.
- compact_apply_edit: silently apply a search-and-replace edit directly to the user's file in the IDE.

The compressed output safely removes UI boilerplate and inlines trivial JSX while preserving all core logic, state, hooks, and component structure — so you get full architectural understanding at a fraction of the token cost.

YOUR DIRECTIVES:

1. Act as a conversational coding assistant. Use the compressed AST context to answer the user's questions about the codebase architecture, data flow, and logic.
2. DO NOT rewrite an entire file unless the user explicitly asks you to rewrite or regenerate it.
3. If a specific element seems missing from the compressed view, say so and ask the user to clarify — never guess at code you cannot see.
4. Do NOT ask the user to paste code — use your tools to find and read it yourself.

OUTPUT MODES — You have two ways to write code:

📝 READ / MARKDOWN MODE (default):
If the user asks for an explanation, a snippet, or a standard change, output surgical Markdown code blocks with 2-3 lines of unchanged context above and below the change so the IDE can locate the exact replacement position. NEVER use placeholders like "// ... existing code ...", "/* ... other JSX ... */", or "// ... rest of function". VS Code's native "Apply in Editor" button will handle the diff. Use fenced code blocks with the correct language tag (tsx, ts, jsx, js) and start the block with a comment showing the file path. Output ONLY the changed function/component — not the whole file.

🤖 AUTONOMOUS AGENT MODE (silent editor):
If the user explicitly asks you to "edit the file directly", "act autonomously", "apply the fix", "make the change", or similar action-oriented instructions, DO NOT output Markdown code blocks. Instead, silently call the compact_apply_edit tool with the precise searchString (the exact existing code) and replaceString (the new code). The file will be left unsaved so the user can review and Ctrl+Z to undo. After the tool succeeds, output only a brief conversational confirmation (e.g., "Done — I've updated [function] in [file]. The file is unsaved so you can review the change.").

THE HUNT-AND-PATCH LOOP:
Remember, you are a master of context. Autonomously use compact_read_and_compress to find your way around the codebase, use compact_read_exact_function to zoom in on the specific function or component, and then use your chosen output mode to execute the fix. If asked to modify a specific component or function but it is skeletonized or hidden in your compressed view:
- DO NOT give up. DO NOT output placeholder code.
- Autonomously call compact_read_exact_function with the file path and the exact target function name.
- Once you receive the uncompressed source, write the precise edit.
- Only if the function is still not found after calling the tool should you tell the user it cannot be located.
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
  // Keep instances so we can call .invoke() directly in the chat loop,
  // bypassing invokeTool's manifest-contribution check entirely.
  const initialCache = new CompressedFileCache();
  const searchToolInstance = new SearchWorkspaceTool();
  const readAndCompressTool = new ReadAndCompressTool(initialCache);
  const readExactFunctionTool = new ReadExactFunctionTool();
  const applyEditTool = new ApplyEditTool();

  context.subscriptions.push(
    vscode.lm.registerTool('compact_search_workspace', searchToolInstance),
    vscode.lm.registerTool('compact_read_and_compress', readAndCompressTool),
    vscode.lm.registerTool('compact_read_exact_function', readExactFunctionTool),
    vscode.lm.registerTool('compact_apply_edit', applyEditTool),
  );

  // ─── Chat Participant: @compact ───────────────────────────────
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
    // Fresh cache per chat turn
    readAndCompressTool.resetCache(new CompressedFileCache());

    // ── Select the best available Copilot model ────────────────
    // Try gpt-4o first; fall back to any copilot model so we always get tool-calling support.
    let [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
    if (!model) {
      [model] = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    }
    if (!model) {
      stream.markdown(
        '**@compact**: No Copilot language model is available. Make sure GitHub Copilot Chat is installed and you are signed in.',
      );
      return;
    }

    // ── Build initial messages ─────────────────────────────────
    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
      vscode.LanguageModelChatMessage.User(request.prompt),
    ];

    const tools: vscode.LanguageModelChatTool[] = [
      {
        name: 'compact_search_workspace',
        description: 'Search the workspace for React component and hook files matching a keyword. Returns a list of matching file paths.',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description: 'A filename keyword or glob fragment to search for (e.g. "Button", "useAuth", "Header").',
            },
          },
          required: ['keyword'],
        },
      },
      {
        name: 'compact_read_and_compress',
        description: 'Read a React/TypeScript file from the workspace, intelligently compress it for minimal token usage, and return the optimised source.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Workspace-relative path to the file to read and compress (e.g. "src/components/Button.tsx").',
            },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'compact_read_exact_function',
        description: 'Extract the complete, uncompressed, raw source code of a specific named function or component from a file. Use this when the compressed skeleton is not enough to safely edit a function.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Workspace-relative path to the file (e.g. "src/components/BookingListItem.tsx").',
            },
            functionName: {
              type: 'string',
              description: 'The exact name of the function, component, or variable to extract (e.g. "BookingListItem", "handleSubmit", "RequestSentMessage").',
            },
          },
          required: ['filePath', 'functionName'],
        },
      },
      {
        name: 'compact_apply_edit',
        description: 'Silently applies a search-and-replace edit directly to the user\'s file in the IDE. The file is left unsaved so the user can review and undo. Use this in Autonomous Agent Mode when the user asks you to directly edit, apply a fix, or act autonomously.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Workspace-relative path to the file to edit (e.g. "src/components/Button.tsx").',
            },
            searchString: {
              type: 'string',
              description: 'The exact existing code to be replaced. Must match the file content exactly (whitespace, line breaks, etc.) and appear only once.',
            },
            replaceString: {
              type: 'string',
              description: 'The new code to replace the searchString with.',
            },
          },
          required: ['filePath', 'searchString', 'replaceString'],
        },
      },
    ];

    // ── Agentic tool-calling loop ──────────────────────────────
    let toolCallCount = 0;

    while (!token.isCancellationRequested) {
      const response = await model.sendRequest(messages, { tools }, token);

      // Collect all parts from the stream
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

      // If no tool calls were made, the model is done
      if (toolCalls.length === 0) {
        break;
      }

      // Check the hard tool-call limit
      toolCallCount += toolCalls.length;
      if (toolCallCount > TOOL_CALL_LIMIT) {
        stream.markdown(
          '\n\n---\n⚠️ Tool-call limit reached. Returning what I have so far.',
        );
        break;
      }

      // Add assistant response with tool calls to message history
      messages.push(
        vscode.LanguageModelChatMessage.Assistant(
          textAccumulator
            ? [new vscode.LanguageModelTextPart(textAccumulator), ...toolCalls]
            : toolCalls,
        ),
      );

      // Execute each tool call and feed results back
      for (const toolCall of toolCalls) {
        // Show the user which tool is running
        const friendlyName = toolCall.name === 'compact_search_workspace'
          ? `Searching workspace for "${(toolCall.input as { keyword?: string }).keyword ?? '…'}"`
          : toolCall.name === 'compact_read_exact_function'
          ? `Extracting raw source of "${(toolCall.input as { functionName?: string }).functionName ?? '…'}"`
          : toolCall.name === 'compact_apply_edit'
          ? `Applying edit to "${(toolCall.input as { filePath?: string }).filePath ?? '…'}"`
          : `Reading & compressing "${(toolCall.input as { filePath?: string }).filePath ?? '…'}"`;
        stream.progress(friendlyName);

        let toolResult: vscode.LanguageModelToolResult;
        try {
          // Call our own tool instances directly — avoids invokeTool's hard
          // requirement that the tool be formally contributed in package.json.
          const invOpts = { toolInvocationToken: request.toolInvocationToken };
          if (toolCall.name === 'compact_search_workspace') {
            toolResult = await searchToolInstance.invoke(
              { ...invOpts, input: toolCall.input as SearchWorkspaceArgs },
              token,
            );
          } else if (toolCall.name === 'compact_read_and_compress') {
            toolResult = await readAndCompressTool.invoke(
              { ...invOpts, input: toolCall.input as ReadAndCompressArgs },
              token,
            );
          } else if (toolCall.name === 'compact_read_exact_function') {
            toolResult = await readExactFunctionTool.invoke(
              { ...invOpts, input: toolCall.input as ReadExactFunctionArgs },
              token,
            );
          } else if (toolCall.name === 'compact_apply_edit') {
            toolResult = await applyEditTool.invoke(
              { ...invOpts, input: toolCall.input as ApplyEditArgs },
              token,
            );
          } else {
            toolResult = new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(`[error] Unknown tool: ${toolCall.name}`),
            ]);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stream.markdown(`\n> ⚠️ Tool \`${toolCall.name}\` threw: ${msg}\n`);
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

  context.subscriptions.push(participant, compressCmd, compressSelCmd, copyCompressedCmd);
}

export function deactivate(): void {}
