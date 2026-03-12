import * as vscode from 'vscode';
import { ReactASTCompressor } from './compressor.js';
import { SearchWorkspaceTool, ReadAndCompressTool } from './tools.js';
import { CompressedFileCache } from './types.js';
import type { SearchWorkspaceArgs, ReadAndCompressArgs } from './types.js';

const TOOL_CALL_LIMIT = 5;

const SYSTEM_PROMPT = `You are @compact, an expert React architect embedded in VS Code.
You have two tools:
- compact_search_workspace: search the workspace for files by keyword.
- compact_read_and_compress: read a file, compress it for minimal token usage, and return its skeleton.

Workflow:
1. Search for the relevant file(s) using compact_search_workspace.
2. Read and compress each file using compact_read_and_compress.
3. Analyse the compressed source to understand the structure.
4. Respond with a complete, working solution.

CRITICAL OUTPUT RULES — you MUST follow these exactly:
- Wrap EVERY modified or new file in a fenced markdown code block.
- Use the correct language identifier (tsx, ts, jsx, js).
- The very first line inside the code block MUST be a comment with the file path.
- Do NOT truncate or omit any part of the file — output the full content.
- Do NOT ask the user to paste code — use your tools to find and read it yourself.

Example of required output format:
\`\`\`tsx
// src/hooks/useChatFirebase.ts
import { useState } from 'react';
// ... full file content
\`\`\`
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

  context.subscriptions.push(
    vscode.lm.registerTool('compact_search_workspace', searchToolInstance),
    vscode.lm.registerTool('compact_read_and_compress', readAndCompressTool),
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
