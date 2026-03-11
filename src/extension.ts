import * as vscode from 'vscode';
import { ReactASTCompressor } from './compressor.js';

export function activate(context: vscode.ExtensionContext): void {
  const compressor = new ReactASTCompressor();

  // ─── Status Bar Item ─────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'react-preprocessor.copyCompressed';
  statusBar.tooltip = 'React Preprocessor: Click to copy compressed code to clipboard';

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
      statusBar.text = '$(symbol-structure) ReactPreprocessor';
      statusBar.show();
    }
  }

  context.subscriptions.push(
    statusBar,
    vscode.window.onDidChangeActiveTextEditor((e) => updateStatusBar(e?.document)),
    vscode.workspace.onDidSaveTextDocument(updateStatusBar),
  );
  updateStatusBar();

  // ─── Chat Participant: @processor ─────────────────────────────
  const participant = vscode.chat.createChatParticipant(
    'react-preprocessor',
    chatHandler,
  );
  participant.iconPath = new vscode.ThemeIcon('symbol-structure');

  async function chatHandler(
    request: vscode.ChatRequest,
    _chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      stream.markdown('Open a React file first so I can compress it.');
      return;
    }

    const code = editor.document.getText();
    const fileName = editor.document.fileName;

    let result;
    try {
      result = compressor.compress(code);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stream.markdown(
        `Failed to parse **${fileName}**: ${message}\n\nMake sure the file is valid JSX / TSX.`,
      );
      return;
    }

    stream.markdown(
      `**AST Compression** for \`${vscode.workspace.asRelativePath(fileName)}\`\n\n` +
      `| Metric | Value |\n|---|---|\n` +
      `| Original tokens | ${result.originalTokens} |\n` +
      `| Compressed tokens | ${result.compressedTokens} |\n` +
      `| Savings | **${result.savingsPercent}%** |\n\n---\n\n`,
    );

    const [model] = await vscode.lm.selectChatModels();
    if (!model) {
      stream.markdown(
        'No language model available. Install GitHub Copilot or another LM extension.',
      );
      return;
    }

    const messages = [
      vscode.LanguageModelChatMessage.User(
        `[SYSTEM CONTEXT — compressed React source]\n\n${result.compressed}`,
      ),
      vscode.LanguageModelChatMessage.User(request.prompt),
    ];

    const response = await model.sendRequest(messages, {}, token);
    for await (const chunk of response.text) {
      stream.markdown(chunk);
    }
  }

  // ─── Command: Compress Active File ────────────────────────────
  const compressCmd = vscode.commands.registerCommand(
    'react-preprocessor.compressFile',
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
    'react-preprocessor.compressSelection',
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
    'react-preprocessor.copyCompressed',
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
  // statusBar, onDidChangeActiveTextEditor, onDidSaveTextDocument already pushed above
}

export function deactivate(): void {}
