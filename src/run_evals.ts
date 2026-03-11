#!/usr/bin/env node
/**
 * run_evals.ts — A/B benchmark pipeline for React AST Preprocessor
 *
 * Runs each scenario in benchmarks/scenarios/ through two conditions:
 *   A (Control)   — raw original.tsx sent to LLM as-is
 *   B (Treatment) — original.tsx compressed by ReactASTCompressor first
 *
 * Metrics collected per scenario:
 *   - Token count (control vs treatment)
 *   - Token savings %
 *   - Estimated API cost
 *   - Syntax validity (Babel parse of LLM output)
 *   - LLM-as-Judge score 1–10 (if judge model is available)
 *
 * Usage:
 *   node dist/run_evals.js [options]
 *
 * Options:
 *   --dry-run              Skip LLM calls, only measure token metrics
 *   --scenario=<name>      Run a single scenario by folder name
 *   --model=<model>        Override LLM model (default: claude-sonnet-4-6 or gpt-4o)
 *   --judge-model=<model>  Override judge model (default: same as --model)
 *   --output=<path>        Save JSON results to file (default: benchmarks/results/latest.json)
 *   --no-judge             Skip LLM-as-Judge scoring even when LLM calls are enabled
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY  — enables Claude as the LLM provider
 *   OPENAI_API_KEY     — enables GPT-4o as the LLM provider (used if no Anthropic key)
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ReactASTCompressor } from './compressor.js';
import { estimateTokens, parse } from './parser.js';
import type { PreprocessorOptions } from './types.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

// In CJS output __dirname is provided natively by Node; ROOT is the project root.
const ROOT = resolve(__dirname, '..');
const SCENARIOS_DIR = join(ROOT, 'benchmarks', 'scenarios');
const RESULTS_DIR = join(ROOT, 'benchmarks', 'results');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const flagValue = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const DRY_RUN = flag('dry-run');
const SCENARIO_FILTER = flagValue('scenario');
const NO_JUDGE = flag('no-judge') || DRY_RUN;
const OUTPUT_PATH = flagValue('output') ?? join(RESULTS_DIR, 'latest.json');

// ---------------------------------------------------------------------------
// LLM provider detection
// ---------------------------------------------------------------------------

type Provider = 'anthropic' | 'openai' | 'none';

function detectProvider(): Provider {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'none';
}

const PROVIDER: Provider = DRY_RUN ? 'none' : detectProvider();

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  none: 'n/a',
};

const MODEL = flagValue('model') ?? DEFAULT_MODELS[PROVIDER];
const JUDGE_MODEL = flagValue('judge-model') ?? MODEL;

// Cost per million tokens (input / output) in USD
const COST_TABLE: Record<string, [number, number]> = {
  'claude-sonnet-4-6': [3, 15],
  'claude-3-5-sonnet-20241022': [3, 15],
  'claude-3-5-haiku-20241022': [0.8, 4],
  'claude-3-7-sonnet-20250219': [3, 15],
  'gpt-4o': [5, 15],
  'gpt-4o-mini': [0.15, 0.6],
};

function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
  const [inRate, outRate] = COST_TABLE[model] ?? [3, 15];
  return (inputTokens * inRate + outputTokens * outRate) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConditionResult {
  tokens: number;
  outputTokens?: number;
  output?: string;
  syntaxValid?: boolean;
  /** Pass/Fail from LLM-as-Judge; undefined = not yet judged */
  judgePass?: boolean;
  judgeReason?: string;
  costUsd: number;
  timeMs: number;
}

export interface TreatmentResult extends ConditionResult {
  compressedTokens: number;
  tokenSavingsPct: number;
}

export interface EvalResult {
  scenario: string;
  control: ConditionResult;
  treatment: TreatmentResult;
  /** 'parity'  — both pass
   *  'control-only' — control passes, treatment fails (regression)
   *  'treatment-only' — treatment passes, control fails
   *  'both-fail' — neither passes
   *  'n/a' — judge was not run */
  judgeVerdict?: 'parity' | 'control-only' | 'treatment-only' | 'both-fail' | 'n/a';
}

