import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';

const MARKER_START = '<!-- compact-mcp:start -->';
const MARKER_END = '<!-- compact-mcp:end -->';

const CLAUDE_MD_BLOCK = `${MARKER_START}
## When to use compact_map
- At the START of any task involving multiple React/TS files
- When asked to "understand", "explain", or "explore" the codebase
- When you don't know which file to edit yet
- DO NOT call compact_map if the user already told you the exact file to edit
- DO NOT call compact_map twice in the same session — reuse what's in context

## When NOT to use compact tools
- For the file you are about to EDIT — always use native Read for the edit target
- For non-JS/TS files (YAML, JSON, Prisma, Python, SQL, Markdown, CSS)

## Edit safety rule
NEVER generate edits based on compact_map or compact_deps output.
ALWAYS call compact_expand first, then use native Read/Edit for the actual change.
${MARKER_END}`;

// ── Path helpers ──────────────────────────────────────────────────────────

function winToWsl(winPath: string): string {
  const result = spawnSync('wsl.exe', ['wslpath', '-u', winPath], { encoding: 'utf-8' });
  if (result.status === 0) return result.stdout.trim();
  return winPath.replace(/^([A-Za-z]):\\/, (_, d: string) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, '/');
}

function wslToWin(wslPath: string): string {
  const result = spawnSync('wsl.exe', ['wslpath', '-w', wslPath], { encoding: 'utf-8' });
  if (result.status === 0) return result.stdout.trim();
  return wslPath.replace(/^\/mnt\/([a-z])\//, (_, d: string) => `${d.toUpperCase()}:\\`).replace(/\//g, '\\');
}

// ── Resolve absolute node + script paths ──────────────────────────────────

interface McpPaths {
  nodeCommand: string;
  scriptArg: string;
}

interface AllPaths {
  /** Native platform paths — for Cursor, VS Code, Windsurf, Continue, Claude Desktop */
  native: McpPaths;
  /** Claude Code paths — on Windows, node command is WSL-ified since Claude Code runs in WSL */
  claudeCode: McpPaths;
}

function resolveAllPaths(): AllPaths {
  const isWindowsNode = process.platform === 'win32';
  const scriptPath = join(__dirname, 'mcp', 'index.js');

  if (isWindowsNode) {
    return {
      native: {
        nodeCommand: process.execPath,       // C:\Program Files\nodejs\node.exe
        scriptArg: scriptPath,               // C:\Users\...\dist\mcp\index.js
      },
      claudeCode: {
        nodeCommand: winToWsl(process.execPath), // /mnt/c/Program Files/nodejs/node.exe
        scriptArg: scriptPath,                   // C:\...\dist\mcp\index.js (Windows node reads Windows paths)
      },
    };
  }

  // Mac / Linux / WSL-with-Linux-node: same paths for all clients
  const paths: McpPaths = { nodeCommand: process.execPath, scriptArg: scriptPath };
  return { native: paths, claudeCode: paths };
}

// ── JSON config helpers ───────────────────────────────────────────────────

function readJson(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeJson(filePath: string, data: Record<string, unknown>): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function mcpEntry(paths: McpPaths): Record<string, string | string[]> {
  return {
    command: paths.nodeCommand,
    args: [paths.scriptArg],
  };
}

/**
 * Upsert compact MCP entry into a JSON config that uses { mcpServers: { ... } }.
 * Returns true if the file was created or modified, false if already up to date.
 */
function upsertMcpJson(filePath: string, paths: McpPaths): boolean {
  const config = readJson(filePath);
  const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
  const entry = mcpEntry(paths);

  // Check if already identical
  const existing = servers.compact as Record<string, unknown> | undefined;
  if (
    existing &&
    existing.command === entry.command &&
    JSON.stringify(existing.args) === JSON.stringify(entry.args)
  ) {
    return false;
  }

  servers.compact = entry;
  config.mcpServers = servers;
  writeJson(filePath, config);
  return true;
}

// ── Client detection & registration ───────────────────────────────────────

interface ClientResult {
  name: string;
  status: 'configured' | 'already configured' | 'skipped' | 'failed';
  detail?: string;
}

function home(): string {
  return homedir();
}

function isWsl(): boolean {
  if (process.platform !== 'linux') return false;
  try {
    return readFileSync('/proc/version', 'utf-8').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

// Get the Windows home directory from WSL
function winHome(): string | null {
  if (!isWsl()) return null;
  const result = spawnSync('wslpath', ['-u', spawnSync('cmd.exe', ['/C', 'echo', '%USERPROFILE%'], {
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
  }).stdout.trim()], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  // Fallback: check common mount
  const username = process.env.USER || '';
  const guess = `/mnt/c/Users/${username}`;
  if (existsSync(guess)) return guess;
  return null;
}

// ── Individual client configurators ───────────────────────────────────────

function isAlreadyExists(result: ReturnType<typeof spawnSync>): boolean {
  return result.status !== 0 && (result.stderr?.toString() ?? '').includes('already exists');
}

function setupClaudeCode(allPaths: AllPaths): ClientResult {
  const name = 'Claude Code';
  const { nodeCommand, scriptArg } = allPaths.claudeCode;

  // Try direct claude CLI
  const direct = spawnSync('claude', ['mcp', 'add', 'compact', '-s', 'user', '--', nodeCommand, scriptArg], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (direct.status === 0) return { name, status: 'configured' };
  if (isAlreadyExists(direct)) return { name, status: 'already configured' };

  // On Windows node, try via wsl.exe with login shell (loads ~/.local/bin etc.)
  // Use single quotes — double quotes get consumed by bash -lc and break on spaces in paths
  if (process.platform === 'win32') {
    const cmd = `claude mcp add compact -s user -- '${nodeCommand}' '${scriptArg}'`;
    const viaWsl = spawnSync(
      'wsl.exe',
      ['bash', '-lc', cmd],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (viaWsl.status === 0) return { name, status: 'configured' };
    if (isAlreadyExists(viaWsl)) return { name, status: 'already configured' };
  }

  return {
    name,
    status: 'skipped',
    detail: 'claude CLI not found. Install Claude Code first, or run:\n' +
      `      claude mcp add compact -s user -- "${nodeCommand}" "${scriptArg}"`,
  };
}

function setupCursor(paths: McpPaths): ClientResult {
  const name = 'Cursor';
  // Global config: ~/.cursor/mcp.json
  const candidates: string[] = [];

  // On WSL, Cursor runs on the Windows side
  const wh = winHome();
  if (wh) {
    candidates.push(join(wh, '.cursor', 'mcp.json'));
  }
  // Native
  candidates.push(join(home(), '.cursor', 'mcp.json'));

  // Check if Cursor is installed by looking for its config directory
  const configPath = candidates.find((p) => existsSync(dirname(p)));
  if (!configPath) {
    return { name, status: 'skipped', detail: 'Cursor config directory not found (~/.cursor/)' };
  }

  const changed = upsertMcpJson(configPath, paths);
  return { name, status: changed ? 'configured' : 'already configured', detail: configPath };
}

function setupWindsurf(paths: McpPaths): ClientResult {
  const name = 'Windsurf';
  const candidates: string[] = [];

  const wh = winHome();
  if (wh) {
    candidates.push(join(wh, '.codeium', 'windsurf', 'mcp_config.json'));
  }
  candidates.push(join(home(), '.codeium', 'windsurf', 'mcp_config.json'));

  const configPath = candidates.find((p) => existsSync(dirname(p)));
  if (!configPath) {
    return { name, status: 'skipped', detail: 'Windsurf config directory not found (~/.codeium/windsurf/)' };
  }

  const changed = upsertMcpJson(configPath, paths);
  return { name, status: changed ? 'configured' : 'already configured', detail: configPath };
}

function setupContinue(paths: McpPaths): ClientResult {
  const name = 'Continue';
  const candidates: string[] = [];

  const wh = winHome();
  if (wh) {
    candidates.push(join(wh, '.continue', 'config.json'));
  }
  candidates.push(join(home(), '.continue', 'config.json'));

  const configPath = candidates.find((p) => existsSync(dirname(p)));
  if (!configPath) {
    return { name, status: 'skipped', detail: 'Continue config directory not found (~/.continue/)' };
  }

  const changed = upsertMcpJson(configPath, paths);
  return { name, status: changed ? 'configured' : 'already configured', detail: configPath };
}

function setupClaudeDesktop(paths: McpPaths): ClientResult {
  const name = 'Claude Desktop';
  const candidates: string[] = [];
  const p = platform();

  if (p === 'darwin') {
    candidates.push(join(home(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  }

  // On Windows (or WSL pointing at Windows side)
  const wh = winHome();
  if (wh) {
    candidates.push(join(wh, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'));
  }
  if (p === 'win32' && process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json'));
  }

  const configPath = candidates.find((c) => existsSync(dirname(c)));
  if (!configPath) {
    return { name, status: 'skipped', detail: 'Claude Desktop config directory not found' };
  }

  const changed = upsertMcpJson(configPath, paths);
  return { name, status: changed ? 'configured' : 'already configured', detail: configPath };
}

function setupVSCode(paths: McpPaths): ClientResult {
  const name = 'VS Code';
  // User-level mcp.json lives inside the VS Code user-data directory, NOT ~/.vscode/
  //   Mac:     ~/Library/Application Support/Code/User/mcp.json
  //   Linux:   ~/.config/Code/User/mcp.json
  //   Windows: %APPDATA%/Code/User/mcp.json
  const candidates: string[] = [];
  const p = platform();

  if (p === 'darwin') {
    candidates.push(join(home(), 'Library', 'Application Support', 'Code', 'User', 'mcp.json'));
  }
  if (p === 'linux') {
    candidates.push(join(home(), '.config', 'Code', 'User', 'mcp.json'));
  }
  const wh = winHome();
  if (wh) {
    candidates.push(join(wh, 'AppData', 'Roaming', 'Code', 'User', 'mcp.json'));
  }
  if (p === 'win32' && process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, 'Code', 'User', 'mcp.json'));
  }

  // Check if VS Code's User directory exists (means VS Code is installed)
  const configPath = candidates.find((c) => existsSync(dirname(c)));
  if (!configPath) {
    return { name, status: 'skipped', detail: 'VS Code user data directory not found' };
  }

  // VS Code uses { servers: { ... } } not { mcpServers: { ... } }
  const config = readJson(configPath);
  const servers = (config.servers ?? {}) as Record<string, unknown>;
  const entry = mcpEntry(paths);

  const existing = servers.compact as Record<string, unknown> | undefined;
  if (
    existing &&
    existing.command === entry.command &&
    JSON.stringify(existing.args) === JSON.stringify(entry.args)
  ) {
    return { name, status: 'already configured', detail: configPath };
  }

  servers.compact = entry;
  config.servers = servers;
  writeJson(configPath, config);
  return { name, status: 'configured', detail: configPath };
}

// ── CLAUDE.md update ──────────────────────────────────────────────────────

function updateClaudeMd(claudeMdPath: string, create: boolean): 'created' | 'updated' | 'skipped' | 'unchanged' {
  const exists = existsSync(claudeMdPath);
  if (!exists && !create) return 'skipped';

  const content = exists ? readFileSync(claudeMdPath, 'utf-8') : '';

  if (content.includes(MARKER_START)) {
    const updated = content.replace(
      new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}`),
      CLAUDE_MD_BLOCK,
    );
    if (updated === content) return 'unchanged';
    writeFileSync(claudeMdPath, updated, 'utf-8');
    return 'updated';
  }

  const newContent = content ? `${content.trimEnd()}\n\n${CLAUDE_MD_BLOCK}\n` : `${CLAUDE_MD_BLOCK}\n`;
  writeFileSync(claudeMdPath, newContent, 'utf-8');
  return exists ? 'updated' : 'created';
}

// ── Main ──────────────────────────────────────────────────────────────────

export function runSetup(argv: string[] = []): void {
  const claudeMdFlag = argv.includes('--claude-md');
  const allPaths = resolveAllPaths();

  console.log('compact-mcp setup\n');
  console.log(`  node:   ${allPaths.native.nodeCommand}`);
  console.log(`  script: ${allPaths.native.scriptArg}\n`);

  // Step 1: Register with all detected clients
  const clients: ClientResult[] = [
    setupClaudeCode(allPaths),
    setupCursor(allPaths.native),
    setupWindsurf(allPaths.native),
    setupContinue(allPaths.native),
    setupClaudeDesktop(allPaths.native),
    setupVSCode(allPaths.native),
  ];

  let anyConfigured = false;
  for (const client of clients) {
    const icon = client.status === 'configured' ? '\u2705'
      : client.status === 'already configured' ? '\u2714\uFE0F '
        : client.status === 'skipped' ? '\u23ED\uFE0F '
          : '\u274C';

    const statusText = client.status === 'configured' ? 'configured'
      : client.status === 'already configured' ? 'already up to date'
        : client.status === 'skipped' ? 'not installed'
          : 'failed';

    console.log(`  ${icon} ${client.name}: ${statusText}`);
    if (client.detail && client.status !== 'skipped') {
      console.log(`     ${client.detail}`);
    }

    if (client.status === 'configured' || client.status === 'already configured') {
      anyConfigured = true;
    }
  }

  if (!anyConfigured) {
    console.log('\n  No supported clients detected. Add manually to your client\'s MCP config:');
    console.log(`  {
    "mcpServers": {
      "compact": {
        "command": "${allPaths.native.nodeCommand}",
        "args": ["${allPaths.native.scriptArg}"]
      }
    }
  }`);
  }

  // Step 2: update CLAUDE.md
  const claudeMdPath = join(process.cwd(), 'CLAUDE.md');
  process.stdout.write('\n  Updating CLAUDE.md... ');
  const claudeResult = updateClaudeMd(claudeMdPath, claudeMdFlag);
  switch (claudeResult) {
    case 'created':   console.log('created'); break;
    case 'updated':   console.log('updated'); break;
    case 'unchanged': console.log('already up to date'); break;
    case 'skipped':
      console.log('skipped (no CLAUDE.md found — pass --claude-md to create one)');
      break;
  }

  console.log('\nRestart your AI assistant to load the server.');
}
