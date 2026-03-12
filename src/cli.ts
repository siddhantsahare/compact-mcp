#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ReactASTCompressor } from './compressor.js';
import type { RuleName } from './types.js';

const RULE_NAMES: RuleName[] = [
  'stripComments',
  'stripConsoleLogs',
  'summarizeHooks',
  'summarizeHandlers',
  'stripPropTypes',
  'collapseStyles',
  'stripTypeAnnotations',
  'stripTestAttributes',
];

interface ParsedArgs {
  files: string[];
  output: boolean;
  disable: RuleName[];
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { files: [], output: false, disable: [], help: false };
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--output' || arg === '-o') {
      result.output = true;
    } else if (arg === '--disable' || arg === '-d') {
      i++;
      const rule = argv[i];
      if (rule && RULE_NAMES.includes(rule as RuleName)) {
        result.disable.push(rule as RuleName);
      } else {
        console.error(`Unknown rule: ${rule}`);
        console.error(`Valid rules: ${RULE_NAMES.join(', ')}`);
        process.exit(1);
      }
    } else if (!arg.startsWith('-')) {
      result.files.push(arg);
    } else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    }
    i++;
  }

  return result;
}

function printHelp(): void {
  console.log(`
compact — Smart context optimizer for React

USAGE
  compact <file...> [options]

OPTIONS
  -o, --output          Print compressed code to stdout (default: stats only)
  -d, --disable <rule>  Disable a specific rule (can be repeated)
  -h, --help            Show this help message

RULES
  ${RULE_NAMES.join('\n  ')}

EXAMPLES
  compact src/App.tsx
  compact src/**/*.tsx --output
  compact src/App.tsx -d stripComments -d collapseStyles
`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.files.length === 0) {
    printHelp();
    process.exit(0);
  }

  const options: Partial<Record<RuleName, boolean>> = {};
  for (const rule of args.disable) {
    options[rule] = false;
  }

  const compressor = new ReactASTCompressor(options);

  let totalOriginal = 0;
  let totalCompressed = 0;

  for (const filePath of args.files) {
    const absPath = resolve(filePath);
    let code: string;
    try {
      code = readFileSync(absPath, 'utf-8');
    } catch {
      console.error(`Could not read: ${filePath}`);
      continue;
    }

    try {
      const result = compressor.compress(code);
      totalOriginal += result.originalTokens;
      totalCompressed += result.compressedTokens;

      if (args.output) {
        console.log(result.compressed);
      } else {
        console.log(
          `${filePath}: ${result.originalTokens} → ${result.compressedTokens} tokens (${result.savingsPercent}% saved)`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to compress ${filePath}: ${message}`);
    }
  }

  if (!args.output && args.files.length > 1) {
    const totalSavings =
      totalOriginal > 0
        ? Math.round(((totalOriginal - totalCompressed) / totalOriginal) * 100)
        : 0;
    console.log(
      `\nTotal: ${totalOriginal} → ${totalCompressed} tokens (${totalSavings}% saved)`,
    );
  }
}

main();