// ---------------------------------------------------------------------------
// LLM calls (native fetch, no SDK dependency)
// ---------------------------------------------------------------------------

interface LLMResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

const SYSTEM_PROMPT = `You are a senior React and TypeScript engineer. 
When given a React component and an instruction, output ONLY the modified TypeScript/TSX code.
Do not add any explanation, markdown fences, or commentary — just the raw code.`;

async function callLLM(userMessage: string): Promise<LLMResponse> {
  if (PROVIDER === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };
    return {
      text: data.content.find((b) => b.type === 'text')?.text ?? '',
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    };
  }

  if (PROVIDER === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      text: data.choices[0]?.message.content ?? '',
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
    };
  }

  throw new Error('No LLM provider configured');
}

// ---------------------------------------------------------------------------
// LLM-as-Judge  (Pass / Fail against expected.tsx)
// ---------------------------------------------------------------------------

interface JudgeResult {
  conditionA_pass: boolean;
  conditionB_pass: boolean;
  reasoning: string;
}

const JUDGE_SYSTEM =
  `You are an expert Senior Staff Engineer evaluating an AI coding assistant.
` +
  `You will be given a prompt, the expected solution, and two generated outputs (Condition A and Condition B).
` +
  `
` +
  `Your Task:
` +
  `1. Evaluate if Condition A successfully completes the prompt's objective (Pass/Fail).
` +
  `2. Evaluate if Condition B successfully completes the prompt's objective (Pass/Fail).
` +
  `
` +
  `Do not penalize Condition B if it is missing UI styling (like Tailwind classes) IF the prompt did not
` +
  `explicitly ask for styling changes. We only care about functional and structural equivalence.
` +
  `
` +
  `CRITICAL OUTPUT RULE: Your ENTIRE response must be a single raw JSON object.
` +
  `Do NOT write any prose, markdown, code fences, or explanations outside the JSON.
` +
  `The response must start with { and end with }.
` +
  `Required format: { "conditionA_pass": boolean, "conditionB_pass": boolean, "reasoning": "string" }`;

async function judgeOutputs(
  taskPrompt: string,
  expected: string,
  controlOutput: string,
  treatmentOutput: string
): Promise<JudgeResult> {
  const userMessage =
    `## Task Prompt
${taskPrompt}

` +
    `## Expected Solution
\`\`\`tsx
${expected}
\`\`\`

` +
    `## Condition A (Control — LLM received uncompressed source)
\`\`\`tsx
${controlOutput}
\`\`\`

` +
    `## Condition B (Treatment — LLM received AST-compressed source)
\`\`\`tsx
${treatmentOutput}
\`\`\`

` +
    `Respond with ONLY the JSON object. No other text.`;

  const judgeRes = await callJudgeLLM(userMessage);
  try {
    // Isolate the JSON object — handles markdown fences and conversational filler
    const startIdx = judgeRes.indexOf('{');
    const endIdx = judgeRes.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error('No JSON object found in judge response');
    const cleanJson = judgeRes.substring(startIdx, endIdx + 1);
    return JSON.parse(cleanJson) as JudgeResult;
  } catch {
    console.error('  [judge] Raw response was:', judgeRes.substring(0, 200));
    return {
      conditionA_pass: false,
      conditionB_pass: false,
      reasoning: 'Failed to parse judge response',
    };
  }
}

async function callJudgeLLM(userMessage: string): Promise<string> {
  if (PROVIDER === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        max_tokens: 512,
        system: JUDGE_SYSTEM,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic judge error ${res.status}`);
    const data = (await res.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content.find((b) => b.type === 'text')?.text ?? '{}';
  }

  if (PROVIDER === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        max_tokens: 512,
        messages: [
          { role: 'system', content: JUDGE_SYSTEM },
          { role: 'user', content: userMessage },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI judge error ${res.status}`);
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message.content ?? '{}';
  }

  return '{}';
}

// ---------------------------------------------------------------------------
// Syntax validation (using the project's own Babel parser)
// ---------------------------------------------------------------------------

