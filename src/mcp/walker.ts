import { readFileSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { glob } from 'glob';

/** File extensions the MCP tools process. */
const JS_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js', '.mjs']);

/** Directories to always skip. */
const EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.git',
  'out',
  '.turbo',
  '.cache',
];

/** Hard cap on files processed by compact_map. */
export const MAX_FILES = 200;

export interface WalkedFile {
  /** Absolute path to the file. */
  absPath: string;
  /** Path relative to rootDir. */
  relPath: string;
  /** Raw source content. */
  source: string;
}

export interface WalkResult {
  files: WalkedFile[];
  /** Total number of JS/TS files found (may exceed files.length if capped). */
  totalFound: number;
  /** Files that failed to read. */
  readErrors: string[];
}

/**
 * Walk a directory tree and return all JS/TS source files.
 * Caps at MAX_FILES to keep compact_map responsive on large repos.
 */
export async function walkProject(rootDir: string, limit = MAX_FILES): Promise<WalkResult> {
  const absRoot = resolve(rootDir);

  const ignorePatterns = EXCLUDED_DIRS.map((d) => `**/${d}/**`);

  const allPaths = await glob('**/*.{ts,tsx,js,jsx,mjs}', {
    cwd: absRoot,
    ignore: ignorePatterns,
    absolute: true,
    nodir: true,
  });

  // Filter to JS_EXTENSIONS only (glob already does this, belt-and-suspenders)
  const jsPaths = allPaths.filter((p) => JS_EXTENSIONS.has(extname(p)));

  const totalFound = jsPaths.length;
  const cappedPaths = jsPaths.slice(0, limit);

  const files: WalkedFile[] = [];
  const readErrors: string[] = [];

  for (const absPath of cappedPaths) {
    try {
      const source = readFileSync(absPath, 'utf-8');
      files.push({
        absPath,
        relPath: relative(absRoot, absPath),
        source,
      });
    } catch {
      readErrors.push(absPath);
    }
  }

  return { files, totalFound, readErrors };
}

/** Returns true if the file extension is a supported JS/TS type. */
export function isJsFile(filePath: string): boolean {
  return JS_EXTENSIONS.has(extname(filePath));
}