function validateSyntax(code: string): boolean {
  try {
    parse(code);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Core eval runner
// ---------------------------------------------------------------------------

async function runScenario(scenarioDir: string): Promise<EvalResult> {
  const name = scenarioDir.split(/[\\/]/).pop()!;
  const original = readFileSync(join(scenarioDir, 'original.tsx'), 'utf-8');
  const prompt = readFileSync(join(scenarioDir, 'prompt.txt'), 'utf-8').trim();

  // Load optional per-scenario processor options (e.g. preserveStyles: true)
  const configPath = join(scenarioDir, 'config.json');
  const processorOptions: PreprocessorOptions = existsSync(configPath)
    ? (JSON.parse(readFileSync(configPath, 'utf-8')) as PreprocessorOptions)
    : {};
  const compressor = new ReactASTCompressor({}, processorOptions);

  // ── Condition A: Control ──────────────────────────────────────────────────
  const controlTokens = estimateTokens(original);
  let controlResult: ConditionResult = {
    tokens: controlTokens,
    costUsd: 0,
    timeMs: 0,
  };

  if (PROVIDER !== 'none') {
    const controlMsg = `${prompt}\n\n\`\`\`tsx\n${original}\n\`\`\``;
    const t0 = Date.now();
    let llmOut: LLMResponse;
    try {
      llmOut = await callLLM(controlMsg);
    } catch (err) {
      console.error(`  [control] LLM error:`, (err as Error).message);
      llmOut = { text: '', inputTokens: controlTokens, outputTokens: 0 };
    }
    controlResult = {
      tokens: llmOut.inputTokens,
      outputTokens: llmOut.outputTokens,
      output: llmOut.text,
      syntaxValid: llmOut.text ? validateSyntax(llmOut.text) : undefined,
      costUsd: estimateCost(llmOut.inputTokens, llmOut.outputTokens, MODEL),
      timeMs: Date.now() - t0,
    };
  }

  // ── Condition B: Treatment ────────────────────────────────────────────────
  const { compressed, compressedTokens, savingsPercent } = compressor.compress(original);
  let treatmentResult: TreatmentResult = {
    tokens: controlTokens,
    compressedTokens,
    tokenSavingsPct: savingsPercent,
    costUsd: 0,
    timeMs: 0,
  };

  if (PROVIDER !== 'none') {
    const treatmentMsg = `${prompt}\n\n\`\`\`tsx\n${compressed}\n\`\`\``;
    const t1 = Date.now();
    let llmOut: LLMResponse;
    try {
      llmOut = await callLLM(treatmentMsg);
    } catch (err) {
      console.error(`  [treatment] LLM error:`, (err as Error).message);
      llmOut = { text: '', inputTokens: compressedTokens, outputTokens: 0 };
    }
    treatmentResult = {
      tokens: controlTokens,
      compressedTokens: llmOut.inputTokens,
      tokenSavingsPct: savingsPercent,
      outputTokens: llmOut.outputTokens,
      output: llmOut.text,
      syntaxValid: llmOut.text ? validateSyntax(llmOut.text) : undefined,
      costUsd: estimateCost(llmOut.inputTokens, llmOut.outputTokens, MODEL),
      timeMs: Date.now() - t1,
    };
  } else {
    // Dry run: still measure compression metrics
    treatmentResult = {
      tokens: controlTokens,
      compressedTokens,
      tokenSavingsPct: savingsPercent,
      costUsd: 0,
      timeMs: 0,
    };
  }

  // ── LLM-as-Judge ─────────────────────────────────────────────────────────
  let judgeVerdict: EvalResult['judgeVerdict'] = 'n/a';
  const expectedPath = join(scenarioDir, 'expected.tsx');
  const expected = existsSync(expectedPath) ? readFileSync(expectedPath, 'utf-8') : '';

  if (!NO_JUDGE && controlResult.output && treatmentResult.output) {
    try {
      const judge = await judgeOutputs(
        prompt,
        expected,
        controlResult.output,
        treatmentResult.output
      );
      controlResult.judgePass = judge.conditionA_pass;
      controlResult.judgeReason = judge.reasoning;
      treatmentResult.judgePass = judge.conditionB_pass;
      treatmentResult.judgeReason = judge.reasoning;

      if (judge.conditionA_pass && judge.conditionB_pass) judgeVerdict = 'parity';
      else if (judge.conditionA_pass) judgeVerdict = 'control-only';
      else if (judge.conditionB_pass) judgeVerdict = 'treatment-only';
      else judgeVerdict = 'both-fail';
    } catch (err) {
      console.error(`  [judge] error:`, (err as Error).message);
    }
  }

  return { scenario: name, control: controlResult, treatment: treatmentResult, judgeVerdict };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

const COL = {
  scenario: 30,
  tokens: 12,
  compressed: 16,
  savings: 10,
  syntax: 8,
  judge: 8,
  cost: 10,
  time: 8,
};

function pad(s: string | number, n: number, right = false): string {
  const str = String(s);
  return right ? str.padStart(n) : str.padEnd(n);
}

function printHeader() {
  console.log(
    '\n' +
      pad('Scenario', COL.scenario) +
      pad('Control', COL.tokens) +
      pad('Compressed', COL.compressed) +
      pad('Savings', COL.savings) +
      pad('Syntax✓', COL.syntax) +
      pad('Judge', COL.judge) +
      pad('Cost(B)', COL.cost) +
      pad('Time(B)', COL.time)
  );
  console.log('─'.repeat(
    COL.scenario + COL.tokens + COL.compressed + COL.savings +
    COL.syntax + COL.judge + COL.cost + COL.time
  ));
}

const VERDICT_ICON: Record<NonNullable<EvalResult['judgeVerdict']>, string> = {
  parity: '✓✓',
  'control-only': 'A✓ B✗',
  'treatment-only': 'A✗ B✓',
  'both-fail': '✗✗',
  'n/a': ' —',
};

function printRow(r: EvalResult) {
  const syntaxStr =
    r.treatment.syntaxValid === undefined
      ? '  —'
      : r.treatment.syntaxValid
      ? '  ✓'
      : '  ✗';
  const judgeStr = r.judgeVerdict ? VERDICT_ICON[r.judgeVerdict] : ' —';
  const costStr = r.treatment.costUsd > 0 ? `$${r.treatment.costUsd.toFixed(4)}` : '  —';
  const timeStr = r.treatment.timeMs > 0 ? `${r.treatment.timeMs}ms` : '  —';

  console.log(
    pad(r.scenario.substring(0, COL.scenario - 1), COL.scenario) +
      pad(`${r.control.tokens} tk`, COL.tokens) +
      pad(`${r.treatment.compressedTokens} tk`, COL.compressed) +
      pad(`${r.treatment.tokenSavingsPct.toFixed(1)}%`, COL.savings) +
      pad(syntaxStr, COL.syntax) +
      pad(judgeStr, COL.judge) +
      pad(costStr, COL.cost) +
      pad(timeStr, COL.time)
  );
}

function printSummary(results: EvalResult[]) {
  const totalControl = results.reduce((s, r) => s + r.control.tokens, 0);
  const totalCompressed = results.reduce((s, r) => s + r.treatment.compressedTokens, 0);
  const avgSavings = results.reduce((s, r) => s + r.treatment.tokenSavingsPct, 0) / results.length;
  const totalCostControl = results.reduce((s, r) => s + r.control.costUsd, 0);
  const totalCostTreatment = results.reduce((s, r) => s + r.treatment.costUsd, 0);
  const syntaxPasses = results.filter((r) => r.treatment.syntaxValid === true).length;
  const syntaxTested = results.filter((r) => r.treatment.syntaxValid !== undefined).length;

  console.log('\n' + '═'.repeat(104));
  console.log('SUMMARY');
  console.log('─'.repeat(104));
  console.log(`  Scenarios run      : ${results.length}`);
  console.log(`  Total tokens (A)   : ${totalControl.toLocaleString()}`);
  console.log(`  Total tokens (B)   : ${totalCompressed.toLocaleString()}`);
  console.log(`  Avg token savings  : ${avgSavings.toFixed(1)}%`);
  if (syntaxTested > 0) {
    console.log(`  Syntax validity    : ${syntaxPasses}/${syntaxTested} treatment outputs parsed cleanly`);
  }
  if (totalCostControl > 0) {
    console.log(`  API cost (A)       : $${totalCostControl.toFixed(4)}`);
    console.log(`  API cost (B)       : $${totalCostTreatment.toFixed(4)}`);
    console.log(`  Cost saved         : $${(totalCostControl - totalCostTreatment).toFixed(4)}`);
  }

  const judgedResults = results.filter((r) => r.judgeVerdict && r.judgeVerdict !== 'n/a');
  if (judgedResults.length > 0) {
    const controlPass = judgedResults.filter(
      (r) => r.judgeVerdict === 'parity' || r.judgeVerdict === 'control-only'
    ).length;
    const treatmentPass = judgedResults.filter(
      (r) => r.judgeVerdict === 'parity' || r.judgeVerdict === 'treatment-only'
    ).length;
    const parity = judgedResults.filter((r) => r.judgeVerdict === 'parity').length;
    const regressions = judgedResults.filter((r) => r.judgeVerdict === 'control-only').length;
    const n = judgedResults.length;
    console.log(`  Judge (${n} scenarios)`);
    console.log(`    Control  pass rate : ${controlPass}/${n} (${Math.round(controlPass/n*100)}%)`);
    console.log(`    Treatment pass rate: ${treatmentPass}/${n} (${Math.round(treatmentPass/n*100)}%)`);
    console.log(`    Full parity        : ${parity}/${n}`);
    if (regressions > 0) {
      console.log(`    ⚠ Regressions (A✓ B✗): ${regressions}`);
      for (const r of judgedResults.filter((x) => x.judgeVerdict === 'control-only')) {
        console.log(`      - ${r.scenario}: ${r.treatment.judgeReason ?? ''}`);
      }
    }
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(SCENARIOS_DIR)) {
    console.error(`Scenarios directory not found: ${SCENARIOS_DIR}`);
    process.exit(1);
  }

  const allScenarios = readdirSync(SCENARIOS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(SCENARIOS_DIR, d.name))
    .filter((d) => existsSync(join(d, 'original.tsx')) && existsSync(join(d, 'prompt.txt')))
    .sort();

  const scenarios = SCENARIO_FILTER
    ? allScenarios.filter((s) => s.includes(SCENARIO_FILTER))
    : allScenarios;

  if (scenarios.length === 0) {
    console.error(`No matching scenarios found${SCENARIO_FILTER ? ` for filter "${SCENARIO_FILTER}"` : ''}.`);
    process.exit(1);
  }

  console.log(`\nReact AST Preprocessor — Eval Pipeline`);
  console.log(`Provider : ${PROVIDER === 'none' ? 'none (dry-run)' : `${PROVIDER} / ${MODEL}`}`);
  console.log(`Scenarios: ${scenarios.length}`);
  if (DRY_RUN) console.log(`Mode     : DRY RUN (token metrics only, no LLM calls)`);

  printHeader();

  const results: EvalResult[] = [];

  for (const scenarioDir of scenarios) {
    const name = scenarioDir.split(/[\\/]/).pop()!;
    process.stdout.write(`${pad(name.substring(0, COL.scenario - 1), COL.scenario)}… `);
    try {
      const result = await runScenario(scenarioDir);
      results.push(result);
      // Overwrite the line with full data
      process.stdout.write('\r');
      printRow(result);
    } catch (err) {
      process.stdout.write('\r');
      console.log(`${pad(name, COL.scenario)}ERROR: ${(err as Error).message}`);
    }
  }

  printSummary(results);

  // Save JSON results
  mkdirSync(RESULTS_DIR, { recursive: true });
  const output = {
    timestamp: new Date().toISOString(),
    provider: PROVIDER,
    model: MODEL,
    dryRun: DRY_RUN,
    results,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Results saved to: ${OUTPUT_PATH}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
